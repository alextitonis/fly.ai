import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";
import { useTransactionToast, type TransactionToastConfig } from "./use-transaction-toast";

export function useTokenApproval() {
  const queryClient = useQueryClient();
  const queryKeyRef = useRef<readonly unknown[] | undefined>(undefined);

  const { walletClient, address: account } = usePrivyWalletClient();
  const publicClient = usePublicClient();

  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const [writeError, setWriteError] = useState<Error | null>(null);
  const [isWritePending, setIsWritePending] = useState(false);

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  useEffect(() => {
    if (isConfirmed && queryKeyRef.current) {
      queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      queryKeyRef.current = undefined;
    }
  }, [isConfirmed, queryClient]);

  useEffect(() => {
    if (writeError) {
      console.error("[useTokenApproval] write error:", writeError);
    }
    if (confirmError) {
      console.error("[useTokenApproval] confirm error:", confirmError);
    }
  }, [writeError, confirmError]);

  const toastConfig: TransactionToastConfig = {
    pending: {
      title: "Approving token...",
      description: "Please wait while your approval is confirmed.",
    },
    success: {
      title: "Token approval successful!",
      description: "You can now proceed with your transaction.",
    },
    error: {
      title: "Approval failed",
      description: "There was an error approving the token. Please try again.",
      userRejected: {
        title: "Approval cancelled",
        description: "You cancelled the approval request.",
      },
      insufficientFunds: {
        title: "Insufficient funds",
        description: "You don't have enough ETH for gas fees.",
      },
    },
  };

  const { reset: resetToast } = useTransactionToast({
    hash,
    isWritePending,
    isConfirmed,
    writeError,
    confirmError,
    config: toastConfig,
  });

  const approve = useCallback(
    async ({
      tokenAddress,
      spender,
      amount,
      queryKey,
    }: {
      tokenAddress: Address;
      spender: Address;
      amount: bigint;
      queryKey?: readonly unknown[];
    }) => {
      if (!account || !walletClient) return;

      setHash(undefined);
      setWriteError(null);
      resetToast();

      if (queryKey) {
        queryKeyRef.current = queryKey;
      }

      setIsWritePending(true);

      // Estimate gas with 50% buffer; fall back to wallet estimation if it fails
      let gas: bigint | undefined;
      try {
        if (publicClient && account) {
          const estimate = await publicClient.estimateContractGas({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, amount],
            account,
          });
          gas = (estimate * 3n) / 2n;
          if (gas > 5_000_000n) gas = 5_000_000n;
        }
      } catch {
        // Estimation failed — let wallet estimate
      }

      walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
        ...(gas ? { gas } : {}),
      } as any)
        .then((txHash: `0x${string}`) => {
          setHash(txHash);
        })
        .catch((err: Error) => {
          setWriteError(err as Error);
        })
        .finally(() => {
          setIsWritePending(false);
        });
    },
    [account, walletClient, resetToast],
  );

  const reset = useCallback(() => {
    setHash(undefined);
    setWriteError(null);
    setIsWritePending(false);
    resetToast();
  }, [resetToast]);

  const isPending = isWritePending || isConfirming;
  const isSuccess = isConfirmed;
  const error = writeError || confirmError;

  return {
    approve,
    isPending,
    isSuccess,
    error,
    hash,
    reset,
    isWritePending,
    isConfirming,
    writeError,
    confirmError,
  };
}
