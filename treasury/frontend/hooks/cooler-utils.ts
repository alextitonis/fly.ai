/**
 * Shared utility functions for Cooler Loans data hooks.
 */

/**
 * Format an ISO date string (YYYY-MM-DD) as a short MM/DD chart axis label.
 */
export function formatDateTick(date: string): string {
  const [, month, day] = date.split("-");
  return month && day ? `${month}/${day}` : date;
}

/**
 * Format a number as USD currency with no decimal places.
 */
export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number as wstSHIT with 2 decimal places.
 */
export function formatWSTSHIT(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Truncate an Ethereum address to 0x1234...5678 format.
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a decimal value as a percentage string (e.g. "12.34%").
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Calculate the number of days from now until a loan defaults (expires).
 * Returns 0 if the loan has already expired.
 */
export function calculateDaysUntilDefault(expiryTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const timeUntilDefault = expiryTimestamp - now;
  const daysUntilDefault = Math.floor(timeUntilDefault / (60 * 60 * 24));

  return Math.max(0, daysUntilDefault);
}

/**
 * Calculate the remaining principal on a loan after accounting for repayments.
 * If there are repayment events, the last one contains the current principalPayable.
 * Otherwise, the original principal is returned.
 */
export function getRemainingPrincipal(loan: {
  principal: number;
  repaymentEvents?: { principalPayable: number }[];
}): number {
  if (!loan.repaymentEvents || loan.repaymentEvents.length === 0) {
    return loan.principal;
  }

  const latestRepayment = loan.repaymentEvents[loan.repaymentEvents.length - 1];
  return latestRepayment.principalPayable;
}
