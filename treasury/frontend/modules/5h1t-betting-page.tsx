/**
 * 5H1T Betting Page — prediction market for connectome performance.
 * Uses live POST endpoints to place bets, stakes, and copy trades. No stubs.
 */
import { useState } from "react";
import { useApi, type Connectome, type Governance } from "@/lib/5h1t-api";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "https://api-worker.YOUR-SUBDOMAIN.workers.dev";

export function FiveHitBettingPage() {
  const { data: connectomes } = useApi<Connectome[]>("/api/connectomes");
  const { data: governance } = useApi<Governance>("/api/governance");
  const [userAddress, setUserAddress] = useState("");
  const [betAmount, setBetAmount] = useState("10");
  const [status, setStatus] = useState<string | null>(null);

  async function postAction(path: string, body: Record<string, any>) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setStatus(data.status === "placed" || data.status === "staked" || data.status === "copying" || data.status === "stopped" || data.status === "created"
        ? `✓ ${data.status}: ${data.connectome_id ?? ""} ${data.amount ?? ""}`.trim()
        : `✗ ${data.error || "failed"}`);
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : "request failed"}`);
    }
  }

  function handleBet(connectomeId: string, action: "bet" | "stake" | "copy") {
    if (!userAddress) { setStatus("✗ Enter your wallet address first"); return; }
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) { setStatus("✗ Enter a valid amount"); return; }
    if (action === "bet") postAction("/api/betting/place-bet", { user_address: userAddress, round_id: 1, connectome_id: connectomeId, amount });
    else if (action === "stake") postAction("/api/betting/stake", { user_address: userAddress, connectome_id: connectomeId, amount });
    else if (action === "copy") postAction("/api/betting/copy", { user_address: userAddress, connectome_id: connectomeId, amount });
  }

  return (
    <div className="min-h-screen bg-[#07090c] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="font-mono text-2xl font-bold mb-2">Bet on Connectomes</h1>
        <p className="text-gray-400 mb-6">Prediction markets on connectome trader performance. Stake 5H1T on which brain trades best next epoch. No fees. Settled on-chain.</p>

        {/* User controls */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="text"
            placeholder="Your wallet address (0x...)"
            value={userAddress}
            onChange={e => setUserAddress(e.target.value)}
            className="flex-1 min-w-[300px] rounded-lg border border-gray-700 bg-[#0a0d12] px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:border-green-500 focus:outline-none"
          />
          <input
            type="number"
            placeholder="Amount"
            value={betAmount}
            onChange={e => setBetAmount(e.target.value)}
            className="w-32 rounded-lg border border-gray-700 bg-[#0a0d12] px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:border-green-500 focus:outline-none"
          />
        </div>
        {status && <div className="mb-4 font-mono text-sm text-gray-300">{status}</div>}

        {/* Active round */}
        <section className="mb-8">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-xs uppercase text-emerald-400">Active Round</span>
            </div>
            <p className="text-gray-300 text-sm mt-2">Bet on which connectome will have the best P&L next epoch. No fees. Settled on-chain.</p>
          </div>

          {/* Market cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectomes?.map(c => (
              <MarketCard key={c.id} connectome={c} onBet={handleBet} />
            ))}
          </div>
        </section>

        {/* Governance wallets */}
        {governance && (
          <section>
            <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">Collective Wallets</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <WalletCard name="Global Wallet (majority vote)" w={governance.global} />
              <WalletCard name="Meta Wallet (AUC-weighted)" w={governance.meta} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MarketCard({ connectome: c, onBet }: { connectome: Connectome; onBet: (id: string, action: "bet" | "stake" | "copy") => void }) {
  const pnlPct = c.balance_usd > 0 ? (c.total_pnl / c.balance_usd) * 100 : 0;
  const winPct = (c.win_rate || 0) * 100;
  return (
    <div className="market-card rounded-xl border border-gray-800 bg-[#0a0d12] p-5 hover:border-emerald-500/40 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-mono font-bold text-sm">{c.id}</h3>
          <p className="text-gray-500 text-xs">{c.species}</p>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-mono ${c.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-700 text-gray-400"}`}>
          {c.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-4">
        <div><p className="text-gray-500">Balance</p><p className="text-white">${c.balance_usd.toFixed(4)}</p></div>
        <div><p className="text-gray-500">P&L</p><p className={c.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{c.total_pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</p></div>
        <div><p className="text-gray-500">Trades</p><p className="text-white">{c.n_trades || 0}</p></div>
        <div><p className="text-gray-500">Win Rate</p><p className="text-white">{winPct.toFixed(0)}%</p></div>
      </div>
      <div className="mb-3">
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.max(winPct, 5)}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-emerald-400 font-mono">YES {winPct.toFixed(0)}%</span>
          <span className="text-red-400 font-mono">NO {(100 - winPct).toFixed(0)}%</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onBet(c.id, "bet")} className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-mono text-white transition-colors">Bet YES</button>
        <button onClick={() => onBet(c.id, "stake")} className="flex-1 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-2 text-xs font-mono text-white transition-colors">Stake</button>
        <button onClick={() => onBet(c.id, "copy")} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-mono text-white transition-colors">Copy</button>
      </div>
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
      <div className={`text-sm ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} P&L</div>
      <div className="text-xs text-gray-500 mt-1">{w.n_trades || 0} trades</div>
    </div>
  );
}
