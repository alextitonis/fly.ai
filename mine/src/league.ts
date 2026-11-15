/**
 * The Fly League (2026-11-15, the user: gamify the trading itself; prizes "can be slice of weekly but also xp/badges
 * mainly"). Every funded Fly Wallet (Trader Flies and partner NFTs) plays every week with nothing to sign up for:
 *
 *   week      Monday 00:00 UTC to the next Monday
 *   entry     funded at the week's start with $LEAGUE_MIN_USD+ (the hourly curve reaches back to it); team wallets out
 *   score     the week's profit / its average value over the week (deposits and withdrawals don't move profit, and the
 *             average keeps a mid-week deposit from blowing up the %), minus HALF its worst drop of the week in % of that
 *             average: a steady +5% beats a +6% that went -10% on the way
 *   brackets  by that average: larva < $50 <= buzz < $250 <= swarm, so a $30 wallet can win its own
 *   rewards   (per OWNER, their best fly in each bracket) top 3 of each bracket 300 / 200 / 100 XP, the rest of the top 10%
 *             50 XP, any fly that finished the week up 10 XP (once per owner); each bracket's winner earns the "champion"
 *             badge (#13, claimable on /badges). XP is booked as source 'quest' (refs "league:<week>:<wallet>:..."), no
 *             migration. A $ prize (LEAGUE_PRIZES_USD, e.g. "25,15,10" for 1st-3rd, the same in each bracket) is only
 *             LISTED with the results for the team to screen for wallet rings and pay by hand (memory: campaign sybil
 *             checks); nothing is sent from here.
 *
 *   GET /api/league              this week's live standings (cached 5 min), last week's results, the rules
 *   GET /api/league/week/:date   a closed week's results (date = its Monday, YYYY-MM-DD)
 *
 * Results live in mine.vault_public under "league:<monday>" (and "league:index"), written once when the week closes
 * (the tick after Monday 00:05 UTC). The curves come from the desk's published wallets (vault:<addr>, vault:p_<id>:<addr>,
 * vault:ruyui:<addr>; flytrade/vaults/vpublish.py), hourly for 7 days.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

const HOUR = 3600, DAY = 86_400, WEEK = 7 * DAY;
export const BRACKETS = [{ id: "larva", below: 50 }, { id: "buzz", below: 250 }, { id: "swarm", below: Infinity }] as const;
export type Bracket = (typeof BRACKETS)[number]["id"];
export const LEAGUE_XP = { podium: [300, 200, 100], top10: 50, green: 10 };
export const DROP_WEIGHT = 0.5;

type Pt = { t: number; value: number; profit: number };
export type Entry = { key: string; vault: string; book: string; flies: number[]; holder: string; avg: number; profit: number;
  ret: number; drop: number; score: number; bracket: Bracket };
export type Standing = Entry & { rank: number; place: number | null; xp: number; prize_usd: number };
export type WeekResult = { week: string; start: number; end: number; closed: boolean; at: number;
  brackets: Record<Bracket, Standing[]>; entries: number };

/** a week's Monday 00:00 UTC (seconds) for a time in seconds; 1970-01-01 was a Thursday */
export const mondayOf = (s: number) => Math.floor(s / DAY) * DAY - (((Math.floor(s / DAY) + 3) % 7) * DAY);
export const dayKey = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
export const bracketOf = (avg: number): Bracket => BRACKETS.find((b) => avg < b.below)!.id;

/**
 * One wallet's week from its hourly curve, or null when it wasn't in from the start (or is too small). `open`: its
 * profit and value saved when the week began (close() can't rely on the curve: it keeps 168 hours, so by the time a week
 * closes its first hours may be gone); without one, the curve must reach back to within 3 hours of the start.
 * A point's hour is written all through that hour, so the week ends with the last point before `end`.
 */
export function scoreOf(curve: Pt[], start: number, end: number, minUsd: number, open?: { profit: number; value: number } | null):
  { avg: number; profit: number; ret: number; drop: number; score: number } | null {
  const pts = curve.filter((p) => p.t >= start && p.t < end).sort((a, b) => a.t - b.t);
  if (pts.length < 12) return null;
  const first = open ?? (pts[0].t <= start + 3 * HOUR ? pts[0] : null);
  if (!first || !(first.value >= minUsd)) return null;
  const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length;
  if (!(avg >= minUsd)) return null;
  const profit = pts[pts.length - 1].profit - first.profit;
  let peak = first.profit, drop = 0;
  for (const p of pts) { peak = Math.max(peak, p.profit); drop = Math.max(drop, peak - p.profit); }
  const ret = (profit / avg) * 100, dropPct = (drop / avg) * 100;
  return { avg, profit, ret, drop: dropPct, score: ret - DROP_WEIGHT * dropPct };
}

/** ranks each bracket and hands out places (per owner: their best fly), XP and listed prizes */
export function rank(entries: Entry[], prizes: number[]): Record<Bracket, Standing[]> {
  const out = {} as Record<Bracket, Standing[]>;
  const greenPaid = new Set<string>();
  for (const b of BRACKETS) {
    const rows = entries.filter((e) => e.bracket === b.id).sort((x, y) => y.score - x.score || y.profit - x.profit);
    const owners: string[] = [];
    for (const e of rows) if (!owners.includes(e.holder)) owners.push(e.holder);
    const top10 = Math.max(1, Math.ceil(owners.length * 0.1));
    const placed = new Set<string>();
    out[b.id] = rows.map((e, i) => {
      let place: number | null = null, xp = 0, prize = 0;
      if (!placed.has(e.holder)) {               // the owner's best fly in this bracket
        placed.add(e.holder);
        place = owners.indexOf(e.holder) + 1;
        if (e.score > 0 || e.profit > 0) {       // a podium needs a week that made something
          if (place <= 3) { xp = LEAGUE_XP.podium[place - 1]; prize = prizes[place - 1] ?? 0; }
          else if (place <= top10) xp = LEAGUE_XP.top10;
        }
      }
      if (e.profit > 0 && !greenPaid.has(e.holder)) { greenPaid.add(e.holder); xp += LEAGUE_XP.green; }
      return { ...e, rank: i + 1, place, xp, prize_usd: prize };
    });
  }
  return out;
}

export function createLeague(d: {
  pg: Pg; exclude: string[];
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  on?: boolean;
}) {
  const { pg } = d;
  const env = d.env ?? process.env;
  const now = () => (d.now ?? Date.now)() / 1000;
  const MIN_USD = Number(env.LEAGUE_MIN_USD ?? "10");
  const PRIZES = String(env.LEAGUE_PRIZES_USD ?? "").split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
  const on = d.on !== false && env.LEAGUE_OFF !== "1";
  const exclude = d.exclude.map((w) => w.toLowerCase());

  const pub = async <T>(key: string) => (await pg.one<{ value: T }>("select value from mine.vault_public where key = ?", key))?.value ?? null;
  const put = (key: string, value: unknown) => pg.run(`insert into mine.vault_public (key, value, updated_at) values (?, ?::text::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`, key, JSON.stringify(value));

  /** every published wallet with a holder: its curve (the robinhood, partner and Ruyui books) */
  async function wallets() {
    const rows = await pg.all<{ key: string; holder: string | null; flies: number[] | null; curve: Pt[] | null }>(`select key,
        value->>'holder' as holder, value->'flies' as flies, value->'curve' as curve from mine.vault_public
      where key ~ '^vault:((p_[a-z0-9]+|ruyui):)?0x[0-9a-fA-F]{40}$'`);
    return rows.filter((r) => r.holder && /^0x[0-9a-fA-F]{40}$/.test(r.holder) && BigInt(r.holder) !== 0n && !exclude.includes(r.holder.toLowerCase()))
      .map((r) => {
        const parts = r.key.split(":");
        return { key: r.key, vault: parts[parts.length - 1], book: parts.length === 3 ? parts[1] : "robinhood",
          holder: r.holder!.toLowerCase(), flies: Array.isArray(r.flies) ? r.flies : [], curve: Array.isArray(r.curve) ? r.curve : [] };
      });
  }

  type Opens = Record<string, { profit: number; value: number; holder: string }>;
  /** each wallet's profit and value as the week began, saved once at the first tick of the week */
  async function opened(start: number): Promise<Opens | null> {
    const key = `league:open:${dayKey(start)}`;
    const have = await pub<Opens>(key);
    if (have) return have;
    if (now() > start + 6 * HOUR) return null;               // too late in the week to call this its start
    const out: Opens = {};
    for (const w of await wallets()) {
      const p = [...w.curve].sort((a, b) => a.t - b.t).filter((x) => x.t <= start).pop() ?? [...w.curve].sort((a, b) => a.t - b.t).find((x) => x.t >= start);
      if (p && p.t >= start - 2 * HOUR && p.t <= start + 2 * HOUR) out[w.key] = { profit: p.profit, value: p.value, holder: w.holder };
    }
    await put(key, out);
    return out;
  }

  async function standings(start: number, end: number, closed: boolean): Promise<WeekResult> {
    const entries: Entry[] = [];
    const opens = await opened(start).catch(() => null);
    for (const w of await wallets()) {
      const o = opens ? opens[w.key] : undefined;
      // a snapshot taken: only the wallets in it at the start, with the same owner, play
      if (opens && (!o || o.holder !== w.holder)) continue;
      const s = scoreOf(w.curve, start, end, MIN_USD, o);
      if (s) entries.push({ key: w.key, vault: w.vault, book: w.book, flies: w.flies, holder: w.holder, ...s, bracket: bracketOf(s.avg) });
    }
    const round = (e: Standing): Standing => ({ ...e, avg: +e.avg.toFixed(2), profit: +e.profit.toFixed(2), ret: +e.ret.toFixed(2),
      drop: +e.drop.toFixed(2), score: +e.score.toFixed(2) });
    const ranked = rank(entries, PRIZES);
    for (const b of BRACKETS) ranked[b.id] = ranked[b.id].map(round);
    return { week: dayKey(start), start, end, closed, at: now(), brackets: ranked, entries: entries.length };
  }

  let live: { at: number; v: WeekResult } | null = null;
  async function current() {
    const t = now();
    if (!live || t - live.at > 300) {
      const start = mondayOf(t);
      live = { at: t, v: await standings(start, t, false) };
    }
    return live.v;
  }

  /** closes last week once: its results, the XP, the champion badges, a note to each podium owner */
  async function close() {
    const start = mondayOf(now()) - WEEK, key = `league:${dayKey(start)}`;
    if (now() < start + WEEK + 300) return null;             // 5 minutes past Monday 00:00: the desk's last hour is in
    if (await pub(key)) return null;
    const r = await standings(start, start + WEEK, true);
    for (const b of BRACKETS) {
      for (const s of r.brackets[b.id]) {
        if (s.xp > 0) {
          await pg.run(`insert into mine.xp_events (wallet, source, ref, xp, at) values (?, 'quest', ?, ?, now()) on conflict (ref) do nothing`,
            s.holder, `league:${r.week}:${s.holder}:${b.id}:${s.place ?? "green"}`, s.xp);
        }
        if (s.place === 1 && s.xp > 0) {
          await pg.run("insert into mine.badge_earned (wallet, badge, earned_at) values (?, 'champion', now()) on conflict do nothing", s.holder).catch(() => null);
        }
        if (s.place != null && s.place <= 3 && s.xp > 0) {
          await pg.run("insert into mine.notices (wallet, text, href) values (?, ?, ?)", s.holder,
            `Fly League: #${s.place} in ${b.id} this week, +${s.xp} XP${s.place === 1 ? " and the Champion badge" : ""}.`,
            `/traderflies/leaderboard?board=league`).catch(() => null);
        }
      }
    }
    await put(key, r);
    const idx = (await pub<{ weeks: string[] }>("league:index")) ?? { weeks: [] };
    await put("league:index", { weeks: [r.week, ...idx.weeks.filter((w) => w !== r.week)].slice(0, 52) });
    return r;
  }

  const rules = () => ({ min_usd: MIN_USD, brackets: BRACKETS.map((b) => ({ id: b.id, below: Number.isFinite(b.below) ? b.below : null })),
    xp: LEAGUE_XP, drop_weight: DROP_WEIGHT, prizes_usd: PRIZES });

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET" || !url.pathname.startsWith("/api/league")) return false;
    if (!on) return d.send(res, 200, { on: false }), true;
    if (url.pathname === "/api/league") {
      const idx = (await pub<{ weeks: string[] }>("league:index")) ?? { weeks: [] };
      const last = idx.weeks[0] ? await pub<WeekResult>(`league:${idx.weeks[0]}`) : null;
      return d.send(res, 200, { on: true, now: await current(), last, weeks: idx.weeks, rules: rules() }), true;
    }
    const m = /^\/api\/league\/week\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
    if (m) {
      const w = await pub<WeekResult>(`league:${m[1]}`);
      if (!w) throw new d.HttpError(404, "no such week");
      return d.send(res, 200, w), true;
    }
    return false;
  }

  function start(everyMs = 600_000) {
    if (!on) return;
    const go = () => opened(mondayOf(now())).then(() => close())
      .catch((e) => console.error("league close:", e instanceof Error ? e.message : e));
    setTimeout(go, 30_000);
    setInterval(go, everyMs);
  }

  return { route, start, close, current, standings };
}
