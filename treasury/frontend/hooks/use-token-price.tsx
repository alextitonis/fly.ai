import type { Address } from "viem";
import { parseUnits } from "viem";
import { useReadContract } from "wagmi";
import PriceAbi from "@/abis/Price";
import gShitAbi from "@/abis/wstSHIT";
import { getTokenAddress, TokenName } from "@/lib/tokens";
import { getContractAddress, ContractName } from "@/lib/contracts";
import { formatTokenAmount } from "@/lib/math";

const ONE_WSTSHIT = parseUnits("1", 18);
const PRICE_QUERY_OPTIONS = {
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

function sameAddress(a?: Address, b?: Address): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export const useTokenPrice = (chainId: number, tokenAddress?: Address): { price: number } => {
  const shitAddress = getTokenAddress(TokenName.SHIT, chainId);
  const usdsAddress = getTokenAddress(TokenName.USDS, chainId);
  const azusdAddress = getTokenAddress(TokenName.USDC, chainId);
  const gShitAddress = getTokenAddress(TokenName.WSTSHIT, chainId);
  const priceAddress = getContractAddress(ContractName.PRICE, chainId);

  const isShitToken = sameAddress(tokenAddress, shitAddress);
  const isUsdsToken = sameAddress(tokenAddress, usdsAddress);
  const isAzusdToken = sameAddress(tokenAddress, azusdAddress);
  const isWSTSHITToken = sameAddress(tokenAddress, gShitAddress);

  // PRICE module returns SHIT price in reserve (USDS) with 18 decimals.
  const { data: shitPriceRaw } = useReadContract({
    address: priceAddress,
    abi: PriceAbi,
    functionName: "getCurrentPrice",
    chainId,
    query: {
      ...PRICE_QUERY_OPTIONS,
      enabled: !!tokenAddress && !!priceAddress && (isShitToken || isWSTSHITToken),
    },
  });

  // Convert exactly 1 wstSHIT to SHIT via token contract helper.
  // wstshitToStshit returns stSHIT amount, then stshitPerToken gives SHIT per stSHIT.
  const { data: stshitFromOneWSTSHIT } = useReadContract({
    address: gShitAddress,
    abi: gShitAbi,
    functionName: "wstshitToStshit",
    args: [ONE_WSTSHIT],
    chainId,
    query: {
      ...PRICE_QUERY_OPTIONS,
      enabled: !!tokenAddress && !!gShitAddress && isWSTSHITToken,
    },
  });

  const { data: stshitPerToken } = useReadContract({
    address: gShitAddress,
    abi: gShitAbi,
    functionName: "stshitPerToken",
    chainId,
    query: {
      ...PRICE_QUERY_OPTIONS,
      enabled: !!tokenAddress && !!gShitAddress && isWSTSHITToken,
    },
  });

  if (isUsdsToken || isAzusdToken) {
    // todo:Temporary assumption for stablecoin pricing.
    return { price: 1 };
  }

  if (isShitToken) {
    return { price: shitPriceRaw ? formatTokenAmount(shitPriceRaw) : 0 };
  }

  if (isWSTSHITToken) {
    if (!shitPriceRaw || !stshitFromOneWSTSHIT || !stshitPerToken) return { price: 0 };

    const shitPriceUsd = formatTokenAmount(shitPriceRaw);
    const stshitPerWstshit = formatTokenAmount(stshitFromOneWSTSHIT);
    const shitPerStshit = formatTokenAmount(stshitPerToken);
    const shitPerWstshit = stshitPerWstshit * shitPerStshit;

    return { price: shitPriceUsd * shitPerWstshit };
  }

  return { price: 0 };
};
