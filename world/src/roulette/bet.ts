/**
 * Fly Roulette's "Play for $FLYAI" panel: bets from the player's fly.ai balance against the house.
 *
 * The server plays bet games (mine/src/roulette.ts); this page shows them turn by turn through main.ts's show()
 * and afterwards checks them: the server's seed must hash to the commit shown before the bet, and replaying the
 * game from both seeds on this browser's own fly brains must give the same turns.
 *
 * Sign-in, wallet transactions and the API address are the compute site's own modules, loaded at run time from
 * /compute/ (the same account works on both). In local development the Vite dev server proxies /api, /compute
 * and /assets to a local mining server (world/vite.config.ts).
 */
import { deriveRng, setup, sha256Hex, type GameEvent, type Table } from "./game.ts";
import { t } from "./i18n.ts";

interface Hooks {
  size(): number;
  champion(): number;
  playing(): boolean;
  names(): string[];
  color(seat: number): string;
  show(names: string[], pick: number, events: AsyncIterable<GameEvent>, result: (winner: number) => string): Promise<void>;
  replay(table: Table, rng: () => number, onTurn: (e: GameEvent) => boolean): Promise<boolean>;
  brainReady(): boolean;
}

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
  on: boolean; paused: boolean; edge: number; min_bet: string; max_bet: string; max_day: string; max_payout: string;
  multipliers: Record<string, number>;
}
interface Me {
  wallet: string; balance: string; terms_accepted: boolean; day_staked: string; live_game: string | null;
  withdraw_request: { amount: string } | null;
  history: { id: string; flies: number; pick: number; stake: string; payout: string; status: string; won: boolean | null; created_at: number }[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const WEI = 10n ** 18n;

/** "12.5" -> wei; null if it isn't a plain positive amount */
function toWei(s: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(s.trim());
  if (!m) return null;
  return BigInt(m[1]) * WEI + BigInt((m[2] ?? "").padEnd(18, "0"));
}
const fmt = (s: string | number) => Number(s).toLocaleString(undefined, { maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function initBets(hooks: Hooks) {
  const card = $("bet-card"), offEl = $("bet-off"), outEl = $("bet-out"), inEl = $("bet-in");
  const balanceEl = $("bet-balance"), whoEl = $("bet-who"), stakeEl = $<HTMLInputElement>("bet-stake"), pickEl = $("bet-pick");
  const paysEl = $("bet-pays"), goBtn = $<HTMLButtonElement>("bet-go"), msgEl = $("bet-msg"), resultEl = $("bet-result");
  const historyEl = $("bet-history"), depositBox = $("bet-deposit-box"), withdrawBox = $("bet-withdraw-box");
  const termsDlg = $<HTMLDialogElement>("terms-dlg");

  let API = "";
  let acct: Account | null = null;
  let cfg: Config | null = null;
  let me: Me | null = null;
  let chain: { token: string; pay_to: string; chain_id: number } | null = null;
  let betting = false;

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
      throw new ApiError(401, t("roulette.bet.sessionExpired"));
    }
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return data;
  }

  // ---- showing the panel -----------------------------------------------------------------------------
  function changed(): void {
    if (!cfg) return;
    const n = hooks.size();
    const mult = cfg.multipliers[String(n)] ?? 0;
    const stake = Number(stakeEl.value);
    const pick = hooks.champion();
    const names = hooks.names();
    pickEl.innerHTML = pick >= 0
      ? t("roulette.bet.pickOn", { seat: pick + 1, dot: `<span class="dot" style="background:${hooks.color(pick)}"></span>`, name: esc(names[pick] ?? "") })
      : `<span class="dim">${t("roulette.bet.pickNone")}</span>`;
    paysEl.innerHTML = t("roulette.bet.pays", { flies: t("roulette.controls.flies", { count: n }), mult })
      + (stake > 0 ? t("roulette.bet.paysTotal", { total: fmt(stake * mult) }) : "");
    const bal = me ? Number(me.balance) : 0;
    const ready = !!acct?.signedIn() && !!me && cfg.on && !cfg.paused && pick >= 0 && stake > 0 && stake <= bal && !hooks.playing() && !betting && !me.live_game;
    goBtn.disabled = !ready;
    goBtn.title = !me ? t("roulette.bet.needSignIn") : pick < 0 ? t("roulette.bet.needPick") : stake > bal ? t("roulette.bet.overBalance") : "";
  }

  function showMe(): void {
    const wallet = acct?.signedIn() ?? null;
    outEl.hidden = !!wallet;
    inEl.hidden = !wallet;
    if (!wallet || !me) { changed(); return; }
    whoEl.textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
    balanceEl.textContent = `${fmt(me.balance)} FLYAI`;
    const wr = me.withdraw_request;
    $("bet-withdraw-note").textContent = wr ? t("roulette.bet.withdrawAsked", { amount: fmt(wr.amount) }) : "";
    $("wd-cancel").hidden = !wr;
    historyEl.innerHTML = me.history.length ? me.history.map((h) => `<li><span>${t("roulette.bet.historyRow", { flies: t("roulette.controls.flies", { count: h.flies }), seat: h.pick + 1, stake: fmt(h.stake) })}</span>
      <b class="${h.won ? "won" : h.status === "done" ? "lost" : ""}">${h.status === "live" ? t("roulette.bet.playing") : h.status === "void" ? t("roulette.bet.refunded") : h.won ? `+${fmt(h.payout)}` : `−${fmt(h.stake)}`}</b></li>`).join("")
      : `<li class="dim">${t("roulette.bet.noBets")}</li>`;
    changed();
  }

  async function refresh(): Promise<void> {
    if (!acct?.signedIn()) { me = null; showMe(); return; }
    try {
      me = await api("/api/roulette/me");
    } catch (err) {
      me = null;
      say(String((err as Error).message), true);
    }
    showMe();
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
      $("terms-cancel").onclick = () => { termsDlg.close(); resolve(false); };
      go.onclick = async () => {
        go.disabled = true;
        try {
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

  // ---- a bet ----------------------------------------------------------------------------------------------
  /** The server's events for a game, as they're played: polled every second, until the end. */
  async function* events(id: string): AsyncGenerator<GameEvent> {
    let after = 0;
    for (;;) {
      const g = await api(`/api/roulette/games/${id}?after=${after}`);
      for (const e of g.events as (GameEvent & { seq: number })[]) {
        after = e.seq + 1;
        const { seq: _seq, ...event } = e;
        yield event as GameEvent;
        if (event.type === "end") return;
      }
      if (g.status === "void") throw new ApiError(500, t("roulette.bet.gameVoid"));
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async function watch(game: any): Promise<void> {
    resultEl.hidden = true;
    const won = (winner: number) => winner === game.pick;
    await hooks.show(game.names, game.pick, events(game.id), (winner) => won(winner)
      ? `<small class="betwin">${t("roulette.bet.toBalance", { amount: fmt(game.payout) })}</small>`
      : `<small class="betloss">−${fmt(game.stake)} FLYAI</small>`);
    const done = await api(`/api/roulette/games/${game.id}`);
    showResult(done);
    await refresh();
  }

  async function placeBet(): Promise<void> {
    if (!cfg || !me) return;
    betting = true;
    changed();
    try {
      if (!me.terms_accepted) {
        if (!(await acceptTerms())) return;
        me.terms_accepted = true;
      }
      say(t("roulette.bet.locking"));
      const { commit_id, hash } = await api("/api/roulette/commit", {});
      $("bet-commit").textContent = hash;
      const game = await api("/api/roulette/games", {
        commit_id, client_seed: randomHex(16), flies: hooks.size(), pick: hooks.champion(), stake: stakeEl.value.trim(),
      });
      say("");
      await refresh();
      await watch(game);
    } catch (err) {
      say(String((err as Error).message), true);
      await refresh();
    } finally {
      betting = false;
      changed();
    }
  }

  // ---- after a game: show the seeds and let the player check it ---------------------------------------------
  let last: any = null;
  function showResult(g: any): void {
    last = g;
    resultEl.hidden = false;
    $("res-line").innerHTML = g.status === "void" ? t("roulette.bet.resVoid")
      : g.won ? t("roulette.bet.resWon", { amount: fmt(g.payout) }) : t("roulette.bet.resLost", { amount: fmt(g.stake) });
    $("res-commit").textContent = g.commit_hash;
    $("res-server").textContent = g.server_seed ?? t("roulette.bet.notRevealed");
    $("res-client").textContent = g.client_seed;
    $("res-verify-out").textContent = "";
    $<HTMLButtonElement>("res-verify").disabled = !g.server_seed;
  }

  async function verify(): Promise<void> {
    const g = last;
    if (!g?.server_seed) return;
    const out = $("res-verify-out");
    const btn = $<HTMLButtonElement>("res-verify");
    btn.disabled = true;
    try {
      if ((await sha256Hex(g.server_seed)) !== g.commit_hash) { out.textContent = t("roulette.bet.vBadSeed"); return; }
      if (!hooks.brainReady()) { out.textContent = t("roulette.bet.vLoading"); return; }
      const rng = await deriveRng(g.server_seed, g.client_seed);
      const table = setup(g.flies, rng);
      if (JSON.stringify(table.names) !== JSON.stringify(g.names)) { out.textContent = t("roulette.bet.vBadTable"); return; }
      const theirs = (g.events as (GameEvent & { seq: number })[]).map(({ seq: _seq, ...e }) => JSON.stringify(e));
      let k = 0;
      out.textContent = t("roulette.bet.vStart");
      const ok = await hooks.replay(table, rng, (e) => {
        const same = JSON.stringify(e) === theirs[k];
        k++;
        if (e.type === "turn") out.textContent = t("roulette.bet.vProgress", { k, n: theirs.length - 1 });
        return same;
      });
      out.textContent = ok && k === theirs.length
        ? t("roulette.bet.vOk", { n: k - 1 })
        : t("roulette.bet.vDiff", { k });
    } finally {
      btn.disabled = false;
    }
  }

  // ---- deposits and withdrawals -------------------------------------------------------------------------
  async function deposit(): Promise<void> {
    const amountEl = $<HTMLInputElement>("dep-amount"), status = $("dep-status");
    const wei = toWei(amountEl.value);
    if (!wei || wei <= 0n) { status.textContent = t("roulette.bet.enterAmount"); return; }
    if (!acct || !chain) return;
    const btn = $<HTMLButtonElement>("dep-go");
    btn.disabled = true;
    try {
      const data = `0xa9059cbb${chain.pay_to.slice(2).toLowerCase().padStart(64, "0")}${wei.toString(16).padStart(64, "0")}`;
      const tx = await acct.transact(chain.token, data, (t) => { status.textContent = t; }, chain.chain_id);
      status.textContent = t("roulette.bet.mining");
      await acct.mined(tx, chain.chain_id);
      for (let i = 0; ; i++) {
        try {
          const r = await api("/api/balance/deposit", { tx });
          status.textContent = t("roulette.bet.deposited", { amount: fmt(r.deposited) });
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
    if (!toWei(amountEl.value)) { status.textContent = t("roulette.bet.enterAmount"); return; }
    try {
      me = await api("/api/balance/withdraw-request", { amount: amountEl.value.trim() });
      status.textContent = t("roulette.bet.withdrawOk");
      amountEl.value = "";
      showMe();
    } catch (err) {
      status.textContent = String((err as Error).message);
    }
  }

  /** Take an open request back: the amount is free again, to bet or to send to a FlightPass. */
  async function cancelRequest(): Promise<void> {
    const btn = $<HTMLButtonElement>("wd-cancel");
    btn.disabled = true;
    try {
      me = await api("/api/balance/withdraw-cancel", {});
      showMe();
      say(t("roulette.bet.cancelOk"));
    } catch (err) {
      say(String((err as Error).message), true);
      await refresh();
    } finally {
      btn.disabled = false;
    }
  }

  // straight onto a FlightPass (2026-09-30): the pass's withdrawals are sent automatically, this balance's by hand
  let passesFor: string | null = null;
  async function loadPasses(): Promise<void> {
    const wallet = acct?.signedIn() ?? null;
    const row = $("wd-pass-row"), sel = $<HTMLSelectElement>("wd-pass");
    if (!wallet) { row.hidden = true; passesFor = null; return; }
    if (passesFor === wallet) return;
    passesFor = wallet;
    row.hidden = true;
    try {
      const r = await api("/api/flightpass/mine");
      const open = (r.passes as { id: number; listed: boolean }[]).filter((p) => !p.listed);
      sel.innerHTML = open.map((p) => `<option value="${p.id}">FlightPass #${p.id}</option>`).join("");
      row.hidden = !open.length;
    } catch {
      passesFor = null;   // no passes on this server, or it didn't answer: the hand-sent way is still there
    }
  }

  async function toPass(): Promise<void> {
    const amountEl = $<HTMLInputElement>("wd-amount"), status = $("wd-pass-status"), id = $<HTMLSelectElement>("wd-pass").value;
    if (!toWei(amountEl.value)) { status.textContent = t("roulette.bet.enterAmount"); return; }
    const btn = $<HTMLButtonElement>("wd-pass-go");
    btn.disabled = true;
    try {
      const amount = amountEl.value.trim();
      await api(`/api/flightpass/${id}/from-balance`, { amount });
      status.textContent = t("roulette.bet.toPassOk", { amount: fmt(amount), id });
      amountEl.value = "";
      await refresh();
    } catch (err) {
      status.textContent = String((err as Error).message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---- start ------------------------------------------------------------------------------------------------
  async function start(): Promise<void> {
    try {
      const config = await import(/* @vite-ignore */ new URL("/compute/mine/web/config.js", location.href).href);
      API = import.meta.env.DEV ? "" : config.API;
      cfg = await api("/api/roulette/config");
      if (!cfg!.on) { offEl.textContent = t("roulette.bet.closed"); return; }
      acct = await import(/* @vite-ignore */ new URL("/compute/mine/web/account.js", location.href).href) as Account;
      const oc = await api("/api/orders/config").catch(() => null);
      if (oc?.pay_to) chain = { token: oc.token, pay_to: oc.pay_to, chain_id: oc.chain_id ?? oc.chain?.id };
    } catch {
      offEl.textContent = t("roulette.bet.unreachable");
      return;
    }
    offEl.hidden = true;
    card.classList.add("on");
    $("bet-limits").textContent = t("roulette.bet.limits", { min: fmt(cfg!.min_bet), max: fmt(cfg!.max_bet), day: fmt(cfg!.max_day), edge: Math.round(cfg!.edge * 100) });
    if (cfg!.paused) say(t("roulette.bet.paused"), true);
    stakeEl.value = cfg!.min_bet;
    acct.onAccount(() => void refresh());
    $("bet-signin").onclick = async () => {
      try { await acct!.signIn(); } catch (err) { say(acct!.errorText(err), true); }
      await refresh();
    };
    $("bet-signout").onclick = async () => { await acct!.signOut(); await refresh(); };
    stakeEl.oninput = changed;
    goBtn.onclick = () => void placeBet();
    $("bet-deposit").onclick = () => { depositBox.hidden = !depositBox.hidden; withdrawBox.hidden = true; };
    $("bet-withdraw").onclick = () => { withdrawBox.hidden = !withdrawBox.hidden; depositBox.hidden = true; if (!withdrawBox.hidden) void loadPasses(); };
    $("wd-pass-go").onclick = () => void toPass();
    $("wd-cancel").onclick = () => void cancelRequest();
    $("dep-go").onclick = () => void deposit();    $("wd-go").onclick = () => void withdraw();
    $("res-verify").onclick = () => void verify();
    await refresh();
    // a game still on the table from before a reload: watch it to the end
    if (me?.live_game && !hooks.playing()) {
      const g = await api(`/api/roulette/games/${me.live_game}`);
      void watch(g);
    }
  }
  void start();

  return { changed };
}
