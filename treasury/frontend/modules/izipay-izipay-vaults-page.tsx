import { useOnboard } from "./izipay-lib-onboard-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Badge } from "@/components/ui-badge";
import { useGetVault } from "./izipay-contracts-hooks";
import { shortenAddress } from "./izipay-lib-utils";
import { Link } from "react-router";
import { Plus, ArrowDownToLine, ArrowUpFromLine, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

export function IzipayVaultsPage() {
  const { address } = useOnboard();
  const { data: vaultAddress } = useGetVault(address);
  const [deposits, setDeposits] = useState<any[]>([]);

  useEffect(() => {
    if (!address) return;
    fetch("/api/deposits/intent").then((r) => r.json()).then((d) => setDeposits(d.deposits ?? [])).catch(() => {});
  }, [address]);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 py-20">
        <h1 className="text-3xl font-bold">Connect your wallet</h1>
      </div>
    );
  }

  const hasVault = !!vaultAddress && String(vaultAddress) !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Vaults</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your Vault</CardTitle>
          <CardDescription>Per-user upgradeable vault contract on Base</CardDescription>
        </CardHeader>
        <CardContent>
          {hasVault ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-lg font-mono">{shortenAddress(String(vaultAddress), 8)}</p>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="flex gap-2">
                  <Link to="/izipay/vaults/deposit"><Button size="sm"><ArrowDownToLine className="h-4 w-4 mr-1" />Deposit</Button></Link>
                  <Link to="/izipay/vaults/withdraw"><Button size="sm" variant="outline"><ArrowUpFromLine className="h-4 w-4 mr-1" />Withdraw</Button></Link>
                  <Link to="/izipay/vaults/claimback"><Button size="sm" variant="outline"><RotateCcw className="h-4 w-4 mr-1" />Claimback</Button></Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-secondary-t">No vault created yet.</p>
              <Link to="/izipay/vaults/create"><Button><Plus className="h-4 w-4 mr-1" />Create Vault</Button></Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Deposit History</CardTitle></CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <p className="text-sm text-secondary-t py-6 text-center">No deposits yet</p>
          ) : (
            <div className="space-y-2">
              {deposits.map((d) => (
                <div key={d.deposit_id} className="flex items-center justify-between rounded-md border border-a10-b p-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{d.deposit_type}</p>
                    <p className="text-xs text-secondary-t">{shortenAddress(d.deposit_id, 8)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{d.amount}</span>
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
