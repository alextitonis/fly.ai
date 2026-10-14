/**
 * The non-visual senses, in the same style as flybrain/eyes.py: geometry in, voltage
 * on named sensory neurons out. Nothing here decides what the fly does.
 *
 *  * Olfaction: a turbulent puff field. Every source releases discrete packets
 *    that are advected downwind and spread as they go, so a fly downwind gets
 *    intermittent HITS with real gaps between them, not a smooth gradient.
 *    Receptor neurons are phasic: they adapt to a steady concentration, so what
 *    they report is the onset of a puff.
 *  * Johnston's organ: airflow, which is the wind minus the fly's own velocity,
 *    plus its own wingbeat and the wingbeat of near neighbours.
 *  * Leg mechanosensors: SNta when the legs touch something, LgLG when the fly
 *    is knocked or loaded, LB3 when there is food under the labellum.
 */
import type { Brain } from "./brain.ts";
import { mulberry32 } from "./rng.ts";
import { ORN_TYPES, type Wiring } from "./wiring.ts";

/** Odour channels. The receptor-to-ligand pairings are the real ones. */
export const CHANNELS = [
  "ethyl acetate", // ripe fruit
  "ethyl butyrate", // fermenting fruit
  "acetic acid", // vinegar
  "amines", // carrion and dung
  "geosmin", // mould: harmful microbes. Aversive.
  "CO2", // compost, and stressed flies. Aversive.
  "cVA", // the fly pheromone
];
export const CH = { ester: 0, butyrate: 1, acid: 2, amine: 3, geosmin: 4, co2: 5, cva: 6 };
export const NCH = CHANNELS.length;

export const SMELL = {
  odour_gain: 2.2, // concentration -> receptor voltage (saturating)
  adapt: 0.8, // how much of the slow average is subtracted: phasic receptors
  adapt_tau: 0.5, // seconds
  /** Or56a (geosmin) and Gr21a (CO2) are narrowly tuned labelled lines that
   *  report a sustained danger rather than a plume edge, so they do not adapt. */
  adapt_aversive: 0.0,
  antenna: 0.3, // half the distance between the antennae, metres
  reach: 0.35, // how far forward the antennae sit
  near: 2.2, // metres: the still-air near field of a source
  cap: 0.8, // most voltage any channel adds in one step (flybrain.eyes.ENCODER.cap)
};

/** Puff plume parameters. */
export const PLUME = {
  rate: 1.6, // puffs per second per unit of source strength
  r0: 0.32, // metres, radius of a fresh puff
  growth: 0.30, // metres per second of spreading
  wander: 0.55, // metres per sqrt(second) of turbulent wander
  maxRadius: 4.2, // a puff this diffuse is gone
  maxAge: 20, // seconds
  max: 1400, // hard cap on live puffs
};

/** Which receptor answers which channel. Ligands are real; numbers are ours. */
export const TUNING: Record<string, number[]> = {
  //            ester bty  acid amine geos CO2  cVA
  ORN_DM1: [1.0, 0.35, 0.1, 0.05, 0, 0, 0],
  ORN_VM5d: [0.3, 1.0, 0.2, 0.1, 0, 0, 0],
  ORN_VL2a: [0.2, 0.3, 1.0, 0.15, 0, 0, 0],
  IR92a: [0, 0, 0.1, 1.0, 0, 0, 0],
  Or56a: [0, 0, 0, 0, 1.0, 0, 0],
  Gr21a: [0, 0, 0, 0, 0, 1.0, 0],
  ORN_DA1: [0, 0, 0, 0, 0, 0, 1.0],
  ORN_VA1d: [0, 0, 0.05, 0, 0, 0, 0.85],
};

export interface Emitter {
  id: number;
  x: number;
  z: number;
  channel: number;
  strength: number; // 0..1
  /** true for a moving point source (a fly): no puffs, near field only */
  point?: boolean;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// the sampling grid: cells a little wider than the widest puff
const GRID_CELL = 13;
const GRID_HALF = 52;
const GRID_N = Math.ceil((GRID_HALF * 2) / GRID_CELL);

/** A field of discrete odour packets drifting on the wind. */
export class OdourField {
  private px = new Float32Array(PLUME.max);
  private pz = new Float32Array(PLUME.max);
  private pr = new Float32Array(PLUME.max);
  private pm = new Float32Array(PLUME.max);
  private pc = new Int32Array(PLUME.max);
  private page = new Float32Array(PLUME.max);
  private count = 0;
  private pending = new Map<number, number>();
  private rand: () => number;

  constructor(seed = 99) {
    this.rand = mulberry32(seed);
  }

  // uniform grid, so sampling a point only visits nearby puffs
  private cellStart = new Int32Array(GRID_N * GRID_N + 1);
  private order = new Int32Array(PLUME.max);
  private cursor = new Int32Array(GRID_N * GRID_N);
  /** point sources (flies), sampled as a near field instead of as puffs */
  points: Emitter[] = [];

  get puffCount(): number {
    return this.count;
  }

  /** Positions of live puffs, for drawing them. */
  forEachPuff(fn: (x: number, z: number, r: number, channel: number, mass: number) => void): void {
    for (let i = 0; i < this.count; i++) fn(this.px[i], this.pz[i], this.pr[i], this.pc[i], this.pm[i]);
  }

  /** Moves every puff by (dx, dz): a world that recentres on its player (Flyborne's floating origin) keeps its plumes. */
  shift(dx: number, dz: number): void {
    for (let i = 0; i < this.count; i++) { this.px[i] += dx; this.pz[i] += dz; }
  }

  step(dt: number, windX: number, windZ: number, emitters: Emitter[]): void {
    const p = PLUME;
    // release
    for (const e of emitters) {
      if (e.strength <= 0 || e.point) continue;
      const key = e.id * 16 + e.channel;
      let due = (this.pending.get(key) ?? this.rand()) + p.rate * e.strength * dt;
      while (due >= 1 && this.count < p.max) {
        due -= 1;
        const i = this.count++;
        this.px[i] = e.x + (this.rand() - 0.5) * 0.5;
        this.pz[i] = e.z + (this.rand() - 0.5) * 0.5;
        this.pr[i] = p.r0;
        this.pm[i] = e.strength;
        this.pc[i] = e.channel;
        this.page[i] = 0;
      }
      this.pending.set(key, due);
    }
    // advect, spread, retire
    const wander = p.wander * Math.sqrt(dt);
    for (let i = 0; i < this.count; i++) {
      this.px[i] += windX * dt + (this.rand() - 0.5) * 2 * wander;
      this.pz[i] += windZ * dt + (this.rand() - 0.5) * 2 * wander;
      this.pr[i] += p.growth * dt;
      this.page[i] += dt;
      if (this.pr[i] > p.maxRadius || this.page[i] > p.maxAge) {
        const last = --this.count;
        this.px[i] = this.px[last]; this.pz[i] = this.pz[last]; this.pr[i] = this.pr[last];
        this.pm[i] = this.pm[last]; this.pc[i] = this.pc[last]; this.page[i] = this.page[last];
        i--;
      }
    }
    this.rebuildGrid();
  }

  private cellOf(x: number, z: number): number {
    const cx = Math.min(GRID_N - 1, Math.max(0, Math.floor((x + GRID_HALF) / GRID_CELL)));
    const cz = Math.min(GRID_N - 1, Math.max(0, Math.floor((z + GRID_HALF) / GRID_CELL)));
    return cz * GRID_N + cx;
  }

  /** counting sort of the live puffs into grid cells */
  private rebuildGrid(): void {
    const cells = GRID_N * GRID_N;
    this.cellStart.fill(0);
    for (let i = 0; i < this.count; i++) this.cellStart[this.cellOf(this.px[i], this.pz[i]) + 1]++;
    for (let c = 0; c < cells; c++) this.cellStart[c + 1] += this.cellStart[c];
    const cursor = this.cursor;
    cursor.fill(0);
    for (let i = 0; i < this.count; i++) {
      const c = this.cellOf(this.px[i], this.pz[i]);
      this.order[this.cellStart[c] + cursor[c]++] = i;
    }
  }

  /** Concentration of every channel at one point. `out` is added to, not reset. */
  sample(x: number, z: number, out: Float32Array, skipId = -1): void {
    const r0sq = PLUME.r0 * PLUME.r0;
    const cx = Math.floor((x + GRID_HALF) / GRID_CELL);
    const cz = Math.floor((z + GRID_HALF) / GRID_CELL);
    // a puff is at most 3 * maxRadius wide, which is one cell either side
    for (let gz = Math.max(0, cz - 1); gz <= Math.min(GRID_N - 1, cz + 1); gz++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(GRID_N - 1, cx + 1); gx++) {
        const c = gz * GRID_N + gx;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.order[k];
          const dx = x - this.px[i], dz = z - this.pz[i];
          const r = this.pr[i];
          const d2 = dx * dx + dz * dz;
          if (d2 > 9 * r * r) continue; // three radii out, nothing left
          out[this.pc[i]] += this.pm[i] * (r0sq / (r * r)) * Math.exp(-d2 / (2 * r * r));
        }
      }
    }
    const near2 = SMELL.near * SMELL.near;
    for (const e of this.points) {
      if (e.id === skipId || e.strength <= 0) continue;
      const dx = x - e.x, dz = z - e.z;
      out[e.channel] += e.strength / (1 + (dx * dx + dz * dz) / near2);
    }
  }
}

export class Olfaction {
  /** per receptor type: [left, right] voltage, for the UI */
  readonly drive: Record<string, [number, number]> = {};
  /** concentration of each channel at each antenna, for the UI */
  readonly conc: [Float32Array, Float32Array] = [new Float32Array(NCH), new Float32Array(NCH)];
  /** how strong the strongest food hit is right now, for measuring surges */
  hit = 0;
  private w: Wiring;
  private slow: Record<string, [number, number]> = {};

  constructor(wiring: Wiring) {
    this.w = wiring;
    for (const t of ORN_TYPES) {
      this.drive[t] = [0, 0];
      this.slow[t] = [0, 0];
    }
  }

  sniff(
    brain: Brain, px: number, pz: number, yaw: number,
    field: OdourField, strength: number, dt = 0.02, selfId = -1,
  ): void {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const p = SMELL;
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? -1 : 1; // 0 = left antenna
      const ax = px + sin * p.reach + cos * sign * p.antenna;
      const az = pz + cos * p.reach - sin * sign * p.antenna;
      this.conc[s].fill(0);
      field.sample(ax, az, this.conc[s], selfId);
    }

    this.hit = 0;
    for (const type of ORN_TYPES) {
      const tune = TUNING[type];
      for (let s = 0; s < 2; s++) {
        let sum = 0;
        for (let k = 0; k < NCH; k++) sum += tune[k] * this.conc[s][k];
        const raw = p.cap * (1 - Math.exp(-p.odour_gain * strength * sum));
        // phasic: subtract a slow average, so what reaches the brain is onset
        const slow = this.slow[type];
        slow[s] += (raw - slow[s]) * Math.min(1, dt / p.adapt_tau);
        const adapt = type === "Or56a" || type === "Gr21a" ? p.adapt_aversive : p.adapt;
        const v = clamp(raw - adapt * slow[s], 0, p.cap);
        this.drive[type][s] = v;
        if (v > 0) brain.stimulate(this.w.index.get(type + (s === 0 ? "_L" : "_R"))!, v);
      }
    }
    for (const t of ["ORN_DM1", "ORN_VM5d", "ORN_VL2a", "IR92a"]) {
      this.hit = Math.max(this.hit, this.drive[t][0], this.drive[t][1]);
    }
  }
}

export const MECH = {
  jo_gain: 0.1, // per m/s of airflow
  jo_self: 0.22, // the fly's own wingbeat
  jo_neighbour: 0.3, // other flies' wingbeat nearby
  sn_gain: 0.75, // tarsal contact
  sn_tau: 0.7, // seconds: tarsal mechanoreceptors are phasic
  load_gain: 0.7, // knocks and load
  taste_gain: 0.8, // food on the labellum
  flow_gain: 0.30, // ventral optic flow -> VS cells
  cap: 0.8,
};

export interface Contact {
  loadL: number;
  loadR: number;
  knockL: number;
  knockR: number;
  taste: number;
}

export class Mechanosensors {
  readonly jo: [number, number] = [0, 0];
  readonly leg: [number, number] = [0, 0];
  readonly load: [number, number] = [0, 0];
  taste = 0;
  flow = 0;
  private w: Wiring;
  private adaptL = 0;
  private adaptR = 0;

  constructor(wiring: Wiring) {
    this.w = wiring;
  }

  /** airX/airZ: the air's velocity relative to the fly. `flow` is ventral optic
   *  flow (ground speed over height), which is how a real fly holds altitude. */
  sense(
    brain: Brain, yaw: number, airX: number, airZ: number, wingbeat: number,
    neighbourL: number, neighbourR: number, contact: Contact, flow: number, dt = 0.02,
  ): void {
    const m = MECH;
    const speed = Math.hypot(airX, airZ);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const lateral = speed > 1e-4 ? (-airX * cos + airZ * sin) / speed : 0; // +1 = from the right
    const base = m.jo_gain * speed * 0.5;
    const asym = m.jo_gain * speed * 0.9;
    const self = m.jo_self * wingbeat;
    this.jo[0] = clamp(base + asym * Math.max(0, -lateral) + self + m.jo_neighbour * neighbourL, 0, m.cap);
    this.jo[1] = clamp(base + asym * Math.max(0, lateral) + self + m.jo_neighbour * neighbourR, 0, m.cap);

    // Tarsal neurons are phasic: they report the moment of contact and then
    // adapt. The taste bristles (LB3) do not, which is why food keeps a fly put.
    const k = Math.min(1, dt / m.sn_tau);
    this.adaptL += (contact.loadL - this.adaptL) * k;
    this.adaptR += (contact.loadR - this.adaptR) * k;
    this.leg[0] = clamp(m.sn_gain * Math.max(0, contact.loadL - this.adaptL), 0, m.cap);
    this.leg[1] = clamp(m.sn_gain * Math.max(0, contact.loadR - this.adaptR), 0, m.cap);
    this.load[0] = clamp(m.load_gain * contact.knockL, 0, m.cap);
    this.load[1] = clamp(m.load_gain * contact.knockR, 0, m.cap);
    this.taste = clamp(m.taste_gain * contact.taste, 0, m.cap);
    this.flow = clamp(m.flow_gain * flow, 0, m.cap);

    const inject = (type: string, side: 0 | 1, amount: number) => {
      if (amount > 0) brain.stimulate(this.w.index.get(type + (side === 0 ? "_L" : "_R"))!, amount);
    };
    inject("JO", 0, this.jo[0]);
    inject("JO", 1, this.jo[1]);
    inject("SNta", 0, this.leg[0]);
    inject("SNta", 1, this.leg[1]);
    inject("LgLG", 0, this.load[0]);
    inject("LgLG", 1, this.load[1]);
    inject("LB3", 0, this.taste);
    inject("LB3", 1, this.taste);
    inject("VS", 0, this.flow);
    inject("VS", 1, this.flow);
  }
}
