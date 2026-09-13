/**
 * 5H1T API adapter — maps our live API responses to vendored OSS component prop shapes.
 * ~80 lines of glue code. All UI rendering is done by vendored MIT-licensed components.
 */
import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "https://api-worker.YOUR-SUBDOMAIN.workers.dev";
const GOV_BASE = "https://governance-worker.YOUR-SUBDOMAIN.workers.dev";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export interface Connectome {
  id: string; species: string; n_neurons: number; n_synapses: number;
  resolution: string; source: string; status: string; balance_usd: number;
  starting_balance: number; total_pnl: number;
  n_trades: number; n_wins: number; win_rate: number;
  unrealized_pnl?: number; total_equity?: number;
}
export interface Wallet {
  id: number; connectome_id: string | null; wallet_type: string;
  balance_usd: number; starting_balance: number; total_pnl: number;
  n_trades: number; n_wins: number;
}
export interface Governance {
  individual: Wallet[]; global: Wallet; meta: Wallet;
  latest_reports: Array<{ connectome_id: string; epoch: number; pnl_percent: number; n_trades: number }>;
}
export interface Signal {
  id: number; token_address: string; decision: string; confidence: number;
  reason: string; neural_activity: string | null; feature_snapshot: string | null;
  created_at: number;
}
export interface Position {
  token_address: string; symbol: string; entry_price: number;
  current_price: number | null; pnl_percent: number; status: string;
  entry_amount: number; entry_at: number;
}
export interface FlyaiPoint { id: number; balance: number; price_usd: number; total_rfv: number; shit_floor_price: number; updated_at: number; }
export interface Treasury { flyai_balance: number; flyai_price_usd: number; total_rfv: number; shit_floor_price: number; open_positions: number; eth_deployed: number; }
export interface OnchainTreasury { mode: string; flyai_balance: number; rfv: number; floor_price: number; treasury_address: string; flyai_token: string; error?: string; }
export interface TokenDiscovery { address: string; symbol: string; name: string; chain: string; launchpad: string; score: number; enriched_at: number; }

// SWR-like polling hook
export function useApi<T>(path: string, intervalMs = 15000): { data: T | null; error: Error | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try { setData(await fetchJson<T>(`${API_BASE}${path}`)); setError(null); }
    catch (e) { setError(e as Error); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { reload(); const id = setInterval(reload, intervalMs); return () => clearInterval(id); }, [reload, intervalMs]);
  return { data, error, loading };
}

export const getConnectomes = () => fetchJson<Connectome[]>(`${API_BASE}/api/connectomes`);
export const getGovernance = () => fetchJson<Governance>(`${API_BASE}/api/governance`);
export const getSignals = (limit = 20) => fetchJson<Signal[]>(`${API_BASE}/api/signals?limit=${limit}`);
export const getPositions = () => fetchJson<Position[]>(`${API_BASE}/api/positions`);
export const getFlyaiHistory = () => fetchJson<FlyaiPoint[]>(`${API_BASE}/api/flyai`);
export const getTreasury = () => fetchJson<Treasury>(`${API_BASE}/api/treasury`);
export const getTokens = () => fetchJson<TokenDiscovery[]>(`${API_BASE}/api/tokens`);
export const getGovernanceStatus = () => fetchJson<any>(`${GOV_BASE}/governance/status`);
export const triggerEpoch = () => fetch(`${GOV_BASE}/governance/epoch`, { method: "POST" }).then(r => r.json());

// === Mappers to vendored component prop shapes ===

// Map connectomes to nofyai TraderSummary[]
export function toTraderSummaries(conn: Connectome[]): any[] {
  return conn.map((c, i) => ({
    trader_id: c.id, trader_name: c.id, ai_model: "connectome", exchange: "paper",
    total_equity: c.total_equity ?? c.balance_usd, total_pnl: c.total_pnl + (c.unrealized_pnl ?? 0),
    total_pnl_pct: c.starting_balance > 0 ? ((c.total_pnl + (c.unrealized_pnl ?? 0)) / c.starting_balance) * 100 : 0,
    win_rate: c.win_rate || 0, total_trades: c.n_trades || 0,
    sharpe_ratio: 0, is_running: c.status === "active",
    ranking: i + 1, initial_balance: c.starting_balance || 10, position_count: 0,
  }));
}

// Map flyai history to price chart points (for treasury page, NOT trader equity)
export function toFlyaiPricePoints(points: FlyaiPoint[]): any[] {
  return points.map((p, i) => ({
    timestamp: new Date(p.updated_at * 1000).toISOString(),
    time: new Date(p.updated_at * 1000).toLocaleTimeString(),
    price: p.price_usd,
    floor: p.shit_floor_price,
    balance: p.balance,
    rfv: p.total_rfv,
    cycle_number: i,
  }));
}

// Map connectome balances to equity points (for traders page)
export function toEquityPoints(connectomes: Connectome[]): any[] {
  return connectomes.map((c, i) => ({
    timestamp: new Date().toISOString(),
    total_equity: c.balance_usd,
    available_balance: c.balance_usd,
    total_pnl: c.total_pnl,
    total_pnl_pct: c.starting_balance > 0 ? (c.total_pnl / c.starting_balance) * 100 : 0,
    cycle_number: i,
    position_count: 0,
    margin_used_pct: 0,
    trader: c.id,
  }));
}

// Map connectomes to neuromap BrainRegion[]
export function toBrainRegions(conn: Connectome[]): any[] {
  return conn.map((c, i) => {
    const angle = (i / conn.length) * Math.PI * 2;
    const r = 0.6;
    return {
      id: c.id, name: c.id, description: `${c.species} — ${c.source}`,
      position: [Math.cos(angle) * r, Math.sin(angle) * 0.4, Math.sin(angle) * r] as [number, number, number],
      color: c.total_pnl >= 0 ? "#6cf08a" : "#ff5a5a",
      findings: `${c.n_neurons.toLocaleString()} neurons, ${c.n_synapses.toLocaleString()} synapses`,
      citations: [], relatedNeurotransmitters: [],
    };
  });
}

// Map signals to nofyai DecisionRecord[]
export function toDecisions(signals: Signal[]): any[] {
  return signals.map(s => ({
    id: s.id, cycle_number: s.id, timestamp: new Date(s.created_at * 1000).toISOString(),
    cot_trace: s.reason, decisions: [{ symbol: s.token_address.slice(0, 8), action: s.decision.toLowerCase(), reasoning: s.reason }],
    execution_results: [], account_snapshot: {}, positions_snapshot: {},
  }));
}
