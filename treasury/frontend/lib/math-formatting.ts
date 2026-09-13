import * as dnum from "dnum";
import type { Dnum } from "dnum";

import { PERCENTAGE_PRECISION } from "./math-Constants";

/**
 * Convert bigint with decimals to dnum format
 */
export function bigintToDnum(value: bigint, decimals = 18): Dnum {
  return [value, decimals];
}

/**
 * Convert bigint to number with proper decimal formatting
 */
export function formatTokenAmount(amount: bigint, decimals = 18): number {
  const dnumValue = bigintToDnum(amount, decimals);
  return dnum.toNumber(dnumValue);
}

/**
 * Format bigint as percentage (from 18-decimal precision)
 * E.g., 50000000000000000n (0.05 * 1e18) becomes 0.05 (5%)
 */
export function formatPercentageFromBigInt(value: bigint, decimals: number = 18): number {
  const dnumValue = bigintToDnum(value, decimals);
  return dnum.toNumber(dnumValue);
}

/**
 * Calculate percentage ratio between two bigint values
 * Returns decimal format (e.g., 0.05 for 5%)
 */
export function calculatePercentageRatio(
  numerator: bigint,
  denominator: bigint,
  decimals: number = 18,
): number {
  if (denominator === 0n) return 0;

  const numDnum = bigintToDnum(numerator, decimals);
  const denDnum = bigintToDnum(denominator, decimals);

  const ratio = dnum.divide(numDnum, denDnum, decimals);
  return dnum.toNumber(ratio);
}

/**
 * Calculate liquidation bonus from MCR
 * MCR is typically in 18 decimal precision (e.g., 1.1e18 for 110%)
 * Returns bonus as decimal (e.g., 0.1 for 10% bonus)
 */
export function calculateLiquidationBonusFromMCR(mcr: bigint): number {
  if (mcr === 0n) return 0.1; // Default 10% bonus

  const mcrDnum = bigintToDnum(mcr, 18);
  const oneDnum = dnum.from(1, 18);

  // Bonus = MCR - 1.0
  const bonus = dnum.subtract(mcrDnum, oneDnum);
  const bonusNumber = dnum.toNumber(bonus);

  return Math.max(0, bonusNumber);
}

/**
 * Convert percentage in PERCENTAGE_PRECISION format to decimal
 * E.g., percentage stored as 5% = 5 * PERCENTAGE_PRECISION / 100
 */
export function percentagePrecisionToDecimal(value: bigint): number {
  if (value === 0n) return 0;

  const valueDnum = bigintToDnum(value, 18);
  const precisionDnum = bigintToDnum(PERCENTAGE_PRECISION, 18);

  const decimal = dnum.divide(valueDnum, precisionDnum);
  return dnum.toNumber(decimal);
}

/**
 * Format number as display string with proper formatting
 */
export function formatDisplayNumber(
  value: number,
  options: {
    digits?: number;
    compact?: boolean;
    currency?: boolean;
    suffix?: string;
  } = {},
): string {
  const { digits = 2, compact = false, currency = false, suffix } = options;

  if (currency) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  const dnumValue = dnum.from(value, 18);
  let formatted = dnum.format(dnumValue, {
    digits,
    compact,
    trailingZeros: false,
  });

  if (suffix) {
    formatted += ` ${suffix}`;
  }

  return formatted;
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Format token amount with proper decimals and suffix
 */
export function formatTokenDisplay(
  amount: bigint,
  decimals = 18,
  displayOptions: {
    digits?: number;
    suffix?: string;
    compact?: boolean;
  } = {},
): string {
  const number = formatTokenAmount(amount, decimals);
  return formatDisplayNumber(number, displayOptions);
}

/**
 * Calculate and format APY from annual rate
 * Assumes rate is annual percentage in 18-decimal format
 */
export function calculateAndFormatAPY(annualRate: bigint, decimals = 18): number {
  return formatPercentageFromBigInt(annualRate, decimals);
}

/**
 * Helper to check if bigint value is zero
 */
export function isZero(value: bigint): boolean {
  return value === 0n;
}

/**
 * Helper to get maximum of two bigint values
 */
export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * Safely convert bigint to number with fallback
 */
export function safeToNumber(value: bigint, decimals = 18, fallback = 0): number {
  try {
    return formatTokenAmount(value, decimals);
  } catch {
    return fallback;
  }
}
