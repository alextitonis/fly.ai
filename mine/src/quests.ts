/**
 * Daily check-in and quests (2026-11-06, flytrade/GAMIFY-PLAN.md "Quests plan"; the user: "Yes, defaults", "Build
 * quests"). Small XP for coming back each day, booked into mine.xp_events so it counts like any other XP (xp.ts).
 *
 *   check-in     2 XP once a UTC day (a tap); days in a row make a streak: +10 at 7, +20 at 14, +50 at 30 and every
 *                30 after. One streak freeze per 7 days in a row, at most 2 kept: a missed day uses one instead of
 *                breaking the streak; with none left the streak starts again.
 *   quests       3 a day, one from each group, the same on every device (wallet + day are the seed); 2 XP each,
 *                +4 when all 3 are done. One reroll a day swaps one not-yet-done quest for the next in its group.
 *                A quest swapped away still counts if it gets done that day (2026-11-06: a player topped up, the deposit
 *                wasn't booked yet, and the ↻ looked like "refresh"): it comes back done; one quest per group pays.
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
 *
 * 2026-11-07 (the user, 11-06: "make a meme or something funny ... more things and option to reroll quests with burning
 * $flyai (either completed or not to get new even if you did so you can do more)"; "burn use the normal pons burn
 * function"):
 *   more quests  visit + leaderboard, desk; social + xpost (a post on X about fly.ai - a meme, a clip - from the wallet's
 *                connected X account, posted today; the link is pasted and read on fxtwitter); move + feed (feeding the Fly
 *                Desk). From 2026-11-07 (QUESTS_FROM): the day before keeps its lists, so nobody's quest changes mid-day.
 *   paid rerolls the wallet calls $FLYAI's burn(QUEST_RATES.rerollBurn) and posts the transaction: that group gets a new
 *                quest even if its quest is done, and it pays again. At most QUEST_RATES.paidMax a day per wallet (the XP
 *                drop stays a game, not a price list). A paid slot only counts what is done after its burn (paying
 *                for a quest done earlier that day is not a quest); each burn transaction counts once.
 *   POST /api/xp/quest/buy-reroll { group, tx }   POST /api/xp/quest/xpost { url }
 *   Tables mine.xp_quest_buys, mine.xp_quest_posts (20261107120000_mine_xp_quest_buys.sql).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Arg, Pg } from "./pg.ts";
import { burnedBy, FLYAI, type Receipt } from "./burns.ts";

const DAY_MS = 86_400_000;
export const QUEST_RATES = { checkin: 2, quest: 2, allDone: 4, milestones: { 7: 10, 14: 20, 30: 50 } as Record<number, number>,
  every30: 50, freezeEvery: 7, freezeMax: 2, minHold: 10_000n * 10n ** 18n, topupUsd: 10,
  rerollBurn: 20_000, paidMax: 5 };
export const GROUPS = ["visit", "social", "move"] as const;
export type Group = (typeof GROUPS)[number];
/** the lists before QUESTS_FROM (each day's picks stay as they were) */
export const QUESTS_V1: Record<Group, string[]> = {
  visit: ["fly", "squads", "xp"],
  social: ["flybook", "flychat", "rate"],
  move: ["topup", "swap", "claimstake", "market"],
};
export const QUESTS: Record<Group, string[]> = {
  visit: ["fly", "squads", "xp", "leaderboard", "desk"],
  social: ["flybook", "flychat", "rate", "xpost"],
  move: ["topup", "swap", "claimstake", "market", "feed"],
};
export const QUESTS_FROM = "2026-11-07";
export const listsOf = (day: string) => (day < QUESTS_FROM ? QUESTS_V1 : QUESTS);
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
  return GROUPS.map((g) => questAt(wallet, day, g, reroll, 0));
}
/** a group's quest in slot `slot` (0 = the day's; 1.. = after each paid reroll): the next ones in the group's list */
export function questAt(wallet: string, day: string, g: Group, reroll: Group | null, slot: number): string {
  const list = listsOf(day)[g];
  const n = (hash(`${wallet.toLowerCase()}:${day}:${GROUPS.indexOf(g)}`) + (reroll === g ? 1 : 0) + slot) % list.length;
  return list[n];
}
/** an X post's id from its link (x.com or twitter.com, any user path) */
export const postIdOf = (url: string) => /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d{5,25})/.exec(url.trim())?.[1] ?? null;
/** does the post's text talk about fly.ai? */
export const aboutFly = (text: string) => /@flydotai|\$flyai|fly\.ai|flyaiworld/i.test(text);

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
  quests: { id: string; group: Group; done: boolean; xp: number; slot: number }[]; all_done: boolean; reroll_used: boolean;
  paid: { burn_flyai: number; max: number; used: number; token: string; burn_fn: "burn" };
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
  rpc?: string;
  receipt?: (tx: string) => Promise<Receipt>;
  fetchJson?: (url: string) => Promise<any>;
}) {
  const { pg, HttpError } = d;
  const receipt = d.receipt ?? (async (tx: string) => {
    const r = await fetch(d.rpc ?? "https://rpc.mainnet.chain.robinhood.com", { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }) });
    return ((await r.json()) as { result?: Receipt }).result ?? null;
  });
  const fetchJson = d.fetchJson ?? (async (url: string) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "fly.ai quests" } });
    if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, r.status === 404 ? "that post wasn't found (deleted or private?)" : "X can't be read right now: try again in a minute");
    return r.json();
  });
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
  async function doneToday(wallet: string, quest: string, day: string, since?: string, until?: string): Promise<boolean> {
    const from = since ?? `${day}T00:00:00Z`, to = until ?? new Date(dayMs(day) + DAY_MS).toISOString();
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
      case "swap":   // a box buy the XP scan booked, or the box's own success log for this wallet today (its Relay and GIGA
        // routes carry no fee leg the scan can see; xp.ts boxBuys books those from now on, this covers the scan's lag)
        return (await yes("select 1 from mine.xp_events where wallet = ? and source = 'buy' and at >= ? and at < ? limit 1", wallet, from, to))
          || yes("select 1 from mine.swap_events where wallet = ? and step = 'success' and at >= ? and at < ? limit 1", wallet, from, to);
      case "claimstake": case "market": case "feed":
        return yes("select 1 from mine.xp_events where wallet = ? and source = ? and at >= ? and at < ? limit 1",
          wallet, quest, from, to);
      case "xpost":       // the post's own time, so a post made before a paid reroll doesn't count for it
        return yes("select 1 from mine.xp_quest_posts where wallet = ? and posted_at >= ? and posted_at < ? limit 1", wallet, from, to);
      default:
        return false;   // visit quests are booked when the page reports them
    }
  }

  const book = (wallet: string, source: "checkin" | "quest", ref: string, xp: number) =>
    pg.one<{ id: number }>(`insert into mine.xp_events (wallet, source, ref, xp, at) values (?, ?, ?, ?, ?)
      on conflict (ref) do nothing returning id`, wallet, source, ref, xp, new Date(now()).toISOString()).then((r) => !!r);

  /** each group's quests for the day: the one shown, and after a swap the one it replaced (still counts if done) */
  const choicesOf = (wallet: string, day: string, reroll: Group | null) => {
    const base = pick(wallet, day), cur = pick(wallet, day, reroll);
    return GROUPS.map((g, i) => (reroll === g && base[i] !== cur[i] ? [cur[i], base[i]] : [cur[i]]));
  };
  const bookedRefs = async (wallet: string, day: string) => new Set((await pg.all<{ ref: string }>(
    "select ref from mine.xp_events where wallet = ? and source = 'quest' and ref like ?", wallet, `quest:${wallet}:${day}:%`)).map((r) => r.ref));
  const refOf = (wallet: string, day: string, q: string) => `quest:${wallet}:${day}:${q}`;

  /** books each group's quest once it is done (one per group), then the all-3 bonus */
  async function settle(wallet: string, day: string, reroll: Group | null) {
    if (ended() || !(await eligible(wallet))) return;
    const booked = await bookedRefs(wallet, day);
    const groups = choicesOf(wallet, day, reroll);
    for (const choices of groups) {
      if (choices.some((q) => booked.has(refOf(wallet, day, q)))) continue;   // this group already paid
      for (const q of choices) {
        if (groupOf(q) === "visit" || !(await doneToday(wallet, q, day))) continue;
        if (await book(wallet, "quest", refOf(wallet, day, q), QUEST_RATES.quest)) booked.add(refOf(wallet, day, q));
        break;
      }
    }
    if (groups.every((choices) => choices.some((q) => booked.has(refOf(wallet, day, q))))) {
      await book(wallet, "quest", `quest:${wallet}:${day}:all`, QUEST_RATES.allDone);
    }
    // the paid slots: each one's quest, done between its burn and the next burn in that group (or the day's end)
    const buys = await buysOf(wallet, day);
    for (const g of GROUPS) {
      const mine = buys.filter((b) => b.grp === g);
      for (let j = 0; j < mine.length; j++) {
        const q = questAt(wallet, day, g, reroll, j + 1), ref = paidRef(wallet, day, q, j + 1);
        if (booked.has(ref) || groupOf(q) === "visit") continue;
        if (await doneToday(wallet, q, day, mine[j].at, mine[j + 1]?.at)) {
          if (await book(wallet, "quest", ref, QUEST_RATES.quest)) booked.add(ref);
        }
      }
    }
  }
  const paidRef = (wallet: string, day: string, q: string, slot: number) => `quest:${wallet}:${day}:${q}:p${slot}`;
  const buysOf = (wallet: string, day: string) => pg.all<{ grp: Group; at: string }>(
    `select grp, to_char(at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at from mine.xp_quest_buys
     where wallet = ? and day = ? order by at, tx`, wallet, day).catch(() => [] as { grp: Group; at: string }[]);

  async function today(wallet: string): Promise<Today> {
    const day = dayOf(now());
    const r = await rowOf(wallet);
    const reroll = r.reroll_day === day ? (r.reroll as Group | null) : null;
    const ok = on && await eligible(wallet);
    if (ok) {
      await settle(wallet, day, reroll);
      await pg.run(`insert into mine.xp_checkins (wallet, seen_day) values (?, ?) on conflict (wallet) do update set seen_day = excluded.seen_day`, wallet, day);
    }
    const refs = new Set((await pg.all<{ ref: string }>("select ref from mine.xp_events where wallet = ? and ref like ?",
      wallet, `%:${wallet}:${day}%`)).map((x) => x.ref));
    // each group shows the quest that paid, or else the one in play; after a paid reroll, that slot's quest
    const buys = await buysOf(wallet, day);
    const slots = GROUPS.map((g) => buys.filter((b) => b.grp === g).length);
    const quests = choicesOf(wallet, day, reroll).map((choices, i) => slots[i] > 0 ? questAt(wallet, day, GROUPS[i], reroll, slots[i])
      : choices.find((q) => refs.has(refOf(wallet, day, q))) ?? choices[0]);
    const s = standing(streakOf(r), day);
    return {
      on, day, resets_at: new Date(dayMs(day) + DAY_MS).toISOString(), eligible: ok, need_flyai: 10_000, ended: ended(),
      checked_in: r.last_day === day, streak: { days: s.days, best: s.best, freezes: s.freezes },
      quests: quests.map((id, i) => ({ id, group: GROUPS[i], slot: slots[i], xp: QUEST_RATES.quest,
        done: refs.has(slots[i] > 0 ? paidRef(wallet, day, id, slots[i]) : `quest:${wallet}:${day}:${id}`) })),
      all_done: refs.has(`quest:${wallet}:${day}:all`), reroll_used: !!reroll,
      paid: { burn_flyai: QUEST_RATES.rerollBurn, max: QUEST_RATES.paidMax, used: buys.length, token: FLYAI, burn_fn: "burn" },
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
    const day = t.day;
    const r = await rowOf(wallet);
    const choices = choicesOf(wallet, day, r.reroll_day === day ? (r.reroll as Group | null) : null)[GROUPS.indexOf("visit")];
    const vq = t.quests.find((x) => x.group === "visit")!;
    if (vq.slot > 0) {                                               // a paid slot: its own quest, after its burn
      if (vq.id !== quest || vq.done) return { gained: 0, today: t };
      const got = await book(wallet, "quest", paidRef(wallet, day, quest, vq.slot), QUEST_RATES.quest);
      return { gained: got ? QUEST_RATES.quest : 0, today: await today(wallet) };
    }
    if (!choices.includes(quest)) return { gained: 0, today: t };   // not one of today's: nothing, no error
    const booked = await bookedRefs(wallet, day);
    if (choices.some((q) => booked.has(refOf(wallet, day, q)))) return { gained: 0, today: t };   // the visit group already paid
    const got = await book(wallet, "quest", refOf(wallet, day, quest), QUEST_RATES.quest);
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

  /** a paid reroll: the wallet burned rerollBurn $FLYAI (burn()) in `tx`; that group moves to its next quest, done or not */
  async function buyReroll(wallet: string, group: string, tx: string) {
    if (!GROUPS.includes(group as Group)) throw new HttpError(400, "group is visit, social or move");
    if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new HttpError(400, "the burn transaction, please");
    if (!on || ended()) throw new HttpError(409, "the season is over");
    if (!(await eligible(wallet))) throw new HttpError(403, "hold 10,000 $FLYAI or a Trader Fly to do quests");
    const t = await today(wallet);                                   // books what's done first: a reroll never loses a quest
    if (t.paid.used >= QUEST_RATES.paidMax) throw new HttpError(409, `${QUEST_RATES.paidMax} paid rerolls a day at most: more tomorrow`);
    if (await pg.one("select 1 from mine.xp_quest_buys where tx = ?", tx)) throw new HttpError(409, "that burn was used already");
    const rec = await receipt(tx);
    if (!rec) throw new HttpError(409, "that transaction isn't mined yet: try again in a moment");
    if (rec.status !== "0x1") throw new HttpError(400, "that transaction failed on chain");
    if (burnedBy(rec, wallet) < BigInt(QUEST_RATES.rerollBurn) * 10n ** 18n) {
      throw new HttpError(400, `no burn of ${QUEST_RATES.rerollBurn.toLocaleString("en-US")} $FLYAI from your wallet in that transaction`);
    }
    const ok = await pg.run(`insert into mine.xp_quest_buys (tx, wallet, day, grp, burned_wei, at) values (?, ?, ?, ?, ?, ?)
      on conflict (tx) do nothing`, tx, wallet, t.day, group, burnedBy(rec, wallet).toString(), new Date(now()).toISOString());
    if (ok !== 1) throw new HttpError(409, "that burn was used already");
    return { today: await today(wallet) };
  }

  /** the "post about fly.ai on X" quest: the pasted post, read on fxtwitter - from the wallet's connected X, about fly.ai,
   *  posted today (UTC); each post counts once */
  async function xpost(wallet: string, url: string) {
    const id = postIdOf(url);
    if (!id) throw new HttpError(400, "paste the link to your post on X");
    if (!(await eligible(wallet))) throw new HttpError(403, "hold 10,000 $FLYAI or a Trader Fly to do quests");
    const link = await pg.one<{ username: string }>("select username from mine.x_links where wallet = ?", wallet).catch(() => null);
    if (!link?.username) throw new HttpError(409, "connect your X account first (profile page), so we know the post is yours");
    if (await pg.one("select 1 from mine.xp_quest_posts where post_id = ?", id)) throw new HttpError(409, "that post was counted already");
    const got = await fetchJson(`https://api.fxtwitter.com/status/${id}`);
    const tw = got?.tweet;
    if (!tw) throw new HttpError(404, "that post wasn't found (deleted or private?)");
    if (String(tw.author?.screen_name ?? "").toLowerCase() !== link.username.toLowerCase()) {
      throw new HttpError(403, `that post is by @${tw.author?.screen_name}, not your connected X (@${link.username})`);
    }
    const postedMs = Number(tw.created_timestamp ?? 0) * 1000;
    const day = dayOf(now());
    if (dayOf(postedMs) !== day) throw new HttpError(409, "the post has to be from today (UTC)");
    if (!aboutFly(String(tw.text ?? ""))) throw new HttpError(400, "the post has to mention @flydotai or $FLYAI");
    await pg.run(`insert into mine.xp_quest_posts (post_id, wallet, day, posted_at) values (?, ?, ?, ?) on conflict (post_id) do nothing`,
      id, wallet, day, new Date(postedMs).toISOString());
    return { today: await today(wallet) };
  }

  /** each tick: today's quests for the wallets that looked at them today, so a quest done later still books */
  async function tick() {
    if (!on || ended()) return;
    const day = dayOf(now());
    const rows = await pg.all<Row>(`select wallet, to_char(reroll_day, 'YYYY-MM-DD') as reroll_day, reroll from mine.xp_checkins
      where seen_day = ?`, day);
    for (const r of rows) {
      try { await settle(r.wallet, day, r.reroll_day === day ? (r.reroll as Group | null) : null); }
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
    if (req.method === "POST" && p === "/api/xp/quest/buy-reroll") {
      const b = await d.readJson(req);
      return d.send(res, 200, await buyReroll(wallet, String(b?.group ?? ""), String(b?.tx ?? "").toLowerCase())), true;
    }
    if (req.method === "POST" && p === "/api/xp/quest/xpost") return d.send(res, 200, await xpost(wallet, String((await d.readJson(req))?.url ?? ""))), true;
    return false;
  }

  function start(everyMs = Number(process.env.QUESTS_TICK_MS ?? 600_000)) {
    if (!on) return;
    setInterval(() => void tick().catch((err) => console.error(`quests: ${err instanceof Error ? err.message : err}`)), everyMs).unref();
  }

  return { route, start, tick, today, checkin, visit, reroll, settle, streaks, buyReroll, xpost };
}
