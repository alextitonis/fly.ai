/**
 * One CPU mining thread: downloads the connectome once, then runs whatever job the page hands it.
 *
 * in:  {type: "load", fixed, connectome}  ·  {type: "run", job, params}  ·  {type: "probe", job, kind?: "fight" | "replay" | "replayb" | "replayp" | "esb", params}
 * out: {type: "progress", text} · {type: "ready"} · {type: "step", job, step, steps} · {type: "done", job, result}
 *      {type: "error", job?, text}
 */
import type { Fixed } from "../src/fixed.ts";
import type { Model } from "../src/model.ts";
import { runFightJob } from "../src/fightjob.ts";
import { runReplayJob } from "../src/replay.ts";
import { recordSets, runProbe } from "../src/probe.ts";
import { cells } from "../../world/src/connectome.ts";
import { runTask, type TaskParams } from "../src/runner.ts";
import { downloadModel } from "./download.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let model: Model | null = null;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
let fixed: Fixed | null = null;

/** Columns of a probe's descending + wing output for some cell types (a brain fitness's targets), cached per model. */
const columnCache = new Map<string, number[]>();
function columnsOf(types: string[], side?: "L" | "R"): number[] {
  const key = `${types.join("|")}:${side ?? ""}`;
  let cols = columnCache.get(key);
  if (!cols) {
    const order = recordSets(model!, ["descending", "wing"]).flatMap((set) => Array.from(set));
    const want = new Set(cells(model!.meta, types, side));
    cols = order.flatMap((neuron, k) => (want.has(neuron) ? [k] : []));
    if (!cols.length) throw new Error(`no descending or wing motor cell is ${types.join(", ")}`);
    columnCache.set(key, cols);
  }
  return cols;
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load") {
    fixed = msg.fixed;
    downloadModel((text) => ctx.postMessage({ type: "progress", text }), msg.connectome)
      .then((m) => {
        model = m;
        ctx.postMessage({ type: "ready" });
      })
      .catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "probe" && (msg.kind === "replay" || msg.kind === "replayb" || msg.kind === "replayp")) {
    // a trading-rule replay (src/replay.ts): no brain involved, only the order's price data (fetched once, then cached);
    // replayb's and replayp's params carry the reshuffle (boot)
    // a download that fails is this machine's trouble, not an answer: it goes back out (type "error")
    let unreachable = false;
    const fetchBytes = async (url: string) => {
      const res = await fetch(url).catch((err) => {
        unreachable = true;
        throw err;
      });
      if (!res.ok) {
        unreachable = true;
        throw new Error(`replay data: HTTP ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    };
    void runReplayJob(msg.params, fetchBytes).then(
      (bytes) => ctx.postMessage({ type: "done", job: msg.job, result: { output: b64(bytes) } }),
      (err) => ctx.postMessage(unreachable
        ? { type: "error", job: msg.job, text: String(err instanceof Error ? err.message : err) }
        : { type: "done", job: msg.job, result: { error: err instanceof Error ? err.message : String(err) } }));
  } else if (msg.type === "probe" && msg.kind === "esb") {
    // a training run's brain fitness (src/train.ts brainScore): integer probes on this thread's connectome
    if (!model || !fixed) return ctx.postMessage({ type: "error", job: msg.job, text: "connectome not loaded" });
    const loaded = model;
    const fx = fixed;
    void import("./trainjob.ts").then(async ({ runBrainEs }) => {
      const { JobError } = await import("./openjob.ts");
      try {
        const origin = new URL(msg.params.input_url).origin;
        const bytes = await runBrainEs(origin, msg.params.input, (p) => runProbe(loaded, fx, p as Parameters<typeof runProbe>[2]), columnsOf);
        ctx.postMessage({ type: "done", job: msg.job, result: { output: b64(bytes) } });
      } catch (err) {
        // the fitness's own failure (no such cells) is an answer; a download that failed is this machine's trouble
        if (err instanceof JobError) ctx.postMessage({ type: "done", job: msg.job, result: { error: err.message.slice(0, 200) } });
        else ctx.postMessage({ type: "error", job: msg.job, text: String(err instanceof Error ? err.message : err) });
      }
    });
  } else if (msg.type === "probe") {
    // a house probe or Colosseum fight on this thread's loaded connectome: answer {output: base64} or {error}
    if (!model || !fixed) return ctx.postMessage({ type: "error", job: msg.job, text: "connectome not loaded" });
    if (msg.kind === "fight") {
      const loaded = model;
      void runFightJob(loaded, msg.params).then(
        (bytes) => ctx.postMessage({ type: "done", job: msg.job, result: { output: b64(bytes) } }),
        (err) => ctx.postMessage({ type: "done", job: msg.job, result: { error: err instanceof Error ? err.message : String(err) } }));
      return;
    }
    let result: { output: string } | { error: string };
    try {
      const bytes = runProbe(model, fixed, msg.params);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      result = { output: btoa(s) };
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }
    ctx.postMessage({ type: "done", job: msg.job, result });
  } else if (msg.type === "run") {
    if (!model || !fixed) return ctx.postMessage({ type: "error", job: msg.job, text: "connectome not loaded" });
    const params: TaskParams = msg.params;
    try {
      const result = runTask(model, fixed, params, (step) => ctx.postMessage({ type: "step", job: msg.job, step, steps: params.steps }));
      ctx.postMessage({ type: "done", job: msg.job, result });
    } catch (err) {
      ctx.postMessage({ type: "error", job: msg.job, text: String(err) });
    }
  }
};
