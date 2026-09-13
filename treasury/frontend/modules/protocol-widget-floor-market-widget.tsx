import { useChainId, useReadContract } from "wagmi";
import { Card } from "@/components/ui-card";
import { ContractName, getContractAddress } from "@/lib/contracts";
const SHIT_MARKET_FACTORY_ABI = [] as const;
const SHIT_FLOOR_HOOK_ABI = [] as const;
import { IMPACT_TOKENS, getImpactTokenAddress } from "@/lib/impact-tokens";
import { TOKENS, TokenName } from "@/lib/tokens";
import { base, baseSepolia, isTestnetMode } from "@/lib/chains";

function formatUsd(val: bigint | undefined): string {
  if (!val) return "--";
  return (Number(val) / 1e18).toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  });
}

function formatAzusdAmount(val: bigint | undefined): string {
  if (!val) return "--";
  return (Number(val) / 1e6).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function FloorRow({ label, poolAddress }: { label: string; poolAddress: `0x${string}` | undefined }) {
  const { data: floor } = useReadContract({
    address: poolAddress,
    abi: SHIT_FLOOR_HOOK_ABI,
    functionName: "floor",
    query: { enabled: !!poolAddress },
  });
  const { data: floorReserve } = useReadContract({
    address: poolAddress,
    abi: SHIT_FLOOR_HOOK_ABI,
    functionName: "floorReserve",
    query: { enabled: !!poolAddress },
  });
  const { data: bandReserve } = useReadContract({
    address: poolAddress,
    abi: SHIT_FLOOR_HOOK_ABI,
    functionName: "bandReserve",
    query: { enabled: !!poolAddress },
  });

  return (
    <div className="grid grid-cols-4 gap-2 px-3 py-2.5 rounded-lg bg-surface-bg-l1 text-sm">
      <div className="font-medium truncate">{label}</div>
      <div className="font-mono text-secondary-t">${formatUsd(floor)}</div>
      <div className="font-mono text-secondary-t">${formatAzusdAmount(floorReserve)}</div>
      <div className="font-mono text-secondary-t">${formatAzusdAmount(bandReserve)}</div>
    </div>
  );
}

export function FloorMarketDashboardWidget() {
  const chainId = useChainId();
  const readChainId = isTestnetMode ? baseSepolia.id : base.id;
  const marketFactory = getContractAddress(ContractName.MARKET_FACTORY, chainId);
  const burnerAddr = getContractAddress(ContractName.SHIT_BURNER, chainId);
  const shitAddress = (TOKENS[TokenName.SHIT].addresses[readChainId] ?? "0x0") as `0x${string}`;

  const { data: activeCount } = useReadContract({
    address: marketFactory,
    abi: SHIT_MARKET_FACTORY_ABI,
    functionName: "activeMarketCount",
    query: { enabled: !!marketFactory },
  });

  const { data: shitMarket } = useReadContract({
    address: marketFactory,
    abi: SHIT_MARKET_FACTORY_ABI,
    functionName: "getMarket",
    args: [shitAddress],
    query: { enabled: !!marketFactory },
  });

  const shitFloorHook = ((shitMarket as any)?.floorHook as `0x${string}` | undefined) ?? undefined;

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Floor Market Dashboard</h3>
      <p className="text-sm text-muted-foreground">
        Monotone redemption floor — strictly rising, permissionless buy-and-burn
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Active Markets</div>
          <div className="text-2xl font-bold">{activeCount ? Number(activeCount) : 0}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Burner Address</div>
          <div className="text-xs font-mono truncate">{burnerAddr ?? "Not deployed"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">SHIT Pool</div>
          <div className="text-xs font-mono truncate">{shitFloorHook ? `${shitFloorHook.slice(0, 8)}...${shitFloorHook.slice(-6)}` : "Not created"}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Floor History (Monotone Verification)</div>
        <div className="h-32 border rounded-md flex items-center justify-center text-sm text-muted-foreground">
          Chart will appear when floor market is active
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Floor Prices — All Impact Tokens & SHIT</div>
        <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-medium text-tertiary-t uppercase tracking-wide">
          <div>Token</div>
          <div>Floor Price</div>
          <div>Floor Reserve</div>
          <div>Band Reserve</div>
        </div>
        <div className="space-y-1">
          <FloorRow label="SHIT" poolAddress={shitFloorHook} />
          {IMPACT_TOKENS.map((token) => {
            const tokenAddr = getImpactTokenAddress(token, readChainId) as `0x${string}` | undefined;
            if (!tokenAddr || !marketFactory) return null;
            return <MarketFloorRow key={token.address} label={token.symbol} tokenAddress={tokenAddr} marketFactory={marketFactory} />;
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Redemption Interface</div>
        <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
          No active floor positions
        </div>
      </div>
    </Card>
  );
}

function MarketFloorRow({ label, tokenAddress, marketFactory }: { label: string; tokenAddress: `0x${string}`; marketFactory: `0x${string}` }) {
  const { data: market } = useReadContract({
    address: marketFactory,
    abi: SHIT_MARKET_FACTORY_ABI,
    functionName: "getMarket",
    args: [tokenAddress],
  });

  const floorHook = ((market as any)?.floorHook as `0x${string}` | undefined) ?? undefined;
  if (!floorHook || floorHook === "0x0000000000000000000000000000000000000000" || !(market as any)?.active) {
    return (
      <div className="grid grid-cols-4 gap-2 px-3 py-2.5 rounded-lg bg-surface-bg-l1 text-sm">
        <div className="font-medium truncate">{label}</div>
        <div className="font-mono text-tertiary-t col-span-3">No market</div>
      </div>
    );
  }

  return <FloorRow label={label} poolAddress={floorHook} />;
}
