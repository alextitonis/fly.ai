import { formatTokenAmount } from "@/lib/math";

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/** Convert WAD continuous interest rate (e.g. ln(1 + APR)) to basis points. */
export function calculateInterestRateBps(interestRateWad: bigint): number {
  return Math.round((Math.exp(formatTokenAmount(interestRateWad)) - 1) * 10000);
}

/**
 * Estimate when continuously-compounding debt will hit the liquidation threshold.
 * Returns `null` when liquidation is not reachable (no debt, no threshold, or zero
 * rate) and the current date when the position is already at or past liquidation.
 *
 *   t (years) = ln(threshold / debt) / annualRate
 *   annualRate = exp(interestRateWad / 1e18) - 1
 */
export function computeLiquidationDate(
  debt: bigint,
  threshold: bigint,
  interestRateWad: bigint,
): Date | null {
  if (debt === 0n || threshold === 0n || interestRateWad <= 0n) return null;

  const debtNum = formatTokenAmount(debt);
  const thresholdNum = formatTokenAmount(threshold);
  if (debtNum >= thresholdNum) return new Date();

  const annualRate = Math.exp(formatTokenAmount(interestRateWad)) - 1;
  const yearsToLiquidation = Math.log(thresholdNum / debtNum) / annualRate;
  return new Date(Date.now() + yearsToLiquidation * MS_PER_YEAR);
}
