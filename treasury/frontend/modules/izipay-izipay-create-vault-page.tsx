import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { FACTORY_ADDRESS, CardVaultFactoryAbi, USDT_BASE_ADDRESS } from "./izipay-contracts-hooks";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useState } from "react";

export function IzipayCreateVaultPage() {
  const { address } = useOnboard();
  const { writeContractAsync, isPending } = usePrivyWriteContract();
  const navigate = useNavigate();
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleCreateVault() {
    if (!address) return;
    try {
      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: CardVaultFactoryAbi,
        functionName: "createVault",
        args: [USDT_BASE_ADDRESS],
      });
      setTxHash(hash);
      toast.success("Vault created! Transaction: " + hash.slice(0, 10) + "...");
      setTimeout(() => navigate("/izipay"), 3000);
    } catch {
      toast.error("Failed to create vault");
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Create Vault</h1>
      <Card>
        <CardHeader>
          <CardTitle>Deploy Your Card Vault</CardTitle>
          <CardDescription>
            A per-user upgradeable vault contract on Base. Deposits trigger the 5H1TPay card pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-surface-a3 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-secondary-t">Token</span><span>Tokens (Base)</span></div>
            <div className="flex justify-between"><span className="text-secondary-t">Network</span><span>Base (8453)</span></div>
            <div className="flex justify-between"><span className="text-secondary-t">Claimback timeout</span><span>24 hours</span></div>
            <div className="flex justify-between"><span className="text-secondary-t">Pattern</span><span>UUPS Proxy</span></div>
          </div>
          {txHash && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600">Transaction submitted: {txHash}</div>
          )}
          <Button onClick={handleCreateVault} disabled={isPending || !address} className="w-full">
            {isPending ? "Deploying..." : "Create Vault"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
