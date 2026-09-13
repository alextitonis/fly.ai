import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, Gavel, Coins, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useMarketDetails, useTrade, useApproveMUSD, useAllowance, useUserBalances, useMUSDBalance, useAdminResolve, useRedeem, useTokenAllowance, useApproveToken } from "../hooks/useContracts";
import { useAccount } from "wagmi";
import { maxUint256, parseEther } from "viem";

const formatCurrency = (num) => {
  return "$" + Number(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const StatCard = ({
  label,
  value,
  subtext,
}) => (
  <div className="stat-card">
    <p className="text-slate-500 text-xs font-medium mb-2">{label}</p>
    <p className="text-white text-lg font-bold">{value}</p>
    {subtext && <p className="text-slate-400 text-xs mt-1">{subtext}</p>}
  </div>
);

const CountdownTimer = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = (deadline * 1000) - Date.now();
      if (difference > 0) {
        return {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }
      return null; // Expired
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const left = calculateTimeLeft();
      setTimeLeft(left);
      if (!left) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  if (!timeLeft) {
    return <span className="text-red-400 font-bold flex items-center gap-1"><Clock size={14} /> Ended</span>;
  }

  return (
    <span className="text-indigo-400 font-mono font-medium flex items-center gap-2">
      <Clock size={16} />
      {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
    </span>
  );
};

const AdminPanel = ({ marketAddress, isActive, onResolve, isPending, state }) => {
  if (!isActive) return null;

  return (
    <div className="bg-card rounded-lg p-6 mt-6" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <Gavel className="text-yellow-400" size={20} />
        Admin Controls
      </h3>
      <p className="text-slate-400 text-sm mb-4">
        The market deadline has passed. Resolve the market to allow redemptions.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => onResolve(1)}
          disabled={isPending}
          className="flex-1 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 rounded hover:bg-emerald-500/20 disabled:opacity-50"
        >
          Resolve YES
        </button>
        <button
          onClick={() => onResolve(0)}
          disabled={isPending}
          className="flex-1 py-2 bg-red-500/10 text-red-400 border border-red-500/50 rounded hover:bg-red-500/20 disabled:opacity-50"
        >
          Resolve NO
        </button>
      </div>
      {isPending && <p className="text-center text-xs text-slate-400 mt-2">Resolving...</p>}
    </div>
  );
};

const RedeemPanel = ({ marketAddress, userBalances, outcome, onRedeem, isPending, yesTokenAddr, noTokenAddr }) => {
  if (!userBalances) return null;

  // Determine if user has winning shares
  // outcome 1 = YES, outcome 0 = NO
  // Precise Calculation for Logic
  const winningBalanceRaw = outcome === 1
    ? (userBalances.yesRaw || parseEther(userBalances.yes || "0").toString())
    : (userBalances.noRaw || parseEther(userBalances.no || "0").toString());

  // Visual Display (Approximate)
  const winningShares = parseFloat(outcome === 1 ? userBalances.yes : userBalances.no);
  const winningTokenAddr = outcome === 1 ? yesTokenAddr : noTokenAddr;
  const hasWinnings = winningShares > 0.001;

  const { data: allowanceData } = useTokenAllowance(winningTokenAddr);
  const { approve, isPending: isApproving } = useApproveToken();

  // Strict BigInt Check
  const allowanceRaw = allowanceData?.valueRaw ? BigInt(allowanceData.valueRaw) : 0n;
  const requiredRaw = BigInt(winningBalanceRaw);
  const hasAllowance = allowanceRaw >= requiredRaw;

  if (!hasWinnings) return null;

  return (
    <div className="bg-card rounded-lg p-6 mt-6" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <Coins className="text-emerald-400" size={20} />
        Redeem Winnings
      </h3>
      <div className="bg-emerald-500/10 p-4 rounded-lg mb-4">
        <p className="text-emerald-400 text-sm mb-1">You won!</p>
        <p className="text-white font-bold text-lg">{winningShares.toFixed(2)} mUSD</p>
      </div>

      {!hasAllowance ? (
        <button
          onClick={() => approve(winningTokenAddr, maxUint256)}
          disabled={isApproving}
          className="w-full py-3 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
        >
          {isApproving && <Loader2 className="animate-spin" size={18} />}
          {isApproving ? "Approving..." : "Approve Redemption"}
        </button>
      ) : (
        <button
          onClick={() => {
            // Pass the EXACT raw BigInt balance to the contract
            // We convert the string raw balance to BigInt first to bypass parseEther in the hook
            const amountYesRaw = outcome === 1 ? BigInt(winningBalanceRaw) : 0n;
            const amountNoRaw = outcome === 0 ? BigInt(winningBalanceRaw) : 0n;
            onRedeem(marketAddress, amountYesRaw, amountNoRaw);
          }}
          disabled={isPending}
          className="w-full py-3 bg-emerald-500 text-black font-semibold rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
        >
          {isPending && <Loader2 className="animate-spin" size={18} />}
          {isPending ? "Redeeming..." : "Redeem Collateral"}
        </button>
      )
      }
    </div >
  );
};

const TradingPanel = ({ marketAddress, priceYes, priceNo, isExpired }) => {
  const [activeTab, setActiveTab] = useState("buy");
  const [selectedOutcome, setSelectedOutcome] = useState("yes"); // Default to yes
  const [amount, setAmount] = useState("");

  const { approve, isPending: isApproving } = useApproveMUSD();
  const { buyYes, buyNo, isPending: isTrading, isSuccess: isTradeSuccess } = useTrade();
  const { data: allowance } = useAllowance();
  const { data: userBalances } = useUserBalances(marketAddress);
  const { data: musdBalance } = useMUSDBalance();
  const { isConnected } = useAccount();

  useEffect(() => {
    if (isTradeSuccess) {
      setAmount("");
    }
  }, [isTradeSuccess]);

  const hasAllowance = allowance && parseFloat(allowance) >= parseFloat(amount || "0");
  const price = selectedOutcome === 'yes' ? priceYes : priceNo;

  const handleApprove = () => {
    approve(amount);
  };

  const handleTrade = () => {
    if (!amount) return;
    if (selectedOutcome === 'yes') {
      buyYes(marketAddress, amount, priceYes);
    } else {
      buyNo(marketAddress, amount, priceNo);
    }
  };

  const estimatedShares = amount && price > 0
    ? (parseFloat(amount) / price).toFixed(2)
    : "0";

  // ROI: If price is 0.5, ROI is 2x (100%). If price is 0.25, ROI is 4x (300%).
  // Return = 1/price
  const roiMultiplier = price > 0 ? (1 / price) : 0;
  const potentialROI = amount ? (parseFloat(amount) * roiMultiplier).toFixed(2) : "0";
  const roiPercent = price > 0 ? ((roiMultiplier - 1) * 100).toFixed(0) : 0;

  if (isExpired) {
    return (
      <div className="bg-card rounded-lg p-6 sticky top-20 text-center py-12" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
        <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h3 className="text-slate-400 font-medium">Trading Ended</h3>
        <p className="text-slate-500 text-sm mt-2">This market has reached its deadline.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-6 sticky top-20" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-secondary rounded-lg p-1">
        {["buy"].map((tab) => ( // Sell not implemented in UI yet for simplicity, but hook supports it if we want
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded text-sm font-medium transition-all ${activeTab === tab
              ? "bg-primary text-black"
              : "text-slate-400 hover:text-white"
              }`}
          >
            Buy Position
          </button>
        ))}
      </div>

      {/* Outcome Selection */}
      <p className="text-slate-400 text-sm mb-3 font-medium">Choose Outcome</p>
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setSelectedOutcome("yes")}
          className={`outcome-btn outcome-yes ${selectedOutcome === "yes" ? "active" : ""
            }`}
        >
          YES
          <span className="block text-xs mt-1 font-normal opacity-70">
            ${priceYes.toFixed(2)}
          </span>
        </button>
        <button
          onClick={() => setSelectedOutcome("no")}
          className={`outcome-btn outcome-no ${selectedOutcome === "no" ? "active" : ""
            }`}
        >
          NO
          <span className="block text-xs mt-1 font-normal opacity-70">
            ${priceNo.toFixed(2)}
          </span>
        </button>
      </div>

      {/* Amount Input */}
      <div className="flex justify-between mb-2">
        <p className="text-slate-400 text-sm font-medium">Amount (mUSD)</p>
        <p className="text-slate-400 text-xs">Bal: {musdBalance ? parseFloat(musdBalance).toFixed(2) : "0.00"}</p>
      </div>
      <div className="flex gap-2 mb-6">
        <input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-input"
        />
        <button
          onClick={() => setAmount(musdBalance || "0")}
          className="px-4 py-2.5 bg-secondary rounded-lg text-white text-sm font-medium transition-all" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
          Max
        </button>
      </div>

      {/* Order Summary */}
      {selectedOutcome && amount && (
        <div className="bg-secondary rounded-lg p-4 mb-6 space-y-3" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Est. Shares</span>
            <span className="text-white font-medium">{estimatedShares}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Price per Share</span>
            <span className="text-white font-medium">
              ${price.toFixed(2)}
            </span>
          </div>
          <div className="pt-3 flex justify-between text-sm" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <span className="text-slate-400">Potential ROI</span>
            <div className="text-right">
              <div className="text-emerald-400 font-semibold">{formatCurrency(parseFloat(potentialROI))}</div>
              <div className="text-emerald-400/70 text-xs">+{roiPercent}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!isConnected ? (
        <button
          disabled
          className="w-full py-3 bg-secondary text-slate-400 font-semibold rounded-lg cursor-not-allowed"
        >
          Connect Wallet to Trade
        </button>
      ) : hasAllowance ? (
        <button
          onClick={handleTrade}
          disabled={!selectedOutcome || !amount || isTrading}
          className={`w-full py-3 font-semibold rounded-lg transition-all ${selectedOutcome === "yes"
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30"
            : "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
            } disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2`}
        >
          {isTrading && <Loader2 className="animate-spin" size={18} />}
          {isTrading ? "Trading..." : `Buy ${selectedOutcome.toUpperCase()}`}
        </button>
      ) : (
        <button
          onClick={handleApprove}
          disabled={!amount || isApproving}
          className="w-full py-3 bg-primary text-black font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
        >
          {isApproving && <Loader2 className="animate-spin" size={18} />}
          {isApproving ? "Approving..." : "Approve mUSD"}
        </button>
      )}
    </div>
  );
};

export default function Market() {
  const { id: marketAddress } = useParams(); // Using address as ID directly
  const navigate = useNavigate();
  const { data: market, isLoading } = useMarketDetails(marketAddress);
  const { data: userBalances } = useUserBalances(marketAddress);
  const { address } = useAccount();

  const { resolve, isPending: isResolving } = useAdminResolve();
  const { redeem, isPending: isRedeeming } = useRedeem();

  const yesPercentage = market ? (market.priceYes * 100) : 50;
  const noPercentage = 100 - yesPercentage;

  const isAdmin = market && address && market.admin && market.admin.toLowerCase() === address.toLowerCase();

  // Create a live expired state
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (market) {
      // Init check
      setIsExpired(Date.now() / 1000 >= market.deadline);

      // Interval check every minute
      const interval = setInterval(() => {
        setIsExpired(Date.now() / 1000 >= market.deadline);
      }, 1000); // Check every second to be precise for the UI transition
      return () => clearInterval(interval);
    }
  }, [market]);

  const isResolved = market && market.state === 'RESOLVED';

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        {!market ? (
          <div className="text-center py-20">
            <h2 className="text-white text-xl font-bold mb-2">Market Not Found</h2>
            <p className="text-slate-400">The market you are looking for does not exist.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {market.title || "Untitled Market"}
              </h1>
              {/* Note: Title/Desc not in getMarketDetails currently, would need metadata call or pass via state. 
                  For now showing generic or fetching metadata if possible. 
                  Actually useContracts fetches metadata for all markets, but useMarketDetails only fetches struct. 
                  Ideally we'd fetch metadata here too or pass it. 
                  Let's assume simple display for now.
              */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-sm">Status:</span>
                  <span className={`text-sm font-medium ${isResolved ? "text-emerald-400" : "text-slate-300"}`}>
                    {market.state}
                  </span>
                </div>
                <div className="pill-btn border-indigo-500/30 text-indigo-400">
                  <CountdownTimer deadline={market.deadline} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-8">
                {/* Price Visualizer */}
                <div className="bg-card rounded-lg p-8" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <h2 className="text-white font-semibold mb-6">Market Prices</h2>
                  <div className="flex items-end justify-center gap-12 mb-8">
                    {/* YES Bar */}
                    <div className="text-center">
                      <div className="mb-4 flex flex-col items-center">
                        <div
                          className="w-16 bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t transition-all"
                          style={{ height: `${Math.max(yesPercentage * 2, 20)}px` }}
                        />
                      </div>
                      <p className="text-emerald-400 font-bold text-xl mb-2">
                        {yesPercentage.toFixed(1)}%
                      </p>
                      <p className="text-slate-400 text-sm">YES Price: ${market.priceYes.toFixed(2)}</p>
                    </div>

                    {/* NO Bar */}
                    <div className="text-center">
                      <div className="mb-4 flex flex-col items-center">
                        <div
                          className="w-16 bg-gradient-to-t from-red-500 to-red-400 rounded-t transition-all"
                          style={{ height: `${Math.max(noPercentage * 2, 20)}px` }}
                        />
                      </div>
                      <p className="text-red-400 font-bold text-xl mb-2">
                        {noPercentage.toFixed(1)}%
                      </p>
                      <p className="text-slate-400 text-sm">NO Price: ${market.priceNo.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    label="YES Pool"
                    value={formatCurrency(market.reserveYes)}
                    subtext="Liquidity"
                  />
                  <StatCard
                    label="NO Pool"
                    value={formatCurrency(market.reserveNo)}
                    subtext="Liquidity"
                  />
                  <StatCard
                    label="Your YES Position"
                    value={userBalances ? parseFloat(userBalances.yes).toFixed(2) : "—"}
                    subtext="shares"
                  />
                  <StatCard
                    label="Your NO Position"
                    value={userBalances ? parseFloat(userBalances.no).toFixed(2) : "—"}
                    subtext="shares"
                  />
                </div>
              </div>

              {/* Sidebar - Trading Panel */}
              <div className="lg:col-span-1">
                {isResolved ? (
                  <RedeemPanel
                    marketAddress={marketAddress}
                    userBalances={userBalances}
                    outcome={market.outcome}
                    onRedeem={redeem}
                    isPending={isRedeeming}
                    yesTokenAddr={market.yesToken}
                    noTokenAddr={market.noToken}
                  />
                ) : (
                  <TradingPanel
                    marketAddress={marketAddress}
                    priceYes={market.priceYes}
                    priceNo={market.priceNo}
                    isExpired={isExpired}
                  />
                )}

                <AdminPanel
                  marketAddress={marketAddress}
                  isActive={isAdmin && isExpired && !isResolved}
                  onResolve={(outcome) => resolve(marketAddress, outcome)}
                  isPending={isResolving}
                  state={market.state}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
