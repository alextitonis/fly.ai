import { ProtocolLaunchWidget } from "@/modules/protocol-widget-protocol-launch-widget";
import { Card } from "@/components/ui-card";

export function ImpactLaunchPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Protocol Launch Status</h1>
        <p className="text-sm text-secondary-t max-w-2xl">
          Staking distributor, emissions, and fee splitter configuration. These on-chain
          parameters control how staking rewards flow to SHIT stakers and how treasury
          revenue is split between the treasury and staking rewards.
        </p>
      </div>

      <Card className="p-6">
        <ProtocolLaunchWidget />
      </Card>
    </div>
  );
}
