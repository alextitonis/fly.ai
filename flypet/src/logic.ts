// The pet's own game logic — the swat game's scoring and timing, focus time, where it perches and when it falls
// off, and the expeditions card's span/nameOf/countdown — as small pure functions (no DOM, no timers, no storage).
// pet.ts and expeditions.ts call them; logic.test.ts runs them under plain node, like mood.test.ts does for mood.ts.

import { currentLang, LANGS, t } from "./i18n.ts";
import type { Names6 } from "./store.ts";

export const W = 300, H = 300, SPRITE = 160;          // the pet's window, and the sprite inside it

// ---- the swat game: 20 seconds, the fly darts around, every click on it counts -----------------------------------
export const SWAT_MS = 20_000;

/** where it darts next: anywhere across the screen and never below its ground, at most 600 px up; rx/ry in [0, 1] pick the spot */
export function hopSpot(floor: { left: number; right: number; top: number; bottom: number }, rx: number, ry: number): { x: number; y: number } {
  const groundY = floor.bottom - H, spanY = Math.max(0, groundY - floor.top - 40);
  const x = Math.min(floor.right - W / 2 - SPRITE / 2, Math.max(floor.left - W / 2 + SPRITE / 2,
    floor.left + rx * (floor.right - floor.left - W)));
  return { x, y: groundY - ry * Math.min(spanY, 600) };
}

/** the next hop's wait: faster as the seconds run out; null once they have — the game ends mid-hop */
export function nextHop(until: number, now: number): number | null {
  if (now >= until) return null;
  return 450 + 600 * ((until - now) / SWAT_MS);
}

/** the game over line: the best kept, the mood it plays, and whether it brags (the first best is told plainly) */
export function swatEnd(score: number, best: number): { best: number; mood: "moon" | "happy"; newBest: boolean } {
  return { best: Math.max(best, score), mood: score > best ? "moon" : "happy", newBest: score > best && best > 0 };
}

// ---- focus time: 25 minutes where it sits still beside you --------------------------------------------------------
export const FOCUS_MS = 25 * 60_000;

/** seconds left on the focus clock, never below 0 */
export const focusLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));
/** the clock the pill shows: 25:00, 0:07 */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** the UTC day a finished session counts against: one across midnight lands on the day it ended */
export const focusDay = (now: number) => `focus:${new Date(now).toISOString().slice(0, 10)}`;

// ---- sitting on your windows ---------------------------------------------------------------------------------------
export interface Win { id: string; x: number; y: number; width: number; height: number }

/** where it sits on a window's top edge, or null when there's no room above it (maximized-like) or it's too small */
export function perchSpot(w: Win, floor: { left: number; right: number; top: number }, r: number): { x: number; y: number } | null {
  if (w.y - H + 8 < floor.top || w.width < SPRITE + 40) return null;
  const x = Math.min(floor.right - W / 2 - SPRITE / 2, Math.max(floor.left - W / 2 + SPRITE / 2,
    w.x + 20 + r * Math.max(0, w.width - SPRITE - 40) - (W - SPRITE) / 2));
  return { x, y: w.y - H + 6 };                       // its feet on the window's top edge
}

/** it holds on while its window drifts a pixel or two (or three), then falls off; another window in front, and it goes too */
export function windowMoved(perched: Win, w: Win | null): boolean {
  return !w || w.id !== perched.id || Math.abs(w.x - perched.x) > 3 || Math.abs(w.y - perched.y) > 3;
}

/** how long it sits up there before hopping down: 45-120 s */
export const perchHold = (now: number, r: number) => now + 45_000 + r * 75_000;

// ---- landing, after a toss or a fall-off ---------------------------------------------------------------------------
/** a bounce keeps 35% of the fall and 60% of the sideways; slow enough, and it stops (null) */
export function landing(vx: number, vy: number): { vx: number; vy: number } | null {
  return vy > 6 ? { vx: vx * 0.6, vy: -vy * 0.35 } : null;
}

// ---- the expeditions card's helpers (expeditions.ts) ----------------------------------------------------------------
/** a name in the app's language (the data keeps them in LANGS order) */
export const nameOf = (names: Names6) => names[Object.keys(LANGS).indexOf(currentLang())] ?? names[0];
/** 15m, 1h, 1h 20m */
export function span(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000)), h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${t("x.hour", { n: h })} ${t("x.min", { n: r })}` : t("x.hour", { n: h })) : t("x.min", { n: m });
}
/** the trip countdown: how long is left, whether it's back, and how far along the bar is */
export function tripState(tr: { started_at: number; ends_at: number }, now: number): { left: number; done: boolean; pct: number } {
  const left = tr.ends_at - now;
  return { left, done: left <= 0, pct: Math.min(100, Math.round(((now - tr.started_at) / Math.max(1, tr.ends_at - tr.started_at)) * 100)) };
}
