/**
 * Fly levels, titles and squads (src/flylevels.ts): pure, no database.
 *   npm run test:flylevels
 */
import { flyLevel, flyLevelOf, flyLevels, type FlyStats, type Moves } from "./flylevels.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const DAY = 86_400_000, NOW = Date.UTC(2026, 10, 6);
const A = "0x00000000000000000000000000000000000000aa", B = "0x00000000000000000000000000000000000000bb";
const TEAM = "0x625862521777e19ad54ce6c7abed9ca54d6589ea";

check("level curve", flyLevelOf(0) === 0 && flyLevelOf(49) === 0 && flyLevelOf(50) === 1 && flyLevelOf(200) === 2 && flyLevelOf(450) === 3);

// 30 days, 10 trades, +$5: 300 + 50 + 100 = 450 -> level 3
const s: FlyStats = { holder: A, trades: 10, profit: 5 };
const m: Moves = { firstDeposit: NOW - 30 * DAY, lastWithdraw: null };
const l = flyLevel(s, m, NOW);
check("xp from days, trades, profit", l.xp === 450 && l.level === 3 && l.days === 30, JSON.stringify(l));
check("next level", l.at === 450 && l.next === 800);
check("diamond: 30 days, never withdrawn", l.titles.includes("diamond"));
check("a loss takes nothing away", flyLevel({ ...s, profit: -40 }, m, NOW).xp === 350);
check("withdrawn after funding: no diamond", !flyLevel(s, { ...m, lastWithdraw: NOW - DAY }, NOW).titles.includes("diamond"));
check("withdraw before this funding: still diamond", flyLevel(s, { ...m, lastWithdraw: NOW - 40 * DAY }, NOW).titles.includes("diamond"));
check("29 days: no diamond", !flyLevel(s, { ...m, firstDeposit: NOW - 29 * DAY }, NOW).titles.includes("diamond"));
check("no deposit known: 0 days", flyLevel(s, undefined, NOW).days === 0);

const sell = (at: number, pnl: number) => ({ at, side: "sell", pnl_pct: pnl });
const hot = flyLevel({ ...s, recent: [sell(5, 2), sell(4, 1), sell(3, 0.5), { at: 2, side: "buy" }, sell(1, -3)] }, m, NOW);
check("hot: last 3 sells won", hot.titles.includes("hot"));
check("not hot: newest sell lost", !flyLevel({ ...s, recent: [sell(6, -1), sell(5, 2), sell(4, 1), sell(3, 1)] }, m, NOW).titles.includes("hot"));
check("not hot: only 2 wins", !flyLevel({ ...s, recent: [sell(5, 2), sell(4, 1)] }, m, NOW).titles.includes("hot"));
check("hot reads newest first whatever the order", flyLevel({ ...s, recent: [sell(1, -5), sell(2, 1), sell(3, 1), sell(4, 1)] }, m, NOW).titles.includes("hot"));
check("sniper: +50% sell", flyLevel({ ...s, recent: [sell(1, 50)] }, m, NOW).titles.includes("sniper"));
check("no sniper at +49.9%", !flyLevel({ ...s, recent: [sell(1, 49.9)] }, m, NOW).titles.includes("sniper"));
check("grinder: 100 trades", flyLevel({ ...s, trades: 100 }, m, NOW).titles.includes("grinder") && !l.titles.includes("grinder"));

// squads: A has 2 flies (levels 3 + 1), B one fly at level 3 with more XP; team off the board
const flies: Record<string, FlyStats> = {
  1: { holder: A, trades: 10, profit: 5 }, 2: { holder: A.toUpperCase().replace("0X", "0x"), trades: 10, profit: 0 },
  3: { holder: B, trades: 100, profit: 0 }, 4: { holder: TEAM, trades: 500, profit: 100 }, 5: { holder: null, trades: 3, profit: 0 },
};
const moves = new Map<string, Moves>([[`1:${A}`, m], [`3:${B}`, { firstDeposit: NOW - 10 * DAY, lastWithdraw: null }]]);
const r = flyLevels(flies, moves, NOW, [TEAM]);
const qa = r.squads.find((q) => q.holder === A), qb = r.squads.find((q) => q.holder === B);
check("every fly gets a level, team and holderless too", Object.keys(r.flies).length === 5);
check("holder matched case-blind", qa?.flies.length === 2, JSON.stringify(qa));
check("squad score = levels added", qa?.score === r.flies[1].level + r.flies[2].level, `${qa?.score}`);
check("team off the board", !r.squads.some((q) => q.holder === TEAM) && r.squads.length === 2);
check("ranked by score", r.squads[0].score >= r.squads[1].score && r.squads[0].rank === 1 && r.squads[1].rank === 2);
check("tie on score: more XP first", (() => {
  const t = flyLevels({ 1: { holder: A, trades: 10, profit: 0 }, 2: { holder: B, trades: 12, profit: 0 } }, new Map(), NOW);
  return t.squads[0].holder === B && t.squads[0].score === t.squads[1].score;
})());
void qb;

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
