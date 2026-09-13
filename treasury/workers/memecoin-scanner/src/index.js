/**
 * Memecoin scanner — real-time new-token detector on EVM chains.
 *
 * Listens for PairCreated events from configured DEX factories, gathers
 * token metadata, runs safety heuristics, and emits a structured alert.
 *
 * NOT a buying bot. Educational + alert-only.
 *
 * Run:
 *   CHAIN=base npm start
 */
import {
  createPublicClient,
  webSocket,
  parseAbiItem,
  formatUnits,
  getAddress,
} from "viem";
import { getChain } from "./chains.js";
import { evaluate } from "./heuristics.js";

const PAIR_CREATED_V2 = parseAbiItem(
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"
);

const ERC20_READS = [
  parseAbiItem("function name() view returns (string)"),
  parseAbiItem("function symbol() view returns (string)"),
  parseAbiItem("function decimals() view returns (uint8)"),
  parseAbiItem("function totalSupply() view returns (uint256)"),
  parseAbiItem("function owner() view returns (address)"),
];

async function readErc20(client, address) {
  const reads = await Promise.all(
    ["name", "symbol", "decimals", "totalSupply", "owner"].map(async (fn) => {
      try {
        return await client.readContract({
          address,
          abi: ERC20_READS,
          functionName: fn,
        });
      } catch {
        return null;
      }
    })
  );
  const [name, symbol, decimals, totalSupply, owner] = reads;
  return {
    address,
    name: name ?? null,
    symbol: symbol ?? null,
    decimals: decimals ?? null,
    totalSupply: totalSupply ?? null,
    owner: owner ?? null,
  };
}

function identifyQuote(addr, quoteTokens) {
  const normalized = getAddress(addr);
  for (const [sym, info] of Object.entries(quoteTokens)) {
    if (getAddress(info.address) === normalized) return { symbol: sym, ...info };
  }
  return null;
}

function emit(chain, factory, log, tokenMeta, quote) {
  const supplyDisplay =
    tokenMeta.totalSupply != null && tokenMeta.decimals != null
      ? Number(formatUnits(tokenMeta.totalSupply, tokenMeta.decimals)).toLocaleString()
      : "?";

  const report = {
    chain: chain.name,
    factory: factory.name,
    name: tokenMeta.name,
    symbol: tokenMeta.symbol,
    decimals: tokenMeta.decimals,
    totalSupply: tokenMeta.totalSupply,
    owner: tokenMeta.owner,
    address: tokenMeta.address,
    pair: log.args.pair,
    txHash: log.transactionHash,
    quoteSymbol: quote?.symbol ?? "unknown",
    quoteAddress: quote?.address ?? null,
  };

  const evaluation = evaluate(report);
  const verdict = evaluation.failed.length === 0 ? "✅ PASSED" : `⚠️  ${evaluation.failed.length} WARNING(S)`;

  const ts = new Date().toISOString();
  console.log(`────────────────────────────────────────`);
  console.log(`[${ts}] ${chain.name} • ${factory.name} • ${verdict}`);
  console.log(`  Token:  ${tokenMeta.symbol ?? "?"}  (${tokenMeta.name ?? "?"})`);
  console.log(`  Supply: ${supplyDisplay} ${tokenMeta.symbol ?? ""}`);
  console.log(`  Owner:  ${tokenMeta.owner ?? "—"}`);
  console.log(`  Paired: ${report.quoteSymbol}`);
  console.log(`  Token:  ${chain.explorerAddr}${tokenMeta.address}`);
  console.log(`  Pair:   ${chain.explorerAddr}${log.args.pair}`);
  console.log(`  Tx:     ${chain.explorerTx}${log.transactionHash}`);
  console.log(`  Checks: ${evaluation.summary}`);
  for (const f of evaluation.failed) {
    console.log(`    ⚠ ${f.check}: ${f.reason}`);
  }
  console.log();
}

async function main() {
  const chain = getChain();
  const client = createPublicClient({ transport: webSocket(chain.wsUrl) });

  console.log(`Memecoin scanner`);
  console.log(`  Chain:     ${chain.name} (${chain.slug})`);
  console.log(`  WebSocket: ${chain.wsUrl.replace(/key=[^&]+/, "key=***")}`);
  console.log(`  Factories: ${chain.factories.map(f => f.name).join(", ")}`);
  console.log(`  Heuristics enabled: 5`);
  console.log();

  for (const factory of chain.factories) {
    client.watchEvent({
      address: factory.address,
      event: PAIR_CREATED_V2,
      onLogs: async (logs) => {
        for (const log of logs) {
          const { token0, token1 } = log.args;
          const q0 = identifyQuote(token0, chain.quoteTokens);
          const q1 = identifyQuote(token1, chain.quoteTokens);
          // The "new" token is the non-quote one. If both are quotes, skip.
          let newToken, quote;
          if (q0 && !q1) { newToken = token1; quote = q0; }
          else if (q1 && !q0) { newToken = token0; quote = q1; }
          else if (!q0 && !q1) { newToken = token0; quote = null; }
          else continue; // both quotes — not a memecoin launch

          const meta = await readErc20(client, newToken);
          emit(chain, factory, log, meta, quote);
        }
      },
    });
    console.log(`  watching ${factory.name} at ${factory.address}`);
  }

  console.log();
  console.log(`Waiting for new pairs... Ctrl-C to stop.`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
