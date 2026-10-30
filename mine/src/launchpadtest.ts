/**
 * The Fly Launchpad indexer (src/launchpad.ts) against a real Postgres and REAL logs: fixtures/launchpad-fork.json is
 * what the contracts emitted in flytrade/desk/fork_launchpad.py's run on a Robinhood Chain fork (a launch with a $50
 * dev buy and a 1% creator tax, a trader buying $300 and selling half, the site's swap box buying with USDG and ETH and
 * selling on the curve, a buyer taking the rest of the curve, the keeper's graduation, then the swap box buying and
 * selling in the graduated TOKEN/FLYAI pool).
 *   npm run test:launchpad        (refresh the fixture: python flytrade/desk/fork_launchpad.py --dump mine/src/fixtures/launchpad-fork.json)
 */
import { readFileSync } from "node:fs";
import { createLaunchpad, poolPriceFlyai, priceOf, targetOf, trendScore, TOPICS, type LpChain, type Log } from "./launchpad.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

const fx = JSON.parse(readFileSync(new URL("./fixtures/launchpad-fork.json", import.meta.url), "utf8")) as {
  launchpad: string; token: string; pool: string; from: number; head: number; times: Record<string, number>; senders: Record<string, string>; logs: (Log & { address: string })[];
};
const launched = fx.logs.find((l) => l.topics[0] === TOPICS.launched)!;
const creator = `0x${launched.topics[2].slice(26)}`;
const LOCKER = "0x00000000000000000000000000000000000010c4";

// --- pure parts ---
const rules = { x0: "1785714286", y0: "1085714285714000000000000000", feeBps: 100, gradFeeBps: 500, snipeBps: 2500, maxWalletBps: 200,
  maxDevBps: 500, countdown: 60, snipeSecs: 300, limitSecs: 900 };
check("target of the default rules is $5,000", Math.abs(Number(targetOf(rules)) / 1e6 - 5000) < 0.01, String(Number(targetOf(rules)) / 1e6));
check("start price ~$0.00000164", Math.abs(priceOf(1_785_714_286n, 1_085_714_285_714n * 10n ** 15n) - 1.6447e-6) < 1e-9);

// --- the fake chain: the fixture's logs, served up to a movable head ---
let head = fx.head;
let logCalls = 0;
const word = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
const chain: LpChain = {
  head: async () => head,
  blockTime: async (n) => fx.times[String(n)] ?? 1_800_000_000,
  txFrom: async (h) => fx.senders[h],
  logs: async (q) => {
    logCalls++;
    const want = (Array.isArray(q.address) ? q.address : [q.address]).map((a) => a.toLowerCase());
    const t0 = q.topics[0];
    const topics = t0 === null || t0 === undefined ? null : Array.isArray(t0) ? t0 : [t0];
    return fx.logs.filter((l) => want.includes(l.address.toLowerCase()) && (!topics || topics.includes(l.topics[0]))
      && parseInt(l.blockNumber, 16) >= q.from && parseInt(l.blockNumber, 16) <= q.to);
  },
  call: async (to, data) => {
    const sel = data.slice(0, 10);
    const answers: Record<string, string> = {
      "0x7e1d6a8f": word(250_000_000_000_000n),                  // createFee()
    };
    if (to === LOCKER) return word(7n * 10n ** 18n);           // owed(creator, token)
    if (data.length > 10) return word(4_000_000n);              // creatorOwed(creator): $4
    if (sel === "0x37a3ad17" || data === "0xd7e9f0b8") return word(BigInt(LOCKER));
    return answers[sel] ?? word(0n);
  },
};
// the selectors the fake answers by name, whatever their hash
const { keccak_256 } = await import("@noble/hashes/sha3.js");
const sel = (s: string) => `0x${Buffer.from(keccak_256(Buffer.from(s))).toString("hex").slice(0, 8)}`;
const realCall = chain.call;
chain.call = async (to, data) => {
  if (data.startsWith(sel("balanceOf(address)"))) return word(to.toLowerCase() === fx.token ? 195_000_000n * 10n ** 18n : 19_200_000n * 10n ** 18n);
  if (data === sel("locker()")) return word(BigInt(LOCKER));
  if (data === sel("createFee()")) return word(250_000_000_000_000n);
  if (data === sel("flyaiInventory()")) return word(50_000_000n * 10n ** 18n);
  if (data === sel("defaults()")) return `0x${[rules.x0, rules.y0, 100, 500, 2500, 200, 500, 60, 300, 900].map((v) => BigInt(v).toString(16).padStart(64, "0")).join("")}`;
  return realCall(to, data);
};

const PG = await startPg(5551);
try {
  const sent: { status: number; body: any }[] = [];
  const FLY_USD = 0.000247;                                      // what the fork's keeper paid for FLYAI
  let flyUsd: number | null = null;                              // no price at first: the pools must wait, the launches not
  const lastTime = Math.max(...Object.values(fx.times));
  const lp = createLaunchpad({
    pg: PG.pg, chain, address: fx.launchpad, fromBlock: fx.from, HttpError, explorer: "https://example",
    send: (_res, status, body) => sent.push({ status, body }),
    flyaiUsd: async () => flyUsd,
    now: () => new Date((lastTime + 3600) * 1000),
  });

  // 1. in two steps (the cursor carries over): first up to the middle of the run, then the rest
  const blocks = [...new Set(fx.logs.map((l) => parseInt(l.blockNumber, 16)))].sort((a, b) => a - b);
  head = blocks[Math.floor(blocks.length / 2)];
  await lp.tick();
  const mid = await lp.token(fx.token);
  check("halfway: the launch is indexed, still on the curve", mid.state === "curve" && mid.name === "Fork Fly" && mid.symbol === "FORK",
    `${mid.state} ${mid.name}`);
  head = fx.head;
  await lp.tick();
  const waited = (await PG.pg.all("select 1 from mine.launch_swaps")).length;
  check("no FLYAI price yet: no pool swaps, the launch still graduates", waited === 0 && (await lp.token(fx.token)).state === "graduated");
  flyUsd = FLY_USD;
  await lp.tick();
  await lp.tick();                                               // again: nothing new, nothing doubled
  const t = await lp.token(fx.token);

  check("creator, pool, uri decoded", t.creator === creator && /^0x[0-9a-f]{40}$/.test(t.pool) && t.uri === "ipfs://fork", `${t.creator} ${t.uri}`);
  check("rules decoded from the event", t.rules.x0 === rules.x0 && t.rules.y0 === rules.y0 && t.rules.snipeBps === 2500 && t.rules.limitSecs === 900);
check("the creator's 1% tax decoded", t.creator_tax_bps === 100, String(t.creator_tax_bps));
  check("graduated, with the pool's FLYAI", t.state === "graduated" && Number(t.pool_flyai) / 1e18 > 15_000_000 && t.position_id !== null,
    `${t.state} ${Number(t.pool_flyai) / 1e18}`);
  check("7 curve trades and 2 pool swaps, once each", t.trade_count === 9 && t.trades.length === 9 && (await PG.pg.all("select 1 from mine.launch_trades")).length === 7
    && (await PG.pg.all("select 1 from mine.launch_swaps")).length === 2, String(t.trade_count));
  const kinds = [...t.trades].reverse().map((x: any) => `${x.buy ? "buy" : "sell"}:${x.venue}`).join(",");
  check("trade order, sides and venues", kinds === "buy:curve,buy:curve,sell:curve,buy:curve,buy:curve,sell:curve,buy:curve,buy:pool,sell:pool", kinds);
  check("raised $5,000, progress 100%", Math.abs(t.raised_usd - 5000) < 0.01 && t.progress_pct === 100, `${t.raised_usd}`);
  check("chart: one point a trade, the sell dips the price", t.chart.length === 9 && t.chart[2][1] < t.chart[1][1] && t.chart[3][1] > t.chart[2][1]);
  check("the curve's end meets the pool's opening price", Math.abs(t.chart[7][1] - t.chart[6][1]) / t.chart[6][1] < 0.1, `${t.chart[6][1]} ${t.chart[7][1]}`);
  check("price follows the pool: market cap near the opening $23.75k", Math.abs(t.mcap_usd - 23_750) / 23_750 < 0.08, t.mcap_usd.toFixed(0));
  const poolBuy = t.trades[1], poolSell = t.trades[0];
  const trader = fx.senders[Object.keys(fx.senders).at(-1)!].toLowerCase();
  check("a pool swap: the sender, not the router, and its size in USD (500k FLYAI)", poolBuy.trader === trader && poolBuy.buy && Math.abs(poolBuy.usd - 500_000 * FLY_USD) < 0.01, `${poolBuy.trader} ${poolBuy.usd}`);
  check("a pool sell is a sell", !poolSell.buy && poolSell.usd > 0);
  check("the pool's holdings read after it traded", t.pool_flyai === String(19_200_000n * 10n ** 18n) && t.pool_tokens === String(195_000_000n * 10n ** 18n), t.pool_flyai ?? "");
  check("liquidity from them", Math.abs(t.liquidity_usd! - (19_200_000 + 195_000_000 * (t.price_usd / FLY_USD)) * FLY_USD) < 0.01, String(t.liquidity_usd));
  // holders: the creator (dev buy, released at graduation), the trader, the buyer; not the launchpad, pool or dead
  check("3 holders", t.holders === 3, String(t.holders));
  const pct = t.holders_top.reduce((s: number, h: any) => s + h.pct, 0);
  check("holders hold the 800M sold, plus what they bought from the pool", pct > 80 && pct < 80.5, pct.toFixed(4));
  check("nothing left on the curve", t.curve_tokens === "0", t.curve_tokens);
  check("no bundle flag for one buyer per block", t.bundles.length === 0);

  // 2. the list and its tabs
  const all = await lp.list("new", 50);
  check("list: one launch, totals", all.launches.length === 1 && all.totals.launches === 1 && all.totals.graduated === 1
    && Math.abs(all.totals.volume_usd - t.volume_usd) < 1e-9, JSON.stringify(all.totals));
  check("settings read on chain", (all.settings as any)?.create_fee_wei === "250000000000000" && (all.settings as any)?.locker === LOCKER);
  check("graduated tab has it, top (curves) doesn't", (await lp.list("graduated", 50)).launches.length === 1 && (await lp.list("top", 50)).launches.length === 0);

  // 3. the /dex listing
  const m = await lp.markets({});
  const row = m.markets[0];
  check("markets: the token, its 24 hours, FLYAI price", m.markets.length === 1 && row.traders_24h === 3 && row.buys_24h === 6 && row.sells_24h === 3 && m.flyai_usd === FLY_USD, JSON.stringify({ tr: row.traders_24h, b: row.buys_24h, s: row.sells_24h, f: m.flyai_usd }));
  check("markets: 24h volume is both venues", Math.abs(row.volume_24h - t.volume_usd) < 0.01, `${row.volume_24h} ${t.volume_usd}`);
  check("markets: trending score", Math.abs(row.score - trendScore(row.traders_24h, row.volume_24h)) < 1e-9);
  check("markets: the change is from the day's first price", row.change_24h !== null && row.change_24h > 0, String(row.change_24h));
  check("markets: filters", (await lp.markets({ state: "curve" })).markets.length === 0 && (await lp.markets({ state: "graduated" })).markets.length === 1);
  check("markets: search by symbol, name, address; a miss; % is not a wildcard", (await lp.markets({ q: "for" })).markets.length === 1 && (await lp.markets({ q: "fork fly" })).markets.length === 1
    && (await lp.markets({ q: fx.token })).markets.length === 1 && (await lp.markets({ q: "nope" })).markets.length === 0 && (await lp.markets({ q: "%" })).markets.length === 0);
  check("the sqrt price: token0 vs token1", Math.abs(poolPriceFlyai(2n ** 96n * 2n, "0x0000000000000000000000000000000000000001") - 4) < 1e-9
    && Math.abs(poolPriceFlyai(2n ** 96n * 2n, "0xffffffffffffffffffffffffffffffffffffffff") - 0.25) < 1e-9);
  const res0 = {} as any;
  await lp.route({ method: "GET" } as any, res0, new URL("http://x/api/launchpad/markets?sort=volume&state=graduated&limit=5"));
  check("GET /api/launchpad/markets", sent.at(-1)?.status === 200 && sent.at(-1)?.body.markets.length === 1);

  // 4. a creator
  const c = await lp.creator(creator);
  check("creator: its launch, curve fees and pool fees", c.launches.length === 1 && c.curve_fees_usdg === "4000000"
    && Object.keys(c.pool_fees).length === 2, JSON.stringify(c.pool_fees));

  // 5. the routes
  const res = {} as any;
  await lp.route({ method: "GET" } as any, res, new URL("http://x/api/launchpad?tab=graduated"));
  check("GET /api/launchpad", sent.at(-1)?.status === 200 && sent.at(-1)?.body.launches.length === 1);
  let err: any = null;
  try { await lp.route({ method: "GET" } as any, res, new URL(`http://x/api/launchpad/token/0x${"12".repeat(20)}`)); } catch (e) { err = e; }
  check("unknown token: 404", err?.status === 404);
  check("POST is not ours", !(await lp.route({ method: "POST" } as any, res, new URL("http://x/api/launchpad"))));
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
