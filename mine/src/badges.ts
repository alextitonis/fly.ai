/**
 * Soulbound badges (2026-10-31, the user: "they are soulbound nfts"; contract flytrade/contracts/src/FlyBadges.sol):
 * status for holders, no utility yet. This reads the chain's history, decides who earned what and signs the vouchers
 * the wallets claim with. A badge is a record: once earned it can be claimed after selling, except OG, which needs the
 * amount still held at claim time. Numbers checked against the real holders on 10-31 (flyai token 49 days old):
 *
 *   larva     100k+ $FLYAI for 7 days straight      ~520 wallets so far
 *   lord      10M+ for 30 days straight             ~10, once team wallets are out
 *   diamond   100k+ for 90 days straight            nobody yet: the first can earn it ~12-11
 *   og        10k+ when the first 14 days closed, and at least that much now     ~200
 *   flyowner  1+ Trader Flies for 30 days straight  ~230
 *   swarm     10+ Trader Flies for 30 days straight ~20
 *   queen     50+ Trader Flies for 30 days straight 1; 3 wallets hold that many now
 *   payday    claimed 4 Fly Desk payouts            nobody yet: 3 paid so far, 50 wallets claimed all 3
 *   payroll   claimed 8 Fly Desk payouts            nobody yet
 *   recruiter 1 real referral (src/referrals.ts: $20+ in Fly Wallets for 7 days, or a desk payout)     1 wallet on 11-01
 *   piedpiper 10 real referrals, the first referral tier     nobody yet
 *
 * Staked and FlyLock-locked FLYAI counts as held: a move into staking or out of either is no change, and a lock counts
 * for its beneficiary. Dropping below a level restarts its clock, so one bag can't count for two wallets at once.
 *
 * Log times are interpolated between the ends of each chunk of blocks (a chunk is about a day): one block read per chunk
 * instead of one per log, and the rules are in days.
 *
 *   GET  /api/badges            the badges and how many were claimed
 *   GET  /api/badges/leaderboard?wallet=0x..   wallets by badges claimed, the first to reach a count ahead; with a
 *                               wallet, its own row too. From the contract's logs, so up to a tick behind
 *   GET  /api/badges/me         the signed-in wallet's state and progress on each
 *   POST /api/badges/vouchers   the signed claim for everything it can claim: { to, data, badges, deadline }
 *
 * Revoking and granting are the contract owner's, on chain. Tables in flybook/supabase/migrations/20261031120000_mine_badges.sql.
 * Off until BADGES_CONTRACT and BADGE_SIGNER_KEY are set.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Pg, Q } from "./pg.ts";
import { FLYAI, type Log } from "./gta.ts";
import { selector } from "./staking.ts";
import { word } from "./multicall.ts";

const E18 = 10n ** 18n;
const DAY_MS = 86_400_000;
const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LOCKED_TOPIC = "0x904a8aa9ab681d45182d3583ae57e3cbc0ba1fcb72f9811ec8feee917bdbffe5";
/** FlyaiDistributor's RootActivated(epoch, root, totalOwed) and Claimed(account, fly, amount, cumulative) */
const ROOT_TOPIC = "0x631b8d39efa88052cbdac92d3915589101e2d2cd6a11f55b012d07795f723420";
const CLAIMED_TOPIC = "0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e";
const DISTRIBUTOR = "0xbb0b80de6a1f1298c0aa33d557c8f3540b5c8423";
/** ERC-1155 TransferSingle(operator, from, to, id, value); FlyBadges moves one id at a time */
const SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const BOARD_SIZE = 100;
const TRADER_FLY = "0x18d4d831ca89672126172b73ba05f5a318ad5a72";
const STAKING = "0x5279dafa0858d4a5b2dceb05e5b41f954cd692cc";
const FLYLOCK = "0x87ded9d9788a1f6653a0261ef84c56658d0bf5e9";
/** $FLYAI's first transfer; FlyLock and the flies came later */
const FROM_BLOCK = 61_188_324;
const CHUNK = 1_000_000;
/** blocks left unread at the head, in case the newest ones change */
const SAFE_BLOCKS = 100;
const VOUCHER_S = 3600;

export const BADGES = [
  { id: 1, key: "larva" }, { id: 2, key: "lord" }, { id: 3, key: "diamond" }, { id: 4, key: "og" }, { id: 5, key: "flyowner" },
  { id: 6, key: "swarm" }, { id: 7, key: "queen" }, { id: 8, key: "payday" }, { id: 9, key: "payroll" },
  { id: 10, key: "recruiter" }, { id: 11, key: "piedpiper" },
] as const;
/** how many flies a wallet has to keep for cfg.flyDays, the badge, and its clock's field and column */
const FLY_LEVELS = [
  { flies: 1, badge: "flyowner", clock: "f1", col: "since_fly1" }, { flies: 10, badge: "swarm", clock: "f10", col: "since_fly10" },
  { flies: 50, badge: "queen", clock: "f50", col: "since_fly50" },
] as const;
const PAYOUT_LEVELS = [{ payouts: 4, badge: "payday" }, { payouts: 8, badge: "payroll" }] as const;
const REFERRAL_LEVELS = [{ referrals: 1, badge: "recruiter" }, { referrals: 10, badge: "piedpiper" }] as const;
export type BadgeKey = (typeof BADGES)[number]["key"];

export type BadgeConfig = {
  contract: string | null; signerKey: Uint8Array | null; chainId: number;
  low: bigint; high: bigint; larvaDays: number; lordDays: number; diamondDays: number; flyDays: number;
  ogEnd: number; ogMin: bigint;                    // ogEnd in ms
  staking: string; lock: string; distributor: string; fromBlock: number; exclude: string[];
};
export function badgeConfig(env: NodeJS.ProcessEnv): BadgeConfig {
  const key = (env.BADGE_SIGNER_KEY ?? "").trim().replace(/^0x/, "");
  const contract = (env.BADGES_CONTRACT ?? "").trim().toLowerCase();
  return {
    contract: /^0x[0-9a-f]{40}$/.test(contract) ? contract : null,
    signerKey: /^[0-9a-fA-F]{64}$/.test(key) ? Uint8Array.from(Buffer.from(key, "hex")) : null,
    chainId: Number(env.BADGES_CHAIN_ID ?? 4663),
    low: 100_000n * E18, high: 10_000_000n * E18, larvaDays: 7, lordDays: 30, diamondDays: 90, flyDays: 30,
    ogEnd: Date.parse("2026-09-26T14:48:06Z"), ogMin: 10_000n * E18,   // 14 days after the first transfer
    staking: (env.STAKING_CONTRACT || STAKING).toLowerCase(), lock: (env.FLYLOCK_CONTRACT || FLYLOCK).toLowerCase(),
    distributor: (env.DISTRIBUTOR_ADDRESS || DISTRIBUTOR).toLowerCase(),
    fromBlock: Number(env.BADGES_FROM_BLOCK ?? FROM_BLOCK),
    // the dev and pool wallets; they hold for the project, not as holders
    exclude: (env.BADGES_EXCLUDE ?? "0x625862521777e19ad54ce6c7abed9ca54d6589ea,0xcca1ad591f6fe7e40e382639ad2551044fae6d36")
      .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
  };
}

export type Chain = {
  head(): Promise<number>;
  blockTime(n: number): Promise<number>;           // seconds
  logs(q: { address: string; topics: (string | null)[]; from: number; to: number }): Promise<Log[]>;
  /** eth_calls through Multicall3: each return, or null where it reverted */
  batch(calls: { to: string; data: string }[]): Promise<(string | null)[]>;
};

export type Holder = { balance: bigint; low: number | null; high: number | null; og: bigint; flies: number; f1: number | null; f10: number | null; f50: number | null };
export const newHolder = (): Holder => ({ balance: 0n, low: null, high: null, og: 0n, flies: 0, f1: null, f10: null, f50: null });
const addressOf = (t: string) => `0x${t.slice(-40)}`.toLowerCase();

/** One balance change at time `t` (ms): the clocks start or stop, and what a stopped clock had earned is returned. */
export function applyChange(h: Holder, delta: bigint, t: number, cfg: BadgeConfig): { badge: BadgeKey; at: number }[] {
  const earned: { badge: BadgeKey; at: number }[] = [];
  h.balance += delta;
  if (t < cfg.ogEnd) h.og = h.balance;
  if (h.balance >= cfg.low) h.low ??= t;
  else if (h.low !== null) {
    if (t - h.low >= cfg.larvaDays * DAY_MS) earned.push({ badge: "larva", at: h.low + cfg.larvaDays * DAY_MS });
    if (t - h.low >= cfg.diamondDays * DAY_MS) earned.push({ badge: "diamond", at: h.low + cfg.diamondDays * DAY_MS });
    h.low = null;
  }
  if (h.balance >= cfg.high) h.high ??= t;
  else if (h.high !== null) {
    if (t - h.high >= cfg.lordDays * DAY_MS) earned.push({ badge: "lord", at: h.high + cfg.lordDays * DAY_MS });
    h.high = null;
  }
  return earned;
}

/** One fly in or out at time `t` (ms): the same clocks for fly counts. */
export function applyFly(h: Holder, delta: number, t: number, cfg: BadgeConfig): { badge: BadgeKey; at: number }[] {
  const earned: { badge: BadgeKey; at: number }[] = [];
  h.flies += delta;
  for (const l of FLY_LEVELS) {
    const since = h[l.clock];
    if (h.flies >= l.flies) h[l.clock] = since ?? t;
    else if (since !== null) {
      if (t - since >= cfg.flyDays * DAY_MS) earned.push({ badge: l.badge, at: since + cfg.flyDays * DAY_MS });
      h[l.clock] = null;
    }
  }
  return earned;
}

export const ogHeld = (balance: bigint, og: bigint, cfg: BadgeConfig) => og >= cfg.ogMin && balance >= og;

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const k256 = (s: string | Uint8Array) => keccak_256(typeof s === "string" ? new TextEncoder().encode(s) : s);
const words = (...w: (string | bigint | number | Uint8Array)[]) => Buffer.from(w.map((x) => (x instanceof Uint8Array ? hex(x)
  : typeof x === "string" ? x.replace(/^0x/, "").padStart(64, "0") : word(x))).join(""), "hex");

/** The EIP-712 voucher FlyBadges.claim checks: r || s || v. */
export function signVoucher(cfg: { chainId: number; contract: string; signerKey: Uint8Array }, wallet: string, badge: number, deadline: number): string {
  const domain = k256(words(k256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    k256("Fly Badges"), k256("1"), cfg.chainId, cfg.contract));
  const struct = k256(words(k256("Claim(address wallet,uint256 badge,uint256 deadline)"), wallet, badge, deadline));
  const digest = k256(Buffer.concat([Buffer.from([0x19, 0x01]), Buffer.from(domain), Buffer.from(struct)]));
  const sig = secp256k1.sign(digest, cfg.signerKey, { prehash: false, format: "recovered" });
  return `${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
}

/** claim(uint256[] badges, uint256 deadline, bytes[] signatures) calldata; each signature is 65 bytes of hex */
export function claimData(badges: number[], deadline: number, signatures: string[]): string {
  const idsAt = 96;
  const idsLen = 32 + badges.length * 32;
  const heads = signatures.map((_, i) => word(signatures.length * 32 + i * 128));   // 128: a length word + 65 bytes padded to 96
  const bodies = signatures.map((s) => word(65) + s.padEnd(192, "0"));
  return `0x${selector("claim(uint256[],uint256,bytes[])").slice(2)}${word(idsAt)}${word(deadline)}${word(idsAt + idsLen)}${
    word(badges.length)}${badges.map((b) => word(b)).join("")}${word(signatures.length)}${heads.join("")}${bodies.join("")}`;
}

export function createBadges(d: {
  pg: Pg; chain: Chain; cfg: BadgeConfig;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  now?: () => number;
}) {
  const { pg, chain, cfg, HttpError } = d;
  const now = d.now ?? Date.now;
  const on = !!(cfg.contract && cfg.signerKey);
  const getState = async <T>(q: Q, key: string) => (await q.one<{ value: T }>("select value from mine.badge_state where key = ?", key))?.value;
  const setState = (q: Q, key: string, value: unknown) => q.run(`insert into mine.badge_state (key, value) values (?, ?::text::jsonb)
    on conflict (key) do update set value = excluded.value`, key, JSON.stringify(value));
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

  /** Logs in [from, to], or null if the RPC refuses the span. */
  async function logs(address: string, topics: (string | null)[], from: number, to: number): Promise<Log[] | null> {
    try {
      return await chain.logs({ address, topics, from, to });
    } catch (err) {
      if (/range|span|limit|too many|exceed/i.test(String((err as Error).message))) return null;
      throw err;
    }
  }

  async function book(q: Q, to: number, money: Log[], locks: Log[], flies: Log[], desk: Log[], minted: Log[], timeOf: (n: number) => number) {
    const order = (a: Log, b: Log) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16);
    // what each log does to balances, in chain order
    const changes = [...money, ...locks].sort(order).flatMap((l): [string, bigint, number][] => {
      const t = timeOf(parseInt(l.blockNumber, 16));
      const v = BigInt(l.data.slice(0, 66));
      if (l.topics[0] === LOCKED_TOPIC) return [[addressOf(l.topics[2]), v, t]];
      const a = addressOf(l.topics[1]), b = addressOf(l.topics[2]);
      if (b === cfg.staking || a === cfg.staking || a === cfg.lock) return [];
      return [...(a !== ZERO ? [[a, -v, t] as [string, bigint, number]] : []), ...(b !== cfg.lock && b !== ZERO ? [[b, v, t] as [string, bigint, number]] : [])];
    });
    const earned: { wallet: string; badge: string; at: number }[] = [];
    const flyMoves = [...flies].sort(order).flatMap((l): [string, number, number][] => {
      const t = timeOf(parseInt(l.blockNumber, 16));
      const a = addressOf(l.topics[1]), b = addressOf(l.topics[2]);
      return [...(a !== ZERO ? [[a, -1, t] as [string, number, number]] : []), ...(b !== ZERO ? [[b, 1, t] as [string, number, number]] : [])];
    });
    const wallets = [...new Set([...changes.map((c) => c[0]), ...flyMoves.map((c) => c[0])])];
    if (wallets.length) {
      type Row = { wallet: string; balance: string; since_low: Date | null; since_high: Date | null; og_amount: string; flies: number;
        since_fly1: Date | null; since_fly10: Date | null; since_fly50: Date | null };
      const rows = await q.all<Row>(`select wallet, balance, since_low, since_high, og_amount, flies, since_fly1, since_fly10, since_fly50
        from mine.badge_holders where wallet = any(?::text[])`, `{${wallets.join(",")}}`);
      const ms = (d: Date | null) => (d ? new Date(d).getTime() : null);
      const held = new Map<string, Holder>(rows.map((r) => [r.wallet, { balance: BigInt(r.balance), og: BigInt(r.og_amount), low: ms(r.since_low), high: ms(r.since_high),
        flies: r.flies, f1: ms(r.since_fly1), f10: ms(r.since_fly10), f50: ms(r.since_fly50) }]));
      const of = (w: string) => held.get(w) ?? held.set(w, newHolder()).get(w)!;
      for (const [w, delta, t] of changes) for (const e of applyChange(of(w), delta, t, cfg)) earned.push({ wallet: w, badge: e.badge, at: e.at });
      for (const [w, delta, t] of flyMoves) for (const e of applyFly(of(w), delta, t, cfg)) earned.push({ wallet: w, badge: e.badge, at: e.at });
      await q.run(`insert into mine.badge_holders (wallet, balance, since_low, since_high, og_amount, flies, since_fly1, since_fly10, since_fly50)
        select wallet, balance, since_low, since_high, og_amount, flies, since_fly1, since_fly10, since_fly50 from jsonb_to_recordset(?::text::jsonb)
          as r(wallet text, balance numeric, since_low timestamptz, since_high timestamptz, og_amount numeric, flies int,
            since_fly1 timestamptz, since_fly10 timestamptz, since_fly50 timestamptz)
        on conflict (wallet) do update set balance = excluded.balance, since_low = excluded.since_low, since_high = excluded.since_high,
          og_amount = excluded.og_amount, flies = excluded.flies, since_fly1 = excluded.since_fly1, since_fly10 = excluded.since_fly10,
          since_fly50 = excluded.since_fly50`,
      JSON.stringify([...held].map(([wallet, h]) => ({ wallet, balance: h.balance.toString(), since_low: iso(h.low), since_high: iso(h.high), og_amount: h.og.toString(),
        flies: h.flies, since_fly1: iso(h.f1), since_fly10: iso(h.f10), since_fly50: iso(h.f50) }))));
    }
    // a claim belongs to the payout open when it was made
    let epoch = (await getState<number>(q, "payout_epoch")) ?? 0;
    for (const l of [...desk].sort(order)) {
      if (l.topics[0] === ROOT_TOPIC) epoch = Number(BigInt(l.topics[1]));
      else if (l.topics[0] === CLAIMED_TOPIC) {
        await q.run("insert into mine.badge_payouts (wallet, epoch) values (?, ?) on conflict do nothing", addressOf(l.topics[1]), epoch);
      }
    }
    if (desk.length) await setState(q, "payout_epoch", epoch);
    for (const l of [...minted].sort(order)) {
      const id = BigInt(l.data.slice(0, 66)), from = addressOf(l.topics[2]), into = addressOf(l.topics[3]);
      if (from !== ZERO) await q.run("delete from mine.badge_claims where wallet = ? and badge = ?", from, id);
      if (into !== ZERO) {
        await q.run("insert into mine.badge_claims (wallet, badge, at) values (?, ?, ?) on conflict do nothing", into, id, iso(timeOf(parseInt(l.blockNumber, 16))));
      }
    }
    for (const e of earned) {
      await q.run("insert into mine.badge_earned (wallet, badge, earned_at) values (?, ?, ?) on conflict do nothing", e.wallet, e.badge, iso(e.at));
    }
    await setState(q, "cursor", to + 1);
  }

  /** The chain from the cursor up to the safe head, a chunk at a time; a chunk and its cursor are one transaction. */
  async function scan(head: number) {
    let a = (await getState<number>(pg, "cursor")) ?? cfg.fromBlock;
    let span = CHUNK;
    const end = head - SAFE_BLOCKS;
    while (a <= end) {
      const b = Math.min(end, a + span - 1);
      const [money, locks, flies, desk, minted] = await Promise.all([
        logs(FLYAI, [TRANSFER_TOPIC], a, b), logs(cfg.lock, [LOCKED_TOPIC], a, b), logs(TRADER_FLY, [TRANSFER_TOPIC], a, b),
        logs(cfg.distributor, [], a, b),           // by address only: the RPC takes far less for an OR of topics
        logs(cfg.contract!, [SINGLE_TOPIC], a, b),
      ]);
      if (!money || !locks || !flies || !desk || !minted) {
        if (span <= 1000) throw new Error(`badges: the RPC refuses ${a}-${b}`);
        span = Math.floor(span / 4);
        continue;
      }
      const any = money.length + locks.length + flies.length + desk.length + minted.length > 0;
      const [ta, tb] = any ? await Promise.all([chain.blockTime(a), chain.blockTime(b)]) : [0, 0];
      const timeOf = (n: number) => (ta + (tb - ta) * ((n - a) / Math.max(1, b - a))) * 1000;
      await pg.tx(async (q) => {
        // another process got here first: leave it
        if (((await getState<number>(q, "cursor")) ?? cfg.fromBlock) !== a) throw new Error("badges: the cursor moved");
        await book(q, b, money, locks, flies, desk, minted, timeOf);
      }, "badges");
      a = b + 1;
      span = Math.min(CHUNK, span * 2);
    }
  }

  /** Clocks that have run long enough earn their badge, whether or not the wallet has moved. */
  async function sweep() {
    const t = now();
    const rules: [BadgeKey, string, number][] = [
      ["larva", "since_low", cfg.larvaDays], ["diamond", "since_low", cfg.diamondDays], ["lord", "since_high", cfg.lordDays],
      ...FLY_LEVELS.map((l): [BadgeKey, string, number] => [l.badge, l.col, cfg.flyDays]),
    ];
    const fresh: { wallet: string; badge: string }[] = [];
    for (const [badge, col, days] of rules) {
      fresh.push(...await pg.all<{ wallet: string; badge: string }>(`insert into mine.badge_earned (wallet, badge, earned_at)
        select wallet, ?, ${col} + make_interval(days => ?::int) from mine.badge_holders where ${col} <= ?
        on conflict do nothing returning wallet, badge`, badge, days, iso(t - days * DAY_MS)));
    }
    for (const l of PAYOUT_LEVELS) {
      fresh.push(...await pg.all<{ wallet: string; badge: string }>(`insert into mine.badge_earned (wallet, badge, earned_at)
        select wallet, ?, ?::timestamptz from mine.badge_payouts group by wallet having count(*) >= ?::int
        on conflict do nothing returning wallet, badge`, l.badge, iso(t), l.payouts));
    }
    for (const l of REFERRAL_LEVELS) {
      fresh.push(...await pg.all<{ wallet: string; badge: string }>(`insert into mine.badge_earned (wallet, badge, earned_at)
        select referrer, ?, ?::timestamptz from mine.referrals where qualified_at is not null group by referrer having count(*) >= ?::int
        on conflict do nothing returning wallet, badge`, l.badge, iso(t), l.referrals));
    }
    // the first full read earns hundreds at once: those wallets find them on the page; after that, a note in the bell
    if (await getState<boolean>(pg, "seeded")) {
      for (const f of fresh) {
        if (!cfg.exclude.includes(f.wallet)) await pg.run("insert into mine.notices (wallet, text, href) values (?, ?, ?)", f.wallet, `You earned a badge: claim it on your badges page.`, "/badges");
      }
    } else {
      await setState(pg, "seeded", true);
    }
  }

  let busy = false;
  async function tick() {
    if (busy || !on) return;
    busy = true;
    try {
      await scan(await chain.head());
      await sweep();
    } catch (err) {
      console.error(`badges: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  const idCall = (sel: string, id: number, wallet?: string) => ({ to: cfg.contract!, data: `${selector(sel)}${wallet ? word(BigInt(wallet)) : ""}${word(id)}` });
  const truthy = (r: string | null) => !!r && r.length >= 66 && BigInt(r.slice(0, 66)) !== 0n;

  let viewCache: { at: number; value: unknown } | null = null;
  async function publicView() {
    if (!on) return { on: false };
    if (viewCache && now() - viewCache.at < 60_000) return viewCache.value;
    const supply = await chain.batch(BADGES.map((b) => idCall("totalSupply(uint256)", b.id)));
    const value = { on: true, contract: cfg.contract, chain_id: cfg.chainId,
      badges: BADGES.map((b, i) => ({ ...b, claimed: supply[i] && supply[i]!.length >= 66 ? Number(BigInt(supply[i]!.slice(0, 66))) : 0 })) };
    viewCache = { at: now(), value };
    return value;
  }

  type BoardRow = { rank: number; wallet: string; nickname: string | null; badges: number; ids: number[] };
  let boardCache: { at: number; rows: BoardRow[]; total: number } | null = null;
  async function ranked(limit: number | null, wallet: string | null): Promise<BoardRow[]> {
    const rows = await pg.all<BoardRow>(`with held as (
        select wallet, count(*)::int as badges, max(at) as reached, array_agg(badge order by badge) as ids
        from mine.badge_claims where wallet <> all(?::text[]) group by wallet
      ), board as (
        select wallet, badges, ids, row_number() over (order by badges desc, reached, wallet)::int as rank from held
      )
      select b.rank, b.wallet, p.nickname, b.badges, b.ids from board b left join mine.profiles p on p.wallet = b.wallet
      where (?::int is null or b.rank <= ?::int) and (?::text is null or b.wallet = ?::text) order by b.rank`,
    `{${cfg.exclude.join(",")}}`, limit, limit, wallet, wallet);
    return rows;
  }
  async function leaderboard(wallet: string | null) {
    if (!on) return { on: false };
    if (!boardCache || now() - boardCache.at >= 60_000) {
      const total = await pg.one<{ n: number }>("select count(distinct wallet)::int as n from mine.badge_claims where wallet <> all(?::text[])", `{${cfg.exclude.join(",")}}`);
      boardCache = { at: now(), rows: await ranked(BOARD_SIZE, null), total: total?.n ?? 0 };
    }
    const me = wallet && /^0x[0-9a-f]{40}$/.test(wallet) ? (await ranked(null, wallet))[0] ?? null : null;
    return { on: true, total: boardCache.total, rows: boardCache.rows, me };
  }

  /** Each badge for one wallet: held, claimable, working (with its days so far), revoked, closed (OG missed). */
  async function standing(wallet: string) {
    const [row, earned, paid, referred, reads] = await Promise.all([
      pg.one<{ balance: string; since_low: Date | null; since_high: Date | null; og_amount: string; since_fly1: Date | null; since_fly10: Date | null; since_fly50: Date | null }>(
        "select balance, since_low, since_high, og_amount, since_fly1, since_fly10, since_fly50 from mine.badge_holders where wallet = ?", wallet),
      pg.all<{ badge: string }>("select badge from mine.badge_earned where wallet = ?", wallet),
      pg.one<{ n: number }>("select count(*)::int as n from mine.badge_payouts where wallet = ?", wallet),
      pg.one<{ n: number }>("select count(*)::int as n from mine.referrals where referrer = ? and qualified_at is not null", wallet),
      chain.batch(BADGES.flatMap((b) => [idCall("balanceOf(address,uint256)", b.id, wallet), idCall("revoked(address,uint256)", b.id, wallet)])),
    ]);
    const has = new Set(earned.map((e) => e.badge));
    const balance = BigInt(row?.balance ?? "0"), og = BigInt(row?.og_amount ?? "0");
    const daysSince = (s: Date | null | undefined) => (s ? Math.floor((now() - new Date(s).getTime()) / DAY_MS) : 0);
    const clocks: Record<string, { days: number; need: number } | { payouts: number; need: number } | { referrals: number; need: number } | null> = {
      larva: { days: daysSince(row?.since_low), need: cfg.larvaDays }, diamond: { days: daysSince(row?.since_low), need: cfg.diamondDays },
      lord: { days: daysSince(row?.since_high), need: cfg.lordDays }, og: null,
      flyowner: { days: daysSince(row?.since_fly1), need: cfg.flyDays }, swarm: { days: daysSince(row?.since_fly10), need: cfg.flyDays },
      queen: { days: daysSince(row?.since_fly50), need: cfg.flyDays },
      payday: { payouts: paid?.n ?? 0, need: 4 }, payroll: { payouts: paid?.n ?? 0, need: 8 },
      recruiter: { referrals: referred?.n ?? 0, need: 1 }, piedpiper: { referrals: referred?.n ?? 0, need: 10 },
    };
    const out = cfg.exclude.includes(wallet);
    const badges = BADGES.map((b, i) => {
      const held = truthy(reads[i * 2]), revoked = truthy(reads[i * 2 + 1]);
      const earnedIt = b.key === "og" ? ogHeld(balance, og, cfg) : has.has(b.key);
      const state = held ? "held" : revoked ? "revoked" : out ? "team" : earnedIt ? "claimable" : b.key === "og" ? "closed" : "working";
      return { ...b, state, progress: clocks[b.key] };
    });
    return { on: true, contract: cfg.contract, chain_id: cfg.chainId, wallet, balance: (balance / E18).toString(),
      synced: !!(await getState<boolean>(pg, "seeded")), badges };
  }

  async function vouchers(wallet: string) {
    const me = await standing(wallet);
    const open = me.badges.filter((b) => b.state === "claimable").map((b) => b.id);
    if (!open.length) throw new HttpError(409, "nothing to claim yet");
    const deadline = Math.floor(now() / 1000) + VOUCHER_S;
    const c = { chainId: cfg.chainId, contract: cfg.contract!, signerKey: cfg.signerKey! };
    return { to: cfg.contract, chain_id: cfg.chainId, badges: open, deadline,
      data: claimData(open, deadline, open.map((id) => signVoucher(c, wallet, id, deadline))) };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/badges") return d.send(res, 200, await publicView()), true;
    if (!on && p.startsWith("/api/badges/")) return d.send(res, 200, { on: false }), true;
    if (req.method === "GET" && p === "/api/badges/leaderboard") {
      return d.send(res, 200, await leaderboard(url.searchParams.get("wallet")?.toLowerCase() ?? null)), true;
    }
    if (req.method === "GET" && p === "/api/badges/me") return d.send(res, 200, await standing((await d.sessionWallet(req)).toLowerCase())), true;
    if (req.method === "POST" && p === "/api/badges/vouchers") return d.send(res, 200, await vouchers((await d.sessionWallet(req)).toLowerCase())), true;
    return false;
  }

  function start(everyMs = Number(process.env.BADGES_TICK_MS ?? 600_000)) {
    if (!on) return;
    setTimeout(tick, 30_000).unref();
    setInterval(tick, everyMs).unref();
  }

  return { route, start, tick, publicView, standing, vouchers, leaderboard };
}
