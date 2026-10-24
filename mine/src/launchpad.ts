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
};
const CURVE_TOKENS = 800_000_000n * 10n ** 18n;
const SUPPLY = 1_000_000_000;
const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";

// ---- ABI words -----------------------------------------------------------------------------------------------------
const words = (hex: string) => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return (i: number) => h.slice(i * 64, i * 64 + 64);
};
const asAddr = (w: string) => `0x${w.replace(/^0x/, "").slice(24)}`.toLowerCase();   // a data word or a topic
const asInt = (w: string) => BigInt(`0x${w || "0"}`);
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

type TokenRow = {
  token: string; creator: string; pool: string; name: string; symbol: string; uri: string; created_block: string;
  created_at: Date; open_at: Date; rules: Rules; state: string; x: string; y: string; price_usd: number; trades: number;
  volume_usdg: string; sold_out_at: Date | null; graduated_at: Date | null; position_id: string | null;
  pool_flyai: string | null; pool_tokens: string | null; holders?: number;
};

export function createLaunchpad(d: {
  pg: Pg; chain: LpChain; address: string; fromBlock?: number;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  explorer: string;
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
    await pg.run(`update mine.launch_tokens set state = 'graduated', graduated_at = ?, position_id = ?, pool_flyai = ?, pool_tokens = ?
        where token = ?`, (await timeOf(block)).toISOString(), asInt(w(1)).toString(), asInt(w(2)).toString(), asInt(w(3)).toString(),
      asAddr(l.topics[1]));
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
      if (cur.block > head) return;
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
    } catch (err) {
      console.error(`launchpad: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  // ---- views -------------------------------------------------------------------------------------------------------
  const notHolders = (r: TokenRow) => [lp, r.pool, DEAD, ZERO];

  function summary(r: TokenRow) {
    const x = BigInt(r.x), x0 = BigInt(r.rules.x0);
    const target = targetOf(r.rules);
    const raised = x - x0;
    return {
      token: r.token, name: r.name, symbol: r.symbol, uri: r.uri, creator: r.creator, pool: r.pool, state: r.state,
      creator_tax_bps: r.rules.creatorTaxBps ?? 0,
      price_usd: r.price_usd, mcap_usd: r.price_usd * SUPPLY,
      raised_usd: Number(raised) / 1e6, target_usd: Number(target) / 1e6,
      progress_pct: r.state === "curve" ? Math.min(100, (Number(raised) / Number(target)) * 100) : 100,
      trade_count: r.trades, volume_usd: Number(r.volume_usdg) / 1e6, holders: r.holders ?? null,
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
    const totals = await pg.one<{ n: number; graduated: number; volume: string }>(`select count(*)::int as n,
      count(*) filter (where state = 'graduated')::int as graduated, coalesce(sum(volume_usdg::numeric), 0)::text as volume
      from mine.launch_tokens`);
    return {
      live: true, address: lp, explorer: d.explorer, settings: await chainSettings().catch(() => null),
      totals: { launches: totals?.n ?? 0, graduated: totals?.graduated ?? 0, volume_usd: Number(totals?.volume ?? 0) / 1e6 },
      launches: rows.map(summary),
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
    const trades = await pg.all<{ id: string; trader: string; buy: boolean; usdg: string; tokens: string; fee: string; tax: string;
      price_usd: number; block: string; at: Date }>("select * from mine.launch_trades where token = ? order by block desc, id desc limit 1000", addr);
    const skip = notHolders(r);
    const top = await pg.all<{ wallet: string; balance: string }>(`select wallet, balance::text from mine.launch_holders
      where token = ? and balance > 0 order by balance desc limit 60`, addr);
    return {
      ...summary(r), rules: r.rules, explorer: d.explorer, launchpad: lp,
      position_id: r.position_id, pool_flyai: r.pool_flyai, pool_tokens: r.pool_tokens,
      curve: { x: r.x, y: r.y },
      trades: trades.slice(0, 200).map((t) => ({ ...t, block: Number(t.block) })),
      chart: [...trades].reverse().map((t) => [new Date(t.at).getTime(), t.price_usd]),
      holders_top: top.filter((h) => !skip.includes(h.wallet)).slice(0, 50)
        .map((h) => ({ wallet: h.wallet, tokens: h.balance, pct: (Number(h.balance) / 1e18 / SUPPLY) * 100 })),
      curve_tokens: top.find((h) => h.wallet === lp)?.balance ?? "0",
      bundles: bundles(trades, new Date(r.open_at)),
    };
  }

  async function creator(addr: string) {
    const rows = await pg.all<TokenRow>("select * from mine.launch_tokens where creator = ? order by created_block desc", addr);
    await holdersCount(rows);
    const owed = asInt(words(await chain.call(lp, `${selector("creatorOwed(address)")}${word(addr)}`))(0));
    const locker = ((await chainSettings()) as { locker: string }).locker;
    const pool: Record<string, string> = {};
    if (locker && locker !== ZERO) {
      for (const t of [FLYAI, ...rows.filter((r) => r.state === "graduated").map((r) => r.token)]) {
        const v = asInt(words(await chain.call(locker, `${selector("owed(address,address)")}${word(addr)}${word(t)}`))(0));
        if (v > 0n) pool[t] = v.toString();
      }
    }
    return { creator: addr, curve_fees_usdg: owed.toString(), pool_fees: pool, launches: rows.map(summary) };
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

  return { route, start, tick, list, token, creator };
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
  };
}

export const isAddress = (a: string) => ADDRESS.test(a);
