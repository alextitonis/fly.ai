import { useReadContract, useChainId } from "wagmi";
import type { Address } from "viem";
import REFERRAL_REGISTRY_ABI from "@/abis/ReferralRegistry";
import { HEDGEY_CLAIM_CAMPAIGNS_ABI } from "@/abis/HedgeyClaimCampaigns";
import { ContractName, getContractAddress } from "@/lib/contracts";
import { useContractWriteFlow } from "@/hooks/use-contract-write-flow";

function useReferralRegistryAddress(): Address | undefined {
  const chainId = useChainId();
  return getContractAddress(ContractName.REFERRAL_REGISTRY, chainId);
}

function useHedgeyAddress(): Address | undefined {
  const chainId = useChainId();
  return getContractAddress(ContractName.HEDGEY_CLAIM_CAMPAIGNS, chainId);
}

// ======== READ HOOKS ======== //

export function useReferrerOf(user?: Address) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "getReferrerOf",
    args: [user!],
    query: { enabled: !!user && !!address },
  });
}

export function useReferralAccount(account?: Address) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "getReferralAccount",
    args: [account!],
    query: { enabled: !!account && !!address },
  });
}

export function usePendingFees(referralAccount?: Address, token?: Address) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "getPendingFees",
    args: [referralAccount!, token!],
    query: { enabled: !!referralAccount && !!token && !!address },
  });
}

export function useReferralStats(referralAccount?: Address) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "getReferralStats",
    args: [referralAccount!],
    query: { enabled: !!referralAccount && !!address },
  });
}

export function useProject(projectId: bigint) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "getProject",
    args: [projectId],
    query: { enabled: !!address },
  });
}

export function useHedgeyBonusConfig() {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "getHedgeyBonusConfig",
    query: { enabled: !!address },
  });
}

export function useHedgeyCampaignEligibility(campaignId: `0x${string}`) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "isEligibleHedgeyCampaign",
    args: [campaignId as unknown as `0x${string}`],
    query: { enabled: !!address },
  });
}

export function useHedgeyBonusPaid(campaignId: `0x${string}`, user?: Address) {
  const address = useReferralRegistryAddress();
  return useReadContract({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "hasHedgeyBonusBeenPaid",
    args: [campaignId as unknown as `0x${string}`, user!],
    query: { enabled: !!user && !!address },
  });
}

export function useHedgeyCampaign(campaignId: `0x${string}`) {
  const address = useHedgeyAddress();
  return useReadContract({
    address,
    abi: HEDGEY_CLAIM_CAMPAIGNS_ABI,
    functionName: "campaigns",
    args: [campaignId as unknown as `0x${string}`],
    query: { enabled: !!address },
  });
}

export function useHedgeyClaimed(campaignId: `0x${string}`, user?: Address) {
  const address = useHedgeyAddress();
  return useReadContract({
    address,
    abi: HEDGEY_CLAIM_CAMPAIGNS_ABI,
    functionName: "claimed",
    args: [campaignId as unknown as `0x${string}`, user!],
    query: { enabled: !!user && !!address },
  });
}

// ======== WRITE HOOKS ======== //

export function useCreateReferralAccount() {
  const address = useReferralRegistryAddress();
  return useContractWriteFlow({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "createReferralAccount",
    toastConfig: {
      pending: { title: "Creating referral account...", description: "Confirm the transaction in your wallet" },
      success: { title: "Referral account created!", description: "You can now share your referral link" },
      error: { title: "Failed to create referral account", description: "The transaction failed or was rejected" },
    },
  });
}

export function useBindToReferrer() {
  const address = useReferralRegistryAddress();
  return useContractWriteFlow({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "bindToReferrer",
    toastConfig: {
      pending: { title: "Binding to referrer...", description: "Confirm the transaction in your wallet" },
      success: { title: "Referrer bound successfully!", description: "Your referrer will earn fees from your activity" },
      error: { title: "Failed to bind to referrer", description: "The transaction failed or was rejected" },
    },
  });
}

export function useClaimFees() {
  const address = useReferralRegistryAddress();
  return useContractWriteFlow({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "claimFees",
    toastConfig: {
      pending: { title: "Claiming fees...", description: "Confirm the transaction in your wallet" },
      success: { title: "Fees claimed successfully!", description: "Your referral fees have been transferred" },
      error: { title: "Failed to claim fees", description: "The transaction failed or was rejected" },
    },
  });
}

export function useClaimHedgeyBonus() {
  const address = useReferralRegistryAddress();
  return useContractWriteFlow({
    address,
    abi: REFERRAL_REGISTRY_ABI,
    functionName: "claimHedgeyBonus",
    toastConfig: {
      pending: { title: "Claiming Hedgey bonus...", description: "Confirm the transaction in your wallet" },
      success: { title: "Hedgey bonus claimed!", description: "Bonus has been credited to your referrer" },
      error: { title: "Failed to claim Hedgey bonus", description: "The transaction failed or was rejected" },
    },
  });
}
