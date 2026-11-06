// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// SnipeHelper: one small contract that swaps HYPE <-> a token directly against a Uniswap v2 pair, a v3 pool or a
/// v4 pool, with no router. The bot uses it three ways:
///   - roundTrip(route) via eth_call: buys with msg.value, then sells everything back, and always REVERTS with
///     (tokens got, HYPE back, HYPE quoted). Nothing is ever kept, so anyone may call it. A honeypot fails here.
///   - quoteSell(route, amount) via eth_call: the pool's price for selling `amount` (no tokens needed), reverts Quote.
///   - buy / sell (owner only): the real trades. Bought tokens stay in this contract; sells pay HYPE to the owner.
/// Route.kind: 2 = Uniswap-v2-style pair, 3 = v3-style pool, 4 = v4 pool (Route.pool is the PoolManager).
/// Route.quote: WHYPE, or address(0) for a v4 pool paired with native HYPE.

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IV2Pair {
    function token0() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function swap(uint256, uint256, address, bytes calldata) external;
}

interface IV3Pool {
    function token0() external view returns (address);
    function swap(address, bool, int256, uint160, bytes calldata) external returns (int256, int256);
}

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata) external returns (bytes memory);
    function swap(PoolKey memory, SwapParams memory, bytes calldata) external returns (int256);
    function sync(address) external;
    function settle() external payable returns (uint256);
    function take(address, address, uint256) external;
}

struct Route {
    uint8 kind;
    address pool;
    address token;
    address quote;
    uint16 v2FeeBps;
    PoolKey key;
}

contract SnipeHelper {
    error RoundTrip(uint256 got, uint256 back, uint256 quoted);
    error Quote(uint256 out);
    error Slippage(uint256 out, uint256 minOut);
    error NotOwner();
    error BadCaller();
    error BadKind();
    error PayFailed();

    uint160 internal constant MIN_SQRT = 4295128740; // TickMath.MIN_SQRT_PRICE + 1
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970341; // MAX - 1

    address public owner;
    address private active; // the pool / PoolManager we expect a callback from, only during our own swap
    bool private quoting;

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {}

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setOwner(address o) external onlyOwner {
        owner = o;
    }

    // ---------------------------------------------------------------- trades (owner)

    function buy(Route calldata r, uint256 minOut) external payable onlyOwner returns (uint256 got) {
        got = _swap(r, true, msg.value);
        if (got < minOut) revert Slippage(got, minOut);
    }

    /// amount = type(uint256).max sells the whole balance. HYPE goes to the owner.
    function sell(Route calldata r, uint256 amount, uint256 minOut) external onlyOwner returns (uint256 out) {
        if (amount == type(uint256).max) amount = IERC20(r.token).balanceOf(address(this));
        out = _swap(r, false, amount);
        if (out < minOut) revert Slippage(out, minOut);
        _sendNative(owner, out);
    }

    function sweep(address token, address to) external onlyOwner {
        _pay(token, to, IERC20(token).balanceOf(address(this)));
    }

    function withdraw(address to) external onlyOwner {
        _sendNative(to, address(this).balance);
    }

    // ---------------------------------------------------------------- simulations (always revert)

    function roundTrip(Route calldata r) external payable {
        uint256 got = _swap(r, true, msg.value);
        uint256 quoted;
        try this.quoteSell(r, got) {} catch (bytes memory e) {
            quoted = _quoteOf(e);
        }
        uint256 back = _swap(r, false, got);
        revert RoundTrip(got, back, quoted);
    }

    /// Paper trading: our buy never landed on chain, and a fresh launch pool may hold no HYPE except buyers' own, so
    /// a plain quote undervalues a paper bag. This buys msg.value first (putting "our" HYPE in), then quotes `amount`.
    function quoteAfterBuy(Route calldata r, uint256 amount) external payable {
        _swap(r, true, msg.value);
        try this.quoteSell(r, amount) {} catch (bytes memory e) {
            revert Quote(_quoteOf(e));
        }
        revert Quote(0);
    }

    function quoteSell(Route calldata r, uint256 amount) external {
        if (r.kind == 2) revert Quote(_v2Out(r, r.token, amount));
        if (r.kind == 3) _v3(r, r.token, amount, true);
        else if (r.kind == 4) _v4(r, false, amount, true);
        else revert BadKind();
        revert Quote(0);
    }

    // ---------------------------------------------------------------- core

    function _swap(Route calldata r, bool isBuy, uint256 amountIn) internal returns (uint256 out) {
        if (isBuy) {
            uint256 before = IERC20(r.token).balanceOf(address(this));
            if (r.quote != address(0)) IWETH(r.quote).deposit{value: amountIn}();
            if (r.kind == 2) _v2(r, r.quote, amountIn);
            else if (r.kind == 3) _v3(r, r.quote, amountIn, false);
            else if (r.kind == 4) _v4(r, true, amountIn, false);
            else revert BadKind();
            out = IERC20(r.token).balanceOf(address(this)) - before;
        } else {
            uint256 before = address(this).balance;
            if (r.kind == 2) _v2(r, r.token, amountIn);
            else if (r.kind == 3) _v3(r, r.token, amountIn, false);
            else if (r.kind == 4) _v4(r, false, amountIn, false);
            else revert BadKind();
            if (r.quote != address(0)) {
                uint256 w = IERC20(r.quote).balanceOf(address(this));
                if (w > 0) IWETH(r.quote).withdraw(w);
            }
            out = address(this).balance - before;
        }
    }

    // v2: pay the pair first, price the amount it really received (handles transfer taxes), then swap.
    function _v2(Route calldata r, address tokenIn, uint256 amountIn) internal {
        IV2Pair p = IV2Pair(r.pool);
        (uint112 r0, uint112 r1,) = p.getReserves();
        bool zeroIn = p.token0() == tokenIn;
        (uint256 rin, uint256 rout) = zeroIn ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        _pay(tokenIn, r.pool, amountIn);
        uint256 ain = IERC20(tokenIn).balanceOf(r.pool) - rin;
        uint256 aout = _amountOut(ain, rin, rout, r.v2FeeBps);
        (uint256 a0, uint256 a1) = zeroIn ? (uint256(0), aout) : (aout, uint256(0));
        p.swap(a0, a1, address(this), "");
    }

    function _v2Out(Route calldata r, address tokenIn, uint256 amountIn) internal view returns (uint256) {
        IV2Pair p = IV2Pair(r.pool);
        (uint112 r0, uint112 r1,) = p.getReserves();
        bool zeroIn = p.token0() == tokenIn;
        return zeroIn ? _amountOut(amountIn, r0, r1, r.v2FeeBps) : _amountOut(amountIn, r1, r0, r.v2FeeBps);
    }

    function _amountOut(uint256 ain, uint256 rin, uint256 rout, uint16 feeBps) internal pure returns (uint256) {
        uint256 f = ain * (10000 - feeBps);
        return f * rout / (rin * 10000 + f);
    }

    function _v3(Route calldata r, address tokenIn, uint256 amountIn, bool q) internal {
        bool zf1 = IV3Pool(r.pool).token0() == tokenIn;
        active = r.pool;
        quoting = q;
        IV3Pool(r.pool).swap(address(this), zf1, int256(amountIn), zf1 ? MIN_SQRT : MAX_SQRT, abi.encode(tokenIn));
        active = address(0);
        quoting = false;
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata data) external {
        _v3cb(a0, a1, data);
    }

    function pancakeV3SwapCallback(int256 a0, int256 a1, bytes calldata data) external {
        _v3cb(a0, a1, data);
    }

    function algebraSwapCallback(int256 a0, int256 a1, bytes calldata data) external {
        _v3cb(a0, a1, data);
    }

    function _v3cb(int256 a0, int256 a1, bytes calldata data) internal {
        if (active == address(0) || msg.sender != active) revert BadCaller();
        if (quoting) revert Quote(uint256(-(a0 < 0 ? a0 : a1)));
        _pay(abi.decode(data, (address)), msg.sender, uint256(a0 > 0 ? a0 : a1));
    }

    function _v4(Route calldata r, bool isBuy, uint256 amountIn, bool q) internal {
        active = r.pool;
        quoting = q;
        IPoolManager(r.pool).unlock(abi.encode(r.key, r.token, isBuy, amountIn));
        active = address(0);
        quoting = false;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (active == address(0) || msg.sender != active) revert BadCaller();
        (PoolKey memory k, address token, bool isBuy, uint256 amountIn) =
            abi.decode(data, (PoolKey, address, bool, uint256));
        // buying = paying the quote currency in; selling = paying the token in
        bool zf1 = isBuy ? k.currency0 != token : k.currency0 == token;
        int256 d = IPoolManager(msg.sender).swap(
            k, SwapParams(zf1, -int256(amountIn), zf1 ? MIN_SQRT : MAX_SQRT), ""
        );
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        if (quoting) revert Quote(uint256(int256(zf1 ? d1 : d0)));
        _settle(msg.sender, k.currency0, d0);
        _settle(msg.sender, k.currency1, d1);
        return "";
    }

    function _settle(address pm, address cur, int128 delta) internal {
        if (delta < 0) {
            uint256 a = uint256(-int256(delta));
            if (cur == address(0)) {
                IPoolManager(pm).settle{value: a}();
            } else {
                IPoolManager(pm).sync(cur);
                _pay(cur, pm, a);
                IPoolManager(pm).settle();
            }
        } else if (delta > 0) {
            IPoolManager(pm).take(cur, address(this), uint256(int256(delta)));
        }
    }

    // ---------------------------------------------------------------- utils

    function _quoteOf(bytes memory e) internal pure returns (uint256 out) {
        if (e.length != 36 || bytes4(e) != Quote.selector) return 0;
        assembly {
            out := mload(add(e, 36))
        }
    }

    function _pay(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert PayFailed();
    }

    function _sendNative(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayFailed();
    }
}
