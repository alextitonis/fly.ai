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
