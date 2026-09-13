import { mulDiv, mulDivUp, rpow } from "./math-solady";
import {
  BASIS_POINTS_SCALE,
  LLTV_100_PERCENT,
  ORACLE_PRICE_SCALE,
  PERCENTAGE_PRECISION,
  SECOND_PER_YEAR,
} from "./math-Constants";

export const DISCOUNT_FACTOR = toPercent(5n);
/**
 * Converts collateral to lendable amount with upward rounding.
 * @param collateral - The collateral amount (bigint).
 * @param collateralPrice - The price of the collateral (bigint).
 * @returns The lendable amount (bigint).
 */
export function collateralToLendUp(collateral: bigint, collateralPrice: bigint): bigint {
  return mulDivUp(collateral, collateralPrice, ORACLE_PRICE_SCALE);
}

/**
 * Multiplies a value by a percentage with upward rounding.
 * @param value - The base value (bigint).
 * @param percent - The percentage (bigint).
 * @returns The result of `(value * percent) / percentScale`, rounded up.
 */
export function mulPercentUp(value: bigint, percent: bigint): bigint {
  return mulDivUp(value, percent, PERCENTAGE_PRECISION);
}

// / @dev Get percentage down (x * %) / 100
export function mulPercentDown(value: bigint, percent: bigint): bigint {
  return mulDiv(value, percent, PERCENTAGE_PRECISION);
}

/// @notice Converts debt to collateral amount, rounding up
/// @param debt The amount of debt to convert
/// @param collPrice The price of the collateral
/// @return The equivalent amount in collateral, rounded up
export function debtToCollUp(debt: bigint, collPrice: bigint): bigint {
  return mulDivUp(debt, ORACLE_PRICE_SCALE, collPrice);
}

/// @notice Converts debt to collateral amount, rounding down
/// @param debt The amount of debt to convert
/// @param price The price of the collateral
/// @return The equivalent amount in collateral, rounded down
export function debtToCollDown(debt: bigint, price: bigint): bigint {
  return mulDiv(debt, ORACLE_PRICE_SCALE, price);
}

/// @notice Converts collateral to debt assets, rounding up
/// @param coll The amount of collateral to convert
/// @param price The price of the collateral
/// @return The equivalent amount in debt assets, rounded up
export function collToDebtUp(coll: bigint, price: bigint): bigint {
  return mulDivUp(coll, price, ORACLE_PRICE_SCALE);
}

/// @notice Converts collateral to debt assets, rounding down
/// @param coll The amount of collateral to convert
/// @param price The price of the collateral
/// @return The equivalent amount in debt assets, rounded down
export function collToDebtDown(coll: bigint, price: bigint): bigint {
  return mulDiv(coll, price, ORACLE_PRICE_SCALE);
}

export function cSHITtoSHIT(cSHIT: bigint): bigint {
  return cSHIT / 10n ** 9n;
}

/**
 * Calculate ICR (Individual Collateralization Ratio)
 * Formula: ICR = (collateral * price / ORACLE_PRICE_SCALE) * PERCENTAGE_PRECISION / debt
 */
export function calculateICR(collateral: bigint, debt: bigint, price: bigint): bigint {
  if (debt === 0n) {
    return 2n ** 256n - 1n; // Infinite ICR
  }
  const collateralValue = collToDebtDown(collateral, price);
  return (collateralValue * PERCENTAGE_PRECISION) / debt;
}

/**
 * Calculate LTV from collateral, debt, and price
 * Formula: LTV = debt / (collateral * price / ORACLE_PRICE_SCALE)
 */
export function calculateLTV(collateral: bigint, debt: bigint, price: bigint): bigint {
  if (collateral === 0n) return 0n;

  const maxDebt = collToDebtDown(collateral, price);
  if (maxDebt === 0n) return 0n;

  return (debt * PERCENTAGE_PRECISION) / maxDebt;
}

/**
 * Calculate LTV in basis points (for UI slider)
 * Returns LTV * 100000 (e.g., 50% = 50000 BP)
 */
export function calculateLTVInBasisPoints(collateral: bigint, debt: bigint, price: bigint): bigint {
  const ltv = calculateLTV(collateral, debt, price);
  return (ltv * BASIS_POINTS_SCALE) / PERCENTAGE_PRECISION;
}

/**
 * Calculate debt amount from collateral and LTV
 * Formula: debt = (collateral * price / ORACLE_PRICE_SCALE) * ltv / PERCENTAGE_PRECISION
 */
export function calculateDebtFromLTV(collateral: bigint, ltv: bigint, price: bigint): bigint {
  const collateralValue = collToDebtDown(collateral, price);
  return (collateralValue * ltv) / PERCENTAGE_PRECISION;
}

/**
 * Calculate debt amount from collateral and LTV in basis points
 */
export function calculateDebtFromLTVBasisPoints(
  collateral: bigint,
  ltvBP: bigint,
  price: bigint,
): bigint {
  const ltv = (ltvBP * PERCENTAGE_PRECISION) / BASIS_POINTS_SCALE;
  return calculateDebtFromLTV(collateral, ltv, price);
}

/**
 * Calculate maximum LTV based on MCR
 * Formula: maxLTV = PERCENTAGE_PRECISION / MCR
 */
export function calculateMaxLTV(mcr: bigint): bigint {
  if (mcr === 0n) return 0n;
  return PERCENTAGE_PRECISION / mcr;
}

/**
 * Calculate maximum LTV in basis points
 */
export function calculateMaxLTVBasisPoints(mcr: bigint): bigint {
  if (mcr === 0n) return 0n;

  // For MCR in 18 decimals (e.g., 1.1e18 for 110%), we need to calculate 1/MCR
  // maxLTV = PERCENTAGE_PRECISION / MCR
  // But we want result in basis points (100,000 = 100%)
  // So: maxLTV_BP = (PERCENTAGE_PRECISION * BASIS_POINTS_SCALE) / (MCR * PERCENTAGE_PRECISION / PERCENTAGE_PRECISION)
  // Simplified: maxLTV_BP = (BASIS_POINTS_SCALE * PERCENTAGE_PRECISION) / MCR

  return (BASIS_POINTS_SCALE * PERCENTAGE_PRECISION) / mcr;
}

// Divides value by percentage with rounding up
export function divPercentUp(value: bigint, percent: bigint): bigint {
  return mulDivUp(value, LLTV_100_PERCENT, percent);
}

// Divides value by percentage with rounding down
export function divPercentDown(value: bigint, percent: bigint): bigint {
  return mulDiv(value, LLTV_100_PERCENT, percent);
}

// Converts percentage number to basis points (e.g., 50 -> 5000 for 50%)
export function toPercent(value: bigint): bigint {
  return (value * LLTV_100_PERCENT) / 100n;
}

/**
 * Precision for Nominal ICR (independent of price). Rationale for the value:
 *
 * - Making it "too high" could lead to overflows.
 * - Making it "too low" could lead to an ICR equal to zero, due to truncation from Solidity floor division.
 *
 * This value of 1e20 is chosen for safety: the NICR will only overflow for numerator > ~1e39 ETH,
 * and will only truncate to 0 if the denominator is at least 1e20 times greater than the numerator.
 */
export const NICR_PRECISION = 10n ** 20n;

/**
 * Exponent cap to avoid overflow in decPow function
 */
export const EXPONENT_CAP = 525_600_000n;

/**
 * Computes the nominal collateral ratio (price-independent)
 * @param coll The collateral amount
 * @param debt The debt amount
 * @returns The nominal collateral ratio, or max uint256 if debt is zero
 */
export function computeNominalCR(coll: bigint, debt: bigint): bigint {
  if (debt !== 0n) {
    return (coll * NICR_PRECISION) / debt;
  }
  // Return the maximal value for uint256 if the vessel has a debt of 0. Represents "infinite" CR.
  return 2n ** 256n - 1n;
}

/**
 * Computes the collateral ratio using current price
 * @param coll The collateral amount
 * @param debt The debt amount
 * @param price The current price of the collateral
 * @returns The collateral ratio as a percentage, or max uint256 if debt is zero
 */
export function computeCR(coll: bigint, debt: bigint, price: bigint): bigint {
  // If no debt, CR is "infinite"
  if (debt === 0n) {
    return 2n ** 256n - 1n; // Max uint256 value
  }
  const collateralValue = collToDebtDown(coll, price);
  return (collateralValue * PERCENTAGE_PRECISION) / debt;
}

/**
 * Exponentiation function for 18-digit decimal base and integer exponent
 * @param base The base value (18-digit decimal)
 * @param _minutes The exponent in minutes (capped at 525,600,000 for safety)
 * @returns The result of base^_minutes using 18-digit decimal precision
 */
export function decPow(base: bigint, _minutes: bigint): bigint {
  // cap to avoid overflow
  let minutes = _minutes;
  if (minutes > EXPONENT_CAP) {
    minutes = EXPONENT_CAP;
  }

  // Use rpow for optimized exponentiation by squaring
  // rpow(base, exponent, precision_base) where precision_base = 1e18 for our decimal precision
  return rpow(base, minutes, PERCENTAGE_PRECISION);
}

/**
 * Converts a per-second interest rate to Annual Percentage Rate (APR)
 * The conversion formula is:
 * APR% = (perSecondRate × SECONDS_PER_YEAR × 100) ÷ PERCENTAGE_PRECISION
 *
 * @param perSecondRate - The per-second interest rate from the smart contract (bigint)
 *                        Example: 633779108n for ~2% APR, 2218226878n for ~7% APR
 *
 * @returns The annual percentage rate as a number with decimal precision (e.g., 2.0 for 2%, 7.0 for 7%)
 */
export const convertPerSecondRateToAPR = (perSecondRate: bigint): number => {
  // Use higher precision arithmetic to avoid rounding errors
  const numerator = perSecondRate * SECOND_PER_YEAR * 100000n; // Extra precision
  const result = numerator / PERCENTAGE_PRECISION;
  const percentage = Number(result) / 1000; // Convert back to percentage with decimal places

  // Round to 2 decimal places for cleaner display
  return Math.round(percentage * 100) / 100;
};
