import { useMemo } from "react";
import { useReadContract, useChainId } from "wagmi";
import { parseUnits, parseEther, formatUnits, formatEther } from "viem";
import { getTokenAddress, TokenName } from "@/lib/tokens";
import wstSHITAbi from "@/abis/wstSHIT";

/** Trim trailing zeros from a decimal string, keeping at least `minDecimals` places. */
function trimDecimals(value: string, maxDecimals: number, minDecimals = 2): string {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return value;
  const fixed = num.toFixed(maxDecimals);
  const [int, dec] = fixed.split(".");
  if (!dec) return fixed;
  const trimmed = dec.replace(/0+$/, "").padEnd(minDecimals, "0");
  return `${int}.${trimmed}`;
}

/** Read the wstSHIT contract's stShitPerToken (the source of truth for conversions). */
export function useGshitIndex({ enabled = true }: { enabled?: boolean } = {}) {
  const chainId = useChainId();
  const gshitAddress = getTokenAddress(TokenName.WSTSHIT, chainId);

  const { data: index, isLoading } = useReadContract({
    address: gshitAddress,
    abi: wstSHITAbi,
    functionName: "stShitPerToken",
    query: {
      enabled: enabled && !!gshitAddress,
    },
  });

  return { index: index as bigint | undefined, isLoading };
}

/**
 * Compute the Wrap-page output amount for a given input. "wrap"/"unwrap" use the wstSHIT
 * index with client-side bigint math (matches wstSHIT.balanceTo / wstSHIT.balanceFrom exactly).
 * "identity" is the 1:1 sSHIT → SHIT path: no index read, formatting only.
 */
export function useWstShitConversion(mode: "wrap" | "unwrap" | "identity", inputAmount: string) {
  const { index } = useGshitIndex({ enabled: mode !== "identity" });

  const outputAmount = useMemo(() => {
    if (!inputAmount || parseFloat(inputAmount) === 0) return "";
    if (mode === "identity") return trimDecimals(inputAmount, 4);
    if (!index || index === 0n) return "";

    try {
      if (mode === "wrap") {
        // wstSHIT.balanceTo: wstSHIT = sSHIT * 1e18 / index
        const shitBigInt = parseUnits(inputAmount, 18);
        const gshitBigInt = (shitBigInt * 10n ** 18n) / index;
        return trimDecimals(formatEther(gshitBigInt), 6);
      }
      // wstSHIT.balanceFrom: sSHIT = wstSHIT * index / 1e18
      const gshitBigInt = parseEther(inputAmount);
      const shitBigInt = (gshitBigInt * index) / 10n ** 18n;
      return trimDecimals(formatUnits(shitBigInt, 18), 4);
    } catch {
      return "";
    }
  }, [inputAmount, index, mode]);

  return { outputAmount };
}

/**
 * Conversion rates using the wstSHIT index.
 */
export function useWstShitConversionRate() {
  const { index, isLoading } = useGshitIndex();

  const rates = useMemo(() => {
    if (!index || index === 0n) return { shitPerGshit: undefined, gshitPerShit: undefined };

    // wstSHIT index is stSHIT per 1 wstSHIT, scaled to 18 decimals.
    const shitPerGshit = trimDecimals(formatUnits(index, 18), 3);
    // 1 SHIT (1e18) -> wstSHIT: wstSHIT = 1e18 * 1e18 / index
    const gshitBigInt = (10n ** 18n * 10n ** 18n) / index;
    const gshitPerShit = trimDecimals(formatEther(gshitBigInt), 6);

    return { shitPerGshit, gshitPerShit };
  }, [index]);

  return { ...rates, isLoading };
}

/** Read the total supply of wstSHIT from the contract (returns bigint in 18 decimals). */
export function useGshitTotalSupply() {
  const chainId = useChainId();
  const gshitAddress = getTokenAddress(TokenName.WSTSHIT, chainId);
  const { data } = useReadContract({
    address: gshitAddress,
    abi: wstSHITAbi,
    functionName: "totalSupply",
    query: { enabled: !!gshitAddress },
  });
  return { totalSupply: data as bigint | undefined };
}
