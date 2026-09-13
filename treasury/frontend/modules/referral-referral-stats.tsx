import { Card } from "@/components/ui-card";
import { NumberFlow } from "@/components/ui-number-flow";
import { Separator } from "@/components/ui-separator";
import { useReferralTracking } from "@/hooks/use-referral-tracking";

export function ReferralStats() {
  const { stats } = useReferralTracking();

  const referralCount = stats?.referralCount ?? 0;
  const pendingFees = stats?.pendingFees ?? [];
  const claimedFees = stats?.totalClaimed ?? [];

  // Sum pending fees across all tokens (display in SHIT equivalent)
  const totalPending = pendingFees.reduce((sum, f) => sum + Number(f.total) / 1e18, 0);
  const totalClaimedAmount = claimedFees.reduce((sum, f) => sum + Number(f.total) / 1e18, 0);

  return (
    <Card className="p-6 h-full">
      <p className="text-[20px]/[24px] font-semibold mb-4">Your Stats</p>
      <div className="flex flex-col gap-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[15px]/[20px] text-secondary-t">Total Claimed</p>
          <NumberFlow
            value={totalClaimedAmount}
            format={{ style: "decimal", maximumFractionDigits: 4 }}
            className="text-[15px]/[20px] font-semibold"
            suffix="SHIT"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[15px]/[20px] text-secondary-t">Pending</p>
          <NumberFlow
            value={totalPending}
            format={{ style: "decimal", maximumFractionDigits: 4 }}
            className="text-[15px]/[20px] font-semibold"
            suffix="SHIT"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[15px]/[20px] text-secondary-t">Referrals</p>
          <NumberFlow
            value={referralCount}
            format={{ style: "decimal", notation: "standard" }}
            className="text-[15px]/[20px] font-semibold"
          />
        </div>
      </div>
      <Separator className="my-4" />
      <p className="text-secondary-t text-[13px]/[18px]">
        Fees accumulate automatically when your referrals trade or buy bonds. Claim anytime.
      </p>
    </Card>
  );
}
