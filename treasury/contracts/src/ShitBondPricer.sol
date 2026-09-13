// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.24;

import {MultisigGuard} from "./MultisigGuard.sol";
import {ITreasuryPolicy} from "./ITreasuryPolicy.sol";

/// @title ShitBondPricer
/// @notice Dynamic bond discount tied to treasury/RFV growth ratio
/// @dev Bond discounts that are static rather than dynamically shrinking as treasury/RFV
///      grows relative to supply risk becoming dilutive faster than the treasury backing
///      them grows — the core mechanic behind SHIT's "(3,3) to death spiral" failure
///      once bond demand outpaces real backing growth.
///
///      This contract computes a dynamic discount rate based on:
///      - Treasury growth ratio: RFV / (SHIT supply × floor price)
///      - When backing ratio is high (RFV >> required), discounts can be larger (accretive)
///      - When backing ratio is low (RFV ≈ required), discounts shrink (anti-dilutive)
///      - Hard floor on discount to prevent zero-discount stuck state
///      - Hard cap on discount to prevent excessive dilution
///
///      Bond Protocol compatibility:
///      - Bond Protocol uses an auctioneer that sets market terms including discount
///      - This contract provides the recommended discount to the auctioneer
///      - The multisig uses this value when creating/updating Bond Protocol markets
///      - Can be called by the Operator or manually by the multisig
///
///      Formula:
///      backingRatio = rfv / (shitSupply × floorPrice / 1e18)
///      If backingRatio >= 1.5: maxDiscount (well-backed, bonds are accretive)
///      If backingRatio >= 1.0: scaled between minDiscount and maxDiscount
///      If backingRatio < 1.0: minDiscount (protect against dilution)
contract ShitBondPricer is MultisigGuard {
    error InvalidParams();

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PRICE_DENOMINATOR = 1e18;

    ITreasuryPolicy public treasuryPolicy; // RFV/floor-price oracle

    uint256 public minDiscountBps = 50;    // 0.5% minimum discount
    uint256 public maxDiscountBps = 1000;  // 10% maximum discount
    uint256 public fullBackingRatioBps = 15000; // 1.5x backing = full discount available

    uint256 public lastComputedDiscountBps;
    uint256 public lastBackingRatioBps;

    event DiscountComputed(uint256 indexed discountBps, uint256 indexed backingRatioBps);
    event ParamsUpdated(uint256 minBps, uint256 maxBps, uint256 fullBackingBps);
    event TreasuryPolicyUpdated(address indexed policy);

    constructor(address _treasuryPolicy, address _multisig) MultisigGuard(_multisig) {
        if (_treasuryPolicy == address(0) || _multisig == address(0)) revert ZeroAddress();
        treasuryPolicy = ITreasuryPolicy(_treasuryPolicy);
    }

    function setTreasuryPolicy(address _policy) external onlyMultisig {
        if (_policy == address(0)) revert ZeroAddress();
        treasuryPolicy = ITreasuryPolicy(_policy);
        emit TreasuryPolicyUpdated(_policy);
    }

    function setParams(uint256 _minBps, uint256 _maxBps, uint256 _fullBackingBps) external onlyMultisig {
        if (_minBps > _maxBps || _maxBps > 5000 || _fullBackingBps < BPS_DENOMINATOR)
            revert InvalidParams();
        minDiscountBps = _minBps;
        maxDiscountBps = _maxBps;
        fullBackingRatioBps = _fullBackingBps;
        emit ParamsUpdated(_minBps, _maxBps, _fullBackingBps);
    }

    /// @notice Compute current recommended bond discount in bps
    /// @param shitSupply Current SHIT total supply
    /// @return discountBps Recommended discount rate in basis points
    function computeDiscount(uint256 shitSupply) external returns (uint256 discountBps) {
        (uint256 rfv, uint256 floorPrice) = _getRfvAndFloor();

        if (rfv == 0 || floorPrice == 0 || shitSupply == 0) {
            discountBps = minDiscountBps;
        } else {
            uint256 requiredRfv = (shitSupply * floorPrice) / PRICE_DENOMINATOR;
            uint256 backingRatioBps = (rfv * BPS_DENOMINATOR) / requiredRfv;

            lastBackingRatioBps = backingRatioBps;

            if (backingRatioBps >= fullBackingRatioBps) {
                // Well-backed: full discount available (bonds are accretive)
                discountBps = maxDiscountBps;
            } else if (backingRatioBps >= BPS_DENOMINATOR) {
                // Scaled: linearly interpolate between min and max
                // range = fullBackingRatioBps - BPS_DENOMINATOR
                // progress = backingRatioBps - BPS_DENOMINATOR
                uint256 range = fullBackingRatioBps - BPS_DENOMINATOR;
                uint256 progress = backingRatioBps - BPS_DENOMINATOR;
                discountBps = minDiscountBps + ((maxDiscountBps - minDiscountBps) * progress) / range;
            } else {
                // Under-backed: minimum discount only (protect against dilution)
                discountBps = minDiscountBps;
            }
        }

        lastComputedDiscountBps = discountBps;
        emit DiscountComputed(discountBps, lastBackingRatioBps);
    }

    /// @notice View: compute discount without updating state
    function previewDiscount(uint256 shitSupply) external view returns (uint256 discountBps) {
        (uint256 rfv, uint256 floorPrice) = _getRfvAndFloor();

        if (rfv == 0 || floorPrice == 0 || shitSupply == 0) {
            return minDiscountBps;
        }

        uint256 requiredRfv = (shitSupply * floorPrice) / PRICE_DENOMINATOR;
        uint256 backingRatioBps = (rfv * BPS_DENOMINATOR) / requiredRfv;

        if (backingRatioBps >= fullBackingRatioBps) {
            return maxDiscountBps;
        } else if (backingRatioBps >= BPS_DENOMINATOR) {
            uint256 range = fullBackingRatioBps - BPS_DENOMINATOR;
            uint256 progress = backingRatioBps - BPS_DENOMINATOR;
            return minDiscountBps + ((maxDiscountBps - minDiscountBps) * progress) / range;
        } else {
            return minDiscountBps;
        }
    }

    function _getRfvAndFloor() internal view returns (uint256 rfv, uint256 floorPrice) {
        rfv = treasuryPolicy.rfv();
        floorPrice = treasuryPolicy.floorPrice();
    }
}
