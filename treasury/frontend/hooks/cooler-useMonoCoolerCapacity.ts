import { useChainId, useReadContracts } from "wagmi";
import { formatUnits, erc4626Abi } from "viem";
import { getContractAddress, ContractName } from "@/lib/contracts";

/**
 * Fetches the protocol's global borrowing capacity for Cooler V2.
 * This is the DAO Treasury's sUSDS balance converted to USDS.
 */
export function useMonoCoolerCapacity() {
  const chainId = useChainId();

  const susdsAddress = getContractAddress(ContractName.SUSDS, chainId);
  const treasuryAddress = getContractAddress(ContractName.DAO_TREASURY, chainId);

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: susdsAddress,
        abi: erc4626Abi,
        functionName: "balanceOf",
        args: treasuryAddress ? [treasuryAddress] : undefined,
      },
    ],
    query: {
      enabled: !!susdsAddress && !!treasuryAddress,
    },
  });

  const sUsdsBalance = data?.[0]?.status === "success" ? (data[0].result as bigint) : undefined;

  // Convert sUSDS shares to USDS assets
  const { data: convertData } = useReadContracts({
    contracts: [
      {
        address: susdsAddress,
        abi: erc4626Abi,
        functionName: "convertToAssets",
        args: sUsdsBalance !== undefined ? [sUsdsBalance] : undefined,
      },
    ],
    query: {
      enabled: !!susdsAddress && sUsdsBalance !== undefined,
    },
  });

  const globalCapacity =
    convertData?.[0]?.status === "success" ? (convertData[0].result as bigint) : undefined;

  return {
    globalCapacity,
    globalCapacityFormatted:
      globalCapacity !== undefined ? formatUnits(globalCapacity, 18) : undefined,
    isLoading,
    error,
  };
}
