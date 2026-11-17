/**
 * Activations (2026-11-17, the user: "do 1 and 5" from reports/Trusted KOLs and new user growth.md): when each trading
 * wallet first went live, so growth is counted in activated wallets rather than visits.
 *
 * - Every 10 minutes the desk's published stats (mine.vault_public "vault:<addr>", "vault:p_<partner>:<addr>",
 *   "vault:ruyui:<addr>") are read. Live = active and holding >= $1 (the partners pot's rule, allpool.trading_ids).
 *   Pots ("p_bullas_pool", "p_partners_pool") and other chains' copies of a fly ("vault:base:...") are left out.
 * - The first scan only records what is already live (seeded) and sends nothing; after that, a unit seen live for the
 *   first time is a new activation: a row in mine.activations and a PostHog "fly_activated" event under the holder's
 *   wallet (the same id the site's analytics.js identifies a signed-in wallet with, so the event joins that person's
 *   visits, first UTM source and referral link). new_holder = the holder's wallet was first met in the last 30 days.
 * - GET /api/activations/scorecard: per book (Trader Flies, each partner): live now, holders, new in 7 / 30 days. The
 *   public partner scorecard on the desk page reads it.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export type ActivationsDeps = {
  pg: Pg;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  /** PostHog project key (public, send-only) + host; no key = no events */
  posthog?: { key: string; host: string } | null;
  fetch?: typeof fetch;
  now?: () => number;
};

const KEY = /^vault:(?:(0x[0-9a-fA-F]{40})|p_([a-z][a-z0-9]{1,19}):(0x[0-9a-fA-F]{40})|ruyui:(0x[0-9a-fA-F]{40}))$/;
const MIN_USD = 1;
const DAY = 86_400_000;
const NEW_HOLDER_DAYS = 30;

export type Unit = { unit: string; book: string; wallet: string; holder: string | null; fly_id: number | null };

/** a published stats key -> its unit, or null when it isn't a fly's or a partner NFT's own wallet */
export function unitOf(key: string): { unit: string; book: string; wallet: string } | null {
  const m = KEY.exec(key);
  if (!m) return null;
  if (m[1]) return { unit: m[1].toLowerCase(), book: "fly", wallet: m[1].toLowerCase() };
  const [book, addr] = m[2] ? [m[2], m[3]] : ["ruyui", m[4]];
  return { unit: `${book}:${addr.toLowerCase()}`, book, wallet: addr.toLowerCase() };
}

export function createActivations(d: ActivationsDeps) {
  const { pg } = d;
  const now = d.now ?? Date.now;
  const http = d.fetch ?? fetch;

  /** every unit that is live right now */
  async function liveUnits(): Promise<Unit[]> {
    const rows = await pg.all<{ key: string; holder: string | null; fly_id: number | null }>(`
      select p.key, lower(p.value->>'holder') as holder, w.fly_id
      from mine.vault_public p left join mine.vault_wallets w on lower(w.address) = lower(substring(p.key from 7))
      where p.key like 'vault:%' and (p.value->>'active') = 'true'
        and coalesce((p.value->>'value')::float8, 0) >= ?`, MIN_USD);
    const out: Unit[] = [];
    for (const r of rows) {
      const u = unitOf(r.key);
      if (u) out.push({ ...u, holder: r.holder, fly_id: u.book === "fly" && r.fly_id != null ? Number(r.fly_id) : null });
    }
    return out;
  }

  /** one pass: record what went live, mark what stopped; returns the new activations (none on the very first pass) */
  async function scan(): Promise<Unit[]> {
    const live = await liveUnits();
    const at = now();
    const known = new Set((await pg.all<{ unit: string }>("select unit from mine.activations")).map((r) => r.unit));
    const first = known.size === 0;
    const fresh: (Unit & { new_holder: boolean })[] = [];
    for (const u of live) {
      if (known.has(u.unit)) {
        await pg.run("update mine.activations set last_ms = ?, live = true, holder = coalesce(?, holder) where unit = ?", at, u.holder, u.unit);
        continue;
      }
      const seen = u.holder ? await pg.one<{ fresh: boolean }>(
        `select (not old and first_seen > now() - interval '${NEW_HOLDER_DAYS} days') as fresh from mine.wallets_seen where wallet = ?`, u.holder) : undefined;
      const newHolder = !first && !!seen?.fresh;
      const added = await pg.run(`insert into mine.activations (unit, book, wallet, holder, fly_id, first_ms, last_ms, live, seeded, new_holder)
        values (?, ?, ?, ?, ?, ?, ?, true, ?, ?) on conflict (unit) do nothing`,
        u.unit, u.book, u.wallet, u.holder, u.fly_id, at, at, first, newHolder);
      if (added === 1 && !first) fresh.push({ ...u, new_holder: newHolder });
    }
    const liveSet = new Set(live.map((u) => u.unit));
    const gone = [...known].filter((k) => !liveSet.has(k));
    for (const k of gone) await pg.run("update mine.activations set live = false where unit = ? and live", k);
    if (fresh.length) await capture(fresh, at);
    board = null;                                          // (the first scan's seed too: the board read before it showed zeros)
    return fresh;
  }

  /** PostHog: one fly_activated per new unit, under the holder's wallet (no holder = nobody to credit, skipped) */
  async function capture(units: (Unit & { new_holder: boolean })[], at: number): Promise<void> {
    if (!d.posthog?.key) return;
    const batch = units.filter((u) => u.holder).map((u) => ({
      event: "fly_activated",
      distinct_id: u.holder,
      timestamp: new Date(at).toISOString(),
      properties: {
        book: u.book, partner: u.book === "fly" ? null : u.book, fly_id: u.fly_id, wallet: u.wallet, new_holder: u.new_holder,
        $set_once: { first_activation_at: new Date(at).toISOString() },
        $set: { wallet: u.holder },
      },
    }));
    if (!batch.length) return;
    try {
      const r = await http(`${d.posthog.host.replace(/\/$/, "")}/batch/`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: d.posthog.key, batch }), signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) console.error("activations posthog:", r.status);
    } catch (err) {
      console.error("activations posthog:", err instanceof Error ? err.message : err);
    }
  }

  type Row = { book: string; name: string; live: number; holders: number; new_7d: number; new_30d: number; new_holders_30d: number };
  let board: { at: number; value: { since: number | null; books: Row[] } } | null = null;

  /** the public table: Trader Flies first, then every partner that is switched on, busiest first */
  async function scorecard() {
    if (board && now() - board.at < 5 * 60_000) return board.value;
    const t = now();
    const [rows, partners, since] = await Promise.all([
      pg.all<{ book: string; live: number; holders: number; new_7d: number; new_30d: number; new_holders_30d: number }>(`
        select book,
          count(*) filter (where live)::int as live,
          count(distinct holder) filter (where live)::int as holders,
          count(*) filter (where not seeded and first_ms >= ?)::int as new_7d,
          count(*) filter (where not seeded and first_ms >= ?)::int as new_30d,
          count(distinct holder) filter (where not seeded and new_holder and first_ms >= ?)::int as new_holders_30d
        from mine.activations group by book`, t - 7 * DAY, t - 30 * DAY, t - 30 * DAY),
      pg.all<{ id: string; name: string }>(`select id, name from mine.partners where "on"`),
      pg.one<{ ms: number | null }>("select min(first_ms)::float8 as ms from mine.activations"),
    ]);
    const by = new Map(rows.map((r) => [r.book, r]));
    const zero = { live: 0, holders: 0, new_7d: 0, new_30d: 0, new_holders_30d: 0 };
    const row = (book: string, name: string): Row => ({ book, name, ...zero, ...(by.get(book) ?? {}) });
    const books = [row("fly", "Trader Flies"),
      ...partners.map((p) => row(p.id, p.name)).sort((a, b) => b.live - a.live || a.name.localeCompare(b.name))];
    const value = { since: since?.ms != null ? Number(since.ms) : null, books };
    board = { at: t, value };
    return value;
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === "GET" && url.pathname === "/api/activations/scorecard") return d.send(res, 200, await scorecard()), true;
    return false;
  }

  function start(everyMs = 10 * 60_000) {
    const tick = () => void scan().catch((err) => console.error("activations:", err instanceof Error ? err.message : err));
    setTimeout(tick, 45_000).unref();
    setInterval(tick, everyMs).unref();
  }

  return { route, scan, scorecard, start, liveUnits };
}
