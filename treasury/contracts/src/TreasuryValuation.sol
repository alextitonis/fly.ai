// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {MultisigGuard} from "./MultisigGuard.sol";
import {ITreasuryPolicy} from "./ITreasuryPolicy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IPriceFeed} from "./IPriceFeed.sol";
import {IValuationCalculator} from "./IValuationCalculator.sol";
import {TRSRYv1} from "@shit-v3/modules/TRSRY/TRSRY.v1.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";

/// @title TreasuryValuation
/// @notice Multi-source RFV/NAV oracle for protocol treasury
/// @dev Reads reserve balances from SHIT ProtocolTreasury (SHIT Protocol V3 TRSRY module) and prices
///      them via registered price feeds. Supports LP positions, Morpho/Yearn vaults (ERC4626),
///      raw ERC20 balances, and manual entries. Each asset has a haircut for RFV.
///      Multisig can also set valuations manually as an override.
///      Implements ITreasuryPolicy for ShitStaking.rebase() gating.
///      Minters must call canMint() before minting to enforce RFV invariant.
contract TreasuryValuation is MultisigGuard, ITreasuryPolicy {
    error RfvInvariantFailed(uint256 requiredRfv, uint256 actualRfv);
    error AssetAlreadyRegistered();
    error AssetNotFound();

    enum AssetType {
        MANUAL,     // Multisig sets value directly
        ERC20,      // balanceOf(this) priced via priceFeed
        ERC4626,    // vault shares → convertToAssets, priced via priceFeed on underlying
        LP_TOKEN    // balanceOf(this) priced via priceFeed (treats LP token as having a price)
    }

    struct Asset {
        AssetType assetType;
        address token;       // The token/vault/LP contract
        address priceFeed;   // IPriceFeed that returns price in 1e18 for the underlying
        uint256 haircutBps;  // RFV haircut (e.g. 8000 = 80% of NAV for RFV)
        uint256 manualValue; // For MANUAL type: value in 1e18 terms
        bool active;
    }

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice SHIT ProtocolTreasury address — source of reserve balances (includes debt)
    /// @dev When set, computeValuations reads TRSRYv1.getReserveBalance(token) instead of balanceOf(this)
    TRSRYv1 public reserveTreasury;

    /// @notice Swappable valuation calculator — multisig can upgrade to improve pricing logic
    /// @dev When set, computeValuations() delegates to this contract. When zero, uses built-in logic.
    address public valuationCalculator;

    address[] public assetList;
    mapping(address => Asset) public assets;
    uint256 public assetCount;

    uint256 public rfv;
    uint256 public nav;
    uint256 public floorPrice;
    uint256 public shitSupply;
    bool public rfvBypass;
    bool public manualOverride; // When true, use setValuations values instead of computed

    event AssetRegistered(address indexed token, AssetType assetType, address priceFeed, uint256 haircutBps);
    event AssetRemoved(address indexed token);
    event AssetUpdated(address indexed token, uint256 haircutBps, address priceFeed);
    event ValuationsUpdated(uint256 indexed rfv, uint256 indexed nav, uint256 indexed floorPrice);
    event RfvBypassToggled(bool indexed bypass);
    event ManualOverrideToggled(bool indexed override_);
    event ReserveTreasurySet(address indexed treasury);
    event ValuationCalculatorSet(address indexed calculator);

    constructor(address _multisig) MultisigGuard(_multisig) {
        if (_multisig == address(0)) revert ZeroAddress();
    }

    // ============ Treasury Source ============

    /// @notice Set the SHIT ProtocolTreasury address to read reserve balances from
    /// @dev SHIT ProtocolTreasury.getReserveBalance(token) returns balance + totalDebt, giving
    ///      a complete picture of protocol reserves including debt claims.
    function setReserveTreasury(address _treasury) external onlyMultisig {
        if (_treasury == address(0)) revert ZeroAddress();
        reserveTreasury = TRSRYv1(_treasury);
        emit ReserveTreasurySet(_treasury);
    }

    /// @notice Set a swappable valuation calculator for upgraded pricing logic
    /// @dev Pass address(0) to revert to built-in computation. The calculator receives
    ///      the asset list and encoded asset data, and returns (nav, rfv).
    function setValuationCalculator(address _calculator) external onlyMultisig {
        valuationCalculator = _calculator;
        emit ValuationCalculatorSet(_calculator);
    }

    // ============ Asset Registry ============

    /// @notice Register a treasury asset for on-chain tracking
    /// @param _token Token/vault/LP contract address
    /// @param _assetType Type of asset (MANUAL, ERC20, ERC4626, LP_TOKEN)
    /// @param _priceFeed IPriceFeed that returns price in 1e18 for the underlying asset
    /// @param _haircutBps RFV haircut in bps (e.g. 8000 = 80%)
    function registerAsset(
        address _token,
        AssetType _assetType,
        address _priceFeed,
        uint256 _haircutBps
    ) external onlyMultisig {
        if (_token == address(0)) revert ZeroAddress();
        if (assets[_token].active) revert AssetAlreadyRegistered();

        assets[_token] = Asset({
            assetType: _assetType,
            token: _token,
            priceFeed: _priceFeed,
            haircutBps: _haircutBps,
            manualValue: 0,
            active: true
        });
        assetList.push(_token);
        assetCount++;

        emit AssetRegistered(_token, _assetType, _priceFeed, _haircutBps);
    }

    /// @notice Remove a treasury asset from tracking
    function removeAsset(address _token) external onlyMultisig {
        if (!assets[_token].active) revert AssetNotFound();
        assets[_token].active = false;
        assetCount--;
        emit AssetRemoved(_token);
    }

    /// @notice Update asset haircut or price feed
    function updateAsset(address _token, uint256 _haircutBps, address _priceFeed) external onlyMultisig {
        if (!assets[_token].active) revert AssetNotFound();
        assets[_token].haircutBps = _haircutBps;
        assets[_token].priceFeed = _priceFeed;
        emit AssetUpdated(_token, _haircutBps, _priceFeed);
    }

    /// @notice Set manual value for a MANUAL type asset
    function setManualValue(address _token, uint256 _value) external onlyMultisig {
        if (!assets[_token].active) revert AssetNotFound();
        assets[_token].manualValue = _value;
    }

    // ============ Internal Helpers ============

    /// @dev Get asset balance — reads from SHIT ProtocolTreasury if set, otherwise balanceOf(this)
    function _getAssetBalance(address token) internal view returns (uint256) {
        if (address(reserveTreasury) != address(0)) {
            return reserveTreasury.getReserveBalance(ERC20(token));
        }
        return IERC20(token).balanceOf(address(this));
    }

    // ============ Valuation Computation ============

    /// @notice Compute aggregate RFV and NAV from all registered on-chain assets
    /// @dev If valuationCalculator is set, delegates to it for upgraded logic.
    ///      Otherwise uses built-in computation.
    /// @return computedNav Total NAV (sum of asset values at market price)
    /// @return computedRfv Total RFV (NAV after per-asset haircuts)
    function computeValuations() public view returns (uint256 computedNav, uint256 computedRfv) {
        if (valuationCalculator != address(0)) {
            // Encode asset data as array of (token, Asset) tuples
            uint256 len = assetList.length;
            bytes memory data = abi.encode(len);
            for (uint256 i = 0; i < len; i++) {
                Asset storage a = assets[assetList[i]];
                data = abi.encodePacked(data, abi.encode(assetList[i], a.assetType, a.priceFeed, a.haircutBps, a.manualValue, a.active));
            }
            return IValuationCalculator(valuationCalculator).computeValuations(assetList, data, address(reserveTreasury));
        }

        for (uint256 i = 0; i < assetList.length; i++) {
            address tokenAddr = assetList[i];
            Asset storage a = assets[tokenAddr];
            if (!a.active) continue;

            uint256 assetNav;
            uint256 assetRfv;

            if (a.assetType == AssetType.MANUAL) {
                assetNav = a.manualValue;
                assetRfv = (assetNav * a.haircutBps) / BPS_DENOMINATOR;
            } else if (a.assetType == AssetType.ERC20) {
                uint256 balance = _getAssetBalance(tokenAddr);
                if (a.priceFeed != address(0) && balance > 0) {
                    uint256 price = IPriceFeed(a.priceFeed).getTokenPrice(tokenAddr);
                    assetNav = (balance * price) / 1e18;
                }
                assetRfv = (assetNav * a.haircutBps) / BPS_DENOMINATOR;
            } else if (a.assetType == AssetType.ERC4626) {
                uint256 shares = _getAssetBalance(tokenAddr);
                if (shares > 0) {
                    // Convert shares to underlying assets
                    uint256 totalShares = IERC20(tokenAddr).totalSupply();
                    uint256 totalAssets = IERC4626(tokenAddr).totalAssets();
                    uint256 underlyingBalance = (shares * totalAssets) / totalShares;
                    if (a.priceFeed != address(0)) {
                        address underlying = IERC4626(tokenAddr).asset();
                        uint256 price = IPriceFeed(a.priceFeed).getTokenPrice(underlying);
                        assetNav = (underlyingBalance * price) / 1e18;
                    }
                }
                assetRfv = (assetNav * a.haircutBps) / BPS_DENOMINATOR;
            } else if (a.assetType == AssetType.LP_TOKEN) {
                uint256 balance = _getAssetBalance(tokenAddr);
                if (a.priceFeed != address(0) && balance > 0) {
                    uint256 price = IPriceFeed(a.priceFeed).getTokenPrice(tokenAddr);
                    assetNav = (balance * price) / 1e18;
                }
                assetRfv = (assetNav * a.haircutBps) / BPS_DENOMINATOR;
            }

            computedNav += assetNav;
            computedRfv += assetRfv;
        }
    }

    /// @notice Refresh on-chain valuations and update stored rfv/nav/floorPrice
    /// @dev Call this after asset values change. Only multisig to prevent front-running.
    function refreshValuations(uint256 _shitSupply) external onlyMultisig {
        (uint256 computedNav, uint256 computedRfv) = computeValuations();
        rfv = computedRfv;
        nav = computedNav;
        shitSupply = _shitSupply;
        floorPrice = _shitSupply > 0 ? (rfv * 1e18) / _shitSupply : 0;
        manualOverride = false;
        emit ValuationsUpdated(rfv, nav, floorPrice);
    }

    /// @notice Authorized keeper address that can refresh valuations automatically
    /// @dev Set to the trade worker's executor wallet for automated RFV pushes.
    ///      Follows the same KEEPER_ROLE pattern as ShitLiquidationKeeper.
    address public rfvKeeper;

    /// @notice Set the RFV keeper address — multisig only
    function setRfvKeeper(address _keeper) external onlyMultisig {
        rfvKeeper = _keeper;
    }

    /// @notice Refresh valuations from an authorized keeper (automated RFV push)
    /// @dev Callable by multisig or rfvKeeper. Same logic as refreshValuations but
    ///      allows the trade worker to auto-push RFV after each profitable sell.
    function refreshValuationsFromKeeper(uint256 _shitSupply) external {
        if (msg.sender != multisig && msg.sender != rfvKeeper) revert NotMultisig();
        (uint256 computedNav, uint256 computedRfv) = computeValuations();
        rfv = computedRfv;
        nav = computedNav;
        shitSupply = _shitSupply;
        floorPrice = _shitSupply > 0 ? (rfv * 1e18) / _shitSupply : 0;
        manualOverride = false;
        emit ValuationsUpdated(rfv, nav, floorPrice);
    }

    /// @notice Set treasury valuations manually — multisig override
    /// @dev Use when on-chain computation isn't available or needs correction.
    ///      Sets manualOverride = true so computeValuations results are ignored.
    function setValuations(uint256 _rfv, uint256 _nav, uint256 _shitSupply) external onlyMultisig {
        rfv = _rfv;
        nav = _nav;
        shitSupply = _shitSupply;
        floorPrice = _shitSupply > 0 ? (rfv * 1e18) / _shitSupply : 0;
        manualOverride = true;
        emit ValuationsUpdated(rfv, nav, floorPrice);
    }

    // ============ ITreasuryPolicy ============

    /// @inheritdoc ITreasuryPolicy
    function enforceRfvInvariant(uint256 _shitSupply) external view {
        if (rfvBypass) return;
        if (rfv == 0) revert RfvInvariantFailed(0, 0);
        uint256 requiredRfv = (_shitSupply * floorPrice) / 1e18;
        if (requiredRfv > rfv) revert RfvInvariantFailed(requiredRfv, rfv);
    }

    /// @inheritdoc ITreasuryPolicy
    function navPerShit() external view returns (uint256) {
        return shitSupply > 0 ? (nav * 1e18) / shitSupply : 0;
    }

    // ============ Admin ============

    /// @notice Toggle RFV invariant bypass — multisig emergency override
    function setRfvBypass(bool _bypass) external onlyMultisig {
        rfvBypass = _bypass;
        emit RfvBypassToggled(_bypass);
    }

    /// @notice Pre-mint gate — minters call this before minting to enforce RFV invariant
    /// @dev Reverts if minting `_amount` on top of `_currentSupply` would breach the RFV floor.
    ///      If rfvBypass is true or rfv is 0, the check is skipped.
    function canMint(uint256 _currentSupply, uint256 _amount) external view {
        if (rfvBypass) return;
        if (rfv == 0) return;
        uint256 newSupply = _currentSupply + _amount;
        uint256 requiredRfv = (newSupply * floorPrice) / 1e18;
        if (requiredRfv > rfv) revert RfvInvariantFailed(requiredRfv, rfv);
    }
}
