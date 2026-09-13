import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { useGetVault, CardVaultAbi, USDT_BASE_ADDRESS } from "./izipay-contracts-hooks";
import { CARD_FEES } from "./izipay-pipeline";
import { formatUSD } from "./izipay-lib-utils";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { parseUnits, erc20Abi } from "viem";

export function IzipayDepositPage() {
  const { address } = useOnboard();
  const { data: vaultAddress } = useGetVault(address);
  const { writeContractAsync, isPending } = usePrivyWriteContract();
  const [depositType, setDepositType] = useState<"issuance" | "topup">("issuance");
  const [cardType, setCardType] = useState<"visa" | "mastercard">("visa");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [cardId, setCardId] = useState("");
  const [cards, setCards] = useState<any[]>([]);
  const [fees, setFees] = useState<any>(null);

  useEffect(() => {
    if (!address) return;
    fetch("/api/cards").then((r) => r.json()).then((d) => setCards(d.cards ?? [])).catch(() => {});
  }, [address]);

  useEffect(() => {
    async function fetchFees() {
      const body: any = { deposit_type: depositType };
      if (depositType === "issuance") body.card_type = cardType;
      if (depositType === "topup") body.amount = Number(amount) || 0;
      try {
        const res = await fetch("/api/fees", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
        const data = await res.json();
        setFees(data);
      } catch {}
    }
    fetchFees();
  }, [depositType, cardType, amount]);

  const activeCards = cards.filter((c) => c.status === "active");

  async function handleDeposit() {
    if (!address || !vaultAddress || String(vaultAddress) === "0x0000000000000000000000000000000000000000") {
      toast.error("No vault found. Create a vault first.");
      return;
    }
    const usdtAmount = depositType === "issuance" ? parseUnits(String(CARD_FEES[cardType]), 6) : parseUnits(amount, 6);
    try {
      const intentBody: any = { deposit_type: depositType, amount: usdtAmount.toString() };
      if (depositType === "issuance") { intentBody.card_type = cardType; intentBody.email = email; }
      else { intentBody.card_id = cardId || activeCards[0]?.card_id; if (!intentBody.card_id) { toast.error("No active card for topup"); return; } }

      await fetch("/api/deposits/intent", { method: "POST", body: JSON.stringify(intentBody), headers: { "Content-Type": "application/json" } });

      await writeContractAsync({ address: USDT_BASE_ADDRESS, abi: erc20Abi, functionName: "approve", args: [vaultAddress as `0x${string}`, usdtAmount] });
      const depositHash = await writeContractAsync({ address: vaultAddress as `0x${string}`, abi: CardVaultAbi, functionName: "deposit", args: [usdtAmount, depositType === "issuance" ? 0 : 1] });
      toast.success("Deposit submitted: " + depositHash.slice(0, 10) + "...");
    } catch {
      toast.error("Deposit failed");
    }
  }

  if (!address) {
    return <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 py-20"><h1 className="text-3xl font-bold">Connect your wallet</h1></div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Deposit to Vault</h1>

      <Card className="mb-4">
        <CardHeader><CardTitle>Deposit Type</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={depositType === "issuance" ? "default" : "outline"} onClick={() => setDepositType("issuance")}>New Card Issuance</Button>
            <Button variant={depositType === "topup" ? "default" : "outline"} onClick={() => setDepositType("topup")}>Card Top-up</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>{depositType === "issuance" ? "Issue a new 5H1TPay card. Requires email for card provisioning." : "Top up an existing 5H1TPay card."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {depositType === "issuance" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Card Type</label>
                <div className="flex gap-2">
                  <Button variant={cardType === "visa" ? "default" : "outline"} size="sm" onClick={() => setCardType("visa")}>Visa — {formatUSD(CARD_FEES.visa)}</Button>
                  <Button variant={cardType === "mastercard" ? "default" : "outline"} size="sm" onClick={() => setCardType("mastercard")}>Mastercard — {formatUSD(CARD_FEES.mastercard)}</Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email (for card delivery)</label>
                <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </>
          )}
          {depositType === "topup" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Card</label>
                {activeCards.length === 0 ? <p className="text-sm text-secondary-t">No active cards. Issue a card first.</p> : (
                  <select className="flex h-10 w-full rounded-md border border-a10-b bg-surface-bg-l1 px-3 py-2 text-sm" value={cardId} onChange={(e) => setCardId(e.target.value)}>
                    {activeCards.map((c) => <option key={c.card_id} value={c.card_id}>{c.card_type} — {c.card_id.slice(0, 12)}...</option>)}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (tokens)</label>
                <Input type="number" placeholder="50.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </>
          )}
          {fees && (
            <div className="rounded-md bg-surface-a3 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-secondary-t">Card fee</span><span>{formatUSD(fees.cardFee)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-t">Network fee</span><span>{formatUSD(fees.networkFee)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-t">Bridge fee</span><span>{formatUSD(fees.bridgeFee)}</span></div>
              <div className="flex justify-between font-bold border-t border-a10-b pt-2"><span>Total</span><span>{formatUSD(fees.total)}</span></div>
            </div>
          )}
          <Button onClick={handleDeposit} disabled={isPending} className="w-full">{isPending ? "Submitting..." : "Approve & Deposit"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
