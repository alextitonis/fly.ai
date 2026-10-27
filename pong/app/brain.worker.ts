/**
 * The fly's brain, off the main thread in real time: one 20 ms connectome step per 20 ms of wall clock (or as fast as
 * it can if a step takes longer).
 *
 * in:  {type: "load", base}            base URL of the `flybrain export --web` files
 *      {type: "eyes", L, R}            LC10a volts per step for each eye, held until the next message
 * out: {type: "progress", text} · {type: "ready", n, nnz} · {type: "error", text}
 *      {type: "step", l, r, seeL, seeR, steer, fired, ms, dt}
 *        l / r: steering spikes this step on each side; seeL / seeR: LC10a spikes; steer: spikes per steering neuron
 *        (STEER order, left then right)
 */
import { loadConnectome } from "../lib/brainload.ts";
import { ConnectomeBrain, cells } from "../lib/connectome.ts";
import { SEE, STEER } from "../lib/fly.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let started = false;
let eyes = { L: 0, R: 0 };

async function load(base: string): Promise<void> {
  const { meta, weights: w } = await loadConnectome(base, ctx);
  const brain = new ConnectomeBrain(w, meta.params, (Math.random() * 2 ** 31) | 0);
  const see = { L: cells(meta, SEE, "L"), R: cells(meta, SEE, "R") };
  // per neuron: 0 none, 1 steer left, 2 steer right, 3 eye left, 4 eye right; slot = index in the steer list
  const role = new Uint8Array(w.n);
  const slot = new Int8Array(w.n).fill(-1);
  const steerCells = [...STEER.map((t) => cells(meta, [t], "L")), ...STEER.map((t) => cells(meta, [t], "R"))];
  steerCells.forEach((idx, k) => { for (const i of idx) { role[i] = k < STEER.length ? 1 : 2; slot[i] = k; } });
  for (const i of see.L) role[i] = 3;
  for (const i of see.R) role[i] = 4;
  for (let i = 0; i < 25; i++) brain.step(); // settle out of the all-zero start
  ctx.postMessage({ type: "ready", n: w.n, nnz: w.nnz });

  const dt = meta.params.dt;
  const steer = new Array(steerCells.length).fill(0);
  let ms = 0;
  const loop = () => {
    const t0 = performance.now();
    brain.stimulate(see.L, eyes.L);
    brain.stimulate(see.R, eyes.R);
    brain.step();
    let l = 0, r = 0, seeL = 0, seeR = 0;
    steer.fill(0);
    for (let k = 0; k < brain.firedCount; k++) {
      const i = brain.fired[k];
      switch (role[i]) {
        case 1: l++; steer[slot[i]]++; break;
        case 2: r++; steer[slot[i]]++; break;
        case 3: seeL++; break;
        case 4: seeR++; break;
      }
    }
    const took = performance.now() - t0;
    ms += (took - ms) * 0.05;
    ctx.postMessage({ type: "step", l, r, seeL, seeR, steer, fired: brain.firedCount, ms, dt });
    setTimeout(loop, Math.max(0, dt * 1000 - took));
  };
  loop();
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load" && !started) {
    started = true;
    load(msg.base).catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "eyes") eyes = { L: msg.L, R: msg.R };
};
