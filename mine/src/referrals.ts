/**
 * Referrals (2026-10-15, the user: "make urls that can add automatically, otherwise can set in profile for new (check
 * not old accounts cant set), it's not changable after set so you get 0.5% of each refferal fees (either from fly desk
 * or from individual traders) and some milestones"). The rule itself (cuts, tiers, who pays) is flytrade/desk/referrals.py;
 * the Fly Wallets pay a referrer's cut with each withdrawal's profit fee and the Fly Desk in its weekly payout (fly #0's
 * leaf on the Claim page); mining pays 0.5% of each referred miner's month on top, in the month's snapshot
 * (payouts.withReferrals, 2026-10-16). This module owns the links and the tables.
 *
 *   GET  /api/referral                 -> the signed-in wallet's code, its referrer, whether it may still set one, its
 *                                         referrals (real or not), tier and earnings
 *   POST /api/referral { code, via }   -> set the signed-in wallet's referrer, once; via "link" (the ?ref= the site kept)
 *                                         or "profile" (typed: a code or a nickname)
 *   GET  /api/referral/tiers           -> the tiers, for the page signed out
 *   GET  /api/referral/who?code=x      -> who a code belongs to (nickname or short address), for "invited by"
 *
 * Who may be referred: a NEW wallet - one the site first met after referrals launched (mine.wallets_seen: every wallet
 * known before is "old"), within NEW_FOR_DAYS of that, with no referrer yet. Never changed after.
 * A REAL referral (counts toward a tier): >= REAL_MIN_USD put into Fly Wallets and kept REAL_DAYS days running, or a
 * Fly Desk payout. Checked hourly (qualify).
 */
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export type ReferralsDeps = {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
};

// mirrored from flytrade/desk/referrals.py TIERS: [real referrals at least, cut % of profit, off the referrer's own fee]
export const TIERS: [number, number, number][] = [[0, 0.5, 0], [10, 0.75, 0.1], [25, 1, 0.25], [50, 1.25, 0.5]];
export const NEW_FOR_DAYS = 14;
export const REAL_MIN_USD = 20;
export const REAL_DAYS = 7;
const CODE = /^[a-z0-9]{6,12}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";   // no 0/o, 1/l/i: read aloud or typed from a screenshot

export function tierOf(real: number) {
  let t = TIERS[0];
  for (const x of TIERS) if (real >= x[0]) t = x;
  const next = TIERS.find((x) => x[0] > real) ?? null;
  const shape = (x: [number, number, number]) => ({ at: x[0], cut_pct: x[1], fee_discount: x[2] });
  return { tier: shape(t), next: next ? shape(next) : null };
}

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export function createReferrals(d: ReferralsDeps) {
  const { pg, HttpError } = d;

  /** The wallet's own code, made on first ask. */
  async function codeOf(wallet: string): Promise<string> {
    const had = await pg.one<{ code: string }>("select code from mine.ref_codes where wallet = ?", wallet);
    if (had) return had.code;
    for (let i = 0; i < 8; i++) {
      const code = Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
      const n = await pg.run("insert into mine.ref_codes (wallet, code) values (?, ?) on conflict do nothing", wallet, code);
      if (n) return code;
      const now = await pg.one<{ code: string }>("select code from mine.ref_codes where wallet = ?", wallet);
      if (now) return now.code;                       // made at the same moment by another request
    }
    throw new HttpError(500, "couldn't make a code; try again");
  }

  /** A typed or linked code (or a nickname, typed in the profile) -> the wallet it names, or null. */
  async function resolve(raw: unknown): Promise<string | null> {
    const s = String(raw ?? "").trim();
    if (!s || s.length > 40) return null;
    const code = s.toLowerCase();
    if (CODE.test(code)) {
      const row = await pg.one<{ wallet: string }>("select wallet from mine.ref_codes where code = ?", code);
      if (row) return row.wallet;
    }
    if (ADDRESS.test(code)) return null;              // a raw address isn't a code: nobody shares those by accident
    const nick = await pg.one<{ wallet: string }>("select wallet from mine.profiles where lower(nickname) = lower(?)", s);
    return nick?.wallet ?? null;
  }

  /** Why this wallet can't be referred any more, or null if it can. */
  async function whyNot(me: string): Promise<string | null> {
    const set = await pg.one<{ referrer: string }>("select referrer from mine.referrals where wallet = ?", me);
    if (set) return "set";
    const seen = await pg.one<{ old: boolean; fresh: boolean }>(`select old,
      first_seen > now() - interval '${NEW_FOR_DAYS} days' as fresh from mine.wallets_seen where wallet = ?`, me);
    if (!seen || seen.old) return "old";              // (no row: signed in before this existed, so old too)
    if (!seen.fresh) return "late";
    return null;
  }

  async function mine(req: IncomingMessage) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const [code, ref, why, refs, earned, recent] = await Promise.all([
      codeOf(me),
      pg.one<{ referrer: string; via: string; set_at: string; nickname: string | null }>(`select r.referrer, r.via, r.set_at,
        p.nickname from mine.referrals r left join mine.profiles p on p.wallet = r.referrer where r.wallet = ?`, me),
      whyNot(me),
      pg.all<{ wallet: string; set_at: string; qualified_at: string | null; funded_since: string | null; nickname: string | null; usd: number | null }>(
        `select r.wallet, r.set_at, r.qualified_at, r.funded_since, p.nickname,
           (select sum(e.usd) from mine.ref_earnings e where e.referrer = r.referrer and e.wallet = r.wallet) as usd
         from mine.referrals r left join mine.profiles p on p.wallet = r.wallet
         where r.referrer = ? order by r.set_at desc limit 500`, me),
      pg.all<{ source: string; usd: number }>("select source, coalesce(sum(usd), 0) as usd from mine.ref_earnings where referrer = ? group by source", me),
      pg.all<{ at: string; source: string; usd: number; wallet: string; tx_hash: string | null; epoch: number | null; month: string | null }>(
        `select at, source, usd, wallet, tx_hash, epoch, detail->>'month' as month from mine.ref_earnings where referrer = ? order by at desc limit 20`, me),
    ]);
    const real = refs.filter((r) => r.qualified_at).length;
    const by = Object.fromEntries(earned.map((e) => [e.source, Number(e.usd) || 0]));
    const name = (w: string, nick: string | null) => nick ?? short(w);
    const nickOf = new Map(refs.map((r) => [r.wallet, r.nickname]));
    return {
      wallet: me, code, link: `/?ref=${code}`,
      referrer: ref ? { name: name(ref.referrer, ref.nickname), via: ref.via, since: ref.set_at } : null,
      can_set: why === null, why_not: why, new_for_days: NEW_FOR_DAYS,
      total: refs.length, real, ...tierOf(real),
      earned: { wallet_usd: by.wallet ?? 0, desk_usd: by.desk ?? 0, mining_usd: by.mining ?? 0,
        total_usd: (by.wallet ?? 0) + (by.desk ?? 0) + (by.mining ?? 0) },
      referred: refs.map((r) => ({ name: name(r.wallet, r.nickname), since: r.set_at, real: !!r.qualified_at,
        funded: !!r.funded_since, earned_usd: Number(r.usd) || 0 })),
      recent: recent.map((e) => ({ at: e.at, source: e.source, usd: Number(e.usd) || 0, from: name(e.wallet, nickOf.get(e.wallet) ?? null),
        tx: e.tx_hash, epoch: e.epoch, month: e.month })),
      rules: { real_min_usd: REAL_MIN_USD, real_days: REAL_DAYS },
    };
  }

  async function set(req: IncomingMessage, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const via = body?.via === "link" ? "link" : "profile";
    const referrer = await resolve(body?.code);
    if (!referrer) throw new HttpError(404, "no one has that code");
    if (referrer === me) throw new HttpError(400, "that's your own code");
    const why = await whyNot(me);
    if (why === "set") throw new HttpError(409, "your referrer is already set and can't be changed");
    if (why === "old") throw new HttpError(403, "referrals are for new accounts only");
    if (why === "late") throw new HttpError(403, `a referrer can only be added in your first ${NEW_FOR_DAYS} days`);
    const loop = await pg.one<{ wallet: string }>("select wallet from mine.referrals where wallet = ? and referrer = ?", referrer, me);
    if (loop) throw new HttpError(400, "you referred them: they can't refer you back");
    const n = await pg.run("insert into mine.referrals (wallet, referrer, via) values (?, ?, ?) on conflict do nothing", me, referrer, via);
    if (!n) throw new HttpError(409, "your referrer is already set and can't be changed");
    return mine(req);
  }

  async function who(code: string) {
    const w = await resolve(code);
    if (!w) return { ok: false };
    const p = await pg.one<{ nickname: string }>("select nickname from mine.profiles where wallet = ?", w);
    return { ok: true, name: p?.nickname ?? short(w) };
  }

  /** A wallet's first sign-in (server.ts startSession): from then on it's known, and new if it wasn't before. */
  async function seen(wallet: string) {
    await pg.run("insert into mine.wallets_seen (wallet) values (?) on conflict do nothing", wallet.toLowerCase());
  }

  /** Hourly: who holds >= REAL_MIN_USD in Fly Wallets (since when), who kept it REAL_DAYS days, who the desk paid. */
  async function qualify() {
    await pg.run(`update mine.referrals r set funded_since = case when f.usd >= ${REAL_MIN_USD} then coalesce(r.funded_since, now()) end
      from (select r2.wallet, (select coalesce(sum(l.principal_usd), 0) from mine.vault_ledger l where lower(l.holder) = r2.wallet) as usd
            from mine.referrals r2 where r2.qualified_at is null) f
      where r.wallet = f.wallet`);
    await pg.run(`update mine.referrals set qualified_at = now()
      where qualified_at is null and funded_since <= now() - interval '${REAL_DAYS} days'`);
    const desk = await pg.one<{ ok: boolean }>("select to_regclass('public.desk_epochs') is not null as ok");
    if (desk?.ok) {
      await pg.run(`update mine.referrals r set qualified_at = now() where r.qualified_at is null and exists (
        select 1 from public.desk_epochs e, jsonb_array_elements(coalesce(e.tree->'leaves', '[]'::jsonb)) l
        where e.ends > r.set_at and lower(l->>'account') = r.wallet and (l->>'fly')::int <> 0
          and coalesce((l->>'epoch_wei')::numeric, 0) > 0)`);
    }
  }
  /** Once at start: every wallet the Fly Desk paid before referrals launched (the migration's moment: the old rows'
   *  first_seen) is old too, signed in or not. A wallet the site already met keeps its row. */
  async function backfillDesk() {
    const desk = await pg.one<{ ok: boolean }>("select to_regclass('public.desk_epochs') is not null as ok");
    if (!desk?.ok) return;
    await pg.run(`insert into mine.wallets_seen (wallet, old)
      select distinct lower(l->>'account'), true
        from public.desk_epochs e, jsonb_array_elements(coalesce(e.tree->'leaves', '[]'::jsonb)) l
       where (l->>'account') ~* '^0x[0-9a-f]{40}$'
         and e.ends <= coalesce((select min(first_seen) from mine.wallets_seen where old), now())
      on conflict (wallet) do nothing`);
  }
  function start(everyMs = 3_600_000) {
    void backfillDesk().catch((err) => console.error("referrals backfill:", err instanceof Error ? err.message : err));
    const tick = () => void qualify().catch((err) => console.error("referrals qualify:", err instanceof Error ? err.message : err));
    setTimeout(tick, 60_000).unref();
    setInterval(tick, everyMs).unref();
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/referral/tiers") {
      return d.send(res, 200, { tiers: TIERS.map(([at, cut_pct, fee_discount]) => ({ at, cut_pct, fee_discount })),
        new_for_days: NEW_FOR_DAYS, real_min_usd: REAL_MIN_USD, real_days: REAL_DAYS }), true;
    }
    if (req.method === "GET" && p === "/api/referral/who") return d.send(res, 200, await who(url.searchParams.get("code") ?? "")), true;
    if (p === "/api/referral") {
      if (req.method === "GET") return d.send(res, 200, await mine(req)), true;
      if (req.method === "POST") return d.send(res, 200, await set(req, await d.readJson(req))), true;
    }
    return false;
  }

  return { route, seen, qualify, start, codeOf, tierOf, backfillDesk };
}
