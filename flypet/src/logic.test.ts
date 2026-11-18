// npm test
import assert from "node:assert/strict";
import { setLang } from "./i18n.ts";
import {
  FOCUS_MS, H, SPRITE, SWAT_MS, W, clock, focusDay, focusLeft, hopSpot, landing, nameOf, nextHop, perchHold, perchSpot, span, swatEnd, tripState, windowMoved,
} from "./logic.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ~ ${b}`);

// ---- the swat game: where it darts -------------------------------------------------------------------------------
// a full screen: anywhere across it, never below the ground or above its 600 px climb
const screen = { left: 0, right: 1920, top: 0, bottom: 1080 };
for (const [rx, ry] of [[0, 0], [0.25, 0.9], [0.5, 0.5], [0.75, 0.1], [1, 1]]) {
  const at = hopSpot(screen, rx, ry);
  assert.ok(at.x >= screen.left - W / 2 + SPRITE / 2 && at.x <= screen.right - W / 2 - SPRITE / 2, `x ${at.x}`);
  assert.ok(at.y >= screen.bottom - H - 600 && at.y <= screen.bottom - H, `y ${at.y}`);
}
assert.deepEqual(hopSpot(screen, 0, 0), { x: 0, y: 780 });
assert.deepEqual(hopSpot(screen, 1, 1), { x: 1620, y: 180 });        // a full-height hop ends 600 px up
assert.deepEqual(hopSpot(screen, 0.5, 0.5), { x: 810, y: 480 });
// a screen with no headroom (the ground nearly at the top): it only walks, it can't hop up
const flat = { left: 0, right: 1920, top: 800, bottom: 1080 };
assert.equal(hopSpot(flat, 0.5, 1).y, 780);
// a screen narrower than the fly's window: the hop stays inside the clamp, not off it
assert.equal(hopSpot({ left: 0, right: 200, top: 0, bottom: 1080 }, 1, 0).x, -70);

// ---- the swat game: when it hops, and when it ends ---------------------------------------------------------------
const until = 100_000;
assert.equal(nextHop(until, until), null);                     // the 20 seconds ran out mid-hop: the game ends
assert.equal(nextHop(until, until + 5_000), null);             // a late tick too
assert.equal(nextHop(until, until - SWAT_MS), 1050);
assert.equal(nextHop(until, until - SWAT_MS / 2), 750);
assert.ok(nextHop(until, until - SWAT_MS / 2)! < nextHop(until, until - SWAT_MS)!);   // faster as the seconds run out
const last = nextHop(until, until - 1)!;
assert.ok(last > 450 && last <= nextHop(until, until - 10_000)!);   // never faster than 450 ms

// ---- the swat game: the score ------------------------------------------------------------------------------------
assert.deepEqual(swatEnd(3, 10), { best: 10, mood: "happy", newBest: false });
assert.deepEqual(swatEnd(12, 10), { best: 12, mood: "moon", newBest: true });
assert.deepEqual(swatEnd(12, 0), { best: 12, mood: "moon", newBest: false });   // the first best is told plainly
assert.deepEqual(swatEnd(5, 5), { best: 5, mood: "happy", newBest: false });     // a tie keeps the old best

// ---- focus time: the pill's clock --------------------------------------------------------------------------------
assert.equal(focusLeft(FOCUS_MS, 0), 1500);
assert.equal(focusLeft(FOCUS_MS, 60_000), 1440);
assert.equal(focusLeft(FOCUS_MS, FOCUS_MS), 0);                // the moment it's done
assert.equal(focusLeft(FOCUS_MS, FOCUS_MS + 60_000), 0);       // and never below 0
assert.equal(clock(1500), "25:00");
assert.equal(clock(1441), "24:01");
assert.equal(clock(65), "1:05");
assert.equal(clock(0), "0:00");
// focus across midnight: the clock is plain time; the UTC day key it counts against rolls over at midnight
assert.equal(focusDay(Date.UTC(2026, 11, 1, 23, 50)), "focus:2026-12-01");
assert.equal(focusDay(Date.UTC(2026, 11, 2, 0, 15)), "focus:2026-12-02");
assert.equal(focusLeft(Date.UTC(2026, 11, 2, 0, 15), Date.UTC(2026, 11, 1, 23, 50)), 1500);   // a 25-minute session started 23:50

// ---- sitting on windows ------------------------------------------------------------------------------------------
// macOS floor: a menu bar at the top. A window too close to the top of the screen has no room for the fly above it
const mac = { left: 0, right: 1920, top: 25, bottom: 1055 };
assert.equal(perchSpot({ id: "a", x: 400, y: 100, width: 800, height: 600 }, mac, 0.5), null);
assert.equal(perchSpot({ id: "a", x: 400, y: 25, width: 800, height: 600 }, mac, 0.5), null);      // maximized-like
assert.equal(perchSpot({ id: "a", x: 400, y: 320, width: 150, height: 600 }, mac, 0.5), null);     // too small to sit on
// a window with room: its feet land on the top edge (y + H - 6 = the window's y)
const win = { id: "a", x: 400, y: 320, width: 800, height: 600 };
assert.deepEqual(perchSpot(win, mac, 0), { x: 350, y: 26 });
assert.deepEqual(perchSpot(win, mac, 1), { x: 950, y: 26 });
for (const r of [0, 0.2, 0.8, 1]) {
  const at = perchSpot(win, mac, r)!;
  assert.equal(at.y + H - 6, win.y);
  assert.ok(at.x >= win.x + 20 - (W - SPRITE) / 2 && at.x <= win.x + 20 + win.width - SPRITE - 40 - (W - SPRITE) / 2 + 1e-9, `r ${r}`);
}
// a window off the screen's left edge: it sits as far left as the pet's window can go, no further
assert.equal(perchSpot({ id: "b", x: -300, y: 320, width: 800, height: 600 }, mac, 0)!.x, mac.left - W / 2 + SPRITE / 2);
// a Windows floor, top of the screen at 0: same rule one screen further up
assert.equal(perchSpot({ id: "a", x: 400, y: 100, width: 800, height: 600 }, { left: 0, right: 1920, top: 0 }, 0.5), null);

// it holds on while its window drifts 1-2 px (three is still holding), and falls off at four
assert.equal(windowMoved(win, { ...win, x: win.x + 1 }), false);
assert.equal(windowMoved(win, { ...win, x: win.x + 2 }), false);
assert.equal(windowMoved(win, { ...win, y: win.y - 2 }), false);
assert.equal(windowMoved(win, { ...win, y: win.y - 3 }), false);
assert.equal(windowMoved(win, { ...win, x: win.x + 4 }), true);
assert.equal(windowMoved(win, { ...win, y: win.y + 4 }), true);
assert.equal(windowMoved(win, { id: "b", x: 400, y: 320, width: 800, height: 600 }), true);   // another window came in front
assert.equal(windowMoved(win, null), true);                                                // its window closed
// and it hops down by itself after 45-120 s
for (const r of [0, 0.5, 1]) {
  const hold = perchHold(1000, r) - 1000;
  assert.ok(hold >= 45_000 && hold <= 120_000, `${hold}`);
}
assert.equal(perchHold(1000, 0), 46_000);
assert.equal(perchHold(1000, 1), 121_000);

// ---- landing after a toss or a fall-off --------------------------------------------------------------------------
const b = landing(10, 7)!;
assert.equal(b.vx, 6);                                         // the bounce keeps 60% of the sideways
near(b.vy, -2.45);                                             // and 35% of the fall, upwards
near(landing(-5, 6.5)!.vy, -2.275);
assert.equal(landing(10, 6), null);                           // slow enough: it stops
assert.equal(landing(10, 0), null);
assert.equal(landing(10, -1), null);

// ---- the expeditions card's helpers ------------------------------------------------------------------------------
// span: minutes and hours, never 0
assert.equal(span(15 * 60_000), "15m");
assert.equal(span(60_000), "1m");
assert.equal(span(1), "1m");                                  // anything under a minute rounds up
assert.equal(span(0), "1m");
assert.equal(span(60 * 60_000), "1h");
assert.equal(span(80 * 60_000), "1h 20m");
assert.equal(span(23 * 60 * 60_000 + 59 * 60_000), "23h 59m");
assert.equal(span(24 * 60 * 60_000), "24h");
setLang("tr");
assert.equal(span(80 * 60_000), "1 sa 20 dk");
assert.equal(span(60 * 60_000), "1 sa");
setLang("en");

// nameOf: the app's language, the data kept in LANGS order (en, zh-Hans, zh-Hant, ko, tr, es)
const names: [string, string, string, string, string, string] = ["Sewer", "下水道", "下水道", "하수도", "Lağım", "Alcantarilla"];
assert.equal(nameOf(names), "Sewer");
setLang("ko");
assert.equal(nameOf(names), "하수도");
setLang("es");
assert.equal(nameOf(names), "Alcantarilla");
setLang("en");

// the trip countdown: how long is left, whether it's back, and how far along the bar is
const tr = { started_at: 0, ends_at: 10 * 60_000 };
assert.deepEqual(tripState(tr, 0), { left: 600_000, done: false, pct: 0 });
assert.deepEqual(tripState(tr, 5 * 60_000), { left: 300_000, done: false, pct: 50 });
assert.deepEqual(tripState(tr, 10 * 60_000), { left: 0, done: true, pct: 100 });
assert.deepEqual(tripState(tr, 10 * 60_000 + 1), { left: -1, done: true, pct: 100 });   // a hair past: the flip that redraws the card
assert.equal(tripState(tr, 20 * 60_000).pct, 100);                                      // long past: the bar stays full
// a trip that didn't start at 0, and one a speed-up cut short: the bar follows the times it was given
assert.deepEqual(tripState({ started_at: 1_000, ends_at: 61_000 }, 31_000), { left: 30_000, done: false, pct: 50 });
assert.deepEqual(tripState({ ...tr, ends_at: 5 * 60_000 }, 5 * 60_000), { left: 0, done: true, pct: 100 });

console.log("all passed");
