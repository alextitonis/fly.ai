import { useChainId } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TOKENS } from "@/lib/tokens";
import ShitStakingAbi from "@/abis/ShitStaking";
import wstShitAbi from "@/abis/wstSHIT";
import { WRAP_FLOWS, type WrapFlow } from "@/modules/shit-wrap-flows";
import { useContractWriteFlow } from "./use-contract-write-flow";
import type { TransactionToastConfig } from "./use-transaction-toast";
import type { Abi, Address } from "viem";

type StakingCall = {
  /** Contract that actually exposes the function for this flow. */
  contract: ContractName;
  abi: Abi;
  functionName: "stake" | "wrap" | "unstake" | "unwrap";
  args: (address: Address, amount: bigint) => readonly unknown[];
  /**
   * Contract the input token must be approved to (it pulls the input via
   * transferFrom). Undefined when the function burns the caller's own balance
   * (unstake/unwrap) — no approval step needed.
   */
  approvalSpender?: ContractName;
};

/**
 * Contract call for each Wrap-page flow.
 *
 * Deployed contract surface:
 *   - ShitStaking:  stake(address,uint256,bool,bool) / unstake(address,uint256,bool,bool)
 *   - wstSHIT:      wrap(uint256)  / unwrap(uint256)
 */
const FLOW_CALLS: Record<WrapFlow, StakingCall> = {
  // stake(to, amount, true, false) -> SHIT → stSHIT  [rebasing=true, StakingAdapter sends stSHIT directly]
  "wrap-shit": { contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "stake", args: (addr, amount) => [addr, amount, true, false], approvalSpender: ContractName.STAKING },
  // stake(to, amount, false, false) -> SHIT → wstSHIT  [rebasing=false, StakingAdapter wraps to wstSHIT]
  "wrap-shit-to-wstshit": { contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "stake", args: (addr, amount) => [addr, amount, false, false], approvalSpender: ContractName.STAKING },
  // wrap(amount) -> stSHIT → wstSHIT  [wstSHIT pulls stSHIT]
  "wrap-stshit": { contract: ContractName.WSTSHIT, abi: wstShitAbi, functionName: "wrap", args: (_addr, amount) => [amount], approvalSpender: ContractName.WSTSHIT },
  // unwrap(amount) -> wstSHIT → stSHIT  [burns caller's wstSHIT, no approval needed]
  "unwrap-wstshit": { contract: ContractName.WSTSHIT, abi: wstShitAbi, functionName: "unwrap", args: (_addr, amount) => [amount], approvalSpender: undefined },
  // unstake(to, amount, false, false) -> wstSHIT → SHIT  [Staking pulls wstSHIT via transferFrom]
  "unwrap-wstshit-to-shit": { contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "unstake", args: (addr, amount) => [addr, amount, false, false], approvalSpender: ContractName.STAKING },
  // unstake(to, amount, false, true) -> stSHIT → SHIT  [rebasing=true, StakingAdapter pulls stSHIT directly]
  "unstake-stshit": { contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "unstake", args: (addr, amount) => [addr, amount, false, true], approvalSpender: ContractName.STAKING },
};

/** Contract the input token must be approved to for a flow, or undefined if none is needed. */
export function getWrapFlowApprovalSpender(flow: WrapFlow): ContractName | undefined {
  return FLOW_CALLS[flow].approvalSpender;
}

function toastConfigFor(flow: WrapFlow): TransactionToastConfig {
  const { input, output, toast } = WRAP_FLOWS[flow];
  const from = TOKENS[input].symbol;
  const to = TOKENS[output].symbol;
  return {
    pending: {
      title: `${toast.progressive} ${from}...`,
      description: "Please wait while your transaction is confirmed.",
    },
    success: {
      title: `${toast.past} ${from} to ${to}`,
      description: `Your ${from} has been ${toast.past.toLowerCase()} to ${to}.`,
    },
    error: {
      title: `${toast.noun} transaction failed`,
      description: `There was an error ${toast.progressive.toLowerCase()} ${from}. Please try again.`,
      userRejected: {
        title: "Transaction cancelled",
        description: `You cancelled the ${toast.noun.toLowerCase()} transaction.`,
      },
      insufficientFunds: {
        title: "Insufficient funds",
        description: "You don't have enough ETH for gas fees.",
      },
    },
  };
}

/**
 * Executes the staking-contract write for a Wrap-page flow (SHIT/sSHIT → wstSHIT, wstSHIT/sSHIT → SHIT).
 * Built on useContractWriteFlow for gas buffering, double-submit protection, query
 * invalidation, and toasts. Requires a prior input-token approval to the staking contract.
 */
export function useWrapFlowWrite(flow: WrapFlow) {
  const { address } = useConnectedAddress();
  const chainId = useChainId();
  const call = FLOW_CALLS[flow];
  const targetAddress = getContractAddress(call.contract, chainId);

  const { write, ...rest } = useContractWriteFlow({
    address: targetAddress,
    abi: call.abi,
    functionName: call.functionName,
    toastConfig: toastConfigFor(flow),
  });

  const execute = ({ amount, queryKey }: { amount: bigint; queryKey?: readonly unknown[] }) => {
    if (!address) return;
    return write({ args: call.args(address, amount), queryKey });
  };

  return { execute, ...rest };
}
