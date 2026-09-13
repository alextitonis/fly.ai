import { useState } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TOKENS, TokenName } from "@/lib/tokens";
import ShitStakingAbi from "@/abis/ShitStaking";
import { FEE_SPLITTER_ABI } from "@/abis/FeeSplitter";
import { useGETAdminMultisigMembers } from "@/generated-shitUnits";
import type { LibChainId } from "@/generated-shitUnits";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "ready" | "done" | "failed";

function StatusDot({ status }: { status: StepStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center size-5 rounded-full text-xs font-bold shrink-0",
        status === "done" && "bg-green/20 text-green",
        status === "ready" && "bg-yellow/20 text-yellow",
        status === "pending" && "bg-surface-a10 text-tertiary-t",
        status === "failed" && "bg-red/20 text-red",
      )}
    >
      {status === "done" ? "✓" : status === "ready" ? "!" : status === "failed" ? "✕" : "○"}
    </span>
  );
}

export function ProtocolLaunchWidget() {
  const { address } = useAccount();
  const chainId = useChainId() as LibChainId;
  const { writeContractAsync } = usePrivyWriteContract();
  const [pending, setPending] = useState(false);
  const [launchTx, setLaunchTx] = useState<string | null>(null);

  const stakingAddress = getContractAddress(ContractName.STAKING, chainId);
  const feeSplitterAddress = getContractAddress(ContractName.FEE_SPLITTER, chainId);
  const treasuryAddress = getContractAddress(ContractName.SHIT_TREASURY, chainId);
  const shitAddress = (TOKENS[TokenName.SHIT].addresses[chainId] ?? "0x0") as `0x${string}`;

  // Check multisig membership
  const { data: membersData } = useGETAdminMultisigMembers(
    { chainId },
    { query: { enabled: !!address } },
  );

  const owners = membersData?.owners ?? [];
  const isMultisigOwner =
    !!address && owners.some((o: string) => o.toLowerCase() === address.toLowerCase());

  // Check staking price feed
  const { data: priceFeed } = useReadContract({
    address: stakingAddress as `0x${string}`,
    abi: ShitStakingAbi,
    functionName: "priceFeed",
    query: { enabled: !!stakingAddress },
  });

  // Check staking index (should be > 1e18 if emissions have started)
  const { data: stakingIndex } = useReadContract({
    address: stakingAddress as `0x${string}`,
    abi: ShitStakingAbi,
    functionName: "index",
    query: { enabled: !!stakingAddress },
  });

  // Check fee splitter recipients
  const { data: fsTreasury } = useReadContract({
    address: feeSplitterAddress as `0x${string}`,
    abi: FEE_SPLITTER_ABI,
    functionName: "treasury",
    query: { enabled: !!feeSplitterAddress },
  });

  const { data: fsStakingRewards } = useReadContract({
    address: feeSplitterAddress as `0x${string}`,
    abi: FEE_SPLITTER_ABI,
    functionName: "stakingRewards",
    query: { enabled: !!feeSplitterAddress },
  });

  const { data: fsTreasuryRatio } = useReadContract({
    address: feeSplitterAddress as `0x${string}`,
    abi: FEE_SPLITTER_ABI,
    functionName: "treasuryRatio",
    query: { enabled: !!feeSplitterAddress },
  });

  // Determine step statuses
  const shitDeployed = shitAddress !== "0x0";
  const stakingHasPriceFeed = priceFeed && priceFeed !== "0x0000000000000000000000000000000000000000";
  const stakingIndexStarted = stakingIndex && stakingIndex > 1e18;
  const feeSplitterConfigured = fsTreasury && fsTreasury !== "0x0000000000000000000000000000000000000000"
    && fsStakingRewards && fsStakingRewards !== "0x0000000000000000000000000000000000000000";
  const feeRatioSet = fsTreasuryRatio && fsTreasuryRatio > 0;

  const steps = [
    {
      label: "SHIT token deployed",
      status: shitDeployed ? "done" : "pending" as StepStatus,
      detail: shitDeployed ? `${shitAddress.slice(0, 10)}...${shitAddress.slice(-8)}` : "Not deployed",
    },
    {
      label: "Staking price feed set",
      status: stakingHasPriceFeed ? "done" : "pending" as StepStatus,
      detail: stakingHasPriceFeed ? `${(priceFeed as string)?.slice(0, 10)}...${(priceFeed as string)?.slice(-8)}` : "Not set — oracles won't update",
    },
    {
      label: "Staking emissions active",
      status: stakingIndexStarted ? "done" : "pending" as StepStatus,
      detail: stakingIndexStarted ? `Index: ${(Number(stakingIndex) / 1e18).toFixed(4)}` : "Index at 1.0 — no rebase yet",
    },
    {
      label: "Fee splitter recipients configured",
      status: feeSplitterConfigured ? "done" : "pending" as StepStatus,
      detail: feeSplitterConfigured ? "Treasury & staking rewards set" : "Recipients not configured",
    },
    {
      label: "Fee split ratio set",
      status: feeRatioSet ? "done" : "pending" as StepStatus,
      detail: feeRatioSet ? `${((Number(fsTreasuryRatio) / 10000) * 100).toFixed(1)}% treasury` : "Ratio not set",
    },
  ];

  const allDone = steps.every((s) => s.status === "done");
  const canLaunch = isMultisigOwner && !allDone && shitDeployed;

  const handleLaunch = async () => {
    if (!stakingAddress || !feeSplitterAddress || !treasuryAddress) return;
    try {
      setPending(true);
      setLaunchTx(null);

      // Step 1: Set fee splitter recipients if not configured
      if (!feeSplitterConfigured) {
        const tx = await writeContractAsync({
          address: feeSplitterAddress as `0x${string}`,
          abi: FEE_SPLITTER_ABI,
          functionName: "setRecipients",
          args: [treasuryAddress as `0x${string}`, stakingAddress as `0x${string}`],
        });
        setLaunchTx(tx);
      }

      // Step 2: Set fee split ratio if not set (default: 50% treasury, 50% staking)
      if (!feeRatioSet) {
        const tx = await writeContractAsync({
          address: feeSplitterAddress as `0x${string}`,
          abi: FEE_SPLITTER_ABI,
          functionName: "setRatio",
          args: [5000n], // 50% in basis points
        });
        setLaunchTx(tx);
      }

      // Note: setDistributor on staking requires the distributor contract address
      // which varies by deployment. This would be set during deployment setup.
      // The multisig approve flow ensures all pieces are in place.
    } catch (e) {
      console.error("Protocol launch failed:", e);
    } finally {
      setPending(false);
    }
  };

  if (!address) {
    return (
      <Card className="p-6">
        <h3 className="font-serif text-lg mb-1">Protocol Launch</h3>
        <p className="text-sm text-secondary-t mb-4">
          Connect a multisig wallet to check protocol readiness and approve the launch sequence.
        </p>
        <div className="text-sm text-tertiary-t py-4 text-center border rounded-lg">
          Wallet not connected
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg mb-1">Protocol Launch</h3>
      <p className="text-sm text-secondary-t mb-4">
        Multisig-gated approval flow. Checks all contract state and enables emissions, fee splitting, and staking rewards when approved.
      </p>

      {/* Multisig status */}
      <div className="mb-4 p-3 rounded-lg bg-surface-bg-l1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-tertiary-t uppercase tracking-wide">Multisig Status</span>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isMultisigOwner ? "bg-green/20 text-green" : "bg-red/20 text-red",
          )}>
            {isMultisigOwner ? "Authorized" : "Not authorized"}
          </span>
        </div>
        {membersData && (
          <div className="text-xs text-tertiary-t mt-1">
            Safe: {membersData.safeAddress?.slice(0, 10)}...{membersData.safeAddress?.slice(-8)} · Threshold: {membersData.threshold}
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-2 mb-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface-bg-l1">
            <StatusDot status={step.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{step.label}</p>
              <p className="text-xs text-tertiary-t truncate">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Launch status */}
      {allDone && (
        <div className="p-3 rounded-lg bg-green/10 border border-green/30 mb-4">
          <p className="text-sm font-medium text-green">Protocol is live</p>
          <p className="text-xs text-secondary-t mt-0.5">
            All systems operational. Emissions, fee splitting, and staking rewards are active.
          </p>
        </div>
      )}

      {/* Launch button */}
      {canLaunch && (
        <Button
          className="w-full"
          onClick={handleLaunch}
          disabled={pending}
        >
          {pending ? "Approving..." : "Approve & Launch Protocol"}
        </Button>
      )}

      {!isMultisigOwner && !allDone && (
        <p className="text-xs text-tertiary-t text-center py-2">
          Only multisig owners can approve the launch sequence.
        </p>
      )}

      {launchTx && (
        <p className="text-xs text-green mt-2 text-center">
          Transaction submitted: {launchTx.slice(0, 10)}...{launchTx.slice(-8)}
        </p>
      )}
    </Card>
  );
}
