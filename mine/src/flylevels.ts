/**
 * Fly levels, titles and squads (2026-11-06, flytrade/GAMIFY-PLAN.md phase 2; the user: activity plus profit, status
 * only, squad rank on a public board). Display only: nothing here pays, weighs a payout or gives XP.
 *
 * A funded fly's XP, from its own wallet on Robinhood Chain:
 *   10 a day since its holder first put money in (the current holder's first deposit), 5 a trade, 20 per $1 of profit
 *   above zero (a loss takes nothing away, so a small or unlucky wallet still levels by keeping it on).
 * Level = floor(sqrt(xp / 50)), the same curve as the holders' XP levels (xp.ts levelOf).
 * Titles, from its record: hot (its last 3+ closed sells all won), diamond (30+ days funded, nothing taken out since),
 * sniper (a sell at +50% or more among its recent trades), grinder (100+ trades).
 * A squad = a holder's funded flies: score = their levels added up, ranked; ties = more XP first.
 *
 *   GET /api/vaults/levels   { updated, flies: { <id>: FlyLevel }, squads: Squad[] }   (vaults.ts, cached 5 minutes)
 */

export const FLY_RATES = { day: 10, trade: 5, profitUsd: 20, levelBase: 50, diamondDays: 30, hotRun: 3, sniperPct: 50, grinderTrades: 100 };
export type Title = "hot" | "diamond" | "sniper" | "grinder";
export type FlyLevel = { xp: number; level: number; at: number; next: number; days: number; titles: Title[] };
export type Squad = { rank: number; holder: string; score: number; xp: number; flies: number[] };
/** what flyLevels needs of a fly's public stats (the feed's Stats) */
export type FlyStats = { holder: string | null; trades: number; profit: number;
  recent?: { at: number; side: string; pnl_pct?: number }[] };
/** the current holder's money moves on the fly's wallet: first deposit, last withdrawal (ms) */
export type Moves = { firstDeposit: number | null; lastWithdraw: number | null };

const DAY = 86_400_000;
/** the team's wallets (dev, POOL, desk, the user's), off the squad board: the same default as xp.ts XP_EXCLUDE */
export const TEAM = "0x625862521777e19ad54ce6c7abed9ca54d6589ea,0xcca1ad591f6fe7e40e382639ad2551044fae6d36,"
  + "0x449f6228dec522bb36a69153c3f8e36a8a7852fb,0xae92d64584e7f8e54995c362eaa8d7949fac8b1b";
export const flyLevelOf = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / FLY_RATES.levelBase));
export const flyLevelXp = (level: number) => FLY_RATES.levelBase * level * level;

export function flyLevel(s: FlyStats, m: Moves | undefined, now: number): FlyLevel {
  const days = m?.firstDeposit ? Math.max(0, Math.floor((now - m.firstDeposit) / DAY)) : 0;
  const trades = Math.max(0, Number(s.trades) || 0);
  const xp = Math.round(days * FLY_RATES.day + trades * FLY_RATES.trade + Math.max(0, Number(s.profit) || 0) * FLY_RATES.profitUsd);
  const level = flyLevelOf(xp);
  const titles: Title[] = [];
  // closed sells newest first (recent comes newest first from the desk)
  const closed = (s.recent ?? []).filter((r) => r.pnl_pct != null).sort((a, b) => b.at - a.at);
  let run = 0;
  for (const r of closed) { if (r.pnl_pct! > 0) run++; else break; }
  if (run >= FLY_RATES.hotRun) titles.push("hot");
  if (days >= FLY_RATES.diamondDays && m?.firstDeposit && (m.lastWithdraw == null || m.lastWithdraw < m.firstDeposit)) titles.push("diamond");
  if (closed.some((r) => r.pnl_pct! >= FLY_RATES.sniperPct)) titles.push("sniper");
  if (trades >= FLY_RATES.grinderTrades) titles.push("grinder");
  return { xp, level, at: flyLevelXp(level), next: flyLevelXp(level + 1), days, titles };
}

/** every funded fly's level and every holder's squad, ranked (score, then XP, then fewer flies) */
export function flyLevels(flies: Record<string, FlyStats>, moves: Map<string, Moves>, now: number, exclude: string[] = []) {
  const out: Record<string, FlyLevel> = {};
  const by = new Map<string, Squad>();
  for (const [id, s] of Object.entries(flies)) {
    if (!s) continue;
    const holder = s.holder?.toLowerCase() ?? null;
    const l = flyLevel(s, holder ? moves.get(`${id}:${holder}`) : undefined, now);
    out[id] = l;
    if (!holder || exclude.includes(holder)) continue;
    const q = by.get(holder) ?? by.set(holder, { rank: 0, holder, score: 0, xp: 0, flies: [] }).get(holder)!;
    q.score += l.level;
    q.xp += l.xp;
    q.flies.push(Number(id));
  }
  const squads = [...by.values()].sort((a, b) => b.score - a.score || b.xp - a.xp || a.flies.length - b.flies.length);
  squads.forEach((q, i) => { q.rank = i + 1; });
  return { flies: out, squads };
}
