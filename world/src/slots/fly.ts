/**
 * Fly Slots' fly: a cartoon fly beside the reels, driven by the real connectome. It only REACTS to a spin that is
 * already decided; nothing here reaches the result.
 *
 * It reuses Fly Roulette's brain worker and readout unchanged (../roulette/brain.worker.ts, readout.ts): after each
 * spin the fly stares at a looming shape (LPLC2 + LC4) as big as the number of spiders on the line (none: a small
 * loom), and we count its wing-power motor neuron spikes. Past the readout's take-off line it jumps; on a win it does
 * a victory buzz, faster the more its wings fired. If the brain can't load, the fly still cheers wins, and the reels
 * and bets never wait for it.
 */
import { READOUT } from "../roulette/readout.ts";
import { anyPop, t } from "./i18n.ts";

type Counts = { wing: number; grip: number; gf: number };

/** the loom "chamber" (0..5, see readout.ts loomFor) for 0..3 spiders on the line */
const LOOM_FOR_SPIDERS = [0, 2, 4, 5];

export class Fly {
  private worker: Worker | null = null;
  private ready = false;
  private failed = false;
  private busy = false;
  private onStep: ((c: Counts & { t: number }) => void) | null = null;
  private onDecided: ((c: Counts & { choice: string }) => void) | null = null;
  private timer = 0;

  constructor(private box: HTMLElement, private statusEl: HTMLElement,
              private ui: { loomBar: HTMLElement; loomText: HTMLElement; wingBar: HTMLElement; wingNum: HTMLElement; verdict: HTMLElement }) {
    this.showLoom(0);
    try {
      this.worker = new Worker(new URL("../roulette/brain.worker.ts", import.meta.url), { type: "module" });
    } catch {
      this.fail();
      return;
    }
    const base = new URL(import.meta.env.DEV ? `${import.meta.env.BASE_URL}connectome/` : "/simulation/connectome/", location.href).href;
    this.worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") statusEl.textContent = t("slots.status.progress", { text: progressText(m.text) });
      else if (m.type === "error") this.fail();
      else if (m.type === "ready") {
        this.ready = true;
        statusEl.textContent = t("slots.status.ready", { n: Number(m.n).toLocaleString() });
      } else if (m.type === "step") this.onStep?.(m);
      else if (m.type === "decided") this.onDecided?.(m);
    };
    this.worker.onerror = () => this.fail();
    this.worker.postMessage({ type: "load", base });
    // one fly, its own brain for the whole visit (it keeps its state between spins)
    this.worker.postMessage({ type: "table", seeds: [crypto.getRandomValues(new Uint32Array(1))[0]] });
  }

  private fail(): void {
    this.failed = true;
    this.statusEl.textContent = t("slots.status.error");
    this.ui.verdict.textContent = t("slots.brain.napping");
  }

  /** The reels are turning: the fly buzzes along. */
  spinning(): void {
    this.set("buzz", true);
    this.set("happy", false);
    this.set("scared", false);
    this.ui.verdict.className = "";
    this.ui.verdict.textContent = t(this.failed ? "slots.brain.napping" : "slots.brain.idle");
  }

  /** The reels have stopped: the fly looks at the line and reacts. Never awaited by the game. */
  react(spiders: number, mult: number): void {
    this.set("buzz", false);
    const win = mult > 0, big = mult >= BIG;
    this.showLoom(spiders);
    if (!this.ready || this.busy || !this.worker) {
      // no brain (still loading, failed, or still busy with the last spin): cheer wins, nothing else
      if (win) this.celebrate(big, 0);
      return;
    }
    this.busy = true;
    this.ui.verdict.className = "";
    this.ui.verdict.textContent = t("slots.brain.thinking");
    this.setWing(0);
    if (spiders > 0) this.set("scared", true);
    const done = (c: Counts | null) => {
      clearTimeout(this.timer);
      this.onStep = this.onDecided = null;
      this.busy = false;
      this.set("scared", false);
      const wing = c?.wing ?? 0;
      if (c) this.setWing(wing);
      const jumped = !!c && wing >= READOUT.wingBail;
      this.ui.verdict.className = jumped ? "flinch" : "";
      this.ui.verdict.textContent = c ? t(jumped ? "slots.brain.flinch" : "slots.brain.calm") : t("slots.brain.idle");
      if (jumped) {
        this.pop(anyPop("flinch"), "flinch");
        this.play("flinch", 700);
        if (win) setTimeout(() => this.celebrate(big, wing), 650);
      } else if (win) this.celebrate(big, wing);
      else if (Math.random() < 0.35) this.pop(anyPop("meh"), "meh");
    };
    this.onStep = (c) => this.setWing(c.wing);
    this.onDecided = (c) => done(c);
    this.timer = window.setTimeout(() => done(null), 6000);   // a stuck worker never leaves the fly frozen
    this.worker.postMessage({ type: "turn", fly: 0, chamber: LOOM_FOR_SPIDERS[Math.min(3, spiders)] });
  }

  /** a victory buzz: wings a blur, a hop, a cheer; the more its wings fired, the longer it buzzes */
  private celebrate(big: boolean, wing: number): void {
    this.set("happy", true);
    this.set("buzz", true);
    this.pop(anyPop(big ? "big" : "win"), big ? "big" : "win");
    const ms = big ? 1600 : 1300;
    this.play(big ? "big" : "victory", ms);
    setTimeout(() => { this.set("buzz", false); this.set("happy", false); }, ms + Math.min(1500, wing * 20));
  }

  private play(cls: string, ms: number): void {
    for (const c of ["flinch", "victory", "big"]) this.box.classList.remove(c);
    void this.box.offsetWidth;             // restart the animation
    this.box.classList.add(cls);
    setTimeout(() => this.box.classList.remove(cls), ms);
  }

  private set(cls: string, on: boolean): void { this.box.classList.toggle(cls, on); }

  private pop(text: string, cls: string): void {
    const el = document.createElement("div");
    el.className = `flypop ${cls}`;
    el.textContent = text;
    el.style.setProperty("--tilt", `${(Math.random() - 0.5) * 16}deg`);
    this.box.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  private setWing(n: number): void {
    this.ui.wingBar.style.width = `${Math.min(100, (n / (READOUT.wingBail * 1.6)) * 100)}%`;
    this.ui.wingBar.classList.toggle("hot", n >= READOUT.wingBail);
    this.ui.wingNum.textContent = String(n);
  }

  private showLoom(spiders: number): void {
    this.ui.loomBar.style.width = `${[12, 45, 80, 100][Math.min(3, spiders)]}%`;
    this.ui.loomText.textContent = t("slots.brain.spiders", { count: spiders });
  }
}

/** a win this big (times the stake) counts as a big win: the big dance, and auto-spin stops */
export const BIG = 20;

/** The worker's progress ("fly brain 40 / 210 MB") in the page's language. */
function progressText(text: string): string {
  if (text === "wiring 25 M synapses") return t("slots.status.wiring");
  return text.replace(/^labels/, t("slots.status.labels")).replace(/^fly brain/, t("slots.status.brain"));
}
