// GeckoTerminal API client — fetches pool data by token contract address
// Public API, CORS-enabled, no key required
// Part of the CoinGecko ecosystem, tracks DEX pools across 200+ chains

import type { ImpactTokenInfo } from "./impact-icm-types";

export interface GeckoTerminalData {
  priceUsd: number;
  fdv: number;
  marketCap: number | null;
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  priceChange1h: number;
  poolName: string;
  dexId: string;
  chainCount: number;
}

interface GTPoolAttributes {
  name: string;
  base_token_price_usd: string;
  fdv_usd: string | null;
  market_cap_usd: string | null;
  volume_usd: { h24: string };
  reserve_in_usd: string;
  price_change_percentage: { h1: string; h24: string };
}

interface GTPool {
  id: string;
  type: string;
  attributes: GTPoolAttributes;
  relationships: {
    dex: { data: { id: string } };
  };
}

const BASE_URL = "https://api.geckoterminal.com/api/v2";

async function fetchWithFallback(url: string, timeoutMs = 8000): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[GeckoTerminal] direct fetch failed, trying proxy: ${url.slice(0, 60)}...`, e);
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), timeoutMs);
    const res2 = await fetch(proxyUrl, { signal: controller2.signal });
    clearTimeout(timeout2);
    if (res2.ok) return res2;
    throw new Error(`Proxy HTTP ${res2.status}`);
  }
}

// Map token symbols to GeckoTerminal network IDs
const SYMBOL_TO_NETWORK: Record<string, string> = {
  SLR: "base",
  TGN: "base",
  REGEN: "base",
  DOVU: "base",
  KVCM: "base",
  CEN: "base",
};

export async function fetchGeckoTerminalData(token: ImpactTokenInfo): Promise<GeckoTerminalData | null> {
  const primaryNetwork = SYMBOL_TO_NETWORK[token.symbol];
  if (!primaryNetwork) return null;

  // Collect all network+address pairs to fetch
  const fetchTargets: { network: string; address: string }[] = [
    { network: primaryNetwork, address: token.address },
  ];
  for (const extra of token.additionalAddresses ?? []) {
    if (extra.geckoNetwork) {
      fetchTargets.push({ network: extra.geckoNetwork, address: extra.address });
    }
  }

  try {
    // Fetch pools from all networks in parallel
    const allPools: GTPool[] = [];
    await Promise.all(fetchTargets.map(async ({ network, address }) => {
      try {
        const res = await fetchWithFallback(`${BASE_URL}/networks/${network}/tokens/${address}/pools`);
        const json = await res.json();
        const pools: GTPool[] = json.data ?? [];
        console.log(`[GeckoTerminal] ${token.symbol}: got ${pools.length} pools from ${network}`);
        allPools.push(...pools);
      } catch (e) { console.warn(`[GeckoTerminal] ${token.symbol}: pool fetch failed:`, e); }
    }));

    if (allPools.length === 0) return null;

    // Sum liquidity and volume across all pools (multi-chain)
    const totalLiquidity = allPools.reduce((sum, p) => sum + (parseFloat(p.attributes.reserve_in_usd) || 0), 0);
    const totalVolume24h = allPools.reduce((sum, p) => sum + (parseFloat(p.attributes.volume_usd.h24) || 0), 0);

    // Select pool with highest liquidity for price/fdv metrics
    const best = allPools.reduce((a, b) => {
      const aRes = parseFloat(a.attributes.reserve_in_usd) || 0;
      const bRes = parseFloat(b.attributes.reserve_in_usd) || 0;
      return bRes > aRes ? b : a;
    });

    const attr = best.attributes;
    const dexId = best.relationships?.dex?.data?.id ?? "unknown";
    
    // Count unique networks
    const networks = new Set(fetchTargets.map((t) => t.network));

    const gtResult = {
      priceUsd: parseFloat(attr.base_token_price_usd) || 0,
      fdv: attr.fdv_usd ? parseFloat(attr.fdv_usd) : 0,
      marketCap: attr.market_cap_usd ? parseFloat(attr.market_cap_usd) : null,
      volume24h: totalVolume24h,
      liquidityUsd: totalLiquidity,
      priceChange24h: parseFloat(attr.price_change_percentage.h24) || 0,
      priceChange1h: parseFloat(attr.price_change_percentage.h1) || 0,
      poolName: attr.name,
      dexId,
      chainCount: networks.size,
    };
    console.log(`[GeckoTerminal] ${token.symbol}: ${allPools.length} pools, liq=$${totalLiquidity.toFixed(2)}, vol=$${totalVolume24h.toFixed(2)}`);
    return gtResult;
  } catch (err) {
    console.warn(`[GeckoTerminal] ${token.symbol} error:`, err);
    return null;
  }
}

export async function fetchAllGeckoTerminal(tokens: ImpactTokenInfo[]): Promise<Record<string, GeckoTerminalData | null>> {
  const result: Record<string, GeckoTerminalData | null> = {};
  for (const token of tokens) {
    result[token.symbol] = await fetchGeckoTerminalData(token);
    await new Promise((r) => setTimeout(r, 150));
  }
  return result;
}
