/**
 * Connect X (2026-11-03, the user: "connect profile with X with oauth"): a signed-in wallet links its X account through
 * X's OAuth 2.0 (PKCE, confidential client). The token is used for one /2/users/me read - X bills per call since
 * 2026-02, about a cent - and then dropped: only the account (id, @username, name, avatar) is kept.
 *
 *   POST /api/x/start { return_to }  -> { url }  the signed-in wallet's X sign-in page
 *   GET  /api/x/callback             <- X sends the browser back here; we redirect to return_to with ?x=linked|denied|expired|taken|failed
 *   GET  /api/x                      -> { enabled, linked: { username, name, avatar, linked_at } | null }  the signed-in wallet's
 *   POST /api/x/unlink               -> { linked: null }
 *   GET  /api/x/handles?wallets=0xa  -> { "0xa": "username", ... }  for leaderboards (max 200)
 *
 * One X account per wallet and one wallet per X account: an X account already linked to another wallet stays there
 * ("taken") until that wallet unlinks it. Env: X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI (the callback as registered
 * in the X developer portal), SITE_ORIGIN. Tables mine.x_links, mine.x_oauth
 * (flybook/supabase/migrations/20261103120000_mine_x_links.sql).
 */
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export type XLinkDeps = {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  env: Record<string, string | undefined>;
  /** X's API root; tests point it at a fake */
  api?: string;
};

const STATE_TTL_MS = 10 * 60_000;
const ADDRESS = /^0x[0-9a-f]{40}$/;
// where the browser may be sent back to: the site, its apex, and a local docs server
const RETURN_HOSTS = /^(www\.)?flyaiworld\.com$|^localhost$|^127\.0\.0\.1$/;

const b64url = (b: Buffer) => b.toString("base64url");

export function createXLink(d: XLinkDeps) {
  const { pg, HttpError } = d;
  const clientId = d.env.X_CLIENT_ID ?? "";
  const secret = d.env.X_CLIENT_SECRET ?? "";
  const redirectUri = d.env.X_REDIRECT_URI ?? "https://flyai-mine.fly.dev/api/x/callback";
  const site = d.env.SITE_ORIGIN ?? "https://www.flyaiworld.com";
  const api = d.api ?? "https://api.x.com";
  const authorize = d.env.X_AUTHORIZE_URL ?? "https://x.com/i/oauth2/authorize";

  /** A page of ours to come back to; anything else is the site's home. */
  function returnTo(raw: unknown): string {
    try {
      const u = new URL(String(raw ?? ""));
      if ((u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") && RETURN_HOSTS.test(u.hostname)) {
        u.searchParams.delete("x");
        u.hash = "";
        return u.href;
      }
    } catch { /* not a URL */ }
    return `${site}/`;
  }

  async function start(req: IncomingMessage, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    if (!clientId) throw new HttpError(503, "Connect X isn't set up yet");
    const state = randomBytes(24).toString("hex");
    const verifier = b64url(randomBytes(48));
    const now = Date.now();
    await pg.run("delete from mine.x_oauth where created_at_ms < ?", now - STATE_TTL_MS);
    await pg.run("insert into mine.x_oauth (state, wallet, verifier, return_to, created_at_ms) values (?, ?, ?, ?, ?)",
      state, me, verifier, returnTo(body?.return_to), now);
    const q = new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "users.read tweet.read", state,
      code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    });
    return { url: `${authorize}?${q}` };
  }

  /** X's redirect back: code -> token -> who signed in -> the link. Always answers with a redirect to the site. */
  async function callback(url: URL): Promise<string> {
    const state = url.searchParams.get("state") ?? "";
    // used once: taken out before anything else, so a replayed redirect finds nothing
    const row = /^[0-9a-f]{48}$/.test(state)
      ? await pg.one<{ wallet: string; verifier: string; return_to: string; created_at_ms: number }>(
        "delete from mine.x_oauth where state = ? returning wallet, verifier, return_to, created_at_ms", state)
      : undefined;
    if (!row || Date.now() - Number(row.created_at_ms) > STATE_TTL_MS) return back(`${site}/`, "expired");
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("error")) return back(row.return_to, "denied");
    try {
      const user = await whoIs(code, row.verifier);
      const other = await pg.one<{ wallet: string }>("select wallet from mine.x_links where x_id = ? and wallet <> ?", user.id, row.wallet);
      if (other) return back(row.return_to, "taken");
      await pg.run(`insert into mine.x_links (wallet, x_id, username, name, avatar, linked_at_ms) values (?, ?, ?, ?, ?, ?)
        on conflict (wallet) do update set x_id = excluded.x_id, username = excluded.username, name = excluded.name,
          avatar = excluded.avatar, linked_at_ms = excluded.linked_at_ms`,
        row.wallet, user.id, user.username, user.name ?? null, user.profile_image_url ?? null, Date.now());
      return back(row.return_to, "linked");
    } catch (err) {
      console.error("x link:", err instanceof Error ? err.message : err);
      return back(row.return_to, "failed");
    }
  }

  async function whoIs(code: string, verifier: string) {
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (secret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
    const tok = await fetch(`${api}/2/oauth2/token`, {
      method: "POST", headers, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier, client_id: clientId }),
    });
    const t = await tok.json().catch(() => ({})) as any;
    if (!tok.ok || !t.access_token) throw new Error(`token ${tok.status}: ${t.error_description ?? t.error ?? "no token"}`);
    const me = await fetch(`${api}/2/users/me?user.fields=profile_image_url`, {
      headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(10_000),
    });
    const u = (await me.json().catch(() => ({})) as any)?.data;
    if (!me.ok || !u?.id || !u?.username) throw new Error(`users/me ${me.status}`);
    return u as { id: string; username: string; name?: string; profile_image_url?: string };
  }

  function back(to: string, status: string): string {
    const u = new URL(to);
    u.searchParams.set("x", status);
    return u.href;
  }

  async function mine(req: IncomingMessage) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const row = await pg.one<{ username: string; name: string | null; avatar: string | null; linked_at_ms: number }>(
      "select username, name, avatar, linked_at_ms from mine.x_links where wallet = ?", me);
    return { enabled: !!clientId,
      linked: row ? { username: row.username, name: row.name, avatar: row.avatar, linked_at: Number(row.linked_at_ms) } : null };
  }

  async function unlink(req: IncomingMessage) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    await pg.run("delete from mine.x_links where wallet = ?", me);
    return { linked: null };
  }

  async function handles(wallets: string[]): Promise<Record<string, string>> {
    const list = [...new Set(wallets.map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)))].slice(0, 200);
    if (!list.length) return {};
    const rows = await pg.all<{ wallet: string; username: string }>(
      `select wallet, username from mine.x_links where wallet in (${list.map(() => "?").join(",")})`, ...list);
    return Object.fromEntries(rows.map((r) => [r.wallet, r.username]));
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/x/callback") {
      res.writeHead(302, { location: await callback(url), "cache-control": "no-store" });
      res.end();
      return true;
    }
    if (req.method === "GET" && p === "/api/x/handles") return d.send(res, 200, await handles((url.searchParams.get("wallets") ?? "").split(","))), true;
    if (req.method === "GET" && p === "/api/x") return d.send(res, 200, await mine(req)), true;
    if (req.method === "POST" && p === "/api/x/start") return d.send(res, 200, await start(req, await d.readJson(req))), true;
    if (req.method === "POST" && p === "/api/x/unlink") return d.send(res, 200, await unlink(req)), true;
    return false;
  }

  return { route, handles, returnTo };
}
