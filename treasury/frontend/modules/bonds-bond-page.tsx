import { useState, useEffect, useMemo, useRef } from "react";
import { useReadContract, useChainId, usePublicClient } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { cn } from "@/lib/utils";
import { NumberFlow } from "@/components/ui-number-flow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-tabs";
import { parseUnits, zeroAddress } from "viem";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { BOND_AGGREGATOR_ABI, BOND_AUCTIONEER_ABI, BOND_TELLER_ABI } from "@/abis/ShitBonding";
import { SHIT_PRICE_FEED_ABI } from "@/abis/ShitContracts";
import SHIT_INVERSE_BOND_ABI from "@/abis/ShitInverseBond";
import { useTokenAllowance } from "@/hooks/use-token-allowance";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useTokenApproval } from "@/hooks/use-token-approval";
import { TokenName, TOKENS } from "@/lib/tokens";
import { IMPACT_TOKENS } from "@/lib/impact-tokens";
import { isTestnetMode } from "@/lib/chains";
import { DashboardActions } from "@/components/dashboard-actions";

// ─── Bond hooks ───

// Quote tokens that have been retired (e.g. the old USDC mock that impersonated
// USDC and triggers wallet "malicious address" warnings). Markets using these are
// hidden from the list even though they remain live on-chain.
const DEPRECATED_QUOTE_TOKENS = new Set(["0x9d21820456cf2f8e49292d2181ff7a5e18084124"]);

// Only USDC bonds are shown. SHIT and Bucky should not have bonds.
const USDC_QUOTE_TOKENS = new Set([
  "0x3595ca37596d5895b70efab592ac315d5b9809b2", // USDC on Base
  "0xb6a1bc3d383f8751ef0cc216943290740e4d1493", // USDC on Base Sepolia
  "0x9d21820456cf2f8e49292d2181ff7a5e18084124", // legacy USDC mock
]);

interface BondMarket {
  id: string;
  quoteTokenAddress: `0x${string}`;
  payoutTokenAddress: `0x${string}`;
  capacity: bigint;
  capacityInQuote: boolean;
  maxPayout: bigint;
  sold: bigint;
  purchased: bigint;
  fixedTerm: boolean;
  vesting: number;
  conclusion: number;
  marketPrice: bigint;
  marketScale: bigint;
  isLive: boolean;
  discount: number;
  priceInUSD: number;
  isSoldOut: boolean;
}

function useLiveBonds(isInverse: boolean = false) {
  const chainId = useChainId();
  const aggregatorAddress = getContractAddress(ContractName.BOND_AGGREGATOR, chainId);

  const { data: marketCounter } = useReadContract({
    address: aggregatorAddress,
    abi: BOND_AGGREGATOR_ABI,
    functionName: "marketCounter",
    query: { enabled: !!aggregatorAddress },
  });

  const counter = marketCounter != null ? BigInt(marketCounter as bigint) : 0n;

  const { data: marketIds, isLoading } = useReadContract({
    address: aggregatorAddress,
    abi: BOND_AGGREGATOR_ABI,
    functionName: "liveMarketsBetween",
    args: [0n, counter],
    query: { enabled: !!aggregatorAddress && counter > 0n },
  });

  const ids = (marketIds ?? []) as bigint[];

  return {
    bondIds: ids.map((id) => id.toString()),
    isLoading,
    isInverse,
  };
}

function useBondMarket(id: string) {
  const chainId = useChainId();
  const aggregatorAddress = getContractAddress(ContractName.BOND_AGGREGATOR, chainId);
  const auctioneerAddress = getContractAddress(ContractName.BOND_AUCTIONEER, chainId);

  const { data: marketData, isLoading: marketLoading } = useReadContract({
    address: auctioneerAddress,
    abi: BOND_AUCTIONEER_ABI,
    functionName: "markets",
    args: [BigInt(id)],
    query: { enabled: !!auctioneerAddress && !!id },
  });

  const { data: termsData, isLoading: termsLoading } = useReadContract({
    address: auctioneerAddress,
    abi: BOND_AUCTIONEER_ABI,
    functionName: "terms",
    args: [BigInt(id)],
    query: { enabled: !!auctioneerAddress && !!id },
  });

  const { data: priceData } = useReadContract({
    address: aggregatorAddress,
    abi: BOND_AGGREGATOR_ABI,
    functionName: "marketPrice",
    args: [BigInt(id)],
    query: { enabled: !!aggregatorAddress && !!id },
  });

  const { data: scaleData } = useReadContract({
    address: aggregatorAddress,
    abi: BOND_AGGREGATOR_ABI,
    functionName: "marketScale",
    args: [BigInt(id)],
    query: { enabled: !!aggregatorAddress && !!id },
  });

  const { data: isLive } = useReadContract({
    address: aggregatorAddress,
    abi: BOND_AGGREGATOR_ABI,
    functionName: "isLive",
    args: [BigInt(id)],
    query: { enabled: !!aggregatorAddress && !!id },
  });

  const priceFeedAddress = getContractAddress(ContractName.SHIT_PRICE_FEED, chainId);
  const { data: shitPriceRaw } = useReadContract({
    address: priceFeedAddress,
    abi: SHIT_PRICE_FEED_ABI,
    functionName: "latestPrice",
    query: { enabled: !!priceFeedAddress },
  });

  const isLoading = marketLoading || termsLoading;

  if (!marketData || !termsData) {
    return { bond: undefined, isLoading };
  }

  const [, payoutToken, quoteToken, , capacityInQuote, capacity, , , maxPayout, sold, purchased, scale] = marketData as readonly [
    `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, boolean, bigint, bigint, bigint, bigint, bigint, bigint, bigint
  ];

  const [, , , conclusion, vesting] = termsData as readonly [bigint, bigint, number, number, number];

  const marketPrice = (priceData ?? 0n) as bigint;
  const marketScale = (scaleData ?? scale ?? 0n) as bigint;

  const shitPrice = shitPriceRaw ? Number(shitPriceRaw) / 1e18 : 0;

  const bondPriceUSD = shitPrice > 0 && marketScale > 0n
    ? (Number(marketPrice) / Number(marketScale)) * shitPrice
    : 0;
  const discount = shitPrice > 0 && bondPriceUSD > 0
    ? ((shitPrice - bondPriceUSD) / shitPrice) * 100
    : 0;

  const bond: BondMarket = {
    id,
    quoteTokenAddress: quoteToken,
    payoutTokenAddress: payoutToken,
    capacity,
    capacityInQuote,
    maxPayout,
    sold,
    purchased,
    fixedTerm: true,
    vesting,
    conclusion,
    marketPrice,
    marketScale,
    isLive: (isLive ?? false) && !DEPRECATED_QUOTE_TOKENS.has(quoteToken.toLowerCase()) && USDC_QUOTE_TOKENS.has(quoteToken.toLowerCase()),
    discount,
    priceInUSD: bondPriceUSD,
    isSoldOut: maxPayout === 0n || capacity === 0n,
  };

  return { bond, isLoading };
}

// ─── Bond list ───

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Matured";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

const LEGACY_ADDRESS_SYMBOLS: Record<string, { symbol: string; decimals: number }> = {
  "0x9d21820456cf2f8e49292d2181ff7a5e18084124": { symbol: "USDC", decimals: 6 },
  "0xb6a1bc3d383f8751ef0cc216943290740e4d1493": { symbol: "USDC", decimals: 6 },
};

function getTokenSymbol(address: `0x${string}`): string {
  const entries = Object.values(TOKENS);
  for (const token of entries) {
    const addrs = Object.values(token.addresses);
    if (addrs.some((a) => a?.toLowerCase() === address.toLowerCase())) return token.symbol;
  }
  const legacy = LEGACY_ADDRESS_SYMBOLS[address.toLowerCase()];
  if (legacy) return legacy.symbol;
  for (const token of IMPACT_TOKENS) {
    if (
      token.address.toLowerCase() === address.toLowerCase() ||
      token.testnetAddress?.toLowerCase() === address.toLowerCase()
    )
      return token.symbol;
  }
  return address.slice(0, 6) + "..." + address.slice(-4);
}

function getTokenDecimals(address: `0x${string}`): number {
  const entries = Object.values(TOKENS);
  for (const token of entries) {
    const addrs = Object.values(token.addresses);
    if (addrs.some((a) => a?.toLowerCase() === address.toLowerCase())) return token.decimals;
  }
  const legacy = LEGACY_ADDRESS_SYMBOLS[address.toLowerCase()];
  if (legacy) return legacy.decimals;
  return 18;
}

function BondList({ bonds, isInverseBond }: { bonds: BondMarket[]; isInverseBond: boolean }) {
  if (bonds.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-secondary-t text-lg">No active {isInverseBond ? "inverse " : ""}bonds</p>
      </div>
    );
  }

  const sorted = [...bonds].sort((a, b) => b.discount - a.discount);

  return (
    <div className="space-y-3">
      <div className="hidden md:grid grid-cols-12 gap-4 px-4 text-sm font-medium text-secondary-t uppercase tracking-wide">
        <div className="col-span-3">{isInverseBond ? "Sell" : "Buy"} SHIT with</div>
        <div className="col-span-2 text-right">Price</div>
        <div className="col-span-2 text-right">Discount</div>
        <div className="col-span-2 text-right">Capacity</div>
        <div className="col-span-2 text-right">Vesting</div>
        <div className="col-span-1" />
      </div>
      {sorted.map((bond) => (
        <BondRow key={bond.id} bond={bond} isInverseBond={isInverseBond} />
      ))}
    </div>
  );
}

function BondRow({ bond, isInverseBond }: { bond: BondMarket; isInverseBond: boolean }) {
  const quoteSymbol = getTokenSymbol(bond.quoteTokenAddress);
  const [showModal, setShowModal] = useState(false);

  const duration = bond.fixedTerm
    ? bond.vesting
    : Math.max(0, bond.conclusion - Math.floor(Date.now() / 1000));

  return (
    <>
      <Card className="p-4 hover:border-a20-b transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="col-span-12 md:col-span-3">
            <p className="font-semibold text-base">{quoteSymbol}</p>
            <p className="text-sm text-secondary-t">
              {isInverseBond ? "Sell SHIT → receive " + quoteSymbol : "Pay " + quoteSymbol + " → receive SHIT"}
            </p>
          </div>
          <div className="col-span-6 md:col-span-2 md:text-right">
            <p className="text-sm text-secondary-t md:hidden">Price</p>
            {bond.isSoldOut ? (
              <span className="text-secondary-t text-sm">--</span>
            ) : (
              <NumberFlow
                value={bond.priceInUSD}
                format={{ style: "currency", maximumFractionDigits: 4 }}
                className="text-base font-medium"
              />
            )}
          </div>
          <div className="col-span-6 md:col-span-2 md:text-right">
            <p className="text-sm text-secondary-t md:hidden">Discount</p>
            {bond.isSoldOut ? (
              <span className="text-secondary-t text-sm">--</span>
            ) : (
              <span className={`text-base font-medium ${bond.discount >= 0 ? "text-green-500" : "text-red-500"}`}>
                {bond.discount >= 0 ? "+" : ""}{bond.discount.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="col-span-6 md:col-span-2 md:text-right">
            <p className="text-sm text-secondary-t md:hidden">Capacity</p>
            <span className="text-base text-secondary-t">
              {bond.isSoldOut ? "Sold out" : "Available"}
            </span>
          </div>
          <div className="col-span-6 md:col-span-2 md:text-right">
            <p className="text-sm text-secondary-t md:hidden">Vesting</p>
            <span className="text-base text-secondary-t">{formatDuration(duration)}</span>
          </div>
          <div className="col-span-12 md:col-span-1 md:text-right">
            <Button
              size="sm"
              variant="secondary"
              disabled={bond.isSoldOut}
              onClick={() => setShowModal(true)}
              className="w-full md:w-auto"
            >
              {isInverseBond ? "Sell" : "Bond"}
            </Button>
          </div>
        </div>
      </Card>

      {showModal && (
        <BondPurchaseModal
          bond={bond}
          isInverseBond={isInverseBond}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function BondPurchaseModal({
  bond,
  isInverseBond,
  onClose,
}: {
  bond: BondMarket;
  isInverseBond: boolean;
  onClose: () => void;
}) {
  const { address, chainId } = useConnectedAddress();
  const tellerAddress = getContractAddress(ContractName.BOND_TELLER, chainId ?? 0);
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reverted, setReverted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputTokenAddress = isInverseBond
    ? (TOKENS[TokenName.SHIT].addresses[chainId ?? 0] ?? bond.payoutTokenAddress)
    : bond.quoteTokenAddress;

  const { balance } = useTokenBalance(inputTokenAddress, address);
  const { allowance, refetch: refetchAllowance, queryKey: allowanceQueryKey } = useTokenAllowance(
    inputTokenAddress,
    address,
    tellerAddress ?? "0x0",
  );
  const { approve, isPending: approvePending, isSuccess: approveSuccess, error: approvalError, reset: resetApproval } = useTokenApproval();
  const { walletClient } = usePrivyWalletClient();
  const publicClient = usePublicClient();

  const inputDecimals = isInverseBond ? 18 : getTokenDecimals(bond.quoteTokenAddress);
  const parsedAmount = useMemo(() => {
    if (!amount) return 0n;
    try { return parseUnits(amount, inputDecimals); } catch { return 0n; }
  }, [amount, inputDecimals]);
  const isAmountInvalid = useMemo(() => {
    if (!amount) return false;
    try { parseUnits(amount, inputDecimals); return false; } catch { return true; }
  }, [amount, inputDecimals]);

  // Track the amount that was actually approved so we don't let the user
  // purchase with a larger amount than what was approved.
  const approvedAmountRef = useRef<bigint>(0n);
  useEffect(() => {
    if (approveSuccess) {
      approvedAmountRef.current = parsedAmount;
    }
  }, [approveSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset approval state when the amount changes after a successful approval
  useEffect(() => {
    if (approveSuccess && parsedAmount !== approvedAmountRef.current) {
      resetApproval();
      approvedAmountRef.current = 0n;
    }
  }, [parsedAmount, approveSuccess, resetApproval]);

  const needsApproval = parsedAmount > 0n && !approveSuccess && (allowance === undefined || allowance < parsedAmount);

  useEffect(() => {
    if (approveSuccess) {
      refetchAllowance();
      const timeout = setTimeout(() => refetchAllowance(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [approveSuccess, refetchAllowance]);

  const handleApprove = async () => {
    if (!tellerAddress) return;
    setError(null);
    try {
      setPending(true);
      console.log("[BondPurchaseModal] handleApprove:", {
        inputTokenAddress,
        tellerAddress,
        parsedAmount: parsedAmount.toString(),
      });
      approve({
        tokenAddress: inputTokenAddress,
        spender: tellerAddress,
        amount: parsedAmount,
        queryKey: allowanceQueryKey,
      });
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      setError(`Approval failed: ${msg}`);
      console.error("[BondPurchaseModal] handleApprove error:", e);
    } finally {
      setPending(false);
    }
  };

  const handleDeposit = async () => {
    if (!tellerAddress || !address || parsedAmount <= 0n) {
      setError(parsedAmount <= 0n ? "Enter a valid amount greater than 0." : "Unable to connect to the bond contract.");
      return;
    }
    setError(null);
    try {
      setPending(true);
      console.log("[PurchaseBond] Sending tx:", { tellerAddress, functionName: "purchase", args: [address, zeroAddress, BigInt(bond.id), parsedAmount, 0n] });
      if (!walletClient) throw new Error("Wallet not connected. Please sign in via Privy.");

      // Estimate gas with 50% buffer
      let gas: bigint | undefined;
      try {
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: tellerAddress,
            abi: BOND_TELLER_ABI,
            functionName: "purchase",
            args: [address, zeroAddress, BigInt(bond.id), parsedAmount, 0n],
            account: address,
          });
          gas = (estimate * 3n) / 2n;
          if (gas > 5_000_000n) gas = 5_000_000n;
        }
      } catch { /* let wallet estimate */ }

      const hash = await walletClient.writeContract({
        address: tellerAddress,
        abi: BOND_TELLER_ABI,
        functionName: "purchase",
        args: [address, zeroAddress, BigInt(bond.id), parsedAmount, 0n],
        ...(gas ? { gas } : {}),
      } as any);
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (receipt?.status !== "success") {
        setReverted(true);
        throw new Error("Transaction reverted on-chain. The market does not have enough SHIT to cover this bond size. The purchase button has been disabled — try a smaller amount or try again later.");
      }
      setSuccess(true);
    } catch (err) {
      const e = err as Record<string, unknown>;
      const message = String(e?.shortMessage || e?.message || e?.details || err || "Transaction failed");
      setError(message);
      console.error("[PurchaseBond] Full error:", err);
    } finally {
      setPending(false);
    }
  };

  const quoteSymbol = getTokenSymbol(bond.quoteTokenAddress);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <Card className="p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">
          {isInverseBond ? "Sell SHIT" : `Bond with ${quoteSymbol}`}
        </h3>
        <p className="text-xs text-tertiary-t mb-4">
          {isInverseBond
            ? `Sell SHIT at a ${bond.discount.toFixed(2)}% premium to the treasury`
            : `Buy SHIT at a ${bond.discount.toFixed(2)}% discount from the treasury`}
        </p>

        <label className="block text-xs font-medium mb-1">
          Amount to bond {isInverseBond ? "(SHIT)" : `(${quoteSymbol})`}
        </label>
        <p className="text-xs text-secondary-t mb-2">
          Enter how much {isInverseBond ? "SHIT" : quoteSymbol} you want to {isInverseBond ? "sell" : "bond"}.
        </p>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(null); }}
          placeholder="Enter amount to bond"
          disabled={pending || success}
          className={cn(
            "w-full px-3 py-2 rounded-lg border bg-surface-bg-l1 text-sm mb-2 focus:outline-none focus:border-primary",
            isAmountInvalid ? "border-red" : "border-a10-b",
          )}
        />
        {balance !== undefined && (
          <p className="text-xs text-tertiary-t mb-2">
            Balance: {(Number(balance) / Number(10n ** BigInt(inputDecimals))).toFixed(4)}
          </p>
        )}
        {isAmountInvalid && (
          <p className="text-xs text-red mb-2">
            Enter a valid number with up to {inputDecimals} decimals.
          </p>
        )}
        {error && (
          <p className="text-xs text-red mb-3">
            {error}
          </p>
        )}
        {approvalError && !error && (
          <p className="text-xs text-red mb-3">
            Approval error: {String((approvalError as unknown as Record<string, unknown>)?.shortMessage || (approvalError as Error)?.message || approvalError)}
          </p>
        )}
        <p className="text-xs text-yellow mb-3">
          Two steps: first click <strong className="text-yellow">Approve</strong> to allow the contract to use your{" "}
          {isInverseBond ? "SHIT" : quoteSymbol}, then click <strong className="text-yellow">Purchase Bond</strong>.
        </p>
        {approveSuccess && (
          <p className="text-xs text-green mb-3 text-center">
            Approval confirmed. Now click <strong className="text-green">Purchase Bond</strong>.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          {needsApproval && (
            <Button variant="secondary" className="flex-1 h-auto py-2 whitespace-normal" onClick={handleApprove} disabled={pending || approvePending || success}>
              {pending ? "Approving..." : `Step 1: Approve ${isInverseBond ? "SHIT" : quoteSymbol}`}
            </Button>
          )}
          <Button
            className="flex-1 h-auto py-2 whitespace-normal"
            onClick={handleDeposit}
            disabled={pending || parsedAmount <= 0n || isAmountInvalid || needsApproval || success || reverted}
          >
            {pending
              ? "Processing..."
              : reverted
                ? "Reverted — try smaller amount"
                : needsApproval
                  ? `Step 2: Purchase Bond (approve first)`
                  : isInverseBond
                    ? "Sell SHIT"
                    : "Purchase Bond"}
          </Button>
        </div>
        {success && (
          <div className="mt-4 p-3 rounded-lg bg-green/10 border border-green/30 text-center">
            <p className="text-sm font-semibold text-green">
              {isInverseBond ? "SHIT sold successfully" : "Bond purchased successfully"}
            </p>
            <p className="text-xs text-secondary-t mt-1">
              {isInverseBond
                ? "Your SHIT have been burned and you will receive USDC."
                : "You bought SHIT at a discount. Your bond will vest over the next few seconds."}
            </p>
            <Button variant="secondary" className="w-full mt-2" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
        <Button variant="tertiary" className="w-full mt-2" onClick={onClose}>
          Cancel
        </Button>
      </Card>
    </div>
  );
}

// ─── Inverse bond list ───

function InverseBondList() {
  const { address, chainId } = useConnectedAddress();
  const inverseBondAddress = getContractAddress(ContractName.SHIT_INVERSE_BOND, chainId ?? 0);
  const shitAddress = TOKENS[TokenName.SHIT].addresses[chainId ?? 0];

  const { data: navPerShit } = useReadContract({
    address: inverseBondAddress,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "navPerShit",
    query: { enabled: !!inverseBondAddress },
  });

  const { data: bondPrice } = useReadContract({
    address: inverseBondAddress,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "bondPrice",
    query: { enabled: !!inverseBondAddress },
  });

  const { data: epochCapacity } = useReadContract({
    address: inverseBondAddress,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "epochCapacity",
    query: { enabled: !!inverseBondAddress },
  });

  const { data: epochUsed } = useReadContract({
    address: inverseBondAddress,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "epochUsedCapacity",
    query: { enabled: !!inverseBondAddress },
  });

  if (!inverseBondAddress) {
    return (
      <Card className="p-8 text-center">
        <p className="text-secondary-t text-lg">Inverse bonds not available on this network</p>
      </Card>
    );
  }

  const nav = navPerShit ? Number(navPerShit) / 1e6 : 0;
  const pricePerShit = bondPrice ? Number(bondPrice) / 1e6 : 0;
  const discount = nav > 0 ? ((nav - pricePerShit) / nav) * 100 : 0;
  const capacityRemaining = epochCapacity && epochUsed ? Number(epochCapacity) - Number(epochUsed) : 0;
  const capacityUSDC = capacityRemaining / 1e6;

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif text-lg">SHIT → USDC Inverse Bond</h3>
            <p className="text-sm text-secondary-t mt-1">
              Sell SHIT and get USDC at a discount to Net Asset Value. The SHIT you sell are burned forever.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-tertiary-t uppercase tracking-wide">Net Asset Value per SHIT</p>
            <p className="text-lg font-semibold">${nav.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-tertiary-t uppercase tracking-wide">Bond Price</p>
            <p className="text-lg font-semibold">${pricePerShit.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-tertiary-t uppercase tracking-wide">Discount</p>
            <p className="text-lg font-semibold text-green">{discount.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-tertiary-t uppercase tracking-wide">Epoch Capacity</p>
            <p className="text-lg font-semibold">${capacityUSDC.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {address && shitAddress && (
        <InverseBondSellForm
          inverseBondAddress={inverseBondAddress}
          shitAddress={shitAddress}
          userAddress={address}
          bondPrice={bondPrice ?? 0n}
        />
      )}
    </div>
  );
}

function InverseBondSellForm({
  inverseBondAddress,
  shitAddress,
  userAddress,
  bondPrice,
}: {
  inverseBondAddress: `0x${string}`;
  shitAddress: `0x${string}`;
  userAddress: `0x${string}`;
  bondPrice: bigint;
}) {
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const { walletClient } = usePrivyWalletClient();
  const publicClient = usePublicClient();

  const { balance } = useTokenBalance(shitAddress, userAddress);
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(shitAddress, userAddress, inverseBondAddress);
  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useTokenApproval();

  useEffect(() => {
    if (approveSuccess) {
      refetchAllowance();
      const timeout = setTimeout(() => refetchAllowance(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [approveSuccess, refetchAllowance]);

  const parsedAmount = BigInt(amount || "0") * BigInt(10 ** 18);
  const needsApproval = !approveSuccess && allowance !== undefined && allowance < parsedAmount;

  const expectedPayout = bondPrice > 0n ? (parsedAmount * bondPrice) / BigInt(10 ** 18) : 0n;
  const expectedPayoutUSDC = Number(expectedPayout) / 1e6;

  const handleApprove = async () => {
    try {
      setPending(true);
      approve({
        tokenAddress: shitAddress,
        spender: inverseBondAddress,
        amount: parsedAmount,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  const handleSell = async () => {
    if (!amount) return;
    try {
      setPending(true);
      console.log("[InverseBond] Selling SHIT:", { inverseBondAddress, amount: parsedAmount });
      if (!walletClient) throw new Error("Wallet not connected. Please sign in via Privy.");

      // Estimate gas with 50% buffer
      let gas: bigint | undefined;
      try {
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: inverseBondAddress,
            abi: SHIT_INVERSE_BOND_ABI,
            functionName: "sell",
            args: [parsedAmount],
            account: userAddress,
          });
          gas = (estimate * 3n) / 2n;
          if (gas > 5_000_000n) gas = 5_000_000n;
        }
      } catch { /* let wallet estimate */ }

      await walletClient.writeContract({
        address: inverseBondAddress,
        abi: SHIT_INVERSE_BOND_ABI,
        functionName: "sell",
        args: [parsedAmount],
        ...(gas ? { gas } : {}),
      } as any);
      setAmount("");
    } catch (err) {
      console.error("[InverseBond] Error:", err);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-6">
      <h4 className="font-semibold mb-3">Sell SHIT</h4>

      <label className="text-sm text-secondary-t mb-1 block">Amount (SHIT)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.0"
        disabled={pending}
        className="w-full px-3 py-2 rounded-lg border border-a10-b bg-surface-bg-l1 text-sm mb-2 focus:outline-none focus:border-primary"
      />
      {balance !== undefined && (
        <p className="text-xs text-tertiary-t mb-4">
          Balance: {(Number(balance) / 1e18).toFixed(4)} SHIT
        </p>
      )}

      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-surface-a3">
          <p className="text-sm text-secondary-t">
            You receive: <span className="font-semibold text-primary-t">{expectedPayoutUSDC.toFixed(4)} USDC</span>
          </p>
          <p className="text-xs text-tertiary-t mt-1">SHIT will be burned after sale</p>
        </div>
      )}

      <div className="flex gap-2">
        {needsApproval && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleApprove}
            disabled={pending || approvePending}
          >
            {pending || approvePending ? "Approving..." : "Approve SHIT"}
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={handleSell}
          disabled={pending || !amount || parseFloat(amount) <= 0 || needsApproval}
        >
          {pending ? "Processing..." : "Sell SHIT"}
        </Button>
      </div>
    </Card>
  );
}

// ─── Bond page ───

function BondLoader({ id, onBond }: { id: string; onBond: (bond: BondMarket) => void }) {
  const { bond } = useBondMarket(id);
  useEffect(() => {
    if (bond && bond.isLive && bond.capacity > 0n && bond.maxPayout > 0n && bond.marketPrice > 0n) onBond(bond);
  }, [bond, onBond]);
  return null;
}

function BondMarketWrapper({ ids, isInverse }: { ids: string[]; isInverse: boolean }) {
  const [bonds, setBonds] = useState<BondMarket[]>([]);

  useEffect(() => {
    setBonds([]);
  }, [ids.length]);

  const handleBond = (bond: BondMarket) => {
    setBonds((prev) => {
      if (prev.some((b) => b.id === bond.id)) return prev;
      if (prev.some((b) => b.quoteTokenAddress.toLowerCase() === bond.quoteTokenAddress.toLowerCase())) return prev;
      return [...prev, bond];
    });
  };

  if (bonds.length === 0) {
    return (
      <>
        {ids.map((id) => (
          <BondLoader key={id} id={id} onBond={handleBond} />
        ))}
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-secondary-t text-lg">
            {ids.length === 0 ? `No active ${isInverse ? "inverse " : ""}bonds` : "Loading bond markets..."}
          </p>
          {ids.length === 0 && isTestnetMode && (
            <p className="text-tertiary-t text-sm mt-2">
              Bond markets need to be created by an admin before they appear here.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {ids.map((id) => (
        <BondLoader key={id} id={id} onBond={handleBond} />
      ))}
      <BondList bonds={bonds} isInverseBond={isInverse} />
    </>
  );
}

export function BondPage() {
  const [tab, setTab] = useState<"bonds" | "inverse">("bonds");
  const { bondIds, isLoading } = useLiveBonds(false);
  const [dedupedCount, setDedupedCount] = useState<number | null>(null);

  const seenQuoteTokens = useRef<Set<string>>(new Set());
  const handleCountBond = (bond: BondMarket) => {
    const key = bond.quoteTokenAddress.toLowerCase();
    if (!seenQuoteTokens.current.has(key)) {
      seenQuoteTokens.current.add(key);
      setDedupedCount(seenQuoteTokens.current.size);
    }
  };

  useEffect(() => {
    seenQuoteTokens.current = new Set();
    setDedupedCount(null);
  }, [bondIds.length]);

  return (
    <div className="mx-auto max-w-7xl">
      <DashboardActions className="mb-6" />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Bonds</h1>
        <p className="text-sm text-secondary-t mt-1">
          Buy SHIT below market value by providing USDC to the treasury. Bonds vest over a fixed period — you receive your discounted SHIT gradually as the vesting period passes. The discount reflects the time lock: you get a better price in exchange for waiting.
        </p>
      </div>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-secondary-t uppercase tracking-wide">Active Markets</p>
            <p className="text-lg font-semibold">{dedupedCount ?? "..."}</p>
          </div>
          <div>
            <p className="text-xs text-secondary-t uppercase tracking-wide">Inverse Bond</p>
            <p className="text-lg font-semibold">Active</p>
          </div>
        </div>
      </Card>

      <Tabs
        onValueChange={(v) => setTab(v as "bonds" | "inverse")}
        value={tab}
        variant="primary"
      >
        <TabsList variant="primary">
          <TabsTrigger value="bonds" variant="primary">
            Bonds
          </TabsTrigger>
          <TabsTrigger value="inverse" variant="primary">
            Inverse Bonds
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bonds" className="mt-4">
          {isLoading ? (
            <Card className="p-8 text-center text-secondary-t">Loading bond markets...</Card>
          ) : (
            <>
              {bondIds.map((id) => (
                <BondLoader key={`count-${id}`} id={id} onBond={handleCountBond} />
              ))}
              <BondMarketWrapper ids={bondIds} isInverse={false} />
            </>
          )}
        </TabsContent>

        <TabsContent value="inverse" className="mt-4">
          <InverseBondList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
