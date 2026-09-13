import { defineChain } from "viem";
import { http, type Transport } from "viem";

// Robinhood Chain — mainnet (chain ID 4663)
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com/"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  testnet: false,
});

// Robinhood Chain — testnet (chain ID 46630)
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhood-testnet.blockscout.com" },
  },
  testnet: true,
});

// Backward-compatible aliases — the 5H1T frontend imports `base` and `baseSepolia`
// We alias them to Robinhood Chain so the existing frontend works without rewriting imports
export const base = robinhood;
export const baseSepolia = robinhoodTestnet;

const withIcon = <T extends { id: number }>(chain: T, iconUrl: string) => ({
  ...chain,
  iconUrl,
  iconBackground: "transparent",
});

const robinhoodWithIcon = withIcon(robinhood, "/icons/chain-robinhood.svg");
const robinhoodTestnetWithIcon = withIcon(robinhoodTestnet, "/icons/chain-robinhood.svg");

/**
 * Chains available in the wallet network selector.
 */
export const PRODUCTION_CHAINS = [robinhoodWithIcon] as const;

/**
 * Whether testnet mode is enabled via environment variable.
 */
export const isTestnetMode = Boolean(import.meta.env.VITE_TESTNET_MODE);

/**
 * Active chains based on testnet mode.
 * In testnet mode, Robinhood Chain Testnet is used. In production, Robinhood Chain is used.
 */
export const activeChains = isTestnetMode
  ? ([robinhoodTestnetWithIcon] as const)
  : PRODUCTION_CHAINS;

/**
 * All chains for the wagmi config.
 */
export const allChains = isTestnetMode
  ? ([robinhoodTestnetWithIcon] as const)
  : PRODUCTION_CHAINS;

/**
 * Custom RPC transports per chain.
 */
export const transports: Record<number, Transport> = {
  [robinhood.id]: http("https://rpc.mainnet.chain.robinhood.com/"),
  [robinhoodTestnet.id]: http("https://rpc.testnet.chain.robinhood.com"),
};
