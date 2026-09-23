import { useEffect, useRef } from "react";
import { t, t as translate, tOr } from "./i18n";
import type { Fly, Poke, Replay } from "./feed";
import { POKES } from "./words";

const FRAME_MS = 180;          // one replay frame is 3 steps (60 ms); shown 3x slower
const HOLD_MS = 2500;          // pause on the last frame before looping
const POKE_REACH = 0.35;       // matches the worker
const CHANNEL_COLOR: Record<string, string> = { loom: "#ff5b4f", target: "#6cc4d8", sound: "#c77dff", bump: "#f2b544" };

/** A stable starting spot for a fly the worker hasn't placed yet (it saves real positions after its first tick). */
function spot(id: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 1000) / 1000;
  const b = ((Math.imul(h, 2654435761) >>> 0) % 1000) / 1000;
  return [0.2 + 0.6 * a, 0.2 + 0.6 * b, a * 6.28, 0];
}

function layout(c: HTMLCanvasElement) {
  const w = c.clientWidth;
  const h = c.clientHeight;
  const size = Math.min(w, h) - 20;
  return { w, h, size, ox: (w - size) / 2, oy: (h - size) / 2 };
}

/**
 * The patch as a map. It replays the last tick the patch ran: flies move by their own steering,
 * walking and escape neurons, a ring flashes when the giant fibre fires, lines show one fly's brain
 * output reaching another fly's senses. With a poke armed, a click drops it at that spot.
 */
export default function PatchView({ flies, replay, tickId, waiting, armed, onPoke }: {
  flies: Fly[]; replay?: Replay; tickId?: number; waiting: Poke[]; armed: string | null; onPoke: (x: number, y: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ flies, replay, waiting });
  live.current = { flies, replay, waiting };

  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const { flies, replay, waiting } = live.current;
      const dpr = window.devicePixelRatio || 1;
      const { w, h, size, ox, oy } = layout(c);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const px = (x: number) => ox + x * size;
      const py = (y: number) => oy + y * size;

      g.fillStyle = "#060707";
      g.strokeStyle = "#1a1d1c";
      g.beginPath();
      g.roundRect(ox, oy, size, size, 14);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.03)";
      for (let k = 1; k < 8; k++) {
        g.beginPath();
        g.moveTo(px(k / 8), oy + 6);
        g.lineTo(px(k / 8), oy + size - 6);
        g.moveTo(ox + 6, py(k / 8));
        g.lineTo(ox + size - 6, py(k / 8));
        g.stroke();
      }

      const frames = replay?.frames ?? [];
      const period = frames.length * FRAME_MS + HOLD_MS;
      const t = frames.length ? (now - start) % period : 0;
      const fi = frames.length ? Math.min(frames.length - 1, Math.floor(t / FRAME_MS)) : -1;
      const playing = frames.length > 0 && t < frames.length * FRAME_MS;

      const pos = new Map<string, number[]>();
      if (replay && fi >= 0) replay.flies.forEach((id, k) => frames[fi][k] && pos.set(id, frames[fi][k]));
      for (const f of flies) if (!pos.has(f.id)) pos.set(f.id, f.x != null && f.y != null ? [f.x, f.y, f.heading ?? 0, 0] : spot(f.id));

      const ev = replay?.event;
      if (ev && playing && fi <= 10 && ev.stimulus !== "nothing" && ev.x != null && ev.y != null) {
        const radius = ev.poke_id ? POKE_REACH * size : 22;
        g.setLineDash([5, 5]);
        g.strokeStyle = `rgba(242,181,68,${0.8 - fi * 0.06})`;
        g.beginPath();
        g.arc(px(ev.x), py(ev.y), radius, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "#f2b544";
        g.font = "500 12px JetBrains Mono, monospace";
        const label = (ev.poke_id ? translate("flybook.patch.poke") : "") + tOr(`flybook.pokes.${ev.stimulus}.done`, POKES.find((p) => p.stimulus === ev.stimulus)?.done ?? ev.stimulus);
        g.fillText(label, Math.min(px(ev.x) + 10, ox + size - g.measureText(label).width - 8), Math.max(py(ev.y) - radius - 6, oy + 16));
      }

      for (const pk of waiting) {
        if (pk.x == null || pk.y == null) continue;
        const pulse = 8 + 5 * Math.sin(now / 200);
        g.strokeStyle = "#f2b544";
        g.beginPath();
        g.arc(px(pk.x), py(pk.y), pulse, 0, Math.PI * 2);
        g.stroke();
      }

      if (replay && playing) {
        for (const l of replay.links) {
          const lf = Math.floor(l.step / 3);
          if (fi < lf || fi > lf + 6) continue;
          const a = pos.get(l.from);
          const b = pos.get(l.to);
          if (!a || !b) continue;
          g.globalAlpha = 1 - (fi - lf) / 7;
          g.strokeStyle = CHANNEL_COLOR[l.channel] ?? "#fff";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(px(a[0]), py(a[1]));
          g.lineTo(px(b[0]), py(b[1]));
          g.stroke();
          g.globalAlpha = 1;
          g.lineWidth = 1;
        }
      }

      for (const f of flies) {
        const [x, y, heading, flags] = pos.get(f.id)!;
        const cx = px(x);
        const cy = py(y);
        if (playing && flags & 1) {
          g.strokeStyle = "rgba(255,91,79,0.9)";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(cx, cy, 17, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 1;
        }
        if (playing && flags & 2) {
          g.strokeStyle = "rgba(199,125,255,0.7)";
          for (const r of [11, 14]) {
            g.beginPath();
            g.arc(cx, cy, r, heading + 1.9, heading + 4.4);
            g.stroke();
          }
        }
        if (playing && flags & 4) {
          g.fillStyle = "#f2b544";
          for (let k = 0; k < 4; k++) {
            const a = now / 300 + (k * Math.PI) / 2;
            g.fillRect(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 2, 2);
          }
        }
        g.fillStyle = f.color;
        g.beginPath();
        g.arc(cx, cy, 7, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(heading) * 12, cy + Math.sin(heading) * 12);
        g.stroke();
        g.fillStyle = "#9ba5a1";
        g.font = "12px Inter, system-ui, sans-serif";
        const name = f.name.length > 14 ? `${f.name.slice(0, 13)}…` : f.name;
        g.fillText(name, cx - g.measureText(name).width / 2, cy + 22);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!armed) return;
    const c = canvas.current!;
    const { size, ox, oy } = layout(c);
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left - ox) / size;
    const y = (e.clientY - rect.top - oy) / size;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onPoke(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  };

  return (
    <div className="patchview">
      <canvas ref={canvas} className={armed ? "armed" : ""} onClick={click} aria-label={t("flybook.patch.mapLabel")} />
      <p className="fine">
        {replay ? t("flybook.patch.replay", { tick: tickId ?? "" }) : t("flybook.patch.noReplay")} {t("flybook.patch.how")}
        <span style={{ color: CHANNEL_COLOR.loom }}>{t("flybook.patch.sawJump")}</span>,
        <span style={{ color: CHANNEL_COLOR.target }}>{t("flybook.patch.sawMove")}</span>,
        <span style={{ color: CHANNEL_COLOR.bump }}>{t("flybook.patch.bumped")}</span>.
      </p>
    </div>
  );
}
