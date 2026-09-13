/**
 * 5H1T Brain Page — real 3D connectome visualization.
 * Shows actual neuron positions, synapses, and motor group decision tree
 * (BUY/SELL/HOLD) for each species. Fetches brain data from R2 via API.
 */
import { useState, useEffect } from "react";
import { useApi, type Connectome, type Signal } from "@/lib/5h1t-api";
import { ConnectomeViewer3D, type BrainData } from "@/components/connectome-viewer-3d";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "https://api-worker.YOUR-SUBDOMAIN.workers.dev";

const SPECIES_IMAGES: Record<string, string> = {
  celegans: "🪱", celegans_herm: "🪱", celegans_male: "🪱",
  ciona: "🦐", drosophila: "🪰", hemibrain: "🪰", larva: "🐛",
  human: "🧠", macaque: "🐒", macaque_modha: "🐒",
  malecns: "🪰", medulla: "🪰", mouse: "🐭", mouse_retina: "🐭",
  platynereis: "🪱", rat: "🐀",
};

const SPECIES_NAMES: Record<string, string> = {
  celegans: "C. elegans (Nematode)", celegans_herm: "C. elegans Hermaphrodite", celegans_male: "C. elegans Male",
  ciona: "C. intestinalis (Sea Squirt)", drosophila: "D. melanogaster (Fruit Fly)",
  hemibrain: "D. melanogaster Hemibrain", human: "H. sapiens (Human)",
  larva: "D. melanogaster Larva", macaque: "M. mulatta (Macaque)",
  macaque_modha: "M. mulatta (Modha)", malecns: "D. melanogaster MaleCNS",
  medulla: "D. melanogaster Medulla", mouse: "M. musculus (Mouse)",
  mouse_retina: "M. musculus Retina", platynereis: "P. dumerilii (Marine Worm)",
  rat: "R. norvegicus (Rat)",
};

export function FiveHitBrainPage() {
  const { data: connectomes } = useApi<Connectome[]>("/api/connectomes");
  const { data: signals } = useApi<Signal[]>("/api/signals");
  const [selectedId, setSelectedId] = useState<string>("celegans");
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch brain data when connectome changes
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/connectome/${selectedId}/brain`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load ${selectedId}`);
        return res.json() as Promise<BrainData>;
      })
      .then((data) => { setBrainData(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [selectedId]);

  // Get latest decision for this connectome from signals
  const latestSignal = signals?.find((s) => s.neural_activity && brainData);
  const activeDecision = latestSignal?.decision?.toLowerCase() ?? null;
  const selectedConnectome = connectomes?.find((c) => c.id === selectedId);

  return (
    <div className="min-h-screen bg-[#07090c] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="font-mono text-2xl font-bold mb-2">Connectome Brain Map</h1>
        <p className="text-gray-400 mb-6">Real neuron positions, synapses, and motor group decision tree for each species. Every dot is a real neuron; every line is a real synapse.</p>

        {/* Species selector */}
        <div className="flex flex-wrap gap-2 mb-6">
          {connectomes?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                selectedId === c.id
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
              }`}
            >
              <span className="text-lg">{SPECIES_IMAGES[c.id] ?? "🧠"}</span>
              <div className="text-left">
                <div className="font-bold">{c.id}</div>
                <div className="text-[10px] opacity-60">{c.n_neurons.toLocaleString()} neurons</div>
              </div>
            </button>
          ))}
        </div>

        {/* Species info + 3D viewer side by side */}
        <div className="grid lg:grid-cols-[300px_1fr] gap-6">
          {/* Species info panel */}
          <div className="space-y-4">
            {selectedConnectome && (
              <div className="rounded-xl border border-gray-800 bg-[#0a0d12] p-5">
                <div className="text-6xl mb-3">{SPECIES_IMAGES[selectedConnectome.id] ?? "🧠"}</div>
                <h2 className="font-mono text-lg font-bold">{SPECIES_NAMES[selectedConnectome.id] ?? selectedConnectome.id}</h2>
                <p className="text-gray-500 text-xs mt-1">{selectedConnectome.source}</p>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Stat label="Neurons" value={selectedConnectome.n_neurons.toLocaleString()} />
                  <Stat label="Synapses" value={selectedConnectome.n_synapses.toLocaleString()} />
                  <Stat label="Resolution" value={selectedConnectome.resolution} />
                  <Stat label="Status" value={selectedConnectome.status} />
                  <Stat label="Balance" value={`$${selectedConnectome.balance_usd.toFixed(4)}`} />
                  <Stat label="P&L" value={`$${selectedConnectome.total_pnl.toFixed(4)}`} />
                </div>
              </div>
            )}

            {/* Active decision tree */}
            <div className="rounded-xl border border-gray-800 bg-[#0a0d12] p-5">
              <h3 className="font-mono text-sm uppercase text-gray-400 mb-3">Decision Tree</h3>
              <div className="space-y-2">
                <DecisionNode label="BUY" color="#00ff88" active={activeDecision === "buy"} count={brainData?.motor_groups.buy.length ?? 0} />
                <DecisionNode label="SELL" color="#ff4444" active={activeDecision === "sell"} count={brainData?.motor_groups.sell.length ?? 0} />
                <DecisionNode label="HOLD" color="#ffaa00" active={activeDecision === "hold"} count={brainData?.motor_groups.hold.length ?? 0} />
              </div>
              {latestSignal && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="text-xs text-gray-500">Latest Signal</div>
                  <div className="font-mono text-sm mt-1">
                    <span className={activeDecision === "buy" ? "text-emerald-400" : activeDecision === "sell" ? "text-red-400" : "text-amber-400"}>
                      {latestSignal.decision}
                    </span>
                    <span className="text-gray-500 ml-2">conf: {(latestSignal.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{latestSignal.reason}</div>
                </div>
              )}
            </div>
          </div>

          {/* 3D viewer */}
          <div className="rounded-xl border border-gray-800 bg-[#0a0d12] overflow-hidden" style={{ height: "70vh", minHeight: "500px" }}>
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
                Loading {selectedId} connectome...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-400 font-mono text-sm">
                Error: {error}
              </div>
            ) : (
              <ConnectomeViewer3D data={brainData} decision={activeDecision} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase text-gray-500">{label}</div>
      <div className="font-mono text-sm mt-0.5">{value}</div>
    </div>
  );
}

function DecisionNode({ label, color, active, count }: { label: string; color: string; active: boolean; count: number }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
        active ? "scale-105" : "opacity-60"
      }`}
      style={{
        borderColor: active ? color : "#333",
        background: active ? `${color}15` : "transparent",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ background: color, boxShadow: active ? `0 0 8px ${color}` : "none" }} />
        <span className="font-mono text-sm font-bold" style={{ color: active ? color : "#888" }}>{label}</span>
      </div>
      <span className="font-mono text-xs text-gray-500">{count} neurons</span>
    </div>
  );
}
