import { useChainId, useReadContract } from "wagmi";
import { ContractName, getContractAddress } from "@/lib/contracts";
import V1MigratorAbi from "@/abis/shitV1Migrator";

/**
 * Preview the SHIT v2 amount a user would receive for migrating `amount` SHIT v1.
 * The migrator computes this via wstSHIT (`balanceFrom(balanceTo(amount))`), so it is
 * ~1:1 but may round slightly down — always show the previewed value, not the input.
 */
export function usePreviewMigrate(amount: bigint) {
  const chainId = useChainId();
  const migrator = getContractAddress(ContractName.SHIT_V1_MIGRATOR, chainId);

  const { data, isLoading, error } = useReadContract({
    address: migrator,
    abi: V1MigratorAbi,
    functionName: "previewMigrate",
    args: [amount],
    query: { enabled: !!migrator && amount > 0n },
  });

  return {
    shitV2Out: data as bigint | undefined,
    isLoading,
    error: error as Error | null,
  };
}
