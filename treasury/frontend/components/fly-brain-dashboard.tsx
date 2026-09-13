/**
 * Fly Brain Trading Dashboard — adapted from sshfighter/dashboard.html (MIT, alextitonis/fly.ai)
 *
 * Shows live trading brain activity:
 * - Market sensory channels (loom, threat, shot, chase — left/right bars)
 * - Descending neuron activity (BUY/SELL/HOLD signals)
 * - Paper trading positions
 * - Model status (readout AUC, win rate, threshold)
 *
 * Upstream dashboard.html uses SSE for live updates; we use polling (React state).
 * Upstream uses raw canvas; we use CSS bars (lighter, no extra dependency).
 */
import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "";

interface Signal {
  id: number;
  token_address: string;
  decision: string;
  confidence: number;
  reason: string;
  feature_snapshot: string | null;
  created_at: number;
}

interface ModelStatus {
  readout_loaded: boolean;
  readout_cv_score: number | null;
  encoder_loaded: boolean;
  eyes_loaded: boolean;
  n_neurons: number;
  n_synapses: number;
  threshold: number | null;
  win_rate: number | null;
  total_trades: number;
}

interface Position {
  token_symbol: string;
  entry_price: number;
  current_price: number;
  allocation: number;
  pnl_percent: number;
}

const MODALITY_COLORS: Record<string, string> = {
  loom: "#ff5a5a",
  threat: "#ff5ad2",
  shot: "#ffe14d",
  chase: "#3ed8ff",
  buy: "#6cf08a",
  sell: "#ff5a5a",
  hold: "#8793a0",
};

export function FlyBrainDashboard() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sigRes, modelRes, posRes] = await Promise.all([
          fetch(`${API_BASE}/api/signals?limit=20`),
          fetch(`${API_BASE}/api/model-status`),
          fetch(`${API_BASE}/api/positions`),
        ]);
        if (sigRes.ok) setSignals(await sigRes.json());
        if (modelRes.ok) setModelStatus(await modelRes.json());
        if (posRes.ok) setPositions(await posRes.json());
      } catch {
        // API not available yet
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s polling
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-secondary-t font-mono text-sm">Loading fly brain...</span>
      </div>
    );
  }

  const recentSignals = signals.slice(0, 10);
  const buyCount = recentSignals.filter((s) => s.decision === "BUY").length;
  const sellCount = recentSignals.filter((s) => s.decision === "SELL").length;
  const holdCount = recentSignals.filter((s) => s.decision === "HOLD").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* Brain Status Panel */}
      <div className="rounded-lg border border-a10-b bg-surface-a3 p-4">
        <h3 className="font-mono text-xs uppercase tracking-wider text-secondary-t mb-3">
          Fly Brain Status
        </h3>
        <div className="space-y-2 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-secondary-t">Neurons</span>
            <span>{modelStatus?.n_neurons?.toLocaleString() ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Synapses</span>
            <span>{modelStatus?.n_synapses?.toLocaleString() ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Eyes (fly_eyes)</span>
            <span className={modelStatus?.eyes_loaded ? "text-green" : "text-red"}>
              {modelStatus?.eyes_loaded ? "LOADED" : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Readout</span>
            <span className={modelStatus?.readout_loaded ? "text-green" : "text-secondary-t"}>
              {modelStatus?.readout_loaded
                ? `AUC ${modelStatus.readout_cv_score?.toFixed(3)}`
                : "Decoder fallback"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Encoder</span>
            <span className={modelStatus?.encoder_loaded ? "text-green" : "text-secondary-t"}>
              {modelStatus?.encoder_loaded ? "LEARNED" : "default"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Threshold</span>
            <span>{modelStatus?.threshold?.toFixed(2) ?? "0.55"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Win rate</span>
            <span>
              {modelStatus?.win_rate != null
                ? `${(modelStatus.win_rate * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-t">Total trades</span>
            <span>{modelStatus?.total_trades ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Decision Distribution */}
      <div className="rounded-lg border border-a10-b bg-surface-a3 p-4">
        <h3 className="font-mono text-xs uppercase tracking-wider text-secondary-t mb-3">
          Recent Decisions (last 10)
        </h3>
        <div className="space-y-3">
          <DecisionBar
            label="BUY (DNg100 forward)"
            count={buyCount}
            total={recentSignals.length || 1}
            color={MODALITY_COLORS.buy}
          />
          <DecisionBar
            label="SELL (DNp01 escape)"
            count={sellCount}
            total={recentSignals.length || 1}
            color={MODALITY_COLORS.sell}
          />
          <DecisionBar
            label="HOLD (MDN backward)"
            count={holdCount}
            total={recentSignals.length || 1}
            color={MODALITY_COLORS.hold}
          />
        </div>
      </div>

      {/* Recent Signals */}
      <div className="rounded-lg border border-a10-b bg-surface-a3 p-4 lg:col-span-2">
        <h3 className="font-mono text-xs uppercase tracking-wider text-secondary-t mb-3">
          Recent Neural Signals
        </h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {recentSignals.length === 0 ? (
            <p className="text-secondary-t text-sm font-mono">No signals yet</p>
          ) : (
            recentSignals.map((sig) => (
              <div
                key={sig.id}
                className="flex items-center gap-3 text-sm font-mono py-1 border-b border-a5-b"
              >
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{
                    backgroundColor:
                      sig.decision === "BUY"
                        ? MODALITY_COLORS.buy + "20"
                        : sig.decision === "SELL"
                          ? MODALITY_COLORS.sell + "20"
                          : MODALITY_COLORS.hold + "20",
                    color:
                      sig.decision === "BUY"
                        ? MODALITY_COLORS.buy
                        : sig.decision === "SELL"
                          ? MODALITY_COLORS.sell
                          : MODALITY_COLORS.hold,
                  }}
                >
                  {sig.decision}
                </span>
                <span className="text-secondary-t text-xs flex-1 truncate">{sig.reason}</span>
                <span className="text-secondary-t text-xs">
                  {new Date(sig.created_at * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Open Positions */}
      {positions.length > 0 && (
        <div className="rounded-lg border border-a10-b bg-surface-a3 p-4 lg:col-span-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-secondary-t mb-3">
            Paper Trading Positions
          </h3>
          <div className="space-y-2">
            {positions.map((pos, i) => (
              <div
                key={i}
                className="flex items-center gap-4 text-sm font-mono py-1 border-b border-a5-b"
              >
                <span className="font-bold">{pos.token_symbol}</span>
                <span className="text-secondary-t">
                  ${pos.entry_price.toFixed(6)} → ${pos.current_price.toFixed(6)}
                </span>
                <span
                  className={pos.pnl_percent >= 0 ? "text-green" : "text-red"}
                >
                  {pos.pnl_percent >= 0 ? "+" : ""}
                  {pos.pnl_percent.toFixed(2)}%
                </span>
                <span className="text-secondary-t text-xs">
                  ${pos.allocation.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = (count / total) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm font-mono mb-1">
        <span className="text-secondary-t">{label}</span>
        <span>
          {count}/{total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-a5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
