// What the feeds mean for the fly: new trades and profit moves become reactions (a mood to play, a line to say, whether
// to send a system notification). No page or window code here, so it runs under plain node in the tests.

import { t, type Key } from "./i18n.ts";

export type Mood = "idle" | "walk" | "held" | "fall" | "happy" | "moon" | "sad" | "rugged" | "buy" | "sell" | "sleep" | "eat" | "wave";

export interface Trade { at: number; symbol: string; side: string; usd: number | null; tx: string | null; pnl_pct: number | null }
export interface Fly { id: number; funded: boolean; value: number; profit: number; profit_pct: number; profit_24h: number; profit_7d: number; active: boolean; trades: Trade[] }

export interface Reaction { mood: Mood; text: string; notify: boolean }

/** where a watcher got to: each fly's newest trade seen, and the profit last reacted to */
export interface Seen { lastAt: Record<string, number>; profit: number | null }
export const NO_SEEN: Seen = { lastAt: {}, profit: null };

export const MIN_MOVE_USD = 0.25, MIN_MOVE_SHARE = 0.01, BIG_MOVE_SHARE = 0.05;
export const BIG_WIN_PCT = 20, BIG_LOSS_PCT = -15;
export const PRICE_MOVE_PCT = 3, PRICE_BIG_PCT = 10, PRICE_WINDOW_MS = 3_600_000;
const MAX_ONE_BY_ONE = 3;
export const PACE_PX = 90;

const money = (n: number) => `$${Math.abs(n) >= 100 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(2)}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const ticker = (s: string) => s.split(".")[0];       // "ANY.300a" -> "ANY"

function sellMood(pnl: number | null): Mood {
  if (pnl == null) return "sell";
  return pnl >= BIG_WIN_PCT ? "moon" : pnl > 0 ? "happy" : pnl <= BIG_LOSS_PCT ? "rugged" : pnl < 0 ? "sad" : "sell";
}

export function tradeReaction(fly: number, tr: Trade, notify: boolean, who = `#${fly}`): Reaction {
  const vars = { who, sym: ticker(tr.symbol), usd: tr.usd == null ? "" : money(tr.usd) };
  if (tr.side === "buy") return { mood: "buy", text: t(tr.usd == null ? "bought" : "boughtFor", vars), notify };
  const pnl = tr.pnl_pct == null ? "" : ` (${signedPct(tr.pnl_pct)})`;
  return { mood: sellMood(tr.pnl_pct), text: t(tr.usd == null ? "sold" : "soldFor", vars) + pnl, notify };
}

/**
 * New trades and the profit move since the last look. The first look only takes the baseline: installing the pet
 * shouldn't replay a day of trades. More than MAX_ONE_BY_ONE trades at once say one line, not a wall of bubbles.
 */
export function readFlies(seen: Seen, flies: Fly[], opts: { notify: boolean; minUsd: number; who?: (id: number) => string }): { seen: Seen; reactions: Reaction[] } {
  const first = seen.profit == null;
  const lastAt = { ...seen.lastAt };
  const fresh: { fly: number; t: Trade }[] = [];
  for (const f of flies) {
    const since = lastAt[f.id];
    for (const t of f.trades) if (since != null && t.at > since && (t.usd ?? 0) >= opts.minUsd) fresh.push({ fly: f.id, t });
    lastAt[f.id] = Math.max(since ?? 0, ...f.trades.map((t) => t.at));
  }
  fresh.sort((a, b) => a.t.at - b.t.at);

  const profit = flies.reduce((s, f) => s + f.profit, 0), value = flies.reduce((s, f) => s + f.value, 0);
  if (first) return { seen: { lastAt, profit }, reactions: [] };

  const reactions: Reaction[] = [];
  if (fresh.length > MAX_ONE_BY_ONE) {
    const sells = fresh.filter((x) => x.t.side !== "buy" && x.t.pnl_pct != null).map((x) => x.t.pnl_pct as number);
    const best = sells.length ? sells.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null;
    reactions.push({ mood: best == null ? "buy" : sellMood(best), text: t("trades", { n: fresh.length }), notify: opts.notify });
  } else {
    for (const x of fresh) reactions.push(tradeReaction(x.fly, x.t, opts.notify, opts.who?.(x.fly)));
  }

  // the money itself: a move big enough to feel, from the last one it reacted to
  const move = profit - (seen.profit as number);
  const enough = Math.max(MIN_MOVE_USD, value * MIN_MOVE_SHARE);
  if (Math.abs(move) < enough) return { seen: { lastAt, profit: seen.profit }, reactions };
  const big = Math.abs(move) >= Math.max(MIN_MOVE_USD, value * BIG_MOVE_SHARE);
  reactions.push(move > 0
    ? { mood: big ? "moon" : "happy", text: t("up", { usd: money(move) }), notify: false }
    : { mood: big ? "rugged" : "sad", text: t("down", { usd: money(move) }), notify: false });
  return { seen: { lastAt, profit }, reactions };
}

export interface PriceSample { at: number; usd: number }

/** $FLYAI against about an hour ago, at most once per window (the samples restart after a reaction). */
export function readPrice(samples: PriceSample[], usd: number, now: number): { samples: PriceSample[]; reaction: Reaction | null } {
  const kept = [...samples.filter((s) => now - s.at <= 2 * PRICE_WINDOW_MS), { at: now, usd }];
  const old = kept.find((s) => now - s.at >= PRICE_WINDOW_MS);
  if (!old || old.usd <= 0) return { samples: kept, reaction: null };
  const pct = ((usd - old.usd) / old.usd) * 100;
  if (Math.abs(pct) < PRICE_MOVE_PCT) return { samples: kept, reaction: null };
  const big = Math.abs(pct) >= PRICE_BIG_PCT;
  const mood: Mood = pct > 0 ? (big ? "moon" : "happy") : big ? "rugged" : "sad";
  return { samples: [{ at: now, usd }], reaction: { mood, text: t("price", { pct: signedPct(pct) }), notify: big } };
}

export const PET_LINES: Key[] = ["pet1", "pet2", "pet3", "pet4", "pet5", "pet6", "pet7"];
export const FEED_LINES: Key[] = ["feed1", "feed2", "feed3", "feed4"];

/** the share card's picture: how the day went against the money in the flies */
export function dayMood(today: number, value: number): Mood {
  const big = Math.abs(today) >= Math.max(MIN_MOVE_USD, value * BIG_MOVE_SHARE);
  return today >= 0 ? (big ? "moon" : "happy") : big ? "rugged" : "sad";
}

/** where to pace to: a short way either side of the spot the fly was put down, never across the screen */
export function paceTarget(home: number, x: number, random: number, min: number, max: number): number {
  const to = home - PACE_PX + random * 2 * PACE_PX;
  return Math.abs(to - x) < 12 ? x : Math.min(max, Math.max(min, to));
}

/** whole days since the fly moved in */
export const daysTogether = (born: number, now: number) => Math.floor((now - born) / 86_400_000);

export const asleepAt = (hour: number) => hour >= 23 || hour < 7;
