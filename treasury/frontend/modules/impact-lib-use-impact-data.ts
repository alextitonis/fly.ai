// Unified data hook — fetches pre-computed data from the api-worker when configured,
// falls back to fetching live data from DexScreener, CoinGecko, DeFiLlama, GeckoTerminal
// and computing risk scores client-side

import { useQuery } from "@tanstack/react-query";
import { TOKENS, TOKEN_INFOS, buildImpactProject, type TokenMeta } from "./impact-lib-project-registry";
import { fetchAllDexScreener, type DexScreenerData } from "./impact-lib-dexscreener";
import { fetchAllCoinGecko, type CoinGeckoData } from "./impact-lib-coingecko";
import { fetchAllDeFiLlama, type DeFiLlamaData } from "./impact-lib-defillama";
import { fetchAllGeckoTerminal, type GeckoTerminalData } from "./impact-lib-geckoterminal";
import { calculateRiskScore } from "./impact-lib-risk-calculator";
import { api, API_BASE } from "./impact-lib-api";
import type { ImpactProject, AggregateImpact } from "./impact-icm-types";

export interface LiveTokenData {
  dex: DexScreenerData | null;
  coingecko: CoinGeckoData | null;
  defillama: DeFiLlamaData | null;
  geckoterminal: GeckoTerminalData | null;
}

export interface ImpactDataResult {
  projects: ImpactProject[];
  tokenData: Record<string, LiveTokenData>;
  aggregate: AggregateImpact;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  lastUpdated: Date | null;
}

async function fetchAllTokenData(): Promise<{
  projects: ImpactProject[];
  tokenData: Record<string, LiveTokenData>;
  aggregate: AggregateImpact;
}> {
  // If the api-worker is configured, fetch pre-computed data from it
  if (API_BASE) {
    try {
      const data = await api.impactDashboard();
      console.log("[useImpactData] Fetched from api-worker:", data.projects.length, "projects");
      return {
        projects: data.projects,
        tokenData: data.tokenData as Record<string, LiveTokenData>,
        aggregate: data.aggregate,
      };
    } catch (err) {
      console.warn("[useImpactData] API fetch failed, falling back to client-side:", err);
    }
  }

  // Fallback: fetch all 4 APIs in parallel — use allSettled so one failure doesn't kill everything
  const [dexResult, cgResult, dlResult, gtResult] = await Promise.allSettled([
    fetchAllDexScreener(TOKEN_INFOS),
    fetchAllCoinGecko(TOKEN_INFOS),
    fetchAllDeFiLlama(TOKEN_INFOS),
    fetchAllGeckoTerminal(TOKEN_INFOS),
  ]);

  const dexMap = dexResult.status === "fulfilled" ? dexResult.value : {};
  const cgMap = cgResult.status === "fulfilled" ? cgResult.value : {};
  const dlMap = dlResult.status === "fulfilled" ? dlResult.value : {};
  const gtMap = gtResult.status === "fulfilled" ? gtResult.value : {};

  if (dexResult.status === "rejected") console.warn("[useImpactData] DexScreener failed:", dexResult.reason);
  if (cgResult.status === "rejected") console.warn("[useImpactData] CoinGecko failed:", cgResult.reason);
  if (dlResult.status === "rejected") console.warn("[useImpactData] DeFiLlama failed:", dlResult.reason);
  if (gtResult.status === "rejected") console.warn("[useImpactData] GeckoTerminal failed:", gtResult.reason);

  const tokenData: Record<string, LiveTokenData> = {};
  const projects: ImpactProject[] = [];

  for (const token of TOKENS) {
    const dex = dexMap[token.symbol] ?? null;
    const cg = cgMap[token.symbol] ?? null;
    const dl = dlMap[token.symbol] ?? null;
    const gt = gtMap[token.symbol] ?? null;

    // If DexScreener returned no data, use GeckoTerminal as fallback for liquidity/volume
    const effectiveDex = dex ?? (gt ? {
      liquidityUsd: gt.liquidityUsd,
      volume24h: gt.volume24h,
      volume1h: 0,
      priceChange24h: gt.priceChange24h,
      priceChange1h: gt.priceChange1h,
      fdv: gt.fdv,
      marketCap: gt.marketCap ?? gt.fdv,
      pairAgeDays: 0,
      slippage: 10,
      chainCount: gt.chainCount,
    } : null);

    // If CoinGecko returned no data, use GeckoTerminal as fallback, then DexScreener
    const effectiveCg = cg ?? (gt ? {
      ath: 0,
      athDate: "",
      atl: 0,
      atlDate: "",
      marketCap: gt.marketCap ?? gt.fdv,
      circulatingSupply: 0,
      totalSupply: 0,
      maxSupply: null,
      priceChange7d: 0,
      priceChange14d: 0,
      priceChange30d: gt.priceChange24h,
      priceChange60d: 0,
      priceChange200d: 0,
      currentPrice: gt.priceUsd,
    } : null) ?? (effectiveDex ? {
      ath: 0,
      athDate: "",
      atl: 0,
      atlDate: "",
      marketCap: effectiveDex.marketCap,
      circulatingSupply: 0,
      totalSupply: 0,
      maxSupply: null,
      priceChange7d: 0,
      priceChange14d: 0,
      priceChange30d: effectiveDex.priceChange24h,
      priceChange60d: 0,
      priceChange200d: 0,
      currentPrice: 0,
    } : null);

    tokenData[token.symbol] = { dex: effectiveDex, coingecko: effectiveCg, defillama: dl, geckoterminal: gt };
    console.log(`[useImpactData] ${token.symbol}: dex=${effectiveDex ? `$${effectiveDex.liquidityUsd.toFixed(0)}` : "null"}, gt=${gt ? `$${gt.liquidityUsd.toFixed(0)}` : "null"}, cg=${cg ? `$${cg.marketCap ?? 0}` : "null"}`);

    const riskScore = calculateRiskScore(token, effectiveDex, effectiveCg, dl);
    projects.push(buildImpactProject(token, riskScore));
  }

  // Compute aggregate from live API data (prefer DexScreener, fall back to GeckoTerminal)
  const totalLiquidity = Object.values(tokenData).reduce((sum, d) => sum + (d.dex?.liquidityUsd ?? d.geckoterminal?.liquidityUsd ?? 0), 0);
  const totalMarketCap = Object.values(tokenData).reduce((sum, d) => sum + (d.coingecko?.marketCap ?? d.geckoterminal?.marketCap ?? d.geckoterminal?.fdv ?? 0), 0);
  const totalVolume24h = Object.values(tokenData).reduce((sum, d) => sum + (d.dex?.volume24h ?? d.geckoterminal?.volume24h ?? 0), 0);
  const avgEBF = TOKENS.reduce((sum, t) => {
    const avg = (t.ebf.air + t.ebf.water + t.ebf.soil + t.ebf.biodiversity + t.ebf.equity + t.ebf.carbon) / 6;
    return sum + avg;
  }, 0) / TOKENS.length;
  const avgCombinedScore = projects.length > 0
    ? projects.reduce((sum, p) => sum + (p.riskScore?.combinedScore ?? 0), 0) / projects.length
    : 0;
  const safeAvgCombinedScore = Number.isNaN(avgCombinedScore) ? 0 : Math.round(avgCombinedScore);

  const aggregate: AggregateImpact = {
    totalLiquidity,
    totalMarketCap,
    totalVolume24h,
    projectCount: TOKENS.length,
    avgEBF,
    avgCombinedScore: safeAvgCombinedScore,
  };

  return { projects, tokenData, aggregate };
}

export function useImpactData(): ImpactDataResult {
  const query = useQuery({
    queryKey: ["impact-data-live"],
    queryFn: fetchAllTokenData,
    refetchInterval: 60 * 1000, // Refresh every 60s
    staleTime: 30 * 1000,
  });

  return {
    projects: query.data?.projects ?? [],
    tokenData: query.data?.tokenData ?? {},
    aggregate: query.data?.aggregate ?? {
      totalLiquidity: 0, totalMarketCap: 0, totalVolume24h: 0,
      projectCount: 0, avgEBF: 0, avgCombinedScore: 0,
    },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}

export type { TokenMeta };
