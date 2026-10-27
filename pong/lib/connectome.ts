/**
 * The real connectome (MaleCNS v1.0, 166,700 neurons) in the browser: the files written by
 * `flybrain export --web` (see flybrain/web.py) and the same update as flybrain/brain.py:
 *
 *   v <- exp(-dt/tau) * v + gain * postGain * (W @ spikes) + tonic + tonicExtra + noise + injected
 *   v >= 1  ->  spike, reset to 0
 *
 * postGain and tonicExtra are 1 and 0 everywhere unless a calibration (wiz/vnc.py) sets them.
 * Buffers passed in are already decompressed; loading differs between a page and Node.
 */
import { mulberry32 } from "./rng.ts";

export interface ConnectomeParams {
  dt: number; tau: number; gain: number; tonic: number; noise_hz: number; noise_amp: number;
}

export interface ConnectomeMeta {
  n: number;
  types: string[];
  superclasses: string[];
  params: ConnectomeParams;
  sensoryInput: boolean;
  typeIdx: Uint16Array;
  classIdx: Uint8Array;
  /** 0 unknown, 1 left, 2 right */
  side: Uint8Array;
}

const text = new TextDecoder();

function magic(view: DataView, expect: string): void {
  const got = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (got !== expect) throw new Error(`not a ${expect} file (got ${JSON.stringify(got)})`);
}

export function parseMeta(buf: ArrayBuffer): ConnectomeMeta {
  const view = new DataView(buf);
  magic(view, "FLYM");
  const n = view.getUint32(8, true);
  const len = view.getUint32(12, true);
  const head = JSON.parse(text.decode(new Uint8Array(buf, 16, len)));
  let at = 16 + len;
  const typeIdx = new Uint16Array(buf.slice(at, at + 2 * n)); at += 2 * n;
  const classIdx = new Uint8Array(buf, at, n); at += n;
  const side = new Uint8Array(buf, at, n);
  return { n, types: head.types, superclasses: head.superclasses, params: head.params,
    sensoryInput: head.sensory_input, typeIdx, classIdx, side };
}

export interface ConnectomeWeights {
  n: number;
  nnz: number;
  /** CSC: the targets of presynaptic neuron j are rowIdx[colPtr[j] .. colPtr[j+1]) */
  colPtr: Uint32Array;
  rowIdx: Uint32Array;
  /** weight code per synapse; lut[code] is the signed weight */
  code: Uint8Array;
  lut: Float32Array;
}

export function parseWeights(buf: ArrayBuffer): ConnectomeWeights {
  const view = new DataView(buf);
  magic(view, "FLYW");
  const n = view.getUint32(8, true);
  const nnz = view.getUint32(12, true);
  const lnMin = view.getFloat32(16, true);
  const bytes = new Uint8Array(buf);
  let at = 20;
  const varint = (): number => {
    let x = 0, shift = 0, b = 0;
    do {
      b = bytes[at++];
      x += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return x;
  };
  const colPtr = new Uint32Array(n + 1);
  for (let j = 0; j < n; j++) colPtr[j + 1] = colPtr[j] + varint();
  const rowIdx = new Uint32Array(nnz);
  for (let j = 0; j < n; j++) {
    let row = 0;
    for (let e = colPtr[j], first = true; e < colPtr[j + 1]; e++, first = false) {
      row = first ? varint() : row + varint();
      rowIdx[e] = row;
    }
  }
  const code = bytes.slice(at, at + nnz);
  const lut = new Float32Array(256);
  for (let q = 0; q < 128; q++) {
    const mag = Math.exp(lnMin * (1 - q / 127));
    lut[q] = mag;
    lut[q | 0x80] = -mag;
  }
  return { n, nnz, colPtr, rowIdx, code, lut };
}

/** Neurons by cell type (or superclass name), optionally one side, like FlyBrain.cells. */
export function cells(meta: ConnectomeMeta, names: string[], side?: "L" | "R"): Int32Array {
  const want = new Set(names);
  const typeHit = meta.types.map((t) => want.has(t));
  const classHit = meta.superclasses.map((c) => want.has(c));
  const s = side === "L" ? 1 : side === "R" ? 2 : 0;
  const out: number[] = [];
  for (let i = 0; i < meta.n; i++) {
    if (!(typeHit[meta.typeIdx[i]] || classHit[meta.classIdx[i]])) continue;
    if (s && meta.side[i] !== s) continue;
    out.push(i);
  }
  return Int32Array.from(out);
}

/** Neurons whose cell type starts with a prefix (e.g. "SNta", "MNad"). */
export function cellsWithPrefix(meta: ConnectomeMeta, prefix: string, side?: "L" | "R"): Int32Array {
  const hit = meta.types.map((t) => t.startsWith(prefix));
  const s = side === "L" ? 1 : side === "R" ? 2 : 0;
  const out: number[] = [];
  for (let i = 0; i < meta.n; i++) if (hit[meta.typeIdx[i]] && (!s || meta.side[i] === s)) out.push(i);
  return Int32Array.from(out);
}

export class ConnectomeBrain {
  readonly n: number;
  readonly v: Float32Array;
  /** injected voltage for the next step only */
  readonly drive: Float32Array;
  readonly current: Float32Array;
  readonly fired: Int32Array;
  firedCount = 0;
  /** multiplier on synaptic input per postsynaptic neuron, and extra tonic per neuron */
  readonly postGain: Float32Array;
  readonly tonicExtra: Float32Array;
  steps = 0;
  readonly w: ConnectomeWeights;
  readonly p: ConnectomeParams;
  private rand: () => number;

  constructor(w: ConnectomeWeights, p: ConnectomeParams, seed = 64) {
    this.w = w;
    this.p = p;
    this.n = w.n;
    this.v = new Float32Array(w.n);
    this.drive = new Float32Array(w.n);
    this.current = new Float32Array(w.n);
    this.fired = new Int32Array(w.n);
    this.postGain = new Float32Array(w.n).fill(1);
    this.tonicExtra = new Float32Array(w.n);
    this.rand = mulberry32(seed);
  }

  stimulate(idx: Int32Array, amount: number): void {
    if (amount === 0) return;
    for (let k = 0; k < idx.length; k++) this.drive[idx[k]] += amount;
  }

  step(): void {
    const { colPtr, rowIdx, code, lut } = this.w;
    const cur = this.current;
    cur.fill(0);
    for (let k = 0; k < this.firedCount; k++) {
      const j = this.fired[k];
      const end = colPtr[j + 1];
      for (let e = colPtr[j]; e < end; e++) cur[rowIdx[e]] += lut[code[e]];
    }
    const p = this.p;
    const decay = Math.exp(-p.dt / p.tau);
    const pNoise = p.noise_hz * p.dt;
    const { v, drive, postGain, tonicExtra, fired } = this;
    const rand = this.rand;
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      let x = decay * v[i] + p.gain * postGain[i] * cur[i] + p.tonic + tonicExtra[i] + drive[i];
      if (rand() < pNoise) x += p.noise_amp;
      if (x >= 1) {
        fired[m++] = i;
        x = 0;
      }
      v[i] = x;
      drive[i] = 0;
    }
    this.firedCount = m;
    this.steps++;
  }
}
