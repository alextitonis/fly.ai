/**
 * Fly Colosseum's readout and balance, measured on the real connectome (the same files and engine the page and the
 * server run).
 *   node --experimental-strip-types tools/arena.ts [seeds=6] [fights=6]   spikes vs scent and loom, then whole fights
 *   node --experimental-strip-types tools/arena.ts --screen [seeds=5]     which descending/motor types each stimulus drives
 *   node --experimental-strip-types tools/arena.ts --balance [fights=20000]  what a point of each stat is worth (stand-in brain, no connectome)
 *   node --experimental-strip-types tools/arena.ts --edge [fights=30]     real-brain fights: even stats, then +8 points of each stat
 * The default run takes about a minute on a desktop; --screen about 6 s per seed; --edge about 3 s per fight.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ConnectomeBrain, cells, cellsWithPrefix, parseMeta, parseWeights } from "../src/connectome.ts";
import { READOUT, RIVAL_ORNS, groups, runRound, type Counts } from "../src/arena/readout.ts";
import { RULES, deriveRng, maxHp, playFight, setupFight, sfc32, type EndEvent, type RoundBrain } from "../src/arena/game.ts";
import { COLORWAY_POINTS, EXTRAS, GEAR, POSES, BACKGROUNDS, STATS, statsOf, type Stats, type Traits } from "../src/arena/stats.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ZERO: Stats = { pow: 0, grd: 0, vit: 0, fury: 0 };

/**
 * A stand-in brain fitted to real fights (--dump, 36 fights): a brain's first window gives about 17 + 58 x scent
 * charge spikes, later windows about 38 + 35 x scent (the brain has warmed up), each brain a little above or below
 * (sd 1.7) and each window a little more (sd 2); escape spikes follow the loom closely (sd 2.5). Good enough to weigh
 * the stats against each other over many fights without running the connectome; --edge checks it on real brains.
 */
const ESCAPE_CURVE: [number, number][] = [[0, 4.4], [0.01, 8.8], [0.03, 15.8], [0.05, 34], [0.07, 41.1], [0.09, 49.1], [0.11, 56.5], [0.13, 62.3], [0.15, 67.4], [0.16, 71]];
function standIn(seed: number): (scent: number, loom: number) => Counts {
  const u = sfc32(seed, seed ^ 0x9e3779b9, 7, 11);
  for (let k = 0; k < 12; k++) u();
  const gauss = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const own = 1.7 * gauss();                       // this brain's own level, kept for the fight
  let windows = 0;
  return (scent, loom) => {
    let k = 1;
    while (k < ESCAPE_CURVE.length - 1 && ESCAPE_CURVE[k][0] < loom) k++;
    const [x0, y0] = ESCAPE_CURVE[k - 1], [x1, y1] = ESCAPE_CURVE[k];
    const esc = y0 + (y1 - y0) * (loom - x0) / (x1 - x0);
    const level = windows++ === 0 ? 17 + 58 * scent : 38.3 + 35 * scent;
    return { charge: Math.max(0, Math.round(level + own + 2 * gauss())), escape: Math.max(0, Math.round(esc + 2.5 * gauss())) };
  };
}

/** Random traits with the collection's odds (FlyTraits.sol: tiers 3/12/25/60%, gear and extra by rarity). */
function randomTraits(u: () => number): Traits {
  const int = (n: number) => Math.floor(u() * n);
  const x = u();
  const rarity = x < 0.03 ? 3 : x < 0.15 ? 2 : x < 0.4 ? 1 : 0;
  const noGear = [0.3, 0.2, 0.1, 0][rarity], noExtra = [0.4, 0.25, 0.1, 0][rarity];
  const gearOrder = [1, 5, 6, 2, 7, 8, 3, 4, 9];
  return {
    rarity, pose: int(POSES.length), colorway: int(COLORWAY_POINTS), background: int(BACKGROUNDS.length),
    gear: u() < noGear ? 0 : gearOrder[int([3, 6, 9, 9][rarity])],
    extra: u() < noExtra ? 0 : 1 + int([4, 8, 11, 13][rarity]),
  };
}
void GEAR; void EXTRAS;

if (process.argv.includes("--balance")) {
  const N = Number(args[0] ?? 20000);
  const winRate = async (a: Stats, b: Stats, label: string) => {
    let wins = 0, rounds = 0, ko = 0;
    for (let f = 0; f < N; f++) {
      const rng = await deriveRng(`balance-${label}-${f}`, "tools/arena.ts");
      const { seeds } = setupFight(rng);
      const brains = seeds.map(standIn);
      // side swapped every other fight, so nothing here depends on the side
      const flip = f % 2 === 1;
      const stats: [Stats, Stats] = flip ? [b, a] : [a, b];
      for await (const e of playFight(stats, rng, (side, _r, scent, loom) => brains[side](scent, loom))) {
        if (e.type !== "end") continue;
        if ((e.winner === 0) !== flip) wins++;
        rounds += e.rounds;
        if (e.how === "ko") ko++;
      }
    }
    return { p: wins / N, rounds: rounds / N, ko: ko / N };
  };
  const base: Stats = { pow: 5, grd: 5, vit: 5, fury: 5 };   // a typical fly
  const even = await winRate(base, base, "even");
  console.log(`${N} fights each, stand-in brain; rules ${JSON.stringify(RULES)}`);
  console.log(`even stats: ${(100 * even.p).toFixed(1)}% (want 50), ${even.rounds.toFixed(1)} rounds, ${(100 * even.ko).toFixed(0)}% knockouts`);
  for (const k of STATS) for (const add of [4, 8]) {
    const r = await winRate({ ...base, [k]: base[k] + add }, base, `${k}${add}`);
    console.log(`  +${add} ${k.padEnd(4)}: ${(100 * r.p).toFixed(1)}%  (${((100 * r.p - 50) / add).toFixed(2)} points of win rate per stat point)`);
  }
  const all = await winRate({ pow: 6, grd: 6, vit: 6, fury: 6 }, base, "all1");
  console.log(`  +1 every stat: ${(100 * all.p).toFixed(1)}%`);
  // the collection: random flies with the mint's odds, by rarity
  const u = sfc32(1, 2, 3, 4);
  const flies = Array.from({ length: 400 }, () => randomTraits(u));
  const by = [0, 1, 2, 3].map(() => ({ w: 0, n: 0 }));
  const pts: number[][] = [[], [], [], []];
  let f = 0;
  for (const a of flies) for (let k = 0; k < 40; k++) {
    const b = flies[Math.floor(u() * flies.length)];
    if (a === b) continue;
    const rng = await deriveRng(`collection-${f++}`, "tools/arena.ts");
    const brains = setupFight(rng).seeds.map(standIn);
    for await (const e of playFight([statsOf(a), statsOf(b)], rng, (side, _r, scent, loom) => brains[side](scent, loom))) {
      if (e.type === "end") { by[a.rarity].n++; if (e.winner === 0) by[a.rarity].w++; }
    }
  }
  for (const t of flies) { const s = statsOf(t); pts[t.rarity].push(s.pow + s.grd + s.vit + s.fury); }
  console.log("random flies of the collection against random flies:");
  ["Common", "Uncommon", "Rare", "Legendary"].forEach((name, r) => console.log(`  ${name.padEnd(10)} ${pts[r].length ? mean(pts[r]).toFixed(1) : "-"} points, wins ${(100 * by[r].w / Math.max(1, by[r].n)).toFixed(1)}% of ${by[r].n}`));
  process.exit(0);
}

const dir = "public/connectome";
const unpack = (raw: Buffer) => { const b = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const parts: string[] = JSON.parse(readFileSync(`${dir}/brain.json`, "utf8")).parts;
const meta = parseMeta(unpack(readFileSync(`${dir}/meta.bin`)));
const w = parseWeights(unpack(Buffer.concat(parts.map((p) => readFileSync(`${dir}/${p}`)))));
const g = groups(meta, cells);

if (process.argv.includes("--screen")) {
  // every descending and motor cell type: spikes with no stimulus vs each stimulus alone, paired by brain seed
  const SEEDS = Number(args[0] ?? 5);
  const touch = cellsWithPrefix(meta, "SNta");
  const CONDS: [string, number, number, number][] = [["none", 0, 0, 0], ["scent 0.15", 0.15, 0, 0], ["scent 0.3", 0.3, 0, 0], ["loom 0.08", 0, 0.08, 0], ["loom 0.16", 0, 0.16, 0], ["touch 0.15", 0, 0, 0.15]];
  const out = cells(meta, ["descending_neuron", "efferent_descending", "vnc_motor", "cb_motor"]);
  const isOut = new Uint8Array(meta.n); for (const i of out) isOut[i] = 1;
  const T = meta.types.length;
  const res = CONDS.map(() => Array.from({ length: SEEDS }, () => new Float64Array(T)));
  for (let s = 0; s < SEEDS; s++) for (let a = 0; a < CONDS.length; a++) {
    const b = new ConnectomeBrain(w, meta.params, 1 + s * 7919);
    const [, sc, lo, to] = CONDS[a];
    for (let k = 0; k < READOUT.warmSteps + READOUT.windowSteps + 5; k++) {
      b.stimulate(g.scent, sc); b.stimulate(g.loom, lo); b.stimulate(touch, to); b.step();
      if (k < READOUT.warmSteps) continue;
      for (let q = 0; q < b.firedCount; q++) { const i = b.fired[q]; if (isOut[i]) res[a][s][meta.typeIdx[i]]++; }
    }
  }
  console.log(`rival ORNs ${RIVAL_ORNS.join(" ")} (${g.scent.length} cells), loom ${g.loom.length} cells, touch ${touch.length} cells`);
  for (const ci of [2, 4, 5]) {
    const rows: [string, number, string][] = [];
    for (let t = 0; t < T; t++) {
      const m = CONDS.map((_, a) => mean(res[a].map((r) => r[t])));
      if (Math.max(...m) < 2) continue;
      const d = res[0].map((r, s) => res[ci][s][t] - r[t]);
      rows.push([meta.types[t], mean(d) / (sd(d) || 0.5) * Math.sqrt(SEEDS), m.map((x) => x.toFixed(1)).join(" / ")]);
    }
    rows.sort((a, b) => b[1] - a[1]);
    console.log(`\n${CONDS[ci][0]} vs none; spikes at ${CONDS.map((c) => c[0]).join(" / ")}; paired t`);
    for (const r of rows.slice(0, 20)) console.log(`  ${r[0].padEnd(24)} t ${r[1].toFixed(1).padStart(6)}   ${r[2]}`);
  }
  process.exit(0);
}

/** A fight on real brains. */
async function realFight(label: string, stats: [Stats, Stats]) {
  const rng = await deriveRng(label, "tools/arena.ts");
  const { seeds } = setupFight(rng);
  const brains = seeds.map((s) => new ConnectomeBrain(w, meta.params, s));
  const brain: RoundBrain = (side, _r, scent, loom) => runRound(brains[side], g, scent, loom);
  const rows: string[] = [];
  let end: EndEvent | null = null;
  for await (const e of playFight(stats, rng, brain)) {
    if (e.type === "round") rows.push(`    round ${e.round}: charge ${e.charge.join(" ")}  escape ${e.escape.join(" ")}  dealt ${e.dealt.join(" ")}  hp ${e.hp.join(" ")}`);
    else end = e;
  }
  return { end: end!, rows };
}

if (process.argv.includes("--dump")) {
  // every round of N even fights, one JSON line each: what the stand-in brain above is fitted to
  const N = Number(args[0] ?? 30);
  for (let f = 0; f < N; f++) {
    const rng = await deriveRng(`dump-${f}`, "tools/arena.ts");
    const { seeds } = setupFight(rng);
    const brains = seeds.map((s) => new ConnectomeBrain(w, meta.params, s));
    for await (const e of playFight([ZERO, ZERO], rng, (side, _r, scent, loom) => runRound(brains[side], g, scent, loom))) {
      if (e.type === "round") console.log(JSON.stringify({ f, round: e.round, scent: e.scent, loom: e.loom, charge: e.charge, escape: e.escape }));
    }
  }
  process.exit(0);
}

if (process.argv.includes("--edge")) {
  const N = Number(args[0] ?? 30);
  const base: Stats = { pow: 5, grd: 5, vit: 5, fury: 5 };
  const run = async (name: string, a: Stats) => {
    let wins = 0, rounds = 0;
    for (let f = 0; f < N; f++) {
      const flip = f % 2 === 1;
      const { end } = await realFight(`edge-${name}-${f}`, flip ? [base, a] : [a, base]);
      if ((end.winner === 0) !== flip) wins++;
      rounds += end.rounds;
    }
    console.log(`  ${name.padEnd(10)} wins ${wins}/${N} (${(100 * wins / N).toFixed(0)}%), ${(rounds / N).toFixed(1)} rounds`);
  };
  console.log(`real brains, ${N} fights each against a 5/5/5/5 fly:`);
  await run("even", base);
  for (const k of STATS) await run(`+8 ${k}`, { ...base, [k]: base[k] + 8 });
  process.exit(0);
}

const SEEDS = Number(args[0] ?? 6), FIGHTS = Number(args[1] ?? 6);

// 1. windows on fresh brains (three in a row each): spikes per scent and per loom, across brain seeds
console.log(`readout: ${READOUT.warmSteps} + ${READOUT.windowSteps} steps per round`);
const curve = (scent: number, loom: number) => {
  const c: number[] = [], e: number[] = [];
  for (let s = 0; s < SEEDS; s++) {
    const b = new ConnectomeBrain(w, meta.params, 11 + s * 7919);
    for (let r = 0; r < 3; r++) { const n = runRound(b, g, scent, loom); c.push(n.charge); e.push(n.escape); }
  }
  return `charge ${mean(c).toFixed(1)} sd ${sd(c).toFixed(1)}   escape ${mean(e).toFixed(1)} sd ${sd(e).toFixed(1)}`;
};
for (const scent of [0, RULES.scentMin, 0.08, 0.12, 0.16, RULES.scentMax]) console.log(`  scent ${scent.toFixed(2)} loom 0.08: ${curve(scent, 0.08)}`);
for (const loom of [0, RULES.loomBase, 0.06, 0.1, 0.13, RULES.loomMax]) console.log(`  scent 0.12 loom ${loom.toFixed(2)}: ${curve(0.12, loom)}`);

// 2. whole fights on real brains, even stats
const t0 = performance.now();
let rounds = 0;
for (let f = 0; f < FIGHTS; f++) {
  const { end, rows } = await realFight(`measure-${f}`, [ZERO, ZERO]);
  rounds += end.rounds;
  console.log(`  fight ${f}: side ${end.winner} wins by ${end.how} in ${end.rounds} rounds (hp ${maxHp(ZERO)} each)`);
  for (const r of rows) console.log(r);
}
console.log(`${FIGHTS} fights: ${((performance.now() - t0) / FIGHTS).toFixed(0)} ms per fight, ${(rounds / FIGHTS).toFixed(1)} rounds`);
