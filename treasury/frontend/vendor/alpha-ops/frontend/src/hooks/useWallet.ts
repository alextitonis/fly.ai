import { useCallback, useEffect, useState } from "react";
import type { WalletState } from "../types/wallet";

// Basic EVM provider typing to keep TypeScript satisfied.
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
      on: (event: string, handler: (...args: any[]) => void) => void;
      removeListener: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

async function fetchEthBalance(address: string): Promise<string> {
  if (!window.ethereum) return "0.0000";

  const balanceHex: string = await window.ethereum.request({
    method: "eth_getBalance",
    params: [address, "latest"],
  });

  const wei = BigInt(balanceHex);
  const unit = 10n ** 18n;
  const integer = wei / unit;
  const fraction = (wei % unit) / 10n ** 14n; // 4 decimal places

  const fractionStr = fraction.toString().padStart(4, "0");
  return `${integer.toString()}.${fractionStr}`;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isAvailable: typeof window !== "undefined" && !!window.ethereum,
    isConnecting: false,
    address: null,
    chainId: null,
    error: null,
    ethBalance: null,
  });

  const loadBalance = useCallback(async (address: string | null) => {
    if (!address || !window.ethereum) return;

    try {
      const balance = await fetchEthBalance(address);
      setState((s) => ({ ...s, ethBalance: balance }));
    } catch {
      setState((s) => ({ ...s, ethBalance: null }));
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState((s) => ({ ...s, error: "No EVM provider detected." }));
      return;
    }

    try {
      setState((s) => ({ ...s, isConnecting: true, error: null }));

      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const chainId: string = await window.ethereum.request({
        method: "eth_chainId",
      });

      const address = accounts[0] ?? null;

      setState({
        isAvailable: true,
        isConnecting: false,
        address,
        chainId,
        error: null,
        ethBalance: null,
      });

      if (address) {
        await loadBalance(address);
      }
    } catch {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: "Failed to connect wallet.",
        ethBalance: null,
      }));
    }
  }, [loadBalance]);

  const disconnect = useCallback(() => {
    setState((s) => ({
      ...s,
      address: null,
      chainId: null,
      ethBalance: null,
    }));
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccounts = (accounts: string[]) => {
      const address = accounts[0] ?? null;
      setState((s) => ({ ...s, address, ethBalance: null }));
      if (address) {
        void loadBalance(address);
      }
    };

    const handleChain = (chainId: string) => {
      setState((s) => ({ ...s, chainId, ethBalance: null }));
      if (state.address) {
        void loadBalance(state.address);
      }
    };

    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged", handleChain);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccounts);
      window.ethereum?.removeListener("chainChanged", handleChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBalance, state.address]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
