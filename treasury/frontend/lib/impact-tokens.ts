import type { Address } from "viem";
import { base, baseSepolia } from "@/lib/chains";

export type ImpactTokenInfo = {
  name: string;
  symbol: string;
  website: string;
  address: Address;
  testnetAddress?: Address;
  initialAllocation: number;
  description: string;
  logoUrl?: string;
};

export const IMPACT_TOKENS: ImpactTokenInfo[] = [
  {
    name: "Solarcoin",
    symbol: "SLR",
    website: "https://solarcoin.org/",
    address: "0x4E9e4Ab99Cfc14B852f552f5Fb3Aa68617825B6c",
    testnetAddress: "0xaC1f1b7C607ec0416c5174973dbc858e732054A7",
    initialAllocation: 88_000,
    logoUrl: "https://coin-images.coingecko.com/coins/images/152/large/solarcoin.png?1696501524",
    description:
      "Solarcoin is a global decentralized energy currency that rewards solar energy producers. " +
      "Each MWh of solar energy verified by the Solarcoin foundation earns one SLR, incentivizing " +
      "clean energy generation worldwide.",
  },
  {
    name: "Treegens",
    symbol: "TREE",
    website: "https://treegens.app/",
    address: "0xD75dfa972C6136f1c594Fec1945302f885E1ab29",
    testnetAddress: "0x815c5b6e910c9159d1bCf3569f833acd0dDf8d2A",
    initialAllocation: 85_000,
    logoUrl: "/logo-treegens.svg",
    description:
      "Treegens is a regenerative finance token focused on reforestation and carbon sequestration. " +
      "The protocol funds tree planting projects and tokenizes the environmental impact, allowing " +
      "participants to support and trade verified reforestation outcomes.",
  },
  {
    name: "Regen",
    symbol: "REGEN",
    website: "https://www.regen.network/",
    address: "0x2E6C05f1f7D1f4Eb9A088bf12257f1647682b754",
    testnetAddress: "0x5D3cEFD66EBf2ed769C13b05C85Dc25Aa4e72153",
    initialAllocation: 16_000,
    logoUrl: "/logo-regen.webp",
    description:
      "Regen Network is a platform for ecological verification and carbon credit markets. REGEN " +
      "tokens govern the registry of ecological claims, enabling transparent verification of " +
      "carbon offsets, biodiversity credits, and other ecological assets.",
  },
  {
    name: "DOVU",
    symbol: "DOVU",
    website: "https://dovu.earth/",
    address: "0xB38266e0e9D9681b77aEB0A280E98131b953F865",
    testnetAddress: "0x28f7EFEa7E76F530425f73e410d97f958Ed60018",
    initialAllocation: 841_000,
    logoUrl: "/logo-dovu.webp",
    description:
      "DOVU is a carbon credit protocol that tokenizes verified carbon offsets from soil carbon " +
      "sequestration and other regenerative agricultural practices. The platform connects farmers " +
      "and land stewards with carbon credit buyers through blockchain-verified measurement.",
  },
  {
    name: "Klima Protocol",
    symbol: "KLIMA",
    website: "https://www.klimaprotocol.com/",
    address: "0x00fBAC94Fec8D4089d3fe979F39454F48c71A65d",
    testnetAddress: "0x2434eAf23175c983B23D3d044921fCF3ea3dCAcC",
    initialAllocation: 66_000,
    logoUrl: "https://www.klimaprotocol.com/favicon.ico",
    description:
      "Klima Protocol is a carbon market token that facilitates the trading and retirement " +
      "of tokenized carbon credits. It aims to create deep liquidity for carbon assets and " +
      "drive capital toward climate mitigation projects.",
  },
  {
    name: "Crypto Endowment Network",
    symbol: "CEN",
    website: "https://cryptoendowmentnetwork.org/",
    address: "0xcfe6235d98b99204ed4611297af45caa0871cad3",
    testnetAddress: "0x4d866898f3a4FF80416F1d37c2bF0EDb647a9b37",
    initialAllocation: 0,
    logoUrl: "/logo-cen.jpg",
    description:
      "CEN (Crypto Endowment Network) is a regenerative finance protocol that creates permanent " +
      "endowments for environmental and social impact projects. The token governs a treasury that " +
      "funds climate initiatives, conservation, and community-driven sustainability programs through " +
      "a decentralized grant-making framework.",
  },
];

export function getImpactTokenByAddress(address: Address): ImpactTokenInfo | undefined {
  return IMPACT_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

export function getImpactTokenAddress(token: ImpactTokenInfo, chainId: number): Address | undefined {
  if (chainId === baseSepolia.id) return token.testnetAddress;
  if (chainId === base.id) return token.address;
  return undefined;
}

export const IMPACT_TOKENS_BASE_CHAIN_ID = base.id;
