/**
 * Ambassadors (2026-11-09, flytrade/AMBASSADOR-PLAN.md; the user: "few/invited only 3-5 people, preferably also people
 * speaking foreign languages; soulbound ambassador badge, discord role & early access, also EXP from that badge;
 * payments via results/referrals" and "a page that shows the ambassador, what they get ... and application form").
 *
 * An ambassador is a wallet holding FlyBadges #12 (granted by the dev wallet, never claimable: badges.ts). This module:
 *   GET  /api/ambassadors                 the current ambassadors (badge holders) with their language, and the perks
 *   GET  /api/ambassadors/me              the signed-in wallet: ambassador or not, and its application if it sent one
 *   POST /api/ambassadors/apply           { name, x, telegram, lang, community, why } one application per wallet
 *                                         (sending again replaces it), stored in mine.badge_state
 *   GET  /api/ambassadors/applications    admin (Bearer ADMIN_TOKEN): every application, newest first
 *
 * Their referral tier (the top one, whatever their count) is in referrals.ts (mine) and flytrade/desk/referrals.py
 * (the fee legs and the Fly Desk payout); the badge's daily XP is in xp.ts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export const AMBASSADOR_BADGE = 12;
/** the referral count an ambassador's tier is worked out from (the top tier: 50 real referrals) */
export const AMBASSADOR_REAL = 50;
export const LANGS = ["en", "zh", "ko", "tr", "es", "other"] as const;
const APP_KEY = "ambassador_app:";
const MAX = { name: 60, x: 40, telegram: 40, community: 400, why: 800 } as const;

export type Application = {
  wallet: string; name: string; x: string; telegram: string; lang: (typeof LANGS)[number]; community: string; why: string; at: number;
};

export function createAmbassadors(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  isAdmin: (req: IncomingMessage) => boolean;
  now?: () => number;
}) {
  const { pg } = d;
  const now = d.now ?? Date.now;

  /** the wallets holding badge #12 right now (badges.ts keeps mine.badge_claims in step with the chain, revokes too) */
  async function holders(): Promise<{ wallet: string; since: string }[]> {
    return pg.all<{ wallet: string; since: string }>(
      "select wallet, at as since from mine.badge_claims where badge = ? order by at", AMBASSADOR_BADGE).catch(() => []);
  }
  async function isAmbassador(wallet: string): Promise<boolean> {
    return !!(await pg.one("select 1 from mine.badge_claims where badge = ? and wallet = ?", AMBASSADOR_BADGE, wallet.toLowerCase()).catch(() => null));
  }
  async function appOf(wallet: string): Promise<Application | null> {
    return (await pg.one<{ value: Application }>("select value from mine.badge_state where key = ?", APP_KEY + wallet))?.value ?? null;
  }

  async function list() {
    const hs = await holders();
    const out = [];
    for (const h of hs) {
      const [app, prof] = await Promise.all([
        appOf(h.wallet),
        pg.one<{ nickname: string | null }>("select nickname from mine.profiles where wallet = ?", h.wallet).catch(() => null),
      ]);
      out.push({ wallet: h.wallet, since: h.since, name: prof?.nickname ?? null, lang: app?.lang ?? null, x: app?.x || null });
    }
    return { badge: AMBASSADOR_BADGE, ambassadors: out, perks: { referral_tier_at: AMBASSADOR_REAL } };
  }

  const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  const handle = (v: unknown) => clean(v, 40).replace(/^@+/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "").replace(/[^A-Za-z0-9_]/g, "");

  async function apply(req: IncomingMessage) {
    const wallet = (await d.sessionWallet(req)).toLowerCase();
    const b = await d.readJson(req);
    const app: Application = {
      wallet, name: clean(b?.name, MAX.name), x: handle(b?.x), telegram: handle(b?.telegram),
      lang: (LANGS as readonly string[]).includes(b?.lang) ? b.lang : "other",
      community: clean(b?.community, MAX.community), why: clean(b?.why, MAX.why), at: now(),
    };
    if (!app.name) throw new d.HttpError(400, "add your name");
    if (!app.x && !app.telegram) throw new d.HttpError(400, "add your X or Telegram so we can reach you");
    if (app.why.length < 20) throw new d.HttpError(400, "tell us a bit more about why (20+ characters)");
    await pg.run(`insert into mine.badge_state (key, value) values (?, ?::text::jsonb)
      on conflict (key) do update set value = excluded.value`, APP_KEY + wallet, JSON.stringify(app));
    return { ok: true, application: app };
  }

  async function applications() {
    const rows = await pg.all<{ value: Application }>("select value from mine.badge_state where key like ?", APP_KEY + "%");
    const amb = new Set((await holders()).map((h) => h.wallet));
    return { applications: rows.map((r) => ({ ...r.value, ambassador: amb.has(r.value.wallet) })).sort((a, b) => b.at - a.at) };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (!p.startsWith("/api/ambassadors")) return false;
    if (req.method === "GET" && p === "/api/ambassadors") return d.send(res, 200, await list()), true;
    if (req.method === "GET" && p === "/api/ambassadors/me") {
      const w = (await d.sessionWallet(req)).toLowerCase();
      return d.send(res, 200, { wallet: w, ambassador: await isAmbassador(w), application: await appOf(w) }), true;
    }
    if (req.method === "POST" && p === "/api/ambassadors/apply") return d.send(res, 200, await apply(req)), true;
    if (req.method === "GET" && p === "/api/ambassadors/applications") {
      if (!d.isAdmin(req)) throw new d.HttpError(403, "admin only");
      return d.send(res, 200, await applications()), true;
    }
    return false;
  }

  return { route, list, apply, applications, isAmbassador, holders };
}
