import { useAccount } from "wagmi";
import { ReferralLinkCard } from "@/modules/referral-referral-link-card";
import { ReferralStats } from "@/modules/referral-referral-stats";
import { BindReferrer } from "@/modules/referral-bind-referrer";
import { ReferralEarnings } from "@/modules/referral-referral-earnings";

export function ReferralPage() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-4xl mx-auto px-4 pt-12">
        <h1 className="font-serif text-4xl md:text-5xl font-medium leading-[1.07] tracking-tight mb-2">
          Referral{" "}
          <em className="italic text-yellow font-medium">Program</em>
        </h1>
        <p className="text-secondary-t text-lg max-w-xl mb-8">
          Share your link and earn fees automatically from your referrals' swaps, bonds, and airdrop claims.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <ReferralLinkCard />
          <ReferralStats />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <BindReferrer />
          <ReferralEarnings />
        </div>

        {!isConnected && (
          <div className="mt-8 border border-a10-b rounded-2xl bg-surface-bg-l2 p-6 text-center">
            <p className="text-secondary-t text-[15px]/[20px]">
              Connect your wallet to participate in the referral program.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
