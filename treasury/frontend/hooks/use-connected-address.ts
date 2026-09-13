import { useAccount, useChainId } from "wagmi";
import type { Address } from "viem";

/**
 * Returns the connected wallet address and chain ID using wagmi only.
 * No Privy dependency — uses WalletConnect via Reown AppKit.
 */
export function useConnectedAddress() {
  const { address: wagmiAddress, isConnected: wagmiConnected, chainId: wagmiChainId } = useAccount();
  const wagmiDefaultChainId = useChainId();

  return {
    address: wagmiAddress as Address | undefined,
    isConnected: wagmiConnected,
    chainId: wagmiChainId ?? wagmiDefaultChainId,
  };
}
