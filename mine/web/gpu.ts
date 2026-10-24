/**
 * The integer brain (src/fixed.ts) on the GPU: up to 32 jobs in one batch, each result identical bit for
 * bit to src/runner.ts on the CPU.
 *
 * Each step is two compute passes, one invocation per neuron:
 *  1. synapses: sum each neuron's incoming weights from neurons that just fired, for every brain at once.
 *     `fired[j]` is a mask with one bit per brain, so an input silent in every brain costs one read.
 *  2. neurons: update the voltage in every brain, spike, and add to the spike record and motor counts.
 * After the last step one invocation per brain totals its record and counts; only that is read back.
 */
import { jobFixed, MIX, noiseKey, spikeKeyA, spikeKeyB, V_ONE, type Fixed } from "../src/fixed.ts";
import type { Model } from "../src/model.ts";
import { drivenBy, hex32, type TaskParams, type TaskResult } from "../src/runner.ts";

export const MAX_BRAINS = 32;
/** requestAdapter gave nothing: usually Chrome turned WebGPU off after a GPU crash or driver reset, until it restarts */
export const NO_ADAPTER = "the browser gives no GPU right now (after a GPU crash or driver reset Chrome turns WebGPU off until you restart it; also check hardware acceleration is on)";
/** steps queued between waits for the GPU (keeps progress moving and the queue short) */
const CHUNK = 5;

const COMMON = /* wgsl */ `
fn lowbias32(v: u32) -> u32 {
  var x = v;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

// floor(a * b / 65536), wrapping, as mulshift16 in src/fixed.ts
fn mulshift16(a: i32, b: u32) -> i32 {
  return (a >> 16u) * i32(b) + i32(((u32(a) & 0xffffu) * b) >> 16u);
}
`;

const SYNAPSES = /* wgsl */ `
struct Dims { n: u32, brains: u32, groups: u32, stride: u32 }
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<uniform> weights: array<vec4<i32>, 64>;
@group(0) @binding(2) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(3) var<storage, read> pre: array<u32>;
@group(0) @binding(4) var<storage, read> codes: array<u32>;
@group(0) @binding(5) var<storage, read> fired: array<u32>;
@group(0) @binding(6) var<storage, read_write> cur: array<i32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= dims.n) { return; }
  var acc: array<i32, 32>;
  let end = rowPtr[i + 1u];
  for (var e = rowPtr[i]; e < end; e++) {
    var m = fired[pre[e]];
    if (m == 0u) { continue; }
    let c = (codes[e >> 2u] >> ((e & 3u) * 8u)) & 255u;
    let w = weights[c >> 2u][c & 3u];
    loop {
      acc[countTrailingZeros(m)] += w;
      m &= m - 1u;
      if (m == 0u) { break; }
    }
  }
  for (var b = 0u; b < dims.brains; b++) {
    cur[b * dims.n + i] = acc[b];
  }
}
`;

const NEURONS = /* wgsl */ `
${COMMON}
struct Step {
  n: u32, brains: u32, decay: u32, noiseThresh: u32,
  noiseAmp: i32, onMask: u32, keyA: u32, keyB: u32,
}
struct Brain { gain: u32, tonic: i32, inject: i32, key: u32 }
@group(0) @binding(0) var<uniform> st: Step;
@group(0) @binding(1) var<uniform> brain: array<Brain, 32>;
@group(0) @binding(2) var<storage, read_write> v: array<i32>;
@group(0) @binding(3) var<storage, read> cur: array<i32>;
@group(0) @binding(4) var<storage, read_write> fired: array<u32>;
@group(0) @binding(5) var<storage, read> driven: array<u32>;
@group(0) @binding(6) var<storage, read_write> counts: array<u32>;  // brain-neuron: before the drive, then during
@group(0) @binding(7) var<storage, read_write> record: array<u32>;  // brain-neuron: sum A, then sum B

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= st.n) { return; }
  let bn = st.brains * st.n;
  let noiseMix = i * ${MIX.noise}u;
  var mask = 0u;
  var hashed = false;
  var hashA = 0u;
  var hashB = 0u;
  for (var b = 0u; b < st.brains; b++) {
    let idx = b * st.n + i;
    let p = brain[b];
    let on = ((st.onMask >> b) & 1u) == 1u;
    var x = mulshift16(v[idx], st.decay) + mulshift16(cur[idx], p.gain) + p.tonic;
    if (on && ((driven[i] >> b) & 1u) == 1u) { x += p.inject; }
    if (lowbias32(noiseMix ^ p.key) < st.noiseThresh) { x += st.noiseAmp; }
    if (x >= ${V_ONE}) {
      x = 0;
      mask |= 1u << b;
      if (!hashed) {
        hashA = lowbias32((i * ${MIX.spikeA}u) ^ st.keyA);
        hashB = lowbias32((i * ${MIX.spikeB}u) ^ st.keyB);
        hashed = true;
      }
      counts[select(idx, bn + idx, on)] += 1u;
      record[idx] += hashA;
      record[bn + idx] += hashB;
    }
    v[idx] = x;
  }
  fired[i] = mask;
}
`;

const TOTALS = /* wgsl */ `
struct Dims { n: u32, brains: u32, groups: u32, stride: u32 }
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> counts: array<u32>;
@group(0) @binding(2) var<storage, read> record: array<u32>;
@group(0) @binding(3) var<storage, read> groupOf: array<i32>;
@group(0) @binding(4) var<storage, read_write> out: array<u32>;  // per brain: sum A, sum B, spikes, base x groups, stim x groups

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let b = id.x;
  if (b >= dims.brains) { return; }
  let bn = dims.brains * dims.n;
  var sumA = 0u;
  var sumB = 0u;
  var spikes = 0u;
  var base: array<u32, 64>;
  var stim: array<u32, 64>;
  for (var i = 0u; i < dims.n; i++) {
    let idx = b * dims.n + i;
    let cb = counts[idx];
    let cs = counts[bn + idx];
    spikes += cb + cs;
    sumA += record[idx];
    sumB += record[bn + idx];
    let g = groupOf[i];
    if (g >= 0) {
      base[g] += cb;
      stim[g] += cs;
    }
  }
  let o = b * dims.stride;
  out[o] = sumA;
  out[o + 1u] = sumB;
  out[o + 2u] = spikes;
  for (var g = 0u; g < dims.groups; g++) {
    out[o + 3u + g] = base[g];
    out[o + 3u + dims.groups + g] = stim[g];
  }
}
`;

const STORAGE = 0x80; // GPUBufferUsage.STORAGE, spelled out so this module loads without WebGPU present
const UNIFORM = 0x40;
const COPY_DST = 0x08;
const COPY_SRC = 0x04;
const MAP_READ = 0x01;

export class GpuBrains {
  readonly adapterName: string;
  readonly maxBrains: number;
  private device: GPUDevice;
  private model: Model;
  private fx: Fixed;
  private n: number;
  private groups: number;
  private stride: number;
  private lost: string | null = null;
  /** why this device stopped working (lost or a GPU error), or null while it works */
  get broken(): string | null { return this.lost; }
  private buf: Record<"dims" | "weights" | "step" | "brains" | "rowPtr" | "pre" | "codes" | "fired" | "cur" | "v" | "driven"
    | "counts" | "record" | "groupOf" | "out" | "readback", GPUBuffer>;
  private pass!: { synapses: [GPUComputePipeline, GPUBindGroup]; neurons: [GPUComputePipeline, GPUBindGroup]; totals: [GPUComputePipeline, GPUBindGroup] };
  private stepData = new ArrayBuffer(32);
  private brainData = new ArrayBuffer(16 * MAX_BRAINS);

  /** Uploads the connectome. `maxBrains` (at most 32) sizes the per-brain buffers: ~4 MB per brain. */
  static async create(model: Model, fx: Fixed, maxBrains = MAX_BRAINS): Promise<GpuBrains> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) throw new Error("WebGPU is not available in this browser");
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error(NO_ADAPTER);
    const { n, nnz } = model.w;
    const brains = Math.max(1, Math.min(MAX_BRAINS, maxBrains));
    const largest = Math.max(nnz * 4, 2 * brains * n * 4);
    if (adapter.limits.maxStorageBufferBindingSize < largest || adapter.limits.maxBufferSize < largest) {
      throw new Error(`this GPU allows ${Math.round(adapter.limits.maxStorageBufferBindingSize / 1e6)} MB buffers; the connectome needs ${Math.round(largest / 1e6)} MB`);
    }
    const device = await adapter.requestDevice({
      requiredLimits: { maxStorageBufferBindingSize: largest, maxBufferSize: largest },
    });
    const info = adapter.info;
    const name = [info?.vendor, info?.architecture, info?.description || info?.device].filter(Boolean).join(" · ") || "GPU";
    const g = new GpuBrains(device, name, model, fx, brains);
    await g.compile();
    return g;
  }

  private constructor(device: GPUDevice, adapterName: string, model: Model, fx: Fixed, maxBrains: number) {
    this.device = device;
    this.adapterName = adapterName;
    this.model = model;
    this.fx = fx;
    this.maxBrains = maxBrains;
    this.n = model.w.n;
    this.groups = model.outputs.length;
    if (this.groups > 64) throw new Error("at most 64 motor groups");
    this.stride = 3 + 2 * this.groups;
    device.lost.then((info) => { this.lost = info.message || "GPU device lost"; });
    // any GPU error would otherwise leave wrong numbers behind silently, and wrong answers zero a miner's day
    device.addEventListener("uncapturederror", (e) => { this.lost ??= `GPU error: ${(e as GPUUncapturedErrorEvent).error.message}`; });

    // incoming synapses per neuron (the file stores outgoing ones), codes packed four to a u32
    const { n, nnz, colPtr, rowIdx, code } = model.w;
    const rowPtr = new Uint32Array(n + 1);
    for (let e = 0; e < nnz; e++) rowPtr[rowIdx[e] + 1]++;
    for (let i = 0; i < n; i++) rowPtr[i + 1] += rowPtr[i];
    const next = rowPtr.slice(0, n);
    const pre = new Uint32Array(nnz);
    const codes = new Uint32Array(Math.ceil(nnz / 4));
    for (let j = 0; j < n; j++) {
      for (let e = colPtr[j]; e < colPtr[j + 1]; e++) {
        const at = next[rowIdx[e]]++;
        pre[at] = j;
        codes[at >> 2] |= code[e] << ((at & 3) * 8);
      }
    }

    const make = (data: ArrayBufferView | number, usage: number): GPUBuffer => {
      const size = typeof data === "number" ? data : data.byteLength;
      const b = device.createBuffer({ size: Math.max(4, Math.ceil(size / 4) * 4), usage, mappedAtCreation: typeof data !== "number" });
      if (typeof data !== "number") {
        new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        b.unmap();
      }
      return b;
    };
    const per = maxBrains * n * 4;
    this.buf = {
      dims: make(16, UNIFORM | COPY_DST),
      weights: make(fx.w20, UNIFORM),
      step: make(32, UNIFORM | COPY_DST),
      brains: make(16 * MAX_BRAINS, UNIFORM | COPY_DST),
      rowPtr: make(rowPtr, STORAGE),
      pre: make(pre, STORAGE),
      codes: make(codes, STORAGE),
      groupOf: make(Int32Array.from(model.groupOf), STORAGE),
      fired: make(n * 4, STORAGE | COPY_DST),
      driven: make(n * 4, STORAGE | COPY_DST),
      v: make(per, STORAGE | COPY_DST),
      cur: make(per, STORAGE | COPY_DST),
      counts: make(2 * per, STORAGE | COPY_DST),
      record: make(2 * per, STORAGE | COPY_DST),
      out: make(maxBrains * this.stride * 4, STORAGE | COPY_SRC),
      readback: make(maxBrains * this.stride * 4, MAP_READ | COPY_DST),
    };
  }

  /** Build the three passes; a shader this GPU rejects fails here instead of computing garbage. */
  private async compile(): Promise<void> {
    const { device, buf: b } = this;
    const pipeline = async (code: string, buffers: GPUBuffer[]): Promise<[GPUComputePipeline, GPUBindGroup]> => {
      const module = device.createShaderModule({ code });
      const p = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
      const group = device.createBindGroup({
        layout: p.getBindGroupLayout(0),
        entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
      return [p, group];
    };
    const [synapses, neurons, totals] = await Promise.all([
      pipeline(SYNAPSES, [b.dims, b.weights, b.rowPtr, b.pre, b.codes, b.fired, b.cur]),
      pipeline(NEURONS, [b.step, b.brains, b.v, b.cur, b.fired, b.driven, b.counts, b.record]),
      pipeline(TOTALS, [b.dims, b.counts, b.record, b.groupOf, b.out]),
    ]);
    this.pass = { synapses, neurons, totals };
    if (this.lost) throw new Error(this.lost);
  }

  /** Runs up to maxBrains jobs with the same number of steps together. */
  async run(tasks: TaskParams[], progress?: (step: number, steps: number) => void): Promise<TaskResult[]> {
    const brains = tasks.length;
    if (brains < 1 || brains > this.maxBrains) throw new Error(`a batch holds 1..${this.maxBrains} jobs`);
    const steps = tasks[0].steps;
    if (tasks.some((t) => t.steps !== steps)) throw new Error("jobs in a batch must have the same number of steps");
    const { device, buf, n, fx } = this;
    const q = device.queue;

    const reset = device.createCommandEncoder();
    for (const b of [buf.v, buf.cur, buf.fired, buf.counts, buf.record]) reset.clearBuffer(b);
    q.submit([reset.finish()]);

    const driven = new Uint32Array(n);
    tasks.forEach((t, b) => { for (const i of drivenBy(this.model, t)) driven[i] |= 1 << b; });
    q.writeBuffer(buf.driven, 0, driven);
    q.writeBuffer(buf.dims, 0, new Uint32Array([n, brains, this.groups, this.stride]));

    const jobs = tasks.map(jobFixed);
    const stepU = new Uint32Array(this.stepData);
    const stepI = new Int32Array(this.stepData);
    const brainU = new Uint32Array(this.brainData);
    const brainI = new Int32Array(this.brainData);
    jobs.forEach((j, b) => {
      brainU[4 * b] = j.gain;
      brainI[4 * b + 1] = j.tonic;
      brainI[4 * b + 2] = j.inject;
    });
    const groups = Math.ceil(n / 256);

    for (let s = 0; s < steps; s++) {
      if (this.lost) throw new Error(this.lost);
      let onMask = 0;
      tasks.forEach((t, b) => {
        if (s >= t.warm) onMask |= 1 << b;
        brainU[4 * b + 3] = noiseKey(t.seed, s);
      });
      stepU.set([n, brains, fx.decay, fx.noiseThresh]);
      stepI[4] = fx.noiseAmp;
      stepU[5] = onMask >>> 0;
      stepU[6] = spikeKeyA(s);
      stepU[7] = spikeKeyB(s);
      q.writeBuffer(buf.step, 0, this.stepData);
      q.writeBuffer(buf.brains, 0, this.brainData);

      const enc = device.createCommandEncoder();
      for (const [pipeline, group] of [this.pass.synapses, this.pass.neurons]) {
        const p = enc.beginComputePass();
        p.setPipeline(pipeline);
        p.setBindGroup(0, group);
        p.dispatchWorkgroups(groups);
        p.end();
      }
      q.submit([enc.finish()]);
      if (s % CHUNK === CHUNK - 1 || s === steps - 1) {
        await q.onSubmittedWorkDone();
        progress?.(s + 1, steps);
      }
    }

    const enc = device.createCommandEncoder();
    const p = enc.beginComputePass();
    p.setPipeline(this.pass.totals[0]);
    p.setBindGroup(0, this.pass.totals[1]);
    p.dispatchWorkgroups(Math.ceil(brains / 32));
    p.end();
    const bytes = brains * this.stride * 4;
    enc.copyBufferToBuffer(buf.out, 0, buf.readback, 0, bytes);
    q.submit([enc.finish()]);
    await buf.readback.mapAsync(MAP_READ, 0, bytes);
    const out = new Uint32Array(buf.readback.getMappedRange(0, bytes).slice(0));
    buf.readback.unmap();
    if (this.lost) throw new Error(this.lost);

    const G = this.groups;
    return tasks.map((_, b) => {
      const o = b * this.stride;
      return {
        hash: hex32(out[o]) + hex32(out[o + 1]),
        spikes: out[o + 2],
        base: Array.from(out.subarray(o + 3, o + 3 + G)),
        stim: Array.from(out.subarray(o + 3 + G, o + 3 + 2 * G)),
      };
    });
  }

  destroy(): void {
    for (const b of Object.values(this.buf)) b.destroy();
    this.device.destroy();
  }
}
