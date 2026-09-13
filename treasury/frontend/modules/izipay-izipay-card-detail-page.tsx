import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Badge } from "@/components/ui-badge";
import { shortenAddress, formatUSD } from "./izipay-lib-utils";
import { Link, useParams } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useState } from "react";

export function IzipayCardDetailPage() {
  const { address } = useOnboard();
  const { cardId } = useParams();
  const [card, setCard] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cardId) return;
    Promise.all([
      fetch(`/api/cards/${cardId}`).then((r) => r.json()),
      fetch(`/api/cards/${cardId}/transactions`).then((r) => r.json()),
    ])
      .then(([c, t]) => { setCard(c); setTransactions(t.transactions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cardId]);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 py-20">
        <h1 className="text-3xl font-bold">Connect your wallet</h1>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto p-6"><p className="text-secondary-t">Loading...</p></div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <Link to="/izipay/cards" className="inline-flex items-center gap-2 text-sm text-secondary-t hover:text-primary-t">
        <ArrowLeft className="h-4 w-4" />Back to cards
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="capitalize">{card?.card_type ?? "Card"}</CardTitle>
              <CardDescription>{shortenAddress(cardId ?? "", 12)}</CardDescription>
            </div>
            <Badge variant={card?.status === "active" ? "success" : card?.status === "failed" ? "destructive" : "warning"}>
              {card?.status ?? "unknown"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {card?.balance !== undefined && (
            <div className="rounded-md bg-surface-a3 p-4">
              <p className="text-sm text-secondary-t">Balance</p>
              <p className="text-2xl font-bold">{formatUSD(card.balance)}</p>
            </div>
          )}
          {card?.status === "active" && (
            <Link to="/izipay/vaults/deposit"><Button className="w-full"><Plus className="h-4 w-4 mr-1" />Top Up Card</Button></Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-secondary-t py-6 text-center">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-md border border-a10-b p-3">
                  <div>
                    <p className="text-sm font-medium">{tx.description ?? tx.type}</p>
                    <p className="text-xs text-secondary-t">{new Date(tx.timestamp * 1000).toLocaleString()}</p>
                  </div>
                  <span className="text-sm font-medium">{formatUSD(tx.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
