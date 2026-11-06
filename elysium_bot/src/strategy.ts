/** Pure decisions (no I/O), so they can be unit-tested: is a new pool worth buying, and should a held one be sold. */
import type { Config } from "./config.js";
import type { Trip } from "./helper.js";

export interface Position {
  id: string;
  symbol: string;
  costHype: number; // HYPE still at risk in this position (lowered by partial sells)
  spentHype: number; // HYPE paid at entry
  receivedHype: number; // HYPE got back so far from sells
  tokens: string; // bigint as string
  taxRatio: number; // real sell / quoted sell, measured at entry
  peakValue: number;
  lastValue: number;
  openedAt: number;
  tookProfit: boolean;
  sellFails: number;
}

export interface Gate {
  ok: boolean;
  why: string;
  lossPct?: number;
  taxRatio?: number;
}

const f = (x: bigint) => Number(x) / 1e18;

export const PROBE_DIV = 20n;

/** Entry gate from two round trips: one at our size (honeypot, taxes, fees) and a probe at 1/20 our size. A round
 * trip alone cannot see depth (buy-then-sell gets the price move back), so depth is the price impact of our buy:
 * tokens per HYPE at our size vs at the probe size. */
export function entryGate(cfg: Config, buyWei: bigint, trip: Trip, probe: Trip | null): Gate {
  if (!trip.ok) return { ok: false, why: `round trip failed (${trip.reason ?? "?"})` };
  const lossPct = (1 - f(trip.back) / f(buyWei)) * 100;
  const taxRatio = trip.quoted > 0n ? f(trip.back) / f(trip.quoted) : 0;
  if (taxRatio < cfg.minTaxRatio) return { ok: false, why: `sell tax ${((1 - taxRatio) * 100).toFixed(1)}%`, lossPct, taxRatio };
  if (lossPct > cfg.maxRoundTripLossPct) return { ok: false, why: `round trip loses ${lossPct.toFixed(1)}%`, lossPct, taxRatio };
  if (!probe || !probe.ok || probe.got === 0n) return { ok: false, why: "probe failed", lossPct, taxRatio };
  const impactPct = (1 - f(trip.got) / (f(probe.got) * Number(PROBE_DIV))) * 100;
  if (impactPct > cfg.maxImpactPct) return { ok: false, why: `thin pool (impact ${impactPct.toFixed(1)}%)`, lossPct, taxRatio };
  return { ok: true, why: `loss ${lossPct.toFixed(1)}%, impact ${impactPct.toFixed(1)}%`, lossPct, taxRatio };
}

export type Exit = { part: number; why: string } | null;

/** value = what selling everything would pay now (HYPE). Returns the share of the bag to sell, or null. */
export function exitRule(cfg: Config, p: Position, value: number, now: number, sellable = true): Exit {
  if (!sellable) return { part: 1, why: "sell check failed (honeypot/drain?)" };
  const entry = p.spentHype;
  const totalNow = value + p.receivedHype; // what the trade is worth incl. what was already taken out
  if (!p.tookProfit && value >= entry * cfg.tpX && cfg.tpPart > 0 && cfg.tpPart < 1)
    return { part: cfg.tpPart, why: `take profit ${cfg.tpX}x` };
  if (!p.tookProfit && value >= entry * cfg.tpX && cfg.tpPart >= 1) return { part: 1, why: `take profit ${cfg.tpX}x` };
  // the trail arms once the bag was up trailArmX, and always after a take-profit (peakValue is then the rest's top)
  const armed = p.tookProfit || p.peakValue >= entry * cfg.trailArmX;
  if (armed && value <= p.peakValue * (1 - cfg.trailPct / 100))
    return { part: 1, why: `trailing stop ${cfg.trailPct}% under the top` };
  if (!p.tookProfit && totalNow <= entry * (1 - cfg.stopPct / 100)) return { part: 1, why: `stop -${cfg.stopPct}%` };
  if (now - p.openedAt >= cfg.maxHoldMin * 60_000) return { part: 1, why: `max hold ${cfg.maxHoldMin} min` };
  return null;
}
