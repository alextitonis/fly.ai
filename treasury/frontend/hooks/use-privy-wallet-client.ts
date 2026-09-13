import { useMemo } from "react";
import { useConnectorClient } from "wagmi";
import { type WalletClient, type Address } from "viem";
import { useConnectedAddress } from "@/hooks/use-connected-address";

/**
 * Gets a viem WalletClient from the connected wallet via wagmi.
 * Replaces the former Privy-based implementation with WalletConnect/Reown AppKit.
 */
export function usePrivyWalletClient() {
  const { address: connectedAddress, chainId } = useConnectedAddress();
  const { data: connectorClient } = useConnectorClient();

  const walletClient = useMemo(() => {
    if (!connectorClient || !connectedAddress) return undefined;
    return connectorClient as WalletClient;
  }, [connectorClient, connectedAddress]);

  return {
    walletClient,
    address: connectedAddress as Address | undefined,
    chainId,
  };
}
