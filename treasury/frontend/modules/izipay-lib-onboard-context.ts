import { useAccount } from "wagmi";

export function useOnboard() {
  const { address, isConnected } = useAccount();

  return {
    onboard: null,
    wallets: [],
    address: address as `0x${string}` | undefined,
    isConnected,
    connect: async () => {},
    disconnect: async () => {},
  };
}
