/**
 * FlightPass (flytrade/autopilot/SPEC.md): an NFT, one per Trader Flies holder wallet, whose FLYAI balance lives
 * here, in the same ledger as roulette and compute orders, under the key `pass:<token id>`. The balance belongs to
 * the token, so it moves with it: whoever owns the token on chain right now controls it.
 *
 * - The team prefunds each pass once (`prefund` rows). That part is locked: it can be played, never withdrawn.
 * - The owner deposits FLYAI (a transfer to PAY_TO, as roulette deposits; no fee) and, once they have deposited at
 *   least once, asks for anything above the locked part back. A withdrawal pays 99%: the amount leaves the pass at
 *   once as a `withdraw` row for what the operator sends and a `fee` row for the dev's 1%.
 * - With FLIGHTPASS_PAYOUT_KEY the server sends withdrawals itself from that hot wallet, oldest first, each up to
 *   FLIGHTPASS_AUTO_MAX and FLIGHTPASS_AUTO_DAY in all per UTC day; bigger ones wait for the operator. A row is marked
 *   `sending_at` before its transfer goes out and is never sent again: a send that may have left the wallet without a
 *   receipt keeps its `error` for the operator to settle (tx or cancel) by hand.
 * - While the pass is listed on the FlightPass market (FlyMarket.isListed) deposits, withdrawals and autoplay stop,
 *   so a buyer gets the balance they saw.
 * - Autopilot: the owner turns games on. Roulette is played here (roulette.autoBet, terms checked on the owner), and
 *   so is Fly Slots (slots.autoSpin, the same terms; one spin per FLIGHTPASS_SLOTS_GAP_SEC, added 2026-09-29);
 *   Flybook missions, duels and breeding are played by the Flybook worker, which asks GET /api/flightpass/autopilot.
 *   Settings belong to the owner who wrote them: when the pass changes hands everything is off until the new owner
 *   sets it again, so nobody inherits someone else's bets.
 * - Mining: every sample of the pass owners records, per pass and UTC day, who held it. A wallet that held a pass
 *   in every sample of a day gets MINING_BOOST on that day's points (monthPoints in server.ts), on top of staking.
 *
 * Off until FLIGHTPASS is set.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { selector } from "./staking.ts";
import { rpc } from "./orders.ts";
import { checksumAddress } from "./wallet.ts";

export const MINING_BOOST = 1.25;
export const WITHDRAW_FEE_BPS = 100n;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

interface Roulette {
  autoBet: (key: string, owner: string, o: { flies: number; stake: bigint; maxDay: bigint }) => Promise<unknown>;
  termsAccepted: (wallet: string) => boolean;
  daySpent: (wallet: string) => bigint;
  isOn: () => boolean;
  liveFor: (wallet: string) => boolean;
  liveCount: () => number;
  CFG: { minBet: bigint; maxBet: bigint; maxDay: bigint; maxLive: number };
}

interface Slots {
  autoSpin: (key: string, owner: string, o: { stake: bigint; maxDay: bigint }) => Promise<unknown>;
  daySpent: (wallet: string) => bigint;
  isOn: () => boolean;
  CFG: { minBet: bigint; maxBet: bigint; maxDay: bigint };
}

export interface Payer {
  address: string;
  balance: () => Promise<bigint>;
  send: (to: string, data: string) => Promise<string>;
}

export interface FlightPassDeps {
  db: DatabaseSync;
  transaction: <T>(fn: () => T) => T;
  book: (wallet: string, orderId: string | null, kind: string, amount: bigint, extra?: { tx?: string }) => void;
  balanceOf: (wallet: string) => bigint;
  sessionWallet: (req: IncomingMessage) => string;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  toWei: (s: string) => bigint;
  fromWei: (w: bigint) => string;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  transfersIn: (tx: string) => Promise<{ from: string; value: bigint; at: number }[] | null>;
  roulette: Roulette;
  slots: Slots;
  rpcUrl: string;
  payTo: string | null;
  today: () => string;
  env: NodeJS.ProcessEnv;
  /** the FLYAI token, for the payer's transfers */
  token: string;
  payer: Payer | null;
}

export interface Settings {
  owner: string | null; // who wrote them; they only count while that wallet owns the pass
  roulette: { on: boolean; stake: string; flies: number; max_day: string };
  slots: { on: boolean; stake: string; max_day: string };
  flybook: { missions: boolean; duels: boolean; breed: boolean };
}
// (settings saved before slots existed have no `slots`: settingsOf's spread over OFF() gives them slots off)
const OFF = (): Settings => ({ owner: null, roulette: { on: false, stake: "0", flies: 2, max_day: "0" }, slots: { on: false, stake: "0", max_day: "0" }, flybook: { missions: false, duels: false, breed: false } });

const SEL = {
  ownerOf: selector("ownerOf(uint256)"),
  isListed: selector("isListed(uint256)"),
  totalSupply: selector("totalSupply()"),
  aggregate3: selector("aggregate3((address,bool,bytes)[])"),
};
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const utcDayStart = (t = Date.now()) => t - (t % 86_400_000);

export function createFlightPass(d: FlightPassDeps) {
  const { db, transaction, book, balanceOf, HttpError, toWei, fromWei } = d;
  const CFG = {
    contract: d.env.FLIGHTPASS ? checksumAddress(d.env.FLIGHTPASS) : null,
    market: d.env.PASSMARKET ? checksumAddress(d.env.PASSMARKET) : null,
    workerKey: d.env.FLIGHTPASS_WORKER_KEY ?? "",
    /** ids 1..maxId when the contract has no totalSupply() */
    maxId: Number(d.env.FLIGHTPASS_MAX_ID ?? "0"),
    tickMs: Number(d.env.FLIGHTPASS_TICK_SEC ?? "60") * 1000,
    /** the least time between two autopilot bets of one pass */
    betGapMs: Number(d.env.FLIGHTPASS_BET_GAP_MIN ?? "10") * 60_000,
    /** the least time between two autopilot slot spins of one pass (a spin is over at once, so seconds, not minutes) */
    spinGapMs: Number(d.env.FLIGHTPASS_SLOTS_GAP_SEC ?? "60") * 1000,
    /** tables autopilot leaves free for people */
    freeTables: Number(d.env.FLIGHTPASS_FREE_TABLES ?? "2"),
    sampleMs: Number(d.env.FLIGHTPASS_SAMPLE_MIN ?? d.env.STAKE_SAMPLE_MIN ?? "10") * 60_000,
    depositsSince: Date.parse(d.env.FLIGHTPASS_DEPOSITS_SINCE ?? "2026-09-28T00:00:00Z"),
    /** FLYAI locked on every pass the first time it's seen (passes are claimed one by one); 0 = only the admin call */
    /** the most one withdrawal the payer sends by itself, and in all per UTC day */
    autoMax: toWei(d.env.FLIGHTPASS_AUTO_MAX ?? "25000"),
    autoDay: toWei(d.env.FLIGHTPASS_AUTO_DAY ?? "100000"),
    payMs: Number(d.env.FLIGHTPASS_PAY_SEC ?? "30") * 1000,
    autoPrefund: (() => { try { return toWei(d.env.FLIGHTPASS_PREFUND ?? "0"); } catch { throw new Error("FLIGHTPASS_PREFUND is a number of tokens"); } })(),
  };
  if (!Number.isFinite(CFG.depositsSince)) throw new Error("FLIGHTPASS_DEPOSITS_SINCE is a date, e.g. 2026-09-28T00:00:00Z");
  const on = !!CFG.contract;
  const key = (id: number) => `pass:${id}`;
  const one = <T>(sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T;

  // ---- chain ---------------------------------------------------------------------------------------------
  const call = (to: string, data: string) => rpc(d.rpcUrl, "eth_call", [{ to, data }, "latest"]) as Promise<string>;
  const addressOf = (ret: string) => checksumAddress(`0x${ret.slice(-40)}`);

  async function ownerOfNow(id: number): Promise<string | null> {
    try {
      const r = await call(CFG.contract!, SEL.ownerOf + word(id));
      return BigInt(r) === 0n ? null : addressOf(r);
    } catch {
      return null; // not minted (or burned)
    }
  }
  async function listedNow(id: number): Promise<boolean> {
    if (!CFG.market) return false;
    return BigInt(await call(CFG.market, SEL.isListed + word(id))) !== 0n;
  }
  async function supply(): Promise<number> {
    try {
      return Number(BigInt(await call(CFG.contract!, SEL.totalSupply)));
    } catch (err) {
      // no FLIGHTPASS_MAX_ID to fall back on: a failed read is a failed sample, not "0 passes" (2026-09-29)
      if (!CFG.maxId) throw err;
      return CFG.maxId;
    }
  }

  /** Multicall3's aggregate3 with allowFailure: each call's return data, or null where it reverted. */
  let multicall: boolean | null = null;
  async function batch(calls: { to: string; data: string }[]): Promise<(string | null)[]> {
    multicall ??= ((await rpc(d.rpcUrl, "eth_getCode", [MULTICALL3, "latest"]).catch(() => "0x")) as string).length > 2;
    if (!multicall) {
      // a local chain without Multicall3: one call at a time
      const out: (string | null)[] = [];
      for (const c of calls) out.push(await call(c.to, c.data).catch(() => null));
      return out;
    }
    const out: (string | null)[] = [];
    for (let i = 0; i < calls.length; i += 100) {
      const part = calls.slice(i, i + 100);
      // (address target, bool allowFailure, bytes callData)[]: every tuple is 6 words (a call's data is at most 64 bytes)
      const heads: string[] = [], bodies: string[] = [];
      let at = part.length * 32;
      for (const c of part) {
        const bytes = c.data.slice(2);
        const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
        heads.push(word(at));
        const tuple = c.to.slice(2).toLowerCase().padStart(64, "0") + word(1) + word(96) + word(bytes.length / 2) + padded;
        bodies.push(tuple);
        at += tuple.length / 2;
      }
      const data = SEL.aggregate3 + word(32) + word(part.length) + heads.join("") + bodies.join("");
      const ret = (await call(MULTICALL3, data)).slice(2);
      const w = (pos: number) => BigInt(`0x${ret.slice(pos * 2, pos * 2 + 64)}`);
      const base = Number(w(0)) + 32; // array content starts after its length word
      const n = Number(w(Number(w(0))));
      for (let k = 0; k < n; k++) {
        const t = base + Number(w(base + k * 32));
        const ok = w(t) !== 0n;
        const p = t + Number(w(t + 32));
        const len = Number(w(p));
        out.push(ok ? `0x${ret.slice((p + 32) * 2, (p + 32 + len) * 2)}` : null);
      }
    }
    return out;
  }

  // ---- owners: sampled for every pass, read fresh before anything moves money --------------------------
  const owners = new Map<number, string>();
  const listed = new Set<number>();
  let sampledAt = 0;
  let sampling: Promise<void> | null = null;

  /** Reads every pass's owner and listing, and records who held each pass today (the mining boost). */
  function sample(): Promise<void> {
    sampling ??= (async () => {
      const t0 = Date.now();
      try {
        const n = await supply();
        const ids = Array.from({ length: n }, (_, i) => i + 1);
        const own = await batch(ids.map((id) => ({ to: CFG.contract!, data: SEL.ownerOf + word(id) })));
        const lst = CFG.market ? await batch(ids.map((id) => ({ to: CFG.market!, data: SEL.isListed + word(id) }))) : ids.map(() => null);
        const day = d.today();
        transaction(() => {
          ids.forEach((id, i) => {
            const r = own[i];
            if (r === null || BigInt(r) === 0n) {
              owners.delete(id);
              db.prepare("delete from flightpass_owners where pass = ?").run(id);
              return;
            }
            const who = addressOf(r);
            owners.set(id, who);
            db.prepare("insert into flightpass_owners (pass, wallet, at) values (?, ?, ?) on conflict (pass) do update set wallet = excluded.wallet, at = excluded.at")
              .run(id, who, Date.now());
            // a newly claimed pass gets the team's prefund once (the same row the admin call books)
            if (CFG.autoPrefund > 0n && !one("select 1 from ledger where tx = ?", `flightpass-prefund:${id}`)) {
              book(key(id), null, "prefund", CFG.autoPrefund, { tx: `flightpass-prefund:${id}` });
            }
            if (lst[i] !== null) { if (BigInt(lst[i]!) !== 0n) listed.add(id); else listed.delete(id); }
            // a pass counts for the wallet that held it at every sample of the day; any other holder breaks the day
            db.prepare(`insert into flightpass_days (pass, day, wallet, broken, samples) values (?, ?, ?, 0, 1)
              on conflict (pass, day) do update set samples = samples + 1, broken = broken or (wallet != excluded.wallet)`).run(id, day, who);
          });
        });
        sampledAt = Date.now();
        if (sampledAt - t0 > 10_000) console.log(`flightpass sample took ${sampledAt - t0} ms for ${n} passes`);
      } catch (err) {
        console.error(`flightpass sample failed: ${err instanceof Error ? err.message : err}`);
      } finally {
        sampling = null;
      }
    })();
    return sampling;
  }
  /**
   * The sampled owners for a page: a sample over a minute old is refreshed in the background, so a read never waits
   * on the chain (a full sample is ~20 RPC round trips, longer than the page waits). Only before the first sample does it wait.
   */
  async function fresh(): Promise<void> {
    if (Date.now() - sampledAt <= 60_000) return;
    const s = sample();
    if (!sampledAt) await s;
  }

  /** The owner and listing right now, from the chain; the pass must exist. */
  async function current(id: number) {
    const owner = await ownerOfNow(id);
    if (!owner) throw new HttpError(404, "no such FlightPass");
    const isListed = await listedNow(id);
    owners.set(id, owner);
    if (isListed) listed.add(id); else listed.delete(id);
    return { owner, listed: isListed };
  }

  // ---- books ---------------------------------------------------------------------------------------------
  const sumKind = (id: number, kind: string, txLike?: string) => {
    let s = 0n;
    for (const r of db.prepare(`select amount_wei from ledger where wallet = ? and kind = ?${txLike ? " and tx like ?" : ""}`)
      .all(...[key(id), kind, ...(txLike ? [txLike] : [])]) as { amount_wei: string }[]) s += BigInt(r.amount_wei);
    return s;
  };
  const locked = (id: number) => sumKind(id, "prefund");
  const hasDeposited = (id: number) => !!one("select 1 from ledger where wallet = ? and kind = 'deposit'", key(id));
  const withdrawable = (id: number, isListed: boolean) => {
    if (isListed || !hasDeposited(id)) return 0n;
    const free = balanceOf(key(id)) - locked(id);
    return free > 0n ? free : 0n;
  };

  function settingsOf(id: number): Settings {
    const r = one<{ settings: string } | undefined>("select settings from flightpass where id = ?", id);
    return r ? { ...OFF(), ...JSON.parse(r.settings) } : OFF();
  }
  /** Settings in force: the ones its current owner wrote, else everything off. */
  const activeSettings = (id: number, owner: string | undefined) => {
    const s = settingsOf(id);
    return owner && s.owner === owner ? s : OFF();
  };

  /**
   * Why the roulette autopilot is or isn't betting right now, for the pass page (the same checks tick() makes, in the
   * same order): off, listed, paused (roulette off or out of tables), terms, stake (outside today's bet limits),
   * day_cap (the pass's or the house's daily cap; bets again at resets_at), low_balance, playing (a game is on) or
   * waiting (the next bet at next_at).
   */
  function rouletteStatus(id: number, owner: string, isListed: boolean) {
    const s = activeSettings(id, owner).roulette;
    const k = key(id);
    if (!s.on) return { state: "off" };
    if (isListed) return { state: "listed" };
    if (!d.roulette.isOn()) return { state: "paused" };
    if (!d.roulette.termsAccepted(owner)) return { state: "terms" };
    const stake = toWei(s.stake), R = d.roulette.CFG;
    if (stake < R.minBet || stake > R.maxBet) return { state: "stake", min: fromWei(R.minBet), max: fromWei(R.maxBet) };
    const own = toWei(s.max_day);
    const cap = own < R.maxDay ? own : R.maxDay;
    if (d.roulette.daySpent(k) + stake > cap) {
      return { state: "day_cap", cap: fromWei(cap), yours: own < R.maxDay, house_max: fromWei(R.maxDay), resets_at: utcDayStart() + 86_400_000 };
    }
    if (balanceOf(k) < stake) return { state: "low_balance", need: fromWei(stake) };
    if (d.roulette.liveFor(k)) return { state: "playing" };
    const last = one<{ last_bet_at: number | null } | undefined>("select last_bet_at from flightpass where id = ?", id)?.last_bet_at ?? 0;
    return { state: "waiting", next_at: Math.max(Date.now(), last + CFG.betGapMs) };
  }

  /** When the pass last spun (its newest slots_spins row): the gap survives a restart without a column of its own. */
  const lastSpinAt = (id: number) => one<{ t: number | null }>("select max(created_at) as t from slots_spins where wallet = ?", key(id)).t ?? 0;
  /** What this pass may spin today: its own max_day, never past the house's daily cap. */
  const slotsCap = (s: Settings["slots"]) => {
    const own = toWei(s.max_day);
    return own < d.slots.CFG.maxDay ? own : d.slots.CFG.maxDay;
  };

  /**
   * Why the slots autopilot is or isn't spinning, as rouletteStatus (the same checks tick() makes, in the same order):
   * off, listed, paused (slots off or the house stop), terms, stake, day_cap (resets_at), low_balance or waiting
   * (next_at). No "playing": a spin is settled the moment it's made.
   */
  function slotsStatus(id: number, owner: string, isListed: boolean) {
    const s = activeSettings(id, owner).slots;
    const k = key(id), S = d.slots.CFG;
    if (!s.on) return { state: "off" };
    if (isListed) return { state: "listed" };
    if (!d.slots.isOn()) return { state: "paused" };
    if (!d.roulette.termsAccepted(owner)) return { state: "terms" };
    const stake = toWei(s.stake);
    if (stake < S.minBet || stake > S.maxBet) return { state: "stake", min: fromWei(S.minBet), max: fromWei(S.maxBet) };
    const cap = slotsCap(s);
    if (d.slots.daySpent(k) + stake > cap) {
      return { state: "day_cap", cap: fromWei(cap), yours: toWei(s.max_day) < S.maxDay, house_max: fromWei(S.maxDay), resets_at: utcDayStart() + 86_400_000 };
    }
    if (balanceOf(k) < stake) return { state: "low_balance", need: fromWei(stake) };
    return { state: "waiting", next_at: Math.max(Date.now(), lastSpinAt(id) + CFG.spinGapMs) };
  }

  /** A pass's ledger, newest first, `limit` rows before ledger id `before` (null: from the newest); next is the id to ask with, or null at the start. */
  function historyPage(id: number, before: number | null, limit: number) {
    const rows = db.prepare(`select id, kind, amount_wei, tx, at from ledger where wallet = ?${before ? " and id < ?" : ""} order by id desc limit ?`)
      .all(...[key(id), ...(before ? [before] : []), limit + 1]) as { id: number; kind: string; amount_wei: string; tx: string | null; at: number }[];
    const items = rows.slice(0, limit).map((r) => ({ id: r.id, kind: r.kind, amount: fromWei(BigInt(r.amount_wei)), tx: r.tx, at: r.at }));
    return { items, next: rows.length > limit ? items[items.length - 1].id : null };
  }

  /** GET /api/flightpass/:id/history: the owner's older pages. Owner from the sample, so paging never waits on the chain. */
  async function history(req: IncomingMessage, id: number, url: URL) {
    const wallet = d.sessionWallet(req);
    const owner = owners.get(id) ?? (await current(id)).owner;
    if (owner !== wallet) throw new HttpError(403, "that FlightPass isn't yours");
    const before = url.searchParams.get("before");
    if (before !== null && !/^\d{1,12}$/.test(before)) throw new HttpError(400, "before is a history id");
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
    return historyPage(id, before === null ? null : Number(before), limit);
  }

  function view(id: number, owner: string, isListed: boolean, mine: boolean) {
    const k = key(id);
    const base = {
      id, owner, listed: isListed, balance: fromWei(balanceOf(k)), locked: fromWei(locked(id)),
      withdrawable: fromWei(withdrawable(id, isListed)), has_deposited: hasDeposited(id),
    };
    if (!mine) return base;
    return {
      ...base,
      settings: activeSettings(id, owner),
      terms_accepted: d.roulette.termsAccepted(owner),
      day_bet: fromWei(d.roulette.daySpent(k)),
      // what this pass may bet today: its own "max per day" when roulette is on, never past the house's daily cap
      day_cap: fromWei(((s) => s.on && toWei(s.max_day) < d.roulette.CFG.maxDay ? toWei(s.max_day) : d.roulette.CFG.maxDay)(activeSettings(id, owner).roulette)),
      roulette_status: rouletteStatus(id, owner, isListed),
      slots_status: slotsStatus(id, owner, isListed),
      slots_day_spent: fromWei(d.slots.daySpent(k)),
      // as day_cap: the pass's own slots max_day when slots are on, never past the house's
      slots_day_cap: fromWei(((s) => s.on ? slotsCap(s) : d.slots.CFG.maxDay)(activeSettings(id, owner).slots)),
      live_game: (one<{ id: string } | undefined>("select id from roulette_games where wallet = ? and status = 'live'", k))?.id ?? null,
      // the latest page; older ones come from /api/flightpass/:id/history?before=<the last id>
      history: historyPage(id, null, 30).items,
      games: (db.prepare("select id, flies, pick, stake_wei, payout_wei, status, winner, created_at from roulette_games where wallet = ? order by created_at desc limit 20").all(k) as any[])
        .map((g) => ({ id: g.id, flies: g.flies, pick: g.pick, stake: fromWei(BigInt(g.stake_wei)), payout: fromWei(BigInt(g.payout_wei)), status: g.status, won: g.status === "done" ? g.winner === g.pick : null, created_at: g.created_at })),
      spins: (db.prepare("select id, stake_wei, mult, payout_wei, symbols, created_at from slots_spins where wallet = ? order by created_at desc limit 20").all(k) as any[])
        .map((r) => ({ id: r.id, stake: fromWei(BigInt(r.stake_wei)), mult: r.mult, payout: fromWei(BigInt(r.payout_wei)), symbols: JSON.parse(r.symbols), created_at: r.created_at })),
      withdrawals: (db.prepare("select id, amount_wei, fee_wei, status, created_at, done_at, tx from flightpass_withdrawals where pass = ? order by id desc limit 10").all(id) as any[])
        .map((w) => ({ id: w.id, amount: fromWei(BigInt(w.amount_wei)), fee: fromWei(BigInt(w.fee_wei)), status: w.status, created_at: w.created_at, done_at: w.done_at, tx: w.tx })),
      // the one waiting on the operator, if any: what the page shows as "on its way"
      withdraw_request: ((w) => w ? { amount: fromWei(BigInt(w.amount_wei)), created_at: w.created_at } : null)(
        one<{ amount_wei: string; created_at: number } | undefined>("select amount_wei, created_at from flightpass_withdrawals where pass = ? and status = 'open' order by id desc limit 1", id)),
    };
  }

  // ---- views ---------------------------------------------------------------------------------------------
  function config() {
    return {
      on, contract: CFG.contract, market: CFG.market, pay_to: d.payTo, withdraw_fee_bps: Number(WITHDRAW_FEE_BPS), mining_boost: MINING_BOOST,
      games: ["roulette", "slots", "flybook_missions", "flybook_duels", "flybook_breed"],
      roulette: { on: d.roulette.isOn(), min_bet: fromWei(d.roulette.CFG.minBet), max_bet: fromWei(d.roulette.CFG.maxBet), max_day: fromWei(d.roulette.CFG.maxDay), min_flies: 2, max_flies: 10, bet_gap_min: CFG.betGapMs / 60_000 },
      slots: { on: d.slots.isOn(), min_bet: fromWei(d.slots.CFG.minBet), max_bet: fromWei(d.slots.CFG.maxBet), max_day: fromWei(d.slots.CFG.maxDay), spin_gap_min: CFG.spinGapMs / 60_000 },
      // the automatic withdrawals' limits and how much of today's has gone (2026-09-29, the user: "add in the flypass
      // the max withdrawal per day and how much done already"): all passes share the day's total; a bigger
      // withdrawal, or one past it, waits for the operator
      withdrawals: { auto: !!d.payer, max_each: fromWei(CFG.autoMax), max_day: fromWei(CFG.autoDay),
                     sent_today: fromWei(d.payer ? autoSentToday() : 0n), resets_at: utcDayStart() + 86_400_000 },
    };
  }

  async function mine(req: IncomingMessage) {
    const wallet = d.sessionWallet(req);
    await fresh();
    const ids = [...owners].filter(([, w]) => w === wallet).map(([id]) => id).sort((a, b) => a - b);
    return { wallet, sampled_at: sampledAt || null, passes: ids.map((id) => view(id, wallet, listed.has(id), true)) };
  }

  async function onePass(req: IncomingMessage, id: number) {
    const { owner, listed: isListed } = await current(id);
    let wallet: string | null = null;
    try { wallet = d.sessionWallet(req); } catch { /* public view */ }
    return view(id, owner, isListed, wallet === owner);
  }

  /** The pass as its owner, right now, and not listed: for anything that moves money or changes settings. */
  async function asOwner(req: IncomingMessage, id: number, what: string) {
    const wallet = d.sessionWallet(req);
    const { owner, listed: isListed } = await current(id);
    if (owner !== wallet) throw new HttpError(403, "that FlightPass isn't yours");
    if (isListed) throw new HttpError(409, `the pass is listed for sale: ${what} are off until you cancel the listing`);
    return wallet;
  }

  // ---- actions -------------------------------------------------------------------------------------------
  async function deposit(req: IncomingMessage, id: number, body: any) {
    const wallet = await asOwner(req, id, "deposits");
    const tx = String(body.tx ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new HttpError(400, "tx is a transaction hash");
    if (one("select 1 from ledger where tx = ?", tx)) throw new HttpError(409, "that transaction was already credited");
    let transfers;
    try {
      transfers = await d.transfersIn(tx);
    } catch (err) {
      throw new HttpError(502, `couldn't read the chain: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!transfers) throw new HttpError(409, "that transaction isn't mined yet; try again in a few seconds");
    const mineT = transfers.filter((t) => t.from.toLowerCase() === wallet.toLowerCase());
    if (!mineT.length) throw new HttpError(402, "that transaction sends no FLYAI from your wallet to the deposit address");
    if (mineT[0].at < CFG.depositsSince) throw new HttpError(402, "that transfer is older than FlightPass deposits; it can't be credited");
    const value = mineT.reduce((s, t) => s + t.value, 0n);
    transaction(() => {
      if (one("select 1 from ledger where tx = ?", tx)) throw new HttpError(409, "that transaction was just credited");
      book(key(id), null, "deposit", value, { tx });
    });
    return view(id, wallet, false, true);
  }

  async function withdraw(req: IncomingMessage, id: number, body: any) {
    const wallet = await asOwner(req, id, "withdrawals");
    let amount: bigint;
    try { amount = toWei(String(body.amount ?? "")); } catch { throw new HttpError(400, "amount is a number of tokens"); }
    if (amount <= 0n) throw new HttpError(400, "amount must be more than 0");
    transaction(() => {
      if (!hasDeposited(id)) throw new HttpError(403, "withdrawals open once you've deposited FLYAI yourself; the prefund stays on the pass");
      if (d.roulette.liveFor(key(id))) throw new HttpError(409, "a game is on the table; try again when it's over");
      const free = withdrawable(id, false);
      if (amount > free) throw new HttpError(400, `you can withdraw up to ${fromWei(free)} FLYAI (the ${fromWei(locked(id))} prefund stays on the pass)`);
      const fee = (amount * WITHDRAW_FEE_BPS) / 10_000n;
      const r = db.prepare("insert into flightpass_withdrawals (pass, wallet, amount_wei, fee_wei, status, created_at) values (?, ?, ?, ?, 'open', ?)")
        .run(id, wallet, (amount - fee).toString(), fee.toString(), Date.now());
      const n = Number(r.lastInsertRowid);
      book(key(id), null, "withdraw", amount - fee, { tx: `flightpass-withdraw:${n}` });
      if (fee > 0n) book(key(id), null, "fee", fee, { tx: `flightpass-fee:${n}` });
    });
    return view(id, wallet, false, true);
  }

  async function saveSettings(req: IncomingMessage, id: number, body: any) {
    const wallet = await asOwner(req, id, "setting changes");
    const s = activeSettings(id, wallet);
    const r = body.roulette;
    if (r !== undefined) {
      if (typeof r !== "object" || r === null) throw new HttpError(400, "roulette is an object");
      const next = { ...s.roulette };
      if (r.on !== undefined) next.on = r.on === true;
      if (r.flies !== undefined) {
        const f = Number(r.flies);
        if (!Number.isInteger(f) || f < 2 || f > 10) throw new HttpError(400, "flies is 2 to 10");
        next.flies = f;
      }
      for (const k of ["stake", "max_day"] as const) {
        if (r[k] === undefined) continue;
        try { next[k] = fromWei(toWei(String(r[k]))); } catch { throw new HttpError(400, `${k} is a number of tokens`); }
      }
      if (next.on) {
        const stake = toWei(next.stake);
        if (stake < d.roulette.CFG.minBet || stake > d.roulette.CFG.maxBet) {
          throw new HttpError(400, `stake is ${fromWei(d.roulette.CFG.minBet)} to ${fromWei(d.roulette.CFG.maxBet)} FLYAI`);
        }
        if (toWei(next.max_day) < stake) throw new HttpError(400, "max_day must cover at least one bet");
        if (!d.roulette.termsAccepted(wallet)) throw new HttpError(403, "accept the Fly Roulette terms (18+) first");
      }
      s.roulette = next;
    }
    const sl = body.slots;
    if (sl !== undefined) {
      if (typeof sl !== "object" || sl === null) throw new HttpError(400, "slots is an object");
      const next = { ...s.slots };
      if (sl.on !== undefined) next.on = sl.on === true;
      for (const k of ["stake", "max_day"] as const) {
        if (sl[k] === undefined) continue;
        try { next[k] = fromWei(toWei(String(sl[k]))); } catch { throw new HttpError(400, `${k} is a number of tokens`); }
      }
      if (next.on) {
        const stake = toWei(next.stake), S = d.slots.CFG;
        if (stake < S.minBet || stake > S.maxBet) throw new HttpError(400, `slots stake is ${fromWei(S.minBet)} to ${fromWei(S.maxBet)} FLYAI`);
        if (toWei(next.max_day) < stake) throw new HttpError(400, "max_day must cover at least one spin");
        if (!d.roulette.termsAccepted(wallet)) throw new HttpError(403, "accept the terms (18+) first");
      }
      s.slots = next;
    }
    const f = body.flybook;
    if (f !== undefined) {
      if (typeof f !== "object" || f === null) throw new HttpError(400, "flybook is an object");
      for (const k of ["missions", "duels", "breed"] as const) if (f[k] !== undefined) s.flybook[k] = f[k] === true;
    }
    s.owner = wallet;
    db.prepare(`insert into flightpass (id, settings, updated_at) values (?, ?, ?)
      on conflict (id) do update set settings = excluded.settings, updated_at = excluded.updated_at`).run(id, JSON.stringify(s), Date.now());
    return view(id, wallet, false, true);
  }

  /** For the Flybook worker: unlisted passes whose owner turned a Flybook game on. */
  async function autopilot(req: IncomingMessage, game: string) {
    const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
    if (!CFG.workerKey || given !== CFG.workerKey) throw new HttpError(403, "worker only");
    if (game !== "flybook") throw new HttpError(400, "game is flybook");
    await fresh();
    const out: { pass: number; owner: string; settings: Settings["flybook"] }[] = [];
    for (const r of db.prepare("select id from flightpass").all() as { id: number }[]) {
      const owner = owners.get(r.id);
      if (!owner || listed.has(r.id)) continue;
      const s = activeSettings(r.id, owner);
      if (s.flybook.missions || s.flybook.duels || s.flybook.breed) out.push({ pass: r.id, owner, settings: s.flybook });
    }
    return { passes: out };
  }

  // ---- admin ---------------------------------------------------------------------------------------------
  /** The team's prefund: `amount` FLYAI locked on each pass, once per pass. */
  async function prefund(body: any) {
    let amount: bigint;
    try { amount = toWei(String(body.amount ?? "")); } catch { throw new HttpError(400, "amount is a number of tokens"); }
    if (amount <= 0n) throw new HttpError(400, "amount must be more than 0");
    let ids: number[];
    if (body.all === true) ids = Array.from({ length: await supply() }, (_, i) => i + 1);
    else if (Array.isArray(body.ids) && body.ids.every((x: unknown) => Number.isInteger(x) && (x as number) > 0)) ids = body.ids;
    else throw new HttpError(400, "ids is a list of token ids, or all: true");
    let done = 0, skipped = 0;
    for (const id of ids) {
      if (!(await ownerOfNow(id))) { skipped++; continue; }
      transaction(() => {
        if (one("select 1 from ledger where tx = ?", `flightpass-prefund:${id}`)) { skipped++; return; }
        book(key(id), null, "prefund", amount, { tx: `flightpass-prefund:${id}` });
        done++;
      });
    }
    return { prefunded: done, skipped, amount_each: fromWei(amount), total: fromWei(amount * BigInt(done)) };
  }

  async function admin() {
    let held = 0n, lockedAll = 0n;
    for (const r of db.prepare("select distinct wallet from ledger where wallet like 'pass:%'").all() as { wallet: string }[]) {
      held += balanceOf(r.wallet);
      lockedAll += locked(Number(r.wallet.slice(5)));
    }
    return {
      on, contract: CFG.contract, market: CFG.market, passes_seen: owners.size, listed: listed.size, sampled_at: sampledAt || null,
      balances_held: fromWei(held), locked: fromWei(lockedAll),
      payer: d.payer ? {
        address: d.payer.address, auto_max: fromWei(CFG.autoMax), auto_day: fromWei(CFG.autoDay), sent_today: fromWei(autoSentToday()),
        ...await payerFunds().then((f) => ({ flyai: fromWei(f.flyai), gas_eth: fromWei(f.gas) }), () => ({})), waiting_for_funds: waitingForFunds,
      } : null,
      withdrawals: (db.prepare("select * from flightpass_withdrawals where status = 'open' order by id").all() as any[])
        .map((w) => ({
          id: w.id, pass: w.pass, wallet: w.wallet, send: fromWei(BigInt(w.amount_wei)), fee: fromWei(BigInt(w.fee_wei)), created_at: w.created_at,
          sending_at: w.sending_at ?? null, error: w.error ?? null,
        })),
    };
  }

  /** The operator sent a withdrawal (tx), or cancels it (the amount and fee go back on the pass). */
  function settle(body: any) {
    const id = Number(body.id);
    const w = one<{ id: number; pass: number; amount_wei: string; fee_wei: string; status: string } | undefined>("select * from flightpass_withdrawals where id = ?", id);
    if (!w) throw new HttpError(404, "no such withdrawal");
    if (w.status !== "open") throw new HttpError(409, `that withdrawal is ${w.status}`);
    if (payingNow === id) throw new HttpError(409, "the server is sending that withdrawal right now; look again in a couple of minutes");
    if (body.cancel === true) {
      transaction(() => {
        db.prepare("update flightpass_withdrawals set status = 'cancelled', done_at = ? where id = ?").run(Date.now(), id);
        book(key(w.pass), null, "release", BigInt(w.amount_wei) + BigInt(w.fee_wei), { tx: `flightpass-refund:${id}` });
      });
      return { id, status: "cancelled" };
    }
    if (typeof body.tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.tx)) throw new HttpError(400, "tx is the hash of the transfer, or cancel: true");
    db.prepare("update flightpass_withdrawals set status = 'paid', done_at = ?, tx = ? where id = ?").run(Date.now(), body.tx.toLowerCase(), id);
    return { id, status: "paid" };
  }

  // ---- withdrawals the server sends ----------------------------------------------------------------------
  let payingNow: number | null = null;
  let payPausedUntil = 0;
  let waitingForFunds = false;
  const payerFunds = async () => {
    const [flyai, gas] = await Promise.all([call(d.token, selector("balanceOf(address)") + word(BigInt(d.payer!.address))).then(BigInt), d.payer!.balance()]);
    return { flyai, gas };
  };
  const autoSentToday = () => {
    let s = 0n;
    for (const r of db.prepare("select amount_wei from flightpass_withdrawals where sending_at >= ? and status != 'cancelled'").all(utcDayStart()) as { amount_wei: string }[]) s += BigInt(r.amount_wei);
    return s;
  };
  const transferData = (to: string, amount: bigint) => `${selector("transfer(address,uint256)")}${word(BigInt(to))}${word(amount)}`;

  async function payOut(): Promise<void> {
    if (!d.payer || payingNow !== null || Date.now() < payPausedUntil) return;
    const open = db.prepare("select id, wallet, amount_wei from flightpass_withdrawals where status = 'open' and sending_at is null order by id").all() as { id: number; wallet: string; amount_wei: string }[];
    for (const w of open) {
      const amount = BigInt(w.amount_wei);
      if (amount > CFG.autoMax) continue; // the operator's
      if (autoSentToday() + amount > CFG.autoDay) return;
      // an empty payout wallet is no fault: the request waits ("on its way") until it's topped up
      const funds = await payerFunds();
      if (funds.flyai < amount || funds.gas === 0n) {
        if (!waitingForFunds) console.log(`flightpass payouts waiting for funds: withdrawal ${w.id} needs ${fromWei(amount)} FLYAI, ${d.payer.address} has ${fromWei(funds.flyai)} FLYAI and ${fromWei(funds.gas)} ETH`);
        waitingForFunds = true;
        return;
      }
      waitingForFunds = false;
      // claimed before anything leaves: a restart mid-send never sends it again
      if (db.prepare("update flightpass_withdrawals set sending_at = ?, error = null where id = ? and status = 'open' and sending_at is null").run(Date.now(), w.id).changes !== 1) continue;
      payingNow = w.id;
      try {
        const tx = await d.payer.send(d.token, transferData(w.wallet, amount));
        db.prepare("update flightpass_withdrawals set status = 'paid', done_at = ?, tx = ? where id = ?").run(Date.now(), tx.toLowerCase(), w.id);
        console.log(`flightpass withdrawal ${w.id}: sent ${fromWei(amount)} FLYAI to ${w.wallet} (${tx})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if ((err as { unsent?: boolean }).unsent) {
          // nothing left the wallet (too little FLYAI or gas, a node down): back in line, try again in a while
          db.prepare("update flightpass_withdrawals set sending_at = null, error = ? where id = ?").run(msg, w.id);
          payPausedUntil = Date.now() + 10 * 60_000;
          console.error(`flightpass withdrawal ${w.id} not sent, retrying in 10 minutes: ${msg}`);
        } else {
          db.prepare("update flightpass_withdrawals set error = ? where id = ?").run(msg, w.id);
          console.error(`flightpass withdrawal ${w.id} may have been sent; the operator settles it: ${msg}`);
        }
        return;
      } finally {
        payingNow = null;
      }
    }
  }

  // ---- the autopilot -------------------------------------------------------------------------------------
  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      // each game on its own switch: slots spin while roulette is off, and the other way round (2026-09-29)
      if (d.roulette.isOn()) await rouletteTick();
      if (d.slots.isOn()) await slotsTick();
    } finally {
      ticking = false;
    }
  }

  async function rouletteTick(): Promise<void> {
    for (const r of db.prepare("select id, settings, last_bet_at from flightpass").all() as { id: number; settings: string; last_bet_at: number | null }[]) {
      const owner = owners.get(r.id);
      if (!owner || listed.has(r.id)) continue;
      const s = activeSettings(r.id, owner).roulette;
      if (!s.on || Date.now() - (r.last_bet_at ?? 0) < CFG.betGapMs) continue;
      const k = key(r.id);
      const stake = toWei(s.stake);
      const own = toWei(s.max_day), dayCap = own < d.roulette.CFG.maxDay ? own : d.roulette.CFG.maxDay;
      // (the house's daily cap too: without it a capped pass was refused, and logged, every tick until midnight)
      if (d.roulette.liveFor(k) || balanceOf(k) < stake || d.roulette.daySpent(k) + stake > dayCap) continue;
      if (d.roulette.liveCount() >= d.roulette.CFG.maxLive - CFG.freeTables) break;
      // the listing and owner right before the stake moves, not the last sample
      const now = await current(r.id).catch(() => null);
      if (!now || now.listed || now.owner !== owner) continue;
      try {
        await d.roulette.autoBet(k, owner, { flies: s.flies, stake, maxDay: toWei(s.max_day) });
        db.prepare("update flightpass set last_bet_at = ? where id = ?").run(Date.now(), r.id);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 503) break; // off, paused or tables full: nobody bets now
        if (status !== 402 && status !== 403) console.error(`flightpass ${r.id} autobet: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /** At most one slot spin per pass per spinGapMs, within the pass's balance and daily caps (the checks slotsStatus shows). */
  async function slotsTick(): Promise<void> {
    for (const r of db.prepare("select id from flightpass").all() as { id: number }[]) {
      const owner = owners.get(r.id);
      if (!owner || listed.has(r.id)) continue;
      const s = activeSettings(r.id, owner).slots;
      if (!s.on || Date.now() - lastSpinAt(r.id) < CFG.spinGapMs) continue;
      const k = key(r.id);
      const stake = toWei(s.stake);
      // (the house's daily cap too, as roulette's: a capped pass isn't refused and logged every tick until midnight)
      if (balanceOf(k) < stake || d.slots.daySpent(k) + stake > slotsCap(s)) continue;
      // the listing and owner right before the stake moves, not the last sample
      const now = await current(r.id).catch(() => null);
      if (!now || now.listed || now.owner !== owner) continue;
      try {
        await d.slots.autoSpin(k, owner, { stake, maxDay: toWei(s.max_day) });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 503) break; // off or paused: nobody spins now
        if (status !== 402 && status !== 403) console.error(`flightpass ${r.id} autospin: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  function start(): void {
    if (!on) return;
    void sample();
    setInterval(() => void sample(), CFG.sampleMs).unref();
    setInterval(() => void tick().catch((err) => console.error("flightpass tick:", err)), CFG.tickMs).unref();
    if (d.payer) {
      console.log(`flightpass withdrawals sent from ${d.payer.address}, up to ${fromWei(CFG.autoMax)} each and ${fromWei(CFG.autoDay)} a day`);
      setInterval(() => void payOut().catch((err) => console.error("flightpass payout:", err)), CFG.payMs).unref();
    }
  }

  // ---- mining --------------------------------------------------------------------------------------------
  /** `${wallet} ${day}` for every wallet-day a pass boosts in [from, to). */
  function boostedDays(from: string, to: string): Set<string> {
    if (!on) return new Set();
    return new Set((db.prepare("select distinct wallet, day from flightpass_days where day >= ? and day < ? and broken = 0").all(from, to) as { wallet: string; day: string }[])
      .map((r) => `${r.wallet} ${r.day}`));
  }
  /** What the stake view shows: does a pass boost today so far, and would one tomorrow. */
  function boostView(wallet: string) {
    if (!on) return null;
    const today = !!one("select 1 from flightpass_days where wallet = ? and day = ? and broken = 0", wallet, d.today());
    // the last sample's holders, from the table: the mining process asking this doesn't sample itself
    const holding = !!one("select 1 from flightpass_owners where wallet = ?", wallet);
    return { boost: MINING_BOOST, today, holding, day_start: utcDayStart() };
  }

  // ---- routes --------------------------------------------------------------------------------------------
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (p === "/api/flightpass/config" && req.method === "GET") return d.send(res, 200, config()), true;
    if (!on) {
      if (p.startsWith("/api/flightpass/") || p.startsWith("/api/admin/flightpass")) throw new HttpError(503, "FlightPass isn't on yet");
      return false;
    }
    if (req.method === "GET") {
      if (p === "/api/flightpass/mine") return d.send(res, 200, await mine(req)), true;
      if (p === "/api/flightpass/autopilot") return d.send(res, 200, await autopilot(req, url.searchParams.get("game") ?? "")), true;
      if (p === "/api/admin/flightpass") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
      if ((m = /^\/api\/flightpass\/(\d{1,9})$/.exec(p))) return d.send(res, 200, await onePass(req, Number(m[1]))), true;
      if ((m = /^\/api\/flightpass\/(\d{1,9})\/history$/.exec(p))) return d.send(res, 200, await history(req, Number(m[1]), url)), true;
    }
    if (req.method === "POST") {
      if ((m = /^\/api\/flightpass\/(\d{1,9})\/(deposit|withdraw|settings)$/.exec(p))) {
        const id = Number(m[1]), body = await d.readJson(req);
        if (m[2] === "deposit") return d.send(res, 200, await deposit(req, id, body)), true;
        if (m[2] === "withdraw") return d.send(res, 200, await withdraw(req, id, body)), true;
        return d.send(res, 200, await saveSettings(req, id, body)), true;
      }
      if (p === "/api/admin/flightpass/prefund") { d.adminOnly(req); return d.send(res, 200, await prefund(await d.readJson(req))), true; }
      if (p === "/api/admin/flightpass/withdrawal") { d.adminOnly(req); return d.send(res, 200, settle(await d.readJson(req))), true; }
    }
    return false;
  }

  return { route, start, boostedDays, boostView, config, sample, tick, payOut };
}
