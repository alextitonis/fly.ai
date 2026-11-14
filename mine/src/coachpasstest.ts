/**
 * The Fly Pet Coach pass (src/coachpass.ts) against a real Postgres and a fake chain: USDG and $FLYAI payments checked on
 * chain, the staker discount, each transaction once, a second pass queues after the first, top-ups add hours to the
 * running period only.
 *   npm run test:coach
 */
import type { ServerResponse } from "node:http";
import { TOKENS, coachConfig, createCoachPass, discountFor, paidIn } from "./coachpass.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const DAY = 86_400_000;
const cfg = coachConfig({ COACH_PAY_TO: addr(0xfee) });
const xfer = (token: "USDG" | "FLYAI", from: string, to: string, units: bigint) => ({ status: "0x1", logs: [{ address: TOKENS[token].address,
  topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(from), pad(to)], data: `0x${units.toString(16)}` }] });
const usdg = (d: number) => BigInt(Math.round(d * 1e6));
const flyai = (n: number) => BigInt(Math.round(n)) * 10n ** 18n;

// pure parts
check("config defaults", cfg.passUsd === 5 && cfg.passHours === 30 && cfg.topupUsd === 2 && cfg.topupHours === 15 && cfg.payTo === addr(0xfee));
check("discount tiers", discountFor(cfg, 0) === 0 && discountFor(cfg, 100_000) === 10 && discountFor(cfg, 2_000_000) === 25 && discountFor(cfg, 9e6) === 40);
check("paidIn sums one sender's transfers to pay-to only", (() => {
  const r = { status: "0x1", logs: [...xfer("USDG", addr(1), addr(0xfee), usdg(2)).logs, ...xfer("USDG", addr(1), addr(0xfee), usdg(3)).logs,
    ...xfer("USDG", addr(1), addr(0xbad), usdg(9)).logs] };
  const p = paidIn(r, TOKENS.USDG.address, addr(0xfee));
  return p.length === 1 && p[0]!.from === addr(1) && p[0]!.units === usdg(5);
})());

const PG = await startPg(5561);
try {
  const { pg } = PG;
  const A = addr(0xa1), B = addr(0xb1), STAKER = addr(0xc1);
  const receipts = new Map<string, any>();
  const stakes = new Map([[STAKER, 1_500_000]]);
  let now = 1_800_000_000_000, px = 0.0002, body: any = null;
  let out: { status: number; body: any } = { status: 0, body: null };
  const c = createCoachPass({ pg, HttpError, send: (_r: ServerResponse, status, b) => { out = { status, body: b }; }, readJson: async () => body,
    cfg, flyaiUsd: async () => px, stakeOf: async (w) => stakes.get(w) ?? 0, receipt: async (tx) => receipts.get(tx) ?? null, now: () => now });
  const call = async (method: string, path: string, b?: unknown) => {
    body = b ?? null;
    try { await c.route({ method } as any, {} as any, new URL(`http://x${path}`)); } catch (e) { out = { status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } }; }
    return out;
  };

  // a quote: list price, the staker's 25% off, $FLYAI at its price
  let r = await call("GET", `/api/coach/quote/${A}`);
  check("quote, no stake", r.status === 200 && r.body.pass.usd === 5 && r.body.pass.flyai === 25_000 && r.body.topup.usd === 2 && !r.body.status.active, JSON.stringify(r.body).slice(0, 200));
  r = await call("GET", `/api/coach/quote/${STAKER}`);
  check("quote, staker 25% off", r.body.discount.off === 25 && r.body.pass.usd === 3.75 && r.body.pass.usdg === "3.75" && r.body.pass.flyai === 18_750);

  // a top-up without a pass
  receipts.set(TX(1), xfer("USDG", A, cfg.payTo, usdg(2)));
  r = await call("POST", "/api/coach/pay", { tx: TX(1), kind: "topup" });
  check("no top-up without a pass", r.status === 409, r.body.error);

  // too little, the wrong place, not mined, failed
  receipts.set(TX(2), xfer("USDG", A, cfg.payTo, usdg(4)));
  r = await call("POST", "/api/coach/pay", { tx: TX(2), kind: "pass" });
  check("too little is refused", r.status === 400 && /\$5\.00/.test(r.body.error), r.body.error);
  receipts.set(TX(3), xfer("USDG", A, addr(0xbad), usdg(5)));
  check("paid elsewhere is refused", (await call("POST", "/api/coach/pay", { tx: TX(3), kind: "pass" })).status === 400);
  check("not mined yet: try again", (await call("POST", "/api/coach/pay", { tx: TX(99), kind: "pass" })).status === 409);
  receipts.set(TX(4), { status: "0x0", logs: [] });
  check("a failed tx is refused", (await call("POST", "/api/coach/pay", { tx: TX(4), kind: "pass" })).status === 400);

  // a USDG pass
  receipts.set(TX(5), xfer("USDG", A, cfg.payTo, usdg(5)));
  r = await call("POST", "/api/coach/pay", { tx: TX(5), kind: "pass" });
  check("USDG pass", r.status === 200 && r.body.wallet === A && r.body.status.active && r.body.status.hours === 30, JSON.stringify(r.body));
  check("each tx once", (await call("POST", "/api/coach/pay", { tx: TX(5), kind: "pass" })).status === 409);

  // a top-up adds to the running period
  now += 3 * DAY;
  receipts.set(TX(6), xfer("USDG", A, cfg.payTo, usdg(2)));
  r = await call("POST", "/api/coach/pay", { tx: TX(6), kind: "topup" });
  check("top-up adds hours to this period", r.status === 200 && r.body.status.hours === 45, JSON.stringify(r.body.status));

  // a second pass queues after the first; this period keeps its hours
  receipts.set(TX(7), xfer("USDG", A, cfg.payTo, usdg(5)));
  r = await call("POST", "/api/coach/pay", { tx: TX(7), kind: "pass" });
  const st = r.body.status;
  check("second pass starts when the first ends", r.status === 200 && st.hours === 45
    && new Date(st.until).getTime() - new Date(st.period_end).getTime() === 30 * DAY, JSON.stringify(st));
  now += 28 * DAY;                                   // into the second period: its own 30 hours
  r = await call("GET", `/api/coach/pass/${A}`);
  check("the next period has its own hours", r.body.active && r.body.hours === 30, JSON.stringify(r.body));

  // $FLYAI: at its price, with the slack for a price move, and the staker discount
  receipts.set(TX(8), xfer("FLYAI", STAKER, cfg.payTo, flyai(18_000)));      // $3.60 for a $3.75 pass: within 5%
  r = await call("POST", "/api/coach/pay", { tx: TX(8), kind: "pass" });
  check("FLYAI pass with the staker discount", r.status === 200 && r.body.token === "FLYAI" && r.body.discount === 25 && r.body.status.active, JSON.stringify(r.body));
  receipts.set(TX(9), xfer("FLYAI", B, cfg.payTo, flyai(18_000)));           // no stake: $3.60 for a $5 pass
  r = await call("POST", "/api/coach/pay", { tx: TX(9), kind: "pass" });
  check("no discount without a stake", r.status === 400, r.body.error);
  px = 0;
  receipts.set(TX(10), xfer("FLYAI", B, cfg.payTo, flyai(30_000)));
  check("no price: try later", (await call("POST", "/api/coach/pay", { tx: TX(10), kind: "pass" })).status === 503);
  px = 0.0002;
  check("after the price is back it counts", (await call("POST", "/api/coach/pay", { tx: TX(10), kind: "pass" })).status === 200);

  // expired
  now += 400 * DAY;
  r = await call("GET", `/api/coach/pass/${A}`);
  check("an old pass is over", !r.body.active && r.body.hours === 0, JSON.stringify(r.body));
} finally {
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "all coach pass checks pass");
process.exit(failed ? 1 : 0);
