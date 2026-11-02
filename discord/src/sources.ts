// What !research knows about a token beyond its contract (2026-11-02, the user: "better research like on X, web, pools and staff,
// maybe past activity"): its pools and price history (GeckoTerminal), who made it and what else they launched (GeckoTerminal + the
// Pons factory's logs), paid promotion (DexScreener), how old its site is (RDAP), its code (GitHub), its CoinGecko page, and what
// our own desk and wallets did with it. All free and all optional: whatever fails is left out, and never counts for or against it.
import { board, contractOf, desk, flyLog, type LogTrade } from "./data.ts";
import { call } from "./screen.ts";

const GT = "https://api.geckoterminal.com/api/v2/networks";
const NET: Record<string, string> = { robinhood: "robinhood", base: "base", bsc: "bsc", arbitrum: "arbitrum", ethereum: "eth", solana: "solana" };
const GT_GAP_MS = 2_500;                 // the free API: ~30 calls a minute in theory, 429s much sooner on a burst
const PONS = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";     // flytrade/desk/memegate.py: creators are in its launch logs
const LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";   // TokenLaunched(address,address,address,address,uint256,uint256)
const LOG_WINDOW = 9_900_000, LOG_WINDOWS = 12;                 // as screen.ts: ~11.5 days a window, the chain's whole life
const DEAD_LIQ_USD = 1_000;
const DAY = 86_400_000;

const json = async (url: string, timeout = 15_000): Promise<any> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fly.ai discord bot)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

let gtQueue: Promise<unknown> = Promise.resolve();

/** One GeckoTerminal call at a time; a 429 waits and tries once more. */
function gt(path: string): Promise<any> {
  const run = gtQueue.then(async () => {
    await new Promise((r) => setTimeout(r, GT_GAP_MS));
    const r = await fetch(`${GT}${path}`, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 20_000));
      return json(`${GT}${path}`);
    }
    if (!r.ok) throw new Error(`GeckoTerminal HTTP ${r.status}`);
    return r.json();
  });
  gtQueue = run.catch(() => {});
  return run;
}

const num = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));

// ---------------------------------------------------------------- the token on GeckoTerminal

export type TokenInfo = { dev: string | null; devPct: number | null; score: number | null; top10: number | null; holders: number | null; launchpad: boolean; graduated: boolean; coin: string | null; website: string | null; twitter: string | null };

export async function tokenInfo(chain: string, ca: string): Promise<TokenInfo | null> {
  if (!NET[chain]) return null;
  const a = (await gt(`/${NET[chain]}/tokens/${ca}/info`)).data?.attributes;
  if (!a) return null;
  return { dev: a.developer_address?.toLowerCase() ?? null, devPct: num(a.developer_holding_percentage), score: num(a.gt_score), top10: num(a.holders?.distribution_percentage?.top_10),
    holders: num(a.holders?.count), launchpad: !!a.launchpad_details, graduated: !!a.launchpad_details?.completed, coin: a.coingecko_coin_id ?? null, website: a.websites?.[0] ?? null, twitter: a.twitter_handle ?? null };
}

export type Pool = { address: string; name: string; ageDays: number | null; liq: number; vol24: number; buys: number; sells: number; buyers: number; sellers: number; h24: number | null };

export async function poolsOf(chain: string, ca: string, now = Date.now()): Promise<Pool[]> {
  if (!NET[chain]) return [];
  const rows: any[] = (await gt(`/${NET[chain]}/tokens/${ca}/pools?page=1`)).data ?? [];
  return rows.map((p) => {
    const a = p.attributes ?? {}, t = a.transactions?.h24 ?? {}, born = Date.parse(a.pool_created_at ?? "");
    return { address: String(a.address ?? ""), name: String(a.name ?? "?"), ageDays: Number.isFinite(born) ? (now - born) / DAY : null, liq: num(a.reserve_in_usd) ?? 0, vol24: num(a.volume_usd?.h24) ?? 0,
      buys: num(t.buys) ?? 0, sells: num(t.sells) ?? 0, buyers: num(t.buyers) ?? 0, sellers: num(t.sellers) ?? 0, h24: num(a.price_change_percentage?.h24) };
  }).filter((p) => p.address);
}

export type PriceHistory = { days: number; peak: number; peakDaysAgo: number; fromPeak: number; change30d: number | null; vol7: number; volBefore: number | null };

/** Daily closes of its busiest pool: how far from its peak, and whether trading is drying up. Closes, not highs: one wick isn't a peak. */
export function historyOf(rows: number[][], now = Date.now()): PriceHistory | null {
  const days = [...rows].filter((r) => Number.isFinite(r[4]) && r[4]! > 0).sort((a, b) => a[0]! - b[0]!);
  if (days.length < 2) return null;
  const last = days[days.length - 1]!, top = days.reduce((m, r) => (r[4]! > m[4]! ? r : m));
  const ago30 = days[days.length - 31];
  const avg = (xs: number[][]) => xs.reduce((s, r) => s + (r[5] ?? 0), 0) / (xs.length || 1);
  const before = days.slice(-37, -7);
  return { days: days.length, peak: top[4]!, peakDaysAgo: Math.round((now - top[0]! * 1000) / DAY), fromPeak: last[4]! / top[4]! - 1, change30d: ago30 ? last[4]! / ago30[4]! - 1 : null,
    vol7: avg(days.slice(-7)), volBefore: before.length >= 7 ? avg(before) : null };
}

export const priceHistory = async (chain: string, pool: string) => historyOf((await gt(`/${NET[chain]}/pools/${pool}/ohlcv/day?limit=180`)).data?.attributes?.ohlcv_list ?? []);

export type Flow = { trades: number; wallets: number; top3: number; buyUsd: number; sellUsd: number };

/** Who's trading it: a few wallets making nearly all the volume is what wash trading looks like. */
export function flowOf(rows: { kind?: string; volume_in_usd?: string; tx_from_address?: string }[]): Flow | null {
  if (!rows.length) return null;
  const by = new Map<string, number>();
  let buyUsd = 0, sellUsd = 0;
  for (const t of rows) {
    const usd = num(t.volume_in_usd) ?? 0;
    if (t.kind === "buy") buyUsd += usd; else sellUsd += usd;
    const who = String(t.tx_from_address ?? "?").toLowerCase();
    by.set(who, (by.get(who) ?? 0) + usd);
  }
  const total = buyUsd + sellUsd;
  const top = [...by.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0);
  return { trades: rows.length, wallets: by.size, top3: total ? top / total : 0, buyUsd, sellUsd };
}

export const flow = async (chain: string, pool: string) => flowOf(((await gt(`/${NET[chain]}/pools/${pool}/trades`)).data ?? []).map((t: any) => t.attributes ?? {}));

// ---------------------------------------------------------------- who made it, and what else they launched

export type PastLaunch = { symbol: string; ca: string; liq: number; vol24: number; ageDays: number | null };
export type Launches = { creator: string; count: number; last7d: number; dead: number; others: PastLaunch[] };

const topicOf = (addr: string) => `0x${addr.slice(2).toLowerCase().padStart(64, "0")}`;
const addrOf = (topic: string) => `0x${topic.slice(26).toLowerCase()}`;

/** The launches on Pons (Robinhood's launchpad) by one wallet, and how each is doing now. Other launchpads and plain deploys aren't seen. */
export async function launchesBy(creator: string, skip: string, now = Date.now()): Promise<Launches> {
  let to = parseInt(await call<string>("eth_blockNumber", []), 16);
  const head = to;
  const seen: { token: string; block: number }[] = [];
  for (let i = 0; i < LOG_WINDOWS && to > 0; i++) {
    const from = Math.max(0, to - LOG_WINDOW);
    const logs = await call<{ topics: string[]; blockNumber: string }[]>("eth_getLogs",
      [{ address: PONS, topics: [LAUNCHED, null, null, topicOf(creator)], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }]);
    for (const l of logs) seen.push({ token: addrOf(l.topics[1]!), block: parseInt(l.blockNumber, 16) });
    to = from - 1;
  }
  const others = seen.filter((s) => s.token !== skip.toLowerCase()).sort((a, b) => b.block - a.block);
  const week = head - (7 * DAY / 1000) / 0.105;     // Robinhood's block time (memegate.py)
  const pairs: any[] = others.length ? await json(`https://api.dexscreener.com/tokens/v1/robinhood/${others.slice(0, 30).map((s) => s.token).join(",")}`).catch(() => []) : [];
  const now_ = new Map<string, PastLaunch>();
  for (const p of pairs) {
    const ca = String(p.baseToken?.address ?? "").toLowerCase();
    if (!others.some((o) => o.token === ca)) continue;
    const had = now_.get(ca);
    now_.set(ca, { symbol: p.baseToken?.symbol ?? "?", ca, liq: (had?.liq ?? 0) + (p.liquidity?.usd ?? 0), vol24: (had?.vol24 ?? 0) + (p.volume?.h24 ?? 0), ageDays: p.pairCreatedAt ? (now - p.pairCreatedAt) / DAY : had?.ageDays ?? null });
  }
  const read = others.slice(0, 30).map((o) => now_.get(o.token) ?? { symbol: "?", ca: o.token, liq: 0, vol24: 0, ageDays: null });
  return { creator, count: others.length, last7d: others.filter((o) => o.block >= week).length, dead: read.filter((r) => r.liq < DEAD_LIQ_USD).length, others: read.sort((a, b) => b.liq - a.liq).slice(0, 5) };
}

// ---------------------------------------------------------------- promotion, site age, code, CoinGecko

export type Promo = { profile: boolean; boosts: number };

export async function promoOf(chain: string, ca: string): Promise<Promo> {
  const d = await json(`https://api.dexscreener.com/orders/v1/${chain}/${ca}`);
  return { profile: (d.orders ?? []).some((o: { type?: string; status?: string }) => o.type === "tokenProfile" && o.status === "approved"),
    boosts: (d.boosts ?? []).reduce((s: number, b: { amount?: number }) => s + Number(b.amount ?? 0), 0) };
}

const SOCIAL = /(^|\.)(x\.com|twitter\.com|t\.me|telegram\.(me|org)|discord\.(gg|com)|github\.com|medium\.com|youtube\.com|youtu\.be|instagram\.com|tiktok\.com|linktr\.ee|opensea\.io|dexscreener\.com|coingecko\.com|gitbook\.io)$/i;

/** The project's own site out of what it lists, if any: socials and data pages aren't one. */
export function websiteOf(urls: (string | null | undefined)[]): string | null {
  for (const u of urls) {
    const host = hostOf(u);
    if (host && !SOCIAL.test(host)) return u!;
  }
  return null;
}

export const hostOf = (u: string | null | undefined) => { try { return new URL(u ?? "").hostname.toLowerCase(); } catch { return null; } };

/** When a domain was registered, in days ago. Only ever asks rdap.org about the name: the site itself isn't touched. */
export async function domainAgeDays(host: string, now = Date.now()): Promise<number | null> {
  const name = host.split(".").slice(-2).join(".");
  if (!/^[a-z0-9-]+\.[a-z0-9-]+$/.test(name)) return null;
  const d = await json(`https://rdap.org/domain/${name}`);
  const at = Date.parse((d.events ?? []).find((e: { eventAction?: string }) => e.eventAction === "registration")?.eventDate ?? "");
  return Number.isFinite(at) ? Math.max(0, (now - at) / DAY) : null;
}

export type Code = { url: string; pushedDays: number | null; stars: number; repos: number };

/** A GitHub link's activity: a repo's last push, or the newest push across an account's public repos. */
export async function codeOf(url: string, now = Date.now()): Promise<Code | null> {
  const m = /github\.com\/([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?/i.exec(url);
  if (!m) return null;
  const [owner, repo] = [m[1]!, m[2]?.replace(/\.git$/, "")];
  const rows: any[] = repo ? [await json(`https://api.github.com/repos/${owner}/${repo}`)]
    : await json(`https://api.github.com/users/${owner}/repos?sort=pushed&per_page=30`);
  if (!rows.length) return null;
  const pushed = Math.max(...rows.map((r) => Date.parse(r.pushed_at ?? "") || 0));
  return { url: `github.com/${owner}${repo ? `/${repo}` : ""}`, pushedDays: pushed ? (now - pushed) / DAY : null, stars: rows.reduce((s, r) => s + Number(r.stargazers_count ?? 0), 0), repos: rows.length };
}

export type Coin = { ath: number | null; athChange: number | null; athDate: string | null; categories: string[]; notice: string | null; repo: string | null };

export async function coinOf(id: string): Promise<Coin> {
  const d = await json(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
  return { ath: num(d.market_data?.ath?.usd), athChange: num(d.market_data?.ath_change_percentage?.usd), athDate: d.market_data?.ath_date?.usd ?? null,
    categories: (d.categories ?? []).slice(0, 4), notice: d.public_notice ? String(d.public_notice).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : null, repo: d.links?.repos_url?.github?.[0] ?? null };
}

// ---------------------------------------------------------------- what our own flies did with it

export type Ours = { deskHolds: boolean; deskBuys: number; deskSells: number; walletBuys: number; walletSells: number; walletPnl: number | null; refused: string | null; topTraders: { buyers: number; sellers: number; buyUsd: number; sellUsd: number } | null; found: boolean };

const CHAIN_OF: Record<string, string> = { "": "robinhood", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
const tickerOf = (sym: string) => sym.slice(sym.indexOf(":") + 1).split(".")[0]!.toUpperCase();

/** The desk's and the top wallets' dealings in one token, from their public logs: a matching ticker counts only if its contract is this one. */
export async function oursOn(chain: string, ca: string, symbol: string, wallets = 5): Promise<Ours | null> {
  const target = ca.toLowerCase(), want = symbol.toUpperCase();
  const memo = new Map<string, Promise<boolean>>();
  const same = (sym: string) => {
    if (tickerOf(sym) !== want || CHAIN_OF[sym.includes(":") ? sym.slice(0, sym.indexOf(":")) : ""] !== chain) return Promise.resolve(false);
    if (!memo.has(sym)) memo.set(sym, contractOf(sym).then((c) => c?.toLowerCase() === target));
    return memo.get(sym)!;
  };
  const out: Ours = { deskHolds: false, deskBuys: 0, deskSells: 0, walletBuys: 0, walletSells: 0, walletPnl: null, refused: null, topTraders: null, found: false };
  const d = await desk().catch(() => null);
  if (d) {
    for (const book of Object.values(d.positions ?? {})) for (const r of book.rows ?? []) if (await same(r.symbol)) out.deskHolds = true;
    for (const t of d.recent_trades ?? []) if (await same(t.symbol)) { if (t.side === "buy") out.deskBuys++; else out.deskSells++; }
    const f = d.alpha?.fomo?.tokens?.find((t) => t.token.toLowerCase() === target);
    if (f) out.topTraders = { buyers: f.buyers_6h ?? 0, sellers: f.sellers_6h ?? 0, buyUsd: f.buy_usd_6h ?? 0, sellUsd: f.sell_usd_6h ?? 0 };
    out.found = !!d.alpha?.found?.some((x) => x.token.toLowerCase() === target);
  }
  const top = (await board().catch(() => null))?.d7?.flatMap((w) => w.flies).slice(0, wallets) ?? [];
  const logs = await Promise.all(top.map((fly) => flyLog(fly).catch(() => null)));
  const pnls: number[] = [];
  for (const log of logs) {
    for (const r of log?.rows ?? []) {
      if (r.type !== "trade") continue;
      const t = r as LogTrade;
      if (!(await same(t.symbol))) continue;
      if (t.status === "filled") {
        if (t.side === "buy") out.walletBuys++; else out.walletSells++;
        if (t.pnl_pct != null) pnls.push(t.pnl_pct);
      } else if (t.side === "buy" && t.why && !out.refused) out.refused = t.why.replace(/\s+/g, " ").slice(0, 120);
    }
  }
  if (pnls.length) out.walletPnl = pnls.reduce((s, x) => s + x, 0) / pnls.length;
  return out;
}
