/**
 * Trade Worker — Real Trading Mode with Self-Improvement
 *
 * Goal: Turn $1 into $1,000 as fast as possible.
 * Strategy: Aggressive compounding — buy high-score tokens, sell on profit target,
 * reinvest all gains. Real price data from GeckoTerminal/DexScreener.
 *
 * Modes:
 * - Paper (default): virtual balance, no real money at risk
 * - Real (REAL_TRADING=true): real ETH swaps via loxley's Uniswap V4 encoding + viem
 *   50% of profits buy real FLYAI → transfer to TreasuryValuation contract
 *   RFV/floor price auto-pushed on-chain each epoch
 *
 * Self-improving: uses learned trade params (profit target, stop loss, position size)
 * from D1 settings, updated by the fly brain DO retrain loop every 10 trades.
 *
 * Flow:
 * 1. Read pending BUY/SELL signals from D1 (from fly brain)
 * 2. For BUY: check safety, buy at current price (paper or real), record trade
 * 3. For SELL: check open positions, sell at current price, record P&L
 * 4. Auto-sell positions that hit profit target or stop loss (learned params)
 * 5. Record training data (features + neural activity + outcome) on every closed trade
 * 6. Trigger fly brain retrain after every 10 closed trades
 * 7. Post every decision to Discord (if webhook configured)
 * 8. Track balance in D1 (paper) or on-chain (real)
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther, getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ABI, ADDRESSES, V2_ROUTER_ABI, encodeV4Swap, poolKeyFor, poolIdOf, minOutFromRate, BPS } from "./loxley-swap";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  FLYAI_TOKEN: string;
  FLYAI_PAIR: string;
  WETH: string;
  PROFIT_TO_FLYAI_PERCENT: string;
  MAX_ETH_PER_TRADE: string;
  COOLDOWN_SECONDS: string;
  // Real trading secrets
  EXECUTOR_PRIVATE_KEY?: string;
  ROBINHOOD_RPC_URL?: string;
  REAL_TRADING?: string;
  EMERGENCY_STOP?: string;
  SHIT_TOKEN?: string;
  TREASURY_VALUATION?: string;
}

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const FLY_BRAIN_RETRAIN_URL = "https://fly-brain-do.YOUR-SUBDOMAIN.workers.dev/retrain";

// Default paper trading config (overridden by learned settings when available)
const STARTING_BALANCE = 1.0;
const TARGET_BALANCE = 1000.0;
const DEFAULT_PROFIT_TARGET_PCT = 30;
const DEFAULT_STOP_LOSS_PCT = 15;
const DEFAULT_MAX_POSITION_PCT = 50;
const DEFAULT_MIN_SCORE_TO_BUY = 30;

// DEX trading costs (Robinhood Chain / Uniswap V2-style AMM)
const DEX_FEE_PCT = 0.3;          // 0.3% swap fee (Uniswap V2 standard)
const SLIPPAGE_BASE_PCT = 0.5;    // 0.5% base slippage tolerance
const GAS_COST_USD = 0.02;        // ~$0.02 gas per swap on Robinhood Chain (L2)
const MAX_SLIPPAGE_PCT = 3.0;     // Cap slippage at 3% even for large trades

const COLORS: Record<string, number> = {
  BUY: 0x00ff00, SELL: 0xff0000, HOLD: 0x808080, REJECT: 0xffa500,
  PAPER_BUY: 0x00aaff, PAPER_SELL: 0xff6600, PAPER_AUTO_SELL: 0xffaa00,
  RETRAIN: 0x9b59b6,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/process") {
      ctx.waitUntil(processSignals(env));
      return Response.json({ status: "processing" });
    }
    if (url.pathname === "/balance") {
      const balance = await env.DB.prepare("SELECT * FROM paper_balance WHERE id = 1").first();
      return Response.json(balance);
    }
    if (url.pathname === "/paper-trades") {
      const trades = await env.DB.prepare("SELECT * FROM paper_trades ORDER BY created_at DESC LIMIT 50").all();
      return Response.json(trades.results);
    }
    if (url.pathname === "/positions") {
      const positions = await env.DB.prepare("SELECT * FROM positions WHERE status = 'open' ORDER BY entry_at DESC").all();
      return Response.json(positions.results);
    }
    if (url.pathname === "/force-sell-all") {
      ctx.waitUntil(forceSellAll(env));
      return Response.json({ status: "selling_all" });
    }
    if (url.pathname === "/model-status") {
      const models = await env.DB.prepare("SELECT * FROM model_versions ORDER BY saved_at DESC LIMIT 10").all();
      return Response.json(models.results);
    }
    if (url.pathname === "/training-data") {
      const data = await env.DB.prepare("SELECT * FROM training_data ORDER BY closed_at DESC LIMIT 50").all();
      return Response.json(data.results);
    }
    return Response.json({
      status: "paper_trading",
      endpoints: ["/process", "/balance", "/paper-trades", "/positions", "/force-sell-all", "/model-status", "/training-data"],
    });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processSignals(env));
  },
};

// === Learned trade params (from D1 settings, updated by retrain loop) ===

async function getTradeParams(env: Env): Promise<{
  profitTarget: number; stopLoss: number; maxPosition: number; minScore: number;
}> {
  const settings = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)"
  ).bind("profit_target_pct", "stop_loss_pct", "max_position_pct", "min_score_to_buy").all();
  const map: Record<string, number> = {};
  for (const row of settings.results || []) {
    map[row.key] = parseFloat(row.value);
  }
  return {
    profitTarget: map["profit_target_pct"] ?? DEFAULT_PROFIT_TARGET_PCT,
    stopLoss: map["stop_loss_pct"] ?? DEFAULT_STOP_LOSS_PCT,
    maxPosition: map["max_position_pct"] ?? DEFAULT_MAX_POSITION_PCT,
    minScore: map["min_score_to_buy"] ?? DEFAULT_MIN_SCORE_TO_BUY,
  };
}

// === Main loop ===

async function processSignals(env: Env) {
  const isReal = isRealTrading(env);
  await autoSellPositions(env, isReal);
  await processBuySignals(env, isReal);
  await processSellSignals(env, isReal);
  await updateFlyaiBalance(env, isReal);
  if (isReal) await pushRfvOnChain(env);
}

function isRealTrading(env: Env): boolean {
  return env.REAL_TRADING === "true" && !env.EMERGENCY_STOP && !!env.EXECUTOR_PRIVATE_KEY && !!env.ROBINHOOD_RPC_URL;
}

// === Per-connectome wallet management ===

async function getConnectomeBalance(env: Env, connectomeId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT w.balance_usd FROM connectomes c JOIN wallets w ON c.wallet_id = w.id WHERE c.id = ?"
  ).bind(connectomeId).first();
  return row?.balance_usd ?? STARTING_BALANCE;
}

async function updateConnectomeWallet(env: Env, connectomeId: string, newBalance: number, pnl: number, isWin: boolean) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE wallets SET balance_usd = ?, n_trades = n_trades + 1, "
    + "n_wins = n_wins + ?, total_pnl = total_pnl + ? "
    + "WHERE id = (SELECT wallet_id FROM connectomes WHERE id = ?)"
  ).bind(Math.max(0, newBalance), isWin ? 1 : 0, pnl, connectomeId).run();

  // Also update connectome-level stats
  await env.DB.prepare(
    "UPDATE connectomes SET status = 'active' WHERE id = ?"
  ).bind(connectomeId).run();
}

async function getPaperBalance(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT balance_usd FROM paper_balance WHERE id = 1").first();
  return row?.balance_usd ?? STARTING_BALANCE;
}

async function updatePaperBalance(env: Env, newBalance: number, pnl: number, isWin: boolean) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE paper_balance SET balance_usd = ?, total_trades = total_trades + 1, "
    + "wins = wins + ?, losses = losses + ?, total_pnl = total_pnl + ?, updated_at = ? WHERE id = 1"
  ).bind(Math.max(0, newBalance), isWin ? 1 : 0, isWin ? 0 : 1, pnl, now).run();
}

// === Buy signals ===

async function processBuySignals(env: Env, isReal: boolean = false) {
  const params = await getTradeParams(env);

  // Get all signals tagged with connectome_id
  const signals = await env.DB.prepare(
    "SELECT s.*, t.symbol, t.launchpad, t.score FROM signals s "
    + "LEFT JOIN tokens t ON s.token_address = t.address "
    + "WHERE s.decision = 'BUY' AND s.score >= ? "
    + "AND s.id NOT IN (SELECT signal_id FROM paper_trades WHERE signal_id IS NOT NULL) "
    + "ORDER BY s.created_at DESC LIMIT 20"
  ).bind(params.minScore).all();

  for (const signal of signals.results || []) {
    const connectomeId = signal.connectome_id || "malecns"; // fallback for old signals
    const balance = await getConnectomeBalance(env, connectomeId);
    if (balance >= TARGET_BALANCE) continue;
    if (isReal) {
      await handleRealBuy(env, signal, balance, params, connectomeId);
    } else {
      await handlePaperBuy(env, signal, balance, params, connectomeId);
    }
  }
}

async function handlePaperBuy(env: Env, signal: any, balance: number, params: any, connectomeId: string) {
  const existing = await env.DB.prepare(
    "SELECT * FROM positions WHERE token_address = ? AND status = 'open' AND (connectome_id = ? OR connectome_id IS NULL)"
  ).bind(signal.token_address, connectomeId).first();
  if (existing) return;

  const priceData = await getTokenPrice(signal.token_address);
  if (!priceData) return;

  const priceUsd = parseFloat(priceData.priceUsd || "0");
  if (priceUsd === 0) return;

  const liquidity = priceData.liquidity?.usd || 50000;  // Default to $50K if unavailable
  const volume = priceData.volume?.h24 || 10000;        // Default to $10K if unavailable
  if (liquidity < 1000) return;
  if (volume < 100) return;

  const positionSize = Math.min(balance * (params.maxPosition / 100), balance * 0.8);
  if (positionSize < 0.01) return;

  const cooldown = parseInt(env.COOLDOWN_SECONDS || "60");
  const lastTrade = await env.DB.prepare(
    "SELECT created_at FROM paper_trades WHERE token_address = ? AND connectome_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(signal.token_address, connectomeId).first();
  if (lastTrade && Math.floor(Date.now() / 1000) - lastTrade.created_at < cooldown) return;

  // Apply DEX trading costs: fee + slippage + gas
  const costs = applyTradingCosts(priceUsd, positionSize, liquidity, "buy");
  const effectiveEntryPrice = costs.effectivePrice;
  const totalCostUsd = costs.totalCostUsd;

  const now = Math.floor(Date.now() / 1000);
  const txHash = `paper_${now}_${signal.token_address.slice(2, 8)}`;
  // Balance decreases by position size + gas (fee and slippage are baked into entry price)
  const newBalance = balance - positionSize - costs.gasUsd;

  // Update per-connectome wallet
  await updateConnectomeWallet(env, connectomeId, newBalance, 0, false);

  await env.DB.prepare(
    "INSERT INTO paper_trades (token_address, symbol, action, entry_price, amount_usd, signal_id, balance_after, connectome_id, created_at) "
    + "VALUES (?, ?, 'BUY', ?, ?, ?, ?, ?, ?)"
  ).bind(signal.token_address, signal.symbol, effectiveEntryPrice, positionSize, signal.id, newBalance, connectomeId, now).run();

  await env.DB.prepare(
    "INSERT INTO positions (token_address, symbol, launchpad, entry_price, entry_amount, "
    + "entry_tx, entry_at, status, connectome_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)"
  ).bind(signal.token_address, signal.symbol, signal.launchpad, effectiveEntryPrice, positionSize, txHash, now, connectomeId).run();

  await postDiscord(env, {
    action: "PAPER_BUY", symbol: signal.symbol || signal.token_address.slice(0, 8),
    reason: `[${connectomeId}] ${signal.reason || "Fly brain BUY"} | fee=$${costs.feeUsd.toFixed(4)} slip=$${costs.slippageUsd.toFixed(4)} gas=$${costs.gasUsd.toFixed(4)}`,
    price: effectiveEntryPrice, amount: positionSize, pnlPercent: 0,
    launchpad: signal.launchpad, score: signal.score,
    balance: newBalance,
  });
}

// === Sell signals ===

async function processSellSignals(env: Env, isReal: boolean = false) {
  const signals = await env.DB.prepare(
    "SELECT s.*, t.symbol FROM signals s "
    + "LEFT JOIN tokens t ON s.token_address = t.address "
    + "WHERE s.decision = 'SELL' ORDER BY s.created_at DESC LIMIT 10"
  ).all();

  for (const signal of signals.results || []) {
    const connectomeId = signal.connectome_id || "malecns";
    const position = await env.DB.prepare(
      "SELECT * FROM positions WHERE token_address = ? AND status = 'open' AND (connectome_id = ? OR connectome_id IS NULL)"
    ).bind(signal.token_address, connectomeId).first();
    if (position) {
      await sellPosition(env, position, signal.reason || "Fly brain SELL", "PAPER_SELL", isReal);
    }
  }
}

// === Auto-sell on profit target / stop loss (learned params) ===

async function autoSellPositions(env: Env, isReal: boolean = false) {
  const params = await getTradeParams(env);
  const positions = await env.DB.prepare("SELECT * FROM positions WHERE status = 'open'").all();

  for (const position of positions.results || []) {
    const priceData = await getTokenPrice(position.token_address);
    if (!priceData) continue;

    const marketPrice = parseFloat(priceData.priceUsd || "0");
    if (marketPrice === 0) continue;
    const entryPrice = position.entry_price || 0;
    if (entryPrice === 0) continue;

    const positionSize = position.entry_amount || 0;
    const liquidity = priceData.liquidity?.usd || 10000;

    // Check P&L against effective exit price (after fees + slippage)
    // so we don't auto-sell when the cost of selling would eat the profit
    const costs = applyTradingCosts(marketPrice, positionSize, liquidity, "sell");
    const effectiveExitPrice = costs.effectivePrice;
    const pnlPct = ((effectiveExitPrice - entryPrice) / entryPrice) * 100;

    if (pnlPct >= params.profitTarget) {
      await sellPosition(env, position, `Auto-sell: +${pnlPct.toFixed(1)}% profit target hit (net of fees)`, "PAPER_AUTO_SELL", isReal);
      // Insert new BUY signal to re-enter the position (continuous trading cycle)
      await insertReentrySignal(env, position);
    } else if (pnlPct <= -params.stopLoss) {
      await sellPosition(env, position, `Auto-sell: ${pnlPct.toFixed(1)}% stop loss hit (net of fees)`, "PAPER_AUTO_SELL", isReal);
      // Insert new BUY signal to re-enter the position (continuous trading cycle)
      await insertReentrySignal(env, position);
    }
  }
}

async function insertReentrySignal(env: Env, position: any) {
  const connectomeId = position.connectome_id || "malecns";
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO signals (token_address, decision, confidence, neural_activity, feature_snapshot, score, reason, connectome_id, created_at) "
    + "VALUES (?, 'BUY', 1, '{}', '{}', 70, ?, ?, ?)"
  ).bind(position.token_address, `re-entry after auto-sell for ${connectomeId}`, connectomeId, now).run();
}

async function sellPosition(env: Env, position: any, reason: string, action: string, isReal: boolean = false) {
  if (isReal) {
    return handleRealSell(env, position, reason, action);
  }
  const priceData = await getTokenPrice(position.token_address);
  if (!priceData) return;

  const marketPrice = parseFloat(priceData.priceUsd || "0");
  const entryPrice = position.entry_price || 0;
  if (marketPrice === 0 || entryPrice === 0) return;

  const positionSize = position.entry_amount || 0;
  const liquidity = priceData.liquidity?.usd || 10000;

  // Apply DEX trading costs on sell: fee + slippage + gas
  const costs = applyTradingCosts(marketPrice, positionSize, liquidity, "sell");
  const exitPrice = costs.effectivePrice;

  // P&L is based on effective entry vs effective exit, minus gas
  const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
  const pnlUsd = positionSize * (pnlPct / 100) - costs.gasUsd;
  const connectomeId = position.connectome_id || "malecns";
  const currentBalance = await getConnectomeBalance(env, connectomeId);
  // Balance increases by position value + P&L - gas (fee/slippage already in exit price)
  const newBalance = currentBalance + positionSize + pnlUsd;

  const now = Math.floor(Date.now() / 1000);
  const txHash = `paper_sell_${now}_${position.token_address.slice(2, 8)}`;

  await env.DB.prepare(
    "INSERT INTO paper_trades (token_address, symbol, action, entry_price, exit_price, amount_usd, "
    + "pnl_usd, pnl_percent, balance_after, connectome_id, created_at) VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(position.token_address, position.symbol, entryPrice, exitPrice,
         positionSize, pnlUsd, pnlPct, newBalance, connectomeId, now).run();

  await env.DB.prepare(
    "UPDATE positions SET status = 'closed', exit_price = ?, exit_tx = ?, exit_at = ?, pnl_percent = ? "
    + "WHERE id = ?"
  ).bind(exitPrice, txHash, now, pnlPct, position.id).run();

  // Update per-connectome wallet
  await updateConnectomeWallet(env, connectomeId, newBalance, pnlUsd, pnlUsd > 0);

  // Record training data for self-improvement
  await recordTrainingData(env, position, entryPrice, exitPrice, pnlPct, now);

  // Check if we should trigger retraining
  await maybeTriggerRetrain(env);

  let flyaiBought = 0;
  if (pnlUsd > 0) {
    const profitPct = parseFloat(env.PROFIT_TO_FLYAI_PERCENT || "50") / 100;
    flyaiBought = pnlUsd * profitPct;
  }

  await postDiscord(env, {
    action, symbol: position.symbol || position.token_address.slice(0, 8),
    reason: `[${connectomeId}] ${reason}`,
    price: exitPrice, amount: positionSize, pnlPercent: pnlPct,
    pnlUsd, flyaiBought, balance: newBalance,
  });
}

// === Training data recording (for self-improvement) ===

async function recordTrainingData(env: Env, position: any, entryPrice: number,
                                    exitPrice: number, pnlPct: number, now: number) {
  // Find the signal that triggered this trade
  const signal = await env.DB.prepare(
    "SELECT * FROM signals WHERE token_address = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(position.token_address).first();
  if (!signal) return;

  await env.DB.prepare(
    "INSERT INTO training_data (signal_id, token_address, features, neural_activity, "
    + "entry_price, exit_price, pnl_percent, outcome, hold_time_seconds, "
    + "signal_created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    signal.id, position.token_address,
    signal.feature_snapshot || "{}", signal.neural_activity || "{}",
    entryPrice, exitPrice, pnlPct, pnlPct > 0 ? 1 : 0,
    now - (position.entry_at || now),
    signal.created_at, now
  ).run();
}

async function maybeTriggerRetrain(env: Env) {
  const completed = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM training_data WHERE outcome IS NOT NULL"
  ).first();
  const retrainEvery = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'retrain_every_n_trades'"
  ).first();
  const threshold = parseInt(retrainEvery?.value || "10");

  if (completed && completed.n > 0 && completed.n % threshold === 0) {
    try {
      await fetch(FLY_BRAIN_RETRAIN_URL, { method: "POST" });
      await postDiscord(env, {
        action: "RETRAIN", symbol: "Brain",
        reason: `${completed.n} trades completed — triggering model retrain`,
        price: 0, amount: 0, pnlPercent: 0,
      });
    } catch (e) {
      console.error("Retrain trigger failed:", e);
    }
  }
}

// === Force sell all (emergency) ===

async function forceSellAll(env: Env) {
  const isReal = isRealTrading(env);
  const positions = await env.DB.prepare("SELECT * FROM positions WHERE status = 'open'").all();
  for (const position of positions.results || []) {
    await sellPosition(env, position, "Force sell all", "PAPER_SELL", isReal);
  }
}

// === Real trading (viem + loxley swap encoding) ===

function getClients(env: Env) {
  const chain = {
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.ROBINHOOD_RPC_URL!] } },
  };
  const account = privateKeyToAccount(env.EXECUTOR_PRIVATE_KEY as `0x${string}`);
  const pub = createPublicClient({ chain, transport: http(env.ROBINHOOD_RPC_URL) });
  const wc = createWalletClient({ account, chain, transport: http(env.ROBINHOOD_RPC_URL) });
  return { pub, wc, account, address: account.address };
}

// Buy a token with real ETH via Uniswap V2 Router02 (simplest path for non-Pons tokens)
async function handleRealBuy(env: Env, signal: any, balance: number, params: any, connectomeId: string) {
  const existing = await env.DB.prepare(
    "SELECT * FROM positions WHERE token_address = ? AND status = 'open' AND (connectome_id = ? OR connectome_id IS NULL)"
  ).bind(signal.token_address, connectomeId).first();
  if (existing) return;

  const priceData = await getTokenPrice(signal.token_address);
  if (!priceData) return;
  const priceUsd = parseFloat(priceData.priceUsd || "0");
  if (priceUsd === 0) return;

  const liquidity = priceData.liquidity?.usd || 50000;
  const volume = priceData.volume?.h24 || 10000;
  if (liquidity < 1000) return;
  if (volume < 100) return;

  const positionSize = Math.min(balance * (params.maxPosition / 100), balance * 0.8);
  if (positionSize < 0.01) return;

  const cooldown = parseInt(env.COOLDOWN_SECONDS || "60");
  const lastTrade = await env.DB.prepare(
    "SELECT created_at FROM paper_trades WHERE token_address = ? AND connectome_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(signal.token_address, connectomeId).first();
  if (lastTrade && Math.floor(Date.now() / 1000) - lastTrade.created_at < cooldown) return;

  const { pub, wc, address } = getClients(env);

  // Check real ETH balance
  const ethBalance = await pub.getBalance({ address });
  const ethPriceUsd = parseFloat((await getTokenPrice(ADDRESSES.WETH))?.priceUsd || "0") || 2000;
  const ethToSpend = parseEther((positionSize / ethPriceUsd).toFixed(8));
  if (ethBalance < ethToSpend) return; // insufficient real ETH

  try {
    // Swap ETH → token via Uniswap V2 Router02
    const path = [ADDRESSES.WETH, getAddress(signal.token_address) as Address];
    const amounts = await pub.readContract({
      address: ADDRESSES.UNISWAP_V2_ROUTER02,
      abi: V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [ethToSpend, path],
    }) as bigint[];
    const minOut = (amounts[1] * 97n) / 100n; // 3% slippage
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    const txHash = await wc.writeContract({
      address: ADDRESSES.UNISWAP_V2_ROUTER02,
      abi: V2_ROUTER_ABI,
      functionName: "swapExactETHForTokens",
      args: [minOut, path, address, deadline],
      value: ethToSpend,
    });
    await pub.waitForTransactionReceipt({ hash: txHash });

    // Get actual tokens received
    const tokenBalance = await pub.readContract({
      address: getAddress(signal.token_address) as Address,
      abi: ABI.erc20,
      functionName: "balanceOf",
      args: [address],
    }) as bigint;

    const now = Math.floor(Date.now() / 1000);
    const newBalance = balance - positionSize - GAS_COST_USD;
    await updateConnectomeWallet(env, connectomeId, newBalance, 0, false);

    await env.DB.prepare(
      "INSERT INTO paper_trades (token_address, symbol, action, entry_price, amount_usd, signal_id, balance_after, connectome_id, created_at, tx_hash, is_real) "
      + "VALUES (?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?, 1)"
    ).bind(signal.token_address, signal.symbol, priceUsd, positionSize, signal.id, newBalance, connectomeId, now, txHash).run();

    await env.DB.prepare(
      "INSERT INTO positions (token_address, symbol, launchpad, entry_price, entry_amount, entry_tx, entry_at, status, connectome_id) "
      + "VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)"
    ).bind(signal.token_address, signal.symbol, signal.launchpad, priceUsd, positionSize, txHash, now, connectomeId).run();

    await postDiscord(env, {
      action: "REAL_BUY", symbol: signal.symbol || signal.token_address.slice(0, 8),
      reason: `[${connectomeId}] ${signal.reason || "Fly brain BUY"} | tx: https://robinhoodchain.blockscout.com/tx/${txHash}`,
      price: priceUsd, amount: positionSize, pnlPercent: 0,
      launchpad: signal.launchpad, score: signal.score, balance: newBalance,
    });
  } catch (e) {
    console.error("Real buy failed:", e);
  }
}

// Sell a token for real ETH via Uniswap V2 Router02
async function handleRealSell(env: Env, position: any, reason: string, action: string) {
  const { pub, wc, address } = getClients(env);
  const tokenAddress = getAddress(position.token_address) as Address;

  const tokenBalance = await pub.readContract({
    address: tokenAddress,
    abi: ABI.erc20,
    functionName: "balanceOf",
    args: [address],
  }) as bigint;
  if (tokenBalance === 0n) return;

  const decimals = await pub.readContract({
    address: tokenAddress,
    abi: ABI.erc20,
    functionName: "decimals",
  }) as number;

  // Approve router
  const allowance = await pub.readContract({
    address: tokenAddress,
    abi: ABI.erc20,
    functionName: "allowance",
    args: [address, ADDRESSES.UNISWAP_V2_ROUTER02],
  }) as bigint;
  if (allowance < tokenBalance) {
    const approveTx = await wc.writeContract({
      address: tokenAddress,
      abi: ABI.erc20,
      functionName: "approve",
      args: [ADDRESSES.UNISWAP_V2_ROUTER02, tokenBalance],
    });
    await pub.waitForTransactionReceipt({ hash: approveTx });
  }

  // Swap token → ETH via Uniswap V2 Router02
  const path = [tokenAddress, ADDRESSES.WETH];
  const amounts = await pub.readContract({
    address: ADDRESSES.UNISWAP_V2_ROUTER02,
    abi: V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [tokenBalance, path],
  }) as bigint[];
  const minOut = (amounts[1] * 97n) / 100n; // 3% slippage
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const ethBefore = await pub.getBalance({ address });
  const txHash = await wc.writeContract({
    address: ADDRESSES.UNISWAP_V2_ROUTER02,
    abi: V2_ROUTER_ABI,
    functionName: "swapExactTokensForETH",
    args: [tokenBalance, minOut, path, address, deadline],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  const ethAfter = await pub.getBalance({ address });
  const ethReceived = ethAfter - ethBefore - (receipt.gasUsed * receipt.effectiveGasPrice);

  const ethPriceUsd = parseFloat((await getTokenPrice(ADDRESSES.WETH))?.priceUsd || "0") || 2000;
  const exitValueUsd = Number(formatEther(ethReceived)) * ethPriceUsd;
  const entryPrice = position.entry_price || 0;
  const positionSize = position.entry_amount || 0;
  const pnlUsd = exitValueUsd - positionSize;
  const pnlPct = positionSize > 0 ? ((exitValueUsd - positionSize) / positionSize) * 100 : 0;
  const connectomeId = position.connectome_id || "malecns";
  const currentBalance = await getConnectomeBalance(env, connectomeId);
  const newBalance = currentBalance + exitValueUsd - GAS_COST_USD;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO paper_trades (token_address, symbol, action, entry_price, exit_price, amount_usd, pnl_usd, pnl_percent, balance_after, connectome_id, created_at, tx_hash, is_real) "
    + "VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
  ).bind(position.token_address, position.symbol, entryPrice, exitValueUsd / positionSize, positionSize, pnlUsd, pnlPct, newBalance, connectomeId, now, txHash).run();

  await env.DB.prepare(
    "UPDATE positions SET status = 'closed', exit_price = ?, exit_tx = ?, exit_at = ?, pnl_percent = ? WHERE id = ?"
  ).bind(exitValueUsd / positionSize, txHash, now, pnlPct, position.id).run();

  await updateConnectomeWallet(env, connectomeId, newBalance, pnlUsd, pnlUsd > 0);
  await recordTrainingData(env, position, entryPrice, exitValueUsd / positionSize, pnlPct, now);
  await maybeTriggerRetrain(env);

  // Buy FLYAI with 50% of profit
  let flyaiTxHash: string | null = null;
  let flyaiAmount = 0;
  if (pnlUsd > 0) {
    const profitPct = parseFloat(env.PROFIT_TO_FLYAI_PERCENT || "50") / 100;
    flyaiAmount = pnlUsd * profitPct;
    flyaiTxHash = await buyFlyaiWithProfit(env, flyaiAmount);
  }

  await postDiscord(env, {
    action: "REAL_SELL", symbol: position.symbol || position.token_address.slice(0, 8),
    reason: `[${connectomeId}] ${reason} | tx: https://robinhoodchain.blockscout.com/tx/${txHash}`,
    price: exitValueUsd / positionSize, amount: positionSize, pnlPercent: pnlPct,
    pnlUsd, flyaiBought: flyaiAmount, balance: newBalance,
  });
}

// Buy real FLYAI with profit via Uniswap V2 Router02 (WETH → FLYAI)
async function buyFlyaiWithProfit(env: Env, profitUsd: number): Promise<string | null> {
  if (profitUsd < 0.001) return null;
  const { pub, wc, address } = getClients(env);
  const flyaiToken = getAddress(env.FLYAI_TOKEN || ADDRESSES.WETH) as Address;

  const ethPriceUsd = parseFloat((await getTokenPrice(ADDRESSES.WETH))?.priceUsd || "0") || 2000;
  const ethToSpend = parseEther((profitUsd / ethPriceUsd).toFixed(8));

  try {
    const path = [ADDRESSES.WETH, flyaiToken];
    const amounts = await pub.readContract({
      address: ADDRESSES.UNISWAP_V2_ROUTER02,
      abi: V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [ethToSpend, path],
    }) as bigint[];
    const minOut = (amounts[1] * 95n) / 100n; // 5% slippage for FLYAI (micro-cap)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    const txHash = await wc.writeContract({
      address: ADDRESSES.UNISWAP_V2_ROUTER02,
      abi: V2_ROUTER_ABI,
      functionName: "swapExactETHForTokens",
      args: [minOut, path, address, deadline],
      value: ethToSpend,
    });
    await pub.waitForTransactionReceipt({ hash: txHash });

    // Transfer FLYAI to TreasuryValuation contract (if configured)
    if (env.TREASURY_VALUATION) {
      const flyaiReceived = await pub.readContract({
        address: flyaiToken,
        abi: ABI.erc20,
        functionName: "balanceOf",
        args: [address],
      }) as bigint;
      if (flyaiReceived > 0n) {
        const transferTx = await wc.writeContract({
          address: flyaiToken,
          abi: ABI.erc20,
          functionName: "transfer",
          args: [getAddress(env.TREASURY_VALUATION) as Address, flyaiReceived],
        });
        await pub.waitForTransactionReceipt({ hash: transferTx });
      }
    }
    return txHash;
  } catch (e) {
    console.error("FLYAI buy failed:", e);
    return null;
  }
}

// Push RFV/floor price to on-chain TreasuryValuation contract
async function pushRfvOnChain(env: Env) {
  if (!env.TREASURY_VALUATION || !env.SHIT_TOKEN) return;
  const { pub, wc } = getClients(env);
  try {
    const shitSupply = await pub.readContract({
      address: getAddress(env.SHIT_TOKEN) as Address,
      abi: ABI.erc20,
      functionName: "totalSupply",
    }) as bigint;

    const treasuryAbi = [
      { type: "function", name: "refreshValuationsFromKeeper", inputs: [{ name: "_shitSupply", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
    ] as const;

    const tx = await wc.writeContract({
      address: getAddress(env.TREASURY_VALUATION) as Address,
      abi: treasuryAbi,
      functionName: "refreshValuationsFromKeeper",
      args: [shitSupply],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
  } catch (e) {
    console.error("RFV push failed:", e);
  }
}

// === Price data ===

// Apply a small random walk jitter to simulate real-time price movement (paper trading)
const tradePriceJitterCache: Record<string, number> = {};

// Compute effective execution price after DEX fees, slippage, and gas
// side: "buy" → price goes up (you pay more), "sell" → price goes down (you receive less)
function applyTradingCosts(
  basePrice: number,
  positionSizeUsd: number,
  liquidityUsd: number,
  side: "buy" | "sell",
): { effectivePrice: number; feeUsd: number; slippageUsd: number; gasUsd: number; totalCostUsd: number } {
  // 1. DEX swap fee (0.3% of trade value)
  const feeUsd = positionSizeUsd * (DEX_FEE_PCT / 100);

  // 2. Slippage — proportional to trade size vs liquidity (constant product AMM model)
  // slippage% = (trade_size / liquidity) * 100, capped at MAX_SLIPPAGE_PCT
  const slippagePct = liquidityUsd > 0
    ? Math.min((positionSizeUsd / liquidityUsd) * 100, MAX_SLIPPAGE_PCT)
    : SLIPPAGE_BASE_PCT;
  const slippageUsd = positionSizeUsd * (slippagePct / 100);

  // 3. Gas cost (flat per swap on L2)
  const gasUsd = GAS_COST_USD;

  // 4. Effective price adjustment
  // For buys: you pay more (price + fee + slippage)
  // For sells: you receive less (price - fee - slippage)
  const costFactor = (feeUsd + slippageUsd) / positionSizeUsd;
  const effectivePrice = side === "buy"
    ? basePrice * (1 + costFactor)
    : basePrice * (1 - costFactor);

  const totalCostUsd = feeUsd + slippageUsd + gasUsd;
  return { effectivePrice, feeUsd, slippageUsd, gasUsd, totalCostUsd };
}

async function getTokenPrice(tokenAddress: string): Promise<any> {
  let basePrice = 0;
  let liquidityUsd = 0;
  let volume24h = 0;

  // Try GeckoTerminal first (more frequent updates)
  try {
    const resp = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${tokenAddress}`);
    if (resp.ok) {
      const data = await resp.json() as any;
      basePrice = parseFloat(data?.data?.attributes?.price_usd || "0");
      // GeckoTerminal returns volume in relationships
      const vol = data?.data?.attributes?.volume_usd;
      if (vol) volume24h = parseFloat(vol.h24 || "0");
    }
  } catch { /* fall through */ }

  // Fall back to DexScreener (also provides liquidity)
  if (basePrice === 0) {
    try {
      const resp = await fetch(`${DEXSCREENER_API}/tokens/${tokenAddress}`);
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const pair = data.pairs?.[0];
      basePrice = parseFloat(pair?.priceUsd || "0");
      liquidityUsd = parseFloat(pair?.liquidity?.usd || "0");
      volume24h = parseFloat(pair?.volume?.h24 || "0");
    } catch { return null; }
  } else {
    // GeckoTerminal gave us a price but not liquidity — fetch liquidity from DexScreener
    try {
      const resp = await fetch(`${DEXSCREENER_API}/tokens/${tokenAddress}`);
      if (resp.ok) {
        const data = await resp.json() as any;
        const pair = data.pairs?.[0];
        liquidityUsd = parseFloat(pair?.liquidity?.usd || "0");
        if (volume24h === 0) volume24h = parseFloat(pair?.volume?.h24 || "0");
      }
    } catch { /* ignore — use default liquidity */ }
  }

  if (basePrice === 0) return null;

  // Apply small random walk jitter (±1%) to simulate real-time price movement
  const prev = tradePriceJitterCache[tokenAddress] ?? basePrice;
  const jitter = (Math.random() - 0.5) * 0.02; // ±1%
  const jittered = basePrice * (1 + jitter);
  const clamped = Math.max(basePrice * 0.97, Math.min(basePrice * 1.03, jittered));
  tradePriceJitterCache[tokenAddress] = clamped;
  return {
    priceUsd: String(clamped),
    liquidity: { usd: liquidityUsd || 10000 },
    volume: { h24: volume24h },
  };
}

// === FLYAI treasury ===

async function updateFlyaiBalance(env: Env, isReal: boolean = false) {
  const flyaiToken = env.FLYAI_TOKEN || "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
  const priceData = await getTokenPrice(flyaiToken);
  const priceUsd = priceData?.priceUsd || 0;

  let balance: number;
  if (isReal && env.TREASURY_VALUATION && env.ROBINHOOD_RPC_URL) {
    // Read real on-chain FLYAI balance from TreasuryValuation contract
    try {
      const { pub } = getClients(env);
      const flyaiBalance = await pub.readContract({
        address: getAddress(flyaiToken) as Address,
        abi: ABI.erc20,
        functionName: "balanceOf",
        args: [getAddress(env.TREASURY_VALUATION) as Address],
      }) as bigint;
      balance = Number(formatEther(flyaiBalance));
    } catch { balance = 0; }
  } else {
    // Paper mode: compute from P&L
    const flyaiTotal = await env.DB.prepare(
      "SELECT SUM(pnl_usd * 0.5) as total FROM paper_trades WHERE pnl_usd > 0 AND action = 'SELL'"
    ).first();
    balance = flyaiTotal?.total || 0;
  }

  const totalRfv = balance * priceUsd * 0.5;
  const floorPrice = totalRfv / 100_000_000;

  await env.DB.prepare(
    "INSERT INTO flyai_treasury (balance, price_usd, total_rfv, shit_floor_price, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(balance, priceUsd, totalRfv, floorPrice, Math.floor(Date.now() / 1000)).run();
}

// === Discord ===

async function postDiscord(env: Env, decision: {
  action: string; symbol: string; reason: string;
  price: number; amount: number; pnlPercent: number;
  pnlUsd?: number; flyaiBought?: number; balance?: number;
  launchpad?: string; score?: number;
}) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  const fields: any[] = [
    { name: "Price", value: `$${decision.price.toFixed(8)}`, inline: true },
    { name: "Amount", value: `$${decision.amount.toFixed(4)}`, inline: true },
    { name: "Reason", value: decision.reason, inline: false },
  ];

  if (decision.pnlPercent !== 0) {
    fields.push({ name: "PnL", value: `${decision.pnlPercent.toFixed(2)}% (${decision.pnlUsd ? '$' + decision.pnlUsd.toFixed(4) : ''})`, inline: true });
  }
  if (decision.balance !== undefined) {
    fields.push({ name: "Paper Balance", value: `$${decision.balance.toFixed(4)}`, inline: true });
  }
  if (decision.flyaiBought) {
    fields.push({ name: "FLYAI +", value: `$${decision.flyaiBought.toFixed(4)}`, inline: true });
  }
  if (decision.launchpad) {
    fields.push({ name: "Launchpad", value: decision.launchpad, inline: true });
  }
  if (decision.score) {
    fields.push({ name: "Score", value: String(decision.score), inline: true });
  }

  const body = {
    username: "SHIT Paper Trader",
    embeds: [{
      title: `${decision.action} ${decision.symbol}`,
      color: COLORS[decision.action] || 0x808080,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: `Target: $${TARGET_BALANCE} | Starting: $${STARTING_BALANCE}` },
    }],
  };

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Discord post failed:", e);
  }
}
