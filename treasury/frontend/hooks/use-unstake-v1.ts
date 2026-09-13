import { useChainId } from "wagmi";
import { ContractName, getContractAddress } from "@/lib/contracts";
import ShitStakingV1Abi from "@/abis/ShitStakingV1";
import { useContractWriteFlow } from "./use-contract-write-flow";
import type { TransactionToastConfig } from "./use-transaction-toast";

const toastConfig: TransactionToastConfig = {
  pending: {
    title: "Unstaking sSHIT v1...",
    description: "Please wait while your transaction is confirmed.",
  },
  success: {
    title: "Unstaked to SHIT v1",
    description: "Your sSHIT v1 has been unstaked to SHIT v1. You can now migrate.",
  },
  error: {
    title: "Unstake failed",
    description: "There was an error unstaking your sSHIT v1. Please try again.",
    userRejected: {
      title: "Transaction cancelled",
      description: "You cancelled the unstake transaction.",
    },
    insufficientFunds: {
      title: "Insufficient funds",
      description: "You don't have enough ETH for gas fees.",
    },
  },
};

/**
 * Unstake sSHIT v1 → SHIT v1 via the legacy 5H1T v1 staking contract (1:1). Requires a
 * prior exact-amount sSHIT v1 approval to the staking contract. This is the prerequisite
 * step for sSHIT v1 holders who want to migrate (the migrator only burns SHIT v1).
 */
export function useUnstakeV1() {
  const chainId = useChainId();
  const stakingV1 = getContractAddress(ContractName.STAKING_V1, chainId);

  const { write, ...flow } = useContractWriteFlow({
    address: stakingV1,
    abi: ShitStakingV1Abi,
    functionName: "unstake",
    toastConfig,
  });

  const unstake = ({ amount, queryKey }: { amount: bigint; queryKey?: readonly unknown[] }) =>
    // unstake(_amount, _trigger=false) — trigger=false skips the (gas-heavy) rebase.
    write({ args: [amount, false], queryKey });

  return { unstake, ...flow };
}
