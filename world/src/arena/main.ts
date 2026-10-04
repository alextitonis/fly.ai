/**
 * Fly Colosseum's page. A season is one tournament of Trader Flies: registration is open for a day with a clock
 * counting down to the start, nobody can enter after it, then every fight is played and the top three claim the pot.
 * The page shows the current season (hero with clock, pot and prizes), your squad as trading cards (stats, entering,
 * potions, auras), the roster, and the bracket as a tree whose every fight opens a popup that replays it in the ring.
 * Past seasons stay one click away in the strip under the hero.
 *
 * The rules are game.ts and the stats are stats.ts, the same files the server plays by; the money and the seasons
 * live on the server (mine/src/arena.ts). Every fight of a season is played by the server on its own, nobody picks or
 * starts one: the page only shows them. Verify replays a fight on the real fly brains in a Web Worker on this machine
 * (brain.worker.ts), loaded only when someone asks for it; watching a stored fight needs no brain, the ring just plays
 * its events.
 *
 * Sign-in, wallet transactions and the API address are the compute site's own modules, loaded at run time from
 * /compute/ (the same account as Fly Roulette, Fly Slots, Fly Race and compute).
 */
import { BRONZE, fightLabel, fightRng, maxHp, playFight, roundsFor, setupFight, sha256Hex, type FightEvent } from "./game.ts";
import type { Counts } from "./readout.ts";
import { setupI18n, t } from "./i18n.ts";
import { Ring, type Fighter } from "./ring.ts";
import { AURAS } from "./shop.ts";
import { BACKGROUNDS, breakdown, COLORWAYS, EXTRAS, GEAR, MAX_POTIONS, POSES, POTION_IDS, POTIONS, RARITIES, RARITY_BONUS, STATS, statsOf,
  type PotionId, type Stat, type Stats, type Traits } from "./stats.ts";

// the page's language first: every text below is in it
await setupI18n();

/** The compute site's account module (mine/web/account.ts). */
interface Account {
  signedIn(): string | null;
  sessionHeaders(): Record<string, string>;
  onAccount(fn: (wallet: string | null) => void): void;
  signIn(): Promise<string | null>;
  signOut(): Promise<void>;
  transact(to: string, data: string, step?: (text: string) => void, chainId?: number): Promise<string>;
  mined(hash: string, chainId?: number): Promise<void>;
  errorText(err: unknown): string;
}
interface Config { on: boolean; contract: string | null; image: string; ledger?: string | null; rpc?: string; explorer?: string | null; potion_price?: string; potion_forever_price?: string; potions: { id: PotionId; name: string; add: Partial<Stats> }[]; max_potions: number }
interface Entrant {
  fly: number; wallet: string; traits: Traits; potions: PotionId[]; stats: Stats; hp: number; aura: string | null;
  place: number | null; prize: string | null; claimed: boolean; client_seed: string | null;
}
interface MatchRow { round: number; slot: number; a: number; b: number | null; winner: number; how: string; rounds: number }
/** the season's record on chain: transactions of the ledger contract (mine/src/arena.ts), once it is set up */
interface ChainRecord { commit_tx: string | null; result_tx: string | null; results_root: string | null }
interface Summary {
  id: string; season: number; name: string; status: "open" | "running" | "done" | "void"; entry: string; potion_price: string; fee_bps: number;
  min_entrants: number; max_entrants: number; max_per_wallet: number; opens_at: number; closes_at: number; done_at: number | null; entrants: number;
  pot: string; fee: string; prize_pool: string; places: (number | null)[] | null; commit_hash: string; digest: string | null; server_seed: string | null;
  fee_to?: string | null; fee_tx?: string | null;
  chain?: ChainRecord | null;
}
interface Tournament extends Summary {
  rounds: number; progress: { fought: number; fights: number } | null; entries: Entrant[]; matches: MatchRow[];
}
interface MyFly { fly: number; traits: Traits; potions: PotionId[]; stats: Stats; hp: number; entered: boolean; aura: string | null; auras: string[]; potions_owned: PotionId[] }
interface Me { wallet: string; balance: string; terms_accepted: boolean; flies: MyFly[]; prizes: { tournament: string; name: string; fly: number; place: number; prize: string }[] }
interface MatchView {
  tournament: string; round: number; slot: number; a: Entrant; b: Entrant; winner: number; how: string; seeds: [number, number] | null;
  events: FightEvent[]; server_seed: string; digest: string; commit_hash: string;
  /** where the fight sits in the season's posted results root (the contract decides, this is only the helper path) */
  chain: { season: number; leaf: string; proof: string[]; root: string } | null;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);
const fmt = (s: string | number) => Number(s).toLocaleString(undefined, { maximumFractionDigits: 2 });
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
const WEI = 10n ** 18n;
/** An amount as people type it ("90000", "90,000", "90 000", "90k", "1.5m") as a plain number of tokens, or null. */
function amountText(s: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?([km])?$/i.exec(s.trim().replace(/[\s,_']/g, ""));
  if (!m) return null;
  const shift = m[3] ? (m[3].toLowerCase() === "k" ? 3 : 6) : 0;
  const frac = (m[2] ?? "").padEnd(shift, "0");
  const whole = (m[1] + frac.slice(0, shift)).replace(/^0+(?=\d)/, ""), rest = frac.slice(shift).replace(/0+$/, "");
  return rest.length > 18 ? null : rest ? `${whole}.${rest}` : whole;
}
function toWei(s: string): bigint | null {
  const a = amountText(s);
  if (a === null) return null;
  const [w, f = ""] = a.split(".");
  return BigInt(w) * WEI + BigInt(f.padEnd(18, "0"));
}
class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
class Cancelled extends Error {}

// ---- the brains (a Web Worker): Verify only, loaded when it is asked for ---------------------------------------
type BrainState = "idle" | "loading" | "ready" | "failed";
let brainState: BrainState = "idle";
let worker: Worker | null = null;
let pending: { resolve: (c: Counts) => void; reject: (e: Error) => void } | null = null;
let brainLoad: Promise<void> | null = null;
/** where the loading progress is shown (the caller sets it) */
let brainNote: (text: string) => void = () => {};

function progressText(text: string): string {
  if (text === "wiring 25 M synapses") return t("colosseum.status.wiring");
  return text.replace(/^labels/, t("colosseum.status.labels")).replace(/^fly brain/, t("colosseum.status.brain"));
}
/** Starts the worker on the first call (the brain files are about 60 MB) and resolves when the brains are ready. */
function loadBrains(): Promise<void> {
  brainLoad ??= new Promise<void>((resolve, reject) => {
    const fail = () => {
      brainState = "failed";
      brainLoad = null;
      pending?.reject(new Error(t("colosseum.verify.noBrain")));
      pending = null;
      reject(new Error(t("colosseum.verify.noBrain")));
    };
    brainState = "loading";
    try {
      worker = new Worker(new URL("./brain.worker.ts", import.meta.url), { type: "module" });
      const base = new URL(import.meta.env.DEV ? `${import.meta.env.BASE_URL}connectome/` : "/simulation/connectome/", location.href).href;
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "progress") brainNote(t("colosseum.status.progress", { text: progressText(m.text) }));
        else if (m.type === "error") fail();
        else if (m.type === "ready") { brainState = "ready"; resolve(); }
        else if (m.type === "counts") {
          const p = pending;
          pending = null;
          p?.resolve({ charge: m.charge, escape: m.escape });
        }
      };
      worker.onerror = () => fail();
      worker.postMessage({ type: "load", base });
    } catch {
      fail();
    }
  });
  return brainLoad;
}
/** one round of one fly's brain, in the worker */
const brainRound = (side: 0 | 1, _round: number, scent: number, loom: number) => new Promise<Counts>((resolve, reject) => {
  if (!worker || brainState !== "ready") return reject(new Error(t("colosseum.verify.noBrain")));
  pending = { resolve, reject };
  worker.postMessage({ type: "round", side, scent, loom });
});

// ---- the account and the server ---------------------------------------------------------------------------
let API = "";
let acct: Account | null = null;
let cfg: Config | null = null;
let me: Me | null = null;
/** the latest season (the live one), and the one on show (the same, or a past one picked in the strip) */
let cur: Tournament | null = null;
let view: Tournament | null = null;
let viewId: string | null = null;
let seasons: Summary[] = [];
let chain: { token: string; pay_to: string; chain_id: number } | null = null;

async function api(path: string, body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(acct?.sessionHeaders() ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && acct?.signedIn()) {
    await acct.signOut();
    throw new ApiError(401, t("colosseum.bet.sessionExpired"));
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data;
}

const imageOf = (fly: number) => (import.meta.env.DEV ? `${import.meta.env.BASE_URL}flies/${fly}.webp` : cfg?.image ? cfg.image.replace("{id}", String(fly)) : null);
const flyName = (fly: number) => t("colosseum.fly.name", { id: fly });
const stand = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#101413'/><text x='50' y='66' font-size='52' text-anchor='middle'>🪰</text></svg>");
const img = (fly: number, alt = "") => `<img src="${esc(imageOf(fly) ?? stand)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${stand}'">`;
const strength = (s: Stats) => s.pow + s.grd + s.vit + s.fury;
const fighterOf = (e: { fly: number; hp: number; aura: string | null; stats?: Stats }): Fighter => ({ fly: e.fly, name: `#${e.fly}`, image: imageOf(e.fly), hp: e.hp, aura: e.aura, stats: e.stats });
const isMine = (wallet: string) => !!me && wallet.toLowerCase() === me.wallet.toLowerCase();
const STAT_ICON: Record<Stat, string> = { pow: "⚔", grd: "🛡", vit: "❤", fury: "🔥" };

// ---- the fight popup and the ring ----------------------------------------------------------------------------
const dlg = $<HTMLDialogElement>("fight-dlg");
const ring = new Ring($("ring"), {
  round: (n) => t("colosseum.ring.round", { n }),
  fury: t("colosseum.ring.fury"),
  end: (how, winner) => t(`colosseum.ring.${how}`, { name: winner }),
});
let speed = 1;
let ringBusy = false;
let playId = 0;
let shown: MatchView | null = null;
let last: { a: Fighter; b: Fighter; events: FightEvent[] } | null = null;
$("speed").onclick = () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  $("speed").textContent = t("colosseum.ring.speed", { x: speed });
};
$("speed").textContent = t("colosseum.ring.speed", { x: speed });

/** plays a fight in the ring; a newer one (or closing the popup) stops it */
async function playInRing(a: Fighter, b: Fighter, events: AsyncIterable<FightEvent> | Iterable<FightEvent>): Promise<void> {
  const id = ++playId;
  ringBusy = true;
  sync();
  const record: FightEvent[] = [];
  last = { a, b, events: record };
  async function* tap(): AsyncGenerator<FightEvent> {
    for await (const e of events as AsyncIterable<FightEvent>) { record.push(e); yield e; }
  }
  try {
    ring.set(a, b);
    await ring.play(tap(), () => speed);
  } finally {
    if (id === playId) { ringBusy = false; sync(); }
  }
}
function closePopup(): void {
  playId++;
  ring.stop();
  ringBusy = false;
  sync();
}
dlg.addEventListener("close", closePopup);
$("fd-close").onclick = () => dlg.close();
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
$("replay").onclick = () => { if (last && last.events.length) void playInRing(last.a, last.b, [...last.events]); };

const roundLabel = (round: number, rounds: number) => round === BRONZE ? t("colosseum.bracket.bronze") : round === rounds - 1 ? t("colosseum.bracket.final")
  : round === rounds - 2 ? t("colosseum.bracket.semi") : t("colosseum.ring.round", { n: round + 1 });

/** a stored tournament fight from the server, played in the popup */
async function openFight(round: number, slot: number): Promise<void> {
  const v = view;
  if (!v || v.status !== "done") return;
  let m: MatchView;
  try {
    m = await api(`/api/arena/tournaments/${v.id}/fights/${round}/${slot}`);
  } catch {
    return;
  }
  shown = m;
  $("fd-title").textContent = `${t("colosseum.season.label", { n: v.season })} · ${roundLabel(round, v.rounds)}`;
  $("fd-sub").textContent = `${flyName(m.a.fly)} vs ${flyName(m.b.fly)}`;
  $("verify-out").textContent = "";
  $("chain-out").textContent = "";
  if (!dlg.open) dlg.showModal();
  sync();
  await playInRing(fighterOf(m.a), fighterOf(m.b), m.events);
}

/**
 * Asks the ledger contract whether this fight, exactly as the page shows it, is part of the season's posted results.
 * The leaf is rebuilt here from the fight's own data (season, round, slot, both flies, winner, sha256 of the events),
 * the same way the server and the contract build it; the server's proof is only the path to the root, and the answer
 * comes from the chain (an eth_call of verifyFight on a public RPC), so a server that lied about a winner can't pass.
 */
const VERIFY_FIGHT = "0x7877b958";
const word256 = (n: number | bigint) => (BigInt.asUintN(256, BigInt(n))).toString(16).padStart(64, "0");
async function sha256Bytes(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", b as BufferSource);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function checkOnChain(): Promise<void> {
  const m = shown, out = $("chain-out"), v = view;
  if (!m || !v || !cfg?.ledger || !cfg.rpc) return;
  if (!m.chain) { out.textContent = t("colosseum.chain.notYet"); return; }
  out.textContent = t("colosseum.chain.asking");
  try {
    const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
    const bar = new TextEncoder().encode("|");
    const parts = [word256(v.season), word256(m.round), word256(m.slot), word256(m.a.fly), word256(m.b.fly), word256(m.winner)].map(hexBytes);
    const eventsHash = hexBytes(await sha256Bytes(new TextEncoder().encode(JSON.stringify(m.events))));
    const pieces: Uint8Array[] = [];
    parts.forEach((p) => { pieces.push(p, bar); });
    pieces.push(eventsHash);
    const all = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of pieces) { all.set(p, at); at += p.length; }
    const leaf = await sha256Bytes(all);
    const data = `${VERIFY_FIGHT}${word256(v.season)}${word256(0x60)}${leaf}${word256(m.chain.proof.length)}${m.chain.proof.join("")}`;
    const res = await fetch(cfg.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: cfg.ledger, data }, "latest"] }) });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message ?? "the chain refused");
    const ok = BigInt(body.result) === 1n;
    const link = cfg.explorer ? ` <a href="${esc(cfg.explorer)}/address/${esc(cfg.ledger)}" target="_blank" rel="noopener">${t("colosseum.chain.contract")}</a>` : "";
    out.innerHTML = ok ? `✓ ${t("colosseum.chain.ok", { n: v.season })}${link}` : `✗ ${t("colosseum.chain.bad", { n: v.season })}${link}`;
  } catch (err) {
    out.textContent = t("colosseum.chain.error", { text: String((err as Error).message) });
  }
}
$("chaincheck").onclick = () => void checkOnChain();

/** Verify: the revealed seeds, replayed on this machine's brains, must give the server's fight round by round. */
async function verify(): Promise<void> {
  const m = shown, out = $("verify-out");
  if (!m || ringBusy) return;
  if (!m.server_seed) { out.textContent = t("colosseum.verify.notYet"); return; }
  if ((await sha256Hex(m.server_seed)) !== m.commit_hash) { out.textContent = t("colosseum.verify.badSeed"); return; }
  ringBusy = true;
  sync();
  try {
    brainNote = (text) => { out.textContent = t("colosseum.verify.loading", { text }); };
    out.textContent = t("colosseum.verify.loading", { text: "" });
    await loadBrains();
    out.textContent = t("colosseum.verify.start");
    const rng = await fightRng(m.server_seed, m.digest, fightLabel(m.round, m.slot));
    const { seeds } = setupFight(rng);
    let same = JSON.stringify(seeds) === JSON.stringify(m.seeds);
    worker!.postMessage({ type: "fight", seeds });
    const n = m.events.length - 1;
    let k = 0;
    for await (const e of playFight([m.a.stats, m.b.stats], rng, brainRound)) {
      if (JSON.stringify(e) !== JSON.stringify(m.events[k])) { same = false; break; }
      k++;
      if (e.type === "round") out.textContent = t("colosseum.verify.progress", { k, n });
    }
    out.textContent = same && k === m.events.length ? t("colosseum.verify.ok", { n }) : t("colosseum.verify.diff", { k: k + 1 });
  } catch (err) {
    out.textContent = String((err as Error).message);
  } finally {
    ringBusy = false;
    sync();
  }
}
$("verify").onclick = () => void verify();

// ---- the hero: season, clock, pot, prizes ---------------------------------------------------------------------
function clockParts(ms: number): [string, string, string, string] {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return [p(Math.floor(s / 86400)), p(Math.floor((s % 86400) / 3600)), p(Math.floor((s % 3600) / 60)), p(s % 60)];
}

/** "on chain" links for a season's record (the ledger contract's posts) and the transfer of its house fee to the dev wallet */
function chainLine(v: Summary): string {
  const link = (tx: string | null | undefined, label: string) => tx ? (cfg?.explorer ? `<a href="${esc(cfg.explorer)}/tx/${esc(tx)}" target="_blank" rel="noopener">${label}</a>` : `<span title="${esc(tx)}">${label}</span>`) : "";
  const c = v.chain;
  const posts = c ? [link(c.commit_tx, t("colosseum.chain.commit")), link(c.result_tx, t("colosseum.chain.result"))].filter(Boolean) : [];
  const out: string[] = [];
  if (posts.length) out.push(`<p class="note" style="margin:10px 0 0">⛓ ${t("colosseum.chain.title")}: ${posts.join(" · ")}</p>`);
  if (v.fee_tx) out.push(`<p class="note" style="margin:6px 0 0">💰 ${t("colosseum.chain.fee", { amount: fmt(v.fee) })}: ${link(v.fee_tx, t("colosseum.chain.transfer"))}</p>`);
  return out.join("");
}

function pedestals(v: Tournament): string {
  const has3 = v.entrants >= 4 || v.places?.[2] != null;
  const bps = has3 ? [6000, 2500, 1500] : [7000, 3000];
  const prize = (k: number) => {
    const e = v.places?.[k] != null ? v.entries.find((x) => x.fly === v.places![k]) : null;
    if (e?.prize) return fmt(e.prize);
    return k < bps.length ? fmt((Number(v.prize_pool) * bps[k]) / 10_000) : "-";
  };
  const slot = (k: number) => {
    const fly = v.places?.[k] ?? null;
    return `<div class="p${k + 1}"><span class="medal">${["1ST", "2ND", "3RD"][k]}</span>${fly != null ? img(fly, flyName(fly)) : `<span class="q">?</span>`}<b><span class="coin"></span>${prize(k)}</b>${fly != null ? `<small>#${fly}</small>` : ""}</div>`;
  };
  return `<div class="ped">${slot(1)}${slot(0)}${has3 || v.places?.[2] != null ? slot(2) : "<div></div>"}</div>`;
}

function renderHero(): void {
  const el = $("hero");
  if (!cfg) { el.innerHTML = `<p class="notice">${t("colosseum.bet.loading")}</p>`; return; }
  if (!cfg.on) { el.innerHTML = `<div class="crest">${t("colosseum.head.crest")}</div><h1>${t("colosseum.head.title")}</h1><p class="lead">${t("colosseum.t.closed")}</p>`; return; }
  const v = view;
  if (!v) {
    el.innerHTML = `<div class="crest">${t("colosseum.head.crest")}</div><h1>${t("colosseum.season.first")}</h1><span class="tag open"><i></i>${t("colosseum.hero.soon")}</span><p class="lead" style="margin-top:12px">${t("colosseum.head.sub")}</p>`;
    return;
  }
  const live = v.id === cur?.id;
  const season = `${t("colosseum.season.word")} <span>${v.season}</span>`;
  const lead = v.status === "open" ? t("colosseum.hero.leadOpen") : v.status === "running" ? t("colosseum.hero.leadRunning")
    : v.status === "done" ? t("colosseum.hero.leadDone") : t("colosseum.hero.leadVoid");
  let right = "";
  if (v.status === "open") {
    right = `<div><div class="clock-cap">${t("colosseum.hero.startsIn")}</div><div class="clock">${["d", "h", "m", "s"].map((k) => `<div><b id="cd-${k}">--</b><small>${t(`colosseum.hero.${k}`)}</small></div>`).join("")}</div></div>`;
  } else if (v.status === "running") {
    const pr = v.progress;
    right = `<div><div class="clock-cap">${t("colosseum.hero.fighting")}</div><div class="prog"><i style="width:${pr ? (100 * pr.fought / Math.max(1, pr.fights)).toFixed(1) : 0}%"></i></div>${pr ? `<p class="note" style="margin:6px 0 0;text-align:right">${t("colosseum.t.progress", pr)}</p>` : ""}</div>`;
  } else if (v.status === "done" && v.places?.[0] != null) {
    const w = v.entries.find((x) => x.fly === v.places![0]);
    right = `<div class="champ">${img(v.places[0], flyName(v.places[0]))}<div><small>${t("colosseum.hero.champion")}</small><b>${esc(flyName(v.places[0]))}</b><span>${w?.prize ? `${fmt(w.prize)} $FLYAI` : ""}</span></div></div>`;
  }
  const signed = !!acct?.signedIn();
  const cta = v.status === "open" && live
    ? `<div class="hero-cta">${signed ? `<button class="gbtn gold" type="button" id="cta-squad">${t("colosseum.hero.choose")}</button>` : `<button class="gbtn gold" type="button" id="cta-signin" data-nav-signin>${t("colosseum.bet.signIn")}</button>`}<p class="note">${t("colosseum.hero.noEntry")}</p></div>` : "";
  el.innerHTML = `
    <div class="hero-top">
      <div>
        <div class="crest">${t("colosseum.head.crest")}${live ? "" : ` · ${t("colosseum.season.archive")}`}</div>
        <h1>${season}</h1>
        <span class="tag ${v.status}"><i></i>${t(`colosseum.t.${v.status}`)}</span>
        <p class="lead" style="margin-top:12px">${lead}</p>
      </div>
      ${right}
    </div>
    <div class="tiles">
      <div class="tile"><small>${t("colosseum.t.entry")}</small><b><span class="coin"></span>${fmt(v.entry)}</b></div>
      <div class="tile pot"><small>${t("colosseum.t.pot")}</small><b><span class="coin"></span>${fmt(v.pot)}</b></div>
      <div class="tile"><small>${t("colosseum.t.entrants")}</small><b>${v.entrants}<em>/ ${v.max_entrants}</em></b></div>
      <div class="tile"><small>${t("colosseum.t.feeShort")}</small><b>${v.fee_bps / 100}%</b></div>
    </div>
    ${pedestals(v)}
    ${cta}
    <p class="note" style="margin:12px 0 0">${t("colosseum.t.min", { n: v.min_entrants })} · ${t("colosseum.t.perWallet", { n: v.max_per_wallet })} · ${t("colosseum.t.potionPrice", { price: fmt(v.potion_price) })}${cfg?.potion_forever_price ? ` · ${t("colosseum.t.potionForever", { price: fmt(cfg.potion_forever_price) })}` : ""}</p>
    ${chainLine(v)}
    <p class="kv note mono" style="margin:10px 0 0;word-break:break-all"><span>${t("colosseum.t.commit")}:</span> ${esc(v.commit_hash)}${v.digest ? `<br><span>${t("colosseum.t.digest")}:</span> ${esc(v.digest)}` : ""}${v.server_seed ? `<br><span>${t("colosseum.t.seed")}:</span> ${esc(v.server_seed)}` : ""}</p>`;
  $("cta-squad")?.addEventListener("click", () => $("squad-card").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("cta-signin")?.addEventListener("click", () => $("bet-signin").click());
  tick();
}
function tick(): void {
  if (!view || view.status !== "open") return;
  const parts = clockParts(view.closes_at - Date.now());
  ["d", "h", "m", "s"].forEach((k, i) => { const e = document.getElementById(`cd-${k}`); if (e) e.textContent = parts[i]; });
}
setInterval(tick, 1000);

function renderSeasons(): void {
  const el = $("seasons");
  el.hidden = seasons.length < 2;
  el.innerHTML = seasons.map((s) => {
    const live = s.id === cur?.id;
    return `<button class="season${s.id === view?.id ? " on" : ""}${live ? " live" : ""}${s.status === "done" ? " done" : ""}" type="button" role="tab" aria-selected="${s.id === view?.id}" data-id="${s.id}"><b>${t("colosseum.season.label", { n: s.season })}</b><small>${live && (s.status === "open" || s.status === "running") ? t("colosseum.season.live") : t(`colosseum.t.${s.status}`)}</small></button>`;
  }).join("");
  el.querySelectorAll<HTMLButtonElement>("button.season").forEach((b) => { b.onclick = () => void selectSeason(b.dataset.id!); });
}

async function selectSeason(id: string): Promise<void> {
  viewId = id === cur?.id ? null : id;
  if (!viewId) view = cur;
  else {
    try { view = await api(`/api/arena/tournaments/${id}`); } catch { return; }
  }
  renderAll();
}

// ---- roster and the bracket tree ---------------------------------------------------------------------------------
function renderRoster(): void {
  const list = view?.entries ?? [];
  $("ents").innerHTML = list.length ? list.map((e) => `<div class="rent r${e.traits.rarity}${isMine(e.wallet) ? " mine" : ""}"><div class="in">${img(e.fly, flyName(e.fly))}<b>#${e.fly}</b><small>⚡ ${strength(e.stats)}${e.potions.length ? ` · +${e.potions.length}🧪` : ""}</small></div></div>`).join("")
    : `<p class="notice" style="grid-column:1 / -1">${t("colosseum.entrants.none")}</p>`;
}

function drawLinks(tree: HTMLElement, done: boolean): void {
  tree.querySelector("svg.links")?.remove();
  const box = tree.getBoundingClientRect();
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "links");
  svg.setAttribute("width", String(tree.scrollWidth));
  svg.setAttribute("height", String(tree.scrollHeight));
  tree.querySelectorAll<HTMLElement>("[data-r]").forEach((n) => {
    const r = Number(n.dataset.r), s = Number(n.dataset.s);
    const p = tree.querySelector<HTMLElement>(`[data-r="${r + 1}"][data-s="${Math.floor(s / 2)}"]`);
    if (!p || r < 0) return;
    const a = n.getBoundingClientRect(), b = p.getBoundingClientRect();
    const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
    const mid = (x1 + x2) / 2;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", `M${x1} ${y1} H${mid} V${y2} H${x2}`);
    if (done) path.setAttribute("class", "win");
    svg.appendChild(path);
  });
  tree.prepend(svg);
}

function renderBracket(): void {
  const el = $("bracket");
  const v = view;
  if (!v) { el.innerHTML = `<p class="notice">${t("colosseum.bracket.wait")}</p>`; return; }
  const done = v.status === "done";
  const rounds = v.rounds || roundsFor(Math.max(2, v.entrants));
  const seats = 2 ** (rounds - 1);
  const byKey = new Map(v.matches.map((m) => [`${m.round}:${m.slot}`, m]));
  const fly = new Map(v.entries.map((e) => [e.fly, e]));
  const row = (f: number | null, m: MatchRow | null): string => {
    if (f === null) return `<div class="row tbd"><span>${done ? t("colosseum.bracket.bye") : "?"}</span></div>`;
    const e = fly.get(f);
    const cls = m ? (m.winner === f ? "w" : "l") : "";
    return `<div class="row ${cls}${e && isMine(e.wallet) ? " mine" : ""}">${img(f)}<span>#${f}</span></div>`;
  };
  const node = (r: number, s: number, m: MatchRow | null, gold = false): string => {
    if (!done || !m) return `<div class="bnode" data-r="${r}" data-s="${s}"><div class="row tbd"><span>?</span></div><div class="row tbd"><span>?</span></div></div>`;
    if (m.b === null) return `<div class="bnode bye" data-r="${r}" data-s="${s}">${row(m.a, m)}${row(null, null)}</div>`;
    return `<button class="bnode${gold ? " gold" : ""}" type="button" data-r="${r}" data-s="${s}" data-fight="${m.round}:${m.slot}">${row(m.a, m)}${row(m.b, m)}<div class="foot"><span>${t(`colosseum.bracket.${m.how}`)}</span><b>▶ ${t("colosseum.bracket.watch")}</b></div></button>`;
  };
  let cols = "";
  for (let r = 0; r < rounds; r++) {
    const count = Math.max(1, seats >> r);
    let nodes = "";
    for (let s = 0; s < count; s++) nodes += node(r, s, byKey.get(`${r}:${s}`) ?? null, r === rounds - 1);
    const bronze = r === rounds - 1 && byKey.has(`${BRONZE}:0`) ? `<div class="bronze"><h3>${t("colosseum.bracket.bronze")}</h3>${node(BRONZE, 0, byKey.get(`${BRONZE}:0`)!)}</div>` : "";
    cols += `<div class="tcol"><h3>${roundLabel(r, rounds)}</h3><div class="nodes">${nodes}</div>${bronze}</div>`;
  }
  el.innerHTML = `${done ? `<p class="note" style="margin-top:0">${t("colosseum.bracket.hint")}</p>` : ""}<div class="tree-wrap"><div class="tree${done ? "" : " locked"}" id="tree">${cols}</div></div>${done ? "" : `<p class="lockcap">${t("colosseum.bracket.wait")}</p>`}`;
  el.querySelectorAll<HTMLButtonElement>("button[data-fight]").forEach((b) => {
    b.onclick = () => { const [r, s] = b.dataset.fight!.split(":").map(Number); void openFight(r, s); };
  });
  const tree = $("tree");
  requestAnimationFrame(() => drawLinks(tree, done));
}
new ResizeObserver(() => { const tr = document.getElementById("tree"); if (tr) drawLinks(tr, view?.status === "done"); }).observe(document.body);

/** What can be bought, and how: potions for one season, auras for good. Both are paid from the on-site balance on a fly's card. */
function renderShop(): void {
  const el = $("shop");
  el.className = "shop";
  const potionPrice = cfg?.potion_price ?? cur?.potion_price ?? view?.potion_price ?? null;
  const foreverPrice = cfg?.potion_forever_price ?? null;
  el.innerHTML = `
    <h3>${t("colosseum.shop.potions")}</h3>
    <p>${t("colosseum.shop.potionsText", { max: MAX_POTIONS })}</p>
    <ul>${POTION_IDS.map((p) => `<li><b>🧪 ${esc(POTIONS[p].name)}</b><span>${Object.entries(POTIONS[p].add).map(([k, v]) => `+${v} ${STAT_ICON[k as Stat]}`).join(" ")}</span></li>`).join("")}</ul>
    <ul>
      <li><b>${t("colosseum.shop.oneSeason")}</b><span>${potionPrice !== null ? fmt(potionPrice) : "-"}</span></li>
      <li><b>${t("colosseum.shop.forGood")} <span class="forever">∞</span></b><span>${foreverPrice !== null ? fmt(foreverPrice) : "-"}</span></li>
    </ul>
    <p>${t("colosseum.shop.forGoodText")}</p>
    <h3>${t("colosseum.shop.auras")} <span class="forever">${t("colosseum.shop.forever")}</span></h3>
    <p>${t("colosseum.shop.aurasText")}</p>
    <ul>${AURAS.map((a) => `<li><i class="dot" style="--a1:${a.colors[0]}; --a2:${a.colors[1]}"></i><b>${esc(a.name)}</b><span>${fmt(a.price)}</span></li>`).join("")}</ul>
    <p class="note">${t("colosseum.shop.where")}</p>`;
}

// ---- your squad: trading cards -----------------------------------------------------------------------------------
const picked = new Map<number, Set<PotionId>>();
const flyMsg = new Map<number, string>();
let acting = false;

const bar = (k: Stat, v: number) => `<div class="sb ${k}"><span class="ic" title="${t(`colosseum.fly.${k}`)}">${STAT_ICON[k]}</span><span class="bar"><i style="width:${Math.min(100, (100 * v) / 30)}%"></i></span><b>${v}</b></div>`;

function flyCard(f: MyFly): string {
  const open = !!cur && cur.status === "open" && cur.closes_at > Date.now();
  const sel = picked.get(f.fly) ?? new Set<PotionId>();
  const shownStats = f.entered ? f.stats : statsOf(f.traits, [...sel]);
  const lines = breakdown(f.traits, f.entered ? f.potions : [...sel]);
  const potionPrice = cur ? Number(cur.potion_price) : 0;
  const forever = f.potions_owned ?? [];
  const foreverPrice = cfg?.potion_forever_price ?? null;
  // a potion the fly owns for good is free to add; the others are single-use (this season only)
  const chipLabel = (p: PotionId) => forever.includes(p) ? `${esc(POTIONS[p].name)} · ∞ ${t("colosseum.fly.free")}` : `${esc(POTIONS[p].name)} · ${fmt(potionPrice)}`;
  let action = "";
  if (f.entered) {
    const left = POTION_IDS.filter((p) => !f.potions.includes(p));
    action = `<div><h4>${t("colosseum.fly.in")}</h4><div class="chips">${f.potions.map((p) => `<span class="chipb own">🧪 ${esc(POTIONS[p].name)}${forever.includes(p) ? " ∞" : ""}</span>`).join("")}${
      open && f.potions.length < MAX_POTIONS ? left.map((p) => `<button class="chipb" type="button" data-buy="${f.fly}:${p}"${acting ? " disabled" : ""}>+ ${chipLabel(p)}</button>`).join("") : ""}</div></div>`;
  } else if (open) {
    const cost = Number(cur!.entry) + potionPrice * [...sel].filter((p) => !forever.includes(p)).length;
    action = `<div><h4>${t("colosseum.fly.potions", { max: MAX_POTIONS })}</h4><div class="chips">${POTION_IDS.map((p) => `<button class="chipb${sel.has(p) ? " on" : ""}" type="button" data-pick="${f.fly}:${p}"${acting ? " disabled" : ""}>🧪 ${chipLabel(p)}</button>`).join("")}</div></div>
      <button class="gbtn gold wide" type="button" data-enter="${f.fly}"${acting ? " disabled" : ""}>${t("colosseum.fly.enter", { cost: fmt(cost) })}</button>`;
  } else if (cur?.status === "open") {
    action = `<p class="note" style="margin:0">${t("colosseum.fly.closed")}</p>`;
  } else {
    action = `<p class="note" style="margin:0">${t("colosseum.fly.noSeason")}</p>`;
  }
  const forGood = foreverPrice === null ? "" : `<details><summary>${t("colosseum.fly.potionsForGood")}</summary><div class="chips" style="margin-top:8px">${POTION_IDS.map((p) => forever.includes(p)
    ? `<span class="chipb own">🧪 ${esc(POTIONS[p].name)} ∞</span>`
    : `<button class="chipb" type="button" data-forever="${f.fly}:${p}"${acting ? " disabled" : ""}>🧪 ${esc(POTIONS[p].name)} · ${t("colosseum.fly.buyForGood", { price: fmt(foreverPrice) })}</button>`).join("")}</div>
    <p class="note" style="margin:6px 0 0">${t("colosseum.fly.forGoodNote")}</p></details>`;
  const auras = `<details><summary>${t("colosseum.fly.auras")}</summary><div class="chips" style="margin-top:8px">${AURAS.map((a) => {
    const own = f.auras.includes(a.id), worn = f.aura === a.id;
    const dot = `<i class="dot" style="--a1:${a.colors[0]}; --a2:${a.colors[1]}"></i>`;
    return own ? `<button class="chipb${worn ? " on" : ""}" type="button" data-wear="${f.fly}:${a.id}"${acting ? " disabled" : ""}>${dot}${esc(a.name)}${worn ? ` · ${t("colosseum.fly.worn")}` : ""}</button>`
      : `<button class="chipb" type="button" data-aura="${f.fly}:${a.id}"${acting ? " disabled" : ""}>${dot}${esc(a.name)} · ${fmt(a.price)}</button>`;
  }).join("")}${f.aura ? `<button class="chipb" type="button" data-wear="${f.fly}:"${acting ? " disabled" : ""}>${t("colosseum.fly.off")}</button>` : ""}</div>
    <p class="note" style="margin:6px 0 0">${t("colosseum.fly.auraLook")}</p></details>`;
  return `<div class="tcg r${f.traits.rarity}${f.entered ? " in-arena" : ""}"><div class="in">
    <div class="art">${img(f.fly, flyName(f.fly))}<span class="str">⚡ ${strength(shownStats)}</span><span class="rar">${esc(RARITIES[f.traits.rarity])}</span>${f.entered ? `<span class="ribbon">${t("colosseum.fly.entered")}</span>` : ""}</div>
    <div class="nm"><b>#${f.fly}</b><small>${t("colosseum.fly.hp", { hp: maxHp(shownStats) })}</small></div>
    <div class="pose">${esc(POSES[f.traits.pose][0])}</div>
    <div class="sbars">${STATS.map((k) => bar(k, shownStats[k])).join("")}</div>
    <details><summary>${t("colosseum.fly.where")}</summary><ul>${lines.map((l) => `<li><span>${esc(l.name)}</span><span class="mono">${STATS.filter((k) => l.add[k]).map((k) => `+${l.add[k]} ${STAT_ICON[k]}`).join(" ") || "-"}</span></li>`).join("")}</ul></details>
    ${action}${forGood}${auras}
    <p class="fmsg">${esc(flyMsg.get(f.fly) ?? "")}</p>
  </div></div>`;
}

function renderMine(): void {
  const el = $("mine");
  if (!acct?.signedIn() || !me) { el.innerHTML = `<p class="notice">${t("colosseum.fly.signIn")}</p>`; return; }
  el.innerHTML = me.flies.length ? `<div class="cards">${me.flies.map(flyCard).join("")}</div>` : `<p class="notice">${t("colosseum.fly.none")}</p>`;
  el.querySelectorAll<HTMLElement>("[data-pick]").forEach((b) => {
    b.onclick = () => {
      const [fly, p] = b.dataset.pick!.split(":");
      const set = picked.get(Number(fly)) ?? new Set<PotionId>();
      if (set.has(p as PotionId)) set.delete(p as PotionId);
      else if (set.size < MAX_POTIONS) set.add(p as PotionId);
      picked.set(Number(fly), set);
      renderMine();
    };
  });
  const act = (attr: string, run: (fly: number, arg: string) => Promise<void>) => el.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((b) => {
    b.onclick = () => {
      const [fly, arg] = b.getAttribute(attr)!.split(":");
      void doAct(Number(fly), () => run(Number(fly), arg));
    };
  });
  act("data-enter", (fly) => enter(fly));
  act("data-buy", async (fly, p) => { await api("/api/arena/potion", { fly, potion: p }); });
  act("data-aura", async (fly, aura) => { await api("/api/arena/aura", { fly, aura }); });
  act("data-forever", async (fly, p) => { await api("/api/arena/potion-forever", { fly, potion: p }); });
  act("data-wear", async (fly, aura) => { await api("/api/arena/wear", { fly, aura: aura || null }); });
}

async function doAct(fly: number, run: () => Promise<void>): Promise<void> {
  if (acting) return;
  acting = true;
  flyMsg.set(fly, "");
  renderMine();
  try {
    await run();
  } catch (err) {
    if (!(err instanceof Cancelled)) flyMsg.set(fly, String((err as Error).message));
  } finally {
    acting = false;
    await refresh();
  }
}

async function enter(fly: number): Promise<void> {
  if (!me) return;
  if (!me.terms_accepted) {
    if (!(await acceptTerms())) throw new Cancelled();
    me.terms_accepted = true;
  }
  await api("/api/arena/enter", { fly, client_seed: randomHex(16), potions: [...(picked.get(fly) ?? [])] });
  picked.delete(fly);
}

// ---- terms, prizes, deposits ---------------------------------------------------------------------------------
function acceptTerms(): Promise<boolean> {
  const d = $<HTMLDialogElement>("terms-dlg");
  const age = $<HTMLInputElement>("terms-18"), ok = $<HTMLInputElement>("terms-ok"), go = $<HTMLButtonElement>("terms-go");
  age.checked = ok.checked = false;
  go.disabled = true;
  const syncGo = () => { go.disabled = !(age.checked && ok.checked); };
  age.onchange = ok.onchange = syncGo;
  d.showModal();
  return new Promise((resolve) => {
    d.oncancel = () => resolve(false);
    $("terms-cancel").onclick = () => { d.close(); resolve(false); };
    go.onclick = async () => {
      go.disabled = true;
      try {
        // Fly Roulette's terms: one acceptance covers every game
        await api("/api/roulette/terms", { over18: true, accept: true });
        d.close();
        resolve(true);
      } catch (err) {
        $("terms-msg").textContent = String((err as Error).message);
        syncGo();
      }
    };
  });
}

function renderPrizes(): void {
  const list = me?.prizes ?? [];
  $("prize-card").hidden = !list.length;
  $("prizes").innerHTML = list.map((p) => `<li><span>${esc(t("colosseum.prize.row", { name: p.name, place: t(`colosseum.t.p${p.place}`), fly: p.fly, prize: fmt(p.prize) }))}</span></li>`).join("");
}
$("claim").onclick = async () => {
  const btn = $<HTMLButtonElement>("claim");
  btn.disabled = true;
  try {
    const r = await api("/api/arena/claim", {});
    $("claim-msg").textContent = t("colosseum.prize.claimed", { amount: fmt(r.claimed) });
  } catch (err) {
    $("claim-msg").textContent = String((err as Error).message);
  } finally {
    btn.disabled = false;
    await refreshMe();
  }
};

function showAccount(): void {
  const wallet = acct?.signedIn() ?? null;
  $("bet-out").hidden = !!wallet || !acct;
  $("bet-in").hidden = !wallet;
  if (wallet && me) {
    $("bet-who").textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
    $("bet-balance").textContent = `${fmt(me.balance)} FLYAI`;
  }
}

async function deposit(): Promise<void> {
  const amountEl = $<HTMLInputElement>("dep-amount"), status = $("dep-status");
  const wei = toWei(amountEl.value);
  if (!wei || wei <= 0n) { status.textContent = t("colosseum.bet.enterAmount"); return; }
  if (!acct || !chain) return;
  const btn = $<HTMLButtonElement>("dep-go");
  btn.disabled = true;
  try {
    const data = `0xa9059cbb${chain.pay_to.slice(2).toLowerCase().padStart(64, "0")}${wei.toString(16).padStart(64, "0")}`;
    const tx = await acct.transact(chain.token, data, (text) => { status.textContent = text; }, chain.chain_id);
    status.textContent = t("colosseum.bet.mining");
    await acct.mined(tx, chain.chain_id);
    for (let i = 0; ; i++) {
      try {
        const r = await api("/api/balance/deposit", { tx });
        status.textContent = t("colosseum.bet.deposited", { amount: fmt(r.deposited) });
        break;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409 && /mined/.test(err.message)) || i > 20) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    amountEl.value = "";
    await refreshMe();
  } catch (err) {
    status.textContent = acct.errorText(err);
  } finally {
    btn.disabled = false;
  }
}
async function withdraw(): Promise<void> {
  const amountEl = $<HTMLInputElement>("wd-amount"), status = $("wd-status");
  const amount = amountText(amountEl.value);
  if (!amount || !toWei(amount)) { status.textContent = t("colosseum.bet.enterAmount"); return; }
  try {
    await api("/api/balance/withdraw-request", { amount });
    status.textContent = t("colosseum.bet.withdrawOk");
    amountEl.value = "";
    await refreshMe();
  } catch (err) {
    status.textContent = String((err as Error).message);
  }
}

// ---- keeping the page current ------------------------------------------------------------------------------
/** the buttons that depend on the brains and on whether the ring is busy */
function sync(): void {
  const v = $<HTMLButtonElement>("verify");
  v.hidden = !shown;
  v.disabled = ringBusy;
  $("chaincheck").hidden = !shown || !cfg?.ledger;
}

function renderAll(): void {
  renderHero();
  renderSeasons();
  renderMine();
  renderRoster();
  renderBracket();
  renderPrizes();
  renderShop();
}

async function refreshMe(): Promise<void> {
  if (!acct?.signedIn()) me = null;
  else {
    try { me = await api("/api/arena/me"); } catch (err) { me = null; $("bet-msg").textContent = String((err as Error).message); }
  }
  showAccount();
  renderAll();
}
async function refreshCurrent(): Promise<void> {
  const key = (x: Tournament | null) => (x ? `${x.id}:${x.status}:${x.entrants}:${x.pot}:${x.progress?.fought ?? ""}` : "");
  const before = key(cur);
  try {
    cur = (await api("/api/arena/current")).tournament;
    seasons = (await api("/api/arena/tournaments")).tournaments;
  } catch { return; }
  if (!viewId) view = cur;
  if (before === key(cur) && $("hero").children.length) return;
  renderAll();
}
async function refresh(): Promise<void> {
  await refreshCurrent();
  await refreshMe();
}

/** the stat tables the rules use, printed so anyone can work a fly's stats out by hand */
function renderTables(): void {
  const add = (a: Partial<Stats>) => STATS.filter((k) => a[k]).map((k) => `+${a[k]} ${t(`colosseum.fly.${k}`)}`).join(", ") || "-";
  const table = (title: string, rows: [string, string][]) => `<div><h4>${title}</h4><table>${rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>`;
  $("tables").innerHTML = [
    table(t("colosseum.how.tRarity"), RARITIES.map((r, i) => [r, `+${RARITY_BONUS[i]}`])),
    table(t("colosseum.how.tPose"), POSES.map(([n, a]) => [n, add(a)])),
    table(t("colosseum.how.tColor"), COLORWAYS.flatMap((row, r) => row.map((n, i): [string, string] => [`${RARITIES[r]}: ${n}`, `+4 ${t(`colosseum.fly.${STATS[i]}`)}`]))),
    table(t("colosseum.how.tBg"), BACKGROUNDS.map(([n, a]) => [n, add(a)])),
    table(t("colosseum.how.tGear"), GEAR.map(([n, a]) => [n, add(a)])),
    table(t("colosseum.how.tExtra"), EXTRAS.map(([n, a]) => [n, add(a)])),
    table(t("colosseum.how.tPotion"), POTION_IDS.map((p) => [POTIONS[p].name, add(POTIONS[p].add)])),
  ].join("");
}

// ---- start ------------------------------------------------------------------------------------------------
async function start(): Promise<void> {
  const offEl = $("bet-off");
  renderTables();
  renderAll();
  sync();
  try {
    const config = await import(/* @vite-ignore */ new URL("/compute/mine/web/config.js", location.href).href);
    API = import.meta.env.DEV ? "" : config.API;
    cfg = await api("/api/arena/config");
    if (!cfg!.on) { offEl.textContent = t("colosseum.bet.closed"); renderAll(); return; }
    acct = await import(/* @vite-ignore */ new URL("/compute/mine/web/account.js", location.href).href) as Account;
    const oc = await api("/api/orders/config").catch(() => null);
    if (oc?.pay_to) chain = { token: oc.token, pay_to: oc.pay_to, chain_id: oc.chain_id ?? oc.chain?.id };
  } catch {
    offEl.textContent = t("colosseum.bet.unreachable");
    return;
  }
  offEl.hidden = true;
  acct.onAccount(() => void refresh());
  $("bet-signin").onclick = async () => {
    try { await acct!.signIn(); } catch (err) { $("bet-msg").textContent = acct!.errorText(err); }
    await refresh();
  };
  $("bet-signout").onclick = async () => { await acct!.signOut(); await refresh(); };
  $("bet-deposit").onclick = () => { $("bet-deposit-box").hidden = !$("bet-deposit-box").hidden; $("bet-withdraw-box").hidden = true; };
  $("bet-withdraw").onclick = () => { $("bet-withdraw-box").hidden = !$("bet-withdraw-box").hidden; $("bet-deposit-box").hidden = true; };
  $("dep-go").onclick = () => void deposit();
  $("wd-go").onclick = () => void withdraw();
  await refresh();
  // the season changes slowly while registration is open and quickly while the fights are being played
  const poll = () => setTimeout(async () => {
    if (!acting && !dlg.open) await refreshCurrent();
    poll();
  }, cur?.status === "running" ? 4000 : 15000);
  poll();
}
void start();
