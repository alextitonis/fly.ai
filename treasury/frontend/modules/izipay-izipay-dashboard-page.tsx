import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Badge } from "@/components/ui-badge";
import { Button } from "@/components/ui-button";
import { useGetVault } from "./izipay-contracts-hooks";
import { shortenAddress, formatUSD } from "./izipay-lib-utils";
import { CreditCard, Vault, ArrowUpRight, Plus, ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { CardVisual } from "./izipay-card-visual";

const sampleCards = [
  { card_id: "5500-0000-0000-1234", card_type: "visa", status: "active", balance: 1250.0, issued_at: Math.floor(Date.now() / 1000) - 86400 * 7 },
  { card_id: "5500-0000-0000-5678", card_type: "mastercard", status: "pending", balance: 0, issued_at: Math.floor(Date.now() / 1000) - 3600 },
  { card_id: "5500-0000-0000-9012", card_type: "visa", status: "frozen", balance: 75.5, issued_at: Math.floor(Date.now() / 1000) - 86400 * 30 },
];

export function IzipayDashboardPage() {
  const { address, isConnected } = useOnboard();
  const { data: vaultAddress } = useGetVault(address);
  const [cards, setCards] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);

  useEffect(() => {
    if (!address) return;
    fetch("/api/cards").then((r) => r.json()).then((d) => setCards(Array.isArray(d.cards) ? d.cards : [])).catch(() => {});
    fetch("/api/deposits/intent").then((r) => r.json()).then((d) => setDeposits(Array.isArray(d.deposits) ? d.deposits : [])).catch(() => {});
  }, [address]);

  const hasVault = !!vaultAddress && String(vaultAddress) !== "0x0000000000000000000000000000000000000000";
  const activeCards = cards.filter((c) => c.status === "active");
  const pendingDeposits = deposits.filter((d) => d.status === "pending" || d.status === "pending_deposit");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">5H1TPay Dashboard</h1>
        <p className="text-secondary-t font-mono text-sm">{isConnected ? shortenAddress(address ?? "0x0", 6) : "Preview mode — sign in to manage your account"}</p>
      </div>

      {!isConnected && (
        <div className="rounded-2xl border border-green/30 bg-green/5 p-6 flex items-center justify-between">
          <div>
            <p className="font-medium text-lg">Connect your wallet to manage your 5H1TPay cards</p>
            <p className="text-secondary-t text-sm mt-1">Connect a Base wallet to create a vault, deposit tokens, and issue cards.</p>
          </div>
        </div>
      )}

      <Card className="bg-surface-a3/50">
        <CardHeader>
          <CardTitle className="text-lg">How 5H1TPay Works</CardTitle>
          <CardDescription>Deposit tokens on Base → we swap & bridge to TRON → your card gets funded</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { n: 1, t: "Create a Vault", d: "Your personal smart contract on Base that holds token deposits securely." },
              { n: 2, t: "Deposit Tokens", d: "Deposit tokens into your vault to issue a new card or top up an existing one." },
              { n: 3, t: "Auto Pipeline", d: "We swap via 1inch, bridge Base→TRON via Allbridge, and fund your card via 5H1TPay." },
              { n: 4, t: "Card Ready", d: "Your 5H1TPay card is issued or topped up. Track status in the Cards tab." },
            ].map((s) => (
              <div key={s.n} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{s.n}</div>
                  <span className="text-sm font-medium">{s.t}</span>
                </div>
                <p className="text-xs text-secondary-t pl-9">{s.d}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vault</CardTitle>
            <Vault className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent>
            {hasVault ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono">{shortenAddress(String(vaultAddress), 4)}</p>
                <Badge variant="success">Active</Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-secondary-t">No vault yet — create one to start</p>
                <Link to="/izipay/vaults/create">
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Create Vault</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cards</CardTitle>
            <CreditCard className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeCards.length}</p>
            <Link to="/izipay/cards" className="text-xs text-primary hover:underline mt-1 inline-block">View all cards</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Deposits</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-secondary-t" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingDeposits.length}</p>
            <Link to="/izipay/vaults/deposit" className="text-xs text-primary hover:underline mt-1 inline-block">New deposit</Link>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Your Cards</h2>
            {cards.length === 0 && <p className="text-sm text-secondary-t mt-1">Sample cards shown below — issue a real card to get started</p>}
          </div>
          <Link to="/izipay/vaults/deposit">
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Issue New Card</Button>
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(cards.length > 0 ? cards : sampleCards).map((card: any) => (
            <Link key={card.card_id} to={`/izipay/cards/${card.card_id}`}>
              <CardVisual cardType={card.card_type} cardId={card.card_id} status={card.status} balance={card.balance} />
            </Link>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(cards.length > 0 ? cards : sampleCards).map((card: any) => (
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

      {!hasVault && (
        <Card className="border-primary">
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Vault className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Step 1: Create your vault</p>
                <p className="text-sm text-secondary-t">You need a vault before you can deposit tokens and fund cards.</p>
              </div>
            </div>
            <Link to="/izipay/vaults/create"><Button>Create Vault<ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
          </CardContent>
        </Card>
      )}

      {hasVault && activeCards.length === 0 && (
        <Card className="border-primary">
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Step 2: Issue your first card</p>
                <p className="text-sm text-secondary-t">Deposit tokens to your vault to get a Visa or Mastercard.</p>
              </div>
            </div>
            <Link to="/izipay/vaults/deposit"><Button>Deposit & Issue Card<ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Deposits</CardTitle>
          <CardDescription>Your latest vault deposits and pipeline status</CardDescription>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Layers className="h-8 w-8 text-secondary-t" />
              <p className="text-sm text-secondary-t">No deposits yet</p>
              {hasVault && <Link to="/izipay/vaults/deposit"><Button size="sm" variant="outline" className="mt-2"><Plus className="h-4 w-4 mr-1" />Make a deposit</Button></Link>}
            </div>
          ) : (
            <div className="space-y-2">
              {deposits.slice(0, 5).map((d) => (
                <div key={d.deposit_id} className="flex items-center justify-between rounded-md border border-a10-b p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{d.deposit_type}</p>
                      <p className="text-xs text-secondary-t">{shortenAddress(d.deposit_id, 8)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatUSD(Number(d.amount) / 1e6)}</span>
                    <Badge variant={d.status === "completed" ? "success" : d.status === "failed" ? "destructive" : "warning"}>{d.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
