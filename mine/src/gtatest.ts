/**
 * The GTA VI giveaway (src/gta.ts) against a real Postgres and a fake chain: fees fill the pot, a round opens at $70
 * with the eligible holders fixed, the seed block draws a winner, the winner leaves a contact, the team voids (a
 * redraw) or marks it sent, and who is in or out of the draw.
 *   npm run test:gta
 */
import type { ServerResponse } from "node:http";
import { createGta, gtaConfig, pick, progress, FLYAI, type Chain, type Log } from "./gta.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const DEV = "0x625862521777e19ad54ce6c7abed9ca54d6589ea";
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";

// --- pure parts ---
const list: [string, string][] = [[addr(1), "100000"], [addr(2), "300000"]];
check("pick is the same for the same seed", pick(`0x${"ab".repeat(32)}`, 1, 1, list) === pick(`0x${"ab".repeat(32)}`, 1, 1, list));
const wins: Record<string, number> = {};
for (let i = 0; i < 4000; i++) {
  const w = pick(`0x${i.toString(16).padStart(64, "0")}`, 1, 1, list)!;
  wins[w] = (wins[w] ?? 0) + 1;
}
const share = (wins[addr(2)] ?? 0) / 4000;
check("pick is weighted by holdings (3x holder wins ~75%)", share > 0.71 && share < 0.79, share.toFixed(3));
check("pick of an empty list is nobody", pick(`0x${"00".repeat(32)}`, 1, 1, []) === null);
const p = progress(105, 70, 1);
check("progress: $105 pot, 1 opened -> 1 funded, $35 toward the next (50%)", p.funded === 1 && p.progress_usd === 35 && p.pct === 50 && p.left_usd === 35);

// --- the fake chain ---
const holders = new Map<string, bigint>([
  [addr(0xa1), 500_000n * E18],          // in
  [addr(0xa2), 100_000n * E18],          // in, just
  [addr(0xa3), 99_999n * E18],           // below
  [addr(0xc0), 9_000_000n * E18],        // a contract (a pool)
  [DEV, 50_000_000n * E18],              // team
  [addr(0xf1), 2_000_000n * E18],        // a Fly Wallet (server wallet)
]);
let head = 1000;
const transfers: Log[] = [...holders.keys()].map((to, i) => ({ blockNumber: `0x${(10 + i).toString(16)}`, transactionHash: `0x${"11".repeat(32)}`,
  logIndex: `0x${i.toString(16)}`, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", topic(addr(0)), topic(to)], data: "0x" }));
const fees: Log[] = [];
const fee = (block: number, nvda: number, i: number) => fees.push({ blockNumber: `0x${block.toString(16)}`, transactionHash: `0x${i.toString(16).padStart(64, "0")}`,
  logIndex: "0x1", topics: ["0x5d104c62f50449fadfe6f4013c8f36588d32737f94b5ac9b83ddad33b3e1ffdf", topic(DEV), topic(NVDA), topic(addr(0xe5))],
  data: `0x${BigInt(Math.round(nvda * 1e18)).toString(16).padStart(64, "0")}` });
let logCalls = 0;
const chain: Chain = {
  head: async () => head,
  blockTime: async (n) => Math.floor(Date.parse("2026-10-21T00:00:00Z") / 1000) + n * 100,   // block 864 = 10-22 00:00
  blockHash: async (n) => (n <= head ? `0x${n.toString(16).padStart(64, "7")}` : null),
  logs: async (q) => {
    logCalls++;
    if (q.to - q.from + 1 > 500) throw new Error("query spans too many blocks, only 500 are allowed");   // the span cap
    const src = q.address === FLYAI ? transfers : fees;
    return src.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= q.from && b <= q.to; });
  },
  holdings: async (ws) => ws.map((w) => holders.get(w) ?? 0n),
  isContract: async (w) => w === addr(0xc0),
  decimals: async () => 18,
};
const prices = { usd: async (t: string) => (t === NVDA ? 200 : t === FLYAI ? 0.0002 : null) };

const PG = await startPg(5549);
try {
  const { pg } = PG;
  await pg.run(`insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:1', 1, ?, 'x', 'x')`, addr(0xf1));
  const sent: { status: number; body: any }[] = [];
  const res = { } as ServerResponse;
  const send = (_r: ServerResponse, status: number, body: unknown) => { sent.push({ status, body }); };
  let session = DEV;
  let body: any = null;
  const gta = createGta({
    pg, chain, prices, cfg: { ...gtaConfig({ GTA_START: "2026-10-22T00:00:00Z", GTA_PONS_START: "2026-10-22T00:00:00Z", GTA_END: "2099-01-01T00:00:00Z" }), seedDelay: 50 },
    HttpError, send, readJson: async () => body, sessionWallet: async () => session, isAdminToken: () => false,
    admins: [DEV], explorer: "https://example",
  });
  const call = async (method: string, path: string, b?: unknown, headers: Record<string, string> = {}) => {
    body = b ?? null;
    const req = { method, headers } as any;
    try {
      await gta.route(req, res, new URL(`http://x${path}`));
    } catch (e) {
      sent.push({ status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } });
    }
    return sent[sent.length - 1];
  };

  // $50 of Pons fees (0.25 NVDA dev share), plus a wallet fee and a referrer's leg that must not count
  fee(900, 0.25, 1);
  fee(800, 5, 2);                                         // before GTA_START: not counted
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, token, amount, usd, at) values ('w', 'robinhood', 'fee', ?, ?, null, '2026-10-22 12:00+00')`,
    FLYAI, (10_000n * E18).toString());                   // 10k FLYAI = $2
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, token, amount, usd, at, detail) values ('w', 'robinhood', 'fee', ?, ?, 5, '2026-10-22 12:00+00', '{"referral": "0xabc"}')`,
    FLYAI, "1");
  await gta.tick();
  let v = (await call("GET", `/api/gta?wallet=${addr(0xa1)}`)).body;
  check("fees: pons $50 + wallet $2, the old fee and the referral leg left out", Math.abs(v.fees_usd.pons - 50) < 1e-6 && Math.abs(v.fees_usd.wallet - 2) < 1e-6,
    JSON.stringify(v.fees_usd));
  check("pot is half the fees ($26), giveaway #1 at 37%", Math.abs(v.pot_usd - 26) < 1e-6 && v.giveaway === 1 && Math.round(v.progress_pct) === 37 && Math.abs(v.left_usd - 44) < 1e-6,
    `${v.pot_usd} #${v.giveaway} ${v.progress_pct}`);
  check("no round opens below $70", v.draws.length === 0 && v.current === null);
  check("the RPC's span cap is worked around", logCalls > 2, String(logCalls));
  check("500k holder: eligible, odds 500/600", v.me.eligible && Math.round(v.me.odds_pct) === 83, JSON.stringify(v.me));
  v = (await call("GET", `/api/gta?wallet=${addr(0xa3)}`)).body;
  check("99,999 holder: not eligible, 1 short", !v.me.eligible && v.me.reason === "below" && v.me.short_by === "1");
  v = (await call("GET", `/api/gta?wallet=${DEV}`)).body;
  check("team wallet: out", !v.me.eligible && v.me.reason === "team");
  v = (await call("GET", `/api/gta?wallet=${addr(0xf1)}`)).body;
  check("a Fly Wallet: out", !v.me.eligible && v.me.reason === "team");
  v = (await call("GET", `/api/gta?wallet=${addr(0xc0)}`)).body;
  check("a contract: out", !v.me.eligible && v.me.reason === "contract");

  // another $100 of fees: the pot is $76 -> round 1 opens, waits for its seed block
  head = 1100;
  fee(1050, 0.5, 3);
  await gta.tick();
  const r1 = await pg.one<any>("select * from mine.gta_draws where round = 1");
  check("round 1 opens at $70 with the 2 eligible wallets, sorted", r1?.status === "waiting" && r1.entrants === 2 &&
    JSON.stringify(r1.entrants_list) === JSON.stringify([[addr(0xa1), "500000"], [addr(0xa2), "100000"]]) && Number(r1.seed_block) === 1150,
    JSON.stringify(r1?.entrants_list));
  holders.set(addr(0xa3), 10_000_000n * E18);             // buys in after the list is fixed: not in this round
  head = 1149;
  await gta.tick();
  check("not drawn before the seed block", (await pg.one<any>("select status from mine.gta_draws where round = 1"))?.status === "waiting");
  head = 1150;
  await gta.tick();
  const d1 = await pg.one<any>("select * from mine.gta_draws where round = 1");
  const expect = pick(d1.seed_hash, 1, 1, r1.entrants_list);
  check("drawn from the seed block's hash, redoable from the published list", d1.status === "won" && d1.winner === expect && !!d1.winner, d1.winner);
  v = (await call("GET", "/api/gta")).body;
  check("page: current winner, giveaway #2 next, $6 toward it", v.current?.round === 1 && v.current.winner === expect && v.giveaway === 2 &&
    Math.abs(v.progress_usd - 6) < 1e-6 && v.past.length === 0, JSON.stringify({ g: v.giveaway, p: v.progress_usd }));
  check("the public view carries no contact", !("contact" in v.current));

  // the winner leaves a contact; someone else can't
  session = addr(0xa3);
  check("a non-winner can't leave a contact", (await call("POST", "/api/gta/contact", { contact: "me@x.com" }, { "x-flyai-session": "s" })).status === 403);
  session = d1.winner;
  check("the winner leaves a contact", (await call("POST", "/api/gta/contact", { contact: "winner@mail.com" }, { "x-flyai-session": "s" })).status === 200);
  check("a non-admin can't see contacts", (await call("GET", "/api/admin/gta", undefined, { "x-flyai-session": "s" })).status === 403);
  session = DEV;
  const adm = (await call("GET", "/api/admin/gta", undefined, { "x-flyai-session": "s" })).body;
  check("the team sees the contact", adm.draws[0].contact === "winner@mail.com");

  // void: drawn again as attempt 2 with a fresh list (the 10M buyer is in now)
  check("the team voids it", (await call("POST", "/api/admin/gta", { round: 1, status: "void", note: "farm ring" }, { "x-flyai-session": "s" })).status === 200);
  await gta.tick();
  const a2 = await pg.one<any>("select * from mine.gta_draws where round = 1 and attempt = 2");
  check("round 1 attempt 2 opens with a fresh list", a2?.status === "waiting" && a2.entrants === 3, String(a2?.entrants));
  head = 1300;
  await gta.tick();
  const d2 = await pg.one<any>("select * from mine.gta_draws where round = 1 and attempt = 2");
  check("attempt 2 drawn", d2.status === "won" && d2.winner === pick(d2.seed_hash, 1, 2, a2.entrants_list));
  check("the team marks it sent", (await call("POST", "/api/admin/gta", { round: 1, status: "sent", note: "sent on Steam" }, { "x-flyai-session": "s" })).status === 200);
  v = (await call("GET", "/api/gta")).body;
  check("sent shows with its note, the void stays out of the winners", v.current.status === "sent" && v.current.note === "sent on Steam" &&
    v.past.length === 0 && v.draws.length === 2);
  check("no second round while the pot is under $140", !(await pg.one("select 1 from mine.gta_draws where round = 2")));
  check("the admin can't re-mark a sent round", (await call("POST", "/api/admin/gta", { round: 1, status: "void" }, { "x-flyai-session": "s" })).status === 404);
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
