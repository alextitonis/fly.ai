import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { useGetVault, CardVaultAbi } from "./izipay-contracts-hooks";
import { toast } from "sonner";
import { useState } from "react";

export function IzipayClaimbackPage() {
  const { address } = useOnboard();
  const { data: vaultAddress } = useGetVault(address);
  const { writeContractAsync, isPending } = usePrivyWriteContract();
  const [depositId, setDepositId] = useState("");

  async function handleClaimback() {
    if (!address || !vaultAddress || !depositId) return;
    try {
      const hash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: CardVaultAbi,
        functionName: "claimback",
        args: [depositId as `0x${string}`],
      });
      toast.success("Claimback submitted: " + hash.slice(0, 10) + "...");
      setDepositId("");
    } catch {
      toast.error("Claimback failed");
    }
  }

  if (!address) {
    return <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 py-20"><h1 className="text-3xl font-bold">Connect your wallet</h1></div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Claimback Deposit</h1>
      <Card>
        <CardHeader>
          <CardTitle>Reclaim Failed Deposits</CardTitle>
          <CardDescription>If a deposit pipeline fails or doesn't complete within 24 hours, you can reclaim your funds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Deposit ID (bytes32)</label>
            <Input placeholder="0x0000000000000000000000000000000000000000000000000000000000000000" value={depositId} onChange={(e) => setDepositId(e.target.value)} />
          </div>
          <Button onClick={handleClaimback} disabled={isPending || !depositId} className="w-full">{isPending ? "Submitting..." : "Claimback"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
