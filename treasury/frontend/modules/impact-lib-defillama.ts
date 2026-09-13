// DeFiLlama API client — fetches TVL and protocol sustainability data
// Public API, CORS-enabled, no key required

import type { ImpactTokenInfo } from "./impact-icm-types";

export interface DeFiLlamaData {
  tvl: number;
  tvlChange24h: number;
  tvlChange7d: number;
  tvlChange30d: number;
  chain: string;
  protocolName: string;
}

const BASE_URL = "https://api.llama.fi";

// Map token symbols to DeFiLlama protocol slugs
const SYMBOL_TO_SLUG: Record<string, string> = {
  KVCM: "klimadao",
};

export async function fetchDeFiLlamaData(token: ImpactTokenInfo): Promise<DeFiLlamaData | null> {
  const slug = SYMBOL_TO_SLUG[token.symbol];
  if (!slug) return null;

  try {
    const res = await fetch(`${BASE_URL}/protocol/${slug}`);
    if (!res.ok) return null;
    const json = await res.json();

    // DeFiLlama returns tvl as a historical array of {date, totalLiquidityUSD}
    const history: Array<{ date: number; totalLiquidityUSD: number }> = json.tvl ?? [];
    if (history.length === 0) return null;

    const current = history[history.length - 1]?.totalLiquidityUSD ?? 0;
    const day24 = history[history.length - 2]?.totalLiquidityUSD ?? current;
    const day7 = history[history.length - 8]?.totalLiquidityUSD ?? current;
    const day30 = history[history.length - 31]?.totalLiquidityUSD ?? current;

    const chains: string[] = json.chains ?? [];
    const primaryChain = json.chain ?? chains[0] ?? "unknown";

    return {
      tvl: current,
      tvlChange24h: day24 > 0 ? ((current - day24) / day24) * 100 : 0,
      tvlChange7d: day7 > 0 ? ((current - day7) / day7) * 100 : 0,
      tvlChange30d: day30 > 0 ? ((current - day30) / day30) * 100 : 0,
      chain: primaryChain,
      protocolName: json.name ?? token.name,
    };
  } catch {
    return null;
  }
}

export async function fetchAllDeFiLlama(tokens: ImpactTokenInfo[]): Promise<Record<string, DeFiLlamaData | null>> {
  const entries = await Promise.all(
    tokens.map(async (t) => [t.symbol, await fetchDeFiLlamaData(t)] as const),
  );
  return Object.fromEntries(entries);
}
