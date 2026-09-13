import { useEffect, useRef } from "react";
import { usePublicClient } from "wagmi";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { useQueryClient } from "@tanstack/react-query";
import { ContractName, getContractAddress } from "@/lib/contracts";

const FEE_BPS = 2000; // 20% of protocol fee goes to referrer
const PROTOCOL_FEE_BPS = 100; // 1% protocol fee on swaps/bonds

// Contracts that generate fees
const FEE_SOURCES: Array<{ contract: ContractName; label: string }> = [
  { contract: ContractName.SHIT_BONDING, label: "bond" },
  { contract: ContractName.SHIT_PSM, label: "psm" },
  { contract: ContractName.SWAP_LIQUIDATOR, label: "swap" },
  { contract: ContractName.SHIT_SWAP_LP_ADAPTER, label: "swap_lp" },
  { contract: ContractName.HEDGEY_CLAIM_CAMPAIGNS, label: "hedgey" },
];

async function recordFeeToD1(
  userAddress: string,
  tokenAddress: string,
  feeAmount: string,
  source: string,
  txHash?: string,
) {
  try {
    await fetch("/api/referral/record-fee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_address: userAddress,
        token_address: tokenAddress,
        fee_amount: feeAmount,
        source,
        tx_hash: txHash,
      }),
    });
  } catch {
    // Silent fail
  }
}

/**
 * Global listener that watches for confirmed transactions to fee-generating contracts
 * and automatically records referral fees to D1.
 */
export function ReferralFeeTracker() {
  const { address, chainId: connectedChainId } = useConnectedAddress();
  const chainId = connectedChainId ?? 0;
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const processedHashes = useRef<Set<string>>(new Set());

  // Build a map of fee source addresses for the current chain
  const feeSourceMap = new Map<string, string>();
  for (const { contract, label } of FEE_SOURCES) {
    const addr = getContractAddress(contract, chainId);
    if (addr) {
      feeSourceMap.set(addr.toLowerCase(), label);
    }
  }

  useEffect(() => {
    if (!address || !publicClient) return;

    const unsubscribe = queryClient.getQueryCache().subscribe(async (event) => {
      // Watch for transaction receipt queries that succeed
      if (event.type !== "updated") return;
      const query = event.query;
      if (query.queryKey[0] !== "waitForTransactionReceipt") return;

      const receipt = query.state.data as
        | { status: string; transactionHash: string; to: string; logs: Array<{ address: string; data: string; topics: string[] }> }
        | undefined;

      if (!receipt || receipt.status !== "success") return;

      const txHash = receipt.transactionHash;
      if (processedHashes.current.has(txHash)) return;
      processedHashes.current.add(txHash);

      const toAddr = (receipt.to || "").toLowerCase();
      const sourceLabel = feeSourceMap.get(toAddr);

      if (!sourceLabel) return;

      // Calculate fee: protocol fee is PROTOCOL_FEE_BPS of tx value
      // Referrer gets FEE_BPS of that protocol fee
      // We record the referrer's share so D1 shows what's owed
      try {
        const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
        const txValue = tx.value;
        if (txValue > 0n) {
          const protocolFee = (txValue * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
          const referrerShare = (protocolFee * BigInt(FEE_BPS)) / 10000n;

          if (referrerShare > 0n) {
            // Use SHIT token address as the fee token (fees are paid in SHIT)
            const shitAddr = getContractAddress(ContractName.SHIT, chainId);
            if (shitAddr) {
              recordFeeToD1(
                address.toLowerCase(),
                shitAddr.toLowerCase(),
                referrerShare.toString(),
                sourceLabel,
                txHash,
              );
            }
          }
        }
      } catch {
        // Silent fail
      }
    });

    return () => {
      unsubscribe();
    };
  }, [address, publicClient, queryClient, feeSourceMap]);

  return null;
}
