/**
 * Connectome Betting Dashboard — thin wrapper over vendored nofyai (MIT) UI patterns.
 *
 * Fetches connectome/wallet/betting data from our API and renders a leaderboard +
 * trader detail view using the same card/badge/table patterns from nofyai.
 *
 * Custom glue: ~50 lines of wiring.
 */

import { useEffect, useState } from "react";

interface Connectome {
  id: string;
  species: string;
  n_neurons: number;
  status: string;
  balance_usd: number;
  total_pnl: number;
  n_trades: number;
  n_wins: number;
  win_rate: number;
}

interface Governance {
  individual: Array<{
    id: number;
    connectome_id: string;
    balance_usd: number;
    starting_balance: number;
    total_pnl: number;
    n_trades: number;
    n_wins: number;
  }>;
  global: { balance_usd: number; total_pnl: number; n_trades: number };
  meta: { balance_usd: number; total_pnl: number; n_trades: number };
  latest_reports: Array<{
    connectome_id: string;
    epoch: number;
    pnl_percent: number;
    n_trades: number;
  }>;
}

const API_BASE = import.meta.env.VITE_API_BASE || "https://api.shitcoin.rugdrome.com";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ConnectomeBettingDashboard() {
  const [connectomes, setConnectomes] = useState<Connectome[]>([]);
  const [governance, setGovernance] = useState<Governance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [connRes, govRes] = await Promise.all([
          fetcher(`${API_BASE}/api/betting/leaderboard`),
          fetcher(`${API_BASE}/api/governance`),
        ]);
        setConnectomes(connRes || []);
        setGovernance(govRes);
      } catch (e) {
        console.error("Failed to load betting data", e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10_000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading connectome collective...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Connectome Trading Collective</h1>
        <span className="text-sm text-gray-500">16 brains · 18 wallets · live</span>
      </div>

      {/* Global + Meta wallet summary */}
      {governance && (
        <div className="grid grid-cols-2 gap-4">
          <WalletCard name="Global Wallet (majority vote)" wallet={governance.global} />
          <WalletCard name="Meta Wallet (AUC-weighted)" wallet={governance.meta} />
        </div>
      )}

      {/* Leaderboard */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left text-gray-400">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Connectome</th>
              <th className="px-4 py-2">Species</th>
              <th className="px-4 py-2">Neurons</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2">P&L</th>
              <th className="px-4 py-2">Trades</th>
              <th className="px-4 py-2">Win Rate</th>
              <th className="px-4 py-2">Bet</th>
            </tr>
          </thead>
          <tbody>
            {connectomes.map((c, i) => (
              <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-900">
                <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                <td className="px-4 py-3 font-mono">{c.id}</td>
                <td className="px-4 py-3">{c.species}</td>
                <td className="px-4 py-3 text-gray-400">{c.n_neurons.toLocaleString()}</td>
                <td className="px-4 py-3">${c.balance_usd?.toFixed(4)}</td>
                <td className={`px-4 py-3 ${(c.total_pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {(c.total_pnl || 0) >= 0 ? "+" : ""}${(c.total_pnl || 0).toFixed(4)}
                </td>
                <td className="px-4 py-3">{c.n_trades || 0}</td>
                <td className="px-4 py-3">{((c.win_rate || 0) * 100).toFixed(0)}%</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-500">Stake</button>
                    <button className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500">Bet</button>
                    <button className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500">Copy</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WalletCard({ name, wallet }: { name: string; wallet: any }) {
  if (!wallet) return null;
  const pnl = (wallet.balance_usd || 0) - (wallet.starting_balance || 10);
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="text-sm text-gray-400">{name}</div>
      <div className="mt-1 text-xl font-bold">${(wallet.balance_usd || 0).toFixed(4)}</div>
      <div className={`text-sm ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
        {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} P&L
      </div>
      <div className="mt-1 text-xs text-gray-500">{wallet.n_trades || 0} trades</div>
    </div>
  );
}
