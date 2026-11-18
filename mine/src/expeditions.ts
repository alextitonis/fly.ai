/**
 * Fly Pet expeditions, phase 1 (2026-11-18, flypet/EXPEDITIONS-PLAN.md; the user: "Build phase 1"). The pet's fly goes
 * on a timed trip to a place and comes back with cosmetic items it can wear. Everything runs on this server's clock: the
 * pet only shows a countdown, so it costs the player's PC nothing. Nothing here is money, nothing is on chain, items
 * can't be traded.
 *
 *   who        a signed-in wallet (the site's session or the pet's token) with the fly or partner NFT it picked: the
 *              same rule as the fly chat (flychat.ts access). No fly and no partner NFT: no expeditions (the user, 11-18).
 *   places     expeditionsdata.ts PLACES: each opens at a pet level and has its trip lengths.
 *   stamina    3 trips a UTC day, +1 per 7 days in a row with a trip, 5 at most. One trip in flight per wallet.
 *   stats      a Trader Fly's from its traits (world/src/arena/stats.ts statsOf, the arena's numbers); a partner NFT gets
 *              FLAT_STATS. Power: a chance of one more roll; Guard: lower swat odds; Vitality: shorter trips (up to 20%);
 *              Fury: better odds of rare and legendary.
 *   green day  a fly up over the last 24 h when it leaves gets one more roll (the user, 11-18: "sure").
 *   swatted    a risky place can send it back with a bandage only (and half the pet XP): a joke, never a real loss.
 *   loot       rolled when claimed, from the trip's stored seed: the client never decides what it finds.
 *   pet XP     its own level track (levelOf), from trips and from recycling items; opens places.
 *   season XP  2 per claimed trip, 6 a UTC day at most, into mine.xp_events as source 'expedition' (the user, 11-18:
 *              "yes"), while the XP season runs.
 *
 *   GET  /api/pet/exp?fly=<id>              places, items, sets, and the wallet's level, bag, stamina, trip, the fly's stats
 *   POST /api/pet/exp/start { fly, place, minutes }
 *   POST /api/pet/exp/claim                 the trip in flight, once it's back: { items, swatted, pet_xp, level, xp }
 *   POST /api/pet/exp/equip { slot, item }  item null takes it off
 *   POST /api/pet/exp/recycle { item, n }   pet XP for items (junk, spares)
 *
 * Tables in flybook/supabase/migrations/20261118130000_mine_pet_expeditions.sql. Off with EXPEDITIONS_ON=0.
 */
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg, Q } from "./pg.ts";
import { statsOf, type Stats, type Traits } from "../../world/src/arena/stats.ts";
import { ITEMS, PLACES, RARITIES, RECYCLE_XP, SETS, SLOTS, type Item, type Place, type Rarity, type Slot } from "./expeditionsdata.ts";

const DAY_MS = 86_400_000;
export const PARTNER_IDS = 1_000_000_000;
export const FLAT_STATS: Stats = { pow: 4, grd: 4, vit: 4, fury: 4 };
export const RULES = {
  stamina: 3, staminaMax: 5, streakEvery: 7,
  powRollMax: 0.5, powPer: 1 / 24,          // Power: a chance of one more roll, up to 50%
  grdCutMax: 0.6, grdPer: 1 / 25,           // Guard: cuts the swat odds, up to 60%
  vitCutMax: 0.2, vitPer: 1 / 50,           // Vitality: shortens the trip, up to 20%
  furyPer: 0.03,                            // Fury: rare and legendary weights x(1 + 3% a point)
  junk: 0.3,                                // the share of rolls that find junk
  xpPerMinute: 1 / 3,                       // pet XP: 15 min = 5, 1 h = 20, 8 h = 160
  levelBase: 25,
  seasonXp: 2, seasonXpDay: 6,
};
const byId = new Map(ITEMS.map((i) => [i.id, i]));
const placeOf = (id: unknown) => PLACES.find((p) => p.id === id);

// ---- the rules, pure -----------------------------------------------------------------------------------------------
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const levelOf = (xp: number) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / RULES.levelBase));
/** pet XP where a level starts */
export const levelXp = (level: number) => RULES.levelBase * (level - 1) ** 2;
export const statsFor = (traits: Traits | null): Stats => (traits ? statsOf(traits) : { ...FLAT_STATS });
export const tripMs = (minutes: number, vit: number) => Math.round(minutes * 60_000 * (1 - Math.min(RULES.vitCutMax, vit * RULES.vitPer)));
export const tripXp = (minutes: number) => Math.round(minutes * RULES.xpPerMinute);
export const baseRolls = (minutes: number) => (minutes <= 15 ? 1 : minutes <= 60 ? 2 : minutes <= 240 ? 4 : 6);

export interface Day { day: string | null; used: number; streak: number; last_day: string | null }
/** the streak as of today: kept if the last trip was today or yesterday, else gone */
export function streakNow(s: Day, today: string): number {
  if (!s.last_day) return 0;
  const yesterday = dayOf(Date.parse(`${today}T00:00:00Z`) - DAY_MS);
  return s.last_day === today || s.last_day === yesterday ? s.streak : 0;
}
export function stamina(s: Day, today: string) {
  const streak = streakNow(s, today);
  const max = Math.min(RULES.staminaMax, RULES.stamina + Math.floor(streak / RULES.streakEvery));
  const used = s.day === today ? s.used : 0;
  return { max, used, left: Math.max(0, max - used), streak };
}
/** the day after starting a trip today */
export function afterStart(s: Day, today: string): Day {
  const streak = s.last_day === today ? s.streak : streakNow(s, today) + 1;
  return { day: today, used: (s.day === today ? s.used : 0) + 1, streak, last_day: today };
}

/** numbers in [0, 1) from a seed: sha256(seed:i), 48 bits each */
export function rng(seed: string) {
  let i = 0;
  return () => parseInt(createHash("sha256").update(`${seed}:${i++}`).digest("hex").slice(0, 12), 16) / 2 ** 48;
}
const dropsAt = (item: Item, place: string) => item.places === "any" || item.places.includes(place);

export interface Roll { swatted: boolean; items: string[]; pet_xp: number; rolls: number }
/** What a trip brings back. Same seed, same answer. */
export function roll(seed: string, place: Place, minutes: number, stats: Stats, green: boolean): Roll {
  const r = rng(seed);
  const xp = tripXp(minutes);
  const swat = place.risk * (1 - Math.min(RULES.grdCutMax, stats.grd * RULES.grdPer));
  if (r() < swat) return { swatted: true, items: ["bandage"], pet_xp: Math.round(xp / 2), rolls: 0 };
  const rolls = baseRolls(minutes) + (r() < Math.min(RULES.powRollMax, stats.pow * RULES.powPer) ? 1 : 0) + (green ? 1 : 0);
  const junk = ITEMS.filter((i) => i.slot === "junk" && dropsAt(i, place.id));
  const boost = 1 + stats.fury * RULES.furyPer;
  const weights = RARITIES.map((k) => place.weights[k] * (k === "rare" || k === "legendary" ? boost : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const items: string[] = [];
  for (let n = 0; n < rolls; n++) {
    if (r() < RULES.junk && junk.length) { items.push(junk[Math.floor(r() * junk.length)]!.id); continue; }
    let x = r() * total, k = 0;
    while (k < RARITIES.length - 1 && x >= weights[k]!) x -= weights[k++]!;
    // that rarity's items here, or the next rarity down if the place has none
    for (let j = k; j >= 0; j--) {
      const pool = ITEMS.filter((i) => i.slot !== "junk" && i.rarity === RARITIES[j] && dropsAt(i, place.id));
      if (pool.length) { items.push(pool[Math.floor(r() * pool.length)]!.id); break; }
      if (j === 0 && junk.length) items.push(junk[Math.floor(r() * junk.length)]!.id);
    }
  }
  return { swatted: false, items, pet_xp: xp, rolls };
}
/** the sets fully worn */
export const setsWorn = (equipped: Record<string, string>) =>
  SETS.filter((s) => { const parts = ITEMS.filter((i) => i.set === s.id); return parts.length > 0 && parts.every((p) => equipped[p.slot] === p.id); }).map((s) => s.id);

// ---- the server ----------------------------------------------------------------------------------------------------
export interface ExpDeps {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  /** the site's session or the pet's token (server.ts sessionOrPet) */
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  /** may this wallet use this fly / partner NFT (the fly chat's rule) */
  mayUse: (fly: number, wallet: string) => Promise<boolean>;
  /** a Trader Fly's traits (null: unknown / not revealed) */
  traitsOf: (fly: number) => Promise<Traits | null>;
  /** the fly's profit over the last 24 h, USD (null: unknown) */
  profit24h: (fly: number) => Promise<number | null>;
  xp: { on: boolean; end: number };
  on?: boolean;
  now?: () => number;
}

type StateRow = { pet_xp: number; equipped: Record<string, string>; day: string | null; used: number; streak: number; last_day: string | null };
type TripRow = { id: number; fly: number; place: string; minutes: number; started_at: number; ends_at: number; seed: string; green: boolean; stats: Stats };

export function createExpeditions(d: ExpDeps) {
  const { pg, HttpError } = d;
  const now = d.now ?? Date.now;
  const on = d.on ?? true;

  const stateOf = async (q: Q, w: string): Promise<StateRow> => (await q.one<StateRow>(
    "select pet_xp, equipped, day::text as day, used, streak, last_day::text as last_day from mine.pet_state where wallet = ?", w))
    ?? { pet_xp: 0, equipped: {}, day: null, used: 0, streak: 0, last_day: null };
  const tripOf = (q: Q, w: string) => q.one<TripRow>(`select id::int as id, fly::float8 as fly, place, minutes, seed, green, stats,
    (extract(epoch from started_at) * 1000)::float8 as started_at, (extract(epoch from ends_at) * 1000)::float8 as ends_at
    from mine.pet_trips where wallet = ? and claimed_at is null`, w);
  const bagOf = (q: Q, w: string) => q.all<{ item: string; n: number }>("select item, n from mine.pet_items where wallet = ? and n > 0 order by first_at", w);

  async function statsOfFly(fly: number): Promise<Stats> {
    if (fly >= PARTNER_IDS) return { ...FLAT_STATS };
    return statsFor(await d.traitsOf(fly).catch(() => null));
  }
  async function needFly(fly: unknown, w: string): Promise<number> {
    const id = Number(fly);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "pick a fly");
    if (!(await d.mayUse(id, w).catch(() => false))) throw new HttpError(403, "only the fly's owner can send it out");
    return id;
  }
  const tripView = (t: TripRow | undefined) => (t ? { id: t.id, fly: t.fly, place: t.place, minutes: t.minutes, started_at: t.started_at,
    ends_at: t.ends_at, done: t.ends_at <= now() } : null);

  async function view(w: string, fly: number | null) {
    const [s, trip, bag] = await Promise.all([stateOf(pg, w), tripOf(pg, w), bagOf(pg, w)]);
    const level = levelOf(s.pet_xp);
    return {
      on,
      places: PLACES.map((p) => ({ id: p.id, level: p.level, lengths: p.lengths, risk: p.risk, names: p.names, open: level >= p.level })),
      items: ITEMS, sets: SETS, slots: SLOTS,
      me: { pet_xp: s.pet_xp, level, level_xp: levelXp(level), next_xp: levelXp(level + 1), equipped: s.equipped, sets: setsWorn(s.equipped),
        bag, stamina: stamina(s, dayOf(now())), trip: tripView(trip) },
      stats: fly != null ? await statsOfFly(fly) : null,
    };
  }

  async function start(w: string, body: any) {
    if (!on) throw new HttpError(503, "expeditions are off for now");
    const fly = await needFly(body?.fly, w);
    const place = placeOf(body?.place);
    if (!place) throw new HttpError(400, "no such place");
    const minutes = Number(body?.minutes);
    if (!place.lengths.includes(minutes)) throw new HttpError(400, `trips to ${place.names[0]} are ${place.lengths.join(" or ")} minutes`);
    const [stats, p24] = await Promise.all([statsOfFly(fly), d.profit24h(fly).catch(() => null)]);
    const green = p24 != null && p24 > 0;
    return pg.tx(async (q) => {
      const s = await stateOf(q, w), today = dayOf(now());
      if (levelOf(s.pet_xp) < place.level) throw new HttpError(403, `${place.names[0]} opens at pet level ${place.level}`);
      if (await tripOf(q, w)) throw new HttpError(409, "your fly is already out: claim that trip first");
      if (stamina(s, today).left <= 0) throw new HttpError(429, "no trips left today: your fly rests until tomorrow (UTC)");
      const at = now(), ends = at + tripMs(minutes, stats.vit), next = afterStart(s, today);
      const seed = randomBytes(16).toString("hex");
      const row = await q.one<{ id: number }>(`insert into mine.pet_trips (wallet, fly, place, minutes, started_at, ends_at, seed, green, stats)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?::text::jsonb) returning id::int as id`,
        w, fly, place.id, minutes, new Date(at).toISOString(), new Date(ends).toISOString(), seed, green, JSON.stringify(stats));
      await q.run(`insert into mine.pet_state (wallet, day, used, streak, last_day) values (?, ?::date, ?, ?, ?::date)
        on conflict (wallet) do update set day = excluded.day, used = excluded.used, streak = excluded.streak, last_day = excluded.last_day`,
        w, next.day, next.used, next.streak, next.last_day);
      return { trip: { id: row!.id, fly, place: place.id, minutes, started_at: at, ends_at: ends, done: false }, green,
        stamina: stamina(next, today) };
    }, `pet:${w}`);
  }

  async function claim(w: string) {
    return pg.tx(async (q) => {
      const t = await tripOf(q, w);
      if (!t) throw new HttpError(404, "no trip to claim");
      if (t.ends_at > now()) throw new HttpError(409, "your fly isn't back yet");
      const place = placeOf(t.place);
      const r = place ? roll(t.seed, place, t.minutes, t.stats, t.green) : { swatted: false, items: [], pet_xp: 0, rolls: 0 };
      for (const item of r.items) {
        await q.run(`insert into mine.pet_items (wallet, item, n) values (?, ?, 1)
          on conflict (wallet, item) do update set n = mine.pet_items.n + 1`, w, item);
      }
      const before = await stateOf(q, w);
      await q.run(`insert into mine.pet_state (wallet, pet_xp) values (?, ?)
        on conflict (wallet) do update set pet_xp = mine.pet_state.pet_xp + excluded.pet_xp`, w, r.pet_xp);
      await q.run("update mine.pet_trips set claimed_at = ?, result = ?::text::jsonb where id = ?", new Date(now()).toISOString(), JSON.stringify(r), t.id);
      // season XP: 2 a trip, 6 a UTC day, while the season runs
      let xp = 0;
      if (d.xp.on && now() < d.xp.end) {
        const today = dayOf(now());
        const got = await q.one<{ xp: number }>(`select coalesce(sum(xp), 0)::float8 as xp from mine.xp_events
          where wallet = ? and source = 'expedition' and at >= ?::date and at < ?::date + 1`, w, today, today);
        if ((got?.xp ?? 0) + RULES.seasonXp <= RULES.seasonXpDay) {
          const n = await q.run(`insert into mine.xp_events (wallet, source, ref, xp, at) values (?, 'expedition', ?, ?, ?) on conflict (ref) do nothing`,
            w, `exp:${t.id}`, RULES.seasonXp, new Date(now()).toISOString());
          if (n) xp = RULES.seasonXp;
        }
      }
      const level = levelOf(before.pet_xp + r.pet_xp);
      return { trip: t.id, place: t.place, green: t.green, swatted: r.swatted, items: r.items, pet_xp: r.pet_xp, xp, level,
        leveled: level > levelOf(before.pet_xp), opened: PLACES.filter((p) => p.level > levelOf(before.pet_xp) && p.level <= level).map((p) => p.id) };
    }, `pet:${w}`);
  }

  async function equip(w: string, body: any) {
    const slot = body?.slot as Slot;
    if (!SLOTS.includes(slot)) throw new HttpError(400, "no such slot");
    const id = body?.item == null ? null : String(body.item);
    return pg.tx(async (q) => {
      if (id) {
        const item = byId.get(id);
        if (!item || item.slot !== slot) throw new HttpError(400, "that doesn't go there");
        const has = await q.one<{ n: number }>("select n from mine.pet_items where wallet = ? and item = ?", w, id);
        if (!has || has.n <= 0) throw new HttpError(403, "you don't have that yet");
      }
      const s = await stateOf(q, w);
      const equipped = { ...s.equipped };
      if (id) equipped[slot] = id; else delete equipped[slot];
      await q.run(`insert into mine.pet_state (wallet, equipped) values (?, ?::text::jsonb)
        on conflict (wallet) do update set equipped = excluded.equipped`, w, JSON.stringify(equipped));
      return { equipped, sets: setsWorn(equipped) };
    }, `pet:${w}`);
  }

  async function recycle(w: string, body: any) {
    const item = byId.get(String(body?.item ?? ""));
    const n = Number(body?.n ?? 1);
    if (!item) throw new HttpError(400, "no such item");
    if (!Number.isSafeInteger(n) || n <= 0 || n > 1000) throw new HttpError(400, "how many?");
    return pg.tx(async (q) => {
      const has = (await q.one<{ n: number }>("select n from mine.pet_items where wallet = ? and item = ?", w, item.id))?.n ?? 0;
      if (has < n) throw new HttpError(403, `you have ${has}`);
      await q.run("update mine.pet_items set n = n - ? where wallet = ? and item = ?", n, w, item.id);
      const s = await stateOf(q, w);
      const equipped = { ...s.equipped };
      if (has === n && equipped[item.slot] === item.id) delete equipped[item.slot];   // the last one, off the fly
      const gain = RECYCLE_XP[item.rarity as Rarity] * n;
      await q.run(`insert into mine.pet_state (wallet, pet_xp, equipped) values (?, ?, ?::text::jsonb)
        on conflict (wallet) do update set pet_xp = mine.pet_state.pet_xp + excluded.pet_xp, equipped = excluded.equipped`, w, gain, JSON.stringify(equipped));
      const xp = s.pet_xp + gain;
      return { item: item.id, left: has - n, pet_xp: gain, level: levelOf(xp), leveled: levelOf(xp) > levelOf(s.pet_xp), equipped };
    }, `pet:${w}`);
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p !== "/api/pet/exp" && !p.startsWith("/api/pet/exp/")) return false;
    const w = (await d.sessionWallet(req)).toLowerCase();
    if (req.method === "GET" && p === "/api/pet/exp") {
      const f = url.searchParams.get("fly");
      return d.send(res, 200, await view(w, f ? await needFly(f, w) : null)), true;
    }
    if (req.method === "POST") {
      const body = await d.readJson(req).catch(() => ({}));
      if (p === "/api/pet/exp/start") return d.send(res, 200, await start(w, body)), true;
      if (p === "/api/pet/exp/claim") return d.send(res, 200, await claim(w)), true;
      if (p === "/api/pet/exp/equip") return d.send(res, 200, await equip(w, body)), true;
      if (p === "/api/pet/exp/recycle") return d.send(res, 200, await recycle(w, body)), true;
    }
    return false;
  }

  return { route, view, start, claim, equip, recycle };
}
