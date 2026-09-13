/**
 * 5H1T Overview Page — replaces 5H1T overview.
 * Composes vendored OSS components with live API data. No stubs.
 */
import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FiveHitLogo } from "@/components/5h1t-logo";
import { useApi, toTraderSummaries, type Connectome, type Governance, type FlyaiPoint, type Treasury } from "@/lib/5h1t-api";
import { ConnectomeViewer3D, type BrainData } from "@/components/connectome-viewer-3d";
import LeaderboardTable from "@/vendor/nofyai/components/competition/LeaderboardTable";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "https://api-worker.hardwoodstablecoin.workers.dev";

const SPECIES_EMOJI: Record<string, string> = {
  celegans: "🪱", drosophila: "🪰", human: "🧠", macaque: "🐒",
  mouse: "🐭", rat: "🐀", malecns: "🪰", hemibrain: "🪰",
};

export function FiveHitOverviewPage() {
  const [selectedId, setSelectedId] = useState<string>("celegans");
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const { data: connectomes } = useApi<Connectome[]>("/api/connectomes");
  const { data: governance } = useApi<Governance>("/api/governance");
  const { data: flyai } = useApi<FlyaiPoint[]>("/api/flyai", 30000);
  const { data: treasury } = useApi<Treasury>("/api/treasury", 30000);

  const traders = connectomes ? toTraderSummaries(connectomes, governance) : [];
  // Build chart data — use FLYAI balance (treasury value) as the primary series
  // since price_usd is often 0 (price API hasn't synced). Only include price
  // line when we actually have non-zero price data.
  const flyaiChart = flyai
    ? flyai.slice().reverse()
        .filter(p => p.balance > 0) // skip any zero-balance outliers
        .map(p => ({
          time: new Date(p.updated_at * 1000).toLocaleTimeString(),
          balance: p.balance,
          price: p.price_usd > 0 ? p.price_usd : null,
        }))
    : [];
  const hasPriceData = flyaiChart.some(p => p.price !== null);
  const totalNeurons = connectomes?.reduce((s, c) => s + c.n_neurons, 0) ?? 0;
  const totalSynapses = connectomes?.reduce((s, c) => s + c.n_synapses, 0) ?? 0;

  // Fetch brain data for the selected connectome
  useEffect(() => {
    if (!selectedId) return;
    fetch(`${API_BASE}/api/connectome/${selectedId}/brain`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: BrainData | null) => setBrainData(data))
      .catch(() => setBrainData(null));
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-[#07090c] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="flex items-center gap-4 mb-8">
          <FiveHitLogo size={56} />
          <div>
            <h1 className="font-mono text-3xl md:text-5xl font-bold tracking-tight">5H1T</h1>
            <p className="text-gray-400 mt-1">16 real biological connectomes trading a shared treasury</p>
          </div>
        </div>

        {/* Live stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active Brains" value={connectomes?.length?.toString() ?? "—"} />
          <StatCard label="Total Neurons" value={totalNeurons.toLocaleString()} />
          <StatCard label="Total Synapses" value={totalSynapses.toLocaleString()} />
          <StatCard label="FLYAI Price" value={`$${treasury?.flyai_price_usd?.toFixed(7) ?? "—"}`} />
        </div>

        {/* 3D Brain Visualization with species selector */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">Connectome Brain Map — Real Neurons & Synapses</h2>
          {/* Species selector */}
          <div className="flex flex-wrap gap-2 mb-3">
            {connectomes?.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-xs transition-all ${
                  selectedId === c.id
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
                }`}
              >
                <span>{SPECIES_EMOJI[c.id] ?? "🧠"}</span>
                <span>{c.id}</span>
                <span className="opacity-50">{c.n_neurons.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-gray-800 bg-[#0a0d12] overflow-hidden" style={{ height: "500px" }}>
            <ConnectomeViewer3D data={brainData} decision={null} />
          </div>
        </section>

        {/* Trader Leaderboard */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">Connectome Leaderboard</h2>
          <LeaderboardTable traders={traders} />
        </section>

        {/* Treasury + Governance */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <section>
            <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">FLYAI Treasury</h2>
            <div className="rounded-xl border border-gray-800 bg-[#0a0d12] p-4">
              {flyaiChart.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-mono text-xs uppercase text-gray-500">FLYAI Balance</div>
                      <div className="font-mono text-lg text-emerald-400">{treasury?.flyai_balance?.toFixed(6) ?? "—"} FLYAI</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs uppercase text-gray-500">Floor Price</div>
                      <div className="font-mono text-lg text-gray-300">${treasury?.shit_floor_price?.toFixed(7) ?? "0"}</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={flyaiChart}>
                      <defs><linearGradient id="flyaiGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6cf08a" stopOpacity={0.4} /><stop offset="100%" stopColor="#6cf08a" stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="time" tick={{ fill: "#8793a0", fontSize: 10 }} fontFamily="monospace" />
                      <YAxis tick={{ fill: "#8793a0", fontSize: 10 }} fontFamily="monospace" domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#0a0d12", border: "1px solid #333", borderRadius: "8px" }} labelStyle={{ color: "#8793a0" }} />
                      <Area type="monotone" dataKey="balance" stroke="#6cf08a" strokeWidth={2} fill="url(#flyaiGrad)" name="FLYAI Balance" />
                      {hasPriceData && (
                        <Area type="monotone" dataKey="price" stroke="#3ed8ff" strokeWidth={1} fill="none" name="Price USD" connectNulls />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              ) : <EmptyState text="Loading FLYAI treasury data..." />}
            </div>
          </section>
          <section>
            <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">Governance Wallets</h2>
            <div className="space-y-3">
              {governance && <WalletCard name="Global (majority vote)" w={governance.global} />}
              {governance && <WalletCard name="Meta (AUC-weighted)" w={governance.meta} />}
            </div>
          </section>
        </div>

        {/* How it works */}
        <section className="border-t border-gray-800 pt-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-4">How it works</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { n: "1", t: "Connectomes process market data", d: "16 real biological brains (C. elegans, fly, human, etc.) receive market signals as sensory input" },
              { n: "2", t: "Neural decisions drive paper trades", d: "Each connectome's neural activity produces BUY/SELL/HOLD signals executed in paper trading" },
              { n: "3", t: "Readout weights learn from results", d: "Exploration trades update each connectome's readout — the brains literally learn to trade" },
            ].map(s => (
              <div key={s.n} className="border border-gray-800 rounded-xl bg-[#0a0d12] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="size-6 rounded-full bg-green-500/20 text-green-400 font-mono text-xs flex items-center justify-center">{s.n}</span>
                  <span className="font-mono text-xs uppercase text-green-400">{s.t}</span>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0a0d12] p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="font-mono text-lg mt-1">{value}</div>
    </div>
  );
}

function WalletCard({ name, w }: { name: string; w: any }) {
  if (!w) return null;
  const pnl = (w.balance_usd || 0) - (w.starting_balance || 0);
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0a0d12] p-4">
      <div className="text-sm text-gray-400">{name}</div>
      <div className="text-xl font-bold mt-1">${(w.balance_usd || 0).toFixed(4)}</div>
      <div className={`text-sm ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} P&L</div>
      <div className="text-xs text-gray-500 mt-1">{w.n_trades || 0} trades</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-48 text-gray-500 text-sm font-mono">{text}</div>;
}
