/**
 * Bench: (1) the GPU must return exactly the CPU's results, alone and at any position in a full batch;
 * (2) jobs per hour on one CPU thread vs the GPU at several batch sizes. Nothing is sent to the server.
 * The summary is also left on `window.bench` for scripted runs.
 */
import type { TaskParams, TaskResult } from "../src/runner.ts";
import { t } from "./i18n.ts";
import { $ } from "./format.ts";
import { API, CONNECTOME } from "./config.ts";
import { fetchModelInfo } from "./download.ts";

const log = (line: string) => { $("log").textContent += line + "\n"; };
const status = (text: string) => { $("status").textContent = text; };

const JOB_STEPS = 750; // a real job, for the per-hour numbers

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
function channel(worker: Worker, onProgress: (text: string) => void) {
  const pending = new Map<string, Pending>();
  let ready: Pending | null = null;
  worker.onerror = (e) => {
    const err = new Error(e.message || "worker failed to start");
    ready?.reject(err);
    for (const p of pending.values()) p.reject(err);
  };
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") onProgress(m.text);
    else if (m.type === "ready") ready?.resolve(m);
    else if (m.type === "done") pending.get(m.job ?? m.batch)?.resolve(m.result ?? m.results);
    else if (m.type === "error") {
      const p = m.job ?? m.batch ? pending.get(m.job ?? m.batch) : ready;
      p?.reject(new Error(m.text));
    }
  };
  let id = 0;
  return {
    load: (msg: object) => new Promise<any>((resolve, reject) => { ready = { resolve, reject }; worker.postMessage({ type: "load", ...msg }); }),
    call: (msg: object, key: "job" | "batch") => new Promise<any>((resolve, reject) => {
      const k = String(++id);
      pending.set(k, { resolve, reject });
      worker.postMessage({ type: "run", [key]: k, ...msg });
    }),
  };
}

const task = (seed: number, over: Partial<TaskParams> = {}): TaskParams =>
  ({ channel: "LPLC2", side: "L", amount: 0.4, gain: 3, tonic: 0.14, seed, steps: 200, warm: 60, ...over });

async function bench() {
  const summary: Record<string, unknown> = {};
  (window as any).bench = summary;
  status(t("compute.bench.fetchingConstants"));
  const { fixed } = await fetchModelInfo(API);

  const workers = [new Worker(new URL("./gpu.worker.ts", import.meta.url), { type: "module" }), new Worker(new URL("./miner.worker.ts", import.meta.url), { type: "module" })];
  failed = () => { for (const w of workers) w.terminate(); };
  const gpu = channel(workers[0], (text) => status(`GPU: ${text}`));
  const cpu = channel(workers[1], (text) => status(`CPU: ${text}`));
  // one after the other: the second load reads the connectome from the browser cache
  const ready = await gpu.load({ fixed, brains: 32, connectome: CONNECTOME });
  await cpu.load({ fixed, connectome: CONNECTOME });
  summary.adapter = ready.adapter;
  log(`GPU: ${ready.adapter}`);

  // 1. exactness
  const probes = [
    task(11),
    task(12, { channel: "none", amount: 0, gain: 2, tonic: 0.1 }),
    task(13, { channel: "SNta", side: "R", amount: 0.8, gain: 4, tonic: 0.18 }),
    task(14, { channel: "LC10a", side: "L", amount: 0.1, warm: 120 }),
  ];
  status(t("compute.bench.exactCpu"));
  const t0 = performance.now();
  const reference: TaskResult[] = [];
  for (const p of probes) reference.push(await cpu.call({ params: p }, "job"));
  const cpuMsPerStep = (performance.now() - t0) / probes.reduce((s, p) => s + p.steps, 0);

  status(t("compute.bench.exactGpu"));
  const alone: TaskResult[] = await gpu.call({ tasks: probes }, "batch");
  // the same four at scattered positions in a full batch of 32
  const full = Array.from({ length: 32 }, (_, k) => task(1000 + k, { amount: 0.1 + (k % 4) * 0.2 }));
  const spots = [0, 9, 22, 31];
  spots.forEach((at, k) => { full[at] = probes[k]; });
  const packed: TaskResult[] = await gpu.call({ tasks: full }, "batch");

  let exact = true;
  probes.forEach((p, k) => {
    const want = JSON.stringify(reference[k]);
    const a = JSON.stringify(alone[k]) === want;
    const b = JSON.stringify(packed[spots[k]]) === want;
    exact &&= a && b;
    log(`${a && b ? "same" : "DIFFERENT"}  ${p.channel} seed ${p.seed}: CPU ${reference[k].hash} (${reference[k].spikes} spikes) · GPU ${alone[k].hash} · GPU in batch ${packed[spots[k]].hash}`);
  });
  summary.exact = exact;
  if (!exact) {
    status(t("compute.bench.disagrees"));
    return;
  }

  // 2. throughput
  const perHour = (msPerBrainStep: number) => Math.round(3_600_000 / (msPerBrainStep * JOB_STEPS));
  log(`\nCPU, 1 thread: ${cpuMsPerStep.toFixed(2)} ms per step · ${perHour(cpuMsPerStep)} jobs/hour`);
  summary.cpu = { msPerStep: cpuMsPerStep, jobsPerHour: perHour(cpuMsPerStep) };
  const rows: { brains: number; msPerStep: number; jobsPerHour: number }[] = [];
  for (const brains of [1, 4, 16, 32]) {
    status(t("compute.bench.throughput", { count: brains }));
    const tasks = Array.from({ length: brains }, (_, k) => task(500 + k, { steps: 120 }));
    const started = performance.now();
    await gpu.call({ tasks }, "batch");
    const msPerStep = (performance.now() - started) / 120;
    const row = { brains, msPerStep, jobsPerHour: perHour(msPerStep / brains) };
    rows.push(row);
    log(`GPU, ${String(brains).padStart(2)} at once: ${msPerStep.toFixed(2)} ms per step · ${row.jobsPerHour} jobs/hour · ${(row.jobsPerHour / perHour(cpuMsPerStep)).toFixed(1)}x one CPU thread`);
  }
  summary.gpu = rows;
  status(t("compute.bench.done"));
}

/** stops the workers, so a late progress message can't overwrite the failure */
let failed = () => {};

$("go").addEventListener("click", () => {
  ($("go") as HTMLButtonElement).disabled = true;
  bench().catch((err) => {
    failed();
    status(t("compute.bench.failed", { error: err instanceof Error ? err.message : String(err) }));
    (window as any).bench = { error: String(err) };
  });
});
