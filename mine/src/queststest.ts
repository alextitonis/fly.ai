/**
 * Daily check-in and quests (src/quests.ts): the streak, freezes and milestones, the seed and reroll, then against a
 * real Postgres: the 10k / fly gate, one check-in a day, visit quests, quests found in the data (a deposit, a swap-box
 * buy), the all-3 bonus, no double booking, the season end, and the XP showing up in xp_events.
 *   npm run test:quests
 */
import { checkIn, createQuests, dayOf, GROUPS, listsOf, pick, QUESTS, questAt, REF_QUESTS, standing, type Streak } from "./quests.ts";
import { createAmbassadors } from "./ambassadors.ts";
import { FLYAI } from "./burns.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const DAY = 86_400_000;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const day = (n: number) => dayOf(Date.UTC(2026, 10, 1) + n * DAY);

// ---- pure ----
{
  const s0: Streak = { days: 0, best: 0, freezes: 0, last: null };
  let s = s0, bonus = 0;
  const run = (from: number, to: number) => { for (let i = from; i <= to; i++) { const c = checkIn(s, day(i)); s = c.next; bonus += c.bonus; } };
  run(0, 6);
  check("7 days in a row: streak 7, +10, one freeze", s.days === 7 && bonus === 10 && s.freezes === 1, JSON.stringify(s));
  check("the same day twice: nothing", checkIn(s, day(6)).already && checkIn(s, day(6)).bonus === 0);
  const skip = checkIn(s, day(8));   // day 7 missed: the freeze covers it
  check("a missed day uses a freeze", skip.next.days === 8 && skip.next.freezes === 0 && skip.used === 1, JSON.stringify(skip));
  const broke = checkIn(skip.next, day(11));   // days 9, 10 missed, no freeze left
  check("missed with no freeze: back to 1, best kept", broke.next.days === 1 && broke.next.best === 8, JSON.stringify(broke.next));
  s = s0; bonus = 0; run(0, 13);
  check("14 days: +10 +20, freezes capped at 2", s.days === 14 && bonus === 30 && s.freezes === 2);
  run(14, 29);
  check("30 days: +50 more", s.days === 30 && bonus === 80, `${bonus}`);
  run(30, 59);
  check("60 days: +50 again", s.days === 60 && bonus === 130, `${bonus}`);
  check("standing: a broken streak shows 0", standing({ days: 5, best: 5, freezes: 0, last: day(0) }, day(2)).days === 0
    && standing({ days: 5, best: 5, freezes: 1, last: day(0) }, day(2)).days === 5 && standing({ days: 5, best: 5, freezes: 0, last: day(0) }, day(1)).days === 5);
  const w = addr(7), q = pick(w, day(0));
  check("one quest from each group", q.length === 3 && GROUPS.every((g, i) => QUESTS[g].includes(q[i])), q.join(","));
  check("the same quests for the same wallet and day", pick(w.toUpperCase().replace("0X", "0x"), day(0)).join() === q.join());
  const r = pick(w, day(0), "social");
  check("a reroll changes only its group", r[0] === q[0] && r[2] === q[2] && r[1] !== q[1]);
  const spread = new Set(Array.from({ length: 40 }, (_, i) => pick(addr(i + 1), day(0))[2]));
  check("different wallets get different quests", spread.size >= 3, [...spread].join(","));
}

// ---- with Postgres ----
const PG = await startPg(54_000 + Math.floor(Math.random() * 1000));
const pg = PG.pg;
let clock = Date.UTC(2026, 10, 6, 10);
const big = addr(0xa1), small = addr(0xa2), flyOwner = addr(0xa3), team = addr(0xa4);
await pg.run(`insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, ?, 0, 0, 0), (?, ?, 0, 0, 0), (?, 0, 0, 0, 1), (?, ?, 0, 0, 0)`,
  big, (6_000n * E18).toString(), small, (9_999n * E18).toString(), flyOwner, team, (1_000_000n * E18).toString());
await pg.run("update mine.xp_holders set staked = ? where wallet = ?", (4_000n * E18).toString(), big);   // 6k + 4k staked = 10k
const Q = createQuests({ pg, end: Infinity, exclude: [team], HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => big, now: () => clock });
const xpOf = async (w: string, src?: string) => Number((await pg.one<{ xp: number }>(
  `select coalesce(sum(xp), 0)::float8 as xp from mine.xp_events where wallet = ?${src ? " and source = ?" : ""}`, ...(src ? [w, src] : [w])))!.xp);

const t0 = await Q.today(big);
check("10k held (wallet + staked) qualifies", t0.eligible && !t0.checked_in && t0.quests.length === 3);
check("9,999 doesn't", !(await Q.today(small)).eligible);
check("a fly owner with no $FLYAI qualifies", (await Q.today(flyOwner)).eligible);
let err: unknown = null;
await Q.checkin(small).catch((e) => { err = e; });
check("check-in refused under the gate", (err as HttpError)?.status === 403);

const c1 = await Q.checkin(big);
check("check-in: +2, streak 1", c1.gained === 2 && c1.today.checked_in && c1.today.streak.days === 1, JSON.stringify(c1.today.streak));
const c1b = await Q.checkin(big);
check("a second check-in the same day: nothing", c1b.gained === 0 && await xpOf(big, "checkin") === 2);

// visit quest: only today's
const visitQ = c1.today.quests.find((x) => x.group === "visit")!.id;
const other = QUESTS.visit.find((x) => x !== visitQ)!;
const v0 = await Q.visit(big, other);
check("a visit quest that isn't today's: nothing", v0.gained === 0);
const v1 = await Q.visit(big, visitQ);
check("today's visit quest: +2", v1.gained === 2 && v1.today.quests.find((x) => x.id === visitQ)!.done);
check("again: nothing", (await Q.visit(big, visitQ)).gained === 0 && await xpOf(big, "quest") === 2);
err = null;
await Q.visit(big, "flybook").catch((e) => { err = e; });
check("a social quest can't be reported by the page", (err as HttpError)?.status === 400);

// reroll the social group once; the move quest found in the data
const before = (await Q.today(big)).quests;
const rr = await Q.reroll(big, "social");
const after = rr.today.quests;
check("reroll: only the social quest changes", after[0].id === before[0].id && after[2].id === before[2].id && after[1].id !== before[1].id && rr.today.reroll_used);
err = null;
await Q.reroll(big, "move").catch((e) => { err = e; });
check("one reroll a day", (err as HttpError)?.status === 409);
err = null;
await Q.reroll(big, "visit").catch((e) => { err = e; });

const iso = new Date(clock).toISOString();
const doMove = async (id: string) => {
  if (id === "topup") await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, token, amount, usd, at) values (?, 'robinhood', 'deposit', ?, 'USDG', '25', 25, ?)`, addr(0xf1), big, iso);
  else await pg.run("insert into mine.xp_events (wallet, source, ref, xp, at) values (?, ?, ?, 1, ?)", big, id === "swap" ? "buy" : id, `test:${id}`, iso);
};
const moveQ = after[2].id;
await doMove(moveQ);
const t2 = await Q.today(big);
check(`the move quest (${moveQ}) is found in the data`, t2.quests[2].done, JSON.stringify(t2.quests));
check("not all 3 yet: no bonus", !t2.all_done);

// the social quest: Flybook and fly chat tables aren't in this database; book it by hand
await pg.run("insert into mine.xp_events (wallet, source, ref, xp, at) values (?, 'quest', ?, 2, ?)", big, `quest:${big}:${t2.day}:${after[1].id}`, iso);
const t3 = await Q.today(big);
check("all 3 done: +4 once", t3.all_done && await xpOf(big, "quest") === 2 + 2 + 2 + 4, `${await xpOf(big, "quest")}`);
await Q.tick();
check("the tick books nothing twice", await xpOf(big, "quest") === 10);

// the other move quests' reads: a wallet whose move quest is a top-up, one whose is a swap-box buy
for (const want of ["topup", "swap", "claimstake"]) {
  const w = Array.from({ length: 400 }, (_, i) => addr(0xb000 + i)).find((x) => pick(x, dayOf(clock))[2] === want)!;
  await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, 0, 0, 0, 1)", w);
  const no = await Q.today(w);
  if (want === "topup") await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, token, amount, usd, at) values (?, 'robinhood', 'deposit', ?, 'USDG', '5', 5, ?)`, addr(0xf2), w, iso);
  const small = await Q.today(w);
  await pg.run(want === "topup"
    ? `insert into mine.vault_moves (wallet, chain, kind, holder, token, amount, usd, at) values ('${addr(0xf3)}', 'robinhood', 'deposit', '${w}', 'USDG', '25', 25, '${iso}')`
    : `insert into mine.xp_events (wallet, source, ref, xp, at) values ('${w}', '${want === "swap" ? "buy" : want}', 'test:${want}:${w}', 1, '${iso}')`);
  const yes = await Q.today(w);
  check(`the ${want} quest is read from the data${want === "topup" ? " ($5 doesn't count, $25 does)" : ""}`, !no.quests[2].done && !small.quests[2].done && yes.quests[2].done);
}

// a swap right after doing the quest (the deposit not booked yet): the swapped-away quest still counts, once
{
  const w = Array.from({ length: 400 }, (_, i) => addr(0xc000 + i)).find((x) => pick(x, dayOf(clock))[2] === "topup")!;
  await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, 0, 0, 0, 1)", w);
  const sw = await Q.reroll(w, "move");
  const swapped = sw.today.quests[2].id;
  check("the top-up quest was swapped away", swapped !== "topup" && !sw.today.quests[2].done, swapped);
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, token, amount, usd, at) values (?, 'robinhood', 'deposit', ?, 'USDG', '20', 20, ?)`,
    addr(0xf4), w, new Date(clock).toISOString());
  const back = await Q.today(w);
  check("the deposit still counts: the top-up quest comes back done", back.quests[2].id === "topup" && back.quests[2].done, JSON.stringify(back.quests[2]));
  // doing the replacement too pays nothing more for that group
  if (swapped === "topup") throw new Error("unreachable");
  if (swapped === "swap" || swapped === "claimstake" || swapped === "market") {
    await pg.run("insert into mine.xp_events (wallet, source, ref, xp, at) values (?, ?, ?, 1, ?)", w, swapped === "swap" ? "buy" : swapped, `test:dup:${w}`, new Date(clock).toISOString());
  }
  await Q.today(w); await Q.tick();
  const paid = Number((await pg.one<{ n: number }>("select count(*)::int as n from mine.xp_events where wallet = ? and source = 'quest' and ref not like '%:all'", w))!.n);
  check("one quest per group pays", paid === 1, `${paid}`);
}

// the swap quest also reads the box's own success log (its Relay and GIGA routes have no fee leg for the XP scan)
{
  const w = Array.from({ length: 400 }, (_, i) => addr(0xd000 + i)).find((x) => pick(x, dayOf(clock))[2] === "swap")!;
  await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, 0, 0, 0, 1)", w);
  const before = await Q.today(w);
  await pg.run(`insert into mine.swap_events (session, step, wallet, route, at) values ('questswap01', 'quote', ?, 'relay', ?)`, w, new Date(clock).toISOString());
  const quoted = await Q.today(w);
  await pg.run(`insert into mine.swap_events (session, step, wallet, route, at) values ('questswap01', 'success', ?, 'relay', ?)`, w, new Date(clock).toISOString());
  const after = await Q.today(w);
  check("swap quest: a quote isn't a buy; the box's success is", !before.quests[2].done && !quoted.quests[2].done && after.quests[2].done, JSON.stringify(after.quests[2]));
}

// the next days: streak, a freeze, a milestone note
for (let i = 1; i <= 6; i++) { clock += DAY; await Q.checkin(big); }
const t7 = await Q.today(big);
check("7 days in a row: streak 7, a freeze", t7.streak.days === 7 && t7.streak.freezes === 1, JSON.stringify(t7.streak));
check("checkin XP: 7 x 2 + 10", await xpOf(big, "checkin") === 24, `${await xpOf(big, "checkin")}`);
check("the milestone goes to the bell", !!(await pg.one("select 1 from mine.notices where wallet = ? and text like '%7 days in a row%'", big)));
clock += 2 * DAY;
const c9 = await Q.checkin(big);
check("a missed day is covered by the freeze", c9.today.streak.days === 8 && c9.freezes_used === 1 && c9.today.streak.freezes === 0);
check("new day, new quests, no reroll used", !c9.today.reroll_used && c9.today.quests.every((x) => !x.done));

// the streaks board: big's streak is going, team off
const sb = await Q.streaks() as { rows: { wallet: string; days: number }[] };
check("streaks board: big's streak of 8", sb.rows.some((r) => r.wallet === big && r.days === 8), JSON.stringify(sb.rows));

// team: books, but no bell note
for (let i = 0; i < 7; i++) await Q.checkin(team).then(() => { clock += DAY; });
check("team wallets get no bell notes", !(await pg.one("select 1 from mine.notices where wallet = ?", team)));
clock -= DAY;   // the team's last check-in day: its streak is going, and stays off the board
const Q2 = createQuests({ pg, end: Infinity, exclude: [team], HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => team, now: () => clock });
check("team wallets stay off the streaks board", !((await Q2.streaks()) as { rows: { wallet: string }[] }).rows.some((r) => r.wallet === team));
clock += DAY;

// the season end
const ended = createQuests({ pg, end: clock - 1, exclude: [], HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => big, now: () => clock });
err = null;
await ended.checkin(flyOwner).catch((e) => { err = e; });
check("nothing after the season ends", (err as HttpError)?.status === 409 && (await ended.today(flyOwner)).ended);

// ---- 2026-11-07: paid rerolls (burn()), the new quests, the X post ----
{
  const ZERO = "0x0000000000000000000000000000000000000000", DEAD = "0x000000000000000000000000000000000000dead";
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
  const burnRec = (from: string, flyai: bigint, to = ZERO) => ({ status: "0x1", logs: [{ address: FLYAI, topics: [TRANSFER, pad(from), pad(to)],
    data: `0x${(flyai * E18).toString(16)}` }] });
  const receipts = new Map<string, any>();
  const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  let qclock = Date.UTC(2026, 10, 8, 10);
  const D = dayOf(qclock);
  check("new lists from 11-07, the old ones before", listsOf("2026-11-06").move.length === 4 && listsOf(D).move.includes("feed")
    && listsOf(D).social.includes("xpost") && listsOf(D).visit.includes("desk"));
  // a wallet whose first paid move slot is the top-up quest
  const w = Array.from({ length: 2000 }, (_, i) => addr(0xe000 + i)).find((x) => questAt(x, D, "move", null, 1) === "topup")!;
  await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, 0, 0, 0, 1)", w);
  const Q3 = createQuests({ pg, end: Infinity, exclude: [], HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => w,
    now: () => qclock, receipt: async (tx) => receipts.get(tx) ?? null });
  let e: any = null;
  const tryIt = async (f: () => Promise<unknown>) => { e = null; try { await f(); } catch (x) { e = x; } return e; };
  const t0 = await Q3.today(w);
  check("today carries the paid reroll terms", t0.paid.burn_flyai === 20_000 && t0.paid.max === 5 && t0.paid.used === 0 && t0.quests.every((q) => q.slot === 0));
  // a deposit before the burn: it must not count for the paid slot
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, token, amount, usd, at) values (?, 'robinhood', 'deposit', ?, 'USDG', '30', 30, ?)`,
    addr(0xfa), w, new Date(qclock - 60_000).toISOString());
  receipts.set(TX(1), burnRec(w, 19_999n));
  check("burn too small: refused", (await tryIt(() => Q3.buyReroll(w, "move", TX(1))))?.status === 400);
  receipts.set(TX(2), burnRec(addr(0xbad), 20_000n));
  check("someone else's burn: refused", (await tryIt(() => Q3.buyReroll(w, "move", TX(2))))?.status === 400);
  check("not mined yet: try again", (await tryIt(() => Q3.buyReroll(w, "move", TX(99))))?.status === 409);
  receipts.set(TX(3), burnRec(w, 20_000n));
  const r1 = await Q3.buyReroll(w, "move", TX(3));
  const mv = r1.today.quests[2];
  check("a paid reroll moves the group to its next quest, even a done one", mv.slot === 1 && mv.id === "topup" && !mv.done, JSON.stringify(mv));
  check("the same burn counts once", (await tryIt(() => Q3.buyReroll(w, "move", TX(3))))?.status === 409);
  check("the earlier deposit doesn't count for the paid slot", !(await Q3.today(w)).quests[2].done);
  qclock += 60_000;
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, token, amount, usd, at) values (?, 'robinhood', 'deposit', ?, 'USDG', '12', 12, ?)`,
    addr(0xfb), w, new Date(qclock).toISOString());
  const t1 = await Q3.today(w);
  check("a deposit after the burn completes it and pays", t1.quests[2].done && !!(await pg.one("select 1 from mine.xp_events where ref = ?", `quest:${w}:${D}:topup:p1`)));
  receipts.set(TX(4), burnRec(w, 25_000n, DEAD));
  const r2 = await Q3.buyReroll(w, "move", TX(4));
  check("the old dead-address burn still counts; slot 2", r2.today.quests[2].slot === 2 && r2.today.paid.used === 2);
  for (const n of [5, 6, 7]) { receipts.set(TX(n), burnRec(w, 20_000n)); await Q3.buyReroll(w, n === 7 ? "visit" : "social", TX(n)); }
  receipts.set(TX(8), burnRec(w, 20_000n));
  check("5 paid rerolls a day at most", (await tryIt(() => Q3.buyReroll(w, "move", TX(8))))?.status === 409 && (await Q3.today(w)).paid.used === 5);
  // a paid visit slot: its quest pays when the page reports it
  const vis = (await Q3.today(w)).quests[0];
  const v = await Q3.visit(w, vis.id);
  check("a paid visit slot pays on the page's report", v.gained === 2 && v.today.quests[0].done, JSON.stringify(v.today.quests[0]));

  // the X post quest: posts come in overnight (xp.ts shares() fills mine.xp_quest_posts), the tick settles their day
  const xw = Array.from({ length: 2000 }, (_, i) => addr(0xe9000 + i)).find((x) => pick(x, D)[1] === "xpost")!;
  const ow = Array.from({ length: 2000 }, (_, i) => addr(0xea000 + i)).find((x) => pick(x, D)[1] !== "xpost")!;
  for (const x of [xw, ow]) await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, 0, 0, 0, 1)", x);
  const Q4 = createQuests({ pg, end: Infinity, exclude: [], HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => xw,
    now: () => qclock });
  const posted = new Date(qclock - 3_600_000).toISOString();
  await pg.run(`insert into mine.xp_quest_posts (post_id, wallet, day, posted_at) values ('5555555', ?, ?, ?), ('6666666', ?, ?, ?)`,
    xw, D, posted, ow, D, posted);
  qclock = Date.parse(`${D}T00:00:00Z`) + 86_400_000 + 3 * 3_600_000;   // next morning, after the nightly search
  await Q4.tick();
  await Q4.tick();
  const paidPost = await pg.all<{ ref: string }>("select ref from mine.xp_events where source = 'quest' and ref like ?", `quest:${xw}:${D}:%`);
  check("an overnight post settles that day's X quest, once", paidPost.filter((r) => r.ref === `quest:${xw}:${D}:xpost`).length === 1, JSON.stringify(paidPost));
  check("a post doesn't pay a quest the wallet didn't have", !(await pg.one("select 1 from mine.xp_events where ref = ?", `quest:${ow}:${D}:xpost`)));
  check("the paste endpoint is gone", !("xpost" in Q4));
}

// ---- 2026-11-09: referral quests (one-off, not in the daily three) and the ambassador form ----
{
  const rw = addr(0xb100);
  await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, 0, 0, 0, 1)", rw);
  const Q5 = createQuests({ pg, end: Infinity, exclude: [team], HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => rw, now: () => clock });
  const t0 = await Q5.today(rw);
  check("referral quests listed, none done with no referrals", t0.referrals.real === 0 && t0.referrals.quests.length === REF_QUESTS.length && t0.referrals.quests.every((q) => !q.done));
  for (let i = 0; i < 3; i++) {
    await pg.run("insert into mine.referrals (wallet, referrer, via, qualified_at) values (?, ?, 'link', now())", addr(0xb200 + i), rw);
  }
  await pg.run("insert into mine.referrals (wallet, referrer, via) values (?, ?, 'link')", addr(0xb2ff), rw);   // not real yet
  const t1 = await Q5.today(rw);
  const done = t1.referrals.quests.filter((q) => q.done).map((q) => q.need);
  check("3 real referrals: the 1 and 3 quests pay, 5 doesn't", t1.referrals.real === 3 && done.join(",") === "1,3", JSON.stringify(t1.referrals));
  const xp = await pg.one<{ n: number }>("select coalesce(sum(xp), 0)::int as n from mine.xp_events where wallet = ? and source = 'refquest'", rw);
  check("their XP is booked once", xp?.n === 75);
  await Q5.today(rw);
  check("asking again books nothing more", (await pg.one<{ n: number }>("select count(*)::int as n from mine.xp_events where wallet = ? and source = 'refquest'", rw))?.n === 2);
  check("they aren't part of the daily three", t1.quests.length === 3);

  // the ambassador form
  let body: any = {};
  const sent: any[] = [];
  const A = createAmbassadors({ pg, HttpError, send: (_r, status, b) => { sent.push({ status, b }); }, readJson: async () => body,
    sessionWallet: async () => rw, isAdmin: (req: any) => req.headers.authorization === "Bearer ok", now: () => clock });
  const fail = async (b: any) => { body = b; try { await A.apply({ headers: {} } as any); return null; } catch (e: any) { return e.status; } };
  check("no name: refused", (await fail({ x: "a", why: "x".repeat(30) })) === 400);
  check("no X or Telegram: refused", (await fail({ name: "Ann", why: "x".repeat(30) })) === 400);
  check("a one-line why: refused", (await fail({ name: "Ann", x: "ann", why: "short" })) === 400);
  body = { name: "Ann", x: "https://x.com/Ann_1", telegram: "@ann", lang: "ko", community: "KR group, 2k", why: "I run a Korean trading group of 2,000 people." };
  const r1 = await A.apply({ headers: {} } as any);
  check("an application is stored, handles cleaned", r1.application.x === "Ann_1" && r1.application.telegram === "ann" && r1.application.lang === "ko");
  body = { ...body, lang: "xx" };
  await A.apply({ headers: {} } as any);
  const apps = await A.applications();
  check("sending again replaces it; unknown language is 'other'", apps.applications.length === 1 && apps.applications[0].lang === "other");
  let denied = 0;
  try { await A.route({ method: "GET", headers: {} } as any, {} as any, new URL("http://x/api/ambassadors/applications")); } catch (e: any) { denied = e.status; }
  check("the list of applications is admin only", denied === 403);
  check("not an ambassador before the badge", !(await A.isAmbassador(rw)));
  await pg.run("insert into mine.badge_claims (wallet, badge, at) values (?, 12, now())", rw);
  check("badge #12 makes an ambassador", await A.isAmbassador(rw) && (await A.list()).ambassadors.some((x: any) => x.wallet === rw && x.lang === "other"));
}

await PG.stop();
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
