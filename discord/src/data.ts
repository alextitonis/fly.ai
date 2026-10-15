// The live numbers the commands show, from the same public sources the website reads. Every answer is kept for
// CACHE_MS, so a busy channel is still one request per source a minute.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

export const SITE = "https://flyaiworld.com";
export const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";   // the only $FLYAI (Robinhood Chain), docs/token.html
// the mine server's public reads through the site (vercel.json /mapi/*): Vercel's edge keeps each answer ~30 s, as for the pages
const MINE = "https://www.flyaiworld.com/mapi";
const DESK = "https://flytrade-desk.fly.dev";

async function getJSON<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const value = (await res.json()) as T;
    cache.set(url, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (hit) return hit.value as T;   // a slow or restarting source: the last answer beats none
    throw err;
  }
}

// ---------------------------------------------------------------- $FLYAI price (DexScreener, the deepest pool)
export type Pair = {
  url: string;
  dexId: string;
  priceUsd?: string;
  priceChange?: { h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
};

export async function flyaiPair(): Promise<Pair | null> {
  const d = await getJSON<{ pairs: Pair[] | null }>(`https://api.dexscreener.com/latest/dex/tokens/${FLYAI}`);
  const pairs = [...(d.pairs ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return pairs[0] ?? null;
}

// ---------------------------------------------------------------- $FLYAI supply (mine/src/supply.ts: on chain, burns lower it)
export type Supply = {
  total: string;         // whole tokens as decimal strings
  circulating: string;   // total minus the Pons locker and 0x…dEaD
  burned: string;
  minted: string;
  excluded: { label: string; balance: string }[];
};

export const supply = () => getJSON<Supply>(`${MINE}/api/supply`);

// ---------------------------------------------------------------- the Fly Desk (flytrade/desk/publish.py site_view)
export type Desk = {
  updated: string;
  pot_usd: number;
  capital_usd: number;
  positions: Record<string, { rows: { symbol: string; value_usd: number; pnl_pct: number; price?: number }[] }>;
  ath?: { pot_usd: number; at: string };
  recent_trades: { at: string; book: string; symbol: string; side: string; usd: number }[];
  fills?: { trades: number };
  universe?: { tokens: number };
  payout?: { settles_at: number; holders_usd: number };
  labels?: Record<string, string>;   // Azuro bet ids -> "Team A – Team B (market)"
  launches?: { items: Launch[] };
  alpha?: { fomo?: { at: number; tokens: FomoToken[] }; found?: Found[] };   // flytrade/desk engine.alpha_fomo / alpha_found
};
/** What FOMO's top traders did with a token in the last 1 h / 6 h (distinct traders, dollars). */
export type FomoToken = {
  token: string; symbol: string | null; screened: boolean;
  buyers_1h: number | null; sellers_1h: number | null; buyers_6h: number | null; sellers_6h: number | null;
  buy_usd_1h: number | null; sell_usd_1h: number | null; buy_usd_6h: number | null; sell_usd_6h: number | null;
};
/** A token the desk's new-pool watcher added to what the flies can trade. */
export type Found = { at: number; symbol: string; token: string; source?: string | null; liquidity?: number | null };
export type Trade = Desk["recent_trades"][number];
export type Launch = { at: number; name: string; symbol: string; token: string; tx?: string };

export const desk = () => getJSON<Desk>(`${DESK}/public/site.json`);

// ---------------------------------------------------------------- Fly Wallets leaderboard (mine /api/vaults/leaderboard)
export type Wallet = {
  flies: number[];
  holder: string;
  profit: number;
  profit_24h: number;
  profit_7d: number;
  active: boolean;
};
export type Board = { h24: Wallet[]; d7: Wallet[]; all: Wallet[] };

export const board = () => getJSON<Board>(`${MINE}/api/vaults/leaderboard?chain=robinhood`);

/** One line of a Fly Wallet's terminal (mine /api/vaults/fly/:id/log; flytrade/web/src/vaults.ts LogRow), newest first. */
export type LogTrade = {
  at: number; type: "trade"; tag: string; symbol: string; side: string; status: string;
  usd: number | null; price: number | null; tx: string | null; why: string | null; pnl_pct: number | null;
  first_at?: number;   // a refusal repeated since then (the server collapses repeats into one line)
};
export type FlyLog = { fly: number; rows: (LogTrade | { at: number; type: "move" | "event" })[] };

export const flyLog = (fly: number) => getJSON<FlyLog>(`${MINE}/api/vaults/fly/${fly}/log`);

const DEX_CHAIN: Record<string, string> = { "": "robinhood", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
const caCache = new Map<string, string | null>();

/** A traded symbol's contract address from DexScreener's search (free, no RPC): the symbol's chain, the ".88ad"
 *  suffix matched against the address when there is one, else the deepest pool. null when nothing matches. */
export async function contractOf(sym: string): Promise<string | null> {
  if (caCache.has(sym)) return caCache.get(sym)!;
  const i = sym.indexOf(":");
  const chain = DEX_CHAIN[i > 0 ? sym.slice(0, i) : ""];
  const m = /^(.*?)(?:\.([0-9a-f]{4}))?$/i.exec(sym.slice(i + 1))!;
  const [ticker, suffix] = [m[1]!, m[2]];
  if (!chain || sym.startsWith("azuro:")) return null;
  const d = await getJSON<{ pairs: (Pair & { chainId: string; baseToken: { symbol: string; address: string } })[] | null }>(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(ticker)}`,
  ).catch(() => null);
  if (!d) return null;   // a failed search isn't remembered: the next post tries again
  const hit = (d.pairs ?? [])
    .filter((p) => p.chainId === chain && p.baseToken.symbol.toUpperCase() === ticker.toUpperCase())
    .filter((p) => !suffix || p.baseToken.address.toLowerCase().startsWith(`0x${suffix.toLowerCase()}`))
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const ca = hit?.baseToken.address ?? null;
  caCache.set(sym, ca);
  return ca;
}

/** Nicknames people set on the site, lowercase address -> name; none on a failed read. */
export async function nicknames(wallets: string[]): Promise<Record<string, string>> {
  if (!wallets.length) return {};
  return getJSON<Record<string, string>>(`${MINE}/api/profiles?wallets=${wallets.join(",")}`).catch(() => ({}));
}
