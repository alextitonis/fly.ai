/**
 * The Trader Flies market's trading leaderboard, scored on the server from Season 5 (2026-11-24, the user: "for next
 * season we add more checks in backend and also lower the rewards"; prizes 500k / 250k / 100k $FLYAI).
 *
 * Seasons 1-4 stay scored in the page (flytrade/web/src/Leaderboard.tsx) under the rules they ran with. From Season 5
 * this module scores them with the same rules (sales of at least MIN_TRADE in $FLYAI, a fly counts again only an hour
 * after its last counted sale, one sale counts for at most 4x the season's middle price, two wallets count together at
 * most twice, a fly passed between the same two counts once, team wallets left out) and two more checks, because
 * Season 4's top 3 traded almost only with wallets they had funded themselves (checked on chain 2026-11-24):
 *
 *   linked trades don't count  a sale between two LINKED wallets scores nothing for either. Two wallets are linked when
 *                              $FLYAI went directly from one to the other outside a market sale (ever), or when they
 *                              share a funding root: follow each wallet's first $FLYAI (not from a sale) back to who
 *                              sent it, up to ROOT_HOPS times, stopping at contracts, team wallets and busy senders
 *                              (wallets that sent $FLYAI to more than BUSY_MAX others: routers, solvers, exchanges;
 *                              a wallet that trades on the market itself is never "busy", whatever it sent).
 *   linked wallets win once    for the prize places, wallets with the same funding root are one player: only the best
 *                              of them takes a place, the next player moves up.
 *
 * Everything is read from Robinhood Chain (public RPC logs) and kept in memory: the sales, and each trader's incoming
 * $FLYAI transfers. A restart reads them again (a few minutes). One tick every TB_TICK_MS on the user process.
 *
 *   GET /api/tradeboard?season=N     (N = the season's index, 0 = Season 1; default the current one; from RULES_FROM)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { flyaiPrizesOn } from "./prizes.ts";

export const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
export const SEASON_ZERO = Date.UTC(2026, 8, 29);      // Season 1 starts Tuesday 2026-09-29 00:00 UTC
export const SEASON_MS = 14 * 86_400_000;
export const RULES_FROM = 4;                            // season index: Season 5 (2026-11-24) on
export const PRIZES = [500_000, 250_000, 100_000];
export const MIN_TRADE = 15_000;
export const FLY_COOLDOWN_MS = 3_600_000;
export const PRICE_CAP_X = 4;
export const PRICE_CAP_MIN = 100_000;
export const PAIR_MAX = 2;
export const ROOT_HOPS = 4;
export const BUSY_MAX = 60;
/** never ranked, and never a funding root (they pay prizes, refunds and promos to everyone) */
export const TEAM = new Set([
  "0x625862521777e19ad54ce6c7abed9ca54d6589ea",   // dev
  "0xae92d64584e7f8e54995c362eaa8d7949fac8b1b",   // the user's
  "0xcca1ad591f6fe7e40e382639ad2551044fae6d36",   // POOL
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);
export const MARKETS = [
  { market: "0x453ca65b1fb7d3760e265362c7705cc0276c27db", fromBlock: 72_989_622 },   // Trader Flies
  { market: "0x90f2be286adb12c7baa7e9fa2ada23ecf960fa08", fromBlock: 74_690_610 },   // FlightPasses
];
const TOKEN_FROM = 60_000_000;                          // before $FLYAI's first transfer on Robinhood Chain

const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export type Log = { blockNumber: string; transactionHash: string; logIndex: string; topics: string[]; data: string };
export type Chain = {
  head(): Promise<number>;
  blockTime(n: number): Promise<number>;                // seconds
  logs(q: { address: string; topics: (string | string[] | null)[]; from: number; to: number }): Promise<Log[]>;
  isContract(wallet: string): Promise<boolean>;
};

export type Sale = { tx: string; market: string; id: string; seller: string; buyer: string; amount: number; block: number; at: number };
export type Transfer = { from: string; to: string; tx: string; block: number };

export const seasonOf = (ms: number) => Math.floor((ms - SEASON_ZERO) / SEASON_MS);
export const seasonStart = (s: number) => SEASON_ZERO + s * SEASON_MS;

/** The most one sale counts for in a season: PRICE_CAP_X times its middle counting sale, at least PRICE_CAP_MIN. */
export function priceCap(sales: Sale[]): number {
  const xs = sales.filter((x) => x.buyer !== x.seller && x.amount >= MIN_TRADE).map((x) => x.amount).sort((a, b) => a - b);
  if (!xs.length) return PRICE_CAP_MIN;
  const m = xs.length >> 1;
  return Math.max(PRICE_CAP_MIN, PRICE_CAP_X * (xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2));
}

export type Row = { wallet: string; points: number; trades: number; root: string };
/**
 * One season's board. `linked(a, b)` says whether two wallets are linked; `root(w)` is a wallet's funding root.
 * Returns every wallet's points, the prize places (one per funding root), the cap and how many sales were dropped.
 */
export function score(sales: Sale[], season: number, linked: (a: string, b: string) => boolean, root: (w: string) => string) {
  const inSeason = sales.filter((x) => seasonOf(x.at) === season).sort((a, b) => a.at - b.at || a.block - b.block);
  const cap = priceCap(inSeason);
  const pairCount = new Map<string, number>(), pairFly = new Set<string>(), flyLast = new Map<string, number>();
  const pts = new Map<string, { points: number; trades: number }>();
  let droppedLinked = 0;
  for (const s of inSeason) {
    if (s.buyer === s.seller || s.amount < MIN_TRADE) continue;
    const pair = [s.buyer, s.seller].sort().join("|");
    const fly = `${s.market}|${s.id}`;
    if (pairFly.has(`${pair}|${fly}`) || (pairCount.get(pair) ?? 0) >= PAIR_MAX) continue;
    if (s.at - (flyLast.get(fly) ?? -Infinity) < FLY_COOLDOWN_MS) continue;
    if (linked(s.buyer, s.seller)) { droppedLinked++; continue; }
    pairFly.add(`${pair}|${fly}`);
    pairCount.set(pair, (pairCount.get(pair) ?? 0) + 1);
    flyLast.set(fly, s.at);
    const counted = Math.min(s.amount, cap);
    for (const w of [s.buyer, s.seller]) {
      if (TEAM.has(w)) continue;
      const p = pts.get(w) ?? { points: 0, trades: 0 };
      pts.set(w, { points: p.points + counted, trades: p.trades + 1 });
    }
  }
  const rows: Row[] = [...pts].map(([wallet, v]) => ({ wallet, ...v, root: root(wallet) }))
    .sort((a, b) => b.points - a.points || (a.wallet < b.wallet ? -1 : 1));
  const places: string[] = [], roots = new Set<string>();
  for (const r of rows) {
    if (places.length >= PRIZES.length) break;
    if (roots.has(r.root)) continue;
    roots.add(r.root);
    places.push(r.wallet);
  }
  return { rows, places, cap, sales: inSeason.length, droppedLinked };
}

const topic = (sig: string) => `0x${Buffer.from(keccak_256(Buffer.from(sig))).toString("hex")}`;
export const SIGS = {
  sold: topic("Sold(uint256,address,address,uint256,uint256)"),
  listedIn: topic("ListedIn(uint256,address)"),
  offer: topic("OfferAccepted(uint256,address,address,address,uint256,uint256)"),
  coll: topic("CollectionOfferAccepted(uint256,address,address,address,uint256,uint256)"),
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const word = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
const addr = (t: string) => `0x${t.slice(-40)}`.toLowerCase();

export function createTradeboard(d: {
  chain: Chain;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  markets?: { market: string; fromBlock: number }[];
  now?: () => number;
}) {
  const { chain, HttpError } = d;
  const sigs = SIGS;
  const markets = d.markets ?? MARKETS;
  const now = d.now ?? Date.now;
  const span = { logs: 2_000_000, wallet: 16_000_000 };   // a market's logs; one wallet's $FLYAI transfers (few, so wide)
  const sales: Sale[] = [];
  const saleTx = new Set<string>();
  const listed = new Map<string, { block: number; index: number; token: string }[]>();   // market|id -> ListedIn
  const pendingSold: { market: string; id: string; seller: string; buyer: string; amount: number; block: number; index: number; tx: string }[] = [];
  let salesUpTo = 0;
  const incoming = new Map<string, { list: Transfer[]; upTo: number }>();
  const contract = new Map<string, boolean>();
  const busy = new Map<string, boolean>();
  const blockMs = new Map<number, number>();
  let board: Record<number, ReturnType<typeof view>> = {};
  let updated = 0;

  /** logs over a block range, halving the span when the RPC refuses it */
  async function logsRange(address: string, topics: (string | string[] | null)[], from: number, to: number, first = span.logs): Promise<Log[]> {
    const out: Log[] = [];
    let s = from, step = first, busyTries = 0;
    while (s <= to) {
      const e = Math.min(s + step - 1, to);
      try { out.push(...await chain.logs({ address, topics, from: s, to: e })); s = e + 1; busyTries = 0; }
      catch (err) {
        // rate limited: wait and ask again; anything else (a span too big, too many results): a smaller span
        if (/too many|rate|429|limit exceeded/i.test(String((err as Error)?.message)) && busyTries++ < 6) { await sleep(1500 * busyTries); continue; }
        if (step <= 5_000) throw err;
        step = Math.floor(step / 4);
      }
    }
    return out;
  }
  const atMs = async (b: number) => {
    if (!blockMs.has(b)) blockMs.set(b, (await chain.blockTime(b)) * 1000);
    return blockMs.get(b)!;
  };

  /** new sales up to `head`: listings bought in $FLYAI (the token of the fly's latest ListedIn before it), offers */
  async function readSales(head: number) {
    for (const m of markets) {
      const from = Math.max(salesUpTo + 1, m.fromBlock);
      if (from > head) continue;
      // one after the other: the public RPC rate-limits parallel log reads
      const li = await logsRange(m.market, [sigs.listedIn], from, head);
      const so = await logsRange(m.market, [sigs.sold], from, head);
      const of = await logsRange(m.market, [sigs.offer], from, head);
      const co = await logsRange(m.market, [sigs.coll], from, head);
      for (const l of li) {
        const k = `${m.market}|${BigInt(l.topics[1])}`;
        if (!listed.has(k)) listed.set(k, []);
        listed.get(k)!.push({ block: parseInt(l.blockNumber, 16), index: parseInt(l.logIndex, 16), token: addr(l.data.slice(0, 66)) });
      }
      for (const l of so) pendingSold.push({ market: m.market, id: String(BigInt(l.topics[1])), seller: addr(l.topics[2]), buyer: addr(l.topics[3]),
        amount: Number(BigInt(l.data.slice(0, 66))) / 1e18, block: parseInt(l.blockNumber, 16), index: parseInt(l.logIndex, 16), tx: l.transactionHash });
      for (const l of [...of, ...co]) {
        saleTx.add(l.transactionHash.toLowerCase());
        if (addr(l.data.slice(0, 66)) !== FLYAI) continue;
        const b = parseInt(l.blockNumber, 16);
        sales.push({ tx: l.transactionHash.toLowerCase(), market: m.market, id: String(BigInt(l.topics[1])), seller: addr(l.topics[2]),
          buyer: addr(l.topics[3]), amount: Number(BigInt(`0x${l.data.slice(66, 130)}`)) / 1e18, block: b, at: await atMs(b) });
      }
    }
    // a listing's token: its latest ListedIn before the sale
    for (const s of pendingSold.splice(0)) {
      saleTx.add(s.tx.toLowerCase());
      const ls = listed.get(`${s.market}|${s.id}`) ?? [];
      let tk: string | null = null;
      for (const l of ls) if (l.block < s.block || (l.block === s.block && l.index < s.index)) tk = l.token;
      if (tk !== FLYAI) continue;
      sales.push({ tx: s.tx.toLowerCase(), market: s.market, id: s.id, seller: s.seller, buyer: s.buyer, amount: s.amount, block: s.block, at: await atMs(s.block) });
    }
    for (const x of sales) { traders.add(x.buyer); traders.add(x.seller); }
    salesUpTo = head;
  }

  /** a wallet's incoming $FLYAI transfers that weren't a market sale's payment */
  async function inOf(w: string, head: number): Promise<Transfer[]> {
    const c = incoming.get(w) ?? { list: [], upTo: TOKEN_FROM - 1 };
    if (c.upTo < head) {
      for (const l of await logsRange(FLYAI, [T_TRANSFER, null, word(w)], c.upTo + 1, head, span.wallet))
        c.list.push({ from: addr(l.topics[1]), to: w, tx: l.transactionHash.toLowerCase(), block: parseInt(l.blockNumber, 16) });
      c.upTo = head;
      incoming.set(w, c);
    }
    return c.list.filter((t) => !saleTx.has(t.tx) && t.from !== w);
  }
  async function isContract(w: string) {
    if (!contract.has(w)) contract.set(w, await chain.isContract(w));
    return contract.get(w)!;
  }
  /** sent $FLYAI to more than BUSY_MAX wallets: a router, solver or exchange, not a person's funding wallet */
  async function isBusy(w: string, head: number) {
    if (traders.has(w)) return false;   // a market trader funding wallets is a player, not a service (Season 4's ring)
    if (!busy.has(w)) {
      const to = new Set<string>();
      for (const l of await logsRange(FLYAI, [T_TRANSFER, word(w)], TOKEN_FROM, head, span.wallet)) {
        to.add(addr(l.topics[2]));
        if (to.size > BUSY_MAX) break;
      }
      busy.set(w, to.size > BUSY_MAX);
    }
    return busy.get(w)!;
  }
  const roots = new Map<string, string>();
  const traders = new Set<string>();   // every wallet in any $FLYAI sale on the markets
  async function rootOf(w: string, head: number): Promise<string> {
    let cur = w;
    for (let hop = 0; hop < ROOT_HOPS; hop++) {
      const first = (await inOf(cur, head)).sort((a, b) => a.block - b.block)[0];
      const f = first?.from;
      if (!f || TEAM.has(f) || await isContract(f) || await isBusy(f, head)) break;
      cur = f;
    }
    return cur;
  }

  async function season(s: number, head: number) {
    const inSeason = sales.filter((x) => seasonOf(x.at) === s);
    const wallets = [...new Set(inSeason.flatMap((x) => [x.buyer, x.seller]))].filter((w) => !TEAM.has(w));
    for (const w of wallets) roots.set(w, await rootOf(w, head));
    // families: the season's traders and their funding roots, joined by root and by any direct $FLYAI between two of
    // them (Season 4: 0xc3f1's root is itself, but it and 0x6439, root of most of its counterparties, sent each other
    // 11M directly). Only these wallets are joined, never everyone they touched (fly wallets and payout senders would
    // join the whole market).
    const nodes = new Set<string>([...wallets, ...wallets.map((w) => roots.get(w)!)]);
    const par = new Map<string, string>();
    const find = (a: string): string => { let x = a; while (par.has(x) && par.get(x) !== x) x = par.get(x)!; return x; };
    const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
    for (const w of wallets) join(w, roots.get(w)!);
    for (const n of nodes) for (const t of await inOf(n, head)) if (nodes.has(t.from) && !TEAM.has(t.from)) join(t.from, n);
    const linked = (a: string, b: string) => nodes.has(a) && nodes.has(b) && find(a) === find(b);
    return score(sales, s, linked, (w) => (nodes.has(w) ? find(w) : w));
  }

  function view(s: number, r: ReturnType<typeof score>) {
    const firstOf = new Map<string, string>();
    for (const row of r.rows) if (!firstOf.has(row.root)) firstOf.set(row.root, row.wallet);
    return {
      season: s, start: seasonStart(s), end: seasonStart(s) + SEASON_MS, prizes: flyaiPrizesOn() ? PRIZES : [], cap: r.cap, sales: r.sales,
      dropped_linked: r.droppedLinked, places: r.places,
      rows: r.rows.slice(0, 100).map((x) => ({ wallet: x.wallet, points: Math.round(x.points), trades: x.trades,
        linked: firstOf.get(x.root) !== x.wallet ? firstOf.get(x.root) : undefined })),
      rules: { min: MIN_TRADE, pair_max: PAIR_MAX, cooldown_h: FLY_COOLDOWN_MS / 3_600_000, cap_x: PRICE_CAP_X },
    };
  }

  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const head = await chain.head();
      await readSales(head);
      const cur = seasonOf(now());
      const next: typeof board = { ...board };
      // the current season every tick; the one just ended until it has been scored once after its end
      for (const s of [cur - 1, cur]) {
        if (s < RULES_FROM) continue;
        if (s < cur && board[s] && updated > seasonStart(s) + SEASON_MS + 600_000) continue;
        next[s] = view(s, await season(s, head));
      }
      board = next;
      updated = now();
    } catch (e) {
      console.error("tradeboard:", (e as Error).message);
    } finally {
      ticking = false;
    }
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET" || url.pathname !== "/api/tradeboard") return false;
    const q = url.searchParams.get("season");
    const s = q === null || q === "" ? seasonOf(now()) : Number(q);
    if (!Number.isInteger(s) || s < RULES_FROM) throw new HttpError(400, `season is ${RULES_FROM} or later (earlier seasons are scored in the page)`);
    const b = board[s];
    if (!b) throw new HttpError(503, "the board is still being read, try again in a minute");
    d.send(res, 200, { ...b, updated });
    return true;
  }

  function start(everyMs = Number(process.env.TB_TICK_MS ?? 600_000)) {
    setTimeout(tick, 20_000).unref();
    setInterval(tick, everyMs).unref();
  }

  return { route, start, tick, season, readSales, score: (s: number) => board[s] };
}
