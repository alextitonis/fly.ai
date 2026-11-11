/**
 * One buyer program, one worker: the miner starts a fresh worker per job and terminates it at the job's time limit,
 * so an endless loop or a runaway allocation dies with the worker and never touches the page or the next job.
 * The program and input are checked against their SHA-256 hashes before anything runs.
 *
 * in:  {type: "run", kind: "wasm" | "wgsl", program, program_url, input, input_url, max_output, dispatch?, output_bytes?, index}
 *      {type: "run", kind: "es" | "sgd", input, input_url, ...}   (a training run's job: web/trainjob.ts)
 * out: {type: "done", output (base64)} · {type: "failed", error}   (both are answers the miner submits)
 *      {type: "error", text}                                         (this machine's problem: nothing is submitted)
 */
import { JobError, runShader, runWasm } from "./openjob.ts";

const ctx = self as unknown as { postMessage(message: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

async function fetchChecked(url: string, hash: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't fetch ${hash.slice(0, 12)}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== hash) throw new Error(`${hash.slice(0, 12)} doesn't match its hash`);
  return bytes;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type !== "run") return;
  if (m.kind === "world") {
    // our own world simulation: nothing to download or check, just the seed and settings
    void import("./worldjob.ts").then(({ runWorld }) => {
      try {
        ctx.postMessage({ type: "done", output: base64(runWorld(m)) });
      } catch (err) {
        ctx.postMessage({ type: "failed", error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      }
    }, (err) => ctx.postMessage({ type: "error", text: String(err) }));
    return;
  }
  if (m.kind === "es" || m.kind === "sgd") {
    // a training run's job (src/train.ts): its input is its own JSON, naming the uploads it needs on the same server
    void import("./trainjob.ts").then(async ({ runEs, runSgd }) => {
      try {
        const origin = new URL(m.input_url).origin;
        const output = m.kind === "es" ? await runEs(origin, m.input) : await runSgd(origin, m.input);
        ctx.postMessage({ type: "done", output: base64(output) });
      } catch (err) {
        if (err instanceof JobError) ctx.postMessage({ type: "failed", error: err.message.slice(0, 200) });
        else ctx.postMessage({ type: "error", text: String(err) });
      }
    }, (err) => ctx.postMessage({ type: "error", text: String(err) }));
    return;
  }
  void (async () => {
    let program: Uint8Array;
    let input: Uint8Array;
    try {
      // no input upload: the job's input is its index, 4 bytes little-endian
      const index = new Uint8Array(new Uint32Array([m.index]).buffer);
      [program, input] = await Promise.all([fetchChecked(m.program_url, m.program), m.input_url ? fetchChecked(m.input_url, m.input) : Promise.resolve(index)]);
    } catch (err) {
      return ctx.postMessage({ type: "error", text: String(err) });
    }
    try {
      let output: Uint8Array;
      if (m.kind === "wasm") {
        const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${m.program}:${m.input ?? `#${m.index}`}`)));
        output = (await runWasm(program, input, seed, m.max_output)).output;
      } else {
        output = await runShader({ code: new TextDecoder().decode(program), input, dispatch: m.dispatch, outputBytes: m.output_bytes, index: m.index });
      }
      ctx.postMessage({ type: "done", output: base64(output) });
    } catch (err) {
      if (err instanceof JobError) ctx.postMessage({ type: "failed", error: err.message });
      else ctx.postMessage({ type: "error", text: String(err) });
    }
  })();
};
