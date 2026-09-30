/**
 * Fly Colosseum: tournaments of Trader Flies, in $FLYAI from the on-site balance (the same ledger as the other games).
 *
 * The operator opens a tournament (POST /api/admin/arena/open): the entry price, the fee, how long registration
 * stays open (a day by default). While it is open, a wallet enters Trader Flies it owns (TraderFly.ownerOf, read on
 * the chain at that moment) and pays the entry from its balance; it can add potions, which are paid the same way
 * and add stat points for this tournament only. A fly's stats follow from its on-chain traits by the public tables
 * in world/src/arena/stats.ts, and a fight from the stats and the fly brains by world/src/arena/game.ts: nothing else
 * decides anything. When registration closes the server plays every fight (arena.worker.ts, the page's own rules
 * and brains) and then shows them all at once: the bracket, every fight round by round, and the podium.
 *
 * The pot is every entry and potion paid. The fee (fee_bps of the pot) stays with the house; the rest goes to 1st,
 * 2nd and 3rd (game.ts prizes: 60/25/15, or 70/30 with no 3rd place), which the winners claim (POST /api/arena/claim).
 * A tournament that closes with fewer than its minimum of flies is void: every entry and potion is paid back.
 *
 * Fairness: the tournament's server seed is committed (sha256) when it opens and revealed when it is over; every
 * entry brings a client seed, and all draws come from sha256(server seed : hash of all entries : label), so anyone can
 * replay the bracket and any fight. The house takes a fixed fee and wins nothing from who wins.
 *
 * Auras are looks only: bought once for a fly (its owner pays), they stay with the fly; the money is the house's.
 *
 * Money only moves in the ledger (Postgres, src/pg.ts): `bet` rows for entries ("arena:<t>:<fly>"), potions
 * ("arena-potion:<t>:<fly>:<potion>") and auras ("arena-aura:<fly>:<aura>"), `payout` rows for prizes
 * ("arena-prize:<t>:<fly>") and refunds ("arena-refund:<t>:<fly>"); the unique tx index makes a double payment
 * impossible. Deposits and withdrawal requests are roulette's (/api/balance/*).
 *
 * Off until ARENA_ON = 1 and ARENA_TRADERFLY is set.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Worker } from "node:worker_threads";
import { multicall, word } from "./multicall.ts";
import { lockWallet, type Pg, type Q } from "./pg.ts";
import { orderedInbox } from "./roulette.ts";
import { selector } from "./staking.ts";
import { checksumAddress } from "./wallet.ts";
import { commitCalldata, fightLeaf, lastSeasonCalldata, merkle, revealCalldata } from "./arenachain.ts";
import { entriesDigest, maxHp, prizes, roundsFor, RULES, SPLIT2, SPLIT3, type Match, type RoundEvent } from "../../world/src/arena/game.ts";
import { AURAS, auraOf } from "../../world/src/arena/shop.ts";
import { MAX_POTIONS, POTION_IDS, POTIONS, statsOf, validPotions, validTraits, type PotionId, type Traits } from "../../world/src/arena/stats.ts";

export interface ArenaDeps {
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
  /** roulette's 18+ terms, which cover the colosseum too */
  termsAccepted: (wallet: string) => Promise<boolean>;
  rpcUrl: string;
  /** posts to the ledger contract from its operator wallet (src/relay.ts); null = nothing is posted on chain */
  ledger?: { send(to: string, data: string): Promise<string> } | null;
  /** sends the house fee of a finished season (in `token`) to ARENA_FEE_TO: the hot wallet that pays withdrawals (src/relay.ts) */
  feePayer?: { send(to: string, data: string): Promise<string> } | null;
  /** the $FLYAI token */
  token?: string;
  connectomeDir: string;
  env: NodeJS.ProcessEnv;
}

const SEL = { ownerOf: selector("ownerOf(uint256)"), traitsOf: selector("traitsOf(uint256)") };
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const UUID = "[0-9a-f-]{36}";

interface TRow {
  id: string; name: string; status: "open" | "running" | "done" | "void"; entry_wei: string; potion_wei: string; fee_bps: number;
  min_entrants: number; max_entrants: number; max_per_wallet: number; commit_hash: string; server_seed: string; digest: string | null;
  pot_wei: string; fee_wei: string | null; places: string | null; opens_at: number; closes_at: number; created_at: number; done_at: number | null;
  commit_tx: string | null; result_tx: string | null; results_root: string | null; fee_tx: string | null;
}
interface ERow {
  tournament: string; fly: number; wallet: string; client_seed: string; traits: string; potions: string; paid_wei: string;
  place: number | null; prize_wei: string | null; claimed_at: number | null; refunded_at: number | null; created_at: number;
}

export function createArena(d: ArenaDeps) {
  const { pg, book, balanceOf, HttpError, toWei, fromWei } = d;
  const tokens = (name: string, def: string) => {
    try { return toWei(d.env[name] ?? def); } catch { throw new Error(`${name} must be a number of tokens`); }
  };
  const whole = (name: string, def: string, min: number) => {
    const n = Number(d.env[name] ?? def);
    if (!Number.isInteger(n) || n < min) throw new Error(`${name} is a whole number, ${min} or more`);
    return n;
  };
  const CFG = {
    contract: d.env.ARENA_TRADERFLY ? checksumAddress(d.env.ARENA_TRADERFLY) : null,
    /** the ledger contract (flytrade/contracts/src/ColosseumLedger.sol) every season is posted to, with the wallet that posts in `deps.ledger` */
    ledger: d.env.ARENA_LEDGER ? checksumAddress(d.env.ARENA_LEDGER) : null,
    /** where each finished season's house fee goes (the dev wallet); none = it stays with the house in the ledger */
    feeTo: d.env.ARENA_FEE_TO ? checksumAddress(d.env.ARENA_FEE_TO) : null,
    /** a block explorer for the page's links, and a public RPC for its own on-chain fight check */
    explorer: (d.env.ARENA_EXPLORER ?? "").replace(/\/$/, ""),
    publicRpc: d.env.ARENA_PUBLIC_RPC ?? "https://rpc.mainnet.chain.robinhood.com",
    /** fly ids run from 1 to this */
    maxId: whole("ARENA_MAX_ID", "1000", 1),
    /** a fly's picture, with {id} for its number */
    image: d.env.ARENA_IMAGE ?? "",
    ownersTtlMs: whole("ARENA_OWNERS_TTL_SEC", "60", 1) * 1000,
    tickMs: whole("ARENA_TICK_SEC", "10", 1) * 1000,
    // what a tournament gets when the operator's call doesn't say
    entry: tokens("ARENA_ENTRY", "5000"),
    potion: tokens("ARENA_POTION", "2500"),
    feeBps: whole("ARENA_FEE_BPS", "1000", 0),
    hours: Number(d.env.ARENA_HOURS ?? "24"),
    minEntrants: whole("ARENA_MIN_ENTRANTS", "4", 2),
    maxEntrants: whole("ARENA_MAX_ENTRANTS", "256", 2),
    maxPerWallet: whole("ARENA_MAX_PER_WALLET", "3", 1),
  };
  const on = d.env.ARENA_ON === "1" && !!CFG.contract;
  if (CFG.feeBps > 5000) throw new Error("ARENA_FEE_BPS is at most 5000 (50%)");
  if (!(CFG.hours > 0)) throw new Error("ARENA_HOURS is a number of hours");
  const auraPrice = (id: string) => toWei(String(auraOf(id)!.price));
  const lockT = (id: string) => `arena:${id}`;

  // ---- the chain: who owns a fly, and its traits ---------------------------------------------------------
  const chain = multicall(d.rpcUrl);
  const addressOf = (ret: string) => checksumAddress(`0x${ret.slice(-40)}`);

  /** The fly's owner right now, or null if it isn't minted (or was burned). */
  async function ownerOfNow(fly: number): Promise<string | null> {
    try {
      const r = await chain.call(CFG.contract!, SEL.ownerOf + word(fly));
      return BigInt(r) === 0n ? null : addressOf(r);
    } catch {
      return null;
    }
  }

  // traits never change once revealed: read once per fly
  const traitsCache = new Map<number, Traits>();
  function decodeTraits(ret: string | null): Traits | null {
    // (uint8 rarity, uint8 pose, uint8 colorway, uint8 background, uint8 gear, uint16 weight, uint8 extra): 7 words
    if (!ret || ret.length < 2 + 7 * 64) return null;
    const w = (k: number) => Number(BigInt(`0x${ret.slice(2 + k * 64, 2 + (k + 1) * 64)}`));
    const t = { rarity: w(0), pose: w(1), colorway: w(2), background: w(3), gear: w(4), extra: w(6) };
    return validTraits(t) ? t : null;
  }
  /** Traits of each fly (null for one that doesn't exist, isn't revealed or has traits this game doesn't know). */
  async function traitsOf(flies: number[]): Promise<(Traits | null)[]> {
    const missing = flies.filter((f) => !traitsCache.has(f));
    if (missing.length) {
      const got = await chain.batch(missing.map((f) => ({ to: CFG.contract!, data: SEL.traitsOf + word(f) })));
      missing.forEach((f, i) => { const t = decodeTraits(got[i]); if (t) traitsCache.set(f, t); });
    }
    return flies.map((f) => traitsCache.get(f) ?? null);
  }

  // every fly's owner, read together and kept for a minute: the page's "your flies"
  let owners = new Map<number, string>(), ownersAt = 0, reading: Promise<void> | null = null;
  function readOwners(): Promise<void> {
    reading ??= (async () => {
      try {
        const ids = Array.from({ length: CFG.maxId }, (_, i) => i + 1);
        const got = await chain.batch(ids.map((id) => ({ to: CFG.contract!, data: SEL.ownerOf + word(id) })));
        const next = new Map<number, string>();
        ids.forEach((id, i) => { const r = got[i]; if (r && BigInt(r) !== 0n) next.set(id, addressOf(r)); });
        owners = next;
        ownersAt = Date.now();
      } finally {
        reading = null;
      }
    })();
    return reading;
  }
  async function fliesOf(wallet: string): Promise<number[]> {
    if (Date.now() - ownersAt > CFG.ownersTtlMs) await readOwners().catch((err) => { if (!ownersAt) throw new HttpError(502, `couldn't read the chain: ${err?.message ?? err}`); });
    return [...owners].filter(([, who]) => who === wallet).map(([id]) => id);
  }

  // ---- rows ------------------------------------------------------------------------------------------
  const tournament = (id: string, q: Q = pg) => q.one<TRow>("select * from mine.arena_tournaments where id = ?", id);
  const entriesOf = (id: string, q: Q = pg) => q.all<ERow>("select * from mine.arena_entries where tournament = ? order by created_at, fly", id);
  const live = (q: Q = pg) => q.one<TRow>("select * from mine.arena_tournaments where status in ('open', 'running')");
  const wornBy = async (flies: number[]): Promise<Map<number, string>> => {
    const out = new Map<number, string>();
    if (!flies.length) return out;
    for (const r of await pg.all<{ fly: number; aura: string | null }>(`select fly, aura from mine.arena_worn where fly in (${flies.map(() => "?").join(", ")})`, ...flies)) {
      if (r.aura) out.set(r.fly, r.aura);
    }
    return out;
  };

  // ---- the fights --------------------------------------------------------------------------------------
  let worker: Worker | null = null;
  const playing = new Set<string>();
  function startWorker(): void {
    const w = new Worker(new URL("./arena.worker.ts", import.meta.url), { workerData: { dir: d.connectomeDir } });
    worker = w;
    w.on("message", orderedInbox("arena", async (msg: any) => {
      if (msg.type === "match") await onMatch(msg.tournament, msg.match);
      else if (msg.type === "podium") await onPodium(msg.tournament, msg.places);
      else if (msg.type === "error") {
        // nothing is settled: the tournament stays `running` and the next tick plays it again from its seeds
        console.error(`arena ${msg.tournament} failed: ${msg.text}`);
        playing.delete(msg.tournament);
      }
    }));
    w.on("error", (err) => console.error("arena worker:", err));
    w.on("exit", (code) => {
      if (worker !== w) return;
      worker = null;
      playing.clear();
      console.error(`arena worker stopped (${code}); the next tick plays a running tournament again`);
    });
  }
  /** Plays a running tournament from its seeds (again after a restart: the same fights, stored once). */
  async function run(t: TRow): Promise<void> {
    if (playing.has(t.id) || !t.digest) return;
    playing.add(t.id);
    const entrants = (await entriesOf(t.id)).map((e) => ({ fly: e.fly, stats: statsOf(JSON.parse(e.traits), JSON.parse(e.potions)) }));
    if (!worker) startWorker();
    worker!.postMessage({ type: "start", tournament: t.id, serverSeed: t.server_seed, digest: t.digest, entrants });
  }

  async function onMatch(id: string, m: Match): Promise<void> {
    const events = JSON.stringify(m.events);
    const stored = await pg.one<{ events: string; winner: number }>("select events, winner from mine.arena_matches where tournament = ? and round = ? and slot = ?", id, m.round, m.slot);
    if (stored) {
      // a replay after a restart: it must match what was already stored
      if (stored.events !== events || stored.winner !== m.winner) console.error(`arena ${id}: replayed fight ${m.round}:${m.slot} differs from the stored one`);
      return;
    }
    await pg.run(`insert into mine.arena_matches (tournament, round, slot, a, b, winner, how, seeds, events) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict do nothing`, id, m.round, m.slot, m.a, m.b, m.winner, m.how, m.seeds ? JSON.stringify(m.seeds) : null, events);
  }

  /** Every fight is stored: the fee and the prizes are fixed, and the tournament shows. */
  async function onPodium(id: string, places: [number, number, number | null]): Promise<void> {
    await pg.tx(async (q) => {
      const t = await tournament(id, q);
      if (!t || t.status !== "running") return;
      const win = prizes(BigInt(t.pot_wei), t.fee_bps, places[2] === null ? 2 : 3);
      for (let k = 0; k < win.prizes.length; k++) {
        await q.run("update mine.arena_entries set place = ?, prize_wei = ? where tournament = ? and fly = ?", k + 1, win.prizes[k].toString(), id, places[k]);
      }
      await q.run("update mine.arena_tournaments set status = 'done', fee_wei = ?, places = ?, done_at = ? where id = ?", win.fee.toString(), JSON.stringify(places), Date.now(), id);
    }, lockT(id));
    playing.delete(id);
    void postChain();
    void payFees();
  }

  /** Registration is over: too few flies and everything is paid back, otherwise the entries are fixed and the fights start. */
  async function close(id: string): Promise<void> {
    const t = await pg.tx(async (q) => {
      const t = await tournament(id, q);
      if (!t || t.status !== "open") return null;
      const entries = await entriesOf(id, q);
      if (entries.length < t.min_entrants) {
        await q.run("update mine.arena_tournaments set status = 'void', done_at = ? where id = ?", Date.now(), id);
        return { ...t, status: "void" as const };
      }
      const digest = await entriesDigest(entries.map((e) => ({ fly: e.fly, clientSeed: e.client_seed })));
      await q.run("update mine.arena_tournaments set status = 'running', digest = ? where id = ?", digest, id);
      return { ...t, status: "running" as const, digest };
    }, lockT(id));
    if (t?.status === "void") await refund(id);
    else if (t) await run(t);
  }

  /** A void tournament's entries and potions go back, each under its wallet's lock, once. */
  async function refund(id: string): Promise<void> {
    for (const e of await pg.all<ERow>("select * from mine.arena_entries where tournament = ? and refunded_at is null", id)) {
      await pg.tx(async (q) => {
        if (!(await q.run("update mine.arena_entries set refunded_at = ? where tournament = ? and fly = ? and refunded_at is null", Date.now(), id, e.fly))) return;
        await book(q, e.wallet, null, "payout", BigInt(e.paid_wei), { tx: `arena-refund:${id}:${e.fly}` });
      }, lockWallet(e.wallet));
    }
  }

  // ---- the record on chain -------------------------------------------------------------------------------------
  /** Every fight of a finished season as the ledger records it: leaf, tree root and each fight's proof. Done seasons never change. */
  const resultsCache = new Map<string, { root: string; fights: Map<string, { leaf: string; proof: string[] }> }>();
  async function resultsOf(t: TRow) {
    const hit = resultsCache.get(t.id);
    if (hit) return hit;
    const season = await seasonOf(t);
    const rows = await pg.all<{ round: number; slot: number; a: number; b: number; winner: number; events: string }>(
      "select round, slot, a, b, winner, events from mine.arena_matches where tournament = ? and b is not null order by round, slot", t.id);
    if (!rows.length) return null;
    const leaves = rows.map((m) => fightLeaf({ season, round: m.round, slot: m.slot, a: m.a, b: m.b, winner: m.winner, events: m.events }));
    const tree = merkle(leaves);
    const out = { root: tree.root, fights: new Map(rows.map((m, i) => [`${m.round}:${m.slot}`, { leaf: leaves[i], proof: tree.proofs[i] }])) };
    if (t.status === "done") resultsCache.set(t.id, out);
    return out;
  }

  let posting = false;
  /**
   * Posts what the ledger is missing, oldest season first (the contract wants them in order): each season's seed commit
   * (the day registration opens), and when it is done its seed, entries hash, results root and podium. A failed post is
   * tried again on the next tick; nothing here touches money.
   */
  async function postChain(): Promise<void> {
    if (!CFG.ledger || !d.ledger || posting) return;
    posting = true;
    try {
      for (const t of await pg.all<TRow>("select * from mine.arena_tournaments where commit_tx is null or (status = 'done' and result_tx is null) order by created_at")) {
        const season = await seasonOf(t);
        if (!t.commit_tx) {
          const next = Number(BigInt(await chain.call(CFG.ledger, lastSeasonCalldata()))) + 1;
          if (next !== season) { console.error(`arena ledger: season ${season} can't be committed, the ledger expects ${next} next`); return; }
          t.commit_tx = await d.ledger.send(CFG.ledger, commitCalldata(season, t.commit_hash, t.closes_at));
          await pg.run("update mine.arena_tournaments set commit_tx = ? where id = ?", t.commit_tx, t.id);
        }
        if (t.status === "done" && !t.result_tx) {
          const res = await resultsOf(t);
          const places = JSON.parse(t.places!) as [number, number, number | null];
          if (!res || !t.digest) continue;
          const entrants = (await pg.one<{ n: number }>("select count(*) as n from mine.arena_entries where tournament = ?", t.id))!.n;
          const tx = await d.ledger.send(CFG.ledger, revealCalldata(season, t.server_seed, Number(entrants), t.digest, res.root, places));
          await pg.run("update mine.arena_tournaments set result_tx = ?, results_root = ? where id = ?", tx, res.root, t.id);
        }
      }
    } catch (err) {
      console.error("arena ledger:", (err as Error)?.message ?? err);
    } finally {
      posting = false;
    }
  }

  let paying = false;
  /**
   * Sends each finished season's house fee (fee_wei, the 10% by default) in $FLYAI to the dev wallet. The season is
   * claimed first (fee_tx = 'pending'), so a crash between sending and recording can't pay it twice; a transfer that
   * provably never left is released and tried again on the next tick, one that may have left stays 'pending' for the
   * operator to check.
   */
  async function payFees(): Promise<void> {
    if (!CFG.feeTo || !d.feePayer || !d.token || paying) return;
    paying = true;
    try {
      for (const t of await pg.all<TRow>("select * from mine.arena_tournaments where status = 'done' and fee_tx is null and fee_wei is not null and fee_wei <> '0' order by created_at")) {
        if (!(await pg.run("update mine.arena_tournaments set fee_tx = 'pending' where id = ? and fee_tx is null", t.id))) continue;
        try {
          const tx = await d.feePayer.send(d.token, `0xa9059cbb${word(BigInt(CFG.feeTo))}${word(BigInt(t.fee_wei!))}`);
          await pg.run("update mine.arena_tournaments set fee_tx = ? where id = ?", tx, t.id);
        } catch (err) {
          if ((err as { unsent?: boolean }).unsent) await pg.run("update mine.arena_tournaments set fee_tx = null where id = ? and fee_tx = 'pending'", t.id);
          console.error(`arena fee of ${t.id}:`, (err as Error)?.message ?? err);
          break;
        }
      }
    } catch (err) {
      console.error("arena fees:", (err as Error)?.message ?? err);
    } finally {
      paying = false;
    }
  }

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      const t = await live();
      if (t?.status === "open" && t.closes_at <= Date.now()) await close(t.id);
      else if (t?.status === "running") await run(t);
      // a refund that a restart cut short
      for (const v of await pg.all<{ id: string }>("select distinct tournament as id from mine.arena_entries e join mine.arena_tournaments t on t.id = e.tournament where t.status = 'void' and e.refunded_at is null")) await refund(v.id);
      await postChain();
      await payFees();
    } catch (err) {
      console.error("arena tick:", (err as Error)?.message ?? err);
    } finally {
      ticking = false;
    }
  }
  function start(): void {
    if (!on) return;
    void tick();
    setInterval(() => void tick(), CFG.tickMs).unref();
  }

  // ---- views -----------------------------------------------------------------------------------------
  function config() {
    return {
      on, contract: CFG.contract, image: CFG.image, ledger: CFG.ledger, explorer: CFG.explorer || null, rpc: CFG.publicRpc, rules: RULES, split3: SPLIT3, split2: SPLIT2,
      potions: POTION_IDS.map((id) => ({ id, name: POTIONS[id].name, add: POTIONS[id].add })), max_potions: MAX_POTIONS,
      auras: AURAS.map((a) => ({ id: a.id, name: a.name, price: String(a.price), colors: a.colors })),
    };
  }

  const entrantView = (e: ERow, t: TRow, aura: string | null) => {
    const traits = JSON.parse(e.traits) as Traits, potions = JSON.parse(e.potions) as PotionId[];
    const stats = statsOf(traits, potions);
    return {
      fly: e.fly, wallet: e.wallet, traits, potions, stats, hp: maxHp(stats), aura,
      place: e.place, prize: e.prize_wei ? fromWei(BigInt(e.prize_wei)) : null, claimed: e.claimed_at !== null,
      // with the results, so anyone can work the entries' hash out again
      client_seed: t.status === "done" ? e.client_seed : null,
    };
  };

  /** Seasons count from 1 in the order the tournaments were opened. */
  const seasonOf = async (t: TRow) => Number((await pg.one<{ n: number }>("select count(*) as n from mine.arena_tournaments where created_at <= ?", t.created_at))!.n);

  function summary(t: TRow, entrants: number, season: number) {
    const pot = BigInt(t.pot_wei);
    const fee = t.fee_wei !== null ? BigInt(t.fee_wei) : (pot * BigInt(t.fee_bps)) / 10_000n;
    return {
      id: t.id, season, name: t.name, status: t.status, entry: fromWei(BigInt(t.entry_wei)), potion_price: fromWei(BigInt(t.potion_wei)),
      fee_bps: t.fee_bps, min_entrants: t.min_entrants, max_entrants: t.max_entrants, max_per_wallet: t.max_per_wallet,
      opens_at: t.opens_at, closes_at: t.closes_at, done_at: t.done_at, entrants,
      pot: fromWei(pot), fee: fromWei(fee), prize_pool: fromWei(pot - fee),
      places: t.places ? JSON.parse(t.places) as (number | null)[] : null,
      commit_hash: t.commit_hash, digest: t.digest,
      fee_to: CFG.feeTo, fee_tx: t.fee_tx && t.fee_tx !== "pending" ? t.fee_tx : null,
      chain: t.commit_tx || t.result_tx ? { commit_tx: t.commit_tx, result_tx: t.result_tx, results_root: t.results_root } : null,
      // revealed only once nothing more can happen in the tournament
      server_seed: t.status === "done" || t.status === "void" ? t.server_seed : null,
    };
  }

  async function tournamentView(id: string) {
    const t = await tournament(id);
    if (!t) throw new HttpError(404, "no such tournament");
    const entries = await entriesOf(id);
    const worn = await wornBy(entries.map((e) => e.fly));
    // the fights show all at once, when the last one is stored
    const matches = t.status !== "done" ? [] : (await pg.all<any>("select round, slot, a, b, winner, how, events from mine.arena_matches where tournament = ? order by round, slot", id))
      .map((m) => ({ round: m.round, slot: m.slot, a: m.a, b: m.b, winner: m.winner, how: m.how, rounds: Math.max(0, (JSON.parse(m.events) as unknown[]).length - 1) }));
    const fought = t.status === "running" ? (await pg.one<{ n: number }>("select count(*) as n from mine.arena_matches where tournament = ? and b is not null", id))!.n : null;
    return {
      ...summary(t, entries.length, await seasonOf(t)),
      rounds: entries.length >= 2 ? roundsFor(entries.length) : 0,
      // how far the fights are: every entrant but one loses once, and the beaten semi-finalists fight once more
      progress: fought === null ? null : { fought, fights: entries.length - 1 + (entries.length >= 4 ? 1 : 0) },
      entries: entries.map((e) => entrantView(e, t, worn.get(e.fly) ?? null)),
      matches,
    };
  }

  async function matchView(id: string, round: number, slot: number) {
    const t = await tournament(id);
    if (!t) throw new HttpError(404, "no such tournament");
    if (t.status !== "done") throw new HttpError(409, "the fights show when the tournament is over");
    const m = await pg.one<any>("select * from mine.arena_matches where tournament = ? and round = ? and slot = ?", id, round, slot);
    if (!m) throw new HttpError(404, "no such fight");
    const worn = await wornBy([m.a, m.b].filter((x) => x !== null));
    const side = async (fly: number | null) => {
      if (fly === null) return null;
      const e = (await pg.one<ERow>("select * from mine.arena_entries where tournament = ? and fly = ?", id, fly))!;
      return entrantView(e, t, worn.get(fly) ?? null);
    };
    return {
      tournament: id, round: m.round, slot: m.slot, a: await side(m.a), b: await side(m.b), winner: m.winner, how: m.how,
      seeds: m.seeds ? JSON.parse(m.seeds) : null, events: JSON.parse(m.events) as RoundEvent[],
      // where the fight sits in the season's results root: the page asks the ledger contract whether its own copy of the fight is in it
      chain: await (async () => { const r = await resultsOf(t); const f = r?.fights.get(`${round}:${slot}`); return f ? { season: await seasonOf(t), leaf: f.leaf, proof: f.proof, root: r!.root } : null; })(),
      server_seed: t.server_seed, digest: t.digest, commit_hash: t.commit_hash,
    };
  }

  const latest = async () => {
    const t = await pg.one<{ id: string }>("select id from mine.arena_tournaments order by created_at desc limit 1");
    return t ? tournamentView(t.id) : null;
  };
  async function list() {
    const out = [];
    for (const t of await pg.all<TRow>("select * from mine.arena_tournaments order by created_at desc limit 30")) {
      out.push(summary(t, (await pg.one<{ n: number }>("select count(*) as n from mine.arena_entries where tournament = ?", t.id))!.n, await seasonOf(t)));
    }
    return out;
  }

  /** What a fly has done in finished tournaments. */
  async function recordOf(fly: number) {
    const r = await pg.one<{ fights: number; wins: number }>(`select count(*) as fights, coalesce(sum(case when m.winner = ? then 1 else 0 end), 0) as wins
      from mine.arena_matches m join mine.arena_tournaments t on t.id = m.tournament
      where t.status = 'done' and m.b is not null and (m.a = ? or m.b = ?)`, fly, fly, fly);
    const titles = (await pg.one<{ n: number }>("select count(*) as n from mine.arena_entries where fly = ? and place = 1", fly))!.n;
    return { fights: Number(r?.fights ?? 0), wins: Number(r?.wins ?? 0), titles };
  }

  /** Every fly's auras at once (the marketplace's cards and a fly's inventory): what it owns and what it wears. Auras stay with the fly. */
  async function aurasAll() {
    const out: Record<number, { owned: string[]; worn: string | null }> = {};
    for (const r of await pg.all<{ fly: number; aura: string }>("select fly, aura from mine.arena_auras order by at")) (out[r.fly] ??= { owned: [], worn: null }).owned.push(r.aura);
    for (const r of await pg.all<{ fly: number; aura: string | null }>("select fly, aura from mine.arena_worn where aura is not null")) if (out[r.fly]) out[r.fly].worn = r.aura;
    return out;
  }

  async function flyView(fly: number) {
    if (!on) throw new HttpError(503, "the colosseum is closed");
    if (!Number.isInteger(fly) || fly < 1 || fly > CFG.maxId) throw new HttpError(400, `fly is a number from 1 to ${CFG.maxId}`);
    let traits: Traits | null;
    try { [traits] = await traitsOf([fly]); } catch (err) { throw new HttpError(502, `couldn't read the chain: ${(err as Error)?.message ?? err}`); }
    if (!traits) throw new HttpError(404, "no such fly");
    const stats = statsOf(traits);
    const auras = (await pg.all<{ aura: string }>("select aura from mine.arena_auras where fly = ? order by at", fly)).map((r) => r.aura);
    return { fly, traits, stats, hp: maxHp(stats), aura: (await wornBy([fly])).get(fly) ?? null, auras, record: await recordOf(fly) };
  }

  async function me(req: IncomingMessage) {
    const wallet = await d.sessionWallet(req);
    const flies: unknown[] = [];
    if (on) {
      const mine = (await fliesOf(wallet)).sort((a, b) => a - b);
      const traits = await traitsOf(mine).catch(() => mine.map(() => null));
      const t = await live();
      const entered = new Map<number, ERow>();
      if (t) for (const e of await pg.all<ERow>("select * from mine.arena_entries where tournament = ? and wallet = ?", t.id, wallet)) entered.set(e.fly, e);
      const worn = await wornBy(mine);
      const owned = new Map<number, string[]>();
      if (mine.length) {
        for (const r of await pg.all<{ fly: number; aura: string }>(`select fly, aura from mine.arena_auras where fly in (${mine.map(() => "?").join(", ")}) order by at`, ...mine)) {
          owned.set(r.fly, [...(owned.get(r.fly) ?? []), r.aura]);
        }
      }
      mine.forEach((fly, i) => {
        const tr = traits[i];
        if (!tr) return;
        const e = entered.get(fly);
        const potions = e ? JSON.parse(e.potions) as PotionId[] : [];
        const stats = statsOf(tr, potions);
        flies.push({ fly, traits: tr, potions, stats, hp: maxHp(stats), entered: !!e, aura: worn.get(fly) ?? null, auras: owned.get(fly) ?? [] });
      });
    }
    const prizesOpen = (await pg.all<any>(`select e.tournament, t.name, e.fly, e.place, e.prize_wei from mine.arena_entries e join mine.arena_tournaments t on t.id = e.tournament
      where e.wallet = ? and e.prize_wei is not null and e.claimed_at is null and t.status = 'done' order by t.created_at desc`, wallet))
      .map((r) => ({ tournament: r.tournament, name: r.name, fly: r.fly, place: r.place, prize: fromWei(BigInt(r.prize_wei)) }));
    return { wallet, balance: fromWei(await balanceOf(pg, wallet)), terms_accepted: await d.termsAccepted(wallet), flies, prizes: prizesOpen };
  }

  async function admin() {
    const t = await live();
    let fees = 0n, shop = 0n;
    for (const r of await pg.all<{ fee_wei: string }>("select fee_wei from mine.arena_tournaments where status = 'done'")) fees += BigInt(r.fee_wei);
    for (const r of await pg.all<{ paid_wei: string }>("select paid_wei from mine.arena_auras")) shop += BigInt(r.paid_wei);
    let unclaimed = 0n;
    for (const r of await pg.all<{ prize_wei: string }>("select prize_wei from mine.arena_entries where prize_wei is not null and claimed_at is null")) unclaimed += BigInt(r.prize_wei);
    return {
      on, contract: CFG.contract, live: t ? summary(t, (await pg.one<{ n: number }>("select count(*) as n from mine.arena_entries where tournament = ?", t.id))!.n, await seasonOf(t)) : null,
      tournaments_done: (await pg.one<{ n: number }>("select count(*) as n from mine.arena_tournaments where status = 'done'"))!.n,
      fees_all: fromWei(fees), auras_sold: fromWei(shop), prizes_unclaimed: fromWei(unclaimed),
    };
  }

  // ---- the operator -----------------------------------------------------------------------------------
  const isOn = () => { if (!on) throw new HttpError(503, "the colosseum is closed"); };

  async function open(body: any) {
    isOn();
    const amount = (x: unknown, def: bigint, what: string) => {
      if (x === undefined || x === null || x === "") return def;
      try { const w = toWei(String(x)); if (w >= 0n) return w; } catch { /* falls through */ }
      throw new HttpError(400, `${what} is a number of tokens`);
    };
    const int = (x: unknown, def: number, min: number, max: number, what: string) => {
      const n = x === undefined || x === null ? def : Number(x);
      if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${what} is a whole number from ${min} to ${max}`);
      return n;
    };
    const name = String(body.name ?? "").trim() || `Season ${(await pg.one<{ n: number }>("select count(*) as n from mine.arena_tournaments"))!.n + 1}`;
    if (name.length > 60) throw new HttpError(400, "name is at most 60 characters");
    const entry = amount(body.entry, CFG.entry, "entry");
    if (entry <= 0n) throw new HttpError(400, "entry is more than 0");
    const potion = amount(body.potion_price, CFG.potion, "potion_price");
    const feeBps = int(body.fee_bps, CFG.feeBps, 0, 5000, "fee_bps");
    const hours = body.hours === undefined ? CFG.hours : Number(body.hours);
    if (!(hours > 0 && hours <= 24 * 30)) throw new HttpError(400, "hours is how long registration stays open, up to 720");
    const maxEntrants = int(body.max_entrants, CFG.maxEntrants, 2, 1024, "max_entrants");
    const minEntrants = int(body.min_entrants, Math.min(CFG.minEntrants, maxEntrants), 2, maxEntrants, "min_entrants");
    const maxPerWallet = int(body.max_per_wallet, CFG.maxPerWallet, 1, maxEntrants, "max_per_wallet");
    const id = randomUUID(), seed = randomBytes(32).toString("hex"), now = Date.now();
    await pg.tx(async (q) => {
      if (await live(q)) throw new HttpError(409, "a tournament is already open or running");
      await q.run(`insert into mine.arena_tournaments (id, name, status, entry_wei, potion_wei, fee_bps, min_entrants, max_entrants, max_per_wallet, commit_hash, server_seed, opens_at, closes_at, created_at)
        values (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, name, entry.toString(), potion.toString(), feeBps, minEntrants, maxEntrants, maxPerWallet, sha256hex(seed), seed, now, now + Math.round(hours * 3_600_000), now);
    }, "arena:open");
    void postChain();
    return tournamentView(id);
  }

  /** Ends registration now (the fights start on the spot), or calls an open tournament off and pays everyone back. */
  async function closeNow(body: any) {
    const id = String(body.id ?? "");
    const t = await tournament(id);
    if (!t || t.status !== "open") throw new HttpError(404, "no open tournament with that id");
    if (body.cancel === true) {
      await pg.tx(async (q) => {
        await q.run("update mine.arena_tournaments set status = 'void', done_at = ? where id = ? and status = 'open'", Date.now(), id);
      }, lockT(id));
      await refund(id);
    } else {
      await close(id);
    }
    return tournamentView(id);
  }

  // ---- players ---------------------------------------------------------------------------------------
  const flyId = (x: unknown) => {
    const fly = Number(x);
    if (!Number.isInteger(fly) || fly < 1 || fly > CFG.maxId) throw new HttpError(400, `fly is a number from 1 to ${CFG.maxId}`);
    return fly;
  };
  /** The signed-in wallet must own the fly on chain right now. */
  async function owned(req: IncomingMessage, x: unknown): Promise<{ wallet: string; fly: number }> {
    const wallet = await d.sessionWallet(req);
    const fly = flyId(x);
    if ((await ownerOfNow(fly)) !== wallet) throw new HttpError(403, `your wallet doesn't hold Trader Fly #${fly}`);
    return { wallet, fly };
  }
  const openNow = (t: TRow | undefined): TRow => {
    if (!t || t.status !== "open" || t.closes_at <= Date.now()) throw new HttpError(409, "registration is closed");
    return t;
  };

  async function enter(req: IncomingMessage, body: any) {
    isOn();
    const { wallet, fly } = await owned(req, body.fly);
    const clientSeed = String(body.client_seed ?? "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientSeed)) throw new HttpError(400, "client_seed is 1 to 64 letters, digits, - or _");
    const potions = body.potions ?? [];
    if (!validPotions(potions)) throw new HttpError(400, `potions is up to ${MAX_POTIONS} different ones of ${POTION_IDS.join(", ")}`);
    if (!(await d.termsAccepted(wallet))) throw new HttpError(403, "accept the terms first");
    let traits: Traits | null;
    try { [traits] = await traitsOf([fly]); } catch (err) { throw new HttpError(502, `couldn't read the chain: ${(err as Error)?.message ?? err}`); }
    if (!traits) throw new HttpError(409, "that fly's traits can't be read");
    const id = openNow(await live()).id;
    // under the wallet's and the tournament's locks: the balance, the seats and the pot can't change between the
    // checks and the booking
    await pg.tx(async (q) => {
      const t = openNow(await tournament(id, q));
      if (await q.one("select 1 from mine.arena_entries where tournament = ? and fly = ?", id, fly)) throw new HttpError(409, `Trader Fly #${fly} is already in`);
      const n = (await q.one<{ n: number }>("select count(*) as n from mine.arena_entries where tournament = ?", id))!.n;
      if (n >= t.max_entrants) throw new HttpError(409, "the tournament is full");
      const own = (await q.one<{ n: number }>("select count(*) as n from mine.arena_entries where tournament = ? and wallet = ?", id, wallet))!.n;
      if (own >= t.max_per_wallet) throw new HttpError(409, `a wallet can enter ${t.max_per_wallet} ${t.max_per_wallet === 1 ? "fly" : "flies"}`);
      const entry = BigInt(t.entry_wei), potion = BigInt(t.potion_wei) * BigInt(potions.length), cost = entry + potion;
      const balance = await balanceOf(q, wallet);
      if (balance < cost) throw new HttpError(402, `that costs ${fromWei(cost)} FLYAI; your balance is ${fromWei(balance)}`);
      await book(q, wallet, null, "bet", entry, { tx: `arena:${id}:${fly}` });
      for (const p of potions) await book(q, wallet, null, "bet", BigInt(t.potion_wei), { tx: `arena-potion:${id}:${fly}:${p}` });
      await q.run("insert into mine.arena_entries (tournament, fly, wallet, client_seed, traits, potions, paid_wei, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        id, fly, wallet, clientSeed, JSON.stringify(traits), JSON.stringify(potions), cost.toString(), Date.now());
      await q.run("update mine.arena_tournaments set pot_wei = ? where id = ?", (BigInt(t.pot_wei) + cost).toString(), id);
    }, lockWallet(wallet), lockT(id));
    return tournamentView(id);
  }

  /** One more potion for a fly already in, while registration is open. */
  async function potion(req: IncomingMessage, body: any) {
    isOn();
    const wallet = await d.sessionWallet(req);
    const fly = flyId(body.fly);
    const p = String(body.potion ?? "") as PotionId;
    if (!POTION_IDS.includes(p)) throw new HttpError(400, `potion is one of ${POTION_IDS.join(", ")}`);
    if (!(await d.termsAccepted(wallet))) throw new HttpError(403, "accept the terms first");
    const id = openNow(await live()).id;
    await pg.tx(async (q) => {
      const t = openNow(await tournament(id, q));
      const e = await q.one<ERow>("select * from mine.arena_entries where tournament = ? and fly = ?", id, fly);
      if (!e || e.wallet !== wallet) throw new HttpError(404, `you haven't entered Trader Fly #${fly}`);
      const has = JSON.parse(e.potions) as PotionId[];
      if (has.includes(p)) throw new HttpError(409, `it already has ${POTIONS[p].name}`);
      if (has.length >= MAX_POTIONS) throw new HttpError(409, `a fly takes ${MAX_POTIONS} potions`);
      const price = BigInt(t.potion_wei);
      const balance = await balanceOf(q, wallet);
      if (balance < price) throw new HttpError(402, `that costs ${fromWei(price)} FLYAI; your balance is ${fromWei(balance)}`);
      await book(q, wallet, null, "bet", price, { tx: `arena-potion:${id}:${fly}:${p}` });
      await q.run("update mine.arena_entries set potions = ?, paid_wei = ? where tournament = ? and fly = ?", JSON.stringify([...has, p]), (BigInt(e.paid_wei) + price).toString(), id, fly);
      await q.run("update mine.arena_tournaments set pot_wei = ? where id = ?", (BigInt(t.pot_wei) + price).toString(), id);
    }, lockWallet(wallet), lockT(id));
    return tournamentView(id);
  }

  /** Every prize the wallet won in a tournament (or in all of them), paid to its balance once. */
  async function claim(req: IncomingMessage, body: any) {
    const wallet = await d.sessionWallet(req);
    const only = body.tournament === undefined ? null : String(body.tournament);
    let paid = 0n;
    await pg.tx(async (q) => {
      const rows = await q.all<ERow>(`select e.* from mine.arena_entries e join mine.arena_tournaments t on t.id = e.tournament
        where e.wallet = ? and e.prize_wei is not null and e.claimed_at is null and t.status = 'done'`, wallet);
      for (const e of rows) {
        if (only && e.tournament !== only) continue;
        if (!(await q.run("update mine.arena_entries set claimed_at = ? where tournament = ? and fly = ? and claimed_at is null", Date.now(), e.tournament, e.fly))) continue;
        await book(q, wallet, null, "payout", BigInt(e.prize_wei!), { tx: `arena-prize:${e.tournament}:${e.fly}` });
        paid += BigInt(e.prize_wei!);
      }
    }, lockWallet(wallet));
    if (paid === 0n) throw new HttpError(404, "you have no prize to claim");
    return { claimed: fromWei(paid), balance: fromWei(await balanceOf(pg, wallet)) };
  }

  async function buyAura(req: IncomingMessage, body: any) {
    isOn();
    const { wallet, fly } = await owned(req, body.fly);
    const aura = auraOf(String(body.aura ?? ""));
    if (!aura) throw new HttpError(400, `aura is one of ${AURAS.map((a) => a.id).join(", ")}`);
    const price = auraPrice(aura.id);
    await pg.tx(async (q) => {
      if (await q.one("select 1 from mine.arena_auras where fly = ? and aura = ?", fly, aura.id)) throw new HttpError(409, `Trader Fly #${fly} already has the ${aura.name} aura`);
      const balance = await balanceOf(q, wallet);
      if (balance < price) throw new HttpError(402, `that costs ${fromWei(price)} FLYAI; your balance is ${fromWei(balance)}`);
      await book(q, wallet, null, "bet", price, { tx: `arena-aura:${fly}:${aura.id}` });
      await q.run("insert into mine.arena_auras (fly, aura, wallet, paid_wei, at) values (?, ?, ?, ?, ?)", fly, aura.id, wallet, price.toString(), Date.now());
      // a new aura goes straight on
      await q.run("insert into mine.arena_worn (fly, aura, at) values (?, ?, ?) on conflict (fly) do update set aura = excluded.aura, at = excluded.at", fly, aura.id, Date.now());
    }, lockWallet(wallet));
    return { ...(await flyView(fly)), balance: fromWei(await balanceOf(pg, wallet)) };
  }

  /** Puts on one of the fly's auras, or takes it off (aura: null). */
  async function wear(req: IncomingMessage, body: any) {
    isOn();
    const { fly } = await owned(req, body.fly);
    const aura = body.aura === null ? null : String(body.aura ?? "");
    if (aura !== null && !(await pg.one("select 1 from mine.arena_auras where fly = ? and aura = ?", fly, aura))) throw new HttpError(404, "that fly doesn't have that aura");
    await pg.run("insert into mine.arena_worn (fly, aura, at) values (?, ?, ?) on conflict (fly) do update set aura = excluded.aura, at = excluded.at", fly, aura, Date.now());
    return flyView(fly);
  }

  // ---- routes ----------------------------------------------------------------------------------------
  /** Handles the request if it's one of ours; false otherwise. */
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/arena/config") return d.send(res, 200, config()), true;
      if (p === "/api/arena/current") return d.send(res, 200, { tournament: await latest() }), true;
      if (p === "/api/arena/tournaments") return d.send(res, 200, { tournaments: await list() }), true;
      if (p === "/api/arena/auras") return d.send(res, 200, { auras: await aurasAll() }), true;
      if (p === "/api/arena/me") return d.send(res, 200, await me(req)), true;
      if ((m = new RegExp(`^/api/arena/tournaments/(${UUID})$`).exec(p))) return d.send(res, 200, await tournamentView(m[1])), true;
      if ((m = new RegExp(`^/api/arena/tournaments/(${UUID})/fights/(-?\\d{1,2})/(\\d{1,4})$`).exec(p))) {
        return d.send(res, 200, await matchView(m[1], Number(m[2]), Number(m[3]))), true;
      }
      if ((m = /^\/api\/arena\/flies\/(\d{1,6})$/.exec(p))) return d.send(res, 200, await flyView(Number(m[1]))), true;
      if (p === "/api/admin/arena") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
    }
    if (req.method === "POST") {
      if (p === "/api/arena/enter") return d.send(res, 200, await enter(req, await d.readJson(req))), true;
      if (p === "/api/arena/potion") return d.send(res, 200, await potion(req, await d.readJson(req))), true;
      if (p === "/api/arena/claim") return d.send(res, 200, await claim(req, await d.readJson(req))), true;
      if (p === "/api/arena/aura") return d.send(res, 200, await buyAura(req, await d.readJson(req))), true;
      if (p === "/api/arena/wear") return d.send(res, 200, await wear(req, await d.readJson(req))), true;
      if (p === "/api/admin/arena/open") { d.adminOnly(req); return d.send(res, 200, await open(await d.readJson(req))), true; }
      if (p === "/api/admin/arena/close") { d.adminOnly(req); return d.send(res, 200, await closeNow(await d.readJson(req))), true; }
    }
    return false;
  }

  return { route, start, config, CFG, on };
}
