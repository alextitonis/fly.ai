/**
 * Connect Telegram (2026-11-03, the user: "just join our telegram then with oauth"): a signed-in wallet links its
 * Telegram account through the Telegram Login Widget (bot @flyai_tg_bot, domain flyaiworld.com), and the bot, an admin
 * of the fly.ai group, says whether that account is a member. A member earns XP (src/xp.ts "telegram"); the answer is
 * checked again every day, so leaving the group takes it back.
 *
 *   GET  /api/tg          -> { enabled, bot, invite, linked: { username, name, photo, member, linked_at } | null }
 *   POST /api/tg/link     { id, first_name, username, photo_url, auth_date, hash }  the widget's signed answer
 *   POST /api/tg/check    -> the same as GET, after asking Telegram again (for "I joined, check again")
 *   POST /api/tg/unlink   -> { linked: null }
 *
 * The widget's answer is signed with the bot's token (core.telegram.org/widgets/login#checking-authorization), so
 * nobody can claim another account. One Telegram account per wallet and one wallet per account. Env: TG_BOT_TOKEN,
 * TG_BOT_USERNAME, TG_GROUP_ID (the group's chat id), TG_INVITE. Table mine.tg_links
 * (flybook/supabase/migrations/20261104130000_mine_tg_links.sql).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

const AUTH_TTL_S = 86_400;
const RECHECK_MS = 24 * 3_600_000;

/** The widget's fields, checked against its hash: HMAC-SHA256 over the sorted "key=value" lines, keyed by SHA256(token). */
export function checkLogin(data: Record<string, unknown>, token: string, nowS: number): { id: string; username: string | null; name: string; photo: string | null } | null {
  const hash = String(data?.hash ?? "");
  if (!/^[0-9a-f]{64}$/.test(hash) || !token) return null;
  const lines = Object.keys(data).filter((k) => k !== "hash" && data[k] !== undefined && data[k] !== null)
    .sort().map((k) => `${k}=${data[k]}`).join("\n");
  const want = createHmac("sha256", createHash("sha256").update(token).digest()).update(lines).digest();
  if (!timingSafeEqual(want, Buffer.from(hash, "hex"))) return null;
  const at = Number(data.auth_date);
  if (!Number.isFinite(at) || nowS - at > AUTH_TTL_S || at - nowS > 300) return null;
  const id = String(data.id ?? "");
  if (!/^\d{1,20}$/.test(id)) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").slice(0, 120);
  const photo = typeof data.photo_url === "string" && /^https:\/\//.test(data.photo_url) ? data.photo_url : null;
  return { id, username: typeof data.username === "string" ? data.username.slice(0, 64) : null, name, photo };
}

/** getChatMember's answer -> in the group or not. */
export const isMember = (m: { status?: string; is_member?: boolean } | null | undefined) =>
  !!m && (["creator", "administrator", "member"].includes(m.status ?? "") || (m.status === "restricted" && m.is_member === true));

export function createTgLink(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  env: Record<string, string | undefined>;
  /** Telegram's Bot API root; tests point it at a fake */
  api?: string;
  now?: () => number;
}) {
  const { pg, HttpError } = d;
  const token = d.env.TG_BOT_TOKEN ?? "";
  const bot = d.env.TG_BOT_USERNAME ?? "flyai_tg_bot";
  const group = d.env.TG_GROUP_ID ?? "";
  const invite = d.env.TG_INVITE ?? "https://t.me/+Cs5zp1zmD5NjMmI1";
  const api = d.api ?? "https://api.telegram.org";
  const now = d.now ?? Date.now;
  const on = !!(token && group);

  /** In the group right now? null when Telegram didn't answer (the old answer stands). */
  async function member(tgId: string): Promise<boolean | null> {
    try {
      const r = await fetch(`${api}/bot${token}/getChatMember?chat_id=${encodeURIComponent(group)}&user_id=${tgId}`, { signal: AbortSignal.timeout(10_000) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; result?: { status?: string; is_member?: boolean }; description?: string };
      if (j.ok) return isMember(j.result);
      if (/user not found|PARTICIPANT_ID_INVALID|member not found/i.test(j.description ?? "")) return false;
      return null;
    } catch {
      return null;
    }
  }

  async function mine(wallet: string) {
    const row = await pg.one<{ username: string | null; name: string; photo: string | null; member: boolean; linked_at_ms: string }>(
      "select username, name, photo, member, linked_at_ms::text from mine.tg_links where wallet = ?", wallet);
    return { enabled: on, bot, invite,
      linked: row ? { username: row.username, name: row.name, photo: row.photo, member: row.member, linked_at: Number(row.linked_at_ms) } : null };
  }

  async function link(wallet: string, body: any) {
    if (!on) throw new HttpError(503, "Connect Telegram isn't set up yet");
    const who = checkLogin(body ?? {}, token, Math.floor(now() / 1000));
    if (!who) throw new HttpError(400, "Telegram's sign-in didn't check out: try again");
    const other = await pg.one<{ wallet: string }>("select wallet from mine.tg_links where tg_id = ? and wallet <> ?", who.id, wallet);
    if (other) throw new HttpError(409, "That Telegram account is linked to another wallet");
    const inGroup = (await member(who.id)) ?? false;
    await pg.run(`insert into mine.tg_links (wallet, tg_id, username, name, photo, member, linked_at_ms, checked_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (wallet) do update set tg_id = excluded.tg_id, username = excluded.username, name = excluded.name, photo = excluded.photo,
        member = excluded.member, linked_at_ms = excluded.linked_at_ms, checked_at_ms = excluded.checked_at_ms`,
      wallet, who.id, who.username, who.name, who.photo, inGroup, now(), now());
    return mine(wallet);
  }

  async function check(wallet: string) {
    const row = await pg.one<{ tg_id: string }>("select tg_id from mine.tg_links where wallet = ?", wallet);
    if (row && on) {
      const m = await member(row.tg_id);
      if (m !== null) await pg.run("update mine.tg_links set member = ?, checked_at_ms = ? where wallet = ?", m, now(), wallet);
    }
    return mine(wallet);
  }

  /** Every link asked again once a day, a few at a time: leaving the group takes the XP back. */
  async function recheck(max = 60) {
    if (!on) return;
    const due = await pg.all<{ wallet: string; tg_id: string }>("select wallet, tg_id from mine.tg_links where checked_at_ms < ? order by checked_at_ms limit ?",
      now() - RECHECK_MS, max);
    for (const r of due) {
      const m = await member(r.tg_id);
      if (m === null) break;                               // Telegram is busy: the rest next time
      await pg.run("update mine.tg_links set member = ?, checked_at_ms = ? where wallet = ?", m, now(), r.wallet);
    }
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (!p.startsWith("/api/tg")) return false;
    const wallet = (await d.sessionWallet(req)).toLowerCase();
    if (req.method === "GET" && p === "/api/tg") return d.send(res, 200, await mine(wallet)), true;
    if (req.method === "POST" && p === "/api/tg/link") return d.send(res, 200, await link(wallet, await d.readJson(req))), true;
    if (req.method === "POST" && p === "/api/tg/check") return d.send(res, 200, await check(wallet)), true;
    if (req.method === "POST" && p === "/api/tg/unlink") {
      await pg.run("delete from mine.tg_links where wallet = ?", wallet);
      return d.send(res, 200, { linked: null }), true;
    }
    return false;
  }

  function start(everyMs = 3_600_000) {
    if (!on) return;
    setTimeout(() => recheck().catch((e) => console.error(`tg: ${e?.message ?? e}`)), 60_000).unref();
    setInterval(() => recheck().catch((e) => console.error(`tg: ${e?.message ?? e}`)), everyMs).unref();
  }

  return { route, start, recheck, check, link, mine };
}
