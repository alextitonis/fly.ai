import { useEffect, useRef } from "react";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import {
  trackWalletConnect,
  trackWalletDisconnect,
  identifyWallet,
  resetIdentity,
} from "@/lib/analytics";

export function useWalletAnalytics(): void {
  const { address, isConnected, chainId } = useConnectedAddress();
  const prevConnectedRef = useRef(false);
  const prevWalletTypeRef = useRef<string | undefined>(undefined);
  const prevChainIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const walletType = undefined;
    const isFullyConnected = isConnected && !!address;

    if (isFullyConnected && !prevConnectedRef.current) {
      identifyWallet(address, { walletType, chainId })
        .then(() => trackWalletConnect({ walletType, chainId }))
        .catch(() => trackWalletConnect({ walletType, chainId }));
      prevConnectedRef.current = true;
    } else if (
      isFullyConnected &&
      (walletType !== prevWalletTypeRef.current || chainId !== prevChainIdRef.current)
    ) {
      // Refresh person properties when the user switches wallet/chain mid-session.
      identifyWallet(address, { walletType, chainId });
    }

    if (!isConnected && prevConnectedRef.current) {
      trackWalletDisconnect();
      resetIdentity();
      prevConnectedRef.current = false;
    }

    prevWalletTypeRef.current = walletType;
    prevChainIdRef.current = chainId;
  }, [isConnected, address, chainId]);
}

export function WalletAnalyticsTracker() {
  useWalletAnalytics();
  return null;
}
