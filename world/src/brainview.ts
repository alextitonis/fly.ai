/**
 * Live view of one fly's brain: every neuron as a dot, grouped by modality,
 * flashing when it fires -- the same idea as sshfighter/dashboard.html, which
 * does this for all 166,700 neurons of the real connectome.
 */
import type { Brain } from "./brain.ts";
import type { Modality, Wiring } from "./wiring.ts";

export const MODALITY_COLOR: Record<Modality, string> = {
  vision: "#3ed8ff",
  olfaction: "#ffb23e",
  mechanosensory: "#7ce0c0",
  memory: "#c9a2ff",
  central: "#9fb4c8",
  descending: "#6cf08a",
  motor: "#b8ffcf",
};

export const POP_COLOR: Record<string, string> = {
  "R1-6": "#5a6b7d",
  "L1/L2": "#7a8ea3",
  LPLC2: "#ff5a5a",
  LC4: "#ff5ad2",
  LPLC1: "#ffe14d",
  LC10a: "#3ed8ff",
  VS: "#7fc8ff",
  ORN_DM1: "#ffb23e",
  ORN_VM5d: "#ff9a2e",
  ORN_VL2a: "#e5a03c",
  IR92a: "#d8a05a",
  Or56a: "#ff6060",
  Gr21a: "#ff8a4a",
  "DA2 PN": "#ff7a7a",
  LH: "#ff9a6a",
  ORN_DA1: "#ff7ad2",
  ORN_VA1d: "#ff9ade",
  "AL-LN": "#b07cff",
  lPN: "#ffd27a",
  JO: "#7ce0c0",
  WED: "#4fd6b0",
  SNta: "#ff9f68",
  LgLG: "#c9a2ff",
  LB3: "#ffd0e0",
  PVLP: "#9fb4c8",
  PLP: "#8fa2b8",
  LPi: "#b07cff",
  LAL: "#9fb4c8",
  PFL3: "#aebfd0",
  DNa02: "#6cf08a",
  DNp01: "#6cf08a",
  DNg100: "#6cf08a",
  MDN: "#6cf08a",
  "VNC-IN": "#8fa2b8",
  IN19A: "#b07cff",
  "DLM MN": "#b8ffcf",
  "b1 MN": "#b8ffcf",
  "b2 MN": "#b8ffcf",
  "Ti flexor MN": "#9be8b8",
  "Ti extensor MN": "#9be8b8",
  "Tr flexor MN": "#9be8b8",
  "Sternotrochanter MN": "#9be8b8",
};

const W = 470;
const H = 560;
const PAD = 8;
const RASTER_W = 260;

export class BrainView {
  private wiring: Wiring;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private glow: HTMLCanvasElement;
  private rctx: CanvasRenderingContext2D | null;
  private rasterCol = 0;
  private pending: number[] = [];

  constructor(canvas: HTMLCanvasElement, wiring: Wiring, raster: HTMLCanvasElement | null) {
    this.wiring = wiring;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d")!;
    this.base = document.createElement("canvas");
    this.base.width = W;
    this.base.height = H;
    this.glow = document.createElement("canvas");
    this.glow.width = W;
    this.glow.height = H;
    if (raster) {
      raster.width = RASTER_W;
      raster.height = 120;
      this.rctx = raster.getContext("2d")!;
      this.rctx.fillStyle = "#060707";
      this.rctx.fillRect(0, 0, RASTER_W, 120);
    } else {
      this.rctx = null;
    }
    this.drawBase();
  }

  private px(x: number): number {
    return PAD + x * (W - 2 * PAD);
  }

  private py(y: number): number {
    return 16 + y * (H - 24);
  }

  private drawBase(): void {
    const g = this.base.getContext("2d")!;
    g.clearRect(0, 0, W, H);

    // column dividers
    g.strokeStyle = "rgba(62,216,255,0.10)";
    for (let c = 1; c < 3; c++) {
      g.beginPath();
      g.moveTo(this.px(c / 3), 6);
      g.lineTo(this.px(c / 3), H - 4);
      g.stroke();
    }

    g.font = "9px ui-monospace, Consolas, monospace";
    const labelled = new Set<string>();
    const modalityAt = new Map<string, number>();
    for (const pop of this.wiring.pops) {
      // the midline of each column block
      if (!labelled.has(pop.name)) {
        labelled.add(pop.name);
        g.fillStyle = "rgba(160,175,190,0.8)";
        g.textAlign = "center";
        g.fillText(pop.name, this.px(pop.labelX), this.py(pop.labelY) + 3);
        const key = pop.modality;
        if (!modalityAt.has(key)) modalityAt.set(key, this.py(pop.labelY) - 13);
      }
      for (let k = 0; k < pop.count; k++) {
        const i = pop.start + k;
        g.fillStyle = "rgba(150,170,190,0.20)";
        g.beginPath();
        g.arc(this.px(this.wiring.viewX[i]), this.py(this.wiring.viewY[i]), 1.7, 0, 6.284);
        g.fill();
      }
    }

    // modality headings
    g.font = "bold 9px ui-monospace, Consolas, monospace";
    for (const [modality, y] of modalityAt) {
      const pop = this.wiring.pops.find((p) => p.modality === modality)!;
      g.fillStyle = MODALITY_COLOR[pop.modality];
      g.textAlign = "center";
      g.fillText(modality.toUpperCase(), this.px(pop.labelX), y);
    }

    g.font = "9px ui-monospace, Consolas, monospace";
    g.fillStyle = "rgba(135,147,160,0.55)";
    g.textAlign = "left";
    g.fillText("L | R", PAD, 10);
  }

  /** Called once per simulation step for the selected fly. */
  record(brain: Brain): void {
    for (let k = 0; k < brain.firedCount; k++) this.pending.push(brain.fired[k]);
    if (this.rctx) {
      const r = this.rctx;
      r.fillStyle = "#060707";
      r.fillRect(this.rasterCol, 0, 2, 120);
      for (let k = 0; k < brain.firedCount; k++) {
        const i = brain.fired[k];
        const pop = this.wiring.pops[this.wiring.popOf[i]];
        r.fillStyle = POP_COLOR[pop.name] ?? "#ffb23e";
        r.fillRect(this.rasterCol, (i / this.wiring.n) * 120, 1.4, 1.6);
      }
      this.rasterCol = (this.rasterCol + 1) % RASTER_W;
      r.fillStyle = "rgba(62,216,255,0.35)";
      r.fillRect(this.rasterCol, 0, 1, 120);
    }
  }

  clear(): void {
    this.pending.length = 0;
    this.glow.getContext("2d")!.clearRect(0, 0, W, H);
  }

  draw(): void {
    const g = this.glow.getContext("2d")!;
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "rgba(0,0,0,0.30)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    for (const i of this.pending) {
      const pop = this.wiring.pops[this.wiring.popOf[i]];
      g.fillStyle = POP_COLOR[pop.name] ?? "#ffb23e";
      g.beginPath();
      g.arc(this.px(this.wiring.viewX[i]), this.py(this.wiring.viewY[i]), 3, 0, 6.284);
      g.fill();
    }
    this.pending.length = 0;

    const c = this.ctx;
    c.fillStyle = "#060707";
    c.fillRect(0, 0, W, H);
    c.drawImage(this.base, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.drawImage(this.glow, 0, 0);
    c.globalCompositeOperation = "source-over";
  }
}
