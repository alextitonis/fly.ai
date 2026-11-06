// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "../src/SnipeHelper.sol";

interface Vm {
    function deal(address, uint256) external;
    function createSelectFork(string calldata) external returns (uint256);
}

/// Fork test against the live Elysium testnet: `forge test --fork-url https://testnet-rpc.elysium.kinetiq.xyz -vv`
contract SnipeHelperTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant WHYPE = 0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234;
    SnipeHelper h;

    event log_named_uint(string key, uint256 val);

    function setUp() public {
        h = new SnipeHelper();
        vm.deal(address(this), 100 ether);
    }

    receive() external payable {}

    function _v4Deb() internal pure returns (Route memory r) {
        r.kind = 4;
        r.pool = 0x0088BEA218c283a939C93d7dB8353Cd87CDCF647;
        r.token = 0xE0f924527794f9C4133f68BfB28A76Bc0AbC6E53;
        r.quote = address(0);
        r.key = PoolKey(address(0), r.token, 0, 1, 0xd492b95e2ECf74DB6c5493E7C32F6816248484cC);
    }

    function _v2() internal pure returns (Route memory r) {
        r.kind = 2;
        r.pool = 0x29057DCCcEFC5FD750A8155ca2F64B49C0571c22;
        r.token = 0x3173a1Cea0Be28bBdACFf6e8B0599A64b04dBE43;
        r.quote = WHYPE;
        r.v2FeeBps = 30;
    }

    function _v3() internal pure returns (Route memory r) {
        r.kind = 3;
        r.pool = 0x2C9acb4BCa12E99a63b00b0AA8d09EaB9dd61fd4;
        r.token = 0x4b08c6577A46C7485467E13247254c9A03A147CF;
        r.quote = WHYPE;
    }

    function _trip(Route memory r, uint256 amt) internal returns (bool ok, uint256 got, uint256 back, uint256 quoted) {
        (bool s, bytes memory e) = address(h).call{value: amt}(abi.encodeCall(SnipeHelper.roundTrip, (r)));
        require(!s, "roundTrip must revert");
        if (e.length == 100 && bytes4(e) == SnipeHelper.RoundTrip.selector) {
            assembly {
                got := mload(add(e, 36))
                back := mload(add(e, 68))
                quoted := mload(add(e, 100))
            }
            ok = true;
        }
    }

    function _check(Route memory r, uint256 amt) internal {
        (bool ok, uint256 got, uint256 back, uint256 quoted) = _trip(r, amt);
        emit log_named_uint("roundtrip ok", ok ? 1 : 0);
        if (!ok) return;
        emit log_named_uint("got", got);
        emit log_named_uint("back", back);
        emit log_named_uint("quoted", quoted);
        require(back > 0 && back <= amt, "back");
        // real buy + sell as owner
        uint256 bal0 = address(this).balance;
        uint256 bought = h.buy{value: amt}(r, got * 99 / 100);
        require(bought > 0, "bought");
        uint256 out = h.sell(r, type(uint256).max, 0);
        emit log_named_uint("real out", out);
        require(address(this).balance == bal0 - amt + out, "owner paid");
    }

    function test_v4_native() public { _check(_v4Deb(), 0.001 ether); }
    function test_v2() public { _check(_v2(), 0.001 ether); }
    function test_v3() public { _check(_v3(), 0.001 ether); }

    function test_onlyOwner() public {
        SnipeHelper other = new SnipeHelper();
        other.setOwner(address(1));
        (bool s,) = address(other).call{value: 1}(abi.encodeCall(SnipeHelper.buy, (_v4Deb(), 0)));
        require(!s, "non-owner buy must fail");
    }
}
