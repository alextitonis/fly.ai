/**
 * Fly Wallets (flytrade/FLYWALLET-PLAN.md): every Trader Fly trades its own plain wallet. Redesign 2026-10-02 (user):
 * one wallet per fly whose key the vault desk keeps encrypted (flytrade/vaults/keystore.py) - no vault contracts. The
 * same address serves every chain. This module is the site's side; it never sees a key:
 *
 * - views: the fly's wallet address (mine.vault_wallets, made by the desk for every minted fly), whose money is in it
 *   per chain (mine.vault_ledger: holder, principal, locked, closing), the desk's stats and leaderboards
 *   (mine.vault_public). Depositing is just sending coins to that address: the desk credits the fly's owner.
 * - settings: the owner's document per wallet per chain (mine.vault_settings, key "<address>" on Robinhood Chain,
 *   "<chain>:<address>" elsewhere). Only the holder may save it - or, while nobody's money is in it, the fly's owner.
 * - withdrawals: the signed-in holder asks (mine.vault_requests); the desk pays it in kind within a bar, minus the
 *   profit fee. GET /api/vaults/requests/:id follows it.
 * - moves: the holder moves some of the fly's cash to another chain (the desk bridges it through Relay, relay.link,
 *   into the same wallet address there).
 * - FlightPass burns: the owner of a fly and a pass registers the burn, sends the pass to 0x...dEaD, and this worker
 *   then pays the pass's whole balance plus the house grant (VAULT_GRANT_USD of FLYAI, $10) from the granter wallet into
 *   the fly's wallet, and asks the desk to lock that much (kind pass_burn). The pass's ledger is emptied first (one row,
 *   tx "vault-grant:<pass>"), so it is paid once; one pass per fly, ever.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg, Q } from "./pg.ts";
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";
import { checksumAddress } from "./wallet.ts";

export interface VaultsDeps {
  pg: Pg;
  book: (q: Q, wallet: string, orderId: string | null, kind: string, amount: bigint, extra?: { tx?: string }) => Promise<void>;
  balanceOf: (q: Q, wallet: string) => Promise<bigint>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  fromWei: (w: bigint) => string;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  rpcUrl: string;
  env: NodeJS.ProcessEnv;
  /** the FLYAI token */
  token: string;
  /** the wallet that pays FlightPass grants into fly wallets (holds a FLYAI float and gas) */
  granter: { address: string; send: (to: string, data: string) => Promise<string> } | null;
}

const word = (v: bigint | number | string) =>
  typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0");
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_DOC = 16_000;
const DEAD = "0x000000000000000000000000000000000000dEaD";

/** The chains a fly's wallet trades on besides Robinhood Chain (switched on with VAULT_CHAINS=base,arbitrum,...). */
const NETS: Record<string, { chainId: number; native: string; stable: string; stableDec: number; stableSym: string; poly?: boolean }> = {
  base: { chainId: 8453, native: "ETH", stable: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", stableDec: 6, stableSym: "USDC" },
  arbitrum: { chainId: 42161, native: "ETH", stable: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", stableDec: 6, stableSym: "USDC" },
  bsc: { chainId: 56, native: "BNB", stable: "0x55d398326f99059fF775485246999027B3197955", stableDec: 18, stableSym: "USDT" },
  polygon: { chainId: 137, native: "POL", stable: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", stableDec: 6, stableSym: "USDC.e", poly: true },
};

type Ledger = { holder: string | null; principal_usd: number; locked_usd: number; closing: boolean };

export function createVaults(d: VaultsDeps) {
  const { pg, HttpError, fromWei } = d;
  const CFG = {
    traderFly: checksumAddress(d.env.ARENA_TRADERFLY ?? "0x18d4D831cA89672126172B73bA05f5A318ad5A72"),
    flightPass: checksumAddress(d.env.VAULT_FLIGHTPASS ?? "0x89eFFb63578A09065c2BbfDd729E161be7D479Da"),
    grantUsd: Number(d.env.VAULT_GRANT_USD ?? "10"),
    tickMs: Number(d.env.VAULT_TICK_SEC ?? "60") * 1000,
  };
  const on = d.env.VAULT_ON === "1";
  const AWAY = (d.env.VAULT_CHAINS ?? "").split(",").map((c) => c.trim().toLowerCase()).filter((c) => NETS[c]);
  const call = (to: string, data: string) => rpc(d.rpcUrl, "eth_call", [{ to, data }, "latest"]) as Promise<string>;
  const addr = (ret: string) => checksumAddress(`0x${ret.slice(-40)}`);
  const isOn = () => { if (!on) throw new HttpError(503, "Fly Wallets aren't open yet"); };
  const chainOf = (c: unknown) => {
    const chain = c && c !== "robinhood" ? String(c) : "robinhood";
    if (chain !== "robinhood" && !AWAY.includes(chain)) throw new HttpError(400, "that chain isn't offered");
    return chain;
  };
  const settingsKey = (wallet: string, chain: string) => (chain === "robinhood" ? wallet : `${chain}:${wallet}`);
  const statsKey = (wallet: string, chain: string) => (chain === "robinhood" ? `vault:${wallet}` : `vault:${chain}:${wallet}`);

  async function ownerOfFly(fly: number): Promise<string | null> {
    try { return addr(await call(CFG.traderFly, `${selector("ownerOf(uint256)")}${word(fly)}`)); } catch { return null; }
  }
  async function walletOf(fly: number): Promise<string | null> {
    return (await pg.one<{ address: string }>("select address from mine.vault_wallets where fly_id = ?", fly))?.address ?? null;
  }
  async function flyOfWallet(wallet: string): Promise<number | null> {
    return (await pg.one<{ fly_id: number }>("select fly_id from mine.vault_wallets where lower(address) = lower(?)", wallet))?.fly_id ?? null;
  }
  async function ledgerOf(wallet: string, chain: string): Promise<Ledger | null> {
    return (await pg.one<Ledger>("select holder, principal_usd, locked_usd, closing from mine.vault_ledger where wallet = ? and chain = ?",
      wallet, chain)) ?? null;
  }
  const publicOf = async (key: string) =>
    (await pg.one<{ value: any }>("select value from mine.vault_public where key = ?", key))?.value ?? null;
  const settingsOf = async (key: string) =>
    (await pg.one<{ doc: any; updated_at_ms: number }>("select doc, updated_at_ms from mine.vault_settings where vault = ?", key)) ?? null;

  // ---- views -------------------------------------------------------------------------------------------------
  async function config() {
    return { on, grant_usd: CFG.grantUsd, starters: await publicOf("starters"), flightpass: CFG.flightPass, dead: DEAD,
             hold_flyai: Number(d.env.VAULT_HOLD_FLYAI ?? "200000"),
             chains: AWAY.map((chain) => { const n = NETS[chain]; return { chain, chain_id: n.chainId, native: n.native,
               stable: n.stable, stable_dec: n.stableDec, stable_sym: n.stableSym, ...(n.poly ? { poly: true } : {}) }; }) };
  }

  async function flyView(fly: number) {
    isOn();
    const [wallet, owner, granted] = await Promise.all([walletOf(fly), ownerOfFly(fly),
      pg.one<{ pass_id: number; status: string }>("select pass_id, status from mine.vault_grants where fly_id = ?", fly)]);
    const one = async (chain: string) => wallet
      ? { chain, ledger: await ledgerOf(wallet, chain), stats: await publicOf(statsKey(wallet, chain)),
          settings: (await settingsOf(settingsKey(wallet, chain)))?.doc ?? null }
      : { chain, ledger: null, stats: null, settings: null };
    const home = await one("robinhood");
    return { fly, owner, wallet, ...home, pass: granted ?? null, away: await Promise.all(AWAY.map(one)) };
  }

  // ---- the owner's settings ---------------------------------------------------------------------------------
  async function saveSettings(req: IncomingMessage, wallet: string, body: any) {
    isOn();
    const me = await d.sessionWallet(req);
    const doc = body?.settings;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new HttpError(400, "settings must be an object");
    const text = JSON.stringify(doc);
    if (text.length > MAX_DOC) throw new HttpError(400, "settings are too long");
    const chain = chainOf(body?.chain);
    const fly = await flyOfWallet(wallet);
    if (fly == null) throw new HttpError(404, "no such fly wallet");
    const holder = (await ledgerOf(wallet, chain))?.holder;
    if (holder) {
      if (holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can change its settings");
    } else if ((await ownerOfFly(fly))?.toLowerCase() !== me.toLowerCase()) {
      throw new HttpError(403, "only the fly's owner can set up its wallet");
    }
    const key = settingsKey(wallet, chain);
    const version = (await import("node:crypto")).createHash("sha1").update(text).digest("hex").slice(0, 12);
    await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::text::jsonb, ?, ?, ?)
      on conflict (vault) do update set doc = excluded.doc, version = excluded.version, updated_by = excluded.updated_by,
      updated_at_ms = excluded.updated_at_ms`, key, text, version, me, Date.now());   // (text, cast: a jsonb param would be stored as a JSON string)
    return { wallet, chain, version, settings: doc };
  }

  // ---- withdrawals: the holder asks, the desk pays ----------------------------------------------------------
  async function withdraw(req: IncomingMessage, wallet: string, body: any) {
    isOn();
    const me = await d.sessionWallet(req);
    const chain = chainOf(body?.chain);
    const bps = Number(body?.bps);
    if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) throw new HttpError(400, "bps is 1..10000");
    const led = await ledgerOf(wallet, chain);
    if (!led?.holder || led.holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can withdraw");
    const open = await pg.one<{ id: number }>(`select id from mine.vault_requests where wallet = ? and chain = ? and kind = 'withdraw'
      and status in ('new', 'doing')`, wallet, chain);
    if (open) throw new HttpError(409, "a withdrawal is already on its way");
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, ?, 'withdraw', ?, ?::text::jsonb) returning id`, wallet, chain, me, JSON.stringify({ bps }));
    return { id: row!.id, status: "new" };
  }

  async function move(req: IncomingMessage, wallet: string, body: any) {
    isOn();
    const me = await d.sessionWallet(req);
    const chain = chainOf(body?.chain);
    const to = chainOf(body?.to_chain);
    if (to === chain) throw new HttpError(400, "pick another chain");
    const usd = Number(body?.usd);
    if (!Number.isFinite(usd) || usd < 5 || usd > 1_000_000) throw new HttpError(400, "usd is at least 5");
    const led = await ledgerOf(wallet, chain);
    if (!led?.holder || led.holder.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the wallet's holder can move its money");
    const open = await pg.one<{ id: number }>(`select id from mine.vault_requests where wallet = ? and chain = ? and kind in ('withdraw', 'move')
      and status in ('new', 'doing')`, wallet, chain);
    if (open) throw new HttpError(409, "a withdrawal or move is already on its way");
    const row = await pg.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
      values (?, ?, 'move', ?, ?::text::jsonb) returning id`, wallet, chain, me, JSON.stringify({ to_chain: to, usd }));
    return { id: row!.id, status: "new" };
  }

  /** Flies whose wallet holds someone's money on any chain (the Breed page refuses to merge them, user 2026-10-02). */
  async function funded() {
    if (!on) return { flies: [] };
    const rows = await pg.all<{ fly_id: number }>(`select distinct w.fly_id from mine.vault_ledger l
      join mine.vault_wallets w on lower(w.address) = lower(l.wallet) where l.holder is not null and w.fly_id is not null`);
    return { flies: rows.map((r) => r.fly_id) };
  }

  async function requestView(id: number) {
    const r = await pg.one<any>("select id, wallet, chain, kind, status, result, extract(epoch from at) as at from mine.vault_requests where id = ?", id);
    if (!r) throw new HttpError(404, "no such request");
    return r;
  }

  // ---- FlightPass burns: the pass's balance and the grant into the fly's wallet ----------------------------
  async function registerBurn(req: IncomingMessage, fly: number, body: any) {
    isOn();
    const me = await d.sessionWallet(req);
    const pass = Number(body?.pass);
    if (!Number.isInteger(pass) || pass < 1) throw new HttpError(400, "pass is the FlightPass id");
    const wallet = await walletOf(fly);
    if (!wallet) throw new HttpError(409, "this fly's wallet is still being made");
    if ((await ownerOfFly(fly))?.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "only the fly's owner");
    if (await pg.one("select 1 from mine.vault_grants where fly_id = ?", fly)) throw new HttpError(409, "this fly already took a FlightPass");
    const passOwner = addr(await call(CFG.flightPass, `${selector("ownerOf(uint256)")}${word(pass)}`));
    if (passOwner.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "that pass isn't yours");
    await pg.run(`insert into mine.vault_grants (pass_id, fly_id, holder, vault, burn_tx, status, created_at_ms)
      values (?, ?, ?, ?, '', 'pending', ?) on conflict (pass_id) do nothing`, pass, fly, me, wallet, Date.now());
    return { pass, fly, wallet, send_to: DEAD };
  }

  /** Registered burns whose pass now sits at 0x...dEaD become grants to pay (status 'new'). */
  async function seeBurns(): Promise<void> {
    for (const g of await pg.all<{ pass_id: number }>("select pass_id from mine.vault_grants where status = 'pending'")) {
      try {
        const owner = addr(await call(CFG.flightPass, `${selector("ownerOf(uint256)")}${word(g.pass_id)}`));
        if (owner.toLowerCase() === DEAD.toLowerCase()) {
          await pg.run("update mine.vault_grants set status = 'new', burn_tx = 'dead' where pass_id = ? and status = 'pending'", g.pass_id);
        }
      } catch { /* not readable now: next tick */ }
    }
  }

  /** FLYAI base units per dollar at TraderFly's posted price. */
  const perDollar = async () => BigInt(await call(CFG.traderFly, `${selector("flyaiPerDollar()")}`));

  async function payGrants(): Promise<void> {
    if (!d.granter) return;
    // empty each new burn's pass first (claimed once: the ledger row's tx is unique per pass)
    for (const g of await pg.all<{ pass_id: number }>("select pass_id from mine.vault_grants where status = 'new' order by pass_id")) {
      const grant = await perDollar() * BigInt(Math.round(CFG.grantUsd * 100)) / 100n;
      await pg.tx(async (q) => {
        const row = await q.one<{ status: string }>("select status from mine.vault_grants where pass_id = ?", g.pass_id);
        if (row?.status !== "new") return;
        const key = `pass:${g.pass_id}`;
        const bal = await d.balanceOf(q, key);
        if (bal > 0n) await d.book(q, key, null, "withdraw", bal, { tx: `vault-grant:${g.pass_id}` });
        await q.run("update mine.vault_grants set status = 'claimed', pass_wei = ?, grant_wei = ? where pass_id = ?",
          (bal > 0n ? bal : 0n).toString(), grant.toString(), g.pass_id);
      }, `pass:${g.pass_id}`);
    }
    for (const g of await pg.all<{ pass_id: number; fly_id: number; vault: string; pass_wei: string; grant_wei: string }>(
      "select pass_id, fly_id, vault, pass_wei, grant_wei from mine.vault_grants where status = 'claimed' order by pass_id")) {
      const amount = BigInt(g.pass_wei) + BigInt(g.grant_wei);
      if (await pg.run("update mine.vault_grants set status = 'sending' where pass_id = ? and status = 'claimed'", g.pass_id) !== 1) continue;
      try {
        const tx = await d.granter.send(d.token, `${selector("transfer(address,uint256)")}${word(g.vault)}${word(amount)}`);
        await pg.run("update mine.vault_grants set status = 'paid', grant_tx = ?, done_at_ms = ? where pass_id = ?", tx.toLowerCase(), Date.now(), g.pass_id);
        // the desk locks it (all of it: the pass's balance and the grant, user 2026-10-02)
        const usd = Number(amount * 10_000n / (await perDollar())) / 10_000;
        await pg.run(`insert into mine.vault_requests (wallet, chain, kind, requester, params) values (?, 'robinhood', 'pass_burn', 'mine', ?::text::jsonb)`,
          g.vault, JSON.stringify({ pass: g.pass_id, fly: g.fly_id, grant_usd: usd, wei: amount.toString(), tx }));
        console.log(`vault grant: pass #${g.pass_id} -> fly #${g.fly_id}: ${fromWei(amount)} FLYAI (${tx})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const unsent = (err as { unsent?: boolean }).unsent;
        await pg.run("update mine.vault_grants set status = ?, error = ? where pass_id = ?", unsent ? "claimed" : "error", msg, g.pass_id);
        console.error(`vault grant for pass #${g.pass_id} ${unsent ? "not sent, retried later" : "may have been sent; the operator settles it"}: ${msg}`);
        return;
      }
    }
  }

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      await seeBurns();
      await payGrants();
    } catch (err) {
      console.error("vaults tick:", (err as Error)?.message ?? err);
    } finally {
      ticking = false;
    }
  }
  function start(): void {
    if (!on) return;
    void tick();
    setInterval(() => void tick(), CFG.tickMs).unref();
  }

  async function admin() {
    return {
      on, chains: AWAY, granter: d.granter?.address ?? null,
      wallets: (await pg.one<{ n: number }>("select count(*)::int as n from mine.vault_wallets"))?.n ?? 0,
      funded: await pg.all("select * from mine.vault_ledger where holder is not null order by principal_usd desc limit 100"),
      requests: await pg.all("select * from mine.vault_requests order by id desc limit 100"),
      grants: await pg.all("select * from mine.vault_grants order by pass_id desc limit 100"),
    };
  }

  // ---- routes ------------------------------------------------------------------------------------------------
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/vaults/config") return d.send(res, 200, await config()), true;
      if (p === "/api/vaults/funded") return d.send(res, 200, await funded()), true;
      if (p === "/api/vaults/leaderboard") {
        isOn();
        const chain = chainOf(url.searchParams.get("chain"));
        const key = chain === "robinhood" ? "leaderboard" : `leaderboard:${chain}`;
        return d.send(res, 200, (await publicOf(key)) ?? { all: [], d7: [], h24: [] }), true;
      }
      if ((m = /^\/api\/vaults\/fly\/(\d{1,6})$/.exec(p))) return d.send(res, 200, await flyView(Number(m[1]))), true;
      if ((m = /^\/api\/vaults\/requests\/(\d{1,12})$/.exec(p))) return d.send(res, 200, await requestView(Number(m[1]))), true;
      if (p === "/api/admin/vaults") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
    }
    if (req.method === "POST") {
      if ((m = /^\/api\/vaults\/(0x[0-9a-fA-F]{40})\/(settings|withdraw|move)$/.exec(p))) {
        if (!ADDRESS.test(m[1])) throw new HttpError(400, "bad wallet address");
        const wallet = checksumAddress(m[1]);
        const body = await d.readJson(req);
        const go = m[2] === "settings" ? saveSettings : m[2] === "withdraw" ? withdraw : move;
        return d.send(res, 200, await go(req, wallet, body)), true;
      }
      if ((m = /^\/api\/vaults\/fly\/(\d{1,6})\/pass$/.exec(p))) {
        return d.send(res, 200, await registerBurn(req, Number(m[1]), await d.readJson(req))), true;
      }
    }
    return false;
  }

  return { route, start, on, CFG };
}
