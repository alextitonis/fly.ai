// DexScreener API client — fetches liquidity, volume, slippage, price data
// Public API, CORS-enabled, no key required

import type { ImpactTokenInfo } from "./impact-icm-types";

export interface DexScreenerPair {
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  liquidity?: { usd: number; base: number; quote: number };
  volume: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange: { h24?: number; h6?: number; h1?: number; m5?: number };
  fdv?: number;
  marketCap?: number;
  chainId: string;
  dexId: string;
  pairCreatedAt?: number;
}

export interface DexScreenerData {
  liquidityUsd: number;
  volume24h: number;
  volume1h: number;
  priceChange24h: number;
  priceChange1h: number;
  fdv: number;
  marketCap: number;
  pairAgeDays: number;
  slippage: number;
  chainCount: number;
}

const BASE_URL = "https://api.dexscreener.com/latest/dex";

async function fetchWithFallback(url: string, timeoutMs = 8000): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[DexScreener] direct fetch failed, trying proxy: ${url.slice(0, 60)}...`, e);
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), timeoutMs);
    const res2 = await fetch(proxyUrl, { signal: controller2.signal });
    clearTimeout(timeout2);
    if (res2.ok) return res2;
    throw new Error(`Proxy HTTP ${res2.status}`);
  }
}

export async function fetchDexScreenerData(token: ImpactTokenInfo): Promise<DexScreenerData | null> {
  try {
    const allAddresses = [token.address, ...(token.additionalAddresses ?? []).map((a) => a.address)];
    const additionalChains = new Set((token.additionalAddresses ?? []).map((a) => a.chain.toLowerCase()));
    const nonEvmChains = new Set(["hedera", "solana", "osmosis"]);
    const needsSymbolSearch = Array.from(additionalChains).some((c) => nonEvmChains.has(c));
    const evmAddresses = allAddresses.filter((addr) => addr.startsWith("0x"));

    console.log(`[DexScreener] ${token.symbol}: starting fetch, ${evmAddresses.length} EVM addresses, needsSearch=${needsSymbolSearch}`);

    const allPairs: DexScreenerPair[] = [];
    const seenPairAddresses = new Set<string>();
    
    await Promise.all(evmAddresses.map(async (addr) => {
      try {
        const res = await fetchWithFallback(`${BASE_URL}/tokens/${addr}`);
        console.log(`[DexScreener] ${token.symbol}: fetch ${addr.slice(0, 8)}... ok`);
        const json = await res.json();
        const pairs: DexScreenerPair[] = json.pairs ?? [];
        console.log(`[DexScreener] ${token.symbol}: got ${pairs.length} pairs from ${addr.slice(0, 8)}...`);
        for (const p of pairs) {
          if (!seenPairAddresses.has(p.pairAddress)) {
            seenPairAddresses.add(p.pairAddress);
            allPairs.push(p);
          }
        }
      } catch (e) { console.warn(`[DexScreener] ${token.symbol}: address fetch failed:`, e); }
    }));

    // Only do symbol search if:
    // 1. Address lookup returned no pairs (fallback), OR
    // 2. Token has non-EVM additional chains (Hedera, Solana, Osmosis) where /tokens/ doesn't work
    if (allPairs.length === 0 || needsSymbolSearch) {
      try {
        const searchRes = await fetchWithFallback(`${BASE_URL}/search?q=${token.symbol}`, 10000);
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const searchPairs: DexScreenerPair[] = searchJson.pairs ?? [];
          for (const p of searchPairs) {
            if (seenPairAddresses.has(p.pairAddress)) continue;
            const symUpper = p.baseToken.symbol.toUpperCase();
            const tokenSymUpper = token.symbol.toUpperCase();
            const symbolMatches = symUpper === tokenSymUpper || symUpper.startsWith(tokenSymUpper + "[");
            // If we already have pairs from address fetch, only add non-EVM chain pairs from search
            // If we have NO pairs (fallback), add any exact symbol match from any chain
            if (allPairs.length > 0) {
              // Only add pairs from non-EVM chains we couldn't query by address
              if (additionalChains.has(p.chainId.toLowerCase()) && (symbolMatches || symUpper.includes(tokenSymUpper))) {
                seenPairAddresses.add(p.pairAddress);
                allPairs.push(p);
              }
            } else {
              // Fallback: no pairs from address fetch, add exact symbol matches from any chain
              if (symbolMatches) {
                seenPairAddresses.add(p.pairAddress);
                allPairs.push(p);
              }
            }
          }
        }
      } catch { /* ignore search failure */ }
    }

    if (allPairs.length === 0) return null;

    // Sum liquidity and volume across ALL pairs (multi-chain)
    const totalLiquidity = allPairs.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);
    const totalVolume24h = allPairs.reduce((sum, p) => sum + (p.volume?.h24 ?? 0), 0);
    const totalVolume1h = allPairs.reduce((sum, p) => sum + (p.volume?.h1 ?? 0), 0);
    
    // Select pair with highest liquidity for price/fdv/slippage metrics
    const best = allPairs.reduce((a, b) => ((a.liquidity?.usd ?? 0) > (b.liquidity?.usd ?? 0) ? a : b));
    
    // Unique chain count
    const chains = new Set(allPairs.map((p) => p.chainId));

    // Estimate slippage from total liquidity
    const slippage = totalLiquidity > 0
      ? Math.min(10, (totalVolume24h / totalLiquidity) * 100)
      : 10;

    const pairAgeDays = best.pairCreatedAt
      ? (Date.now() - best.pairCreatedAt) / 86400000
      : 0;

    const result = {
      liquidityUsd: totalLiquidity,
      volume24h: totalVolume24h,
      volume1h: totalVolume1h,
      priceChange24h: best.priceChange?.h24 ?? 0,
      priceChange1h: best.priceChange?.h1 ?? 0,
      fdv: best.fdv ?? 0,
      marketCap: best.marketCap ?? best.fdv ?? 0,
      pairAgeDays,
      slippage,
      chainCount: chains.size,
    };
    console.log(`[DexScreener] ${token.symbol}: ${allPairs.length} pairs, liq=$${totalLiquidity.toFixed(2)}, vol=$${totalVolume24h.toFixed(2)}, chains=${chains.size}`);
    return result;
  } catch (err) {
    console.warn(`[DexScreener] ${token.symbol} error:`, err);
    return null;
  }
}

export async function fetchAllDexScreener(tokens: ImpactTokenInfo[]): Promise<Record<string, DexScreenerData | null>> {
  const result: Record<string, DexScreenerData | null> = {};

  // Fetch all tokens in parallel — each token fetches its own addresses
  const entries = await Promise.all(
    tokens.map(async (token) => {
      const data = await fetchDexScreenerData(token);
      return [token.symbol, data] as const;
    }),
  );
  for (const [sym, data] of entries) {
    result[sym] = data;
  }
  return result;
}
