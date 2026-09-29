/**
 * Fly Slots' "Play for $FLYAI" mode: spins from the player's fly.ai balance against the house, played by the server
 * (mine/src/slots.ts) with the same rules as free play (game.ts).
 *
 * Provably fair: before a spin the server commits to a seed (sha256 shown here); the spin mixes it with a seed from
 * this browser; afterwards the server reveals its seed and "Verify" checks that it hashes to the commit that was on
 * screen and that spin(server_seed, client_seed) gives exactly the reels shown. The next commit is fetched after each
 * spin, so a spin is one round trip.
 *
 * Sign-in, wallet transactions and the API address are the compute site's own modules, loaded at run time from
 * /compute/ (the same account as Fly Roulette and compute). The 18+ terms are Fly Roulette's: one acceptance covers
 * both games.
 */
import { sha256Hex, spin, type Line, type Sym } from "./game.ts";
import { t } from "./i18n.ts";

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

interface Config {
  on: boolean; paused: boolean; rtp: number; hit: number; min_bet: string; max_bet: string; max_day: string;
  max_payout: string; top_mult: number;
}
interface HistoryRow { id: string | number; stake: string; mult: number; payout: string; symbols: Sym[]; created_at: number }
interface Me {
  wallet: string; balance: string; terms_accepted: boolean; day_staked: string;
  withdraw_request: { amount: string } | null;
  history: HistoryRow[];
}
export interface BetSpin {
  id: string | number; stake: string; mult: number; payout: string; stops: [number, number, number]; symbols: [Sym, Sym, Sym];
  line: Line; commit_hash: string; server_seed: string | null; client_seed: string; created_at: number; balance?: string;
}
interface Commit { commit_id: string; hash: string; expires_at: number }

export interface Hooks {
  /** a spin is on the reels (or auto-spin runs): account actions wait */
  busy(): boolean;
  /** the panel's state changed (sign-in, balance, config): the deck redraws */
  changed(): void;
  /** mini reel symbols for a history row */
  mini(symbols: Sym[]): string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const WEI = 10n ** 18n;

/** "12.5" -> wei; null if it isn't a plain positive amount */
function toWei(s: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(s.trim());
  if (!m) return null;
  return BigInt(m[1]) * WEI + BigInt((m[2] ?? "").padEnd(18, "0"));
}
export const fmt = (s: string | number) => Number(s).toLocaleString(undefined, { maximumFractionDigits: 2 });
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
/** a timestamp in ms, whether the server sent seconds or ms */
const ms = (at: number) => (at < 1e12 ? at * 1000 : at);

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** thrown when the player closes the terms dialog: the spin just doesn't happen */
export class Cancelled extends Error {}

export function initBets(hooks: Hooks) {
  const offEl = $("bet-off"), outEl = $("bet-out"), inEl = $("bet-in");
  const balanceEl = $("bet-balance"), whoEl = $("bet-who"), msgEl = $("bet-msg"), resultEl = $("bet-result");
  const historyEl = $("bet-history"), depositBox = $("bet-deposit-box"), withdrawBox = $("bet-withdraw-box");
  const commitEl = $("bet-commit"), termsDlg = $<HTMLDialogElement>("terms-dlg");

  let API = "";
  let acct: Account | null = null;
  let cfg: Config | null = null;
  let me: Me | null = null;
  let chain: { token: string; pay_to: string; chain_id: number } | null = null;
  let next: Commit | null = null;
  let fetchingCommit: Promise<Commit | null> | null = null;
  let state: "loading" | "closed" | "open" = "loading";

  const say = (text: string, bad = false) => { msgEl.textContent = text; msgEl.classList.toggle("bad", bad); };

  async function api(path: string, body?: unknown): Promise<any> {
    const res = await fetch(API + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(acct?.sessionHeaders() ?? {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && acct?.signedIn()) {
      await acct.signOut();
      throw new ApiError(401, t("slots.bet.sessionExpired"));
    }
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return data;
  }

  // ---- showing the panel -----------------------------------------------------------------------------
  function showMe(): void {
    const wallet = acct?.signedIn() ?? null;
    outEl.hidden = !!wallet;
    inEl.hidden = !wallet;
    if (wallet && me) {
      whoEl.textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
      balanceEl.textContent = `${fmt(me.balance)} FLYAI`;
      const wr = me.withdraw_request;
      $("bet-withdraw-note").textContent = wr ? t("slots.bet.withdrawAsked", { amount: fmt(wr.amount) }) : "";
      historyEl.innerHTML = me.history.length ? me.history.map((h) => `<li class="btnrow" data-id="${encodeURIComponent(String(h.id))}">
        <span class="mini">${hooks.mini(h.symbols)}</span><span class="mono dim">${fmt(h.stake)}</span>
        <b class="${Number(h.payout) > 0 ? "up" : "down"}">${Number(h.payout) > 0 ? `+${fmt(h.payout)}` : `−${fmt(h.stake)}`}</b></li>`).join("")
        : `<li class="dim">${t("slots.bet.noSpins")}</li>`;
      if (cfg) $("bet-limits").textContent = t("slots.bet.limits", { min: fmt(cfg.min_bet), max: fmt(cfg.max_bet), day: fmt(cfg.max_day), staked: fmt(me.day_staked) });
    }
    hooks.changed();
  }

  async function refresh(): Promise<void> {
    if (!acct?.signedIn()) { me = null; next = null; commitEl.textContent = t("slots.bet.noneYet"); showMe(); return; }
    try {
      me = await api("/api/slots/me");
    } catch (err) {
      me = null;
      say(String((err as Error).message), true);
    }
    showMe();
    if (me?.terms_accepted) void prefetch();
  }

  // ---- the next commit ------------------------------------------------------------------------------------
  const fresh = (c: Commit | null) => !!c && ms(c.expires_at) > Date.now() + 5000;
  function prefetch(): Promise<Commit | null> {
    if (fresh(next)) return Promise.resolve(next);
    if (!fetchingCommit) {
      fetchingCommit = api("/api/slots/commit", {}).then((c: Commit) => {
        next = c;
        commitEl.textContent = c.hash;
        return c;
      }).catch(() => null).finally(() => { fetchingCommit = null; });
    }
    return fetchingCommit;
  }

  // ---- terms --------------------------------------------------------------------------------------------
  function acceptTerms(): Promise<boolean> {
    const age = $<HTMLInputElement>("terms-18"), ok = $<HTMLInputElement>("terms-ok"), go = $<HTMLButtonElement>("terms-go");
    age.checked = ok.checked = false;
    go.disabled = true;
    const sync = () => { go.disabled = !(age.checked && ok.checked); };
    age.onchange = ok.onchange = sync;
    termsDlg.showModal();
    return new Promise((resolve) => {
      termsDlg.oncancel = () => resolve(false);
      $("terms-cancel").onclick = () => { termsDlg.close(); resolve(false); };
      go.onclick = async () => {
        go.disabled = true;
        try {
          // Fly Roulette's terms: one acceptance covers both games
          await api("/api/roulette/terms", { over18: true, accept: true });
          termsDlg.close();
          resolve(true);
        } catch (err) {
          $("terms-msg").textContent = String((err as Error).message);
          sync();
        }
      };
    });
  }

  // ---- a spin ---------------------------------------------------------------------------------------------
  /** Why a spin at this stake can't go now (null: it can). */
  function blocked(stake: string): string | null {
    if (state !== "open" || !cfg) return t("slots.msg.betClosed");
    if (cfg.paused) return t("slots.bet.paused");
    if (!acct?.signedIn() || !me) return t("slots.msg.signInFirst");
    const s = Number(stake);
    if (!toWei(stake) || !(s > 0)) return t("slots.msg.stakeBad");
    if (s < Number(cfg.min_bet) || s > Number(cfg.max_bet)) return t("slots.bet.stakeRange", { min: fmt(cfg.min_bet), max: fmt(cfg.max_bet) });
    if (s > Number(me.balance)) return t("slots.bet.overBalance");
    if (Number(me.day_staked) + s > Number(cfg.max_day)) return t("slots.bet.overDay", { day: fmt(cfg.max_day) });
    return null;
  }

  /** The commit shown before each spin, by spin id: Verify checks the revealed seed against what was on screen. */
  const shownBefore = new Map<string, string>();

  /** One spin on the server. The reels are already turning; they land on what this returns. */
  async function play(stake: string): Promise<BetSpin> {
    if (!me) throw new Error(t("slots.msg.signInFirst"));
    if (!me.terms_accepted) {
      if (!(await acceptTerms())) throw new Cancelled();
      me.terms_accepted = true;
    }
    say("");
    let c = fresh(next) ? next : await prefetch();
    if (!c) c = next = await api("/api/slots/commit", {});
    const commit = c!;
    commitEl.textContent = commit.hash;
    next = null;                     // a commit is good for one spin
    let r: BetSpin;
    try {
      r = await api("/api/slots/spins", { commit_id: commit.commit_id, client_seed: randomHex(16), stake: stake.trim() });
    } catch (err) {
      void refresh();
      throw err;
    }
    shownBefore.set(String(r.id), commit.hash);
    if (r.balance != null) me.balance = r.balance;
    me.day_staked = String(Number(me.day_staked) + Number(r.stake));
    return r;
  }

  /** After the reels have landed: the seeds, the history and the next commit. */
  function landed(r: BetSpin): void {
    showResult(r);
    if (me) {
      me.history = [{ id: r.id, stake: r.stake, mult: r.mult, payout: r.payout, symbols: r.symbols, created_at: r.created_at }, ...me.history].slice(0, 30);
      showMe();
    }
    void prefetch();
  }

  // ---- after a spin: show the seeds and let the player check it ---------------------------------------------
  let last: BetSpin | null = null;
  function showResult(r: BetSpin): void {
    last = r;
    resultEl.hidden = false;
    $("res-line").innerHTML = r.mult > 0 ? t("slots.bet.resWon", { id: r.id, amount: fmt(r.payout), mult: r.mult })
      : t("slots.bet.resLost", { id: r.id, amount: fmt(r.stake) });
    $("res-commit").textContent = r.commit_hash;
    $("res-server").textContent = r.server_seed ?? t("slots.bet.notRevealed");
    $("res-client").textContent = r.client_seed;
    $("res-verify-out").textContent = "";
    $<HTMLButtonElement>("res-verify").disabled = !r.server_seed;
  }

  async function verify(): Promise<void> {
    const r = last;
    if (!r?.server_seed) return;
    const out = $("res-verify-out");
    const shown = shownBefore.get(String(r.id));
    if ((await sha256Hex(r.server_seed)) !== r.commit_hash) { out.textContent = t("slots.bet.vBadSeed"); return; }
    if (shown && shown !== r.commit_hash) { out.textContent = t("slots.bet.vBadCommit"); return; }
    const s = await spin(r.server_seed, r.client_seed);
    if (s.stops.join() !== r.stops.join() || s.mult !== r.mult) { out.textContent = t("slots.bet.vBadStops"); return; }
    out.textContent = t(shown ? "slots.bet.vOk" : "slots.bet.vOkOld");
  }

  /** A spin from the history list, fetched so it can be verified. */
  async function openSpin(id: string): Promise<void> {
    try {
      showResult(await api(`/api/slots/spins/${id}`));
    } catch (err) {
      say(String((err as Error).message), true);
    }
  }

  // ---- deposits and withdrawals -------------------------------------------------------------------------
  async function deposit(): Promise<void> {
    const amountEl = $<HTMLInputElement>("dep-amount"), status = $("dep-status");
    const wei = toWei(amountEl.value);
    if (!wei || wei <= 0n) { status.textContent = t("slots.bet.enterAmount"); return; }
    if (!acct || !chain) return;
    const btn = $<HTMLButtonElement>("dep-go");
    btn.disabled = true;
    try {
      const data = `0xa9059cbb${chain.pay_to.slice(2).toLowerCase().padStart(64, "0")}${wei.toString(16).padStart(64, "0")}`;
      const tx = await acct.transact(chain.token, data, (text) => { status.textContent = text; }, chain.chain_id);
      status.textContent = t("slots.bet.mining");
      await acct.mined(tx, chain.chain_id);
      for (let i = 0; ; i++) {
        try {
          const r = await api("/api/balance/deposit", { tx });
          status.textContent = t("slots.bet.deposited", { amount: fmt(r.deposited) });
          break;
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409 && /mined/.test(err.message)) || i > 20) throw err;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      amountEl.value = "";
      await refresh();
    } catch (err) {
      status.textContent = acct.errorText(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function withdraw(): Promise<void> {
    const amountEl = $<HTMLInputElement>("wd-amount"), status = $("wd-status");
    if (!toWei(amountEl.value)) { status.textContent = t("slots.bet.enterAmount"); return; }
    try {
      await api("/api/balance/withdraw-request", { amount: amountEl.value.trim() });
      status.textContent = t("slots.bet.withdrawOk");
      amountEl.value = "";
      await refresh();
    } catch (err) {
      status.textContent = String((err as Error).message);
    }
  }

  // ---- start ------------------------------------------------------------------------------------------------
  async function start(): Promise<void> {
    try {
      const config = await import(/* @vite-ignore */ new URL("/compute/mine/web/config.js", location.href).href);
      API = import.meta.env.DEV ? "" : config.API;
      cfg = await api("/api/slots/config");
      if (!cfg!.on) { state = "closed"; offEl.textContent = t("slots.bet.closed"); hooks.changed(); return; }
      acct = await import(/* @vite-ignore */ new URL("/compute/mine/web/account.js", location.href).href) as Account;
      const oc = await api("/api/orders/config").catch(() => null);
      if (oc?.pay_to) chain = { token: oc.token, pay_to: oc.pay_to, chain_id: oc.chain_id ?? oc.chain?.id };
    } catch {
      state = "closed";
      offEl.textContent = t("slots.bet.unreachable");
      hooks.changed();
      return;
    }
    state = "open";
    offEl.hidden = true;
    if (cfg!.paused) say(t("slots.bet.paused"), true);
    acct.onAccount(() => void refresh());
    $("bet-signin").onclick = async () => {
      try { await acct!.signIn(); } catch (err) { say(acct!.errorText(err), true); }
      await refresh();
    };
    $("bet-signout").onclick = async () => { if (hooks.busy()) return; await acct!.signOut(); await refresh(); };
    $("bet-deposit").onclick = () => { depositBox.hidden = !depositBox.hidden; withdrawBox.hidden = true; };
    $("bet-withdraw").onclick = () => { withdrawBox.hidden = !withdrawBox.hidden; depositBox.hidden = true; };
    $("dep-go").onclick = () => void deposit();
    $("wd-go").onclick = () => void withdraw();
    $("res-verify").onclick = () => void verify();
    historyEl.onclick = (e) => {
      const li = (e.target as HTMLElement).closest("li[data-id]") as HTMLElement | null;
      if (li) void openSpin(li.dataset.id!);
    };
    await refresh();
  }
  void start();

  return {
    play, landed, blocked,
    /** "open" once the server said yes; "closed" when it's off or out of reach */
    state: () => state,
    /** the FLYAI balance, or null when signed out */
    balance: () => (acct?.signedIn() && me ? me.balance : null),
    limits: () => (cfg ? { min: cfg.min_bet, max: cfg.max_bet, rtp: cfg.rtp, hit: cfg.hit } : null),
  };
}
