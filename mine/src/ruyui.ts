/**
 * RUYUI on our backend (flytrade/RUYUI-PLAN.md, user 2026-10-03): Ruyui Studios' NFTs (ERC-721, on Ethereum since
 * 2026-11-12; Abstract before) get our Fly Wallets and a shared pool; they build the front-end on their site from
 * flytrade/ruyui/INTEGRATION.md, against this API. Nothing here is shown on our site. It never sees a key.
 * 2026-11-12 (the user: "migrated to L1, so we don't need that binding with Abstract AGW", "remove the staking check,
 * just holding check", "we need all the new features as well (perps etc)"): the owner is ownerOf on Ethereum, plain
 * wallets sign in as themselves (no links, no ERC-1271), and Elysium / Zero / Perps open as on partners' NFT wallets:
 *
 * - wallets: made by the RUYUI desk (flytrade/vaults/ruyui.py) when the owner asks (POST /token/:id/setup -> a
 *   'register' request); keystore ids "ruyui:<id>" in mine.vault_wallets. Deposits are plain transfers of ETH or USDG
 *   on Robinhood Chain to that address; the desk credits the RUYUI's owner.
 * - its records: ledger / requests under chain 'ruyui', settings "ruyui:<wallet>", stats "vault:ruyui:<wallet>",
 *   "leaderboard:ruyui" - never the Trader Flies' (src/vaults.ts refuses RUYUI wallets: they have no fly_id).
 * - the rules: the owner on Ethereum decides until money is in; then the holder (who funded it). The holder's own
 *   wallet holds 200k $FLYAI on Robinhood Chain; the profit fee is a flat 4%, half ours and half Ruyui's (2026-10-05).
 * - the pool (flytrade/vaults/ruyuipool.py, paper): "ruyui:pool", "ruyui:pool:holders", "ruyui:pool:epoch:<n>".
 * Sign-in is the site-wide session (/api/session/nonce + /api/session, x-flyai-session); PARTNER_ORIGINS lets their
 * origin be the domain the SIWE message names.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import { multicall } from "./multicall.ts";
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
  contract: "0x45d9AE3755F759450917F8fE3462f947278e7CC5",   // Ethereum, 2026-11-12 (was 0x9ce8…50c0 on Abstract)
  chain: "ethereum",
  chainId: 1,
  firstId: 1,
  lastId: 7000,
  feeBps: 400,          // 4% of profit: 2% fly.ai + 2% Ruyui (flytrade/vaults/ruyui.py PARTNER_FEE_TO)
  poolFeeBps: 400,      // 4% of the pool's profit, split the same way
};
const ROBINHOOD = { chain: "robinhood", chainId: 4663, explorer: "https://robinhoodchain.blockscout.com" };
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_DOC = 16_000;
// no gas loans for RUYUI (user 2026-10-03): under this much ETH a wallet can't send a transaction and waits for its
// holder to send some (flytrade/vaults/ruyui.py NEEDS_GAS_WEI); SUGGESTED_GAS_ETH lasts a long while
const NEEDS_GAS_WEI = 5n * 10n ** 13n;
const SUGGESTED_GAS_ETH = 0.0005;

const ZERO = "0x0000000000000000000000000000000000000000";

const word = (v: bigint | number | string) =>
  typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0");

type Ledger = { holder: string | null; principal_usd: number; locked_usd: number; closing: boolean };

export function createRuyui(d: RuyuiDeps) {
  const { pg, HttpError } = d;
  const on = d.env.RUYUI_ON === "1";
  const ethRpc = d.env.ETHEREUM_RPC ?? "https://ethereum-rpc.publicnode.com";
  const holdFlyai = Number(d.env.RUYUI_HOLD_FLYAI ?? "200000");
  // the shared pool runs only with RUYUI_POOL_ON=1 on the desk too (2026-11-12, the user: "turn on wallets only"); off,
  // its pages say "off" instead of showing its last numbers as live
  const poolOn = d.env.RUYUI_POOL_ON === "1";
  const contract = checksumAddress(d.env.RUYUI_CONTRACT ?? RUYUI.contract);
  // an owner is cached this long for the views (their pages poll); actions always read fresh
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

  // ---- owners (ownerOf on Ethereum) and chain reads (Robinhood: $FLYAI) -----------------------------------------
  // 2026-11-12: plain holding - the RUYUI's owner on Ethereum runs it (no staking list, no linked wallets); one not
  // migrated from Abstract yet has no owner. Same rule on the desk: flytrade/vaults/ruyui.py owners_of
  const owners1 = new Map<number, { owner: string | null; at: number }>();
  async function ownerOf(id: number, fresh = false): Promise<string | null> {
    const hit = owners1.get(id);
    if (!fresh && hit && Date.now() - hit.at < ownerTtlMs) return hit.owner;
    let owner: string | null;
    try {
      const ret = await rpc(ethRpc, "eth_call", [{ to: contract, data: `${selector("ownerOf(uint256)")}${word(id)}` }, "latest"]) as string;
      owner = checksumAddress(`0x${ret.slice(-40)}`);
      if (owner === ZERO) owner = null;
    } catch (err) {
      if (/revert/i.test(String((err as Error)?.message ?? err))) owner = null;      // not migrated yet, or burned
      else throw new HttpError(502, "Ethereum can't be read right now; try again");
    }
    owners1.set(id, { owner, at: Date.now() });
    if (owners1.size > 50_000) owners1.clear();
    return owner;
  }
  // every RUYUI's owner, for a holder's list: one Multicall3 sweep per OWNERS_TTL_MS, the last one answering meanwhile
  const OWNERS_TTL_MS = Number(d.env.RUYUI_OWNERS_TTL_SEC ?? "600") * 1000;
  const sweep: { at: number; byOwner: Map<string, number[]> | null; loading?: Promise<Map<string, number[]>> } = { at: 0, byOwner: null };
  async function tokensOf(holder: string): Promise<{ tokens: number[]; at: number }> {
    if (!sweep.byOwner || Date.now() - sweep.at >= OWNERS_TTL_MS) {
      sweep.loading ??= (async () => {
        try {
          const sel = selector("ownerOf(uint256)"), ids: number[] = [], calls: { to: string; data: string }[] = [];
          for (let i = RUYUI.firstId; i <= RUYUI.lastId; i++) { ids.push(i); calls.push({ to: contract, data: `${sel}${word(i)}` }); }
          const out = await multicall(ethRpc).batch(calls);
          const byOwner = new Map<string, number[]>();
          out.forEach((ret, k) => {
            if (!ret || ret.length < 66) return;
            const o = `0x${ret.slice(-40)}`.toLowerCase();
            if (o === ZERO) return;
            byOwner.set(o, [...(byOwner.get(o) ?? []), ids[k]]);
          });
          sweep.at = Date.now();
          sweep.byOwner = byOwner;
          return byOwner;
        } finally {
          sweep.loading = undefined;
        }
      })();
      if (!sweep.byOwner) {
        try { await sweep.loading; } catch { throw new HttpError(502, "Ethereum can't be read right now; try again"); }
      } else {
        sweep.loading.catch((err) => console.error(`ruyui owners sweep: ${(err as Error)?.message ?? err}`));
      }
    }
    return { tokens: sweep.byOwner?.get(holder.toLowerCase()) ?? [], at: sweep.at };
  }

  async function ethWei(wallet: string): Promise<bigint> {
    return BigInt(await rpc(d.rpcUrl, "eth_getBalance", [wallet, "latest"]) as string);
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
        // each wallet pays its own gas from ETH its holder sends: no ETH, no trading (status "needs_gas")
        gas: { min_eth: Number(NEEDS_GAS_WEI) / 1e18, suggested_eth: SUGGESTED_GAS_ETH },
        fee: { profit_bps: RUYUI.feeBps },
      },
      // what a RUYUI wallet can do besides trading (2026-11-12, as partners' NFT wallets): Perps on Lighter when the
      // desk serves it; Elysium and Zero say per wallet when they're open (the token view's elysium / zero .live)
      features: { perps: d.env.VAULT_PERPS === "1", elysium: true, zero: true },
      hold: { symbol: "FLYAI", address: FLYAI, chain: ROBINHOOD.chain, amount: holdFlyai, staked_counts: false },
      pool: { fee_bps: RUYUI.poolFeeBps, epoch_days: 7, mode: poolOn ? "paper" : "off", on: poolOn },
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
    const [w, setup, flyai, pool, gasWei, elysium, perps, zero] = await Promise.all([
      walletView(wallet), wallet ? null : openSetup(id), owner ? flyaiOf(owner).catch(() => null) : null,
      owner ? poolHolder(owner) : null, wallet ? ethWei(wallet).catch(() => null) : null,
      wallet ? publicOf(`vault:elysium:${wallet}`) : null,
      wallet && d.env.VAULT_PERPS === "1" ? publicOf(`vault:perps:${wallet}`) : null,
      wallet ? publicOf(`vault:zero:${wallet}`) : null,            // (Zero, vzero.py: null until the desk's ZERO_LIVE)
    ]);
    const needsGas = gasWei != null && gasWei < NEEDS_GAS_WEI;
    const holder = w.ledger?.holder ?? null;
    return {
      // owner: the RUYUI's holder on Ethereum (null: not migrated from Abstract yet, or burned)
      token: id, owner,
      wallet, setup: setup ?? null, ...w, elysium, perps, zero,
      hold: { flyai, needed: holdFlyai, ok: flyai == null ? null : flyai >= holdFlyai },
      gas: wallet ? { eth: gasWei == null ? null : Number(gasWei) / 1e18, needs_gas: needsGas, suggested_eth: SUGGESTED_GAS_ETH } : null,
      // trading opens when the RUYUI's owner is the holder of the money, holds 200k $FLYAI and trading is on; no_owner:
      // not on Ethereum (yet) - its wallet, if any, keeps its money but doesn't trade
      status: !owner ? "no_owner" : !wallet ? "no_wallet" : w.ledger?.closing ? "closing" : !holder ? "not_funded"
        : owner.toLowerCase() !== holder.toLowerCase() ? "owner_changed"
        : flyai != null && flyai < holdFlyai ? "below_hold" : needsGas ? "needs_gas"
        : w.settings?.trading === false ? "paused" : "active",
      pool: pool && poolOn ? { qualifies: pool.qualifies ?? false, epoch_hours: pool.epoch_hours ?? 0, epoch_est_usd: pool.epoch_est_usd ?? 0,
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
    const [flyai, pool, owned] = await Promise.all([flyaiOf(address).catch(() => null), poolHolder(address), tokensOf(address)]);
    const tokens = owned.tokens;
    const rows = tokens.length
      ? await pg.all<{ id: string; address: string }>("select id, address from mine.vault_wallets where id = any(?::text[])",
        `{${tokens.map((t) => `ruyui:${t}`).join(",")}}`)
      : [];
    const funded = await pg.all<{ wallet: string; principal_usd: number; closing: boolean }>(
      "select wallet, principal_usd, closing from mine.vault_ledger where chain = 'ruyui' and lower(holder) = lower(?)", address);
    return {
      address, flyai, hold: { needed: holdFlyai, ok: flyai == null ? null : flyai >= holdFlyai },
      // the RUYUIs it holds on Ethereum (all 7000 read at most every 10 minutes)
      tokens, tokens_checked_at: owned.at ? owned.at / 1000 : null,
      wallets: rows.map((r) => ({ token: Number(r.id.slice(6)), wallet: r.address })),
      holding_money_in: funded,
      pool: pool && poolOn ? { qualifies: pool.qualifies ?? false, epoch_hours: pool.epoch_hours ?? 0, epoch_est_usd: pool.epoch_est_usd ?? 0,
                               owed_usd: pool.owed_usd ?? 0 } : null,
    };
  }

  // ---- the owner's actions (signed in) -----------------------------------------------------------------------
  /** Is the signed-in wallet `who`? (Plain wallets only since 2026-11-12: no linked Abstract wallets.) */
  const actsFor = (me: string, who: string | null | undefined) => !!who && me.toLowerCase() === who.toLowerCase();

  async function setup(req: IncomingMessage, id: number) {
    isOn();
    const me = await d.sessionWallet(req);
    const owner = await ownerOf(id, true);
    if (!owner) throw new HttpError(403, "this RUYUI isn't on Ethereum yet: migrate it first");
    if (!actsFor(me, owner)) throw new HttpError(403, "only the RUYUI's owner can set up its wallet");
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
      if (!actsFor(me, holder)) throw new HttpError(403, "only the wallet's holder can change its settings");
    } else if (!actsFor(me, await ownerOf(id, true))) {
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
    if (!led?.holder || !actsFor(me, led.holder)) throw new HttpError(403, "only the wallet's holder can withdraw");
    if (led.closing) throw new HttpError(409, "this RUYUI was sold: its money is on its way to you");
    const open = await pg.one<{ id: number }>(`select id from mine.vault_requests where wallet = ? and chain = 'ruyui' and kind = 'withdraw'
      and status in ('new', 'doing')`, wallet);
    if (open) throw new HttpError(409, "a withdrawal is already on its way");
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, 'ruyui', 'withdraw', ?, ?::text::jsonb) returning id`, wallet, me, JSON.stringify({ bps }));
    return { token: id, wallet, id: row!.id, status: "new" };
  }

  // ---- Elysium, Zero and Perps on a RUYUI wallet (2026-11-12): as partners' NFT wallets (src/partners.ts money) ----
  async function money(req: IncomingMessage, raw: string, body: any, what: "elysium" | "zero" | "perps") {
    isOn();
    const me = await d.sessionWallet(req);
    const { wallet, id } = await ruyuiWallet(raw);
    const led = await ledgerOf(wallet);
    const action = String(body?.action ?? "");
    let kind: string, params: Record<string, unknown> = {};
    let who: string | null = led?.holder ?? (led?.closing ? null : await ownerOf(id, true));
    const pre = what === "zero" ? "zero" : "ely";               // (Zero is the same book on another chain: vzero.py)
    if (what === "elysium" || what === "zero") {
      const row = await publicOf(`vault:${what}:${wallet}`);
      if (!row?.live) throw new HttpError(503, `${what === "zero" ? "Zero" : "Elysium"} isn't open for this wallet yet`);
      if (action === "in") {
        const usd = Number(body?.usd);
        if (!Number.isFinite(usd) || usd < 5 || usd > 1_000_000) throw new HttpError(400, "usd is at least 5");
        if (!led?.holder) throw new HttpError(403, "only the wallet's holder can move its money");
        kind = `${pre}_in`; params = { usd };
      } else if (action === "out") {
        const bps = Number(body?.bps);
        if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) throw new HttpError(400, "bps is 1..10000");
        who = row.holder ?? null;
        kind = `${pre}_out`; params = { bps, mode: body?.mode === "home" ? "home" : "withdraw" };
      } else throw new HttpError(400, "action is in or out");
    } else {
      if (d.env.VAULT_PERPS !== "1") throw new HttpError(503, "Perps isn't open yet");
      const markets = body?.markets === undefined ? undefined : String(body.markets);
      if (markets !== undefined && !["crypto", "stocks", "both"].includes(markets)) throw new HttpError(400, "markets is crypto, stocks or both");
      if (action === "on" || action === "set") { kind = `perp_${action}`; params = markets ? { markets } : {}; }
      else if (action === "off") kind = "perp_off";
      else throw new HttpError(400, "action is on, set or off");
    }
    if (!actsFor(me, who)) throw new HttpError(403, "only the wallet's holder can do this");
    const like = what === "perps" ? "perp\\_%" : `${pre}\\_%`;
    const open = await pg.one<{ id: number }>(`select id from mine.vault_requests where wallet = ? and chain = 'ruyui' and kind like ?
      and status in ('new', 'doing')`, wallet, like);
    if (open) throw new HttpError(409, "a request is already on its way");
    const r = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, 'ruyui', ?, ?, ?::text::jsonb) returning id`, wallet, kind, me, JSON.stringify(params));
    return { token: id, wallet, id: r!.id, status: "new" };
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
      if (p === "/api/ruyui/pool") {
        isOn();
        const pool = (await publicOf("ruyui:pool")) ?? { mode: "paper", epochs: [] };
        return d.send(res, 200, poolOn ? pool : { ...pool, mode: "off", on: false }), true;
      }
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
      if ((m = /^\/api\/ruyui\/wallet\/(0x[0-9a-fA-F]{40})\/(settings|withdraw|elysium|zero|perps)$/.exec(p))) {
        const body = await d.readJson(req);
        if (m[2] === "elysium" || m[2] === "zero" || m[2] === "perps") return d.send(res, 200, await money(req, m[1], body, m[2])), true;
        return d.send(res, 200, await (m[2] === "settings" ? saveSettings : withdraw)(req, m[1], body)), true;
      }
    }
    // the Abstract wallet links (2026-10-03 to 11-12): gone with RUYUI's move to Ethereum
    if (p === "/api/ruyui/link" || p.startsWith("/api/ruyui/link/")) {
      throw new HttpError(410, "RUYUI is on Ethereum now: sign in with the wallet that holds it, no link needed");
    }
    return false;
  }

  return { route, on };
}
