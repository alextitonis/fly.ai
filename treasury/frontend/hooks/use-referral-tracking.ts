import { useCallback, useEffect, useState } from "react";
import { useConnectedAddress } from "@/hooks/use-connected-address";

interface PendingFee {
  token_address: string;
  total: string;
}

interface ClaimedFee {
  token_address: string;
  total: string;
}

interface ReferredUser {
  user_address: string;
  bound_at: number;
}

interface ReferralStats {
  pendingFees: PendingFee[];
  totalClaimed: ClaimedFee[];
  referralCount: number;
  referredUsers: ReferredUser[];
  myReferrer: string | null;
}

async function apiCall(path: string, options?: RequestInit) {
  const res = await fetch(`/api/referral/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  return res.json();
}

export function useReferralTracking() {
  const { address } = useConnectedAddress();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!address) {
      setStats(null);
      return;
    }
    setIsLoading(true);
    try {
      const data = await apiCall(`stats?address=${address}`);
      if (data.ok) {
        setStats({
          pendingFees: data.pendingFees ?? [],
          totalClaimed: data.totalClaimed ?? [],
          referralCount: data.referralCount ?? 0,
          referredUsers: data.referredUsers ?? [],
          myReferrer: data.myReferrer ?? null,
        });
      }
    } catch {
      // Silent fail — D1 is supplementary to on-chain data
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const recordBind = useCallback(
    async (referrerAddress: string, txHash?: string) => {
      if (!address) return;
      try {
        await apiCall("bind", {
          method: "POST",
          body: JSON.stringify({
            user_address: address,
            referrer_address: referrerAddress,
            tx_hash: txHash,
          }),
        });
        fetchStats();
      } catch {
        // Silent fail
      }
    },
    [address, fetchStats],
  );

  const recordFee = useCallback(
    async (tokenAddress: string, feeAmount: string, source: string, txHash?: string) => {
      if (!address) return;
      try {
        await apiCall("record-fee", {
          method: "POST",
          body: JSON.stringify({
            user_address: address,
            token_address: tokenAddress,
            fee_amount: feeAmount,
            source,
            tx_hash: txHash,
          }),
        });
      } catch {
        // Silent fail
      }
    },
    [address],
  );

  return {
    stats,
    isLoading,
    fetchStats,
    recordBind,
    recordFee,
  };
}
