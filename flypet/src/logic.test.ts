// npm test: the pet's own game logic (logic.ts)
import assert from "node:assert/strict";
import { setLang } from "./i18n.ts";
import {
  FOCUS_MS, H, SPRITE, SWAT_MS, W, clampX, fallsOff, focusClock, focusDay, groundY, hopDelay, hopSpot, landing,
  nameIn, perchSpot, perchUntil, span, swatEnd, swatOver, tripState, type Win,
} from "./logic.ts";
import { addWatch, watchMax } from "./logic.ts";
import type { Names6 } from "./store.ts";

const floor = { left: 0, right: 1920, top: 0, bottom: 1040 };       // a 1080p screen with a 40 px taskbar
const win = (x: number, y: number, width = 800, id = "a"): Win => ({ id, x, y, width, height: 600 });

// ---- the screen edges ----
assert.equal(groundY(floor), 1040 - H);
assert.equal(clampX(-1e9, floor), floor.left - W / 2 + SPRITE / 2);   // the sprite, not the window, stays on screen
assert.equal(clampX(1e9, floor), floor.right - W / 2 - SPRITE / 2);
assert.equal(clampX(500, floor), 500);

// ---- falling ----
assert.deepEqual(landing(10, 20), { vx: 6, vy: -7, rest: false });   // a fast fall bounces
assert.deepEqual(landing(10, 6), { vx: 0, vy: 0, rest: true });      // 6 is slow enough to stop
assert.deepEqual(landing(-3, 6.01), { vx: -3 * 0.6, vy: -6.01 * 0.35, rest: false });

// ---- the swat game ----
// it darts between the ground and 600 px above it, inside the screen
assert.deepEqual(hopSpot(floor, 0, 0), { x: clampX(0, floor), y: groundY(floor) });
assert.equal(hopSpot(floor, 0.999, 0.999).y, groundY(floor) - 0.999 * 600);
// a short screen: never above its top (40 px of room kept)
const short = { left: 0, right: 1280, top: 0, bottom: 500 };
assert.equal(hopSpot(short, 0.5, 1).y, groundY(short) - (groundY(short) - 40));
// a screen shorter than the pet's window: it stays on the ground
assert.equal(hopSpot({ left: 0, right: 800, top: 0, bottom: 280 }, 0.5, 1).y, 280 - H);
for (let i = 0; i <= 10; i++) {
  const s = hopSpot(floor, i / 10.01, i / 10.01);
  assert.ok(s.x === clampX(s.x, floor));
  assert.ok(s.y <= groundY(floor) && s.y >= groundY(floor) - 600);
}
// faster as the seconds run out: 1050 ms at the start, 450 ms at the end
const until = 1_000_000 + SWAT_MS;
assert.equal(hopDelay(1_000_000, until), 1050);
assert.equal(hopDelay(1_000_000 + SWAT_MS / 2, until), 750);
assert.equal(hopDelay(until, until), 450);
// the game ending mid-hop: a hop that fires at or after the end ends the game instead of hopping
assert.equal(swatOver(until - 1, until), false);
assert.equal(swatOver(until, until), true);
assert.equal(swatOver(until + 250, until), true);
// game over
assert.deepEqual(swatEnd(7, 4), { best: 7, record: true, mood: "moon", line: "g.newBest", vars: { n: 7 } });
assert.deepEqual(swatEnd(3, 4), { best: 4, record: false, mood: "happy", line: "g.score", vars: { n: 3, best: 4 } });
assert.deepEqual(swatEnd(4, 4), { best: 4, record: false, mood: "happy", line: "g.score", vars: { n: 4, best: 4 } });
// the first game sets a best without the "new best" line
assert.deepEqual(swatEnd(5, 0), { best: 5, record: true, mood: "moon", line: "g.score", vars: { n: 5, best: 5 } });
assert.deepEqual(swatEnd(0, 0), { best: 0, record: false, mood: "happy", line: "g.score", vars: { n: 0, best: 0 } });

// ---- focus time ----
assert.equal(FOCUS_MS, 25 * 60_000);
assert.equal(focusClock(FOCUS_MS, 0), "25:00");
assert.equal(focusClock(FOCUS_MS, 1), "25:00");                     // rounds up to the second
assert.equal(focusClock(61_000, 0), "1:01");
assert.equal(focusClock(9_000, 0), "0:09");
assert.equal(focusClock(0, 0), "0:00");
assert.equal(focusClock(0, 5_000), "0:00");                         // never below zero
// across midnight: a session from 23:50 to 00:15 (UTC) counts on the day it finished
const start = Date.UTC(2026, 10, 18, 23, 50);
assert.equal(focusDay(start), "focus:2026-11-18");
assert.equal(focusDay(start + FOCUS_MS), "focus:2026-11-19");
assert.equal(focusDay(Date.UTC(2026, 10, 18, 23, 59, 59, 999)), "focus:2026-11-18");
assert.equal(focusDay(Date.UTC(2026, 10, 19)), "focus:2026-11-19");
assert.equal(focusDay(Date.UTC(2026, 11, 31, 23, 59) + FOCUS_MS), "focus:2027-01-01");

// ---- sitting on your windows ----
// its feet on the top edge, somewhere along it
assert.deepEqual(perchSpot(win(400, 500), floor, 0), { x: 400 + 20 - (W - SPRITE) / 2, y: 500 - H + 6 });
assert.equal(perchSpot(win(400, 500), floor, 0.999)!.x, 400 + 20 + 0.999 * (800 - SPRITE - 40) - (W - SPRITE) / 2);
// too close to the top of the screen: no room above it
assert.equal(perchSpot(win(400, H - 8), floor, 0.5)!.y, -2);       // just room: the window may run 2 px off the top
assert.equal(perchSpot(win(400, H - 9), floor, 0.5), null);
assert.equal(perchSpot(win(0, 0), floor, 0.5), null);                // maximized
assert.equal(perchSpot(win(400, 500 + 0), { ...floor, top: 300 }, 0.5), null); // a screen whose top is lower
// too narrow
assert.equal(perchSpot(win(400, 500, SPRITE + 39), floor, 0.5), null);
assert.deepEqual(perchSpot(win(400, 500, SPRITE + 40), floor, 0.7), { x: 400 + 20 - (W - SPRITE) / 2, y: 500 - H + 6 });
// a window at the screen's edge: the sprite stays on screen
assert.equal(perchSpot(win(1700, 500, 600), floor, 0.999)!.x, clampX(1e9, floor));
// it hops down 45 to 120 s later
assert.equal(perchUntil(1000, 0), 46_000);
assert.equal(perchUntil(1000, 0.5), 1000 + 45_000 + 37_500);
assert.ok(perchUntil(0, 0.999999) < 120_000);
// a window that moves by 1-2 px keeps it sitting; 4 px or more and it falls
const sat = win(400, 500);
assert.equal(fallsOff(sat, sat, win(401, 502)), false);
assert.equal(fallsOff(sat, sat, win(398, 498)), false);
assert.equal(fallsOff(sat, sat, win(403, 497)), false);              // 3 px is still inside
assert.equal(fallsOff(sat, sat, win(404, 500)), true);
assert.equal(fallsOff(sat, sat, win(400, 496)), true);
// its window went away
assert.equal(fallsOff(sat, sat, null), true);
assert.equal(fallsOff(sat, win(0, 0, 800, "b"), null), true);
// another window in front after its own: it falls
assert.equal(fallsOff(sat, sat, win(10, 10, 800, "b")), true);
// it is told about a different window while its own was not the last one reported: it stays
assert.equal(fallsOff(sat, win(10, 10, 800, "b"), win(20, 20, 800, "c")), false);
// its own window back in front, unmoved
assert.equal(fallsOff(sat, win(10, 10, 800, "b"), win(400, 500)), false);

// ---- the expeditions card ----
const names: Names6 = ["Garden", "花园", "花園", "정원", "Bahçe", "Jardín"];
assert.equal(nameIn(names, "en"), "Garden");
assert.equal(nameIn(names, "tr"), "Bahçe");
assert.equal(nameIn(names, "es"), "Jardín");
assert.equal(nameIn(names, "xx"), "Garden");                        // a language the data doesn't know
assert.equal(nameIn(["Garden"] as unknown as Names6, "ko"), "Garden"); // a name missing in that language
setLang("en");
assert.equal(span(0), "1m");                                          // never less than a minute
assert.equal(span(-5_000), "1m");
assert.equal(span(1), "1m");
assert.equal(span(15 * 60_000), "15m");
assert.equal(span(15 * 60_000 + 1), "16m");                           // rounds up
assert.equal(span(60 * 60_000), "1h");
assert.equal(span(80 * 60_000), "1h 20m");
assert.equal(span(59 * 60_000 + 1), "1h");
// the countdown
const trip = { started_at: 1_000, ends_at: 1_000 + 60 * 60_000 };
assert.deepEqual(tripState(trip, 1_000), { left: 60 * 60_000, done: false, pct: 0 });
assert.deepEqual(tripState(trip, 1_000 + 30 * 60_000), { left: 30 * 60_000, done: false, pct: 50 });
assert.deepEqual(tripState(trip, trip.ends_at), { left: 0, done: true, pct: 100 });
assert.deepEqual(tripState(trip, trip.ends_at + 5_000), { left: -5_000, done: true, pct: 100 }); // never past 100
assert.equal(tripState({ started_at: 5, ends_at: 5 }, 5).pct, 0);    // a zero-length trip doesn't divide by zero

// ---- the watch list (logic.ts addWatch) ----
// Approving a "watch this token?" card must add the token, never silently drop it: the old inline merge
// ([...new Set([...watch, token])].slice(0, 5)) kept the 5 old tokens and threw the new one away, while the card
// still showed "Done" and the Fly Desk was told the fly "now watches" it.
const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  C = "0xcccccccccccccccccccccccccccccccccccccccc", D = "0xdddddddddddddddddddddddddddddddddddddddd",
  E = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", F = "0xffffffffffffffffffffffffffffffffffffffff";
assert.deepEqual(addWatch(undefined, "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 5), [A]);   // first watch, lowercased
assert.deepEqual(addWatch([A, B], F, 5), [A, B, F]);
assert.deepEqual(addWatch([A], "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 5), [A]);        // already watched: no duplicate
assert.equal(addWatch([A, B, C, D, E], F, 5), null);                                          // full + a new token: refused, not dropped
assert.deepEqual(addWatch([A, B, C, D, E], E, 5), [A, B, C, D, E]);                           // full but already watched: fine

// The cap follows the fly's value, the desk's tiers: 5, 10 over $100, 15 over $500 (issue #89).
assert.equal(watchMax(99.99), 5);
assert.equal(watchMax(100), 5);        // "over $100": exactly $100 is still 5
assert.equal(watchMax(100.01), 10);
assert.equal(watchMax(499.99), 10);
assert.equal(watchMax(500), 10);       // "over $500": exactly $500 is still 10
assert.equal(watchMax(500.01), 15);
assert.equal(watchMax(0), 5);
assert.equal(watchMax(undefined), 5);  // no value known yet: the smallest cap, never a bigger one
assert.equal(watchMax(null), 5);
assert.deepEqual(addWatch([A, B, C, D, E], F, watchMax(300)), [A, B, C, D, E, F]);   // a $300 fly's 6th token goes through

console.log("logic tests ok");
