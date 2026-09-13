/**
 * 5H1T Traders Page — connectome leaderboard + equity curves + betting.
 * Combined traders + betting into one page.
 */
import { useState } from "react";
import { useApi, toTraderSummaries, type Connectome, type Governance, type Signal } from "@/lib/5h1t-api";
import LeaderboardTable from "@/vendor/nofyai/components/competition/LeaderboardTable";

const API_BASE = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "https://api-worker.YOUR-SUBDOMAIN.workers.dev";

export function FiveHitTradersPage() {
  const { data: connectomes } = useApi<Connectome[]>("/api/connectomes", 5000);
  const { data: governance } = useApi<Governance>("/api/governance", 15000);
  const { data: signals } = useApi<Signal[]>("/api/signals?limit=20", 10000);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userAddress, setUserAddress] = useState("");
  const [betAmount, setBetAmount] = useState("10");
  const [status, setStatus] = useState<string | null>(null);

  const traders = connectomes ? toTraderSummaries(connectomes, governance) : [];
  const selected = connectomes?.find(c => c.id === selectedId) ?? connectomes?.[0];

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
        <h1 className="font-mono text-2xl font-bold mb-2">Connectome Traders</h1>
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-xs uppercase tracking-wider text-emerald-400">Live — updating every 5s</span>
        </div>
        <p className="text-gray-400 mb-6">16 biological connectomes trading in paper mode. Bet on which brain trades best next epoch. No fees. Settled on-chain.</p>

        {/* Leaderboard */}
        <div className="mb-8" onClick={(e) => {
          const row = (e.target as HTMLElement).closest("tr");
          if (row) {
            const id = row.querySelector("td")?.textContent;
            if (id) setSelectedId(id);
          }
        }}>
          <LeaderboardTable traders={traders} />
        </div>

        {/* Selected trader detail + balance */}
        {selected && (
          <div className="rounded-xl border border-gray-800 bg-[#0a0d12] p-6 mb-8">
            <h2 className="font-mono text-lg font-bold mb-4">{selected.id} — Paper Trading</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Detail label="Cash Balance" value={`$${selected.balance_usd.toFixed(4)}`} />
              <Detail label="Unrealized P&L" value={`${(selected.unrealized_pnl ?? 0) >= 0 ? "+" : ""}$${(selected.unrealized_pnl ?? 0).toFixed(4)}`} color={(selected.unrealized_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
              <Detail label="Total Equity" value={`$${(selected.total_equity ?? selected.balance_usd).toFixed(4)}`} />
              <Detail label="Realized P&L" value={`${selected.total_pnl >= 0 ? "+" : ""}$${selected.total_pnl.toFixed(4)}`} color={selected.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Detail label="Species" value={selected.species} />
              <Detail label="Neurons" value={selected.n_neurons.toLocaleString()} />
              <Detail label="Source" value={selected.source} />
              <Detail label="Status" value={selected.status} color={selected.status === "active" ? "text-emerald-400" : "text-gray-400"} />
            </div>
          </div>
        )}

        {/* Betting controls */}
        <section className="mb-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">Bet on Connectomes</h2>
          <div className="flex flex-wrap gap-3 mb-4">
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

          {/* Active round banner */}
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

        {/* Recent signals */}
        {signals && signals.length > 0 && (
          <section className="mb-8">
            <h2 className="font-mono text-sm uppercase tracking-wider text-gray-400 mb-3">Recent Neural Signals ({signals.length})</h2>
            <div className="rounded-xl border border-gray-800 bg-[#0a0d12] overflow-hidden">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-500">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Decision</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.slice(0, 10).map(s => (
                    <tr key={s.id} className="border-b border-gray-900">
                      <td className="px-4 py-3 text-gray-500">#{s.id}</td>
                      <td className="px-4 py-3">{s.token_address.slice(0, 10)}...</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${s.decision === "BUY" ? "bg-emerald-500/10 text-emerald-400" : s.decision === "SELL" ? "bg-red-500/10 text-red-400" : "bg-gray-700 text-gray-400"}`}>
                          {s.decision}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{(s.confidence * 100).toFixed(0)}%</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(s.created_at * 1000).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="font-mono text-xs uppercase text-gray-500">{label}</div>
      <div className={`font-mono text-sm mt-1 ${color ?? ""}`}>{value}</div>
    </div>
  );
}

function MarketCard({ connectome: c, onBet }: { connectome: Connectome; onBet: (id: string, action: "bet" | "stake" | "copy") => void }) {
  const totalEquity = c.total_equity ?? c.balance_usd;
  const totalPnl = c.total_pnl + (c.unrealized_pnl ?? 0);
  const pnlPct = c.starting_balance > 0 ? (totalPnl / c.starting_balance) * 100 : 0;
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
        <div><p className="text-gray-500">Equity</p><p className="text-white">${totalEquity.toFixed(4)}</p></div>
        <div><p className="text-gray-500">P&L</p><p className={totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>{totalPnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</p></div>
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
