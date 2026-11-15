/** The Fly League (league.ts): scoring, brackets, places per owner, and a week's close (XP, badge, notices, once). */
import { bracketOf, createLeague, dayKey, mondayOf, rank, scoreOf, type Entry } from "./league.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  (${detail})`}`);
  if (!ok) failed++;
};
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const H = 3600, D = 86_400;

// scoring
const start = mondayOf(Date.UTC(2026, 10, 11, 12) / 1000);
check("a Monday 00:00 UTC", new Date(start * 1000).getUTCDay() === 1 && start % D === 0, new Date(start * 1000).toISOString());
const curve = (n: number, value: (i: number) => number, profit: (i: number) => number, from = start) =>
  Array.from({ length: n }, (_, i) => ({ t: from + i * H, value: value(i), profit: profit(i) }));
const steady = scoreOf(curve(168, () => 100, (i) => i * 5 / 167), start, start + 7 * D, 10)!;
check("steady +$5 on $100: +5%, no drop", Math.abs(steady.ret - 5) < 0.01 && steady.drop === 0 && Math.abs(steady.score - 5) < 0.01, JSON.stringify(steady));
const bumpy = scoreOf(curve(168, () => 100, (i) => (i < 84 ? -i * 10 / 84 : -10 + (i - 84) * 16 / 83)), start, start + 7 * D, 10)!;
check("+6% that went -10% scores 1 (6 - 10/2)", Math.abs(bumpy.ret - 6) < 0.01 && Math.abs(bumpy.drop - 10) < 0.01 && Math.abs(bumpy.score - 1) < 0.05, JSON.stringify(bumpy));
check("joined mid-week: out", scoreOf(curve(100, () => 100, () => 0, start + 60 * H), start, start + 7 * D, 10) === null);
check("under $10: out", scoreOf(curve(168, () => 5, () => 0), start, start + 7 * D, 10) === null);
check("a saved start counts instead of the curve's first point",
  Math.abs(scoreOf(curve(150, () => 100, () => 3, start + 18 * H), start, start + 7 * D, 10, { profit: 1, value: 100 })!.profit - 2) < 1e-9);
check("brackets", bracketOf(30) === "larva" && bracketOf(50) === "buzz" && bracketOf(249) === "buzz" && bracketOf(250) === "swarm");

// places: per owner (their best fly), podium only with a week that made something
const e = (holder: string, score: number, profit: number, avg = 30): Entry =>
  ({ key: `vault:${holder}${score}`, vault: "v", book: "robinhood", flies: [1], holder, avg, profit, ret: score, drop: 0, score, bracket: bracketOf(avg) });
const r = rank([e("a", 9, 3), e("a", 8, 2), e("b", 7, 1), e("c", 1, 0.1), e("d", -2, -1), e("big", 4, 20, 500)], [25, 15, 10]);
const L = r.larva;
check("owner a's best fly places 1st, its second fly no place", L[0].holder === "a" && L[0].place === 1 && L[1].holder === "a" && L[1].place === null);
check("XP 300/200/100 + 10 for a green week, once per owner", L[0].xp === 310 && L[1].xp === 0 && L[2].xp === 210 && L[3].xp === 110, L.map((x) => x.xp).join());
check("a red week: no podium XP, no green XP", L[4].place === 4 && L[4].xp === 0);
check("prizes listed for the podium", L[0].prize_usd === 25 && L[2].prize_usd === 15 && L[3].prize_usd === 10 && L[4].prize_usd === 0);
check("swarm ranks on its own", r.swarm.length === 1 && r.swarm[0].place === 1);

// a week's close
const PG = await startPg(55_000 + Math.floor(Math.random() * 1000));
const pg = PG.pg;
let clock = (start + 7 * D + 20 * 60) * 1000;   // 20 minutes into the next week
const team = addr(0xee);
const L1 = createLeague({ pg, exclude: [team], HttpError: class extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } } as any,
  send: () => {}, env: {}, now: () => clock });
const put = (key: string, v: unknown) => pg.run("insert into mine.vault_public (key, value) values (?, ?::text::jsonb)", key, JSON.stringify(v));
const W1 = addr(0x101), W2 = addr(0x102), V1 = addr(0x201), V2 = addr(0x202), V3 = addr(0x203), V4 = addr(0x204);
// the curves as they stand at the close: 168 points ending at the new week's first hour (so the old week's first is gone)
const at = (p: (i: number) => number, v = 100) => Array.from({ length: 168 }, (_, i) => ({ t: start + (i + 1) * H, value: v, profit: p(i) }));
await put(`vault:${V1}`, { holder: W1, flies: [7], curve: at((i) => i * 0.05) });           // +8.35% steady
await put(`vault:p_bullas:${V2}`, { holder: W2, flies: [3], curve: at((i) => i * 0.02) });  // a partner wallet
await put(`vault:${V3}`, { holder: team, flies: [9], curve: at((i) => i) });                 // team: out
await put(`vault:solana:${V4}`, { holder: W1, flies: [7], curve: at((i) => i) });            // not a league book
const week = await L1.close();
check("the week closed with 2 wallets (team and non-league books out)", !!week && week.entries === 2, JSON.stringify(week?.brackets));
const buzz = week!.brackets.buzz;
check("W1 then the partner NFT's owner, in the $50-250 bracket", buzz[0]?.holder === W1 && buzz[1]?.holder === W2 && buzz[1].book === "p_bullas", JSON.stringify(buzz));
const xp = async (w: string) => Number((await pg.one<{ x: number }>("select coalesce(sum(xp), 0)::float8 as x from mine.xp_events where wallet = ? and ref like 'league:%'", w))!.x);
check("XP booked: 310 and 210", (await xp(W1)) === 310 && (await xp(W2)) === 210, `${await xp(W1)} ${await xp(W2)}`);
check("the winner earned the champion badge", !!(await pg.one("select 1 from mine.badge_earned where wallet = ? and badge = 'champion'", W1)));
check("a note in each podium owner's bell", Number((await pg.one<{ n: number }>("select count(*)::int as n from mine.notices where text like 'Fly League%'"))!.n) === 2);
check("closing again does nothing", (await L1.close()) === null && (await xp(W1)) === 310);
const idx = (await pg.one<{ value: any }>("select value from mine.vault_public where key = 'league:index'"))!.value;
check("the index lists the week", idx.weeks[0] === dayKey(start));
// a new week: the start snapshot is taken in its first hours, and a wallet funded after it doesn't play that week
clock = (start + 7 * D + 30 * 60) * 1000;
const live = await L1.current();
check("this week's live standings come back", live.week === dayKey(start + 7 * D) && !live.closed);
const snap = (await pg.one<{ value: any }>("select value from mine.vault_public where key = ?", `league:open:${dayKey(start + 7 * D)}`))?.value;
check("the start snapshot has the league wallets only", !!snap && !!snap[`vault:${V1}`] && !snap[`vault:${V3}`] && !snap[`vault:solana:${V4}`], JSON.stringify(snap && Object.keys(snap)));

await PG.stop();
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
