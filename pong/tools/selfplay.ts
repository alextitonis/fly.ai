/**
 * The fly against a perfect wall (your paddle always under the ball), headless: how many balls that reach the fly
 * does it return? Controls: a still paddle, and the same brain with its left and right steering swapped.
 *
 *   node --experimental-strip-types tools/selfplay.ts [balls=40] [gain]
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ConnectomeBrain, cells, parseMeta, parseWeights } from "../lib/connectome.ts";
import { FLY, SEE, STEER, Steering, eyes } from "../lib/fly.ts";
import { FIELD, movePaddle, newGame, step } from "../lib/pong.ts";
import { mulberry32 } from "../lib/rng.ts";

const dir = "public/connectome";
const unpack = (raw: Buffer) => { const b = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const parts: string[] = JSON.parse(readFileSync(`${dir}/brain.json`, "utf8")).parts;
const meta = parseMeta(unpack(readFileSync(`${dir}/meta.bin`)));
const w = parseWeights(unpack(Buffer.concat(parts.map((p) => readFileSync(`${dir}/${p}`)))));
const BALLS = Number(process.argv[2] ?? 40);
if (process.argv[3]) FLY.gain = Number(process.argv[3]);
const see = { L: cells(meta, SEE, "L"), R: cells(meta, SEE, "R") };
const side = new Int8Array(w.n);
for (const i of cells(meta, STEER, "L")) side[i] = 1;
for (const i of cells(meta, STEER, "R")) side[i] = 2;
const dt = meta.params.dt;

function run(mode: "brain" | "swapped" | "still", seed: number) {
  const rand = mulberry32(seed);
  const brain = new ConnectomeBrain(w, meta.params, seed);
  for (let i = 0; i < 25; i++) brain.step();
  const steer = new Steering();
  const g = newGame(rand);
  let reached = 0, returned = 0, t0 = performance.now(), steps = 0;
  while (reached < BALLS) {
    const e = eyes(g);
    brain.stimulate(see.L, e.L);
    brain.stimulate(see.R, e.R);
    brain.step(); steps++;
    let l = 0, r = 0;
    for (let k = 0; k < brain.firedCount; k++) { const s = side[brain.fired[k]]; if (s === 1) l++; else if (s === 2) r++; }
    if (mode === "swapped") [l, r] = [r, l];
    steer.update(l, r, dt);
    if (mode !== "still") movePaddle(g, "fly", steer.vy, dt);
    for (let s = 0; s < 4; s++) {
      g.you = Math.min(FIELD.h - 48, Math.max(48, g.ball.y));
      step(g, dt / 4, rand);
      if (g.event === "hit-fly") { reached++; returned++; }
      if (g.event === "point-you") reached++;
    }
    g.score.you = 0; g.score.fly = 0;
  }
  return { returned, reached, ms: (performance.now() - t0) / steps };
}

for (const mode of ["brain", "swapped", "still"] as const) {
  const r = run(mode, 11);
  console.log(`${mode.padEnd(8)} returned ${r.returned}/${r.reached} (${(100 * r.returned / r.reached).toFixed(0)}%)  ${r.ms.toFixed(1)} ms/step`);
}
