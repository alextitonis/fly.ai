import { Link } from "react-router-dom";
import { TrendingUp, Loader2 } from "lucide-react";
import { useMarkets } from "../hooks/useContracts";

const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "K";
  }
  return num ? num.toFixed(0) : "0";
};

const formatCurrency = (num) => {
  return "$" + formatNumber(Number(num));
};

const ProbabilityBar = ({ yesPercentage }) => {
  // Ensure yesPercentage is a number
  const yes = Number(yesPercentage) || 0;
  const no = 100 - yes;

  return (
    <div className="space-y-2">
      <div className="probability-bar">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
          style={{ width: `${yes}%` }}
        />
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="text-emerald-400 font-semibold">
          YES {yes.toFixed(0)}%
        </span>
        <span className="text-red-400 font-semibold">NO {no.toFixed(0)}%</span>
      </div>
    </div>
  );
};

const MarketCard = ({ market }) => {
  // Calculate percentage from price or pool if not explicitly provided in percentage field
  // The hook returns priceYes which is 0-1. Convert to percentage.
  const percentage = market.priceYes ? (market.priceYes * 100) : 50;

  return (
    <Link to={`/market/${market.address}`}>
      <div className="market-card h-full animate-slide-up">
        {/* Header with status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${market.state === "OPEN" ? "bg-emerald-500" : "bg-slate-500"
                }`}
            />
            <span className={`status-badge ${market.state === "OPEN" ? "status-open" : "status-resolved"
              }`}>
              {market.state}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-white font-semibold text-sm mb-4 line-clamp-2">
          {market.title}
        </h3>

        {/* Probability Bar */}
        <div className="mb-4">
          <ProbabilityBar yesPercentage={percentage} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500 mb-1">Liquidity</p>
            <p className="text-white font-semibold">
              {formatCurrency(market.liquidity)}
            </p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Deadline</p>
            <p className="text-white font-semibold">
              {new Date(market.deadline * 1000).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default function Markets() {
  const { data: markets, isLoading } = useMarkets();

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8 text-indigo-500" />
            <span className="text-indigo-400 text-sm font-semibold">
              PREDICTION MARKETS
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 max-w-2xl">
            Trade on outcomes
          </h1>
          <p className="text-slate-400 text-lg max-w-xl">
            Explore hundreds of prediction markets. Buy YES or NO on events
            that matter to you.
          </p>
        </div>
      </section>

      {/* Markets Grid */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 flex justify-center py-20">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            ) : markets && markets.length > 0 ? (
              markets.map((market) => (
                <MarketCard key={market.address} market={market} />
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-20">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="text-slate-500" size={32} />
                </div>
                <h3 className="text-white text-lg font-medium mb-2">No markets found</h3>
                <p className="text-slate-400">There are no active prediction markets at the moment.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
