/**
 * Flinder: a fly swipes through dating profiles. Its real connectome (brain.worker.ts) senses each profile and
 * its pC1 neurons decide left, right or super like (readout.ts); on a right swipe the other fly's brain judges
 * the swiper's profile, and two rights make a match. Then the two brains chat, each reading the other's
 * messages, and a date is acted out as their brains decide. Exes come back to text. This file only shows it:
 * the cards, the fly's leg doing the swiping, the chat, the meters, the share card and the leaderboard.
 */
import { DateNight } from "./datenight.ts";
import { Fx } from "./fx.ts";
import { connectomeBase, progress } from "../i18n.ts";
import { setupI18n, t } from "./i18n.ts";
import { EX_OPENERS, UNSENT, botSay, dateOutcome, endLine, nervousOpener, opener, say, seenAt, voiceNote } from "./lines.ts";
import { Portrait } from "./portrait.ts";
import { flyFromHash, randomProfile, traitLabel, type Profile } from "./profiles.ts";
import {
  CHAT, READOUT, TRAITS, carried, dateEnd, ending, sensed, type ChatCounts, type Ending, type Reply, type Traits,
} from "./readout.ts";
import { categories, emptyStats, flyLink, loadBoard, saveBoard, statsCard, thumb, tweetText, type BoardRow, type Stats } from "./share.ts";
import { esc as escapeHtml } from "../util.ts";

// the page's language first: every text below is in it
await setupI18n();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status"), deckEl = $("deck"), legEl = $("leg"), toastEl = $("toast"), matchEl = $("match"), phoneEl = $("phone");
const startBtn = $<HTMLButtonElement>("start"), newBtn = $<HTMLButtonElement>("newfly");
const speedBtn = $<HTMLButtonElement>("speed"), soundBtn = $<HTMLButtonElement>("sound");
const heartBar = $("heart-bar"), heartNum = $("heart-num"), vpoNum = $("vpo-num"), verdictEl = $("verdict"), meterName = $("meter-name");
const panicBar = $("panic-bar"), panicNum = $("panic-num"), groomNum = $("groom-num");
const logEl = $("log"), matchesEl = $("matches"), tallyEl = $("tally"), boardEl = $("board");
const likeBtn = $("b-like"), nopeBtn = $("b-nope"), starBtn = $("b-star");
const box = legEl.parentElement!;

// ---- the brain ------------------------------------------------------------------------------------------
const worker = new Worker(new URL("./brain.worker.ts", import.meta.url), { type: "module" });
const base = connectomeBase();
let brainReady = false;
type Counts = { heart: number; vpo: number };
type Decided = Counts & { choice: "right" | "left" };
type Replied = ChatCounts & { reply: Reply };
const waiting = new Map<string, { step?: (c: Counts & { t: number }) => void; done: (c: Decided) => void }>();
const replies = new Map<string, (r: Replied) => void>();

worker.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "progress") statusEl.textContent = t("flinder.status.progress", { text: progress("flinder.status", m.text) });
  else if (m.type === "error") statusEl.textContent = t("flinder.status.error", { text: m.text });
  else if (m.type === "ready") {
    brainReady = true;
    statusEl.textContent = t("flinder.status.ready", { n: m.n.toLocaleString() });
    startBtn.disabled = false;
  } else if (m.type === "replied") {
    const key = `c${m.id}${m.reader}`;
    const done = replies.get(key);
    replies.delete(key);
    done?.(m);
  } else if (m.type === "step") waiting.get(`s${m.id}`)?.step?.(m);
  else if (m.type === "decided") {
    const key = `${m.judge ? "j" : "s"}${m.id}`;
    const w = waiting.get(key);
    waiting.delete(key);
    w?.done(m);
  }
};
worker.postMessage({ type: "load", base });

/** What a swiper senses from a profile: its traits, plus a rival's smell if it just left another date. */
const smellOf = (p: Profile) => sensed(p.traits, p.rival);
/** The swiper's brain looks at a profile. */
const brainSwipe = (p: Profile, step: (c: Counts & { t: number }) => void) => new Promise<Decided>((done) => {
  waiting.set(`s${p.id}`, { step, done });
  worker.postMessage({ type: "swipe", id: p.id, traits: smellOf(p) });
});
/** A profile's own brain looks back at the swiper (and is kept for their chat). */
const brainJudge = (p: Profile, swiper: Traits) => new Promise<Decided>((done) => {
  waiting.set(`j${p.id}`, { done });
  worker.postMessage({ type: "judge", id: p.id, seed: p.seed, traits: swiper });
});
const NONE = { flirt: 0, loom: 0 };
/** In a chat with profile p, one fly's brain reads the other's message. */
const brainReply = (p: Profile, reader: "swiper" | "match", sender: Traits, msg: { flirt: number; loom: number }) =>
  new Promise<Replied>((done) => {
    replies.set(`c${p.id}${reader}`, done);
    worker.postMessage({ type: "chat", id: p.id, reader, traits: sender, msg });
  });

// ---- sound: tiny synth, nothing downloaded ---------------------------------------------------------------
let audio: AudioContext | null = null;
let muted = false;
function tone(freq: number, ms: number, gain: number, slide = 0, type: OscillatorType = "triangle"): void {
  if (!audio || muted) return;
  const o = audio.createOscillator(), g = audio.createGain();
  const t = audio.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + ms / 1000);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(); o.stop(t + ms / 1000);
}
const sfx = {
  swipe: (right: boolean) => tone(right ? 300 : 500, 220, 0.08, right ? 2.2 : 0.45),
  tap: () => tone(900, 50, 0.05, 0, "square"),
  match: () => [523, 659, 784, 1047, 1319].forEach((f, k) => setTimeout(() => tone(f, 220, 0.07), k * 110)),
  sad: () => [392, 330].forEach((f, k) => setTimeout(() => tone(f, 260, 0.05), k * 180)),
  star: () => [880, 1175, 1568].forEach((f, k) => setTimeout(() => tone(f, 160, 0.06, 1.2), k * 80)),
  swat: () => { tone(90, 300, 0.3, 0.5, "sawtooth"); tone(1500, 80, 0.05, 0.3, "square"); },
};

// ---- timing ----------------------------------------------------------------------------------------------
let speed = 1;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / speed));
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
function tween(ms: number, fn: (p: number) => void): Promise<void> {
  const dur = ms / speed, t0 = performance.now();
  return new Promise((resolve) => {
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      fn(p);
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}
const fx = new Fx(phoneEl, () => speed);

// ---- cards -----------------------------------------------------------------------------------------------
const portrait = new Portrait();
const photos = new Map<number, string>();
const photoOf = (p: Profile) => {
  let url = photos.get(p.id);
  if (!url) { url = portrait.snapshot(p, 360, 480, deck[0] ?? null); photos.set(p.id, url); }
  return url;
};
const anyOf = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const dots = (v: number) => "●".repeat(Math.round(v * 5)) + "○".repeat(5 - Math.round(v * 5));
const chips = (t: Traits) => TRAITS.map((k) => `<span class="chip${t[k] >= 0.6 ? " hot" : ""}">${traitLabel(k)}<i>${dots(t[k])}</i></span>`).join("");

let deck: Profile[] = [];
const cards = new Map<number, HTMLElement>();

function cardEl(p: Profile): HTMLElement {
  const el = document.createElement("div");
  el.className = `pcard${p.bot ? " bot" : ""}`;
  const flags = [
    ...p.red.map((f) => `<span class="flag red">🚩 ${escapeHtml(f)}</span>`),
    ...p.green.map((f) => `<span class="flag green">💚 ${escapeHtml(f)}</span>`),
    p.rival ? `<span class="flag rival">${t("flinder.card.rival")}</span>` : "",
  ].join("");
  el.innerHTML = `<img class="photo" alt="">
    <div class="stamp like">${t("flinder.card.like")}</div><div class="stamp nope">${t("flinder.card.nope")}</div><div class="stamp super">${t("flinder.card.super")}</div>
    ${p.bot ? `<div class="botbadge">${t("flinder.card.mosquito")}</div>` : ""}
    <div class="info"><div class="nm"></div><div class="meta"></div><p class="bio"></p>
      <div class="prompt"><b></b><span></span></div>
      <div class="flags">${flags}</div><div class="chips">${chips(p.traits)}</div></div>`;
  (el.querySelector(".photo") as HTMLImageElement).src = photoOf(p);
  el.querySelector(".nm")!.innerHTML = `${escapeHtml(p.name)} <span>${t("flinder.card.age", { age: p.age })}</span>`;
  el.querySelector(".meta")!.textContent = t("flinder.card.meta", { job: p.job, cm: p.cm });
  el.querySelector(".bio")!.textContent = p.bio;
  el.querySelector(".prompt b")!.textContent = p.prompt[0];
  el.querySelector(".prompt span")!.textContent = p.prompt[1];
  return el;
}

/** Keeps three cards in the deck, the top one live. */
function fillDeck(): void {
  while (deck.length < 3) deck.push(randomProfile([swiper?.name ?? "", ...deck.map((d) => d.name)]));
  deck.forEach((p, k) => {
    let el = cards.get(p.id);
    if (!el) { el = cardEl(p); cards.set(p.id, el); deckEl.prepend(el); }
    el.style.zIndex = String(10 - k);
    if (k > 0) el.style.transform = `translateY(${k * 8}px) scale(${1 - k * 0.04})`;
  });
  const top = cards.get(deck[0].id)!;
  if (portrait.renderer.domElement.parentElement !== top) {
    portrait.pose(deck[0]);
    top.insertBefore(portrait.renderer.domElement, top.querySelector(".stamp"));
    sizePortrait();
  }
}
function sizePortrait(): void {
  const c = portrait.renderer.domElement.parentElement;
  if (c) portrait.size(c.clientWidth || 300, c.clientHeight || 400);
}
new ResizeObserver(sizePortrait).observe(deckEl);

// the top card's drag and the leg that drags it, drawn every frame
const drag = { x: 0, y: 0 };
const leg = { reach: 0, press: 0, wiggle: 0 };
function frame(): void {
  requestAnimationFrame(frame);
  if (!document.hidden) portrait.frame();
  const top = deck[0] && cards.get(deck[0].id);
  if (top) {
    top.style.transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`;
    (top.querySelector(".stamp.like") as HTMLElement).style.opacity = String(Math.max(0, Math.min(1, drag.x / 70)));
    (top.querySelector(".stamp.nope") as HTMLElement).style.opacity = String(Math.max(0, Math.min(1, -drag.x / 70)));
    (top.querySelector(".stamp.super") as HTMLElement).style.opacity = String(Math.max(0, Math.min(1, -drag.y / 70)));
  }
  // the leg's claw sits on the card's lower half and goes where the card goes
  const b = box.getBoundingClientRect(), d = deckEl.getBoundingClientRect();
  const tipX = d.left - b.left + d.width / 2 + drag.x * 0.9;
  const tipY = d.top - b.top + d.height * 0.66 + drag.y + leg.press * 6;
  const h = Math.max(160, b.height - tipY + 40);
  const w = h * 84 / 260;
  const hide = (1 - leg.reach) * (h + 60);
  const sway = Math.sin(performance.now() / 180) * leg.wiggle * 3;
  legEl.style.width = `${w}px`; legEl.style.height = `${h}px`; legEl.style.marginLeft = "0";
  legEl.style.left = `${tipX - w / 2}px`;
  legEl.style.transform = `translateY(${tipY - h * 0.012 + hide}px) rotate(${drag.x / 30 + sway}deg)`;
}
requestAnimationFrame(frame);

// ---- the swiper, its stats and the leaderboard -----------------------------------------------------------
let swiper: Profile | null = null;
let stats: Stats = emptyStats();
let swiperPic = "";
let swiperThumb = "";
function newSwiper(from: Profile | null = null): void {
  swiper = from ?? randomProfile();
  stats = emptyStats();
  exes.length = 0;
  worker.postMessage({ type: "swiper", seed: swiper.seed });
  swiperPic = portrait.snapshot(swiper, 240, 300, deck[0] ?? null);
  photos.set(swiper.id, swiperPic);
  void thumb(swiperPic).then((t) => { swiperThumb = t; });
  ($("me-pic") as HTMLImageElement).src = swiperPic;
  ($("mine-pic") as HTMLImageElement).src = swiperPic;
  $("me-name").textContent = swiper.name;
  $("mine-name").textContent = t("flinder.swiper.nameAge", { name: swiper.name, age: swiper.age });
  $("mine-chips").innerHTML = chips(swiper.traits);
  matchesEl.innerHTML = `<li class="empty">${t("flinder.panels.noMatches")}</li>`;
  chatEl.hidden = true; shown = null; reading = false;
  logEl.innerHTML = "";
  meterName.textContent = t("flinder.meter.nobodyYet");
  setMeter({ heart: 0, vpo: 0 });
  setChatMeter(null);
  verdictEl.textContent = "";
  showStats();
}
function bump(k: keyof Stats): void {
  stats[k]++;
  showStats();
  if (swiper && swiperThumb) renderBoard(saveBoard(swiper, stats, swiperThumb));
}
function showStats(): void {
  const s = stats;
  $("mine-stats").textContent = t("flinder.swiper.stats", { ...s });
}
function renderBoard(rows: BoardRow[] = loadBoard()): void {
  if (!rows.length) { boardEl.innerHTML = `<li class="empty">${t("flinder.panels.boardEmpty")}</li>`; return; }
  boardEl.innerHTML = "";
  for (const [label, score] of categories()) {
    const best = [...rows].sort((a, b) => score(b) - score(a))[0];
    if (!best || score(best) === 0) continue;
    const li = document.createElement("li");
    li.innerHTML = `<span class="cat"></span><img alt=""><b></b><span class="n"></span>`;
    li.querySelector(".cat")!.textContent = label;
    (li.querySelector("img") as HTMLImageElement).src = best.pic;
    const b = li.querySelector("b")!;
    b.textContent = best.name;
    b.style.color = best.color;
    li.querySelector(".n")!.textContent = String(score(best));
    boardEl.appendChild(li);
  }
  if (!boardEl.children.length) boardEl.innerHTML = `<li class="empty">${t("flinder.panels.noHeartbreaks")}</li>`;
}

// ---- meters, log, tally ----------------------------------------------------------------------------------
const lineAt = 1.6;       // bars are full at 1.6x their line, so the line sits at 62.5%
function setMeter(c: Counts): void {
  heartBar.style.width = `${Math.min(100, (c.heart / (READOUT.heart * lineAt)) * 100)}%`;
  heartBar.classList.toggle("hot", c.heart >= READOUT.heart);
  heartNum.textContent = String(c.heart);
  vpoNum.textContent = String(c.vpo);
}
function setChatMeter(r: Replied | null): void {
  panicBar.style.width = `${r ? Math.min(100, (r.gf / (CHAT.spook * lineAt)) * 100) : 0}%`;
  panicBar.classList.toggle("hot", !!r && r.gf >= CHAT.spook);
  panicNum.textContent = r ? String(r.gf) : "–";
  groomNum.textContent = r ? String(r.groom) : "–";
}
function log(html: string): void {
  const li = document.createElement("li");
  li.innerHTML = html;
  logEl.prepend(li);
  while (logEl.children.length > 60) logEl.lastChild!.remove();
}
let toastTimer = 0;
function toast(text: string, ms = 1600): void {
  toastEl.textContent = text;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("on"), ms / speed);
}
const store = {
  get(): { swipes: number; rights: number; matches: number; dates: number } {
    try { return { swipes: 0, rights: 0, matches: 0, dates: 0, ...JSON.parse(localStorage.getItem("flinder") ?? "{}") }; }
    catch { return { swipes: 0, rights: 0, matches: 0, dates: 0 }; }
  },
  add(k: "swipes" | "rights" | "matches" | "dates"): void {
    const s = store.get();
    s[k]++;
    try { localStorage.setItem("flinder", JSON.stringify(s)); } catch { /* private mode: no tally */ }
    showTally();
  },
};
function showTally(): void {
  const s = store.get();
  tallyEl.textContent = s.swipes ? t("flinder.tally", { swipes: s.swipes, matches: s.matches, dates: s.dates }) : "";
}

// ---- a match, then their chat ----------------------------------------------------------------------------
interface Line { me: boolean; text: string; why: string; kind: Reply | "system"; strong: boolean }
interface Chat { p: Profile; lines: Line[]; end: Ending | null; endText: string; li: HTMLLIElement; ex?: boolean }
const chatEl = $("chat"), chatBody = $("chat-body"), chatEnd = $("chat-end"), chatBack = $<HTMLButtonElement>("chat-back");
/** the chat on the phone right now, and whether a finished one is open for reading */
let shown: Chat | null = null;
let reading = false;
/** pC1 in the swipe that led to the match, and whether it was a super like */
let lastSwipe = 0;
let lastSuper = false;
/** exes who may text again: after the swiper's `due`-th swipe */
const exes: { p: Profile; due: number }[] = [];

function matchRow(p: Profile, badge = "💬"): HTMLLIElement {
  matchesEl.querySelector(".empty")?.remove();
  const li = document.createElement("li");
  li.innerHTML = `<img alt=""><span><b></b><span class="msg"></span></span><span class="st"></span>`;
  (li.querySelector("img") as HTMLImageElement).src = photoOf(p);
  li.querySelector("b")!.textContent = p.name;
  li.querySelector(".st")!.textContent = badge;
  matchesEl.prepend(li);
  return li;
}

async function itsAMatch(p: Profile): Promise<void> {
  store.add("matches");
  bump("matches");
  sfx.match();
  ($("m-me") as HTMLImageElement).src = photoOf(swiper!);
  ($("m-them") as HTMLImageElement).src = photoOf(p);
  $("m-line").textContent = t(p.bot ? "flinder.match.bot" : lastSuper ? "flinder.match.super" : "flinder.match.mutual", { name: p.name });
  matchEl.hidden = false;
  for (let k = 0; k < 14; k++) {
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = anyOf(p.bot ? ["🩸", "🦟", "⚠️"] : ["💖", "💕", "🪰", "💘", "✨"]);
    h.style.left = `${Math.random() * 90}%`;
    h.style.animationDelay = `${Math.random() * 0.8 / speed}s`;
    h.style.animationDuration = `${1.8 / speed}s`;
    matchEl.appendChild(h);
    h.addEventListener("animationend", () => h.remove());
  }
  log(`<span class="m">${t("flinder.match.log", { name: escapeHtml(p.name) })}</span>`);
  await wait(2200);
  matchEl.hidden = true;
  const chat: Chat = { p, lines: [], end: null, endText: "", li: matchRow(p) };
  chat.li.onclick = () => openChat(chat, true);
  await runChat(chat, false);
}

/** Shows a chat on the phone; a finished one opened from the matches list waits for Back. */
function openChat(chat: Chat, read = false): void {
  if (read && shown && !shown.end) return;              // a live chat is on: don't cover it
  shown = chat;
  reading = read;
  ($("chat-pic") as HTMLImageElement).src = (chat.li.querySelector("img") as HTMLImageElement).src;
  $("chat-name").textContent = chat.p.name;
  $("chat-sub").textContent = t(chat.ex ? "flinder.chat.ex" : chat.end ? "flinder.chat.earlier" : chat.p.bot ? "flinder.chat.bot" : "flinder.chat.justNow");
  chatBody.innerHTML = "";
  chatBody.classList.toggle("faded", chat.end === "ghosted");
  for (const l of chat.lines) bubble(l);
  chatEnd.textContent = chat.endText;
  chatBack.hidden = !read;
  chatEl.hidden = false;
}
function bubble(l: Line): HTMLElement {
  const el = document.createElement("div");
  if (l.kind === "system") {
    el.className = `sys ${l.me ? "me" : "them"}`;
    el.textContent = l.text;
  } else {
    el.className = `bub ${l.me ? "me" : "them"}${l.kind === "flirt" && l.strong ? " hot" : ""}${l.text.startsWith("🎙️") ? " voice" : ""}`;
    el.innerHTML = `<span class="tx"></span><small class="why"></small>`;
    el.querySelector(".tx")!.textContent = l.text;
    el.querySelector(".why")!.textContent = l.why;
  }
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
  return el;
}
function typing(me: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = `bub ${me ? "me" : "them"} typing`;
  el.innerHTML = "<i></i><i></i><i></i>";
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
  return el;
}
chatBack.onclick = () => { chatEl.hidden = true; reading = false; shown = null; };

const WHY: Record<Reply, (r: Replied) => string> = {
  flirt: (r) => `pC1 ${r.heart}`,
  spooked: (r) => t("flinder.chat.giantFibre", { n: r.gf }),
  groom: (r) => t("flinder.chat.grooming", { n: r.groom }),
  dry: (r) => `pC1 ${r.heart}`,
};
const verdict = (r: Reply) => t(`flinder.verdict.${r}`);

/**
 * The two brains take turns, each reading the other's last message (readout.ts runReply), until ending() says
 * it's over. A new match: the swiper takes a second look first; if its brain doesn't flirt, nerves win (it
 * types, unsends, and sends a limp "hey"). An ex: the ex texts first and the swiper reads it.
 */
async function runChat(chat: Chat, ex: boolean): Promise<void> {
  const p = chat.p, me = swiper!;
  openChat(chat);
  const add = (l: Line) => {
    chat.lines.push(l);
    if (shown === chat) { const el = bubble(l); if (l.kind !== "system") fx.message(el, l.kind, l.strong); }
    if (l.kind !== "system") chat.li.querySelector(".msg")!.textContent = l.text;
  };
  const words = (kind: Reply, from: Profile, heart: number) =>
    from.bot ? botSay(kind) : kind === "flirt" && from.traits.song >= 0.7 && Math.random() < 0.5 ? voiceNote() : say(kind, from.traits, heart);
  const hearts = { me: lastSwipe, them: 0 };

  let msg: { flirt: number; loom: number };
  if (ex) {
    const tp = typing(false);
    await wait(900);
    tp.remove();
    add({ me: false, text: anyOf(EX_OPENERS), why: t("flinder.chat.anEx"), kind: "flirt", strong: false });
    msg = carried("flirt", READOUT.heart);             // a lukewarm "hey stranger"
  } else {
    // a second look before typing: the swiper's brain reads the match's profile again
    const look = await brainReply(p, "swiper", smellOf(p), NONE);
    let tp = typing(true);
    await wait(800);
    tp.remove();
    if (look.reply === "flirt") {
      add({ me: true, text: opener(p.traits), why: `pC1 ${lastSwipe}${lastSuper ? ` · ${t("flinder.chat.superLike")}` : ""}`, kind: "flirt", strong: lastSwipe >= CHAT.comeOn });
    } else {
      // nerves: it types something, unsends it, types again, and goes with a limp "hey"
      add({ me: true, text: `${anyOf(UNSENT)}…`, why: "", kind: "system", strong: false });
      await wait(700);
      if (shown === chat) chatBody.lastElementChild?.classList.add("unsent");
      chat.lines[chat.lines.length - 1].text = t("flinder.chat.unsent");
      await wait(600);
      tp = typing(true);
      await wait(900);
      tp.remove();
      add({ me: true, text: nervousOpener(), why: `pC1 ${look.heart} · ${t("flinder.chat.nervous")}`, kind: "flirt", strong: false });
      hearts.me = look.heart;
    }
    msg = carried("flirt", hearts.me);
  }

  const kinds: Reply[] = ["flirt"];
  let end: Ending | null = null;
  for (let turn = 1; !end; turn++) {
    const mine = ex ? turn % 2 === 1 : turn % 2 === 0;   // whoever didn't just text answers
    const reader = mine ? me : p, sender = mine ? p : me;
    meterName.textContent = t("flinder.meter.reads", { name: reader.name });
    verdictEl.textContent = t("flinder.meter.typing");
    verdictEl.className = "";
    let dots = typing(mine);
    const [r] = await Promise.all([brainReply(p, mine ? "swiper" : "match", mine ? smellOf(sender) : sender.traits, msg), wait(1000)]);
    dots.remove();
    if (r.reply === "dry") {                              // the tease: typing… stopped… typing…
      add({ me: mine, text: t("flinder.chat.stoppedTyping"), why: "", kind: "system", strong: false });
      await wait(700);
      dots = typing(mine);
      await wait(600);
      dots.remove();
    }
    setMeter({ heart: r.heart, vpo: 0 });
    setChatMeter(r);
    verdictEl.textContent = verdict(r.reply);
    verdictEl.className = r.reply === "flirt" ? "right" : "left";
    add({ me: mine, text: words(r.reply, reader, r.heart), why: WHY[r.reply](r), kind: r.reply, strong: r.heart >= CHAT.comeOn });
    sfx.tap();
    hearts[mine ? "me" : "them"] = r.heart;
    kinds.push(r.reply);
    msg = carried(r.reply, r.heart);
    end = ending(kinds);
    if (end) {
      chat.end = end;
      chat.endText = endLine(end, mine ? "me" : "them", p.name);
      if (end === "ghosted") add({ me: !mine, text: seenAt(), why: "", kind: "system", strong: false });
      if (shown === chat) chatEnd.textContent = chat.endText;
      chat.li.querySelector(".st")!.textContent = { date: "📍", ghosted: "👻", unmatched: "💔", texting: "💬" }[end];
      log(`<span class="m">${escapeHtml(chat.endText)}</span>`);
      if (end === "date") { store.add("dates"); bump("dates"); sfx.match(); } else sfx.sad();
      if (end === "ghosted" && !mine) bump("ghosted");
      if (end === "unmatched") bump("unmatched");
      // exes: a ghosting or an unmatch may text again a few swipes later
      if ((end === "ghosted" || end === "unmatched") && !ex && Math.random() < 0.4) exes.push({ p, due: stats.swipes + 4 + Math.floor(Math.random() * 6) });
    }
  }
  if (shown === chat) await fx.ending(end!, chatBody, [photoOf(me), photoOf(p)]);
  if (end === "date") await dateNight(chat, hearts);
  worker.postMessage({ type: "forget", id: p.id });
  await wait(700);
  chatBody.classList.remove("faded");
  if (shown === chat) { chatEl.hidden = true; shown = null; }
}

// ---- date night: both brains read each other up close ----------------------------------------------------
let dates: DateNight | null = null;
async function dateNight(chat: Chat, hearts: { me: number; them: number }): Promise<void> {
  const p = chat.p, me = swiper!;
  const full = (h: number) => ({ flirt: Math.max(carried("flirt", h).flirt, CHAT.flirtMax * 0.7), loom: 0 });
  const [a, b] = await Promise.all([
    brainReply(p, "swiper", smellOf(p), full(hearts.them)),
    brainReply(p, "match", me.traits, full(hearts.me)),
  ]);
  const end = dateEnd(a.reply, b.reply);
  const how = dateOutcome(end);
  chat.endText += ` → ${how}`;
  chat.li.querySelector(".msg")!.textContent = how;
  log(`<span class="m">${t("flinder.date.log", { how: escapeHtml(how) })}</span> <span class="dim">(${escapeHtml(me.name)} ${t(`flinder.reply.${a.reply}`)}, ${escapeHtml(p.name)} ${t(`flinder.reply.${b.reply}`)})</span>`);
  if (shown !== chat) return;
  const el = $("date");
  dates ??= new DateNight();
  if (!dates.renderer.domElement.parentElement) el.prepend(dates.renderer.domElement);
  $("date-title").textContent = `🌙 ${me.name} × ${p.name}`;
  $("date-line").textContent = "";
  el.hidden = false;
  dates.size(el.clientWidth || 300, el.clientHeight || 500);
  const play = dates.play(me.color, p.color, end, 4200 / speed);
  await wait(1500);
  $("date-line").textContent = how;
  if (end === "together") fx.burst(["💕", "💖", "✨"], 12, phoneEl.clientWidth / 2, phoneEl.clientHeight / 2, 160);
  if (end === "bailed") fx.burst(["💨", "💨", "😭"], 8, phoneEl.clientWidth * 0.7, phoneEl.clientHeight / 2, 140);
  if (end === "awkward") fx.runAcross("🦗", phoneEl.clientHeight * 0.7);
  if (end === "groomed") fx.burst(["🫧", "🧼", "🫧"], 10, phoneEl.clientWidth / 2, phoneEl.clientHeight / 2, 140);
  await play;
  await wait(1200);
  el.hidden = true;
}

// ---- an ex comes back ------------------------------------------------------------------------------------
async function exReturns(p: Profile): Promise<void> {
  worker.postMessage({ type: "revive", id: p.id, seed: p.seed });
  toast(`📩 ${p.name}: ${anyOf(["hey stranger 👀", "u up?", "…hi"])}`, 2200);
  fx.shake(phoneEl, "pulse");
  log(`<span class="m">${t("flinder.chat.exBack", { name: escapeHtml(p.name) })}</span>`);
  await wait(1400);
  const chat: Chat = { p, lines: [], end: null, endText: "", li: matchRow(p, "🔁"), ex: true };
  chat.li.onclick = () => openChat(chat, true);
  await runChat(chat, true);
}

// ---- one swipe -------------------------------------------------------------------------------------------
let nextSwat = 25 + Math.floor(Math.random() * 10);
async function swipeOne(): Promise<void> {
  const p = deck[0];
  meterName.textContent = p.name;
  verdictEl.textContent = t("flinder.meter.thinking");
  verdictEl.className = "";
  setMeter({ heart: 0, vpo: 0 });
  setChatMeter(null);
  for (const b of [likeBtn, nopeBtn, starBtn]) b.classList.remove("on");
  await tween(450, (k) => { leg.reach = ease(k); });
  leg.wiggle = 1;
  sfx.tap();
  leg.press = 1;
  // while the brain decides, the card leans the way pC1 is heading (on pace for the line or not)
  const from = drag.x;
  const [c] = await Promise.all([
    brainSwipe(p, (s) => {
      setMeter(s);
      const pace = s.heart / (READOUT.heart * s.t) - 1;
      drag.x = from + Math.max(-40, Math.min(40, pace * 60)) * Math.min(1, s.t * 2);
      portrait.excite = Math.max(0, Math.min(1, pace));
    }),
    wait(1100),
  ]);
  setMeter(c);
  lastSwipe = c.heart;
  leg.wiggle = 0;
  const right = c.choice === "right", superLike = c.heart >= READOUT.super;
  lastSuper = superLike;
  verdictEl.textContent = t(superLike ? "flinder.meter.superLikeV" : right ? "flinder.meter.rightV" : "flinder.meter.leftV");
  verdictEl.className = c.choice;
  (superLike ? starBtn : right ? likeBtn : nopeBtn).classList.add("on");
  store.add("swipes");
  bump("swipes");
  if (right) { store.add("rights"); bump("rights"); }
  if (superLike) bump("supers");
  const what = `<span class="${right ? "r" : "l"}">${t(superLike ? "flinder.swipe.super" : right ? "flinder.swipe.right" : "flinder.swipe.left")}</span>`;
  log(`${t("flinder.swipe.log", { what, name: escapeHtml(p.name) })} <span class="dim">(pC1 ${c.heart})</span>`);

  // the fly on the card reacts, then the leg flicks the card away and drops back out of sight
  portrait.react(right ? "happy" : "sad");
  const card = fx.at(deckEl);
  if (!right) fx.burst(["💧", "😢"], 5, card.x, card.y - 60, 60);
  if (superLike) { sfx.star(); fx.burst(["⭐", "🌟", "💙", "✨"], 16, card.x, card.y, 190); void fx.stamp(t("flinder.meter.superLikeV"), "super"); }
  await wait(superLike ? 700 : 380);
  sfx.swipe(right);
  fx.burst(right ? ["❤️", "💖", "😍", "🔥"] : ["💨", "🙄", "✕", "🥱"], right ? 10 : 7, card.x, card.y, 150);
  const sx = drag.x, dir = right ? 1 : -1, far = deckEl.clientWidth * 1.6;
  await tween(420, (k) => {
    const e = ease(k);
    if (superLike) { drag.x = sx * (1 - e); drag.y = -deckEl.clientHeight * 1.4 * e; }
    else { drag.x = sx + (dir * far - sx) * e; drag.y = 30 * e; }
    leg.reach = 1 - Math.max(0, (k - 0.4) / 0.6);
    leg.press = 1 - k;
  });
  cards.get(p.id)?.remove();
  cards.delete(p.id);
  deck.shift();
  drag.x = drag.y = 0;
  leg.reach = 0;
  fillDeck();
  for (const b of [likeBtn, nopeBtn, starBtn]) b.classList.remove("on");

  if (right) {
    toast(t("flinder.swipe.waiting", { name: p.name }), 5000);
    const back = await brainJudge(p, swiper!.traits);
    if (back.choice === "right") { toastEl.classList.remove("on"); await itsAMatch(p); }
    else {
      worker.postMessage({ type: "forget", id: p.id });
      sfx.sad();
      fx.shake();
      fx.burst(["💀", "😭", "💀"], 6, phoneEl.clientWidth / 2, 80, 110);
      const name = p.name;
      toast(anyOf([...[0, 1, 2].map((k) => t(`flinder.swipe.rejected.${k}`, { name })),
        t(superLike ? "flinder.swipe.ignoredSuper" : "flinder.swipe.ew", { name })]));
      log(`<span class="dim">${t("flinder.swipe.leftOn", { name: escapeHtml(p.name), swiper: escapeHtml(swiper!.name) })} (pC1 ${back.heart})</span>`);
    }
  }
  if (!exes.some((e) => e.p.id === p.id)) photos.delete(p.id);   // matches keep their <img>; exes need theirs later
  // now and then: the swatter
  if (stats.swipes >= nextSwat) {
    nextSwat = stats.swipes + 25 + Math.floor(Math.random() * 10);
    sfx.swat();
    await fx.swatter();
  }
  await wait(500);
}

// ---- controls --------------------------------------------------------------------------------------------
let running = false, looping = false;
async function loop(): Promise<void> {
  if (looping) return;
  looping = true;
  newBtn.disabled = true;
  while (running && brainReady) {
    while (reading) await wait(200);                      // a finished chat is open: wait for Back
    const due = exes.findIndex((e) => stats.swipes >= e.due);
    if (due >= 0) await exReturns(exes.splice(due, 1)[0].p);
    else await swipeOne();
  }
  looping = false;
  newBtn.disabled = false;
  startBtn.disabled = false;
}
startBtn.onclick = () => {
  if (!audio) { try { audio = new AudioContext(); } catch { audio = null; } }
  running = !running;
  startBtn.textContent = t(running ? "flinder.controls.pause" : "flinder.controls.keepGoing");
  if (running) {
    const r = box.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) box.scrollIntoView({ behavior: "smooth", block: "start" });
    void loop();
  } else if (looping) startBtn.disabled = true;     // finishes the swipe it's on
};
newBtn.onclick = () => {
  if (looping) return;
  newSwiper();
  history.replaceState(null, "", location.pathname);
  startBtn.textContent = t("flinder.controls.start");
  toast(t("flinder.swipe.meet", { name: swiper!.name }));
};
speedBtn.onclick = () => {
  speed = speed === 1 ? 2.5 : 1;
  speedBtn.textContent = t(speed === 1 ? "flinder.controls.speedNormal" : "flinder.controls.speedFast");
};
soundBtn.onclick = () => {
  muted = !muted;
  soundBtn.textContent = t(muted ? "flinder.controls.soundOff" : "flinder.controls.soundOn");
};

// ---- sharing ---------------------------------------------------------------------------------------------
$("share-card").onclick = async () => {
  if (!swiper) return;
  const blob = await statsCard(swiper, stats, swiperPic);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `flinder-${swiper.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$("share-x").onclick = () => {
  if (!swiper) return;
  const url = `https://x.com/intent/post?text=${encodeURIComponent(tweetText(swiper, stats))}&url=${encodeURIComponent(flyLink(swiper))}`;
  window.open(url, "_blank", "noopener");
};
$("share-link").onclick = async () => {
  if (!swiper) return;
  try { await navigator.clipboard.writeText(flyLink(swiper)); toast(t("flinder.swipe.copied")); }
  catch { prompt(t("flinder.swipe.sendLink"), flyLink(swiper)); }
};

// a friend's fly from a shared link, or a new one
const shared = flyFromHash(location.hash);
newSwiper(shared);
if (shared) toast(t("flinder.swipe.sharedFly", { name: shared.name }), 3000);
fillDeck();
showTally();
renderBoard();
