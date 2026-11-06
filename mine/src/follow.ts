/**
 * Follow a fly (2026-11-05, flytrade/UTILITY-PLAN.md; the user: copy-trading paid in $FLYAI to the fly's owner, "500k
 * unlocks the rest"). One of your flies copies another fly's trades for a week: its wallet goes into your fly's "track"
 * option (flytrade/vaults/vtrack.py), and the wallets desk lets a fly track another Trader Fly only with a live pass.
 *
 *   GET  /api/follow/fly/<n>                        -> { fly, owner, followers, price, mine: [my passes on it] }
 *   POST /api/follow/fly/<n> { follower_fly, owner_tx, burn_tx }   (signed in) -> the pass
 *
 * The holder of the follower fly pays from their own wallet, in two transfers: PRICE_FLYAI x OWNER_SHARE to the followed
 * fly's owner (its NFT owner when paid) and the rest burned (to 0x…dEaD). Both are checked on chain before the pass is
 * written; each transaction counts once. A pass bought while one runs extends it by a week. The follower's holder must
 * hold TIER_FLYAI (wallet + staked + locked): following is a 500k feature. Table mine.follow_passes
 * (flybook/supabase/migrations/20261105150000_mine_follow_passes.sql).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import { burnedBy } from "./burns.ts";

export const PRICE_FLYAI = 100_000;
export const OWNER_SHARE = 0.9;
export const WEEK_MS = 7 * 86_400_000;
export const TIER_FLYAI = 200_000;               // the holding that activates a fly (no 500k tier, 11-05)
const E18 = 10n ** 18n;
const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
const TRADERFLY = "0x18d4d831ca89672126172b73ba05f5a318ad5a72";
const DEAD = "0x000000000000000000000000000000000000dead";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TX = /^0x[0-9a-f]{64}$/;
const MAX_TRACKED = 5;                            // vtrack.MAX_WALLETS
export const OWNER_FLYAI = Math.round(PRICE_FLYAI * OWNER_SHARE);
export const BURN_FLYAI = PRICE_FLYAI - OWNER_FLYAI;

type Receipt = { status: string; logs: { address: string; topics: string[]; data: string }[] } | null;

/** $FLYAI (wei) sent from `from` to `to` in a receipt's logs. */
export function sentIn(rec: Receipt, from: string, to: string): bigint {
  const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
  let wei = 0n;
  for (const l of rec?.logs ?? []) {
    if (l.address?.toLowerCase() === FLYAI && l.topics?.[0] === TRANSFER && l.topics[1]?.toLowerCase() === pad(from)
        && l.topics[2]?.toLowerCase() === pad(to)) wei += BigInt(l.data);
  }
  return wei;
}

export function createFollow(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  /** $FLYAI held + staked + locked, wei */
  holdings: (wallet: string) => Promise<bigint>;
  /** the settings a fly gets when it has none (the "let it fly" starter's) */
  starterSettings: () => Promise<any>;
  rpc?: string;
  /** tests */
  receipt?: (tx: string) => Promise<Receipt>;
  ownerOf?: (fly: number) => Promise<string | null>;
  now?: () => number;
}) {
  const { pg, HttpError } = d;
  const now = d.now ?? Date.now;
  const call = async (method: string, params: unknown[]) => {
    const r = await fetch(d.rpc ?? "https://rpc.mainnet.chain.robinhood.com", { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", "user-agent": "fly.ai follow" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return ((await r.json()) as { result?: any }).result ?? null;
  };
  const receipt = d.receipt ?? ((tx: string) => call("eth_getTransactionReceipt", [tx]) as Promise<Receipt>);
  const ownerOf = d.ownerOf ?? (async (fly: number) => {
    const res: string | null = await call("eth_call", [{ to: TRADERFLY, data: `0x6352211e${fly.toString(16).padStart(64, "0")}` }, "latest"]);
    return res && res.length >= 66 ? `0x${res.slice(-40)}`.toLowerCase() : null;
  });
  const walletOf = async (fly: number) =>
    (await pg.one<{ address: string }>("select lower(address) as address from mine.vault_wallets where fly_id = ? order by id limit 1", fly))?.address ?? null;
  const holderOf = async (wallet: string) =>
    (await pg.one<{ holder: string }>("select lower(holder) as holder from mine.vault_ledger where lower(wallet) = ? and chain = 'robinhood'", wallet))?.holder ?? null;

  async function info(req: IncomingMessage, fly: number) {
    const wallet = await walletOf(fly);
    if (!wallet) throw new HttpError(404, "this fly has no wallet yet");
    const at = new Date(now()).toISOString();
    const [count, owner] = await Promise.all([
      pg.one<{ n: number }>("select count(distinct follower_fly)::int as n from mine.follow_passes where target_fly = ? and ends_at > ?", fly, at),
      ownerOf(fly).catch(() => null),
    ]);
    let mine: { follower_fly: number; ends_at: string }[] = [];
    let me: string | null = null;
    try { me = (await d.sessionWallet(req)).toLowerCase(); } catch { /* not signed in */ }
    if (me) {
      mine = (await pg.all<{ follower_fly: number; ends_at: Date }>(`select follower_fly, max(ends_at) as ends_at from mine.follow_passes
        where target_fly = ? and payer = ? and ends_at > ? group by follower_fly`, fly, me, at))
        .map((r) => ({ follower_fly: r.follower_fly, ends_at: new Date(r.ends_at).toISOString() }));
    }
    return { fly, wallet, owner, followers: count?.n ?? 0, mine,
      price: { flyai: PRICE_FLYAI, owner_flyai: OWNER_FLYAI, burn_flyai: BURN_FLYAI, days: 7, token: FLYAI, burn_to: DEAD, burn_fn: "burn", tier_flyai: TIER_FLYAI } };
  }

  /** The followed fly's wallet into the follower's "track" option (on; added to its list), its settings otherwise kept. */
  async function track(followerWallet: string, targetWallet: string, by: string) {
    const row = await pg.one<{ vault: string; doc: any }>("select vault, doc from mine.vault_settings where lower(vault) = ?", followerWallet);
    const doc = structuredClone(row?.doc ?? (await d.starterSettings()) ?? {});
    doc.options = Array.isArray(doc.options) ? doc.options : [];
    let o = doc.options.find((x: any) => x?.id === "track");
    if (!o) { o = { id: "track", on: true, share_pct: 20, params: {}, wallets: [] }; doc.options.push(o); }
    o.on = true;
    o.wallets = Array.isArray(o.wallets) ? o.wallets : [];
    const addr = (x: any) => String(typeof x === "string" ? x : x?.address ?? "").toLowerCase();
    if (!o.wallets.some((x: any) => addr(x) === targetWallet)) {
      if (o.wallets.length >= MAX_TRACKED) throw new HttpError(400, `your fly already tracks ${MAX_TRACKED} wallets: remove one in its settings first`);
      o.wallets.push({ address: targetWallet, chain: "robinhood" });
    }
    const text = JSON.stringify(doc);
    const version = (await import("node:crypto")).createHash("sha1").update(text).digest("hex").slice(0, 12);
    await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::text::jsonb, ?, ?, ?)
      on conflict (vault) do update set doc = excluded.doc, version = excluded.version, updated_by = excluded.updated_by,
      updated_at_ms = excluded.updated_at_ms`, row?.vault ?? followerWallet, text, version, by, now());
  }

  async function buy(req: IncomingMessage, fly: number, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const followerFly = Number(body?.follower_fly);
    const ownerTx = String(body?.owner_tx ?? "").toLowerCase(), burnTx = String(body?.burn_tx ?? "").toLowerCase();
    if (!Number.isInteger(followerFly) || followerFly < 0) throw new HttpError(400, "which of your flies follows?");
    if (followerFly === fly) throw new HttpError(400, "a fly can't follow itself");
    if (!TX.test(ownerTx) || !TX.test(burnTx)) throw new HttpError(400, "the two payment transactions, please");
    const [target, follower] = await Promise.all([walletOf(fly), walletOf(followerFly)]);
    if (!target) throw new HttpError(404, "this fly has no wallet yet");
    if (!follower) throw new HttpError(404, "your fly has no wallet yet: set it up first");
    const holder = await holderOf(follower);
    const mayFollow = holder ? holder === me : (await ownerOf(followerFly))?.toLowerCase() === me;
    if (!mayFollow) throw new HttpError(403, "only your fly's holder can buy its pass");
    if ((await d.holdings(me).catch(() => 0n)) < BigInt(TIER_FLYAI) * E18) {
      throw new HttpError(403, `following needs ${TIER_FLYAI.toLocaleString("en-US")} $FLYAI held (wallet, staked or locked)`);
    }
    const owner = (await ownerOf(fly))?.toLowerCase();
    if (!owner) throw new HttpError(409, "couldn't read the fly's owner: try again in a moment");
    if (owner === me) throw new HttpError(400, "it's your own fly: track it in your fly's settings for free");
    const [recOwner, recBurn] = await Promise.all([receipt(ownerTx), receipt(burnTx)]);
    if (!recOwner || !recBurn) throw new HttpError(409, "a payment isn't mined yet: try again in a moment");
    if (recOwner.status !== "0x1" || recBurn.status !== "0x1") throw new HttpError(400, "a payment failed on chain");
    const paid = sentIn(recOwner, me, owner), burned = burnedBy(recBurn as any, me);   // burn() or the old dead-address send
    if (paid < BigInt(OWNER_FLYAI) * E18) throw new HttpError(400, `the owner's part: ${OWNER_FLYAI.toLocaleString("en-US")} $FLYAI from your wallet to ${owner}`);
    if (burned < BigInt(BURN_FLYAI) * E18) throw new HttpError(400, `the burn: ${BURN_FLYAI.toLocaleString("en-US")} $FLYAI from your wallet to 0x…dEaD`);
    const pass = await pg.tx(async (q) => {
      const used = await q.one<{ n: number }>("select count(*)::int as n from mine.follow_passes where owner_tx in (?, ?) or burn_tx in (?, ?)",
        ownerTx, burnTx, ownerTx, burnTx);
      if (used?.n) throw new HttpError(409, "these payments already bought a pass");
      const last = await q.one<{ ends_at: Date }>("select max(ends_at) as ends_at from mine.follow_passes where follower_wallet = ? and target_wallet = ?", follower, target);
      const from = Math.max(now(), last?.ends_at ? new Date(last.ends_at).getTime() : 0);
      return q.one<{ id: number; starts_at: Date; ends_at: Date }>(`insert into mine.follow_passes (follower_fly, follower_wallet, target_fly, target_wallet,
        payer, owner, paid_flyai, burned_flyai, owner_tx, burn_tx, starts_at, ends_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        returning id, starts_at, ends_at`, followerFly, follower, fly, target, me, owner, (paid / E18).toString(), (burned / E18).toString(),
        ownerTx, burnTx, new Date(from).toISOString(), new Date(from + WEEK_MS).toISOString());
    }, `follow:${follower}`);
    await track(follower, target, me);
    return { id: pass!.id, follower_fly: followerFly, target_fly: fly, starts_at: new Date(pass!.starts_at).toISOString(),
      ends_at: new Date(pass!.ends_at).toISOString() };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const m = /^\/api\/follow\/fly\/(\d{1,7})$/.exec(url.pathname);
    if (!m) return false;
    const fly = Number(m[1]);
    if (req.method === "GET") return d.send(res, 200, await info(req, fly)), true;
    if (req.method === "POST") return d.send(res, 200, await buy(req, fly, await d.readJson(req))), true;
    return false;
  }

  return { route, info, buy };
}
