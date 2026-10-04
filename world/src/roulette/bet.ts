/**
 * Fly Roulette's "Play for $FLYAI" panel: bets from the player's fly.ai balance against the house.
 *
 * The server plays bet games (mine/src/roulette.ts); this page shows them turn by turn through main.ts's show()
 * and afterwards checks them: the server's seed must hash to the commit shown before the bet, and replaying the
 * game from both seeds on this browser's own fly brains must give the same turns.
 *
 * The account (sign-in, deposits, withdrawals, the 18+ terms) is bets/core.ts, the same for every game; the
 * withdrawal request's cancel and "Send to FlightPass" are this page's own.
 */
import { amountText, ApiError, createAccount, toWei } from "../bets/core.ts";
import { esc, fmt, randomHex } from "../util.ts";
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
export function initBets(hooks: Hooks) {
  const card = $("bet-card"), stakeEl = $<HTMLInputElement>("bet-stake"), pickEl = $("bet-pick");
  const paysEl = $("bet-pays"), goBtn = $<HTMLButtonElement>("bet-go"), resultEl = $("bet-result"), historyEl = $("bet-history");

  let cfg: Config | null = null;
  let me: Me | null = null;
  let betting = false;

  const account = createAccount({
    prefix: "roulette.bet", refresh, busy: () => hooks.playing() || betting,
    onWithdrawOpen: () => void loadPasses(),
    // the request's answer is the player's new state
    withdrawn: (r) => { me = r as Me; showMe(); },
  });
  const { api, say, acceptTerms } = account;

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
    const ready = !!account.wallet() && !!me && cfg.on && !cfg.paused && pick >= 0 && stake > 0 && stake <= bal && !hooks.playing() && !betting && !me.live_game;
    goBtn.disabled = !ready;
    goBtn.title = !me ? t("roulette.bet.needSignIn") : pick < 0 ? t("roulette.bet.needPick") : stake > bal ? t("roulette.bet.overBalance") : "";
  }

  function showMe(): void {
    account.header(me);
    if (!account.wallet() || !me) { changed(); return; }
    $("wd-cancel").hidden = !me.withdraw_request;
    historyEl.innerHTML = me.history.length ? me.history.map((h) => `<li><span>${t("roulette.bet.historyRow", { flies: t("roulette.controls.flies", { count: h.flies }), seat: h.pick + 1, stake: fmt(h.stake) })}</span>
      <b class="${h.won ? "won" : h.status === "done" ? "lost" : ""}">${h.status === "live" ? t("roulette.bet.playing") : h.status === "void" ? t("roulette.bet.refunded") : h.won ? `+${fmt(h.payout)}` : `−${fmt(h.stake)}`}</b></li>`).join("")
      : `<li class="dim">${t("roulette.bet.noBets")}</li>`;
    changed();
  }

  async function refresh(): Promise<void> {
    if (!account.wallet()) { me = null; showMe(); return; }
    try {
      me = await api("/api/roulette/me");
    } catch (err) {
      me = null;
      say(String((err as Error).message), true);
    }
    showMe();
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
    $("res-line").innerHTML = g.status === "void" ? t("roulette.bet.resVoid")
      : g.won ? t("roulette.bet.resWon", { amount: fmt(g.payout) }) : t("roulette.bet.resLost", { amount: fmt(g.stake) });
    account.seeds(g);
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

  // ---- the withdrawal request's cancel and FlightPasses (this page's own) ------------------------------------
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
    const wallet = account.wallet();
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
    const amount = amountText(amountEl.value);
    if (!amount || !toWei(amount)) { status.textContent = t("roulette.bet.enterAmount"); return; }
    const btn = $<HTMLButtonElement>("wd-pass-go");
    btn.disabled = true;
    try {
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
    if (await account.boot<Config>("/api/roulette/config", (c) => { cfg = c; }) !== "open") return;
    card.classList.add("on");
    $("bet-limits").textContent = t("roulette.bet.limits", { min: fmt(cfg!.min_bet), max: fmt(cfg!.max_bet), day: fmt(cfg!.max_day), edge: Math.round(cfg!.edge * 100) });
    if (cfg!.paused) say(t("roulette.bet.paused"), true);
    stakeEl.value = cfg!.min_bet;
    account.wire();
    stakeEl.oninput = changed;
    goBtn.onclick = () => void placeBet();
    $("wd-pass-go").onclick = () => void toPass();
    $("wd-cancel").onclick = () => void cancelRequest();
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
