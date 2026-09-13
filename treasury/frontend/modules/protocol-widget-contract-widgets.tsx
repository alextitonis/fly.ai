import { useState } from "react";
import { useReadContract, useReadContracts, useChainId, useAccount } from "wagmi";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { NumberFlow } from "@/components/ui-number-flow";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TokenName, TOKENS } from "@/lib/tokens";
import { useTokenAllowance } from "@/hooks/use-token-allowance";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useTokenApproval } from "@/hooks/use-token-approval";
import { erc20Abi } from "viem";
import {
  SHIT_INVERSE_BOND_ABI,
  SHIT_TREASURY_POLICY_ABI,
  SHIT_PRICE_FEED_ABI,
} from "@/abis/ShitContracts";

function formatUsd(val: bigint | undefined): string {
  if (!val) return "--";
  return (Number(val) / 1e18).toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  });
}

function formatAzusdAmount(val: bigint | undefined): string {
  if (!val) return "--";
  return (Number(val) / 1e6).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatToken(val: bigint | undefined, decimals: number): string {
  if (!val) return "--";
  return (Number(val) / Number(10n ** BigInt(decimals))).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

/* ─── Treasury Metrics Widget ─── */
export function TreasuryMetricsWidget() {
  const chainId = useChainId();
  const treasuryPolicy = getContractAddress(ContractName.SHIT_TREASURY_POLICY, chainId);

  const { data: rfv } = useReadContract({
    address: treasuryPolicy,
    abi: SHIT_TREASURY_POLICY_ABI,
    functionName: "rfv",
    query: { enabled: !!treasuryPolicy },
  });

  const { data: nav } = useReadContract({
    address: treasuryPolicy,
    abi: SHIT_TREASURY_POLICY_ABI,
    functionName: "nav",
    query: { enabled: !!treasuryPolicy },
  });

  const { data: floorPrice } = useReadContract({
    address: treasuryPolicy,
    abi: SHIT_TREASURY_POLICY_ABI,
    functionName: "floorPrice",
    query: { enabled: !!treasuryPolicy },
  });

  const { data: navPerShit } = useReadContract({
    address: treasuryPolicy,
    abi: SHIT_TREASURY_POLICY_ABI,
    functionName: "navPerShit",
    query: { enabled: !!treasuryPolicy },
  });

  const { writeContractAsync } = usePrivyWriteContract();

  const handleRefreshValuations = async () => {
    if (!treasuryPolicy) return;
    try {
      await writeContractAsync({
        address: treasuryPolicy,
        abi: SHIT_TREASURY_POLICY_ABI,
        functionName: "refreshValuations",
        args: [0n],
      });
    } catch (e) {
      console.error(e);
    }
  };

  const metrics = [
    { label: "Risk-Free Value (Floor backing)", value: `$${formatUsd(rfv)}` },
    { label: "Net Asset Value (Full value)", value: `$${formatUsd(nav)}` },
    { label: "Floor price / SHIT", value: `$${formatUsd(floorPrice)}` },
    { label: "Net Asset Value per SHIT", value: `$${formatUsd(navPerShit)}` },
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg">Treasury valuations</h3>
        <Button size="sm" variant="tertiary" onClick={handleRefreshValuations}>
          Refresh from balances
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="text-xs text-tertiary-t uppercase tracking-wide">{m.label}</p>
            <p className="text-sm font-medium mt-1">{m.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Inverse Bond Widget ─── */
export function InverseBondWidget() {
  const chainId = useChainId();
  const { address } = useAccount();
  const inverseBond = getContractAddress(ContractName.SHIT_INVERSE_BOND, chainId);
  const shitAddress = TOKENS[TokenName.SHIT].addresses[chainId] ?? "0x0";
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const { writeContractAsync } = usePrivyWriteContract();

  const { data: bondPrice } = useReadContract({
    address: inverseBond,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "bondPrice",
    query: { enabled: !!inverseBond },
  });

  const { data: epochCapacity } = useReadContract({
    address: inverseBond,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "epochCapacity",
    query: { enabled: !!inverseBond },
  });

  const { data: usedCapacity } = useReadContract({
    address: inverseBond,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "epochUsedCapacity",
    query: { enabled: !!inverseBond },
  });

  const { data: navPerShit } = useReadContract({
    address: inverseBond,
    abi: SHIT_INVERSE_BOND_ABI,
    functionName: "navPerShit",
    query: { enabled: !!inverseBond },
  });

  const { balance } = useTokenBalance(shitAddress, address);
  const { allowance } = useTokenAllowance(shitAddress, address, inverseBond ?? "0x0");
  const { approve, isPending: approvePending } = useTokenApproval();

  const shitDecimals = TOKENS[TokenName.SHIT].decimals;
  const parsedAmount = BigInt(amount || "0") * BigInt(10 ** shitDecimals);
  const needsApproval = allowance !== undefined && allowance < parsedAmount;

  const expectedPayout =
    bondPrice && parsedAmount > 0n ? (parsedAmount * bondPrice) / BigInt(10 ** shitDecimals) : 0n;

  const handleApprove = () => {
    if (!inverseBond || !shitAddress) return;
    approve({ tokenAddress: shitAddress, spender: inverseBond, amount: parsedAmount });
  };

  const handleSell = async () => {
    if (!inverseBond || !amount) return;
    try {
      setPending(true);
      await writeContractAsync({
        address: inverseBond,
        abi: SHIT_INVERSE_BOND_ABI,
        functionName: "sell",
        args: [parsedAmount],
      });
      setAmount("");
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  const remainingCapacity = epochCapacity && usedCapacity ? epochCapacity - usedCapacity : 0n;

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">Inverse bond — sell & burn</h3>
      <p className="text-sm text-secondary-t mb-4">
        Sell SHIT at Net Asset Value minus 1.5% spread. Received SHIT are burned forever, reducing supply.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Bond price</p>
          <p className="text-sm font-medium mt-1">${formatUsd(bondPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Net Asset Value / SHIT</p>
          <p className="text-sm font-medium mt-1">${formatUsd(navPerShit)}</p>
        </div>
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Epoch capacity left</p>
          <p className="text-sm font-medium mt-1">${formatUsd(remainingCapacity)}</p>
        </div>
      </div>

      <label className="block text-xs font-medium mb-1">SHIT amount</label>
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
          Balance: {formatToken(balance, shitDecimals)} SHIT
        </p>
      )}

      <div className="flex justify-between text-sm mb-4">
        <span className="text-tertiary-t">You receive</span>
        <span>{formatUsd(expectedPayout)} USDC</span>
      </div>

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
          disabled={pending || !amount || parseFloat(amount) <= 0}
        >
          {pending ? "Processing..." : "Sell & Burn SHIT"}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Floor Hook Redemption Widget ─── */
export function FloorHookWidget() {
  const chainId = useChainId();
  const { address } = useAccount();
  const marketFactory = getContractAddress(ContractName.MARKET_FACTORY, chainId);
  const shitAddress = TOKENS[TokenName.SHIT].addresses[chainId] ?? "0x0";
  const [selectedPool, setSelectedPool] = useState<`0x${string}` | undefined>();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const { writeContractAsync } = usePrivyWriteContract();

  const { data: marketTokens } = useReadContract({
    address: marketFactory,
    abi: [] as const,
    functionName: "getMarketTokens",
    query: { enabled: !!marketFactory },
  });

  const { data: activeCount } = useReadContract({
    address: marketFactory,
    abi: [] as const,
    functionName: "activeMarketCount",
    query: { enabled: !!marketFactory },
  });

  // Resolve each impact token to its floor hook address
  const tokens = (marketTokens as `0x${string}`[] | undefined) ?? [];
  const { data: symbolResults } = useReadContracts({
    contracts: tokens.map((t) => ({
      address: t,
      abi: erc20Abi,
      functionName: "symbol" as const,
    })),
  });

  // Build the list of floor hooks with labels
  const floorHooks: { address: `0x${string}`; label: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const symbol = (symbolResults?.[i]?.result as string | undefined) ?? "Unknown";
    floorHooks.push({ address: tokens[i], label: symbol });
  }

  // Get the floor hook address for the selected impact token
  const selectedTokenAddress = selectedPool as `0x${string}` | undefined;
  const { data: selectedMarket } = useReadContract({
    address: marketFactory,
    abi: [] as const,
    functionName: "getMarket",
    args: [selectedTokenAddress ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!marketFactory && !!selectedTokenAddress },
  });

  const floorHookAddress = ((selectedMarket as any)?.floorHook as `0x${string}` | undefined) ?? undefined;

  const { data: floor } = useReadContract({
    address: floorHookAddress,
    abi: [] as const,
    functionName: "floor",
    query: { enabled: !!floorHookAddress },
  });

  const { data: reserveFloorVal } = useReadContract({
    address: floorHookAddress,
    abi: [] as const,
    functionName: "reserveFloor",
    query: { enabled: !!floorHookAddress },
  });

  const { data: floorReserve } = useReadContract({
    address: floorHookAddress,
    abi: [] as const,
    functionName: "floorReserve",
    query: { enabled: !!floorHookAddress },
  });

  const { data: bandReserve } = useReadContract({
    address: floorHookAddress,
    abi: [] as const,
    functionName: "bandReserve",
    query: { enabled: !!floorHookAddress },
  });

  const { data: hookShitBalance } = useReadContract({
    address: floorHookAddress,
    abi: [] as const,
    functionName: "hookShitBalance",
    query: { enabled: !!floorHookAddress },
  });

  const { balance } = useTokenBalance(shitAddress, address);
  const { allowance } = useTokenAllowance(shitAddress, address, floorHookAddress ?? "0x0");
  const { approve, isPending: approvePending } = useTokenApproval();

  const shitDecimals = TOKENS[TokenName.SHIT].decimals;
  const parsedAmount = BigInt(amount || "0") * BigInt(10 ** shitDecimals);
  const needsApproval = !allowance || allowance < parsedAmount;

  // reserveFloor is the actual redemption price (in 1e18 precision, USDC has 6 decimals)
  // payout = shitAmount * reserveFloor / 1e18, then subtract 1% fee
  const expectedPayout =
    reserveFloorVal && parsedAmount > 0n
      ? ((parsedAmount * reserveFloorVal) / BigInt(10 ** shitDecimals) * 99n) / 100n
      : 0n;

  const handleApprove = () => {
    if (!floorHookAddress || !shitAddress) return;
    approve({ tokenAddress: shitAddress, spender: floorHookAddress, amount: parsedAmount });
  };

  const handleRedeem = async () => {
    if (!floorHookAddress || !amount) return;
    try {
      setPending(true);
      await writeContractAsync({
        address: floorHookAddress,
        abi: [] as const,
        functionName: "redeem",
        args: [parsedAmount],
      });
      setAmount("");
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">Floor redemption</h3>
      <p className="text-sm text-secondary-t mb-4">
        Redeem SHIT at the monotone floor price (1% fee). SHIT are burned, USDC paid from floor
        reserve.
      </p>

      <div className="mb-4">
        <label className="block text-xs font-medium mb-1">Select market pool</label>
        <select
          value={selectedPool ?? ""}
          onChange={(e) => setSelectedPool(e.target.value as `0x${string}`)}
          className="w-full px-3 py-2 rounded-lg border border-a10-b bg-surface-bg-l1 text-sm"
        >
          <option value="">Select a pool...</option>
          {floorHooks.map((fh) => (
            <option key={fh.address} value={fh.address}>
              {fh.label} — {fh.address.slice(0, 8)}...{fh.address.slice(-6)}
            </option>
          ))}
        </select>
        <p className="text-xs text-tertiary-t mt-1">
          Active markets: {activeCount ? Number(activeCount) : 0}
        </p>
      </div>

      {selectedPool && floorHookAddress && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-tertiary-t uppercase tracking-wide">Floor price</p>
              <p className="text-sm font-medium mt-1">${formatUsd(floor)}</p>
            </div>
            <div>
              <p className="text-xs text-tertiary-t uppercase tracking-wide">Floor reserve</p>
              <p className="text-sm font-medium mt-1">${formatAzusdAmount(floorReserve)}</p>
            </div>
            <div>
              <p className="text-xs text-tertiary-t uppercase tracking-wide">Band reserve</p>
              <p className="text-sm font-medium mt-1">${formatAzusdAmount(bandReserve)}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-tertiary-t">
              SHIT absorbed by hook: {formatToken(hookShitBalance, shitDecimals)}
            </p>
          </div>

          <label className="block text-xs font-medium mb-1">SHIT to redeem</label>
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
              Balance: {formatToken(balance, shitDecimals)} SHIT
            </p>
          )}

          <div className="flex justify-between text-sm mb-4">
            <span className="text-tertiary-t">You receive (after 1% fee)</span>
            <span>{formatAzusdAmount(expectedPayout)} USDC</span>
          </div>

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
              onClick={handleRedeem}
              disabled={pending || !amount || parseFloat(amount) <= 0}
            >
              {pending ? "Processing..." : "Redeem at floor"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/* ─── Price Feed Widget ─── */
export function PriceFeedWidget() {
  const chainId = useChainId();
  const priceFeed = getContractAddress(ContractName.SHIT_PRICE_FEED, chainId);

  const { data: latestPrice } = useReadContract({
    address: priceFeed,
    abi: SHIT_PRICE_FEED_ABI,
    functionName: "latestPrice",
    query: { enabled: !!priceFeed },
  });

  const { data: spotPrice } = useReadContract({
    address: priceFeed,
    abi: SHIT_PRICE_FEED_ABI,
    functionName: "spotPrice",
    query: { enabled: !!priceFeed },
  });

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-4">Price feed</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Latest price</p>
          <NumberFlow
            value={latestPrice ? Number(latestPrice) / 1e18 : 0}
            format={{ maximumFractionDigits: 4 }}
            prefix="$"
            className="text-lg font-semibold"
          />
        </div>
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Spot price</p>
          <NumberFlow
            value={spotPrice ? Number(spotPrice) / 1e18 : 0}
            format={{ maximumFractionDigits: 4 }}
            prefix="$"
            className="text-lg font-semibold"
          />
        </div>
      </div>
    </Card>
  );
}

/* ─── Peg Keeper Widget ─── */
export function PegKeeperWidget() {
  const chainId = useChainId();
  const pegKeeper = getContractAddress(ContractName.PEG_KEEPER, chainId);
  const [pending, setPending] = useState(false);
  const { writeContractAsync } = usePrivyWriteContract();

  const { data: checkerResult } = useReadContract({
    address: pegKeeper,
    abi: [] as const,
    functionName: "checker",
    query: { enabled: !!pegKeeper },
  });

  const canExec = checkerResult?.[0] as boolean | undefined;

  const handleExecute = async () => {
    if (!pegKeeper) return;
    try {
      setPending(true);
      await writeContractAsync({
        address: pegKeeper,
        abi: [] as const,
        functionName: "execute",
      });
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">Peg keeper</h3>
      <p className="text-sm text-secondary-t mb-4">
        Automated BUCKY peg stabilization. Anyone can execute when the keeper signals it's needed.
      </p>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Status</p>
          <p className="text-sm font-medium mt-1">
            {canExec ? (
              <span className="text-yellow">Action needed — execute now</span>
            ) : (
              <span className="text-green">Peg stable — no action needed</span>
            )}
          </p>
        </div>
        <Button onClick={handleExecute} disabled={pending || !canExec} size="sm">
          {pending ? "Executing..." : "Execute"}
        </Button>
      </div>
    </Card>
  );
}

/* ─── POL Management Widget ─── */
export function POLManagementWidget() {
  const chainId = useChainId();
  const polPolicy = getContractAddress(ContractName.POL_POLICY, chainId);
  const [pending, setPending] = useState(false);
  const { writeContractAsync } = usePrivyWriteContract();

  const { data: pools } = useReadContract({
    address: polPolicy,
    abi: [] as const,
    functionName: "getRegisteredPools",
    query: { enabled: !!polPolicy },
  });

  const poolList = (pools as `0x${string}`[] | undefined) ?? [];

  const handleHarvest = async (pool: `0x${string}`) => {
    if (!polPolicy) return;
    try {
      setPending(true);
      await writeContractAsync({
        address: polPolicy,
        abi: [] as const,
        functionName: "harvestPOL",
        args: [pool],
      });
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">Protocol-owned liquidity</h3>
      <p className="text-sm text-secondary-t mb-4">
        Registered Protocol-Owned Liquidity positions. Harvest rewards from liquidity pools.
      </p>
      {poolList.length === 0 ? (
        <p className="text-sm text-secondary-t text-center py-4">No Protocol-Owned Liquidity positions registered</p>
      ) : (
        <div className="space-y-2">
          {poolList.map((pool) => (
            <POLPoolRow key={pool} pool={pool} polPolicy={polPolicy ?? "0x0" as `0x${string}`} onHarvest={handleHarvest} pending={pending} />
          ))}
        </div>
      )}
    </Card>
  );
}

function POLPoolRow({
  pool,
  polPolicy,
  onHarvest,
  pending,
}: {
  pool: `0x${string}`;
  polPolicy: `0x${string}`;
  onHarvest: (pool: `0x${string}`) => void;
  pending: boolean;
}) {
  const { data: polValue } = useReadContract({
    address: polPolicy,
    abi: [] as const,
    functionName: "getPolValue",
    args: [pool],
    query: { enabled: !!polPolicy },
  });

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-bg-l1">
      <div>
        <p className="text-sm font-mono">
          {pool.slice(0, 10)}...{pool.slice(-8)}
        </p>
        <p className="text-xs text-tertiary-t">Protocol-Owned Liquidity value: ${formatUsd(polValue)}</p>
      </div>
      <Button size="xs" variant="tertiary" onClick={() => onHarvest(pool)} disabled={pending}>
        Harvest
      </Button>
    </div>
  );
}

/* ─── BAMM Widget ─── */
export function BAMMWidget() {
  const chainId = useChainId();
  const { address } = useAccount();
  const bammFactory = getContractAddress(ContractName.BAMM_FACTORY, chainId);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const { writeContractAsync } = usePrivyWriteContract();

  const { data: bammCount } = useReadContract({
    address: bammFactory,
    abi: [] as const,
    functionName: "allBAMMsLength",
    query: { enabled: !!bammFactory },
  });

  const { data: firstBamm } = useReadContract({
    address: bammFactory,
    abi: [] as const,
    functionName: "allBAMMs",
    args: [0n],
    query: { enabled: !!bammFactory && (bammCount ?? 0n) > 0n },
  });

  const { data: lpToken } = useReadContract({
    address: firstBamm,
    abi: [
      {
        type: "function",
        name: "lpToken",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
      },
    ] as const,
    query: { enabled: !!firstBamm },
  });

  const { data: sharesToken } = useReadContract({
    address: firstBamm,
    abi: [
      {
        type: "function",
        name: "sharesToken",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
      },
    ] as const,
    query: { enabled: !!firstBamm },
  });

  const lpAddr = (lpToken ?? "0x0") as unknown as `0x${string}`;
  const sharesAddr = (sharesToken ?? "0x0") as unknown as `0x${string}`;
  const bammAddr = (firstBamm ?? "0x0") as unknown as `0x${string}`;

  const { balance: lpBalance } = useTokenBalance(lpAddr, address);
  const { balance: sharesBalance } = useTokenBalance(sharesAddr, address);
  const { allowance } = useTokenAllowance(lpAddr, address, bammAddr);
  const { approve, isPending: approvePending } = useTokenApproval();

  const parsedAmount = BigInt(amount || "0") * BigInt(10 ** 18);
  const needsApproval =
    mode === "deposit" && allowance !== undefined && allowance < parsedAmount;

  const handleApprove = () => {
    if (!firstBamm || !lpToken) return;
    approve({ tokenAddress: lpAddr, spender: bammAddr, amount: parsedAmount });
  };

  const handleSubmit = async () => {
    if (!firstBamm || !amount) return;
    try {
      setPending(true);
      await writeContractAsync({
        address: bammAddr,
        abi: [
          {
            type: "function",
            name: mode,
            inputs: [{ name: mode === "deposit" ? "lpAmount" : "shares", type: "uint256" }],
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "nonpayable",
          },
        ] as const,
        functionName: mode,
        args: [parsedAmount],
      });
      setAmount("");
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  if (!firstBamm || (bammCount ?? 0n) === 0n) {
    return (
      <Card className="p-6">
        <h3 className="font-serif text-lg mb-1">BAMM — Liquidity Pool wrapper</h3>
        <p className="text-sm text-secondary-t mb-4">
          Deposit Liquidity Pool tokens and receive BAMM shares. No BAMM pools created yet.
        </p>
        <p className="text-sm text-tertiary-t text-center py-4">No BAMM pools available</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">BAMM — Liquidity Pool wrapper</h3>
      <p className="text-sm text-secondary-t mb-4">
        Deposit Liquidity Pool tokens and receive BAMM shares. Withdraw shares to get Liquidity Pool tokens back.
      </p>

      <div className="flex gap-2 mb-4">
        <Button
          variant={mode === "deposit" ? "default" : "tertiary"}
          className="flex-1"
          onClick={() => setMode("deposit")}
        >
          Deposit Liquidity Pool
        </Button>
        <Button
          variant={mode === "withdraw" ? "default" : "tertiary"}
          className="flex-1"
          onClick={() => setMode("withdraw")}
        >
          Withdraw
        </Button>
      </div>

      <label className="block text-xs font-medium mb-1">
        Amount ({mode === "deposit" ? "Liquidity Pool tokens" : "BAMM shares"})
      </label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.0"
        disabled={pending}
        className="w-full px-3 py-2 rounded-lg border border-a10-b bg-surface-bg-l1 text-sm mb-2 focus:outline-none focus:border-primary"
      />
      <p className="text-xs text-tertiary-t mb-4">
        {mode === "deposit"
          ? `Liquidity Pool balance: ${formatToken(lpBalance, 18)}`
          : `Shares balance: ${formatToken(sharesBalance, 18)}`}
      </p>

      <div className="flex gap-2">
        {needsApproval && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleApprove}
            disabled={pending || approvePending}
          >
            {pending || approvePending ? "Approving..." : "Approve Liquidity Pool"}
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={pending || !amount || parseFloat(amount) <= 0}
        >
          {pending ? "Processing..." : mode === "deposit" ? "Deposit" : "Withdraw"}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Fee Decay Splitter Widget ─── */
export function FeeDecaySplitterWidget() {
  const chainId = useChainId();
  const feeDecaySplitter = getContractAddress(ContractName.FEE_DECAY_SPLITTER, chainId);

  const { data: mgmtBps } = useReadContract({
    address: feeDecaySplitter,
    abi: [] as const,
    functionName: "currentManagementBps",
    query: { enabled: !!feeDecaySplitter },
  });

  const { data: treasuryBps } = useReadContract({
    address: feeDecaySplitter,
    abi: [] as const,
    functionName: "currentTreasuryBps",
    query: { enabled: !!feeDecaySplitter },
  });

  const { data: vestingFraction } = useReadContract({
    address: feeDecaySplitter,
    abi: [] as const,
    functionName: "vestingFraction",
    query: { enabled: !!feeDecaySplitter },
  });

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-4">Fee decay splitter</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Management share</p>
          <p className="text-sm font-medium mt-1">
            {mgmtBps ? `${(Number(mgmtBps) / 100).toFixed(2)}%` : "--"}
          </p>
        </div>
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Treasury share</p>
          <p className="text-sm font-medium mt-1">
            {treasuryBps ? `${(Number(treasuryBps) / 100).toFixed(2)}%` : "--"}
          </p>
        </div>
        <div>
          <p className="text-xs text-tertiary-t uppercase tracking-wide">Vesting fraction</p>
          <p className="text-sm font-medium mt-1">
            {vestingFraction ? `${(Number(vestingFraction) / 1e18 * 100).toFixed(4)}%` : "--"}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ─── Burner Widget ─── */
export function BurnerWidget() {
  const chainId = useChainId();
  const { address } = useAccount();
  const burner = getContractAddress(ContractName.SHIT_BURNER, chainId);
  const shitAddress = TOKENS[TokenName.SHIT].addresses[chainId] ?? "0x0";
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const { writeContractAsync } = usePrivyWriteContract();

  const { data: totalBurned } = useReadContract({
    address: burner,
    abi: [] as const,
    functionName: "totalBurned",
    query: { enabled: !!burner },
  });

  const { balance } = useTokenBalance(shitAddress, address);
  const { allowance } = useTokenAllowance(shitAddress, address, burner ?? "0x0");
  const { approve, isPending: approvePending } = useTokenApproval();

  const shitDecimals = TOKENS[TokenName.SHIT].decimals;
  const parsedAmount = BigInt(amount || "0") * BigInt(10 ** shitDecimals);
  const needsApproval = allowance !== undefined && allowance < parsedAmount;

  const handleApprove = () => {
    if (!burner || !shitAddress) return;
    approve({ tokenAddress: shitAddress, spender: burner, amount: parsedAmount });
  };

  const handleBurn = async () => {
    if (!burner || !amount) return;
    try {
      setPending(true);
      await writeContractAsync({
        address: burner,
        abi: [] as const,
        functionName: "burnShit",
        args: [parsedAmount],
      });
      setAmount("");
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">SHIT burner</h3>
      <p className="text-sm text-secondary-t mb-4">
        Permanently burn SHIT tokens. Reduces total supply, increases floor price for all holders.
      </p>

      <div className="mb-4">
        <p className="text-xs text-tertiary-t uppercase tracking-wide">Total burned</p>
        <NumberFlow
          value={totalBurned ? Number(totalBurned) / Number(10n ** BigInt(shitDecimals)) : 0}
          format={{ maximumFractionDigits: 2 }}
          suffix=" SHIT"
          className="text-lg font-semibold"
        />
      </div>

      <label className="block text-xs font-medium mb-1">SHIT to burn</label>
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
          Balance: {formatToken(balance, shitDecimals)} SHIT
        </p>
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
          onClick={handleBurn}
          disabled={pending || !amount || parseFloat(amount) <= 0}
        >
          {pending ? "Processing..." : "Burn SHIT"}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Market Factory Widget ─── */
export function MarketFactoryWidget() {
  const chainId = useChainId();
  const marketFactory = getContractAddress(ContractName.MARKET_FACTORY, chainId);

  const { data: marketTokens } = useReadContract({
    address: marketFactory,
    abi: [] as const,
    functionName: "getMarketTokens",
    query: { enabled: !!marketFactory },
  });

  const { data: activeCount } = useReadContract({
    address: marketFactory,
    abi: [] as const,
    functionName: "activeMarketCount",
    query: { enabled: !!marketFactory },
  });

  const tokens = (marketTokens as `0x${string}`[] | undefined) ?? [];

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">Impact token markets</h3>
      <p className="text-sm text-secondary-t mb-4">
        Uniswap V4 hook-based markets pairing SHIT with impact tokens.
      </p>
      <div className="mb-4">
        <p className="text-xs text-tertiary-t uppercase tracking-wide">Active markets</p>
        <p className="text-lg font-semibold mt-1">{activeCount ? Number(activeCount) : 0}</p>
      </div>
      {tokens.length > 0 && (
        <div className="space-y-2">
          {tokens.map((token) => (
            <MarketRow key={token} token={token} marketFactory={marketFactory!} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MarketRow({
  token,
  marketFactory,
}: {
  token: `0x${string}`;
  marketFactory: `0x${string}`;
}) {
  const { data: market } = useReadContract({
    address: marketFactory,
    abi: [] as const,
    functionName: "getMarket",
    args: [token],
    query: { enabled: !!marketFactory },
  });

  const { data: symbol } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
  });

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-bg-l1">
      <div>
        <p className="text-sm font-medium">{symbol ?? "Unknown"}</p>
        <p className="text-xs text-tertiary-t font-mono">
          {token.slice(0, 10)}...{token.slice(-8)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs">
          {(market as any)?.active ? (
            <span className="text-green">Active</span>
          ) : (
            <span className="text-tertiary-t">Inactive</span>
          )}
        </p>
      </div>
    </div>
  );
}
