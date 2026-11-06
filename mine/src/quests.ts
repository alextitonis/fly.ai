/**
 * Daily check-in and quests (2026-11-06, flytrade/GAMIFY-PLAN.md "Quests plan"; the user: "Yes, defaults", "Build
 * quests"). Small XP for coming back each day, booked into mine.xp_events so it counts like any other XP (xp.ts).
 *
 *   check-in     2 XP once a UTC day (a tap); days in a row make a streak: +10 at 7, +20 at 14, +50 at 30 and every
 *                30 after. One streak freeze per 7 days in a row, at most 2 kept: a missed day uses one instead of
 *                breaking the streak; with none left the streak starts again.
 *   quests       3 a day, one from each group, the same on every device (wallet + day are the seed); 2 XP each,
 *                +4 when all 3 are done. One reroll a day swaps one not-yet-done quest for the next in its group.
 *                visit:  fly (a fly's popup), squads (the Squads board), xp (the XP page): reported by the page
 *                social: flybook (a like, comment, poke or caption), flychat (a message to your fly), rate (an ERC-8004 rating)
 *                move:   topup (a $10+ fly-wallet deposit), swap (a swap-box buy), claimstake, market (a market trade)
 *                The social and move ones are found in data the server already has, on a read of today and each tick.
 *   who          signed-in wallets holding 10,000+ $FLYAI (wallet, staked or locked, as xp_holders has it) or owning
 *                a Trader Fly. Nothing after the season ends. Not raised by 2x windows or the no-sell streak.
 *   bell         a note on streak milestones only.
 *
 *   GET  /api/xp/today                  (session) the check-in, streak, freezes and today's 3 quests
 *   POST /api/xp/checkin                (session) today's check-in
 *   POST /api/xp/quest/visit { quest }  (session) a visit quest done on the page
 *   POST /api/xp/quest/reroll { group } (session) today's one reroll
 *   GET  /api/xp/streaks                the longest check-in streaks going now (top 50, team off), public
 *
 * Table mine.xp_checkins (flybook/supabase/migrations/20261106140000_mine_xp_quests.sql).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Arg, Pg } from "./pg.ts";

const DAY_MS = 86_400_000;
export const QUEST_RATES = { checkin: 2, quest: 2, allDone: 4, milestones: { 7: 10, 14: 20, 30: 50 } as Record<number, number>,
  every30: 50, freezeEvery: 7, freezeMax: 2, minHold: 10_000n * 10n ** 18n, topupUsd: 10 };
export const GROUPS = ["visit", "social", "move"] as const;
export type Group = (typeof GROUPS)[number];
export const QUESTS: Record<Group, string[]> = {
  visit: ["fly", "squads", "xp"],
  social: ["flybook", "flychat", "rate"],
  move: ["topup", "swap", "claimstake", "market"],
};
export const groupOf = (q: string): Group | null => GROUPS.find((g) => QUESTS[g].includes(q)) ?? null;

/** "2026-11-06" for a time in ms (UTC) */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** FNV-1a of a string, for the seed */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** a wallet's 3 quests on a day: one per group by the seed; the rerolled group takes the next quest in it */
export function pick(wallet: string, day: string, reroll: Group | null = null): string[] {
  return GROUPS.map((g, i) => {
    const list = QUESTS[g];
    const n = (hash(`${wallet.toLowerCase()}:${day}:${i}`) + (reroll === g ? 1 : 0)) % list.length;
    return list[n];
  });
}

export type Streak = { days: number; best: number; freezes: number; last: string | null };
/**
 * Checking in on `day`: the streak goes on (+1), uses freezes for missed days, or starts again at 1. Each 7th day in a
 * row earns a freeze (at most 2 kept). The bonus is the milestone's, if this day is one.
 */
export function checkIn(s: Streak, day: string): { next: Streak; bonus: number; used: number; already: boolean } {
  if (s.last === day) return { next: s, bonus: 0, used: 0, already: true };
  const gap = s.last ? Math.round((dayMs(day) - dayMs(s.last)) / DAY_MS) : Infinity;
  let days = 1, freezes = s.freezes, used = 0;
  if (gap === 1) days = s.days + 1;
  else if (Number.isFinite(gap) && gap > 1 && freezes >= gap - 1) { used = gap - 1; freezes -= used; days = s.days + 1; }
  else freezes = Number.isFinite(gap) && gap > 1 ? 0 : freezes;   // missed with too few freezes: they're spent, the streak restarts
  if (days % QUEST_RATES.freezeEvery === 0) freezes = Math.min(QUEST_RATES.freezeMax, freezes + 1);
  const bonus = QUEST_RATES.milestones[days] ?? (days > 30 && days % 30 === 0 ? QUEST_RATES.every30 : 0);
  return { next: { days, best: Math.max(s.best, days), freezes, last: day }, bonus, used, already: false };
}
/** the streak as it stands today: one that can't go on any more (too many missed days for its freezes) shows 0 */
export function standing(s: Streak, day: string): Streak {
  if (!s.last || s.last === day) return s;
  const missed = Math.round((dayMs(day) - dayMs(s.last)) / DAY_MS) - 1;
  return missed > s.freezes ? { ...s, days: 0 } : s;
}

type Row = { wallet: string; days: number; best: number; freezes: number; last_day: string | null; reroll_day: string | null; reroll: string | null };
export type Today = {
  on: boolean; day: string; resets_at: string; eligible: boolean; need_flyai: number; ended: boolean;
  checked_in: boolean; streak: { days: number; best: number; freezes: number };
  quests: { id: string; group: Group; done: boolean; xp: number }[]; all_done: boolean; reroll_used: boolean;
  rates: { checkin: number; quest: number; all: number; milestones: Record<number, number> };
};

export function createQuests(d: {
  pg: Pg; end: number; exclude: string[];
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  now?: () => number;
  on?: boolean;
}) {
  const { pg, HttpError } = d;
  const now = d.now ?? Date.now;
  const on = d.on !== false;
  const ended = () => now() >= d.end;

  const rowOf = async (wallet: string): Promise<Row> =>
    (await pg.one<Row>(`select wallet, days, best, freezes, to_char(last_day, 'YYYY-MM-DD') as last_day,
      to_char(reroll_day, 'YYYY-MM-DD') as reroll_day, reroll from mine.xp_checkins where wallet = ?`, wallet))
    ?? { wallet, days: 0, best: 0, freezes: 0, last_day: null, reroll_day: null, reroll: null };
  const streakOf = (r: Row): Streak => ({ days: r.days, best: r.best, freezes: r.freezes, last: r.last_day });

  /** 10k $FLYAI held (wallet, staked or locked) or a Trader Fly, as the XP scan last saw it */
  async function eligible(wallet: string) {
    const h = await pg.one<{ held: string; flies: number }>("select (liquid + staked + locked)::text as held, flies from mine.xp_holders where wallet = ?", wallet);
    return !!h && (h.flies > 0 || BigInt(h.held.split(".")[0]) >= QUEST_RATES.minHold);
  }

  /** each social and move quest: has the wallet done it today (UTC)? Missing tables (tests, no Flybook) say no */
  async function doneToday(wallet: string, quest: string, day: string): Promise<boolean> {
    const from = `${day}T00:00:00Z`, to = new Date(dayMs(day) + DAY_MS).toISOString();
    const yes = (sql: string, ...args: Arg[]) => pg.one(sql, ...args).then((r) => !!r).catch(() => false);
    switch (quest) {
      case "flybook":
        return yes(`select 1 from public.profiles p where lower(p.wallet) = ? and exists (
            select 1 from public.likes where user_id = p.id and not auto and created_at >= ? and created_at < ?
            union all select 1 from public.comments where user_id = p.id and created_at >= ? and created_at < ?
            union all select 1 from public.pokes where user_id = p.id and created_at >= ? and created_at < ?
            union all select 1 from public.captions where author = p.id and created_at >= ? and created_at < ?)`,
          wallet, from, to, from, to, from, to, from, to);
      case "flychat":
        return yes("select 1 from mine.fly_chat where wallet = ? and role = 'user' and at >= ? and at < ? limit 1", wallet, from, to);
      case "rate":
        return yes(`select 1 from mine.vault_public v, jsonb_array_elements(v.value->'ratings') r where v.key = 'agent_ratings'
          and lower(r->>'client') = ? and (r->>'at')::float8 >= ? and (r->>'at')::float8 < ? limit 1`, wallet, dayMs(day), dayMs(day) + DAY_MS);
      case "topup":
        return yes(`select 1 from mine.vault_moves where kind = 'deposit' and lower(holder) = ? and usd >= ? and at >= ? and at < ? limit 1`,
          wallet, QUEST_RATES.topupUsd, from, to);
      case "swap": case "claimstake": case "market":
        return yes("select 1 from mine.xp_events where wallet = ? and source = ? and at >= ? and at < ? limit 1",
          wallet, quest === "swap" ? "buy" : quest, from, to);
      default:
        return false;   // visit quests are booked when the page reports them
    }
  }

  const book = (wallet: string, source: "checkin" | "quest", ref: string, xp: number) =>
    pg.one<{ id: number }>(`insert into mine.xp_events (wallet, source, ref, xp, at) values (?, ?, ?, ?, ?)
      on conflict (ref) do nothing returning id`, wallet, source, ref, xp, new Date(now()).toISOString()).then((r) => !!r);

  /** books every quest of today that is done and not booked yet, then the all-3 bonus */
  async function settle(wallet: string, day: string, quests: string[]) {
    if (ended() || !(await eligible(wallet))) return;
    const booked = new Set((await pg.all<{ ref: string }>("select ref from mine.xp_events where wallet = ? and source = 'quest' and ref like ?",
      wallet, `quest:${wallet}:${day}:%`)).map((r) => r.ref));
    for (const q of quests) {
      const ref = `quest:${wallet}:${day}:${q}`;
      if (!booked.has(ref) && groupOf(q) !== "visit" && await doneToday(wallet, q, day) && await book(wallet, "quest", ref, QUEST_RATES.quest)) booked.add(ref);
    }
    if (quests.every((q) => booked.has(`quest:${wallet}:${day}:${q}`))) await book(wallet, "quest", `quest:${wallet}:${day}:all`, QUEST_RATES.allDone);
  }

  async function today(wallet: string): Promise<Today> {
    const day = dayOf(now());
    const r = await rowOf(wallet);
    const reroll = r.reroll_day === day ? (r.reroll as Group | null) : null;
    const quests = pick(wallet, day, reroll);
    const ok = on && await eligible(wallet);
    if (ok) {
      await settle(wallet, day, quests);
      await pg.run(`insert into mine.xp_checkins (wallet, seen_day) values (?, ?) on conflict (wallet) do update set seen_day = excluded.seen_day`, wallet, day);
    }
    const refs = new Set((await pg.all<{ ref: string }>("select ref from mine.xp_events where wallet = ? and ref like ?",
      wallet, `%:${wallet}:${day}%`)).map((x) => x.ref));
    const s = standing(streakOf(r), day);
    return {
      on, day, resets_at: new Date(dayMs(day) + DAY_MS).toISOString(), eligible: ok, need_flyai: 10_000, ended: ended(),
      checked_in: r.last_day === day, streak: { days: s.days, best: s.best, freezes: s.freezes },
      quests: quests.map((id) => ({ id, group: groupOf(id)!, done: refs.has(`quest:${wallet}:${day}:${id}`), xp: QUEST_RATES.quest })),
      all_done: refs.has(`quest:${wallet}:${day}:all`), reroll_used: !!reroll,
      rates: { checkin: QUEST_RATES.checkin, quest: QUEST_RATES.quest, all: QUEST_RATES.allDone, milestones: QUEST_RATES.milestones },
    };
  }

  async function checkin(wallet: string) {
    if (!on || ended()) throw new HttpError(409, "the season is over");
    if (!(await eligible(wallet))) throw new HttpError(403, "hold 10,000 $FLYAI or a Trader Fly to check in");
    const day = dayOf(now());
    const out = await pg.tx(async (q) => {
      const r = (await q.one<Row>(`select wallet, days, best, freezes, to_char(last_day, 'YYYY-MM-DD') as last_day from mine.xp_checkins
        where wallet = ? for update`, wallet)) ?? { wallet, days: 0, best: 0, freezes: 0, last_day: null, reroll_day: null, reroll: null };
      const c = checkIn(streakOf(r), day);
      if (c.already) return { ...c, gained: 0 };
      await q.run(`insert into mine.xp_checkins (wallet, days, best, freezes, last_day) values (?, ?, ?, ?, ?)
        on conflict (wallet) do update set days = excluded.days, best = excluded.best, freezes = excluded.freezes, last_day = excluded.last_day`,
        wallet, c.next.days, c.next.best, c.next.freezes, day);
      const at = new Date(now()).toISOString();
      await q.run("insert into mine.xp_events (wallet, source, ref, xp, at) values (?, 'checkin', ?, ?, ?) on conflict (ref) do nothing",
        wallet, `checkin:${wallet}:${day}`, QUEST_RATES.checkin, at);
      if (c.bonus) {
        await q.run("insert into mine.xp_events (wallet, source, ref, xp, at) values (?, 'checkin', ?, ?, ?) on conflict (ref) do nothing",
          wallet, `streak:${wallet}:${day}:${c.next.days}`, c.bonus, at);
        if (!d.exclude.includes(wallet)) await q.run("insert into mine.notices (wallet, text, href) values (?, ?, ?)", wallet,
          `You checked in ${c.next.days} days in a row: +${c.bonus} XP.`, "/xp#quests").catch(() => {});
      }
      return { ...c, gained: QUEST_RATES.checkin + c.bonus };
    }, "quests");
    return { gained: out.gained, bonus: out.bonus, freezes_used: out.used, today: await today(wallet) };
  }

  async function visit(wallet: string, quest: string) {
    if (groupOf(quest) !== "visit") throw new HttpError(400, "not a visit quest");
    const t = await today(wallet);
    if (!t.eligible || t.ended) return { gained: 0, today: t };
    if (!t.quests.some((q) => q.id === quest)) return { gained: 0, today: t };   // not one of today's: nothing, no error
    const day = t.day;
    const got = await book(wallet, "quest", `quest:${wallet}:${day}:${quest}`, QUEST_RATES.quest);
    const after = await today(wallet);   // settles the all-3 bonus too
    return { gained: (got ? QUEST_RATES.quest : 0) + (after.all_done && !t.all_done ? QUEST_RATES.allDone : 0), today: after };
  }

  async function reroll(wallet: string, group: string) {
    if (!GROUPS.includes(group as Group)) throw new HttpError(400, "group is visit, social or move");
    const t = await today(wallet);
    if (t.reroll_used) throw new HttpError(409, "today's reroll is used");
    const q = t.quests.find((x) => x.group === group)!;
    if (q.done) throw new HttpError(409, "that quest is done already");
    await pg.run(`insert into mine.xp_checkins (wallet, reroll_day, reroll) values (?, ?, ?)
      on conflict (wallet) do update set reroll_day = excluded.reroll_day, reroll = excluded.reroll`, wallet, t.day, group);
    return { today: await today(wallet) };
  }

  /** each tick: today's quests for the wallets that looked at them today, so a quest done later still books */
  async function tick() {
    if (!on || ended()) return;
    const day = dayOf(now());
    const rows = await pg.all<Row>(`select wallet, to_char(reroll_day, 'YYYY-MM-DD') as reroll_day, reroll from mine.xp_checkins
      where seen_day = ?`, day);
    for (const r of rows) {
      try { await settle(r.wallet, day, pick(r.wallet, day, r.reroll_day === day ? (r.reroll as Group | null) : null)); }
      catch (err) { console.error(`quests ${r.wallet}: ${err instanceof Error ? err.message : err}`); }
    }
  }

  /** the longest streaks still going (a streak whose missed days its freezes can't cover shows 0 and drops off) */
  let board: { at: number; value: unknown } | null = null;
  async function streaks() {
    if (board && now() - board.at < 60_000) return board.value;
    const day = dayOf(now());
    const rows = await pg.all<Row>(`select wallet, days, best, freezes, to_char(last_day, 'YYYY-MM-DD') as last_day from mine.xp_checkins
      where days > 0 order by days desc limit 300`);
    const list = rows.filter((r) => !d.exclude.includes(r.wallet)).map((r) => ({ wallet: r.wallet, ...standing(streakOf(r), day) }))
      .filter((r) => r.days > 0).sort((a, b) => b.days - a.days || b.best - a.best).slice(0, 50)
      .map((r, i) => ({ rank: i + 1, wallet: r.wallet, days: r.days, best: r.best }));
    board = { at: now(), value: { day, rows: list } };
    return board.value;
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/xp/streaks") return d.send(res, 200, await streaks()), true;
    if (!p.startsWith("/api/xp/today") && !p.startsWith("/api/xp/checkin") && !p.startsWith("/api/xp/quest/")) return false;
    const wallet = (await d.sessionWallet(req)).toLowerCase();
    if (req.method === "GET" && p === "/api/xp/today") return d.send(res, 200, await today(wallet)), true;
    if (req.method === "POST" && p === "/api/xp/checkin") return d.send(res, 200, await checkin(wallet)), true;
    if (req.method === "POST" && p === "/api/xp/quest/visit") return d.send(res, 200, await visit(wallet, String((await d.readJson(req))?.quest ?? ""))), true;
    if (req.method === "POST" && p === "/api/xp/quest/reroll") return d.send(res, 200, await reroll(wallet, String((await d.readJson(req))?.group ?? ""))), true;
    return false;
  }

  function start(everyMs = Number(process.env.QUESTS_TICK_MS ?? 600_000)) {
    if (!on) return;
    setInterval(() => void tick().catch((err) => console.error(`quests: ${err instanceof Error ? err.message : err}`)), everyMs).unref();
  }

  return { route, start, tick, today, checkin, visit, reroll, settle, streaks };
}
