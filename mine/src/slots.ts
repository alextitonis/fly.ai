/**
 * Fly Slots spins, against the house, in $FLYAI from the on-site balance (the same ledger as roulette and compute
 * orders). Added 2026-09-29 (the user: "another mini game like the roulette for the pass holders ... slots", fair RNG,
 * 95% RTP); the rules are world/src/slots/game.ts, the one copy the page's free play and Verify use too.
 *
 * Same commit-reveal as Fly Roulette: a commit is the hash of a secret server seed; the player spins with their own
 * client seed; spin(serverSeed, clientSeed) fixes the three stops. A spin has no turns to watch, so it is decided and
 * settled in ONE transaction (no worker, no live state) and its server seed is revealed in the same answer.
 *
 * Money only moves in the ledger (Postgres, src/pg.ts): a `bet` row (tx "slots:<spin>") and, on a win, a `payout` row of stake x mult
 * (tx "slots-win:<spin>"; the unique tx index makes a double payout impossible). The terms are roulette's (the same
 * 18+ terms, accepted with POST /api/roulette/terms), so a player accepts once for both games.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { lockWallet, type Pg, type Q } from "./pg.ts";
import { PAYS, rtp, score, spin, STRIP, TOP_MULT, type Sym } from "../../world/src/slots/game.ts";

export interface SlotsDeps {
  pg: Pg;
  /** a ledger row, written with `q` (a transaction, or pg) */
  book: (q: Q, wallet: string, orderId: string | null, kind: string, amount: bigint, extra?: { tx?: string }) => Promise<void>;
  balanceOf: (q: Q, wallet: string) => Promise<bigint>;
  /** the signed-in wallet; throws a 401 */
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  toWei: (s: string) => bigint;
  fromWei: (w: bigint) => string;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  /** roulette's terms: one 18+ acceptance covers both games */
  termsAccepted: (wallet: string) => Promise<boolean>;
  env: NodeJS.ProcessEnv;
}

// the same commit lifetime as roulette's: a page that sat open a quarter hour asks for a new one
const COMMIT_TTL_MS = 15 * 60_000;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const utcDayStart = (t = Date.now()) => t - (t % 86_400_000);
// computed once: the exact odds over all 32,768 outcomes never change while the server runs
const ODDS = rtp();

export function createSlots(d: SlotsDeps) {
  const { pg, book, balanceOf, HttpError, toWei, fromWei } = d;
  const tokens = (name: string, def: string) => {
    try { return toWei(d.env[name] ?? def); } catch { throw new Error(`${name} must be a number of tokens`); }
  };
  const CFG = {
    on: d.env.SLOTS_ON === "1",
    minBet: tokens("SLOTS_MIN_BET", "50"),
    maxBet: tokens("SLOTS_MAX_BET", "250"),
    maxDay: tokens("SLOTS_MAX_DAY", "50000"),
    /** the most one spin can pay: a stake whose top prize (TOP_MULT) would pass it is refused, so every prize is payable */
    maxPayout: tokens("SLOTS_MAX_PAYOUT", "100000"),
    houseStop: tokens("SLOTS_HOUSE_STOP", "300000"),
  };

  // ---- the house ---------------------------------------------------------------------------------------
  /** What the house won (positive) or lost on spins since `since`. */
  async function houseNet(since = 0): Promise<bigint> {
    let net = 0n;
    for (const r of await pg.all<{ stake_wei: string; payout_wei: string }>("select stake_wei, payout_wei from mine.slots_spins where created_at >= ?", since)) {
      net += BigInt(r.stake_wei) - BigInt(r.payout_wei);
    }
    return net;
  }
  /** Spinning stops by itself once the house is down SLOTS_HOUSE_STOP over the last day (as roulette's stop). */
  const paused = async () => CFG.houseStop > 0n && -(await houseNet(Date.now() - 86_400_000)) >= CFG.houseStop;

  // ---- views -----------------------------------------------------------------------------------------
  async function config() {
    return {
      on: CFG.on, paused: CFG.on && await paused(), rtp: ODDS.rtp, hit: ODDS.hit,
      min_bet: fromWei(CFG.minBet), max_bet: fromWei(CFG.maxBet), max_day: fromWei(CFG.maxDay), max_payout: fromWei(CFG.maxPayout),
      top_mult: TOP_MULT, strip: STRIP, pays: PAYS,
    };
  }

  async function daySpent(wallet: string, q: Q = pg): Promise<bigint> {
    let sum = 0n;
    for (const r of await q.all<{ stake_wei: string }>("select stake_wei from mine.slots_spins where wallet = ? and created_at >= ?", wallet, utcDayStart())) sum += BigInt(r.stake_wei);
    return sum;
  }

  const summary = (s: any) => ({
    id: s.id, stake: fromWei(BigInt(s.stake_wei)), mult: s.mult, payout: fromWei(BigInt(s.payout_wei)),
    symbols: JSON.parse(s.symbols) as Sym[], created_at: s.created_at,
  });

  async function me(req: IncomingMessage) {
    const wallet = await d.sessionWallet(req);
    const request = await pg.one<{ amount_wei: string; created_at: number }>("select amount_wei, created_at from mine.withdraw_requests where wallet = ? and status = 'open'", wallet);
    return {
      wallet, balance: fromWei(await balanceOf(pg, wallet)), terms_accepted: await d.termsAccepted(wallet), day_staked: fromWei(await daySpent(wallet)),
      withdraw_request: request ? { amount: fromWei(BigInt(request.amount_wei)), created_at: request.created_at } : null,
      history: (await pg.all<any>("select * from mine.slots_spins where wallet = ? order by created_at desc limit 20", wallet)).map(summary),
    };
  }

  async function spinView(id: string) {
    const s = await pg.one<any>("select * from mine.slots_spins where id = ?", id);
    if (!s) throw new HttpError(404, "no such spin");
    const symbols = JSON.parse(s.symbols) as [Sym, Sym, Sym];
    return {
      id: s.id, stake: fromWei(BigInt(s.stake_wei)), mult: s.mult, payout: fromWei(BigInt(s.payout_wei)),
      stops: JSON.parse(s.stops) as number[], symbols, line: score(symbols).line,
      // the spin is over the moment it's made, so its seed is shown with it
      commit_hash: s.commit_hash, server_seed: s.server_seed, client_seed: s.client_seed, created_at: s.created_at,
    };
  }

  async function admin() {
    return {
      on: CFG.on, paused: await paused(), spins: (await pg.one<{ n: number }>("select count(*) as n from mine.slots_spins"))!.n,
      house_net_all: fromWei(await houseNet(0)), house_net_24h: fromWei(await houseNet(Date.now() - 86_400_000)),
    };
  }

  // ---- actions ---------------------------------------------------------------------------------------
  const spinsOn = async () => {
    if (!CFG.on) throw new HttpError(503, "slots are off");
    if (await paused()) throw new HttpError(503, "slots are paused for now; try again later");
  };
  /** Stake limits, the same for players and the autopilot. */
  function checkStake(stake: bigint) {
    if (stake < CFG.minBet) throw new HttpError(400, `the smallest spin is ${fromWei(CFG.minBet)} FLYAI`);
    if (stake > CFG.maxBet) throw new HttpError(400, `the biggest spin is ${fromWei(CFG.maxBet)} FLYAI`);
    if (stake * BigInt(TOP_MULT) > CFG.maxPayout) throw new HttpError(400, `the top prize (${TOP_MULT}x) can pay at most ${fromWei(CFG.maxPayout)} FLYAI; spin less`);
  }

  async function commit(req: IncomingMessage) {
    await spinsOn();
    return openCommit(await d.sessionWallet(req));
  }

  /** A new commit for `wallet` (a player's address, or a FlightPass's ledger key `pass:<id>`). */
  async function openCommit(wallet: string) {
    await pg.run("delete from mine.slots_commits where wallet = ? and used = 0 and created_at < ?", wallet, Date.now() - COMMIT_TTL_MS);
    if ((await pg.one<{ n: number }>("select count(*) as n from mine.slots_commits where wallet = ? and used = 0", wallet))!.n >= 5) {
      throw new HttpError(429, "too many open commits; use one or wait a few minutes");
    }
    const id = randomUUID();
    const seed = randomBytes(32).toString("hex");
    const hash = sha256hex(seed);
    await pg.run("insert into mine.slots_commits (id, wallet, server_seed, hash, created_at) values (?, ?, ?, ?, ?)", id, wallet, seed, hash, Date.now());
    return { commit_id: id, hash, expires_at: Date.now() + COMMIT_TTL_MS };
  }

  async function playerSpin(req: IncomingMessage, body: any) {
    await spinsOn();
    const wallet = await d.sessionWallet(req);
    const clientSeed = String(body.client_seed ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientSeed)) throw new HttpError(400, "client_seed is 1 to 64 letters, digits, - or _");
    let stake: bigint;
    try { stake = toWei(String(body.stake ?? "")); } catch { throw new HttpError(400, "stake is a number of tokens"); }
    checkStake(stake);
    const out = await settle({ wallet, termsWallet: wallet, commitId: String(body.commit_id ?? ""), clientSeed, stake, maxDay: CFG.maxDay });
    return { ...out, balance: fromWei(await balanceOf(pg, wallet)) };
  }

  /**
   * Book the stake, spin, pay, all at once. `wallet` is whose balance pays (an address, or `pass:<id>` for a
   * FlightPass on autopilot); `termsWallet` is the person who accepted the terms (the pass's owner). `maxDay` can
   * only lower the house's daily limit.
   */
  async function settle(o: { wallet: string; termsWallet: string; commitId: string; clientSeed: string; stake: bigint; maxDay: bigint }) {
    const { wallet, clientSeed, stake } = o;
    const maxDay = o.maxDay < CFG.maxDay ? o.maxDay : CFG.maxDay;
    const c = await pg.one<{ id: string; wallet: string; server_seed: string; hash: string; created_at: number; used: number }>(
      "select * from mine.slots_commits where id = ?", o.commitId);
    if (!c || c.wallet !== wallet) throw new HttpError(404, "no such commit; ask for a new one");
    if (c.used) throw new HttpError(409, "that commit was already used; ask for a new one");
    if (Date.now() - c.created_at > COMMIT_TTL_MS) throw new HttpError(409, "that commit expired; ask for a new one");
    // the result follows from the seeds alone (sha256 is async in game.ts, so it's worked out before the
    // transaction); anyone replaying spin(server_seed, client_seed) later gets the same stops
    const r = await spin(c.server_seed, clientSeed);
    const payout = stake * BigInt(r.mult);

    const id = randomUUID();
    if (!(await d.termsAccepted(o.termsWallet))) throw new HttpError(403, "accept the terms first");
    // under the wallet's lock: the balance and the day's limit can't change between the checks and the booking
    // (Postgres runs requests side by side, where SQLite ran one writer at a time)
    await pg.tx(async (q) => {
      const spent = await daySpent(wallet, q);
      if (spent + stake > maxDay) throw new HttpError(400, `you can spin at most ${fromWei(maxDay)} FLYAI a day (UTC); ${fromWei(spent)} so far`);
      const balance = await balanceOf(q, wallet);
      if (balance < stake) throw new HttpError(402, `your balance is ${fromWei(balance)} FLYAI`);
      if (!(await q.run("update mine.slots_commits set used = 1 where id = ? and used = 0", c.id))) throw new HttpError(409, "that commit was already used");
      await book(q, wallet, null, "bet", stake, { tx: `slots:${id}` });
      if (payout > 0n) await book(q, wallet, null, "payout", payout, { tx: `slots-win:${id}` });
      await q.run(`insert into mine.slots_spins (id, wallet, stake_wei, mult, payout_wei, stops, symbols, commit_hash, server_seed, client_seed, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, wallet, stake.toString(), r.mult, payout.toString(), JSON.stringify(r.stops), JSON.stringify(r.symbols), c.hash, c.server_seed, clientSeed, Date.now());
    }, lockWallet(wallet));
    return spinView(id);
  }

  /**
   * A spin the server makes by itself for a FlightPass on autopilot (src/flightpass.ts): a fresh commit, a random
   * client seed, the same limits and settlement as a player's spin. Throws an HttpError when it can't spin.
   */
  async function autoSpin(key: string, owner: string, o: { stake: bigint; maxDay: bigint }) {
    await spinsOn();
    checkStake(o.stake);
    const c = await openCommit(key);
    return settle({ wallet: key, termsWallet: owner, commitId: c.commit_id, clientSeed: `autopilot-${randomBytes(12).toString("hex")}`, stake: o.stake, maxDay: o.maxDay });
  }

  // ---- routes ----------------------------------------------------------------------------------------
  /** Handles the request if it's one of ours; false otherwise. */
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/slots/config") return d.send(res, 200, await config()), true;
      if (p === "/api/slots/me") return d.send(res, 200, await me(req)), true;
      if ((m = /^\/api\/slots\/spins\/([0-9a-f-]{36})$/.exec(p))) return d.send(res, 200, await spinView(m[1])), true;
      if (p === "/api/admin/slots") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
    }
    if (req.method === "POST") {
      if (p === "/api/slots/commit") return d.send(res, 200, await commit(req)), true;
      if (p === "/api/slots/spins") return d.send(res, 200, await playerSpin(req, await d.readJson(req))), true;
    }
    return false;
  }

  return { route, config, autoSpin, daySpent: (wallet: string) => daySpent(wallet), CFG, isOn: async () => CFG.on && !(await paused()) };
}
