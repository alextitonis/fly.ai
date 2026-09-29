/**
 * Fly Roulette bets, against the house, in $FLYAI from the on-site balance (the same ledger as compute orders).
 *
 * A player signs in with their wallet, accepts the terms (18+), gets a commit (the hash of a secret server
 * seed), then bets on one seat with their own client seed. The server plays the game (roulette.worker.ts,
 * the page's own rules and brains), the page shows it turn by turn, and when it's over the server seed is
 * revealed so anyone can replay the game and check it. A win pays stake x flies x (1 - edge): every seat wins
 * 1/flies of the time (see world/src/roulette/game.ts), so the house keeps `edge` on average and nothing more.
 *
 * Money only moves in the ledger: a `bet` row when the bet is placed, a `payout` row when it wins (its tx
 * column holds "roulette-win:<game>", so the unique index makes a double payout impossible). Deposits are
 * $FLYAI transfers to PAY_TO; withdrawals are requested here and sent by the operator.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { deriveRng, MAX_FLIES, MIN_FLIES, setup, type GameEvent } from "../../world/src/roulette/game.ts";

export interface RouletteDeps {
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
  /** $FLYAI transfers to the pay-to wallet in a mined transaction, or null while it isn't mined */
  transfersIn: (tx: string) => Promise<{ from: string; value: bigint; at: number }[] | null>;
  connectomeDir: string;
  env: NodeJS.ProcessEnv;
}

/** the 18+ terms; Fly Slots and Fly Race are covered by the same acceptance */
export const TERMS_VERSION = 1;
const COMMIT_TTL_MS = 15 * 60_000;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const utcDayStart = (t = Date.now()) => t - (t % 86_400_000);

export function createRoulette(d: RouletteDeps) {
  const { db, transaction, book, balanceOf, HttpError, toWei, fromWei } = d;
  const tokens = (name: string, def: string) => {
    try { return toWei(d.env[name] ?? def); } catch { throw new Error(`${name} must be a number of tokens`); }
  };
  const CFG = {
    on: d.env.ROULETTE_ON === "1",
    edge: Number(d.env.ROULETTE_EDGE ?? "0.05"),
    minBet: tokens("ROULETTE_MIN_BET", "100"),
    maxBet: tokens("ROULETTE_MAX_BET", "100000"),
    maxDay: tokens("ROULETTE_MAX_DAY", "1000000"),
    maxPayout: tokens("ROULETTE_MAX_PAYOUT", "500000"),
    houseStop: tokens("ROULETTE_HOUSE_STOP", "2000000"),
    maxLive: Number(d.env.ROULETTE_MAX_LIVE ?? "8"),
    /** PAY_TO is the dev wallet: older transfers to it were for other things and can't become a balance */
    depositsSince: Date.parse(d.env.ROULETTE_DEPOSITS_SINCE ?? "2026-09-19T00:00:00Z"),
  };
  if (!Number.isFinite(CFG.depositsSince)) throw new Error("ROULETTE_DEPOSITS_SINCE is a date, e.g. 2026-09-19T00:00:00Z");
  if (!(CFG.edge >= 0 && CFG.edge < 0.5)) throw new Error("ROULETTE_EDGE is a fraction, e.g. 0.05");
  const PPM = BigInt(Math.round((1 - CFG.edge) * 1_000_000));
  const payoutFor = (stake: bigint, flies: number) => (stake * BigInt(flies) * PPM) / 1_000_000n;

  const one = <T>(sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as T;

  // ---- the house ---------------------------------------------------------------------------------------
  /** What the house won (positive) or lost on games settled since `since`. */
  function houseNet(since = 0): bigint {
    let net = 0n;
    for (const r of db.prepare("select stake_wei, payout_wei, pick, winner from roulette_games where status = 'done' and done_at >= ?").all(since) as
      { stake_wei: string; payout_wei: string; pick: number; winner: number }[]) {
      net += BigInt(r.stake_wei) - (r.winner === r.pick ? BigInt(r.payout_wei) : 0n);
    }
    return net;
  }
  /** Betting stops by itself once the house is down ROULETTE_HOUSE_STOP over the last day. */
  const paused = () => CFG.houseStop > 0n && -houseNet(Date.now() - 86_400_000) >= CFG.houseStop;
  const liveCount = () => one<{ n: number }>("select count(*) as n from roulette_games where status = 'live'").n;

  // ---- the game worker -----------------------------------------------------------------------------------
  let worker: Worker | null = null;
  function startWorker(): void {
    const w = new Worker(new URL("./roulette.worker.ts", import.meta.url), { workerData: { dir: d.connectomeDir } });
    worker = w;
    w.on("message", (msg: any) => {
      if (msg.type === "event") onEvent(msg.game, msg.seq, msg.event);
      else if (msg.type === "error") voidGame(msg.game, msg.text);
    });
    w.on("error", (err) => console.error("roulette worker:", err));
    w.on("exit", (code) => {
      if (worker !== w) return;
      worker = null;
      console.error(`roulette worker stopped (${code}); starting it again and resuming live games`);
      setTimeout(() => { startWorker(); resume(); }, 5_000).unref();
    });
  }
  const run = (g: { id: string; server_seed: string; client_seed: string; flies: number }) => {
    if (!worker) startWorker();
    worker!.postMessage({ type: "start", game: g.id, serverSeed: g.server_seed, clientSeed: g.client_seed, flies: g.flies });
  };
  /** Games that were live when the server stopped: played again from their seeds (the same events), then settled. */
  function resume(): void {
    for (const g of db.prepare("select id, server_seed, client_seed, flies from roulette_games where status = 'live'").all() as
      { id: string; server_seed: string; client_seed: string; flies: number }[]) run(g);
  }

  function onEvent(game: string, seq: number, event: GameEvent): void {
    const g = one<{ wallet: string; pick: number; payout_wei: string; status: string; events: number } | undefined>(
      "select wallet, pick, payout_wei, status, events from roulette_games where id = ?", game);
    if (!g || g.status !== "live") return;
    const json = JSON.stringify(event);
    if (seq < g.events) {
      // a replay after a restart: it must match what was already shown
      const stored = one<{ event: string } | undefined>("select event from roulette_events where game = ? and seq = ?", game, seq);
      if (stored && stored.event !== json) console.error(`roulette ${game}: replayed event ${seq} differs from the stored one`);
      return;
    }
    transaction(() => {
      db.prepare("insert or ignore into roulette_events (game, seq, event) values (?, ?, ?)").run(game, seq, json);
      db.prepare("update roulette_games set events = ? where id = ?").run(seq + 1, game);
      if (event.type !== "end") return;
      db.prepare("update roulette_games set status = 'done', winner = ?, done_at = ? where id = ?").run(event.winner, Date.now(), game);
      if (event.winner === g.pick) book(g.wallet, null, "payout", BigInt(g.payout_wei), { tx: `roulette-win:${game}` });
    });
  }

  /** A game the server couldn't finish: the stake goes back. */
  function voidGame(game: string, why: string): void {
    console.error(`roulette ${game} failed: ${why}`);
    transaction(() => {
      const g = one<{ wallet: string; stake_wei: string; status: string } | undefined>("select wallet, stake_wei, status from roulette_games where id = ?", game);
      if (!g || g.status !== "live") return;
      db.prepare("update roulette_games set status = 'void', done_at = ? where id = ?").run(Date.now(), game);
      book(g.wallet, null, "payout", BigInt(g.stake_wei), { tx: `roulette-refund:${game}` });
    });
  }

  // ---- views -----------------------------------------------------------------------------------------
  function config() {
    return {
      on: CFG.on, paused: CFG.on && paused(), edge: CFG.edge, terms_version: TERMS_VERSION,
      min_bet: fromWei(CFG.minBet), max_bet: fromWei(CFG.maxBet), max_day: fromWei(CFG.maxDay), max_payout: fromWei(CFG.maxPayout),
      min_flies: MIN_FLIES, max_flies: MAX_FLIES,
      multipliers: Object.fromEntries(Array.from({ length: MAX_FLIES - MIN_FLIES + 1 }, (_, k) => {
        const n = MIN_FLIES + k;
        return [n, Number(((1 - CFG.edge) * n).toFixed(4))];
      })),
    };
  }

  function daySpent(wallet: string): bigint {
    let sum = 0n;
    for (const r of db.prepare("select stake_wei from roulette_games where wallet = ? and created_at >= ? and status != 'void'").all(wallet, utcDayStart()) as { stake_wei: string }[]) sum += BigInt(r.stake_wei);
    return sum;
  }

  function summary(g: any) {
    const won = g.status === "done" ? g.winner === g.pick : null;
    return {
      id: g.id, flies: g.flies, pick: g.pick, stake: fromWei(BigInt(g.stake_wei)), payout: fromWei(BigInt(g.payout_wei)),
      status: g.status, winner: g.winner, won, created_at: g.created_at, done_at: g.done_at,
    };
  }

  function me(req: IncomingMessage) {
    const wallet = d.sessionWallet(req);
    const terms = one<{ version: number } | undefined>("select version from roulette_terms where wallet = ?", wallet);
    const live = one<{ id: string } | undefined>("select id from roulette_games where wallet = ? and status = 'live'", wallet);
    const request = one<{ amount_wei: string; created_at: number } | undefined>("select amount_wei, created_at from withdraw_requests where wallet = ? and status = 'open'", wallet);
    return {
      wallet, balance: fromWei(balanceOf(wallet)), terms_accepted: (terms?.version ?? 0) >= TERMS_VERSION,
      day_staked: fromWei(daySpent(wallet)), live_game: live?.id ?? null,
      withdraw_request: request ? { amount: fromWei(BigInt(request.amount_wei)), created_at: request.created_at } : null,
      history: (db.prepare("select * from roulette_games where wallet = ? order by created_at desc limit 20").all(wallet) as any[]).map(summary),
    };
  }

  function gameView(id: string, after: number) {
    const g = one<any>("select * from roulette_games where id = ?", id);
    if (!g) throw new HttpError(404, "no such game");
    const events = (db.prepare("select seq, event from roulette_events where game = ? and seq >= ? order by seq").all(id, after) as { seq: number; event: string }[])
      .map((r) => ({ seq: r.seq, ...JSON.parse(r.event) }));
    return {
      ...summary(g), wallet: g.wallet, edge: g.edge, names: JSON.parse(g.names), events,
      commit_hash: g.commit_hash, client_seed: g.client_seed,
      // revealed only once nothing more can happen in the game
      server_seed: g.status === "live" ? null : g.server_seed,
    };
  }

  function admin() {
    const wallets = (db.prepare("select distinct wallet from ledger").all() as { wallet: string }[]).map((r) => r.wallet);
    let held = 0n;
    for (const w of wallets) held += balanceOf(w);
    const games = one<{ n: number }>("select count(*) as n from roulette_games where status = 'done'").n;
    return {
      on: CFG.on, paused: paused(), live_games: liveCount(), games_played: games,
      house_net_all: fromWei(houseNet(0)), house_net_24h: fromWei(houseNet(Date.now() - 86_400_000)),
      // every token players can ask back: the dev wallet must hold at least this
      balances_held: fromWei(held),
      withdraw_requests: (db.prepare("select id, wallet, amount_wei, created_at from withdraw_requests where status = 'open' order by created_at").all() as any[])
        .map((r) => ({ id: r.id, wallet: r.wallet, amount: fromWei(BigInt(r.amount_wei)), balance: fromWei(balanceOf(r.wallet)), created_at: r.created_at })),
    };
  }

  // ---- actions ---------------------------------------------------------------------------------------
  const betsOn = () => {
    if (!CFG.on) throw new HttpError(503, "betting is off");
    if (paused()) throw new HttpError(503, "betting is paused for now; try again later");
  };

  function acceptTerms(req: IncomingMessage, body: any) {
    const wallet = d.sessionWallet(req);
    if (body.over18 !== true || body.accept !== true) throw new HttpError(400, "confirm you're 18 or over and accept the terms");
    db.prepare("insert into roulette_terms (wallet, version, accepted_at) values (?, ?, ?) on conflict (wallet) do update set version = excluded.version, accepted_at = excluded.accepted_at")
      .run(wallet, TERMS_VERSION, Date.now());
    return { terms_accepted: true, version: TERMS_VERSION };
  }

  function commit(req: IncomingMessage) {
    betsOn();
    return openCommit(d.sessionWallet(req));
  }

  /** A new commit for `wallet` (a player's address, or a FlightPass's ledger key `pass:<id>`). */
  function openCommit(wallet: string) {
    db.prepare("delete from roulette_commits where wallet = ? and used = 0 and created_at < ?").run(wallet, Date.now() - COMMIT_TTL_MS);
    if (one<{ n: number }>("select count(*) as n from roulette_commits where wallet = ? and used = 0", wallet).n >= 5) {
      throw new HttpError(429, "too many open commits; use one or wait a few minutes");
    }
    const id = randomUUID();
    const seed = randomBytes(32).toString("hex");
    const hash = sha256hex(seed);
    db.prepare("insert into roulette_commits (id, wallet, server_seed, hash, created_at) values (?, ?, ?, ?, ?)").run(id, wallet, seed, hash, Date.now());
    return { commit_id: id, hash, expires_at: Date.now() + COMMIT_TTL_MS };
  }

  async function bet(req: IncomingMessage, body: any) {
    betsOn();
    const wallet = d.sessionWallet(req);
    const flies = Number(body.flies), pick = Number(body.pick);
    if (!Number.isInteger(flies) || flies < MIN_FLIES || flies > MAX_FLIES) throw new HttpError(400, `flies is ${MIN_FLIES} to ${MAX_FLIES}`);
    if (!Number.isInteger(pick) || pick < 0 || pick >= flies) throw new HttpError(400, `pick is a seat from 0 to ${flies - 1}`);
    const clientSeed = String(body.client_seed ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientSeed)) throw new HttpError(400, "client_seed is 1 to 64 letters, digits, - or _");
    let stake: bigint;
    try { stake = toWei(String(body.stake ?? "")); } catch { throw new HttpError(400, "stake is a number of tokens"); }
    if (stake < CFG.minBet) throw new HttpError(400, `the smallest bet is ${fromWei(CFG.minBet)} FLYAI`);
    if (stake > CFG.maxBet) throw new HttpError(400, `the biggest bet is ${fromWei(CFG.maxBet)} FLYAI`);
    const payout = payoutFor(stake, flies);
    if (payout > CFG.maxPayout) throw new HttpError(400, `a win can pay at most ${fromWei(CFG.maxPayout)} FLYAI; bet less or seat fewer flies`);
    return placeBet({ wallet, termsWallet: wallet, commitId: String(body.commit_id ?? ""), flies, pick, clientSeed, stake, payout, maxDay: CFG.maxDay });
  }

  /**
   * Seat the table and book the stake. `wallet` is whose balance pays (an address, or `pass:<id>` for a FlightPass
   * on autopilot); `termsWallet` is the person who accepted the terms (the pass's owner). `maxDay` can only lower
   * the house's daily limit.
   */
  async function placeBet(o: { wallet: string; termsWallet: string; commitId: string; flies: number; pick: number; clientSeed: string; stake: bigint; payout: bigint; maxDay: bigint }) {
    const { wallet, flies, pick, clientSeed, stake, payout } = o;
    const maxDay = o.maxDay < CFG.maxDay ? o.maxDay : CFG.maxDay;
    const c = one<{ id: string; wallet: string; server_seed: string; hash: string; created_at: number; used: number } | undefined>(
      "select * from roulette_commits where id = ?", o.commitId);
    if (!c || c.wallet !== wallet) throw new HttpError(404, "no such commit; ask for a new one");
    if (c.used) throw new HttpError(409, "that commit was already used; ask for a new one");
    if (Date.now() - c.created_at > COMMIT_TTL_MS) throw new HttpError(409, "that commit expired; ask for a new one");
    // who sits down follows from the seeds, as it will for anyone checking later
    const names = setup(flies, await deriveRng(c.server_seed, clientSeed)).names;

    const id = randomUUID();
    transaction(() => {
      if (!termsAccepted(o.termsWallet)) throw new HttpError(403, "accept the terms first");
      if (one<{ used: number }>("select used from roulette_commits where id = ?", c.id).used) throw new HttpError(409, "that commit was already used");
      if (one("select 1 from roulette_games where wallet = ? and status = 'live'", wallet)) throw new HttpError(409, "you already have a game on the table");
      if (liveCount() >= CFG.maxLive) throw new HttpError(503, "all tables are busy; try again in a minute");
      if (daySpent(wallet) + stake > maxDay) throw new HttpError(400, `you can bet at most ${fromWei(maxDay)} FLYAI a day (UTC); ${fromWei(daySpent(wallet))} so far`);
      const balance = balanceOf(wallet);
      if (balance < stake) throw new HttpError(402, `your balance is ${fromWei(balance)} FLYAI`);
      db.prepare("update roulette_commits set used = 1 where id = ?").run(c.id);
      book(wallet, null, "bet", stake, { tx: `roulette:${id}` });
      db.prepare(`insert into roulette_games (id, wallet, flies, pick, stake_wei, payout_wei, edge, commit_hash, server_seed, client_seed, names, status, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?)`)
        .run(id, wallet, flies, pick, stake.toString(), payout.toString(), CFG.edge, c.hash, c.server_seed, clientSeed, JSON.stringify(names), Date.now());
    });
    run({ id, server_seed: c.server_seed, client_seed: clientSeed, flies });
    return gameView(id, 0);
  }

  const termsAccepted = (wallet: string) =>
    (one<{ version: number } | undefined>("select version from roulette_terms where wallet = ?", wallet)?.version ?? 0) >= TERMS_VERSION;

  /**
   * A bet the server places by itself for a FlightPass on autopilot (src/flightpass.ts): a fresh commit, a random
   * seat and client seed, the same limits and settlement as a player's bet. Throws an HttpError when it can't bet.
   */
  async function autoBet(key: string, owner: string, o: { flies: number; stake: bigint; maxDay: bigint }) {
    betsOn();
    if (!Number.isInteger(o.flies) || o.flies < MIN_FLIES || o.flies > MAX_FLIES) throw new HttpError(400, `flies is ${MIN_FLIES} to ${MAX_FLIES}`);
    if (o.stake < CFG.minBet || o.stake > CFG.maxBet) throw new HttpError(400, "stake is outside the bet limits");
    const payout = payoutFor(o.stake, o.flies);
    if (payout > CFG.maxPayout) throw new HttpError(400, "a win would pay past the cap");
    const c = openCommit(key);
    return placeBet({
      wallet: key, termsWallet: owner, commitId: c.commit_id, flies: o.flies, pick: randomBytes(1)[0] % o.flies,
      clientSeed: `autopilot-${randomBytes(12).toString("hex")}`, stake: o.stake, payout, maxDay: o.maxDay,
    });
  }

  /** A $FLYAI transfer from the signed-in wallet to PAY_TO, credited to its balance once. */
  async function deposit(req: IncomingMessage, body: any) {
    const wallet = d.sessionWallet(req);
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
    const mine = transfers.filter((t) => t.from.toLowerCase() === wallet.toLowerCase());
    if (!mine.length) throw new HttpError(402, "that transaction sends no FLYAI from your wallet to the deposit address");
    if (mine[0].at < CFG.depositsSince) throw new HttpError(402, "that transfer is older than deposits; it can't be credited");
    const value = mine.reduce((s, t) => s + t.value, 0n);
    transaction(() => {
      if (one("select 1 from ledger where tx = ?", tx)) throw new HttpError(409, "that transaction was just credited");
      book(wallet, null, "deposit", value, { tx });
    });
    return { deposited: fromWei(value), balance: fromWei(balanceOf(wallet)) };
  }

  function withdrawRequest(req: IncomingMessage, body: any) {
    const wallet = d.sessionWallet(req);
    let amount: bigint;
    try { amount = toWei(String(body.amount ?? "")); } catch { throw new HttpError(400, "amount is a number of tokens"); }
    transaction(() => {
      if (one("select 1 from withdraw_requests where wallet = ? and status = 'open'", wallet)) throw new HttpError(409, "you already asked; it's on its way");
      const balance = balanceOf(wallet);
      if (amount <= 0n || amount > balance) throw new HttpError(400, `your balance is ${fromWei(balance)} FLYAI`);
      db.prepare("insert into withdraw_requests (wallet, amount_wei, status, created_at) values (?, ?, 'open', ?)").run(wallet, amount.toString(), Date.now());
    });
    return me(req);
  }

  // ---- routes ----------------------------------------------------------------------------------------
  /** Handles the request if it's one of ours; false otherwise. */
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/roulette/config") return d.send(res, 200, config()), true;
      if (p === "/api/roulette/me") return d.send(res, 200, me(req)), true;
      if ((m = /^\/api\/roulette\/games\/([0-9a-f-]{36})$/.exec(p))) {
        const after = Number(url.searchParams.get("after") ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, "after is an event number");
        return d.send(res, 200, gameView(m[1], after)), true;
      }
      if (p === "/api/admin/roulette") { d.adminOnly(req); return d.send(res, 200, admin()), true; }
    }
    if (req.method === "POST") {
      if (p === "/api/roulette/terms") return d.send(res, 200, acceptTerms(req, await d.readJson(req))), true;
      if (p === "/api/roulette/commit") return d.send(res, 200, commit(req)), true;
      if (p === "/api/roulette/games") return d.send(res, 200, await bet(req, await d.readJson(req))), true;
      if (p === "/api/balance/deposit") return d.send(res, 200, await deposit(req, await d.readJson(req))), true;
      if (p === "/api/balance/withdraw-request") return d.send(res, 200, withdrawRequest(req, await d.readJson(req))), true;
    }
    return false;
  }

  return {
    route, resume, config, autoBet, termsAccepted, daySpent, CFG,
    isOn: () => CFG.on && !paused(),
    liveFor: (wallet: string) => !!one("select 1 from roulette_games where wallet = ? and status = 'live'", wallet),
    liveCount,
  };
}
