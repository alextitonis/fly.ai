import { useCallback, useState } from "react";
import { useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";

/**
 * Drop-in replacement for wagmi's useWriteContract that uses Privy's wallet
 * provider directly instead of wagmi's connector system.
 *
 * Estimates gas via the public client with a 50% buffer before sending,
 * falling back to the wallet's own estimation if the estimate call fails.
 * This prevents "Execution reverted" errors caused by insufficient gas limits.
 *
 * Returns the same shape as wagmi's useWriteContract:
 * { writeContract, writeContractAsync, isPending, error, reset, status }
 */
export function usePrivyWriteContract() {
  const { walletClient, address } = usePrivyWalletClient();
  const publicClient = usePublicClient();

  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash, confirmations: 1 });

  const writeContractAsync = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      if (!walletClient) {
        throw new Error("Connector not connected. Please connect your wallet.");
      }
      setIsPending(true);
      setError(null);
      try {
        // Estimate gas with a 50% buffer, capped at 5M to avoid absurd values.
        // Falls back to no gas limit (wallet estimates) if estimation fails.
        let gas: bigint | undefined;
        try {
          if (publicClient && address && args.address && args.abi && args.functionName) {
            const estimate = await publicClient.estimateContractGas({
              address: args.address,
              abi: args.abi,
              functionName: args.functionName,
              args: args.args,
              account: address,
            });
            gas = (estimate * 3n) / 2n;
            if (gas > 5_000_000n) gas = 5_000_000n;
          }
        } catch {
          // Estimation failed (e.g. contract would revert, or args missing) —
          // let the wallet do its own estimation by not passing gas.
        }

        const txHash = await walletClient.writeContract(
          gas ? { ...args, gas } as any : args as any,
        );
        setHash(txHash);
        return txHash;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [walletClient, publicClient, address],
  );

  const writeContract = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (args: any) => {
      writeContractAsync(args).catch(() => {
        // Error is already set in state; the async version throws for
        // callers that want to await. The sync version just swallows.
      });
    },
    [writeContractAsync],
  );

  const reset = useCallback(() => {
    setHash(undefined);
    setIsPending(false);
    setError(null);
  }, []);

  return {
    writeContract,
    writeContractAsync,
    data: hash,
    hash,
    isPending,
    isError: !!error,
    isSuccess: isConfirmed,
    isLoading: isConfirming,
    error: error || confirmError,
    status: isPending
      ? "pending"
      : error
        ? "error"
        : isConfirmed
          ? "success"
          : "idle",
    reset,
  };
}
