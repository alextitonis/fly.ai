import { mulDiv, mulDivUp } from "./math-solady";

const SHARES_OFFSET = 10n ** 6n;

/**
 * Converts assets to shares with downward rounding.
 * @param assets - The amount of assets (bigint).
 * @param totalAssets - The total assets (bigint).
 * @param totalShares - The total shares (bigint).
 * @returns The corresponding shares (bigint).
 */
export function toSharesDown(assets: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDiv(assets, totalShares + SHARES_OFFSET, totalAssets + 1n);
}

/**
 * Converts shares to assets with downward rounding.
 * @param shares - The amount of shares (bigint).
 * @param totalAssets - The total assets (bigint).
 * @param totalShares - The total shares (bigint).
 * @returns The corresponding assets (bigint).
 */
export function toAssetsDown(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDiv(shares, totalAssets + 1n, totalShares + SHARES_OFFSET);
}

/**
 * Converts assets to shares with upward rounding.
 * @param assets - The amount of assets (bigint).
 * @param totalAssets - The total assets (bigint).
 * @param totalShares - The total shares (bigint).
 * @returns The corresponding shares (bigint).
 */
export function toSharesUp(assets: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDivUp(assets, totalShares + SHARES_OFFSET, totalAssets + 1n);
}

/**
 * Converts shares to assets with upward rounding using mulDivUp.
 * @param shares - The number of shares (bigint).
 * @param totalAssets - The total amount of assets (bigint).
 * @param totalShares - The total amount of shares (bigint).
 * @returns The corresponding amount of assets (bigint).
 */
export function toAssetsUp(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDivUp(shares, totalAssets + 1n, totalShares + SHARES_OFFSET);
}
