import { useEffect, useState } from "react";
import { fetchRecentSignals, type SignalItem } from "../services/mockApi";

export function SignalsPage() {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const data = await fetchRecentSignals();
        if (!cancelled) {
          setSignals(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load signals from backend.");
          setSignals([]);
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
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Signals</h1>
        <p className="mt-1 text-sm text-slate-400">
          Stream of strategy-generated signals.
        </p>
      </header>

      {/* Status */}
      <div className="text-xs text-slate-500">
        {isLoading && <div>Loading…</div>}
        {!isLoading && error && <div className="text-rose-400">{error}</div>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">TF</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}

            {error && (
              <tr>
                <td className="px-4 py-3 text-rose-400" colSpan={5}>
                  {error}
                </td>
              </tr>
            )}

            {!isLoading && !error && signals.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={5}>
                  No signals available.
                </td>
              </tr>
            )}

            {!error &&
              signals.map((sig) => (
                <tr key={sig.id}>
                  <td className="px-4 py-2 text-slate-300">
                    {sig.createdAt
                      ? new Date(sig.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-100">{sig.symbol}</td>
                  <td
                    className={`px-4 py-2 ${
                      sig.direction === "long"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {sig.direction}
                  </td>
                  <td className="px-4 py-2 text-slate-300">{sig.timeframe}</td>
                  <td className="px-4 py-2 text-slate-400">{sig.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
