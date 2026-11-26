// The pet's own game logic as small pure functions (issue #57): no DOM, no timers, no storage. pet.ts and expeditions.ts
// call these; logic.test.ts checks them (npm test). Random numbers come in as arguments, so a test can pick them.
import { currentLang, LANGS, t, type Key } from "./i18n.ts";
import type { Names6 } from "./store.ts";

/** the pet's window and the sprite inside it, in px */
export const W = 300, H = 300, SPRITE = 160;
export type Floor = { left: number; right: number; top: number; bottom: number };

/** x kept so the sprite stays on the screen */
export const clampX = (v: number, f: Floor) => Math.min(f.right - W / 2 - SPRITE / 2, Math.max(f.left - W / 2 + SPRITE / 2, v));
/** y of the window when the fly stands on the bottom of the work area */
export const groundY = (f: Floor) => f.bottom - H;

// ---- falling: what happens when it reaches the ground ----------------------------------------------------------
export const BOUNCE = 0.35;
/** a fast fall bounces (35% back up, 60% of its sideways speed); a slow one comes to rest */
export function landing(vx: number, vy: number): { vx: number; vy: number; rest: boolean } {
  return vy > 6 ? { vx: vx * 0.6, vy: -vy * BOUNCE, rest: false } : { vx: 0, vy: 0, rest: true };
}

// ---- the swat game ---------------------------------------------------------------------------------------------
export const SWAT_MS = 20_000;
/** where it darts: anywhere along the screen, up to 600 px above the ground (rx, ry in [0, 1)) */
export function hopSpot(f: Floor, rx: number, ry: number): { x: number; y: number } {
  const spanY = Math.max(0, groundY(f) - f.top - 40);
  return { x: clampX(f.left + rx * (f.right - f.left - W), f), y: groundY(f) - ry * Math.min(spanY, 600) };
}
/** the game is over once its 20 seconds are up */
export const swatOver = (now: number, until: number) => now >= until;
/** the wait before the next hop: 1050 ms at the start, 450 ms at the end */
export const hopDelay = (now: number, until: number) => 450 + 600 * ((until - now) / SWAT_MS);
/** game over: the best score kept, how it reacts and what it says */
export function swatEnd(score: number, best: number): { best: number; record: boolean; mood: "moon" | "happy"; line: Key; vars: Record<string, number> } {
  const record = score > best;
  return {
    best: Math.max(best, score),
    record,
    mood: record ? "moon" : "happy",
    line: record && best > 0 ? "g.newBest" : "g.score",
    vars: record && best > 0 ? { n: score } : { n: score, best: Math.max(best, score) },
  };
}

// ---- focus time ------------------------------------------------------------------------------------------------
export const FOCUS_MS = 25 * 60_000;
/** the time left on the pill, m:ss, never below 0:00 */
export function focusClock(until: number, now: number): string {
  const s = Math.max(0, Math.ceil((until - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** the storage key a finished session counts against: the UTC day it finished on */
export const focusDay = (now: number) => `focus:${new Date(now).toISOString().slice(0, 10)}`;

// ---- sitting on your windows -----------------------------------------------------------------------------------
export type Win = { id: string; x: number; y: number; width: number; height: number };
/** where it sits on a window's top edge (r in [0, 1)), or null with no room above it or a window too small */
export function perchSpot(w: Win, f: Floor, r: number): { x: number; y: number } | null {
  if (w.y - H + 8 < f.top || w.width < SPRITE + 40) return null;
  return { x: clampX(w.x + 20 + r * Math.max(0, w.width - SPRITE - 40) - (W - SPRITE) / 2, f), y: w.y - H + 6 };
}
/** when it hops down by itself: 45 to 120 s after it landed (r in [0, 1)) */
export const perchUntil = (now: number, r: number) => now + 45_000 + r * 75_000;
/** whether a new front window means it falls off: its window went away, or moved more than 3 px, or another came in
 * front after its own was reported (a 1-2 px jitter keeps it sitting) */
export function fallsOff(perched: Win, was: Win | null, w: Win | null): boolean {
  const moved = !w || w.id !== perched.id || Math.abs(w.x - perched.x) > 3 || Math.abs(w.y - perched.y) > 3;
  return moved && (was?.id === perched.id || !w);
}

// ---- the expeditions card --------------------------------------------------------------------------------------
/** a name in a language (the data keeps them in LANGS order); the English one when that language has none */
export const nameIn = (names: Names6, lang: string) => names[Object.keys(LANGS).indexOf(lang)] ?? names[0];
/** a name in the app's language */
export const nameOf = (names: Names6) => nameIn(names, currentLang());
/** 15m, 1h, 1h 20m (rounded up to the minute, at least 1m) */
export function span(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000)), h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${t("x.hour", { n: h })} ${t("x.min", { n: r })}` : t("x.hour", { n: h })) : t("x.min", { n: m });
}
/** a trip's countdown: time left, whether it's back, and the bar's percent (0 to 100) */
export function tripState(trip: { started_at: number; ends_at: number }, now: number): { left: number; done: boolean; pct: number } {
  const left = trip.ends_at - now;
  return { left, done: left <= 0, pct: Math.min(100, Math.round(((now - trip.started_at) / Math.max(1, trip.ends_at - trip.started_at)) * 100)) };
}

// ---- the watch list (panel.ts / talk.ts answer()) ------------------------------------------------------------------
/** how many tokens a fly may watch, by the fly's value: the desk's tiers (mine flychat's watch_token: 5, 10 once
 * the wallet is over $100, 15 over $500). The pet already receives the value (FlyFeed.fly.value), so both the
 * approve path and the local watch card derive the cap from it instead of a flat 5. */
export function watchMax(value: number | null | undefined): number {
  if (value != null && value > 500) return 15;
  if (value != null && value > 100) return 10;
  return 5;
}
/** the watch list with a token added, or null when the token is new and the list is already full: approving a watch
 * card must never silently drop the token. The old inline merge ([...new Set([...watch, token])].slice(0, max)) kept
 * the old tokens and threw the new one away, while the card still showed "Done" and the Fly Desk was told the fly
 * "now watches" it — and the fly's model can still propose a 6th card, since its own cap is 15, not 5. */
export function addWatch(watch: string[] | undefined, token: string, max: number): string[] | null {
  const lower = token.toLowerCase();
  const have = (watch ?? []).map((x) => x.toLowerCase());
  if (have.includes(lower)) return watch ?? [];
  if (have.length >= max) return null;
  return [...(watch ?? []), lower];
}
