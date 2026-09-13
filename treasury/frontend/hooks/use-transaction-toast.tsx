import { useEffect, useRef } from "react";
import { BaseError } from "viem";
import { toast } from "@/components/ui-sonner";
import { toast as sonnerToast } from "sonner";

export interface TransactionToastConfig {
  pending: {
    title: string;
    description: string;
  };
  success: {
    title: string;
    description: string;
  };
  error: {
    title: string;
    description: string;
    // Optional custom error handlers
    userRejected?: {
      title: string;
      description: string;
    };
    insufficientFunds?: {
      title: string;
      description: string;
    };
  };
}

export function useTransactionToast({
  hash,
  isWritePending,
  isConfirmed,
  writeError,
  confirmError,
  config,
  onConfirmed,
}: {
  hash?: `0x${string}`;
  isWritePending: boolean;
  isConfirmed: boolean;
  writeError: Error | null;
  confirmError: Error | null;
  config: TransactionToastConfig;
  onConfirmed?: () => void;
}) {
  const toastIdRef = useRef<string | number | null>(null);
  const processedHashRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset when hash changes (new transaction)
    if (hash && hash !== processedHashRef.current) {
      processedHashRef.current = null;
    }

    // Show pending toast when transaction is submitted
    if (hash && isWritePending === false && !toastIdRef.current && !processedHashRef.current) {
      toastIdRef.current = toast(
        {
          type: "info",
          title: config.pending.title,
          description: config.pending.description,
        },
        {
          duration: Infinity,
        },
      );
    }

    // Show success toast when confirmed (only if we haven't processed this hash)
    if (isConfirmed && toastIdRef.current && !processedHashRef.current) {
      sonnerToast.dismiss(toastIdRef.current);
      toastIdRef.current = toast({
        type: "success",
        title: config.success.title,
        description: config.success.description,
      });
      toastIdRef.current = null;
      processedHashRef.current = hash || null;
      onConfirmed?.();
    }

    // Show error toast on failure (only if we haven't processed this hash)
    if ((writeError || confirmError) && toastIdRef.current && !processedHashRef.current) {
      sonnerToast.dismiss(toastIdRef.current);

      const error = writeError || confirmError;
      let title = config.error.title;
      let description = config.error.description;

      // Handle specific error types
      if (error instanceof BaseError) {
        if (error.shortMessage?.includes("User rejected")) {
          title = config.error.userRejected?.title || "Transaction cancelled";
          description = config.error.userRejected?.description || "You cancelled the transaction.";
        } else if (error.shortMessage?.includes("insufficient funds")) {
          title = config.error.insufficientFunds?.title || "Insufficient funds";
          description =
            config.error.insufficientFunds?.description ||
            "You don't have enough ETH for gas fees.";
        } else if (error.shortMessage) {
          description = error.shortMessage;
        }
      }

      toastIdRef.current = toast({
        type: "error",
        title,
        description,
      });
      toastIdRef.current = null;
      processedHashRef.current = hash || null;
    }
  }, [hash, isWritePending, isConfirmed, writeError, confirmError, config, onConfirmed]);

  const reset = () => {
    if (toastIdRef.current) {
      sonnerToast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    processedHashRef.current = null;
  };

  return { reset };
}
