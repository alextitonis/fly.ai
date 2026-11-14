/**
 * The Fly Pet Coach pass (2026-11-14, flytrade/COACH-PLAN.md; the user: "coach mode will be monthly pass", "both flyai &
 * USDG", "if they have staked tokens they take reduction", "can pay to add more after as on top"). Coach mode in Fly
 * Pet needs a live pass; the coach server (flytrade/coach, mounted in flyai-x402) asks GET /api/coach/pass/<wallet>.
 *
 *   GET  /api/coach/quote/<wallet>   -> prices for that wallet (its staker discount), where to pay, its pass now
 *   POST /api/coach/pay { tx, kind }  -> checks the payment on chain, writes it, the pass now   ("pass" | "topup")
 *   GET  /api/coach/pass/<wallet>    -> { active, period_start, period_end, until, hours }
 *
 * Paid from the buyer's own wallet: one transfer of USDG or $FLYAI on Robinhood Chain to PAY_TO. The pass is the
 * payer's (the transfer's `from`), so no sign-in is needed and nobody can buy for someone else by mistake. Each
 * transaction counts once (mine.coach_passes.tx unique). A pass is PASS_DAYS long with PASS_HOURS of Coach mode; one
 * bought while another runs starts when it ends. A top-up adds TOPUP_HOURS to the period running now (no pass, no
 * top-up). Prices are dollars: $FLYAI at its price when the payment is checked (PRICE_SLACK below the quote still
 * counts, the price moves between quote and payment). Stakers pay less (DISCOUNTS by staked + locked $FLYAI, read
 * then). All of it is env, so the prices can change without a deploy of anything else.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TX = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
export const TOKENS = {
  USDG: { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", decimals: 6 },
  FLYAI: { address: "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c", decimals: 18 },
} as const;
type Token = keyof typeof TOKENS;
type Receipt = { status: string; logs: { address: string; topics: string[]; data: string }[] } | null;

export interface CoachCfg {
  passUsd: number; passHours: number; passDays: number; topupUsd: number; topupHours: number;
  payTo: string; discounts: { min: number; off: number }[]; priceSlack: number;
}

export function coachConfig(env: Record<string, string | undefined>): CoachCfg {
  const discounts = JSON.parse(env.COACH_DISCOUNTS ?? '[{"min":100000,"off":10},{"min":1000000,"off":25},{"min":5000000,"off":40}]') as { min: number; off: number }[];
  if (!Array.isArray(discounts) || discounts.some((x) => !(x.min >= 0) || !(x.off >= 0 && x.off < 100))) throw new Error("COACH_DISCOUNTS: [{min, off}]");
  const payTo = (env.COACH_PAY_TO ?? env.PAY_TO ?? "0x625862521777e19ad54ce6c7abed9ca54d6589ea").toLowerCase();
  if (!ADDRESS.test(payTo)) throw new Error("COACH_PAY_TO: an address");
  return {
    passUsd: Number(env.COACH_PASS_USD ?? "5"), passHours: Number(env.COACH_PASS_HOURS ?? "30"), passDays: Number(env.COACH_PASS_DAYS ?? "30"),
    topupUsd: Number(env.COACH_TOPUP_USD ?? "2"), topupHours: Number(env.COACH_TOPUP_HOURS ?? "15"), payTo,
    discounts: [...discounts].sort((a, b) => a.min - b.min), priceSlack: Number(env.COACH_PRICE_SLACK ?? "0.05"),
  };
}

/** The discount (percent) for this much staked + locked $FLYAI (whole tokens). */
export function discountFor(cfg: CoachCfg, staked: number): number {
  let off = 0;
  for (const d of cfg.discounts) if (staked >= d.min) off = d.off;
  return off;
}

/** What `token` the receipt moved to `to`, per sender: [{from, units}] (raw units). */
export function paidIn(rec: Receipt, token: string, to: string): { from: string; units: bigint }[] {
  const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
  const by = new Map<string, bigint>();
  for (const l of rec?.logs ?? []) {
    if (l.address?.toLowerCase() === token && l.topics?.[0] === TRANSFER && l.topics.length === 3 && l.topics[2]?.toLowerCase() === pad(to)) {
      const from = `0x${l.topics[1]!.slice(-40)}`.toLowerCase();
      by.set(from, (by.get(from) ?? 0n) + BigInt(l.data));
    }
  }
  return [...by].map(([from, units]) => ({ from, units }));
}

export function createCoachPass(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  cfg: CoachCfg;
  /** $FLYAI's dollar price now */
  flyaiUsd: () => Promise<number>;
  /** staked + locked $FLYAI of a wallet, whole tokens (0 when unreadable) */
  stakeOf: (wallet: string) => Promise<number>;
  rpc?: string;
  receipt?: (tx: string) => Promise<Receipt>;
  now?: () => number;
}) {
  const { pg, HttpError, cfg } = d;
  const now = d.now ?? Date.now;
  const receipt = d.receipt ?? (async (tx: string) => {
    const r = await fetch(d.rpc ?? "https://rpc.mainnet.chain.robinhood.com", { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", "user-agent": "fly.ai coach" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }) });
    return (((await r.json()) as { result?: Receipt }).result ?? null);
  });

  async function status(wallet: string) {
    const w = wallet.toLowerCase();
    const rows = await pg.all<{ kind: string; hours: string; period_start: Date; period_end: Date }>(
      "select kind, hours, period_start, period_end from mine.coach_passes where wallet = ? and period_end > ? order by period_start", w, new Date(now()).toISOString());
    const t = now();
    const cur = rows.find((r) => r.kind === "pass" && new Date(r.period_start).getTime() <= t && new Date(r.period_end).getTime() > t);
    const until = rows.length ? Math.max(...rows.map((r) => new Date(r.period_end).getTime())) : null;
    if (!cur) return { active: false, period_start: null, period_end: null, until: until ? new Date(until).toISOString() : null, hours: 0 };
    const start = new Date(cur.period_start).getTime();
    const hours = rows.filter((r) => new Date(r.period_start).getTime() === start).reduce((s, r) => s + Number(r.hours), 0);
    return { active: true, period_start: new Date(start).toISOString(), period_end: new Date(cur.period_end).toISOString(),
             until: new Date(until!).toISOString(), hours };
  }

  async function quote(wallet: string) {
    const w = wallet.toLowerCase();
    if (!ADDRESS.test(w)) throw new HttpError(400, "a wallet address, please");
    const [px, staked, st] = await Promise.all([d.flyaiUsd().catch(() => 0), d.stakeOf(w).catch(() => 0), status(w)]);
    const off = discountFor(cfg, staked);
    const price = (usd: number) => {
      const u = Math.round(usd * (100 - off)) / 100;
      return { usd: u, usdg: u.toFixed(2), flyai: px > 0 ? Math.ceil(u / px) : null };
    };
    return {
      pass: { ...price(cfg.passUsd), hours: cfg.passHours, days: cfg.passDays },
      topup: { ...price(cfg.topupUsd), hours: cfg.topupHours },
      list: { pass: cfg.passUsd, topup: cfg.topupUsd },
      discount: { off, staked: Math.floor(staked), tiers: cfg.discounts },
      flyai_usd: px, pay_to: cfg.payTo, tokens: TOKENS, status: st,
    };
  }

  async function pay(body: any) {
    const tx = String(body?.tx ?? "").toLowerCase(), kind = body?.kind === "topup" ? "topup" : body?.kind === "pass" ? "pass" : null;
    if (!TX.test(tx)) throw new HttpError(400, "the payment transaction, please");
    if (!kind) throw new HttpError(400, 'kind: "pass" or "topup"');
    const used = await pg.one<{ n: number }>("select count(*)::int as n from mine.coach_passes where tx = ?", tx);
    if (used?.n) throw new HttpError(409, "this payment was already counted");
    const rec = await receipt(tx);
    if (!rec) throw new HttpError(409, "the payment isn't mined yet: try again in a moment");
    if (rec.status !== "0x1") throw new HttpError(400, "the payment failed on chain");
    let found: { token: Token; from: string; units: bigint } | null = null;
    for (const token of Object.keys(TOKENS) as Token[]) {
      const p = paidIn(rec, TOKENS[token].address, cfg.payTo)[0];
      if (p) { found = { token, ...p }; break; }
    }
    if (!found) throw new HttpError(400, `no USDG or $FLYAI sent to ${cfg.payTo} in that transaction`);
    const payer = found.from;
    const [px, staked] = await Promise.all([d.flyaiUsd().catch(() => 0), d.stakeOf(payer).catch(() => 0)]);
    const off = discountFor(cfg, staked);
    const need = Math.round((kind === "pass" ? cfg.passUsd : cfg.topupUsd) * (100 - off)) / 100;
    const amount = Number(found.units) / 10 ** TOKENS[found.token].decimals;
    let usd: number;
    if (found.token === "USDG") usd = amount;
    else {
      if (!(px > 0)) throw new HttpError(503, "no $FLYAI price right now: try again in a moment");
      usd = amount * px;
    }
    const slack = found.token === "USDG" ? 0.01 : cfg.priceSlack;
    if (usd < need * (1 - slack)) {
      throw new HttpError(400, `that paid $${usd.toFixed(2)}; the ${kind === "pass" ? "pass" : "top-up"} is $${need.toFixed(2)}`
        + (off ? ` after your ${off}% staker discount` : ""));
    }
    const hours = kind === "pass" ? cfg.passHours : cfg.topupHours;
    await pg.tx(async (q) => {
      const again = await q.one<{ n: number }>("select count(*)::int as n from mine.coach_passes where tx = ?", tx);
      if (again?.n) throw new HttpError(409, "this payment was already counted");
      let start: number, end: number;
      if (kind === "pass") {
        const last = await q.one<{ e: Date | null }>("select max(period_end) as e from mine.coach_passes where wallet = ? and kind = 'pass'", payer);
        start = Math.max(now(), last?.e ? new Date(last.e).getTime() : 0);
        end = start + cfg.passDays * 86_400_000;
      } else {
        const cur = await q.one<{ s: Date; e: Date }>(`select period_start as s, period_end as e from mine.coach_passes
          where wallet = ? and kind = 'pass' and period_start <= ? and period_end > ? order by period_start desc limit 1`,
          payer, new Date(now()).toISOString(), new Date(now()).toISOString());
        if (!cur) throw new HttpError(409, "a top-up adds hours to a running pass: get the pass first");
        start = new Date(cur.s).getTime(); end = new Date(cur.e).getTime();
      }
      await q.run(`insert into mine.coach_passes (wallet, kind, token, amount, usd, discount_pct, hours, tx, period_start, period_end)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, payer, kind, found!.token, amount.toString(), usd.toFixed(4), off, hours, tx,
        new Date(start).toISOString(), new Date(end).toISOString());
    }, `coachpass:${payer}`);
    return { wallet: payer, kind, token: found.token, usd: Number(usd.toFixed(2)), discount: off, hours, status: await status(payer) };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET" && (m = /^\/api\/coach\/quote\/(0x[0-9a-fA-F]{40})$/.exec(p))) return d.send(res, 200, await quote(m[1]!)), true;
    if (req.method === "GET" && (m = /^\/api\/coach\/pass\/(0x[0-9a-fA-F]{40})$/.exec(p))) return d.send(res, 200, await status(m[1]!)), true;
    if (req.method === "POST" && p === "/api/coach/pay") return d.send(res, 200, await pay(await d.readJson(req))), true;
    return false;
  }

  return { route, quote, pay, status };
}
