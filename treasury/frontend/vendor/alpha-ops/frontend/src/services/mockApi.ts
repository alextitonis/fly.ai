// Types used by the dashboard

export type PortfolioSummary = {
  totalEquity: number;      // in USD
  pnl24hPct: number;        // %
  openRiskUsd: number;      // in USD
  openRiskR: number;        // in R
  activeStrategies: number;
  strategiesNote: string;
};

export type PortfolioHistoryPoint = {
  timestamp: string;
  equity: number;
};

export type SignalItem = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  timeframe: string;
  status: "open" | "executed" | "cancelled";
  plR: number | null;
  createdAt?: string;
};

export type TradeItem = {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: string;
  rMultiple: number;
  status: string;
  openedAt: string;
  closedAt: string;
};

export type OpsHealth = {
  executionEngine: "healthy" | "degraded" | "down";
  signalPipeline: "healthy" | "degraded" | "down";
  connectivityNote: string;
};

// Base URL for the backend API.
 const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// Performs an HTTP GET request to the backend API.
async function get<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  return get<PortfolioSummary>("/portfolio");
}

export async function fetchPortfolioHistory(): Promise<PortfolioHistoryPoint[]> {
  return get<PortfolioHistoryPoint[]>("/portfolio/history");
}

export async function fetchRecentSignals(): Promise<SignalItem[]> {
  return get<SignalItem[]>("/signals");
}

export async function fetchTrades(): Promise<TradeItem[]> {
  return get<TradeItem[]>("/trades");
}

export async function fetchOpsHealth(): Promise<OpsHealth> {
  return get<OpsHealth>("/ops");
}


export type MarketPrice = {
  symbol: string;
  priceUsd: number;
  source: string;
};

// Live market price from endpoint
export async function fetchMarketPrice(): Promise<MarketPrice> {
  return get<MarketPrice>("/market/price");
}