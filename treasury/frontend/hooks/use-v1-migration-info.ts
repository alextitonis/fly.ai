import { useEffect, useMemo } from "react";
import { useChainId, useReadContract, useReadContracts } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import type { Hex } from "viem";
import { zeroHash } from "viem";
import { ContractName, getContractAddress } from "@/lib/contracts";
import V1MigratorAbi from "@/abis/shitV1Migrator";
import { getMigrationMerkleRootOverride } from "@/lib/migration-config";

// The migrator's merkle root (and a claim's verification against it) only changes via an
// admin transaction — don't refetch on every remount/window focus. Post-tx invalidation
// still forces a refresh, since invalidateQueries overrides staleTime.
const MIGRATOR_READ_STALE_TIME = 5 * 60 * 1000;

// Stable instance so consumers' memo deps don't churn on every render.
const MIGRATED_AMOUNTS_READ_ERROR = new Error(
  "Failed to read the migrated amount for the connected wallet.",
);

export function useV1MigratorMerkleRoot() {
  const chainId = useChainId();
  const migrator = getContractAddress(ContractName.SHIT_V1_MIGRATOR, chainId);

  const { data, isLoading, error, refetch } = useReadContract({
    address: migrator,
    abi: V1MigratorAbi,
    functionName: "merkleRoot",
    query: { enabled: !!migrator, staleTime: MIGRATOR_READ_STALE_TIME },
  });

  const onChainMerkleRoot = data as Hex | undefined;
  const merkleRootOverride = getMigrationMerkleRootOverride();
  const merkleRoot = merkleRootOverride ?? onChainMerkleRoot;
  const hasMerkleRoot = !!merkleRoot && merkleRoot !== zeroHash;
  const isOnChainMerkleRootActive =
    hasMerkleRoot && onChainMerkleRoot?.toLowerCase() === merkleRoot.toLowerCase();

  useEffect(() => {
    if (!merkleRootOverride) return;
    console.info("[V1Migrator] Using VITE_MIGRATION_MERKLE_ROOT_OVERRIDE", merkleRootOverride);
  }, [merkleRootOverride]);

  useEffect(() => {
    if (isLoading || error || !migrator || hasMerkleRoot) return;
    console.warn("[V1Migrator] No merkle root is set on the migrator", {
      migrator,
      onChainMerkleRoot,
    });
  }, [error, hasMerkleRoot, isLoading, migrator, onChainMerkleRoot]);

  useEffect(() => {
    if (!error) return;
    console.warn("[V1Migrator] Failed to load migrator merkle root", { migrator, error });
  }, [error, migrator]);

  return {
    migrator,
    merkleRoot,
    onChainMerkleRoot,
    hasMerkleRoot,
    isOnChainMerkleRootActive,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * On-chain status for the SHIT v1 migrator, scoped to the connected user.
 * Combines the migrator's enabled state, the user's already-migrated amount,
 * the global remaining mint approval, and (when a claim is supplied) on-chain
 * proof verification.
 */
export function useV1MigrationInfo(
  claim?: { allocatedAmount: bigint; proof: Hex[] } | null,
  shouldVerifyClaim = true,
) {
  const { address } = useConnectedAddress();
  const chainId = useChainId();
  const migrator = getContractAddress(ContractName.SHIT_V1_MIGRATOR, chainId);

  const contracts = useMemo(() => {
    if (!migrator) return [];
    const base = [
      {
        address: migrator,
        abi: V1MigratorAbi,
        functionName: "isEnabled" as const,
      },
      {
        address: migrator,
        abi: V1MigratorAbi,
        functionName: "isActive" as const,
      },
      {
        address: migrator,
        abi: V1MigratorAbi,
        functionName: "remainingMintApproval" as const,
      },
      ...(address
        ? [
            {
              address: migrator,
              abi: V1MigratorAbi,
              functionName: "migratedAmounts" as const,
              args: [address] as const,
            },
          ]
        : []),
    ];
    return base;
  }, [migrator, address]);

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  // verifyClaim runs as its own read: the claim arrives async from the proof API, and
  // appending it to the batch above would change that query's key and refetch the four
  // already-resolved migrator reads.
  const shouldRunVerify = !!migrator && !!address && !!claim && shouldVerifyClaim;
  const {
    data: verifyResult,
    isLoading: isVerifyLoading,
    error: verifyError,
    refetch: refetchVerify,
  } = useReadContract({
    address: migrator,
    abi: V1MigratorAbi,
    functionName: "verifyClaim",
    args: address && claim ? [address, claim.allocatedAmount, claim.proof] : undefined,
    query: { enabled: shouldRunVerify, staleTime: MIGRATOR_READ_STALE_TIME },
  });

  const isEnabled = data?.[0]?.result as boolean | undefined;
  const isActive = data?.[1]?.result as boolean | undefined;
  const remainingMintApproval = data?.[2]?.result as bigint | undefined;
  // With allowFailure (the useReadContracts default), one failed sub-call leaves the
  // query's top-level error null. A failed migratedAmounts read must not coerce to 0n —
  // that would inflate `remaining` to the full allocation and offer a partially-migrated
  // user an over-limit migrate that reverts on-chain. Fail closed via `remaining` and
  // surface it as an error instead.
  const migratedAmountsCall = address ? data?.[3] : undefined;
  const migratedAmountsFailed = migratedAmountsCall?.status === "failure";
  const migratedAmount = (migratedAmountsCall?.result as bigint | undefined) ?? 0n;
  // A reverted verifyClaim call means the claim could not be verified, so fail closed
  // rather than letting `undefined` read as "not rejected" downstream.
  const isClaimValid = !shouldRunVerify
    ? undefined
    : verifyError
      ? false
      : (verifyResult as boolean | undefined);

  const remaining =
    claim != null && !migratedAmountsFailed
      ? bigMax(claim.allocatedAmount - migratedAmount, 0n)
      : undefined;

  useEffect(() => {
    if (isLoading || !migrator || !address) return;

    if (error) {
      console.warn("[V1Migrator] Failed to load migration contract state", {
        migrator,
        address,
        error,
      });
      return;
    }

    if (isEnabled === false || isActive === false) {
      console.warn("[V1Migrator] Migrator is not currently live", {
        migrator,
        isEnabled,
        isActive,
      });
    }

    if (claim && !shouldVerifyClaim) {
      console.info("[V1Migrator] Skipping on-chain claim verification until root is set", {
        migrator,
        address,
        allocatedAmount: claim.allocatedAmount.toString(),
        proofLength: claim.proof.length,
      });
    }

    if (migratedAmountsFailed) {
      console.warn("[V1Migrator] migratedAmounts read failed; withholding remaining amount", {
        migrator,
        address,
        error: migratedAmountsCall?.error,
      });
    }

    if (verifyError) {
      console.warn("[V1Migrator] verifyClaim call failed; treating claim as invalid", {
        migrator,
        address,
        error: verifyError,
      });
    } else if (claim && shouldVerifyClaim && isClaimValid === false) {
      console.warn("[V1Migrator] Migration claim failed on-chain verification", {
        migrator,
        address,
        allocatedAmount: claim.allocatedAmount.toString(),
        proofLength: claim.proof.length,
      });
    }
  }, [
    address,
    claim,
    error,
    isActive,
    isClaimValid,
    isEnabled,
    isLoading,
    migratedAmountsCall,
    migratedAmountsFailed,
    migrator,
    shouldVerifyClaim,
    verifyError,
  ]);

  return {
    migrator,
    isEnabled,
    isActive,
    migratedAmount,
    remainingMintApproval,
    isClaimValid,
    /** Remaining allocation = allocated − already migrated (only when a claim is supplied). */
    remaining,
    isLoading: isLoading || isVerifyLoading,
    error: (error as Error | null) ?? (migratedAmountsFailed ? MIGRATED_AMOUNTS_READ_ERROR : null),
    refetch: () => {
      refetch();
      if (shouldRunVerify) refetchVerify();
    },
  };
}

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
