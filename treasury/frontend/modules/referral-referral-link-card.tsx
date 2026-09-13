import { useState } from "react";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";

export function ReferralLinkCard() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  const referralLink = address
    ? `${window.location.origin}/#/?ref=${address}`
    : null;

  const handleCopy = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!address) {
    return (
      <Card className="p-6">
        <p className="text-[20px]/[24px] font-semibold mb-2">Referral Program</p>
        <p className="text-secondary-t text-[15px]/[20px]">
          Connect your wallet to get your referral link and start earning.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <p className="text-[20px]/[24px] font-semibold mb-2">Referral Program</p>
      <p className="text-secondary-t text-[15px]/[20px] mb-4">
        Share your referral link and earn fees from swaps and bonds made by your referrals.
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={referralLink ?? ""}
            className="font-mono text-sm"
          />
          <Button size="md" variant="secondary" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <p className="text-secondary-t text-[13px]/[18px]">
          Your referral code is your wallet address. Share this link to earn fees automatically.
        </p>
      </div>
    </Card>
  );
}
