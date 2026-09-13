import { useEffect, useState } from "react";
import {
  fetchPortfolioHistory,
  type PortfolioHistoryPoint,
} from "../../services/mockApi";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function PortfolioEquityChart() {
  const [data, setData] = useState<PortfolioHistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const history = await fetchPortfolioHistory();
        if (!cancelled) {
          setData(history);
          setError(null);
        }
      } catch (err: any) {
        console.error("Failed to load portfolio history:", err);
        if (!cancelled) setError("Failed to load portfolio history");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Format timestamp → short label (e.g. Jan 01)
  const formatLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
    });
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 h-72">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-medium text-slate-100">
            Equity Curve (mock)
          </h2>
          <p className="text-xs text-slate-500">
            Synthetic portfolio equity history served from the backend.
          </p>
        </div>
        {isLoading && (
          <span className="text-[11px] text-slate-500">Loading…</span>
        )}
      </div>

      {error && (
        <div className="text-xs text-rose-400">{error}</div>
      )}

      {!error && data.length === 0 && !isLoading && (
        <div className="text-xs text-slate-500">
          No history data available.
        </div>
      )}

      {!error && data.length > 0 && (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatLabel}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "#1e293b" }}
                tickLine={{ stroke: "#1e293b" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "#1e293b" }}
                tickLine={{ stroke: "#1e293b" }}
                tickFormatter={(v) => `$${(v as number) / 1000}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#020617",
                  borderColor: "#1e293b",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(label) => formatLabel(label as string)}
                formatter={(value) => [`$${value}`, "Equity"]}
              />
              <Line
                type="monotone"
                dataKey="equity"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
