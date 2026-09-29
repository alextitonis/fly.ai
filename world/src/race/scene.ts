/**
 * Fly Race's track: a 2D canvas, six lanes left to right, the fruit past the finish line and a faint smell drifting
 * back down the lanes from it. Cartoon flies in the site's black and mint.
 *
 * It only SHOWS a race: legTo() tweens the flies to the positions a leg event gives, spikes() makes a fly's head
 * spark as its movement neurons fire. One requestAnimationFrame loop draws everything (a few hundred shapes a
 * frame); it idles to a slow redraw while nothing moves and stops while the tab is hidden.
 */
import { LANES, TRACK } from "./game.ts";

export const COLORS = ["#5ef2cc", "#ffc83d", "#ff5b4f", "#5aa8ff", "#c46bff", "#ff8a1f"];

interface Fly {
  x: number;             // track units, 0..TRACK
  from: number; to: number;
  t0: number; d: number; // the current tween (ms)
  fire: number;          // 0..1: how hard its neurons fire right now (decays)
  hop: number;           // a little victory hop, 0..1
  place: number;         // finishing place (1..6), 0 while racing
  wob: number;           // phase for idle wiggles
}
interface Puff { x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; hue: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; age: number; c: string }

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

export class Track {
  speed = 1;
  names: string[] = [];
  mine = -1;
  leg = -1;
  legs = 5;
  label = "";
  sniffing = false;
  private flies: Fly[] = [];
  private puffs: Puff[] = [];
  private sparks: Spark[] = [];
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private last = performance.now();
  private idleAt = 0;
  private running = false;
  private finishFlash = 0;
  /** frames drawn (the headless checks read it) */
  frames = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.reset();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.resize();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.wake(); });
    this.wake();
  }

  /** Everyone back on the start line. */
  reset(): void {
    this.flies = Array.from({ length: LANES }, (_, i) => ({ x: 0, from: 0, to: 0, t0: 0, d: 0, fire: 0, hop: 0, place: 0, wob: i * 1.7 }));
    this.leg = -1;
    this.finishFlash = 0;
    this.wake();
  }

  /** The flies run to these positions (track units) over one leg. Resolves when they're there. */
  legTo(positions: number[], legMs = 1250): Promise<void> {
    const now = performance.now(), d = legMs / this.speed;
    positions.forEach((p, i) => {
      const f = this.flies[i];
      f.from = f.x;
      f.to = Math.min(TRACK, p);
      f.t0 = now + i * 30 / this.speed;          // a tiny stagger so they don't move as one block
      f.d = d;
    });
    this.wake();
    return this.wait(d + LANES * 30 / this.speed);
  }

  /** A fly's neurons fire: its head sparks, harder the bigger `k` (0..1). */
  spikes(lane: number, k: number): void {
    const f = this.flies[lane];
    f.fire = Math.max(f.fire, Math.min(1, k));
    const n = Math.round(1 + k * 4);
    const { x, y } = this.flyXY(lane);
    for (let i = 0; i < n && this.sparks.length < 160; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60;
      this.sparks.push({ x: x + 6, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, age: 0, c: COLORS[lane] });
    }
    this.wake();
  }

  /** The finish: places over the flies, the winner hops. */
  finish(order: number[]): void {
    order.forEach((lane, k) => { this.flies[lane].place = k + 1; });
    this.flies[order[0]].hop = 1;
    this.finishFlash = 1;
    const { x, y } = this.flyXY(order[0]);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.8 + Math.random() * 0.6, age: 0,
        c: ["#ffc83d", "#5ef2cc", "#fff"][i % 3] });
    }
    this.wake();
  }

  wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

  /** which lane a click at these client coordinates lands in (-1: none) */
  laneAt(clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    const y = clientY - r.top;
    const L = this.layout();
    const i = Math.floor((y - L.top) / L.lane);
    return i >= 0 && i < LANES ? i : -1;
  }

  // ---- drawing ---------------------------------------------------------------------------------------------
  private resize(): void {
    const cw = this.canvas.clientWidth || 600;
    // lanes need room on a phone: a taller track there
    const ar = cw < 520 ? 16 / 11 : 16 / 7.4;
    this.canvas.style.setProperty("--ar", String(ar));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = cw;
    this.h = Math.round(cw / ar);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.draw(performance.now(), 0);
  }

  private layout() {
    const top = Math.max(22, this.h * 0.09), bottom = 8;
    const lane = (this.h - top - bottom) / LANES;
    const fruitW = Math.max(46, Math.min(110, this.w * 0.12));
    const start = Math.max(20, this.w * 0.035) + lane * 0.5;
    const finish = this.w - fruitW - 10;
    return { top, lane, start, finish, fruitW };
  }

  private flyXY(i: number): { x: number; y: number } {
    const L = this.layout(), f = this.flies[i];
    // at TRACK the fly's head touches the finish line
    const s = Math.max(0.55, Math.min(1.25, L.lane / 34));
    return { x: L.start + (f.x / TRACK) * (L.finish - 16 * s - L.start), y: L.top + L.lane * (i + 0.5) };
  }

  /** start the loop if it's asleep; it runs at full rate while anything moves */
  wake(): void {
    this.idleAt = performance.now() + 1500;
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (document.hidden) { this.running = false; return; }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    // idle: the smell still drifts, drawn at ~30 fps to spare the battery
    const idle = now > this.idleAt;
    if (!idle || now - this.last > 30) {
      this.last = now;
      this.step(now, dt);
      this.draw(now, dt);
    }
    requestAnimationFrame(this.frame);
  };

  private step(now: number, dt: number): void {
    let moving = false;
    for (const f of this.flies) {
      if (f.d > 0) {
        const u = Math.max(0, Math.min(1, (now - f.t0) / f.d));
        f.x = f.from + (f.to - f.from) * ease(u);
        if (u >= 1) { f.x = f.to; f.d = 0; } else moving = true;
      }
      f.fire = Math.max(0, f.fire - dt * 1.6);
      f.hop = Math.max(0, f.hop - dt * 0.25);
      f.wob += dt * (this.sniffing ? 9 : 2.2);
      if (f.fire > 0 || f.hop > 0) moving = true;
    }
    this.finishFlash = Math.max(0, this.finishFlash - dt * 0.8);
    if (moving || this.sparks.length || this.sniffing) this.idleAt = now + 600;

    // the smell: puffs leave the fruit and drift back down the lanes, wobbling and fading
    const L = this.layout();
    const want = Math.round(18 + this.w / 30);
    while (this.puffs.length < want) {
      const fy = L.top + Math.random() * L.lane * LANES;
      this.puffs.push({ x: L.finish + L.fruitW * 0.3, y: fy, vx: -(18 + Math.random() * 26) * (this.w / 800 + 0.4), vy: (Math.random() - 0.5) * 6,
        r: 3 + Math.random() * 7, life: 3 + Math.random() * 4, age: Math.random() * 0.5, hue: Math.random() });
    }
    for (const p of this.puffs) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt + Math.sin((p.age + p.hue * 9) * 1.7) * 6 * dt;
      p.r += dt * 2.2;
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life && p.x > -30);
    for (const s of this.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 140 * dt; s.vx *= 1 - dt * 2; }
    this.sparks = this.sparks.filter((s) => s.age < s.life);
  }

  private draw(now: number, _dt: number): void {
    this.frames++;
    const c = this.ctx, W = this.w, H = this.h, L = this.layout();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // ground
    const bg = c.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, "#050706"); bg.addColorStop(1, "#0b1210");
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // lanes
    for (let i = 0; i < LANES; i++) {
      const y = L.top + i * L.lane;
      c.fillStyle = i % 2 ? "#0a0e0d" : "#0d1211";
      c.fillRect(0, y, W, L.lane);
      c.fillStyle = COLORS[i];
      c.globalAlpha = i === this.mine ? 0.13 : 0.035;
      c.fillRect(0, y, W, L.lane);
      c.globalAlpha = 1;
      if (i === this.mine) { c.fillStyle = COLORS[i]; c.fillRect(0, y + 2, 3, L.lane - 4); }
    }
    c.strokeStyle = "rgba(255,255,255,.07)";
    c.setLineDash([8, 10]);
    c.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      const y = Math.round(L.top + i * L.lane) + 0.5;
      c.beginPath(); c.moveTo(0, y); c.lineTo(L.finish, y); c.stroke();
    }
    c.setLineDash([]);
    // distance marks
    c.fillStyle = "rgba(255,255,255,.05)";
    for (let k = 1; k < 4; k++) c.fillRect(L.start + (L.finish - L.start) * k / 4, L.top, 1, L.lane * LANES);
    // start line
    c.fillStyle = "rgba(94,242,204,.35)";
    c.fillRect(L.start - 1, L.top, 2, L.lane * LANES);
    // finish line: checkers
    const sq = Math.max(4, Math.min(8, L.lane / 5));
    for (let y = L.top, r = 0; y < L.top + L.lane * LANES; y += sq, r++) {
      for (let k = 0; k < 2; k++) {
        c.fillStyle = (r + k) % 2 ? "#f4f7f6" : "#111";
        c.fillRect(L.finish - sq + k * sq, y, sq, Math.min(sq, L.top + L.lane * LANES - y));
      }
    }
    if (this.finishFlash > 0) {
      c.fillStyle = `rgba(255,200,61,${this.finishFlash * 0.25})`;
      c.fillRect(L.finish - 30, L.top, 60, L.lane * LANES);
    }
    // the smell
    for (const p of this.puffs) {
      // a faint wisp, stretched along the wind
      const a = Math.sin(Math.min(1, p.age / p.life) * Math.PI) * 0.055;
      c.fillStyle = p.hue < 0.6 ? `rgba(94,242,204,${a})` : `rgba(255,200,61,${a * 0.8})`;
      c.beginPath(); c.ellipse(p.x, p.y, p.r * 2.4, p.r * 0.8, 0, 0, Math.PI * 2); c.fill();
    }
    // the fruit
    this.fruit(L.finish + L.fruitW * 0.55 + 4, L.top + L.lane * LANES / 2, L.fruitW * 0.5, now);
    // header: the leg
    c.font = `600 ${Math.max(10, Math.min(13, W / 50))}px "JetBrains Mono", monospace`;
    c.textBaseline = "middle";
    c.fillStyle = "#5f6865";
    c.textAlign = "left";
    c.fillText(this.label, 10, L.top / 2);
    c.textAlign = "right";
    for (let k = 0; k < this.legs; k++) {
      c.fillStyle = k <= this.leg ? "#5ef2cc" : "#1a1d1c";
      c.beginPath(); c.arc(W - 12 - (this.legs - 1 - k) * 12, L.top / 2, 3.5, 0, Math.PI * 2); c.fill();
    }
    // flies
    for (let i = 0; i < LANES; i++) this.fly(i, now, L.lane);
    // sparks
    for (const s of this.sparks) {
      c.globalAlpha = 1 - s.age / s.life;
      c.fillStyle = s.c;
      c.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;
  }

  private fruit(x: number, y: number, r: number, now: number): void {
    const c = this.ctx;
    const pulse = 1 + Math.sin(now / 600) * 0.025;
    c.save();
    c.translate(x, y);
    c.scale(pulse, pulse);
    // glow
    const g = c.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.9);
    g.addColorStop(0, "rgba(255,200,61,.22)"); g.addColorStop(1, "rgba(255,200,61,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r * 1.9, 0, Math.PI * 2); c.fill();
    // a big cartoon peach
    c.lineWidth = Math.max(2.5, r * 0.09);
    c.strokeStyle = "#111";
    c.fillStyle = "#ff9a5a";
    c.beginPath();
    c.moveTo(0, -r * 0.72);
    c.bezierCurveTo(r * 0.95, -r * 1.05, r * 1.15, r * 0.35, r * 0.2, r * 0.92);
    c.bezierCurveTo(0, r * 1.02, 0, r * 1.02, -r * 0.2, r * 0.92);
    c.bezierCurveTo(-r * 1.15, r * 0.35, -r * 0.95, -r * 1.05, 0, -r * 0.72);
    c.fill(); c.stroke();
    c.fillStyle = "#ffc83d";
    c.globalAlpha = 0.55;
    c.beginPath(); c.ellipse(-r * 0.38, -r * 0.18, r * 0.2, r * 0.36, 0.35, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(17,17,17,.55)";
    c.lineWidth = Math.max(1.5, r * 0.05);
    c.beginPath(); c.moveTo(r * 0.05, -r * 0.62); c.quadraticCurveTo(r * 0.3, r * 0.1, r * 0.08, r * 0.85); c.stroke();
    // stem and leaf
    c.strokeStyle = "#111";
    c.lineWidth = Math.max(2.5, r * 0.09);
    c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(r * 0.05, -r * 1.05); c.stroke();
    c.fillStyle = "#3ddc84";
    c.beginPath(); c.ellipse(r * 0.34, -r * 1.02, r * 0.3, r * 0.13, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }

  private fly(i: number, now: number, lane: number): void {
    const c = this.ctx, f = this.flies[i];
    const { x, y } = this.flyXY(i);
    const s = Math.max(0.55, Math.min(1.25, lane / 34));
    const moving = f.d > 0 && now >= f.t0;
    const hop = f.hop > 0 ? Math.abs(Math.sin(f.hop * 18)) * 6 * f.hop : 0;
    c.save();
    c.translate(x, y - hop);
    c.scale(s, s);
    // bob and a wiggle while sniffing
    c.rotate(Math.sin(f.wob) * (this.sniffing ? 0.1 : 0.04));
    // wings: a blur while it runs
    const flap = moving ? Math.sin(now / 16 + i) * 0.5 + 0.5 : 0.15 + Math.sin(f.wob * 0.7) * 0.05;
    c.lineWidth = 2;
    c.strokeStyle = "#111";
    c.fillStyle = moving ? "rgba(191,248,234,.35)" : "rgba(191,248,234,.6)";
    for (const side of [-1, 1]) {
      c.save();
      c.rotate(side * (0.5 + flap * 0.5));
      c.beginPath(); c.ellipse(-8, side * 6, 11, 5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    }
    // legs
    c.strokeStyle = "#111";
    c.lineWidth = 2;
    const step = moving ? Math.sin(now / 40 + i) * 3 : 0;
    for (const k of [-1, 0, 1]) {
      c.beginPath(); c.moveTo(k * 5, 0); c.lineTo(k * 5 + step * (k === 0 ? -1 : 1), -9); c.stroke();
      c.beginPath(); c.moveTo(k * 5, 0); c.lineTo(k * 5 - step * (k === 0 ? -1 : 1), 9); c.stroke();
    }
    // body
    c.fillStyle = "#2f3a37";
    c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(-4, 0, 11, 7.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = COLORS[i];
    c.globalAlpha = 0.85;
    c.lineWidth = 2;
    for (const k of [-8, -3]) { c.beginPath(); c.moveTo(k, -6); c.lineTo(k, 6); c.stroke(); }
    c.globalAlpha = 1;
    // head
    c.strokeStyle = "#111";
    c.lineWidth = 2.5;
    c.fillStyle = "#2f3a37";
    c.beginPath(); c.arc(9, 0, 6.5, 0, Math.PI * 2); c.fill(); c.stroke();
    // eyes (red, cartoon) with a glint
    c.fillStyle = "#e0342c";
    c.lineWidth = 1.8;
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(11, side * 4.2, 3.6, 3.2, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.fillStyle = "#fff";
    for (const side of [-1, 1]) { c.beginPath(); c.arc(12, side * 4.2 - 1, 1.1, 0, Math.PI * 2); c.fill(); }
    // antennae twitch as it smells
    c.strokeStyle = "#111";
    c.lineWidth = 1.6;
    const tw = Math.sin(f.wob * 2.3) * (this.sniffing ? 3 : 1);
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(14, side * 1.5); c.quadraticCurveTo(19, side * 3 + tw, 21, side * (4 + tw * 0.3)); c.stroke(); }
    // neurons firing: a glow over the head
    if (f.fire > 0.02) {
      c.globalAlpha = f.fire * 0.8;
      const g = c.createRadialGradient(9, 0, 1, 9, 0, 16);
      g.addColorStop(0, COLORS[i]); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(9, 0, 16, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    c.restore();

    // name tag and place
    const fs = Math.max(9, Math.min(12, lane * 0.3));
    c.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    c.textBaseline = "middle";
    c.textAlign = "left";
    const nm = this.names[i] ?? "";
    const tagY = y - lane * 0.5 + fs * 0.75;
    const tx = Math.max(4, x - 14 * s);
    if (nm) {
      c.fillStyle = i === this.mine ? COLORS[i] : "rgba(244,247,246,.55)";
      c.fillText(nm, tx, tagY);
    }
    if (f.place) {
      const r = Math.max(8, lane * 0.28);
      const bx = Math.max(r + 2, x - 20 * s - r - 2);
      c.fillStyle = f.place === 1 ? "#ffc83d" : f.place <= 3 ? "#f4f7f6" : "#2a3431";
      c.strokeStyle = "#111";
      c.lineWidth = 2;
      c.beginPath(); c.arc(bx, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = f.place <= 3 ? "#000" : "#9ba5a1";
      c.font = `800 ${Math.round(r * 0.9)}px Outfit, Inter, sans-serif`;
      c.textAlign = "center";
      c.fillText(String(f.place), bx, y + 0.5);
    }
  }
}
