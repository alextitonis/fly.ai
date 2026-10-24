/**
 * The Fly Launchpad indexer (src/launchpad.ts) against a real Postgres and REAL logs: fixtures/launchpad-fork.json is
 * what the contracts emitted in flytrade/desk/fork_launchpad.py's run on a Robinhood Chain fork (a launch with a $50
 * dev buy and a 1% creator tax, a trader buying $300 and selling half, a buyer taking the rest of the curve, the
 * keeper's graduation).
 *   npm run test:launchpad        (refresh the fixture: python flytrade/desk/fork_launchpad.py --dump mine/src/fixtures/launchpad-fork.json)
 */
import { readFileSync } from "node:fs";
import { createLaunchpad, priceOf, targetOf, TOPICS, type LpChain, type Log } from "./launchpad.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

const fx = JSON.parse(readFileSync(new URL("./fixtures/launchpad-fork.json", import.meta.url), "utf8")) as {
  launchpad: string; token: string; from: number; head: number; times: Record<string, number>; logs: (Log & { address: string })[];
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
  if (data === sel("locker()")) return word(BigInt(LOCKER));
  if (data === sel("createFee()")) return word(250_000_000_000_000n);
  if (data === sel("flyaiInventory()")) return word(50_000_000n * 10n ** 18n);
  if (data === sel("defaults()")) return `0x${[rules.x0, rules.y0, 100, 500, 2500, 200, 500, 60, 300, 900].map((v) => BigInt(v).toString(16).padStart(64, "0")).join("")}`;
  return realCall(to, data);
};

const PG = await startPg(5551);
try {
  const sent: { status: number; body: any }[] = [];
  const lp = createLaunchpad({
    pg: PG.pg, chain, address: fx.launchpad, fromBlock: fx.from, HttpError, explorer: "https://example",
    send: (_res, status, body) => sent.push({ status, body }),
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
  await lp.tick();                                               // again: nothing new, nothing doubled
  const t = await lp.token(fx.token);

  check("creator, pool, uri decoded", t.creator === creator && /^0x[0-9a-f]{40}$/.test(t.pool) && t.uri === "ipfs://fork", `${t.creator} ${t.uri}`);
  check("rules decoded from the event", t.rules.x0 === rules.x0 && t.rules.y0 === rules.y0 && t.rules.snipeBps === 2500 && t.rules.limitSecs === 900);
check("the creator's 1% tax decoded", t.creator_tax_bps === 100, String(t.creator_tax_bps));
  check("graduated, with the pool's FLYAI", t.state === "graduated" && Number(t.pool_flyai) / 1e18 > 20_000_000 && t.position_id !== null,
    `${t.state} ${Number(t.pool_flyai) / 1e18}`);
  check("4 curve trades once each (dev buy, trader buy, trader sell, the last buy)", t.trade_count === 4 && t.trades.length === 4 && (await PG.pg.all("select 1 from mine.launch_trades")).length === 4,
    String(t.trade_count));
  const kinds = [...t.trades].reverse().map((x: any) => (x.buy ? "buy" : "sell")).join(",");
  check("trade order and sides", kinds === "buy,buy,sell,buy", kinds);
  check("raised $5,000, progress 100%", Math.abs(t.raised_usd - 5000) < 0.01 && t.progress_pct === 100, `${t.raised_usd}`);
  check("chart: one point a trade, the sell dips the price", t.chart.length === 4 && t.chart[2][1] < t.chart[1][1] && t.chart[3][1] > t.chart[2][1]);
  check("end price ~ the pool's opening price ($23.75k market cap)", Math.abs(t.mcap_usd - 23_750) / 23_750 < 0.01, t.mcap_usd.toFixed(0));
  // holders: the creator (dev buy, released at graduation), the trader (half), the buyer; not the launchpad, pool or dead
  check("3 holders", t.holders === 3, String(t.holders));
  const pct = t.holders_top.reduce((s: number, h: any) => s + h.pct, 0);
  check("holders hold the 800M sold (80%)", Math.abs(pct - 80) < 0.01, pct.toFixed(4));
  check("nothing left on the curve", t.curve_tokens === "0", t.curve_tokens);
  check("no bundle flag for one buyer per block", t.bundles.length === 0);

  // 2. the list and its tabs
  const all = await lp.list("new", 50);
  check("list: one launch, totals", all.launches.length === 1 && all.totals.launches === 1 && all.totals.graduated === 1
    && Math.abs(all.totals.volume_usd - t.volume_usd) < 1e-9, JSON.stringify(all.totals));
  check("settings read on chain", (all.settings as any)?.create_fee_wei === "250000000000000" && (all.settings as any)?.locker === LOCKER);
  check("graduated tab has it, top (curves) doesn't", (await lp.list("graduated", 50)).launches.length === 1 && (await lp.list("top", 50)).launches.length === 0);

  // 3. a creator
  const c = await lp.creator(creator);
  check("creator: its launch, curve fees and pool fees", c.launches.length === 1 && c.curve_fees_usdg === "4000000"
    && Object.keys(c.pool_fees).length === 2, JSON.stringify(c.pool_fees));

  // 4. the routes
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
