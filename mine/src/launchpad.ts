/**
 * Fly Launchpad (flytrade/LAUNCHPAD-PLAN.md, 2026-10-24): indexes the FlyLaunchpad contract on Robinhood Chain for the
 * /launch page. Launched / Trade / SoldOut / Graduated events and the launched tokens' Transfer logs go into the
 * mine.launch_* tables (flybook/supabase/migrations/20261024120000_mine_launchpad.sql); the page reads them here.
 *
 *   GET /api/launchpad?tab=new|top|graduated&limit=   the launches (and the launchpad's settings, read on chain)
 *   GET /api/launchpad/token/<address>                one launch: curve, rules, trades, holders, chart, bundle flag
 *   GET /api/launchpad/creator/<address>              a creator's launches and what it can claim (read on chain)
 *
 * Fees (on chain): 1% a trade, 0.7 creator / 0.2 dev / 0.1 the activated flies, plus each launch's own creator tax
 * (0-2%, all to the creator); nothing is burned.
 *
 * Fly DEX (2026-10-30, the /dex page): the same tokens listed with live numbers. A graduated token trades in its
 * TOKEN/FLYAI GIGA pool, so the pools' Swap logs go into mine.launch_swaps and the price follows the pool times FLYAI.
 *   GET /api/launchpad/markets?sort=trending|new|volume|mcap|gainers&state=all|curve|graduated&q=&limit=
 *
 * Off until LAUNCHPAD_ADDRESS is set. Logs come from the public RPC (rule: RPC cost), one tick every LAUNCHPAD_TICK_MS.
 * Nothing here signs or sends: graduating and buying back is the keeper's (flytrade/desk/launchkeeper.py).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Pg } from "./pg.ts";

export type Log = { blockNumber: string; transactionHash: string; logIndex: string; topics: string[]; data: string; address?: string };
/** What the indexer reads from the chain (a fake in src/launchpadtest.ts). */
export type LpChain = {
  head(): Promise<number>;
  blockTime(n: number): Promise<number>;                    // seconds
  logs(q: { address: string | string[]; topics: (string | string[] | null)[]; from: number; to: number }): Promise<Log[]>;
  call(to: string, data: string): Promise<string>;          // eth_call result hex
  txFrom(hash: string): Promise<string>;                    // who sent a transaction
};

const ADDRESS = /^0x[0-9a-f]{40}$/;
const topicOf = (sig: string) => `0x${Buffer.from(keccak_256(Buffer.from(sig))).toString("hex")}`;
const selector = (sig: string) => topicOf(sig).slice(0, 10);
const RULES = "(uint128,uint128,uint16,uint16,uint16,uint16,uint16,uint32,uint32,uint32)";
export const TOPICS = {
  launched: topicOf(`Launched(address,address,address,string,string,string,uint256,uint256,${RULES})`),
  trade: topicOf("Trade(address,address,bool,uint256,uint256,uint256,uint256,uint256,uint256)"),
  soldOut: topicOf("SoldOut(address,uint256)"),
  graduated: topicOf("Graduated(address,address,uint256,uint256,uint256,uint256)"),
  transfer: topicOf("Transfer(address,address,uint256)"),
  swap: topicOf("Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128)"),   // GIGA's pools (PancakeSwap v3)
};
const CURVE_TOKENS = 800_000_000n * 10n ** 18n;
const SUPPLY = 1_000_000_000;
const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
const POOL_FEE = 10_000;                                    // a graduated pool's tier: 1%
const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";

// ---- ABI words -----------------------------------------------------------------------------------------------------
const words = (hex: string) => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return (i: number) => h.slice(i * 64, i * 64 + 64);
};
const asAddr = (w: string) => `0x${w.replace(/^0x/, "").slice(24)}`.toLowerCase();   // a data word or a topic
const asInt = (w: string) => BigInt(`0x${w || "0"}`);
const asSigned = (w: string) => BigInt.asIntN(256, asInt(w));
function asString(hex: string, offsetWord: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const at = Number(asInt(offsetWord)) * 2;
  const len = Number(BigInt(`0x${h.slice(at, at + 64)}`));
  return Buffer.from(h.slice(at + 64, at + 64 + len * 2), "hex").toString("utf8");
}
const word = (v: bigint | string) => (typeof v === "string" ? v.toLowerCase().replace(/^0x/, "").padStart(64, "0") : v.toString(16).padStart(64, "0"));

export type Rules = { x0: string; y0: string; feeBps: number; gradFeeBps: number; snipeBps: number; maxWalletBps: number;
  maxDevBps: number; countdown: number; snipeSecs: number; limitSecs: number; creatorTaxBps?: number };
function rulesAt(w: (i: number) => string, i: number): Rules {
  return { x0: asInt(w(i)).toString(), y0: asInt(w(i + 1)).toString(), feeBps: Number(asInt(w(i + 2))), gradFeeBps: Number(asInt(w(i + 3))),
    snipeBps: Number(asInt(w(i + 4))), maxWalletBps: Number(asInt(w(i + 5))), maxDevBps: Number(asInt(w(i + 6))),
    countdown: Number(asInt(w(i + 7))), snipeSecs: Number(asInt(w(i + 8))), limitSecs: Number(asInt(w(i + 9))) };
}

/** The curve's price in USD per token: x / y (USDG 6 decimals, the token 18). */
export const priceOf = (x: bigint, y: bigint) => (y > 0n ? (Number(x) / 1e6) / (Number(y) / 1e18) : 0);
/** USDG the curve raises when it sells out: x_end - x0, x_end = x0 * y0 / (y0 - 800M). */
export const targetOf = (r: Rules) => {
  const x0 = BigInt(r.x0), y0 = BigInt(r.y0);
  return (x0 * y0 + (y0 - CURVE_TOKENS) - 1n) / (y0 - CURVE_TOKENS) - x0;
};
/** FLYAI per token from a pool's sqrtPriceX96 (both sides 18 decimals; the lower address is token0). */
export const poolPriceFlyai = (sqrtX96: bigint, token: string) => {
  const s = Number(sqrtX96) / 2 ** 96;
  const oneInZero = s * s;                                  // token1 per token0
  return token.toLowerCase() < FLYAI ? oneInZero : oneInZero > 0 ? 1 / oneInZero : 0;
};
/** The trending sort: wallets trading count first, so one wallet churning volume doesn't get far. */
export const trendScore = (traders: number, volumeUsd: number) => traders * Math.log1p(Math.max(0, volumeUsd));

type TokenRow = {
  token: string; creator: string; pool: string; name: string; symbol: string; uri: string; created_block: string;
  created_at: Date; open_at: Date; rules: Rules; state: string; x: string; y: string; price_usd: number; trades: number;
  volume_usdg: string; sold_out_at: Date | null; graduated_at: Date | null; position_id: string | null;
  pool_flyai: string | null; pool_tokens: string | null; holders?: number;
  price_flyai: number | null; pool_trades: number; pool_volume_usd: number;
};
type MarketRow = TokenRow & { volume_24h: number; traders_24h: number; buys_24h: number; sells_24h: number; price_before: number | null; price_first: number | null };

export function createLaunchpad(d: {
  pg: Pg; chain: LpChain; address: string; fromBlock?: number;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  explorer: string;
  flyaiUsd?: () => Promise<number | null>;                  // the FLYAI price; the last good one is kept when it fails
  now?: () => Date;
}) {
  const { pg, chain, HttpError } = d;
  const lp = d.address.toLowerCase();
  const getState = async <T>(key: string): Promise<T | undefined> =>
    (await pg.one<{ value: T }>("select value from mine.launch_state where key = ?", key))?.value;
  const setState = (key: string, value: unknown) => pg.run(`insert into mine.launch_state (key, value) values (?, ?::text::jsonb)
    on conflict (key) do update set value = excluded.value`, key, JSON.stringify(value));

  const times = new Map<number, number>();
  const timeOf = async (block: number) => {
    if (!times.has(block)) {
      if (times.size > 5000) times.clear();
      times.set(block, await chain.blockTime(block));
    }
    return new Date(times.get(block)! * 1000);
  };

  /** Logs in chunks the RPC takes: narrower on a refusal, wider after a quiet chunk (as gta.ts). */
  async function scan(address: string | string[], topics: (string | string[] | null)[], from: number, to: number) {
    const out: Log[] = [];
    let span = 1_000_000;
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
      out.push(...got);
      a = b + 1;
      if (got.length < 2_000) span = Math.min(1_000_000, span * 4);
    }
    const n = (h: string) => parseInt(h, 16);
    return out.sort((p, q) => n(p.blockNumber) - n(q.blockNumber) || n(p.logIndex) - n(q.logIndex));
  }

  async function onLaunched(l: Log) {
    const w = words(l.data);
    const token = asAddr(l.topics[1]);
    const block = parseInt(l.blockNumber, 16);
    // data: pool, name, symbol, uri (offsets), openAt, creatorTaxBps, then the launch's rules (10 words)
    const rules = { ...rulesAt(w, 6), creatorTaxBps: Number(asInt(w(5))) };
    await pg.run(`insert into mine.launch_tokens (token, creator, pool, name, symbol, uri, created_block, created_at, open_at,
        rules, x, y, price_usd) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::text::jsonb, ?, ?, ?) on conflict do nothing`,
      token, asAddr(l.topics[2]), asAddr(w(0)), asString(l.data, w(1)).slice(0, 64), asString(l.data, w(2)).slice(0, 16),
      asString(l.data, w(3)).slice(0, 300), block, (await timeOf(block)).toISOString(),
      new Date(Number(asInt(w(4))) * 1000).toISOString(), JSON.stringify(rules), rules.x0, rules.y0,
      priceOf(BigInt(rules.x0), BigInt(rules.y0)));
  }

  async function onTrade(l: Log) {
    const w = words(l.data);
    const token = asAddr(l.topics[1]);
    const block = parseInt(l.blockNumber, 16);
    const x = asInt(w(5)), y = asInt(w(6));
    const price = priceOf(x, y);
    const id = `${l.transactionHash}:${parseInt(l.logIndex, 16)}`;
    const n = await pg.run(`insert into mine.launch_trades (id, token, trader, buy, usdg, tokens, fee, tax, price_usd, block, at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict do nothing`,
      id, token, asAddr(l.topics[2]), asInt(w(0)) === 1n, asInt(w(1)).toString(), asInt(w(2)).toString(), asInt(w(3)).toString(),
      asInt(w(4)).toString(), price, block, (await timeOf(block)).toISOString());
    if (n) {
      await pg.run(`update mine.launch_tokens set x = ?, y = ?, price_usd = ?, trades = trades + 1,
          volume_usdg = (volume_usdg::numeric + ?::numeric)::text where token = ?`, x.toString(), y.toString(), price, asInt(w(1)).toString(), token);
    }
  }

  async function onSoldOut(l: Log) {
    const block = parseInt(l.blockNumber, 16);
    await pg.run("update mine.launch_tokens set state = 'sold_out', sold_out_at = ? where token = ? and state = 'curve'",
      (await timeOf(block)).toISOString(), asAddr(l.topics[1]));
  }

  async function onGraduated(l: Log) {
    const w = words(l.data);
    const block = parseInt(l.blockNumber, 16);
    const flyai = asInt(w(2)), tokens = asInt(w(3));
    await pg.run(`update mine.launch_tokens set state = 'graduated', graduated_at = ?, position_id = ?, pool_flyai = ?, pool_tokens = ?,
        price_flyai = ? where token = ?`, (await timeOf(block)).toISOString(), asInt(w(1)).toString(), flyai.toString(), tokens.toString(),
      tokens > 0n ? Number(flyai) / Number(tokens) : null, asAddr(l.topics[1]));
  }

  // ---- after graduation: the pools --------------------------------------------------------------------------------
  let flyaiCache: { at: number; usd: number } | null = null;
  /** The FLYAI price now: a minute's cache, then the feed, then the last good one saved. Null only before any price. */
  async function flyaiNow(): Promise<number | null> {
    if (flyaiCache && Date.now() - flyaiCache.at < 60_000) return flyaiCache.usd;
    const fresh = await (d.flyaiUsd?.() ?? Promise.resolve(null)).catch(() => null);
    if (fresh && fresh > 0) {
      flyaiCache = { at: Date.now(), usd: fresh };
      await setState("flyai_usd", { usd: fresh }).catch(() => {});
      return fresh;
    }
    return (await getState<{ usd: number }>("flyai_usd").catch(() => undefined))?.usd ?? null;
  }

  async function onPoolSwap(l: Log, token: string, flyUsd: number): Promise<boolean> {
    const sender = asAddr(l.topics[1]);
    if (sender === lp) return false;                         // the graduation's own price fix, not a trade
    const id = `${l.transactionHash}:${parseInt(l.logIndex, 16)}`;
    if (await pg.one("select 1 as x from mine.launch_swaps where id = ?", id)) return false;
    const w = words(l.data);
    const zero = token < FLYAI;
    const a0 = asSigned(w(0)), a1 = asSigned(w(1));
    const tokenDelta = zero ? a0 : a1, flyaiDelta = zero ? a1 : a0;   // what went INTO the pool
    const abs = (v: bigint) => (v < 0n ? -v : v);
    const priceFlyai = poolPriceFlyai(asInt(w(2)), token);
    const price = priceFlyai * flyUsd;
    const usd = (Number(abs(flyaiDelta)) / 1e18) * flyUsd;
    const block = parseInt(l.blockNumber, 16);
    const n = await pg.run(`insert into mine.launch_swaps (id, token, trader, buy, tokens, flyai, usd, price_usd, block, at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict do nothing`,
      id, token, (await chain.txFrom(l.transactionHash)).toLowerCase(), tokenDelta < 0n, abs(tokenDelta).toString(),
      abs(flyaiDelta).toString(), usd, price, block, (await timeOf(block)).toISOString());
    if (!n) return false;
    await pg.run(`update mine.launch_tokens set price_flyai = ?, price_usd = ?, pool_trades = pool_trades + 1,
        pool_volume_usd = pool_volume_usd + ? where token = ?`, priceFlyai, price, usd, token);
    return true;
  }

  /** What a pool holds, read only when it traded: each swap would drift from it (fees, collects). */
  async function refreshPool(token: string, pool: string) {
    const balance = (t: string) => chain.call(t, `${selector("balanceOf(address)")}${word(pool)}`).then((r) => asInt(words(r)(0)).toString());
    await pg.run("update mine.launch_tokens set pool_flyai = ?, pool_tokens = ? where token = ?", await balance(FLYAI), await balance(token), token);
  }

  /** The graduated pools' swaps, on their own cursor: no FLYAI price yet just waits for one, the launches carry on. */
  async function tickPools(from: number, head: number) {
    const cur = (await getState<{ block: number }>("pool_cursor"))?.block ?? from;
    if (cur > head) return;
    const rows = await pg.all<{ token: string; pool: string }>("select token, pool from mine.launch_tokens where state = 'graduated'");
    if (rows.length) {
      const flyUsd = await flyaiNow();
      if (!flyUsd) return;
      const byPool = new Map(rows.map((r) => [r.pool, r.token]));
      const touched = new Set<string>();
      for (let i = 0; i < rows.length; i += 50) {
        const logs = await scan(rows.slice(i, i + 50).map((r) => r.pool), [TOPICS.swap], cur, head);
        for (const l of logs) {
          const token = byPool.get((l.address ?? "").toLowerCase());
          if (token && await onPoolSwap(l, token, flyUsd)) touched.add(token);
        }
      }
      for (const t of touched) await refreshPool(t, rows.find((r) => r.token === t)!.pool);
    }
    await setState("pool_cursor", { block: head + 1 });
  }

  async function onTransfers(logs: Log[]) {
    const delta = new Map<string, bigint>();
    const add = (token: string, wallet: string, v: bigint) => {
      if (wallet === ZERO) return;
      const k = `${token}|${wallet}`;
      delta.set(k, (delta.get(k) ?? 0n) + v);
    };
    for (const l of logs) {
      if (l.topics.length !== 3 || !l.address) continue;
      const token = l.address.toLowerCase();
      const v = asInt(words(l.data)(0));
      add(token, asAddr(l.topics[1]), -v);
      add(token, asAddr(l.topics[2]), v);
    }
    for (const [k, v] of delta) {
      if (!v) continue;
      const [token, wallet] = k.split("|");
      await pg.run(`insert into mine.launch_holders (token, wallet, balance) values (?, ?, ?::numeric)
          on conflict (token, wallet) do update set balance = mine.launch_holders.balance + excluded.balance`, token, wallet, v.toString());
    }
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const head = await chain.head();
      const cur = (await getState<{ block: number }>("cursor")) ?? { block: d.fromBlock ?? Math.max(0, head - 50_000) };
      if (cur.block > head) { await tickPools(cur.block, head); return; }   // the pools may still be waiting for a price
      const events = await scan(lp, [[TOPICS.launched, TOPICS.trade, TOPICS.soldOut, TOPICS.graduated]], cur.block, head);
      for (const l of events) {
        const t = l.topics[0];
        if (t === TOPICS.launched) await onLaunched(l);
        else if (t === TOPICS.trade) await onTrade(l);
        else if (t === TOPICS.soldOut) await onSoldOut(l);
        else if (t === TOPICS.graduated) await onGraduated(l);
      }
      const tokens = (await pg.all<{ token: string }>("select token from mine.launch_tokens")).map((r) => r.token);
      for (let i = 0; i < tokens.length; i += 50) {
        await onTransfers(await scan(tokens.slice(i, i + 50), [TOPICS.transfer], cur.block, head));
      }
      await setState("cursor", { block: head + 1 });
      await tickPools(cur.block, head);
    } catch (err) {
      console.error(`launchpad: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  // ---- views -------------------------------------------------------------------------------------------------------
  const notHolders = (r: TokenRow) => [lp, r.pool, DEAD, ZERO];

  /** A graduated token's price moves with FLYAI even with no swap in its pool. */
  const livePrice = (r: TokenRow, flyUsd: number | null) =>
    (r.state === "graduated" && r.price_flyai && flyUsd ? r.price_flyai * flyUsd : r.price_usd);
  function liquidityOf(r: TokenRow, price: number, flyUsd: number | null) {
    if (r.state !== "graduated") return Number(BigInt(r.x) - BigInt(r.rules.x0)) / 1e6;   // the USDG in the curve
    if (!flyUsd) return null;
    return (Number(r.pool_flyai ?? 0) / 1e18) * flyUsd + (Number(r.pool_tokens ?? 0) / 1e18) * price;
  }

  function summary(r: TokenRow, flyUsd: number | null = null) {
    const x = BigInt(r.x), x0 = BigInt(r.rules.x0);
    const target = targetOf(r.rules);
    const raised = x - x0;
    const price = livePrice(r, flyUsd);
    return {
      token: r.token, name: r.name, symbol: r.symbol, uri: r.uri, creator: r.creator, pool: r.pool, state: r.state,
      creator_tax_bps: r.rules.creatorTaxBps ?? 0,
      price_usd: price, mcap_usd: price * SUPPLY, liquidity_usd: liquidityOf(r, price, flyUsd),
      raised_usd: Number(raised) / 1e6, target_usd: Number(target) / 1e6,
      progress_pct: r.state === "curve" ? Math.min(100, (Number(raised) / Number(target)) * 100) : 100,
      trade_count: r.trades + r.pool_trades, volume_usd: Number(r.volume_usdg) / 1e6 + r.pool_volume_usd, holders: r.holders ?? null,
      created_at: r.created_at, open_at: r.open_at, sold_out_at: r.sold_out_at, graduated_at: r.graduated_at,
    };
  }

  async function holdersCount(rows: TokenRow[]) {
    if (!rows.length) return;
    const counts = await pg.all<{ token: string; n: number }>(`select h.token, count(*)::int as n from mine.launch_holders h
      join mine.launch_tokens t on t.token = h.token
      where h.token = any(?::text[]) and h.balance > 0 and h.wallet <> all(?::text[]) and h.wallet <> t.pool group by h.token`,
      `{${rows.map((r) => r.token).join(",")}}`, `{${[lp, DEAD, ZERO].join(",")}}`);
    const by = new Map(counts.map((c) => [c.token, c.n]));
    for (const r of rows) r.holders = by.get(r.token) ?? 0;
  }

  let settings: { at: number; value: unknown } | null = null;
  async function chainSettings() {
    if (settings && Date.now() - settings.at < 60_000) return settings.value;
    const u = async (sig: string) => asInt(words(await chain.call(lp, selector(sig)))(0));
    const dw = words(await chain.call(lp, selector("defaults()")));
    const value = {
      create_fee_wei: (await u("createFee()")).toString(),
      paused: (await u("paused()")) === 1n,
      flyai_inventory: (await u("flyaiInventory()")).toString(),
      max_flyai_per_grad: (await u("maxFlyaiPerGrad()")).toString(),
      locker: asAddr(words(await chain.call(lp, selector("locker()")))(0)),
      defaults: rulesAt(dw, 0),
    };
    settings = { at: Date.now(), value };
    return value;
  }

  async function list(tab: string, limit: number) {
    const order = tab === "top" ? "volume_usdg::numeric desc" : tab === "graduated" ? "graduated_at desc" : "created_block desc";
    const where = tab === "graduated" ? "where state = 'graduated'" : tab === "top" ? "where state <> 'graduated'" : "";
    const rows = await pg.all<TokenRow>(`select * from mine.launch_tokens ${where} order by ${order} limit ?`, limit);
    await holdersCount(rows);
    const flyUsd = await flyaiNow();
    return {
      live: true, address: lp, explorer: d.explorer, settings: await chainSettings().catch(() => null),
      totals: await totalsNow(), flyai_usd: flyUsd,
      launches: rows.map((r) => summary(r, flyUsd)),
    };
  }

  async function totalsNow() {
    const totals = await pg.one<{ n: number; graduated: number; volume: string; pool: number }>(`select count(*)::int as n,
      count(*) filter (where state = 'graduated')::int as graduated, coalesce(sum(volume_usdg::numeric), 0)::text as volume,
      coalesce(sum(pool_volume_usd), 0)::float8 as pool from mine.launch_tokens`);
    return { launches: totals?.n ?? 0, graduated: totals?.graduated ?? 0, volume_usd: Number(totals?.volume ?? 0) / 1e6 + (totals?.pool ?? 0) };
  }

  /** The /dex listing: every launch, on the curve or graduated, with its last 24 hours. Ranked here (the live price lives here). */
  async function markets(o: { sort?: string; state?: string; q?: string; limit?: number } = {}) {
    const at = (d.now?.() ?? new Date()).toISOString();
    const state = o.state === "curve" ? "t.state <> 'graduated'" : o.state === "graduated" ? "t.state = 'graduated'" : "true";
    const q = (o.q ?? "").trim().toLowerCase().slice(0, 64);
    const args = [at, at, at, at];
    let search = "true";
    if (q) {
      search = "(t.token = ? or lower(t.name) like ? or lower(t.symbol) like ?)";
      const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      args.push(q, like, like);
    }
    const rows = await pg.all<MarketRow>(`select t.*, coalesce(a.volume, 0)::float8 as volume_24h, coalesce(a.traders, 0)::int as traders_24h,
        coalesce(a.buys, 0)::int as buys_24h, coalesce(a.sells, 0)::int as sells_24h,
        (select f.price_usd from mine.launch_fills f where f.token = t.token and f.at <= ?::timestamptz - interval '24 hours' order by f.at desc limit 1) as price_before,
        (select f.price_usd from mine.launch_fills f where f.token = t.token and f.at > ?::timestamptz - interval '24 hours' order by f.at limit 1) as price_first
      from mine.launch_tokens t left join (
        select token, sum(usd) as volume, count(distinct trader) as traders, count(*) filter (where buy) as buys, count(*) filter (where not buy) as sells
          from mine.launch_fills where at > ?::timestamptz - interval '24 hours' and at <= ?::timestamptz group by token
      ) a on a.token = t.token
      where ${state} and ${search} order by t.created_block desc limit 500`, ...args);
    const flyUsd = await flyaiNow();
    const listed = rows.map((r) => {
      const s = summary(r, flyUsd);
      const ref = r.price_before ?? r.price_first;
      return {
        row: r,
        ...s,
        volume_24h: r.volume_24h, traders_24h: r.traders_24h, buys_24h: r.buys_24h, sells_24h: r.sells_24h,
        change_24h: ref ? ((s.price_usd - ref) / ref) * 100 : null,
        score: trendScore(r.traders_24h, r.volume_24h),
      };
    });
    const by: Record<string, (a: (typeof listed)[number], b: (typeof listed)[number]) => number> = {
      trending: (a, b) => b.score - a.score || b.volume_24h - a.volume_24h,
      new: () => 0,                                          // the query's order
      volume: (a, b) => b.volume_24h - a.volume_24h,
      mcap: (a, b) => b.mcap_usd - a.mcap_usd,
      gainers: (a, b) => (b.change_24h ?? -Infinity) - (a.change_24h ?? -Infinity),
    };
    listed.sort(by[o.sort ?? ""] ?? by.trending);
    const page = listed.slice(0, Math.max(1, Math.min(100, o.limit ?? 50)));
    await holdersCount(page.map((p) => p.row));
    return {
      live: true, address: lp, explorer: d.explorer, flyai: FLYAI, flyai_usd: flyUsd, pool_fee: POOL_FEE,
      settings: await chainSettings().catch(() => null), totals: await totalsNow(),
      markets: page.map(({ row, ...p }) => ({ ...p, holders: row.holders ?? 0 })),
    };
  }

  /** Wallets whose first buy shared a block with at least two other wallets' first buys, in the first minute. */
  function bundles(trades: { trader: string; buy: boolean; block: string; at: Date }[], openAt: Date) {
    const first = new Map<string, number>();
    for (const t of [...trades].sort((a, b) => Number(a.block) - Number(b.block))) {
      if (!t.buy || first.has(t.trader) || new Date(t.at).getTime() - openAt.getTime() > 60_000) continue;
      first.set(t.trader, Number(t.block));
    }
    const byBlock = new Map<number, string[]>();
    for (const [w, b] of first) byBlock.set(b, [...(byBlock.get(b) ?? []), w]);
    return [...byBlock].filter(([, ws]) => ws.length >= 3).map(([block, wallets]) => ({ block, wallets }));
  }

  async function token(addr: string) {
    const r = await pg.one<TokenRow>("select * from mine.launch_tokens where token = ?", addr);
    if (!r) throw new HttpError(404, "no such launch");
    await holdersCount([r]);
    const trades = await pg.all<{ id: string; trader: string; buy: boolean; usd: number; tokens: string; venue: string;
      price_usd: number; block: string; at: Date }>("select * from mine.launch_fills where token = ? order by block desc, id desc limit 1000", addr);
    const skip = notHolders(r);
    const flyUsd = await flyaiNow();
    const top = await pg.all<{ wallet: string; balance: string }>(`select wallet, balance::text from mine.launch_holders
      where token = ? and balance > 0 order by balance desc limit 60`, addr);
    return {
      ...summary(r, flyUsd), rules: r.rules, explorer: d.explorer, launchpad: lp, flyai: FLYAI, flyai_usd: flyUsd, pool_fee: POOL_FEE,
      paused: ((await chainSettings().catch(() => null)) as { paused?: boolean } | null)?.paused ?? null,
      position_id: r.position_id, pool_flyai: r.pool_flyai, pool_tokens: r.pool_tokens,
      curve: { x: r.x, y: r.y },
      trades: trades.slice(0, 200).map((t) => ({ ...t, block: Number(t.block) })),
      chart: [...trades].reverse().map((t) => [new Date(t.at).getTime(), t.price_usd]),
      holders_top: top.filter((h) => !skip.includes(h.wallet)).slice(0, 50)
        .map((h) => ({ wallet: h.wallet, tokens: h.balance, pct: (Number(h.balance) / 1e18 / SUPPLY) * 100 })),
      curve_tokens: top.find((h) => h.wallet === lp)?.balance ?? "0",
      bundles: bundles(trades.filter((t) => t.venue === "curve"), new Date(r.open_at)),
    };
  }

  async function creator(addr: string) {
    const rows = await pg.all<TokenRow>("select * from mine.launch_tokens where creator = ? order by created_block desc", addr);
    await holdersCount(rows);
    const flyUsd = await flyaiNow();
    const owed = asInt(words(await chain.call(lp, `${selector("creatorOwed(address)")}${word(addr)}`))(0));
    const locker = ((await chainSettings()) as { locker: string }).locker;
    const pool: Record<string, string> = {};
    if (locker && locker !== ZERO) {
      for (const t of [FLYAI, ...rows.filter((r) => r.state === "graduated").map((r) => r.token)]) {
        const v = asInt(words(await chain.call(locker, `${selector("owed(address,address)")}${word(addr)}${word(t)}`))(0));
        if (v > 0n) pool[t] = v.toString();
      }
    }
    return { creator: addr, curve_fees_usdg: owed.toString(), pool_fees: pool, launches: rows.map((r) => summary(r, flyUsd)) };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET") return false;
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (p === "/api/launchpad") {
      const tab = ["new", "top", "graduated"].includes(url.searchParams.get("tab") ?? "") ? url.searchParams.get("tab")! : "new";
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 50) || 50));
      d.send(res, 200, await list(tab, limit));
      return true;
    }
    if (p === "/api/launchpad/markets") {
      const g = (k: string) => url.searchParams.get(k) ?? undefined;
      d.send(res, 200, await markets({ sort: g("sort"), state: g("state"), q: g("q"), limit: Number(g("limit") ?? 50) || 50 }));
      return true;
    }
    if ((m = /^\/api\/launchpad\/token\/(0x[0-9a-fA-F]{40})$/.exec(p))) {
      d.send(res, 200, await token(m[1].toLowerCase()));
      return true;
    }
    if ((m = /^\/api\/launchpad\/creator\/(0x[0-9a-fA-F]{40})$/.exec(p))) {
      d.send(res, 200, await creator(m[1].toLowerCase()));
      return true;
    }
    return false;
  }

  function start(everyMs = Number(process.env.LAUNCHPAD_TICK_MS ?? 20_000)) {
    setTimeout(tick, 5_000).unref();
    setInterval(tick, everyMs).unref();
  }

  return { route, start, tick, list, markets, token, creator };
}

/** Robinhood Chain for the indexer: logs from the public RPC (QuickNode caps a log query's span), the rest from rpcUrl. */
export function launchpadChain(rpc: (url: string, method: string, params: unknown[]) => Promise<any>, rpcUrl: string): LpChain {
  const PUBLIC = "https://rpc.mainnet.chain.robinhood.com";
  const hex = (n: number) => `0x${n.toString(16)}`;
  return {
    head: async () => parseInt(await rpc(rpcUrl, "eth_blockNumber", []), 16),
    blockTime: async (n) => parseInt((await rpc(rpcUrl, "eth_getBlockByNumber", [hex(n), false])).timestamp, 16),
    logs: (q) => rpc(PUBLIC, "eth_getLogs", [{ address: q.address, topics: q.topics, fromBlock: hex(q.from), toBlock: hex(q.to) }]),
    call: (to, data) => rpc(rpcUrl, "eth_call", [{ to, data }, "latest"]),
    txFrom: async (hash) => (await rpc(PUBLIC, "eth_getTransactionByHash", [hash])).from,
  };
}

export const isAddress = (a: string) => ADDRESS.test(a);
