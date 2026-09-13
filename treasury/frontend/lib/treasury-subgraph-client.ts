import { createClient } from "@olympusdao/treasury-subgraph-client";

const metricsApiBaseUrl = import.meta.env.VITE_TREASURY_SUBGRAPH_METRICS_API?.trim() || undefined;

export const treasurySubgraphClient = createClient({
  ...(metricsApiBaseUrl ? { baseUrl: metricsApiBaseUrl } : {}),
});
