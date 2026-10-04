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
 * - the deposit competition ("promo", 2026-10-04): the first PROMO_SLOTS wallets whose deposits since PROMO_START_MS
 *   reached PROMO_MIN_USD become candidates (mine.vault_promos); an admin approves each, this worker pays PROMO_BONUS_USD
 *   of FLYAI from the granter into the fly's wallet and asks the desk to lock it for PROMO_HOLD_DAYS (kind promo_grant).
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
  /** true when the request carries the ADMIN_TOKEN bearer (no throw) */
  isAdminToken: (req: IncomingMessage) => boolean;
  /** wallets that may run the promo when signed in (BOUNTY_ADMINS) */
  admins: string[];
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
  // the deposit competition (2026-10-04, flytrade/FLYWALLET-PLAN.md "promo")
  const PROMO = {
    on: d.env.PROMO_ON === "1",
    startMs: Number(d.env.PROMO_START_MS ?? "0"),
    slots: Number(d.env.PROMO_SLOTS ?? "10"),
    minUsd: Number(d.env.PROMO_MIN_USD ?? "20"),
    bonusUsd: Number(d.env.PROMO_BONUS_USD ?? "20"),
    holdDays: Number(d.env.PROMO_HOLD_DAYS ?? "14"),
    nearMs: Number(d.env.PROMO_NEAR_MIN ?? "5") * 60_000,   // candidates qualifying this close together get flagged
    // paid without the admin (2026-10-04, the user: "make it automatic actually so i don't need to do the give"):
    // after PROMO_SETTLE_MIN with their own money still in and the wallet trading (its holder holds the $FLYAI the
    // desk asks for); candidates flagged as near another one wait for the admin. PROMO_AUTO=0 goes back to approving.
    auto: d.env.PROMO_AUTO !== "0",
    settleMs: Number(d.env.PROMO_SETTLE_MIN ?? "60") * 60_000,
  };
  const admins = new Set(d.admins.map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)));
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
  /**
   * The leaderboard from memory (2026-10-03, the user: "Fly Wallets leaderboard ... slow loading ... couldn't load"):
   * one database read every BOARD_TTL_MS at most - the desk republishes it every 5 minutes - and the last copy is kept
   * when the database is slow or failing (after a mine deploy it took 13 s and then nothing answered).
   */
  const BOARD_TTL_MS = 30_000, FEED_TTL_MS = 10_000;
  const boards = new Map<string, { at: number; value: any; loading?: Promise<any> }>();
  const boardOf = (key: string) => cached(key, BOARD_TTL_MS, () => publicOf(key));
  /** a read kept in memory for ttl (the leaderboard; the terminal's feed): one database read at a time, the last copy
   *  kept when the database is slow or failing */
  async function cached(key: string, ttl: number, read: () => Promise<any>) {
    const hit = boards.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    if (hit?.loading) return hit.value ?? hit.loading;      // one read at a time; the others get the last copy
    const loading = read().then((value) => {
      boards.set(key, { at: Date.now(), value });
      return value;
    }, (err) => {
      boards.set(key, { at: hit?.at ?? 0, value: hit?.value ?? null });
      if (hit?.value != null) return hit.value;              // stale beats an error
      throw err;
    });
    boards.set(key, { at: hit?.at ?? 0, value: hit?.value ?? null, loading });
    return hit?.value != null ? hit.value : loading;          // a copy in hand answers at once; the read refreshes it
  }
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
    // every read at once (2026-10-03: one after another took 1.3-2 s)
    const one = async (chain: string) => {
      if (!wallet) return { chain, ledger: null, stats: null, settings: null };
      const [ledger, stats, settings] = await Promise.all([ledgerOf(wallet, chain), publicOf(statsKey(wallet, chain)),
        settingsOf(settingsKey(wallet, chain))]);
      return { chain, ledger, stats, settings: settings?.doc ?? null };
    };
    const [home, ...away] = await Promise.all([one("robinhood"), ...AWAY.map(one)]);
    return { fly, owner, wallet, ...home, pass: granted ?? null, away };
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
    // a sold fly is paid out to its old holder by itself (the desk's release); a withdrawal meanwhile could take the new
    // owner's deposits (review 2026-10-03)
    if (led.closing) throw new HttpError(409, "this fly was sold: its money is on its way to you");
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

  /**
   * Every funded fly's published stats in one read, for the terminal (docs/terminal.html, 2026-10-04): its trades,
   * holdings and curve, keyed by fly. One query every FEED_TTL_MS however many people watch (it read each fly's view
   * before: ~0.25 requests a second per visitor).
   */
  async function feed(chain: string) {
    const prefix = chain === "robinhood" ? "vault:" : `vault:${chain}:`;
    const rows = await pg.all<{ fly_id: number; value: any }>(`select w.fly_id, p.value from mine.vault_ledger l
      join mine.vault_wallets w on lower(w.address) = lower(l.wallet)
      join mine.vault_public p on p.key = ?::text || w.address
      where l.chain = ? and l.holder is not null and w.fly_id is not null`, prefix, chain);
    const flies: Record<number, unknown> = {};
    for (const r of rows) if (r.value) flies[r.fly_id] = r.value;
    return { updated: Date.now() / 1000, chain, flies };
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
    // a registration whose burn never happened (the wallet prompt cancelled, a failed send) is replaced, not a dead end:
    // left 'pending', the fly showed "on its way" forever and a retry got 409 (review 2026-10-03)
    if (await pg.one("select 1 from mine.vault_grants where fly_id = ? and status <> 'pending'", fly)) throw new HttpError(409, "this fly already took a FlightPass");
    const passOwner = addr(await call(CFG.flightPass, `${selector("ownerOf(uint256)")}${word(pass)}`));
    if (passOwner.toLowerCase() !== me.toLowerCase()) throw new HttpError(403, "that pass isn't yours");
    // only 'pending' rows go, and only while the pass is still its holder's (checked above): a burnt pass is past them
    await pg.run("delete from mine.vault_grants where status = 'pending' and (fly_id = ? or pass_id = ?)", fly, pass);
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

  // ---- the deposit competition ("promo", 2026-10-04) -----------------------------------------------------------
  /** Who may run it: the admin token, or a signed-in BOUNTY_ADMINS wallet ("admin-token" | the wallet). */
  async function promoAdmin(req: IncomingMessage): Promise<string> {
    if (d.isAdminToken(req)) return "admin-token";
    if (admins.size && req.headers["x-flyai-session"]) {
      try { const me = (await d.sessionWallet(req)).toLowerCase(); if (admins.has(me)) return me; } catch { /* below */ }
    }
    throw new HttpError(403, "admins only");
  }

  const promoPublic = () => cached("promo", BOARD_TTL_MS, async () => {
    const taken = PROMO.on ? (await pg.one<{ n: number }>("select count(*)::int as n from mine.vault_promos where status <> 'rejected'"))?.n ?? 0 : 0;
    return { on: PROMO.on, slots: PROMO.slots, taken, left: Math.max(0, PROMO.slots - taken), min_usd: PROMO.minUsd,
             bonus_usd: PROMO.bonusUsd, hold_days: PROMO.holdDays, start_ms: PROMO.startMs };
  });
  const promoChanged = () => boards.delete("promo");

  /**
   * New candidates, first come first served: per wallet and holder, Robinhood deposits since the start (not the new
   * owner's money arriving during a sale) summed in time order; the moment the sum first reached the minimum is the
   * place in the queue. One per wallet and per holder (the unique indexes; rejected rows keep theirs), until the rows
   * not rejected fill the slots. Under one lock: two processes never fill the same slot.
   */
  async function findPromos(): Promise<void> {
    if (!PROMO.startMs || Date.now() < PROMO.startMs) return;
    let added = 0;
    await pg.tx(async (q) => {
      let taken = (await q.one<{ n: number }>("select count(*)::int as n from mine.vault_promos where status <> 'rejected'"))?.n ?? 0;
      if (taken >= PROMO.slots) return;
      const rows = await q.all<{ wallet: string; holder: string; at_ms: number; run: number; fly_id: number | null }>(`
        with d as (
          select id, wallet, holder, at, sum(usd) over (partition by wallet, lower(holder) order by at, id) as run
          from mine.vault_moves
          where chain = 'robinhood' and kind = 'deposit' and holder is not null and usd > 0
            and at >= to_timestamp(?::double precision / 1000)
            and coalesce(detail->>'while_closing', 'false') <> 'true'
        ), q as (
          select distinct on (wallet, lower(holder)) wallet, holder, at, id, run from d where run >= ?::double precision
          order by wallet, lower(holder), at, id
        )
        select q.wallet, q.holder, (extract(epoch from q.at) * 1000)::float8 as at_ms, q.run, w.fly_id from q
        left join mine.vault_wallets w on lower(w.address) = lower(q.wallet)
        where not exists (select 1 from mine.vault_promos p where lower(p.wallet) = lower(q.wallet) or lower(p.holder) = lower(q.holder))
        order by q.at, q.id`, PROMO.startMs, PROMO.minUsd);
      const seen = new Set<string>();
      for (const r of rows) {
        if (taken >= PROMO.slots) break;
        const w = r.wallet.toLowerCase(), h = r.holder.toLowerCase();
        if (seen.has(w) || seen.has(h)) continue;      // a wallet that two holders filled, or a holder's second fly
        seen.add(w); seen.add(h);
        const n = await q.run(`insert into mine.vault_promos (wallet, fly_id, holder, deposit_usd, qualified_at)
          values (?, ?, ?, ?, to_timestamp(?::double precision / 1000)) on conflict do nothing`, r.wallet, r.fly_id, r.holder, r.run, r.at_ms);
        if (n === 1) { taken++; added++; console.log(`promo: candidate ${r.wallet} (fly #${r.fly_id}, ${r.holder}, $${r.run.toFixed(2)})`); }
      }
    }, "vault-promo");
    if (added) promoChanged();
  }

  /**
   * Approved promos paid from the granter, once: the row goes 'sending' (one update that only one tick can win) before
   * the transfer; a transfer that never left goes back to 'approved', any other failure stops at 'error' for the
   * operator (it may have been sent). Paid rows then get the desk's 'promo_grant' request in the same transaction that
   * records its id, so a crash between the two retries the request, never the payment.
   */
  async function payPromos(): Promise<void> {
    if (!d.granter) return;
    for (const p of await pg.all<{ id: number; wallet: string; holder: string }>(
      "select id, wallet, holder from mine.vault_promos where status = 'approved' order by qualified_at, id")) {
      // the fly sold or emptied since the approval: back to the admin, nothing sent
      const led = await ledgerOf(p.wallet, "robinhood");
      if (!led?.holder || led.holder.toLowerCase() !== p.holder.toLowerCase() || led.closing) {
        await pg.run("update mine.vault_promos set status = 'candidate', error = ? where id = ? and status = 'approved'",
          "the wallet's holder changed (or it is being paid out) since the approval", p.id);
        promoChanged();
        continue;
      }
      // their own money must still be in when the bonus goes (2026-10-04, the user: "the others ... can get their $
      // out, right?"): deposit, qualify, withdraw before the approval, and the bonus would have landed in an empty
      // wallet and unlocked to them 14 days later. Own money = what was put in less what is locked (FlightPass grants).
      if (Number(led.principal_usd) - Number(led.locked_usd) < PROMO.minUsd) {
        await pg.run("update mine.vault_promos set status = 'candidate', error = ? where id = ? and status = 'approved'",
          `their own money in the wallet is under $${PROMO.minUsd} now (withdrawn since qualifying?)`, p.id);
        promoChanged();
        continue;
      }
      const wei = await perDollar() * BigInt(Math.round(PROMO.bonusUsd * 100)) / 100n;
      if (await pg.run("update mine.vault_promos set status = 'sending', grant_usd = ?, grant_wei = ?, error = null where id = ? and status = 'approved'",
        PROMO.bonusUsd, wei.toString(), p.id) !== 1) continue;
      try {
        const tx = await d.granter.send(d.token, `${selector("transfer(address,uint256)")}${word(p.wallet)}${word(wei)}`);
        await pg.run("update mine.vault_promos set status = 'paid', grant_tx = ?, paid_at = now() where id = ?", tx.toLowerCase(), p.id);
        console.log(`promo #${p.id}: ${fromWei(wei)} FLYAI -> ${p.wallet} (${tx})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const unsent = (err as { unsent?: boolean }).unsent;
        await pg.run("update mine.vault_promos set status = ?, error = ? where id = ?", unsent ? "approved" : "error", msg, p.id);
        console.error(`promo #${p.id} ${unsent ? "not sent, retried later" : "may have been sent; the operator settles it"}: ${msg}`);
        return;
      }
    }
    for (const p of await pg.all<{ id: number }>("select id from mine.vault_promos where status = 'paid' and request_id is null order by id")) {
      await pg.tx(async (q) => {
        const r = await q.one<{ wallet: string; grant_usd: number; grant_wei: string; grant_tx: string; paid_ms: number; request_id: number | null }>(
          `select wallet, grant_usd, grant_wei, grant_tx, (extract(epoch from paid_at) * 1000)::float8 as paid_ms, request_id
           from mine.vault_promos where id = ? and status = 'paid' for update`, p.id);
        if (!r || r.request_id != null) return;
        const until = Math.round(r.paid_ms) + PROMO.holdDays * 86_400_000;
        const req = await q.one<{ id: number }>(`insert into mine.vault_requests (wallet, chain, kind, requester, params)
          values (?, 'robinhood', 'promo_grant', 'mine', ?::text::jsonb) returning id`, r.wallet,
          JSON.stringify({ promo_id: Number(p.id), usd: r.grant_usd, wei: r.grant_wei, tx: r.grant_tx, until_ms: until }));
        await q.run("update mine.vault_promos set request_id = ? where id = ?", req!.id, p.id);
      }, `vault-promo:${p.id}`);
    }
  }

  /** Every promo row with what the sybil check needs, from the database only (no RPC). */
  async function promoAdminView() {
    const rows = await pg.all<any>(`
      select p.*, (extract(epoch from p.qualified_at) * 1000)::float8 as qualified_ms,
        (extract(epoch from p.paid_at) * 1000)::float8 as paid_ms,
        (select nickname from mine.profiles pr where pr.wallet = lower(p.holder)) as nickname,
        (select count(distinct l.wallet)::int from mine.vault_ledger l where lower(l.holder) = lower(p.holder)) as holder_wallets,
        (select coalesce(json_agg(json_build_object('at_ms', (extract(epoch from m.at) * 1000)::float8, 'usd', m.usd,
            'while_closing', coalesce(m.detail->>'while_closing', 'false') = 'true') order by m.at), '[]'::json)
          from mine.vault_moves m where lower(m.wallet) = lower(p.wallet) and m.chain = 'robinhood' and m.kind = 'deposit'
            and m.at >= to_timestamp(?::double precision / 1000)) as deposits,
        (select json_build_object('holder', l.holder, 'principal_usd', l.principal_usd, 'locked_usd', l.locked_usd, 'closing', l.closing)
          from mine.vault_ledger l where l.wallet = p.wallet and l.chain = 'robinhood') as ledger,
        (select json_build_object('pass', g.pass_id, 'status', g.status) from mine.vault_grants g
          where lower(g.vault) = lower(p.wallet)) as flightpass
      from mine.vault_promos p order by p.qualified_at, p.id`, PROMO.startMs);
    // holders qualifying minutes apart: maybe one person's wallets (the 2026-09-28 farmer ring)
    for (const r of rows) {
      r.id = Number(r.id); r.request_id = r.request_id == null ? null : Number(r.request_id);   // bigint comes as text
    }
    for (const r of rows) {
      r.near = rows.filter((o) => o.id !== r.id && o.status !== "rejected" && Math.abs(o.qualified_ms - r.qualified_ms) <= PROMO.nearMs).map((o) => o.id);
    }
    return { promo: await promoPublic(), near_min: PROMO.nearMs / 60_000, rows };
  }

  /** Candidates that pass on their own (PROMO.auto): settled, own money still in, the wallet trading, not near another. */
  async function autoPromos(): Promise<void> {
    if (!PROMO.auto) return;
    const rows = await pg.all<{ id: number; wallet: string; holder: string; qualified_ms: number; near: number }>(`
      select p.id, p.wallet, p.holder, (extract(epoch from p.qualified_at) * 1000)::float8 as qualified_ms,
        (select count(*)::int from mine.vault_promos o where o.id <> p.id and o.status <> 'rejected'
           and abs(extract(epoch from o.qualified_at - p.qualified_at)) * 1000 < ?) as near
      from mine.vault_promos p where p.status = 'candidate' order by p.qualified_at, p.id`, PROMO.nearMs);
    for (const p of rows) {
      if (p.near > 0 || Date.now() - p.qualified_ms < PROMO.settleMs) continue;
      const led = await ledgerOf(p.wallet, "robinhood");
      if (!led?.holder || led.holder.toLowerCase() !== p.holder.toLowerCase() || led.closing) continue;
      if (Number(led.principal_usd) - Number(led.locked_usd) < PROMO.minUsd) continue;
      const stats = await publicOf(statsKey(p.wallet, "robinhood"));
      if (!stats?.active) continue;                       // under the $FLYAI hold (or trading switched off): not yet
      if (await pg.run(`update mine.vault_promos set status = 'approved', decided_by = 'auto', decided_at = now(), error = null
        where id = ? and status = 'candidate'`, p.id) === 1) promoChanged();
    }
  }

  async function decidePromo(req: IncomingMessage, id: number, verb: string) {
    const by = await promoAdmin(req);
    const p = await pg.one<{ wallet: string; holder: string; status: string }>("select wallet, holder, status from mine.vault_promos where id = ?", id);
    if (!p) throw new HttpError(404, "no such promo");
    if (verb === "approve") {
      if (p.status !== "candidate") throw new HttpError(409, `it is ${p.status}`);
      const led = await ledgerOf(p.wallet, "robinhood");
      if (!led?.holder || led.holder.toLowerCase() !== p.holder.toLowerCase() || led.closing) {
        throw new HttpError(409, "the wallet's holder changed since it qualified (or it is being paid out)");
      }
    } else if (p.status !== "candidate" && p.status !== "approved") {
      throw new HttpError(409, `it is ${p.status}`);       // sending or paid: too late; error: the operator settles it
    }
    const to = verb === "approve" ? "approved" : "rejected";
    if (await pg.run(`update mine.vault_promos set status = ?, decided_by = ?, decided_at = now(), error = null
      where id = ? and status = ?`, to, by, id, p.status) !== 1) throw new HttpError(409, "it changed meanwhile, reload");
    promoChanged();
    return { id, status: to };
  }

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      await seeBurns();
      await payGrants();
      if (PROMO.on) { await findPromos(); await autoPromos(); await payPromos(); }
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
        return d.send(res, 200, (await boardOf(key)) ?? { all: [], d7: [], h24: [] }), true;
      }
      if (p === "/api/vaults/feed") {
        isOn();
        const chain = chainOf(url.searchParams.get("chain"));
        return d.send(res, 200, await cached(`feed:${chain}`, FEED_TTL_MS, () => feed(chain))), true;
      }
      if ((m = /^\/api\/vaults\/fly\/(\d{1,6})$/.exec(p))) return d.send(res, 200, await flyView(Number(m[1]))), true;
      if ((m = /^\/api\/vaults\/requests\/(\d{1,12})$/.exec(p))) return d.send(res, 200, await requestView(Number(m[1]))), true;
      if (p === "/api/admin/vaults") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
      if (p === "/api/vaults/promo") return d.send(res, 200, await promoPublic()), true;
      if (p === "/api/admin/promo") { await promoAdmin(req); return d.send(res, 200, await promoAdminView()), true; }
    }
    if (req.method === "POST") {
      if ((m = /^\/api\/vaults\/(0x[0-9a-fA-F]{40})\/(settings|withdraw|move)$/.exec(p))) {
        if (!ADDRESS.test(m[1])) throw new HttpError(400, "bad wallet address");
        const wallet = checksumAddress(m[1]);
        const body = await d.readJson(req);
        const go = m[2] === "settings" ? saveSettings : m[2] === "withdraw" ? withdraw : move;
        return d.send(res, 200, await go(req, wallet, body)), true;
      }
      if ((m = /^\/api\/admin\/promo\/(\d{1,12})\/(approve|reject)$/.exec(p))) {
        return d.send(res, 200, await decidePromo(req, Number(m[1]), m[2])), true;
      }
      if ((m = /^\/api\/vaults\/fly\/(\d{1,6})\/pass$/.exec(p))) {
        return d.send(res, 200, await registerBurn(req, Number(m[1]), await d.readJson(req))), true;
      }
    }
    return false;
  }

  return { route, start, on, CFG };
}
