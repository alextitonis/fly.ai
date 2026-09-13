// CoinGecko API client — fetches ATH/ATL, market cap, supply, price changes
// Public API, CORS-enabled, rate-limited (10-30 calls/min)

import type { ImpactTokenInfo } from "./impact-icm-types";

export interface CoinGeckoData {
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  marketCap: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  priceChange7d: number;
  priceChange14d: number;
  priceChange30d: number;
  priceChange60d: number;
  priceChange200d: number;
  currentPrice: number;
}

const BASE_URL = "https://api.coingecko.com/api/v3";

// Map token symbols to CoinGecko coin IDs
const SYMBOL_TO_ID: Record<string, string> = {
  SLR: "solarcoin-2",
  REGEN: "regen",
  DOVU: "dovu-2",
};

export async function fetchCoinGeckoData(token: ImpactTokenInfo): Promise<CoinGeckoData | null> {
  const coinId = SYMBOL_TO_ID[token.symbol];
  if (!coinId) return null;

  try {
    const res = await fetch(
      `${BASE_URL}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const md = json.market_data;
    if (!md) return null;

    return {
      ath: md.ath?.usd ?? 0,
      athDate: md.ath_date?.usd ?? "",
      atl: md.atl?.usd ?? 0,
      atlDate: md.atl_date?.usd ?? "",
      marketCap: md.market_cap?.usd ?? 0,
      circulatingSupply: md.circulating_supply ?? 0,
      totalSupply: md.total_supply ?? 0,
      maxSupply: md.max_supply ?? null,
      priceChange7d: md.price_change_percentage_7d ?? 0,
      priceChange14d: md.price_change_percentage_14d ?? 0,
      priceChange30d: md.price_change_percentage_30d ?? 0,
      priceChange60d: md.price_change_percentage_60d ?? 0,
      priceChange200d: md.price_change_percentage_200d ?? 0,
      currentPrice: md.current_price?.usd ?? 0,
    };
  } catch {
    return null;
  }
}

export async function fetchAllCoinGecko(tokens: ImpactTokenInfo[]): Promise<Record<string, CoinGeckoData | null>> {
  // Stagger requests to respect rate limits
  const results: Record<string, CoinGeckoData | null> = {};
  for (const token of tokens) {
    results[token.symbol] = await fetchCoinGeckoData(token);
    await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}
