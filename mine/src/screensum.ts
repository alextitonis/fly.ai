/**
 * One screen job's answer in the unit /api/results reports: spikes per neuron per second, per output group. Shared
 * by the results worker (live rows) and the server's pruning (rows folded into screen_sums before they go), so the
 * two add up the same way.
 */
import type { TaskParams, TaskResult } from "./runner.ts";

/** A job's params without the seed: the key its seeds are averaged under. */
export function screenKey(params: TaskParams): { key: string; params: Omit<TaskParams, "seed"> } {
  const { seed: _seed, ...rest } = params;
  return { key: JSON.stringify(rest), params: rest };
}

export function screenRates(params: Omit<TaskParams, "seed">, r: TaskResult, outputSizes: number[], dt: number): { base: number[]; stim: number[] } {
  return {
    base: r.base.map((n, g) => n / (outputSizes[g] || 1) / (params.warm * dt)),
    stim: r.stim.map((n, g) => n / (outputSizes[g] || 1) / ((params.steps - params.warm) * dt)),
  };
}

/**
 * Per-seed spread, kept from schema 22 on (2026-10-26) beside the plain sums: its own seed count, sums and sums of
 * squares, so a standard deviation comes out exact over exactly the seeds it saw. Seeds summed before it existed
 * have no spread, so `n` is smaller than the row's `seeds`.
 */
export type Spread = { n: number; base: number[]; base2: number[]; stim: number[]; stim2: number[] };

export const emptySpread = (groups: number): Spread =>
  ({ n: 0, base: Array(groups).fill(0), base2: Array(groups).fill(0), stim: Array(groups).fill(0), stim2: Array(groups).fill(0) });

export function addSpread(s: Spread, r: { base: number[]; stim: number[] }): void {
  s.n++;
  r.base.forEach((x, g) => { s.base[g] += x; s.base2[g] += x * x; });
  r.stim.forEach((x, g) => { s.stim[g] += x; s.stim2[g] += x * x; });
}

/** Sample standard deviation per group; null under two seeds. */
export function spreadSd(n: number, sum: number[], sum2: number[]): number[] | null {
  if (n < 2) return null;
  return sum.map((x, g) => Math.sqrt(Math.max(0, (sum2[g] - (x * x) / n) / (n - 1))));
}
