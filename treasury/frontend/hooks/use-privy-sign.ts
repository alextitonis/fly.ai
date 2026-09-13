import { useCallback } from "react";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";

/**
 * Drop-in replacement for wagmi's useSignMessage that uses Privy's wallet
 * provider directly instead of wagmi's connector system.
 */
export function usePrivySignMessage() {
  const { walletClient, address } = usePrivyWalletClient();

  const signMessageAsync = useCallback(
    async ({ message }: { message: string | `0x${string}` | Uint8Array }) => {
      if (!walletClient || !address) {
        throw new Error("Connector not connected. Please connect your wallet.");
      }
      return walletClient.signMessage({
        account: address,
        message: message as any,
      } as any);
    },
    [walletClient, address],
  );

  return { signMessageAsync };
}

/**
 * Drop-in replacement for wagmi's useSignTypedData that uses Privy's wallet
 * provider directly instead of wagmi's connector system.
 */
export function usePrivySignTypedData() {
  const { walletClient, address } = usePrivyWalletClient();

  const signTypedDataAsync = useCallback(
    async (args: any) => {
      if (!walletClient || !address) {
        throw new Error("Connector not connected. Please connect your wallet.");
      }
      return walletClient.signTypedData({
        ...args,
        account: address,
      } as any);
    },
    [walletClient, address],
  );

  return { signTypedDataAsync };
}
