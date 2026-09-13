/**
 * Gelato Automate Task Setup for SHIT Protocol
 *
 * Creates two automated keeper tasks on Base mainnet (chain ID 8453):
 *   1. Heart.beat() — every 4 hours (epoch heartbeat)
 *   2. CircuitBreaker.check() — every 8 hours (peg monitoring)
 *
 * Both keeper functions are permissionless — Gelato calls them as a public
 * transaction. No special access control is required.
 *
 * Usage:
 *   npx ts-node scripts/setup-gelato-tasks.ts
 *
 * Requires:
 *   @gelatonetwork/automate-sdk
 *   ethers v6
 *
 * Env vars:
 *   GELATO_API_KEY       — Gelato API key (1Balance account)
 *   KEEPER_PRIVATE_KEY   — Private key for the keeper EOA (funded via Gelato 1Balance)
 *   BASE_RPC_URL         — Base mainnet RPC URL
 *   HEART_ADDRESS        — SHIT ProtocolHeart contract address
 *   CIRCUIT_BREAKER_ADDRESS — shitCircuitBreaker contract address
 */

import { AutomateSDK, TaskTransaction } from "@gelatonetwork/automate-sdk";
import { ethers } from "ethers";

const BASE_CHAIN_ID = 8453;

async function main() {
  const gelatoApiKey = process.env.GELATO_API_KEY;
  const keeperPrivateKey = process.env.KEEPER_PRIVATE_KEY;
  const rpcUrl = process.env.BASE_RPC_URL;
  const heartAddress = process.env.HEART_ADDRESS;
  const circuitBreakerAddress = process.env.CIRCUIT_BREAKER_ADDRESS;

  if (!gelatoApiKey) throw new Error("GELATO_API_KEY not set");
  if (!keeperPrivateKey) throw new Error("KEEPER_PRIVATE_KEY not set");
  if (!rpcUrl) throw new Error("BASE_RPC_URL not set");
  if (!heartAddress) throw new Error("HEART_ADDRESS not set");
  if (!circuitBreakerAddress) throw new Error("CIRCUIT_BREAKER_ADDRESS not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const keeperWallet = new ethers.Wallet(keeperPrivateKey, provider);

  const automate = new AutomateSDK(BASE_CHAIN_ID, keeperWallet, {
    apiKey: gelatoApiKey,
  });

  console.log("=== Gelato Automate Task Setup ===");
  console.log(`Chain: Base (${BASE_CHAIN_ID})`);
  console.log(`Keeper: ${keeperWallet.address}`);
  console.log("");

  // Task 1: Heart.beat() — every 4 hours
  console.log("Creating task: Heart.beat() every 4 hours...");
  const heartTask: TaskTransaction = {
    name: "SHIT Protocol — Heart Beat",
    execAddress: heartAddress,
    execSelector: automate.encodeExecSelector("beat()"),
    execData: "0x",
    resolveAddress: heartAddress,
    resolveSelector: automate.encodeResolveSelector("checker()"),
    resolveData: "0x",
    interval: 4 * 60 * 60, // 4 hours in seconds
    dynamicArgs: false,
    singleExec: false,
  };

  const { taskId: heartTaskId } = await automate.createTask(heartTask);
  console.log(`Heart.beat() task created: ${heartTaskId}`);

  // Task 2: CircuitBreaker.check() — every 8 hours
  console.log("Creating task: CircuitBreaker.check() every 8 hours...");
  const cbTask: TaskTransaction = {
    name: "SHIT Protocol — Circuit Breaker Check",
    execAddress: circuitBreakerAddress,
    execSelector: automate.encodeExecSelector("check()"),
    execData: "0x",
    resolveAddress: circuitBreakerAddress,
    resolveSelector: automate.encodeResolveSelector("checker()"),
    resolveData: "0x",
    interval: 8 * 60 * 60, // 8 hours in seconds
    dynamicArgs: false,
    singleExec: false,
  };

  const { taskId: cbTaskId } = await automate.createTask(cbTask);
  console.log(`CircuitBreaker.check() task created: ${cbTaskId}`);

  console.log("");
  console.log("=== Tasks Created ===");
  console.log(`Heart.beat():        ${heartTaskId}`);
  console.log(`CircuitBreaker.check(): ${cbTaskId}`);
  console.log("");
  console.log("Fund the keeper EOA via Gelato 1Balance:");
  console.log(`  ${keeperWallet.address}`);
  console.log("");
  console.log("Monitor tasks at: https://app.gelato.network/");
}

main().catch((err) => {
  console.error("Failed to setup Gelato tasks:", err);
  process.exit(1);
});
