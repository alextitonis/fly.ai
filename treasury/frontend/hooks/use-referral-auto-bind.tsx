import { useEffect } from "react";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { useSearchParams } from "react-router";
import { useReferralTracking } from "@/hooks/use-referral-tracking";

/**
 * Silent global auto-binder. Reads the `ref` query param from any route
 * and records the off-chain binding once the wallet connects.
 * Renders nothing.
 */
export function ReferralAutoBind() {
  const { address } = useConnectedAddress();
  const [searchParams] = useSearchParams();
  const refFromUrl = searchParams.get("ref");
  const { stats, recordBind, fetchStats } = useReferralTracking();

  const isValidRef = refFromUrl && /^0x[a-fA-F0-9]{40}$/.test(refFromUrl);

  // Fetch stats when wallet connects so we can avoid re-binding
  useEffect(() => {
    if (address) {
      fetchStats();
    }
  }, [address, fetchStats]);

  // Auto-bind if ref param is present and user is not already bound
  useEffect(() => {
    if (address && isValidRef && refFromUrl) {
      if ((stats?.myReferrer ?? null) === null) {
        recordBind(refFromUrl);
      }
    }
  }, [address, isValidRef, refFromUrl, stats?.myReferrer, recordBind]);

  return null;
}
