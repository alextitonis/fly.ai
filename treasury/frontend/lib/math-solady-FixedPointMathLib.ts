import { parseUnits } from "viem";
import { WAD } from "./math-Constants";

export function mulDiv(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) return 0n;
  const product = x * y;
  if (y !== 0n && product / y !== x) return 0n;
  return product / d;
}

export function mulDivUp(x: bigint, y: bigint, d: bigint): bigint {
  if (d === 0n) return 0n;
  const product = x * y;
  if (y !== 0n && product / y !== x) return 0n;
  const remainder = product % d;
  return product / d + (remainder > 0n ? 1n : 0n);
}

export function min(x: bigint, y: bigint): bigint {
  const condition = y < x ? 1n : 0n;
  return x ^ ((x ^ y) * condition);
}

export function zeroFloorSub(x: bigint, y: bigint): bigint {
  return x > y ? x - y : 0n;
}

export function rpow(base: bigint, exponent: bigint, precision: bigint): bigint {
  if (exponent === 0n) return precision;
  if (base === 0n) return 0n;
  if (base === precision) return precision;

  let result = precision;
  let currentBase = base;
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result = mulDiv(result, currentBase, precision);
    }
    currentBase = mulDiv(currentBase, currentBase, precision);
    currentExponent = currentExponent / 2n;
  }

  return result;
}

/** Multiply two WAD-denominated values: (a * b) / 1e18 */
export function wmul(a: bigint, b: bigint): bigint {
  return mulDiv(a, b, WAD);
}

/** Divide two WAD-denominated values: (a * 1e18) / b. Returns 0 when b === 0. */
export function wdiv(a: bigint, b: bigint): bigint {
  return mulDiv(a, WAD, b);
}

/** Convert a percentage (0–100) to a WAD fraction */
export function pctToWad(pct: number): bigint {
  return parseUnits((pct / 100).toFixed(18), 18);
}
