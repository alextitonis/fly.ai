/**
 * The atlas orders and their fold, no server: every spec passes the server's own checks and every stimulus reaches
 * neurons (a job that matches none throws on the miner), and a synthetic pull folds to the rates put in.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { atlasInputs, atlasOrders, ATLAS_PREFIX, foldAtlas } from "../scripts/atlas.ts";
import { cells } from "../../world/src/connectome.ts";
import { loadModel } from "./load.ts";
import { houseJob, houseSpec } from "./orders.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? `: ${detail}` : ""}`);
  if (!ok) failed++;
};

const { meta } = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
const inputs = atlasInputs(meta);
const orders = atlasOrders(meta) as { label: string; spec: any }[];
const specs = orders.map((o) => houseSpec(o.spec, 1_000_000));
const conditions = orders.flatMap((o) => o.spec.conditions as { name: string; stimuli: any[] }[]);

check("every order passes the server's checks", specs.length === orders.length);
check("labels fit and are unique", new Set(orders.map((o) => o.label)).size === orders.length && orders.every((o) => /^[\w./-]{1,80}$/.test(o.label)));
check("one condition per input x side x amount, plus one control", conditions.length === inputs.length * 3 + 1 && conditions.filter((c) => !c.stimuli.length).length === 1, String(conditions.length));
check("condition names are unique", new Set(conditions.map((c) => c.name)).size === conditions.length);
check("no untyped cells are driven", inputs.every((i) => i.type));
const empty = conditions.filter((c) => c.stimuli.length && !cells(meta, c.stimuli[0].types, c.stimuli[0].side).length);
check("every stimulus reaches neurons on its side", !empty.length, empty.slice(0, 5).map((c) => c.name).join());
check("the screen's channels are all in", ["LC4", "LPLC2", "LPLC1", "LC10a"].every((t) => inputs.some((i) => i.type === t)));
const stable = JSON.stringify(atlasOrders(meta));
check("the same orders every time", stable === JSON.stringify(orders));
const job = houseJob(specs[0], 0) as any;
check("a job is the screen's window: 750 steps in 3 bins", job.steps === 750 && job.bin_steps === 250 && job.gain === 3 && job.tonic === 0.14 && job.condition === "nothing");

// a synthetic pull: 2 seeds of the control and of one input; one readout pair of 2 cells, one single wing neuron
const dir = mkdtempSync(join(tmpdir(), "atlas-"));
try {
  const at = join(dir, ATLAS_PREFIX, "p00", "id");
  mkdirSync(join(at, "outputs"), { recursive: true });
  const spec = { params: { conditions: [{ name: "nothing", stimuli: [] }, orders[0].spec.conditions[1]] }, per_seed: 2 };
  writeFileSync(join(at, "order.json"), JSON.stringify({ spec }));
  writeFileSync(join(at, "outputs", "layout.json"), JSON.stringify({ sets: [
    { name: "descending", neurons: [{ type: "DNx", side: "L" }, { type: "DNx", side: "L" }] },
    { name: "wing", neurons: [{ type: "b1 MN", side: "R" }] },
  ] }));
  // bins x neurons: rest | early | late, columns DNx, DNx, b1
  const runs = [[10, 10, 0, 20, 20, 0, 30, 30, 0], [10, 10, 0, 20, 20, 0, 30, 30, 0], [10, 10, 5, 60, 60, 5, 40, 40, 5], [20, 20, 5, 60, 60, 5, 40, 40, 5]];
  runs.forEach((r, i) => writeFileSync(join(at, "outputs", `${i + 1}.u16`), new Uint8Array(Uint16Array.from(r).buffer)));
  // settled out of order, as they do: index says which condition and seed
  const indexes = [0, 2, 1, 3];
  writeFileSync(join(at, "results.jsonl"), runs.map((_, i) => JSON.stringify({ seq: i + 1, index: indexes[i], error: null })).join("\n") + "\n");
  const out = join(dir, "atlas.csv.gz");
  const totals = await foldAtlas(dir, out, inputs);
  const rows = gunzipSync(readFileSync(out)).toString().trim().split("\n").map((l) => l.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")));
  const head = rows[0];
  const of = (r: string[], k: string) => r[head.indexOf(k)];
  check("the fold counts what it read", totals?.jobs === 4 && totals.conditions === 2 && totals.rows === 4 && rows.length === 5, JSON.stringify(totals));
  const control = rows.find((r) => of(r, "input_type") === "none" && of(r, "readout_type") === "DNx")!;
  check("control: rate is per neuron per second over a 5 s bin", of(control, "rest_hz") === "2" && of(control, "early_hz") === "4" && of(control, "late_hz") === "6" && of(control, "delta_hz") === "3" && of(control, "n_seeds") === "2", control.join());
  const driven = rows.find((r) => of(r, "input_type") !== "none" && of(r, "readout_type") === "DNx")!;
  check("driven: mean and sd over the seeds", of(driven, "rest_hz") === "3" && of(driven, "delta_hz") === "7" && of(driven, "delta_sd_hz") === "1.414", driven.join());
  check("driven: the input's name, side and cells come through", of(driven, "input_type") === inputs[0].type && of(driven, "input_side") === inputs[0].side && of(driven, "input_cells") === String(inputs[0].cells) && of(driven, "input_class") === inputs[0].class, driven.join());
  const wing = rows.find((r) => of(r, "input_type") !== "none" && of(r, "readout_type") === "b1 MN")!;
  check("a single-cell group reads on its own", of(wing, "readout_cells") === "1" && of(wing, "readout_side") === "R" && of(wing, "rest_hz") === "1", wing.join());
  check("nothing pulled folds to nothing", (await foldAtlas(join(dir, "empty"), join(dir, "none.gz"), inputs)) === null);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`${conditions.length} conditions, ${orders.length} orders`);
if (failed) { console.error(`${failed} failed`); process.exit(1); }
