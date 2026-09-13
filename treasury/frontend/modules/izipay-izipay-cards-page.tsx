import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Badge } from "@/components/ui-badge";
import { CardVisual } from "./izipay-card-visual";
import { shortenAddress, formatUSD } from "./izipay-lib-utils";
import { Link } from "react-router";
import { CreditCard, Plus, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { useEffect, useState } from "react";

const sampleCards = [
  { card_id: "5500-0000-0000-1234", card_type: "visa", status: "active", balance: 1250.0, issued_at: Math.floor(Date.now() / 1000) - 86400 * 7 },
  { card_id: "5500-0000-0000-5678", card_type: "mastercard", status: "pending", balance: 0, issued_at: Math.floor(Date.now() / 1000) - 3600 },
  { card_id: "5500-0000-0000-9012", card_type: "visa", status: "frozen", balance: 75.5, issued_at: Math.floor(Date.now() / 1000) - 86400 * 30 },
];

export function IzipayCardsPage() {
  const { address, isConnected } = useOnboard();
  const [cards, setCards] = useState<any[]>([]);

  useEffect(() => {
    if (!address) return;
    fetch("/api/cards").then((r) => r.json()).then((d) => setCards(Array.isArray(d.cards) ? d.cards : [])).catch(() => {});
  }, [address]);

  const displayCards = cards.length > 0 ? cards : sampleCards;
  const activeCards = displayCards.filter((c) => c.status === "active");
  const pendingCards = displayCards.filter((c) => c.status === "pending" || c.status === "frozen");
  const totalBalance = displayCards.reduce((sum, c) => sum + (c.balance ?? 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">5H1TPay Cards</h1>
          <p className="text-secondary-t font-mono text-sm">{isConnected ? shortenAddress(address ?? "0x0", 6) : "Preview mode — sign in to manage your cards"}</p>
        </div>
        {isConnected && <Link to="/izipay/vaults/deposit"><Button><Plus className="h-4 w-4 mr-1" />Issue New Card</Button></Link>}
      </div>

      {!isConnected && (
        <div className="rounded-2xl border border-green/30 bg-green/5 p-6 flex items-center justify-between">
          <div>
            <p className="font-medium text-lg">Connect your wallet to manage your cards</p>
            <p className="text-secondary-t text-sm mt-1">Connect a Base wallet to issue cards, deposit tokens, and track your balance.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
            <CreditCard className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{displayCards.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{activeCards.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending / Frozen</CardTitle>
            <Clock className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{pendingCards.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatUSD(totalBalance)}</p></CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Your Cards</h2>
            {cards.length === 0 && <p className="text-sm text-secondary-t mt-1">Sample cards shown below — issue a real card to get started</p>}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayCards.map((card: any) => (
            <Link key={card.card_id} to={`/izipay/cards/${card.card_id}`}>
              <CardVisual cardType={card.card_type} cardId={card.card_id} status={card.status} balance={card.balance} />
            </Link>
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Details</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {displayCards.map((card: any) => (
              <Link key={card.card_id} to={`/izipay/cards/${card.card_id}`}>
                <Card className="cursor-pointer hover:border-primary transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg capitalize">{card.card_type}</CardTitle>
                      <Badge variant={card.status === "active" ? "success" : card.status === "failed" ? "destructive" : "warning"}>{card.status}</Badge>
                    </div>
                    <CardDescription>{shortenAddress(card.card_id, 10)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-secondary-t">Issued: {new Date(card.issued_at * 1000).toLocaleDateString()}</p>
                      {card.balance !== undefined && <p className="text-sm font-semibold">${card.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {cards.length === 0 && (
        <Card className="border-primary">
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Issue your first card</p>
                <p className="text-sm text-secondary-t">Deposit tokens to your vault to get a Visa or Mastercard.</p>
              </div>
            </div>
            <Link to="/izipay/vaults/deposit"><Button>Deposit & Issue Card</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
