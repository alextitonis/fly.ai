/**
 * Fly Race: six flies race down six lanes to a piece of fruit. Every leg each fly's own real connectome smells its
 * lane's fruit and its odour-driven descending neurons set how far it runs (readout.ts). The rules are game.ts.
 *
 * Two modes. Play for fun: the page draws fresh seeds, runs the six brains in a Web Worker (brain.worker.ts, never
 * on the main thread) and pays fun coins kept on this device. Play for $FLYAI: each bet is the player's own race
 * against the house, run by the server; this page shows its legs as they arrive (bet.ts). Both go through show(),
 * so they look the same, and a server race plays even if the brains can't load here.
 *
 * The brain work and the animation run side by side: the race's legs are pulled into a queue as the worker (or the
 * server) produces them, while the track tweens the flies through the legs already in hand.
 */
import { Cancelled, initBets, type BetRace } from "./bet.ts";
import { BET_TYPES, LANES, LEGS, betWon, deriveRng, multiplier, playRace, setupRace, type BetType, type Race, type RaceEvent } from "./game.ts";
import { connectomeBase, progress } from "../i18n.ts";
import { placeText, setupI18n, t } from "./i18n.ts";
import { COLORS, Track } from "./scene.ts";
import { esc, fmt, randomHex } from "../util.ts";

// the page's language first: every text below is in it
await setupI18n();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const goBtn = $<HTMLButtonElement>("go"), stakeEl = $<HTMLInputElement>("stake"), msgEl = $("msg"), statusEl = $("status");
const balanceEl = $("balance"), unitEl = $("bal-unit"), picksEl = $("picks"), podiumEl = $("podium"), metersEl = $("meters");
const modeFun = $<HTMLButtonElement>("mode-fun"), modeBet = $<HTMLButtonElement>("mode-bet");
const speedBtn = $<HTMLButtonElement>("speed"), soundBtn = $<HTMLButtonElement>("sound");
const typeBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-bet]")];

const say = (text: string, cls = "") => { msgEl.textContent = text; msgEl.className = cls; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** the house edge the pays show before the server says otherwise (the design: 5.7x a win, 1.9x a podium) */
const DEFAULT_EDGE = 0.05;

// ---- the brains (a Web Worker) -------------------------------------------------------------------------------
type BrainState = "loading" | "ready" | "failed";
let brainState: BrainState = "loading";
let worker: Worker | null = null;
let pending: { resolve: (n: number) => void; reject: (e: Error) => void } | null = null;

function brainFailed(): void {
  if (brainState === "failed") return;
  brainState = "failed";
  statusEl.textContent = t("race.status.error");
  pending?.reject(new Error(t("race.status.error")));
  pending = null;
  deck();
  if (mode === "fun" && !racing) say(t("race.msg.noBrain"), "bad");
}

try {
  worker = new Worker(new URL("./brain.worker.ts", import.meta.url), { type: "module" });
  const base = connectomeBase();
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "progress") statusEl.textContent = t("race.status.progress", { text: progress("race.status", m.text) });
    else if (m.type === "error") brainFailed();
    else if (m.type === "ready") {
      brainState = "ready";
      statusEl.textContent = t("race.status.ready", { n: Number(m.n).toLocaleString() });
      deck();
      if (mode === "fun" && !racing) say(t("race.msg.ready"));
    } else if (m.type === "spikes") {
      const p = pending;
      pending = null;
      p?.resolve(m.spikes);
    }
  };
  worker.onerror = () => brainFailed();
  worker.postMessage({ type: "load", base });
} catch {
  queueMicrotask(brainFailed);
}

/** game.ts LegBrain: one lane's brain for one leg, in the worker. */
function legBrain(lane: number, leg: number, intensity: number): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!worker || brainState !== "ready") { reject(new Error(t("race.status.error"))); return; }
    pending = { resolve, reject };
    worker.postMessage({ type: "leg", lane, leg, intensity });
  });
}

/** Races on this browser's brains: fresh brains from the race's seeds, then game.ts playRace. */
function localRace(race: Race, rng: () => number): AsyncGenerator<RaceEvent> {
  worker!.postMessage({ type: "table", seeds: race.seeds });
  return playRace(race, rng, legBrain);
}

/**
 * Pulls a race's events into a queue as fast as they come (the brains keep working) while the caller takes them
 * at the animation's pace. `waiting` tells whether the next event isn't here yet (the flies sniff meanwhile).
 */
function buffered<T>(src: AsyncIterable<T>) {
  const q: T[] = [];
  let done = false, err: unknown = null;
  const bell: { wake: (() => void) | null } = { wake: null };
  void (async () => {
    try { for await (const x of src) { q.push(x); bell.wake?.(); } } catch (e) { err = e; } finally { done = true; bell.wake?.(); }
  })();
  return {
    waiting: () => !q.length && !done,
    async next(): Promise<T | null> {
      for (;;) {
        if (q.length) return q.shift()!;
        if (err) throw err;
        if (done) return null;
        await new Promise<void>((r) => { bell.wake = r; });
        bell.wake = null;
      }
    },
  };
}

// ---- sound: tiny synth, nothing downloaded ---------------------------------------------------------------------
let audio: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem("fly-race-muted") === "1"; } catch { /* no storage */ }
function tone(freq: number, ms: number, gain: number, type: OscillatorType = "square", slide = 0): void {
  if (!audio || muted) return;
  const o = audio.createOscillator(), g = audio.createGain();
  const at = audio.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + ms / 1000);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(); o.stop(at + ms / 1000);
}
const sfx = {
  start: () => [392, 392, 784].forEach((f, k) => setTimeout(() => tone(f, k === 2 ? 320 : 120, 0.05), k * 380)),
  leg: () => tone(150, 420, 0.025, "sawtooth", 1.6),
  win: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, 170, 0.06), k * 120)),
  lose: () => [330, 262].forEach((f, k) => setTimeout(() => tone(f, 220, 0.04, "triangle"), k * 180)),
};
function showSound(): void { soundBtn.textContent = t(muted ? "race.deck.soundOff" : "race.deck.soundOn"); }
soundBtn.onclick = () => {
  muted = !muted;
  try { localStorage.setItem("fly-race-muted", muted ? "1" : "0"); } catch { /* no storage */ }
  showSound();
};
showSound();

// ---- the track, the picks and the meters ---------------------------------------------------------------------
const track = new Track($<HTMLCanvasElement>("track"));
track.legs = LEGS;
track.label = t("race.track.ready");

let pick = -1;
let bet: BetType = "win";
/** the flies on the cards: free play's next table, or a bet race's names once the server has seated them */
let names: string[] = [];

const cards = Array.from({ length: LANES }, (_, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pick";
  b.setAttribute("role", "radio");
  b.style.setProperty("--c", COLORS[i]);
  b.innerHTML = `<span class="ln"></span><span class="nm"></span><span class="yours"></span>`;
  b.querySelector(".ln")!.textContent = t("race.pick.lane", { n: i + 1 });
  b.querySelector(".yours")!.textContent = t("race.pick.yours");
  b.onclick = () => choose(i);
  picksEl.appendChild(b);
  return b;
});
const meters = Array.from({ length: LANES }, (_, i) => {
  const li = document.createElement("li");
  li.style.setProperty("--c", COLORS[i]);
  li.innerHTML = `<span class="dot"></span><span class="nm"></span><span class="n">0</span><span class="bar"><i></i></span>`;
  metersEl.appendChild(li);
  return { li, nm: li.querySelector(".nm") as HTMLElement, n: li.querySelector(".n") as HTMLElement, bar: li.querySelector("i") as HTMLElement };
});

function showNames(): void {
  cards.forEach((c, i) => {
    const nm = c.querySelector(".nm") as HTMLElement;
    nm.textContent = names[i] ?? t("race.pick.mystery");
    nm.classList.toggle("dim", !names[i]);
    c.setAttribute("aria-checked", String(i === pick));
    c.disabled = racing;
  });
  meters.forEach((m, i) => {
    m.nm.textContent = names[i] ?? t("race.pick.lane", { n: i + 1 });
    m.li.classList.toggle("mine", i === pick);
  });
  track.names = names;
  track.mine = pick;
  track.wake();
}

function choose(i: number): void {
  if (racing) return;
  pick = i;
  showNames();
  deck();
  if (msgEl.textContent === t("race.msg.pickFirst")) say(t("race.msg.ready"));
}
$("track").addEventListener("click", (e) => {
  const i = track.laneAt((e as MouseEvent).clientY);
  if (i >= 0) choose(i);
});

let meterMax = 40;
function setMeters(spikes: number[] | null): void {
  if (!spikes) {
    meterMax = 40;
    for (const m of meters) { m.n.textContent = "0"; m.bar.style.width = "0%"; m.li.classList.remove("fire"); }
    return;
  }
  meterMax = Math.max(meterMax, ...spikes);
  const top = Math.max(...spikes);
  spikes.forEach((s, i) => {
    meters[i].n.textContent = String(s);
    meters[i].bar.style.width = `${Math.min(100, (s / meterMax) * 100)}%`;
    meters[i].li.classList.toggle("fire", s === top && s > 0);
  });
}

function setBet(b: BetType): void {
  if (racing) return;
  bet = b;
  deck();
}
for (const b of typeBtns) b.onclick = () => setBet(b.dataset.bet as BetType);

speedBtn.onclick = () => {
  track.speed = track.speed === 1 ? 2 : 1;
  speedBtn.textContent = t(track.speed === 1 ? "race.deck.speedNormal" : "race.deck.speedFast");
};

// ---- showing a race (free or bet: the same show) -------------------------------------------------------------
let racing = false;
interface Shown { order: number[] }

/**
 * Shows a race from its events: each leg the flies sniff (while the brains work), then run to the leg's positions
 * as their meters fill; at the end the places and the podium. Returns the finishing order.
 */
async function show(events: AsyncIterable<RaceEvent>): Promise<Shown> {
  const box = $("track").parentElement!.getBoundingClientRect();
  if (box.top < 0 || box.bottom > innerHeight) $("track").parentElement!.scrollIntoView({ behavior: "smooth", block: "start" });
  podiumEl.hidden = true;
  track.reset();
  setMeters(null);
  track.label = t("race.track.ready");
  sfx.start();
  const q = buffered(events);
  await wait(1100 / track.speed);
  let order: number[] | null = null;
  for (let legNo = 0; ; legNo++) {
    if (q.waiting()) {
      track.sniffing = true;
      track.label = `${t("race.track.leg", { leg: Math.min(LEGS, legNo + 1), legs: LEGS })} · ${t("race.track.sniff")}`;
      track.wake();
    }
    const e = await q.next();
    track.sniffing = false;
    if (!e) break;
    if (e.type === "end") { order = e.order; break; }
    track.leg = e.leg;
    track.label = t("race.track.leg", { leg: e.leg + 1, legs: LEGS });
    setMeters(e.spikes);
    sfx.leg();
    // the brains' spikes as sparks over each fly's head through the leg
    const top = Math.max(1, ...e.spikes);
    const sparkle = setInterval(() => e.spikes.forEach((s, i) => { if (s > 0 && Math.random() < 0.35 + 0.6 * s / top) track.spikes(i, s / top); }), 120);
    try { await track.legTo(e.positions); } finally { clearInterval(sparkle); }
    await wait(220 / track.speed);
  }
  if (!order) throw new Error("the race ended without a finish");
  track.label = t("race.track.finish");
  track.finish(order);
  return { order };
}

/** The podium over the track: the top three, and this race's result for the player. */
function podium(order: number[], resultHtml: string, win: boolean): void {
  const top = order.slice(0, 3).map((lane, k) => `<span class="pl" style="--c:${COLORS[lane]}"><i>${placeText(k + 1)}</i><span class="dot"></span>${esc(names[lane] ?? t("race.pick.lane", { n: lane + 1 }))}</span>`).join("");
  podiumEl.innerHTML = `${top}<span class="res ${win ? "win" : "loss"}">${resultHtml}</span>`;
  podiumEl.hidden = false;
}

function resultLine(order: number[], p: number, won: boolean, amount: string): string {
  const name = names[p] ?? t("race.pick.lane", { n: p + 1 });
  return t(won ? "race.msg.won" : "race.msg.lost", { name, place: placeText(order.indexOf(p) + 1), amount });
}

// ---- free play's coins (this device only) ---------------------------------------------------------------------
const START_COINS = 1000;
const FUN_STAKES = [1, 2, 5, 10, 20, 50, 100, 250];
interface Fun { coins: number; races: number; wins: number; won: number }
const fun: Fun = (() => {
  const base = { coins: START_COINS, races: 0, wins: 0, won: 0 };
  try { return { ...base, ...JSON.parse(localStorage.getItem("fly-race") ?? "{}") }; } catch { return base; }
})();
const cents = (x: number) => Math.round(x * 100) / 100;
const coinText = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 2 });
function saveFun(): void {
  try { localStorage.setItem("fly-race", JSON.stringify(fun)); } catch { /* private mode: coins last the visit */ }
  $("fun-stats").textContent = t("race.fun.stats", { races: fun.races.toLocaleString(), wins: fun.wins.toLocaleString(), won: coinText(fun.won) });
}
const refillBtn = $<HTMLButtonElement>("refill");
refillBtn.textContent = t("race.fun.refill", { n: START_COINS.toLocaleString() });
refillBtn.onclick = () => {
  if (racing) return;
  fun.coins = Math.max(fun.coins, START_COINS);
  saveFun();
  deck();
  say(t("race.msg.ready"));
};

/** free play's next race: names, brain seeds and smells from a fresh random seed */
let freeRace: Race | null = null;
let freeRng: (() => number) | null = null;
async function newFreeRace(): Promise<void> {
  freeRng = await deriveRng(randomHex(), randomHex());
  freeRace = setupRace(freeRng);
  if (mode === "fun") { names = freeRace.names; showNames(); }
}

/** what a winning bet pays per coin staked: the server's pays when it has said, else the design's */
function mult(b: BetType): number {
  return bets?.config()?.mult?.[b] ?? multiplier(b, DEFAULT_EDGE);
}

// ---- modes -----------------------------------------------------------------------------------------------------
type Mode = "fun" | "bet";
let mode: Mode = "fun";
const stakes: Record<Mode, string> = { fun: "10", bet: "" };
try { if (localStorage.getItem("fly-race-mode") === "bet") mode = "bet"; } catch { /* no storage */ }

function setMode(m: Mode): void {
  if (racing) return;
  stakes[mode] = stakeEl.value;
  mode = m;
  try { localStorage.setItem("fly-race-mode", m); } catch { /* no storage */ }
  modeFun.setAttribute("aria-selected", String(m === "fun"));
  modeBet.setAttribute("aria-selected", String(m === "bet"));
  $("fun-card").hidden = m !== "fun";
  $("bet-card").hidden = m !== "bet";
  stakeEl.value = stakes[m] || bets.config()?.min_bet || "1";
  // free play shows its next flies; a bet race's flies are seated by the server after the bet
  names = m === "fun" && freeRace ? freeRace.names : [];
  podiumEl.hidden = true;
  track.reset();
  track.label = t("race.track.ready");
  setMeters(null);
  showNames();
  if (m === "fun") say(brainState === "failed" ? t("race.msg.noBrain") : t("race.msg.ready"), brainState === "failed" ? "bad" : "");
  else say(bets.blocked(stakeEl.value) ?? t("race.msg.ready"));
  deck();
  showRecent();
}
modeFun.onclick = () => setMode("fun");
modeBet.onclick = () => setMode("bet");

/** Redraws the balance, the pays, the stake and the buttons. */
function deck(): void {
  if (mode === "fun") {
    balanceEl.textContent = coinText(fun.coins);
    unitEl.textContent = t("race.deck.coins");
  } else {
    const b = bets?.balance();
    balanceEl.textContent = b == null ? "—" : fmt(b);
    unitEl.textContent = b == null ? t("race.deck.signedOut") : t("race.deck.flyai");
  }
  const busy = racing || !!bets?.verifying();
  for (const b of BET_TYPES) $(`mult-${b}`).textContent = `${mult(b)}x`;
  for (const b of typeBtns) { b.setAttribute("aria-checked", String(b.dataset.bet === bet)); b.disabled = busy; }
  const stake = Number(stakeEl.value);
  const total = stake > 0 ? stake * mult(bet) : 0;
  $("pays").textContent = t("race.deck.pays", { mult: mult(bet), total: mode === "fun" ? coinText(cents(total)) : `${fmt(total)} FLYAI` });
  goBtn.disabled = busy || (mode === "fun" ? brainState !== "ready" : bets?.state() !== "open");
  $<HTMLButtonElement>("stake-down").disabled = $<HTMLButtonElement>("stake-up").disabled = stakeEl.disabled = busy;
  modeFun.disabled = modeBet.disabled = busy;
  for (const c of cards) c.disabled = busy;
  const v = { win: mult("win"), podium: mult("podium") };
  $("bet-how2").innerHTML = t("race.bet.how2", v);
  $("terms-t2").textContent = t("race.terms.t2", v);
}
stakeEl.oninput = () => deck();

function stepStake(dir: 1 | -1): void {
  const v = Number(stakeEl.value) || 0;
  if (mode === "fun") {
    const i = FUN_STAKES.findIndex((s) => s >= v);
    const at = i < 0 ? FUN_STAKES.length - 1 : FUN_STAKES[i] === v ? i + dir : dir > 0 ? i : i - 1;
    stakeEl.value = String(FUN_STAKES[Math.max(0, Math.min(FUN_STAKES.length - 1, at))]);
  } else {
    const c = bets.config();
    const min = Number(c?.min_bet ?? 1), max = Number(c?.max_bet ?? 1e9);
    const nextV = dir > 0 ? (v > 0 ? v * 2 : min) : v / 2;
    stakeEl.value = String(Math.round(Math.max(min, Math.min(max, nextV)) * 100) / 100);
  }
  deck();
}
$("stake-down").onclick = () => stepStake(-1);
$("stake-up").onclick = () => stepStake(1);

// ---- recent races ------------------------------------------------------------------------------------------------
interface Recent { name: string; lane: number; bet: BetType; place: number; stake: number; payout: number }
const recent: Record<Mode, Recent[]> = { fun: [], bet: [] };
function showRecent(): void {
  const list = recent[mode];
  const money = (x: number) => (mode === "fun" ? coinText(x) : fmt(x));
  $("recent").innerHTML = list.length ? list.slice(0, 12).map((r) => `<li><span><span class="dot" style="--c:${COLORS[r.lane]}"></span>${esc(t("race.recent.row", {
    bet: t(`race.deck.${r.bet}`), name: r.name, place: placeText(r.place) }))}</span>
    <b class="${r.payout > 0 ? "up" : "down"}">${r.payout > 0 ? `+${money(r.payout)}` : `−${money(r.stake)}`}</b></li>`).join("")
    : `<li class="dim">${t("race.recent.none")}</li>`;
}
function addRecent(m: Mode, r: Recent): void {
  recent[m].unshift(r);
  if (recent[m].length > 30) recent[m].pop();
  showRecent();
}

// ---- a race ------------------------------------------------------------------------------------------------------
async function raceOnce(): Promise<void> {
  if (racing || bets.verifying()) return;
  if (pick < 0) { say(t("race.msg.pickFirst"), "bad"); return; }
  const raw = stakeEl.value.trim();
  const stake = Number(raw);
  if (mode === "fun") {
    if (brainState !== "ready") { say(t(brainState === "failed" ? "race.msg.noBrain" : "race.msg.brainLoading"), "bad"); return; }
    if (!(stake > 0) || !Number.isInteger(stake)) { say(t("race.msg.stakeBad"), "bad"); return; }
    if (stake > fun.coins) { say(t(fun.coins < 1 ? "race.msg.brokeFun" : "race.msg.broke"), "bad"); return; }
  } else {
    const why = bets.blocked(raw);
    if (why) { say(why, "bad"); return; }
  }
  if (!audio) { try { audio = new AudioContext(); } catch { audio = null; } }
  racing = true;
  deck();
  say(t("race.msg.racing"));
  try {
    if (mode === "fun") await raceFun(stake);
    else await bets.play(pick, bet, raw);
  } catch (err) {
    if (err instanceof Cancelled) say(t("race.msg.ready"));
    else say(t("race.msg.stuck", { error: String((err as Error).message) }), "bad");
    track.sniffing = false;
  } finally {
    racing = false;
    deck();
    showNames();
  }
}
goBtn.onclick = () => void raceOnce();

async function raceFun(stake: number): Promise<void> {
  if (!freeRace || !freeRng) await newFreeRace();
  const race = freeRace!, rng = freeRng!, p = pick, b = bet, m = mult(b);
  freeRace = freeRng = null;
  fun.coins = cents(fun.coins - stake);
  saveFun();
  deck();
  let order: number[];
  try {
    ({ order } = await show(localRace(race, rng)));
  } catch (err) {
    // the brains stopped mid-race: nothing is lost, the stake goes back
    fun.coins = cents(fun.coins + stake);
    saveFun();
    void newFreeRace();
    throw err;
  }
  const won = betWon(b, p, order);
  const payout = won ? cents(stake * m) : 0;
  fun.coins = cents(fun.coins + payout);
  fun.races++;
  if (won) { fun.wins++; fun.won = cents(fun.won + payout); }
  saveFun();
  const place = order.indexOf(p) + 1;
  addRecent("fun", { name: race.names[p], lane: p, bet: b, place, stake, payout });
  const line = resultLine(order, p, won, coinText(payout));
  podium(order, `${t(won ? (b === "win" ? "race.podium.yourWin" : "race.podium.yourPodium") : "race.podium.yourLoss", { place: placeText(place) })}<small>${won ? `+${coinText(payout)}` : `−${coinText(stake)}`}</small>`, won);
  say(line, won ? "win" : "");
  (won ? sfx.win : sfx.lose)();
  await newFreeRace();
  // the podium stays up; the next table's names are on the cards already
  names = race.names;
  showNames();
  setTimeout(() => { if (!racing && mode === "fun" && freeRace) { names = freeRace.names; showNames(); } }, 2500);
}

// ---- $FLYAI --------------------------------------------------------------------------------------------------------
const bets = initBets({
  busy: () => racing,
  changed: () => {
    if (mode === "bet" && !stakeEl.value && bets?.config()) stakeEl.value = bets.config()!.min_bet;
    deck();
  },
  /** a server race: its flies take the lanes, the player's pick and bet are the race's own */
  async show(race: BetRace, events: AsyncIterable<RaceEvent>): Promise<void> {
    const was = racing;
    racing = true;
    try {
      pick = race.pick;
      bet = race.bet;
      names = race.names;
      showNames();
      deck();
      say(t("race.msg.racing"));
      const { order } = await show(events);
      const won = betWon(race.bet, race.pick, order);
      const stake = Number(race.stake);
      const payout = won ? (Number(race.payout) > 0 ? Number(race.payout) : stake * mult(race.bet)) : 0;
      const place = order.indexOf(race.pick) + 1;
      addRecent("bet", { name: race.names[race.pick], lane: race.pick, bet: race.bet, place, stake, payout });
      podium(order, `${t(won ? (race.bet === "win" ? "race.podium.yourWin" : "race.podium.yourPodium") : "race.podium.yourLoss", { place: placeText(place) })}${won
        ? `<small class="betwin">${t("race.bet.toBalance", { amount: fmt(payout) })}</small>` : `<small class="betloss">−${fmt(stake)} FLYAI</small>`}`, won);
      say(resultLine(order, race.pick, won, `${fmt(payout)} FLYAI`), won ? "win" : "");
      (won ? sfx.win : sfx.lose)();
    } finally {
      racing = was;
      deck();
    }
  },
  /** replays a finished race on this browser's own brains, leg by leg, to check the server's */
  async replay(race: Race, rng: () => number, onEvent: (e: RaceEvent) => boolean): Promise<boolean> {
    for await (const e of localRace(race, rng)) if (!onEvent(e)) return false;
    return true;
  },
  brainState: () => brainState,
});

await newFreeRace();
saveFun();
showRecent();
setMode(mode);
if (import.meta.env.DEV) (window as unknown as { race: unknown }).race = { fun, track, recent, brain: () => brainState };
