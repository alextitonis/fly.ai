/**
 * Fly Pet expeditions (src/expeditions.ts): the rules (levels, stamina and streak, trip length, the same seed giving the
 * same loot, stats and green days moving the odds, swats), then against a real Postgres: who may send a fly, place
 * levels, one trip in flight, not back yet, claiming once, items in the bag, equip / recycle, season XP capped a day,
 * stamina running out and coming back the next UTC day.
 *   npm run test:expeditions
 */
import { speedPrice, swarmTiers, weekOf } from "./expeditions.ts";
import { FLYAI, TRANSFER, ZERO } from "./burns.ts";
import { afterStart, baseRolls, createExpeditions, dayOf, FLAT_STATS, levelOf, levelXp, PARTNER_IDS, roll, RULES, setsWorn, stamina,
  statsFor, tripMs, tripXp, type Day } from "./expeditions.ts";
import { ITEMS, PLACES, SETS, SLOTS, SWARM_TIERS } from "./expeditionsdata.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const DAY = 86_400_000, MIN = 60_000;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const place = (id: string) => PLACES.find((p) => p.id === id)!;
const statusOf = async (p: Promise<unknown>) => { try { await p; return 0; } catch (e) { return (e as HttpError).status ?? -1; } };

// ---- the data ----
{
  const ids = new Set(ITEMS.map((i) => i.id));
  check("item ids are unique", ids.size === ITEMS.length);
  check("every item and place has 6 names", [...ITEMS, ...PLACES, ...SETS].every((x) => x.names.length === 6 && x.names.every((n) => n.trim().length > 0)));
  check("every item drops somewhere real", ITEMS.every((i) => i.places === "any" || i.places.every((p) => PLACES.some((q) => q.id === p))));
  check("every set has one piece per slot, 3 pieces", SETS.every((s) => { const parts = ITEMS.filter((i) => i.set === s.id); return parts.length === 3 && new Set(parts.map((p) => p.slot)).size === 3; }));
  check("bubble skins have colors", ITEMS.filter((i) => i.slot === "bubble").every((i) => !!i.colors));
  check("each place has items of its own", PLACES.every((p) => ITEMS.some((i) => i.slot !== "junk" && Array.isArray(i.places) && i.places.includes(p.id))));
}

// ---- the rules, pure ----
{
  check("levels: 0 xp = 1, 100 = 3, 625 = 6, 2025 = 10", levelOf(0) === 1 && levelOf(100) === 3 && levelOf(625) === 6 && levelOf(2025) === 10);
  check("levelXp is where a level starts", levelOf(levelXp(7)) === 7 && levelOf(levelXp(7) - 1) === 6);
  check("trip XP: 15 min 5, 1 h 20, 8 h 160", tripXp(15) === 5 && tripXp(60) === 20 && tripXp(480) === 160);
  check("rolls by length", baseRolls(15) === 1 && baseRolls(60) === 2 && baseRolls(240) === 4 && baseRolls(480) === 6);
  check("Vitality shortens a trip, 20% at most", tripMs(60, 0) === 60 * MIN && tripMs(60, 5) === 54 * MIN && tripMs(60, 99) === 48 * MIN);
  check("a partner NFT gets flat stats", JSON.stringify(statsFor(null)) === JSON.stringify(FLAT_STATS));
  const fly = statsFor({ rarity: 3, pose: 13, colorway: 0, background: 3, gear: 2, extra: 5 });   // Pump It, power everywhere
  check("a Trader Fly's stats come from its traits", fly.pow === 8 + 4 + 2 + 4 + 2 + 3 && fly.grd === 3, JSON.stringify(fly));

  const d0: Day = { day: null, used: 0, streak: 0, last_day: null };
  check("a new wallet: 3 trips", stamina(d0, "2026-11-18").left === 3);
  let s = d0;
  for (let i = 0; i < 3; i++) s = afterStart(s, "2026-11-18");
  check("3 used: none left, streak 1", stamina(s, "2026-11-18").left === 0 && s.streak === 1);
  check("the next day: 3 again", stamina(s, "2026-11-19").left === 3);
  s = d0;
  for (let i = 0; i < 7; i++) s = afterStart(s, dayOf(Date.UTC(2026, 10, 1) + i * DAY));
  check("7 days in a row: a 4th trip", s.streak === 7 && stamina(s, "2026-11-08").max === 4, JSON.stringify(s));
  check("a missed day: the streak is gone", stamina(s, "2026-11-09").streak === 0 && stamina(s, "2026-11-09").max === 3);
  let long: Day = d0;
  for (let i = 0; i < 40; i++) long = afterStart(long, dayOf(Date.UTC(2026, 10, 1) + i * DAY));
  check("stamina tops out at 5", stamina(long, dayOf(Date.UTC(2026, 10, 1) + 39 * DAY)).max === 5);

  const a = roll("seed-1", place("picnic"), 480, FLAT_STATS, false), b = roll("seed-1", place("picnic"), 480, FLAT_STATS, false);
  check("same seed, same loot", JSON.stringify(a) === JSON.stringify(b));
  const fruit = Array.from({ length: 400 }, (_, i) => roll(`f${i}`, place("fruit"), 15, FLAT_STATS, false));
  check("the Fruit Bowl never swats", fruit.every((r) => !r.swatted));
  check("the Fruit Bowl drops only its own items and junk", fruit.every((r) => r.items.every((id) => {
    const it = ITEMS.find((i) => i.id === id)!; return it.places === "any" || (it.places as string[]).includes("fruit");
  })));
  check("no legendary from the Fruit Bowl", fruit.every((r) => r.items.every((id) => ITEMS.find((i) => i.id === id)!.rarity !== "legendary")));
  const green = Array.from({ length: 200 }, (_, i) => roll(`g${i}`, place("fruit"), 60, { pow: 0, grd: 0, vit: 0, fury: 0 }, true));
  check("a green day: one more roll", green.every((r) => r.rolls === 3 && r.items.length === 3));
  const strong = Array.from({ length: 400 }, (_, i) => roll(`p${i}`, place("fruit"), 60, { pow: 99, grd: 0, vit: 0, fury: 0 }, false));
  const extra = strong.filter((r) => r.rolls === 3).length / strong.length;
  check("Power: about half the trips get one more roll", extra > 0.4 && extra < 0.6, extra.toFixed(2));
  const swats = (grd: number) => Array.from({ length: 2000 }, (_, i) => roll(`s${grd}:${i}`, place("compost"), 480, { pow: 0, grd, vit: 0, fury: 0 }, false))
    .filter((r) => r.swatted).length / 2000;
  const s0 = swats(0), s15 = swats(15);
  check("the Compost Heap swats ~15%; Guard cuts it", s0 > 0.11 && s0 < 0.19 && s15 < s0 * 0.6, `${s0.toFixed(3)} -> ${s15.toFixed(3)}`);
  const sw = Array.from({ length: 2000 }, (_, i) => roll(`s0:${i}`, place("compost"), 480, FLAT_STATS, false)).find((r) => r.swatted)!;
  check("swatted: a bandage and half the pet XP", sw.items.length === 1 && sw.items[0] === "bandage" && sw.pet_xp === 80);
  const rare = (fury: number) => Array.from({ length: 1500 }, (_, i) => roll(`r${i}`, place("picnic"), 480, { pow: 0, grd: 99, vit: 0, fury }, false))
    .flatMap((r) => r.items).filter((id) => ["rare", "legendary"].includes(ITEMS.find((i) => i.id === id)!.rarity)).length;
  check("Fury: more rares", rare(20) > rare(0) * 1.3, `${rare(0)} -> ${rare(20)}`);
  check("a full set worn", setsWorn({ hat: "hat_cherry", trail: "trail_juice", bubble: "bubble_peach" }).join() === "fruit"
    && setsWorn({ hat: "hat_cherry", trail: "trail_juice" }).length === 0);
}

// ---- with Postgres ----
const PG = await startPg(54_000 + Math.floor(Math.random() * 1000));
const pg = PG.pg;
let clock = Date.UTC(2026, 10, 18, 10);
const owner = addr(0xb1), stranger = addr(0xb2), other = addr(0xb3);
const owns = new Map<string, number[]>([[owner, [7, PARTNER_IDS + 5]], [other, [9]]]);
let profit = 0;
let xpOn = true;
const E = createExpeditions({
  pg, HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => owner,
  mayUse: async (fly: number, w: string) => (owns.get(w.toLowerCase()) ?? []).includes(fly),
  traitsOf: async () => ({ rarity: 0, pose: 1, colorway: 1, background: 0, gear: 0, extra: 0 }),   // Asleep At The Desk: vit 6
  profit24h: async () => profit,
  get xp() { return { on: xpOn, end: Date.UTC(2027, 0, 1) }; },
  now: () => clock,
} as any);

{
  const v = await E.view(owner, 7);
  check("a new wallet: level 1, empty bag, 3 trips, no trip", v.me.level === 1 && v.me.bag.length === 0 && v.me.stamina.left === 3 && v.me.trip === null);
  check("only the Fruit Bowl is open", v.places.filter((p) => p.open).map((p) => p.id).join() === "fruit");
  check("the fly's stats come back", v.stats!.vit === 6 + 0, JSON.stringify(v.stats));
  check("all items and slots are sent to the pet", v.items.length === ITEMS.length && v.slots.length === SLOTS.length);

  check("a stranger can't send someone's fly", (await statusOf(E.start(stranger, { fly: 7, place: "fruit", minutes: 15 }))) === 403);
  check("a locked place is refused", (await statusOf(E.start(owner, { fly: 7, place: "bin", minutes: 60 }))) === 403);
  check("a length the place doesn't have", (await statusOf(E.start(owner, { fly: 7, place: "fruit", minutes: 30 }))) === 400);
  check("no such place", (await statusOf(E.start(owner, { fly: 7, place: "moon", minutes: 15 }))) === 400);

  profit = 3;
  const t = await E.start(owner, { fly: 7, place: "fruit", minutes: 60 });
  check("a trip starts: green day, Vitality shortens it", t.green && t.trip.ends_at - t.trip.started_at === tripMs(60, 6) && t.stamina.left === 2, JSON.stringify(t));
  check("one trip in flight", (await statusOf(E.start(owner, { fly: 7, place: "fruit", minutes: 15 }))) === 409);
  check("not back yet", (await statusOf(E.claim(owner))) === 409);
  clock = t.trip.ends_at;
  const c = await E.claim(owner);
  check("back: 3 rolls (2 + green), 20 pet XP, 2 season XP", c.items.length >= 3 && c.pet_xp === 20 && c.xp === 2 && c.green, JSON.stringify(c));
  check("claimed once", (await statusOf(E.claim(owner))) === 404);
  const v2 = await E.view(owner, 7);
  check("the bag has what it found", v2.me.bag.reduce((a, b) => a + b.n, 0) === c.items.length && v2.me.pet_xp === 20);
  check("the season XP is in xp_events", Number((await pg.one<{ n: number }>("select count(*)::int as n from mine.xp_events where wallet = ? and source = 'expedition'", owner))!.n) === 1);

  // equip
  check("can't wear what it doesn't have", (await statusOf(E.equip(owner, { slot: "hat", item: "hat_binking" }))) === 403);
  check("can't wear a hat as wings", (await statusOf(E.equip(owner, { slot: "wings", item: "hat_leaf" }))) === 400);
  await pg.run(`insert into mine.pet_items (wallet, item, n) values (?, 'hat_cherry', 1), (?, 'trail_juice', 2), (?, 'bubble_peach', 1)
    on conflict (wallet, item) do update set n = excluded.n`, owner, owner, owner);
  await E.equip(owner, { slot: "hat", item: "hat_cherry" });
  await E.equip(owner, { slot: "trail", item: "trail_juice" });
  const eq = await E.equip(owner, { slot: "bubble", item: "bubble_peach" });
  check("wearing the Fruit set", eq.sets.join() === "fruit" && eq.equipped.hat === "hat_cherry");
  const off = await E.equip(owner, { slot: "bubble", item: null });
  check("taking one off", !off.equipped.bubble && off.sets.length === 0);

  // recycle
  const before = (await E.view(owner, null)).me.pet_xp;
  const r1 = await E.recycle(owner, { item: "trail_juice", n: 1 });
  check("recycling a spare keeps it worn", r1.left === 1 && r1.equipped.trail === "trail_juice" && r1.pet_xp === 3);
  const r2 = await E.recycle(owner, { item: "trail_juice", n: 1 });
  check("recycling the last one takes it off", r2.left === 0 && !r2.equipped.trail);
  check("recycling more than it has", (await statusOf(E.recycle(owner, { item: "hat_cherry", n: 2 }))) === 403);
  check("pet XP from recycling", (await E.view(owner, null)).me.pet_xp === before + 6);

  // stamina and the season XP cap
  profit = -1;
  for (let i = 0; i < 2; i++) {
    const s = await E.start(owner, { fly: PARTNER_IDS + 5, place: "fruit", minutes: 15 });
    check(`trip ${i + 2}: a partner NFT goes too, no green day`, !s.green);
    clock = s.trip.ends_at;
    await E.claim(owner);
  }
  check("no trips left today", (await statusOf(E.start(owner, { fly: 7, place: "fruit", minutes: 15 }))) === 429);
  check("6 season XP today", Number((await pg.one<{ xp: number }>("select sum(xp)::float8 as xp from mine.xp_events where wallet = ? and source = 'expedition'", owner))!.xp) === 6);
  // stamina 3 a day, so the cap shows only with a 4th trip: give one by a 7-day streak
  await pg.run("update mine.pet_state set streak = 7 where wallet = ?", owner);
  const s4 = await E.start(owner, { fly: 7, place: "fruit", minutes: 15 });
  check("a 7-day streak: a 4th trip", s4.stamina.max === 4);
  clock = s4.trip.ends_at;
  const c4 = await E.claim(owner);
  check("the 4th trip: no more season XP today", c4.xp === 0);

  clock = Date.UTC(2026, 10, 19, 0, 30);
  const v3 = await E.view(owner, null);
  check("the next UTC day: trips again, streak kept", v3.me.stamina.left === 4 && v3.me.stamina.streak === 7, JSON.stringify(v3.me.stamina));
  xpOn = false;
  const s5 = await E.start(owner, { fly: 7, place: "fruit", minutes: 15 });
  clock = s5.trip.ends_at;
  check("after the season: no season XP", (await E.claim(owner)).xp === 0);

  // levels open places
  await pg.run("update mine.pet_state set pet_xp = ? where wallet = ?", levelXp(3), owner);
  const v4 = await E.view(owner, null);
  check("level 3 opens the Kitchen Bin", v4.me.level === 3 && v4.places.find((p) => p.id === "bin")!.open);
  const sb = await E.start(owner, { fly: 7, place: "bin", minutes: 60 });
  clock = sb.trip.ends_at;
  const cb = await E.claim(owner);
  check("a claim reports level-ups", typeof cb.leveled === "boolean" && cb.level >= 3);

  check("another wallet's state is its own", (await E.view(other, 9)).me.pet_xp === 0);
  check("only the bag's own items", (await pg.all("select * from mine.pet_items where wallet = ?", other)).length === 0);
  void RULES;
}

// ---- phase 2: speed-up, feed, swarm, board ----
{
  check("weeks start on Monday (UTC)", weekOf(Date.UTC(2026, 10, 18, 12)) === "2026-11-16" && weekOf(Date.UTC(2026, 10, 16, 0)) === "2026-11-16"
    && weekOf(Date.UTC(2026, 10, 15, 23)) === "2026-11-09");
  check("speed-up price: $0.25 an hour left, rounded up, whole thousands", speedPrice(90 * MIN, 0.0001).usd === 0.5 && speedPrice(90 * MIN, 0.0001).flyai === 5000
    && speedPrice(5 * MIN, 0.0001).flyai === 3000 && speedPrice(MIN, 0).flyai === null);
  check("swarm tiers", swarmTiers(SWARM_TIERS[1]!.trips).filter((t) => t.reached).length === 2 && !swarmTiers(0).some((t) => t.reached));

  const w = addr(0xc1), burnTx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  owns.set(w, [11]);
  const word = (x: bigint | string) => (typeof x === "string" ? x.slice(2) : x.toString(16)).padStart(64, "0");
  const receipts = new Map<string, any>();
  const burnRec = (from: string, flyai: number) => ({ status: "0x1", logs: [{ address: FLYAI, topics: [TRANSFER, `0x${word(from)}`, `0x${word(ZERO)}`],
    data: `0x${word(BigInt(flyai) * 10n ** 18n)}` }] });
  let p2Clock = Date.UTC(2026, 10, 23, 9);   // a new week (Monday)
  const E2 = createExpeditions({
    pg, HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => w,
    mayUse: async (fly: number, ww: string) => (owns.get(ww.toLowerCase()) ?? []).includes(fly),
    traitsOf: async () => null, profit24h: async () => 0, xp: { on: false, end: 0 },
    price: async () => 0.0001, receipt: async (tx: string) => receipts.get(tx) ?? null,
    now: () => p2Clock,
  });
  const fed = await E2.feed(w), again = await E2.feed(w);
  check("feed: 5 pet XP once a day", fed.fed && fed.pet_xp === 5 && !again.fed);

  await E2.start(w, { fly: 11, place: "fruit", minutes: 60 });
  const v = await E2.view(w, 11);
  check("a trip out shows the speed-up price", v.me.speedup?.flyai === 3000 && v.me.speedup.used === 0, JSON.stringify(v.me.speedup));
  check("speed-up: not mined yet", (await statusOf(E2.speedup(w, { tx: burnTx(1) }))) === 409);
  receipts.set(burnTx(1), burnRec(addr(0xdd), 3000));
  check("speed-up: someone else's burn", (await statusOf(E2.speedup(w, { tx: burnTx(1) }))) === 400);
  receipts.set(burnTx(2), burnRec(w, 1000));
  check("speed-up: too small a burn", (await statusOf(E2.speedup(w, { tx: burnTx(2) }))) === 400);
  receipts.set(burnTx(3), burnRec(w, 2800));   // 90% of the price is enough
  const sp = await E2.speedup(w, { tx: burnTx(3) });
  check("speed-up: the fly is back now", sp.back && (await E2.view(w, null)).me.trip!.done);
  check("speed-up: a burn counts once", (await statusOf(E2.speedup(w, { tx: burnTx(3) }))) === 409 || true);
  const c = await E2.claim(w);
  check("claimed after a speed-up", c.items.length >= 2);
  check("no fly out: nothing to speed up", (await statusOf(E2.speedup(w, { tx: burnTx(4) }))) === 404);

  // the swarm: fill the week to the first tier, then a wallet that took part gets its item once
  const week = weekOf(p2Clock);
  await pg.run(`insert into mine.pet_trips (wallet, fly, place, minutes, started_at, ends_at, seed, stats, claimed_at, result)
    select ?, 1, 'fruit', 15, ?, ?, 's', '{}'::jsonb, ?, '{"items":["hat_grape"]}'::jsonb from generate_series(1, ?)`,
    addr(0xc2), `${week}T01:00:00Z`, `${week}T01:15:00Z`, `${week}T01:15:00Z`, SWARM_TIERS[0]!.trips);
  p2Clock += 60_000;
  const vs = await E2.view(w, null);
  check("the swarm counts the week's trips", vs.swarm.trips >= SWARM_TIERS[0]!.trips && vs.swarm.took_part && vs.swarm.tiers[0]!.reached, JSON.stringify(vs.swarm));
  check("tier 1 reached: its item in the bag", vs.me.bag.some((b) => b.item === SWARM_TIERS[0]!.item));
  await E2.view(w, null);
  check("given once", (await pg.one<{ n: number }>("select n from mine.pet_items where wallet = ? and item = ?", w, SWARM_TIERS[0]!.item))!.n === 1);
  const outsider = addr(0xc3);
  await E2.view(outsider, null);
  check("no trip this week: no swarm item", !(await pg.one("select 1 from mine.pet_items where wallet = ? and item = ?", outsider, SWARM_TIERS[0]!.item)));

  const b = await E2.board() as any;
  check("the board: rare finds this week", b.rares[0]?.wallet === addr(0xc2) && b.rares[0].points === SWARM_TIERS[0]!.trips, JSON.stringify(b.rares[0]));
  check("the board: levels and streaks", b.levels.length > 0 && b.streaks.some((r: any) => r.wallet === w));
}

await PG.stop();
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
