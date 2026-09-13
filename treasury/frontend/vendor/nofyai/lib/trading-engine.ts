import { AsterTrader, Position, Balance } from './aster';
import {
  getFullDecision,
  buildSystemPrompt,
  Decision,
  TradingContext,
  PositionInfo,
  AccountInfo,
  AIConfig,
  FullDecision,
  MarketData as AIMarketData,
} from './ai';
import { getMarketDataBatch, getMarketData, DEFAULT_SYMBOLS } from './market-data';
import { DecisionLogger } from './decision-logger';
import { TelegramNotifier, TelegramConfig } from './telegram-notifier';

// ========================================
// Trading Engine State
// ========================================

export interface TradingEngineConfig {
  aster: {
    user: string;
    signer: string;
    privateKey: string;
  };
  ai: AIConfig;
  initialBalance: number;
  btcEthLeverage: number;
  altcoinLeverage: number;
  scanIntervalMinutes: number;
  promptTemplate?: string; // 提示词模板名称 (adaptive/default/nof1/taro)
  traderId?: string; // Optional trader ID for logs
  traderName?: string; // Optional trader name for notifications
  telegram?: TelegramConfig; // Optional Telegram notification config
  candidateCoins?: string[]; // Optional candidate coins from config
}

export interface TradingSession {
  isRunning: boolean;
  startTime: Date | null;
  callCount: number;
  lastDecision: FullDecision | null;
  positionFirstSeenTime: Record<string, number>; // symbol_side -> timestamp
}

// ========================================
// Trading Engine
// ========================================

export class TradingEngine {
  private trader: AsterTrader;
  private aiConfig: AIConfig;
  private config: TradingEngineConfig;
  private session: TradingSession;
  private intervalId: NodeJS.Timeout | null = null;
  private logger: DecisionLogger;
  private traderId: string;
  private traderName: string;
  private telegram: TelegramNotifier | null = null;

  constructor(config: TradingEngineConfig) {
    this.config = config;
    this.traderId = config.traderId || `trader_${Date.now()}`;
    this.traderName = config.traderName || this.traderId;

    this.trader = new AsterTrader({
      user: config.aster.user,
      signer: config.aster.signer,
      privateKey: config.aster.privateKey,
    });
    this.aiConfig = config.ai;
    this.logger = new DecisionLogger(this.traderId);

    // Initialize Telegram notifier if configured
    if (config.telegram && config.telegram.enabled) {
      this.telegram = new TelegramNotifier(config.telegram);
      console.log('📱 Telegram notifications enabled');
    }

    this.session = {
      isRunning: false,
      startTime: null,
      callCount: 0,
      lastDecision: null,
      positionFirstSeenTime: {},
    };
  }

  // ========================================
  // Session Control
  // ========================================

  start(): void {
    if (this.session.isRunning) {
      throw new Error('Trading engine is already running');
    }

    this.session.isRunning = true;
    this.session.startTime = new Date();
    this.session.callCount = 0;

    console.log('🚀 Trading engine started');
    console.log(`📊 Trader ID: ${this.traderId}`);

    // Initialize cycle number from existing logs
    this.logger.initializeCycleNumber().then(() => {
      // 🎯 Sync restored cycle number to session for correct display
      this.session.callCount = this.logger.getCycleNumber();
      console.log(`📊 Restored session call count to ${this.session.callCount} from existing logs`);

      // Run immediately, then on interval
      this.runCycle().catch(err => {
        console.error('Error in trading cycle:', err);
      });

      this.intervalId = setInterval(() => {
        this.runCycle().catch(err => {
          console.error('Error in trading cycle:', err);
        });
      }, this.config.scanIntervalMinutes * 60 * 1000);
    });
  }

  stop(): void {
    if (!this.session.isRunning) {
      throw new Error('Trading engine is not running');
    }

    this.session.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('🛑 Trading engine stopped');
  }

  getSession(): TradingSession {
    return { ...this.session };
  }

  getDecisionLogger(): DecisionLogger {
    return this.logger;
  }

  // ========================================
  // Core Trading Cycle
  // ========================================

  private async runCycle(): Promise<void> {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 Trading Cycle #${this.session.callCount + 1}`);
      console.log(`${'='.repeat(60)}\n`);

      this.session.callCount++;

      // 1. Build trading context
      const ctx = await this.buildTradingContext();

      // 2. Get AI decision
      console.log('🤖 Calling AI for decision...');
      const fullDecision = await getFullDecision(ctx, this.aiConfig);
      this.session.lastDecision = fullDecision;

      console.log('\n📝 Chain of Thought:');
      console.log(fullDecision.cot_trace);
      console.log('\n📋 Decisions:', JSON.stringify(fullDecision.decisions, null, 2));

      // 3. Execute decisions and collect results
      const executionResults = await this.executeDecisions(fullDecision.decisions, ctx);

      // 4. Build system prompt for logging
      const systemPrompt = buildSystemPrompt(
        ctx.account.total_equity,
        ctx.btc_eth_leverage,
        ctx.altcoin_leverage,
        ctx.prompt_template || 'adaptive'
      );

      // 5. Save decision log with system prompt
      await this.logger.saveDecision(fullDecision, ctx, executionResults, systemPrompt);

      console.log(`\n✅ Cycle #${this.session.callCount} completed\n`);
    } catch (error) {
      console.error('❌ Error in trading cycle:', error);

      // Send error notification via Telegram
      if (this.telegram) {
        await this.telegram.notifyError(
          this.traderId,
          this.traderName,
          error instanceof Error ? error.message : String(error),
          'Trading Cycle'
        );
      }

      // Continue running even on error
    }
  }

  // ========================================
  // Build Trading Context
  // ========================================

  private async buildTradingContext(): Promise<TradingContext> {
    // Get account balance
    const balance = await this.trader.getBalance();

    // Get positions
    const positions = await this.trader.getPositions();

    // Track position first seen time
    const now = Date.now();
    positions.forEach(pos => {
      const key = `${pos.symbol}_${pos.side}`;
      if (!this.session.positionFirstSeenTime[key]) {
        this.session.positionFirstSeenTime[key] = now;
      }
    });

    // Convert to trading context format
    const positionInfos: PositionInfo[] = positions.map(pos => {
      const key = `${pos.symbol}_${pos.side}`;
      const firstSeenTime = this.session.positionFirstSeenTime[key] || now;
      const unrealizedPnlPct =
        pos.entryPrice > 0
          ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'short' ? -1 : 1)
          : 0;

      return {
        symbol: pos.symbol,
        side: pos.side,
        entry_price: pos.entryPrice,
        mark_price: pos.markPrice,
        quantity: pos.positionAmt,
        leverage: pos.leverage,
        unrealized_pnl: pos.unRealizedProfit,
        unrealized_pnl_pct: unrealizedPnlPct,
        liquidation_price: pos.liquidationPrice,
        margin_used: pos.markPrice * pos.positionAmt / pos.leverage,
        update_time: firstSeenTime,
      };
    });

    // Calculate account info
    const totalPnl = balance.totalUnrealizedProfit;
    const totalPnlPct = ((balance.totalWalletBalance - this.config.initialBalance) / this.config.initialBalance) * 100;
    const marginUsed = positionInfos.reduce((sum, pos) => sum + pos.margin_used, 0);
    const marginUsedPct = (marginUsed / balance.totalWalletBalance) * 100;

    const accountInfo: AccountInfo = {
      total_equity: balance.totalWalletBalance,
      available_balance: balance.availableBalance,
      total_pnl: totalPnl,
      total_pnl_pct: totalPnlPct,
      total_unrealized_pnl: balance.totalUnrealizedProfit,
      margin_used: marginUsed,
      margin_used_pct: marginUsedPct,
      position_count: positions.length,
      initial_balance: this.config.initialBalance,
      daily_pnl: 0, // TODO: Calculate daily PnL from decision logs
    };

    // Get runtime
    const runtimeMinutes = this.session.startTime
      ? Math.floor((Date.now() - this.session.startTime.getTime()) / (1000 * 60))
      : 0;

    // Get performance metrics (历史表现数据)
    console.log('📊 Analyzing performance metrics...');
    const performanceAnalysis = await this.logger.analyzePerformance(100); // 分析最近100笔交易
    const performance = {
      total_trades: performanceAnalysis.total_trades,
      winning_trades: performanceAnalysis.winning_trades,
      losing_trades: performanceAnalysis.losing_trades,
      win_rate: performanceAnalysis.win_rate,
      avg_profit: performanceAnalysis.avg_profit,
      avg_loss: performanceAnalysis.avg_loss,
      profit_factor: performanceAnalysis.profit_factor,
      sharpe_ratio: performanceAnalysis.sharpe_ratio,
      max_drawdown: performanceAnalysis.max_drawdown,
      avg_holding_time_minutes: performanceAnalysis.avg_holding_time_minutes,
    };
    console.log(`✅ Performance: ${performanceAnalysis.total_trades} trades, Sharpe ${performanceAnalysis.sharpe_ratio.toFixed(2)}, Win Rate ${performanceAnalysis.win_rate.toFixed(1)}%`);

    // Build market data from Binance API
    const marketDataMap: Record<string, AIMarketData> = {};

    // Collect symbols to fetch
    const symbolsToFetch = new Set<string>();

    // Always fetch BTC
    symbolsToFetch.add('BTCUSDT');

    // Add symbols from existing positions
    positionInfos.forEach(pos => symbolsToFetch.add(pos.symbol));

    // Add candidate symbols from config (or default list)
    const candidateCoins = this.config.candidateCoins || DEFAULT_SYMBOLS;
    candidateCoins.forEach(s => symbolsToFetch.add(s));

    console.log(`📊 Fetching market data for ${symbolsToFetch.size} symbols (candidates: ${candidateCoins.join(', ')})...`);

    try {
      const binanceData = await getMarketDataBatch(Array.from(symbolsToFetch));

      // Convert Binance market data to AI market data format
      for (const [symbol, data] of Object.entries(binanceData)) {
        marketDataMap[symbol] = {
          symbol: data.symbol,
          current_price: data.current_price,

          // Multi-timeframe price changes
          price_change_15m: data.price_change_15m,
          price_change_1h: data.price_change_1h,
          price_change_4h: data.price_change_4h,

          // Multi-timeframe MACD
          macd_15m: data.macd_15m,
          macd_1h: data.macd_1h,
          macd_4h: data.macd_4h,
          macd_1d: data.macd_1d,
          current_macd: data.current_macd, // Legacy field

          // Multi-timeframe RSI
          rsi_15m: data.rsi_15m,
          rsi_1h: data.rsi_1h,
          rsi_4h: data.rsi_4h,
          rsi_1d: data.rsi_1d,
          current_rsi7: data.current_rsi7,   // Legacy field
          current_rsi14: data.current_rsi14, // Legacy field

          // EMA
          ema20: data.ema20,

          // Volume
          volume_24h: data.volume_24h,
          volume_avg_24h: data.volume_avg_24h,

          // Open Interest
          oi_value: data.oi_value,
          oi_change_pct: data.oi_change_pct,

          // Market sentiment
          buy_sell_ratio: data.buy_sell_ratio,
          funding_rate: data.funding_rate,

          // OHLC
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,

          // Volatility
          atr: data.atr,

          // Time series data (15m timeframe, last 10 points)
          price_series_15m: data.price_series_15m,
          macd_series_15m: data.macd_series_15m,
          rsi_series_15m: data.rsi_series_15m,
          volume_series_15m: data.volume_series_15m,
          ema20_series_15m: data.ema20_series_15m,
          ema50_series_15m: data.ema50_series_15m,
        };
      }

      console.log(`✓ Successfully fetched ${Object.keys(marketDataMap).length} symbols`);
    } catch (error) {
      console.error('❌ Failed to fetch market data:', error);
      // Fallback to minimal BTC data if fetch fails
      marketDataMap['BTCUSDT'] = {
        symbol: 'BTCUSDT',
        current_price: 95000,

        // Price changes
        price_change_15m: 0,
        price_change_1h: 0,
        price_change_4h: 0,

        // Multi-timeframe MACD
        macd_15m: 0,
        macd_1h: 0,
        macd_4h: 0,
        macd_1d: 0,
        current_macd: 0,

        // Multi-timeframe RSI
        rsi_15m: 50,
        rsi_1h: 50,
        rsi_4h: 50,
        rsi_1d: 50,
        current_rsi7: 50,
        current_rsi14: 50,

        // EMA
        ema20: 95000,

        // Volume
        volume_24h: 0,
        volume_avg_24h: 0,

        // Open Interest
        oi_value: 0,
        oi_change_pct: 0,

        // Market sentiment
        buy_sell_ratio: undefined,
        funding_rate: 0,

        // OHLC
        open: 95000,
        high: 95000,
        low: 95000,
        close: 95000,

        // Volatility
        atr: 0,
      };
    }

    return {
      current_time: new Date().toISOString(),
      runtime_minutes: runtimeMinutes,
      call_count: this.session.callCount,
      account: accountInfo,
      positions: positionInfos,
      market_data_map: marketDataMap,
      sharpe_ratio: performance.sharpe_ratio, // 向后兼容
      btc_eth_leverage: this.config.btcEthLeverage,
      altcoin_leverage: this.config.altcoinLeverage,
      prompt_template: this.config.promptTemplate, // 传递提示词模板配置
      performance: performance, // 完整的性能指标
    };
  }

  // ========================================
  // Execute Decisions
  // ========================================

  private async executeDecisions(
    decisions: Decision[],
    ctx: TradingContext
  ): Promise<Array<{ symbol: string; action: string; success: boolean; error?: string }>> {
    // Sort decisions by priority: close > open > hold/wait
    const sorted = [...decisions].sort((a, b) => {
      const priorityMap: Record<string, number> = {
        close_long: 1,
        close_short: 1,
        open_long: 2,
        open_short: 2,
        hold: 3,
        wait: 3,
      };
      return (priorityMap[a.action] || 999) - (priorityMap[b.action] || 999);
    });

    console.log('\n📦 Executing decisions in priority order...\n');

    const executionResults: Array<{ symbol: string; action: string; success: boolean; error?: string }> = [];

    for (const decision of sorted) {
      try {
        const result = await this.executeDecision(decision, ctx);
        executionResults.push({
          symbol: decision.symbol,
          action: decision.action,
          success: true,
        });

        // Send Telegram notification for successful trade
        if (this.telegram && result) {
          await this.telegram.notifyTrade({
            trader_id: this.traderId,
            trader_name: this.traderName,
            symbol: decision.symbol,
            action: decision.action,
            side: result.side,
            entry_price: result.entry_price,
            quantity: result.quantity,
            leverage: result.leverage,
            pnl: result.pnl,
            pnl_pct: result.pnl_pct,
            success: true,
          });
        }
      } catch (error) {
        console.error(`❌ Failed to execute decision for ${decision.symbol}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        executionResults.push({
          symbol: decision.symbol,
          action: decision.action,
          success: false,
          error: errorMessage,
        });

        // Send Telegram notification for failed trade
        if (this.telegram) {
          await this.telegram.notifyTrade({
            trader_id: this.traderId,
            trader_name: this.traderName,
            symbol: decision.symbol,
            action: decision.action,
            success: false,
            error: errorMessage,
          });
        }

        // Continue with other decisions
      }
    }

    return executionResults;
  }

  private async executeDecision(
    decision: Decision,
    ctx: TradingContext
  ): Promise<{
    side?: string;
    entry_price?: number;
    quantity?: number;
    leverage?: number;
    pnl?: number;
    pnl_pct?: number;
  } | null> {
    const { symbol, action } = decision;

    console.log(`\n🎯 Executing: ${action} ${symbol}`);
    console.log(`   Reasoning: ${decision.reasoning}`);

    switch (action) {
      case 'open_long': {
        // Check if position already exists
        const existingPos = ctx.positions.find(p => p.symbol === symbol && p.side === 'long');
        if (existingPos) {
          console.log(`⚠️  Long position already exists for ${symbol}, skipping`);
          return null;
        }

        // Calculate quantity from position size USD
        const price = await this.trader.getMarketPrice(symbol);
        const quantity = decision.position_size_usd! / price;

        console.log(`   Opening long: ${quantity.toFixed(4)} @ ${price.toFixed(2)}`);
        await this.trader.openLong(symbol, quantity, decision.leverage!);

        // Set stop loss and take profit
        await this.trader.setStopLoss(symbol, 'LONG', quantity, decision.stop_loss!);
        await this.trader.setTakeProfit(symbol, 'LONG', quantity, decision.take_profit!);

        console.log(`✅ Long position opened for ${symbol}`);
        return {
          side: 'LONG',
          entry_price: price,
          quantity: quantity,
          leverage: decision.leverage!,
        };
      }

      case 'open_short': {
        const existingPos = ctx.positions.find(p => p.symbol === symbol && p.side === 'short');
        if (existingPos) {
          console.log(`⚠️  Short position already exists for ${symbol}, skipping`);
          return null;
        }

        const price = await this.trader.getMarketPrice(symbol);
        const quantity = decision.position_size_usd! / price;

        console.log(`   Opening short: ${quantity.toFixed(4)} @ ${price.toFixed(2)}`);
        await this.trader.openShort(symbol, quantity, decision.leverage!);

        await this.trader.setStopLoss(symbol, 'SHORT', quantity, decision.stop_loss!);
        await this.trader.setTakeProfit(symbol, 'SHORT', quantity, decision.take_profit!);

        console.log(`✅ Short position opened for ${symbol}`);
        return {
          side: 'SHORT',
          entry_price: price,
          quantity: quantity,
          leverage: decision.leverage!,
        };
      }

      case 'close_long': {
        const pos = ctx.positions.find(p => p.symbol === symbol && p.side === 'long');
        if (!pos) {
          console.log(`⚠️  No long position found for ${symbol}, skipping`);
          return null;
        }

        console.log(`   Closing long: ${pos.quantity.toFixed(4)}`);
        await this.trader.closeLong(symbol, pos.quantity);

        // Remove from position tracking
        delete this.session.positionFirstSeenTime[`${symbol}_long`];

        console.log(`✅ Long position closed for ${symbol}`);
        return {
          side: 'LONG',
          pnl: pos.unrealized_pnl,
          pnl_pct: pos.unrealized_pnl_pct,
        };
      }

      case 'close_short': {
        const pos = ctx.positions.find(p => p.symbol === symbol && p.side === 'short');
        if (!pos) {
          console.log(`⚠️  No short position found for ${symbol}, skipping`);
          return null;
        }

        console.log(`   Closing short: ${pos.quantity.toFixed(4)}`);
        await this.trader.closeShort(symbol, pos.quantity);

        // Remove from position tracking
        delete this.session.positionFirstSeenTime[`${symbol}_short`];

        console.log(`✅ Short position closed for ${symbol}`);
        return {
          side: 'SHORT',
          pnl: pos.unrealized_pnl,
          pnl_pct: pos.unrealized_pnl_pct,
        };
      }

      case 'hold':
        console.log(`⏸️  Holding position for ${symbol}`);
        return null;

      case 'wait':
        console.log(`⏳ Waiting for opportunity on ${symbol}`);
        return null;

      default:
        console.log(`⚠️  Unknown action: ${action}`);
        return null;
    }
  }

  // ========================================
  // Manual Decision (for testing)
  // ========================================

  async getDecision(): Promise<FullDecision> {
    const ctx = await this.buildTradingContext();
    return await getFullDecision(ctx, this.aiConfig);
  }

  async executeManualDecision(decision: Decision): Promise<void> {
    const ctx = await this.buildTradingContext();
    await this.executeDecision(decision, ctx);
  }

  // ========================================
  // Data Access Methods for API Endpoints
  // ========================================

  /**
   * Get current account info
   */
  async getCurrentAccount(): Promise<AccountInfo> {
    const balance = await this.trader.getBalance();
    const positions = await this.trader.getPositions();

    // Calculate total PnL: current equity - initial balance (includes both realized and unrealized)
    const totalPnl = balance.totalWalletBalance - this.config.initialBalance;
    const totalPnlPct = (totalPnl / this.config.initialBalance) * 100;

    const marginUsed = positions.reduce(
      (sum, pos) => sum + (pos.markPrice * pos.positionAmt) / pos.leverage,
      0
    );
    const marginUsedPct = (marginUsed / balance.totalWalletBalance) * 100;

    return {
      total_equity: balance.totalWalletBalance,
      available_balance: balance.availableBalance,
      total_pnl: totalPnl,
      total_pnl_pct: totalPnlPct,
      total_unrealized_pnl: balance.totalUnrealizedProfit,
      margin_used: marginUsed,
      margin_used_pct: marginUsedPct,
      position_count: positions.length,
      initial_balance: this.config.initialBalance,
      daily_pnl: 0, // TODO: Calculate daily PnL from decision logs
    };
  }

  /**
   * Get current positions
   */
  async getCurrentPositions(): Promise<PositionInfo[]> {
    const positions = await this.trader.getPositions();
    const now = Date.now();

    return positions.map(pos => {
      const key = `${pos.symbol}_${pos.side}`;
      const firstSeenTime = this.session.positionFirstSeenTime[key] || now;
      const unrealizedPnlPct =
        pos.entryPrice > 0
          ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) *
            100 *
            (pos.side === 'short' ? -1 : 1)
          : 0;

      return {
        symbol: pos.symbol,
        side: pos.side,
        entry_price: pos.entryPrice,
        mark_price: pos.markPrice,
        quantity: pos.positionAmt,
        leverage: pos.leverage,
        unrealized_pnl: pos.unRealizedProfit,
        unrealized_pnl_pct: unrealizedPnlPct,
        liquidation_price: pos.liquidationPrice,
        margin_used: (pos.markPrice * pos.positionAmt) / pos.leverage,
        update_time: firstSeenTime,
      };
    });
  }

  /**
   * Get equity history from decision logs
   */
  async getEquityHistory(): Promise<Array<{
    timestamp: string;
    total_equity: number;
    available_balance: number;
    total_pnl: number;
    total_pnl_pct: number;
    position_count: number;
    margin_used_pct: number;
    cycle_number: number;
  }>> {
    const decisions = await this.logger.getRecentDecisions(1000);

    // If no history, return initial point
    if (decisions.length === 0) {
      const now = new Date().toISOString();
      return [{
        timestamp: now,
        total_equity: this.config.initialBalance,
        available_balance: this.config.initialBalance,
        total_pnl: 0,
        total_pnl_pct: 0,
        position_count: 0,
        margin_used_pct: 0,
        cycle_number: 0,
      }];
    }

    return decisions.map(decision => ({
      timestamp: decision.timestamp,
      total_equity: decision.account_snapshot.total_equity,
      available_balance: decision.account_snapshot.available_balance,
      total_pnl: decision.account_snapshot.total_pnl,
      total_pnl_pct: decision.account_snapshot.total_pnl_pct,
      position_count: decision.account_snapshot.position_count,
      margin_used_pct: decision.account_snapshot.margin_used_pct,
      cycle_number: decision.cycle_number,
    }));
  }

  /**
   * Get performance metrics from decision logs
   */
  async getPerformanceMetrics(recentCount: number = 100): Promise<any> {
    return await this.logger.analyzePerformance(recentCount);
  }

  /**
   * Get latest decisions from decision logs
   */
  async getLatestDecisions(limit: number = 5): Promise<any[]> {
    return await this.logger.getRecentDecisions(limit);
  }

  /**
   * Get trader info
   */
  getTraderInfo() {
    return {
      trader_id: this.traderId,
      ai_model: this.aiConfig.model,
      initial_balance: this.config.initialBalance,
    };
  }

  /**
   * Get config for status reporting
   */
  getConfig() {
    return {
      initialBalance: this.config.initialBalance,
      scanIntervalMinutes: this.config.scanIntervalMinutes,
    };
  }

  /**
   * Manually close a position
   */
  async closePosition(symbol: string, side: string): Promise<void> {
    try {
      console.log(`🔴 Manual close requested: ${side} ${symbol}`);

      // Get current positions to validate
      const positions = await this.trader.getPositions();
      const pos = positions.find(p => p.symbol === symbol && p.side === side);

      if (!pos) {
        throw new Error(`No ${side} position found for ${symbol}`);
      }

      // Execute close
      if (side === 'long') {
        await this.trader.closeLong(symbol, pos.positionAmt);
        delete this.session.positionFirstSeenTime[`${symbol}_long`];
      } else if (side === 'short') {
        await this.trader.closeShort(symbol, pos.positionAmt);
        delete this.session.positionFirstSeenTime[`${symbol}_short`];
      } else {
        throw new Error(`Invalid side: ${side}`);
      }

      console.log(`✅ Position closed manually: ${side} ${symbol}`);

      // Send Telegram notification
      if (this.telegram) {
        await this.telegram.notifyTrade({
          trader_id: this.traderId,
          trader_name: this.traderName,
          symbol: symbol,
          action: `close_${side}`,
          side: side.toUpperCase(),
          pnl: pos.unRealizedProfit,
          pnl_pct: ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (side === 'short' ? -1 : 1),
          success: true,
        });
      }
    } catch (error) {
      console.error(`❌ Failed to close position: ${error}`);

      // Send error notification
      if (this.telegram) {
        await this.telegram.notifyError(
          this.traderId,
          this.traderName,
          error instanceof Error ? error.message : String(error),
          `Manual Close: ${side} ${symbol}`
        );
      }

      throw error;
    }
  }

  /**
   * Close all positions (emergency stop)
   */
  async closeAllPositions(): Promise<void> {
    try {
      console.log('🚨 Emergency close all positions requested');

      const positions = await this.trader.getPositions();

      if (positions.length === 0) {
        console.log('No positions to close');
        return;
      }

      console.log(`Closing ${positions.length} positions...`);

      for (const pos of positions) {
        try {
          if (pos.side === 'long') {
            await this.trader.closeLong(pos.symbol, pos.positionAmt);
            delete this.session.positionFirstSeenTime[`${pos.symbol}_long`];
          } else {
            await this.trader.closeShort(pos.symbol, pos.positionAmt);
            delete this.session.positionFirstSeenTime[`${pos.symbol}_short`];
          }

          console.log(`✅ Closed ${pos.side} ${pos.symbol}`);

          // Send notification for each closed position
          if (this.telegram) {
            await this.telegram.notifyTrade({
              trader_id: this.traderId,
              trader_name: this.traderName,
              symbol: pos.symbol,
              action: `close_${pos.side}`,
              side: pos.side.toUpperCase(),
              pnl: pos.unRealizedProfit,
              pnl_pct: ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'short' ? -1 : 1),
              success: true,
            });
          }
        } catch (error) {
          console.error(`Failed to close ${pos.side} ${pos.symbol}:`, error);
        }
      }

      console.log('✅ All positions closed');

      // Send summary notification
      if (this.telegram) {
        await this.telegram.sendCustomMessage(
          `🚨 *EMERGENCY STOP*\n\nAll ${positions.length} positions have been closed for trader: ${this.traderName}\n\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
        );
      }
    } catch (error) {
      console.error('❌ Failed to close all positions:', error);

      if (this.telegram) {
        await this.telegram.notifyError(
          this.traderId,
          this.traderName,
          error instanceof Error ? error.message : String(error),
          'Emergency Close All'
        );
      }

      throw error;
    }
  }
}
