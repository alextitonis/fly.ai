/**
 * Fly Race bets, against the house, in $FLYAI from the on-site balance (the same ledger as roulette and compute).
 *
 * Six flies race, each steered by its own real brain following the smell of fruit (world/src/race/game.ts). A bet
 * is a private race: the player signs in, accepts the terms (roulette's 18+ terms cover it), gets a commit (the hash
 * of a secret server seed), then backs a lane with their own client seed, to "win" (finish 1st) or make the
 * "podium" (top 3). The server plays the race (race.worker.ts, the page's own rules and brains), the page shows it
 * leg by leg, and when it's over the server seed is revealed so anyone can replay it and check it.
 *
 * Every lane finishes 1st with probability 1/6 and in the top 3 with 1/2 (the lanes are exchangeable, see game.ts),
 * so a win pays stake x 6 x (1 - edge) and a podium stake x 2 x (1 - edge): the house keeps `edge` on average.
 *
 * Money only moves in the ledger: a `bet` row when the bet is placed (tx "race:<id>"), a `payout` row when it wins
 * ("race-win:<id>") or when a race the server couldn't finish is refunded ("race-refund:<id>"); the unique tx index
 * makes a double payout impossible. Deposits and withdrawal requests are roulette's (/api/balance/*).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { TERMS_VERSION } from "./roulette.ts";
import { BET_TYPES, betWon, deriveRng, LANES, LEGS, MULT, multiplier, setupRace, type BetType, type RaceEvent } from "../../world/src/race/game.ts";

export interface RaceDeps {
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
  /** roulette's 18+ terms, which cover the race too */
  termsAccepted: (wallet: string) => boolean;
  connectomeDir: string;
  env: NodeJS.ProcessEnv;
}

const COMMIT_TTL_MS = 15 * 60_000;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const utcDayStart = (t = Date.now()) => t - (t % 86_400_000);

export function createRace(d: RaceDeps) {
  const { db, transaction, book, balanceOf, HttpError, toWei, fromWei } = d;
  const tokens = (name: string, def: string) => {
    try { return toWei(d.env[name] ?? def); } catch { throw new Error(`${name} must be a number of tokens`); }
  };
  const CFG = {
    on: d.env.RACE_ON === "1",
    edge: Number(d.env.RACE_EDGE ?? "0.05"),
    minBet: tokens("RACE_MIN_BET", "50"),
    maxBet: tokens("RACE_MAX_BET", "5000"),
    maxDay: tokens("RACE_MAX_DAY", "100000"),
    maxPayout: tokens("RACE_MAX_PAYOUT", "30000"),
    houseStop: tokens("RACE_HOUSE_STOP", "300000"),
    maxLive: Number(d.env.RACE_MAX_LIVE ?? "8"),
  };
  if (!(CFG.edge >= 0 && CFG.edge < 0.5)) throw new Error("RACE_EDGE is a fraction, e.g. 0.05");
  if (!(Number.isInteger(CFG.maxLive) && CFG.maxLive >= 1)) throw new Error("RACE_MAX_LIVE is a whole number of races");
  const PPM = BigInt(Math.round((1 - CFG.edge) * 1_000_000));
  const payoutFor = (stake: bigint, bet: BetType) => (stake * BigInt(MULT[bet]) * PPM) / 1_000_000n;

  const one = <T>(sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T;

  // ---- the house ---------------------------------------------------------------------------------------
  /** What the house won (positive) or lost on races settled since `since`. */
  function houseNet(since = 0): bigint {
    let net = 0n;
    for (const r of db.prepare("select stake_wei, payout_wei, won from race_games where status = 'done' and done_at >= ?").all(since) as
      { stake_wei: string; payout_wei: string; won: number }[]) {
      net += BigInt(r.stake_wei) - (r.won ? BigInt(r.payout_wei) : 0n);
    }
    return net;
  }
  /** Betting stops by itself once the house is down RACE_HOUSE_STOP over the last day. */
  const paused = () => CFG.houseStop > 0n && -houseNet(Date.now() - 86_400_000) >= CFG.houseStop;
  const liveCount = () => one<{ n: number }>("select count(*) as n from race_games where status = 'live'").n;

  // ---- the race worker -----------------------------------------------------------------------------------
  let worker: Worker | null = null;
  function startWorker(): void {
    const w = new Worker(new URL("./race.worker.ts", import.meta.url), { workerData: { dir: d.connectomeDir } });
    worker = w;
    w.on("message", (msg: any) => {
      if (msg.type === "event") onEvent(msg.race, msg.seq, msg.event);
      else if (msg.type === "error") voidRace(msg.race, msg.text);
    });
    w.on("error", (err) => console.error("race worker:", err));
    w.on("exit", (code) => {
      if (worker !== w) return;
      worker = null;
      console.error(`race worker stopped (${code}); starting it again and resuming live races`);
      setTimeout(() => { startWorker(); resume(); }, 5_000).unref();
    });
  }
  const run = (r: { id: string; server_seed: string; client_seed: string }) => {
    if (!worker) startWorker();
    worker!.postMessage({ type: "start", race: r.id, serverSeed: r.server_seed, clientSeed: r.client_seed });
  };
  /** Races that were live when the server stopped: played again from their seeds (the same events), then settled. */
  function resume(): void {
    for (const r of db.prepare("select id, server_seed, client_seed from race_games where status = 'live'").all() as
      { id: string; server_seed: string; client_seed: string }[]) run(r);
  }

  function onEvent(race: string, seq: number, event: RaceEvent): void {
    const r = one<{ wallet: string; bet: BetType; pick: number; payout_wei: string; status: string; events: number } | undefined>(
      "select wallet, bet, pick, payout_wei, status, events from race_games where id = ?", race);
    if (!r || r.status !== "live") return;
    const json = JSON.stringify(event);
    if (seq < r.events) {
      // a replay after a restart: it must match what was already shown
      const stored = one<{ event: string } | undefined>("select event from race_events where race = ? and seq = ?", race, seq);
      if (stored && stored.event !== json) console.error(`race ${race}: replayed event ${seq} differs from the stored one`);
      return;
    }
    transaction(() => {
      db.prepare("insert or ignore into race_events (race, seq, event) values (?, ?, ?)").run(race, seq, json);
      db.prepare("update race_games set events = ? where id = ?").run(seq + 1, race);
      if (event.type !== "end") return;
      const won = betWon(r.bet, r.pick, event.order);
      db.prepare("update race_games set status = 'done', won = ?, finish = ?, done_at = ? where id = ?")
        .run(won ? 1 : 0, JSON.stringify(event.order), Date.now(), race);
      if (won) book(r.wallet, null, "payout", BigInt(r.payout_wei), { tx: `race-win:${race}` });
    });
  }

  /** A race the server couldn't finish: the stake goes back. */
  function voidRace(race: string, why: string): void {
    console.error(`race ${race} failed: ${why}`);
    transaction(() => {
      const r = one<{ wallet: string; stake_wei: string; status: string } | undefined>("select wallet, stake_wei, status from race_games where id = ?", race);
      if (!r || r.status !== "live") return;
      db.prepare("update race_games set status = 'void', done_at = ? where id = ?").run(Date.now(), race);
      book(r.wallet, null, "payout", BigInt(r.stake_wei), { tx: `race-refund:${race}` });
    });
  }

  // ---- views -----------------------------------------------------------------------------------------
  function config() {
    return {
      on: CFG.on, paused: CFG.on && paused(), edge: CFG.edge, terms_version: TERMS_VERSION,
      min_bet: fromWei(CFG.minBet), max_bet: fromWei(CFG.maxBet), max_day: fromWei(CFG.maxDay), max_payout: fromWei(CFG.maxPayout),
      lanes: LANES, legs: LEGS,
      mult: { win: multiplier("win", CFG.edge), podium: multiplier("podium", CFG.edge) },
    };
  }

  function daySpent(wallet: string): bigint {
    let sum = 0n;
    for (const r of db.prepare("select stake_wei from race_games where wallet = ? and created_at >= ? and status != 'void'").all(wallet, utcDayStart()) as { stake_wei: string }[]) sum += BigInt(r.stake_wei);
    return sum;
  }

  const wonOf = (r: any) => (r.status === "done" ? r.won === 1 : null);
  function summary(r: any) {
    return {
      id: r.id, bet: r.bet, pick: r.pick, stake: fromWei(BigInt(r.stake_wei)), payout: fromWei(BigInt(r.payout_wei)),
      status: r.status, won: wonOf(r), order: r.finish ? JSON.parse(r.finish) : null, created_at: r.created_at,
    };
  }
  /** The latest races of a wallet (a player's address or a FlightPass's `pass:<id>`), newest first. */
  const history = (wallet: string, limit = 20) =>
    (db.prepare("select * from race_games where wallet = ? order by created_at desc limit ?").all(wallet, limit) as any[]).map(summary);

  function me(req: IncomingMessage) {
    const wallet = d.sessionWallet(req);
    const live = one<{ id: string } | undefined>("select id from race_games where wallet = ? and status = 'live'", wallet);
    const request = one<{ amount_wei: string; created_at: number } | undefined>("select amount_wei, created_at from withdraw_requests where wallet = ? and status = 'open'", wallet);
    return {
      wallet, balance: fromWei(balanceOf(wallet)), terms_accepted: d.termsAccepted(wallet),
      day_staked: fromWei(daySpent(wallet)), live_race: live?.id ?? null,
      withdraw_request: request ? { amount: fromWei(BigInt(request.amount_wei)), created_at: request.created_at } : null,
      history: history(wallet),
    };
  }

  function raceView(id: string, after: number) {
    const r = one<any>("select * from race_games where id = ?", id);
    if (!r) throw new HttpError(404, "no such race");
    const events = (db.prepare("select seq, event from race_events where race = ? and seq >= ? order by seq").all(id, after) as { seq: number; event: string }[])
      .map((e) => ({ seq: e.seq, ...JSON.parse(e.event) }));
    return {
      id: r.id, bet: r.bet, pick: r.pick, stake: fromWei(BigInt(r.stake_wei)), payout: fromWei(BigInt(r.payout_wei)),
      status: r.status, won: wonOf(r), names: JSON.parse(r.names), events,
      commit_hash: r.commit_hash, client_seed: r.client_seed,
      // revealed only once nothing more can happen in the race
      server_seed: r.status === "live" ? null : r.server_seed,
      created_at: r.created_at,
    };
  }

  function admin() {
    return {
      on: CFG.on, paused: paused(), live_races: liveCount(),
      races: one<{ n: number }>("select count(*) as n from race_games where status = 'done'").n,
      house_net_all: fromWei(houseNet(0)), house_net_24h: fromWei(houseNet(Date.now() - 86_400_000)),
    };
  }

  // ---- actions ---------------------------------------------------------------------------------------
  const betsOn = () => {
    if (!CFG.on) throw new HttpError(503, "racing is off");
    if (paused()) throw new HttpError(503, "racing is paused for now; try again later");
  };

  /** A new commit for `wallet` (a player's address, or a FlightPass's ledger key `pass:<id>`). */
  function openCommit(wallet: string) {
    db.prepare("delete from race_commits where wallet = ? and used = 0 and created_at < ?").run(wallet, Date.now() - COMMIT_TTL_MS);
    if (one<{ n: number }>("select count(*) as n from race_commits where wallet = ? and used = 0", wallet).n >= 5) {
      throw new HttpError(429, "too many open commits; use one or wait a few minutes");
    }
    const id = randomUUID();
    const seed = randomBytes(32).toString("hex");
    const hash = sha256hex(seed);
    db.prepare("insert into race_commits (id, wallet, server_seed, hash, created_at) values (?, ?, ?, ?, ?)").run(id, wallet, seed, hash, Date.now());
    return { commit_id: id, hash, expires_at: Date.now() + COMMIT_TTL_MS };
  }

  /** The payout of a bet, refused past the cap. */
  function checkedPayout(stake: bigint, bet: BetType): bigint {
    if (stake < CFG.minBet) throw new HttpError(400, `the smallest bet is ${fromWei(CFG.minBet)} FLYAI`);
    if (stake > CFG.maxBet) throw new HttpError(400, `the biggest bet is ${fromWei(CFG.maxBet)} FLYAI`);
    const payout = payoutFor(stake, bet);
    if (payout > CFG.maxPayout) throw new HttpError(400, `a win can pay at most ${fromWei(CFG.maxPayout)} FLYAI; bet less`);
    return payout;
  }

  async function bet(req: IncomingMessage, body: any) {
    betsOn();
    const wallet = d.sessionWallet(req);
    const pick = Number(body.pick);
    if (!Number.isInteger(pick) || pick < 0 || pick >= LANES) throw new HttpError(400, `pick is a lane from 0 to ${LANES - 1}`);
    const type = body.bet as BetType;
    if (!BET_TYPES.includes(type)) throw new HttpError(400, `bet is ${BET_TYPES.join(" or ")}`);
    const clientSeed = String(body.client_seed ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientSeed)) throw new HttpError(400, "client_seed is 1 to 64 letters, digits, - or _");
    let stake: bigint;
    try { stake = toWei(String(body.stake ?? "")); } catch { throw new HttpError(400, "stake is a number of tokens"); }
    const payout = checkedPayout(stake, type);
    return placeBet({ wallet, termsWallet: wallet, commitId: String(body.commit_id ?? ""), bet: type, pick, clientSeed, stake, payout, maxDay: CFG.maxDay });
  }

  /**
   * Line up the race and book the stake. `wallet` is whose balance pays (an address, or `pass:<id>` for a FlightPass
   * on autopilot); `termsWallet` is the person who accepted the terms (the pass's owner). `maxDay` can only lower
   * the house's daily limit.
   */
  async function placeBet(o: { wallet: string; termsWallet: string; commitId: string; bet: BetType; pick: number; clientSeed: string; stake: bigint; payout: bigint; maxDay: bigint }) {
    const { wallet, pick, clientSeed, stake, payout } = o;
    const maxDay = o.maxDay < CFG.maxDay ? o.maxDay : CFG.maxDay;
    const c = one<{ id: string; wallet: string; server_seed: string; hash: string; created_at: number; used: number } | undefined>(
      "select * from race_commits where id = ?", o.commitId);
    if (!c || c.wallet !== wallet) throw new HttpError(404, "no such commit; ask for a new one");
    if (c.used) throw new HttpError(409, "that commit was already used; ask for a new one");
    if (Date.now() - c.created_at > COMMIT_TTL_MS) throw new HttpError(409, "that commit expired; ask for a new one");
    // who runs where follows from the seeds, as it will for anyone checking later
    const names = setupRace(await deriveRng(c.server_seed, clientSeed)).names;

    const id = randomUUID();
    transaction(() => {
      if (!d.termsAccepted(o.termsWallet)) throw new HttpError(403, "accept the terms first");
      if (one<{ used: number }>("select used from race_commits where id = ?", c.id).used) throw new HttpError(409, "that commit was already used");
      if (one("select 1 from race_games where wallet = ? and status = 'live'", wallet)) throw new HttpError(409, "you already have a race running");
      if (liveCount() >= CFG.maxLive) throw new HttpError(503, "every track is busy; try again in a minute");
      const spent = daySpent(wallet);
      if (spent + stake > maxDay) throw new HttpError(400, `you can bet at most ${fromWei(maxDay)} FLYAI a day (UTC); ${fromWei(spent)} so far`);
      const balance = balanceOf(wallet);
      if (balance < stake) throw new HttpError(402, `your balance is ${fromWei(balance)} FLYAI`);
      db.prepare("update race_commits set used = 1 where id = ?").run(c.id);
      book(wallet, null, "bet", stake, { tx: `race:${id}` });
      db.prepare(`insert into race_games (id, wallet, bet, pick, stake_wei, payout_wei, edge, commit_hash, server_seed, client_seed, names, status, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?)`)
        .run(id, wallet, o.bet, pick, stake.toString(), payout.toString(), CFG.edge, c.hash, c.server_seed, clientSeed, JSON.stringify(names), Date.now());
    });
    run({ id, server_seed: c.server_seed, client_seed: clientSeed });
    return raceView(id, 0);
  }

  /**
   * A race the server enters by itself for a FlightPass on autopilot (src/flightpass.ts): a fresh commit, a random
   * lane and client seed, the same limits and settlement as a player's bet. Throws an HttpError when it can't bet.
   */
  async function autoBet(key: string, owner: string, o: { bet: BetType; stake: bigint; maxDay: bigint }) {
    betsOn();
    if (!BET_TYPES.includes(o.bet)) throw new HttpError(400, `bet is ${BET_TYPES.join(" or ")}`);
    const payout = checkedPayout(o.stake, o.bet);
    const c = openCommit(key);
    return placeBet({
      wallet: key, termsWallet: owner, commitId: c.commit_id, bet: o.bet, pick: randomBytes(1)[0] % LANES,
      clientSeed: `autopilot-${randomBytes(12).toString("hex")}`, stake: o.stake, payout, maxDay: o.maxDay,
    });
  }

  // ---- routes ----------------------------------------------------------------------------------------
  /** Handles the request if it's one of ours; false otherwise. */
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/race/config") return d.send(res, 200, config()), true;
      if (p === "/api/race/me") return d.send(res, 200, me(req)), true;
      if ((m = /^\/api\/race\/races\/([0-9a-f-]{36})$/.exec(p))) {
        const after = Number(url.searchParams.get("after") ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, "after is an event number");
        return d.send(res, 200, raceView(m[1], after)), true;
      }
      if (p === "/api/admin/race") { d.adminOnly(req); return d.send(res, 200, admin()), true; }
    }
    if (req.method === "POST") {
      if (p === "/api/race/commit") { betsOn(); return d.send(res, 200, openCommit(d.sessionWallet(req))), true; }
      if (p === "/api/race/races") return d.send(res, 200, await bet(req, await d.readJson(req))), true;
    }
    return false;
  }

  return {
    route, resume, config, autoBet, daySpent, history, CFG,
    isOn: () => CFG.on && !paused(),
    liveFor: (wallet: string) => !!one("select 1 from race_games where wallet = ? and status = 'live'", wallet),
    liveCount,
  };
}
