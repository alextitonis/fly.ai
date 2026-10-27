/**
 * The buy flow's server side (src/buyweek.ts) against a real Postgres and a fake chain: which transfers are buys and
 * sells (pools and Relay's solvers on one side, people on the other; routers, fee legs, contracts, fly wallets and the
 * team left out), the standing (tiers, still held, loyalty, community, tickets, outside the week) and the drop-off log.
 *   npm run test:buyweek
 */
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { createBuyWeek, flowsOf, POOLS, tierOf, communityOf, type BuyWeekConfig } from "./buyweek.ts";
import type { Chain, Log } from "./gta.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const [PM, GIGA] = POOLS;
const UR = addr(0x8876), FEE = "0x625862521777e19ad54ce6c7abed9ca54d6589ea", ROUTER2 = addr(0x9999);
const A = addr(0xa1), B = addr(0xb2), C = addr(0xc3), FLYW = addr(0xf1), CONTRACT = addr(0xcc);

// --- pure parts ---
let f = flowsOf([{ from: PM, to: UR, value: 100n }, { from: UR, to: FEE, value: 1n }, { from: UR, to: A, value: 99n }]);
check("a buy through the router: the buyer and our fee leg gain, the router nets 0", f.get(A) === 99n && f.get(FEE) === 1n && !f.has(UR));
f = flowsOf([{ from: B, to: ROUTER2, value: 50n }, { from: ROUTER2, to: GIGA, value: 50n }]);
check("a sell into our GIGA pool", f.get(B) === -50n && f.size === 1);
check("no pool in the tx: not a trade", flowsOf([{ from: A, to: B, value: 5n }]).size === 0);
check("a Relay solver as a source", flowsOf([{ from: addr(0x5), to: C, value: 7n }], [...POOLS, addr(0x5)]).get(C) === 7n);
check("tiers", tierOf(19.99) === 0 && tierOf(20) === 10 && tierOf(99) === 15 && tierOf(100) === 20 && tierOf(1000) === 25);
check("community", communityOf(24) === 0 && communityOf(25) === 5 && communityOf(50) === 10);

// --- the server part ---
const PG = await startPg(5553);
try {
  const { pg } = PG;
  for (const fname of ["20261027140000_mine_buyweek_swaplog.sql"]) {
    const sql = readFileSync(new URL(`../../flybook/supabase/migrations/${fname}`, import.meta.url), "utf8");
    for (const s of sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((x) => x.trim()).filter(Boolean)) await pg.run(s);
  }
  await pg.run(`insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:1', 1, ?, 'x', 'x')`, FLYW);

  const NOW = Date.parse("2026-10-28T12:00:00Z");
  const T = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
  let logIx = 0;
  const log = (block: number, tx: string, from: string, to: string, v: bigint): Log => ({
    blockNumber: `0x${block.toString(16)}`, transactionHash: tx, logIndex: `0x${(logIx++).toString(16)}`,
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", topic(from), topic(to)], data: `0x${v.toString(16).padStart(64, "0")}` });
  const LOGS: Log[] = [
    log(10, T(1), PM, UR, 600_000n * E18), log(10, T(1), UR, FEE, 1_500n * E18), log(10, T(1), UR, A, 598_500n * E18),   // A buys ~$120
    log(11, T(2), PM, B, 50_000n * E18),                                                                                // B buys ~$10
    log(12, T(3), A, ROUTER2, 100_000n * E18), log(12, T(3), ROUTER2, GIGA, 100_000n * E18),                           // A sells some
    log(13, T(4), PM, FLYW, 900_000n * E18),                                                                            // a fly wallet buys
    log(14, T(5), PM, CONTRACT, 900_000n * E18),                                                                        // a contract buys
    log(15, T(6), A, C, 10_000n * E18),                                                                                 // a plain transfer
    log(5, T(7), PM, C, 900_000n * E18),                                                                                // before the window
  ];
  const held = new Map<string, bigint>([[A, 500_000n * E18], [B, 50_000n * E18], [C, 10_000n * E18]]);
  const chain: Chain = {
    head: async () => 20,
    blockTime: async (n) => Math.floor(Date.parse("2026-10-26T00:00:00Z") / 1000) + (n - 8) * 3600,
    blockHash: async () => null,
    logs: async (q) => LOGS.filter((l) => parseInt(l.blockNumber, 16) >= q.from && parseInt(l.blockNumber, 16) <= q.to),
    holdings: async (ws) => ws.map((w) => held.get(w) ?? 0n),
    isContract: async (w) => w === CONTRACT || w === UR || w === ROUTER2,
    decimals: async () => 18,
  };
  const cfg: BuyWeekConfig = { on: true, start: Date.parse("2026-10-26T00:00:00Z"), end: Date.parse("2026-11-01T08:00:00Z"), capFlyai: 5_000_000, exclude: [] };
  const sent: { status: number; body: any }[] = [];
  const send = (_r: ServerResponse, status: number, body: unknown) => { sent.push({ status, body }); };
  let now = NOW, body: any = null, admin = true;
  const bw = createBuyWeek({ pg, chain, prices: { usd: async () => 0.0002 }, cfg, HttpError, send, readJson: async () => body,
    adminOnly: () => { if (!admin) throw new HttpError(403, "admin only"); }, team: [FEE], loyal: new Set([A]), now: () => now });
  const call = async (method: string, path: string, b?: unknown) => {
    body = b ?? null;
    try { await bw.route({ method, headers: {} } as any, {} as ServerResponse, new URL(`http://x${path}`)); }
    catch (e) { sent.push({ status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } }); }
    return sent[sent.length - 1];
  };

  await bw.tick();
  const rows = await pg.all<{ wallet: string; delta: string }>("select wallet, delta::text from mine.buyweek_flows order by wallet, delta");
  check("flows: A's buy and sell, B's buy; not the fee leg, the fly wallet, the contract, the plain transfer or before the window",
    JSON.stringify(rows.map((r) => [r.wallet, r.delta])) === JSON.stringify([[A, (-100_000n * E18).toString()], [A, (598_500n * E18).toString()], [B, (50_000n * E18).toString()]]),
    JSON.stringify(rows));
  await bw.tick();
  check("a second tick reads nothing twice", (await pg.one<{ n: number }>("select count(*)::int as n from mine.buyweek_flows"))!.n === 3);

  let r = await call("GET", `/api/buyweek/${A}`);
  const a = r.body;
  // net 498,500 bought, holds 500,000: counts 498,500 x $0.0002 = $99.70 -> $50 tier 15% + loyal 5%; 1 buyer (B is under $20)
  check("A: net bought, still held, $50 tier + loyalty, 4 tickets", a.on && a.counted_flyai === 498_500 && a.usd === 99.7 && a.tier_pct === 15 &&
    a.loyal_pct === 5 && a.community_pct === 0 && a.bonus_pct === 20 && a.est_bonus_flyai === 99_700 && a.tickets === 4 && a.buyers === 1, JSON.stringify(a));
  check("A: the next tier is $100", a.next_tier?.usd === 100 && Math.abs(a.next_tier.need_usd - 0.3) < 0.01 && a.next_community?.buyers === 25);
  r = await call("GET", `/api/buyweek/${B}`);
  check("B: $10 is under the first tier, no loyalty without a tier", r.body.tier_pct === 0 && r.body.bonus_pct === 0 && r.body.next_tier.usd === 20);
  held.set(A, 100_000n * E18);
  now += 121_000;
  r = await call("GET", `/api/buyweek/${A}`);
  check("sold down: only what's still held counts (cache gone after 2 min)", r.body.counted_flyai === 100_000 && r.body.tier_pct === 10, JSON.stringify(r.body));
  now = Date.parse("2026-11-02T00:00:00Z");
  r = await call("GET", `/api/buyweek/${A}`);
  check("after the week: the next step instead", r.body.on === false && r.body.ended === true && r.body.next.step === "activate");

  // the drop-off log
  r = await call("POST", "/api/swaplog", { session: "abc12345", step: "quote", route: "direct", pay: "USDG", chain: 4663, usd: 20, page: "start" });
  check("a step is logged", r.status === 200 && r.body.ok);
  r = await call("POST", "/api/swaplog", { session: "abc12345", step: "failed", reason: "insufficient funds", wallet: A.toUpperCase().replace("0X", "0x") });
  check("a failure with its reason", r.status === 200);
  check("a bad step is refused", (await call("POST", "/api/swaplog", { session: "abc12345", step: "hacked" })).status === 400);
  check("a bad session is refused", (await call("POST", "/api/swaplog", { session: "x", step: "quote" })).status === 400);
  for (let i = 0; i < 40; i++) await call("POST", "/api/swaplog", { session: "spam1234", step: "quote" });
  check("a session writes at most 40 rows", (await pg.one<{ n: number }>("select count(*)::int as n from mine.swap_events where session = 'spam1234'"))!.n === 40);
  r = await call("GET", "/api/admin/swaplog?days=30");
  check("the funnel: sessions per step and the reasons", r.body.steps.some((s: any) => s.step === "failed" && s.sessions === 1) &&
    r.body.reasons[0]?.reason === "insufficient funds", JSON.stringify(r.body));
  admin = false;
  check("the funnel is admin only", (await call("GET", "/api/admin/swaplog")).status === 403);
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
