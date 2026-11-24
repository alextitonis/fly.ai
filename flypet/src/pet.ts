// The pet's window: plays the avatar's GIFs, walks along the bottom of the screen, can be grabbed and tossed, and acts out
// what the feeds say (gains, losses, buys and sells). See mood.ts for what makes it react.
import { t } from "./i18n.ts";
import { FEED_LINES, asleepAt, daysTogether, moneyMoves, paceTarget, readFlies, readPrice, type Fly, type Mood, type Reaction } from "./mood.ts";
import { addNote, applyLang, flyFeed, prefs, priceSamples, publicFeed, seenOf, setPrefs, setPriceSamples, setSeen, signedIn, walletFeed } from "./store.ts";
import { setupTalk } from "./talk.ts";
import { setupCoach } from "./coach.ts";
import { itemArt, setupExpeditions } from "./expeditions.ts";
import { FOCUS_MS, H, MEM_ITEMS, MEM_MS, MEM_PAIRS, SPRITE, SWAT_MS, W, clampX as clampTo, fallsOff, focusClock, focusDay, groundY as groundOf, hopDelay, hopSpot, landing, memDeck, memEnd, memOver, nameOf, perchSpot, perchUntil, span, swatEnd, swatOver, type Win } from "./logic.ts";
import type { ExpView } from "./store.ts";

const native = window.flyNative;                    // vite in a plain browser has no window to move
const fly = document.getElementById("fly") as HTMLImageElement;
const look = document.getElementById("look") as HTMLDivElement;      // the fly + what it wears (mirrored together)
const bubble = document.getElementById("bubble") as HTMLDivElement;
const stage = document.getElementById("stage") as HTMLDivElement;

const POLL_MS = 60_000, PRICE_MS = 5 * 60_000, FRAME_MS = 33;
const WALK_PX = 1.6, GRAVITY = 1.1;
const REACTION_MS = 5_000, QUEUE_MAX = 6;

// ---- the avatar: a folder of GIFs named by public/avatars/<id>/avatar.json; a mood it doesn't have plays idle ----
type Anchors = Record<"head" | "wingL" | "wingR" | "hand" | "feet", [number, number]>;
let avatar = { base: "avatars/default/", moods: {} as Partial<Record<Mood, string>>,
  anchors: { head: [74, 12], wingL: [34, 66], wingR: [124, 66], hand: [46, 118], feet: [80, 150] } as Anchors };
let mood: Mood = "idle", plays = 0;
function play(next: Mood) {
  const file = avatar.moods[next] ?? avatar.moods.idle;
  if (!file) return;
  mood = next;
  fly.src = `${avatar.base}${file}?play=${++plays}`;    // a new URL restarts a GIF from its first frame
  drawHit = null;
}

// ---- saying things ---------------------------------------------------------------------------------------------
let bubbleTimer = 0;
function say(text: string, ms = REACTION_MS) {
  if (prefs().quiet || !prefs().bubbles) return;
  bubble.textContent = text;
  bubble.classList.add("on");
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => bubble.classList.remove("on"), ms);
}
// the coach's tips (src/coach.ts) show even when the fly is told to be quiet: the player turned the coach on to hear them
function sayCoach(text: string, ms = 9_000) {
  bubble.textContent = text;
  bubble.classList.add("on");
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => bubble.classList.remove("on"), ms);
}
function notify(text: string) {
  if (prefs().notifications && !prefs().quiet) native?.notify(prefs().name, text);
}

// ---- reactions, one at a time ----------------------------------------------------------------------------------
const queue: Reaction[] = [];
let busyUntil = 0;
function react(r: Reaction) {
  if (queue.length < QUEUE_MAX) queue.push(r);
  if (r.notify) notify(r.text);
  // in the chat on the fly too (2026-11-13): its money and price alerts as its messages (trades come from its log there)
  if (r.kind && r.kind !== "trade") addNote({ at: Date.now(), text: r.text, mood: r.mood, fly: prefs().fly });
  talk.refresh();
}
function nextReaction(now: number) {
  if (now < busyUntil || !queue.length || state === "held" || state === "falling") return;
  const r = queue.shift()!;
  state = "acting";
  busyUntil = now + REACTION_MS;
  play(r.mood);
  say(r.text);
}

// ---- reading the feeds -----------------------------------------------------------------------------------------
async function pollFlies() {
  const p = prefs();
  try {
    // the fly picked in the pet's window (2026-11-13): a Trader Fly or a partner NFT, its trades and its money
    if (p.wallet && p.fly != null) {
      const f = await flyFeed(p.fly);
      if (f.fly) {
        const name = f.who ? `${f.who.name} #${f.who.token}` : null;
        // its money in and out (deposits, withdrawals, refunds, bonuses), told and notified like its trades
        const mkey = `money:${p.fly}`, m = moneyMoves(seenOf(mkey).profit ?? null, f.log ?? [], true);
        setSeen(mkey, { lastAt: {}, profit: m.last });
        m.reactions.forEach(react);
        return follow(`fly:${p.fly}`, [f.fly], true, name ? () => name : undefined);
      }
    }
    if (p.wallet) {
      const flies = (await walletFeed(p.wallet)).flies.filter((f) => f.funded);
      if (flies.length) return follow(`wallet:${p.wallet}`, flies.filter((f) => !p.flies || p.flies.includes(f.id)), true);
    }
    const { top } = await publicFeed();
    if (top) follow("top", [top], false, (id) => t("topFly", { id }));
  } catch { /* offline or the server restarting: the next poll tries again */ }
}
function follow(key: string, flies: Fly[], notifyTrades: boolean, who?: (id: number) => string) {
  const { seen, reactions } = readFlies(seenOf(key), flies, { notify: notifyTrades, minUsd: prefs().minUsd, who });
  setSeen(key, seen);
  reactions.forEach(react);
}
// a newer Fly Pet (electron/main.ts checkUpdate): the fly says so, and it stays in its chat
native?.onUpdate?.((v) => react({ mood: "happy", text: t("updateReady", { v }), notify: false, kind: "money" }));
async function pollPrice() {
  try {
    const { flyai_usd } = await publicFeed();
    if (!(flyai_usd > 0)) return;
    const { samples, reaction } = readPrice(priceSamples(), flyai_usd, Date.now());
    setPriceSamples(samples);
    if (reaction) react(reaction);
  } catch { /* the next poll */ }
}

// ---- moving around ---------------------------------------------------------------------------------------------
type State = "idle" | "walking" | "acting" | "sleeping" | "held" | "falling";
let state: State = "idle";
let x = 0, y = 0, vx = 0, vy = 0, targetX = 0, restUntil = 0;
let floor = { left: 0, right: 1920, top: 0, bottom: 1080 };

async function measure() {
  if (!native) return;
  const a = await native.workArea();
  floor = { left: a.x, right: a.x + a.width, top: a.y, bottom: a.y + a.height };
}
const place = () => native?.place(x, y);
const clampX = (v: number) => clampTo(v, floor);
const groundY = () => groundOf(floor);
let home = 0;
function setHome(at: number) {
  home = at;
  setPrefs({ homeX: at });
}

function tick() {
  const now = Date.now();
  nextReaction(now);
  if (talking || away || game) return;                 // it stays put under its chat; away on a trip or in the swat game, nothing here
  if (perched && state === "idle") {                   // on a window: it sits, then hops down after a while
    if (now >= perched.until) { perched = null; state = "falling"; vx = (Math.random() - 0.5) * 6; vy = -3; play("fall"); }
    return;
  }
  if (state === "falling") {
    vy += GRAVITY; x = clampX(x + vx); y += vy;
    if (y >= groundY()) {
      y = groundY();
      const l = landing(vx, vy);
      vx = l.vx; vy = l.vy;
      if (l.rest) { state = "idle"; restUntil = now + 1500; setHome(x); play("idle"); }
    }
    place();
  } else if (state === "acting") {
    if (now >= busyUntil && !queue.length) { state = "idle"; restUntil = now + 1500; play("idle"); }
  } else if (state === "walking") {
    const d = targetX - x;
    if (Math.abs(d) <= WALK_PX) { state = "idle"; restUntil = now + 4000 + Math.random() * 15000; play("idle"); }
    else { x += Math.sign(d) * WALK_PX; place(); }
  } else if (state === "sleeping") {
    if (!asleepAt(new Date().getHours())) { state = "idle"; restUntil = now + 1000; play("wave"); say(t("gm", { day: daysTogether(prefs().born, now) + 1 })); }
  } else if (state === "idle" && now >= restUntil && !focusUntil && tryPerch(now)) {
    // it flew up onto the window in front (sitting on your windows)
  } else if (state === "idle" && now >= restUntil && focusUntil) {
    restUntil = now + 5000;                            // focus time: it stays put and keeps you company
  } else if (state === "idle" && now >= restUntil) {
    if (asleepAt(new Date().getHours())) { state = "sleeping"; play("sleep"); }
    else if (prefs().quiet || Math.random() < 0.4) restUntil = now + 8000 + Math.random() * 20000;
    else {
      targetX = paceTarget(home, x, Math.random(), clampX(-Infinity), clampX(Infinity));
      look.classList.toggle("left", targetX < x);
      state = "walking";
      play("walk");
    }
  }
}

// ---- the mouse: grab and toss, a click is a pet ----------------------------------------------------------------
let grab: { dx: number; dy: number; startX: number; startY: number; moved: boolean; lastX: number; lastY: number; lastAt: number } | null = null;
fly.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  native?.menu();
});
fly.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (game) { if (game.kind === "swat") swatHit(); return; }   // the swat game: a click is a swat, not a grab
  fly.setPointerCapture(e.pointerId);
  grab = { dx: e.screenX - x, dy: e.screenY - y, startX: e.screenX, startY: e.screenY, moved: false, lastX: e.screenX, lastY: e.screenY, lastAt: Date.now() };
});
fly.addEventListener("pointermove", (e) => {
  if (!grab) return;
  if (!grab.moved && Math.hypot(e.screenX - grab.startX, e.screenY - grab.startY) < 4) return;
  if (!grab.moved) { if (talking) closeTalk(); perched = null; grab.moved = true; state = "held"; play("held"); }
  const at = Date.now(), dt = Math.max(1, at - grab.lastAt);
  vx = ((e.screenX - grab.lastX) / dt) * FRAME_MS;
  vy = ((e.screenY - grab.lastY) / dt) * FRAME_MS;
  grab.lastX = e.screenX; grab.lastY = e.screenY; grab.lastAt = at;
  x = e.screenX - grab.dx; y = e.screenY - grab.dy;
  place();
});
fly.addEventListener("pointerup", () => {
  const was = grab;
  grab = null;
  if (!was) return;
  if (was.moved) {
    state = "falling"; play("fall");
    void measure();
    return;
  }
  // a click opens its chat (2026-11-13, the user: "the chat etc to be on itself"), or closes it
  if (talking) { closeTalk(); return; }
  openTalk();
});
function feed() {
  state = "acting"; busyUntil = Date.now() + 3000;
  play("eat");
  say(t(FEED_LINES[Math.floor(Math.random() * FEED_LINES.length)]), 3000);
  if (signedIn() && prefs().fly != null) void expeditions.feed();   // once a UTC day it's worth a little pet XP
}

// ---- the swat game (2026-11-18): 20 seconds, the fly darts around the screen, every click on it counts ---------------
const BEST = "swatBest";
let game: { kind: "swat" | "memory"; until: number; score: number; timer: number } | null = null;
function swatGame() {
  if (game || away) return;
  closeTalk();
  perched = null;
  game = { kind: "swat", until: Date.now() + SWAT_MS, score: 0, timer: 0 };
  sayCoach(t("g.start"), 2500);
  game.timer = window.setTimeout(hop, 1200);
}
function hop() {
  if (!game) return;
  if (swatOver(Date.now(), game.until)) { endGame(); return; }
  ({ x, y } = hopSpot(floor, Math.random(), Math.random()));
  look.classList.toggle("left", Math.random() < 0.5);
  place(); play("walk");
  // faster as the seconds run out
  game.timer = window.setTimeout(hop, hopDelay(Date.now(), game.until));
}
function swatHit() {
  if (!game) return;
  game.score++;
  play("rugged");
  sayCoach(`💥 ${game.score}`, 700);
  clearTimeout(game.timer);
  game.timer = window.setTimeout(hop, 250);
}
function endGame() {
  if (!game) return;
  const kind = game.kind, score = game.score;
  clearTimeout(game.timer);
  if (kind === "memory") clearMemory();            // the cards go with it
  game = null;
  const key = kind === "memory" ? MEM_BEST : BEST;
  let best = 0;
  try { best = Number(localStorage.getItem(key)) || 0; } catch { /* private */ }
  const end = kind === "memory" ? memEnd(score, best) : swatEnd(score, best);
  if (end.record) { try { localStorage.setItem(key, String(end.best)); } catch { /* private */ } }
  x = home; y = groundY(); place();
  state = "acting"; busyUntil = Date.now() + 3000; play(end.mood);
  sayCoach(t(end.line, end.vars), 5000);
}

// ---- the memory game (issue #59): 30 seconds, 12 cards in 6 pairs of expedition item sprites, flip two to match ----
const MEM_BEST = "memoryBest";
const MEM_BACK = "🪰";                            // face-down, a fly — what the cards hide under
let memCards: { el: HTMLButtonElement; item: string; matched: boolean; open: boolean }[] = [];
let memFirst: number | null = null, memLock = false, memFlipTimer = 0;
function memoryGame() {
  if (game || away) return;
  closeTalk();
  perched = null;
  game = { kind: "memory", until: Date.now() + MEM_MS, score: 0, timer: 0 };
  sayCoach(t("g.memStart"), 2500);
  buildMemory();
  game.timer = window.setTimeout(() => { if (game?.kind === "memory" && memOver(Date.now(), game.until)) endGame(); }, MEM_MS);
}
function buildMemory() {
  const deck = memDeck(MEM_ITEMS, Array.from({ length: MEM_ITEMS.length * 2 - 1 }, () => Math.random()));
  const grid = document.createElement("div");
  grid.className = "mem-grid"; grid.id = "mem-grid";
  memCards = deck.map((item, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "mem-card"; b.textContent = MEM_BACK;
    b.addEventListener("click", () => memPick(i));
    grid.append(b);
    return { el: b, item, matched: false, open: false };
  });
  stage.append(grid);
}
function flipCard(c: { el: HTMLButtonElement; item: string; open: boolean }, open: boolean) {
  c.open = open;
  c.el.classList.toggle("open", open);
  if (open) c.el.replaceChildren(itemArt({ id: c.item, glyph: MEM_ITEMS.find((it) => it.id === c.item)?.glyph ?? "?" }, 40));
  else { c.el.replaceChildren(); c.el.textContent = MEM_BACK; }
}
function memPick(i: number) {
  if (!game || game.kind !== "memory" || memLock) return;
  const c = memCards[i];
  if (!c || c.open || c.matched) return;
  flipCard(c, true);
  if (memFirst == null) { memFirst = i; return; }
  const first = memCards[memFirst];
  memFirst = null;
  if (first.item === c.item) {
    first.matched = c.matched = true;
    first.el.classList.add("done"); c.el.classList.add("done");
    game.score++;
    play("eat");
    sayCoach(`🧠 ${game.score}`, 700);
    if (game.score === MEM_PAIRS) endGame();      // all six pairs found, before the clock runs out
  } else {
    memLock = true;                               // a miss flips back after a beat, so you can see both cards
    memFlipTimer = window.setTimeout(() => { flipCard(first, false); flipCard(c, false); memLock = false; }, 700);
  }
}
/** clear the cards (a game over, or a trip starting mid-game) */
function clearMemory() {
  window.clearTimeout(memFlipTimer);
  memFlipTimer = 0;
  document.getElementById("mem-grid")?.remove();
  memCards = []; memFirst = null; memLock = false;
}

// ---- focus time (2026-11-18): 25 minutes where it sits still beside you; it cheers when the time is up ---------------
let focusUntil = 0;
const focusTag = document.getElementById("focus") as HTMLDivElement;
function focusStart() {
  if (away || game) return;
  closeTalk();
  perched = null;
  focusUntil = Date.now() + FOCUS_MS;
  if (state === "walking") { state = "idle"; play("idle"); }
  sayCoach(t("f.on"), 4000);
  focusShow();
}
function focusShow() {
  focusTag.hidden = !focusUntil || talking;
  if (focusUntil) {
    focusTag.textContent = t("f.left", { time: focusClock(focusUntil, Date.now()) });
  }
}
function focusStop(done: boolean) {
  if (!focusUntil) return;
  focusUntil = 0;
  focusShow();
  if (!done) { say(t("f.stop"), 2500); return; }
  const key = focusDay(Date.now());
  let n = 1;
  try { n = (Number(localStorage.getItem(key)) || 0) + 1; localStorage.setItem(key, String(n)); } catch { /* private */ }
  state = "acting"; busyUntil = Date.now() + 4000; play("moon");
  sayCoach(t("f.done", { n }), 8000);
  notify(t("f.done", { n }));
}
setInterval(() => { if (focusUntil) { if (Date.now() >= focusUntil) focusStop(true); else focusShow(); } }, 1000);
focusTag.addEventListener("click", () => focusStop(false));

// ---- sitting on your windows (2026-11-18, Windows): now and then it flies up onto the title bar of the window in front;
// when you move that window (or switch to another) it falls off and lands back on the ground --------------------------
let front: Win | null = null, perched: (Win & { until: number }) | null = null;
function tryPerch(now: number): boolean {
  const w = front;
  if (!w || !prefs().perch || prefs().quiet || talking || away || game || Math.random() > 0.3) return false;
  const spot = perchSpot(w, floor, Math.random());      // its feet on the window's top edge
  if (!spot) return false;                               // no room above it (maximized-like) or too small
  ({ x, y } = spot);
  perched = { ...w, until: perchUntil(now, Math.random()) };
  place();
  state = "acting"; busyUntil = now + 1500; play("wave");
  return true;
}
function onFront(w: Win | null) {
  const was = front;
  front = w;
  if (!perched) return;
  if (fallsOff(perched, was, w)) {
    // its window moved or went away: it buzzes off and falls to the ground
    perched = null;
    state = "falling"; vx = (Math.random() - 0.5) * 8; vy = -5; play("fall");
  }
}

// A transparent window still catches clicks, so it lets them through except over the fly's own pixels. The native side
// sends the cursor (electron/main.ts).
let drawHit: ImageData | null = null;
const probe = document.createElement("canvas");
probe.width = probe.height = SPRITE;
function overFly(cx: number, cy: number): boolean {
  if (away) return false;
  const r = fly.getBoundingClientRect();
  const px = Math.floor(cx - r.left), py = Math.floor(cy - r.top);
  if (px < 0 || py < 0 || px >= SPRITE || py >= SPRITE) return false;
  if (!drawHit) {
    const c = probe.getContext("2d", { willReadFrequently: true })!;
    c.clearRect(0, 0, SPRITE, SPRITE);
    c.imageSmoothingEnabled = false;
    try { c.drawImage(fly, 0, 0, SPRITE, SPRITE); drawHit = c.getImageData(0, 0, SPRITE, SPRITE); } catch { return true; }
  }
  const sx = look.classList.contains("left") ? SPRITE - 1 - px : px;
  // a few pixels of slack, so thin legs and antennae can be grabbed
  for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
    const qx = sx + dx, qy = py + dy;
    if (qx >= 0 && qy >= 0 && qx < SPRITE && qy < SPRITE && drawHit.data[(qy * SPRITE + qx) * 4 + 3] > 40) return true;
  }
  return false;
}
let passing: boolean | null = null;
function pass(through: boolean) {
  if (through === passing) return;
  passing = through;
  native?.setIgnore(through);
}

// ---- its chat, on the fly (src/talk.ts) ---------------------------------------------------------------------------
// The window grows around the fly for the panel (the fly stays where it is on the screen) and takes the keyboard.
const TALK_W = 380, TALK_H = 630;
const talkBox = document.getElementById("talk") as HTMLDivElement;
let talking = false;
// ---- expeditions (src/expeditions.ts): what it wears, and trips on the server's clock ---------------------------------
const wingsBox = document.getElementById("wings") as HTMLDivElement, wearBox = document.getElementById("wear") as HTMLDivElement;
const awayTag = document.getElementById("away") as HTMLDivElement, gift = document.getElementById("gift") as HTMLDivElement;
let away = false, trailItem: { id: string; glyph: string } | null = null;
const lootWaiting = () => { const tr = expeditions.view()?.me.trip; return !!tr && tr.ends_at <= Date.now(); };
/** an item's pixel art pinned at an anchor of the sprite */
const artAt = (it: { id: string; glyph: string }, [ax, ay]: [number, number], px: number, flip = false) => {
  const e = itemArt(it, px);
  e.classList.add("wear-g");
  e.style.left = `${ax}px`; e.style.top = `${ay}px`;
  if (flip) e.style.transform = "translate(-50%, -50%) scaleX(-1)";
  return e;
};
/** put on what it wears: hat on the head, wings behind, an extra by its hand, the bubble's colors, a set's glow */
function dress(v: ExpView | null) {
  const eq = v?.me.equipped ?? {}, item = (id?: string) => (id ? v?.items.find((i) => i.id === id) : undefined);
  const a = avatar.anchors, hat = item(eq.hat), wings = item(eq.wings), acc = item(eq.acc), bub = item(eq.bubble);
  wingsBox.replaceChildren(...(wings ? [artAt(wings, a.wingL, 44, true), artAt(wings, a.wingR, 44)] : []));
  wearBox.replaceChildren(...[hat && artAt(hat, a.head, 44), acc && artAt(acc, a.hand, 30)].filter((n): n is HTMLElement => !!n));
  trailItem = item(eq.trail) ?? null;
  bubble.classList.toggle("skin", !!bub?.colors);
  if (bub?.colors) { bubble.style.setProperty("--bub-bg", bub.colors.bg); bubble.style.setProperty("--bub-ink", bub.colors.ink); }
  look.classList.toggle("set", (v?.me.sets.length ?? 0) > 0);
}
/** its trail: a few glyphs left behind it while it walks (CSS only, gone in a second) */
setInterval(() => {
  if (!trailItem || away || talking || state !== "walking") return;
  const e = itemArt(trailItem, 20), toLeft = look.classList.contains("left");
  e.classList.add("trail");
  e.style.left = `${W / 2 + (toLeft ? 40 : -56)}px`;
  e.style.setProperty("--dx", `${toLeft ? 24 : -24}px`);
  document.getElementById("stage")!.append(e);
  setTimeout(() => e.remove(), 1300);
}, 380);

const placeName = (v: ExpView | null, id: string) => { const p = v?.places.find((x) => x.id === id); return p ? nameOf(p.names) : id; };
const NOTIFIED = "expBack";
/** away while a trip runs; back (a gift over its head, one notification) once it ends */
function syncTrip(v: ExpView | null) {
  const tr = v?.me.trip ?? null, out = !!tr && tr.ends_at > Date.now();
  if (out && !away) {
    away = true;
    if (game?.kind === "memory") endGame();             // a trip starting ends the memory game (issue #59)
    if (state === "walking" || state === "falling" || state === "held") { vx = vy = 0; y = groundY(); place(); state = "idle"; }
    document.body.classList.add("away");
  } else if (!out && away) {
    away = false;
    document.body.classList.remove("away");
    look.classList.remove("leaving");
    look.classList.add("landing");
    setTimeout(() => look.classList.remove("landing"), 800);
    if (tr) { state = "acting"; busyUntil = Date.now() + 3000; play("happy"); }
  }
  awayTag.hidden = !out;
  if (out) awayTag.textContent = `🧭 ${placeName(v, tr!.place)} · ${span(tr!.ends_at - Date.now())}`;
  gift.hidden = !(tr && !out);
  if (tr && !out) {
    let told: number | null = null;
    try { told = Number(localStorage.getItem(NOTIFIED)) || null; } catch { /* private */ }
    if (told !== tr.id) {
      try { localStorage.setItem(NOTIFIED, String(tr.id)); } catch { /* private */ }
      const where = placeName(v, tr.place);
      say(t("x.backBubble", { place: where }), 8000);
      notify(t("x.backNote", { place: where }));
      addNote({ at: Date.now(), text: t("x.backNote", { place: where }), mood: "happy", fly: prefs().fly });
    }
  }
}
const expeditions = setupExpeditions({
  changed: (v) => { dress(v); syncTrip(v); },
  left: (where, ms) => {
    // it flies up and away; the chat closes so you see it go
    closeTalk();
    say(t("x.leftBubble", { place: placeName(expeditions.view(), where), time: span(ms) }), 5000);
    play("wave");
    away = true;                                       // still for the take-off; the pill shows once it's gone
    look.classList.add("leaving");
    setTimeout(() => { away = false; look.classList.remove("leaving"); syncTrip(expeditions.view()); }, 1200);
  },
  claimed: () => { gift.hidden = true; talk.refresh(); },
  fed: (xp) => {
    state = "acting"; busyUntil = Date.now() + 3000; play("eat");
    say(xp > 0 ? t("x.fedSay", { n: xp }) : t(FEED_LINES[Math.floor(Math.random() * FEED_LINES.length)]), 3000);
  },
  swat: () => swatGame(),
  memory: () => memoryGame(),
  focus: () => focusStart(),
  onSignedOut: () => { closeTalk(); native?.openPanel(); },
});
// the countdown on the pill, and the moment it's back
setInterval(() => { if (expeditions.view()?.me.trip && !look.classList.contains("leaving")) syncTrip(expeditions.view()); }, 1000);
const talk = setupTalk(talkBox, { onClose: () => closeTalk(), onSignedOut: () => { closeTalk(); native?.openPanel(); },
  coach: (q?: string) => coach.hint(q), coachMode: () => coach.toggle(), coachOn: () => coach.isOn(), exp: expeditions });
// the game coach (src/coach.ts): looks at the picked game window, suggests in the bubble and in the chat
const coach = setupCoach({
  say: (text) => {
    sayCoach(text);
    if (!talking && (state === "idle" || state === "walking")) { state = "acting"; busyUntil = Date.now() + 2500; play("wave"); }
  },
  note: (text) => { addNote({ at: Date.now(), text, mood: "wave", fly: null }); talk.refresh(); },
  think: (on) => { if (on) sayCoach(t("c.thinking"), 20_000); },
  state: () => talk.refresh(),
});
const inside = (e: HTMLElement, cx: number, cy: number) => {
  if (e.hidden) return false;
  const r = e.getBoundingClientRect();
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
};
function openTalk(what?: string) {
  if (!signedIn() || prefs().fly == null) { native?.openPanel(); return; }
  if (!what && lootWaiting()) what = "exp";           // back from a trip: its finds first
  if (talking) { talk.open(what); return; }
  talking = true;
  if (state === "walking" || state === "falling" || state === "held") { vx = vy = 0; y = groundY(); }
  state = "acting"; busyUntil = Date.now() + 1500;
  play("wave");
  bubble.classList.remove("on");
  document.body.classList.add("talking");
  native?.frame(x + W / 2 - TALK_W / 2, y + H - TALK_H, TALK_W, TALK_H);
  native?.petFocus(true);
  talk.open(what);
}
function closeTalk() {
  if (!talking) return;
  talking = false;
  talk.close();
  document.body.classList.remove("talking");
  native?.petFocus(false);
  place();                                             // back to its own small window
  state = "idle"; restUntil = Date.now() + 3000;
  play("idle");
}

// ---- start -----------------------------------------------------------------------------------------------------
async function start() {
  // the native side starts with mining off and hears the owner's choice from here, at start and when settings change it
  const applyPrefs = () => {
    applyLang();
    native?.compute(prefs().mineOn, prefs().mineAnyTime);
  };
  applyPrefs();
  window.addEventListener("storage", applyPrefs);
  const res = await fetch("avatars/default/avatar.json");
  const a = await res.json();
  avatar = { base: "avatars/default/", moods: a.moods, anchors: { ...avatar.anchors, ...(a.anchors ?? {}) } };
  dress(expeditions.view());                         // the last look kept, before the server answers
  play("wave");
  fly.addEventListener("load", () => { drawHit = null; });

  await measure();
  x = clampX(prefs().homeX ?? floor.right - W - 40);
  home = x;
  y = groundY();
  place();
  state = "acting"; busyUntil = Date.now() + 4000;

  const p = prefs(), day = daysTogether(p.born, Date.now());
  say(day === 0 ? t("hello") : t("missed", { name: p.name, day: day + 1 }), 6000);

  setInterval(tick, FRAME_MS);
  setInterval(() => { drawHit = null; }, 500);        // GIFs move on; the mask follows
  setTimeout(() => { void pollFlies(); void pollPrice(); }, 2000);
  // always asks to sign in, then for the fly (2026-11-13): the pet's window opens until both are done
  if (!signedIn() || prefs().fly == null) setTimeout(() => native?.openPanel(), 1500);
  window.addEventListener("storage", () => talk.refresh());
  let followed = prefs().fly;
  window.addEventListener("storage", () => { if (prefs().fly !== followed) { followed = prefs().fly; void pollFlies(); } });
  setInterval(() => { void pollFlies(); }, POLL_MS);
  // expeditions: read at start, when the fly changes, and every few minutes (one small read)
  const expLoad = () => { if (signedIn() && prefs().fly != null) void expeditions.load(); };
  setTimeout(expLoad, 2500);
  setInterval(expLoad, 5 * 60_000);
  let expFly = prefs().fly;
  window.addEventListener("storage", () => { if (prefs().fly !== expFly) { expFly = prefs().fly; expLoad(); } });
  awayTag.addEventListener("click", () => openTalk("exp"));
  gift.addEventListener("click", () => openTalk("exp"));
  setInterval(() => { void pollPrice(); }, PRICE_MS);
  setInterval(() => { void measure(); }, 60_000);

  native?.onCursor((c) => {
    if (grab) return pass(false);
    pass(!(c.inside && (overFly(c.x, c.y) || inside(talkBox, c.x, c.y) || (bubble.classList.contains("on") && inside(bubble, c.x, c.y))
      || inside(awayTag, c.x, c.y) || inside(gift, c.x, c.y) || inside(focusTag, c.x, c.y)
      || memCards.some((mc) => inside(mc.el, c.x, c.y)))));   // a memory card catches the click, not the app behind
  });
  native?.onOpen((what) => openTalk(what === "exp" ? "exp" : undefined));
  bubble.addEventListener("click", () => openTalk());
  native?.onQuiet((on) => { setPrefs({ quiet: on }); });
  native?.onFeed(feed);
  // Escape ends the memory game (issue #59); focus time can't start mid-game, so it never interrupts one
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && game?.kind === "memory") endGame(); });
  // sitting on your windows: the native watcher runs only while the setting is on (Windows)
  native?.onPerch?.((w) => onFront(w));
  let perchOn: boolean | null = null;
  const perchSync = () => { const on = prefs().perch !== false && !prefs().quiet; if (on !== perchOn) { perchOn = on; native?.perch?.(on); if (!on) { front = null; perched = null; } } };
  perchSync();
  window.addEventListener("storage", perchSync);
  native?.onCoach((what) => { if (what === "toggle") coach.toggle(); else coach.hint(); });

  // in a dev browser: flypet.react("rugged", "...") acts anything out, flypet.memory() starts the memory game
  if (import.meta.env.DEV) Object.assign(window, { flypet: { react: (m: Mood, text: string) => react({ mood: m, text, notify: false }), feed, memory: () => memoryGame() } });
}
void start();
