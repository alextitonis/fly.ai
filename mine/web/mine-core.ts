/**
 * Mining without a page: claim -> run -> submit on the GPU (a batch at a time) or N CPU threads, reporting
 * through hooks. The website (web/app.ts) and the browser extension (extension/offscreen.ts) both drive it.
 *
 * With `programs` on, lanes also take buyers' programs: WASM on any lane, WGSL shaders on the GPU lane. Each one
 * runs in its own fresh worker (web/open.worker.ts), which is terminated at the job's time limit. On the GPU, the
 * CPU programs (WASM, world runs) get a lane of their own, so a 30-second world run never leaves the GPU idle.
 * Embedding jobs (text → vectors) run in one long-lived worker per model (web/embed.worker.ts), on WebGPU when there is
 * one: the GPU miner's program lane takes them, or the first thread of a CPU miner.
 */
import type { Fixed } from "../src/fixed.ts";
import type { TaskParams, TaskResult } from "../src/runner.ts";
import { fetchModelInfo } from "./download.ts";

export interface MineSettings {
  engine: "gpu" | "cpu";
  /** GPU: jobs per batch */
  batch: number;
  /** CPU: worker threads */
  threads: number;
  /** also run buyers' programs (sandboxed); default true */
  programs?: boolean;
  /** also run embedding jobs (needs code from a CDN, so the extension can't); default: whatever `programs` is */
  embed?: boolean;
  /** buyers' WebAssembly and WGSL among the programs; default true. The extension turns it off: store policy
   *  forbids running downloaded code, so it runs only our own world runs and probes, which ship inside it */
  buyerPrograms?: boolean;
}

export interface MinerHooks {
  /** the mining server's origin; "" for same-origin */
  server: string;
  /** base URL of the brain files (brain.json, meta.bin, weights.*.bin) */
  connectome: string;
  getToken(): string | null;
  setToken(token: string | null): void;
  /** optional name stored with a new miner */
  label(): string;
  status(text: string): void;
  /** one lane per GPU or CPU thread */
  lanes(names: string[]): void;
  lane(index: number, text: string, progress?: number): void;
  job(text: string): void;
  /** perMinute is jobs; unitsPerMinute is the fairer rate, since a world run is one job worth several brain jobs */
  session(s: { jobs: number; units: number; perMinute: number; unitsPerMinute: number }): void;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api(server: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(server + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data;
}

export interface GpuProbe {
  /** a WebGPU adapter with buffers big enough for the connectome */
  usable: boolean;
  name: string;
  /** why it can't be used, when it can't */
  reason?: string;
}

/** The connectome's wiring is one ~100 MB storage buffer. */
const WIRING_BYTES = 100_352_428;

/** What WebGPU exposes here, and whether mining can use it. */
export async function probeGpu(): Promise<GpuProbe> {
  const gpu = (globalThis.navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { usable: false, name: "none", reason: "this browser has no WebGPU" };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return { usable: false, name: "none", reason: "WebGPU found no GPU (blocklisted driver or disabled hardware acceleration)" };
    const info = adapter.info;
    const name = [info.vendor, info.architecture, info.description || info.device].filter(Boolean).join(" · ") || "GPU";
    if (adapter.limits.maxStorageBufferBindingSize < WIRING_BYTES) {
      return { usable: false, name, reason: `buffers up to ${Math.round(adapter.limits.maxStorageBufferBindingSize / 1e6)} MB; the connectome needs 100 MB` };
    }
    return { usable: true, name };
  } catch (err) {
    return { usable: false, name: "none", reason: String(err) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Vars = Record<string, string | number>;
const fill = (text: string, vars?: Vars) => text.replace(/\{(\w+)\}/g, (m, k: string) => (vars?.[k] != null ? String(vars[k]) : m));
let translate: ((key: string, vars?: Vars) => string) | null = null;
/**
 * The miner's messages in the page's language: a page passes the site's t (keys compute.miner.*). The extension
 * passes nothing and gets the English written here.
 */
export function setMinerText(t: (key: string, vars?: Vars) => string): void {
  translate = t;
}
const say = (key: string, english: string, vars?: Vars) => (translate ? translate(`compute.miner.${key}`, vars) : fill(english, vars));
const sayText = say;

export const describeJob = (p: TaskParams) => p.channel === "none"
  ? say("control", "control: no drive · gain {gain} · tonic {tonic}", { gain: p.gain, tonic: p.tonic })
  : say("drive", "{channel} {side} at {amount} · gain {gain} · tonic {tonic}", {
    channel: p.channel, side: p.side === "L" ? say("left", "left") : say("right", "right"), amount: p.amount, gain: p.gain, tonic: p.tonic,
  });

interface ProgramParams {
  kind: "wasm" | "wgsl"; program: string; program_url: string; input: string | null; input_url: string | null; index: number;
  timeout_s: number; max_output: number; dispatch: [number, number, number] | null; output_bytes: number | null;
}
interface Claimed { job: string; kind?: string; params: TaskParams; units?: number }
interface ProgramClaim { job: string; kind: "wasm" | "wgsl" | "world"; params: ProgramParams; units?: number }
interface ProbeClaim { job: string; kind: "probe" | "fight"; params: Record<string, unknown> & { timeout_s: number; condition: string }; units?: number }
interface EmbedParams {
  model: string; repo: string; revision: string; pooling: string; dim: number; mb: number;
  index: number; input: string; input_url: string; timeout_s: number; output_bytes: number;
}
interface EmbedClaim { job: string; kind: "embed"; params: EmbedParams; units?: number }

const describeClaim = (j: Claimed | ProgramClaim | ProbeClaim | EmbedClaim) => j.kind === "embed"
  ? say("embedding", "embedding {count} texts with {model}, job #{index}", {
    count: (j.params as EmbedParams).output_bytes / 4 / (j.params as EmbedParams).dim, model: (j.params as EmbedParams).model, index: (j.params as EmbedParams).index,
  })
  : (j.kind === "wasm" || j.kind === "wgsl"
  ? (j.kind === "wasm"
    ? say("wasmJob", "a buyer's WASM program, job #{index}", { index: (j.params as ProgramParams).index })
    : say("shaderJob", "a buyer's GPU shader, job #{index}", { index: (j.params as ProgramParams).index }))
  : j.kind === "world" ? say("worldJob", "a world simulation, seed {seed}", { seed: (j.params as unknown as { seed: number }).seed })
  : j.kind === "probe" ? say("probeJob", "a brain probe: {condition}", { condition: (j.params as { condition: string }).condition })
  : j.kind === "fight" ? say("fightJob", "a Fly Colosseum fight")
  : describeJob(j.params as TaskParams));

/**
 * The embedding model, kept loaded between jobs. A job that can't run here (the model won't load, or the job overruns
 * its time on this machine) resolves to null: nothing is submitted and the job goes back out, since an embed answer
 * is only ever the vectors.
 */
class Embedder {
  private worker: Worker | null = null;
  private model = "";
  private seq = 0;

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.model = "";
  }

  private call(msg: Record<string, unknown>, ms: number): Promise<any> {
    const worker = this.worker!;
    return new Promise((resolve) => {
      const id = String(++this.seq);
      const done = (v: any) => {
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => {
        this.stop(); // an overrun job can't be interrupted inside the model: start over with a fresh worker
        done(null);
      }, ms);
      worker.onerror = () => {
        this.stop();
        done(null);
      };
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.job !== undefined && m.job !== id) return;
        done(m.type === "ready" || m.type === "done" ? m : null);
      };
      worker.postMessage({ ...msg, job: msg.type === "run" ? id : undefined });
    });
  }

  async run(server: string, p: EmbedParams, say: (text: string) => void): Promise<{ output: string } | null> {
    if (this.model !== `${p.repo}@${p.revision}`) {
      this.stop();
      this.worker = new Worker(new URL("./embed.worker.ts", import.meta.url), { type: "module" });
      say(sayText("loadingModel", "loading {model} ({mb} MB, once)", { model: p.model, mb: p.mb }));
      // the first load downloads the model: give it minutes, not the job's seconds
      const ready = await this.call({ type: "load", repo: p.repo, revision: p.revision, pooling: p.pooling }, 10 * 60_000);
      if (!ready) return null;
      this.model = `${p.repo}@${p.revision}`;
    }
    const origin = server || location.origin;
    const m = await this.call({ type: "run", input: p.input, input_url: origin + p.input_url, dim: p.dim, output_bytes: p.output_bytes }, p.timeout_s * 1000);
    return m ? { output: m.output } : null;
  }
}

/**
 * One program job in a throwaway worker. Resolves to the answer to submit, or null when this machine couldn't run it
 * (then nothing is submitted and the job goes back out).
 */
function runProgram(server: string, job: ProgramClaim): Promise<{ output: string } | { error: string } | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./open.worker.ts", import.meta.url), { type: "module" });
    const origin = server || location.origin;
    const done = (answer: { output: string } | { error: string } | null) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(answer);
    };
    const timer = setTimeout(() => done({ error: "timeout" }), job.params.timeout_s * 1000);
    worker.onerror = () => done(null);
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "done") done({ output: m.output });
      else if (m.type === "failed") done({ error: m.error });
      else done(null);
    };
    worker.postMessage(job.kind === "world"
      ? { type: "run", ...job.params }
      : { type: "run", ...job.params, program_url: origin + job.params.program_url, input_url: job.params.input_url && origin + job.params.input_url });
  });
}

interface Lane {
  /** none for the GPU miner's program lane: each program brings its own worker */
  worker?: Worker;
  size: number;
  index: number;
  /** job kinds this lane asks for, and how many programs a claim may include */
  kinds: string[];
  openMax: number;
  run(jobs: Claimed[]): Promise<TaskResult[]>;
  /** CPU lanes: a probe or a Colosseum fight on this thread's loaded connectome */
  probe?(kind: "probe" | "fight", params: Record<string, unknown>): Promise<{ output: string } | { error: string }>;
}

export class Miner {
  private hooks: MinerHooks;
  private lanes: Lane[] = [];
  private embedder = new Embedder();
  /** bumped by every start and stop, so a stale loop notices it's been replaced */
  private generation = 0;
  private session = { jobs: 0, units: 0, since: 0 };

  /** jobs claimed and not yet submitted: given back on stop or unload so they don't fill the server's per-miner cap */
  private held = new Set<string>();

  constructor(hooks: MinerHooks) {
    this.hooks = hooks;
    // a reload would otherwise leave a whole batch assigned to this miner until it times out
    globalThis.addEventListener?.("pagehide", () => this.release([...this.held], true));
  }

  /** Give jobs back unrun (none listed: everything this miner holds on the server). */
  private release(jobs?: string[], keepalive = false): Promise<void> {
    if (jobs) {
      if (!jobs.length) return Promise.resolve();
      for (const j of jobs) this.held.delete(j);
    }
    const token = this.hooks.getToken();
    if (!token) return Promise.resolve();
    return fetch(this.hooks.server + "/api/release", {
      method: "POST", keepalive,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(jobs ? { jobs } : {}),
    }).then(() => {}, () => {});
  }

  get running(): boolean {
    return this.lanes.length > 0 || this.starting;
  }
  private starting = false;

  async start(s: MineSettings): Promise<void> {
    this.stop("");
    const gen = ++this.generation;
    const h = this.hooks;
    this.starting = true;
    try {
      h.status(say("registering", "registering"));
      await this.ensureMiner();
      h.status(say("fetchingConstants", "fetching the engine constants"));
      const { fixed } = await fetchModelInfo(h.server);
      if (gen !== this.generation) return;
      if (s.engine === "gpu") {
        h.lanes(s.programs !== false ? ["GPU", say("programsLane", "programs (CPU)")] : ["GPU"]);
        h.status(say("loadingGpu", "loading the connectome onto the GPU (57 MB download, once)"));
        this.lanes = [await this.spawn("gpu", 0, fixed, s.batch, gen)];
        if (s.programs !== false) {
          // shaders share the GPU with the batch; CPU programs run beside it instead of after it
          Object.assign(this.lanes[0], { kinds: ["connectome", "wgsl"], openMax: 1 });
          this.lanes.push({ size: 1, index: 1, kinds: ["wasm", "world", ...(s.embed !== false ? ["embed"] : [])], openMax: 1, run: async () => [] });
        }
      } else {
        const n = Math.max(1, s.threads);
        h.lanes(Array.from({ length: n }, (_, i) => say("threadLane", "thread {n}", { n: i + 1 })));
        h.status(say("loadingCpu", n > 1 ? "loading the connectome into {count} threads (57 MB download, once)" : "loading the connectome into {count} thread (57 MB download, once)", { count: n }));
        // the first thread fills the browser cache; the rest then read from it instead of racing the download
        const first = await this.spawn("cpu", 0, fixed, 1, gen);
        this.lanes = [first];
        const rest = await Promise.all(Array.from({ length: n - 1 }, (_, i) => this.spawn("cpu", i + 1, fixed, 1, gen)));
        this.lanes.push(...rest);
        if (s.programs !== false) for (const lane of this.lanes) Object.assign(lane, { kinds: ["connectome", "wasm", "world", "probe", "fight"], openMax: 1 });
        // one model in memory is plenty: only the first thread takes embedding jobs
        if (s.programs !== false && s.embed !== false) this.lanes[0].kinds.push("embed");
      }
      if (s.buyerPrograms === false) for (const lane of this.lanes) lane.kinds = lane.kinds.filter((k) => k !== "wasm" && k !== "wgsl");
      if (gen !== this.generation) return;
      this.starting = false;
      h.status(say("mining", "mining"));
      this.session = { jobs: 0, units: 0, since: performance.now() };
      await Promise.all(this.lanes.map((lane) => this.loop(lane, gen)));
    } catch (err) {
      if (gen === this.generation) this.stop(say("stoppedBecause", "stopped: {error}", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      if (gen === this.generation) this.starting = false;
    }
  }

  stop(status = say("stopped", "stopped")): void {
    this.generation++;
    void this.release([...this.held]);
    this.starting = false;
    for (const lane of this.lanes) lane.worker?.terminate();
    this.embedder.stop();
    this.lanes = [];
    this.hooks.lanes([]);
    this.hooks.job("—");
    if (status) this.hooks.status(status);
  }

  private async ensureMiner(): Promise<void> {
    if (this.hooks.getToken()) return;
    const { token } = await api(this.hooks.server, "/api/register", null, { label: this.hooks.label() });
    this.hooks.setToken(token);
  }

  /** Start a worker and wait for it to load the connectome. */
  private spawn(kind: "gpu" | "cpu", index: number, fixed: Fixed, size: number, gen: number): Promise<Lane> {
    const h = this.hooks;
    const worker = new Worker(new URL(kind === "gpu" ? "./gpu.worker.ts" : "./miner.worker.ts", import.meta.url), { type: "module" });
    if (gen !== this.generation) worker.terminate();
    let seq = 0;
    const callProbe = (kind: "probe" | "fight", params: Record<string, unknown>): Promise<any> => new Promise((resolve, reject) => {
      const id = String(++seq);
      worker.onerror = (e) => reject(new Error(e.message || "mining thread crashed"));
      worker.onmessage = (e) => {
        if (e.data.job !== id) return;
        if (e.data.type === "done") resolve(e.data.result);
        else if (e.data.type === "error") reject(new Error(e.data.text));
      };
      worker.postMessage({ type: "probe", job: id, kind, params });
    });
    const call = (msg: Record<string, unknown>, key: string): Promise<any> => new Promise((resolve, reject) => {
      const id = String(++seq);
      worker.onerror = (e) => reject(new Error(e.message || "mining thread crashed"));
      worker.onmessage = (e) => {
        const m = e.data;
        if (m[key] !== id) return;
        if (m.type === "step") h.lane(index, `${Math.round((100 * m.step) / m.steps)}%`, m.step / m.steps);
        else if (m.type === "done") resolve(m.results ?? m.result);
        else if (m.type === "error") reject(new Error(m.text));
      };
      worker.postMessage({ type: "run", [key]: id, ...msg });
    });
    const lane: Lane = {
      worker, size, index, kinds: ["connectome"], openMax: 0,
      run: kind === "gpu"
        ? (jobs) => call({ tasks: jobs.map((j) => j.params) }, "batch")
        : async (jobs) => [await call({ params: jobs[0].params }, "job")],
      ...(kind === "cpu" ? { probe: (k: "probe" | "fight", params: Record<string, unknown>) => callProbe(k, params) } : {}),
    };
    return new Promise((resolve, reject) => {
      // a worker script that fails to load or parse only reports here, never through onmessage
      worker.onerror = (e) => reject(new Error(e.message || "mining thread failed to start"));
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") h.lane(index, m.text);
        else if (m.type === "ready") {
          h.lane(index, kind === "gpu" ? say("readyOn", "ready · {adapter}", { adapter: m.adapter }) : say("ready", "ready"), 0);
          resolve(lane);
        } else if (m.type === "error") reject(new Error(m.text));
      };
      worker.postMessage(kind === "gpu" ? { type: "load", fixed, brains: size, connectome: h.connectome } : { type: "load", fixed, connectome: h.connectome });
    });
  }

  /** A whole batch's answers in one request, so a GPU batch isn't 32 round trips to the server. */
  private async submitMany(jobs: { job: string }[], results: unknown[]): Promise<void> {
    const h = this.hooks;
    const body = { results: jobs.map((j, k) => ({ job: j.job, result: results[k] })) };
    const send = () => api(h.server, "/api/submit", h.getToken(), body);
    await send().catch((err) => {
      if (err instanceof ApiError) throw err;
      return sleep(2_000).then(send); // one retry on a dropped connection, so finished work isn't thrown away
    }).finally(() => {
      for (const j of jobs) this.held.delete(j.job);
    });
  }

  private async submit(job: { job: string }, result: unknown): Promise<void> {
    const h = this.hooks;
    // one retry on a dropped connection, so a finished job isn't thrown away
    await api(h.server, "/api/submit", h.getToken(), { job: job.job, result }).catch((err) => {
      if (err instanceof ApiError) throw err;
      return sleep(2_000).then(() => api(h.server, "/api/submit", h.getToken(), { job: job.job, result }));
    }).finally(() => this.held.delete(job.job));
  }

  private async loop(lane: Lane, gen: number): Promise<void> {
    const h = this.hooks;
    while (gen === this.generation) {
      let mine: string[] = [];
      try {
        const claim = await api(h.server, "/api/claim", h.getToken(), { count: lane.size, kinds: lane.kinds, open_max: lane.openMax });
        if (gen !== this.generation) return; // stopped while claiming; the jobs expire on the server
        if (!claim) {
          h.lane(lane.index, say("noJobs", "no jobs right now"));
          await sleep(30_000);
          continue;
        }
        const all: (Claimed | ProgramClaim | ProbeClaim | EmbedClaim)[] = claim.jobs;
        for (const j of all) this.held.add(j.job);
        mine = all.map((j) => j.job);
        const jobs = all.filter((j): j is Claimed => j.kind === undefined || j.kind === "connectome");
        const programs = all.filter((j): j is ProgramClaim => j.kind === "wasm" || j.kind === "wgsl" || j.kind === "world");
        const probes = all.filter((j): j is ProbeClaim => j.kind === "probe" || j.kind === "fight");
        const embeds = all.filter((j): j is EmbedClaim => j.kind === "embed");
        h.job(all.length === 1 ? describeClaim(all[0]) : say("manyJobs", "{count} jobs at once, e.g. {job}", { count: all.length, job: describeClaim(all[0]) }));
        if (jobs.length) {
          const results = await lane.run(jobs);
          if (gen !== this.generation) return;
          await this.submitMany(jobs, results);
          for (const job of jobs) {
            this.session.jobs++;
            this.session.units += job.units ?? job.params.steps / 100;
          }
        }
        for (const job of probes) {
          if (!lane.probe) continue; // (only CPU lanes ask for probes)
          h.lane(lane.index, say("running", "running {job}", { job: describeClaim(job) }));
          const answer = await lane.probe(job.kind, job.params);
          if (gen !== this.generation) return;
          await this.submit(job, answer);
          this.session.jobs++;
          this.session.units += job.units ?? 0;
        }
        for (const job of embeds) {
          h.lane(lane.index, say("running", "running {job}", { job: describeClaim(job) }));
          const answer = await this.embedder.run(h.server, job.params, (text) => h.lane(lane.index, text));
          if (gen !== this.generation) return;
          if (!answer) {
            await this.release([job.job]);
            continue;
          }
          await this.submit(job, answer);
          this.session.jobs++;
          this.session.units += job.units ?? 0;
        }
        for (const job of programs) {
          h.lane(lane.index, say("running", "running {job}", { job: describeClaim(job) }));
          const answer = await runProgram(h.server, job);
          if (gen !== this.generation) return;
          if (!answer) {
            await this.release([job.job]); // this machine can't run it: straight back out for someone else
            continue;
          }
          await this.submit(job, answer);
          this.session.jobs++;
          this.session.units += job.units ?? 0;
        }
        const minutes = (performance.now() - this.session.since) / 60_000;
        h.session({ jobs: this.session.jobs, units: this.session.units, perMinute: this.session.jobs / Math.max(minutes, 1e-9), unitsPerMinute: this.session.units / Math.max(minutes, 1e-9) });
        h.lane(lane.index, "", 0);
      } catch (err) {
        if (gen !== this.generation) return;
        // whatever of this claim didn't get submitted goes back now rather than in JOB_TTL
        await this.release(mine.filter((j) => this.held.has(j)));
        // the server says this miner holds a full load, yet this page holds nothing: leftovers of a crashed or
        // reloaded page that couldn't say goodbye
        if (err instanceof ApiError && err.status === 429 && !this.held.size) {
          await this.release();
          continue;
        }
        if (err instanceof ApiError && err.status === 401) {
          h.setToken(null);
          await this.ensureMiner().catch(() => {});
          continue;
        }
        h.lane(lane.index, err instanceof Error ? err.message : String(err));
        await sleep(err instanceof ApiError && err.status === 429 ? 15_000 : 10_000);
      }
    }
  }
}
