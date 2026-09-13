import type { Address } from "viem";
import type { IconName } from "@/components/icon.tsx";
import type { ChainId } from "./contracts";
import { base, baseSepolia } from "@/lib/chains";

export type TokenInfo = {
  addresses: Partial<Record<ChainId, Address>>;
  symbol: string;
  decimals: number;
  icon: IconName;
};

export enum TokenName {
  USDC = "USDC",
  USDS = "USDS",
  SHIT = "SHIT",
  STSHIT = "STSHIT",
  WSTSHIT = "WSTSHIT",
  BUCKY = "BUCKY",
  RIDX = "RIDX",
  V1_SHIT = "V1_SHIT",
  V1_SSHIT = "V1_SSHIT",
  WSSHIT = "WSSHIT",
  STATA_USDC = "STATA_USDC",
}

export const TOKENS: Record<TokenName, TokenInfo> = {
  USDC: {
    addresses: {
      [base.id]: "0x3595ca37596d5895b70efab592ac315d5b9809b2",
      [baseSepolia.id]: "0xb6a1BC3D383f8751eF0CC216943290740E4D1493",
    },
    symbol: "USDC",
    decimals: 6,
    icon: "USDCTokenIcon",
  },
  SHIT: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
      [baseSepolia.id]: "0x823d5d44F9E647402c949376E54f709Ab3a9015b",
    },
    symbol: "SHIT",
    decimals: 18,
    icon: "SHITTokenIcon",
  },
  STSHIT: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
      [baseSepolia.id]: "0xdb3D61dEE55eF664412BcEBEd144981B2Fc11a34",
    },
    symbol: "stSHIT",
    decimals: 18,
    icon: "STSHITTokenIcon",
  },
  WSTSHIT: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
      [baseSepolia.id]: "0x933E4B8e744733FAaFD67aC99eD8987C9Aa5E533",
    },
    symbol: "wstSHIT",
    decimals: 18,
    icon: "WSTSHITTokenIcon",
  },
  BUCKY: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
      [baseSepolia.id]: "0xd8D866BB5EB8E93Da1c2f3c47Df4ab0E2665422E",
    },
    symbol: "Bucky",
    decimals: 18,
    icon: "BuckyTokenIcon",
  },
  RIDX: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
      [baseSepolia.id]: "0x1C98820e839C3A92C041312259A785B5e16Df997",
    },
    symbol: "RIDX",
    decimals: 18,
    icon: "WSTSHITTokenIcon",
  },
  USDS: {
    addresses: {
      [base.id]: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
      [baseSepolia.id]: "0x74Ca575601aa47a1aa44bD6786F3C0be36afA079",
    },
    symbol: "sUSDS",
    decimals: 18,
    icon: "USDCTokenIcon",
  },
  V1_SHIT: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
    },
    symbol: "SHIT v1",
    decimals: 9,
    icon: "SHITTokenIcon",
  },
  V1_SSHIT: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
    },
    symbol: "stSHIT v1",
    decimals: 9,
    icon: "SHITTokenIcon",
  },
  WSSHIT: {
    addresses: {
      [base.id]: "0x0000000000000000000000000000000000000000",
    },
    symbol: "wsSHIT",
    decimals: 18,
    icon: "WSTSHITTokenIcon",
  },
  STATA_USDC: {
    addresses: {
      [baseSepolia.id]: "0xb3f8cbBb5F63928ffaeA4545370ceB598f270FbE",
    },
    symbol: "USDC",
    decimals: 6,
    icon: "USDCTokenIcon",
  },
};

export function getTokenAddress(token: TokenName, chainId: ChainId): Address | undefined {
  return TOKENS[token].addresses[chainId];
}

export function requireTokenAddress(token: TokenName, chainId: ChainId): Address {
  const address = getTokenAddress(token, chainId);
  if (!address) {
    throw new Error(`Token ${token} not found on chain ${chainId}`);
  }
  return address;
}
