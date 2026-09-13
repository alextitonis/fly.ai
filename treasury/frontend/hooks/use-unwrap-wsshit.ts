import { useChainId } from "wagmi";
import { ContractName, getContractAddress } from "@/lib/contracts";
import WsSHITAbi from "@/abis/wsSHIT";
import { useContractWriteFlow } from "./use-contract-write-flow";
import type { TransactionToastConfig } from "./use-transaction-toast";

const toastConfig: TransactionToastConfig = {
  pending: {
    title: "Unwrapping wsSHIT...",
    description: "Please wait while your transaction is confirmed.",
  },
  success: {
    title: "Unwrapped to sSHIT v1",
    description: "Your wsSHIT has been unwrapped to sSHIT v1. Next, unstake it to SHIT v1.",
  },
  error: {
    title: "Unwrap failed",
    description: "There was an error unwrapping your wsSHIT. Please try again.",
    userRejected: {
      title: "Transaction cancelled",
      description: "You cancelled the unwrap transaction.",
    },
    insufficientFunds: {
      title: "Insufficient funds",
      description: "You don't have enough ETH for gas fees.",
    },
  },
};

/**
 * Unwrap wsSHIT → sSHIT v1 via the legacy wsSHIT contract. No approval is needed (the
 * contract burns the caller's own wsSHIT). The resulting sSHIT v1 can then be unstaked to
 * SHIT v1 and migrated. wsSHIT is 18 decimals; the returned sSHIT v1 is 9 decimals and
 * scaled by the wstSHIT index (not 1:1).
 */
export function useUnwrapWsshit() {
  const chainId = useChainId();
  const wsshitAddress = getContractAddress(ContractName.WSSHIT, chainId);

  const { write, ...flow } = useContractWriteFlow({
    address: wsshitAddress,
    abi: WsSHITAbi,
    functionName: "unwrap",
    toastConfig,
  });

  const unwrap = ({ amount, queryKey }: { amount: bigint; queryKey?: readonly unknown[] }) =>
    write({ args: [amount], queryKey });

  return { unwrap, ...flow };
}
