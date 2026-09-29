/**
 * Fly Race's readout, measured on the real connectome (the same files and engine the page and the server run).
 *   node --experimental-strip-types tools/race.ts [seeds=8] [races=4]    readout vs odour, then whole races
 *   node --experimental-strip-types tools/race.ts --screen [seeds=6]      which descending/motor types the fruit smell drives
 * The default run takes about a minute on a desktop; --screen about 10 s per seed.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ConnectomeBrain, cells, parseMeta, parseWeights } from "../src/connectome.ts";
import { FRUIT_ORNS, READOUT, groups, runLeg } from "../src/race/readout.ts";
import { deriveRng, LANES, ODOUR_MAX, ODOUR_MIN, playRace, setupRace } from "../src/race/game.ts";

const dir = "public/connectome";
const unpack = (raw: Buffer) => { const b = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const parts: string[] = JSON.parse(readFileSync(`${dir}/brain.json`, "utf8")).parts;
const meta = parseMeta(unpack(readFileSync(`${dir}/meta.bin`)));
const w = parseWeights(unpack(Buffer.concat(parts.map((p) => readFileSync(`${dir}/${p}`)))));
const g = groups(meta, cells);
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };

if (process.argv.includes("--screen")) {
  // every descending and motor cell type: spikes at no smell vs a strong one, paired by brain seed
  const SEEDS = Number(args[0] ?? 6), AMPS = [0, 0.15, 0.3];
  const out = cells(meta, ["descending_neuron", "efferent_descending", "vnc_motor", "cb_motor"]);
  const isOut = new Uint8Array(meta.n); for (const i of out) isOut[i] = 1;
  const T = meta.types.length;
  const res = AMPS.map(() => Array.from({ length: SEEDS }, () => new Float64Array(T)));
  for (let s = 0; s < SEEDS; s++) for (let a = 0; a < AMPS.length; a++) {
    const b = new ConnectomeBrain(w, meta.params, 1 + s * 7919);
    for (let k = 0; k < READOUT.warmSteps + 5; k++) { b.stimulate(g.smell, AMPS[a]); b.step(); }
    for (let k = 0; k < READOUT.windowSteps + 10; k++) {
      b.stimulate(g.smell, AMPS[a]); b.step();
      for (let q = 0; q < b.firedCount; q++) { const i = b.fired[q]; if (isOut[i]) res[a][s][meta.typeIdx[i]]++; }
    }
  }
  const rows: [string, number, string][] = [];
  for (let t = 0; t < T; t++) {
    const m = AMPS.map((_, a) => mean(res[a].map((r) => r[t])));
    if (Math.max(...m) < 2) continue;
    const d = res[0].map((r, s) => res[AMPS.length - 1][s][t] - r[t]);
    rows.push([meta.types[t], mean(d) / (sd(d) || 1) * Math.sqrt(SEEDS), m.map((x) => x.toFixed(1)).join(" / ")]);
  }
  rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  console.log(`fruit ORNs ${FRUIT_ORNS.join(" ")} (${g.smell.length} cells); spikes at odour ${AMPS.join(" / ")}; paired t`);
  for (const r of rows.slice(0, 25)) console.log(`  ${r[0].padEnd(24)} t ${r[1].toFixed(1).padStart(6)}   ${r[2]}`);
  process.exit(0);
}

const SEEDS = Number(args[0] ?? 8), RACES = Number(args[1] ?? 4);

// 1. one leg on a fresh brain: spikes per odour intensity, across brain seeds
console.log(`readout: ${READOUT.warmSteps} + ${READOUT.windowSteps} steps per leg, stride ${READOUT.stride}`);
for (const amp of [0, ODOUR_MIN, 0.1, 0.14, 0.18, 0.22, 0.26, ODOUR_MAX]) {
  const c: number[] = [];
  for (let s = 0; s < SEEDS; s++) c.push(runLeg(new ConnectomeBrain(w, meta.params, 1 + s * 7919), g, amp));
  console.log(`  odour ${amp.toFixed(2)}: spikes mean ${mean(c).toFixed(1)} sd ${sd(c).toFixed(1)}  [${c.join(" ")}]`);
}

// 2. whole races on real brains: time per race, and how much the odour decides
let ms = 0, legs = 0, windows = 0;
const oddsRank: number[] = [], allSpikes: number[] = [];
let rho = 0;
for (let r = 0; r < RACES; r++) {
  const rng = await deriveRng(`measure-${r}`, "tools/race.ts");
  const race = setupRace(rng);
  const brains = race.seeds.map((s) => new ConnectomeBrain(w, meta.params, s));
  const t0 = performance.now();
  let order: number[] = [];
  const perLane = new Array(LANES).fill(0);
  for await (const e of playRace(race, rng, (lane, _leg, x) => { windows++; return runLeg(brains[lane], g, x); })) {
    if (e.type === "leg") { legs++; e.spikes.forEach((s, i) => { perLane[i] += s; allSpikes.push(s); }); console.log(`  race ${r} leg ${e.leg}: spikes ${e.spikes.join(" ")}  at ${e.positions.join(" ")}`); }
    else order = e.order;
  }
  ms += performance.now() - t0;
  // rank correlation between a lane's total odour and its place
  const smell = race.odour[0].map((_, lane) => race.odour.reduce((s, row) => s + row[lane], 0));
  const bySmell = [...smell.keys()].sort((a, b) => smell[b] - smell[a]);
  const place = new Array(LANES); order.forEach((lane, k) => { place[lane] = k; });
  const sRank = new Array(LANES); bySmell.forEach((lane, k) => { sRank[lane] = k; });
  let d2 = 0; for (let i = 0; i < LANES; i++) d2 += (place[i] - sRank[i]) ** 2;
  rho += 1 - 6 * d2 / (LANES * (LANES * LANES - 1));
  oddsRank.push(sRank[order[0]]);
  console.log(`  race ${r}: order ${order.join(" ")}  (winner was the ${sRank[order[0]] + 1}. best-smelling lane)`);
}
console.log(`${RACES} races: ${(ms / RACES).toFixed(0)} ms per race, ${(legs / RACES).toFixed(1)} legs, ${(windows / RACES).toFixed(0)} brain windows; ` +
  `spikes per leg mean ${mean(allSpikes).toFixed(1)} sd ${sd(allSpikes).toFixed(1)}; Spearman(odour, place) ${(rho / RACES).toFixed(2)}`);
