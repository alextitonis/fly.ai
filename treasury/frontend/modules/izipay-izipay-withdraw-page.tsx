import { useReadContract } from "wagmi";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { useGetVault, CardVaultAbi, USDT_BASE_ADDRESS } from "./izipay-contracts-hooks";
import { toast } from "sonner";
import { useState } from "react";
import { parseUnits, erc20Abi } from "viem";

export function IzipayWithdrawPage() {
  const { address } = useOnboard();
  const { data: vaultAddress } = useGetVault(address);
  const { writeContractAsync, isPending } = usePrivyWriteContract();
  const [amount, setAmount] = useState("");

  const { data: balance } = useReadContract({
    address: USDT_BASE_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [(vaultAddress as `0x${string}`) ?? "0x0"],
  });

  async function handleWithdraw() {
    if (!address || !vaultAddress || !amount) return;
    try {
      const parsedAmount = parseUnits(amount, 6);
      const hash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: CardVaultAbi,
        functionName: "withdraw",
        args: [parsedAmount, address as `0x${string}`],
      });
      toast.success("Withdrawal submitted: " + hash.slice(0, 10) + "...");
      setAmount("");
    } catch {
      toast.error("Withdrawal failed");
    }
  }

  if (!address) {
    return <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 py-20"><h1 className="text-3xl font-bold">Connect your wallet</h1></div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Withdraw from Vault</h1>
      <Card>
        <CardHeader>
          <CardTitle>Withdraw Tokens</CardTitle>
          <CardDescription>Withdraw unused tokens from your vault to your wallet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-surface-a3 p-4 text-sm">
            <div className="flex justify-between"><span className="text-secondary-t">Vault balance</span><span>{balance ? (Number(balance) / 1e6).toFixed(2) : "0.00"} tokens</span></div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (tokens)</label>
            <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button onClick={handleWithdraw} disabled={isPending || !amount} className="w-full">{isPending ? "Withdrawing..." : "Withdraw"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
