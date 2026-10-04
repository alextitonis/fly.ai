/**
 * The $FLYAI account behind every game's "Play for $FLYAI" panel (Fly Slots, Fly Roulette, Fly Race, Fly
 * Colosseum): the API, sign-in and out, the 18+ terms, deposits, withdrawal requests, the wallet/balance header and
 * the seeds of a finished game. One copy since 2026-10-04 (each game had its own); the games keep their own config,
 * history, play and verify.
 *
 * Sign-in, wallet transactions and the API address are the compute site's own modules, loaded at run time from
 * /compute/ (mine/web/account.ts, config.js): one account for every game and compute. In local development the
 * Vite dev server proxies /api, /compute and /assets to a local mining server.
 */
import { t } from "../../../docs/assets/i18n/i18n.js";
import { fmt } from "../util.ts";
import "./bet.css";

/** The compute site's account module (mine/web/account.ts). */
export interface Account {
  signedIn(): string | null;
  sessionHeaders(): Record<string, string>;
  onAccount(fn: (wallet: string | null) => void): void;
  signIn(): Promise<string | null>;
  signOut(): Promise<void>;
  transact(to: string, data: string, step?: (text: string) => void, chainId?: number): Promise<string>;
  mined(hash: string, chainId?: number): Promise<void>;
  errorText(err: unknown): string;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** thrown when the player closes the terms dialog: the game just doesn't happen */
export class Cancelled extends Error {}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const WEI = 10n ** 18n;

/** An amount as people type it ("90000", "90,000", "90 000", "90k", "1.5m") as a plain number of tokens, or null. */
export function amountText(s: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?([km])?$/i.exec(s.trim().replace(/[\s,_']/g, ""));
  if (!m) return null;
  const shift = m[3] ? (m[3].toLowerCase() === "k" ? 3 : 6) : 0;
  const frac = (m[2] ?? "").padEnd(shift, "0");
  const whole = (m[1] + frac.slice(0, shift)).replace(/^0+(?=\d)/, ""), rest = frac.slice(shift).replace(/0+$/, "");
  return rest.length > 18 ? null : rest ? `${whole}.${rest}` : whole;
}
/** "12.5" (or anything amountText reads) -> wei; null if it isn't an amount */
export function toWei(s: string): bigint | null {
  const a = amountText(s);
  if (a === null) return null;
  const [w, f = ""] = a.split(".");
  return BigInt(w) * WEI + BigInt(f.padEnd(18, "0"));
}

export interface AccountOptions {
  /** the game's bet strings ("slots.bet"): sessionExpired, closed, unreachable, enterAmount, mining, deposited,
   *  withdrawOk, withdrawAsked, notRevealed */
  prefix: string;
  /** everything the page shows for the player (sign-in, sign-out, the account changing) */
  refresh(): Promise<void>;
  /** after a deposit or a withdrawal request (default: refresh) */
  refreshMe?(): Promise<void>;
  /** a game, a verify or an action is running: sign-out waits */
  busy(): boolean;
  /** the withdraw box was opened (Fly Roulette: its FlightPasses) */
  onWithdrawOpen?(): void;
  /** the withdrawal request's answer, which is the player's new state (Fly Roulette); without it: refreshMe */
  withdrawn?(me: unknown): void;
}

/** A game's seeds after the server revealed them (Fly Slots, Fly Roulette, Fly Race). */
export interface Seeds { commit_hash: string; server_seed: string | null; client_seed: string }

export function createAccount(o: AccountOptions) {
  const p = o.prefix;
  let API = "";
  let acct: Account | null = null;
  let chain: { token: string; pay_to: string; chain_id: number } | null = null;

  const say = (text: string, bad = false) => { const el = $("bet-msg"); el.textContent = text; el.classList.toggle("bad", bad); };
  const refreshMe = () => (o.refreshMe ?? o.refresh)();

  async function api(path: string, body?: unknown): Promise<any> {
    const res = await fetch(API + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(acct?.sessionHeaders() ?? {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && acct?.signedIn()) {
      await acct.signOut();
      throw new ApiError(401, t(`${p}.sessionExpired`));
    }
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return data;
  }

  /**
   * The game's config, then (when it's on) the account module and the deposit address. "closed" and "unreachable"
   * leave their line in #bet-off; "open" hides it. `got` sees the config as soon as it arrives.
   */
  async function boot<C extends { on: boolean }>(configPath: string, got: (cfg: C) => void): Promise<"open" | "closed" | "unreachable"> {
    const offEl = $("bet-off");
    try {
      const config = await import(/* @vite-ignore */ new URL("/compute/mine/web/config.js", location.href).href);
      API = import.meta.env.DEV ? "" : config.API;
      const cfg: C = await api(configPath);
      got(cfg);
      if (!cfg.on) { offEl.textContent = t(`${p}.closed`); return "closed"; }
      acct = await import(/* @vite-ignore */ new URL("/compute/mine/web/account.js", location.href).href) as Account;
      const oc = await api("/api/orders/config").catch(() => null);
      if (oc?.pay_to) chain = { token: oc.token, pay_to: oc.pay_to, chain_id: oc.chain_id ?? oc.chain?.id };
    } catch {
      offEl.textContent = t(`${p}.unreachable`);
      return "unreachable";
    }
    offEl.hidden = true;
    return "open";
  }

  /** The account's buttons, once boot() said "open". onAccount calls refresh at once. */
  function wire(): void {
    const depositBox = $("bet-deposit-box"), withdrawBox = $("bet-withdraw-box");
    acct!.onAccount(() => void o.refresh());
    $("bet-signin").onclick = async () => {
      try { await acct!.signIn(); } catch (err) { say(acct!.errorText(err), true); }
      await o.refresh();
    };
    // not while a game runs (2026-10-04: Fly Roulette and Fly Colosseum signed out mid-game)
    $("bet-signout").onclick = async () => { if (o.busy()) return; await acct!.signOut(); await o.refresh(); };
    $("bet-deposit").onclick = () => { depositBox.hidden = !depositBox.hidden; withdrawBox.hidden = true; };
    $("bet-withdraw").onclick = () => { withdrawBox.hidden = !withdrawBox.hidden; depositBox.hidden = true; if (!withdrawBox.hidden) o.onWithdrawOpen?.(); };
    $("dep-go").onclick = () => void deposit();
    $("wd-go").onclick = () => void withdraw();
  }

  /** The wallet, balance and open withdrawal request at the top of the panel. */
  function header(me: { balance: string; withdraw_request?: { amount: string } | null } | null): void {
    const wallet = acct?.signedIn() ?? null;
    $("bet-out").hidden = !!wallet || !acct;
    $("bet-in").hidden = !wallet;
    if (!wallet || !me) return;
    $("bet-who").textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
    $("bet-balance").textContent = `${fmt(me.balance)} FLYAI`;
    const note = document.getElementById("bet-withdraw-note");     // Fly Colosseum has none
    const wr = me.withdraw_request;
    if (note) note.textContent = wr ? t(`${p}.withdrawAsked`, { amount: fmt(wr.amount) }) : "";
  }

  /** A finished game's seeds under the result line, with Verify ready once the server's seed is out. */
  function seeds(r: Seeds): void {
    $("bet-result").hidden = false;
    $("res-commit").textContent = r.commit_hash;
    $("res-server").textContent = r.server_seed ?? t(`${p}.notRevealed`);
    $("res-client").textContent = r.client_seed;
    $("res-verify-out").textContent = "";
    $<HTMLButtonElement>("res-verify").disabled = !r.server_seed;
  }

  // ---- terms --------------------------------------------------------------------------------------------
  function acceptTerms(): Promise<boolean> {
    const d = $<HTMLDialogElement>("terms-dlg");
    const age = $<HTMLInputElement>("terms-18"), ok = $<HTMLInputElement>("terms-ok"), go = $<HTMLButtonElement>("terms-go");
    age.checked = ok.checked = false;
    go.disabled = true;
    const sync = () => { go.disabled = !(age.checked && ok.checked); };
    age.onchange = ok.onchange = sync;
    d.showModal();
    return new Promise((resolve) => {
      d.oncancel = () => resolve(false);     // Esc
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
          sync();
        }
      };
    });
  }

  // ---- deposits and withdrawals -------------------------------------------------------------------------
  async function deposit(): Promise<void> {
    const amountEl = $<HTMLInputElement>("dep-amount"), status = $("dep-status");
    const wei = toWei(amountEl.value);
    if (!wei || wei <= 0n) { status.textContent = t(`${p}.enterAmount`); return; }
    if (!acct || !chain) return;
    const btn = $<HTMLButtonElement>("dep-go");
    btn.disabled = true;
    try {
      const data = `0xa9059cbb${chain.pay_to.slice(2).toLowerCase().padStart(64, "0")}${wei.toString(16).padStart(64, "0")}`;
      const tx = await acct.transact(chain.token, data, (text) => { status.textContent = text; }, chain.chain_id);
      status.textContent = t(`${p}.mining`);
      await acct.mined(tx, chain.chain_id);
      for (let i = 0; ; i++) {
        try {
          const r = await api("/api/balance/deposit", { tx });
          status.textContent = t(`${p}.deposited`, { amount: fmt(r.deposited) });
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
    if (!amount || !toWei(amount)) { status.textContent = t(`${p}.enterAmount`); return; }
    try {
      const r = await api("/api/balance/withdraw-request", { amount });
      status.textContent = t(`${p}.withdrawOk`);
      amountEl.value = "";
      if (o.withdrawn) o.withdrawn(r);
      else await refreshMe();
    } catch (err) {
      status.textContent = String((err as Error).message);
    }
  }

  return {
    api, boot, wire, header, seeds, say, acceptTerms,
    /** the signed-in wallet, or null (also before the account module has loaded) */
    wallet: () => acct?.signedIn() ?? null,
  };
}
