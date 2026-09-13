import { useQuery } from "@tanstack/react-query";
import { treasurySubgraphClient } from "@/lib/treasury-subgraph-client";
import { parseEnvioNumber } from "@/lib/utils-envio";

export interface GohmPriceHistory {
  dataPoints: Array<{ date: string; price: number }>;
}

export function useWstShitPriceHistory() {
  return useQuery<GohmPriceHistory>({
    queryKey: ["gohmPriceHistory", "treasury-subgraph"],
    queryFn: async () => {
      const start = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];
      const rows = await treasurySubgraphClient.getDailyMetrics({ start, autoPaginate: true });

      const dataPoints = rows
        .map((r) => ({
          date: r.date,
          price: parseEnvioNumber(r.gOhmPrice),
        }))
        .filter((p) => p.price > 0);

      return { dataPoints };
    },
    staleTime: 300_000,
    refetchInterval: 600_000,
  });
}
