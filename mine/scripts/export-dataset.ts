/**
 * Export the network's research results as an open dataset folder (for Hugging Face; see mine/dataset/README.md).
 * Reads only public endpoints and local files; never writes to the server.
 *
 *   node --experimental-strip-types mine/scripts/export-dataset.ts [--server https://flyai-mine.fly.dev]
 *        [--out mine/dataset/out] [--wait 900] [--no-runs]
 *
 * Writes <out>/:
 *   screen.csv             GET /api/results: one row per screen condition x motor group (mean over seeds)
 *   tuning_runs.csv        the tuning house orders' settled runs, one row per run x motor group (GET /api/orders/:id/results)
 *   experiments.json       GET /api/experiments as served
 *   experiments.csv        one row per house order summary; experiment_tables.csv holds their small tables, long
 *   meta.json              export time, fleet counts (GET /api/stats), engine constants (GET /api/model), neuron
 *                          parameters and sha256 of the local connectome files, row counts and sizes, any errors
 *   house/                 local pulls from scripts/pull-house.ts (mine/data/house), only if present
 *
 * /api/results is worked out in the background on the server and answers `computing: true` until it's ready;
 * this waits up to --wait seconds for it. If an endpoint fails, the rest is still written, meta.json lists the
 * error and the exit code is 1.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { cells, cellsWithPrefix, parseMeta } from "../../world/src/connectome.ts";
import { CHANNELS } from "../src/model.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const SERVER = arg("server", process.env.SERVER ?? "https://flyai-mine.fly.dev").replace(/\/$/, "");
const OUT = arg("out", fileURLToPath(new URL("../dataset/out/", import.meta.url)));
const WAIT_S = Number(arg("wait", "900"));
const RUNS = !process.argv.includes("--no-runs");
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const CONNECTOME = join(REPO, "world/public/connectome");
const HOUSE = fileURLToPath(new URL("../data/house/", import.meta.url));

const errors: { what: string; error: string }[] = [];
const fail = (what: string, err: unknown) => {
  const error = err instanceof Error ? err.message : String(err);
  errors.push({ what, error });
  console.error(`! ${what}: ${error}`);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a JSON endpoint: 60 s timeout, three tries on network errors and 5xx, a clear message otherwise. */
async function getJson<T>(path: string, timeoutMs = 60_000): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SERVER + path, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.text()).slice(0, 200);
      last = new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
      if (res.status < 500) break;
    } catch (err) {
      last = err instanceof Error && err.name === "TimeoutError" ? new Error(`timed out after ${timeoutMs / 1000} s`) : err;
    }
    if (attempt < 3) await pause(2000 * attempt);
  }
  throw new Error(`GET ${path}: ${last instanceof Error ? last.message : String(last)}`);
}

// ---- csv ---------------------------------------------------------------------------------------------------
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const files: Record<string, { bytes: number; rows?: number }> = {};
function writeCsv(name: string, header: string[], rows: unknown[][]) {
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
  writeFileSync(join(OUT, name), text);
  files[name] = { bytes: Buffer.byteLength(text), rows: rows.length };
}
function writeJson(name: string, value: unknown) {
  const text = JSON.stringify(value, null, 2) + "\n";
  writeFileSync(join(OUT, name), text);
  files[name] = { bytes: Buffer.byteLength(text) };
}
const r2 = (x: number) => Math.round(x * 100) / 100;
/** "DNp01 L" -> ["DNp01", "L"] */
const splitGroup = (g: string) => {
  const m = /^(.*) ([LR])$/.exec(g);
  return m ? [m[1], m[2]] : [g, ""];
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const exportedAt = new Date().toISOString();
console.log(`exporting from ${SERVER} into ${OUT}`);

// ---- fleet counts and engine constants ---------------------------------------------------------------------
let stats: Record<string, unknown> | null = null;
try { stats = await getJson("/api/stats"); } catch (err) { fail("stats", err); }

let engine: Record<string, unknown> | null = null;
try {
  const m = await getJson<{ w20: string; decay: number; noise_thresh: number; noise_amp: number; outputs: string[] }>("/api/model");
  const w20 = Buffer.from(m.w20, "base64");
  engine = {
    decay_q16: m.decay, noise_thresh_u32: m.noise_thresh, noise_amp_q16: m.noise_amp,
    weight_table: { entries: w20.length / 4, format: "int32 Q20, one per synapse code", sha256: createHash("sha256").update(w20).digest("hex") },
    outputs: m.outputs,
  };
} catch (err) { fail("model", err); }

// ---- screen: /api/results -------------------------------------------------------------------------------------
type ScreenRow = { channel: string; side: string; amount: number; gain: number; tonic: number; steps: number; warm: number;
  seeds: number; checked_seeds: number; base_hz: number[]; stim_hz: number[] };
let screen: { units: string; outputs: string[]; rows: ScreenRow[] } | null = null;
try {
  const deadline = Date.now() + WAIT_S * 1000;
  for (;;) {
    const r = await getJson<{ units: string; outputs: string[]; rows: ScreenRow[]; computing?: boolean }>("/api/results", 120_000);
    if (!r.computing) { screen = r; break; }
    if (Date.now() > deadline) throw new Error(`still computing after ${WAIT_S} s (the server works it out in the background; run again later or raise --wait)`);
    console.log("  /api/results is computing on the server, waiting 30 s");
    await pause(30_000);
  }
} catch (err) { fail("results", err); }

let outputSizes: number[] | null = null;
let screenSummary: Record<string, unknown> | null = null;
if (screen) {
  // Rows come out of a Map in no fixed order; sort so two exports of the same data diff cleanly.
  const order = (c: string) => (c === "none" ? -1 : (CHANNELS as readonly string[]).indexOf(c));
  const rows = [...screen.rows].sort((a, b) => order(a.channel) - order(b.channel) || a.side.localeCompare(b.side)
    || a.amount - b.amount || a.gain - b.gain || a.tonic - b.tonic);
  const out: unknown[][] = [];
  for (const r of rows) {
    const control = r.channel === "none";
    screen.outputs.forEach((g, i) => {
      const [group, groupSide] = splitGroup(g);
      out.push([r.channel, control ? "" : r.side, r.amount, r.gain, r.tonic, r.steps, r.warm, group, groupSide,
        r.seeds, r.checked_seeds, r.base_hz[i], r.stim_hz[i], r2(r.stim_hz[i] - r.base_hz[i])]);
    });
  }
  writeCsv("screen.csv", ["channel", "side", "amount", "gain", "tonic", "steps", "warm", "motor_group", "motor_side",
    "n_seeds", "n_checked_seeds", "rest_hz", "driven_hz", "delta_hz"], out);
  const seeds = rows.map((r) => r.seeds);
  screenSummary = {
    units: screen.units, conditions: rows.length, motor_groups: screen.outputs.length,
    seeds_min: Math.min(...seeds), seeds_max: Math.max(...seeds), seeds_total: seeds.reduce((a, b) => a + b, 0),
    checked_seeds_total: rows.reduce((a, r) => a + r.checked_seeds, 0),
  };
  console.log(`  screen.csv: ${rows.length} conditions x ${screen.outputs.length} groups = ${out.length} rows`);
}

// ---- house order summaries: /api/experiments ---------------------------------------------------------------
type Experiment = { label: string; family: string; question: string; headline: string; figures: { k: string; v: string }[];
  table?: string[][]; runs_read: number; status?: string; jobs?: number; settled?: number; order?: string };
let experiments: Experiment[] = [];
try {
  const e = await getJson<{ updated_at: string; experiments: Experiment[] }>("/api/experiments");
  experiments = e.experiments;
  writeJson("experiments.json", e);
  writeCsv("experiments.csv", ["label", "family", "order_id", "status", "jobs", "settled", "runs_read", "question", "headline", "figures"],
    experiments.map((x) => [x.label, x.family, x.order, x.status, x.jobs, x.settled, x.runs_read, x.question, x.headline,
      x.figures.map((f) => `${f.k}: ${f.v}`).join("; ")]));
  const tables: unknown[][] = [];
  for (const x of experiments) {
    if (!x.table || x.table.length < 2) continue;
    const [head, ...body] = x.table;
    body.forEach((row, i) => row.forEach((v, j) => tables.push([x.label, i + 1, head[j], v])));
  }
  writeCsv("experiment_tables.csv", ["label", "row", "column", "value"], tables);
  console.log(`  experiments: ${experiments.length} orders, ${tables.length} table cells`);
} catch (err) { fail("experiments", err); }

// ---- tuning runs: every settled run of the tuning house orders --------------------------------------------
if (RUNS) {
  type RunPage = { rows: { seq: number; channel: string; side: string; amount: number; gain: number; tonic: number; seed: number;
    steps: number; warm: number; checked_by: string; spikes: number; base: number[]; stim: number[] }[];
    next: number; more: boolean; dt: number; outputs: string[]; output_sizes: number[] };
  const out: unknown[][] = [];
  let runs = 0;
  for (const x of experiments.filter((e) => e.family === "tuning" && e.order)) {
    try {
      let after = 0;
      for (;;) {
        const page = await getJson<RunPage>(`/api/orders/${x.order}/results?after=${after}&limit=5000`, 120_000);
        outputSizes ??= page.output_sizes;
        for (const r of page.rows) {
          runs++;
          const control = r.channel === "none";
          page.outputs.forEach((g, i) => {
            const [group, groupSide] = splitGroup(g);
            const size = page.output_sizes[i] || 1;
            out.push([x.label, r.seq, r.channel, control ? "" : r.side, r.amount, r.gain, r.tonic, r.seed, r.steps, r.warm, r.checked_by,
              group, groupSide, page.output_sizes[i], r.base[i], r.stim[i],
              r2(r.base[i] / size / (r.warm * page.dt)), r2(r.stim[i] / size / ((r.steps - r.warm) * page.dt))]);
          });
        }
        after = page.next;
        if (!page.more || !page.rows.length) break;
      }
    } catch (err) { fail(`runs ${x.label}`, err); }
  }
  if (out.length) {
    writeCsv("tuning_runs.csv", ["label", "seq", "channel", "side", "amount", "gain", "tonic", "seed", "steps", "warm", "checked_by",
      "motor_group", "motor_side", "group_size", "rest_spikes", "driven_spikes", "rest_hz", "driven_hz"], out);
    console.log(`  tuning_runs.csv: ${runs} runs, ${out.length} rows`);
  }
}

// ---- local house pulls -----------------------------------------------------------------------------------------
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
let house: Record<string, unknown> = { present: false, note: "mine/data/house not found: nothing pulled locally" };
if (existsSync(HOUSE)) {
  // Copy the orders and their result rows; program outputs (world JSON, probe u16) can be gigabytes, so they're
  // listed with counts and sizes, plus each probe's layout.json, and stay out of the export.
  const all = walk(HOUSE);
  const copied: { path: string; bytes: number }[] = [];
  const skipped = new Map<string, { files: number; bytes: number }>();
  for (const f of all) {
    const rel = relative(HOUSE, f).replace(/\\/g, "/");
    const bytes = statSync(f).size;
    if (/\/outputs\//.test(rel) && !rel.endsWith("/layout.json")) {
      const key = rel.slice(0, rel.indexOf("/outputs/") + 8);
      const s = skipped.get(key) ?? { files: 0, bytes: 0 };
      s.files++; s.bytes += bytes;
      skipped.set(key, s);
      continue;
    }
    if (rel.endsWith("cursor.json")) continue;
    mkdirSync(join(OUT, "house", rel, ".."), { recursive: true });
    cpSync(f, join(OUT, "house", rel));
    copied.push({ path: `house/${rel}`, bytes });
    files[`house/${rel}`] = { bytes };
  }
  house = {
    present: true, source: "mine/data/house (scripts/pull-house.ts)", copied,
    outputs_not_copied: [...skipped].map(([dir, s]) => ({ dir: `house/${dir}`, ...s })),
  };
  console.log(`  house: ${copied.length} files copied, ${skipped.size} output folders listed only`);
} else {
  console.log("  house: no local pulls (mine/data/house), skipped");
}

// ---- connectome provenance (local files, the same ones the server and miners load) ----------------------------
let connectome: Record<string, unknown> | null = null;
try {
  const info = JSON.parse(readFileSync(join(CONNECTOME, "brain.json"), "utf8"));
  const hashes: Record<string, string> = {};
  for (const f of ["brain.json", "meta.bin", ...info.parts]) {
    hashes[f] = createHash("sha256").update(readFileSync(join(CONNECTOME, f))).digest("hex");
  }
  const raw = readFileSync(join(CONNECTOME, "meta.bin"));
  const buf = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  const meta = parseMeta(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const inputs: Record<string, number> = {};
  for (const side of ["L", "R"] as const) {
    for (const ch of CHANNELS) inputs[`${ch}_${side}`] = (ch === "SNta" ? cellsWithPrefix(meta, "SNta", side) : cells(meta, [ch], side)).length;
  }
  let commit: string | null = null;
  try {
    commit = execFileSync("git", ["log", "-1", "--format=%H %cs", "--", "world/public/connectome"], { cwd: REPO, encoding: "utf8" }).trim() || null;
  } catch { /* not a git checkout */ }
  connectome = {
    source: "MaleCNS v1.0 (FlyEM, HHMI Janelia, and collaborators), https://male-cns.janelia.org, CC BY 4.0",
    export: "flybrain export --web (flybrain/web.py): signed weights, normalized per neuron, 7-bit log-quantized",
    neurons: info.neurons, connections: info.connections, weight_error_mean: info.weight_error_mean, weight_error_max: info.weight_error_max,
    files_sha256: hashes, git_commit: commit,
    neuron_params: meta.params, input_channel_sizes: inputs,
    motor_group_sizes: outputSizes && engine ? Object.fromEntries((engine.outputs as string[]).map((g, i) => [g, outputSizes![i]])) : null,
  };
} catch (err) { fail("connectome files", err); }

writeJson("meta.json", {
  dataset: "fly.ai compute network: connectome sensory-to-motor screen",
  exported_at: exportedAt,
  server: SERVER,
  errors,
  files,
  screen: screenSummary,
  screen_grid: {
    channels: [...CHANNELS], sides: ["L", "R"], amounts: [0.1, 0.2, 0.4, 0.8], gains: [2, 3, 4], tonics: [0.1, 0.14, 0.18],
    controls: "channel none (no drive), at every gain x tonic",
    seeds_per_round: 3, steps: 750, warm: 250, dt_s: 0.02, rest_window_s: 5, driven_window_s: 10,
  },
  network_stats: stats,
  engine: {
    description: "src/fixed.ts: leaky integrate-and-fire in integers. Voltage Q16 (spike at >= 1.0, reset to 0); "
      + "v <- mulshift16(v, decay) + mulshift16(input, gain*4096) + tonic + drive + noise; Q20 synapse weights summed with "
      + "32-bit wraparound; noise from a lowbias32 hash of (neuron, step key). Bit-exact across CPUs and GPUs.",
    constants: engine,
  },
  connectome,
  house,
});

console.log(`\nwrote ${Object.keys(files).length} files to ${OUT}`);
for (const [f, s] of Object.entries(files)) console.log(`  ${f.padEnd(28)} ${String(s.bytes).padStart(10)} B${s.rows !== undefined ? `  ${s.rows} rows` : ""}`);
if (errors.length) {
  console.error(`\n${errors.length} part(s) failed; see meta.json "errors"`);
  process.exit(1);
}
