import { useEffect } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { erc20Abi } from "viem";

export function useTokenAllowance(tokenAddress: Address, owner?: Address, spender?: Address) {
  const {
    data: result,
    isLoading,
    error,
    refetch,
    queryKey,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner!, spender!],
    query: {
      enabled: !!owner && !!spender,
    },
  });

  useEffect(() => {
    if (error) {
      console.error("[useTokenAllowance] error:", { tokenAddress, owner, spender, error });
    }
  }, [error, tokenAddress, owner, spender]);

  return {
    allowance: result,
    isLoading,
    error,
    refetch,
    queryKey,
  };
}
