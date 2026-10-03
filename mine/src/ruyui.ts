/**
 * RUYUI on our backend (flytrade/RUYUI-PLAN.md, user 2026-10-03): Ruyui Studios' NFTs (ERC-721 on Abstract) get our
 * Fly Wallets and a shared pool; they build the front-end on their site from flytrade/ruyui/INTEGRATION.md, against
 * this API. Nothing here is shown on our site. It never sees a key:
 *
 * - wallets: made by the RUYUI desk (flytrade/vaults/ruyui.py) when the owner asks (POST /token/:id/setup -> a
 *   'register' request); keystore ids "ruyui:<id>" in mine.vault_wallets. Deposits are plain transfers of ETH or USDG
 *   on Robinhood Chain to that address; the desk credits the RUYUI's owner.
 * - its records: ledger / requests under chain 'ruyui', settings "ruyui:<wallet>", stats "vault:ruyui:<wallet>",
 *   "leaderboard:ruyui" - never the Trader Flies' (src/vaults.ts refuses RUYUI wallets: they have no fly_id).
 * - the rules: the owner on Abstract decides until money is in; then the holder (who funded it). The holder's own
 *   wallet holds 200k $FLYAI on Robinhood Chain; the profit fee is a flat 2%, all ours.
 * - the pool (flytrade/vaults/ruyuipool.py, paper): "ruyui:pool", "ruyui:pool:holders", "ruyui:pool:epoch:<n>".
 * Sign-in is the site-wide session (/api/session/nonce + /api/session, x-flyai-session); PARTNER_ORIGINS lets their
 * origin be the domain the SIWE message names.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";
import { checksumAddress } from "./wallet.ts";

export interface RuyuiDeps {
  pg: Pg;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  /** Robinhood Chain (the holders' $FLYAI) */
  rpcUrl: string;
  env: NodeJS.ProcessEnv;
}

export const RUYUI = {
  contract: "0x9ce89a1303f2d52a9d7840fcd5a6870c2a8550c0",
  chain: "abstract",
  chainId: 2741,
  firstId: 1,
  lastId: 7000,
  feeBps: 200,
  poolFeeBps: 50,
};
const ROBINHOOD = { chain: "robinhood", chainId: 4663, explorer: "https://robinhoodchain.blockscout.com" };
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_DOC = 16_000;

const word = (v: bigint | number | string) =>
  typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0");

type Ledger = { holder: string | null; principal_usd: number; locked_usd: number; closing: boolean };

export function createRuyui(d: RuyuiDeps) {
  const { pg, HttpError } = d;
  const on = d.env.RUYUI_ON === "1";
  const abstractRpc = d.env.ABSTRACT_RPC ?? "https://api.mainnet.abs.xyz";
  const holdFlyai = Number(d.env.RUYUI_HOLD_FLYAI ?? "200000");
  const contract = checksumAddress(d.env.RUYUI_CONTRACT ?? RUYUI.contract);
  // owners on Abstract are cached this long for the views (their pages poll); actions always read fresh
  const ownerTtlMs = Number(d.env.RUYUI_OWNER_TTL_SEC ?? "30") * 1000;
  const isOn = () => { if (!on) throw new HttpError(503, "RUYUI wallets aren't open yet"); };
  const tokenOf = (raw: string) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < RUYUI.firstId || id > RUYUI.lastId) throw new HttpError(400, `RUYUI ids are ${RUYUI.firstId}..${RUYUI.lastId}`);
    return id;
  };
  const addressOf = (raw: string) => {
    if (!ADDRESS.test(raw)) throw new HttpError(400, "bad address");
    return checksumAddress(raw);
  };

  // ---- chain reads (Abstract: owners, cached briefly; Robinhood: $FLYAI) -----------------------------------------
  const owners = new Map<number, { owner: string | null; at: number }>();
  async function ownerOf(id: number, fresh = false): Promise<string | null> {
    const hit = owners.get(id);
    if (!fresh && hit && Date.now() - hit.at < ownerTtlMs) return hit.owner;
    let owner: string | null;
    try {
      const ret = await rpc(abstractRpc, "eth_call", [{ to: contract, data: `${selector("ownerOf(uint256)")}${word(id)}` }, "latest"]) as string;
      owner = checksumAddress(`0x${ret.slice(-40)}`);
    } catch (err) {
      if (/revert/i.test(String((err as Error)?.message))) owner = null;   // no such token
      else throw new HttpError(502, "Abstract can't be read right now; try again");
    }
    owners.set(id, { owner, at: Date.now() });
    if (owners.size > 10_000) owners.clear();
    return owner;
  }
  async function flyaiOf(wallet: string): Promise<number> {
    const ret = await rpc(d.rpcUrl, "eth_call", [{ to: FLYAI, data: `${selector("balanceOf(address)")}${word(wallet)}` }, "latest"]) as string;
    return Number(BigInt(ret) / 10n ** 14n) / 10_000;
  }

  // ---- the desk's tables --------------------------------------------------------------------------------------
  const walletOf = async (id: number) =>
    (await pg.one<{ address: string }>("select address from mine.vault_wallets where id = ?", `ruyui:${id}`))?.address ?? null;
  async function tokenOfWallet(wallet: string): Promise<number | null> {
    const row = await pg.one<{ id: string }>("select id from mine.vault_wallets where lower(address) = lower(?)", wallet);
    const m = row ? /^ruyui:(\d+)$/.exec(row.id) : null;
    return m ? Number(m[1]) : null;
  }
  const ledgerOf = async (wallet: string) =>
    (await pg.one<Ledger>("select holder, principal_usd, locked_usd, closing from mine.vault_ledger where wallet = ? and chain = 'ruyui'", wallet)) ?? null;
  const publicOf = async (key: string) =>
    (await pg.one<{ value: any }>("select value from mine.vault_public where key = ?", key))?.value ?? null;
  const settingsOf = async (wallet: string) =>
    (await pg.one<{ doc: any }>("select doc from mine.vault_settings where vault = ?", `ruyui:${wallet}`))?.doc ?? null;
  const poolHolder = async (wallet: string) =>
    (await pg.one<{ h: any }>("select value->'holders'->? as h from mine.vault_public where key = 'ruyui:pool:holders'", wallet.toLowerCase()))?.h ?? null;
  const openSetup = (id: number) =>
    pg.one<{ id: number; status: string }>(`select id, status from mine.vault_requests where chain = 'ruyui' and kind = 'register'
      and wallet = ? and status in ('new', 'doing') order by id desc limit 1`, `ruyui:${id}`);

  // ---- views ------------------------------------------------------------------------------------------------------
  async function config() {
    return {
      on,
      collection: { name: "RUYUI", chain: RUYUI.chain, chain_id: RUYUI.chainId, contract, first_id: RUYUI.firstId, last_id: RUYUI.lastId },
      wallets: {
        chain: ROBINHOOD.chain, chain_id: ROBINHOOD.chainId, explorer: ROBINHOOD.explorer,
        deposit: [{ symbol: "ETH", native: true, decimals: 18 }, { symbol: "USDG", address: USDG, decimals: 6 }],
        withdrawals_paid_in: { symbol: "FLYAI", address: FLYAI, decimals: 18 },
        fee: { profit_bps: RUYUI.feeBps },
      },
      hold: { symbol: "FLYAI", address: FLYAI, chain: ROBINHOOD.chain, amount: holdFlyai, staked_counts: false },
      pool: { fee_bps: RUYUI.poolFeeBps, epoch_days: 7, mode: "paper" },
      starters: await publicOf("starters"),
    };
  }

  async function walletView(wallet: string | null) {
    const [ledger, stats, settings] = wallet
      ? await Promise.all([ledgerOf(wallet), publicOf(`vault:ruyui:${wallet}`), settingsOf(wallet)])
      : [null, null, null];
    return { ledger, stats, settings };
  }

  async function tokenView(id: number) {
    isOn();
    const [wallet, owner] = await Promise.all([walletOf(id), ownerOf(id)]);
    const [w, setup, flyai, pool] = await Promise.all([
      walletView(wallet), wallet ? null : openSetup(id), owner ? flyaiOf(owner).catch(() => null) : null,
      owner ? poolHolder(owner) : null,
    ]);
    const holder = w.ledger?.holder ?? null;
    return {
      token: id, owner, wallet, setup: setup ?? null, ...w,
      hold: { flyai, needed: holdFlyai, ok: flyai == null ? null : flyai >= holdFlyai },
      // trading opens when the RUYUI's owner is the holder of the money, holds 200k $FLYAI and trading is on
      status: !wallet ? "no_wallet" : w.ledger?.closing ? "closing" : !holder ? "not_funded"
        : !owner || owner.toLowerCase() !== holder.toLowerCase() ? "owner_changed"
        : flyai != null && flyai < holdFlyai ? "below_hold" : w.settings?.trading === false ? "paused" : "active",
      pool: pool ? { qualifies: pool.qualifies ?? false, epoch_hours: pool.epoch_hours ?? 0, epoch_est_usd: pool.epoch_est_usd ?? 0,
                     owed_usd: pool.owed_usd ?? 0 } : null,
    };
  }

  async function walletLookup(raw: string) {
    isOn();
    const wallet = addressOf(raw);
    const id = await tokenOfWallet(wallet);
    if (id == null) throw new HttpError(404, "not a RUYUI wallet");
    return tokenView(id);
  }

  async function holderView(raw: string) {
    isOn();
    const address = addressOf(raw);
    const [flyai, pool] = await Promise.all([flyaiOf(address).catch(() => null), poolHolder(address)]);
    const tokens: number[] = pool?.tokens ?? [];
    const rows = tokens.length
      ? await pg.all<{ id: string; address: string }>("select id, address from mine.vault_wallets where id = any(?::text[])",
        `{${tokens.map((t) => `ruyui:${t}`).join(",")}}`)
      : [];
    const funded = await pg.all<{ wallet: string; principal_usd: number; closing: boolean }>(
      "select wallet, principal_usd, closing from mine.vault_ledger where chain = 'ruyui' and lower(holder) = lower(?)", address);
    return {
      address, flyai, hold: { needed: holdFlyai, ok: flyai == null ? null : flyai >= holdFlyai },
      // the RUYUIs it owns as of the pool's last hourly check (a front-end that lists them itself can skip this)
      tokens, tokens_checked_at: (await publicOf("ruyui:pool"))?.last_check ?? null,
      wallets: rows.map((r) => ({ token: Number(r.id.slice(6)), wallet: r.address })),
      holding_money_in: funded,
      pool: pool ? { qualifies: pool.qualifies ?? false, epoch_hours: pool.epoch_hours ?? 0, epoch_est_usd: pool.epoch_est_usd ?? 0,
                     owed_usd: pool.owed_usd ?? 0 } : null,
    };
  }

  // ---- the owner's actions (signed in) -----------------------------------------------------------------------
  async function setup(req: IncomingMessage, id: number) {
    isOn();
    const me = await d.sessionWallet(req);
    const owner = await ownerOf(id, true);
    if (!owner || owner.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the RUYUI's owner can set up its wallet");
    const wallet = await walletOf(id);
    if (wallet) return { token: id, wallet, status: "ready" };
    const open = await openSetup(id);
    if (open) return { token: id, wallet: null, request: open.id, status: open.status };
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, 'ruyui', 'register', ?, ?::text::jsonb) returning id`, `ruyui:${id}`, me, JSON.stringify({ token: id }));
    return { token: id, wallet: null, request: row!.id, status: "new" };
  }

  async function ruyuiWallet(raw: string): Promise<{ wallet: string; id: number }> {
    const wallet = addressOf(raw);
    const id = await tokenOfWallet(wallet);
    if (id == null) throw new HttpError(404, "not a RUYUI wallet");
    return { wallet, id };
  }

  async function saveSettings(req: IncomingMessage, raw: string, body: any) {
    isOn();
    const me = await d.sessionWallet(req);
    const doc = body?.settings;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new HttpError(400, "settings must be an object");
    const text = JSON.stringify(doc);
    if (text.length > MAX_DOC) throw new HttpError(400, "settings are too long");
    const { wallet, id } = await ruyuiWallet(raw);
    const holder = (await ledgerOf(wallet))?.holder;
    if (holder) {
      if (holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can change its settings");
    } else if ((await ownerOf(id, true))?.toLowerCase() !== me.toLowerCase()) {
      throw new HttpError(403, "only the RUYUI's owner can set up its wallet");
    }
    const version = (await import("node:crypto")).createHash("sha1").update(text).digest("hex").slice(0, 12);
    await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::text::jsonb, ?, ?, ?)
      on conflict (vault) do update set doc = excluded.doc, version = excluded.version, updated_by = excluded.updated_by,
      updated_at_ms = excluded.updated_at_ms`, `ruyui:${wallet}`, text, version, me, Date.now());
    return { token: id, wallet, version, settings: doc };
  }

  async function withdraw(req: IncomingMessage, raw: string, body: any) {
    isOn();
    const me = await d.sessionWallet(req);
    const bps = Number(body?.bps);
    if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) throw new HttpError(400, "bps is 1..10000");
    const { wallet, id } = await ruyuiWallet(raw);
    const led = await ledgerOf(wallet);
    if (!led?.holder || led.holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can withdraw");
    if (led.closing) throw new HttpError(409, "this RUYUI was sold: its money is on its way to you");
    const open = await pg.one<{ id: number }>(`select id from mine.vault_requests where wallet = ? and chain = 'ruyui' and kind = 'withdraw'
      and status in ('new', 'doing')`, wallet);
    if (open) throw new HttpError(409, "a withdrawal is already on its way");
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, 'ruyui', 'withdraw', ?, ?::text::jsonb) returning id`, wallet, me, JSON.stringify({ bps }));
    return { token: id, wallet, id: row!.id, status: "new" };
  }

  async function requestView(id: number) {
    const r = await pg.one<any>(`select id, wallet, kind, status, result, extract(epoch from at)::float8 as at, extract(epoch from done_at)::float8 as done_at
      from mine.vault_requests where id = ? and chain = 'ruyui'`, id);
    if (!r) throw new HttpError(404, "no such request");
    if (r.kind === "register") r.wallet = r.result?.wallet ?? null;
    return r;
  }

  async function admin() {
    return {
      on, contract,
      wallets: (await pg.one<{ n: number }>("select count(*)::int as n from mine.vault_wallets where id like 'ruyui:%'"))?.n ?? 0,
      funded: await pg.all("select * from mine.vault_ledger where chain = 'ruyui' and holder is not null order by principal_usd desc limit 100"),
      requests: await pg.all("select * from mine.vault_requests where chain = 'ruyui' order by id desc limit 100"),
      pool: await publicOf("ruyui:pool"),
    };
  }

  // ---- routes ----------------------------------------------------------------------------------------------------
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/ruyui/config") return d.send(res, 200, await config()), true;
      if ((m = /^\/api\/ruyui\/token\/(\d{1,6})$/.exec(p))) return d.send(res, 200, await tokenView(tokenOf(m[1]))), true;
      if ((m = /^\/api\/ruyui\/wallet\/(0x[0-9a-fA-F]{40})$/.exec(p))) return d.send(res, 200, await walletLookup(m[1])), true;
      if ((m = /^\/api\/ruyui\/holder\/(0x[0-9a-fA-F]{40})$/.exec(p))) return d.send(res, 200, await holderView(m[1])), true;
      if ((m = /^\/api\/ruyui\/requests\/(\d{1,12})$/.exec(p))) return d.send(res, 200, await requestView(Number(m[1]))), true;
      if (p === "/api/ruyui/leaderboard") {
        isOn();
        return d.send(res, 200, (await publicOf("leaderboard:ruyui")) ?? { all: [], d7: [], h24: [] }), true;
      }
      if (p === "/api/ruyui/pool") { isOn(); return d.send(res, 200, (await publicOf("ruyui:pool")) ?? { mode: "paper", epochs: [] }), true; }
      if ((m = /^\/api\/ruyui\/pool\/epochs\/(\d{1,5})$/.exec(p))) {
        isOn();
        const e = await publicOf(`ruyui:pool:epoch:${Number(m[1])}`);
        if (!e) throw new HttpError(404, "no such epoch");
        return d.send(res, 200, e), true;
      }
      if (p === "/api/admin/ruyui") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
    }
    if (req.method === "POST") {
      if ((m = /^\/api\/ruyui\/token\/(\d{1,6})\/setup$/.exec(p))) return d.send(res, 200, await setup(req, tokenOf(m[1]))), true;
      if ((m = /^\/api\/ruyui\/wallet\/(0x[0-9a-fA-F]{40})\/(settings|withdraw)$/.exec(p))) {
        const body = await d.readJson(req);
        return d.send(res, 200, await (m[2] === "settings" ? saveSettings : withdraw)(req, m[1], body)), true;
      }
    }
    return false;
  }

  return { route, on };
}
