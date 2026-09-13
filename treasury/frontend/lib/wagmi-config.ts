import { createConfig, createStorage } from "wagmi";
import { walletConnect, injected } from "wagmi/connectors";
import { allChains, transports } from "@/lib/chains";
import { DATA_SUFFIX } from "@/lib/attribution";

/**
 * Wagmi config using WalletConnect (Reown AppKit) instead of Privy.
 * Supports injected wallets (MetaMask, etc.) and WalletConnect v2 protocol.
 */
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "dummy";

export const config = createConfig({
  chains: allChains,
  transports,
  ssr: false,
  storage: createStorage({
    key: "5h1t-wagmi",
  }),
  batch: {
    multicall: true,
  },
  connectors: [
    injected(),
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: false }),
  ],
});

export { DATA_SUFFIX };
