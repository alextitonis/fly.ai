/**
 * Fly Scan (2026-10-27, flytrade/SCAN-PLAN.md phase 4, the user: "can you just finish the code"): paste a token contract
 * or a website on /scan and get a report of what it can do to the people using it. The scanning itself is the scan
 * worker's (flytrade/scan/worker.py, its own fly app: contractscan.py and sitescan.py); this module takes the requests,
 * the payments and the reports.
 *
 * Paying (SCAN_PRICE_USD $0.50 in USDG, or SCAN_FLYAI_USD $0.30 worth of $FLYAI, on Robinhood Chain):
 *   - the signed-in wallet sends the amount to SCAN_PAY_TO and posts the tx hash. The transfer must come from that
 *     wallet, be at most TX_MAX_AGE old, and pays one scan: its hash is kept (mine.scan_payments). A scan that fails
 *     hands the payment back (job_id null) and the next scan of that wallet uses it, with no new transfer.
 *   - a wallet holding SCAN_FREE_MIN $FLYAI (held + staked) gets one free scan a UTC day.
 *   - a target scanned in the last CACHE_MS is shown again for nothing (reports are public), and one being scanned
 *     right now is joined, not paid twice.
 *
 *   GET  /api/scan/config                  prices, the $FLYAI amount for a scan now, where to pay, the chains
 *   GET  /api/scan/recent                  the latest finished scans (public)
 *   GET  /api/scan/job/<id>                one scan: status, and the report when done (public)
 *   GET  /api/scan/lookup?kind=&target=&chain=   the latest fresh report of a target, or null
 *   GET  /api/scan/me                      the signed-in wallet's scans, its free scan today, a payment to spend
 *   POST /api/scan { kind, target, chain?, tx? }   a new scan (signed in); 402 when it needs paying
 *   POST /api/scan/bot { kind, target, chain? }    the Discord bot's (x-scan-bot-token), SCAN_BOT_PER_DAY a day
 *   POST /api/scan/worker/claim            the worker takes the oldest queued job (Authorization: Bearer SCAN_WORKER_TOKEN)
 *   POST /api/scan/worker/done { id, verdict, title, report, cost_usd } | { id, error }
 *
 * Tables in flybook/supabase/migrations/20261027120000_mine_scan.sql.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Pg, Q } from "./pg.ts";
import type { Transfer } from "./orders.ts";

export const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const CHAINS = ["robinhood", "base", "bsc", "arbitrum"] as const;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-f]{64}$/;
const ID = /^[0-9a-z]{12}$/;
const E18 = 10n ** 18n;
const USDG_DECIMALS = 6;

export type ScanConfig = {
  payTo: string;
  priceUsd: number;              // in USDG
  flyaiUsd: number;              // the $FLYAI price of a scan, in USD
  slack: number;                 // a payment may come this much short (price moves between quote and send)
  freeMin: bigint;               // wei held + staked for the daily free scan
  cacheMs: number;
  txMaxAgeMs: number;
  maxRunMs: number;              // a running job older than this is retried (or failed)
  maxAttempts: number;
  workerToken: string | null;
  botToken: string | null;
  botPerDay: number;
};
export function scanConfig(env: NodeJS.ProcessEnv): ScanConfig {
  return {
    payTo: (env.SCAN_PAY_TO ?? "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea").toLowerCase(),   // the dev wallet, as the fees
    priceUsd: Number(env.SCAN_PRICE_USD ?? 0.5),
    flyaiUsd: Number(env.SCAN_FLYAI_USD ?? 0.3),
    slack: Number(env.SCAN_SLACK ?? 0.1),
    freeMin: BigInt(env.SCAN_FREE_MIN ?? 200_000) * E18,
    cacheMs: Number(env.SCAN_CACHE_HOURS ?? 24) * 3_600_000,
    txMaxAgeMs: Number(env.SCAN_TX_MAX_AGE_MIN ?? 120) * 60_000,
    maxRunMs: Number(env.SCAN_MAX_RUN_MIN ?? 10) * 60_000,
    maxAttempts: Number(env.SCAN_MAX_ATTEMPTS ?? 2),
    workerToken: env.SCAN_WORKER_TOKEN || null,
    botToken: env.SCAN_BOT_TOKEN || null,
    botPerDay: Number(env.SCAN_BOT_PER_DAY ?? 40),
  };
}

/** A target as it is scanned and looked up: a lowercased contract address on a known chain, or a website's URL
 *  (https unless it says http; no logins, ports, IPs or local names - the worker opens it). Throws why not. */
export function normalize(kind: string, raw: string, chain?: string | null): { kind: "contract" | "site"; target: string; chain: string | null } {
  const s = String(raw ?? "").trim();
  if (kind === "contract") {
    const a = s.toLowerCase();
    if (!ADDRESS.test(a)) throw new Error("not a contract address (0x and 40 hex characters)");
    const c = String(chain || "robinhood").toLowerCase();
    if (!(CHAINS as readonly string[]).includes(c)) throw new Error(`chain must be one of ${CHAINS.join(", ")}`);
    return { kind, target: a, chain: c };
  }
  if (kind !== "site") throw new Error("kind must be contract or site");
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new Error("not a website address"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("only http and https sites");
  if (u.username || u.password || u.port) throw new Error("no logins or ports in the address");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+)+$/.test(host) || host.includes("[")) throw new Error("not a public website address");
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet|fly\.dev\.internal)$/.test(host)) throw new Error("not a public website address");
  const path = u.pathname.replace(/\/+$/, "") || "";
  const target = `${u.protocol}//${host}${path}${u.search}`.slice(0, 400);
  return { kind: "site", target, chain: null };
}

/** Whether a transfer pays a scan: from the wallet, recent, and enough (in USD at the given $FLYAI price). */
export function payment(t: Transfer, wallet: string, token: "usdg" | "flyai", flyaiPrice: number | null, cfg: ScanConfig, now: number):
  { ok: true; usd: number } | { ok: false; why: string } {
  if (t.from.toLowerCase() !== wallet.toLowerCase()) return { ok: false, why: "that transfer came from another wallet" };
  if (now - t.at > cfg.txMaxAgeMs) return { ok: false, why: "that transfer is too old to pay a new scan" };
  if (token === "usdg") {
    const usd = Number(t.value) / 10 ** USDG_DECIMALS;
    return usd >= cfg.priceUsd * (1 - cfg.slack / 10) ? { ok: true, usd } : { ok: false, why: `a scan is ${cfg.priceUsd} USDG` };
  }
  if (!flyaiPrice) return { ok: false, why: "no $FLYAI price right now, pay in USDG or try again" };
  const usd = Number(t.value / 10n ** 12n) / 1e6 * flyaiPrice;
  return usd >= cfg.flyaiUsd * (1 - cfg.slack) ? { ok: true, usd } : { ok: false, why: `a scan is $${cfg.flyaiUsd} of $FLYAI` };
}

/** The $FLYAI a scan costs at a price, rounded up to a whole token. */
export const flyaiAmount = (cfg: ScanConfig, price: number | null) => (price ? Math.ceil(cfg.flyaiUsd / price) : null);

type Job = {
  id: string; kind: string; target: string; chain: string | null; status: string; wallet: string | null; paid_by: string;
  attempts: number; created_at: string; started_at: string | null; done_at: string | null; verdict: string | null;
  title: string | null; report: unknown; error: string | null; cost_usd: number;
};

export function createScan(d: {
  pg: Pg; cfg: ScanConfig;
  /** the token transfers to cfg.payTo in a tx (orders.transfersIn on Robinhood Chain): null while it isn't mined */
  transfersIn: (tx: string, token: string) => Promise<Transfer[] | null>;
  /** wei of $FLYAI held + staked */
  holdings: (wallet: string) => Promise<bigint>;
  flyaiPrice: () => Promise<number | null>;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage, limit?: number) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  now?: () => number;
}) {
  const { pg, cfg, HttpError } = d;
  const now = d.now ?? Date.now;
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const newId = () => {
    const b = randomBytes(12);
    return Array.from(b, (x) => "0123456789abcdefghijklmnopqrstuvwxyz"[x % 36]).join("");
  };
  const bearer = (req: IncomingMessage, token: string | null, header?: string) => {
    const got = String(header ? req.headers[header] ?? "" : (req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
    if (!token || got.length !== token.length || !timingSafeEqual(Buffer.from(got), Buffer.from(token))) throw new HttpError(401, "not allowed");
  };

  /** What anyone may see of a job (no wallet). */
  const pub = (j: Job) => ({
    id: j.id, kind: j.kind, target: j.target, chain: j.chain, status: j.status, verdict: j.verdict, title: j.title,
    created_at: j.created_at, done_at: j.done_at, report: j.status === "done" ? j.report : null,
    error: j.status === "failed" ? j.error : null,
  });

  async function fresh(q: Q, kind: string, target: string, chain: string | null): Promise<Job | undefined> {
    return q.one<Job>(`select * from mine.scan_jobs where kind = ? and target = ? and chain is not distinct from ?
      and (status in ('queued', 'running') or (status = 'done' and done_at > ?::timestamptz))
      order by created_at desc limit 1`, kind, target, chain, new Date(now() - cfg.cacheMs).toISOString());
  }

  async function config() {
    const price = await d.flyaiPrice().catch(() => null);
    return {
      pay_to: cfg.payTo, chain: "robinhood", chain_id: 4663, tokens: { usdg: USDG, flyai: FLYAI },
      price_usd: cfg.priceUsd, flyai_usd: cfg.flyaiUsd, flyai_price: price, flyai_amount: flyaiAmount(cfg, price),
      free_min: Number(cfg.freeMin / E18), chains: CHAINS, cache_hours: cfg.cacheMs / 3_600_000,
    };
  }

  /** Pay for a new scan inside the wallet's lock: a reused credit, a new transfer, or the free scan. */
  async function pay(q: Q, wallet: string, tx: string | null, jobId: string): Promise<"usdg" | "flyai" | "free"> {
    if (tx) {
      const used = await q.one<{ wallet: string; token: "usdg" | "flyai"; job_id: string | null }>(
        "select wallet, token, job_id from mine.scan_payments where tx = ?", tx);
      if (used) {
        if (used.job_id || used.wallet !== wallet) throw new HttpError(409, "that transfer already paid a scan");
        await q.run("update mine.scan_payments set job_id = ? where tx = ?", jobId, tx);
        return used.token;
      }
      for (const token of ["usdg", "flyai"] as const) {
        const got = await d.transfersIn(tx, token === "usdg" ? USDG : FLYAI);
        if (got === null) throw new HttpError(409, "that transfer isn't confirmed yet: try again in a few seconds");
        if (!got.length) continue;
        const price = token === "flyai" ? await d.flyaiPrice().catch(() => null) : null;
        const total = { ...got[0], value: got.reduce((s, t) => s + t.value, 0n) };
        const ok = payment(total, wallet, token, price, cfg, now());
        if (!ok.ok) throw new HttpError(402, ok.why);
        await q.run("insert into mine.scan_payments (tx, wallet, token, amount, usd, job_id) values (?, ?, ?, ?, ?, ?)",
          tx, wallet, token, total.value.toString(), ok.usd, jobId);
        return token;
      }
      throw new HttpError(402, "that transaction sent no USDG or $FLYAI to the scan wallet");
    }
    const credit = await q.one<{ tx: string; token: "usdg" | "flyai" }>(
      "select tx, token from mine.scan_payments where wallet = ? and job_id is null order by at limit 1", wallet);
    if (credit) {
      await q.run("update mine.scan_payments set job_id = ? where tx = ?", jobId, credit.tx);
      return credit.token;
    }
    if (!(await q.one("select 1 from mine.scan_free where wallet = ? and day = ?::date", wallet, today()))) {
      const held = await d.holdings(wallet).catch(() => 0n);
      if (held >= cfg.freeMin) {
        await q.run("insert into mine.scan_free (wallet, day, job_id) values (?, ?::date, ?)", wallet, today(), jobId);
        return "free";
      }
    }
    throw new HttpError(402, "payment required");
  }

  async function create(wallet: string | null, body: any, bot = false) {
    let n;
    try { n = normalize(body?.kind, body?.target, body?.chain); } catch (e) { throw new HttpError(400, (e as Error).message); }
    const tx = body?.tx ? String(body.tx).toLowerCase() : null;
    if (tx && !TX.test(tx)) throw new HttpError(400, "not a transaction hash");
    return pg.tx(async (q) => {
      const have = await fresh(q, n.kind, n.target, n.chain);
      if (have) return { id: have.id, status: have.status, cached: have.status === "done" };
      const id = newId();
      // the job row first (payments point at it), then the payment; a refused payment rolls both back
      await q.run(`insert into mine.scan_jobs (id, kind, target, chain, wallet, paid_by) values (?, ?, ?, ?, ?, 'bot')`,
        id, n.kind, n.target, n.chain, wallet);
      let paidBy: string = "bot";
      if (bot) {
        const used = await q.one<{ n: number }>(`select count(*)::int as n from mine.scan_jobs where paid_by = 'bot'
          and created_at >= ?::date`, today());
        if ((used?.n ?? 0) > cfg.botPerDay) throw new HttpError(429, "the bot's scans for today are used up");
      } else {
        paidBy = await pay(q, wallet!, tx, id);
        await q.run("update mine.scan_jobs set paid_by = ? where id = ?", paidBy, id);
      }
      return { id, status: "queued", cached: false, paid_by: paidBy };
    }, `scan:${wallet ?? "bot"}`, `scan:${n.kind}:${n.target}:${n.chain ?? ""}`);
  }

  /** The oldest queued job, now running; stale running jobs go back to the queue first (or fail after maxAttempts). */
  async function claim(): Promise<Job | null> {
    const stale = await pg.all<Job>(`select * from mine.scan_jobs where status = 'running' and started_at < ?::timestamptz`,
      new Date(now() - cfg.maxRunMs).toISOString());
    for (const j of stale) {
      if (j.attempts >= cfg.maxAttempts) await fail(j.id, "the scan didn't finish in time");
      else await pg.run("update mine.scan_jobs set status = 'queued' where id = ? and status = 'running'", j.id);
    }
    return pg.tx(async (q) => {
      const j = await q.one<Job>(`select * from mine.scan_jobs where status = 'queued' order by created_at limit 1 for update skip locked`);
      if (!j) return null;
      await q.run(`update mine.scan_jobs set status = 'running', started_at = ?::timestamptz, attempts = attempts + 1 where id = ?`,
        new Date(now()).toISOString(), j.id);
      return { ...j, status: "running", attempts: j.attempts + 1 };
    }, "scan:claim");
  }

  /** A job that couldn't be scanned: its payment (or free scan) goes back to the wallet. */
  async function fail(id: string, error: string) {
    await pg.tx(async (q) => {
      const n = await q.run(`update mine.scan_jobs set status = 'failed', error = ?, done_at = ?::timestamptz
        where id = ? and status in ('queued', 'running')`, error.slice(0, 300), new Date(now()).toISOString(), id);
      if (!n) return;
      await q.run("update mine.scan_payments set job_id = null where job_id = ?", id);
      await q.run("delete from mine.scan_free where job_id = ?", id);
    }, `scan:job:${id}`);
  }

  async function done(body: any) {
    const id = String(body?.id ?? "");
    if (!ID.test(id)) throw new HttpError(400, "bad id");
    if (body.error) { await fail(id, String(body.error)); return { ok: true }; }
    const verdict = String(body.verdict ?? "");
    if (!["danger", "caution", "clear", "unknown"].includes(verdict)) throw new HttpError(400, "bad verdict");
    const n = await pg.run(`update mine.scan_jobs set status = 'done', verdict = ?, title = ?, report = ?::text::jsonb,
      cost_usd = ?, done_at = ?::timestamptz, error = null where id = ? and status = 'running'`,
      // (jsonb refuses \u0000, which a hostile page can put in its own text)
      verdict, String(body.title ?? "").replace(/\0/g, "").slice(0, 160) || null,
      JSON.stringify(body.report ?? null).replace(/\\u0000/g, ""),
      Number(body.cost_usd) || 0, new Date(now()).toISOString(), id);
    return { ok: n > 0 };
  }

  async function job(id: string) {
    if (!ID.test(id)) throw new HttpError(404, "no such scan");
    const j = await pg.one<Job>("select * from mine.scan_jobs where id = ?", id);
    if (!j) throw new HttpError(404, "no such scan");
    const ahead = j.status === "queued" ? (await pg.one<{ n: number }>(`select count(*)::int as n from mine.scan_jobs
      where status in ('queued', 'running') and created_at < ?::timestamptz`, j.created_at))?.n ?? 0 : 0;
    return { ...pub(j), ahead };
  }

  async function recent() {
    const rows = await pg.all<Job>(`select * from mine.scan_jobs where status = 'done' order by done_at desc limit 20`);
    return { scans: rows.map((j) => ({ id: j.id, kind: j.kind, target: j.target, chain: j.chain, verdict: j.verdict, title: j.title, done_at: j.done_at })) };
  }

  async function me(wallet: string) {
    const jobs = await pg.all<Job>("select * from mine.scan_jobs where wallet = ? order by created_at desc limit 30", wallet);
    const credit = await pg.one<{ n: number }>("select count(*)::int as n from mine.scan_payments where wallet = ? and job_id is null", wallet);
    const usedFree = !!(await pg.one("select 1 from mine.scan_free where wallet = ? and day = ?::date", wallet, today()));
    const held = usedFree ? null : await d.holdings(wallet).catch(() => null);
    return {
      wallet, credits: credit?.n ?? 0, free_today: !usedFree && held !== null && held >= cfg.freeMin,
      free_used: usedFree, holding: held === null ? null : Number(held / E18),
      scans: jobs.map((j) => ({ id: j.id, kind: j.kind, target: j.target, chain: j.chain, status: j.status, verdict: j.verdict, title: j.title, created_at: j.created_at })),
    };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/scan/config") { d.send(res, 200, await config()); return true; }
    if (req.method === "GET" && p === "/api/scan/recent") { d.send(res, 200, await recent()); return true; }
    if (req.method === "GET" && p.startsWith("/api/scan/job/")) { d.send(res, 200, await job(p.slice("/api/scan/job/".length))); return true; }
    if (req.method === "GET" && p === "/api/scan/lookup") {
      let n;
      try { n = normalize(url.searchParams.get("kind") ?? "", url.searchParams.get("target") ?? "", url.searchParams.get("chain")); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      const j = await fresh(pg, n.kind, n.target, n.chain);
      d.send(res, 200, { normalized: n, scan: j ? pub(j) : null });
      return true;
    }
    if (req.method === "GET" && p === "/api/scan/me") { d.send(res, 200, await me(await d.sessionWallet(req))); return true; }
    if (req.method === "POST" && p === "/api/scan") {
      const wallet = (await d.sessionWallet(req)).toLowerCase();
      d.send(res, 200, await create(wallet, await d.readJson(req)));
      return true;
    }
    if (req.method === "POST" && p === "/api/scan/bot") {
      bearer(req, cfg.botToken, "x-scan-bot-token");
      d.send(res, 200, await create(null, await d.readJson(req), true));
      return true;
    }
    if (req.method === "POST" && p === "/api/scan/worker/claim") {
      bearer(req, cfg.workerToken);
      const j = await claim();
      d.send(res, 200, { job: j ? { id: j.id, kind: j.kind, target: j.target, chain: j.chain, attempts: j.attempts } : null });
      return true;
    }
    if (req.method === "POST" && p === "/api/scan/worker/done") {
      bearer(req, cfg.workerToken);
      d.send(res, 200, await done(await d.readJson(req, 1_000_000)));
      return true;
    }
    return false;
  }

  return { route, create, claim, done, fail, job, recent, me, config };
}
