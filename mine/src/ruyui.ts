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
import { checksumAddress, personalMessageHash, recoverAddress } from "./wallet.ts";

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
// no gas loans for RUYUI (user 2026-10-03): under this much ETH a wallet can't send a transaction and waits for its
// holder to send some (flytrade/vaults/ruyui.py NEEDS_GAS_WEI); SUGGESTED_GAS_ETH lasts a long while
const NEEDS_GAS_WEI = 5n * 10n ** 13n;
const SUGGESTED_GAS_ETH = 0.0005;

// linked wallets (2026-10-03, the user): a RUYUI held by an Abstract Global Wallet is run by a Robinhood Chain wallet the
// AGW names once (LINK_MESSAGE, checked with ERC-1271 on Abstract); a signed link is good this long after it's issued
const LINK_FRESH_MS = 30 * 60_000;
const ERC1271_OK = "0x1626ba7e";
export const LINK_MESSAGE = (owner: string, signer: string, issuedAt: string) => [
  "RUYUI on fly.ai: link a Robinhood Chain wallet",
  "",
  `My wallet on Abstract (it holds my RUYUIs): ${owner}`,
  `lets this Robinhood Chain wallet act for it: ${signer}`,
  "It signs in, holds my 200,000 $FLYAI, funds and manages my RUYUIs' trading wallets, and is paid their withdrawals.",
  "",
  `Issued at: ${issuedAt}`,
].join("\n");

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
  /**
   * Who runs a RUYUI: the Robinhood Chain wallet its Abstract owner linked (an AGW can't sign in, hold $FLYAI or be paid
   * on Robinhood Chain), else that owner itself. Every check here goes through this - setup, settings, withdrawals, the
   * status - and the desk maps its owners the same way (flytrade/vaults/ruyui.py), so the holder is the linked wallet.
   */
  async function ownerOf(id: number, fresh = false): Promise<string | null> {
    const nft = await nftOwnerOf(id, fresh);
    return nft ? (await linkOf(nft, fresh)) ?? nft : null;
  }
  const links = new Map<string, { signer: string | null; at: number }>();
  async function linkOf(owner: string, fresh = false): Promise<string | null> {
    const k = owner.toLowerCase(), hit = links.get(k);
    if (!fresh && hit && Date.now() - hit.at < ownerTtlMs) return hit.signer;
    const row = await pg.one<{ signer: string }>("select signer from mine.ruyui_links where owner = ?", k);
    const signer = row ? checksumAddress(row.signer) : null;
    links.set(k, { signer, at: Date.now() });
    if (links.size > 10_000) links.clear();
    return signer;
  }
  // staked RUYUIs (2026-10-04, the user: "it should first check if staked, if yes, return as fine, if not then check
  // chain"): Ruyui's staking contract holds a staked RUYUI, so ownerOf names the contract. Their API (one call lists
  // every staker, cached STAKED_TTL_MS) is asked first; a RUYUI the chain says the contract holds but the API doesn't
  // list is an error (try again), never "someone else owns it". Same rule on the desk: flytrade/vaults/ruyui.py owners_of.
  const stakingApi = d.env.RUYUI_STAKING_API ?? "https://api.ruyui.com/quest/nft/staking/wallets";
  const stakingContract = (d.env.RUYUI_STAKING_CONTRACT ?? "0xb60fa32c8041c8b0f56220420b56ce6b86decde9").toLowerCase();
  const STAKED_TTL_MS = 60_000;
  let staked: { at: number; map: Map<number, string> | null; loading?: Promise<Map<number, string> | null> } = { at: 0, map: null };
  async function stakedOwners(fresh = false, force = false): Promise<Map<number, string> | null> {
    // force: a RUYUI just staked isn't on a cached list yet - re-read, at most every 5 s
    const ttl = force ? 5_000 : fresh ? 10_000 : STAKED_TTL_MS;
    if (staked.map && Date.now() - staked.at < ttl) return staked.map;
    if (staked.loading) return staked.loading;
    staked.loading = (async () => {
      try {
        const res = await fetch(stakingApi, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json() as { address?: string; nftList?: number[] }[];
        const map = new Map<number, string>();
        for (const r of Array.isArray(rows) ? rows : []) {
          if (!ADDRESS.test(String(r.address ?? ""))) continue;
          for (const i of r.nftList ?? []) if (Number.isInteger(i) && i >= RUYUI.firstId && i <= RUYUI.lastId) map.set(i, checksumAddress(String(r.address)));
        }
        staked = { at: Date.now(), map };
        return map;
      } catch {
        // unreadable: the last list for up to 10 minutes, else nothing (a staked RUYUI then can't be confirmed)
        return staked.map && Date.now() - staked.at < 10 * STAKED_TTL_MS ? staked.map : null;
      } finally {
        staked.loading = undefined;
      }
    })();
    return staked.loading;
  }

  async function nftOwnerOf(id: number, fresh = false): Promise<string | null> {
    const stakers = await stakedOwners(fresh);
    const staker = stakers?.get(id);
    if (staker) return staker;                         // staked: its staker, no chain read
    const onChain = await chainOwnerOf(id, fresh);
    if (onChain && onChain.toLowerCase() === stakingContract) {
      const again = (await stakedOwners(true, true))?.get(id);   // staked since the list was read
      if (again) return again;
      throw new HttpError(503, "this RUYUI is staked and Ruyui's staking list can't be read right now; try again shortly");
    }
    return onChain;
  }
  const isStaked = async (id: number) => !!(await stakedOwners())?.has(id);

  async function chainOwnerOf(id: number, fresh = false): Promise<string | null> {
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
    const [wallet, owner, nftOwner] = await Promise.all([walletOf(id), ownerOf(id), nftOwnerOf(id)]);
    const [w, setup, flyai, pool, gasWei] = await Promise.all([
      walletView(wallet), wallet ? null : openSetup(id), owner ? flyaiOf(owner).catch(() => null) : null,
      owner ? poolHolder(owner) : null, wallet ? ethWei(wallet).catch(() => null) : null,
    ]);
    const needsGas = gasWei != null && gasWei < NEEDS_GAS_WEI;
    const holder = w.ledger?.holder ?? null;
    return {
      // owner: who runs it (the linked Robinhood Chain wallet, else the holder on Abstract); nft_owner: the holder on Abstract
      token: id, owner, nft_owner: nftOwner, linked: !!(owner && nftOwner && owner.toLowerCase() !== nftOwner.toLowerCase()),
      staked: await isStaked(id),
      wallet, setup: setup ?? null, ...w,
      hold: { flyai, needed: holdFlyai, ok: flyai == null ? null : flyai >= holdFlyai },
      gas: wallet ? { eth: gasWei == null ? null : Number(gasWei) / 1e18, needs_gas: needsGas, suggested_eth: SUGGESTED_GAS_ETH } : null,
      // trading opens when the RUYUI's owner is the holder of the money, holds 200k $FLYAI and trading is on
      status: !wallet ? "no_wallet" : w.ledger?.closing ? "closing" : !holder ? "not_funded"
        : !owner || owner.toLowerCase() !== holder.toLowerCase() ? "owner_changed"
        : flyai != null && flyai < holdFlyai ? "below_hold" : needsGas ? "needs_gas"
        : w.settings?.trading === false ? "paused" : "active",
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

  // ---- linking an Abstract Global Wallet to a Robinhood Chain wallet -------------------------------------------
  function linkMessage(rawOwner: string, rawSigner: string, issuedAt?: string) {
    const owner = addressOf(rawOwner), signer = addressOf(rawSigner);
    if (owner.toLowerCase() === signer.toLowerCase()) throw new HttpError(400, "link two different wallets");
    const at = issuedAt ?? new Date().toISOString();
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(at)) throw new HttpError(400, "issued_at is an ISO time (UTC)");
    return { owner, signer, issued_at: at, message: LINK_MESSAGE(owner, signer, at) };
  }

  /** Did `owner` sign `message`? A contract account (an AGW) answers ERC-1271 on Abstract; a plain wallet is recovered. */
  async function ownerSigned(owner: string, message: string, signature: string): Promise<boolean> {
    if (!/^0x([0-9a-fA-F]{2})+$/.test(signature) || signature.length > 20_000) throw new HttpError(400, "bad signature");
    let code: string;
    try { code = await rpc(abstractRpc, "eth_getCode", [owner, "latest"]) as string; }
    catch { throw new HttpError(502, "Abstract can't be read right now; try again"); }
    if (code && code !== "0x") {
      const sig = signature.slice(2), len = sig.length / 2;
      const data = `${selector("isValidSignature(bytes32,bytes)")}${word(`0x${Buffer.from(personalMessageHash(message)).toString("hex")}`)}`
        + `${word(64)}${word(len)}${sig.padEnd(Math.ceil(sig.length / 64) * 64, "0")}`;
      try {
        const ret = await rpc(abstractRpc, "eth_call", [{ to: owner, data }, "latest"]) as string;
        return ret.slice(0, 10).toLowerCase() === ERC1271_OK;
      } catch { return false; }
    }
    // no code: a plain wallet, or an AGW not deployed yet (its signature is ERC-6492-wrapped, not checkable here)
    if (/6492649264926492649264926492649264926492649264926492649264926492$/i.test(signature)) {
      throw new HttpError(400, "this Abstract wallet isn't deployed yet: make any transaction with it on Abstract, then sign again");
    }
    try { return recoverAddress(message, signature).toLowerCase() === owner.toLowerCase(); } catch { return false; }
  }

  async function link(req: IncomingMessage, body: any) {
    isOn();
    const me = await d.sessionWallet(req);                 // the Robinhood Chain wallet, signed in
    const m = linkMessage(String(body?.owner ?? ""), String(body?.signer ?? me), String(body?.issued_at ?? ""));
    if (m.signer.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "sign in with the wallet being linked");
    const issued = Date.parse(m.issued_at);
    if (!(Math.abs(Date.now() - issued) < LINK_FRESH_MS)) throw new HttpError(400, "the signed link is too old: sign a new one");
    if (!(await ownerSigned(m.owner, m.message, String(body?.signature ?? "")))) {
      throw new HttpError(401, "that isn't the Abstract wallet's signature of this link");
    }
    const row = await pg.one<{ owner: string }>(`insert into mine.ruyui_links (owner, signer, issued_at_ms, signature, updated_at_ms)
      values (?, ?, ?, ?, ?) on conflict (owner) do update set signer = excluded.signer, issued_at_ms = excluded.issued_at_ms,
      signature = excluded.signature, updated_at_ms = excluded.updated_at_ms
      where mine.ruyui_links.issued_at_ms < excluded.issued_at_ms returning owner`,
      m.owner.toLowerCase(), m.signer.toLowerCase(), issued, String(body.signature), Date.now());
    if (!row) throw new HttpError(409, "a newer link is already in place");
    links.delete(m.owner.toLowerCase());
    return { owner: m.owner, signer: m.signer, issued_at: m.issued_at, linked: true };
  }

  async function linkView(raw: string) {
    isOn();
    const address = addressOf(raw);
    const asOwner = await pg.one<{ signer: string; issued_at_ms: number }>(
      "select signer, issued_at_ms from mine.ruyui_links where owner = ?", address.toLowerCase());
    const asSigner = await pg.all<{ owner: string }>("select owner from mine.ruyui_links where signer = ?", address.toLowerCase());
    return { address, signer: asOwner ? checksumAddress(asOwner.signer) : null,
             issued_at: asOwner ? new Date(Number(asOwner.issued_at_ms)).toISOString() : null,
             acts_for: asSigner.map((r) => checksumAddress(r.owner)) };
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
      if (p === "/api/ruyui/link/message") {
        isOn();
        return d.send(res, 200, linkMessage(url.searchParams.get("owner") ?? "", url.searchParams.get("signer") ?? "")), true;
      }
      if ((m = /^\/api\/ruyui\/link\/(0x[0-9a-fA-F]{40})$/.exec(p))) return d.send(res, 200, await linkView(m[1])), true;
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
      if (p === "/api/ruyui/link") return d.send(res, 200, await link(req, await d.readJson(req))), true;
      if ((m = /^\/api\/ruyui\/wallet\/(0x[0-9a-fA-F]{40})\/(settings|withdraw)$/.exec(p))) {
        const body = await d.readJson(req);
        return d.send(res, 200, await (m[2] === "settings" ? saveSettings : withdraw)(req, m[1], body)), true;
      }
    }
    return false;
  }

  return { route, on };
}
