/**
 * Fly Pet (flypet/, 2026-11-01): the free desktop pet's reads and its wallet link. Everything here is already public on
 * the site; nothing moves money, so the app holds no key and no session.
 *
 * - link: the app asks for a code and opens the site (/traderflies/petlink#code), where the holder signs in as usual and
 *   approves; the app then claims the wallet ADDRESS with its secret. The session stays in the browser: it can withdraw.
 * - GET /api/pet/public: the $FLYAI price and the leaderboard's top fly, for anyone with no wallet.
 * - GET /api/pet/wallet/<address>: the flies that wallet owns or has money in, with their profit and filled trades. Owners
 *   come from one sweep of the collection per OWNERS_TTL_MS (about 10 chain reads), only while someone asks, and a short
 *   memory cache and the site's edge cache sit in front, so many pets cost little.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import { multicall, word } from "./multicall.ts";
import { selector } from "./staking.ts";
import { checksumAddress } from "./wallet.ts";

export interface PetDeps {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  price: () => Promise<number>;
  /** every fly's id and owner */
  sweepOwners: () => Promise<{ id: number; owner: string }[]>;
  site: string;
  now?: () => number;
  /** the pet token's key (2026-11-13; server.ts derives it from ADMIN_TOKEN); null: the link gives the address only */
  petSecret?: Buffer | null;
  /** a partner NFT by its chat id (partners.ts chatView: the fly view's shape + who), null: not one */
  partnerView?: (id: number) => Promise<any | null>;
  /** a fly's log / any wallet's log (vaults.ts flyLog, walletLog) */
  flyLog?: (fly: number) => Promise<any>;
  walletLog?: (wallet: string) => Promise<any>;
  /** the admin token, for the Discord bot's alpha calls */
  isAdmin?: (req: IncomingMessage) => boolean;
}

/**
 * The pet's sign-in (2026-11-13, the user: "when opening always ask to auth ... select a fly ... logs ... ask if it wants
 * something ... alpha calls ... chat can make it like watch these"): the link now also gives the app a PET TOKEN - the
 * wallet and an expiry, signed by the server. server.ts takes it only on the fly chat and on saving a fly wallet's
 * settings (watch lists, pause...): never on a withdrawal, a move, a sale or a transfer - those stay on the site.
 */
export const PET_TOKEN_TTL_MS = 30 * 86_400_000;
const sig = (secret: Buffer, body: string) => createHmac("sha256", secret).update(body).digest("hex");
export function makePetToken(wallet: string, secret: Buffer, now: number): { token: string; expires_at: number } {
  const exp = now + PET_TOKEN_TTL_MS, body = `pt1.${wallet.toLowerCase()}.${exp}`;
  return { token: `${body}.${sig(secret, body)}`, expires_at: exp };
}
/** The token's wallet, or null (wrong form, bad signature, expired). */
export function petWalletOf(token: string, secret: Buffer, now: number): string | null {
  const m = /^(pt1\.(0x[0-9a-f]{40})\.(\d{13}))\.([0-9a-f]{64})$/.exec(String(token));
  if (!m) return null;
  const want = Buffer.from(sig(secret, m[1]!), "hex"), got = Buffer.from(m[4]!, "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got) || Number(m[3]) < now) return null;
  return checksumAddress(m[2]!);
}

export const ALPHA_KEEP = 40;
export type AlphaCall = { at: number; kind: string; symbol: string; chain: string; ca: string; head: string; why?: string | null;
  mcap?: number | null; liq?: number | null; vol24?: number | null; image?: string | null };

export const LINK_TTL_MS = 10 * 60_000;
const OWNERS_TTL_MS = 10 * 60_000;
const LINKS_MAX = 10_000, CACHE_MS = 20_000, CACHE_MAX = 5_000, MAX_FLIES = 50, MAX_TRADES = 60;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Link { secret: string; wallet: string | null; expires: number }

/** Trader Fly can't list a wallet's tokens, so read every owner in one pass; a burned fly has none. */
export function flyOwners(rpcUrl: string, traderFly: string) {
  const chain = multicall(rpcUrl);
  return async () => {
    const minted = Number(BigInt(await chain.call(traderFly, selector("totalMinted()"))));
    const sel = selector("ownerOf(uint256)");
    const ids = Array.from({ length: minted }, (_, i) => i + 1);
    const out = await chain.batch(ids.map((id) => ({ to: traderFly, data: `${sel}${word(id)}` })));
    return ids.flatMap((id, i) => (out[i] && out[i]!.length >= 66 ? [{ id, owner: `0x${out[i]!.slice(-40)}` }] : []));
  };
}

export function createPet(d: PetDeps) {
  const now = d.now ?? Date.now;
  const links = new Map<string, Link>();
  const reads = new Map<string, { at: number; value: unknown }>();
  const owners: { at: number; byOwner: Map<string, number[]> | null; loading?: Promise<void> } = { at: 0, byOwner: null };

  /** a wallet's flies from the last sweep; an old sweep answers while the next one runs, and a failed one just waits */
  async function ownedBy(wallet: string): Promise<number[]> {
    if (now() - owners.at >= OWNERS_TTL_MS) {
      owners.loading ??= d.sweepOwners().then((list) => {
        const byOwner = new Map<string, number[]>();
        for (const { id, owner } of list) byOwner.set(owner.toLowerCase(), [...(byOwner.get(owner.toLowerCase()) ?? []), id]);
        owners.byOwner = byOwner;
        owners.at = now();
      }).catch((err) => console.error(`pet owners sweep: ${err instanceof Error ? err.message : err}`))
        .finally(() => { owners.loading = undefined; });
      if (!owners.byOwner) await owners.loading;
    }
    return owners.byOwner?.get(wallet.toLowerCase()) ?? [];
  }

  /** one database read per CACHE_MS per key; the last copy when the database is failing */
  async function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
    const hit = reads.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.value as T;
    try {
      const value = await read();
      if (reads.size >= CACHE_MAX) reads.clear();
      reads.set(key, { at: now(), value });
      return value;
    } catch (err) {
      if (hit) return hit.value as T;
      throw err;
    }
  }

  function createLink() {
    for (const [k, v] of links) if (v.expires < now()) links.delete(k);
    while (links.size >= LINKS_MAX) links.delete(links.keys().next().value!);
    const code = randomBytes(16).toString("hex"), secret = randomBytes(32).toString("hex"), expires = now() + LINK_TTL_MS;
    links.set(code, { secret, wallet: null, expires });
    return { code, secret, url: `${d.site}/traderflies/petlink#${code}`, expires_at: expires };
  }
  const liveLink = (code: unknown) => {
    const link = typeof code === "string" ? links.get(code) : undefined;
    if (!link || link.expires < now()) throw new d.HttpError(410, "this link has expired; press Connect wallet in the pet again");
    return link;
  };
  async function approve(req: IncomingMessage, body: any) {
    const wallet = await d.sessionWallet(req);     // before the code, so a stranger can't probe codes
    liveLink(body?.code).wallet = wallet;
    return { wallet };
  }
  function claim(body: any) {
    const link = liveLink(body?.code);
    if (body?.secret !== link.secret) throw new d.HttpError(403, "wrong secret");
    if (!link.wallet) return { status: "pending" };
    links.delete(body.code);
    const pet = d.petSecret ? makePetToken(link.wallet, d.petSecret, now()) : null;
    return { status: "linked", wallet: link.wallet, ...(pet ? { token: pet.token, token_expires_at: pet.expires_at } : {}) };
  }

  /** One fly (or partner NFT, by its chat id) for the pet: the Fly the moods read, who it is, and its log. Public data. */
  async function flyFeed(id: number) {
    if (id >= 1_000_000_000) {
      const v = d.partnerView ? await d.partnerView(id) : null;
      if (!v) throw new d.HttpError(404, "no such NFT");
      const s = v.stats ?? {};
      const trades = v.wallet ? ((await tradesOf([v.wallet])).get(v.wallet) ?? []) : [];
      const log = v.wallet && d.walletLog ? await d.walletLog(v.wallet).catch(() => ({ rows: [] })) : { rows: [] };
      return { fly: { id, funded: (s.value ?? 0) > 0 || (s.principal ?? 0) > 0, value: s.value ?? 0, profit: s.profit ?? 0, profit_pct: s.profit_pct ?? 0,
        profit_24h: s.profit_24h ?? 0, profit_7d: s.profit_7d ?? 0, active: !!s.active, trades }, who: v.who, wallet: v.wallet ?? null,
        settings: v.settings ?? null, log: (log.rows ?? []).slice(0, 60) };
    }
    const rows = await d.pg.all<{ fly_id: number; address: string }>("select fly_id, address from mine.vault_wallets where fly_id = ?", id);
    const [fly] = await fliesOf(rows);
    const log = d.flyLog ? await d.flyLog(id).catch(() => ({ rows: [] })) : { rows: [] };
    const settings = rows[0] ? (await d.pg.one<{ doc: any }>("select doc from mine.vault_settings where vault = ?", rows[0].address)
      .catch(() => null))?.doc ?? null : null;
    return { fly: fly ?? null, who: null, wallet: rows[0]?.address ?? null, settings, log: (log.rows ?? []).slice(0, 60) };
  }

  // the Discord bot's alpha calls (discord/src/alpha.ts posts each call here too), newest first, for the pet's Alpha tab
  async function alphaList(): Promise<AlphaCall[]> {
    return ((await d.pg.one<{ value: any }>("select value from mine.vault_public where key = 'pet:alpha'"))?.value?.calls ?? []) as AlphaCall[];
  }
  async function addAlpha(body: any) {
    const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const c: AlphaCall = { at: now(), kind: s(body?.kind || "call", 16), symbol: s(body?.symbol, 40), chain: s(body?.chain, 16), ca: s(body?.ca, 64),
      head: s(body?.head, 160), why: body?.why ? s(body.why, 200) : null, mcap: num(body?.mcap), liq: num(body?.liq), vol24: num(body?.vol24),
      image: /^https:\/\//.test(String(body?.image ?? "")) ? s(body.image, 300) : null };
    if (!c.symbol || !/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(c.ca)) throw new d.HttpError(400, "symbol and ca");
    const calls = [c, ...(await alphaList()).filter((x) => !(x.ca.toLowerCase() === c.ca.toLowerCase() && x.chain === c.chain))].slice(0, ALPHA_KEEP);
    await d.pg.run(`insert into mine.vault_public (key, value, updated_at) values ('pet:alpha', ?::text::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`, JSON.stringify({ calls }));
    return { ok: true, n: calls.length };
  }

  /** the filled trades of these fly wallets, newest first; lending, gas top-ups and cash swaps are upkeep, not trades */
  async function tradesOf(vaults: string[]) {
    if (!vaults.length) return new Map<string, unknown[]>();
    const rows = await d.pg.all<any>(`select vault, (extract(epoch from at) * 1000)::float8 as at, symbol, side, usd, tx_hash, reason
      from mine.vault_trades where vault in (${vaults.map(() => "?").join(", ")}) and status = 'filled' and tag not in ('earn', 'gas', 'cash')
      and at > now() - interval '1 day' order by at desc limit ${MAX_TRADES}`, ...vaults);
    const out = new Map<string, unknown[]>();
    for (const r of rows) {
      const list = out.get(r.vault) ?? [];
      list.push({ at: r.at, symbol: r.symbol, side: r.side, usd: r.usd, tx: r.tx_hash ?? null, pnl_pct: r.reason?.pnl_pct ?? null });
      out.set(r.vault, list);
    }
    return out;
  }

  async function fliesOf(rows: { fly_id: number; address: string }[]) {
    if (!rows.length) return [];
    const keys = rows.map((r) => `vault:${r.address}`);
    const [stats, trades] = await Promise.all([
      d.pg.all<{ key: string; value: any }>(`select key, value from mine.vault_public where key in (${keys.map(() => "?").join(", ")})`, ...keys),
      tradesOf(rows.map((r) => r.address)),
    ]);
    const statOf = new Map(stats.map((s) => [s.key, s.value]));
    return rows.map((r) => {
      const s = statOf.get(`vault:${r.address}`) ?? {};
      return { id: r.fly_id, funded: (s.value ?? 0) > 0 || (s.principal ?? 0) > 0, value: s.value ?? 0, profit: s.profit ?? 0, profit_pct: s.profit_pct ?? 0, profit_24h: s.profit_24h ?? 0,
        profit_7d: s.profit_7d ?? 0, active: !!s.active, trades: trades.get(r.address) ?? [] };
    });
  }

  const walletFeed = (wallet: string) => cached(`wallet:${wallet}`, async () => {
    const [held, owned] = await Promise.all([
      d.pg.all<{ fly_id: number; address: string }>(`select w.fly_id, w.address from mine.vault_ledger l
        join mine.vault_wallets w on w.address = l.wallet
        where lower(l.holder) = lower(?) and l.chain = 'robinhood' and not l.closing and w.fly_id is not null order by w.fly_id limit ${MAX_FLIES}`, wallet),
      ownedBy(wallet),
    ]);
    // money first: a wallet with hundreds of flies still sees the ones that trade
    const rest = owned.filter((id) => !held.some((r) => r.fly_id === id)).slice(0, Math.max(0, MAX_FLIES - held.length));
    const more = rest.length ? await d.pg.all<{ fly_id: number; address: string }>(
      `select fly_id, address from mine.vault_wallets where fly_id in (${rest.map(() => "?").join(", ")})`, ...rest) : [];
    return { wallet, flies: (await fliesOf([...held, ...more])).sort((a, b) => Number(b.funded) - Number(a.funded) || a.id - b.id) };
  });

  const publicFeed = () => cached("public", async () => {
    const [flyai_usd, board] = await Promise.all([
      d.price(),
      d.pg.one<{ value: any }>("select value from mine.vault_public where key = 'leaderboard'"),
    ]);
    const id = board?.value?.d7?.[0]?.flies?.[0];
    const rows = id ? await d.pg.all<{ fly_id: number; address: string }>("select fly_id, address from mine.vault_wallets where fly_id = ?", id) : [];
    return { flyai_usd, top: (await fliesOf(rows))[0] ?? null };
  });

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET") {
      if (p === "/api/pet/public") return d.send(res, 200, await publicFeed()), true;
      if (p === "/api/pet/alpha") return d.send(res, 200, { calls: await alphaList() }), true;
      const f = /^\/api\/pet\/fly\/(\d{1,10})$/.exec(p);
      if (f) return d.send(res, 200, await cached(`fly:${f[1]}`, () => flyFeed(Number(f[1])))), true;
      const m = /^\/api\/pet\/wallet\/(0x[0-9a-fA-F]+)$/.exec(p);
      if (m) {
        if (!ADDRESS.test(m[1])) throw new d.HttpError(400, "bad wallet address");
        return d.send(res, 200, await walletFeed(checksumAddress(m[1]))), true;
      }
    }
    if (req.method === "POST") {
      if (p === "/api/pet/link") return d.send(res, 200, createLink()), true;
      if (p === "/api/pet/link/approve") return d.send(res, 200, await approve(req, await d.readJson(req))), true;
      if (p === "/api/pet/link/claim") return d.send(res, 200, claim(await d.readJson(req))), true;
      if (p === "/api/pet/alpha") {
        if (!d.isAdmin?.(req)) throw new d.HttpError(403, "admin only");
        return d.send(res, 200, await addAlpha(await d.readJson(req))), true;
      }
    }
    return false;
  }

  return { route, ownedBy };
}
