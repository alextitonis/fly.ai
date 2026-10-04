/**
 * Fly Slots: a cartoon slot machine with a real fly brain beside the reels. The rules are game.ts: three reels from
 * one 32-stop strip, one payline, provably fair seeds, 94.95% back to the player.
 *
 * Two modes. Play for fun: the page draws a fresh random server + client seed per spin and pays fun coins kept on
 * this device. Play for $FLYAI: the server spins (bet.ts). Both land the reels the same way, one reel after another,
 * exactly on the spin's stops. The fly (fly.ts) reacts after the reels stop; it never changes a result.
 */
import { BIG, Fly } from "./fly.ts";
import { Cancelled, initBets, type BetSpin } from "./bet.ts";
import { PAYS, STRIP, deriveRng, rtp, spinWith, type Line, type Sym } from "./game.ts";
import { setupI18n, t } from "./i18n.ts";
import { fmt, randomHex } from "../util.ts";

// the page's language first: every text below is in it
await setupI18n();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const N = STRIP.length;
const spinBtn = $<HTMLButtonElement>("spin"), stakeEl = $<HTMLInputElement>("stake"), msgEl = $("msg");
const balanceEl = $("balance"), unitEl = $("bal-unit"), winEl = $("win"), machine = $("machine"), reelsEl = $("reels");
const autoLeftEl = $("auto-left"), autoStop = $<HTMLButtonElement>("auto-stop"), soundBtn = $<HTMLButtonElement>("sound");
const autoBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-auto]")];
const modeFun = $<HTMLButtonElement>("mode-fun"), modeBet = $<HTMLButtonElement>("mode-bet");

const icon = (s: Sym, cls = "") => `<svg viewBox="0 0 100 100" class="${cls}" aria-hidden="true"><use href="#s-${s}"/></svg>`;
const say = (text: string, cls = "") => { msgEl.textContent = text; msgEl.className = cls; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the reels ---------------------------------------------------------------------------------------------
/**
 * Each reel draws the strip three times over; `pos` is the strip index on the payline (a float while turning). The
 * strip is shifted so the stop above the line sits at the top of the window: --y = (pos mod 32) + 32 - 1 cells.
 */
class Reel {
  pos = 0;
  private v = 0;                                  // cells a second
  private land: { from: number; to: number; t0: number; d: number } | null = null;
  constructor(readonly el: HTMLElement, readonly strip: HTMLElement, start: number) {
    strip.innerHTML = [0, 1, 2].map(() => STRIP.map((s) => `<div class="cell">${icon(s)}</div>`).join("")).join("");
    this.pos = start;
    this.draw();
  }
  get moving() { return this.v > 0 || !!this.land; }
  draw(): void {
    const p = ((this.pos % N) + N) % N;
    this.strip.style.setProperty("--y", String(p + N - 1));
    this.el.classList.toggle("fast", this.v > 14 && !this.land);
  }
  start(): void { this.land = null; this.v = 34; this.clearHit(); }
  /**
   * Plans a stop on `stop` (a strip index): the reel keeps turning until `t0`, then eases out with a small bounce,
   * finishing no earlier than `minEnd`. Returns when it will be still.
   */
  stopAt(stop: number, t0: number, minEnd: number): number {
    const v = Math.max(this.v, 10);
    const at = this.pos + v * Math.max(0, t0 - performance.now()) / 1000;    // where it will be at t0
    const ahead = at + 7;                                                     // the first copy of `stop` far enough on
    let to = Math.floor(ahead / N) * N + stop;
    if (to < ahead) to += N;
    const s = 0.9;                                          // easeOutBack overshoot: its start speed is (s + 3) x distance
    let d = Math.min(2100, Math.max(650, ((s + 3) * (to - at)) / v * 1000));
    if (t0 + d < minEnd) d = minEnd - t0;
    this.v = v;
    this.land = { from: at, to, t0, d };
    return t0 + d;
  }
  tick(now: number, dt: number): void {
    if (this.land) {
      const L = this.land;
      if (now < L.t0) { this.pos += this.v * dt; L.from = this.pos; }
      else {
        const u = Math.min(1, (now - L.t0) / L.d), s = 0.9;
        const e = 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2;
        this.pos = L.from + (L.to - L.from) * e;
        if (u >= 1) { this.pos = L.to % N; this.v = 0; this.land = null; this.draw(); sfx.stop(); return; }
      }
    } else if (this.v) this.pos += this.v * dt;
    this.draw();
  }
  /** the symbol on the payline lights up */
  hit(): void { this.strip.children[N + Math.round(this.pos) % N]?.classList.add("hit"); }
  clearHit(): void { this.strip.querySelectorAll(".hit").forEach((c) => c.classList.remove("hit")); }
}

const reels = [...reelsEl.querySelectorAll<HTMLElement>(".reel")].map((el, i) => new Reel(el, el.querySelector(".strip")!, [15, 9, 25][i]));
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const r of reels) if (r.moving) r.tick(now, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Lands the reels on these stops, reel 1 first, then 2, then 3. Resolves when reel 3 is still. */
async function landReels(stops: number[], quick = false): Promise<void> {
  const t0 = performance.now() + (quick ? 0 : 120);
  let end = 0;
  for (let i = 0; i < 3; i++) end = reels[i].stopAt(stops[i], t0 + i * (quick ? 100 : 380), end + (quick ? 60 : 260));
  await new Promise<void>((resolve) => {
    const check = () => (reels.some((r) => r.moving) ? requestAnimationFrame(check) : resolve());
    check();
  });
}

// ---- sound: tiny synth, nothing downloaded ---------------------------------------------------------------
let audio: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem("fly-slots-muted") === "1"; } catch { /* no storage */ }
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
  start: () => tone(180, 260, 0.05, "sawtooth", 2.2),
  stop: () => tone(140, 90, 0.08, "triangle", 0.6),
  win: () => [523, 659, 784].forEach((f, k) => setTimeout(() => tone(f, 160, 0.05), k * 110)),
  big: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, k) => setTimeout(() => tone(f, 170, 0.06), k * 120)),
};
function showSound(): void { soundBtn.textContent = t(muted ? "slots.deck.soundOff" : "slots.deck.soundOn"); }
soundBtn.onclick = () => {
  muted = !muted;
  try { localStorage.setItem("fly-slots-muted", muted ? "1" : "0"); } catch { /* no storage */ }
  showSound();
};
showSound();

// ---- the fly -----------------------------------------------------------------------------------------------
const fly = new Fly($("flybox"), $("status"), {
  loomBar: $("loom-bar"), loomText: $("loom-text"), wingBar: $("wing-bar"), wingNum: $("wing-num"), verdict: $("verdict"),
});

// ---- free play's coins (this device only) -----------------------------------------------------------------
const START_COINS = 1000;
const FUN_STAKES = [1, 2, 5, 10, 20, 50, 100, 250];
interface Fun { coins: number; spins: number; won: number; best: number }
const fun: Fun = (() => {
  const base = { coins: START_COINS, spins: 0, won: 0, best: 0 };
  try { return { ...base, ...JSON.parse(localStorage.getItem("fly-slots") ?? "{}") }; } catch { return base; }
})();
function saveFun(): void {
  try { localStorage.setItem("fly-slots", JSON.stringify(fun)); } catch { /* private mode: coins last the visit */ }
  $("fun-stats").textContent = t("slots.fun.stats", { spins: fun.spins.toLocaleString(), best: fun.best, won: fun.won.toLocaleString() });
}
const refillBtn = $<HTMLButtonElement>("refill");
refillBtn.textContent = t("slots.fun.refill", { n: START_COINS.toLocaleString() });
refillBtn.onclick = () => {
  if (spinning) return;
  fun.coins = Math.max(fun.coins, START_COINS);
  saveFun();
  deck();
  say(t("slots.msg.ready"));
};

// ---- modes -------------------------------------------------------------------------------------------------
type Mode = "fun" | "bet";
let mode: Mode = "fun";
let spinning = false;
let auto = 0;
const stakes: Record<Mode, string> = { fun: "10", bet: "" };
try { if (localStorage.getItem("fly-slots-mode") === "bet") mode = "bet"; } catch { /* no storage */ }

function setMode(m: Mode): void {
  if (spinning || auto) return;
  stakes[mode] = stakeEl.value;
  mode = m;
  try { localStorage.setItem("fly-slots-mode", m); } catch { /* no storage */ }
  modeFun.setAttribute("aria-selected", String(m === "fun"));
  modeBet.setAttribute("aria-selected", String(m === "bet"));
  $("fun-card").hidden = m !== "fun";
  $("bet-card").hidden = m !== "bet";
  stakeEl.value = stakes[m] || bets.limits()?.min || "1";
  say(m === "bet" ? bets.blocked(stakeEl.value) ?? t("slots.msg.ready") : t("slots.msg.ready"));
  deck();
  showRecent();
}
modeFun.onclick = () => setMode("fun");
modeBet.onclick = () => setMode("bet");

/** Redraws the balance, the stake and the buttons. */
function deck(): void {
  if (mode === "fun") {
    balanceEl.textContent = fun.coins.toLocaleString();
    unitEl.textContent = t("slots.deck.coins");
  } else {
    const b = bets.balance();
    balanceEl.textContent = b == null ? "—" : fmt(b);
    unitEl.textContent = b == null ? t("slots.deck.signedOut") : t("slots.deck.flyai");
  }
  spinBtn.disabled = spinning || (mode === "bet" && bets.state() !== "open");
  for (const b of autoBtns) { b.disabled = spinning || !!auto || (mode === "bet" && bets.state() !== "open"); b.hidden = !!auto; }
  autoStop.hidden = !auto;
  autoLeftEl.textContent = auto ? t("slots.deck.autoLeft", { count: auto }) : "";
  $<HTMLButtonElement>("stake-down").disabled = $<HTMLButtonElement>("stake-up").disabled = stakeEl.disabled = spinning || !!auto;
  modeFun.disabled = modeBet.disabled = spinning || !!auto;
}

function stepStake(dir: 1 | -1): void {
  const v = Number(stakeEl.value) || 0;
  if (mode === "fun") {
    const i = FUN_STAKES.findIndex((s) => s >= v);
    const at = i < 0 ? FUN_STAKES.length - 1 : FUN_STAKES[i] === v ? i + dir : dir > 0 ? i : i - 1;
    stakeEl.value = String(FUN_STAKES[Math.max(0, Math.min(FUN_STAKES.length - 1, at))]);
  } else {
    const lim = bets.limits();
    const min = Number(lim?.min ?? 1), max = Number(lim?.max ?? 1e9);
    const nextV = dir > 0 ? (v > 0 ? v * 2 : min) : v / 2;
    stakeEl.value = String(Math.round(Math.max(min, Math.min(max, nextV)) * 100) / 100);
  }
}
$("stake-down").onclick = () => stepStake(-1);
$("stake-up").onclick = () => stepStake(1);

// ---- a spin ------------------------------------------------------------------------------------------------
interface Result { stops: number[]; symbols: Sym[]; mult: number; line: Line; stake: number; payout: number }
const recent: Record<Mode, Result[]> = { fun: [], bet: [] };

function lineText(r: Result): string {
  if (r.line === "crown") return t("slots.line.crown");
  return t(`slots.line.${r.line}`, { sym: t(`slots.sym.${r.symbols[0]}`) });
}

/** One spin in the current mode. Resolves with the result once the reels are still, or null if none happened. */
async function spinOnce(): Promise<Result | null> {
  if (spinning) return null;
  const m = mode;
  const raw = stakeEl.value.trim();
  const stake = Number(raw);
  if (m === "fun") {
    if (!(stake > 0) || !Number.isInteger(stake)) { say(t("slots.msg.stakeBad"), "bad"); return null; }
    if (stake > fun.coins) { say(t(fun.coins < 1 ? "slots.msg.brokeFun" : "slots.msg.broke"), "bad"); return null; }
  } else {
    const why = bets.blocked(raw);
    if (why) { say(why, "bad"); return null; }
  }
  if (!audio) { try { audio = new AudioContext(); } catch { audio = null; } }
  spinning = true;
  machine.classList.remove("lit");
  reelsEl.classList.remove("win");
  say("");
  winEl.textContent = "0";
  if (m === "fun") { fun.coins -= stake; saveFun(); }
  deck();
  for (const r of reels) r.start();
  sfx.start();
  fly.spinning();

  let res: Result;
  let betSpin: BetSpin | null = null;
  try {
    if (m === "fun") {
      // free play: a fresh random seed pair per spin, the same draw as the server's (game.ts spinWith)
      const [s] = await Promise.all([deriveRng(randomHex(), randomHex()).then(spinWith), wait(450)]);
      res = { ...s, stake, payout: stake * s.mult };
    } else {
      betSpin = await bets.play(raw);
      res = { stops: betSpin.stops, symbols: betSpin.symbols, mult: betSpin.mult, line: betSpin.line, stake: Number(betSpin.stake), payout: Number(betSpin.payout) };
    }
  } catch (err) {
    // no result: the reels settle where they are, nothing is paid or taken
    await landReels(reels.map((r) => Math.ceil(r.pos) % N), true);
    spinning = false;
    deck();
    if (!(err instanceof Cancelled)) say(String((err as Error).message), "bad");
    else say(t("slots.msg.ready"));
    return null;
  }

  await landReels(res.stops);
  // the payline: which reels count for the win
  if (res.mult > 0) {
    const n = res.line === "three" ? 3 : res.line === "two" ? 2 : 1;
    for (let i = 0; i < n; i++) reels[i].hit();
    reelsEl.classList.add("win");
    machine.classList.add("lit");
    (res.mult >= BIG ? sfx.big : sfx.win)();
  }
  if (m === "fun") {
    fun.coins += res.payout;
    fun.spins++;
    fun.won += res.payout;
    fun.best = Math.max(fun.best, res.mult);
    saveFun();
  } else bets.landed(betSpin!);
  recent[m].unshift(res);
  if (recent[m].length > 30) recent[m].pop();
  showRecent();
  countUp(res.payout);
  if (res.mult > 0) {
    const amount = m === "fun" ? res.payout.toLocaleString() : `${fmt(res.payout)} FLYAI`;
    say(t(res.mult >= BIG ? "slots.msg.big" : "slots.msg.won", { line: lineText(res), mult: res.mult, amount }), "win");
  } else say(t("slots.msg.lost"));
  reelsEl.setAttribute("aria-label", res.symbols.map((s) => t(`slots.sym.${s}`)).join(", "));
  fly.react(res.symbols.filter((s) => s === "spider").length, res.mult);
  spinning = false;
  deck();
  return res;
}

let countTimer = 0;
function countUp(to: number): void {
  cancelAnimationFrame(countTimer);
  const t0 = performance.now(), d = Math.min(1400, 300 + to * 4);
  const show = (v: number) => { winEl.textContent = mode === "fun" ? Math.round(v).toLocaleString() : fmt(v); };
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / d);
    show(to * (1 - (1 - u) ** 3));
    if (u < 1) countTimer = requestAnimationFrame(step);
  };
  if (to > 0) countTimer = requestAnimationFrame(step); else show(0);
}

function showRecent(): void {
  const list = recent[mode];
  $("recent").innerHTML = list.length ? list.slice(0, 12).map((r) => `<li><span class="mini">${r.symbols.map((s) => icon(s)).join("")}</span>
    <span class="mono dim">${r.mult ? `${r.mult}x` : ""}</span>
    <b class="${r.payout > 0 ? "up" : "down"}">${r.payout > 0 ? `+${mode === "fun" ? r.payout.toLocaleString() : fmt(r.payout)}` : `−${mode === "fun" ? r.stake.toLocaleString() : fmt(r.stake)}`}</b></li>`).join("")
    : `<li class="dim">${t("slots.recent.none")}</li>`;
}

// ---- auto-spin -----------------------------------------------------------------------------------------------
async function autoSpin(n: number): Promise<void> {
  if (spinning || auto) return;
  auto = n;
  deck();
  while (auto > 0) {
    const r = await spinOnce();
    if (!r) break;                         // couldn't spin (balance, limits, error): the message says why
    auto = Math.max(0, auto - 1);
    deck();
    if (r.mult >= BIG) { if (auto) say(`${msgEl.textContent} · ${t("slots.msg.autoBig")}`, "win"); break; }
    const bal = mode === "fun" ? fun.coins : Number(bets.balance() ?? 0);
    if (auto && bal < r.stake) { say(t("slots.msg.autoBroke"), "bad"); break; }
    if (auto) await wait(r.mult > 0 ? 900 : 350);
  }
  auto = 0;
  deck();
}
for (const b of autoBtns) b.onclick = () => void autoSpin(Number(b.dataset.auto));
autoStop.onclick = () => { auto = 0; deck(); };

spinBtn.onclick = () => void spinOnce();
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  const el = e.target as HTMLElement;
  if (el.closest("input, textarea, select, button, a, summary, dialog")) return;
  e.preventDefault();
  if (!spinBtn.disabled && !auto) void spinOnce();
});

// ---- the paytable (from game.ts PAYS) --------------------------------------------------------------------------
function paytable(): void {
  const rows: string[] = [];
  const syms = Object.keys(PAYS.three) as Exclude<Sym, "spider">[];
  const any = `<span class="any">${t("slots.pay.any")}</span>`;
  for (const s of syms) rows.push(`<tr><td><span class="ic">${icon(s)}${icon(s)}${icon(s)}</span></td><td>${PAYS.three[s]}x</td></tr>`);
  for (const s of syms) rows.push(`<tr><td><span class="ic">${icon(s)}${icon(s)}${any}</span></td><td>${PAYS.two[s]}x</td></tr>`);
  rows.push(`<tr><td><span class="ic">${icon("crown")}${any}${any}</span> <span class="dim">${t("slots.pay.crownFirst")}</span></td><td>${PAYS.crown}x</td></tr>`);
  rows.push(`<tr><td><span class="ic">${icon("spider")}</span> <span class="dim">${t("slots.pay.spider")}</span></td><td>0x</td></tr>`);
  $("paytable").innerHTML = rows.join("");
  const r = rtp();
  $("pay-rtp").textContent = t("slots.pay.rtp", { rtp: (r.rtp * 100).toFixed(2), hit: (1 / r.hit).toFixed(1) });
}

// ---- $FLYAI --------------------------------------------------------------------------------------------------
const bets = initBets({
  busy: () => spinning || !!auto,
  changed: () => {
    if (mode === "bet" && !stakeEl.value && bets?.limits()) stakeEl.value = bets.limits()!.min;
    deck();
  },
  mini: (symbols) => symbols.map((s) => icon(s)).join(""),
});

paytable();
saveFun();
showRecent();
setMode(mode);
if (import.meta.env.DEV) (window as unknown as { slots: unknown }).slots = { fun, reels, recent };
