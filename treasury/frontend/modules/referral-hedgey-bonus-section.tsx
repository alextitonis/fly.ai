import { useState } from "react";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { Separator } from "@/components/ui-separator";
import {
  useHedgeyBonusConfig,
  useHedgeyCampaignEligibility,
  useHedgeyBonusPaid,
  useHedgeyClaimed,
  useClaimHedgeyBonus,
} from "@/hooks/referral";

export function HedgeyBonusSection() {
  const { address } = useAccount();
  const { data: bonusConfig } = useHedgeyBonusConfig();
  const [campaignId, setCampaignId] = useState("");
  const [proofInput, setProofInput] = useState("");
  const [claimAmount, setClaimAmount] = useState("");

  const campaignIdBytes16 = campaignId as `0x${string}`;
  const { data: isEligible } = useHedgeyCampaignEligibility(campaignIdBytes16);
  const { data: bonusPaid } = useHedgeyBonusPaid(campaignIdBytes16, address);
  const { data: hasClaimed } = useHedgeyClaimed(campaignIdBytes16, address);
  const { write, isPending } = useClaimHedgeyBonus();

  const bonusBps = bonusConfig?.[1] ? Number(bonusConfig[1]) : 0;

  const handleClaim = () => {
    const proof = proofInput
      .split(",")
      .map((p) => p.trim() as `0x${string}`);
    write({
      args: [campaignIdBytes16, proof, BigInt(claimAmount || "0")],
    });
  };

  if (!address) return null;

  const canClaim =
    isEligible &&
    !bonusPaid &&
    hasClaimed &&
    campaignId &&
    claimAmount;

  return (
    <Card className="p-6">
      <p className="text-[18px]/[24px] font-semibold mb-2">Hedgey Claim Bonus</p>
      <p className="text-secondary-t text-[15px]/[20px] mb-4">
        Claim a {bonusBps / 100}% bonus on your Hedgey claims. Your referrer receives the bonus as claimable fees.
      </p>
      <Separator className="my-4" />
      <div className="space-y-3">
        <div>
          <label className="text-secondary-t text-[13px]/[18px] mb-1 block">
            Campaign ID (bytes16)
          </label>
          <Input
            placeholder="0x..."
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div>
          <label className="text-secondary-t text-[13px]/[18px] mb-1 block">
            Claim amount (wei)
          </label>
          <Input
            type="number"
            placeholder="1000000000000000000"
            value={claimAmount}
            onChange={(e) => setClaimAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="text-secondary-t text-[13px]/[18px] mb-1 block">
            Merkle proof (comma-separated)
          </label>
          <Input
            placeholder="0xabc...,0xdef..."
            value={proofInput}
            onChange={(e) => setProofInput(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        {isEligible === false && campaignId && (
          <p className="text-[13px]/[18px] text-destructive">
            Campaign is not eligible for referral bonus.
          </p>
        )}
        {bonusPaid === true && (
          <p className="text-[13px]/[18px] text-destructive">
            Bonus already claimed for this campaign.
          </p>
        )}
        {hasClaimed === false && campaignId && (
          <p className="text-[13px]/[18px] text-destructive">
            You must claim on Hedgey first before claiming the referral bonus.
          </p>
        )}
        <Button
          size="md"
          onClick={handleClaim}
          disabled={isPending || !canClaim}
        >
          {isPending ? "Claiming..." : "Claim Bonus"}
        </Button>
      </div>
    </Card>
  );
}
