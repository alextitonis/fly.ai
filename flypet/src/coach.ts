// The game coach on the pet (flytrade/COACH-PLAN.md, 2026-11-14, the user: "if you are playing a game, it can start trying
// to help you play or suggest stuff" - "a coach, not play"; "enable it and disable so it works throughout the session";
// "make sure we don't lag the pc"). The fly LOOKS at one game window the player picked and SUGGESTS in its bubble. Nothing
// here sends a key, a click or anything else to a game.
//
//   hint   (Alt+Shift+C, the menu, or the chat's 🎮 chip): one frame, one answer. Free: a few a day (the server counts)
//   watch  (Coach mode, the pass): the window is watched all session; the fly speaks up when a choice opens
//
// Kept light (under ~2% CPU, no extra process): one window stream at most 1 frame a second, each frame shrunk to 64×36
// grey and compared with the last (microseconds); a full JPEG is made only when the screen changed a lot and then settled,
// in a worker (coachworker.ts); nothing runs while the user is away; the app reads its own CPU and slows the looking down
// (1 s → 2 s → 5 s) when it works too hard. Frames go to the coach server only, and it doesn't keep them.
import { t } from "./i18n.ts";
import { CoachRefused, coachGames, coachHint, prefs, setPrefs, SignedOut, type CoachAnswer, type CoachGames, type CoachSource } from "./store.ts";

const native = window.flyNative;
const TINY_W = 64, TINY_H = 36, SEND_MAX = 1280;
const PERIODS = [1000, 2000, 5000];                 // the look rate, slowed while the app works too hard
const CPU_HIGH = 12, CPU_LOW = 5;                   // percent of one core, the whole app
const LOAD_MS = 10_000, IDLE_S = 120;
const WATCH_GAP_MS = 20_000;                        // the server's own gap too
const CHANGED = 14, SETTLED = 2.5, BLACK = 4;       // mean difference / brightness on 0-255

export interface CoachHooks { say(text: string): void; note(text: string): void; think(on: boolean): void; state?(on: boolean): void }

// ---- finding the game window by itself (2026-11-14, the user: "shouldn't it automatically select?") -----------------------
// The open windows (program, title, install folder: main.ts coach-detect) against the coach's game list, here on the PC:
//   3  a game the coach knows (its program, or a learned one's key)    2  a known game's title pattern
//   1  a program installed in a game library (Steam, Epic, Riot, Battle.net, GOG, Xbox, EA, Ubisoft)
// The best wins; nothing found: the picker, once.
const GAME_DIRS = /\\steamapps\\common\\|\\epic games\\|\\riot games\\|battle\.net|\\gog galaxy\\games\\|\\gog games\\|\\xboxgames\\|\\ea games\\|ubisoft game launcher\\games|\\games\\/i;
const LAUNCHERS = /^(steam|steamwebhelper|epicgameslauncher|riotclientux|riotclientservices|battle\.net|galaxyclient|eadesktop|origin|upc|ubisoftconnect|xboxapp|gamebar|launcher)\.exe$/i;
type Win = { id: string; name: string; process: string | null; path: string | null };
const learnKey = (process: string | null, title: string) => {
  const proc = (process ?? "").trim().toLowerCase();
  if (proc) return proc;
  const ttl = title.trim().toLowerCase().replace(/[\d.]+/g, "").replace(/\s+/g, " ").replace(/^[\s\-|:]+|[\s\-|:]+$/g, "");
  return ttl.length >= 3 ? `title:${ttl}` : null;
};
export function pickGame(wins: Win[], list: CoachGames): { win: Win; name: string | null } | null {
  let best: { win: Win; name: string | null; score: number } | null = null;
  for (const w of wins) {
    const proc = (w.process ?? "").toLowerCase(), title = w.name.toLowerCase();
    let score = 0, name: string | null = null;
    for (const g of list.games) {
      if (proc && g.process.includes(proc)) { score = 3; name = g.name; break; }
      if (g.title && score < 2) { try { if (new RegExp(g.title).test(title)) { score = 2; name = g.name; } } catch { /* a bad pattern */ } }
    }
    if (score < 3) {
      const key = learnKey(w.process, w.name), l = key ? list.learned.find((x) => x.key === key) : null;
      if (l) { score = 3; name = l.name; }
    }
    if (!score && w.path && GAME_DIRS.test(w.path) && !LAUNCHERS.test(proc)) score = 1;
    if (score && (!best || score > best.score)) best = { win: w, name, score };
  }
  return best ? { win: best.win, name: best.name } : null;
}
export interface Coach { toggle(): void; hint(question?: string): void; isOn(): boolean; picked(): boolean }

export function setupCoach(hooks: CoachHooks): Coach {
  let on = false, stream: MediaStream | null = null, video: HTMLVideoElement | null = null, opening: Promise<boolean> | null = null;
  let timer = 0, loadTimer = 0, level = 0, away = false, inFlight = false;
  let prev: Uint8ClampedArray | null = null, base: Uint8ClampedArray | null = null, firstLook = false, blackRun = 0, toldBlack = false;
  let lastSent = 0, session = "", sessionAt = 0, pending: "on" | "hint" | null = null, pendingQ: string | undefined;
  const tiny = new OffscreenCanvas(TINY_W, TINY_H).getContext("2d", { willReadFrequently: true })!;
  let worker: Worker | null = null, jobs = 0, sentToPass = false;
  const waiting = new Map<number, (r: { jpeg?: string; error?: string }) => void>();

  /** the game window, found by itself (and saved, like a pick): true when there is one to look at */
  async function ensureSource(tell: boolean): Promise<boolean> {
    if (native?.coachDetect) {
      try {
        const found = pickGame(await native.coachDetect(), await coachGames());
        if (found) {
          const src: CoachSource = { id: found.win.id, name: found.win.name, process: found.win.process };
          if (src.id !== prefs().coachSource?.id) {
            pickedId = src.id;                                  // our own pick: the storage listener leaves it be
            setPrefs({ coachSource: src });
            if (tell) hooks.say(t("c.found", { game: (found.name ?? found.win.name).slice(0, 40) }));
          }
          return true;
        }
      } catch (e) { console.error("coach detect:", e); }
    }
    return !!prefs().coachSource && !!(await findSource());
  }

  // ---- the window stream ----------------------------------------------------------------------------------------------
  async function findSource(): Promise<CoachSource | null> {
    const src = prefs().coachSource;
    if (!src || !native) return src;
    // a restarted game gets a new window id: find it again by its title
    const now = await native.coachSources().catch(() => []);
    if (now.some((s) => s.id === src.id)) return src;
    const same = now.find((s) => s.name === src.name);
    return same ? { ...src, id: same.id } : null;
  }
  function open(): Promise<boolean> {
    if (stream) return Promise.resolve(true);
    opening ??= (async () => {
      const src = await findSource();
      if (!src) return false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
          chromeMediaSource: "desktop", chromeMediaSourceId: src.id, maxWidth: SEND_MAX, maxHeight: SEND_MAX, maxFrameRate: 1 } } as any });
        video = document.createElement("video");
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        stream.getVideoTracks()[0]?.addEventListener("ended", () => { close(); if (on) { stop(true); void start(); } });
        return true;
      } catch (e) {
        console.error("coach stream:", e);
        close();
        return false;
      }
    })().finally(() => { opening = null; });
    return opening;
  }
  function close() {
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
    if (video) { video.srcObject = null; video = null; }
  }
  const frameReady = () => !!video && video.readyState >= 2 && video.videoWidth > 0;
  async function waitFrame(ms = 3000) {
    const until = Date.now() + ms;
    while (!frameReady() && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    return frameReady();
  }

  // ---- looking: a 64×36 grey copy, compared with the last one and with the last one sent -------------------------------
  async function tinyFrame(): Promise<Uint8ClampedArray | null> {
    if (!frameReady()) return null;
    const bmp = await createImageBitmap(video!, { resizeWidth: TINY_W, resizeHeight: TINY_H, resizeQuality: "low" });
    tiny.drawImage(bmp, 0, 0);
    bmp.close();
    const px = tiny.getImageData(0, 0, TINY_W, TINY_H).data, grey = new Uint8ClampedArray(TINY_W * TINY_H);
    for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = (px[i]! * 3 + px[i + 1]! * 6 + px[i + 2]!) / 10;
    return grey;
  }
  const meanDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!); return s / a.length; };
  const mean = (a: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]!; return s / a.length; };

  async function look() {
    if (!on) return;
    try {
      if (away || inFlight) return;
      const g = await tinyFrame();
      if (!g) return;
      // exclusive full screen hands window capture a black picture
      if (mean(g) < BLACK) { if (++blackRun === 5 && !toldBlack) { toldBlack = true; hooks.say(t("c.black")); } return; }
      blackRun = 0;
      const settled = prev ? meanDiff(g, prev) < SETTLED : false;
      prev = g;
      const changed = firstLook || !base || meanDiff(g, base) > CHANGED;
      if (settled && changed && Date.now() - lastSent >= WATCH_GAP_MS) {
        base = g;
        firstLook = false;
        await send("watch");
      }
    } finally {
      if (on) timer = window.setTimeout(() => void look(), PERIODS[level]);
    }
  }

  // ---- sending one frame -------------------------------------------------------------------------------------------------
  function encode(bitmap: ImageBitmap): Promise<string> {
    worker ??= new Worker(new URL("./coachworker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const f = waiting.get(e.data.id); waiting.delete(e.data.id); f?.(e.data); };
    const id = ++jobs;
    return new Promise((resolve, reject) => {
      waiting.set(id, (r) => (r.jpeg ? resolve(r.jpeg) : reject(new Error(r.error ?? "encode failed"))));
      worker!.postMessage({ id, bitmap }, [bitmap]);
    });
  }
  async function send(mode: "hint" | "watch", question?: string): Promise<CoachAnswer | null> {
    if (!frameReady()) return null;
    inFlight = true;
    lastSent = Date.now();
    if (mode === "hint") hooks.think(true);
    try {
      const jpeg = await encode(await createImageBitmap(video!));
      const src = prefs().coachSource;
      const r = await coachHint({ image: jpeg, mode, process: src?.process, title: src?.name, question, note: prefs().coachNote || undefined,
        lang: prefs().lang ?? navigator.language, ...(mode === "watch" ? { session, session_s: Math.round((Date.now() - sessionAt) / 1000) } : {}) });
      if (r.say) { hooks.say(r.say); hooks.note(`🎮 ${r.say}`); }
      else if (mode === "hint") hooks.say(t("c.nothing"));
      if (mode === "hint" && r.free_left != null) hooks.note(`🎮 ${t("c.freeLeft", { n: r.free_left })}`);
      return r;
    } catch (e) {
      if (e instanceof SignedOut) { stop(); native?.openPanel(); }
      else if (e instanceof CoachRefused) {
        // no pass for Coach mode, testing only, the day's free hints used: say why, once; watching stops
        if (mode === "watch" || e.status === 403) stop();
        hooks.say(e.message);
        // no pass or its hours used: the page to get one, once a session (it isn't a link in the bubble)
        if (e.status === 402 && !sentToPass) { sentToPass = true; void native?.openUrl("https://www.flyaiworld.com/traderflies/coach"); }
      } else if (mode === "hint") hooks.say(t("c.failed"));
      console.error("coach:", e);
      return null;
    } finally {
      inFlight = false;
      if (mode === "hint") hooks.think(false);
    }
  }

  // ---- the app's own load and the user's presence: slow down, or rest ------------------------------------------------
  async function checkLoad() {
    if (!native) return;
    const l = await native.coachLoad().catch(() => null);
    if (!l) return;
    away = l.idle >= IDLE_S;
    const was = level;
    if (l.cpu > CPU_HIGH && level < PERIODS.length - 1) level++;
    else if (l.cpu < CPU_LOW && level > 0) level--;
    if (level !== was) console.info(`coach: looking every ${PERIODS[level]! / 1000}s (app CPU ${l.cpu.toFixed(1)}%)`);
  }

  // ---- on / off ----------------------------------------------------------------------------------------------------------
  async function start() {
    if (!(await ensureSource(true))) { pending = "on"; hooks.say(t("c.notFound")); native?.openPanel("coach"); return; }
    if (!(await open())) { pending = "on"; hooks.say(t("c.lost")); native?.openPanel("coach"); return; }
    on = true;
    session = Math.random().toString(36).slice(2, 12);
    sessionAt = Date.now();
    prev = base = null; firstLook = true; blackRun = 0; toldBlack = false; level = 0;
    native?.coachState(true);
    hooks.state?.(true);
    hooks.say(t("c.on", { game: prefs().coachSource!.name.slice(0, 40) }));
    void checkLoad();
    loadTimer = window.setInterval(() => void checkLoad(), LOAD_MS);
    timer = window.setTimeout(() => void look(), 1500);
  }
  function stop(quiet = false) {
    const was = on;
    on = false;
    clearTimeout(timer); clearInterval(loadTimer);
    close();
    worker?.terminate(); worker = null;
    native?.coachState(false);
    hooks.state?.(false);
    if (was && !quiet) hooks.say(t("c.off"));
  }
  async function hint(question?: string) {
    if (inFlight) return;
    if (!stream && !(await ensureSource(false))) { pending = "hint"; pendingQ = question; hooks.say(t("c.notFound")); native?.openPanel("coach"); return; }
    const had = !!stream;
    if (!(await open()) || !(await waitFrame())) { hooks.say(t("c.lost")); pending = "hint"; pendingQ = question; native?.openPanel("coach"); return; }
    await send("hint", question);
    if (!had && !on) { close(); worker?.terminate(); worker = null; }      // a one-off look: nothing stays open
  }

  // picked in the pet's window (panel.ts): carry on with what was asked
  let pickedId = prefs().coachSource?.id ?? null;
  window.addEventListener("storage", () => {
    const id = prefs().coachSource?.id ?? null;
    if (id === pickedId) return;
    pickedId = id;
    if (on) { stop(); void start(); return; }                   // a new game window while on: look at that one
    const p = pending, q = pendingQ;
    pending = null; pendingQ = undefined;
    if (p === "on") void start(); else if (p === "hint") void hint(q);
  });

  return {
    toggle: () => { if (on) stop(); else void start(); },
    hint: (q?: string) => void hint(q),
    isOn: () => on,
    picked: () => !!prefs().coachSource,
  };
}
