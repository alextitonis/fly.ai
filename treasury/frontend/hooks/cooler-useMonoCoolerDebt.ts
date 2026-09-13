import { useCallback, useState } from "react";
import {
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";
import { useQueryClient } from "@tanstack/react-query";
import { getContractAddress, ContractName } from "@/lib/contracts";
import { getTokenAddress, TokenName } from "@/lib/tokens";
import CoolerV2MonoCoolerABI from "@/abis/CoolerV2MonoCooler";
import CoolerV2CompositesABI from "@/abis/CoolerV2Composites";
import { useTransactionToast, type TransactionToastConfig } from "@/hooks/use-transaction-toast";
import { useMonoCoolerPosition } from "./cooler-useMonoCoolerPosition";
import {
  getAuthorizationSignature,
  EMPTY_AUTH,
  EMPTY_SIGNATURE,
  type AuthorizationStruct,
  type AuthorizationSignature,
} from "./cooler-getAuthorizationSignature";

/** Subtract 1-hour interest buffer for borrow to account for accrual */
export function calculateBorrowAmount(amount: bigint, interestRateBps: number): bigint {
  if (amount === 0n) return 0n;
  const hourlyRate = interestRateBps / 10000 / 8760;
  const bufferWad = BigInt(Math.floor(hourlyRate * 1e18));
  const buffer = (amount * bufferWad) / 10n ** 18n;
  return amount - buffer;
}

/** Add 1-hour interest buffer for full repay to ensure complete repayment */
export function calculateRepayAmount(
  amount: bigint,
  interestRateBps: number,
  fullRepay: boolean,
): bigint {
  if (!fullRepay || amount === 0n) return amount;
  const hourlyRate = interestRateBps / 10000 / 8760;
  const bufferWad = BigInt(Math.floor(hourlyRate * 1e18));
  const buffer = (amount * bufferWad) / 10n ** 18n;
  return amount + buffer;
}

const BORROW_TOAST: TransactionToastConfig = {
  pending: { title: "Borrowing USDC...", description: "Please wait for confirmation." },
  success: { title: "Borrow successful!", description: "USDC has been sent to your wallet." },
  error: {
    title: "Borrow failed",
    description: "There was an error borrowing.",
    userRejected: { title: "Borrow cancelled", description: "You cancelled the transaction." },
  },
};

const REPAY_TOAST: TransactionToastConfig = {
  pending: { title: "Repaying loan...", description: "Please wait for confirmation." },
  success: { title: "Repayment successful!", description: "Your debt has been reduced." },
  error: {
    title: "Repayment failed",
    description: "There was an error repaying.",
    userRejected: { title: "Repayment cancelled", description: "You cancelled the transaction." },
  },
};

const COLLATERAL_TOAST: TransactionToastConfig = {
  pending: { title: "Processing collateral...", description: "Please wait for confirmation." },
  success: { title: "Collateral updated!", description: "Your position has been updated." },
  error: {
    title: "Transaction failed",
    description: "There was an error updating collateral.",
    userRejected: { title: "Transaction cancelled", description: "You cancelled the transaction." },
  },
};

export function useMonoCoolerDebt() {
  const { address, chainId: connectedChainId } = useConnectedAddress();
  const chainId = connectedChainId ?? 0;
  const queryClient = useQueryClient();
  const { walletClient } = usePrivyWalletClient();
  const { position, queryKey: positionQueryKey } = useMonoCoolerPosition();

  const monoCoolerAddress = getContractAddress(ContractName.COOLER_V2_MONOCOOLER, chainId);
  const compositesAddress = getContractAddress(ContractName.COOLER_V2_COMPOSITES, chainId);

  // Read nonce for EIP-712 signatures
  const nonceQueryKey = [
    "readContract",
    {
      functionName: "authorizationNonces",
      address: monoCoolerAddress,
      args: address ? [address] : undefined,
    },
  ] as const;
  const { data: authNonce } = useReadContract({
    address: monoCoolerAddress,
    abi: CoolerV2MonoCoolerABI,
    functionName: "authorizationNonces",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!monoCoolerAddress },
  });

  const usdsTokenAddress = getTokenAddress(TokenName.USDC, chainId);
  const gshitTokenAddress = getTokenAddress(TokenName.WSTSHIT, chainId);

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: positionQueryKey });
    queryClient.invalidateQueries({ queryKey: nonceQueryKey });
    // Broad invalidation for any readContract calls to monoCooler (accountPosition, etc.)
    if (monoCoolerAddress) {
      queryClient.invalidateQueries({
        queryKey: ["readContract", { address: monoCoolerAddress }],
      });
    }
    if (usdsTokenAddress) {
      queryClient.invalidateQueries({
        queryKey: ["readContract", { address: usdsTokenAddress, functionName: "balanceOf" }],
      });
    }
    if (gshitTokenAddress) {
      queryClient.invalidateQueries({
        queryKey: ["readContract", { address: gshitTokenAddress, functionName: "balanceOf" }],
      });
    }
  }, [queryClient, positionQueryKey, nonceQueryKey, monoCoolerAddress, usdsTokenAddress, gshitTokenAddress]);

  // --- Composite Authorization Signature (EOA) ---
  const [compositeAuth, setCompositeAuth] = useState<{
    auth: AuthorizationStruct;
    signature: AuthorizationSignature;
  } | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const signAuthorization = useCallback(async () => {
    if (!address || !compositesAddress || !monoCoolerAddress || !walletClient) return;
    setIsSigning(true);
    try {
      const nonce = authNonce ?? 0n;
      const result = await getAuthorizationSignature({
        userAddress: address,
        authorizedAddress: compositesAddress,
        verifyingContract: monoCoolerAddress,
        chainId,
        nonce: nonce as bigint,
        walletClient,
      });
      setCompositeAuth(result);
    } catch {
      // User rejected or error
    } finally {
      setIsSigning(false);
    }
  }, [address, compositesAddress, monoCoolerAddress, authNonce, chainId, walletClient]);

  // --- Borrow ---
  const borrowWrite = usePrivyWriteContract();
  const borrowReceipt = useWaitForTransactionReceipt({ hash: borrowWrite.data, confirmations: 1 });
  useTransactionToast({
    hash: borrowWrite.data,
    isWritePending: borrowWrite.isPending,
    isConfirmed: borrowReceipt.isSuccess,
    writeError: borrowWrite.error,
    confirmError: borrowReceipt.error,
    config: BORROW_TOAST,
    onConfirmed: invalidateQueries,
  });

  const borrow = (amount: bigint) => {
    if (!monoCoolerAddress || !address || !position) return;
    const finalAmount = calculateBorrowAmount(amount, position.interestRateBps);
    borrowWrite.reset();
    borrowWrite.writeContract({
      address: monoCoolerAddress,
      abi: CoolerV2MonoCoolerABI,
      functionName: "borrow",
      args: [finalAmount, address, address],
    });
  };

  // --- Repay ---
  const repayWrite = usePrivyWriteContract();
  const repayReceipt = useWaitForTransactionReceipt({ hash: repayWrite.data, confirmations: 1 });
  useTransactionToast({
    hash: repayWrite.data,
    isWritePending: repayWrite.isPending,
    isConfirmed: repayReceipt.isSuccess,
    writeError: repayWrite.error,
    confirmError: repayReceipt.error,
    config: REPAY_TOAST,
    onConfirmed: invalidateQueries,
  });

  const repay = (amount: bigint, fullRepay = false) => {
    if (!monoCoolerAddress || !address || !position) return;
    const finalAmount = calculateRepayAmount(amount, position.interestRateBps, fullRepay);
    repayWrite.reset();
    repayWrite.writeContract({
      address: monoCoolerAddress,
      abi: CoolerV2MonoCoolerABI,
      functionName: "repay",
      args: [finalAmount, address],
    });
  };

  // --- Add Collateral ---
  const addCollateralWrite = usePrivyWriteContract();
  const addCollateralReceipt = useWaitForTransactionReceipt({
    hash: addCollateralWrite.data,
    confirmations: 1,
  });
  useTransactionToast({
    hash: addCollateralWrite.data,
    isWritePending: addCollateralWrite.isPending,
    isConfirmed: addCollateralReceipt.isSuccess,
    writeError: addCollateralWrite.error,
    confirmError: addCollateralReceipt.error,
    config: COLLATERAL_TOAST,
    onConfirmed: invalidateQueries,
  });

  const addCollateral = (amount: bigint) => {
    if (!monoCoolerAddress || !address) return;
    addCollateralWrite.reset();
    addCollateralWrite.writeContract({
      address: monoCoolerAddress,
      abi: CoolerV2MonoCoolerABI,
      functionName: "addCollateral",
      args: [amount, address, []],
    });
  };

  // --- Withdraw Collateral ---
  const withdrawCollateralWrite = usePrivyWriteContract();
  const withdrawCollateralReceipt = useWaitForTransactionReceipt({
    hash: withdrawCollateralWrite.data,
    confirmations: 1,
  });
  useTransactionToast({
    hash: withdrawCollateralWrite.data,
    isWritePending: withdrawCollateralWrite.isPending,
    isConfirmed: withdrawCollateralReceipt.isSuccess,
    writeError: withdrawCollateralWrite.error,
    confirmError: withdrawCollateralReceipt.error,
    config: COLLATERAL_TOAST,
    onConfirmed: invalidateQueries,
  });

  const withdrawCollateral = (amount: bigint) => {
    if (!monoCoolerAddress || !address) return;
    withdrawCollateralWrite.reset();
    withdrawCollateralWrite.writeContract({
      address: monoCoolerAddress,
      abi: CoolerV2MonoCoolerABI,
      functionName: "withdrawCollateral",
      args: [amount, address, address, []],
    });
  };

  // --- Composites: Add Collateral + Borrow ---
  const addCollateralAndBorrowWrite = usePrivyWriteContract();
  const addCollateralAndBorrowReceipt = useWaitForTransactionReceipt({
    hash: addCollateralAndBorrowWrite.data,
    confirmations: 1,
  });
  useTransactionToast({
    hash: addCollateralAndBorrowWrite.data,
    isWritePending: addCollateralAndBorrowWrite.isPending,
    isConfirmed: addCollateralAndBorrowReceipt.isSuccess,
    writeError: addCollateralAndBorrowWrite.error,
    confirmError: addCollateralAndBorrowReceipt.error,
    config: BORROW_TOAST,
    onConfirmed: invalidateQueries,
  });

  const addCollateralAndBorrow = async (
    collateralAmt: bigint,
    borrowAmt: bigint,
    isAuth: boolean,
  ) => {
    if (!compositesAddress || !monoCoolerAddress || !address || !position) return;

    const finalBorrowAmt = calculateBorrowAmount(borrowAmt, position.interestRateBps);
    addCollateralAndBorrowWrite.reset();

    if (isAuth) {
      addCollateralAndBorrowWrite.writeContract({
        address: compositesAddress,
        abi: CoolerV2CompositesABI,
        functionName: "addCollateralAndBorrow",
        args: [EMPTY_AUTH, EMPTY_SIGNATURE, collateralAmt, finalBorrowAmt, []],
      });
      return;
    }

    // EOA: use pre-signed authorization
    if (!compositeAuth) return;
    addCollateralAndBorrowWrite.writeContract({
      address: compositesAddress,
      abi: CoolerV2CompositesABI,
      functionName: "addCollateralAndBorrow",
      args: [compositeAuth.auth, compositeAuth.signature, collateralAmt, finalBorrowAmt, []],
    });
  };

  // --- Composites: Repay + Remove Collateral ---
  const repayAndRemoveCollateralWrite = usePrivyWriteContract();
  const repayAndRemoveCollateralReceipt = useWaitForTransactionReceipt({
    hash: repayAndRemoveCollateralWrite.data,
    confirmations: 1,
  });
  useTransactionToast({
    hash: repayAndRemoveCollateralWrite.data,
    isWritePending: repayAndRemoveCollateralWrite.isPending,
    isConfirmed: repayAndRemoveCollateralReceipt.isSuccess,
    writeError: repayAndRemoveCollateralWrite.error,
    confirmError: repayAndRemoveCollateralReceipt.error,
    config: REPAY_TOAST,
    onConfirmed: invalidateQueries,
  });

  const repayAndRemoveCollateral = async (
    repayAmt: bigint,
    collateralAmt: bigint,
    fullRepay: boolean,
    isAuthorized: boolean,
  ) => {
    if (!compositesAddress || !monoCoolerAddress || !address || !position) return;

    const finalRepayAmt = calculateRepayAmount(repayAmt, position.interestRateBps, fullRepay);
    repayAndRemoveCollateralWrite.reset();

    if (isAuthorized) {
      repayAndRemoveCollateralWrite.writeContract({
        address: compositesAddress,
        abi: CoolerV2CompositesABI,
        functionName: "repayAndRemoveCollateral",
        args: [EMPTY_AUTH, EMPTY_SIGNATURE, finalRepayAmt, collateralAmt, []],
      });
      return;
    }

    // EOA: use pre-signed authorization
    if (!compositeAuth) return;
    repayAndRemoveCollateralWrite.writeContract({
      address: compositesAddress,
      abi: CoolerV2CompositesABI,
      functionName: "repayAndRemoveCollateral",
      args: [compositeAuth.auth, compositeAuth.signature, finalRepayAmt, collateralAmt, []],
    });
  };

  const resetTxState = useCallback(() => {
    borrowWrite.reset();
    repayWrite.reset();
    addCollateralWrite.reset();
    withdrawCollateralWrite.reset();
    addCollateralAndBorrowWrite.reset();
    repayAndRemoveCollateralWrite.reset();
    setCompositeAuth(null);
  }, [
    borrowWrite,
    repayWrite,
    addCollateralWrite,
    withdrawCollateralWrite,
    addCollateralAndBorrowWrite,
    repayAndRemoveCollateralWrite,
  ]);

  return {
    borrow,
    repay,
    addCollateral,
    withdrawCollateral,
    addCollateralAndBorrow,
    repayAndRemoveCollateral,
    signAuthorization,
    resetTxState,
    isSigning,
    isSignSuccess: !!compositeAuth,
    isBorrowing: borrowWrite.isPending || borrowReceipt.isLoading,
    isRepaying: repayWrite.isPending || repayReceipt.isLoading,
    isAddingCollateral: addCollateralWrite.isPending || addCollateralReceipt.isLoading,
    isWithdrawingCollateral:
      withdrawCollateralWrite.isPending || withdrawCollateralReceipt.isLoading,
    isAddingCollateralAndBorrowing:
      addCollateralAndBorrowWrite.isPending || addCollateralAndBorrowReceipt.isLoading,
    isRepayingAndRemovingCollateral:
      repayAndRemoveCollateralWrite.isPending || repayAndRemoveCollateralReceipt.isLoading,
    borrowHash: borrowWrite.data,
    repayHash: repayWrite.data,
    addCollateralHash: addCollateralWrite.data,
    addCollateralAndBorrowHash: addCollateralAndBorrowWrite.data,
    repayAndRemoveCollateralHash: repayAndRemoveCollateralWrite.data,
    isBorrowSuccess: borrowReceipt.isSuccess,
    isRepaySuccess: repayReceipt.isSuccess,
    isAddCollateralSuccess: addCollateralReceipt.isSuccess,
    isAddCollateralAndBorrowSuccess: addCollateralAndBorrowReceipt.isSuccess,
    isRepayAndRemoveCollateralSuccess: repayAndRemoveCollateralReceipt.isSuccess,
  };
}
