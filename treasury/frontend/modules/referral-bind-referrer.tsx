import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useSearchParams } from "react-router";
import { Card } from "@/components/ui-card";
import { useReferralTracking } from "@/hooks/use-referral-tracking";

export function BindReferrer() {
  const { address } = useAccount();
  const [searchParams] = useSearchParams();
  const refFromUrl = searchParams.get("ref");
  const { stats, recordBind, fetchStats } = useReferralTracking();

  const isValidRef = refFromUrl && /^0x[a-fA-F0-9]{40}$/.test(refFromUrl);
  const myReferrer = stats?.myReferrer ?? null;

  // Auto-bind in D1 when wallet connects and ref param is present
  useEffect(() => {
    if (address && isValidRef && refFromUrl) {
      // Only bind if not already bound (D1 uses INSERT OR IGNORE)
      if (myReferrer === null) {
        recordBind(refFromUrl);
      }
    }
  }, [address, isValidRef, refFromUrl, myReferrer, recordBind]);

  // Refresh stats when address changes
  useEffect(() => {
    if (address) fetchStats();
  }, [address, fetchStats]);

  if (!address) return null;

  if (myReferrer) {
    return (
      <Card className="p-6">
        <p className="text-[18px]/[24px] font-semibold mb-2">Your Referrer</p>
        <p className="text-secondary-t text-[15px]/[20px] font-mono break-all">
          {myReferrer}
        </p>
      </Card>
    );
  }

  if (isValidRef) {
    return (
      <Card className="p-6">
        <p className="text-[18px]/[24px] font-semibold mb-2">Referred By</p>
        <p className="text-[15px]/[20px] text-green mb-1">
          You were referred by:
        </p>
        <p className="text-secondary-t text-[15px]/[20px] font-mono break-all">
          {refFromUrl}
        </p>
        <p className="text-secondary-t text-[13px]/[18px] mt-2">
          Your referrer will automatically earn fees when you swap or buy bonds.
        </p>
      </Card>
    );
  }

  return null;
}
