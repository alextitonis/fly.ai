/**
 * 5H1T On-Chain Operations.
 *
 * Monitors protocol contracts on Base Sepolia and provides a testnet deployment helper.
 * Uses viem to read on-chain state via public RPC.
 *
 * Usage:
 *   node scripts/ops.ts monitor liquidity
 *   node scripts/ops.ts monitor emissions
 *   node scripts/ops.ts monitor votemarkets
 *   node scripts/ops.ts deploy
 */

import { createPublicClient, createWalletClient, http, formatUnits, encodeFunctionData, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, ContractName } from "../lib/contracts";

const client = createPublicClient({ chain: baseSepolia, transport: http() });

// ─── Monitor: Liquidity ──────────────────────────────────────────────────────

async function monitorLiquidity(): Promise<void> {
  const chainId = baseSepolia.id;
  const polManager = (CONTRACTS[ContractName.YIELD_ROUTER]?.[chainId] ?? "0x0") as Address;
  const shitToken = (CONTRACTS[ContractName.SHIT]?.[chainId] ?? "0x0") as Address;

  const ERC20_ABI = [{ type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const;
  const POL_ABI = [
    { type: "function", name: "getPoolCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { type: "function", name: "getTotalValue", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  ] as const;

  let totalPOLValue = 0n, poolCount = 0, shitSupply = 0n;
  try { shitSupply = await client.readContract({ address: shitToken, abi: ERC20_ABI, functionName: "totalSupply" }); } catch (e) { console.warn("Failed to read SHIT supply:", e); }
  try { poolCount = Number(await client.readContract({ address: polManager, abi: POL_ABI, functionName: "getPoolCount" })); } catch (e) { console.warn("Failed to read pool count:", e); }
  try { totalPOLValue = await client.readContract({ address: polManager, abi: POL_ABI, functionName: "getTotalValue" }); } catch (e) { console.warn("Failed to read POL value:", e); }

  const polRatio = shitSupply > 0n ? Number((totalPOLValue * 10000n) / shitSupply) / 100 : 0;
  console.log("═══════════════════════════════════════════════════");
  console.log("  Liquidity Monitoring Report");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Timestamp:     ${new Date().toISOString()}`);
  console.log(`  Chain ID:      ${chainId}`);
  console.log(`  Total POL:     $${formatUnits(totalPOLValue, 18)}`);
  console.log(`  Pool Count:    ${poolCount}`);
  console.log(`  SHIT Supply:  ${formatUnits(shitSupply, 18)}`);
  console.log(`  POL Ratio:     ${polRatio.toFixed(2)}%`);
  if (polRatio < 0.5) console.warn("WARNING: POL ratio below 0.5%");
  console.log("═══════════════════════════════════════════════════");
}

// ─── Monitor: Emissions ──────────────────────────────────────────────────────

async function monitorEmissions(): Promise<void> {
  const chainId = baseSepolia.id;
  const treasuryPolicy = (CONTRACTS[ContractName.SHIT_TREASURY_POLICY]?.[chainId] ?? "0x0") as Address;
  const voteMarketRouter = (CONTRACTS[ContractName.VOTE_MARKET_ROUTER]?.[chainId] ?? "0x0") as Address;

  const TREASURY_ABI = [
    { type: "function", name: "rfv", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { type: "function", name: "nav", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  ] as const;
  const VOTE_ABI = [{ type: "function", name: "getTotalBribeValue", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const;

  let rfv = 0n, nav = 0n, totalBribe = 0n;
  try { rfv = await client.readContract({ address: treasuryPolicy, abi: TREASURY_ABI, functionName: "rfv" }); } catch (e) { console.warn("Failed to read RFV:", e); }
  try { nav = await client.readContract({ address: treasuryPolicy, abi: TREASURY_ABI, functionName: "nav" }); } catch (e) { console.warn("Failed to read NAV:", e); }
  try { totalBribe = await client.readContract({ address: voteMarketRouter, abi: VOTE_ABI, functionName: "getTotalBribeValue" }); } catch (e) { console.warn("Failed to read bribe value:", e); }

  console.log("═══════════════════════════════════════════════════");
  console.log("  Emissions Efficiency Monitoring Report");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Timestamp:       ${new Date().toISOString()}`);
  console.log(`  Chain ID:        ${chainId}`);
  console.log(`  Treasury RFV:    $${formatUnits(rfv, 18)}`);
  console.log(`  Treasury NAV:    $${formatUnits(nav, 18)}`);
  console.log(`  Total Bribes:    $${formatUnits(totalBribe, 18)}`);
  console.log("═══════════════════════════════════════════════════");
}

// ─── Monitor: Vote Markets ───────────────────────────────────────────────────

async function monitorVoteMarkets(): Promise<void> {
  const chainId = baseSepolia.id;
  const router = (CONTRACTS[ContractName.VOTE_MARKET_ROUTER]?.[chainId] ?? "0x0") as Address;

  const ROUTER_ABI = [
    { type: "function", name: "getTotalBribeValue", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { type: "function", name: "getAdapterCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  ] as const;

  let totalBribe = 0n, adapterCount = 0;
  try { totalBribe = await client.readContract({ address: router, abi: ROUTER_ABI, functionName: "getTotalBribeValue" }); } catch (e) { console.warn("Failed to read bribe value:", e); }
  try { adapterCount = Number(await client.readContract({ address: router, abi: ROUTER_ABI, functionName: "getAdapterCount" })); } catch (e) { console.warn("Failed to read adapter count:", e); }

  console.log("═══════════════════════════════════════════════════");
  console.log("  Vote Market Monitoring Report");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Timestamp:       ${new Date().toISOString()}`);
  console.log(`  Chain ID:        ${chainId}`);
  console.log(`  Adapter Count:   ${adapterCount}`);
  console.log(`  Total Bribe $:   $${formatUnits(totalBribe, 18)}`);
  console.log("═══════════════════════════════════════════════════");
}

// ─── Deploy: Testnet ─────────────────────────────────────────────────────────

async function deployTestnet(): Promise<void> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) { console.error("DEPLOYER_PRIVATE_KEY not set"); process.exit(1); }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Deployer: ${account.address}`);

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const walletClient = createWalletClient({ chain: baseSepolia, transport: http(), account });

  const MARKET_FACTORY = "0x92150D8F1A767298f0B135dD6B1fC2c5578a79A6" as Address;
  const SHIT_BONDING = "0xf5a0E63B83De370BB8bafE97EfA38FaB603C0cCF" as Address;
  const SHIT_TOKEN = "0x4ecC60673196C702D7380f1f176dF5BF3773239B" as Address;
  const TREASURY = "0xCfd4CDBdfFC220b53D71659Baa8Ba79A18c765de" as Address;

  const IMPACT_TOKENS: { symbol: string; address: Address }[] = [
    { symbol: "SLR", address: "0x8803054573a22351Dacd35e7D6cF0a9B06216c36" },
    { symbol: "TREE", address: "0x828B6CDd8754490bF45508F01147E44C1e0759de" },
    { symbol: "REGEN", address: "0xB8FD50524D166237A14413E1a010e684cc332A73" },
    { symbol: "DOVU", address: "0xCE00b0e0a2B9fF76a82EEB727CEd74156C082862" },
    { symbol: "KLIMA", address: "0x0529D3cE18Dfe08e52604B0c665cEc15e7756093" },
    { symbol: "CEN", address: "0xe5E8dc87E4F8B83960436299AafbD8e953b482Af" },
  ];

  const MARKET_FACTORY_ABI = [
    { type: "function", name: "createMarket", inputs: [{ name: "impactToken", type: "address" }, { name: "partnerAddress", type: "address" }], outputs: [{ name: "floorHook", type: "address" }, { name: "feeSplitter", type: "address" }], stateMutability: "nonpayable" },
    { type: "function", name: "getMarket", inputs: [{ name: "impactToken", type: "address" }], outputs: [{ type: "tuple", name: "", components: [{ name: "impactToken", type: "address" }, { name: "floorHook", type: "address" }, { name: "feeSplitter", type: "address" }, { name: "pool", type: "address" }, { name: "active", type: "bool" }] }], stateMutability: "view" },
    { type: "function", name: "activeMarketCount", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  ] as const;

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH balance: ${balance / 10n ** 18n} ETH`);
  if (balance === 0n) { console.error("No ETH — fund the wallet first"); process.exit(1); }

  console.log("\n--- Creating Floor Markets ---");
  for (const token of IMPACT_TOKENS) {
    try {
      const existing = await publicClient.readContract({ address: MARKET_FACTORY, abi: MARKET_FACTORY_ABI, functionName: "getMarket", args: [token.address] });
      if (existing.active) { console.log(`[${token.symbol}] Already exists — skipping`); continue; }
      console.log(`[${token.symbol}] Creating market...`);
      const data = encodeFunctionData({ abi: MARKET_FACTORY_ABI, functionName: "createMarket", args: [token.address, TREASURY] });
      const hash = await walletClient.sendTransaction({ to: MARKET_FACTORY, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ${receipt.status === "success" ? "OK" : "FAILED"}`);
    } catch (e) { console.error(`  Failed: ${e}`); }
  }

  console.log("\n--- Checking Bond Markets ---");
  const BOND_ABI = [{ type: "function", name: "liveMarkets", inputs: [], outputs: [{ type: "uint256[]" }], stateMutability: "view" }] as const;
  const liveBonds = await publicClient.readContract({ address: SHIT_BONDING, abi: BOND_ABI, functionName: "liveMarkets" });
  console.log(`Live bond markets: ${liveBonds.length}`);

  console.log("\n--- SHIT Balance ---");
  const ERC20_ABI = [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const;
  const shitBal = await publicClient.readContract({ address: SHIT_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  console.log(`SHIT balance: ${shitBal / 10n ** 18n}`);
  console.log("\n=== Deployment Complete ===");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "monitor": {
      const [type] = args;
      switch (type) {
        case "liquidity": await monitorLiquidity(); break;
        case "emissions": await monitorEmissions(); break;
        case "votemarkets": await monitorVoteMarkets(); break;
        default: console.error(`Unknown monitor type: ${type}. Available: liquidity, emissions, votemarkets`); process.exit(1);
      }
      break;
    }
    case "deploy": {
      await deployTestnet(); break;
    }
    default:
      console.error("5H1T On-Chain Operations");
      console.error("");
      console.error("Usage: node scripts/ops.ts <command> [args...]");
      console.error("");
      console.error("Commands:");
      console.error("  monitor <type>    liquidity, emissions, votemarkets");
      console.error("  deploy             Testnet deployment helper");
      process.exit(1);
  }
}

main().catch((err) => { console.error("Ops error:", err); process.exit(1); });
