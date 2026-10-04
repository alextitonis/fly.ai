/**
 * Fly Slots' "Play for $FLYAI" mode: spins from the player's fly.ai balance against the house, played by the server
 * (mine/src/slots.ts) with the same rules as free play (game.ts).
 *
 * Provably fair: before a spin the server commits to a seed (sha256 shown here); the spin mixes it with a seed from
 * this browser; afterwards the server reveals its seed and "Verify" checks that it hashes to the commit that was on
 * screen and that spin(server_seed, client_seed) gives exactly the reels shown. The next commit is fetched after each
 * spin, so a spin is one round trip.
 *
 * The account (sign-in, deposits, withdrawals, the 18+ terms) is bets/core.ts, the same for every game.
 */
import { Cancelled, createAccount, toWei } from "../bets/core.ts";
import { fmt, randomHex } from "../util.ts";
import { sha256Hex, spin, type Line, type Sym } from "./game.ts";
import { t } from "./i18n.ts";

export { Cancelled };

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
/** a timestamp in ms, whether the server sent seconds or ms */
const ms = (at: number) => (at < 1e12 ? at * 1000 : at);

export function initBets(hooks: Hooks) {
  const historyEl = $("bet-history"), commitEl = $("bet-commit");

  let cfg: Config | null = null;
  let me: Me | null = null;
  let next: Commit | null = null;
  let fetchingCommit: Promise<Commit | null> | null = null;
  let state: "loading" | "closed" | "open" = "loading";

  const account = createAccount({ prefix: "slots.bet", refresh, busy: hooks.busy });
  const { api, say, acceptTerms } = account;

  // ---- showing the panel -----------------------------------------------------------------------------
  function showMe(): void {
    account.header(me);
    if (account.wallet() && me) {
      historyEl.innerHTML = me.history.length ? me.history.map((h) => `<li class="btnrow" data-id="${encodeURIComponent(String(h.id))}">
        <span class="mini">${hooks.mini(h.symbols)}</span><span class="mono dim">${fmt(h.stake)}</span>
        <b class="${Number(h.payout) > 0 ? "up" : "down"}">${Number(h.payout) > 0 ? `+${fmt(h.payout)}` : `−${fmt(h.stake)}`}</b></li>`).join("")
        : `<li class="dim">${t("slots.bet.noSpins")}</li>`;
      if (cfg) $("bet-limits").textContent = t("slots.bet.limits", { min: fmt(cfg.min_bet), max: fmt(cfg.max_bet), day: fmt(cfg.max_day), staked: fmt(me.day_staked) });
    }
    hooks.changed();
  }

  async function refresh(): Promise<void> {
    if (!account.wallet()) { me = null; next = null; commitEl.textContent = t("slots.bet.noneYet"); showMe(); return; }
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

  // ---- a spin ---------------------------------------------------------------------------------------------
  /** Why a spin at this stake can't go now (null: it can). */
  function blocked(stake: string): string | null {
    if (state !== "open" || !cfg) return t("slots.msg.betClosed");
    if (cfg.paused) return t("slots.bet.paused");
    if (!account.wallet() || !me) return t("slots.msg.signInFirst");
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
    $("res-line").innerHTML = r.mult > 0 ? t("slots.bet.resWon", { id: r.id, amount: fmt(r.payout), mult: r.mult })
      : t("slots.bet.resLost", { id: r.id, amount: fmt(r.stake) });
    account.seeds(r);
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

  // ---- start ------------------------------------------------------------------------------------------------
  async function start(): Promise<void> {
    const r = await account.boot<Config>("/api/slots/config", (c) => { cfg = c; });
    if (r !== "open") { state = "closed"; hooks.changed(); return; }
    state = "open";
    if (cfg!.paused) say(t("slots.bet.paused"), true);
    account.wire();
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
    balance: () => (account.wallet() && me ? me.balance : null),
    limits: () => (cfg ? { min: cfg.min_bet, max: cfg.max_bet, rtp: cfg.rtp, hit: cfg.hit } : null),
  };
}
