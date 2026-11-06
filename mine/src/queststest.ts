/**
 * Daily check-in and quests (src/quests.ts): the streak, freezes and milestones, the seed and reroll, then against a
 * real Postgres: the 10k / fly gate, one check-in a day, visit quests, quests found in the data (a deposit, a swap-box
 * buy), the all-3 bonus, no double booking, the season end, and the XP showing up in xp_events.
 *   npm run test:quests
 */
import { checkIn, createQuests, dayOf, GROUPS, pick, QUESTS, standing, type Streak } from "./quests.ts";
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

await PG.stop();
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
