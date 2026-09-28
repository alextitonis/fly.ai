/**
 * Fly Roulette: flies pass a toy cap gun around a table. Each fly's real connectome decides whether it squeezes
 * the trigger or flies off; the drum decides the rest. Last fly at the table wins. The rules are game.ts.
 *
 * Free play runs the brains here (brain.worker.ts). A bet game is played by the server and this page shows its
 * turns (bet.ts); both go through show(), so they look the same.
 */
import { initBets } from "./bet.ts";
import { deriveRng, playGame, setup, type GameEvent, type Table } from "./game.ts";
import { anyPop, setupI18n, t } from "./i18n.ts";
import { READOUT } from "./readout.ts";
import { Stage, type Seat } from "./scene.ts";

// the page's language first: every text below is in it
await setupI18n();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status"), tagsEl = $("tags"), logEl = $("log"), startBtn = $<HTMLButtonElement>("start");
const speedBtn = $<HTMLButtonElement>("speed"), soundBtn = $<HTMLButtonElement>("sound"), sizeSel = $<HTMLSelectElement>("size");
const meterName = $("meter-name"), wingBar = $("wing-bar"), gripBar = $("grip-bar"), wingNum = $("wing-num"), gripNum = $("grip-num");
const gfNum = $("gf-num"), verdictEl = $("verdict"), bannerEl = $("banner"), pickHint = $("pick-hint");
const tallyEl = $("tally");
for (const o of sizeSel.options) o.textContent = t("roulette.controls.flies", { count: Number(o.value) });

// one colour per seat, up to the 10 a table takes
const COLORS = ["#e0342c", "#3d8bff", "#ffc83d", "#3ddc84", "#c46bff", "#ff8a1f", "#ff6fb5", "#6cc4d8", "#a0e05a", "#f5f5f5"];

// ---- the brain ------------------------------------------------------------------------------------------
const worker = new Worker(new URL("./brain.worker.ts", import.meta.url), { type: "module" });
const base = new URL(import.meta.env.DEV ? `${import.meta.env.BASE_URL}connectome/` : "/simulation/connectome/", location.href).href;
let brainReady = false;
type Counts = { wing: number; grip: number; gf: number };
type Decided = Counts & { choice: "fly" | "pull" };
let onStep: ((c: Counts & { t: number }) => void) | null = null;
let onDecided: ((c: Decided) => void) | null = null;

worker.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "progress") statusEl.textContent = t("roulette.status.progress", { text: progressText(m.text) });
  else if (m.type === "error") statusEl.textContent = t("roulette.status.error", { text: m.text });
  else if (m.type === "ready") {
    brainReady = true;
    statusEl.textContent = t("roulette.status.ready", { n: m.n.toLocaleString() });
    startBtn.disabled = playing;
    bets.changed();
  } else if (m.type === "step") onStep?.(m);
  else if (m.type === "decided") onDecided?.(m);
};
worker.postMessage({ type: "load", base });

/** The worker's progress ("fly brain 40 / 210 MB") in the page's language. */
function progressText(text: string): string {
  if (text === "wiring 25 M synapses") return t("roulette.status.wiring");
  return text.replace(/^labels/, t("roulette.status.labels")).replace(/^fly brain/, t("roulette.status.brain"));
}

function brainTurn(fly: number, chamber: number, live: (c: Counts & { t: number }) => void): Promise<Decided> {
  return new Promise((resolve) => {
    onStep = live;
    onDecided = (c) => { onStep = onDecided = null; resolve(c); };
    worker.postMessage({ type: "turn", fly, chamber });
  });
}

// ---- sound: tiny synth, nothing downloaded ---------------------------------------------------------------
let audio: AudioContext | null = null;
let muted = false;
function noise(ms: number, gain: number, filter: number, type: BiquadFilterType = "lowpass"): void {
  if (!audio || muted) return;
  const n = Math.round(audio.sampleRate * ms / 1000);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = type; f.frequency.value = filter;
  const g = audio.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
function tone(freq: number, ms: number, gain: number, slide = 0): void {
  if (!audio || muted) return;
  const o = audio.createOscillator(), g = audio.createGain();
  const t = audio.currentTime;
  o.type = "square";
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + ms / 1000);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(); o.stop(t + ms / 1000);
}
const sfx = {
  spin: () => { for (let k = 0; k < 6; k++) setTimeout(() => noise(25, 0.25, 3000, "highpass"), k * 70 / stage.speed); },
  click: () => { noise(30, 0.5, 2500, "highpass"); tone(1800, 40, 0.05); },
  bang: () => { noise(450, 0.9, 900); tone(160, 350, 0.25, 0.3); setTimeout(() => tone(700, 120, 0.08, 1.6), 250); },
  whoosh: () => { noise(700, 0.35, 1200, "bandpass"); tone(220, 700, 0.04, 3); },
  win: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, 180, 0.06), k * 140)),
};

// ---- the table -------------------------------------------------------------------------------------------
const stage = new Stage($("stage"));
if (import.meta.env.DEV) (window as unknown as { stage: Stage }).stage = stage;   // for the headless checks
interface Player extends Seat { out: "" | "dead" | "chicken" }
let players: Player[] = [];
let champion = -1;
let playing = false;
/** free play's own table and generator (a fresh random seed per table) */
let freeTable: Table | null = null;
let freeRng: (() => number) | null = null;

const store = {
  get(): { games: number; wins: number; dead: number; chickens: number } {
    try { return { games: 0, wins: 0, dead: 0, chickens: 0, ...JSON.parse(localStorage.getItem("fly-roulette") ?? "{}") }; }
    catch { return { games: 0, wins: 0, dead: 0, chickens: 0 }; }
  },
  add(k: "games" | "wins" | "dead" | "chickens", n = 1): void {
    const s = store.get();
    s[k] += n;
    try { localStorage.setItem("fly-roulette", JSON.stringify(s)); } catch { /* private mode: no tally */ }
    showTally();
  },
};
function showTally(): void {
  const s = store.get();
  tallyEl.textContent = s.games
    ? `${t("roulette.tally.games", { count: s.games })} · ${t("roulette.tally.rest", { wins: s.wins, dead: s.dead, chickens: s.chickens })}` : "";
}

const randomHex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Seats a table: these names, a colour per seat. Keeps the backed seat if it still exists. */
function seatTable(names: string[], keepChampion = false): void {
  players = names.map((name, i) => ({ name, color: COLORS[i % COLORS.length], out: "" }));
  if (!keepChampion || champion >= names.length) champion = -1;
  stage.seat(players);
  tagsEl.querySelectorAll(".tag").forEach((t) => t.remove());
  players.forEach((p, i) => {
    const tag = document.createElement("button");
    tag.className = "tag";
    tag.style.setProperty("--c", p.color);
    tag.innerHTML = `<span class="nm"></span><span class="st"></span>`;
    tag.querySelector(".nm")!.textContent = p.name;
    tag.onclick = () => choose(i);
    tagsEl.appendChild(tag);
  });
  logEl.innerHTML = "";
  bannerEl.hidden = true;
  pickHint.hidden = champion >= 0;
  meterName.textContent = t("roulette.meter.nobodyYet");
  setMeter({ wing: 0, grip: 0, gf: 0 });
  verdictEl.textContent = "";
  refreshTags();
}

/** A new free-play table: its names, brain seeds and first shooter come from a fresh random seed. */
async function newTable(): Promise<void> {
  freeRng = await deriveRng(randomHex(), "free play");
  freeTable = setup(Number(sizeSel.value), freeRng);
  seatTable(freeTable.names, false);
  worker.postMessage({ type: "table", seeds: freeTable.seeds });
}

function choose(i: number): void {
  if (playing) return;
  champion = champion === i ? -1 : i;
  pickHint.hidden = champion >= 0;
  if (champion === i) { stage.cheer(i); pop(i, t("roulette.pop.pickMe"), "cheer"); }
  refreshTags();
  bets.changed();
}

function refreshTags(turn = -1): void {
  [...tagsEl.querySelectorAll(".tag")].forEach((el, i) => {
    const p = players[i];
    el.classList.toggle("mine", i === champion);
    el.classList.toggle("turn", i === turn);
    el.classList.toggle("out", !!p.out);
    el.querySelector(".st")!.textContent = p.out === "dead" ? t("roulette.tag.rip") : p.out === "chicken" ? t("roulette.tag.chicken") : i === champion ? t("roulette.tag.yours") : "";
  });
}

let tagsAt = -1;
function placeTags(): void {
  // only after the scene drew a new frame (30-60 a second), not on every screen refresh: each move reads the layout
  if (stage.drawn === tagsAt) { requestAnimationFrame(placeTags); return; }
  tagsAt = stage.drawn;
  [...tagsEl.querySelectorAll(".tag")].forEach((el, i) => {
    const pos = stage.screenPos(i);
    if (!pos) return;
    const half = (el as HTMLElement).offsetWidth / 2 + 6;         // keep edge seats' tags inside the frame
    const x = Math.min(tagsEl.clientWidth - half, Math.max(half, pos.x));
    (el as HTMLElement).style.transform = `translate(${x}px, ${pos.y}px) translate(-50%, -100%)`;
  });
  requestAnimationFrame(placeTags);
}
requestAnimationFrame(placeTags);

$("stage").addEventListener("click", (e) => {
  const i = stage.pick(e.clientX, e.clientY);
  if (i >= 0) choose(i);
});

/** A cartoon word that pops out over a fly's head and floats away. */
function pop(i: number, text: string, cls = ""): void {
  const pos = stage.screenPos(i);
  if (!pos) return;
  const el = document.createElement("div");
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${Math.min(tagsEl.clientWidth - 50, Math.max(50, pos.x))}px`;
  el.style.top = `${pos.y - 28}px`;
  el.style.setProperty("--tilt", `${(Math.random() - 0.5) * 16}deg`);
  el.style.animationDuration = `${1.4 / stage.speed}s`;
  tagsEl.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

function log(html: string, cls = ""): void {
  const li = document.createElement("li");
  li.innerHTML = html;
  if (cls) li.className = cls;
  logEl.prepend(li);
  while (logEl.children.length > 40) logEl.lastChild!.remove();
}
const who = (i: number) => `<b style="color:${players[i].color}">${escapeHtml(players[i].name)}</b>`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);

function setMeter(c: Counts): void {
  const wingPct = Math.min(100, (c.wing / (READOUT.wingBail * 1.6)) * 100);
  wingBar.style.width = `${wingPct}%`;
  wingBar.classList.toggle("hot", c.wing >= READOUT.wingBail);
  gripBar.style.width = `${Math.min(100, (c.grip / 160) * 100)}%`;
  wingNum.textContent = String(c.wing);
  gripNum.textContent = String(c.grip);
  gfNum.textContent = String(c.gf);
}

// ---- showing a game --------------------------------------------------------------------------------------
/** The gun goes to a fly and it starts to sweat. */
async function turnStarts(i: number): Promise<void> {
  refreshTags(i);
  meterName.textContent = players[i].name;
  verdictEl.textContent = t("roulette.meter.thinking");
  verdictEl.className = "";
  setMeter({ wing: 0, grip: 0, gf: 0 });
  await stage.gunTo(i);
  pop(i, anyPop("nervous"), "nervous");
}

/** For a turn worked out elsewhere (the server): the meters fill to its counts as if live. */
async function replayMeters(i: number, c: Counts): Promise<void> {
  await stage.tween(900, (p) => {
    const k = Math.min(1, p * 1.1);
    const now = { wing: Math.round(c.wing * k), grip: Math.round(c.grip * k), gf: Math.round(c.gf * k) };
    setMeter(now);
    stage.nerves(i, now.wing / READOUT.wingBail);
  });
}

/** What happened on a turn: fly off, click or bang. */
async function turnEnds(e: Extract<GameEvent, { type: "turn" }>): Promise<void> {
  const i = e.fly, p = players[i];
  setMeter(e);
  const left = 6 - e.chamber;
  const odds = t("roulette.log.chambersLeft", { count: left });
  if (e.outcome === "fly") {
    verdictEl.textContent = t("roulette.meter.flewOff");
    verdictEl.className = "fly";
    sfx.whoosh();
    pop(i, anyPop("chicken"), "chicken");
    p.out = "chicken";
    log(t("roulette.log.chickened", { who: who(i), odds, wing: e.wing }), "chicken");
    await stage.flyAway(i);
    await stage.gunHomeAgain();
  } else if (e.outcome === "bang") {
    verdictEl.textContent = t("roulette.meter.squeezed");
    verdictEl.className = "pull";
    sfx.bang();
    pop(i, t("roulette.pop.bang"), "bang");
    p.out = "dead";
    log(t("roulette.log.bang", { who: who(i), grip: e.grip }), "dead");
    await stage.bang(i);
    stage.grave(i, p.name);
    await stage.gunHomeAgain();
    if (e.reload) {
      log(t("roulette.log.reload"));
      sfx.spin();
      await stage.spinDrum(2.5);
    }
  } else {
    verdictEl.textContent = t("roulette.meter.squeezed");
    verdictEl.className = "pull";
    sfx.click();
    pop(i, t("roulette.pop.click"), "click");
    setTimeout(() => pop(i, anyPop("phew"), "phew"), 450 / stage.speed);
    log(t("roulette.log.click", { who: who(i), odds, grip: e.grip, wing: e.wing }));
    await stage.click(i);
    sfx.spin();
    await stage.spinDrum(1 / 6);
  }
  refreshTags();
}

async function gameStarts(): Promise<void> {
  // on a phone the buttons sit below the table: bring the table back into view
  const box = $("stage").parentElement!.getBoundingClientRect();
  if (box.top < 0 || box.bottom > innerHeight) $("stage").parentElement!.scrollIntoView({ behavior: "smooth", block: "start" });
  pickHint.hidden = true;
  bannerEl.hidden = true;
  if (!audio) { try { audio = new AudioContext(); } catch { audio = null; } }
  log(t("roulette.log.start"));
  sfx.spin();
  await stage.spinDrum(2.5);
}

/** The last fly standing: the banner (with the bet's result, if any) and the crown. */
async function gameEnds(winner: number, extra = ""): Promise<void> {
  refreshTags();
  await stage.gunHomeAgain();
  sfx.win();
  log(t("roulette.log.win", { who: who(winner) }), "win");
  bannerEl.hidden = false;
  const name = (i: number) => escapeHtml(players[i].name);
  bannerEl.innerHTML = (winner === champion
    ? `${t("roulette.banner.yourWin")}<small>${t("roulette.banner.yourWinSub", { name: name(winner) })}</small>`
    : `${t("roulette.banner.wins", { name: name(winner) })}<small>${champion >= 0
      ? t(players[champion].out === "dead" ? "roulette.banner.champDead" : "roulette.banner.champFled", { name: name(champion) })
      : t("roulette.banner.pickNext")}</small>`) + extra;
  pop(winner, t("roulette.pop.winner"), "win");
  await stage.crown(winner);
  meterName.textContent = t("roulette.meter.nobody");
  verdictEl.textContent = "";
}

function busy(on: boolean): void {
  playing = on;
  startBtn.disabled = sizeSel.disabled = on || !brainReady;
  bets.changed();
}

// ---- free play -------------------------------------------------------------------------------------------
async function play(): Promise<void> {
  if (playing || !brainReady || !freeTable || !freeRng) return;
  busy(true);
  store.add("games");
  await gameStarts();
  const turn = async (i: number, chamber: number) => {
    await turnStarts(i);
    const [c] = await Promise.all([
      brainTurn(i, chamber, (s) => { setMeter(s); stage.nerves(i, s.wing / READOUT.wingBail); }),
      stage.wait(900),
    ]);
    return c;
  };
  for await (const e of playGame(freeTable, freeRng, turn)) {
    if (e.type === "turn") {
      await turnEnds(e);
      if (e.outcome === "fly") store.add("chickens");
      if (e.outcome === "bang") store.add("dead");
    } else {
      if (e.winner === champion) store.add("wins");
      await gameEnds(e.winner);
    }
  }
  freeTable = null;
  busy(false);
  startBtn.textContent = t("roulette.controls.newTable");
  startBtn.dataset.fresh = "0";
}

startBtn.onclick = () => {
  if (startBtn.dataset.fresh === "0") {
    void newTable();
    startBtn.textContent = t("roulette.controls.spin");
    startBtn.dataset.fresh = "1";
    return;
  }
  void play();
};
sizeSel.onchange = () => {
  if (playing) return;
  void newTable();
  startBtn.textContent = t("roulette.controls.spin");
  startBtn.dataset.fresh = "1";
  bets.changed();
};
speedBtn.onclick = () => {
  stage.speed = stage.speed === 1 ? 2.5 : 1;
  speedBtn.textContent = t(stage.speed === 1 ? "roulette.controls.speedNormal" : "roulette.controls.speedFast");
};
soundBtn.onclick = () => {
  muted = !muted;
  soundBtn.textContent = t(muted ? "roulette.controls.soundOff" : "roulette.controls.soundOn");
};

// ---- bets: the panel gets the table and the show, the server gets the game --------------------------------
const bets = initBets({
  size: () => Number(sizeSel.value),
  champion: () => champion,
  playing: () => playing,
  names: () => players.map((p) => p.name),
  color: (seat: number) => COLORS[seat % COLORS.length],
  /** a server game: seat its table with the player's fly at the seat they backed, then show turns as they arrive */
  async show(names: string[], pick: number, events: AsyncIterable<GameEvent>, result: (winner: number) => string): Promise<void> {
    busy(true);
    try {
      champion = pick;
      seatTable(names, true);
      await stage.wait(900);
      await gameStarts();
      for await (const e of events) {
        if (e.type === "turn") {
          await turnStarts(e.fly);
          await replayMeters(e.fly, e);
          await turnEnds(e);
        } else {
          await gameEnds(e.winner, result(e.winner));
        }
      }
    } finally {
      busy(false);
      startBtn.textContent = t("roulette.controls.newTable");
      startBtn.dataset.fresh = "0";
    }
  },
  /** replays a finished game on this browser's own brains, turn by turn, to check the server's counts */
  async replay(table: Table, rng: () => number, onTurn: (e: GameEvent) => boolean): Promise<boolean> {
    worker.postMessage({ type: "table", seeds: table.seeds });
    let ok = true;
    for await (const e of playGame(table, rng, (i, chamber) => brainTurn(i, chamber, () => {}))) {
      if (!onTurn(e)) { ok = false; break; }
    }
    return ok;
  },
  brainReady: () => brainReady,
});

void newTable();
showTally();
startBtn.dataset.fresh = "1";
startBtn.disabled = true;
