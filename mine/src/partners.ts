/**
 * Partners on our site (flytrade/PARTNERS.md, user 2026-10-07: "generalise it so we can set up for others easily";
 * first: Bullas on Berachain, "this time will be in our website"): another project's NFTs (any EVM ERC-721) get our
 * Fly Wallets - activated by holding $FLYAI - and a shared pot, on /traderflies/partner?p=<id>. One row of
 * mine.partners per partner (admin API below), read here every PARTNERS_TTL_MS and by the wallets process
 * (flytrade/vaults/partners.py), so a new partner needs no code and no deploy. It never sees a key:
 *
 * - wallets: made by the partner desk when the owner asks (POST .../token/:n/setup -> a 'register' request); keystore
 *   ids "p_<id>:<n>" in mine.vault_wallets. Deposits are plain transfers of ETH or USDG on Robinhood Chain.
 * - its records: ledger / requests under chain "p_<id>", settings "p_<id>:<wallet>", stats "vault:p_<id>:<wallet>",
 *   "leaderboard:p_<id>"; the pot "p_<id>:pool", "p_<id>:pool:holders", "p_<id>:pool:epoch:<n>".
 * - the rules: the NFT's owner (ownerOf on its own chain) decides until money is in; then the holder (who funded it).
 *   The owner's same address holds hold_flyai $FLYAI on Robinhood Chain. Plain wallet sign-in (the site's session).
 * The token view has the Fly Wallets' fly view shape (fly, owner, wallet, ledger, stats, settings) so the site's
 * Fly Wallet panel shows a partner NFT as it shows a fly.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import { multicall } from "./multicall.ts";
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";
import { checksumAddress } from "./wallet.ts";

export interface PartnersDeps {
  pg: Pg;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  /** Robinhood Chain (the holders' $FLYAI, the wallets' gas) */
  rpcUrl: string;
  env: NodeJS.ProcessEnv;
}

const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ROBINHOOD = { chain: "robinhood", chainId: 4663, explorer: "https://robinhoodchain.blockscout.com" };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ID = /^[a-z][a-z0-9]{1,19}$/;
const MAX_DOC = 16_000;
const MAX_ID = 5_000_000;                 // flytrade/vaults/partner.py MAX_ID
// no gas loans (as partner.py NEEDS_GAS_WEI): under this much ETH a wallet waits for its holder to send some
const NEEDS_GAS_WEI = 5n * 10n ** 13n;
const SUGGESTED_GAS_ETH = 0.0005;
const RULES = ["equal"];                  // flytrade/vaults/ruyuirules.py RULES

type Ledger = { holder: string | null; principal_usd: number; locked_usd: number; closing: boolean };
export type Partner = {
  id: string; name: string; on: boolean; book: string;
  collection: { chain: string; chain_id: number; rpc: string; contract: string; first_id: number; last_id: number;
                explorer?: string; image?: string; url?: string; x?: string };
  fee_bps: number; partner_fee_to: string | null; partner_share: number; hold_flyai: number;
  /** the partner's own house token on Robinhood Chain (the house option buys its dips instead of FLYAI); null: FLYAI */
  house_token: { address: string; symbol: string } | null;
  wallets: { on: boolean };
  pool: { on: boolean; mode: string; asset: string; paper_usd: number; brains: number; rule: string; fee_bps: number;
          house_pct: number; house_dip_pct: number; launch_pct: number; epoch_days: number };
};

/** A row's config checked and filled with the defaults partner.py uses; throws a message saying what is wrong. */
export function parsePartner(row: { id: string; name: string; on: boolean; config: any }): Partner {
  const id = String(row.id ?? "");
  if (!ID.test(id)) throw new Error("id: 2-20 lowercase letters/digits, starting with a letter");
  const c = row.config ?? {};
  const col = c.collection ?? {};
  if (!ADDRESS.test(String(col.contract ?? ""))) throw new Error("collection.contract must be an address");
  if (!/^https?:\/\//.test(String(col.rpc ?? ""))) throw new Error("collection.rpc must be an http(s) URL");
  const first = Number(col.first_id ?? 1), last = Number(col.last_id ?? 0);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || first > last || last >= MAX_ID) {
    throw new Error(`collection ids must be 0 <= first_id <= last_id < ${MAX_ID}`);
  }
  const feeTo = c.partner_fee_to ?? null;
  if (feeTo !== null && !ADDRESS.test(String(feeTo))) throw new Error("partner_fee_to must be an address or null");
  const fee = Number(c.fee_bps ?? 400), share = Number(c.partner_share ?? 0.5);
  if (!(fee >= 0 && fee <= 5000) || !(share >= 0 && share <= 1)) throw new Error("fee_bps 0..5000, partner_share 0..1");
  const pool = { on: false, mode: "paper", asset: "USDG", paper_usd: 0, brains: 1, rule: "equal", fee_bps: fee,
                 house_pct: 10, house_dip_pct: 2, launch_pct: 5, epoch_days: 7, ...(c.pool ?? {}) };
  if (pool.mode !== "paper" && pool.mode !== "live") throw new Error("pool.mode is paper or live");
  if (!RULES.includes(pool.rule)) throw new Error(`pool.rule is one of ${RULES.join(", ")}`);
  if (pool.on && pool.mode === "paper" && !(Number(pool.paper_usd) > 0)) throw new Error("a paper pool needs pool.paper_usd > 0");
  const ht = c.house_token ?? null;
  const htAddress = ht == null ? null : typeof ht === "string" ? ht : ht.address;
  if (htAddress != null && !ADDRESS.test(String(htAddress))) throw new Error("house_token.address must be an address or null");
  const hold = Number(c.hold_flyai ?? 200_000);
  if (!(hold >= 0)) throw new Error("hold_flyai must be >= 0");
  return {
    id, name: String(row.name || id), on: !!row.on, book: `p_${id}`,
    collection: { chain: String(col.chain ?? ""), chain_id: Number(col.chain_id ?? 0), rpc: String(col.rpc),
                  contract: checksumAddress(String(col.contract)), first_id: first, last_id: last,
                  ...(col.explorer ? { explorer: String(col.explorer) } : {}), ...(col.image ? { image: String(col.image) } : {}),
                  ...(col.url ? { url: String(col.url) } : {}), ...(col.x ? { x: String(col.x) } : {}) },
    fee_bps: fee, partner_fee_to: feeTo ? checksumAddress(String(feeTo)) : null, partner_share: share, hold_flyai: hold,
    house_token: htAddress ? { address: checksumAddress(String(htAddress)), symbol: String((typeof ht === "object" && ht?.symbol) || "TOKEN") } : null,
    wallets: { on: (c.wallets?.on ?? true) !== false }, pool,
  };
}

const word = (v: bigint | number | string) =>
  typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0");
const ZERO = "0x0000000000000000000000000000000000000000";

export function createPartners(d: PartnersDeps) {
  const { pg, HttpError } = d;
  const PARTNERS_TTL_MS = Number(d.env.PARTNERS_TTL_SEC ?? "60") * 1000;
  // the owner of one NFT, cached this long for the views (their pages poll); actions always read fresh
  const OWNER_TTL_MS = Number(d.env.PARTNER_OWNER_TTL_SEC ?? "30") * 1000;
  // a whole collection's owners (a holder's NFTs), read again after this
  const OWNERS_TTL_MS = Number(d.env.PARTNER_OWNERS_TTL_SEC ?? "600") * 1000;
  const addressOf = (raw: string) => {
    if (!ADDRESS.test(raw)) throw new HttpError(400, "bad address");
    return checksumAddress(raw);
  };

  // ---- the partners table ------------------------------------------------------------------------------------
  let table: { at: number; all: Map<string, Partner>; loading?: Promise<Map<string, Partner>> } = { at: 0, all: new Map() };
  async function partners(fresh = false): Promise<Map<string, Partner>> {
    if (!fresh && table.at && Date.now() - table.at < PARTNERS_TTL_MS) return table.all;
    table.loading ??= (async () => {
      try {
        const rows = await pg.all<{ id: string; name: string; on: boolean; config: any }>('select id, name, "on", config from mine.partners');
        const all = new Map<string, Partner>();
        for (const r of rows) {
          try { all.set(r.id, parsePartner(r)); } catch (err) { console.error(`partner ${r.id} skipped: ${(err as Error).message}`); }
        }
        table = { at: Date.now(), all };
        return all;
      } catch (err) {
        if (table.at) return table.all;               // the last copy beats an error
        throw err;
      } finally {
        table.loading = undefined;
      }
    })();
    return table.loading;
  }
  async function partnerOf(id: string): Promise<Partner> {
    const p = (await partners()).get(id);
    if (!p || !p.on) throw new HttpError(404, "no such partner");
    return p;
  }
  const tokenOf = (p: Partner, raw: string) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < p.collection.first_id || n > p.collection.last_id) {
      throw new HttpError(400, `${p.name} ids are ${p.collection.first_id}..${p.collection.last_id}`);
    }
    return n;
  };

  // ---- owners on the NFT's chain, $FLYAI and gas on Robinhood ---------------------------------------------------
  const owners1 = new Map<string, { owner: string | null; at: number }>();
  async function ownerOf(p: Partner, n: number, fresh = false): Promise<string | null> {
    const k = `${p.id}:${n}`, hit = owners1.get(k);
    if (!fresh && hit && Date.now() - hit.at < OWNER_TTL_MS) return hit.owner;
    let owner: string | null;
    try {
      const ret = await rpc(p.collection.rpc, "eth_call", [{ to: p.collection.contract, data: `${selector("ownerOf(uint256)")}${word(n)}` }, "latest"]) as string;
      owner = checksumAddress(`0x${ret.slice(-40)}`);
      if (owner === ZERO) owner = null;
    } catch (err) {
      if (/revert/i.test(String((err as Error)?.message ?? err))) owner = null;      // burned or never minted
      else throw new HttpError(502, `${p.name}'s chain can't be read right now; try again`);
    }
    owners1.set(k, { owner, at: Date.now() });
    if (owners1.size > 50_000) owners1.clear();
    return owner;
  }
  // every NFT's owner, for "my NFTs": one Multicall3 sweep per OWNERS_TTL_MS, the last one answering meanwhile
  const sweeps = new Map<string, { at: number; byOwner: Map<string, number[]> | null; loading?: Promise<Map<string, number[]>> }>();
  async function tokensOf(p: Partner, holder: string): Promise<{ tokens: number[]; at: number }> {
    const s = sweeps.get(p.id) ?? { at: 0, byOwner: null };
    sweeps.set(p.id, s);
    if (!s.byOwner || Date.now() - s.at >= OWNERS_TTL_MS) {
      s.loading ??= (async () => {
        try {
          const ids: number[] = [];
          for (let i = p.collection.first_id; i <= p.collection.last_id; i++) ids.push(i);
          const sel = selector("ownerOf(uint256)");
          const out = await multicall(p.collection.rpc).batch(ids.map((i) => ({ to: p.collection.contract, data: `${sel}${word(i)}` })));
          const byOwner = new Map<string, number[]>();
          out.forEach((ret, k) => {
            if (!ret || ret.length < 66) return;
            const o = `0x${ret.slice(-40)}`.toLowerCase();
            if (o === ZERO) return;
            const list = byOwner.get(o) ?? [];
            list.push(ids[k]);
            byOwner.set(o, list);
          });
          s.at = Date.now();
          s.byOwner = byOwner;
          return byOwner;
        } finally {
          s.loading = undefined;
        }
      })();
      if (!s.byOwner) {
        try { await s.loading; } catch { throw new HttpError(502, `${p.name}'s chain can't be read right now; try again`); }
      } else {
        s.loading.catch((err) => console.error(`partner ${p.id} owners sweep: ${(err as Error)?.message ?? err}`));
      }
    }
    return { tokens: s.byOwner?.get(holder.toLowerCase()) ?? [], at: s.at };
  }
  async function ethWei(wallet: string): Promise<bigint> {
    return BigInt(await rpc(d.rpcUrl, "eth_getBalance", [wallet, "latest"]) as string);
  }
  async function flyaiOf(wallet: string): Promise<number> {
    const ret = await rpc(d.rpcUrl, "eth_call", [{ to: FLYAI, data: `${selector("balanceOf(address)")}${word(wallet)}` }, "latest"]) as string;
    return Number(BigInt(ret) / 10n ** 14n) / 10_000;
  }

  // ---- the desk's tables --------------------------------------------------------------------------------------
  const walletOf = async (p: Partner, n: number) =>
    (await pg.one<{ address: string }>("select address from mine.vault_wallets where id = ?", `${p.book}:${n}`))?.address ?? null;
  async function tokenOfWallet(p: Partner, wallet: string): Promise<number | null> {
    const row = await pg.one<{ id: string }>("select id from mine.vault_wallets where lower(address) = lower(?) and id like ?", wallet, `${p.book}:%`);
    const m = row ? /:(\d+)$/.exec(row.id) : null;
    return m ? Number(m[1]) : null;
  }
  const ledgerOf = async (p: Partner, wallet: string) =>
    (await pg.one<Ledger>("select holder, principal_usd, locked_usd, closing from mine.vault_ledger where wallet = ? and chain = ?", wallet, p.book)) ?? null;
  const publicOf = async (key: string) =>
    (await pg.one<{ value: any }>("select value from mine.vault_public where key = ?", key))?.value ?? null;
  const settingsOf = async (p: Partner, wallet: string) =>
    (await pg.one<{ doc: any }>("select doc from mine.vault_settings where vault = ?", `${p.book}:${wallet}`))?.doc ?? null;
  const poolHolder = async (p: Partner, wallet: string) =>
    (await pg.one<{ h: any }>("select value->'holders'->? as h from mine.vault_public where key = ?", wallet.toLowerCase(), `${p.book}:pool:holders`))?.h ?? null;
  const openSetup = (p: Partner, n: number) =>
    pg.one<{ id: number; status: string }>(`select id, status from mine.vault_requests where chain = ? and kind = 'register'
      and wallet = ? and status in ('new', 'doing') order by id desc limit 1`, p.book, `${p.book}:${n}`);
  const poolPart = (h: any) => h ? { qualifies: h.qualifies ?? false, epoch_hours: h.epoch_hours ?? 0, epoch_est_usd: h.epoch_est_usd ?? 0,
                                       owed_usd: h.owed_usd ?? 0 } : null;

  // ---- views ------------------------------------------------------------------------------------------------------
  function summary(p: Partner) {
    return {
      id: p.id, name: p.name, book: p.book,
      collection: { chain: p.collection.chain, chain_id: p.collection.chain_id, contract: p.collection.contract,
                    first_id: p.collection.first_id, last_id: p.collection.last_id, explorer: p.collection.explorer ?? null,
                    image: p.collection.image ?? null, url: p.collection.url ?? null, x: p.collection.x ?? null },
      fee_bps: p.fee_bps, hold_flyai: p.hold_flyai, house_token: p.house_token, wallets: { on: p.wallets.on },
      pool: { on: p.pool.on, mode: p.pool.mode, asset: p.pool.asset, fee_bps: p.pool.fee_bps, epoch_days: p.pool.epoch_days },
    };
  }

  /** The Fly Wallets' config shape (src/vaults.ts config) for the site's wallet panel, plus the partner. */
  async function config(p: Partner) {
    return {
      on: p.wallets.on, grant_usd: 0, starters: await publicOf("starters"), hold_flyai: p.hold_flyai, chains: [],
      partner: summary(p),
      wallets: {
        chain: ROBINHOOD.chain, chain_id: ROBINHOOD.chainId, explorer: ROBINHOOD.explorer,
        deposit: [{ symbol: "ETH", native: true, decimals: 18 }, { symbol: "USDG", address: USDG, decimals: 6 }],
        withdrawals_paid_in: { symbol: "FLYAI", address: FLYAI, decimals: 18 },
        gas: { min_eth: Number(NEEDS_GAS_WEI) / 1e18, suggested_eth: SUGGESTED_GAS_ETH },
        fee: { profit_bps: p.fee_bps },
      },
    };
  }

  async function tokenView(p: Partner, n: number) {
    const [wallet, owner] = await Promise.all([walletOf(p, n), ownerOf(p, n)]);
    const [ledger, stats, settings, setup, flyai, pool, gasWei] = await Promise.all([
      wallet ? ledgerOf(p, wallet) : null, wallet ? publicOf(`vault:${p.book}:${wallet}`) : null, wallet ? settingsOf(p, wallet) : null,
      wallet ? null : openSetup(p, n), owner && p.hold_flyai > 0 ? flyaiOf(owner).catch(() => null) : null,
      owner ? poolHolder(p, owner) : null, wallet ? ethWei(wallet).catch(() => null) : null,
    ]);
    const needsGas = gasWei != null && gasWei < NEEDS_GAS_WEI;
    const holder = ledger?.holder ?? null;
    const holdOk = p.hold_flyai <= 0 ? true : flyai == null ? null : flyai >= p.hold_flyai;
    return {
      // the Fly Wallets' fly view (src/vaults.ts flyView): the site's wallet panel reads these
      fly: n, owner, wallet, chain: p.book, ledger, stats, settings, pass: null, away: [],
      partner: p.id, token: n, setup: setup ?? null,
      hold: { flyai, needed: p.hold_flyai, ok: holdOk },
      gas: wallet ? { eth: gasWei == null ? null : Number(gasWei) / 1e18, needs_gas: needsGas, suggested_eth: SUGGESTED_GAS_ETH } : null,
      status: !owner ? "no_owner" : !wallet ? "no_wallet" : ledger?.closing ? "closing" : !holder ? "not_funded"
        : owner.toLowerCase() !== holder.toLowerCase() ? "owner_changed"
        : holdOk === false ? "below_hold" : needsGas ? "needs_gas"
        : settings?.trading === false ? "paused" : "active",
      pool: poolPart(pool),
    };
  }

  async function holderView(p: Partner, raw: string) {
    const address = addressOf(raw);
    const [owned, flyai, pool] = await Promise.all([tokensOf(p, address), p.hold_flyai > 0 ? flyaiOf(address).catch(() => null) : null,
      poolHolder(p, address)]);
    const rows = owned.tokens.length
      ? await pg.all<{ id: string; address: string }>("select id, address from mine.vault_wallets where id = any(?::text[])",
        `{${owned.tokens.map((t) => `${p.book}:${t}`).join(",")}}`)
      : [];
    const funded = await pg.all<{ wallet: string; principal_usd: number; closing: boolean }>(
      "select wallet, principal_usd, closing from mine.vault_ledger where chain = ? and lower(holder) = lower(?)", p.book, address);
    return {
      address, partner: p.id, flyai,
      hold: { needed: p.hold_flyai, ok: p.hold_flyai <= 0 ? true : flyai == null ? null : flyai >= p.hold_flyai },
      tokens: owned.tokens, tokens_checked_at: owned.at ? owned.at / 1000 : null,
      wallets: rows.map((r) => ({ token: Number(r.id.slice(r.id.lastIndexOf(":") + 1)), wallet: r.address })),
      holding_money_in: funded, pool: poolPart(pool),
    };
  }

  // ---- the owner's actions (signed in) -----------------------------------------------------------------------
  async function setup(req: IncomingMessage, p: Partner, n: number) {
    if (!p.wallets.on) throw new HttpError(503, `${p.name} wallets aren't open yet`);
    const me = await d.sessionWallet(req);
    const owner = await ownerOf(p, n, true);
    if (!owner || owner.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, `only the ${p.name}'s owner can set up its wallet`);
    const wallet = await walletOf(p, n);
    if (wallet) return { token: n, wallet, status: "ready" };
    const open = await openSetup(p, n);
    if (open) return { token: n, wallet: null, request: open.id, status: open.status };
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, ?, 'register', ?, ?::text::jsonb) returning id`, `${p.book}:${n}`, p.book, me, JSON.stringify({ token: n }));
    return { token: n, wallet: null, request: row!.id, status: "new" };
  }

  async function partnerWallet(p: Partner, raw: string): Promise<{ wallet: string; n: number }> {
    const wallet = addressOf(raw);
    const n = await tokenOfWallet(p, wallet);
    if (n == null) throw new HttpError(404, `not a ${p.name} wallet`);
    return { wallet, n };
  }

  async function saveSettings(req: IncomingMessage, p: Partner, raw: string, body: any) {
    const me = await d.sessionWallet(req);
    const doc = body?.settings;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new HttpError(400, "settings must be an object");
    const text = JSON.stringify(doc);
    if (text.length > MAX_DOC) throw new HttpError(400, "settings are too long");
    const { wallet, n } = await partnerWallet(p, raw);
    const holder = (await ledgerOf(p, wallet))?.holder;
    if (holder) {
      if (holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can change its settings");
    } else if ((await ownerOf(p, n, true))?.toLowerCase() !== me.toLowerCase()) {
      throw new HttpError(403, `only the ${p.name}'s owner can set up its wallet`);
    }
    const version = (await import("node:crypto")).createHash("sha1").update(text).digest("hex").slice(0, 12);
    await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::text::jsonb, ?, ?, ?)
      on conflict (vault) do update set doc = excluded.doc, version = excluded.version, updated_by = excluded.updated_by,
      updated_at_ms = excluded.updated_at_ms`, `${p.book}:${wallet}`, text, version, me, Date.now());
    return { token: n, wallet, chain: p.book, version, settings: doc };
  }

  async function withdraw(req: IncomingMessage, p: Partner, raw: string, body: any) {
    const me = await d.sessionWallet(req);
    const bps = Number(body?.bps);
    if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) throw new HttpError(400, "bps is 1..10000");
    const { wallet, n } = await partnerWallet(p, raw);
    const led = await ledgerOf(p, wallet);
    if (!led?.holder || led.holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can withdraw");
    if (led.closing) throw new HttpError(409, `this ${p.name} was sold: its money is on its way to you`);
    const open = await pg.one<{ id: number }>(`select id from mine.vault_requests where wallet = ? and chain = ? and kind = 'withdraw'
      and status in ('new', 'doing')`, wallet, p.book);
    if (open) throw new HttpError(409, "a withdrawal is already on its way");
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, ?, 'withdraw', ?, ?::text::jsonb) returning id`, wallet, p.book, me, JSON.stringify({ bps }));
    return { token: n, wallet, id: row!.id, status: "new" };
  }

  // ---- admin: add or change a partner (no deploy: both processes re-read the table) ------------------------------
  async function adminList() {
    const rows = await pg.all<any>('select id, name, "on", config, updated_at_ms from mine.partners order by id');
    return { partners: rows.map((r) => { try { parsePartner(r); return { ...r, ok: true }; } catch (err) { return { ...r, ok: false, error: (err as Error).message }; } }) };
  }
  async function adminSave(id: string, body: any) {
    if (!ID.test(id)) throw new HttpError(400, "id: 2-20 lowercase letters/digits, starting with a letter");
    const old = await pg.one<any>('select name, "on", config from mine.partners where id = ?', id);
    const row = { id, name: String(body?.name ?? old?.name ?? id), on: body?.on ?? old?.on ?? false, config: body?.config ?? old?.config };
    if (!row.config) throw new HttpError(400, "config is required for a new partner");
    let p: Partner;
    try { p = parsePartner(row); } catch (err) { throw new HttpError(400, (err as Error).message); }
    await pg.run(`insert into mine.partners (id, name, "on", config, updated_at_ms) values (?, ?, ?, ?::text::jsonb, ?)
      on conflict (id) do update set name = excluded.name, "on" = excluded."on", config = excluded.config,
      updated_at_ms = excluded.updated_at_ms`, id, row.name, !!row.on, JSON.stringify(row.config), Date.now());
    await partners(true);
    sweeps.delete(id);
    return { saved: summary(p), on: !!row.on };
  }

  // ---- routes ----------------------------------------------------------------------------------------------------
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/partners") {
        return d.send(res, 200, { partners: [...(await partners()).values()].filter((x) => x.on).map(summary) }), true;
      }
      if (p === "/api/admin/partners") { d.adminOnly(req); return d.send(res, 200, await adminList()), true; }
      if ((m = /^\/api\/partners\/([a-z][a-z0-9]{1,19})(\/.*)?$/.exec(p))) {
        const pa = await partnerOf(m[1]);
        const rest = m[2] ?? "";
        let r: RegExpExecArray | null;
        if (rest === "" || rest === "/config") return d.send(res, 200, await config(pa)), true;
        if ((r = /^\/token\/(\d{1,7})$/.exec(rest))) return d.send(res, 200, await tokenView(pa, tokenOf(pa, r[1]))), true;
        if ((r = /^\/wallet\/(0x[0-9a-fA-F]{40})$/.exec(rest))) return d.send(res, 200, await tokenView(pa, (await partnerWallet(pa, r[1])).n)), true;
        if ((r = /^\/holder\/(0x[0-9a-fA-F]{40})$/.exec(rest))) return d.send(res, 200, await holderView(pa, r[1])), true;
        if (rest === "/leaderboard") return d.send(res, 200, (await publicOf(`leaderboard:${pa.book}`)) ?? { all: [], d7: [], h24: [] }), true;
        if (rest === "/pool") {
          return d.send(res, 200, (await publicOf(`${pa.book}:pool`)) ?? { partner: pa.id, mode: pa.pool.mode, asset: pa.pool.asset,
            fee_bps: pa.pool.fee_bps, epoch_days: pa.pool.epoch_days, hold_flyai: pa.hold_flyai, epochs: [], curve: [], starting: true }), true;
        }
        if ((r = /^\/pool\/epochs\/(\d{1,5})$/.exec(rest))) {
          const e = await publicOf(`${pa.book}:pool:epoch:${Number(r[1])}`);
          if (!e) throw new HttpError(404, "no such epoch");
          return d.send(res, 200, e), true;
        }
        throw new HttpError(404, "not found");
      }
    }
    if (req.method === "POST") {
      if ((m = /^\/api\/admin\/partners\/([^/]+)$/.exec(p))) { d.adminOnly(req); return d.send(res, 200, await adminSave(m[1], await d.readJson(req))), true; }
      if ((m = /^\/api\/partners\/([a-z][a-z0-9]{1,19})\/token\/(\d{1,7})\/setup$/.exec(p))) {
        const pa = await partnerOf(m[1]);
        return d.send(res, 200, await setup(req, pa, tokenOf(pa, m[2]))), true;
      }
      if ((m = /^\/api\/partners\/([a-z][a-z0-9]{1,19})\/wallet\/(0x[0-9a-fA-F]{40})\/(settings|withdraw)$/.exec(p))) {
        const pa = await partnerOf(m[1]);
        const body = await d.readJson(req);
        return d.send(res, 200, await (m[3] === "settings" ? saveSettings : withdraw)(req, pa, m[2], body)), true;
      }
    }
    return false;
  }

  return { route, partners };
}
