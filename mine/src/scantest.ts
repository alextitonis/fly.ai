/**
 * Fly Scan (src/scan.ts) against a real Postgres and a fake chain: targets are normalized, a scan needs paying (USDG,
 * $FLYAI, a holder's free scan), a transfer pays once, a fresh report is shared, the worker claims and finishes jobs,
 * a failed scan gives its payment back, stale jobs are retried, and the bot has its own daily cap.
 *   npm run test:scan
 */
import { createScan, normalize, payment, scanConfig, flyaiAmount, USDG, FLYAI } from "./scan.ts";
import type { Transfer } from "./orders.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const W1 = "0x" + "a1".repeat(20);
const W2 = "0x" + "a2".repeat(20);
const TOKEN = "0x" + "cc".repeat(20);
const tx = (n: number) => "0x" + n.toString(16).padStart(64, "0");
async function status(p: Promise<unknown>): Promise<number> {
  try { await p; return 200; } catch (e) { return (e as HttpError).status ?? 500; }
}

// --- pure parts ---
check("contract: lowercased, default chain robinhood", JSON.stringify(normalize("contract", " 0x" + "AB".repeat(20) + " ")) ===
  JSON.stringify({ kind: "contract", target: "0x" + "ab".repeat(20), chain: "robinhood" }));
check("contract: unknown chain refused", (() => { try { normalize("contract", TOKEN, "solana"); return false; } catch { return true; } })());
check("site: https added, trailing slash and hash dropped", normalize("site", "Claim-XYZ.io/airdrop/#x").target === "https://claim-xyz.io/airdrop");
check("site: query kept", normalize("site", "https://a.io/c?ref=1").target === "https://a.io/c?ref=1");
for (const bad of ["http://localhost:3000", "https://127.0.0.1/x", "https://user:pw@a.io", "ftp://a.io", "https://intranet.corp", "nodots", "javascript:alert(1)"])
  check(`site refused: ${bad}`, (() => { try { normalize("site", bad); return false; } catch { return true; } })());
const cfg = { ...scanConfig({}), workerToken: "w".repeat(32), botToken: "b".repeat(32), botPerDay: 2 };
const NOW = Date.parse("2026-10-27T12:00:00Z");
const t = (value: bigint, from = W1, at = NOW - 60_000): Transfer => ({ from, value, at });
check("payment: 0.5 USDG pays", payment(t(500_000n), W1, "usdg", null, cfg, NOW).ok);
check("payment: 0.4 USDG is short", !payment(t(400_000n), W1, "usdg", null, cfg, NOW).ok);
check("payment: from another wallet refused", !payment(t(500_000n, W2), W1, "usdg", null, cfg, NOW).ok);
check("payment: an old transfer refused", !payment(t(500_000n, W1, NOW - 3 * 3_600_000), W1, "usdg", null, cfg, NOW).ok);
check("payment: $0.30 of FLYAI at $0.001 = 300 FLYAI pays", payment(t(300n * E18), W1, "flyai", 0.001, cfg, NOW).ok);
check("payment: 10% slack on FLYAI (275 ok, 250 short)", payment(t(275n * E18), W1, "flyai", 0.001, cfg, NOW).ok && !payment(t(250n * E18), W1, "flyai", 0.001, cfg, NOW).ok);
check("payment: no FLYAI price refuses", !payment(t(300n * E18), W1, "flyai", null, cfg, NOW).ok);
check("flyaiAmount rounds up", flyaiAmount(cfg, 0.0007) === 429 && flyaiAmount(cfg, null) === null);

// --- against Postgres ---
const PG = await startPg(5561);
const pg = PG.pg;
let now = NOW;
const transfers = new Map<string, { token: string; t: Transfer } | null>();   // null: not mined yet
const holdings = new Map<string, bigint>([[W2, 250_000n * E18]]);
const scan = createScan({
  pg, cfg, HttpError,
  send: () => {}, readJson: async () => ({}), sessionWallet: async () => W1,
  transfersIn: async (h, token) => {
    const got = transfers.get(h);
    if (got === null) return null;
    return got && got.token === token ? [got.t] : [];
  },
  holdings: async (w) => holdings.get(w) ?? 0n,
  flyaiPrice: async () => 0.001,
  now: () => now,
});
try {
  const C = { kind: "contract", target: TOKEN, chain: "base" };
  check("no payment: 402", await status(scan.create(W1, C)) === 402);
  transfers.set(tx(1), null);
  check("a transfer not mined yet: 409", await status(scan.create(W1, { ...C, tx: tx(1) })) === 409);
  transfers.set(tx(1), { token: USDG, t: t(500_000n) });
  const a = await scan.create(W1, { ...C, tx: tx(1) });
  check("USDG transfer pays a scan", a.status === "queued" && a.paid_by === "usdg");
  check("the same target while queued is joined, not paid", (await scan.create(W2, { ...C, chain: "base" })).id === a.id);
  check("the same transfer can't pay twice", await status(scan.create(W1, { kind: "contract", target: "0x" + "dd".repeat(20), tx: tx(1) })) === 409);
  transfers.set(tx(2), { token: FLYAI, t: t(100n * E18) });
  check("too little FLYAI: 402", await status(scan.create(W1, { kind: "contract", target: "0x" + "dd".repeat(20), tx: tx(2) })) === 402);
  check("a refused payment leaves no job", !(await pg.one("select 1 from mine.scan_jobs where target = ?", "0x" + "dd".repeat(20))));
  transfers.set(tx(3), { token: FLYAI, t: t(300n * E18) });
  const b = await scan.create(W1, { kind: "site", target: "claim-xyz.io", tx: tx(3) });
  check("FLYAI transfer pays a site scan", b.paid_by === "flyai");

  // the worker
  check("the worker claims the oldest queued job", (await scan.claim())?.id === a.id);
  const j2 = await scan.claim();
  check("claims go oldest first", j2?.id === b.id && j2.attempts === 1);
  check("nothing left to claim", (await scan.claim()) === null);
  await scan.done({ id: a.id, verdict: "caution", title: "TKN (Token)", report: { findings: [1] }, cost_usd: 0.05 });
  const ja = await scan.job(a.id);
  check("a finished job is public with its report", ja.status === "done" && ja.verdict === "caution" && (ja.report as any).findings.length === 1 && !("wallet" in ja));
  transfers.set(tx(9), { token: USDG, t: t(500_000n) });
  const nj = await scan.create(W1, { kind: "site", target: "nul.io", tx: tx(9) });
  while ((await scan.claim())?.id !== nj.id) { /* the queue up to it */ }
  now += 1000;
  await scan.done({ id: nj.id, verdict: "unknown", title: "nul\u0000.io", report: { text: "a\u0000b" } });
  now = NOW;
  const nr = await scan.job(nj.id);
  check("a page's \\u0000 is stripped, not a failed save", nr.status === "done" && (nr.report as any).text === "ab" && nr.title === "nul.io");
  const again = await scan.create(W2, C);
  check("a fresh report is shown again for nothing", again.id === a.id && again.cached);
  now += 25 * 3_600_000;
  check("past the cache window it needs paying again", await status(scan.create(W1, C)) === 402);
  now = NOW;
  await scan.fail(b.id, "page didn't load");
  check("a failed scan gives the payment back", !(await pg.one<{ job_id: string | null }>("select job_id from mine.scan_payments where tx = ?", tx(3)))!.job_id);
  const c = await scan.create(W1, { kind: "site", target: "other.io" });
  check("the next scan spends that credit, no new transfer", c.paid_by === "flyai");

  // free scans
  const me2 = await scan.me(W2);
  check("a 200k holder has a free scan today", me2.free_today && me2.holding === 250_000);
  const f = await scan.create(W2, { kind: "contract", target: "0x" + "ee".repeat(20) });
  check("the free scan is used", f.paid_by === "free");
  check("one free scan a day", await status(scan.create(W2, { kind: "contract", target: "0x" + "ef".repeat(20) })) === 402);
  check("a small holder gets no free scan", !(await scan.me(W1)).free_today);

  // stale jobs
  const s1 = await scan.claim();      // c
  now += 11 * 60_000;
  const s2 = await scan.claim();
  check("a stale running job is claimed again", s2?.id === s1?.id && s2?.attempts === 2);
  now += 11 * 60_000;
  await scan.claim();
  const failedJob = await scan.job(s1!.id);
  check("after max attempts it fails and frees the payment", failedJob.status === "failed" &&
    !(await pg.one<{ job_id: string | null }>("select job_id from mine.scan_payments where tx = ?", tx(3)))!.job_id);

  // the bot
  const b1 = await scan.create(null, { kind: "contract", target: "0x" + "b1".repeat(20) }, true);
  await scan.create(null, { kind: "contract", target: "0x" + "b2".repeat(20) }, true);
  check("the bot scans without paying", b1.paid_by === "bot");
  check("the bot's daily cap", await status(scan.create(null, { kind: "contract", target: "0x" + "b3".repeat(20) }, true)) === 429);
  const r = await scan.recent();
  check("recent lists finished scans, newest first", r.scans.length === 2 && r.scans[0].id === nj.id && r.scans[1].id === a.id);
  check("bad ids are 404", await status(scan.job("nope")) === 404);
} finally {
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "all ok");
process.exit(failed ? 1 : 0);
