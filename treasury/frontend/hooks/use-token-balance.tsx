import { useEffect } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "viem";

export function useTokenBalance(tokenAddress?: Address, account?: Address) {
  const {
    data: result,
    isLoading,
    error,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account!],
    query: {
      enabled: !!account && !!tokenAddress,
    },
  });

  useEffect(() => {
    if (error) {
      console.error("[useTokenBalance] error:", { tokenAddress, account, error });
    }
  }, [error, tokenAddress, account]);

  return {
    balance: result as bigint | undefined,
    isLoading,
    error,
  };
}
