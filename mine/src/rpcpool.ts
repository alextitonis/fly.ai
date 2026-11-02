/**
 * JSON-RPC with failover (2026-10-03, the user: "did you add fallbacks if an rpc fails"): each chain's public RPC
 * first, then the next public one when it can't be reached, times out, rate-limits or answers 5xx / non-JSON. A
 * JSON-RPC error (a revert, a bad nonce) is the chain's answer and comes back as it is - never retried elsewhere.
 * Sending the same signed transaction to a second RPC is safe: it has the same hash, the chain takes it once.
 */
export const RPC_FALLBACKS: Record<string, string[]> = {
  // QuickNode (2026-10-03, the user: "quicknode first ... so it's quick"): FIRST; the free RPCs only when it fails. Keep reads light: no fast polls
  "https://rpc.mainnet.chain.robinhood.com": ["https://robinhood.drpc.org"],
  "https://mainnet.base.org": ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
  "https://arb1.arbitrum.io/rpc": ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org"],
  "https://bsc-dataseed.binance.org": ["https://bsc-rpc.publicnode.com", "https://bsc.drpc.org"],
  "https://polygon.drpc.org": ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"],
  // Abstract: read only, RUYUI's owners (src/ruyui.ts)
  "https://api.mainnet.abs.xyz": ["https://abstract.drpc.org", "https://abstract.api.onfinality.io/public"],
};

/** A rate-limit reply (QuickNode -32007 "15/second request limit reached", -32005 "limit exceeded"): try the next RPC. */
const limited = (body: any): boolean => {
  const e = body?.error;
  return !!e && (e.code === -32007 || e.code === -32005 || /request limit|rate limit|too many requests/i.test(String(e.message ?? "")));
};

/** POST one JSON-RPC payload; the parsed body from the first RPC that answers properly. */
// QuickNode on Robinhood Chain; its URL holds its key, so it comes from the env (fly secrets set QUICKNODE_RPC=...), never
// the code (review 2026-10-03). Unset: the public RPCs only. Errors name the RPC's host, never the URL.
// 2026-11-02 (58.4M of 80M credits used): the backup for routine reads, the public RPC first; first only for transactions.
const QUICKNODE = (process.env.QUICKNODE_RPC ?? "").trim();
const ROBINHOOD = "https://rpc.mainnet.chain.robinhood.com";
const PAID_FIRST = new Set(["eth_sendRawTransaction", "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas"]);
const host = (u: string) => { try { return new URL(u).host; } catch { return "rpc"; } };

// RPC meter (2026-11-02, as the desk's onchain.py): requests by RPC, method and caller, the top ones logged every 10 min
const METER = new Map<string, number>();
const METER_EVERY_MS = 600_000;
let meterAt = Date.now();
const callerOf = (): string => {
  const line = (new Error().stack ?? "").split("\n").slice(1).find((l) => !/rpcpool\.ts|node:internal/.test(l)) ?? "";
  const m = /([\w.-]+\.ts):(\d+)/.exec(line);
  return m ? `${m[1]}:${m[2]}` : "?";
};
function meter(u: string, method: string, who: string): void {
  const kind = QUICKNODE && u === QUICKNODE ? "quicknode" : host(u);
  const key = `${kind} ${method} ${who}`;
  METER.set(key, (METER.get(key) ?? 0) + 1);
  const now = Date.now();
  if (now - meterAt < METER_EVERY_MS) return;
  let total = 0, paid = 0;
  for (const [k, n] of METER) { total += n; if (k.startsWith("quicknode ")) paid += n; }
  const top = [...METER].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} ${n}`).join(" | ");
  console.log(`rpc meter: ${total} requests in ${((now - meterAt) / 60_000).toFixed(1)} min (${paid} quicknode) | ${top}`);
  METER.clear();
  meterAt = now;
}

export async function postRpc(url: string, payload: unknown, timeoutMs = 10_000): Promise<any> {
  const key = url.replace(/\/$/, "");
  const method = String((payload as { method?: unknown })?.method ?? "batch");
  const paid = QUICKNODE && key === ROBINHOOD ? QUICKNODE : "";
  const urls = paid && PAID_FIRST.has(method) ? [paid, url, ...(RPC_FALLBACKS[key] ?? [])]
    : [url, ...(paid ? [paid] : []), ...(RPC_FALLBACKS[key] ?? [])];
  const who = callerOf();
  let last: unknown = null;
  for (const u of urls) {
    try {
      meter(u, method, who);
      const res = await fetch(u, {
        method: "POST",
        // QuickNode's referrer whitelist (2026-10-14): the endpoint only answers the site's domain
        headers: { "content-type": "application/json", referer: "https://www.flyaiworld.com/" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status} from ${host(u)}`);
      const body = await res.json();
      if (limited(body)) throw new Error(`rate limited by ${host(u)}`);
      return body;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
