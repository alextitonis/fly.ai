/**
 * Profiles (2026-10-03, the user: "a profile that users can set their nicknames so we can show them that way in the
 * leaderboard"): one nickname per wallet, set by the signed-in wallet itself, read by anyone in bulk so a leaderboard
 * shows names instead of 0x...
 *
 *   GET  /api/profiles?wallets=0xa,0xb   -> { "0xa": "nick", ... }  (wallets without a nickname are left out; max 200)
 *   GET  /api/profile                    -> the signed-in wallet's { wallet, nickname }
 *   POST /api/profile { nickname }       -> set it (the signed-in wallet only); "" clears it
 *
 * A nickname: 3-20 characters of letters, digits, space, _ . -; unique ignoring case; no names that pose as the team or
 * as an address. Table mine.profiles (flybook/supabase/migrations/20261003120000_mine_profiles.sql).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export type ProfilesDeps = {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
};

const NICK = /^[A-Za-z0-9 _.\-]{3,20}$/;
// names that would pose as the project or its team, or as a wallet address
const RESERVED = /^(fly\s*ai|flyai|fly\.ai|admin|team|official|support|mod|moderator|dev|deployer|treasure|robinhood)$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function createProfiles(d: ProfilesDeps) {
  const { pg, HttpError } = d;

  /** A nickname as typed, cleaned and checked; null clears it. */
  function clean(raw: unknown): string | null {
    const s = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (s === "") return null;
    if (!NICK.test(s)) throw new HttpError(400, "3-20 letters, digits, spaces, _ . or -");
    if (RESERVED.test(s) || /^0x[0-9a-f]{4,}/i.test(s)) throw new HttpError(400, "that name is reserved");
    return s;
  }

  async function names(wallets: string[]): Promise<Record<string, string>> {
    const list = [...new Set(wallets.map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)))].slice(0, 200);
    if (!list.length) return {};
    const rows = await pg.all<{ wallet: string; nickname: string }>(
      `select wallet, nickname from mine.profiles where wallet in (${list.map(() => "?").join(",")})`, ...list);
    return Object.fromEntries(rows.map((r) => [r.wallet, r.nickname]));
  }

  async function mine(req: IncomingMessage) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const row = await pg.one<{ nickname: string }>("select nickname from mine.profiles where wallet = ?", me);
    return { wallet: me, nickname: row?.nickname ?? null };
  }

  async function save(req: IncomingMessage, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const nick = clean(body?.nickname);
    if (nick === null) {
      await pg.run("delete from mine.profiles where wallet = ?", me);
      return { wallet: me, nickname: null };
    }
    const taken = await pg.one<{ wallet: string }>("select wallet from mine.profiles where lower(nickname) = lower(?) and wallet <> ?", nick, me);
    if (taken) throw new HttpError(409, "that nickname is taken");
    await pg.run(`insert into mine.profiles (wallet, nickname, updated_at_ms) values (?, ?, ?)
      on conflict (wallet) do update set nickname = excluded.nickname, updated_at_ms = excluded.updated_at_ms`, me, nick, Date.now());
    return { wallet: me, nickname: nick };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/profiles") {
      return d.send(res, 200, await names((url.searchParams.get("wallets") ?? "").split(","))), true;
    }
    if (p === "/api/profile") {
      if (req.method === "GET") return d.send(res, 200, await mine(req)), true;
      if (req.method === "POST") return d.send(res, 200, await save(req, await d.readJson(req))), true;
    }
    return false;
  }

  return { route, names, clean };
}
