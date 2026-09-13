import "dotenv/config";

const KEY = process.env.SWIFTNODES_API_KEY || "YOUR_KEY";
const ws = (slug) => `wss://rpc.swiftnodes.io/ws/${slug}?key=${KEY}`;

export const CHAINS = {
  eth: {
    name: "Ethereum",
    wsUrl: ws("eth"),
    explorerAddr: "https://etherscan.io/address/",
    explorerTx: "https://etherscan.io/tx/",
    nativeSymbol: "ETH",
    quoteTokens: {
      WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
      USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    },
    factories: [
      { name: "UniswapV2",  version: 2, address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" },
      { name: "SushiV2",    version: 2, address: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac" },
    ],
  },
  base: {
    name: "Base",
    wsUrl: ws("base"),
    explorerAddr: "https://basescan.org/address/",
    explorerTx: "https://basescan.org/tx/",
    nativeSymbol: "ETH",
    quoteTokens: {
      WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
      USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    },
    factories: [
      { name: "UniswapV2",  version: 2, address: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" },
      { name: "BaseSwap",   version: 2, address: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB" },
      { name: "Aerodrome",  version: 2, address: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" },
    ],
  },
  bsc: {
    name: "BNB Smart Chain",
    wsUrl: ws("bsc"),
    explorerAddr: "https://bscscan.com/address/",
    explorerTx: "https://bscscan.com/tx/",
    nativeSymbol: "BNB",
    quoteTokens: {
      WBNB: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
      BUSD: { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
      USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    },
    factories: [
      { name: "PancakeV2", version: 2, address: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" },
      { name: "BiswapV2",  version: 2, address: "0x858E3312ed3A876947EA49d572A7C42DE08af7EE" },
    ],
  },
};

export function getChain() {
  const slug = (process.env.CHAIN || "base").toLowerCase();
  const chain = CHAINS[slug];
  if (!chain) {
    throw new Error(`Unknown chain "${slug}". Supported: ${Object.keys(CHAINS).join(", ")}`);
  }
  return { ...chain, slug };
}
