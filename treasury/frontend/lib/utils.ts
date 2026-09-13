import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number of months into a short term suffix (e.g., "1m", "3m", "6m")
 */
export function formatTermSuffix(months: number): string {
  return `${months}m`;
}

/**
 * Formats a number of months into a human-readable period display name
 * (e.g., "1 month", "3 months", "1 year", "1y 6m")
 */
export function formatPeriodDisplayName(months: number): string {
  if (months === 1) return "1 month";
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) {
    return years === 1 ? "1 year" : `${years} years`;
  } else {
    return `${years}y ${remainingMonths}m`;
  }
}

/**
 * Creates a display name for a token with term suffix (e.g., "USDS-3m", "cdUSDS-6m")
 */
export function createTokenDisplayName(baseSymbol: string, periodMonths: number): string {
  const termSuffix = formatTermSuffix(periodMonths);
  return `${baseSymbol}-${termSuffix}`;
}

/**
 * Returns the most recent point at or before `hoursAgo` from the latest
 * point's date, provided it isn't older than `maxStalenessHours`. Anchoring
 * at the latest snapshot (rather than wall-clock now) makes "24h change"
 * compare live-vs-the-bar-before-the-latest-bar — the chart-visible delta
 * users actually expect — instead of live-vs-the-latest-bar, which is a
 * stale aggregate that drifts toward live and produces a near-zero badge.
 *
 * Assumes `points` is sorted ascending by `date` (ISO `YYYY-MM-DD`).
 */
export function getReferenceSnapshot<T extends { date: string }>(
  points: T[],
  hoursAgo: number,
  maxStalenessHours: number = hoursAgo * 2,
): T | undefined {
  if (points.length === 0) return undefined;
  const anchorMs = new Date(points[points.length - 1].date).getTime();
  const cutoff = new Date(anchorMs - hoursAgo * 3_600_000).toISOString().split("T")[0];
  const stalest = new Date(anchorMs - maxStalenessHours * 3_600_000).toISOString().split("T")[0];
  for (let i = points.length - 1; i >= 0; i--) {
    const date = points[i].date;
    if (date <= cutoff && date >= stalest) return points[i];
    if (date < stalest) return undefined;
  }
  return undefined;
}
