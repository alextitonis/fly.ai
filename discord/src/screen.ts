// The alpha feed's scam filter (2026-10-16, the user: "they find some pretty good ones but need a basic filter to avoid
// scams, like zero liquidity and clustered/group wallets"). A token is posted only when:
//   pool        DexScreener shows real money in it: MIN_REAL_LIQ_USD on the paired side (USDG/ETH, not the token's own
//               side a one-sided launch pool is made of) and MIN_VOL_24H_USD traded in the last day
//   contract    GoPlus (what DexScreener's own audit tab shows; 2026-10-16, the user: "check the token contract ... if
//               the contract can freeze, mint, etc"): not a honeypot, sells and buys work, the code is verified, tax at
//               most MAX_TAX, and no owner who can still mint, freeze transfers, blacklist wallets, change balances or
//               the tax, take ownership back, upgrade the code or destroy it. A renounced owner (none, 0x0, dead) is
//               fine. A token GoPlus doesn't know yet counts as a failed read (asked again after RETRY_MS)
//   holders     Robinhood Chain: its Transfer logs (public RPC, free) give every balance. The ten biggest wallets
//               (pools and other contracts left out) hold at most MAX_TOP10, and wallets that look like one group hold
//               at most MAX_CLUSTER together: MIN_GROUP+ of the top wallets that got their first tokens in the same
//               block (a bundled launch), or that were all sent tokens by the same wallet (one owner spreading a bag)
// Other chains (Base/BNB/Arbitrum) get the pool and contract checks only, and so does a token whose history is too long to read
// (MAX_LOGS: a busy, older token, not the fresh rug this is for). Verdicts are kept VERDICT_MS; a read that fails is a
// "no" kept only RETRY_MS.
import { type Pair } from "./data.ts";

const MIN_REAL_LIQ_USD = 10_000, MIN_VOL_24H_USD = 1_000;   // $FLYAI itself: ~$19k paired, ~$1.1k/day
const MAX_TOP10 = 0.5, MAX_CLUSTER = 0.25, MIN_GROUP = 3, TOP_CHECKED = 25;
const VERDICT_MS = 30 * 60_000, RETRY_MS = 3 * 60_000;
const RPC = "https://rpc.mainnet.chain.robinhood.com";   // public: a few calls per token per VERDICT_MS
const WINDOW = 9_900_000;                                   // the RPC allows 10M blocks a call (~11.5 days at 0.1 s)
const MAX_WINDOWS = 4;                                      // ~46 days back; an older token's history isn't complete
const MAX_LOGS = 60_000;                                    // the RPC returns at most 10k logs a call: windows are split
const RPC_GAP_MS = 350;                                     // the public RPC answers 429 to bursts
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000", DEAD = "0x000000000000000000000000000000000000dead";
const DEX_CHAIN: Record<string, string> = { "": "robinhood", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
const GOPLUS_CHAIN: Record<string, number> = { robinhood: 4663, base: 8453, bsc: 56, arbitrum: 42161 };
const GOPLUS_GAP_MS = 2_500;                                // the free API: one token a call, and it goes quiet on bursts
const MAX_TAX = 0.1;

export type Verdict = {
  ok: boolean;
  why: string[];                 // what failed, for the logs ("pool $3.1k real money", "4 wallets bundled, 31%")
  chain: string;                 // DexScreener's chain id
  ca: string;
  liq: number;                   // pool money, USD (both sides)
  realLiq: number;               // the paired side only
  mcap: number | null;
  vol24: number;
  ageH: number | null;           // hours since the oldest pool
  holders?: number;              // wallets holding any (Robinhood scan)
  top10?: number;                // share of the ten biggest wallets
  cluster?: number;              // share of the grouped wallets
  failed?: boolean;              // a source didn't answer: asked again after RETRY_MS
  holdersSkipped?: string;       // why the holder check didn't run (the token passed on its pool alone)
  tax?: number;                  // the higher of buy and sell tax (GoPlus), 0..1
  contractChecked?: boolean;     // GoPlus read it (the call says so)
};

const verdicts = new Map<string, { at: number; v: Verdict }>();

/** Whether `ca` on `chainKey` ("" = Robinhood, "base", "bsc", "arbitrum") is clean enough to post, cached VERDICT_MS. */
export async function screen(ca: string, chainKey = ""): Promise<Verdict> {
  const key = `${chainKey}:${ca.toLowerCase()}`;
  const hit = verdicts.get(key);
  if (hit && Date.now() - hit.at < (hit.v.failed ? RETRY_MS : VERDICT_MS)) return hit.v;
  const v = await judge(ca, chainKey).catch((err): Verdict => ({ ...empty(ca, chainKey), failed: true, why: [`check failed: ${(err as Error).message}`] }));
  verdicts.set(key, { at: Date.now(), v });
  return v;
}

const empty = (ca: string, chainKey: string): Verdict =>
  ({ ok: false, why: [], chain: DEX_CHAIN[chainKey] ?? chainKey, ca, liq: 0, realLiq: 0, mcap: null, vol24: 0, ageH: null });

async function judge(ca: string, chainKey: string): Promise<Verdict> {
  const v = empty(ca, chainKey);
  type P = Pair & { pairCreatedAt?: number; liquidity?: { usd?: number; base?: number; quote?: number } };
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/${v.chain}/${ca}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const pairs = ((await res.json()) as P[] | null) ?? [];
  if (!pairs.length) return { ...v, why: ["no pool"] };
  for (const p of pairs) {
    const liq = p.liquidity?.usd ?? 0;
    v.liq += liq;
    // the token's own side priced at the pool price; what's left is the money a seller can actually get out
    v.realLiq += Math.max(0, liq - (p.liquidity?.base ?? 0) * Number(p.priceUsd ?? 0));
    v.vol24 += p.volume?.h24 ?? 0;
  }
  const deepest = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]!;
  v.mcap = deepest.marketCap ?? null;
  const born = Math.min(...pairs.map((p) => p.pairCreatedAt ?? Infinity));
  v.ageH = Number.isFinite(born) ? (Date.now() - born) / 3_600_000 : null;
  if (v.realLiq < MIN_REAL_LIQ_USD) v.why.push(`pool has ${money(v.realLiq)} real money`);
  if (v.vol24 < MIN_VOL_24H_USD) v.why.push(`${money(v.vol24)} traded in 24h`);
  if (!v.why.length) await contract(v);
  if (!v.why.length && v.chain === "robinhood") await holders(v, born);
  v.ok = !v.why.length;
  return v;
}

// ---------------------------------------------------------------- the contract (GoPlus token security)

let goplusQueue: Promise<unknown> = Promise.resolve();

/** GoPlus' read of one token, one at a time GOPLUS_GAP_MS apart; null when it doesn't know the token (yet). */
function goplus(chain: string, ca: string): Promise<Record<string, unknown> | null> {
  const run = goplusQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      await new Promise((r) => setTimeout(r, GOPLUS_GAP_MS * (attempt ? 4 : 1)));
      const res = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${GOPLUS_CHAIN[chain]}?contract_addresses=${ca}`,
        { signal: AbortSignal.timeout(20_000) });
      const j = res.ok ? ((await res.json()) as { code?: number; result?: Record<string, Record<string, unknown>> | null }) : null;
      if (j?.result) return j.result[ca.toLowerCase()] ?? null;
      if (attempt >= 2) throw new Error(`GoPlus ${res.status}${j ? ` code ${j.code}` : ""}`);   // rate limited: result null
    }
  });
  goplusQueue = run.catch(() => {});
  return run;
}

async function contract(v: Verdict): Promise<void> {
  if (!GOPLUS_CHAIN[v.chain]) return;
  const r = await goplus(v.chain, v.ca);
  if (!r || !Object.keys(r).length) { v.failed = true; v.why.push("contract not checked yet"); return; }
  const on = (k: string) => String(r[k] ?? "") === "1";
  const owner = String(r.owner_address ?? "").toLowerCase();
  const owned = owner !== "" && owner !== ZERO && owner !== DEAD;   // an owner who can still use what the code allows
  if (on("is_honeypot")) v.why.push("honeypot");
  if (on("cannot_sell_all")) v.why.push("can't sell it all");
  if (on("cannot_buy")) v.why.push("can't be bought");
  if (String(r.is_open_source ?? "") === "0") v.why.push("contract code not verified");
  if (on("owner_change_balance")) v.why.push("owner can change balances");
  if (on("hidden_owner")) v.why.push("hidden owner");
  if (on("can_take_back_ownership")) v.why.push("ownership can be taken back");
  if (on("selfdestruct")) v.why.push("contract can self-destruct");
  if (owned && on("is_mintable")) v.why.push("owner can mint more");
  if (owned && on("transfer_pausable")) v.why.push("owner can freeze transfers");
  if (owned && on("is_blacklisted")) v.why.push("owner can blacklist wallets");
  if (owned && (on("slippage_modifiable") || on("personal_slippage_modifiable"))) v.why.push("owner can change the tax");
  if (owned && on("is_proxy")) v.why.push("owner can swap the contract's code");
  v.tax = Math.max(Number(r.buy_tax || 0), Number(r.sell_tax || 0));
  if (v.tax > MAX_TAX) v.why.push(`tax ${pctOf(v.tax)}`);
  v.contractChecked = true;
}

// ---------------------------------------------------------------- Robinhood Chain holders from Transfer logs

type Log = { blockNumber: string; topics: string[]; data: string };

let rpcQueue: Promise<unknown> = Promise.resolve();

/** One RPC request at a time, RPC_GAP_MS apart; a 429 waits and tries again (3 times). */
function rpc<T>(body: unknown): Promise<T> {
  const run = rpcQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      await new Promise((r) => setTimeout(r, RPC_GAP_MS * (attempt ? 2 ** (attempt + 2) : 1)));
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 && attempt < 3) continue;
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      return (await res.json()) as T;
    }
  });
  rpcQueue = run.catch(() => {});
  return run;
}

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const r = await rpc<{ result?: T; error?: { message: string } }>({ jsonrpc: "2.0", id: 1, method, params });
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result as T;
}

const hex = (n: number) => "0x" + n.toString(16);
const addr = (topic: string) => "0x" + topic.slice(26).toLowerCase();

async function holders(v: Verdict, bornMs: number): Promise<void> {
  // every Transfer since the pool (or MAX_WINDOWS back), oldest window last
  const head = parseInt(await call<string>("eth_blockNumber", []), 16);
  const logs: Log[] = [];
  let complete = false;
  // a range with more than the RPC's 10k logs is read in halves
  const read = async (from: number, to: number): Promise<Log[] | null> => {
    try {
      return await call<Log[]>("eth_getLogs", [{ address: v.ca, topics: [TRANSFER], fromBlock: hex(from), toBlock: hex(to) }]);
    } catch (err) {
      if (!/exceeds limit|too many/i.test((err as Error).message) || to - from < 1000) throw err;
      const mid = Math.floor((from + to) / 2);
      const a = await read(from, mid);
      if (!a || logs.length + a.length > MAX_LOGS) return null;
      const b = await read(mid + 1, to);
      return b && [...a, ...b];
    }
  };
  for (let i = 0, to = head; i < MAX_WINDOWS && to > 0; i++, to -= WINDOW + 1) {
    const from = Math.max(0, to - WINDOW);
    const got = await read(from, to);
    if (!got || logs.length + got.length > MAX_LOGS) { v.holdersSkipped = "too busy to read"; return; }
    logs.unshift(...got);
    // the token's mint (a transfer from 0x0) in this window means the history is whole
    if (got.some((l) => addr(l.topics[1]!) === ZERO) || from === 0) { complete = true; break; }
    // no pool before this window's start: nothing older matters for a token this young
    if (Number.isFinite(bornMs) && Date.now() - bornMs < (i + 1) * WINDOW * 100) { complete = got.length > 0; break; }
  }
  if (!complete) { v.holdersSkipped = "older than the scan"; return; }

  const bal = new Map<string, bigint>(), firstIn = new Map<string, number>(), fedBy = new Map<string, Set<string>>();
  for (const l of logs) {
    if (l.topics.length < 3) continue;   // ERC-721 style or odd logs
    const from = addr(l.topics[1]!), to = addr(l.topics[2]!), amt = BigInt(l.data === "0x" ? 0 : l.data.slice(0, 66));
    const block = parseInt(l.blockNumber, 16);
    bal.set(from, (bal.get(from) ?? 0n) - amt);
    bal.set(to, (bal.get(to) ?? 0n) + amt);
    if (!firstIn.has(to)) firstIn.set(to, block);
    if (from !== ZERO) (fedBy.get(from) ?? fedBy.set(from, new Set()).get(from)!).add(to);
  }
  bal.delete(ZERO);
  bal.delete(DEAD);
  const supply = [...bal.values()].reduce((s, b) => (b > 0n ? s + b : s), 0n);
  if (supply === 0n) { v.why.push("no supply held"); return; }
  const ranked = [...bal].filter(([, b]) => b > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  v.holders = ranked.length;

  // pools, lockers and routers are contracts: left out of the wallets' shares
  const top = ranked.slice(0, TOP_CHECKED + 10);
  const isContract = new Set<string>();
  for (let i = 0; i < top.length; i += 10) {   // small batches: the public RPC counts each call in a batch
    const codes = await rpc<{ id: number; result?: string }[]>(top.slice(i, i + 10).map(([a], j) => ({ jsonrpc: "2.0", id: i + j, method: "eth_getCode", params: [a, "latest"] })));
    for (const c of codes) if (c.result && c.result !== "0x") isContract.add(top[c.id]![0]);
  }
  const wallets = top.filter(([a]) => !isContract.has(a)).slice(0, TOP_CHECKED);
  const share = (list: [string, bigint][]) => Number((list.reduce((s, [, b]) => s + b, 0n) * 10_000n) / supply) / 10_000;
  v.top10 = share(wallets.slice(0, 10));

  // groups: MIN_GROUP+ top wallets whose first tokens came in the same block, or that one wallet sent tokens to
  const grouped = new Set<string>();
  const byBlock = new Map<number, string[]>();
  for (const [a] of wallets) (byBlock.get(firstIn.get(a)!) ?? byBlock.set(firstIn.get(a)!, []).get(firstIn.get(a)!)!).push(a);
  for (const g of byBlock.values()) if (g.length >= MIN_GROUP) g.forEach((a) => grouped.add(a));
  const topSet = new Set(wallets.map(([a]) => a));
  for (const [sender, to] of fedBy) {
    if (isContract.has(sender)) continue;   // a pool "sends" to every buyer
    const fed = [...to].filter((a) => topSet.has(a) && a !== sender);
    if (fed.length >= MIN_GROUP) [sender, ...fed].filter((a) => topSet.has(a)).forEach((a) => grouped.add(a));
  }
  v.cluster = share(wallets.filter(([a]) => grouped.has(a)));
  if (v.top10 > MAX_TOP10) v.why.push(`top 10 wallets hold ${pctOf(v.top10)}`);
  if (v.cluster > MAX_CLUSTER) v.why.push(`grouped wallets hold ${pctOf(v.cluster)}`);
}

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`);
const pctOf = (x: number) => `${(x * 100).toFixed(0)}%`;
