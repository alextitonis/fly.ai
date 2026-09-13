import { parseUnits } from "viem";

/** Parse a user-typed decimal string into token base units; 0n on invalid input. */
export function parseTokenAmount(value: string, decimals: number): bigint {
  try {
    return parseUnits(value || "0", decimals);
  } catch {
    return 0n;
  }
}
