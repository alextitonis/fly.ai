import { useReadContract, useWatchContractEvent } from "wagmi";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { type Address } from "viem";
import { FACTORY_ADDRESS, BASE_CHAIN_ID, USDT_BASE_ADDRESS } from "./izipay-contracts-addresses";
import CardVaultFactoryAbi from "./izipay-abi-CardVaultFactory.json";
import CardVaultAbi from "./izipay-abi-CardVault.json";

export function useGetVault(owner: Address | undefined) {
  return useReadContract({
    address: FACTORY_ADDRESS,
    abi: CardVaultFactoryAbi,
    functionName: "getVault",
    args: [owner ?? "0x0"],
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!owner },
  });
}

export function useCreateVault() {
  return usePrivyWriteContract();
}

export function useDeposit(_vaultAddress: Address | undefined) {
  return usePrivyWriteContract();
}

export function useWithdraw(_vaultAddress: Address | undefined) {
  return usePrivyWriteContract();
}

export function useClaimback(_vaultAddress: Address | undefined) {
  return usePrivyWriteContract();
}

export function useGetDeposit(vaultAddress: Address | undefined, depositId: `0x${string}` | undefined) {
  return useReadContract({
    address: vaultAddress,
    abi: CardVaultAbi,
    functionName: "getDeposit",
    args: [depositId ?? "0x0"],
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!vaultAddress && !!depositId },
  });
}

export function useWatchDepositRequested(vaultAddress: Address | undefined) {
  return useWatchContractEvent({
    address: vaultAddress,
    abi: CardVaultAbi,
    eventName: "DepositRequested",
    chainId: BASE_CHAIN_ID,
  });
}

export function useWatchVaultCreated() {
  return useWatchContractEvent({
    address: FACTORY_ADDRESS,
    abi: CardVaultFactoryAbi,
    eventName: "VaultCreated",
    chainId: BASE_CHAIN_ID,
  });
}

export { CardVaultAbi, CardVaultFactoryAbi, FACTORY_ADDRESS, BASE_CHAIN_ID, USDT_BASE_ADDRESS };
