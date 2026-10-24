/**
 * The GPU mining thread: downloads the connectome, uploads it to the GPU, then runs batches of jobs.
 *
 * in:  {type: "load", fixed, brains, connectome}  ·  {type: "run", batch, tasks}
 * out: {type: "progress", text} · {type: "ready", adapter, brains} · {type: "step", batch, step, steps}
 *      {type: "done", batch, results} · {type: "error", batch?, text}
 */
import { GpuBrains } from "./gpu.ts";
import { downloadModel } from "./download.ts";
import type { Fixed } from "../src/fixed.ts";
import type { Model } from "../src/model.ts";
import type { TaskParams, TaskResult } from "../src/runner.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let gpu: GpuBrains | null = null;
let loaded: { model: Model; fixed: Fixed; brains: number } | null = null;

/**
 * A lost device (driver reset, sleep, Windows' GPU timeout) never comes back on its own, and every batch after it
 * would fail the same way: build a new one on the model already in memory and run the batch again. Should the
 * browser refuse a new one, the batch fails with why, and the next batch tries again.
 */
async function run(tasks: TaskParams[], step: (s: number, steps: number) => void): Promise<TaskResult[]> {
  if ((!gpu || gpu.broken) && loaded) {
    gpu?.destroy();
    gpu = null;
    gpu = await GpuBrains.create(loaded.model, loaded.fixed, loaded.brains);
  }
  if (!gpu) throw new Error("GPU not ready");
  return gpu.run(tasks, step);
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load") {
    const report = (text: string) => ctx.postMessage({ type: "progress", text });
    downloadModel(report, msg.connectome)
      .then((model) => {
        report("uploading to the GPU");
        loaded = { model, fixed: msg.fixed, brains: msg.brains };
        return GpuBrains.create(model, msg.fixed, msg.brains);
      })
      .then((g) => {
        gpu = g;
        ctx.postMessage({ type: "ready", adapter: g.adapterName, brains: g.maxBrains });
      })
      .catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "run") {
    const step = (step: number, steps: number) => ctx.postMessage({ type: "step", batch: msg.batch, step, steps });
    run(msg.tasks, step)
      .catch((err) => {
        if (!gpu?.broken) throw err;
        return run(msg.tasks, step);      // the device died during this batch
      })
      .then((results) => ctx.postMessage({ type: "done", batch: msg.batch, results }))
      .catch((err) => ctx.postMessage({ type: "error", batch: msg.batch, text: String(err) }));
  }
};
