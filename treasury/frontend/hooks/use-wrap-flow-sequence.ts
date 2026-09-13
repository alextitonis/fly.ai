import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { usePrivyWalletClient } from "@/hooks/use-privy-wallet-client";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Abi, type Address } from "viem";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { TokenName, getTokenAddress } from "@/lib/tokens";
import ShitStakingAbi from "@/abis/ShitStaking";
import wstshitAbi from "@/abis/wstSHIT";
import type { WrapFlow } from "@/modules/shit-wrap-flows";

export type SeqStepStatus = "pending" | "wallet" | "confirming" | "done" | "error";

export type SeqStep = {
  id: string;
  label: string;
  status: SeqStepStatus;
  hash?: `0x${string}`;
};

type PlanStep =
  | { kind: "approve"; token: TokenName; spender: ContractName; label: string }
  | {
      kind: "call";
      contract: ContractName;
      abi: Abi;
      functionName: string;
      label: string;
      argsBuilder: (address: Address, amount: bigint) => readonly unknown[];
      amount: "input" | "stshitDelta" | "wstshitDelta";
    };

function buildPlan(flow: WrapFlow): PlanStep[] {
  const stakeArgs = (addr: Address, amt: bigint) => [addr, amt, false, false] as const;
  const stakeArgsRebasing = (addr: Address, amt: bigint) => [addr, amt, true, false] as const;
  const unstakeArgs = (addr: Address, amt: bigint) => [addr, amt, false, false] as const;
  const unstakeArgsRebasing = (addr: Address, amt: bigint) => [addr, amt, false, true] as const;
  const singleArg = (_addr: Address, amt: bigint) => [amt] as const;

  switch (flow) {
    case "wrap-shit":
      return [
        { kind: "approve", token: TokenName.SHIT, spender: ContractName.STAKING, label: "Approve SHIT" },
        { kind: "call", contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "stake", label: "Stake SHIT to stSHIT", argsBuilder: stakeArgsRebasing, amount: "input" },
      ];
    case "wrap-shit-to-wstshit":
      return [
        { kind: "approve", token: TokenName.SHIT, spender: ContractName.STAKING, label: "Approve SHIT" },
        { kind: "call", contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "stake", label: "Stake SHIT to wstSHIT", argsBuilder: stakeArgs, amount: "input" },
      ];
    case "wrap-stshit":
      return [
        { kind: "approve", token: TokenName.STSHIT, spender: ContractName.WSTSHIT, label: "Approve stSHIT" },
        { kind: "call", contract: ContractName.WSTSHIT, abi: wstshitAbi, functionName: "wrap", label: "Wrap stSHIT to wstSHIT", argsBuilder: singleArg, amount: "input" },
      ];
    case "unwrap-wstshit":
      return [
        { kind: "call", contract: ContractName.WSTSHIT, abi: wstshitAbi, functionName: "unwrap", label: "Unwrap wstSHIT to stSHIT", argsBuilder: singleArg, amount: "input" },
      ];
    case "unwrap-wstshit-to-shit":
      return [
        { kind: "approve", token: TokenName.WSTSHIT, spender: ContractName.STAKING, label: "Approve wstSHIT" },
        { kind: "call", contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "unstake", label: "Unstake wstSHIT to SHIT", argsBuilder: unstakeArgs, amount: "input" },
      ];
    case "unstake-stshit":
      return [
        { kind: "approve", token: TokenName.STSHIT, spender: ContractName.STAKING, label: "Approve stSHIT" },
        { kind: "call", contract: ContractName.STAKING, abi: ShitStakingAbi, functionName: "unstake", label: "Unstake stSHIT to SHIT", argsBuilder: unstakeArgsRebasing, amount: "input" },
      ];
  }
}


export function useWrapFlowSequence(flow: WrapFlow, inputAmount: bigint) {
  const { address } = useConnectedAddress();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { walletClient } = usePrivyWalletClient();

  const [steps, setSteps] = useState<SeqStep[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  const plan = useMemo(() => buildPlan(flow), [flow]);

  useEffect(() => {
    setSteps(plan.map((p, i) => ({ id: `${i}`, label: p.label, status: "pending" })));
    setDone(false);
    setError(null);
  }, [plan]);

  const stshitAddress = getTokenAddress(TokenName.STSHIT, chainId);
  const wstshitAddress = getTokenAddress(TokenName.WSTSHIT, chainId);

  const setStep = (i: number, patch: Partial<SeqStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const readStshitBalance = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !address || !stshitAddress) return 0n;
    return (await publicClient.readContract({
      address: stshitAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
  }, [publicClient, address, stshitAddress]);

  const readWstshitBalance = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !address || !wstshitAddress) return 0n;
    return (await publicClient.readContract({
      address: wstshitAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
  }, [publicClient, address, wstshitAddress]);

  const estimateGas = useCallback(
    async (call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) => {
      try {
        if (publicClient && address) {
          const est = await publicClient.estimateContractGas({ ...call, account: address });
          const buffered = (est * 3n) / 2n;
          return buffered > 5_000_000n ? 5_000_000n : buffered;
        }
      } catch {
        // Estimation failed — return undefined to let wallet estimate
      }
      return undefined;
    },
    [publicClient, address],
  );

  const run = useCallback(async () => {
    console.log("[wrap-seq] run()", { address, hasPublicClient: !!publicClient, flow, inputAmount: inputAmount.toString(), chainId });
    if (!address) {
      setError(new Error("Wallet not connected"));
      return;
    }
    if (!publicClient) {
      setError(new Error("Chain client not ready — is your wallet on Base Sepolia?"));
      return;
    }
    if (!walletClient) {
      setError(new Error("Wallet not connected. Please sign in via Privy."));
      return;
    }
    cancelledRef.current = false;
    setError(null);
    setDone(false);
    setRunning(true);

    const initial: SeqStep[] = plan.map((p, i) => ({ id: `${i}`, label: p.label, status: "pending" }));
    setSteps(initial);

    const preStshit = await readStshitBalance();
    const preWstshit = await readWstshitBalance();

    try {
      for (let i = 0; i < plan.length; i++) {
        if (cancelledRef.current) throw new Error("Cancelled");
        const step = plan[i];
        setStep(i, { status: "wallet" });

        if (step.kind === "approve") {
          const tokenAddress = getTokenAddress(step.token, chainId);
          const spender = getContractAddress(step.spender, chainId);
          console.log("[wrap-seq] approve step", { tokenAddress, spender });
          if (!tokenAddress || !spender) throw new Error(`Missing token/spender address (token=${tokenAddress}, spender=${spender})`);

          const current = (await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, spender],
          })) as bigint;
          if (current >= inputAmount) {
            setStep(i, { status: "done" });
            continue;
          }

          const hash = await walletClient.writeContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, inputAmount],
          } as any);
          setStep(i, { status: "confirming", hash });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`${step.label} reverted on-chain. Check the transaction on BaseScan for details.`);
          setStep(i, { status: "done", hash });
        } else {
          const target = getContractAddress(step.contract, chainId);
          console.log("[wrap-seq] call step", { contract: step.contract, fn: step.functionName, target });
          if (!target) throw new Error(`Missing contract address for ${step.contract}`);

          const amount =
            step.amount === "stshitDelta"
              ? (await readStshitBalance()) - preStshit
              : step.amount === "wstshitDelta"
                ? (await readWstshitBalance()) - preWstshit
                : inputAmount;
          if (amount <= 0n) throw new Error("Nothing to process for this step");

          const call = { address: target, abi: step.abi, functionName: step.functionName, args: step.argsBuilder(address, amount) };
          const gas = await estimateGas(call);
          const hash = await walletClient.writeContract({ ...call, ...(gas ? { gas } : {}) } as any);
          setStep(i, { status: "confirming", hash });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`${step.label} reverted on-chain. This may happen if the staking contract is paused, the circuit breaker is tripped, or there is insufficient liquidity. Check the transaction on BaseScan for details.`);
          setStep(i, { status: "done", hash });
        }
      }

      queryClient.invalidateQueries();
      setDone(true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("[wrap-seq] failed:", err);
      setError(err);
      setSteps((prev) => prev.map((s) => (s.status === "wallet" || s.status === "confirming" ? { ...s, status: "error" } : s)));
    } finally {
      setRunning(false);
    }
  }, [address, publicClient, walletClient, plan, chainId, inputAmount, readStshitBalance, estimateGas, queryClient]);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setSteps(plan.map((p, i) => ({ id: `${i}`, label: p.label, status: "pending" })));
    setRunning(false);
    setDone(false);
    setError(null);
  }, [plan]);

  return { steps, run, reset, running, done, error };
}
