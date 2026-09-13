import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { type Abi, type Address } from "viem";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";
import { useTransactionToast, type TransactionToastConfig } from "./use-transaction-toast";

/**
 * Shared scaffold for single-transaction contract writes: write → wait for confirmation →
 * invalidate on-chain read queries → toast lifecycle. Gas is estimated at click-time with
 * a 50% buffer, falling back to the wallet's own estimation when the estimate call fails.
 *
 * Uses Privy's wallet provider directly (via usePrivyWalletClient) instead of wagmi's
 * useWriteContract, which requires a connected wagmi connector that the @privy-io/wagmi
 * bridge doesn't reliably establish.
 */
export function useContractWriteFlow({
  address,
  abi,
  functionName,
  toastConfig,
}: {
  address?: Address;
  abi: Abi;
  functionName: string;
  toastConfig: TransactionToastConfig;
}) {
  const queryClient = useQueryClient();
  const queryKeyRef = useRef<readonly unknown[] | undefined>(undefined);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { walletClient, address: account } = usePrivyWalletClient();
  const publicClient = usePublicClient();

  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const [writeError, setWriteError] = useState<Error | null>(null);
  const [isWritePending, setIsWritePending] = useState(false);

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash, confirmations: 1 });

  useEffect(() => {
    if (!isConfirmed) return;

    if (queryKeyRef.current) {
      queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      queryKeyRef.current = undefined;
    }

    queryClient.invalidateQueries({ queryKey: ["readContract"] });
    queryClient.invalidateQueries({ queryKey: ["readContracts"] });
    queryClient.invalidateQueries({ queryKey: ["allTokenBalances"] });
    queryClient.invalidateQueries({ queryKey: ["multiChainBalance"] });
  }, [isConfirmed, queryClient]);

  const { reset: resetToast } = useTransactionToast({
    hash,
    isWritePending,
    isConfirmed,
    writeError,
    confirmError,
    config: toastConfig,
  });

  const write = useCallback(
    async ({
      args,
      queryKey,
    }: {
      args: readonly unknown[];
      queryKey?: readonly unknown[];
    }) => {
      if (!account || !address || !walletClient) return;
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        setWriteError(null);
        resetToast();

        if (queryKey) queryKeyRef.current = queryKey;

        let gas: bigint | undefined;
        try {
          if (publicClient) {
            const estimate = await publicClient.estimateContractGas({
              address,
              abi,
              functionName,
              args,
              account,
            });
            gas = (estimate * 3n) / 2n;
            if (gas > 5_000_000n) gas = 5_000_000n;
          }
        } catch {
          // Estimation failed — let wallet estimate gas automatically
        }

        setIsWritePending(true);
        const txHash = await walletClient.writeContract({
          address,
          abi,
          functionName,
          args: args as any,
          ...(gas ? { gas } : {}),
        } as any);
        setHash(txHash);
      } catch (err) {
        setWriteError(err as Error);
      } finally {
        setIsWritePending(false);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [account, address, walletClient, publicClient, abi, functionName, resetToast],
  );

  const reset = useCallback(() => {
    setHash(undefined);
    setWriteError(null);
    setIsWritePending(false);
    resetToast();
  }, [resetToast]);

  return {
    write,
    isPending: isSubmitting || isWritePending || isConfirming,
    isSuccess: isConfirmed,
    error: writeError || confirmError,
    hash,
    reset,
    isWritePending,
    isConfirming,
  };
}
