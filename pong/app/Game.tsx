"use client";
/**
 * You vs the fly. The table and the brain panel are canvases drawn every frame; React only handles the overlays.
 * The fly's paddle moves only by its steering neurons (lib/fly.ts), which arrive from the brain worker every 20 ms.
 */
import { useEffect, useRef, useState } from "react";
import { FLY, STEER, Steering, eyes } from "../lib/fly.ts";
import { FIELD, PADDLE, BALL, WIN_AT, flyX, movePaddle, newGame, setPaddle, step, youX, type Pong } from "../lib/pong.ts";

type Phase = "loading" | "ready" | "playing" | "over" | "error";

const MINT = "#5dffc0";
const TRACE_S = 6; // seconds of history in the brain panel
const TRACE_N = Math.round(TRACE_S / 0.02);

interface BrainStats {
  n: number;
  nnz: number;
  fired: number;
  ms: number;
  seeL: number;
  seeR: number;
  /** flash level per steering neuron, STEER left then right */
  flash: number[];
  /** recent steering (L - R Hz) and where the ball is for the fly (left eye share - 0.5) */
  trace: { steer: number; ball: number }[];
}

export default function Game() {
  const table = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState("waking the fly");
  const [winner, setWinner] = useState<"you" | "fly" | "">("");
  const phaseRef = useRef<Phase>("loading");
  const game = useRef<Pong>(newGame());
  const steering = useRef(new Steering());
  const worker = useRef<Worker | null>(null);
  const stats = useRef<BrainStats>({ n: 0, nnz: 0, fired: 0, ms: 0, seeL: 0, seeR: 0, flash: new Array(STEER.length * 2).fill(0), trace: [] });
  const input = useRef({ up: false, down: false, mouseY: null as number | null });

  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const start = () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "over") return;
    game.current = newGame();
    setWinner("");
    go("playing");
  };

  // the brain
  useEffect(() => {
    const w = new Worker(new URL("./brain.worker.ts", import.meta.url));
    worker.current = w;
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") setProgress(m.text);
      else if (m.type === "error") { setProgress(m.text); go("error"); }
      else if (m.type === "ready") { stats.current.n = m.n; stats.current.nnz = m.nnz; go("ready"); }
      else if (m.type === "step") {
        steering.current.update(m.l, m.r, m.dt);
        const s = stats.current;
        s.fired = m.fired; s.ms = m.ms;
        s.seeL = s.seeL * 0.7 + m.seeL * 0.3;
        s.seeR = s.seeR * 0.7 + m.seeR * 0.3;
        m.steer.forEach((c: number, k: number) => { s.flash[k] = c > 0 ? 1 : s.flash[k] * 0.86; });
        const e2 = eyes(game.current);
        const seen = e2.L + e2.R;
        s.trace.push({ steer: steering.current.L - steering.current.R, ball: seen ? e2.L / seen - 0.5 : NaN });
        if (s.trace.length > TRACE_N) s.trace.shift();
      }
    };
    w.postMessage({ type: "load", base: `${location.origin}/connectome/` });
    return () => w.terminate();
  }, []);

  // keys and pointer
  useEffect(() => {
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (["ArrowUp", "w", "W"].includes(e.key)) { input.current.up = down; input.current.mouseY = null; e.preventDefault(); }
      if (["ArrowDown", "s", "S"].includes(e.key)) { input.current.down = down; input.current.mouseY = null; e.preventDefault(); }
      if (down && (e.key === " " || e.key === "Enter")) { start(); e.preventDefault(); }
    };
    const kd = key(true), ku = key(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const c = table.current!;
    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      input.current.mouseY = ((e.clientY - r.top) / r.height) * FIELD.h;
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerdown", move);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerdown", move);
    };
  }, []);

  // the frame loop
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __pong: typeof game }).__pong = game;
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = game.current;
      if (phaseRef.current === "playing") {
        const inp = input.current;
        if (inp.up || inp.down) movePaddle(g, "you", (inp.down ? 1 : -1) * PADDLE.maxSpeed * 0.8, dt);
        else if (inp.mouseY !== null) setPaddle(g, "you", inp.mouseY, dt);
        movePaddle(g, "fly", steering.current.vy, dt);
        const subs = Math.ceil(dt / (1 / 240));
        for (let k = 0; k < subs; k++) step(g, dt / subs);
        if (g.over) { setWinner(g.over); go("over"); }
      }
      const e2 = phaseRef.current === "playing" ? eyes(g) : { L: 0, R: 0 };
      worker.current?.postMessage({ type: "eyes", ...e2 });
      drawTable(table.current, g, now / 1000, steering.current.vy);
      drawPanel(panel.current, stats.current, e2);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main className="wrap">
      <header>
        <h1>Pong <span className="vs">vs</span> a fly brain</h1>
        <p className="sub">166,700 real neurons from a fruit fly connectome. No training. Its eyes see the ball, its steering neurons move the paddle.</p>
      </header>
      <div className="stage">
        <div className="tablebox">
          <canvas ref={table} className="table" />
          {phase !== "playing" && (
            <div className="overlay" onClick={start}>
              {phase === "loading" && <><div className="big">Loading the fly…</div><div className="small">{progress}</div></>}
              {phase === "error" && <><div className="big">The fly didn&apos;t wake up</div><div className="small">{progress}</div></>}
              {phase === "ready" && <><div className="big">Click to play</div><div className="small">mouse or W/S · first to {WIN_AT}</div></>}
              {phase === "over" && <>
                <div className="big">{winner === "fly" ? "The fly wins 🪰" : "You win"}</div>
                <div className="small">{game.current.score.you} – {game.current.score.fly} · fly returned {game.current.hits.fly} balls · click to play again</div>
              </>}
            </div>
          )}
        </div>
        <canvas ref={panel} className="panel" />
      </div>
      <footer>
        Eye: the ball drives LC10a (the neurons a fly uses to chase a target) in the eye it&apos;s on. Paddle: the
        descending neurons that turn a fly toward a target ({STEER.join(", ")}), left minus right, × {FLY.gain} px/s per Hz.
        Nothing tells it to go to the ball.
      </footer>
    </main>
  );
}

function fit(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawTable(c: HTMLCanvasElement | null, g: Pong, t: number, flyVy: number): void {
  if (!c) return;
  const ctx = fit(c, FIELD.w, FIELD.h);
  ctx.fillStyle = "#050807";
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([10, 14]);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(FIELD.w / 2, 0); ctx.lineTo(FIELD.w / 2, FIELD.h); ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "800 64px Outfit, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillText(String(g.score.you), FIELD.w * 0.32, 84);
  ctx.fillStyle = "rgba(93,255,192,0.2)";
  ctx.fillText(String(g.score.fly), FIELD.w * 0.68, 84);
  ctx.font = "600 13px Outfit, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText("YOU", FIELD.w * 0.32, 106);
  ctx.fillStyle = "rgba(93,255,192,0.4)";
  ctx.fillText("FLY BRAIN", FIELD.w * 0.68, 106);

  const paddle = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - PADDLE.w / 2, y - PADDLE.h / 2, PADDLE.w, PADDLE.h, 6);
    ctx.fill();
  };
  paddle(youX, g.you, "#ffffff");
  ctx.shadowColor = MINT; ctx.shadowBlur = 16;
  paddle(flyX, g.fly, MINT);
  ctx.shadowBlur = 0;
  drawFly(ctx, flyX + 20, g.fly, t, flyVy);

  if (g.wait <= 0 && !g.over) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, BALL.r, 0, Math.PI * 2); ctx.fill();
  }
}

/** a cartoon fly riding its paddle, looking left at you, leaning the way it steers */
function drawFly(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, vy: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.max(-0.5, Math.min(0.5, -vy / 900)));
  ctx.scale(1.3, 1.3);
  const flap = Math.sin(t * 60) * 0.35;
  ctx.fillStyle = "rgba(200,240,255,0.45)";
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(4, s * 3);
    ctx.rotate(s * (0.5 + flap));
    ctx.beginPath(); ctx.ellipse(10, 0, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#2b2f33";
  ctx.beginPath(); ctx.ellipse(6, 0, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3a4046";
  ctx.beginPath(); ctx.arc(-4, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e0373b";
  ctx.beginPath(); ctx.arc(-6, -3.5, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-6, 3.5, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPanel(c: HTMLCanvasElement | null, s: BrainStats, seeing: { L: number; R: number }): void {
  if (!c) return;
  const W = 300, H = 500;
  const ctx = fit(c, W, H);
  ctx.fillStyle = "#0b0f0e";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left";
  const label = (text: string, y: number) => {
    ctx.font = "600 11px Outfit, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(text, 16, y);
  };
  ctx.font = "800 18px Outfit, system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("Inside the fly", 16, 30);

  // eyes: input volts and LC10a spikes
  label("EYES · LC10a (target neurons)", 60);
  const bar = (x: number, y: number, w: number, v: number, color: string, text: string) => {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), 12);
    ctx.font = "600 11px Outfit, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(text, x, y + 26);
  };
  // the fly's right eye looks up the screen, its left eye down; show them in that order
  bar(16, 70, 126, seeing.R / FLY.volts, "#8fd3ff", `right eye  ${s.seeR.toFixed(0)} spikes`);
  bar(158, 70, 126, seeing.L / FLY.volts, "#8fd3ff", `left eye  ${s.seeL.toFixed(0)} spikes`);

  // steering neurons, one dot each, lit when they spike
  label("STEERING · descending neurons", 130);
  STEER.forEach((name, k) => {
    const y = 152 + k * 26;
    ctx.font = "600 12px Outfit, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "center";
    ctx.fillText(name, W / 2, y + 4);
    ctx.textAlign = "left";
    for (const [slot, x] of [[k + STEER.length, 60], [k, W - 60]] as const) { // right side drawn left (up), left side right (down)
      const f = s.flash[slot] ?? 0;
      ctx.fillStyle = `rgba(93,255,192,${0.12 + 0.88 * f})`;
      ctx.shadowColor = MINT; ctx.shadowBlur = 14 * f;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  });
  ctx.font = "600 10px Outfit, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("R  → paddle up", 40, 238);
  ctx.textAlign = "right";
  ctx.fillText("paddle down ←  L", W - 40, 238);
  ctx.textAlign = "left";

  // trace: where the ball is for the fly vs where its steering neurons push
  label(`LAST ${TRACE_S} S · ball side vs steering`, 272);
  const top = 284, h = 140, x0 = 16, w = W - 32;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x0, top, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath(); ctx.moveTo(x0, top + h / 2); ctx.lineTo(x0 + w, top + h / 2); ctx.stroke();
  const line = (get: (i: number) => number, color: string, width: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    let pen = false;
    s.trace.forEach((_, i) => {
      const v = get(i);
      if (!Number.isFinite(v)) { pen = false; return; }
      const px = x0 + (w * (i + TRACE_N - s.trace.length)) / TRACE_N;
      const py = top + h / 2 - Math.max(-1, Math.min(1, v)) * (h / 2 - 4);
      if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      pen = true;
    });
    ctx.stroke();
  };
  line((i) => s.trace[i].ball * 2, "rgba(143,211,255,0.7)", 1.5);
  line((i) => s.trace[i].steer / 25, MINT, 2);
  ctx.font = "600 10px Outfit, system-ui, sans-serif";
  ctx.fillStyle = "rgba(143,211,255,0.9)";
  ctx.fillText("ball (left eye share)", x0, top + h + 16);
  ctx.fillStyle = MINT;
  ctx.textAlign = "right";
  ctx.fillText("steering L − R", x0 + w, top + h + 16);
  ctx.textAlign = "left";

  ctx.font = "600 11px Outfit, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  const k = (x: number) => x.toLocaleString("en-US");
  ctx.fillText(`${k(s.n || 166700)} neurons · ${(s.nnz / 1e6 || 25.1).toFixed(1)} M synapses`, 16, 466);
  ctx.fillText(`${k(s.fired)} fired this step · ${s.ms.toFixed(1)} ms per 20 ms step`, 16, 484);
}
