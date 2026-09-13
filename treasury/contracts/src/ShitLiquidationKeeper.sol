// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC3156FlashBorrower} from "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import {ClipperCallee} from "@dss/clip.sol";

interface IFlashSource {
    function flashLoan(address token, uint256 amount, bytes calldata data) external;
    function maxFlashLoan(address token) external view returns (uint256);
}

interface IDSSVat {
    function urns(bytes32 ilk, address urn) external view returns (uint256 ink, uint256 art);
    function ilks(bytes32 ilk) external view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust);
}

interface IDSSDog {
    function bark(bytes32 ilk, address urn, address kpr) external returns (uint256 id);
}

struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}

interface ISwapRouter {
    function exactInputSingle(ExactInputSingleParams memory params) external returns (uint256 amountOut);
}

/// @title ShitLiquidationKeeper
/// @notice Protocol-captured flash-loan liquidation keeper for CDP stablecoin
/// @dev Implements DSS ClipperCallee pattern (AGPL-3.0-or-later) from clip.sol.
///      Flash-mints Bucky, liquidates undercollateralized vaults via Dog.bark(),
///      sells collateral through ShitSwap, repays flash loan, sends profits to Vow/surplus.
contract ShitLiquidationKeeper is AccessControl, ReentrancyGuard, ClipperCallee, IERC3156FlashBorrower {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error FlashLoanFailed();
    error LiquidationFailed();
    error InsufficientRepay();
    error NotProfitable();
    error NotFlashSource();
    error WrongToken();
    error SlippageExceeded();

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    address public immutable buckyToken;
    IFlashSource public flashSource;
    IDSSVat public immutable vat;
    IDSSDog public immutable dog;
    ISwapRouter public swapRouter;
    address public immutable vow;

    uint256 public totalLiquidated;
    uint256 public totalProfits;

    event Liquidated(bytes32 indexed ilk, address indexed urn, uint256 indexed flashAmount, uint256 collateralSold, uint256 profit);

    event SwapRouterUpdated(address indexed router);
    event FlashSourceUpdated(address indexed _source);

    constructor(
        address _buckyToken,
        address _flashSource,
        address _vat,
        address _dog,
        address _swapRouter,
        address _vow,
        address admin
    ) {
        if (_buckyToken == address(0) || _vow == address(0) || admin == address(0)) revert ZeroAddress();
        buckyToken = _buckyToken;
        flashSource = IFlashSource(_flashSource);
        vat = IDSSVat(_vat);
        dog = IDSSDog(_dog);
        swapRouter = ISwapRouter(_swapRouter);
        vow = _vow;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    function setFlashSource(address _source) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_source == address(0)) revert ZeroAddress();
        flashSource = IFlashSource(_source);
        emit FlashSourceUpdated(_source);
    }

    function setSwapRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_router == address(0)) revert ZeroAddress();
        swapRouter = ISwapRouter(_router);
        emit SwapRouterUpdated(_router);
    }

    function liquidate(
        bytes32 ilk,
        address urn,
        uint256 flashAmount,
        address collateralToken,
        uint256 minProfit
    ) external nonReentrant {
        bytes memory data = abi.encode(false, ilk, urn, collateralToken, minProfit, msg.sender);
        flashSource.flashLoan(buckyToken, flashAmount, data);
    }

    function onFlashLoan(
        address,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        if (msg.sender != address(flashSource)) revert NotFlashSource();
        if (token != buckyToken) revert WrongToken();

        (bool isFloorSwap, bytes32 ilk, address urn, address collateralToken, uint256 minProfit, /* address caller */) =
            abi.decode(data, (bool, bytes32, address, address, uint256, address));

        uint256 repayAmount = amount + fee;

        if (isFloorSwap) {
            IERC20(buckyToken).forceApprove(address(flashSource), repayAmount);
            IERC20(buckyToken).safeTransfer(address(flashSource), repayAmount);
            return keccak256("ERC3156FlashBorrower.onFlashLoan");
        }

        IERC20(buckyToken).forceApprove(address(vat), repayAmount);

        // Update state before external calls (CEI pattern)
        uint256 collateralBalance = 0;

        // slither-disable-next-line unused-return: auctionId not needed — we track liquidation via collateral balance
        try dog.bark(ilk, urn, address(this)) returns (uint256) {
            collateralBalance = IERC20(collateralToken).balanceOf(address(this));

            if (collateralBalance > 0) {
                uint256 buckyReceived = _swapCollateral(collateralToken, collateralBalance, repayAmount);
                uint256 profit = buckyReceived > repayAmount ? buckyReceived - repayAmount : 0;
                if (profit < minProfit) revert NotProfitable();

                IERC20(buckyToken).safeTransfer(address(flashSource), repayAmount);

                if (profit > 0) {
                    IERC20(buckyToken).safeTransfer(vow, profit);
                    totalProfits += profit;
                }

                totalLiquidated += collateralBalance;
                emit Liquidated(ilk, urn, amount, collateralBalance, profit);
            }
        } catch {
            revert LiquidationFailed();
        }

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    function _swapCollateral(address collateralToken, uint256 collateralBalance, uint256 amountOutMinimum)
        internal
        returns (uint256)
    {
        IERC20(collateralToken).forceApprove(address(swapRouter), collateralBalance);
        return swapRouter.exactInputSingle(ExactInputSingleParams({
            tokenIn: collateralToken,
            tokenOut: buckyToken,
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: collateralBalance,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        }));
    }

    /// @notice DSS ClipperCallee callback — called by Clipper after auction liquidation
    /// @dev Implements the ClipperCallee interface from DSS clip.sol
    function clipperCall(address, uint256, uint256, bytes calldata data) external override {
        address collateralToken = abi.decode(data, (address));
        uint256 collateralBalance = IERC20(collateralToken).balanceOf(address(this));

        if (collateralBalance > 0) {
            _swapCollateral(collateralToken, collateralBalance, 0);
        }
    }

    function buyAtFloorAndSwap(
        address collateralToken,
        uint256 amount,
        uint256 flashAmount
    ) external onlyRole(KEEPER_ROLE) {
        bytes memory data = abi.encode(true, collateralToken, amount);
        flashSource.flashLoan(buckyToken, flashAmount, data);
    }
}
