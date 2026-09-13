import { Link } from "react-router-dom";
import { Zap, TrendingUp, Wallet, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useMintMockUSD, useMUSDBalance } from "../hooks/useContracts";

const StatCard = ({
  label,
  value,
  icon: Icon,
  color,
}) => (
  <div className="stat-card">
    <div className="flex items-start justify-between mb-3">
      <p className="text-slate-500 text-xs font-medium">{label}</p>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${color}`}
      >
        {Icon}
      </div>
    </div>
    <p className="text-white text-2xl font-bold">{value}</p>
  </div>
);

export default function Dashboard() {
  const { address } = useAccount();
  const { mint, isPending: isMinting } = useMintMockUSD();
  const { data: musdBalance, isLoading: isBalanceLoading } = useMUSDBalance();

  // Placeholder for real data - Portfolio value would need summing up all position values
  const portfolioValue = "$0.00";
  const activePositions = 0;

  const handleMint = () => {
    mint();
  };

  const formattedBalance = isBalanceLoading
    ? "..."
    : `$${Number(musdBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Profile</h1>
          <p className="text-slate-400">Manage your portfolio and positions</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard
            label="mUSD Balance"
            value={formattedBalance}
            icon={<Wallet size={20} />}
            color="text-blue-400"
          />
        </div>

        {/* Faucet Section */}
        <div className="bg-secondary rounded-lg p-8 mb-12" style={{ border: "1px solid rgba(99, 102, 241, 0.2)" }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
                <Zap size={24} className="text-yellow-400" />
                Testnet Faucet
              </h2>
              <p className="text-slate-400 max-w-xl">
                Mint test mUSD tokens to practice trading. You can mint 1,000 mUSD
                per transaction.
              </p>
            </div>
            <button
              onClick={handleMint}
              disabled={isMinting || !address}
              className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${isMinting || !address
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-indigo-500 text-black hover:opacity-90"
                }`}
            >
              {isMinting && <Loader2 size={16} className="animate-spin" />}
              {isMinting ? "Minting..." : (!address ? "Connect Wallet" : "Mint 1,000 mUSD")}
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h3 className="text-white text-lg font-bold mb-6">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create Market Card */}
            <Link to="/create">
              <div className="market-card h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
                    <TrendingUp size={24} />
                  </div>
                  <ArrowRight size={20} className="text-slate-500" />
                </div>
                <h4 className="text-white font-bold mb-2">Create Market</h4>
                <p className="text-slate-400 text-sm">
                  Deploy your own prediction market and earn fees from trading
                  volume.
                </p>
              </div>
            </Link>

            {/* Explore Markets Card */}
            <Link to="/markets">
              <div className="market-card h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">
                    <Wallet size={24} />
                  </div>
                  <ArrowRight size={20} className="text-slate-500" />
                </div>
                <h4 className="text-white font-bold mb-2">Explore Markets</h4>
                <p className="text-slate-400 text-sm">
                  Browse all available markets and start trading on outcomes that
                  matter.
                </p>
              </div>
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
