import type { DailyMetric, TreasuryAsset } from "@olympusdao/treasury-subgraph-client";
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
  ohmTotalSupply: number;
  sOhmCirculatingSupply: number;
  ohmFloatingSupply: number;
  ohmBackedSupply: number;
  gOhmBackedSupply: number;
  ohmPrice: number;
  gOhmPrice: number;
  marketCap: number;
  ohmApy: number;
  treasuryMarketValue: number;
  treasuryLiquidBacking: number;
  treasuryLiquidBackingPerOhmFloating: number;
  treasuryLiquidBackingPerOhmBacked: number;
  treasuryLiquidBackingPerGOhmBacked: number;
  sOhmTotalValueLocked: number;
}

export function mapEnvioMetric(raw: DailyMetric): MetricRow {
  return {
    date: raw.date,
    crossChainComplete: raw.crossChainComplete,
    chainsIndexed: raw.chainsIndexed,
    chainsMissing: raw.chainsMissing,
    ohmTotalSupply: parseEnvioNumber(raw.ohmTotalSupply),
    sOhmCirculatingSupply: parseEnvioNumber(raw.sOhmCirculatingSupply),
    ohmFloatingSupply: parseEnvioNumber(raw.ohmFloatingSupply),
    ohmBackedSupply: parseEnvioNumber(raw.ohmBackedSupply),
    gOhmBackedSupply: parseEnvioNumber(raw.gOhmBackedSupply),
    ohmPrice: parseEnvioNumber(raw.ohmPrice),
    gOhmPrice: parseEnvioNumber(raw.gOhmPrice),
    marketCap: parseEnvioNumber(raw.marketCap),
    ohmApy: parseEnvioNumber(raw.ohmApy),
    treasuryMarketValue: parseEnvioNumber(raw.treasuryMarketValue),
    treasuryLiquidBacking: parseEnvioNumber(raw.treasuryLiquidBacking),
    treasuryLiquidBackingPerOhmFloating: parseEnvioNumber(raw.treasuryLiquidBackingPerOhmFloating),
    treasuryLiquidBackingPerOhmBacked: parseEnvioNumber(raw.treasuryLiquidBackingPerOhmBacked),
    treasuryLiquidBackingPerGOhmBacked: parseEnvioNumber(raw.treasuryLiquidBackingPerGOhmBacked),
    sOhmTotalValueLocked: parseEnvioNumber(raw.sOhmTotalValueLocked),
  };
}
