import { useState } from "react";
import { useReadContract, useChainId } from "wagmi";
import { usePrivyWriteContract } from "@/hooks/use-privy-write-contract";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { ContractName, getContractAddress } from "@/lib/contracts";
import {
  SHIT_TREASURY_POLICY_ABI,
  SHIT_INVERSE_BOND_ABI,
  SHIT_PRICE_FEED_ABI,
} from "@/abis/shitContracts";
import ShitStakingABI from "@/abis/ShitStaking";
import { cn } from "@/lib/utils";

function formatUsd(val: bigint | undefined): string {
  if (!val) return "--";
  return (Number(val) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPct(val: number): string {
  return `${val.toFixed(2)}%`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-tertiary-t uppercase tracking-wide">{label}</p>
      <p className="text-lg font-medium mt-1">{value}</p>
      {sub && <p className="text-xs text-tertiary-t mt-0.5">{sub}</p>}
    </Card>
  );
}

function StatusBadge({ ok, labelOk, labelBad }: { ok: boolean; labelOk: string; labelBad: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-full border", ok ? "text-green border-green/30 bg-green/10" : "text-red border-red/30 bg-red/10")}>
      <span className="text-[0.6rem]">●</span>
      {ok ? labelOk : labelBad}
    </span>
  );
}

function AllocationBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <div className="text-xs text-tertiary-t">No allocations</div>;
  return (
    <div>
      <div className="flex h-6 rounded-lg overflow-hidden border border-a10-b">
        {segments.map((s) => (
          <div key={s.label} className={cn("flex items-center justify-center text-[0.6rem] text-white font-medium", s.color)} style={{ width: `${(s.value / total) * 100}%` }}>
            {s.value / total > 0.1 && formatPct((s.value / total) * 100)}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={cn("w-2.5 h-2.5 rounded-sm", s.color)} />
            <span className="text-xs text-secondary-t">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UnifiedDashboardPage() {
  const chainId = useChainId();
  const [activeTab, setActiveTab] = useState("overview");

  const treasuryPolicy = getContractAddress(ContractName.SHIT_TREASURY_POLICY, chainId);
  const staking = getContractAddress(ContractName.STAKING, chainId);
  const inverseBond = getContractAddress(ContractName.SHIT_INVERSE_BOND, chainId);
  const priceFeed = getContractAddress(ContractName.SHIT_PRICE_FEED, chainId);

  const { data: rfv } = useReadContract({ address: treasuryPolicy, abi: SHIT_TREASURY_POLICY_ABI, functionName: "rfv", query: { enabled: !!treasuryPolicy } });
  const { data: nav } = useReadContract({ address: treasuryPolicy, abi: SHIT_TREASURY_POLICY_ABI, functionName: "nav", query: { enabled: !!treasuryPolicy } });
  const { data: stakingIndex } = useReadContract({ address: staking, abi: ShitStakingABI, functionName: "index", query: { enabled: !!staking } });
  const { data: navPershit } = useReadContract({ address: treasuryPolicy, abi: SHIT_TREASURY_POLICY_ABI, functionName: "navPershit", query: { enabled: !!treasuryPolicy } });
  const { data: floorPrice } = useReadContract({ address: treasuryPolicy, abi: SHIT_TREASURY_POLICY_ABI, functionName: "floorPrice", query: { enabled: !!treasuryPolicy } });
  const { data: inverseBondCapacity } = useReadContract({ address: inverseBond, abi: SHIT_INVERSE_BOND_ABI, functionName: "epochCapacity", query: { enabled: !!inverseBond } });
  const { data: inverseBondUsed } = useReadContract({ address: inverseBond, abi: SHIT_INVERSE_BOND_ABI, functionName: "epochUsedCapacity", query: { enabled: !!inverseBond } });
  const { data: twapPrice } = useReadContract({ address: priceFeed, abi: SHIT_PRICE_FEED_ABI, functionName: "latestPrice", query: { enabled: !!priceFeed } });
  const { data: spotPrice } = useReadContract({ address: priceFeed, abi: SHIT_PRICE_FEED_ABI, functionName: "spotPrice", query: { enabled: !!priceFeed } });

  const { writeContractAsync } = usePrivyWriteContract();
  const handleRefresh = async () => {
    if (!treasuryPolicy) return;
    try { await writeContractAsync({ address: treasuryPolicy, abi: SHIT_TREASURY_POLICY_ABI, functionName: "refreshValuations", args: [0n] }); } catch (e) { console.error(e); }
  };

  const polVal = nav ? Number(nav) : 0;
  const oracleFresh = twapPrice !== undefined && spotPrice !== undefined;
  const premiumMultiple = (twapPrice ?? spotPrice) && navPershit && navPershit > 0n ? Number(twapPrice ?? spotPrice) / Number(navPershit) : 0;
  const rfvPershit = floorPrice ? Number(floorPrice) / 1e18 : 0;
  const navPershitVal = navPershit ? Number(navPershit) / 1e18 : 0;
  const twapVal = twapPrice ? Number(twapPrice) / 1e18 : 0;
  const bondRemaining = inverseBondCapacity && inverseBondUsed ? inverseBondCapacity - inverseBondUsed : 0n;

  const rfvBreakdown = [
    { label: "Protocol-Owned Liquidity (50% haircut)", value: 0, color: "bg-purple-500" },
  ];
  const rfvTotal = rfvBreakdown.reduce((sum, r) => sum + r.value, 0);

  const revenueSources = [
    { source: "Protocol-Owned Liquidity Trading Fees", amount: "--", pct: 0, color: "bg-purple-500" },
    { source: "Bond Premiums", amount: "--", pct: 0, color: "bg-yellow-500" },
    { source: "Fee Splitter", amount: "--", pct: 0, color: "bg-orange-500" },
    { source: "Inverse Bond Capacity", amount: formatUsd(inverseBondCapacity), pct: 0, color: "bg-red-500" },
  ];

  const tabs = [{ id: "overview", label: "Overview" }, { id: "revenue", label: "Revenue" }, { id: "safety", label: "Safety" }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Treasury Dashboard</h2>
        <Button size="sm" variant="tertiary" onClick={handleRefresh}>Refresh</Button>
      </div>

      <div className="flex gap-1 border-b border-a10-b">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={cn("font-semibold text-sm px-4 py-2.5 border-b-2 transition-colors", activeTab === tab.id ? "text-primary-t border-yellow" : "text-tertiary-t border-transparent hover:text-secondary-t")}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Net Asset Value" value={`$${formatUsd(nav)}`} sub="Full asset value" />
            <StatCard label="Total Risk-Free Value" value={`$${formatUsd(rfv)}`} sub="Floor backing" />
            <StatCard label="stSHIT Index" value={stakingIndex ? (Number(stakingIndex) / 1e18).toFixed(6) : "--"} sub="Rebasing index" />
            <StatCard label="Premium" value={rfv && nav && rfv > 0n ? formatPct((Number(nav) / Number(rfv) - 1) * 100) : "--"} sub="Net Asset Value vs Risk-Free Value" />
          </div>
          <Card className="p-6">
            <h3 className="font-serif text-lg mb-4">Treasury Allocations</h3>
            <AllocationBar segments={[
              { label: "Protocol-Owned Liquidity Positions", value: Math.max(polVal, 0), color: "bg-purple-500" },
            ]} />
          </Card>
        </div>
      )}

      {activeTab === "revenue" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Treasury Net Asset Value" value={`$${formatUsd(nav)}`} />
            <StatCard label="Bond Usage" value={inverseBondCapacity && inverseBondUsed ? formatPct((Number(inverseBondUsed) / Number(inverseBondCapacity)) * 100) : "--"} sub="This epoch" />
          </div>
          <Card className="p-6">
            <h3 className="font-serif text-lg mb-4">Revenue Sources</h3>
            <div className="space-y-3">
              {revenueSources.map((src) => (
                <div key={src.source} className="flex items-center justify-between border-b border-a5-b pb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-3 h-3 rounded-sm", src.color)} />
                    <span className="text-sm font-medium">{src.source}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono">${src.amount}</span>
                    <span className="text-xs text-tertiary-t w-16 text-right">{formatPct(src.pct)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="font-serif text-lg mb-4">Fee Distribution (70/20/10)</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Floor Market (70%)</span><span className="text-sm font-mono">--</span></div>
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Treasury (20%)</span><span className="text-sm font-mono">--</span></div>
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Partner (10%)</span><span className="text-sm font-mono">--</span></div>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-serif text-lg mb-4">Buyback & Burn</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-sm text-secondary-t">SHIT Burned (30d)</span><span className="text-sm font-mono">--</span></div>
                <div className="flex justify-between"><span className="text-sm text-secondary-t">USDC Spent (30d)</span><span className="text-sm font-mono">--</span></div>
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Avg Burn Price</span><span className="text-sm font-mono">--</span></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "safety" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Net Asset Value per SHIT" value={`$${navPershitVal.toFixed(4)}`} />
            <StatCard label="Risk-Free Value per SHIT" value={`$${rfvPershit.toFixed(4)}`} sub="Floor" />
            <StatCard label="TWAP Price" value={`$${twapVal.toFixed(4)}`} />
            <StatCard label="Premium" value={`${premiumMultiple.toFixed(2)}x`} sub="P = TWAP / Net Asset Value" />
          </div>
          <Card className="p-6">
            <h3 className="font-serif text-lg mb-4">Risk-Free Value Breakdown</h3>
            <div className="space-y-3">
              {rfvBreakdown.map((item) => {
                const pct = rfvTotal > 0 ? (item.value / rfvTotal) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-sm", item.color)} />
                        <span className="text-sm">{item.label}</span>
                      </div>
                      <span className="text-sm font-mono">${(item.value / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({formatPct(pct)})</span>
                    </div>
                    <div className="h-2 bg-a10-b rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", item.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-a10-b flex justify-between">
              <span className="text-sm font-medium">Total Risk-Free Value</span>
              <span className="text-sm font-mono font-medium">${formatUsd(rfv)}</span>
            </div>
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="font-serif text-lg mb-4">Safety Checks</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm text-secondary-t">TWAP Oracle</span><StatusBadge ok={!!oracleFresh} labelOk="Fresh" labelBad="Stale" /></div>
                <div className="flex items-center justify-between"><span className="text-sm text-secondary-t">Floor Invariant</span><StatusBadge ok={rfv && floorPrice ? rfv > 0n : false} labelOk="Holding" labelBad="Violated" /></div>
                <div className="flex items-center justify-between"><span className="text-sm text-secondary-t">Premium {'>'} 1.0x</span><StatusBadge ok={premiumMultiple > 1.0} labelOk="Above floor" labelBad="Below Net Asset Value" /></div>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-serif text-lg mb-4">Inverse Bond Capacity</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Epoch Capacity</span><span className="text-sm font-mono">${formatUsd(inverseBondCapacity)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Used</span><span className="text-sm font-mono">${formatUsd(inverseBondUsed)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-secondary-t">Remaining</span><span className="text-sm font-mono text-green">${formatUsd(bondRemaining)}</span></div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
