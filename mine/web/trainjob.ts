/**
 * A training run's job on a miner (src/train.ts): an evolve job's scores ("es") or a train job's weight change ("sgd").
 * Runs inside the throwaway program worker (web/open.worker.ts), which the page kills at the job's time limit. Every
 * upload the job names is checked against its SHA-256 before it's used. The brain fitness ("esb") runs on the CPU
 * threads that hold the connectome instead (web/miner.worker.ts, runBrainEs below).
 *
 * Answers: {output} (the bytes to submit) or a JobError (the fitness or the buyer's program failed: an answer too,
 * which every honest miner gives alike). Anything else (a download that failed) is this machine's trouble.
 */
import { decodeReplayData, resample, runReplay, type ReplayData } from "../src/replay.ts";
import * as T from "../src/train.ts";
import { JobError, runWasm } from "./openjob.ts";

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Fetch an upload from the server the job came from and check it's the one named. */
export async function fetchBlob(origin: string, hash: string): Promise<Uint8Array> {
  const res = await fetch(`${origin}/api/blobs/${hash}`);
  if (!res.ok) throw new Error(`couldn't fetch ${hash.slice(0, 12)}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource)) !== hash) throw new Error(`${hash.slice(0, 12)} doesn't match its hash`);
  return bytes;
}

/** The job's own JSON (its input upload). */
export async function fetchJob<J>(origin: string, input: string): Promise<J> {
  return JSON.parse(new TextDecoder().decode(await fetchBlob(origin, input))) as J;
}

/** The seed a buyer's program gets for random_get: the program and the job, like any wasm job. */
async function wasmSeed(program: string, tag: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${program}:${tag}`)));
}

/** A replay fitness's score: log growth of the book (final value / starting money) on one path. */
function replayScore(f: T.ReplayFitness, d: ReplayData, x: Float64Array, episode: number): number {
  const setting = T.replaySettingFor(f, x);
  const path = f.block > 0 ? resample(d, { seed: episode, block: f.block }) : d;
  const r = runReplay(path, setting as Parameters<typeof runReplay>[1]);
  const end = r.equity.length ? r.equity[r.equity.length - 1][1] : setting.usd;
  return Math.log(Math.max(end, 1e-9) / setting.usd);
}

/** Run an "es" job: every member of its pairs, each scored on the generation's episodes. */
export async function runEs(origin: string, input: string): Promise<Uint8Array> {
  const job = await fetchJob<T.EsJob>(origin, input);
  const theta = T.readF64(await fetchBlob(origin, job.theta));
  const f = job.fitness;
  if ("wasm" in f) {
    const program = await fetchBlob(origin, f.wasm);
    const seed = await wasmSeed(f.wasm, `${job.run}:${job.gen}`);
    return T.runEsJob(job, theta, async (x, ep) => {
      // everything in here is the program's doing: a trap, a short output or NaN is its answer
      const score = T.wasmFitnessScore((await runWasm(program, T.wasmFitnessInput(x, ep), seed, 4096)).output);
      if (Number.isNaN(score)) throw new JobError("the fitness program scored NaN");
      return score;
    }).catch((err) => {
      throw err instanceof JobError ? err : new JobError(err instanceof Error ? err.message : String(err));
    });
  }
  if (f.builtin === "replay") {
    const data = await decodeReplayData(await fetchBlob(origin, f.data));
    return T.runEsJob(job, theta, (x, ep) => {
      try {
        return replayScore(f, data, x, ep);
      } catch (err) {
        throw new JobError(`replay: ${err instanceof Error ? err.message : err}`);
      }
    });
  }
  if (f.builtin === "brain") throw new Error("a brain fitness runs on the connectome threads");
  return T.runEsJob(job, theta, (x) => T.builtinScore(f, x));
}

/** Run an "sgd" job: K local steps on one shard, answered as the weight change and the steps' mean loss. */
export async function runSgd(origin: string, input: string): Promise<Uint8Array> {
  const job = await fetchJob<T.SgdJob>(origin, input);
  const [thetaBytes, shardBytes] = await Promise.all([fetchBlob(origin, job.theta), fetchBlob(origin, job.shard)]);
  const theta = T.readF32(thetaBytes);
  if ("mlp" in job.model) {
    let shard: T.Shard;
    try {
      shard = T.decodeShard(shardBytes);
    } catch (err) {
      throw new JobError(`shard: ${err instanceof Error ? err.message : err}`);
    }
    const out = T.mlpTrain(job.model.mlp, theta, shard, { steps: job.steps, batch: job.batch, lr: job.lr, seed: job.seed, weight_decay: job.weight_decay });
    return T.sgdAnswer(out.delta, out.loss, out.acc);
  }
  const program = await fetchBlob(origin, job.model.wasm);
  const P = job.model.params;
  const { output } = await runWasm(program, T.wasmTrainInput(job, theta, shardBytes), await wasmSeed(job.model.wasm, `${job.run}:${job.round}:${job.seed}`), P * 4 + 64);
  if (output.length < P * 4 || output.length % 4) throw new JobError(`a train step outputs ${P} float32 weight changes (then optional metrics); it gave ${output.length} bytes`);
  return output;
}

/**
 * Run an "esb" job on a loaded connectome: `probe` is src/probe.ts runProbe bound to the model, `columnsOf` maps cell
 * types to columns of its descending + wing output.
 */
export async function runBrainEs(origin: string, input: string, probe: Parameters<typeof T.brainScore>[3], columnsOf: Parameters<typeof T.brainScore>[4]): Promise<Uint8Array> {
  const job = await fetchJob<T.EsJob>(origin, input);
  const theta = T.readF64(await fetchBlob(origin, job.theta));
  const f = job.fitness;
  if (!("builtin" in f) || f.builtin !== "brain") throw new Error("not a brain fitness");
  return T.runEsJob(job, theta, (x, ep) => {
    try {
      return T.brainScore(f, x, ep, probe, columnsOf);
    } catch (err) {
      throw new JobError(`brain: ${err instanceof Error ? err.message : err}`);
    }
  });
}
