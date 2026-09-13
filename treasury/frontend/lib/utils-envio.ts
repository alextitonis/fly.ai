import type { DailyMetric, TreasuryAsset } from "@shit-protocol/treasury-subgraph-client";
import { treasurySubgraphClient } from "@/lib/treasury-subgraph-client";

export function parseEnvioNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// The metrics publisher can emit multiple snapshots per day per chain.
// Downstream aggregation that simply sums
// all rows for "today's date" over-counts 3×. Filter raw records to only the
// rows at the highest block within the latest date per chain.
export function filterLatestSnapshotPerChain(records: TreasuryAsset[]): TreasuryAsset[] {
  // First pass: latest (date, block) per chain.
  const keyByChain = new Map<string, { date: string; block: bigint }>();
  for (const r of records) {
    const chain = r.blockchain || "Unknown";
    const block = BigInt(r.block);
    const cur = keyByChain.get(chain);
    if (!cur || r.date > cur.date || (r.date === cur.date && block > cur.block)) {
      keyByChain.set(chain, { date: r.date, block });
    }
  }
  // Second pass: keep only rows matching the locked (date, block) per chain.
  return records.filter((r) => {
    const key = keyByChain.get(r.blockchain || "Unknown");
    return !!key && r.date === key.date && BigInt(r.block) === key.block;
  });
}

export async function fetchTreasuryAssets(start: string, end?: string): Promise<TreasuryAsset[]> {
  return treasurySubgraphClient.getDailyTreasuryAssets({
    start,
    ...(end ? { end } : {}),
    autoPaginate: true,
  });
}

export interface MetricRow {
  date: string;
  crossChainComplete: boolean;
  chainsIndexed: number[];
  chainsMissing: number[];
  shitTotalSupply: number;
  shitCirculatingSupply: number;
  shitFloatingSupply: number;
  shitBackedSupply: number;
  gShitBackedSupply: number;
  shitPrice: number;
  gShitPrice: number;
  marketCap: number;
  shitApy: number;
  treasuryMarketValue: number;
  treasuryLiquidBacking: number;
  treasuryLiquidBackingPerShitFloating: number;
  treasuryLiquidBackingPerShitBacked: number;
  treasuryLiquidBackingPerGShitBacked: number;
  sShitCirculatingSupply: number;
  sShitTotalValueLocked: number;
}

export function mapEnvioMetric(raw: DailyMetric): MetricRow {
  return {
    date: raw.date,
    crossChainComplete: raw.crossChainComplete,
    chainsIndexed: raw.chainsIndexed,
    chainsMissing: raw.chainsMissing,
    shitTotalSupply: parseEnvioNumber(raw.shitTotalSupply),
    shitCirculatingSupply: parseEnvioNumber(raw.shitCirculatingSupply),
    shitFloatingSupply: parseEnvioNumber(raw.shitFloatingSupply),
    shitBackedSupply: parseEnvioNumber(raw.shitBackedSupply),
    gShitBackedSupply: parseEnvioNumber(raw.gShitBackedSupply),
    shitPrice: parseEnvioNumber(raw.shitPrice),
    gShitPrice: parseEnvioNumber(raw.gShitPrice),
    marketCap: parseEnvioNumber(raw.marketCap),
    shitApy: parseEnvioNumber(raw.shitApy),
    treasuryMarketValue: parseEnvioNumber(raw.treasuryMarketValue),
    treasuryLiquidBacking: parseEnvioNumber(raw.treasuryLiquidBacking),
    treasuryLiquidBackingPerShitFloating: parseEnvioNumber(raw.treasuryLiquidBackingPerShitFloating),
    treasuryLiquidBackingPerShitBacked: parseEnvioNumber(raw.treasuryLiquidBackingPerShitBacked),
    treasuryLiquidBackingPerGShitBacked: parseEnvioNumber(raw.treasuryLiquidBackingPerGShitBacked),
    sShitCirculatingSupply: parseEnvioNumber(raw.sShitCirculatingSupply),
    sShitTotalValueLocked: parseEnvioNumber(raw.sShitTotalValueLocked),
  };
}
