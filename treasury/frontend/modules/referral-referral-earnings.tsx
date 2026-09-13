import { Card } from "@/components/ui-card";
import { NumberFlow } from "@/components/ui-number-flow";
import { Separator } from "@/components/ui-separator";
import { useReferralTracking } from "@/hooks/use-referral-tracking";

export function ReferralEarnings() {
  const { stats } = useReferralTracking();

  const pendingFees = stats?.pendingFees ?? [];
  const totalPending = pendingFees.reduce((sum, f) => sum + Number(f.total) / 1e18, 0);
  const hasPending = totalPending > 0;

  return (
    <Card className="p-6">
      <p className="text-[18px]/[24px] font-semibold mb-4">Earnings</p>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-secondary-t text-[15px]/[20px] mb-1">Pending Fees</p>
          <NumberFlow
            value={totalPending}
            format={{ style: "decimal", maximumFractionDigits: 4 }}
            className="text-[24px]/[28px] font-semibold"
            suffix=" SHIT"
          />
        </div>
      </div>
      {hasPending && (
        <div className="space-y-1 mb-4">
          {pendingFees.map((fee, i) => (
            <div key={i} className="flex justify-between text-[13px]/[18px]">
              <span className="text-secondary-t font-mono">
                {fee.token_address.slice(0, 8)}...{fee.token_address.slice(-6)}
              </span>
              <span className="font-mono">
                {(Number(fee.total) / 1e18).toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}
      <Separator className="my-4" />
      <p className="text-secondary-t text-[13px]/[18px]">
        Fees accumulate automatically when your referrals swap, buy bonds, or claim airdrops.
      </p>
    </Card>
  );
}
