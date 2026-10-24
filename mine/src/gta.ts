/**
 * GTA VI giveaway (2026-10-23, the user: "a new page ... if you are eligible (the authed wallet), also show current
 * winner and past winners, current number of giveaway and a progress bar of the fees ... min holding should be 100k
 * $FLYAI"; the campaign from 10-22: half the fees buy GTA VI copies for $FLYAI holders until it launches on 19 Nov).
 *
 * The pot: GTA_SHARE (50%) of
 *   pons    the dev wallet's Pons creator fees from GTA_PONS_START on (2026-10-23, the user: count the 0.175 NVDA
 *           unclaimed since the 10-17 claim, so just after that claim) ($FLYAI's own, paid in NVDA, and the desk launches'):
 *           the fee escrow's FeeDeposited logs to the dev wallet, valued when they are seen
 *   desk    the team's 5% of each weekly Fly Desk payout (public.desk_epochs.dev_usd) ending after GTA_START
 *   wallet  the Fly Wallets' profit fees (mine.vault_moves kind 'fee', not the referrers' legs)
 * Each time the pot passes another GTA_PRICE_USD ($70) one copy is drawn.
 *
 * The draw (the user: "weighted by holdings"): when a round opens, every wallet holding GTA_MIN_HOLD (100k) $FLYAI or
 * more - held plus staked in FlyStaking - is listed with that amount as its weight, and the round waits for a block
 * SEED_DELAY blocks ahead. That block's hash picks the winner: keccak256(hash, round, attempt) mod the total weight,
 * walking the list sorted by wallet. The list is fixed before the hash exists, so nobody can tilt it, and it is
 * published with the draw so anyone can redo the pick. Not in the draw: the team's wallets, the Fly Wallets (server
 * wallets, not people), contracts (pools, lockers) and the burn address. The team checks the winner for farming before
 * the copy goes out (campaign-sybil checks): "void" draws that round again.
 *
 *   GET  /api/gta?wallet=0x..        the pot, the rounds, the winners; with a wallet, whether it is in
 *   POST /api/gta/contact { contact } the signed-in winner leaves where to send the copy
 *   GET  /api/admin/gta              every draw with the winners' contacts (BOUNTY_ADMINS wallets or ADMIN_TOKEN)
 *   POST /api/admin/gta { round, status: "sent" | "void", note? }
 *
 * Tables in flybook/supabase/migrations/20261023120000_mine_gta.sql. One tick every TICK_MS on the user process.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Pg } from "./pg.ts";
import { multicall, word } from "./multicall.ts";
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";

export const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
const DEV = "0x625862521777e19ad54ce6c7abed9ca54d6589ea";
/** Pons' fee escrow (factory 0x7ed5…7ec7e feeEscrow()) and its FeeDeposited(recipient, token, from) amount */
const ESCROW = "0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e";
const FEE_TOPIC = "0x5d104c62f50449fadfe6f4013c8f36588d32737f94b5ac9b83ddad33b3e1ffdf";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** never in the draw: the dev wallet (it sends the giveaways; 10-24 the user: only dev, not the other team wallets),
 *  the locker, the burn address */
const TEAM = [
  DEV, "0x267444d099b10fb5ed7c3cc7b7c767adca574952",
  "0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000",
];
/** the cached isContract answers (v2: from 10-24 EIP-7702 wallets count as people) */
const CONTRACTS = "contracts:v2";
const ADDRESS = /^0x[0-9a-f]{40}$/;
const E18 = 10n ** 18n;

export type Log = { blockNumber: string; transactionHash: string; logIndex: string; topics: string[]; data: string };
/** What the giveaway reads from Robinhood Chain (a fake in src/gtatest.ts). */
export type Chain = {
  head(): Promise<number>;
  blockTime(n: number): Promise<number>;           // seconds
  blockHash(n: number): Promise<string | null>;
  logs(q: { address: string; topics: (string | null)[]; from: number; to: number }): Promise<Log[]>;
  /** each wallet's $FLYAI held + staked, wei */
  holdings(wallets: string[]): Promise<bigint[]>;
  isContract(wallet: string): Promise<boolean>;
  decimals(token: string): Promise<number>;
};
export type Prices = { usd(token: string): Promise<number | null> };   // token "0x0…0" = ETH

export type GtaConfig = {
  start: number; end: number;                      // ms
  ponsStart: number;                               // ms, the Pons fees' own start
  priceUsd: number; share: number; minHold: bigint; // minHold in wei
  seedDelay: number; exclude: string[];
};
export function gtaConfig(env: NodeJS.ProcessEnv): GtaConfig {
  return {
    start: Date.parse(env.GTA_START ?? "2026-10-22T00:00:00Z"),
    end: Date.parse(env.GTA_END ?? "2026-11-19T00:00:00Z"),
    ponsStart: Date.parse(env.GTA_PONS_START ?? "2026-10-17T21:00:00Z"),   // the dev wallet's last claim: 10-17 20:53 UTC
    priceUsd: Number(env.GTA_PRICE_USD ?? 70),
    share: Number(env.GTA_SHARE ?? 0.5),
    minHold: BigInt(env.GTA_MIN_HOLD ?? 100_000) * E18,
    seedDelay: Number(env.GTA_SEED_DELAY ?? 1200),  // ~2 minutes of Robinhood Chain blocks
    exclude: (env.GTA_EXCLUDE ?? "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => ADDRESS.test(a)),
  };
}

/** The winner of a draw: keccak256(seed hash, round, attempt) mod the total, walking the list in order. */
export function pick(seedHash: string, round: number, attempt: number, list: [string, string][]): string | null {
  const total = list.reduce((s, [, w]) => s + BigInt(w), 0n);
  if (!total) return null;
  const bytes = Buffer.from(seedHash.slice(2) + word(round) + word(attempt), "hex");
  let r = BigInt(`0x${Buffer.from(keccak_256(bytes)).toString("hex")}`) % total;
  for (const [w, n] of list) {
    if (r < BigInt(n)) return w;
    r -= BigInt(n);
  }
  return null;
}

/** Where the pot stands: how many copies it has paid for, and the share of the next one. */
export function progress(potUsd: number, priceUsd: number, opened: number) {
  const funded = Math.floor(potUsd / priceUsd + 1e-9);
  const toward = Math.max(0, potUsd - opened * priceUsd);
  return { funded, progress_usd: Math.min(priceUsd, toward), pct: Math.min(100, (toward / priceUsd) * 100),
           left_usd: Math.max(0, priceUsd - toward) };
}

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const whole = (wei: bigint) => (wei / E18).toString();

type Draw = {
  round: number; attempt: number; status: string; opened_at: Date; target_usd: number; seed_block: string;
  seed_hash: string | null; drawn_at: Date | null; entrants: number; total_weight: string; entrants_list: [string, string][];
  winner: string | null; winner_weight: string | null; contact: string | null; contact_at: Date | null; note: string | null;
};

export function createGta(d: {
  pg: Pg; chain: Chain; prices: Prices; cfg: GtaConfig;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  isAdminToken: (req: IncomingMessage) => boolean;
  admins: string[];
  explorer: string;
}) {
  const { pg, chain, prices, cfg, HttpError } = d;
  const admins = new Set(d.admins.map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)));
  const getState = async <T>(key: string): Promise<T | undefined> =>
    (await pg.one<{ value: T }>("select value from mine.gta_state where key = ?", key))?.value;
  const setState = (key: string, value: unknown) => pg.run(`insert into mine.gta_state (key, value) values (?, ?::text::jsonb)
    on conflict (key) do update set value = excluded.value`, key, JSON.stringify(value));

  /** The first block at or after a time (a binary search over block headers, done once). */
  async function blockAt(ms: number, head: number): Promise<number> {
    let lo = 0, hi = head;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await chain.blockTime(mid)) * 1000 >= ms) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  /** Logs from `from` to `to` in chunks the RPC takes (it caps a query's span and its results: smaller on a refusal,
   *  wider again after a quiet chunk). */
  async function scan(address: string, topics: (string | null)[], from: number, to: number, each: (l: Log[]) => Promise<void>) {
    let span = 10_000_000;
    for (let a = from; a <= to;) {
      const b = Math.min(to, a + span - 1);
      let got: Log[];
      try {
        got = await chain.logs({ address, topics, from: a, to: b });
      } catch (err) {
        if (span <= 100 || !/range|span|limit|too many|exceed/i.test(String((err as Error).message))) throw err;
        span = Math.floor(span / 4);
        continue;
      }
      await each(got);
      if (process.env.GTA_DEBUG) console.log(`gta: ${address.slice(0, 8)} ${a}-${b} ${got.length} logs`);
      a = b + 1;
      if (got.length < 2_000) span = Math.min(10_000_000, span * 4);   // a busy stretch is over: wider again
    }
  }

  const decimals = new Map<string, number>();
  async function valueUsd(token: string, raw: bigint): Promise<{ usd: number; price: number | null }> {
    const t = token.toLowerCase();
    const price = await prices.usd(t);
    if (price === null) return { usd: 0, price: null };
    if (!decimals.has(t)) decimals.set(t, /^0x0{40}$/.test(t) ? 18 : await chain.decimals(t));
    return { usd: (Number(raw) / 10 ** decimals.get(t)!) * price, price };
  }

  /** New $FLYAI holders and new Pons fees since the last tick. */
  async function scanChain(head: number) {
    const cur = (await getState<{ holders?: number; pons?: number; pons_start?: number }>("cursor")) ?? {};
    const holdersFrom = cur.holders ?? 0;
    await scan(FLYAI, [TRANSFER_TOPIC], holdersFrom, head, async (logs) => {
      const to = [...new Set(logs.map((l) => `0x${l.topics[2]?.slice(-40) ?? ""}`.toLowerCase()).filter((a) => ADDRESS.test(a)))];
      for (let i = 0; i < to.length; i += 500) {
        const part = to.slice(i, i + 500);
        await pg.run(`insert into mine.gta_holders (address) select unnest(?::text[]) on conflict do nothing`, `{${part.join(",")}}`);
      }
    });
    // a changed GTA_PONS_START reads the fees again from there (each fee is booked once by its id)
    const ponsFrom = cur.pons !== undefined && cur.pons_start === cfg.ponsStart ? cur.pons : await blockAt(cfg.ponsStart, head);
    let unpriced = Infinity;
    await scan(ESCROW, [FEE_TOPIC, `0x${DEV.slice(2).padStart(64, "0")}`], ponsFrom, head, async (logs) => {
      for (const l of logs) {
        const id = `pons:${l.transactionHash}:${parseInt(l.logIndex, 16)}`;
        if (await pg.one("select 1 from mine.gta_fees where id = ?", id)) continue;
        const token = `0x${l.topics[2].slice(-40)}`.toLowerCase();
        const raw = BigInt(l.data.slice(0, 66));
        const { usd, price } = await valueUsd(token, raw);
        if (price === null) { unpriced = Math.min(unpriced, parseInt(l.blockNumber, 16)); continue; }   // the next tick tries again
        const at = new Date((await chain.blockTime(parseInt(l.blockNumber, 16))) * 1000);
        await pg.run(`insert into mine.gta_fees (id, source, at, usd, detail) values (?, 'pons', ?, ?, ?::text::jsonb)
          on conflict do nothing`, id, at.toISOString(), usd, JSON.stringify({ token, amount: raw.toString(), price }));
      }
    });
    // the pons cursor stays at the oldest unpriced fee's block, so it is read again
    await setState("cursor", { holders: head + 1, pons: Number.isFinite(unpriced) ? unpriced : head + 1, pons_start: cfg.ponsStart });
  }

  /** The desk's and the wallets' fees from the database. */
  async function scanDb() {
    const since = new Date(cfg.start).toISOString();
    try {
      const epochs = await pg.all<{ epoch: number; ends: Date; dev_usd: number }>(
        "select epoch, ends, dev_usd from public.desk_epochs where ends >= ? and dev_usd > 0", since);
      for (const e of epochs) {
        await pg.run(`insert into mine.gta_fees (id, source, at, usd, detail) values (?, 'desk', ?, ?, ?::text::jsonb)
          on conflict (id) do update set usd = excluded.usd`, `desk:${e.epoch}`, new Date(e.ends).toISOString(), Number(e.dev_usd),
          JSON.stringify({ epoch: e.epoch }));
      }
    } catch (err) {
      if (!/desk_epochs/.test(String((err as Error).message))) throw err;   // not on a test database
    }
    const moves = await pg.all<{ id: string; at: Date; token: string; amount: string; usd: number | null; chain: string | null }>(
      `select m.id::text as id, m.at, m.token, m.amount, m.usd, m.chain from mine.vault_moves m
       where m.kind = 'fee' and m.at >= ? and m.detail->'referral' is null
         and not exists (select 1 from mine.gta_fees f where f.id = 'wallet:' || m.id::text)`, since);
    for (const m of moves) {
      let usd = m.usd ?? 0;
      if (!usd && m.token && (!m.chain || m.chain === "robinhood")) usd = (await valueUsd(m.token, BigInt(m.amount || "0"))).usd;
      await pg.run(`insert into mine.gta_fees (id, source, at, usd, detail) values (?, 'wallet', ?, ?, ?::text::jsonb)
        on conflict do nothing`, `wallet:${m.id}`, new Date(m.at).toISOString(), Math.max(0, usd), JSON.stringify({ token: m.token }));
    }
  }

  async function excluded(): Promise<Set<string>> {
    const fly = await pg.all<{ address: string }>("select lower(address) as address from mine.vault_wallets").catch(() => []);
    return new Set([...TEAM, ...cfg.exclude, ...fly.map((r) => r.address)]);
  }

  /** Every wallet in the draw right now: [wallet, whole $FLYAI] sorted by wallet, and the total. */
  async function entrants(): Promise<{ list: [string, string][]; total: bigint }> {
    const out = await excluded();
    const known = (await getState<Record<string, boolean>>(CONTRACTS)) ?? {};
    const all = (await pg.all<{ address: string }>("select address from mine.gta_holders order by address")).map((r) => r.address)
      .filter((a) => !out.has(a));
    const held = await chain.holdings(all);
    const list: [string, string][] = [];
    let total = 0n, learned = false;
    for (let i = 0; i < all.length; i++) {
      if (held[i] < cfg.minHold) continue;
      if (known[all[i]] === undefined) { known[all[i]] = await chain.isContract(all[i]); learned = true; }
      if (known[all[i]]) continue;
      const n = held[i] / E18;
      list.push([all[i], n.toString()]);
      total += n;
    }
    if (learned) await setState(CONTRACTS, known);
    return { list, total };
  }

  async function potUsd(): Promise<{ total: number; by: Record<string, number> }> {
    const rows = await pg.all<{ source: string; usd: number }>("select source, sum(usd)::float8 as usd from mine.gta_fees group by source");
    const by: Record<string, number> = { pons: 0, desk: 0, wallet: 0 };
    for (const r of rows) by[r.source] = Number(r.usd);
    return { total: Object.values(by).reduce((a, b) => a + b, 0), by };
  }

  /** Open the next round once the pot covers it; draw a waiting round once its seed block is mined. */
  async function drawStep(head: number) {
    const waiting = await pg.one<Draw>("select * from mine.gta_draws where status = 'waiting' order by round, attempt limit 1");
    if (waiting) {
      if (head < Number(waiting.seed_block)) return;
      const hash = await chain.blockHash(Number(waiting.seed_block));
      if (!hash) return;
      const winner = pick(hash, waiting.round, waiting.attempt, waiting.entrants_list);
      const weight = waiting.entrants_list.find(([w]) => w === winner)?.[1] ?? null;
      await pg.run(`update mine.gta_draws set status = ?, seed_hash = ?, drawn_at = now(), winner = ?, winner_weight = ?,
        updated_at = now() where round = ? and attempt = ?`, winner ? "won" : "void", hash, winner, weight, waiting.round, waiting.attempt);
      return;
    }
    // a void round is drawn again first, as its next attempt
    const redo = await pg.one<{ round: number; attempt: number; target_usd: number }>(`select round, max(attempt) as attempt,
      max(target_usd) as target_usd from mine.gta_draws group by round
      having bool_and(status = 'void') order by round limit 1`);
    let round: number, attempt: number, target: number;
    if (redo) {
      [round, attempt, target] = [redo.round, redo.attempt + 1, redo.target_usd];
    } else {
      if (Date.now() >= cfg.end) return;                 // the game is out: no new rounds
      const opened = Number((await pg.one<{ n: number }>("select count(distinct round)::int as n from mine.gta_draws"))?.n ?? 0);
      const pot = (await potUsd()).total * cfg.share;
      if (progress(pot, cfg.priceUsd, opened).funded <= opened) return;
      [round, attempt, target] = [opened + 1, 1, (opened + 1) * cfg.priceUsd];
    }
    const { list, total } = await entrants();
    await pg.run(`insert into mine.gta_draws (round, attempt, target_usd, seed_block, entrants, total_weight, entrants_list)
      values (?, ?, ?, ?, ?, ?, ?::text::jsonb) on conflict do nothing`, round, attempt, target, head + cfg.seedDelay,
      list.length, total.toString(), JSON.stringify(list));
    await setState("board", { entrants: list.length, total: total.toString(), at: Date.now() });
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const t0 = Date.now(), lap = (s: string) => { if (process.env.GTA_DEBUG) console.log(`gta: ${s} ${(Date.now() - t0) / 1000} s`); };
      const head = await chain.head();
      await scanChain(head);
      lap("chain scanned");
      await scanDb();
      await drawStep(head);
      lap("draw step");
      const board = await getState<{ at: number }>("board");
      if (!board || Date.now() - board.at > 3_600_000) {    // the eligible total for the page's odds, hourly
        const { list, total } = await entrants();
        await setState("board", { entrants: list.length, total: total.toString(), at: Date.now() });
        lap(`board: ${list.length} wallets`);
      }
    } catch (err) {
      console.error(`gta: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  /** A wallet's place in the giveaway: what it holds (+ staked), whether that's enough, and its odds per draw. */
  async function standing(wallet: string) {
    const w = wallet.toLowerCase();
    const [held] = await chain.holdings([w]);
    const board = await getState<{ entrants: number; total: string }>("board");
    const out = await excluded();
    const known = (await getState<Record<string, boolean>>(CONTRACTS)) ?? {};
    const reason = out.has(w) ? "team" : held < cfg.minHold ? "below" : (known[w] ?? await chain.isContract(w)) ? "contract" : null;
    const n = held / E18;
    const total = BigInt(board?.total ?? "0") > n ? BigInt(board!.total) : n;   // they may have joined since the hourly count
    return {
      wallet: w, holding: whole(held), eligible: !reason, reason,
      short_by: held < cfg.minHold ? whole(cfg.minHold - held) : "0",
      odds_pct: !reason && total > 0n ? Math.min(100, (Number(n) / Number(total)) * 100) : 0,
    };
  }

  const drawOut = (r: Draw, team: boolean) => ({
    round: r.round, attempt: r.attempt, status: r.status, opened_at: r.opened_at, drawn_at: r.drawn_at,
    seed_block: Number(r.seed_block), seed_hash: r.seed_hash, entrants: r.entrants, total_weight: r.total_weight,
    winner: r.winner, winner_short: r.winner ? short(r.winner) : null, winner_weight: r.winner_weight, note: r.note,
    contacted: !!r.contact, ...(team ? { contact: r.contact, contact_at: r.contact_at } : {}),
  });

  async function view(wallet: string | null) {
    const { total, by } = await potUsd();
    const pot = total * cfg.share;
    const rows = await pg.all<Draw>("select * from mine.gta_draws order by round desc, attempt desc");
    const opened = new Set(rows.map((r) => r.round)).size;
    const p = progress(pot, cfg.priceUsd, opened);
    const live = rows.filter((r) => r.status !== "void");
    const board = await getState<{ entrants: number; total: string; at: number }>("board");
    return {
      price_usd: cfg.priceUsd, share: cfg.share, min_hold: whole(cfg.minHold), start: cfg.start, pons_start: cfg.ponsStart, end: cfg.end,
      fees_usd: { ...by, total }, pot_usd: pot,
      giveaway: opened + (Date.now() < cfg.end ? 1 : 0), copies_funded: p.funded,
      progress_usd: p.progress_usd, progress_pct: p.pct, left_usd: p.left_usd,
      current: live[0] ? drawOut(live[0], false) : null,
      past: live.slice(1).map((r) => drawOut(r, false)),
      draws: rows.map((r) => drawOut(r, false)),
      board: board ? { entrants: board.entrants, total: board.total, at: board.at } : null,
      me: wallet && ADDRESS.test(wallet.toLowerCase()) ? await standing(wallet) : null,
      explorer: d.explorer,
      updated_at: Date.now(),
    };
  }

  async function isAdmin(req: IncomingMessage): Promise<boolean> {
    if (d.isAdminToken(req)) return true;
    if (!admins.size || !req.headers["x-flyai-session"]) return false;
    try { return admins.has((await d.sessionWallet(req)).toLowerCase()); } catch { return false; }
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/gta") {
      d.send(res, 200, await view(url.searchParams.get("wallet")));
      return true;
    }
    if (req.method === "POST" && p === "/api/gta/contact") {
      const me = (await d.sessionWallet(req)).toLowerCase();
      const contact = String((await d.readJson(req))?.contact ?? "").trim();
      if (contact.length < 3 || contact.length > 120) throw new HttpError(400, "contact: 3-120 characters (email, Discord or X)");
      const n = await pg.run(`update mine.gta_draws set contact = ?, contact_at = now(), updated_at = now()
        where winner = ? and status = 'won'`, contact, me);
      if (!n) throw new HttpError(403, "only a winner whose copy isn't sent yet can leave a contact");
      d.send(res, 200, { ok: true });
      return true;
    }
    if (p === "/api/admin/gta") {
      if (!(await isAdmin(req))) throw new HttpError(403, "giveaway admins only");
      if (req.method === "GET") {
        const rows = await pg.all<Draw>("select * from mine.gta_draws order by round desc, attempt desc");
        d.send(res, 200, { draws: rows.map((r) => drawOut(r, true)) });
        return true;
      }
      if (req.method === "POST") {
        const b = await d.readJson(req);
        const status = String(b?.status ?? "");
        if (!["sent", "void"].includes(status)) throw new HttpError(400, "status: sent or void");
        const note = b?.note === undefined ? null : String(b.note).trim().slice(0, 200) || null;
        const n = await pg.run(`update mine.gta_draws set status = ?, note = coalesce(?, note), updated_at = now()
          where round = ? and status = 'won'`, status, note, Number(b?.round));
        if (!n) throw new HttpError(404, "no drawn round waiting for a check with that number");
        d.send(res, 200, { ok: true });
        return true;
      }
    }
    return false;
  }

  function start(everyMs = Number(process.env.GTA_TICK_MS ?? 600_000)) {
    setTimeout(tick, 30_000).unref();
    setInterval(tick, everyMs).unref();
  }

  return { route, start, tick, view };
}

/** Robinhood Chain for the giveaway: logs from the public RPC (QuickNode caps a log query's span), the rest as usual. */
export function robinhoodChain(rpcUrl: string, staking: string | null): Chain {
  const PUBLIC = "https://rpc.mainnet.chain.robinhood.com";
  const mc = multicall(rpcUrl);
  const hex = (n: number) => `0x${n.toString(16)}`;
  return {
    head: async () => parseInt(await rpc(rpcUrl, "eth_blockNumber", []), 16),
    blockTime: async (n) => parseInt((await rpc(rpcUrl, "eth_getBlockByNumber", [hex(n), false])).timestamp, 16),
    blockHash: async (n) => (await rpc(rpcUrl, "eth_getBlockByNumber", [hex(n), false]))?.hash ?? null,
    logs: (q) => rpc(PUBLIC, "eth_getLogs", [{ address: q.address, topics: q.topics, fromBlock: hex(q.from), toBlock: hex(q.to) }]),
    holdings: async (wallets) => {
      const calls = wallets.flatMap((w) => [
        { to: FLYAI, data: `${selector("balanceOf(address)")}${word(BigInt(w))}` },
        ...(staking ? [{ to: staking, data: `${selector("stakedOf(address)")}${word(BigInt(w))}` }] : []),
      ]);
      const rets = await mc.batch(calls);
      const per = staking ? 2 : 1;
      return wallets.map((_, i) => rets.slice(i * per, i * per + per)
        .reduce((s, r) => s + (r && r.length >= 66 ? BigInt(r.slice(0, 66)) : 0n), 0n));
    },
    // an EIP-7702 account (code 0xef0100 + delegate) is still a person's wallet, not a contract
    isContract: async (w) => { const code = (await rpc(rpcUrl, "eth_getCode", [w, "latest"])) as string; return code.length > 2 && !code.toLowerCase().startsWith("0xef0100"); },
    decimals: async (t) => Number(BigInt((await mc.call(t, selector("decimals()"))).slice(0, 66))),
  };
}

/** USD prices: GeckoTerminal, then DexScreener (Robinhood Chain); ETH from Coinbase. Cached 5 minutes. */
export function marketPrices(): Prices {
  const cache = new Map<string, { at: number; usd: number | null }>();
  const get = (u: string) => fetch(u, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } }).then((r) => r.json());
  async function read(t: string): Promise<number | null> {
    if (/^0x0{40}$/.test(t)) {
      const j = await get("https://api.coinbase.com/v2/prices/ETH-USD/spot").catch(() => null);
      return Number(j?.data?.amount) || null;
    }
    const g = await get(`https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/${t}`).catch(() => null);
    const a = Number(g?.data?.attributes?.token_prices?.[t]);
    if (a > 0) return a;
    const pairs = await get(`https://api.dexscreener.com/tokens/v1/robinhood/${t}`).catch(() => null);
    const best = (Array.isArray(pairs) ? pairs : []).filter((x: any) => x.baseToken?.address?.toLowerCase() === t && x.priceUsd)
      .sort((x: any, y: any) => (y.liquidity?.usd ?? 0) - (x.liquidity?.usd ?? 0))[0];
    return Number(best?.priceUsd) || null;
  }
  return {
    async usd(token) {
      const t = token.toLowerCase();
      const c = cache.get(t);
      if (c && Date.now() - c.at < 300_000) return c.usd;
      const usd = await read(t);
      cache.set(t, { at: Date.now(), usd });
      return usd;
    },
  };
}
