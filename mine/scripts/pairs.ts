/**
 * Pairs of senses (mine/dataset/ATLAS.md, "Pairs"): the 60 strongest sensory inputs of the atlas (dataset/pairs-1.json,
 * frozen from atlas v1 by the rule written in it), every two of them driven together. Same window, gain, tonic and seeds
 * as the atlas, so each pair lines up seed for seed with the atlas rows of its two inputs alone: the export adds how far
 * the pair is from the sum of its parts (pair - a - b + control).
 *
 * Orders are probe house orders under atlas/pairs-1/, started by scripts/seed-house.ts --only atlas/pairs-1/, folded by
 * the server (src/pack.worker.ts, pairLines) and joined with the atlas by scripts/export-dataset.ts into pairs.csv.gz.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ConnectomeMeta } from "../../world/src/connectome.ts";
import { atlasInputs, csvCell, PAIRS_HEADER, PAIRS_PREFIX, pairLines, type AtlasInput } from "../src/fold.ts";
import { foldProbeOrders } from "./atlas.ts";

export { PAIRS_PREFIX };
const SEEDS = 10;
const SEED_BASE = 70_000; // the atlas's seeds: a pair and its two inputs alone see the same noise
const STEPS = 750;
const WARM = 250;
const BIN_STEPS = 250;
const PER_ORDER = 64;
/** Points per job: an atlas job's window; the second stimulus only adds its drive loop. */
export const PAIRS_UNITS = 8;
export const PAIRS_FILE = new URL("../dataset/pairs-1.json", import.meta.url);

interface PairsFile { amount: number; inputs: { type: string; side: "L" | "R" }[] }
const readPairsFile = (): PairsFile => JSON.parse(readFileSync(PAIRS_FILE, "utf8"));

/** The chosen inputs, as the atlas knows them; throws if the connectome no longer has one. */
export function pairInputs(meta: ConnectomeMeta): AtlasInput[] {
  const known = new Map(atlasInputs(meta).map((i) => [`${i.type}\0${i.side}`, i]));
  return readPairsFile().inputs.map((x) => {
    const i = known.get(`${x.type}\0${x.side}`);
    if (!i) throw new Error(`pairs-1.json: ${x.type} ${x.side} is not an atlas input`);
    return i;
  });
}

/** Every unordered pair once, plus one undriven control (it must match the atlas's control bit for bit). */
export function pairsOrders(meta: ConnectomeMeta, seeds = SEEDS): { label: string; spec: object }[] {
  const { amount } = readPairsFile();
  const inputs = pairInputs(meta);
  const stim = (i: AtlasInput) => ({ types: [i.type], side: i.side, amount, from: WARM, to: STEPS });
  const conditions: { name: string; stimuli: object[] }[] = [{ name: "nothing", stimuli: [] }];
  for (let a = 0; a < inputs.length; a++) {
    for (let b = a + 1; b < inputs.length; b++) conditions.push({ name: `q${a}-${b}`, stimuli: [stim(inputs[a]), stim(inputs[b])] });
  }
  const orders: { label: string; spec: object }[] = [];
  for (let at = 0, k = 0; at < conditions.length; at += PER_ORDER, k++) {
    orders.push({
      label: `${PAIRS_PREFIX}/p${String(k).padStart(2, "0")}`,
      spec: {
        kind: "probe", seeds, seed_base: SEED_BASE, steps: STEPS, gain: 3, tonic: 0.14, bin_steps: BIN_STEPS, record: ["descending", "wing"],
        conditions: conditions.slice(at, at + PER_ORDER),
      },
    });
  }
  return orders;
}

/** A local pull folded into the server's table shape (no interaction columns yet). */
export function foldPairs(house: string, out: string, inputs: AtlasInput[]) {
  return foldProbeOrders(house, out, PAIRS_PREFIX, PAIRS_HEADER, (spec, groups, runs) => pairLines(spec, groups, runs, inputs));
}

/** One CSV line into cells (types hold commas, so they come quoted). */
export function csvSplit(line: string): string[] {
  const out: string[] = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cell); cell = ""; } else cell += ch;
  }
  out.push(cell);
  return out;
}

export const INTERACTION_COLUMNS = ["a_delta_hz", "b_delta_hz", "control_delta_hz", "sum_delta_hz", "interaction_hz", "interaction_se_hz"];
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * The pairs table with the atlas joined in. For each readout: sum = a + b - control (what the pair would do if the two
 * inputs simply added), interaction = pair - sum. The se treats the four estimates as independent; they share seeds, so
 * it is on the safe (wide) side.
 */
export function withInteraction(pairsCsv: string, atlasGz: Buffer): { text: string; rows: number; joined: number } {
  const lines = pairsCsv.trim().split("\n");
  const head = csvSplit(lines[0]);
  const col = (k: string) => { const i = head.indexOf(k); if (i < 0) throw new Error(`pairs table has no ${k}`); return i; };
  const [aType, aSide, bType, bSide, amountCol, rSet, rType, rSide, nCol, dCol, sdCol] =
    ["a_type", "a_side", "b_type", "b_side", "amount", "readout_set", "readout_type", "readout_side", "n_seeds", "delta_hz", "delta_sd_hz"].map(col);
  const amounts = new Set(lines.slice(1).map((l) => csvSplit(l)[amountCol]).filter((a) => a !== "0"));

  // atlas rows at the pairs' amount, and the control: input x side x readout -> delta, sd, n
  const atlas = new Map<string, number[]>();
  const alines = gunzipSync(atlasGz).toString("utf8").split("\n");
  const ah = csvSplit(alines[0]);
  const ai = (k: string) => ah.indexOf(k);
  const [it, is, am, as, at, ar, an, ad, asd] = ["input_type", "input_side", "amount", "readout_set", "readout_type", "readout_side", "n_seeds", "delta_hz", "delta_sd_hz"].map(ai);
  for (let k = 1; k < alines.length; k++) {
    const l = alines[k];
    if (!l) continue;
    const c = csvSplit(l);
    if (c[it] !== "none" && !amounts.has(c[am])) continue;
    atlas.set([c[it], c[is], c[as], c[at], c[ar]].join("\0"), [Number(c[ad]), Number(c[asd]), Number(c[an])]);
  }

  let joined = 0;
  const out = [[...head, ...INTERACTION_COLUMNS].map(csvCell).join(",")];
  for (const l of lines.slice(1)) {
    const c = csvSplit(l);
    const readout = [c[rSet], c[rType], c[rSide]];
    const a = atlas.get([c[aType], c[aSide], ...readout].join("\0"));
    const b = atlas.get([c[bType], c[bSide], ...readout].join("\0"));
    const z = atlas.get(["none", "", ...readout].join("\0"));
    let extra: (number | string)[] = ["", "", "", "", "", ""];
    if (c[aType] !== "none" && a && b && z) {
      const pair = Number(c[dCol]), psd = Number(c[sdCol]), n = Number(c[nCol]);
      const sum = a[0] + b[0] - z[0];
      const se = Math.sqrt(psd ** 2 / n + a[1] ** 2 / a[2] + b[1] ** 2 / b[2] + z[1] ** 2 / z[2]);
      extra = [a[0], b[0], z[0], r3(sum), r3(pair - sum), r3(se)];
      joined++;
    }
    out.push([...c, ...extra].map(csvCell).join(","));
  }
  return { text: `${out.join("\n")}\n`, rows: lines.length - 1, joined };
}
