import { usePublicClient } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { useQuery } from "@tanstack/react-query";

/**
 * Detects if the connected wallet is a smart contract wallet (multisig, Safe, etc.)
 *
 * Smart contract wallets cannot sign EIP-712 messages directly with signTypedData,
 * so they need alternative authorization flows for Cooler V2.
 */
export function useIsSmartContractWallet() {
  const { address, isConnected } = useConnectedAddress();
  const publicClient = usePublicClient();

  const { data: isSmartContractWallet = false, isLoading } = useQuery({
    queryKey: ["isSmartContractWallet", address],
    queryFn: async () => {
      if (!address || !publicClient) return false;
      const code = await publicClient.getCode({ address });
      return code !== undefined && code !== "0x" && code.length > 2;
    },
    enabled: !!address && isConnected && !!publicClient,
  });

  return { isSmartContractWallet, isLoading };
}
