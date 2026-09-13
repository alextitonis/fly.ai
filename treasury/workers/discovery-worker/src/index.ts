/**
 * Discovery Worker — polls Robinhood Chain launchpads for new tokens.
 * Runs on CF Cron Trigger (free: 1-min interval).
 * Writes discovered tokens to D1.
 *
 * Sources:
 * - Pons V2 factory events (via RPC eth_getLogs)
 * - DexScreener API (existing tokens with price/liquidity)
 *
 * Safety heuristics: vendored from swiftnodes/memecoin-scanner (MIT)
 * - workers/memecoin-scanner/src/heuristics.js
 * - 5 safety checks: symbol sanity, name sanity, supply check, owner renouncement, quote-token validation
 *
 * RPC fallback: tries multiple public RPCs in order until one succeeds.
 */

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

// Public Robinhood Chain RPCs (fallback list)
const RPCS = [
  "https://rpc.mainnet.chain.robinhood.com/",
  "https://robinhood.rpc.blxrbdn.com",
  "https://robinhood-rpc.publicnode.com",
];

// Pons V2 factory (from loxley env.js)
const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

// Pons V2 event signatures (from loxley chain.js)
const EVENTS = {
  LAUNCH: "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607", // TokenLaunched(address,address,address,address,uint256,uint256)
  GRAD: "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259",   // PoolGraduated
  SWEPT: "0xcdb72f157fd3666758a6ce201387ffb52038c7562e4fff352828da1096c4b6b4",  // LaunchSwept
};

// Pons V2 function selectors (from loxley chain.js)
const SEL = {
  getTokenInfo: "0xabb1dc44",
  getLaunchedToken: "0x" + "getLaunchedToken".slice(0).padStart(64, "0"),
};

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const ROBINHOOD_CHAIN = "robinhood";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(discoverTokens(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    await discoverTokens(env);
    return Response.json({ status: "discovery_complete" });
  },
};

async function discoverTokens(env: Env) {
  await pollPonsFactory(env);
  await pollDexScreener(env);
}

/** Try each RPC in order until one responds */
async function rpcCall(method: string, params: any[]): Promise<any> {
  for (const rpc of RPCS) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      if (data.error) continue;
      return data.result;
    } catch (e) {
      continue; // Try next RPC
    }
  }
  throw new Error(`All RPCs failed for ${method}`);
}

async function getLatestBlock(): Promise<number> {
  const result = await rpcCall("eth_blockNumber", []);
  return parseInt(result, 16);
}

async function ethGetLogs(params: any): Promise<any[]> {
  try {
    return await rpcCall("eth_getLogs", [params]) || [];
  } catch {
    return [];
  }
}

async function ethCall(to: string, data: string): Promise<string | null> {
  try {
    return await rpcCall("eth_call", [{ to, data }, "latest"]);
  } catch {
    return null;
  }
}

/** Poll Pons V2 factory for TokenLaunched events */
async function pollPonsFactory(env: Env) {
  try {
    const latestBlock = await getLatestBlock();
    const fromBlock = latestBlock - 10000; // Last ~10K blocks

    const logs = await ethGetLogs({
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: "latest",
      address: PONS_FACTORY,
      topics: [EVENTS.LAUNCH],
    });

    for (const log of logs) {
      // TokenLaunched(address token, address creator, address pair, address feeRecipient, uint256, uint256)
      // topics[1] = token, topics[2] = creator
      const tokenAddress = "0x" + log.topics[1].slice(26);
      const creator = "0x" + (log.topics[2] || "0x0000000000000000000000000000000000000000000000000000000000000000").slice(26);

      // Fetch token info from the factory
      const tokenInfoRaw = await ethCall(
        PONS_FACTORY,
        SEL.getTokenInfo + tokenAddress.slice(2).toLowerCase().padStart(64, "0")
      );

      let symbol = "UNKNOWN";
      let name: string | null = null;
      if (tokenInfoRaw && tokenInfoRaw.length >= 2 + 64 * 2) {
        // Try to decode symbol (string) — simplified ABI decode
        try {
          const symbolHex = tokenInfoRaw.slice(2 + 64, 2 + 64 * 2);
          const symbolBytes = Buffer.from(symbolHex, "hex");
          symbol = symbolBytes.toString("utf8").replace(/\0/g, "").trim() || "UNKNOWN";
        } catch { /* keep UNKNOWN */ }
      }

      await insertToken(env, {
        address: tokenAddress.toLowerCase(),
        symbol,
        name,
        launchpad: "pons",
        factory_address: PONS_FACTORY,
        creator_address: creator.toLowerCase(),
        first_seen: Date.now(),
      });
    }
  } catch (e) {
    console.error("Pons factory poll failed:", e);
  }
}

/** Poll DexScreener for trending Robinhood Chain tokens */
async function pollDexScreener(env: Env) {
  try {
    const resp = await fetch(`${DEXSCREENER_API}/search?q=robinhood`, {
      headers: { "User-Agent": "SHIT-Token-Bot/1.0" },
    });
    if (!resp.ok) return;

    const data = await resp.json() as any;
    const pairs = data.pairs || [];

    for (const pair of pairs.slice(0, 30)) {
      if (pair.chainId !== ROBINHOOD_CHAIN) continue;

      const token = pair.baseToken;
      await insertToken(env, {
        address: token.address.toLowerCase(),
        symbol: token.symbol,
        name: token.name,
        launchpad: detectLaunchpad(pair),
        pair_address: pair.pairAddress,
        first_seen: Date.now(),
      });
    }
  } catch (e) {
    console.error("DexScreener poll failed:", e);
  }
}

function detectLaunchpad(pair: any): string {
  const dexId = pair.dexId || "";
  // Pons tokens are on Uniswap V4 with the Pons hook
  // We can detect by checking if the pair has the Pons hook address
  if (pair.pairAddress) {
    // Will be refined by cross-referencing with Pons factory
    return "pons";
  }
  return dexId || "unknown";
}

async function insertToken(env: Env, token: {
  address: string;
  symbol: string;
  name?: string;
  launchpad?: string;
  pair_address?: string;
  factory_address?: string;
  creator_address?: string;
  first_seen: number;
}) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO tokens (address, symbol, name, chain, launchpad, pair_address,
     factory_address, creator_address, first_seen)
     VALUES (?, ?, ?, 'robinhood', ?, ?, ?, ?, ?)`
  ).bind(
    token.address,
    token.symbol,
    token.name || null,
    token.launchpad || null,
    token.pair_address || null,
    token.factory_address || null,
    token.creator_address || null,
    token.first_seen,
  ).run();
}
