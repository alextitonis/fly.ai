/**
 * XP, season 1 (2026-11-03, the user: "ok build it"): XP for using fly.ai, counted toward the airdrop. The pool
 * is never announced. Everything since $FLYAI's first transfer counts, so existing holders start with their history.
 *
 *   holding      10 XP a day per 200k $FLYAI in the wallet, 12.5 staked or locked (FlyStaking, FlyLock beneficiary)
 *   active flies 10 XP a day per Trader Fly while the wallet holds 200k+ (the activation rule)
 *   streak       holding and fly XP x(1 + 0.1 per full week without a sell), up to x2; a sell into a pool restarts it
 *   deposits     10 XP per $1 put in a fly wallet, deposits of $10+; taking principal out takes it back (profit doesn't)
 *   feeding      10 XP per $1 a fed fly leaves in the Fly Desk (TraderFly Fed)
 *   marketplace  1 XP per 10k $FLYAI of a sale on our market, buyer and seller each
 *   swap box     1 XP per 10k $FLYAI bought through our swap box (a buy whose tx pays our fee leg to the dev wallet)
 *   claim+stake  50 XP when a Fly Desk claim is staked within the hour
 *   breeding     500 XP a merge
 *   pass burn    100 XP a FlightPass sent to 0x0 or 0x…dEaD
 *   badges       claimed soulbound badges by rarity: common 25, uncommon 100, rare 250, legendary 500
 *   referrals    +10% of each real referral's XP (src/referrals.ts: $20+ in Fly Wallets for 7 days)
 *   X            50 once for a linked account (src/xlink.ts); 20 a day for a post from it about fly.ai (found nightly)
 *   Telegram     50 while a linked account (src/tglink.ts) is in the fly.ai group; checked daily, leaving takes it back
 *   Flybook      5 XP a day with a like, comment, poke or caption, for wallets that hold or own a fly
 *   check-in     2 XP a day + streak milestones, and daily quests 2 each (+4 for all 3): src/quests.ts books them here
 *
 * Level = floor(sqrt(XP / 50)). The dev, pool, house and the user's own wallets, contracts and fly wallets are tracked
 * but left off the board. Contracts are found by their code (the Pons token contract held 81.6M from launch), up to
 * 300 a tick, highest XP first, and remembered in xp_state. Staking and locks move nothing (a lock counts for its beneficiary), as in src/badges.ts.
 *
 *   GET  /api/xp/leaderboard?wallet=0x..   top 100 and that wallet's row
 *   GET  /api/xp/profile?wallet=0x..       XP by source, level, rank, flies, badges, X, nickname, ref code
 *   GET  /api/xp/me                        the signed-in wallet's profile
 *   GET  /api/xp/round?wallet=0x..         the giveaway round now: XP earned since it began, top 100 and that wallet
 *   GET  /api/xp/rounds                    past rounds: the frozen standings, and the winners and rewards the team set
 *   POST /api/admin/xp/round { id, winners: [{ wallet, reward }], note }   (admin) a past round's rewards, set by hand
 *   GET  /api/admin/xp/bug                 (admin) the bug-find grants, newest first
 *   POST /api/admin/xp/bug { wallet, xp, note } | { remove: id }   (admin) XP for a bug someone found, given by hand
 *                                          (2026-11-08): source 'bug', a one-off like a breed - never a daily quest or
 *                                          check-in, never boosted by a 2x window; the note stays with the admins
 *   GET  /api/xp/log?wallet=0x..           what it earned and from where, newest first: one-off events one by one (with
 *                                          their tx), the rest (holding, flies, deposits, badges, referrals, X, Flybook) a day at a time
 *   (X posts are found by a nightly search, src: shares(): nothing to paste)
 *
 * The bell (mine.notices): a level-up, and one note a tick for the one-off XP a wallet earned (trades, buys, breeding...);
 * holding and fly XP grow all the time and stay quiet. Nothing is sent for the backfill: notes start after the first
 * full read.
 *
 * Tables in flybook/supabase/migrations/20261104120000_mine_xp.sql. Off with XP_ON=0.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg, Q } from "./pg.ts";
import { FLYAI, type Log as RawLog } from "./gta.ts";
import { POOLS, flowsOf } from "./buyweek.ts";

const E18 = 10n ** 18n;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LOCKED = "0x904a8aa9ab681d45182d3583ae57e3cbc0ba1fcb72f9811ec8feee917bdbffe5";
const CLAIMED = "0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e";
const FED = "0x000cb2d9be8c81fea2148aedbe249d365ec8682f80a9cfef62bb4c15b4220d73";
const SOLD = "0xa70b1a854695e7921b122988e216d3a6cd10ed799017c67b1ff231967e6bf56d";
const OFFER_ACCEPTED = "0x50df946ee330bf8af17ecc21585649645f3680c032bc659b21e49881bea57f71";
const COLLECTION_ACCEPTED = "0x66de58aeff9a434d3c6d1f2368cc98159529832ab6c642f3d4a7c82b7734fce7";
const MERGE_STARTED = "0x2e644e10158aafb1c3e7f06b92d5a111375494e5a0fc9d2ab65775e2414f708d";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const FROM_BLOCK = 61_188_324;
const CHUNK = 1_000_000;
/** logs booked in one transaction at most (a busy million blocks timed out on 11-03) */
const MAX_LOGS = 3000;
const SAFE_BLOCKS = 100;
const BOARD_SIZE = 100;
const CACHE_MS = 60_000;

export const RATES = {
  holdPer200k: 10, stakedBoost: 1.25, flyPerDay: 10, activeAt: 200_000n * E18,
  streakPerWeek: 0.1, streakCap: 2,
  depositPerUsd: 10, depositMinUsd: 10, feedPerUsd: 10,
  per10kFlyai: 1, marketUsdg: 0.5, marketOther: 20,
  claimStake: 50, claimStakeMs: 3_600_000, breed: 500, passBurn: 100,
  badge: { common: 25, uncommon: 100, rare: 250, legendary: 500 } as Record<string, number>,
  referral: 0.1, xConnect: 50, tgMember: 50, share: 20, flybookDay: 5, levelBase: 50,
} as const;

export type XpConfig = {
  on: boolean; end: number; start: number; fromBlock: number; roundFirstEnd: number; roundDays: number;
  staking: string; lock: string; distributor: string; fly: string; market: string; breeder: string; pass: string; feeTo: string;
  exclude: string[];
};
export function xpConfig(env: NodeJS.ProcessEnv): XpConfig {
  const a = (v: string | undefined, d: string) => (v || d).trim().toLowerCase();
  return {
    on: env.XP_ON !== "0",
    start: Date.parse(env.XP_SEASON_START ?? "2026-11-04T09:00:00Z"),
    // the end is a secret (fly secrets XP_SEASON_END): the user doesn't say when the airdrop is, and this repo is public
    end: env.XP_SEASON_END ? Date.parse(env.XP_SEASON_END) : Infinity,
    fromBlock: Number(env.XP_FROM_BLOCK ?? FROM_BLOCK),
    // giveaway rounds (the user, 11-03): the first ends this Sunday 20:00 TRT, then one every 2 weeks
    roundFirstEnd: Date.parse(env.XP_ROUND1_END ?? "2026-11-08T17:00:00Z"), roundDays: Number(env.XP_ROUND_DAYS ?? 14),
    staking: a(env.STAKING_CONTRACT, "0x5279dafa0858d4a5b2dceb05e5b41f954cd692cc"),
    lock: a(env.FLYLOCK_CONTRACT, "0x87ded9d9788a1f6653a0261ef84c56658d0bf5e9"),
    distributor: a(env.DISTRIBUTOR_ADDRESS, "0xbb0b80de6a1f1298c0aa33d557c8f3540b5c8423"),
    fly: a(env.TRADERFLY_ADDRESS, "0x18d4d831ca89672126172b73ba05f5a318ad5a72"),
    market: a(env.FLYMARKET_ADDRESS, "0x453ca65b1fb7d3760e265362c7705cc0276c27db"),
    breeder: a(env.FLYBREEDER_ADDRESS, "0xa3de6f2d2b10ff98923c16ed71decf0afa393323"),
    pass: a(env.FLIGHTPASS, "0x89effb63578a09065c2bbfdd729e161be7d479da"),
    feeTo: a(env.XP_FEE_TO, "0x625862521777e19ad54ce6c7abed9ca54d6589ea"),
    // dev, pool, the desk's house wallet and the user's own: they hold for the project
    exclude: (env.XP_EXCLUDE ?? "0x625862521777e19ad54ce6c7abed9ca54d6589ea,0xcca1ad591f6fe7e40e382639ad2551044fae6d36,"
      + "0x449f6228dec522bb36a69153c3f8e36a8a7852fb,0xae92d64584e7f8e54995c362eaa8d7949fac8b1b")
      .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
  };
}

/** a log and the contract that wrote it (the scan reads by address and tags each log) */
export type Log = RawLog & { address: string };

export type Chain = {
  head(): Promise<number>;
  blockTime(n: number): Promise<number>;           // seconds
  logs(q: { address: string; topics: (string | null)[]; from: number; to: number }): Promise<RawLog[]>;
  /** has code and isn't an EIP-7702 wallet (src/gta.ts robinhoodChain) */
  isContract(wallet: string): Promise<boolean>;
};

/** One wallet's holding, and the XP it built up to `at` (ms). */
export type Holder = { liquid: bigint; staked: bigint; locked: bigint; flies: number; at: number | null; hold: number; fly: number; streak: number | null };
export const newHolder = (): Holder => ({ liquid: 0n, staked: 0n, locked: 0n, flies: 0, at: null, hold: 0, fly: 0, streak: null });

const tokens = (v: bigint) => Number(v / 10n ** 14n) / 10_000;   // base units -> whole $FLYAI, to 4 places
export const streakMult = (since: number | null, t: number) =>
  since === null ? 1 : Math.min(RATES.streakCap, 1 + RATES.streakPerWeek * Math.floor(Math.max(0, t - since) / WEEK_MS));
export const holdPerDay = (h: Holder) => (tokens(h.liquid) + RATES.stakedBoost * tokens(h.staked + h.locked)) / 200_000 * RATES.holdPer200k;
export const flyPerDay = (h: Holder) => (h.liquid + h.staked + h.locked >= RATES.activeAt ? h.flies * RATES.flyPerDay : 0);
export const levelOf = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / RATES.levelBase));
export const levelXp = (level: number) => RATES.levelBase * level * level;

/** XP for the time from h.at to t (clipped at the season's end); the streak's multiplier steps up week by week. */
export function accrue(h: Holder, t: number, end: number) {
  const to = Math.min(t, end);
  let from = h.at;
  while (from !== null && from < to) {
    const m = streakMult(h.streak, from);
    const next = h.streak === null || m >= RATES.streakCap ? to
      : Math.min(to, h.streak + (Math.floor((from - h.streak) / WEEK_MS) + 1) * WEEK_MS);
    const days = (next - from) / DAY_MS;
    h.hold += holdPerDay(h) * days * m;
    h.fly += flyPerDay(h) * days * m;
    from = next;
  }
  h.at = h.at === null ? t : Math.max(h.at, t);
}
/** The holder as of `t`, without changing it: what the board shows between ticks. */
export function asOf(h: Holder, t: number, end: number): Holder {
  const c = { ...h };
  accrue(c, t, end);
  return c;
}

const addressOf = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();
const wordAt = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"}`);

/** A market sale's XP for each side: FLYAI by amount, USDG by dollars, anything else flat. */
export function saleXp(token: string, amount: bigint) {
  if (token === FLYAI) return tokens(amount) / 10_000 * RATES.per10kFlyai;
  if (token === USDG) return Number(amount) / 1e6 * RATES.marketUsdg;
  return RATES.marketOther;
}
/** Claimed badges' XP: each badge's rarity is its holders against every wallet that holds a badge (as on /badges). */
export function badgeXp(mine: number[], held: Map<number, number>, total: number) {
  let xp = 0;
  for (const id of mine) {
    const share = total ? (held.get(id) ?? 0) / total : 1;
    xp += RATES.badge[share >= 0.25 ? "common" : share >= 0.1 ? "uncommon" : share >= 0.02 ? "rare" : "legendary"];
  }
  return xp;
}
/** Deposit XP: $10+ deposits, at most what is still in as principal. */
export const depositXp = (deposited: number, principal: number) => RATES.depositPerUsd * Math.max(0, Math.min(deposited, principal));

export type Event = { wallet: string; source: string; ref: string; xp: number; at: number };
type Pending = Record<string, { t: number; amount: string; ref: string }>;

/**
 * 2x XP windows (2026-11-04, the user: "as admin we can set double gain/lose for specific dates"). Set by an admin
 * (POST /api/admin/xp/boost); nothing about them is public before they start except what /api/xp/boost shows.
 *   gains     one-off actions inside the window (BOOST_SOURCES) and fly-wallet deposits made in it count x mult
 *             (the extra is its own source, "boost"). Holding and fly XP are NOT boosted.
 *   losses    a sell into a pool inside the window costs mult x the XP a buy of that size earns (per10kFlyai), and a
 *             withdrawal from a fly wallet in it takes back (mult - 1) x more deposit XP (source "penalty", negative)
 *   claw-back a sell inside the window or within CLAWBACK_MS after it loses that window's whole bonus
 * Sells are only recorded while a window or its claw-back is open (xp_state "boost_sells"), not every sell ever.
 */
export type Boost = { id: number; from: number; to: number; mult: number; note?: string | null };
export type Sell = { wallet: string; at: number; xp: number; ref: string };
/** the most XP one bug grant may give (a typo guard: 5,000 is level 10 on its own) */
export const BUG_MAX_XP = 10_000;
export const BOOST_SOURCES = ["market", "buy", "breed", "feed", "claimstake", "passburn"];
export const CLAWBACK_MS = 3 * DAY_MS;
export const BOOST_LIMITS = { minMult: 1.25, maxMult: 5, maxMs: 7 * DAY_MS };
/** Is t inside a window, or its claw-back after? */
export const watching = (boosts: Boost[], t: number) => boosts.some((b) => t >= b.from && t < b.to + CLAWBACK_MS);

/** One wallet's result for one window. sold = the buy-equivalent XP of its sells in the window. */
export function boostResult(b: Boost, p: { gained: number; deposited: number; sold: number; soldAfter: boolean; withdrawn: number; depositsAll: number }) {
  const extra = b.mult - 1;
  const raw = extra * (p.gained + RATES.depositPerUsd * p.deposited);
  const forfeited = p.sold > 0 || p.soldAfter;
  const penalty = b.mult * p.sold + extra * RATES.depositPerUsd * Math.min(p.withdrawn, p.depositsAll);
  return { bonus: forfeited ? 0 : raw, penalty, forfeited: forfeited && raw > 0, raw };
}

/**
 * A chunk of logs, in chain order, against the holders it touches. Returns the one-off events. Pure apart from `of`.
 * `fee` is the swap box's fee leg: a buy whose tx also pays $FLYAI to it came through our box. Other buys from a pool go
 * to `plain` when given (2026-11-06: the box's Relay route pays our fee at Relay, its GIGA route has none, so neither
 * showed a fee leg; book() counts them when the box logged a success for that wallet, mine.swap_events).
 */
export function bookLogs(cfg: XpConfig, logs: Log[], timeOf: (n: number) => number, of: (w: string) => Holder,
  owners: Map<number, string>, pending: Pending, sells?: { boosts: Boost[]; out: Sell[] }, plain?: Event[]): Event[] {
  const events: Event[] = [];
  const order = (a: Log, b: Log) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16);
  const sorted = [...logs].sort(order);
  // each tx's $FLYAI moves, for buys and sells
  const byTx = new Map<string, { from: string; to: string; value: bigint }[]>();
  for (const l of sorted) {
    if (l.address !== FLYAI || l.topics[0] !== TRANSFER) continue;
    const list = byTx.get(l.transactionHash) ?? byTx.set(l.transactionHash, []).get(l.transactionHash)!;
    list.push({ from: addressOf(l.topics[1]), to: addressOf(l.topics[2]), value: wordAt(l.data, 0) });
  }
  const seenTx = new Set<string>();
  const move = (w: string, t: number, f: (h: Holder) => void) => {
    if (w === ZERO || w === DEAD) return;
    const h = of(w);
    accrue(h, t, cfg.end);
    f(h);
    if (h.streak === null && h.liquid + h.staked + h.locked > 0n) h.streak = t;
  };
  const ev = (wallet: string, source: string, l: Log, xp: number, t: number) => {
    if (wallet !== ZERO && wallet !== DEAD && xp > 0 && t <= cfg.end) events.push({ wallet, source, ref: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`, xp, at: t });
  };
  for (const l of sorted) {
    const at = l.address, topic = l.topics[0], t = timeOf(parseInt(l.blockNumber, 16));
    if (at === FLYAI && topic === TRANSFER) {
      if (!seenTx.has(l.transactionHash)) {
        seenTx.add(l.transactionHash);
        const moves = byTx.get(l.transactionHash)!;
        const flows = flowsOf(moves, POOLS);
        const viaBox = moves.some((m) => m.to === cfg.feeTo) && [...flows.values()].some((v) => v > 0n);
        for (const [w, v] of flows) {
          if (v < 0n) {
            move(w, t, (h) => { h.streak = t; });                           // a sell restarts the streak
            if (sells && w !== ZERO && w !== DEAD && watching(sells.boosts, t)) {
              sells.out.push({ wallet: w, at: t, xp: tokens(-v) / 10_000 * RATES.per10kFlyai, ref: `${l.transactionHash}:${w}` });
            }
          }
          else if (viaBox && w !== cfg.feeTo) ev(w, "buy", l, tokens(v) / 10_000 * RATES.per10kFlyai, t);
          else if (plain && w !== cfg.feeTo && w !== ZERO && w !== DEAD && t <= cfg.end) {
            plain.push({ wallet: w, source: "buy", ref: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`, xp: tokens(v) / 10_000 * RATES.per10kFlyai, at: t });
          }
        }
      }
      const a = addressOf(l.topics[1]), b = addressOf(l.topics[2]), v = wordAt(l.data, 0);
      if (b === cfg.staking) {
        move(a, t, (h) => { h.liquid -= v; h.staked += v; });
        const p = pending[a];
        if (p && t - p.t <= RATES.claimStakeMs && v * 2n >= BigInt(p.amount)) {
          events.push({ wallet: a, source: "claimstake", ref: p.ref, xp: RATES.claimStake, at: t });
          delete pending[a];
        }
      } else if (a === cfg.staking) move(b, t, (h) => { h.staked -= v; h.liquid += v; });
      else if (a === cfg.lock) move(b, t, (h) => { h.locked -= v; h.liquid += v; });
      else {
        move(a, t, (h) => { h.liquid -= v; });
        if (b !== cfg.lock) move(b, t, (h) => { h.liquid += v; });          // into the lock: Locked credits the beneficiary
      }
    } else if (at === cfg.lock && topic === LOCKED) {
      move(addressOf(l.topics[2]), t, (h) => { h.locked += wordAt(l.data, 0); });
    } else if (at === cfg.fly && topic === TRANSFER) {
      const a = addressOf(l.topics[1]), b = addressOf(l.topics[2]), id = Number(BigInt(l.topics[3]));
      move(a, t, (h) => { h.flies -= 1; });
      move(b, t, (h) => { h.flies += 1; });
      if (b === ZERO || b === DEAD) owners.delete(id); else owners.set(id, b);
    } else if (at === cfg.fly && topic === FED) {
      const owner = owners.get(Number(BigInt(l.topics[1])));
      if (owner) ev(owner, "feed", l, Number(wordAt(l.data, 0)) / 1e6 * RATES.feedPerUsd, t);
    } else if (at === cfg.distributor && topic === CLAIMED) {
      const w = addressOf(l.topics[1]);
      const prev = pending[w];
      const amount = wordAt(l.data, 0) + (prev && t - prev.t <= RATES.claimStakeMs ? BigInt(prev.amount) : 0n);
      pending[w] = { t, amount: amount.toString(), ref: prev && t - prev.t <= RATES.claimStakeMs ? prev.ref : `${l.transactionHash}:${parseInt(l.logIndex, 16)}` };
    } else if (at === cfg.market && topic === SOLD) {
      const xp = saleXp(FLYAI, wordAt(l.data, 0));
      ev(addressOf(l.topics[2]), "market", l, xp, t);
      ev(addressOf(l.topics[3]), "market", { ...l, logIndex: `0x${(parseInt(l.logIndex, 16) + 100_000).toString(16)}` }, xp, t);
    } else if (at === cfg.market && (topic === OFFER_ACCEPTED || topic === COLLECTION_ACCEPTED)) {
      const xp = saleXp(addressOf(`0x${l.data.slice(2, 66)}`), wordAt(l.data, 1));
      ev(addressOf(l.topics[2]), "market", l, xp, t);
      ev(addressOf(l.topics[3]), "market", { ...l, logIndex: `0x${(parseInt(l.logIndex, 16) + 100_000).toString(16)}` }, xp, t);
    } else if (at === cfg.breeder && topic === MERGE_STARTED) {
      ev(addressOf(l.topics[3]), "breed", l, RATES.breed, t);
    } else if (at === cfg.pass && topic === TRANSFER) {
      const b = addressOf(l.topics[2]);
      if (b === ZERO || b === DEAD) ev(addressOf(l.topics[1]), "passburn", l, RATES.passBurn, t);
    }
  }
  const last = sorted.length ? timeOf(parseInt(sorted[sorted.length - 1].blockNumber, 16)) : 0;
  for (const [w, p] of Object.entries(pending)) if (last - p.t > RATES.claimStakeMs) delete pending[w];   // never staked in time
  return events;
}

/** A post on X, as the nightly search returns it. */
export type Post = { id: string; author: string; at: number; reply: boolean };

/**
 * Posts that earn XP: from a linked X account, after it was linked, not a reply (giveaway threads fill with bare
 * addresses), one a UTC day per wallet. `booked` holds "wallet:day" already paid and grows as posts count.
 */
export function sharesFrom(posts: Post[], links: { wallet: string; username: string; linked_at_ms: number }[], booked: Set<string>, end: number): Event[] {
  const by = new Map(links.map((l) => [l.username.toLowerCase(), l]));
  const out: Event[] = [];
  for (const p of [...posts].sort((a, b) => a.at - b.at)) {
    const l = by.get(p.author.toLowerCase());
    if (!l || p.reply || !/^\d{5,25}$/.test(p.id) || p.at < Number(l.linked_at_ms) || p.at > end) continue;
    const key = `${l.wallet}:${new Date(p.at).toISOString().slice(0, 10)}`;
    if (booked.has(key)) continue;
    booked.add(key);
    out.push({ wallet: l.wallet, source: "share", ref: `x:${p.id}`, xp: RATES.share, at: p.at });
  }
  return out;
}

/** Posts mentioning fly.ai since a day, through Apify's X search (the actor flytrade/marketing uses; ~cents a night). */
export async function apifySearch(token: string, actor: string, since: string): Promise<Post[]> {
  const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(280_000),
    body: JSON.stringify({ searchTerms: [`(@flydotai OR flyaiworld.com) since:${since}`], maxItems: 400, queryType: "Latest" }),
  });
  if (!r.ok) throw new Error(`apify ${r.status}`);
  const items = await r.json() as { id?: string | number; createdAt?: string; isReply?: boolean; author?: { userName?: string } }[];
  return items.filter((t) => t.author?.userName && Number(t.id) > 0 && t.createdAt)
    .map((t) => ({ id: String(t.id), author: t.author!.userName!, at: Date.parse(t.createdAt!), reply: !!t.isReply }));
}

export type Sources = Record<string, number>;
/** sources booked one by one in mine.xp_events; the rest accrue and are logged by the day */
export const EVENT_SOURCES = ["market", "buy", "breed", "feed", "claimstake", "passburn", "share", "checkin", "quest"];

/** The day-by-day gains from end-of-day totals (oldest first): each day minus the day before, events left out. */
export function dailyGains(days: { day: string; sources: Sources }[]) {
  const out: { day: string; sources: Sources; first: boolean }[] = [];
  let prev: Sources = {};
  days.forEach((d, i) => {
    const gain: Sources = {};
    for (const [k, v] of Object.entries(d.sources)) {
      if (EVENT_SOURCES.includes(k)) continue;
      const g = Math.round(v - (prev[k] ?? 0));
      if (g !== 0) gain[k] = g;
    }
    if (Object.keys(gain).length) out.push({ day: d.day, sources: gain, first: i === 0 });
    prev = d.sources;
  });
  return out;
}
export type Row = { wallet: string; xp: number; level: number; sources: Sources; flies: number; active: boolean; streakWeeks: number };

export function createXp(d: {
  pg: Pg; chain: Chain; cfg: XpConfig;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly?: (req: IncomingMessage) => void;
  /** wallets that may set 2x windows when signed in (BOUNTY_ADMINS), besides the admin token */
  admins?: string[];
  now?: () => number;
  /** posts mentioning fly.ai since a UTC day (YYYY-MM-DD); off when null (no APIFY_TOKEN) */
  search?: ((since: string) => Promise<Post[]>) | null;
}) {
  const { pg, chain, cfg, HttpError } = d;
  const now = d.now ?? Date.now;
  const token = process.env.APIFY_TOKEN ?? "";
  const search = d.search !== undefined ? d.search
    : token ? (since: string) => apifySearch(token, process.env.XP_SHARE_ACTOR ?? "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest", since) : null;
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  const dayStart = () => iso(Math.floor(now() / DAY_MS) * DAY_MS);   // UTC midnight: one share a UTC day
  const ms = (v: Date | string | null) => (v === null ? null : new Date(v).getTime());
  const getState = async <T>(q: Q, key: string) => (await q.one<{ value: T }>("select value from mine.xp_state where key = ?", key))?.value;
  const setState = (q: Q, key: string, value: unknown) => q.run(`insert into mine.xp_state (key, value) values (?, ?::text::jsonb)
    on conflict (key) do update set value = excluded.value`, key, JSON.stringify(value));

  async function logs(address: string, topics: (string | null)[], from: number, to: number): Promise<Log[] | null> {
    try {
      return (await chain.logs({ address, topics, from, to })).map((l) => ({ ...l, address }));
    } catch (err) {
      if (/range|span|limit|too many|exceed/i.test(String((err as Error).message))) return null;
      throw err;
    }
  }

  type HolderRow = { wallet: string; liquid: string; staked: string; locked: string; flies: number; at: Date | null; hold_xp: number; fly_xp: number; streak_since: Date | null };
  const fromRow = (r: HolderRow): Holder => ({ liquid: BigInt(r.liquid), staked: BigInt(r.staked), locked: BigInt(r.locked), flies: r.flies,
    at: ms(r.at), hold: r.hold_xp, fly: r.fly_xp, streak: ms(r.streak_since) });

  async function book(q: Q, to: number, all: Log[], timeOf: (n: number) => number) {
    const touched = new Set<string>();
    for (const l of all) for (const tp of l.topics.slice(1)) if (tp && /^0x0{24}[0-9a-f]{40}$/i.test(tp) && !/^0x0{50}/.test(tp)) touched.add(addressOf(tp));   // addresses, not small ids
    const flyIds = all.filter((l) => l.address === cfg.fly && l.topics[0] === FED).map((l) => Number(BigInt(l.topics[1])));
    const [rows, ownerRows, pending] = await Promise.all([
      touched.size ? q.all<HolderRow>(`select wallet, liquid::text, staked::text, locked::text, flies, at, hold_xp, fly_xp, streak_since
        from mine.xp_holders where wallet = any(?::text[])`, `{${[...touched].join(",")}}`) : Promise.resolve([]),
      flyIds.length || all.some((l) => l.address === cfg.fly)
        ? q.all<{ id: number; owner: string }>("select id, owner from mine.xp_flies") : Promise.resolve([]),
      getState<Pending>(q, "pending").then((p) => p ?? {}),
    ]);
    const held = new Map<string, Holder>(rows.map((r) => [r.wallet, fromRow(r)]));
    const of = (w: string) => held.get(w) ?? held.set(w, newHolder()).get(w)!;
    const owners = new Map<number, string>(ownerRows.map((r) => [r.id, r.owner]));
    const before = new Map(owners);
    const boosts = (await getState<Boost[]>(q, "boosts")) ?? [];
    const sold: Sell[] = [];
    const plain: Event[] = [];
    const events = bookLogs(cfg, all, timeOf, of, owners, pending, { boosts, out: sold }, plain);
    if (plain.length) events.push(...await boxBuys(q, plain));
    if (sold.length) {
      const prev = (await getState<Sell[]>(q, "boost_sells")) ?? [];
      const seen = new Set(prev.map((s) => s.ref));
      await setState(q, "boost_sells", [...prev, ...sold.filter((s) => !seen.has(s.ref))]);
    }
    if (held.size) {
      await q.run(`insert into mine.xp_holders (wallet, liquid, staked, locked, flies, at, hold_xp, fly_xp, streak_since)
        select wallet, liquid, staked, locked, flies, at, hold_xp, fly_xp, streak_since from jsonb_to_recordset(?::text::jsonb)
          as r(wallet text, liquid numeric, staked numeric, locked numeric, flies int, at timestamptz, hold_xp float8, fly_xp float8, streak_since timestamptz)
        on conflict (wallet) do update set liquid = excluded.liquid, staked = excluded.staked, locked = excluded.locked, flies = excluded.flies,
          at = excluded.at, hold_xp = excluded.hold_xp, fly_xp = excluded.fly_xp, streak_since = excluded.streak_since`,
      JSON.stringify([...held].map(([wallet, h]) => ({ wallet, liquid: h.liquid.toString(), staked: h.staked.toString(), locked: h.locked.toString(),
        flies: h.flies, at: iso(h.at), hold_xp: h.hold, fly_xp: h.fly, streak_since: iso(h.streak) }))));
    }
    const changed = [...owners].filter(([id, w]) => before.get(id) !== w);
    const gone = [...before.keys()].filter((id) => !owners.has(id));
    if (changed.length) {
      await q.run(`insert into mine.xp_flies (id, owner) select id, owner from jsonb_to_recordset(?::text::jsonb) as r(id int, owner text)
        on conflict (id) do update set owner = excluded.owner`, JSON.stringify(changed.map(([id, owner]) => ({ id, owner }))));
    }
    if (gone.length) await q.run("delete from mine.xp_flies where id = any(?::int[])", `{${gone.join(",")}}`);
    if (events.length) {
      await q.run(`insert into mine.xp_events (wallet, source, ref, xp, at)
        select wallet, source, ref, xp, at from jsonb_to_recordset(?::text::jsonb) as r(wallet text, source text, ref text, xp float8, at timestamptz)
        on conflict (ref) do nothing`, JSON.stringify(events.map((e) => ({ ...e, at: iso(e.at) }))));
    }
    await setState(q, "pending", pending);
    await setState(q, "cursor", to + 1);
  }

  /** Buys with no fee leg that the swap box logged as a success for that wallet within 2 hours: the box's Relay and GIGA
   *  routes (mine.swap_events, src/buyweek.ts). A log row alone counts nothing; it has to match a real buy here. */
  async function boxBuys(q: Q, plain: Event[]): Promise<Event[]> {
    const W = 2 * 3_600_000;
    const from = Math.min(...plain.map((e) => e.at)) - W, to = Math.max(...plain.map((e) => e.at)) + W;
    const rows = await q.all<{ wallet: string; at_ms: number }>(`select wallet, (extract(epoch from at) * 1000)::float8 as at_ms from mine.swap_events
      where step = 'success' and wallet = any(?::text[]) and at between ? and ?`,
      `{${[...new Set(plain.map((e) => e.wallet))].join(",")}}`, new Date(from).toISOString(), new Date(to).toISOString()).catch(() => []);
    return plain.filter((e) => rows.some((r) => r.wallet === e.wallet && Math.abs(r.at_ms - e.at) <= W));
  }

  /** The chain from the cursor up to the safe head, a chunk at a time; a chunk and its cursor are one transaction. */
  async function scan(head: number) {
    let a = (await getState<number>(pg, "cursor")) ?? cfg.fromBlock;
    let span = CHUNK;
    const end = head - SAFE_BLOCKS;
    while (a <= end) {
      const b = Math.min(end, a + span - 1);
      const got = await Promise.all([
        logs(FLYAI, [TRANSFER], a, b), logs(cfg.lock, [LOCKED], a, b), logs(cfg.fly, [], a, b), logs(cfg.distributor, [CLAIMED], a, b),
        logs(cfg.market, [], a, b), logs(cfg.breeder, [MERGE_STARTED], a, b), logs(cfg.pass, [TRANSFER], a, b),
      ]);
      if (got.some((g) => g === null)) {
        if (span <= 1) throw new Error(`xp: the RPC refuses block ${a}`);
        span = Math.max(1, Math.floor(span / 4));
        continue;
      }
      const all = (got as Log[][]).flat();
      // a busy stretch: smaller pieces, so each one's transaction stays well inside the 45 s limit
      if (all.length > MAX_LOGS && span > 1) { span = Math.max(1, Math.floor(span / 2)); continue; }
      const [ta, tb] = all.length ? await Promise.all([chain.blockTime(a), chain.blockTime(b)]) : [0, 0];
      const timeOf = (n: number) => (ta + (tb - ta) * ((n - a) / Math.max(1, b - a))) * 1000;
      await pg.tx(async (q) => {
        if (((await getState<number>(q, "cursor")) ?? cfg.fromBlock) !== a) throw new Error("xp: the cursor moved");
        await book(q, b, all, timeOf);
      }, "xp");
      a = b + 1;
      span = Math.min(CHUNK, span * 2);
    }
  }

  let busy = false;
  async function tick() {
    if (busy || !cfg.on) return;
    busy = true;
    try {
      await scan(await chain.head());
      cache = null;
      await shares().catch((err) => console.error(`xp shares: ${err instanceof Error ? err.message : err}`));
      await classify();
      await snapshot();
      await rounds();
      await notify();
      await boostNotes();
    } catch (err) {
      console.error(`xp: ${err instanceof Error ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  /** Everyone's XP right now, by source. Read from the tables each minute. */
  let cache: { at: number; rows: Map<string, Row>; ranked: Row[]; windows: Map<string, WindowResult[]> } | null = null;
  async function compute() {
    if (cache && now() - cache.at < CACHE_MS) return cache;
    const t = Math.min(now(), cfg.end), endIso = Number.isFinite(cfg.end) ? iso(cfg.end) : "9999-12-31T00:00:00.000Z";   // postgres.js dates can't be "infinity"
    const [holders, events, deposits, principal, links, tg, refs, badges, flyWallets, flybook] = await Promise.all([
      pg.all<HolderRow>("select wallet, liquid::text, staked::text, locked::text, flies, at, hold_xp, fly_xp, streak_since from mine.xp_holders"),
      pg.all<{ wallet: string; source: string; xp: number }>("select wallet, source, sum(xp)::float8 as xp from mine.xp_events where at <= ? group by 1, 2", endIso),
      pg.all<{ wallet: string; usd: number }>(`select lower(holder) as wallet, sum(usd)::float8 as usd from mine.vault_moves
        where kind in ('deposit', 'sol_deposit') and holder is not null and usd >= ? and at <= ? group by 1`, RATES.depositMinUsd, endIso).catch(() => []),
      // what is still in: the fly wallets' principal, plus a fly's Solana principal (2026-11-08, the user: flies trading
      // only on Solana didn't count - their deposits are 'sol_deposit' and their principal isn't on the ledger)
      pg.all<{ wallet: string; usd: number }>(`select wallet, sum(usd)::float8 as usd from (
          select lower(holder) as wallet, principal_usd as usd from mine.vault_ledger where holder is not null
          union all select lower(value->>'holder'), coalesce((value->>'principal')::float8, 0) from mine.vault_public
            where key like 'vault:solana:%' and value->>'holder' is not null) x group by 1`).catch(() => []),
      pg.all<{ wallet: string; linked_at_ms: string }>("select wallet, linked_at_ms::text from mine.x_links").catch(() => []),
      pg.all<{ wallet: string }>("select wallet from mine.tg_links where member").catch(() => []),
      pg.all<{ wallet: string; referrer: string }>("select wallet, referrer from mine.referrals where qualified_at is not null and qualified_at <= ?", endIso).catch(() => []),
      pg.all<{ wallet: string; badge: number }>("select wallet, badge::int as badge from mine.badge_claims").catch(() => []),
      pg.all<{ address: string }>("select lower(address) as address from mine.vault_wallets").catch(() => []),
      pg.all<{ wallet: string; days: number }>(`select lower(p.wallet) as wallet, count(distinct a.d)::int as days from (
          select user_id, created_at::date as d from public.likes where not auto
          union all select user_id, created_at::date from public.comments
          union all select user_id, created_at::date from public.pokes
          union all select author, created_at::date from public.captions
        ) a join public.profiles p on p.id = a.user_id where p.wallet is not null and a.d <= ?::date group by 1`, endIso).catch(() => []),
    ]);
    const rows = new Map<string, Row>();
    const row = (w: string) => rows.get(w) ?? rows.set(w, { wallet: w, xp: 0, level: 0, sources: {}, flies: 0, active: false, streakWeeks: 0 }).get(w)!;
    const add = (w: string, source: string, xp: number) => { if (xp > 0) { const r = row(w); r.sources[source] = (r.sources[source] ?? 0) + xp; } };
    for (const hr of holders) {
      const h = asOf(fromRow(hr), t, cfg.end);
      add(hr.wallet, "hold", h.hold);
      add(hr.wallet, "flies", h.fly);
      if (h.flies > 0 || h.liquid + h.staked + h.locked > 0n) {
        const r = row(hr.wallet);
        r.flies = h.flies;
        r.active = h.liquid + h.staked + h.locked >= RATES.activeAt;
        r.streakWeeks = h.streak === null ? 0 : Math.floor((t - h.streak) / WEEK_MS);
      }
    }
    for (const e of events) add(e.wallet, e.source, e.xp);
    const kept = new Map(principal.map((p) => [p.wallet, p.usd]));
    for (const dep of deposits) add(dep.wallet, "deposits", depositXp(dep.usd, kept.get(dep.wallet) ?? 0));
    for (const l of links) if (Number(l.linked_at_ms) <= cfg.end) add(l.wallet, "x", RATES.xConnect);
    for (const g of tg) add(g.wallet, "telegram", RATES.tgMember);
    const held = new Map<number, number>(), mineBadges = new Map<string, number[]>();
    for (const b of badges) {
      held.set(b.badge, (held.get(b.badge) ?? 0) + 1);
      (mineBadges.get(b.wallet) ?? mineBadges.set(b.wallet, []).get(b.wallet)!).push(b.badge);
    }
    const badgeWallets = mineBadges.size;
    for (const [w, ids] of mineBadges) add(w, "badges", badgeXp(ids, held, badgeWallets));
    // Flybook days only for wallets that hold or own a fly: the free part can't earn on its own
    for (const f of flybook) if (rows.get(f.wallet)?.sources.hold || rows.get(f.wallet)?.flies) add(f.wallet, "flybook", f.days * RATES.flybookDay);
    const base = (w: string) => Object.entries(rows.get(w)?.sources ?? {}).reduce((s, [k, v]) => (k === "referrals" ? s : s + v), 0);
    const boost = new Map<string, number>();
    for (const r of refs) boost.set(r.referrer, (boost.get(r.referrer) ?? 0) + base(r.wallet) * RATES.referral);
    for (const [w, xp] of boost) add(w, "referrals", xp);
    // 2x windows: the bonus (unless a sell took it back) and the doubled losses; after referrals, so neither moves them
    const windows = await boostWindows(t, endIso ?? "9999-12-31T00:00:00.000Z", new Map(deposits.map((dep) => [dep.wallet, dep.usd])), kept);
    for (const [w, list] of windows) {
      add(w, "boost", list.reduce((s, x) => s + x.bonus, 0));
      const pen = list.reduce((s, x) => s + x.penalty, 0);
      if (pen > 0) { const r = row(w); r.sources.penalty = (r.sources.penalty ?? 0) - pen; }
    }
    for (const r of rows.values()) {
      for (const k of Object.keys(r.sources)) r.sources[k] = Math.round(r.sources[k]);
      r.xp = Math.max(0, Object.values(r.sources).reduce((s, v) => s + v, 0));
      r.level = levelOf(r.xp);
    }
    // re-read each time: the process that serves the board isn't always the one that ticks and classifies
    contracts = { ...(contracts ?? {}), ...((await getState<Record<string, boolean>>(pg, "contracts")) ?? {}) };
    const off = new Set([...cfg.exclude, ...Object.keys(contracts).filter((w) => contracts![w]), ...flyWallets.map((f) => f.address), cfg.staking, cfg.lock, cfg.distributor, cfg.fly, cfg.market,
      cfg.breeder, cfg.pass, ...POOLS]);
    const ranked = [...rows.values()].filter((r) => r.xp > 0 && !off.has(r.wallet)).sort((a, b) => b.xp - a.xp || a.wallet.localeCompare(b.wallet));
    cache = { at: now(), rows, ranked, windows };
    return cache;
  }

  type WindowResult = ReturnType<typeof boostResult> & { id: number; from: number; to: number; mult: number };
  /** Every started window's result for each wallet it touched. */
  async function boostWindows(t: number, endIso: string, depositsAll: Map<string, number>, kept: Map<string, number>) {
    const out = new Map<string, WindowResult[]>();
    const boosts = ((await getState<Boost[]>(pg, "boosts")) ?? []).filter((b) => b.from <= t && b.from < cfg.end);
    if (!boosts.length) return out;
    const sells = (await getState<Sell[]>(pg, "boost_sells")) ?? [];
    for (const b of boosts) {
      const to = Math.min(b.to, t, cfg.end), fromIso = iso(b.from)!, toIso = iso(to)!;
      const [gained, deps, wds] = await Promise.all([
        pg.all<{ wallet: string; xp: number }>(`select wallet, sum(xp)::float8 as xp from mine.xp_events
          where at >= ? and at < ? and at <= ? and xp > 0 and source = any(?::text[]) group by 1`, fromIso, toIso, endIso, `{${BOOST_SOURCES.join(",")}}`),
        pg.all<{ wallet: string; usd: number }>(`select lower(holder) as wallet, sum(usd)::float8 as usd from mine.vault_moves
          where kind in ('deposit', 'sol_deposit') and holder is not null and usd >= ? and at >= ? and at < ? group by 1`, RATES.depositMinUsd, fromIso, toIso).catch(() => []),
        pg.all<{ wallet: string; usd: number }>(`select lower(holder) as wallet, sum(usd)::float8 as usd from mine.vault_moves
          where kind in ('withdraw', 'sol_withdraw') and holder is not null and at >= ? and at < ? group by 1`, fromIso, toIso).catch(() => []),
      ]);
      const per = new Map<string, { gained: number; deposited: number; sold: number; soldAfter: boolean; withdrawn: number }>();
      const p = (w: string) => per.get(w) ?? per.set(w, { gained: 0, deposited: 0, sold: 0, soldAfter: false, withdrawn: 0 }).get(w)!;
      for (const g of gained) p(g.wallet).gained += g.xp;
      for (const dep of deps) p(dep.wallet).deposited += Math.min(dep.usd, kept.get(dep.wallet) ?? 0);
      for (const w of wds) p(w.wallet).withdrawn += w.usd;
      for (const s of sells) {
        if (s.at >= b.from && s.at < to) p(s.wallet).sold += s.xp;
        else if (s.at >= b.to && s.at < b.to + CLAWBACK_MS && s.at <= t && per.has(s.wallet)) p(s.wallet).soldAfter = true;
      }
      for (const [w, x] of per) {
        const r = boostResult(b, { ...x, depositsAll: depositsAll.get(w) ?? 0 });
        if (r.raw > 0 || r.penalty > 0) (out.get(w) ?? out.set(w, []).get(w)!).push({ ...r, id: b.id, from: b.from, to: b.to, mult: b.mult });
      }
    }
    return out;
  }

  // ---- the windows themselves: the admin sets them, everyone sees the live and the next one ----
  async function boostsNow() {
    const all = ((await getState<Boost[]>(pg, "boosts")) ?? []).sort((a, b) => a.from - b.from);
    const t = now();
    const view = (b: Boost) => ({ id: b.id, from: iso(b.from), to: iso(b.to), mult: b.mult, note: b.note ?? null });
    const live = all.find((b) => b.from <= t && t < b.to) ?? null;
    const next = all.find((b) => b.from > t) ?? null;
    return { on: cfg.on, live: live ? view(live) : null, next: next ? view(next) : null, clawback_days: CLAWBACK_MS / DAY_MS,
      sources: BOOST_SOURCES, all: all.map(view) };
  }
  async function boostPublic() {
    const { all: _all, ...pub } = await boostsNow();
    return pub;
  }
  async function isAdmin(req: IncomingMessage) {
    if (d.adminOnly) { try { d.adminOnly(req); return true; } catch { /* a wallet then */ } }
    const admins = new Set((d.admins ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean));
    if (!admins.size) return false;
    try { return admins.has((await d.sessionWallet(req)).toLowerCase()); } catch { return false; }
  }
  /** { from, to, mult, note } adds one; { id, delete: true } removes one not started; { id, end: true } ends a live one now. */
  async function setBoost(body: any) {
    const all = (await getState<Boost[]>(pg, "boosts")) ?? [];
    const t = now();
    const id = Number(body?.id);
    if (Number.isInteger(id) && (body?.delete || body?.end)) {
      const b = all.find((x) => x.id === id);
      if (!b) throw new HttpError(404, "no window with that id");
      if (body.delete) {
        if (b.from <= t) throw new HttpError(400, "it has started: end it instead (its XP stays)");
        await setState(pg, "boosts", all.filter((x) => x.id !== id));
      } else {
        if (!(b.from <= t && t < b.to)) throw new HttpError(400, "only a live window can be ended");
        b.to = t;
        await setState(pg, "boosts", all);
      }
      cache = null;
      return boostsNow();
    }
    const from = Date.parse(String(body?.from ?? "")), to = Date.parse(String(body?.to ?? "")), mult = Number(body?.mult ?? 2);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new HttpError(400, "from and to: ISO times, to after from");
    if (from < t - 60_000) throw new HttpError(400, "a window can't start in the past");
    if (to - from > BOOST_LIMITS.maxMs) throw new HttpError(400, "7 days at most");
    if (!(mult >= BOOST_LIMITS.minMult && mult <= BOOST_LIMITS.maxMult)) throw new HttpError(400, `mult between ${BOOST_LIMITS.minMult} and ${BOOST_LIMITS.maxMult}`);
    if (all.some((b) => from < b.to + CLAWBACK_MS && b.from < to + CLAWBACK_MS)) throw new HttpError(400, "too close to another window (each needs its 3 claw-back days clear)");
    const b: Boost = { id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1, from, to, mult, note: body?.note ? String(body.note).slice(0, 120) : null };
    await setState(pg, "boosts", [...all, b]);
    return boostsNow();
  }
  /** A bell note to everyone on the board when a window opens (once). */
  async function boostNotes() {
    const live = (await boostsNow()).live;
    if (!live) return;
    const noted = (await getState<number[]>(pg, "boost_noted")) ?? [];
    if (noted.includes(live.id)) return;
    await setState(pg, "boost_noted", [...noted, live.id]);
    const c = await compute();
    const hours = Math.round((Date.parse(live.to!) - now()) / 3_600_000);
    const text = `${live.mult}x XP is on for the next ${hours} h: swap-box buys, fly wallet deposits, feeding, marketplace trades, breeding and pass burns count ${live.mult}x. Sells and withdrawals cost ${live.mult}x too, and a sell within 3 days after takes the bonus back.`;
    for (let i = 0; i < c.ranked.length; i += 500) {
      const part = c.ranked.slice(i, i + 500).map((r) => ({ wallet: r.wallet, text, href: "/xp" }));
      await pg.run(`insert into mine.notices (wallet, text, href) select wallet, text, href from jsonb_to_recordset(?::text::jsonb)
        as r(wallet text, text text, href text)`, JSON.stringify(part));
    }
  }

  /** Which wallets on the board are contracts: the unknown ones with the most XP first, a few hundred a tick. */
  let contracts: Record<string, boolean> | null = null;
  async function classify(max = 300) {
    contracts ??= (await getState<Record<string, boolean>>(pg, "contracts")) ?? {};
    const c = await compute();
    const todo = [...c.rows.values()].filter((r) => r.xp > 0 && contracts![r.wallet] === undefined).sort((a, b) => b.xp - a.xp).slice(0, max);
    if (!todo.length) return;
    for (const r of todo) {
      try { contracts[r.wallet] = await chain.isContract(r.wallet); } catch { break; }   // the RPC is busy: the rest next tick
    }
    await setState(pg, "contracts", contracts);
    cache = null;
  }

  const LABELS: Record<string, string> = { bug: "a bug you found", market: "a marketplace trade", buy: "a swap-box buy", breed: "breeding", feed: "feeding the Fly Desk",
    claimstake: "claim and stake", passburn: "a FlightPass burn", share: "your X post", checkin: "your daily check-in", quest: "daily quests" };
  /** small daily XP that the bell doesn't announce one by one (src/quests.ts sends its own note on streak milestones) */
  const QUIET = ["checkin", "quest"];
  /** Level-ups and new one-off XP into the bell. The first run only remembers where everyone is. */
  async function notify() {
    const c = await compute();
    const levels = (await getState<Record<string, number>>(pg, "levels")) ?? null;
    const lastEvent = (await getState<number>(pg, "notified_event")) ?? 0;
    const top = await pg.one<{ id: number }>("select coalesce(max(id), 0)::int as id from mine.xp_events");
    const now = Object.fromEntries(c.ranked.map((r) => [r.wallet, r.level]));
    if (levels) {
      const notes: [string, string][] = [];
      for (const r of c.ranked) if (r.level > (levels[r.wallet] ?? 0) && r.level > 0) notes.push([r.wallet, `You reached XP level ${r.level} (${Math.round(r.xp).toLocaleString("en-US")} XP).`]);
      const fresh = await pg.all<{ wallet: string; xp: number; sources: string[] }>(`select wallet, sum(xp)::float8 as xp, array_agg(distinct source) as sources
        from mine.xp_events where id > ? and id <= ? and source <> all(?::text[]) group by wallet`, lastEvent, top?.id ?? 0, `{${QUIET.join(",")}}`);
      const ranked = new Set(c.ranked.map((r) => r.wallet));
      for (const f of fresh) {
        if (!ranked.has(f.wallet) || f.xp < 1) continue;
        notes.push([f.wallet, `+${Math.round(f.xp).toLocaleString("en-US")} XP from ${f.sources.map((x) => LABELS[x] ?? x).join(", ")}.`]);
      }
      for (const [wallet, text] of notes) await pg.run("insert into mine.notices (wallet, text, href) values (?, ?, ?)", wallet, text, "/xp");
    }
    await setState(pg, "levels", now);
    await setState(pg, "notified_event", top?.id ?? 0);
  }

  /** Today's totals for every wallet with XP: the log's daily rows (UTC days; rewritten each tick, so the last one stands). */
  async function snapshot() {
    const c = await compute();
    const day = new Date(Math.min(now(), cfg.end)).toISOString().slice(0, 10);
    const rows = [...c.rows.values()].filter((r) => r.xp > 0).map((r) => ({ wallet: r.wallet, day, sources: r.sources }));
    for (let i = 0; i < rows.length; i += 500) {
      await pg.run(`insert into mine.xp_days (wallet, day, sources) select wallet, day, sources from jsonb_to_recordset(?::text::jsonb)
        as r(wallet text, day date, sources jsonb) on conflict (wallet, day) do update set sources = excluded.sources`, JSON.stringify(rows.slice(i, i + 500)));
    }
  }

  /** What a wallet earned, newest first: events one by one, the rest by the day. */
  async function log(wallet: string, limit = 60) {
    if (!cfg.on) return { on: false };
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new HttpError(400, "bad wallet");
    const [events, days] = await Promise.all([
      pg.all<{ source: string; ref: string; xp: number; at: Date }>("select source, ref, xp, at from mine.xp_events where wallet = ? order by at desc, id desc limit ?", wallet, limit),
      pg.all<{ day: string; sources: Sources }>("select to_char(day, 'YYYY-MM-DD') as day, sources from mine.xp_days where wallet = ? order by day", wallet),
    ]);
    const boosts = (await getState<Boost[]>(pg, "boosts")) ?? [];
    const multAt = (source: string, at: number) => (BOOST_SOURCES.includes(source) ? boosts.find((b) => at >= b.from && at < b.to)?.mult ?? null : null);
    const items = [
      ...events.map((e) => ({ at: new Date(e.at).toISOString(), source: e.source, xp: Math.round(e.xp), boost: multAt(e.source, new Date(e.at).getTime()),
        tx: /^0x[0-9a-f]{64}:/.test(e.ref) ? e.ref.split(":")[0] : null, post: e.ref.startsWith("x:") ? e.ref.slice(2) : null })),
      ...dailyGains(days).flatMap((d) => Object.entries(d.sources).map(([source, xp]) => ({
        at: `${d.day}T23:59:59.000Z`, day: d.day, source, xp, before: d.first }))),
    ].sort((a, b) => b.at.localeCompare(a.at) || b.xp - a.xp).slice(0, limit);
    return { on: true, wallet, items };
  }

  // ---- giveaway rounds: XP earned inside a round = XP now minus XP when it began ----
  type RoundRow = { id: number; starts_at: Date; ends_at: Date; results: { rank: number; wallet: string; gain: number }[] | null;
    winners: { wallet: string; reward: string }[] | null; note: string | null };
  async function openRound(id: number, starts: number, ends: number, c: Awaited<ReturnType<typeof compute>>) {
    await pg.run("insert into mine.xp_rounds (id, starts_at, ends_at) values (?, ?, ?) on conflict (id) do nothing", id, iso(starts), iso(ends));
    const base = [...c.rows.values()].filter((r) => r.xp > 0).map((r) => ({ round_id: id, wallet: r.wallet, xp: r.xp }));
    for (let i = 0; i < base.length; i += 500) {
      await pg.run(`insert into mine.xp_round_base (round_id, wallet, xp) select round_id, wallet, xp from jsonb_to_recordset(?::text::jsonb)
        as r(round_id int, wallet text, xp float8) on conflict do nothing`, JSON.stringify(base.slice(i, i + 500)));
    }
  }
  /** The round's standings: ranked wallets by XP earned since its start (team, contracts and fly wallets already out). */
  async function standings(id: number) {
    const c = await compute();
    const base = new Map((await pg.all<{ wallet: string; xp: number }>("select wallet, xp from mine.xp_round_base where round_id = ?", id)).map((b) => [b.wallet, b.xp]));
    return c.ranked.map((r) => ({ wallet: r.wallet, level: r.level, gain: Math.round(r.xp - (base.get(r.wallet) ?? 0)) }))
      .filter((r) => r.gain > 0).sort((a, b) => b.gain - a.gain || a.wallet.localeCompare(b.wallet))
      .map((r, i) => ({ rank: i + 1, ...r }));
  }
  /** The first round opens on the first tick; an ended one is frozen and the next opens where it ended. */
  async function rounds() {
    const t = now();
    const cur = await pg.one<RoundRow>("select id, starts_at, ends_at, results, winners, note from mine.xp_rounds order by id desc limit 1");
    if (!cur) {
      if (cfg.roundFirstEnd > t) await openRound(1, t, Math.min(cfg.roundFirstEnd, cfg.end), await compute());
      return;
    }
    const ends = new Date(cur.ends_at).getTime();
    if (t < ends || cur.results) return;
    const final = (await standings(cur.id)).slice(0, 50).map(({ rank, wallet, gain }) => ({ rank, wallet, gain }));
    await pg.run("update mine.xp_rounds set results = ?::text::jsonb where id = ?", JSON.stringify(final), cur.id);
    if (ends < cfg.end) await openRound(cur.id + 1, ends, Math.min(ends + cfg.roundDays * DAY_MS, cfg.end), await compute());
  }
  async function round(wallet: string | null) {
    if (!cfg.on) return { on: false };
    const cur = await pg.one<RoundRow>("select id, starts_at, ends_at, results, winners, note from mine.xp_rounds where results is null order by id desc limit 1");
    if (!cur) return { on: true, round: null, total: 0, rows: [], me: null };
    const all = await standings(cur.id);
    const top = all.slice(0, BOARD_SIZE);
    const mine = wallet ? all.find((r) => r.wallet === wallet) ?? null : null;
    const who = await names([...top.map((r) => r.wallet), ...(mine ? [mine.wallet] : [])]);
    const view = (r: (typeof all)[number]) => ({ rank: r.rank, wallet: r.wallet, nickname: who.get(r.wallet)?.nickname ?? null, x: who.get(r.wallet)?.x ?? null,
      avatar: who.get(r.wallet)?.avatar ?? null, gain: r.gain, level: r.level });
    return { on: true, round: { id: cur.id, starts: iso(new Date(cur.starts_at).getTime()), ends: iso(new Date(cur.ends_at).getTime()) },
      total: all.length, rows: top.map(view), me: mine ? view(mine) : null };
  }
  async function history() {
    if (!cfg.on) return { on: false };
    const past = await pg.all<RoundRow>("select id, starts_at, ends_at, results, winners, note from mine.xp_rounds where results is not null order by id desc limit 26");
    const wallets = [...new Set(past.flatMap((r) => [...(r.winners ?? []).map((w) => w.wallet), ...(r.results ?? []).slice(0, 10).map((w) => w.wallet)]))];
    const who = await names(wallets);
    const person = (w: string) => ({ wallet: w, nickname: who.get(w)?.nickname ?? null, x: who.get(w)?.x ?? null, avatar: who.get(w)?.avatar ?? null });
    return { on: true, rounds: past.map((r) => {
      const gainOf = new Map((r.results ?? []).map((x) => [x.wallet, x]));
      return { id: r.id, starts: iso(new Date(r.starts_at).getTime()), ends: iso(new Date(r.ends_at).getTime()), note: r.note,
        winners: (r.winners ?? []).map((w) => ({ ...person(w.wallet), reward: w.reward, rank: gainOf.get(w.wallet)?.rank ?? null, gain: gainOf.get(w.wallet)?.gain ?? null })),
        top: (r.results ?? []).slice(0, 10).map((x) => ({ ...person(x.wallet), rank: x.rank, gain: x.gain })) };
    }) };
  }
  /** The team's rewards for an ended round: [{ wallet, reward }] in the order to show, and a note. */
  async function setRewards(body: any) {
    const id = Number(body?.id);
    const winners = Array.isArray(body?.winners) ? body.winners : null;
    if (!Number.isInteger(id) || !winners) throw new HttpError(400, "id and winners: [{ wallet, reward }]");
    const clean = winners.map((w: any) => ({ wallet: String(w?.wallet ?? "").toLowerCase(), reward: String(w?.reward ?? "").slice(0, 120) }));
    if (clean.some((w: { wallet: string; reward: string }) => !/^0x[0-9a-f]{40}$/.test(w.wallet) || !w.reward)) throw new HttpError(400, "each winner needs a wallet and a reward");
    const n = await pg.run("update mine.xp_rounds set winners = ?::text::jsonb, note = ? where id = ? and results is not null",
      JSON.stringify(clean), body?.note ? String(body.note).slice(0, 400) : null, id);
    if (!n) throw new HttpError(404, "no ended round with that id");
    return { ok: true, id, winners: clean.length };
  }

  const season = () => ({ start: iso(cfg.start), over: now() >= cfg.end });   // no end date: it isn't public
  async function names(wallets: string[]) {
    if (!wallets.length) return new Map<string, { nickname: string | null; x: string | null; avatar: string | null }>();
    const list = `{${wallets.join(",")}}`;
    const [nicks, xs] = await Promise.all([
      pg.all<{ wallet: string; nickname: string }>("select wallet, nickname from mine.profiles where wallet = any(?::text[])", list).catch(() => []),
      pg.all<{ wallet: string; username: string; avatar: string | null }>("select wallet, username, avatar from mine.x_links where wallet = any(?::text[])", list).catch(() => []),
    ]);
    const n = new Map(nicks.map((r) => [r.wallet, r.nickname])), x = new Map(xs.map((r) => [r.wallet, r]));
    return new Map(wallets.map((w) => [w, { nickname: n.get(w) ?? null, x: x.get(w)?.username ?? null, avatar: x.get(w)?.avatar ?? null }]));
  }
  const brief = (r: Row, rank: number, who: { nickname: string | null; x: string | null; avatar: string | null } | undefined) =>
    ({ rank, wallet: r.wallet, nickname: who?.nickname ?? null, x: who?.x ?? null, avatar: who?.avatar ?? null, xp: r.xp, level: r.level });

  async function leaderboard(wallet: string | null) {
    if (!cfg.on) return { on: false };
    const c = await compute();
    const top = c.ranked.slice(0, BOARD_SIZE);
    const meIdx = wallet ? c.ranked.findIndex((r) => r.wallet === wallet) : -1;
    const who = await names([...top.map((r) => r.wallet), ...(meIdx >= 0 ? [wallet!] : [])]);
    return { on: true, season: season(), total: c.ranked.length, rows: top.map((r, i) => brief(r, i + 1, who.get(r.wallet))),
      me: meIdx >= 0 ? brief(c.ranked[meIdx], meIdx + 1, who.get(wallet!)) : null };
  }

  async function profile(wallet: string) {
    if (!cfg.on) return { on: false };
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new HttpError(400, "bad wallet");
    const c = await compute();
    const r = c.rows.get(wallet) ?? { wallet, xp: 0, level: 0, sources: {}, flies: 0, active: false, streakWeeks: 0 };
    const rank = c.ranked.findIndex((x) => x.wallet === wallet);
    const [who, badges, code, share] = await Promise.all([
      names([wallet]),
      pg.all<{ badge: number }>("select badge::int as badge from mine.badge_claims where wallet = ? order by badge", wallet).catch(() => []),
      pg.one<{ code: string }>("select code from mine.ref_codes where wallet = ?", wallet).catch(() => undefined),
      pg.one<{ n: number }>("select count(*)::int as n from mine.xp_events where wallet = ? and source = 'share' and at >= ?", wallet, dayStart()),
    ]);
    const w = who.get(wallet);
    return { on: true, season: season(), wallet, nickname: w?.nickname ?? null, x: w?.x ?? null, avatar: w?.avatar ?? null,
      xp: r.xp, level: r.level, next: levelXp(r.level + 1), rank: rank >= 0 ? rank + 1 : null, of: c.ranked.length,
      sources: r.sources, flies: r.flies, active: r.active, streak_weeks: r.streakWeeks,
      multiplier: Math.min(RATES.streakCap, 1 + RATES.streakPerWeek * r.streakWeeks),
      badges: badges.map((b) => b.badge), ref_code: code?.code ?? null, shared_today: (share?.n ?? 0) > 0,
      boosts: (c.windows.get(wallet) ?? []).map((x) => ({ id: x.id, from: iso(x.from), to: iso(x.to), mult: x.mult,
        bonus: Math.round(x.bonus), penalty: Math.round(x.penalty), forfeited: x.forfeited })),
      team: cfg.exclude.includes(wallet) };
  }

  /**
   * Once a UTC day, from 02:00: the posts that mention fly.ai since yesterday, matched to linked X accounts (no pasting).
   * Yesterday too, so a post from late the day before isn't missed; a post already booked is skipped by its ref.
   */
  async function shares() {
    if (!search || now() >= cfg.end + DAY_MS) return;
    const today = new Date(now()).toISOString().slice(0, 10);
    if (new Date(now()).getUTCHours() < 2 || (await getState<string>(pg, "shares_day")) === today) return;
    const since = new Date(now() - DAY_MS).toISOString().slice(0, 10);
    const posts = await search(since);
    const [links, paid] = await Promise.all([
      pg.all<{ wallet: string; username: string; linked_at_ms: number }>("select wallet, username, linked_at_ms::float8 as linked_at_ms from mine.x_links"),
      pg.all<{ wallet: string; day: string }>("select wallet, to_char(at at time zone 'UTC', 'YYYY-MM-DD') as day from mine.xp_events where source = 'share' and at >= ?", `${since}T00:00:00Z`),
    ]);
    const events = sharesFrom(posts, links, new Set(paid.map((p) => `${p.wallet}:${p.day}`)), cfg.end);
    if (events.length) {
      await pg.run(`insert into mine.xp_events (wallet, source, ref, xp, at)
        select wallet, source, ref, xp, at from jsonb_to_recordset(?::text::jsonb) as r(wallet text, source text, ref text, xp float8, at timestamptz)
        on conflict (ref) do nothing`, JSON.stringify(events.map((e) => ({ ...e, at: iso(e.at) }))));
      cache = null;
    }
    await setState(pg, "shares_day", today);
    console.log(`xp shares: ${posts.length} posts, ${events.length} counted`);
  }

  // ---- XP for bug finds: an admin gives it by hand (2026-11-08) ----
  async function bugGrants() {
    const rows = await pg.all<{ id: number; wallet: string; xp: number; note: string | null; by_wallet: string | null; at: Date }>(
      "select id::int as id, wallet, xp, note, by_wallet, at from mine.xp_events where source = 'bug' order by id desc limit 200");
    return { grants: rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() })), max: BUG_MAX_XP };
  }
  async function grantBug(req: IncomingMessage, body: any) {
    let by: string | null = null;
    try { by = (await d.sessionWallet(req)).toLowerCase(); } catch { /* the admin token */ }
    const id = Number(body?.remove);
    if (Number.isInteger(id) && id > 0) {                 // a grant given by mistake (its bell note, if sent, stays)
      const gone = await pg.one<{ id: number }>("delete from mine.xp_events where id = ? and source = 'bug' returning id::int as id", id);
      if (!gone) throw new HttpError(404, "no bug grant with that id");
      cache = null;
      return bugGrants();
    }
    const wallet = String(body?.wallet ?? "").trim().toLowerCase(), xp = Number(body?.xp);
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new HttpError(400, "wallet: a 0x address");
    if (!Number.isInteger(xp) || xp < 1 || xp > BUG_MAX_XP) throw new HttpError(400, `xp: a whole number from 1 to ${BUG_MAX_XP}`);
    const note = body?.note ? String(body.note).slice(0, 300) : null;
    await pg.run("insert into mine.xp_events (wallet, source, ref, xp, at, note, by_wallet) values (?, 'bug', ?, ?, ?, ?, ?)",
      wallet, `bug:${(await import("node:crypto")).randomUUID()}`, xp, iso(now()), note, by);
    cache = null;
    return bugGrants();
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const w = (url.searchParams.get("wallet") ?? "").toLowerCase();
    if (req.method === "GET" && p === "/api/xp/leaderboard") return d.send(res, 200, await leaderboard(/^0x[0-9a-f]{40}$/.test(w) ? w : null)), true;
    if (req.method === "GET" && p === "/api/xp/profile") return d.send(res, 200, await profile(w)), true;
    if (req.method === "GET" && p === "/api/xp/log") return d.send(res, 200, await log(w)), true;
    if (req.method === "GET" && p === "/api/xp/round") return d.send(res, 200, await round(/^0x[0-9a-f]{40}$/.test(w) ? w : null)), true;
    if (req.method === "GET" && p === "/api/xp/rounds") return d.send(res, 200, await history()), true;
    if (req.method === "POST" && p === "/api/admin/xp/round") {
      if (!d.adminOnly) throw new HttpError(403, "admin only");
      d.adminOnly(req);
      return d.send(res, 200, await setRewards(await d.readJson(req))), true;
    }
    if (req.method === "GET" && p === "/api/xp/boost") return d.send(res, 200, await boostPublic()), true;
    if (p === "/api/admin/xp/boost" && (req.method === "GET" || req.method === "POST")) {
      if (!(await isAdmin(req))) throw new HttpError(403, "admins only");
      return d.send(res, 200, req.method === "GET" ? await boostsNow() : await setBoost(await d.readJson(req))), true;
    }
    if (p === "/api/admin/xp/bug" && (req.method === "GET" || req.method === "POST")) {
      if (!(await isAdmin(req))) throw new HttpError(403, "admins only");
      return d.send(res, 200, req.method === "GET" ? await bugGrants() : await grantBug(req, await d.readJson(req))), true;
    }
    if (req.method === "GET" && p === "/api/xp/me") return d.send(res, 200, await profile((await d.sessionWallet(req)).toLowerCase())), true;
    return false;
  }

  function start(everyMs = Number(process.env.XP_TICK_MS ?? 600_000)) {
    if (!cfg.on) return;
    setTimeout(tick, 45_000).unref();
    setInterval(tick, everyMs).unref();
  }

  return { route, start, tick, compute, leaderboard, profile, log, snapshot, notify, shares, rounds, round, history, setRewards,
    boostsNow, setBoost, boostNotes, isAdmin, bugGrants, grantBug };
}
