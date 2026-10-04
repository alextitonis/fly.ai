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
const RESERVED = /^(fly\s*ai|flyai|fly\.ai|admin|team|official|support|mod|moderator|dev|deployer|robinhood)$/i;
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

  /**
   * Everything the site shows a signed-in wallet in one read (2026-10-03, "one product": the homepage's Continue row,
   * the nav's notifications and badges): its Fly Wallets (from the desk's published leaderboard), its Colosseum record,
   * the games it played, a feed of what happened lately (its flies' trades, finished tournaments, FlightPass payouts)
   * and the badges that follow from all that. Kept a minute per wallet: every page of the site asks for it.
   */
  const summaries = new Map<string, { at: number; value: Promise<unknown> }>();
  function summary(req: IncomingMessage) {
    return d.sessionWallet(req).then((w) => {
      const me = w.toLowerCase();
      const hit = summaries.get(me);
      if (hit && Date.now() - hit.at < 60_000) return hit.value;
      const value = build(me).catch((e) => { summaries.delete(me); throw e; });
      if (summaries.size > 2000) summaries.clear();
      summaries.set(me, { at: Date.now(), value });
      return value;
    });
  }
  async function build(me: string) {
    const [nick, board, arena, games, trades, tours, payouts] = await Promise.all([
      pg.one<{ nickname: string }>("select nickname from mine.profiles where wallet = ?", me),
      pg.one<{ value: any }>("select value from mine.vault_public where key = 'leaderboard'"),
      pg.one<{ entries: number; wins: number; prize: string | null }>(`select count(*)::int as entries,
        count(*) filter (where place = 1)::int as wins, coalesce(sum(prize_wei::numeric), 0)::text as prize
        from mine.arena_entries where lower(wallet) = ?`, me),
      pg.one<{ roulette: number; slots: number; race: number }>(`select
        (select count(*)::int from mine.roulette_games where lower(wallet) = ?) as roulette,
        (select count(*)::int from mine.slots_spins where lower(wallet) = ?) as slots,
        (select count(*)::int from mine.race_games where lower(wallet) = ?) as race`, me, me, me),
      pg.all<{ at: string; vault: string; fly_id: number | null; symbol: string; side: string; usd: number | null; reason: any }>(
        `select t.at, t.vault, w.fly_id, t.symbol, t.side, t.usd, t.reason from mine.vault_trades t
          join mine.vault_ledger l on l.wallet = t.vault and l.chain = 'robinhood'
          left join mine.vault_wallets w on lower(w.address) = lower(t.vault)
          where lower(l.holder) = ? and t.status = 'filled' and t.at > now() - interval '7 days'
          order by t.at desc limit 15`, me),
      pg.all<{ name: string; fly: number; place: number | null; prize_wei: string | null; done_at: number }>(
        `select t.name, e.fly, e.place, e.prize_wei, t.done_at from mine.arena_entries e
          join mine.arena_tournaments t on t.id = e.tournament
          where lower(e.wallet) = ? and t.done_at is not null order by t.done_at desc limit 8`, me),
      pg.all<{ amount_wei: string; done_at: number }>(`select amount_wei, done_at from mine.flightpass_withdrawals
          where lower(wallet) = ? and status = 'done' and done_at is not null order by done_at desc limit 5`, me),
    ]);
    const mine = ((board?.value?.all ?? []) as any[]).filter((e) => String(e.holder ?? "").toLowerCase() === me);
    const wallets = {
      count: mine.length,
      value: mine.reduce((x, e) => x + (Number(e.value) || 0), 0),
      principal: mine.reduce((x, e) => x + (Number(e.principal) || 0), 0),
      trades: mine.reduce((x, e) => x + (Number(e.trades) || 0), 0),
      flies: mine.flatMap((e) => e.flies ?? []),
    };
    const profit = wallets.value - wallets.principal;
    const played = (games?.roulette ?? 0) + (games?.slots ?? 0) + (games?.race ?? 0);
    const feed = [
      ...trades.map((t) => ({ at: new Date(t.at).getTime(), kind: "trade", fly: t.fly_id, symbol: t.symbol, side: t.side,
        usd: t.usd, pnl_pct: t.reason?.pnl_pct ?? null })),
      ...tours.map((t) => ({ at: Number(t.done_at), kind: "colosseum", name: t.name, fly: t.fly, place: t.place, prize_wei: t.prize_wei })),
      ...payouts.map((p) => ({ at: Number(p.done_at), kind: "payout", amount_wei: p.amount_wei })),
    ].sort((a, b) => b.at - a.at).slice(0, 20);
    const badges = [
      nick && "nickname", wallets.count > 0 && "funded", profit > 0 && "profit", wallets.trades >= 10 && "trader",
      (arena?.entries ?? 0) > 0 && "gladiator", (arena?.wins ?? 0) > 0 && "champion", played > 0 && "player",
      played >= 100 && "regular",
    ].filter(Boolean);
    return { wallet: me, nickname: nick?.nickname ?? null,
      wallets: { ...wallets, profit: Math.round(profit * 100) / 100 },
      colosseum: { entries: arena?.entries ?? 0, wins: arena?.wins ?? 0, prize_wei: arena?.prize ?? "0" },
      games: { roulette: games?.roulette ?? 0, slots: games?.slots ?? 0, race: games?.race ?? 0 }, badges, feed };
  }

  /** People by nickname (a prefix, any case), each with their Fly Wallets' flies: the nav's search. */
  async function search(q: string) {
    const s = String(q ?? "").trim().replace(/[%_\\]/g, "");
    if (s.length < 2) return [];
    const rows = await pg.all<{ wallet: string; nickname: string }>(
      "select wallet, nickname from mine.profiles where lower(nickname) like lower(?) order by length(nickname) limit 8", `${s}%`);
    const board = ((await pg.one<{ value: any }>("select value from mine.vault_public where key = 'leaderboard'"))?.value?.all ?? []) as any[];
    return rows.map((r) => ({ ...r, flies: board.filter((e) => String(e.holder ?? "").toLowerCase() === r.wallet).flatMap((e) => e.flies ?? []) }));
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/profile/summary") return d.send(res, 200, await summary(req)), true;
    if (req.method === "GET" && p === "/api/profiles/search") return d.send(res, 200, await search(url.searchParams.get("q") ?? "")), true;
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
