/**
 * Fly Colosseum's ring: two Trader Flies' pictures squaring off, their HP bars, and a fight played round by round
 * from its events (game.ts): both lunge, the damage pops up, the bars drop, and the beaten fly goes down. The same
 * view shows a tournament fight, a sparring fight and a Verify replay. Plain DOM and the Web Animations API.
 */
import type { FightEvent, RoundEvent } from "./game.ts";
import { auraOf } from "./shop.ts";
import { esc } from "../util.ts";
import type { Stats } from "./stats.ts";

export interface Fighter {
  fly: number;
  name: string;
  /** the fly's picture, or null for the stand-in drawing */
  image: string | null;
  hp: number;
  aura: string | null;
  /** the fly's stats in this tournament, shown under its name */
  stats?: Stats;
}

export interface RingText {
  round: (n: number) => string;
  fury: string;
  /** the banner at the end: by knockout, on points, by the coin */
  end: (how: "ko" | "points" | "coin", winner: string) => string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** shown when a fly has no picture (or it doesn't load) */
const STAND_IN = "data:image/svg+xml," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#101413'/><text x='50' y='66' font-size='52' text-anchor='middle'>🪰</text></svg>");

export class Ring {
  private sides: { box: HTMLElement; img: HTMLImageElement; bar: HTMLElement; num: HTMLElement; pop: HTMLElement; tag: HTMLElement; max: number }[] = [];
  private roundEl!: HTMLElement;
  private banner!: HTMLElement;
  private floor!: HTMLElement;
  private names: [string, string] = ["", ""];
  /** counts up with every set(): a fight still playing for an earlier pair stops */
  private run = 0;
  private readonly root: HTMLElement;
  private readonly text: RingText;

  constructor(root: HTMLElement, text: RingText) {
    this.root = root;
    this.text = text;
  }

  /** Stops a fight still playing (the popup was closed). */
  stop(): void {
    this.run++;
  }

  /** Puts two flies in the ring at full HP. */
  set(a: Fighter, b: Fighter): void {
    this.run++;
    this.names = [a.name, b.name];
    const side = (f: Fighter, cls: string) => {
      const aura = auraOf(f.aura);
      const glow = aura ? ` style="--a1:${aura.colors[0]}; --a2:${aura.colors[1]}"` : "";
      return `<div class="fighter ${cls}${aura ? " has-aura" : ""}"${glow}>
        <div class="aura"></div><img alt="${esc(f.name)}" src="${esc(f.image ?? STAND_IN)}" draggable="false">
        <span class="pop mono"></span><span class="furytag">${esc(this.text.fury)}</span></div>`;
    };
    const hud = (f: Fighter, cls: string) => `<div class="side ${cls}"><b class="nm">${esc(f.name)}</b>${f.stats ? `<span class="str mono"><b>${f.stats.pow + f.stats.grd + f.stats.vit + f.stats.fury}</b> <i>PWR ${f.stats.pow}</i> <i>GRD ${f.stats.grd}</i> <i>VIT ${f.stats.vit}</i> <i>FRY ${f.stats.fury}</i></span>` : ""}<div class="hp"><i></i></div><span class="hpn mono"></span></div>`;
    this.root.innerHTML = `<div class="ring-hud">${hud(a, "l")}<span class="rnd mono"></span>${hud(b, "r")}</div>
      <div class="ring-floor">${side(a, "l")}<span class="vs">VS</span>${side(b, "r")}<div class="banner" hidden></div></div>`;
    this.floor = this.root.querySelector(".ring-floor")!;
    this.roundEl = this.root.querySelector(".rnd")!;
    this.banner = this.root.querySelector(".banner")!;
    this.sides = [a, b].map((f, i) => {
      const box = this.root.querySelectorAll<HTMLElement>(".fighter")[i], hudEl = this.root.querySelectorAll<HTMLElement>(".side")[i];
      const img = box.querySelector("img")!;
      img.onerror = () => { img.onerror = null; img.src = STAND_IN; };
      return { box, img, bar: hudEl.querySelector<HTMLElement>(".hp i")!, num: hudEl.querySelector<HTMLElement>(".hpn")!, pop: box.querySelector<HTMLElement>(".pop")!,
        tag: box.querySelector<HTMLElement>(".furytag")!, max: f.hp };
    });
    this.hp([a.hp, b.hp]);
  }

  private hp(hp: [number, number]): void {
    this.sides.forEach((s, i) => {
      const left = Math.max(0, hp[i]);
      s.bar.style.width = `${(100 * left / s.max).toFixed(1)}%`;
      s.bar.classList.toggle("low", left * 2 < s.max);
      s.num.textContent = `${left} / ${s.max}`;
    });
  }

  private async round(e: RoundEvent, speed: number): Promise<void> {
    const T = 1100 / speed;
    this.roundEl.textContent = this.text.round(e.round + 1);
    this.sides.forEach((s, i) => s.box.classList.toggle("fury", e.fury[i]));
    // both lunge to the middle and back; the hit lands at 45%
    const lunge = this.sides.map((s, i) => s.box.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${i === 0 ? "" : "-"}46%) scale(1.06)`, offset: 0.45 }, { transform: "translateX(0)" }],
      { duration: T, easing: "cubic-bezier(.5,0,.3,1)" }));
    await wait(T * 0.45);
    this.floor.animate([{ filter: "brightness(1.9)" }, { filter: "brightness(1)" }], { duration: T * 0.3 });
    this.sides.forEach((s, i) => {
      const took = e.dealt[1 - i];
      s.pop.textContent = took > 0 ? `-${took}` : "dodged";
      s.pop.classList.toggle("miss", took === 0);
      s.pop.animate([{ opacity: 0, transform: "translateY(10px) scale(.7)" }, { opacity: 1, transform: "translateY(-14px) scale(1.15)", offset: 0.25 },
        { opacity: 1, transform: "translateY(-30px)", offset: 0.7 }, { opacity: 0, transform: "translateY(-44px)" }], { duration: T * 0.9, fill: "forwards" });
      // the harder hit shakes more
      if (took > 0) s.img.animate([{ transform: "translateX(0)" }, { transform: `translateX(${i === 0 ? "-" : ""}${Math.min(14, 3 + took / 4)}px)` }, { transform: "translateX(0)" }], { duration: T * 0.25 });
    });
    this.hp(e.hp);
    await Promise.all(lunge.map((a) => a.finished.catch(() => {})));
    await wait(T * 0.25);
  }

  /**
   * Plays a fight from its events, as they come (a Verify replay or sparring feeds them while the brains work).
   * `speed` is read each round. Returns false if another pair took the ring meanwhile.
   */
  async play(events: AsyncIterable<FightEvent> | Iterable<FightEvent>, speed: () => number, onRound?: (e: RoundEvent) => void): Promise<boolean> {
    const run = this.run;
    for await (const e of events as AsyncIterable<FightEvent>) {
      if (run !== this.run) return false;
      if (e.type === "round") {
        onRound?.(e);
        await this.round(e, speed());
        continue;
      }
      const w = this.sides[e.winner], l = this.sides[1 - e.winner];
      l.box.classList.add("down");
      w.box.classList.add("won");
      this.sides.forEach((s) => s.box.classList.remove("fury"));
      this.banner.textContent = this.text.end(e.how, this.names[e.winner]);
      this.banner.hidden = false;
      this.banner.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.6)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], { duration: 350, easing: "cubic-bezier(.2,1.4,.4,1)" });
    }
    return run === this.run;
  }
}
