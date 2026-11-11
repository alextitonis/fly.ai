/**
 * Team reports (2026-11-11; the user: "a dashboard for the ambassadors/team so they report what they did, so i can be
 * checking without having to ask each time", "for other team members too, not just ambassadors, hidden by general
 * website, only the wallets i allow to auth will be able to do"; fields: what I did + links).
 *
 * The page is docs/team.html (noindex, not in the nav or sitemap). Members are an allowlist the admins keep; admins are
 * the BOUNTY_ADMINS wallets (signed in) or the ADMIN_TOKEN. Everything lives in mine.badge_state (no migration):
 *   team_members                   { [wallet]: { name, added_at } }
 *   team_report:<at>:<rand>        one report
 *
 *   GET  /api/team/me                    { wallet, member, admin, name }
 *   POST /api/team/report                member: { what, links } -> the report
 *   POST /api/team/report/delete         member: { id } (their own; admins any)
 *   GET  /api/team/reports?wallet=&days= member: their own; admin: everyone's (newest first) + the members with counts
 *   POST /api/team/members               admin: { wallet, name } add or rename
 *   POST /api/team/members/remove        admin: { wallet } (their reports stay)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { Pg } from "./pg.ts";

const MEMBERS_KEY = "team_members";
const REPORT_KEY = "team_report:";
const MAX_WHAT = 3000;
const MAX_LINKS = 15;
const WALLET = /^0x[0-9a-f]{40}$/;

export type Member = { name: string; added_at: number };
export type Report = { id: string; wallet: string; what: string; links: string[]; at: number };

export function createTeam(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  isAdminToken: (req: IncomingMessage) => boolean;
  admins: string[];
  now?: () => number;
}) {
  const { pg, HttpError } = d;
  const now = d.now ?? Date.now;
  const admins = new Set(d.admins.map((w) => w.trim().toLowerCase()).filter((w) => WALLET.test(w)));

  async function members(): Promise<Record<string, Member>> {
    return (await pg.one<{ value: Record<string, Member> }>("select value from mine.badge_state where key = ?", MEMBERS_KEY))?.value ?? {};
  }
  async function saveMembers(m: Record<string, Member>) {
    await pg.run(`insert into mine.badge_state (key, value) values (?, ?::text::jsonb)
      on conflict (key) do update set value = excluded.value`, MEMBERS_KEY, JSON.stringify(m));
  }

  /** who the request is: the admin token counts as an admin with no wallet */
  async function who(req: IncomingMessage): Promise<{ wallet: string | null; admin: boolean; member: boolean; name: string | null }> {
    if (d.isAdminToken(req) && !req.headers["x-flyai-session"]) return { wallet: null, admin: true, member: false, name: null };
    const wallet = (await d.sessionWallet(req)).toLowerCase();
    const m = (await members())[wallet];
    const admin = admins.has(wallet) || d.isAdminToken(req);
    return { wallet, admin, member: !!m || admin, name: m?.name ?? null };
  }
  async function memberOnly(req: IncomingMessage) {
    const w = await who(req);
    if (!w.member && !w.admin) throw new HttpError(403, "this wallet isn't on the team list");
    return w;
  }
  async function adminOnly(req: IncomingMessage) {
    const w = await who(req);
    if (!w.admin) throw new HttpError(403, "admins only");
    return w;
  }

  const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
  function links(v: unknown): string[] {
    const raw = Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/);
    const out: string[] = [];
    for (const x of raw) {
      const s = String(x ?? "").trim();
      if (!s) continue;
      let u: URL;
      try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new HttpError(400, `not a link: ${s.slice(0, 80)}`); }
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new HttpError(400, `not a link: ${s.slice(0, 80)}`);
      if (!u.hostname.includes(".")) throw new HttpError(400, `not a link: ${s.slice(0, 80)}`);
      const href = u.href.slice(0, 500);
      if (!out.includes(href)) out.push(href);
    }
    if (out.length > MAX_LINKS) throw new HttpError(400, `${MAX_LINKS} links at most`);
    return out;
  }

  async function report(req: IncomingMessage) {
    const w = await memberOnly(req);
    if (!w.wallet) throw new HttpError(400, "sign in with a wallet to report");
    const b = await d.readJson(req);
    const what = clean(b?.what, MAX_WHAT);
    if (what.length < 5) throw new HttpError(400, "write what you did");
    const at = now();
    const r: Report = { id: `${at}:${randomBytes(4).toString("hex")}`, wallet: w.wallet, what, links: links(b?.links), at };
    await pg.run("insert into mine.badge_state (key, value) values (?, ?::text::jsonb)", REPORT_KEY + r.id, JSON.stringify(r));
    return { ok: true, report: r };
  }

  async function remove(req: IncomingMessage) {
    const w = await memberOnly(req);
    const id = String((await d.readJson(req))?.id ?? "");
    const row = await pg.one<{ value: Report }>("select value from mine.badge_state where key = ?", REPORT_KEY + id);
    if (!row) throw new HttpError(404, "no such report");
    if (!w.admin && row.value.wallet !== w.wallet) throw new HttpError(403, "not your report");
    await pg.run("delete from mine.badge_state where key = ?", REPORT_KEY + id);
    return { ok: true };
  }

  async function reports(req: IncomingMessage, url: URL) {
    const w = await memberOnly(req);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
    const since = now() - days * 86_400_000;
    const only = w.admin ? (url.searchParams.get("wallet") || "").toLowerCase() : w.wallet!;
    const rows = await pg.all<{ value: Report }>("select value from mine.badge_state where key like ?", REPORT_KEY + "%");
    const all = rows.map((r) => r.value).sort((a, b) => b.at - a.at);
    const list = all.filter((r) => r.at >= since && (!only || r.wallet === only));
    const m = await members();
    const names: Record<string, string> = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.name]));
    const out: any = { days, reports: list.map((r) => ({ ...r, name: names[r.wallet] ?? null })) };
    if (w.admin) {
      // the members with their last report and counts, quiet ones first, so the admin sees who hasn't reported
      const week = now() - 7 * 86_400_000;
      const wallets = new Set([...Object.keys(m), ...all.map((r) => r.wallet)]);
      out.members = [...wallets].map((wallet) => {
        const mine = all.filter((r) => r.wallet === wallet);
        return { wallet, name: names[wallet] ?? null, on_list: !!m[wallet], added_at: m[wallet]?.added_at ?? null,
          last_at: mine[0]?.at ?? null, week: mine.filter((r) => r.at >= week).length, total: mine.length };
      }).sort((a, b) => (a.last_at ?? 0) - (b.last_at ?? 0));
    }
    return out;
  }

  async function setMember(req: IncomingMessage) {
    await adminOnly(req);
    const b = await d.readJson(req);
    const wallet = String(b?.wallet ?? "").trim().toLowerCase();
    if (!WALLET.test(wallet)) throw new HttpError(400, "not a wallet address");
    const name = clean(b?.name, 60);
    if (!name) throw new HttpError(400, "add a name");
    const m = await members();
    m[wallet] = { name, added_at: m[wallet]?.added_at ?? now() };
    await saveMembers(m);
    return { ok: true, members: m };
  }
  async function removeMember(req: IncomingMessage) {
    await adminOnly(req);
    const wallet = String((await d.readJson(req))?.wallet ?? "").trim().toLowerCase();
    const m = await members();
    if (!m[wallet]) throw new HttpError(404, "not on the list");
    delete m[wallet];
    await saveMembers(m);
    return { ok: true, members: m };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p !== "/api/team" && !p.startsWith("/api/team/")) return false;
    if (req.method === "GET" && p === "/api/team/me") return d.send(res, 200, await who(req)), true;
    if (req.method === "POST" && p === "/api/team/report") return d.send(res, 200, await report(req)), true;
    if (req.method === "POST" && p === "/api/team/report/delete") return d.send(res, 200, await remove(req)), true;
    if (req.method === "GET" && p === "/api/team/reports") return d.send(res, 200, await reports(req, url)), true;
    if (req.method === "POST" && p === "/api/team/members") return d.send(res, 200, await setMember(req)), true;
    if (req.method === "POST" && p === "/api/team/members/remove") return d.send(res, 200, await removeMember(req)), true;
    return false;
  }

  return { route, members };
}
