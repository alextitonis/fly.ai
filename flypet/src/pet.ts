// The pet's window: plays the avatar's GIFs, walks along the bottom of the screen, can be grabbed and tossed, and acts out
// what the feeds say (gains, losses, buys and sells). See mood.ts for what makes it react.
import { t } from "./i18n.ts";
import { FEED_LINES, asleepAt, daysTogether, paceTarget, readFlies, readPrice, type Fly, type Mood, type Reaction } from "./mood.ts";
import { addNote, applyLang, flyFeed, prefs, priceSamples, publicFeed, seenOf, setPrefs, setPriceSamples, setSeen, signedIn, walletFeed } from "./store.ts";
import { setupTalk } from "./talk.ts";
import { setupCoach } from "./coach.ts";

const native = window.flyNative;                    // vite in a plain browser has no window to move
const fly = document.getElementById("fly") as HTMLImageElement;
const bubble = document.getElementById("bubble") as HTMLDivElement;

const W = 300, H = 300, SPRITE = 160;
const POLL_MS = 60_000, PRICE_MS = 5 * 60_000, FRAME_MS = 33;
const WALK_PX = 1.6, GRAVITY = 1.1, BOUNCE = 0.35;
const REACTION_MS = 5_000, QUEUE_MAX = 6;

// ---- the avatar: a folder of GIFs named by public/avatars/<id>/avatar.json; a mood it doesn't have plays idle ----
let avatar = { base: "avatars/default/", moods: {} as Partial<Record<Mood, string>> };
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
let floor = { left: 0, right: 1920, bottom: 1080 };

async function measure() {
  if (!native) return;
  const a = await native.workArea();
  floor = { left: a.x, right: a.x + a.width, bottom: a.y + a.height };
}
const place = () => native?.place(x, y);
const clampX = (v: number) => Math.min(floor.right - W / 2 - SPRITE / 2, Math.max(floor.left - W / 2 + SPRITE / 2, v));
const groundY = () => floor.bottom - H;
let home = 0;
function setHome(at: number) {
  home = at;
  setPrefs({ homeX: at });
}

function tick() {
  const now = Date.now();
  nextReaction(now);
  if (talking) return;                                 // it stays put under its chat
  if (state === "falling") {
    vy += GRAVITY; x = clampX(x + vx); y += vy;
    if (y >= groundY()) {
      y = groundY();
      if (vy > 6) { vy = -vy * BOUNCE; vx *= 0.6; } else { vx = vy = 0; state = "idle"; restUntil = now + 1500; setHome(x); play("idle"); }
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
  } else if (state === "idle" && now >= restUntil) {
    if (asleepAt(new Date().getHours())) { state = "sleeping"; play("sleep"); }
    else if (prefs().quiet || Math.random() < 0.4) restUntil = now + 8000 + Math.random() * 20000;
    else {
      targetX = paceTarget(home, x, Math.random(), clampX(-Infinity), clampX(Infinity));
      fly.classList.toggle("left", targetX < x);
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
  fly.setPointerCapture(e.pointerId);
  grab = { dx: e.screenX - x, dy: e.screenY - y, startX: e.screenX, startY: e.screenY, moved: false, lastX: e.screenX, lastY: e.screenY, lastAt: Date.now() };
});
fly.addEventListener("pointermove", (e) => {
  if (!grab) return;
  if (!grab.moved && Math.hypot(e.screenX - grab.startX, e.screenY - grab.startY) < 4) return;
  if (!grab.moved) { if (talking) closeTalk(); grab.moved = true; state = "held"; play("held"); }
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
}

// A transparent window still catches clicks, so it lets them through except over the fly's own pixels. The native side
// sends the cursor (electron/main.ts).
let drawHit: ImageData | null = null;
const probe = document.createElement("canvas");
probe.width = probe.height = SPRITE;
function overFly(cx: number, cy: number): boolean {
  const r = fly.getBoundingClientRect();
  const px = Math.floor(cx - r.left), py = Math.floor(cy - r.top);
  if (px < 0 || py < 0 || px >= SPRITE || py >= SPRITE) return false;
  if (!drawHit) {
    const c = probe.getContext("2d", { willReadFrequently: true })!;
    c.clearRect(0, 0, SPRITE, SPRITE);
    c.imageSmoothingEnabled = false;
    try { c.drawImage(fly, 0, 0, SPRITE, SPRITE); drawHit = c.getImageData(0, 0, SPRITE, SPRITE); } catch { return true; }
  }
  const sx = fly.classList.contains("left") ? SPRITE - 1 - px : px;
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
const talk = setupTalk(talkBox, { onClose: () => closeTalk(), onSignedOut: () => { closeTalk(); native?.openPanel(); },
  coach: (q?: string) => coach.hint(q) });
// the game coach (src/coach.ts): looks at the picked game window, suggests in the bubble and in the chat
const coach = setupCoach({
  say: (text) => {
    sayCoach(text);
    if (!talking && (state === "idle" || state === "walking")) { state = "acting"; busyUntil = Date.now() + 2500; play("wave"); }
  },
  note: (text) => { addNote({ at: Date.now(), text, mood: "wave", fly: null }); talk.refresh(); },
  think: (on) => { if (on) sayCoach(t("c.thinking"), 20_000); },
});
const inside = (e: HTMLElement, cx: number, cy: number) => {
  if (e.hidden) return false;
  const r = e.getBoundingClientRect();
  return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
};
function openTalk() {
  if (!signedIn() || prefs().fly == null) { native?.openPanel(); return; }
  if (talking) { talk.open(); return; }
  talking = true;
  if (state === "walking" || state === "falling" || state === "held") { vx = vy = 0; y = groundY(); }
  state = "acting"; busyUntil = Date.now() + 1500;
  play("wave");
  bubble.classList.remove("on");
  document.body.classList.add("talking");
  native?.frame(x + W / 2 - TALK_W / 2, y + H - TALK_H, TALK_W, TALK_H);
  native?.petFocus(true);
  talk.open();
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
  avatar = { base: "avatars/default/", moods: a.moods };
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
  setInterval(() => { void pollPrice(); }, PRICE_MS);
  setInterval(() => { void measure(); }, 60_000);

  native?.onCursor((c) => {
    if (grab) return pass(false);
    pass(!(c.inside && (overFly(c.x, c.y) || inside(talkBox, c.x, c.y) || (bubble.classList.contains("on") && inside(bubble, c.x, c.y)))));
  });
  native?.onOpen(() => openTalk());
  bubble.addEventListener("click", () => openTalk());
  native?.onQuiet((on) => { setPrefs({ quiet: on }); });
  native?.onFeed(feed);
  native?.onCoach((what) => { if (what === "toggle") coach.toggle(); else coach.hint(); });

  // in a dev browser: flypet.react("rugged", "...") acts anything out
  if (import.meta.env.DEV) Object.assign(window, { flypet: { react: (m: Mood, text: string) => react({ mood: m, text, notify: false }), feed } });
}
void start();
