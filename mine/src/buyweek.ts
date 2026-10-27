/**
 * The buy flow's server side (2026-10-27, the buy-flow plan steps 4 and 5):
 *
 * 1. Buy Week standing, for the "You're in" card on /start and the token page's swap box. The rules are the 10-26 post's
 *    (flytrade/marketing/x/buy-week/POST.md): net buys (bought minus sold) in the window, still held, tiers $20 / $50 /
 *    $100 / $250 -> +10 / 15 / 20 / 25%, everyone +5% at 25 buyers and +10% at 50, +5% loyalty for the 546 wallets of
 *    the 10-25 snapshot (src/data/buyweek-1026-loyal.json), one draw ticket per $20. Team wallets and fly wallets don't
 *    count. Everything shown is an ESTIMATE: the team checks the payout by hand at the snapshot (the post's rules).
 *
 *    Where the buys come from: the $FLYAI Transfer logs of the window, read in chunks like the GTA giveaway reads them
 *    (src/gta.ts keeps only holder addresses, not amounts, so the week is read here once; a tick every 10 minutes then
 *    reads only the new blocks, from the public RPC). A transaction is a buy when $FLYAI LEFT a pool in it (Pons' v4
 *    PoolManager or our GIGA pool - or Relay, whose solvers may fill a buy from their own $FLYAI) and a sell when it
 *    entered one; the buyer / seller is whoever ends the tx with more /
 *    less $FLYAI and isn't a contract - so routers, Relay's solvers and our fee leg don't count as people, whatever
 *    route the buy took. Valued at today's $FLYAI price.
 *
 *    GET /api/buyweek/<wallet>  -> the wallet's standing (cached 2 minutes), or { on: false, next } outside the week;
 *                                  ?fresh=1 (after a buy) reads the newest blocks first (at most every 20 s)
 *
 * 2. Where swap-box visitors give up: POST /api/swaplog { session, step, wallet?, route?, pay?, chain?, usd?, reason? }
 *    (one row a step; nothing personal beyond the wallet) and GET /api/admin/swaplog?days=7 -> the funnel and the
 *    top failure reasons. A session writes at most 40 rows.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import type { Pg } from "./pg.ts";
import type { Chain, Prices } from "./gta.ts";

export const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** where $FLYAI is traded: Pons' v4 PoolManager (the FLYAI/NVDA pool, our bands) and our FLYAI/USDG pool on GIGA DEX */
export const POOLS = ["0x8366a39cc670b4001a1121b8f6a443a643e40951", "0x73d20f446394a477eb9257388df5f6403143af33"];
const ADDRESS = /^0x[0-9a-f]{40}$/;
const E18 = 10n ** 18n;
const CACHE_MS = 120_000;
export const TIERS: [number, number][] = [[250, 25], [100, 20], [50, 15], [20, 10]];
export const COMMUNITY: [number, number][] = [[50, 10], [25, 5]];
export const LOYAL_PCT = 5;
export const TICKET_USD = 20;
const STEPS = ["quote", "route", "approved", "sent", "success", "failed", "gas_low", "cancelled"];
const ROUTES = ["direct", "relay", "giga", "gasless"];

export type BuyWeekConfig = { on: boolean; start: number; end: number; capFlyai: number; exclude: string[] };
export function buyWeekConfig(env: NodeJS.ProcessEnv): BuyWeekConfig {
  return {
    on: env.BUYWEEK_ON !== "0",
    start: Date.parse(env.BUYWEEK_START ?? "2026-10-26T00:00:00Z"),
    end: Date.parse(env.BUYWEEK_END ?? "2026-11-01T08:00:00Z"),       // Sunday's desk payout
    capFlyai: Number(env.BUYWEEK_CAP_FLYAI ?? 5_000_000),
    exclude: (env.BUYWEEK_EXCLUDE ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => ADDRESS.test(x)),
  };
}

export const tierOf = (usd: number) => TIERS.find(([min]) => usd >= min)?.[1] ?? 0;
export const communityOf = (buyers: number) => COMMUNITY.find(([n]) => buyers >= n)?.[1] ?? 0;

/** One tx's $FLYAI transfers -> who bought (+) or sold (-) how much: the pools' side tells which way it went. */
export function flowsOf(logs: { from: string; to: string; value: bigint }[], sources: string[] = POOLS): Map<string, bigint> {
  const net = new Map<string, bigint>();
  const add = (a: string, v: bigint) => net.set(a, (net.get(a) ?? 0n) + v);
  for (const l of logs) { add(l.from, -l.value); add(l.to, l.value); }
  const pools = sources.reduce((s, p) => s + (net.get(p) ?? 0n), 0n);
  const out = new Map<string, bigint>();
  if (pools === 0n) return out;                          // no pool in it: a transfer, a claim, a stake - not a trade
  for (const [a, v] of net) {
    if (sources.includes(a) || /^0x0{40}$/.test(a)) continue;
    if ((pools < 0n && v > 0n) || (pools > 0n && v < 0n)) out.set(a, v);
  }
  return out;
}

export function createBuyWeek(d: {
  pg: Pg; chain: Chain; prices: Prices; cfg: BuyWeekConfig;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  adminOnly: (req: IncomingMessage) => void;
  /** team wallets (src/deskchat.ts TEAM) */
  team: string[];
  loyal?: Set<string>;
  now?: () => number;
}) {
  const { pg, chain, cfg, HttpError } = d;
  const now = d.now ?? Date.now;
  const loyal = d.loyal ?? new Set((JSON.parse(readFileSync(new URL("./data/buyweek-1026-loyal.json", import.meta.url), "utf8")) as string[])
    .map((w) => w.toLowerCase()));
  const team = new Set([...d.team, ...cfg.exclude].map((w) => w.toLowerCase()));
  const getState = async <T>(key: string) => (await pg.one<{ value: T }>("select value from mine.buyweek_state where key = ?", key))?.value;
  const setState = (key: string, value: unknown) => pg.run(`insert into mine.buyweek_state (key, value) values (?, ?::text::jsonb)
    on conflict (key) do update set value = excluded.value`, key, JSON.stringify(value));

  async function blockAt(ms: number, head: number): Promise<number> {
    let lo = 0, hi = head;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await chain.blockTime(mid)) * 1000 >= ms) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  const contracts = new Map<string, boolean>();
  async function isPerson(a: string): Promise<boolean> {
    if (team.has(a)) return false;
    if (!contracts.has(a)) {
      const cached = await getState<boolean>(`code:${a}`);
      const c = cached ?? await chain.isContract(a);
      if (cached === undefined) await setState(`code:${a}`, c);
      contracts.set(a, c);
    }
    return !contracts.get(a);
  }
  async function flyWallets(): Promise<Set<string>> {
    const rows = await pg.all<{ address: string }>("select lower(address) as address from mine.vault_wallets").catch(() => []);
    return new Set(rows.map((r) => r.address));
  }

  /** Relay's contracts and solvers on Robinhood Chain (its /chains list, read once a tick; the pools alone without it). */
  async function relaySources(): Promise<string[]> {
    try {
      const r = await fetch("https://api.relay.link/chains", { signal: AbortSignal.timeout(10_000) });
      const c = ((await r.json()).chains ?? []).find((x: any) => Number(x.id) === 4663);
      const k = c?.contracts ?? {};
      return [k.erc20Router, k.approvalProxy, k.relayReceiver, ...Object.values(k.v3 ?? {}), ...Object.values(k["v3.2"] ?? {}),
        ...Object.values(c?.protocol ?? {}).map((v: any) => v?.depository), ...(c?.solverAddresses ?? [])]
        .filter((a): a is string => typeof a === "string" && ADDRESS.test(a.toLowerCase())).map((a) => a.toLowerCase());
    } catch { return []; }
  }

  /** New blocks of the window: the buys and sells in them. */
  async function scan() {
    const sources = [...POOLS, ...(await relaySources())];
    const head = await chain.head();
    const cur = (await getState<{ next?: number; start?: number; end?: number }>("cursor")) ?? {};
    const startBlock = cur.start ?? await blockAt(cfg.start, head);
    const endBlock = cur.end ?? (now() >= cfg.end ? await blockAt(cfg.end, head) : null);
    const last = endBlock ?? head;
    let from = cur.next ?? startBlock;
    const fly = await flyWallets();
    let span = 2_000_000;
    while (from <= last) {
      const to = Math.min(last, from + span - 1);
      let logs;
      try {
        logs = await chain.logs({ address: FLYAI, topics: [TRANSFER], from, to });
      } catch (err) {
        if (span <= 200 || !/range|span|limit|too many|exceed/i.test(String((err as Error).message))) throw err;
        span = Math.floor(span / 4);
        continue;
      }
      const byTx = new Map<string, { from: string; to: string; value: bigint; block: number }[]>();
      for (const l of logs) {
        const x = { from: `0x${l.topics[1].slice(-40)}`.toLowerCase(), to: `0x${l.topics[2].slice(-40)}`.toLowerCase(),
                    value: BigInt(l.data.slice(0, 66) || "0x0"), block: parseInt(l.blockNumber, 16) };
        (byTx.get(l.transactionHash) ?? byTx.set(l.transactionHash, []).get(l.transactionHash)!).push(x);
      }
      for (const [tx, ls] of byTx) {
        for (const [w, v] of flowsOf(ls, sources)) {
          if (fly.has(w) || !(await isPerson(w))) continue;
          const at = new Date((await chain.blockTime(ls[0].block)) * 1000);
          await pg.run(`insert into mine.buyweek_flows (id, wallet, delta, block, at) values (?, ?, ?, ?, ?) on conflict do nothing`,
            `${tx}:${w}`, w, v.toString(), ls[0].block, at.toISOString());
        }
      }
      from = to + 1;
      if (logs.length < 1000) span = Math.min(2_000_000, span * 2);
    }
    await setState("cursor", { next: from, start: startBlock, ...(endBlock !== null ? { end: endBlock } : {}) });
  }

  /** Every wallet's net buy, its holding now, and how many count ($20+ still held): the community bonus's buyer count. */
  async function summary(price: number) {
    const rows = await pg.all<{ wallet: string; net: string }>(
      "select wallet, sum(delta)::text as net from mine.buyweek_flows group by wallet having sum(delta) > 0");
    const held = rows.length ? await chain.holdings(rows.map((r) => r.wallet)) : [];
    let buyers = 0, total = 0;
    rows.forEach((r, i) => {
      const counted = Math.min(Number(BigInt(r.net) / E18), Number(held[i] / E18));
      if (counted * price >= TIERS[TIERS.length - 1][0]) { buyers++; total += counted; }
    });
    return { buyers, total_flyai: Math.round(total) };
  }

  let ticking = false;
  async function tick() {
    if (ticking || !cfg.on || now() < cfg.start) return;
    ticking = true;
    try {
      const cur = await getState<{ end?: number; next?: number }>("cursor");
      if (!(cur?.end !== undefined && (cur.next ?? 0) > cur.end)) await scan();
      const price = await d.prices.usd(FLYAI);
      if (price) await setState("summary", { ...(await summary(price)), price, at: now() });
    } catch (e) {
      console.error("buy week:", e instanceof Error ? e.message : e);
    } finally { ticking = false; }
  }

  const cache = new Map<string, { at: number; value: any }>();
  // ?fresh=1 right after a buy (the "You're in" card): the newest blocks read first, at most once every FRESH_MS
  const FRESH_MS = 20_000;
  let freshAt = 0;
  async function standing(wallet: string, fresh = false) {
    if (fresh && cfg.on && now() >= cfg.start && now() < cfg.end && now() - freshAt >= FRESH_MS && !ticking) {
      freshAt = now();
      ticking = true;
      try { await scan(); } catch (e) { console.error("buy week fresh:", e instanceof Error ? e.message : e); } finally { ticking = false; }
      cache.delete(wallet);
    }
    const hit = cache.get(wallet);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    const running = cfg.on && now() >= cfg.start && now() < cfg.end;
    const next = { step: "activate", hold: 200_000 };   // hold 200k + a Trader Fly to earn from the desk
    let value: any;
    if (!running) {
      value = { on: false, ended: cfg.on && now() >= cfg.end, window: { start: cfg.start, end: cfg.end }, next };
    } else {
      const [row, s, [held]] = await Promise.all([
        pg.one<{ net: string | null }>("select sum(delta)::text as net from mine.buyweek_flows where wallet = ?", wallet),
        getState<{ buyers: number; total_flyai: number; price: number }>("summary"),
        chain.holdings([wallet]),
      ]);
      const price = s?.price ?? (await d.prices.usd(FLYAI)) ?? 0;
      const net = Math.max(0, Number(BigInt(row?.net ?? "0") / E18));
      const counted = Math.min(net, Number(held / E18));
      const usd = counted * price;
      const buyers = s?.buyers ?? 0;
      const tier = tierOf(usd), community = tier ? communityOf(buyers) : 0, loyalPct = tier && loyal.has(wallet) ? LOYAL_PCT : 0;
      const pct = tier + community + loyalPct;
      // the pot cap: past it everyone is scaled down evenly (an estimate from the buyers counted so far)
      const pot = (s?.total_flyai ?? 0) * (pct / 100);
      const scale = pot > cfg.capFlyai && pot > 0 ? cfg.capFlyai / pot : 1;
      const nextTier = [...TIERS].reverse().find(([min]) => usd < min);
      const nextCommunity = [...COMMUNITY].reverse().find(([n]) => buyers < n);
      value = {
        on: true, window: { start: cfg.start, end: cfg.end }, wallet,
        net_flyai: Math.round(net), held_flyai: Math.round(Number(held / E18)), counted_flyai: Math.round(counted),
        usd: Math.round(usd * 100) / 100, price,
        tier_pct: tier, community_pct: community, loyal: loyal.has(wallet), loyal_pct: loyalPct, bonus_pct: pct,
        est_bonus_flyai: Math.round(counted * (pct / 100) * scale),
        tickets: Math.floor(usd / TICKET_USD), buyers,
        next_tier: nextTier ? { usd: nextTier[0], pct: nextTier[1], need_usd: Math.round((nextTier[0] - usd) * 100) / 100 } : null,
        next_community: nextCommunity ? { buyers: nextCommunity[0], pct: nextCommunity[1], need: nextCommunity[0] - buyers } : null,
        excluded: team.has(wallet) || (await flyWallets()).has(wallet),
        next,
      };
    }
    cache.set(wallet, { at: now(), value });
    if (cache.size > 5000) cache.delete(cache.keys().next().value!);
    return value;
  }

  // ---- step 5: the swap box's drop-off log ----
  async function log(body: any) {
    const s = String(body?.session ?? "");
    const step = String(body?.step ?? "");
    if (!/^[a-z0-9]{8,32}$/.test(s) || !STEPS.includes(step)) throw new HttpError(400, "bad log row");
    const n = await pg.one<{ n: number }>("select count(*)::int as n from mine.swap_events where session = ?", s);
    if ((n?.n ?? 0) >= 40) return { ok: false };
    const wallet = typeof body?.wallet === "string" && ADDRESS.test(body.wallet.toLowerCase()) ? body.wallet.toLowerCase() : null;
    const route = ROUTES.includes(body?.route) ? body.route : null;
    const pay = typeof body?.pay === "string" && /^[A-Z]{2,6}$/.test(body.pay) ? body.pay : null;
    const chainId = Number.isInteger(body?.chain) && body.chain > 0 && body.chain < 1e9 ? body.chain : null;
    const usd = typeof body?.usd === "number" && Number.isFinite(body.usd) && body.usd >= 0 && body.usd < 1e8 ? body.usd : null;
    const reason = body?.reason ? String(body.reason).replace(/[\u0000-\u001f]/g, " ").slice(0, 160) : null;
    const page = typeof body?.page === "string" && /^[a-z]{2,16}$/.test(body.page) ? body.page : null;
    await pg.run(`insert into mine.swap_events (session, step, wallet, route, pay, chain, usd, reason, page)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`, s, step, wallet, route, pay, chainId, usd, reason, page);
    return { ok: true };
  }
  async function funnel(days: number) {
    const since = new Date(now() - days * 86_400_000).toISOString();
    const [steps, reasons, routes] = await Promise.all([
      pg.all<{ step: string; sessions: number }>(`select step, count(distinct session)::int as sessions from mine.swap_events
        where at > ? group by step order by sessions desc`, since),
      pg.all<{ reason: string; n: number }>(`select reason, count(*)::int as n from mine.swap_events where at > ? and step in ('failed', 'gas_low')
        and reason is not null group by reason order by n desc limit 20`, since),
      pg.all<{ route: string; step: string; sessions: number }>(`select route, step, count(distinct session)::int as sessions from mine.swap_events
        where at > ? and route is not null group by route, step order by route, sessions desc`, since),
    ]);
    return { days, steps, reasons, routes };
  }

  let timer: NodeJS.Timeout | null = null;
  function start(everyMs = Number(process.env.BUYWEEK_TICK_MS ?? 600_000)) {
    if (timer) return;
    void tick();
    timer = setInterval(() => void tick(), everyMs);
    timer.unref();
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET" && (m = /^\/api\/buyweek\/(0x[0-9a-fA-F]{40})$/.exec(p))) {
      return d.send(res, 200, await standing(m[1].toLowerCase(), url.searchParams.get("fresh") === "1")), true;
    }
    if (req.method === "POST" && p === "/api/swaplog") return d.send(res, 200, await log(await d.readJson(req))), true;
    if (req.method === "GET" && p === "/api/admin/swaplog") {
      d.adminOnly(req);
      return d.send(res, 200, await funnel(Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7)))), true;
    }
    return false;
  }

  return { route, start, tick, scan, standing, summary, log, funnel };
}
