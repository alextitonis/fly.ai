/**
 * Fee drop (2026-11-06, the user: "every month all trading fees from pons will be split between holders (-10% that I
 * take extra) even my wallet ... percentages will be according to amount holding ... a smart contract and server will
 * be tracking (like the gta tracker) and will be showing in website in the claim page ... (in fly lock for a week)
 * they will be converted to the token from nvda"; a 1-2 month test, "start tracking from today"; split "by average
 * holding ... this way can attract people to add more").
 *
 * The drops: DROPS windows (November from 11-06, then December). Each drop's pot is the dev wallet's Pons creator fees
 * booked in its window (mine.gta_fees source 'pons': the GTA tracker keeps scanning them after its raffle ends; from
 * 11-06 the raffle no longer counts them, gta.ts ponsEnd) less KEEP (the user's 10%).
 *
 * The split: every SAMPLE_MS each known holder's $FLYAI - held + staked + FlyLock, the same reader as the GTA draw - is
 * added to its running sum; the average is sum / the drop's samples, so an hour holding nothing counts as 0 and buying
 * the day before the drop closes earns a day's worth. Holders whose average is MIN_HOLD (200k) or more split the pot
 * by their average. Never in it: the dev wallet (it pays the drop), the POOL wallet, the desk's house wallet, every fly
 * wallet (servers, not people), contracts (pools, lockers) and the burn address. The user's own wallet is in.
 *
 * Paying (once a drop ends): the team claims the fees, converts them to $FLYAI and closes the drop with the amount
 * (POST /api/admin/feedrop/close); scripts/pay-feedrop.ts then sends each share from the dev wallet through FlyLock
 * (lockFor: it shows on the Claim page and unlocks 7 days later) and books each one paid.
 *
 *   GET  /api/feedrop?wallet=0x..            the running drop (pot so far, holders in, top-10 share) and the wallet's
 *                                            average, share and estimate; past drops
 *   GET  /api/admin/feedrop?drop=1&flyai=N   the split as it stands (or as closed), N whole $FLYAI to share
 *   POST /api/admin/feedrop/close { drop, flyai }   freezes the split of an ended drop
 *   POST /api/admin/feedrop/paid { drop, wallet, tx } one share sent
 * Tables in flybook/supabase/migrations/20261106120000_mine_feedrop.sql. One tick every TICK_MS on the user process.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import type { Chain } from "./gta.ts";

export const KEEP = 0.10;                            // the user's cut of the fees
export const MIN_HOLD = 200_000;                     // whole $FLYAI, on average over the drop
export const SAMPLE_MS = 3_600_000;
const TICK_MS = 5 * 60_000;
const E14 = 10n ** 14n;
const ADDRESS = /^0x[0-9a-f]{40}$/;
/** never in the split: the dev wallet (it pays), POOL, the desk's house wallet, the locker, burn and zero */
const TEAM = [
  "0x625862521777e19ad54ce6c7abed9ca54d6589ea", "0xcca1ad591f6fe7e40e382639ad2551044fae6d36",
  "0x449f6228dec522bb36a69153c3f8e36a8a7852fb", "0x267444d099b10fb5ed7c3cc7b7c767adca574952",
  "0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000",
];

export type Drop = { n: number; start: number; end: number };
export type FeedropConfig = { drops: Drop[]; exclude: string[] };
export function feedropConfig(env: NodeJS.ProcessEnv): FeedropConfig {
  const start = Date.parse(env.FEEDROP_START ?? "2026-11-06T00:00:00Z");
  return {
    drops: [
      { n: 1, start, end: Date.parse("2026-12-01T00:00:00Z") },
      { n: 2, start: Date.parse("2026-12-01T00:00:00Z"), end: Date.parse("2027-01-01T00:00:00Z") },
    ],
    exclude: (env.FEEDROP_EXCLUDE ?? "").split(",").map((a) => a.trim().toLowerCase()).filter((a) => ADDRESS.test(a)),
  };
}

type Row = { address: string; avg: number };
export type Split = { holders: number; total: number; top10: number; rows: (Row & { share: number })[] };

/** The split among holders whose average reaches MIN_HOLD: each one's share of the total of averages. */
export function split(rows: Row[]): Split {
  const inn = rows.filter((r) => r.avg >= MIN_HOLD).sort((a, b) => b.avg - a.avg || a.address.localeCompare(b.address));
  const total = inn.reduce((s, r) => s + r.avg, 0);
  const out = inn.map((r) => ({ ...r, share: total > 0 ? r.avg / total : 0 }));
  return { holders: out.length, total, top10: out.slice(0, 10).reduce((s, r) => s + r.share, 0), rows: out };
}

export function createFeedrop(d: {
  pg: Pg; chain: Pick<Chain, "holdings" | "isContract">; cfg: FeedropConfig;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  isAdminToken: (req: IncomingMessage) => boolean;
  admins: string[];
  now?: () => number;
}) {
  const { pg, chain, cfg, HttpError } = d;
  const now = d.now ?? Date.now;
  const admins = new Set(d.admins.map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)));
  const dropAt = (ms: number) => cfg.drops.find((x) => x.start <= ms && ms < x.end) ?? null;
  const dropN = (n: number) => cfg.drops.find((x) => x.n === n) ?? null;

  async function excluded(): Promise<Set<string>> {
    const fly = await pg.all<{ address: string }>("select lower(address) as address from mine.vault_wallets").catch(() => []);
    return new Set([...TEAM, ...cfg.exclude, ...fly.map((r) => r.address)]);
  }

  async function dropRow(n: number) {
    await pg.run("insert into mine.feedrop_drops (drop) values (?) on conflict do nothing", n);
    return (await pg.one<{ samples: number; last_at: Date | null; closed_at: Date | null; flyai_total: number | null; fees_usd: number | null }>(
      "select samples, last_at, closed_at, flyai_total, fees_usd from mine.feedrop_drops where drop = ?", n))!;
  }

  /** One hourly sample: every known holder's $FLYAI added to its sum in the running drop. */
  async function sample(): Promise<boolean> {
    const t = now(), drop = dropAt(t);
    if (!drop) return false;
    const row = await dropRow(drop.n);
    if (row.last_at && t - new Date(row.last_at).getTime() < SAMPLE_MS - 60_000) return false;
    const out = await excluded();
    const all = (await pg.all<{ address: string }>("select address from mine.gta_holders order by address")).map((r) => r.address)
      .filter((a) => !out.has(a));
    const held = all.length ? await chain.holdings(all) : [];
    const addrs: string[] = [], amounts: number[] = [];
    for (let i = 0; i < all.length; i++) {
      if (held[i] > 0n) { addrs.push(all[i]); amounts.push(Number(held[i] / E14) / 10_000); }
    }
    await pg.run("update mine.feedrop_hold set last_flyai = 0 where drop = ?", drop.n);
    for (let i = 0; i < addrs.length; i += 1000) {
      await pg.run(`insert into mine.feedrop_hold (drop, address, sum_flyai, last_flyai)
        select ?, a, f, f from unnest(?::text[], ?::float8[]) as x(a, f)
        on conflict (drop, address) do update set sum_flyai = mine.feedrop_hold.sum_flyai + excluded.sum_flyai,
          last_flyai = excluded.last_flyai`, drop.n, `{${addrs.slice(i, i + 1000).join(",")}}`, `{${amounts.slice(i, i + 1000).join(",")}}`);
    }
    await pg.run("update mine.feedrop_drops set samples = samples + 1, last_at = ? where drop = ?", new Date(t).toISOString(), drop.n);
    return true;
  }

  /** Every holder's average in a drop, contracts learned (once each) for those that reach the minimum. */
  async function averages(n: number): Promise<{ samples: number; rows: Row[] }> {
    const { samples } = await dropRow(n);
    if (!samples) return { samples: 0, rows: [] };
    const out = await excluded();
    const rows = await pg.all<{ address: string; sum_flyai: number; contract: boolean | null }>(
      "select address, sum_flyai, contract from mine.feedrop_hold where drop = ? and sum_flyai >= ?", n, MIN_HOLD * samples);
    const kept: Row[] = [];
    for (const r of rows) {
      if (out.has(r.address)) continue;
      let contract = r.contract;
      if (contract === null) {
        contract = await chain.isContract(r.address);
        await pg.run("update mine.feedrop_hold set contract = ? where drop = ? and address = ?", contract, n, r.address);
      }
      if (!contract) kept.push({ address: r.address, avg: Number(r.sum_flyai) / samples });
    }
    return { samples, rows: kept };
  }

  async function feesUsd(drop: Drop): Promise<number> {
    const r = await pg.one<{ usd: number | null }>("select sum(usd)::float8 as usd from mine.gta_fees where source = 'pons' and at >= ? and at < ?",
      new Date(drop.start).toISOString(), new Date(drop.end).toISOString());
    return Number(r?.usd ?? 0);
  }

  let cache: { at: number; body: any } | null = null;
  async function overview() {
    if (cache && now() - cache.at < 60_000) return cache.body;
    const t = now();
    const drop = dropAt(t) ?? [...cfg.drops].reverse().find((x) => x.end <= t) ?? cfg.drops[0];
    const { samples, rows } = await averages(drop.n);
    const s = split(rows);
    const fees = await feesUsd(drop);
    const past = [];
    for (const x of cfg.drops.filter((x) => x.end <= t)) {
      const r = await dropRow(x.n);
      const paid = await pg.one<{ n: number; total: number }>("select count(*)::int as n, count(*) filter (where paid_at is not null)::int as total from mine.feedrop_payouts where drop = ?", x.n);
      const xFees = r.fees_usd ?? await feesUsd(x);
      past.push({ n: x.n, start: x.start, end: x.end, closed: !!r.closed_at, fees_usd: xFees, pot_usd: xFees * (1 - KEEP),
        flyai: r.flyai_total, holders: paid?.n ?? 0, paid: paid?.total ?? 0 });
    }
    const body = {
      drop: { n: drop.n, start: drop.start, end: drop.end, samples, live: t >= drop.start && t < drop.end },
      fees_usd: fees, keep_pct: KEEP * 100, pot_usd: fees * (1 - KEEP), min_flyai: MIN_HOLD,
      holders: s.holders, top10_pct: s.top10 * 100, past,
      _rows: new Map(s.rows.map((r) => [r.address, r])),
    };
    cache = { at: t, body };
    return body;
  }

  async function standing(wallet: string) {
    const o = await overview();
    const n = o.drop.n;
    const { samples } = await dropRow(n);
    const h = await pg.one<{ sum_flyai: number; last_flyai: number }>(
      "select sum_flyai, last_flyai from mine.feedrop_hold where drop = ? and address = ?", n, wallet);
    const avg = h && samples ? Number(h.sum_flyai) / samples : 0;
    const out = (await excluded()).has(wallet);
    const r = o._rows.get(wallet);
    const payout = await pg.one<{ flyai: number; tx: string | null; paid_at: Date | null; drop: number }>(
      "select drop, flyai, tx, paid_at from mine.feedrop_payouts where address = ? order by drop desc limit 1", wallet);
    return {
      avg_flyai: avg, now_flyai: Number(h?.last_flyai ?? 0), eligible: !!r, excluded: out,
      share_pct: r ? r.share * 100 : 0, est_usd: r ? r.share * o.pot_usd : 0,
      last_payout: payout ? { drop: payout.drop, flyai: payout.flyai, tx: payout.tx, paid: !!payout.paid_at } : null,
    };
  }

  async function isAdmin(req: IncomingMessage): Promise<boolean> {
    if (d.isAdminToken(req)) return true;
    try { return admins.has((await d.sessionWallet(req)).toLowerCase()); } catch { return false; }
  }

  /** The split of a drop for `flyai` whole $FLYAI: the frozen payouts once closed, else as it stands. */
  async function payoutList(n: number, flyai: number) {
    const closed = await pg.all<{ address: string; avg_flyai: number; share: number; flyai: number; tx: string | null; paid_at: Date | null }>(
      "select address, avg_flyai, share, flyai, tx, paid_at from mine.feedrop_payouts where drop = ? order by flyai desc", n);
    if (closed.length) return { closed: true, rows: closed.map((r) => ({ ...r, paid: !!r.paid_at })) };
    const s = split((await averages(n)).rows);
    return { closed: false, rows: s.rows.map((r) => ({ address: r.address, avg_flyai: r.avg, share: r.share, flyai: r.share * flyai, tx: null, paid: false })) };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/feedrop") {
      const o = await overview();
      const wallet = (url.searchParams.get("wallet") ?? "").toLowerCase();
      const { _rows, ...pub } = o;
      d.send(res, 200, { ...pub, ...(ADDRESS.test(wallet) ? { me: await standing(wallet) } : {}) });
      return true;
    }
    if (!p.startsWith("/api/admin/feedrop")) return false;
    if (!(await isAdmin(req))) throw new HttpError(403, "admins only");
    if (req.method === "GET" && p === "/api/admin/feedrop") {
      const n = Number(url.searchParams.get("drop") ?? (dropAt(now())?.n ?? 1));
      const drop = dropN(n);
      if (!drop) throw new HttpError(404, "no such drop");
      const flyai = Number(url.searchParams.get("flyai") ?? 0);
      d.send(res, 200, { drop: n, fees_usd: await feesUsd(drop), keep_pct: KEEP * 100, ...(await payoutList(n, flyai)) });
      return true;
    }
    if (req.method === "POST" && p === "/api/admin/feedrop/close") {
      const b = await d.readJson(req);
      const drop = dropN(Number(b?.drop));
      const flyai = Number(b?.flyai);
      if (!drop) throw new HttpError(400, "drop: 1 or 2");
      if (!(flyai > 0)) throw new HttpError(400, "flyai: the whole $FLYAI to share, above 0");
      if (now() < drop.end) throw new HttpError(409, "this drop hasn't ended yet");
      if ((await dropRow(drop.n)).closed_at) throw new HttpError(409, "already closed");
      const s = split((await averages(drop.n)).rows);
      if (!s.rows.length) throw new HttpError(409, "nobody reached the minimum");
      for (const r of s.rows) {
        await pg.run("insert into mine.feedrop_payouts (drop, address, avg_flyai, share, flyai) values (?, ?, ?, ?, ?)",
          drop.n, r.address, r.avg, r.share, r.share * flyai);
      }
      await pg.run("update mine.feedrop_drops set closed_at = ?, flyai_total = ?, fees_usd = ? where drop = ?",
        new Date(now()).toISOString(), flyai, await feesUsd(drop), drop.n);
      cache = null;
      d.send(res, 200, { drop: drop.n, holders: s.rows.length, flyai });
      return true;
    }
    if (req.method === "POST" && p === "/api/admin/feedrop/paid") {
      const b = await d.readJson(req);
      const wallet = String(b?.wallet ?? "").toLowerCase(), tx = String(b?.tx ?? "");
      if (!ADDRESS.test(wallet) || !/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new HttpError(400, "wallet and tx, please");
      const r = await pg.one<{ address: string }>(`update mine.feedrop_payouts set tx = ?, paid_at = now()
        where drop = ? and address = ? and paid_at is null returning address`, tx, Number(b?.drop), wallet);
      if (!r) throw new HttpError(404, "no unpaid share for that wallet in that drop");
      cache = null;
      d.send(res, 200, { ok: true });
      return true;
    }
    return false;
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      if (await sample()) cache = null;
    } catch (err) {
      console.error(`feedrop: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  return {
    route, sample, averages, overview, standing,
    start() { void tick(); setInterval(() => void tick(), TICK_MS); },
  };
}
