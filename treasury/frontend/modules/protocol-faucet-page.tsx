import { FaucetWidget } from "@/modules/protocol-widget-faucet-widget";

export function FaucetPage() {
  return (
    <div className="py-8">
      <h1 className="font-serif text-3xl mb-2">Testnet Faucet</h1>
      <p className="text-secondary-t mb-8">
        Claim testnet tokens for Base Sepolia. You will need testnet ETH for gas fees.
      </p>
      <FaucetWidget />
    </div>
  );
}
