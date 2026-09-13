import { useEffect, useState } from "react";
import { fetchTrades, type TradeItem } from "../services/mockApi";

export function TradesPage() {
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const data = await fetchTrades();
        if (!cancelled) {
          setTrades(data);
          setError(null);
        }
      } catch (err: any) {
        console.error("Failed to load trades:", err);
        if (!cancelled) {
          setError("Failed to load trades");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trades</h1>
          <p className="mt-1 text-sm text-slate-400">
            Executed trades and PnL (served from the backend API).
          </p>
        </div>
        {isLoading && (
          <span className="text-xs text-slate-500">Loading trades…</span>
        )}
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Opened</th>
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-left">Size</th>
              <th className="px-4 py-2 text-left">R</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {error && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-3 text-center text-xs text-rose-400"
                >
                  {error}
                </td>
              </tr>
            )}

            {!error && trades.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-3 text-center text-xs text-slate-500"
                >
                  No trades available.
                </td>
              </tr>
            )}

            {!error &&
              trades.map((trade) => (
                <tr key={trade.id}>
                  <td className="px-4 py-2 text-slate-300">
                    {new Date(trade.openedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-100">{trade.symbol}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        trade.side === "long"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-300">{trade.size}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        trade.rMultiple >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {trade.rMultiple >= 0 ? "+" : ""}
                      {trade.rMultiple.toFixed(1)}R
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-400">{trade.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
