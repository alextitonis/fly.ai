/**
 * Fly Race's "Play for $FLYAI" mode: each bet is the player's own race against the house, played by the server
 * (mine/src/race.ts) with the same rules and the same brains as free play (game.ts, readout.ts).
 *
 * Provably fair, like Fly Roulette: before a race the server commits to a seed (its sha256 is shown here); the race
 * mixes it with a seed from this browser; the server streams the legs as its brains run them (polled about once a
 * second) and afterwards reveals its seed. "Verify" checks that the seed hashes to the commit that was on screen,
 * that the two seeds seat the same flies, and that replaying the race on this browser's own fly brains gives
 * exactly the server's legs and finishing order.
 *
 * The account (sign-in, deposits, withdrawals, the 18+ terms) is bets/core.ts, the same for every game.
 */
import { ApiError, Cancelled, createAccount, toWei } from "../bets/core.ts";
import { esc, fmt, randomHex } from "../util.ts";
import { deriveRng, setupRace, sha256Hex, type BetType, type Race, type RaceEvent } from "./game.ts";
import { placeText, t } from "./i18n.ts";

export { Cancelled };

export interface Config {
  on: boolean; paused: boolean; edge: number; terms_version?: string | number; min_bet: string; max_bet: string; max_day: string;
  max_payout: string; lanes: number; legs: number; mult: Record<BetType, number>;
}
interface HistoryRow {
  id: string | number; bet: BetType; pick: number; stake: string; payout: string; status: string; won: boolean | null;
  order: number[] | null; created_at: number;
}
interface Me {
  wallet: string; balance: string; terms_accepted: boolean; day_staked: string; live_race: string | number | null;
  withdraw_request: { amount: string } | null;
  history: HistoryRow[];
}
export interface BetRace {
  id: string | number; bet: BetType; pick: number; stake: string; payout: string; status: string; won: boolean | null;
  names: string[]; events: (RaceEvent & { seq: number })[]; commit_hash: string; client_seed: string;
  server_seed: string | null; created_at: number;
}
interface Commit { commit_id: string; hash: string; expires_at: number }

export interface Hooks {
  /** a race is running (or a verify replay): account actions and new bets wait */
  busy(): boolean;
  /** the panel's state changed (sign-in, balance, config): the deck redraws */
  changed(): void;
  /** a server race: show its legs as they arrive; resolves after the finish has been shown */
  show(race: BetRace, events: AsyncIterable<RaceEvent>): Promise<void>;
  /** replays a race on this browser's brains; onEvent says whether each event matches the server's */
  replay(race: Race, rng: () => number, onEvent: (e: RaceEvent) => boolean): Promise<boolean>;
  brainState(): "loading" | "ready" | "failed";
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const strip = ({ seq: _seq, ...e }: RaceEvent & { seq: number }) => e as RaceEvent;

export function initBets(hooks: Hooks) {
  const historyEl = $("bet-history"), resultEl = $("bet-result"), commitEl = $("bet-commit");

  let cfg: Config | null = null;
  let me: Me | null = null;
  let state: "loading" | "closed" | "open" = "loading";
  let watching = false;

  const account = createAccount({ prefix: "race.bet", refresh, busy: () => hooks.busy() || watching });
  const { api, say, acceptTerms } = account;

  // ---- showing the panel -----------------------------------------------------------------------------
  function historyRow(h: HistoryRow): string {
    const bet = t(`race.deck.${h.bet === "podium" ? "podium" : "win"}`);
    const place = h.order ? h.order.indexOf(h.pick) + 1 : 0;
    const what = `${bet} · ${t("race.pick.lane", { n: h.pick + 1 })}${place ? ` · ${placeText(place)}` : ""}`;
    const res = h.status === "live" ? `<b class="dim">${t("race.bet.live")}</b>`
      : h.status === "void" ? `<b class="dim">${t("race.bet.refunded")}</b>`
      : h.won ? `<b class="up">+${fmt(h.payout)}</b>` : `<b class="down">−${fmt(h.stake)}</b>`;
    return `<li class="btnrow" data-id="${encodeURIComponent(String(h.id))}"><span>${esc(what)} <span class="mono dim">${fmt(h.stake)}</span></span>${res}</li>`;
  }

  function showMe(): void {
    account.header(me);
    if (account.wallet() && me) {
      historyEl.innerHTML = me.history.length ? me.history.map(historyRow).join("") : `<li class="dim">${t("race.bet.noRaces")}</li>`;
      if (cfg) $("bet-limits").textContent = t("race.bet.limits", { min: fmt(cfg.min_bet), max: fmt(cfg.max_bet), day: fmt(cfg.max_day), staked: fmt(me.day_staked) });
    }
    hooks.changed();
  }

  async function refresh(): Promise<void> {
    if (!account.wallet()) { me = null; showMe(); return; }
    try {
      me = await api("/api/race/me");
    } catch (err) {
      me = null;
      say(String((err as Error).message), true);
    }
    showMe();
  }

  // ---- a race ---------------------------------------------------------------------------------------------
  /** Why a race at this stake can't go now (null: it can). */
  function blocked(stake: string): string | null {
    if (state !== "open" || !cfg) return t("race.msg.betClosed");
    if (cfg.paused) return t("race.bet.paused");
    if (!account.wallet() || !me) return t("race.msg.signInFirst");
    const s = Number(stake);
    if (!toWei(stake) || !(s > 0)) return t("race.msg.stakeBad");
    if (s < Number(cfg.min_bet) || s > Number(cfg.max_bet)) return t("race.bet.stakeRange", { min: fmt(cfg.min_bet), max: fmt(cfg.max_bet) });
    if (s > Number(me.balance)) return t("race.bet.overBalance");
    if (Number(me.day_staked) + s > Number(cfg.max_day)) return t("race.bet.overDay", { day: fmt(cfg.max_day) });
    return null;
  }

  /** The commit shown before each race, by race id: Verify checks the revealed seed against what was on screen. */
  const shownBefore = new Map<string, string>();

  /**
   * The server's events for a race, as its brains run them: first the ones it already sent, then polled about once
   * a second until the finish. Events are taken by their sequence number, so none is shown twice or skipped.
   */
  async function* events(race: BetRace): AsyncGenerator<RaceEvent> {
    let next = 0;                              // the next sequence number to show
    let batch = race.events ?? [];
    for (;;) {
      for (const e of [...batch].sort((a, b) => a.seq - b.seq)) {
        if (e.seq < next) continue;
        next = e.seq + 1;
        const ev = strip(e);
        yield ev;
        if (ev.type === "end") return;
      }
      await new Promise((r) => setTimeout(r, 1000));
      // `after` counts like Fly Roulette's (events with seq >= after); asking from the last one shown also covers a
      // server that sends seq > after
      const r: BetRace = await api(`/api/race/races/${encodeURIComponent(String(race.id))}${next ? `?after=${next - 1}` : ""}`);
      if (r.status === "void") throw new ApiError(500, t("race.bet.raceVoid"));
      batch = r.events ?? [];
    }
  }

  /** Shows a server race to the end, then its seeds (for Verify) and the refreshed balance. */
  async function watch(race: BetRace): Promise<void> {
    watching = true;
    resultEl.hidden = true;
    try {
      await hooks.show(race, events(race));
      const done: BetRace = await api(`/api/race/races/${encodeURIComponent(String(race.id))}`);
      showResult(done);
    } finally {
      watching = false;
      await refresh();
    }
  }

  /** One race on the server: commit, race, then watch it run. Resolves after the finish. */
  async function play(pick: number, bet: BetType, stake: string): Promise<void> {
    if (!me) throw new Error(t("race.msg.signInFirst"));
    if (!me.terms_accepted) {
      if (!(await acceptTerms())) throw new Cancelled();
      me.terms_accepted = true;
    }
    say(t("race.bet.locking"));
    let race: BetRace;
    try {
      const commit: Commit = await api("/api/race/commit", {});
      commitEl.textContent = commit.hash;
      race = await api("/api/race/races", { commit_id: commit.commit_id, client_seed: randomHex(16), pick, bet, stake: stake.trim() });
      shownBefore.set(String(race.id), commit.hash);
    } catch (err) {
      void refresh();
      throw err;
    }
    say("");
    me.balance = String(Number(me.balance) - Number(race.stake));
    me.day_staked = String(Number(me.day_staked) + Number(race.stake));
    showMe();
    await watch(race);
  }

  // ---- after a race: show the seeds and let the player check it ---------------------------------------------
  let last: BetRace | null = null;
  function showResult(r: BetRace): void {
    last = r;
    $("res-line").innerHTML = r.status === "void" ? t("race.bet.resVoid", { id: esc(String(r.id)) })
      : r.won ? t("race.bet.resWon", { id: esc(String(r.id)), amount: fmt(r.payout) })
      : t("race.bet.resLost", { id: esc(String(r.id)), amount: fmt(r.stake) });
    account.seeds(r);
  }

  let verifying = false;
  async function verify(): Promise<void> {
    const r = last;
    if (!r?.server_seed || verifying || hooks.busy()) return;
    const out = $("res-verify-out");
    const btn = $<HTMLButtonElement>("res-verify");
    const shown = shownBefore.get(String(r.id));
    if ((await sha256Hex(r.server_seed)) !== r.commit_hash) { out.textContent = t("race.bet.vBadSeed"); return; }
    if (shown && shown !== r.commit_hash) { out.textContent = t("race.bet.vBadCommit"); return; }
    const brain = hooks.brainState();
    if (brain !== "ready") { out.textContent = t(brain === "failed" ? "race.bet.vNoBrain" : "race.bet.vLoading"); return; }
    const rng = await deriveRng(r.server_seed, r.client_seed);
    const table = setupRace(rng);
    if (JSON.stringify(table.names) !== JSON.stringify(r.names)) { out.textContent = t("race.bet.vBadTable"); return; }
    const theirs = [...r.events].sort((a, b) => a.seq - b.seq).map((e) => JSON.stringify(strip(e)));
    const legs = theirs.length - 1;
    verifying = true;
    btn.disabled = true;
    hooks.changed();
    let k = 0;
    try {
      out.textContent = t("race.bet.vStart");
      const ok = await hooks.replay(table, rng, (e) => {
        const same = JSON.stringify(e) === theirs[k];
        k++;
        if (e.type === "leg") out.textContent = t("race.bet.vProgress", { k, n: legs });
        return same;
      });
      out.textContent = ok && k === theirs.length ? t("race.bet.vOk", { n: legs }) : t("race.bet.vDiff", { k });
    } finally {
      verifying = false;
      btn.disabled = false;
      hooks.changed();
    }
  }

  /** A race from the history list, fetched so it can be verified. */
  async function openRace(id: string): Promise<void> {
    if (verifying) return;
    try {
      showResult(await api(`/api/race/races/${id}`));
    } catch (err) {
      say(String((err as Error).message), true);
    }
  }

  // ---- start ------------------------------------------------------------------------------------------------
  async function start(): Promise<void> {
    const r = await account.boot<Config>("/api/race/config", (c) => { cfg = c; hooks.changed(); });
    if (r !== "open") { state = "closed"; hooks.changed(); return; }
    state = "open";
    if (cfg!.paused) say(t("race.bet.paused"), true);
    account.wire();
    $("res-verify").onclick = () => void verify();
    historyEl.onclick = (e) => {
      const li = (e.target as HTMLElement).closest("li[data-id]") as HTMLElement | null;
      if (li) void openRace(li.dataset.id!);
    };
    await refresh();
    // a race still running from before a reload: watch it to the end
    if (me?.live_race != null && !hooks.busy()) {
      try {
        const r: BetRace = await api(`/api/race/races/${encodeURIComponent(String(me.live_race))}`);
        void watch(r).catch((err) => say(String((err as Error).message), true));
      } catch { /* it finished meanwhile: the history has it */ }
    }
  }
  void start();

  return {
    play, blocked,
    state: () => state,
    watching: () => watching,
    verifying: () => verifying,
    /** the FLYAI balance, or null when signed out */
    balance: () => (account.wallet() && me ? me.balance : null),
    config: () => cfg,
  };
}
