import {
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getContractAddress, ContractName } from "@/lib/contracts";
import CoolerV2MonoCoolerABI from "@/abis/CoolerV2MonoCooler";
import { useTransactionToast, type TransactionToastConfig } from "@/hooks/use-transaction-toast";

export function useMonoCoolerAuthorization() {
  const { address, chainId: connectedChainId } = useConnectedAddress();
  const chainId = connectedChainId ?? 0;
  const queryClient = useQueryClient();

  const monoCoolerAddress = getContractAddress(ContractName.COOLER_V2_MONOCOOLER, chainId);
  const compositesAddress = getContractAddress(ContractName.COOLER_V2_COMPOSITES, chainId);

  // Check if composites contract is authorized
  const {
    data: authDeadline,
    isLoading: isCheckingAuthorization,
    queryKey,
  } = useReadContract({
    address: monoCoolerAddress,
    abi: CoolerV2MonoCoolerABI,
    functionName: "authorizations",
    args: address && compositesAddress ? [address, compositesAddress] : undefined,
    query: {
      enabled: !!address && !!compositesAddress,
      refetchInterval: 60000,
    },
  });

  const isAuthorized =
    authDeadline !== undefined && (authDeadline as bigint) > BigInt(Math.floor(Date.now() / 1000));

  // Set authorization mutation
  const {
    data: hash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = usePrivyWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash, confirmations: 1 });

  useEffect(() => {
    if (isConfirmed) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [isConfirmed, queryClient, queryKey]);

  const toastConfig: TransactionToastConfig = {
    pending: {
      title: "Authorizing composites...",
      description: "Please wait for confirmation.",
    },
    success: {
      title: "Authorization successful!",
      description: "You can now proceed with your transaction.",
    },
    error: {
      title: "Authorization failed",
      description: "There was an error setting authorization.",
      userRejected: {
        title: "Authorization cancelled",
        description: "You cancelled the authorization request.",
      },
    },
  };

  useTransactionToast({
    hash,
    isWritePending,
    isConfirmed,
    writeError,
    confirmError,
    config: toastConfig,
  });

  const setAuthorization = (authorizationDeadline?: number) => {
    if (!monoCoolerAddress || !compositesAddress) return;
    // Default: 72 hours for multisig authorization
    const deadline = authorizationDeadline ?? Math.floor(Date.now() / 1000) + 72 * 60 * 60;

    resetWrite();
    writeContract({
      address: monoCoolerAddress,
      abi: CoolerV2MonoCoolerABI,
      functionName: "setAuthorization",
      args: [compositesAddress, BigInt(deadline)],
    });
  };

  return {
    isAuthorized,
    isCheckingAuthorization,
    setAuthorization,
    isSettingAuthorization: isWritePending || isConfirming,
    compositesAddress,
  };
}
