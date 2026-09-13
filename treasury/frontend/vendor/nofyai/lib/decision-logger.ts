import fs from 'fs/promises';
import path from 'path';
import { FullDecision, Decision, TradingContext } from './ai';
import { ClosedPosition } from '@/types';

// ========================================
// Types
// ========================================

export interface DecisionRecord {
  timestamp: string;
  cycle_number: number;
  trader_id: string;
  success: boolean; // Overall success of this decision cycle

  // AI Decision
  cot_trace: string;
  decisions: Decision[];

  // Account State (snapshot before execution)
  account_snapshot: {
    total_equity: number;
    available_balance: number;
    total_pnl: number;
    total_pnl_pct: number;
    margin_used: number;
    margin_used_pct: number;
    position_count: number;
    initial_balance: number; // Added for Sharpe Ratio calculation
  };

  // Positions (snapshot before execution)
  positions_snapshot: Array<{
    symbol: string;
    side: string;
    entry_price: number;
    mark_price: number;
    quantity: number;
    leverage: number;
    unrealized_pnl: number;
    unrealized_pnl_pct: number;
  }>;

  // Execution Results
  execution_results: Array<{
    symbol: string;
    action: string;
    success: boolean;
    error?: string;
  }>;

  // Input Prompt (optional - the full prompt sent to AI)
  input_prompt?: string;

  // System Prompt (optional - the system prompt used for AI)
  system_prompt?: string;

  // Performance Metrics (optional)
  performance?: {
    runtime_minutes: number;
    total_cycles: number;
  };
}

// ========================================
// Decision Logger
// ========================================

export class DecisionLogger {
  private traderId: string;
  private logDir: string;
  private cycleNumber: number = 0;
  private closedPositionsFile: string; // Path to closed_positions.json

  constructor(traderId: string, baseDir: string = './decision_logs') {
    this.traderId = traderId;
    this.logDir = path.join(baseDir, traderId);
    this.closedPositionsFile = path.join(this.logDir, 'closed_positions.json');
    this.ensureLogDirectory();
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create log directory ${this.logDir}:`, error);
    }
  }

  /**
   * Save decision record to JSON file
   */
  async saveDecision(
    fullDecision: FullDecision,
    context: TradingContext,
    executionResults: Array<{ symbol: string; action: string; success: boolean; error?: string }>,
    systemPrompt?: string // 添加系统提示词参数
  ): Promise<string | null> {
    try {
      this.cycleNumber++;

      const timestamp = new Date().toISOString();
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const timeStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('Z')[0];

      const filename = `decision_${dateStr}_${timeStr}_cycle${this.cycleNumber}.json`;
      const filepath = path.join(this.logDir, filename);

      // Calculate overall success: true if all execution results succeeded
      const overallSuccess = executionResults.length === 0 || executionResults.every(result => result.success);

      const record: DecisionRecord = {
        timestamp,
        cycle_number: this.cycleNumber,
        trader_id: this.traderId,
        success: overallSuccess,
        cot_trace: fullDecision.cot_trace,
        decisions: fullDecision.decisions,
        account_snapshot: context.account,
        positions_snapshot: context.positions.map(pos => ({
          symbol: pos.symbol,
          side: pos.side,
          entry_price: pos.entry_price,
          mark_price: pos.mark_price,
          quantity: pos.quantity,
          leverage: pos.leverage,
          unrealized_pnl: pos.unrealized_pnl,
          unrealized_pnl_pct: pos.unrealized_pnl_pct,
        })),
        execution_results: executionResults,
        input_prompt: fullDecision.user_prompt, // Save the full prompt sent to AI
        system_prompt: systemPrompt, // 保存系统提示词
        performance: {
          runtime_minutes: context.runtime_minutes,
          total_cycles: context.call_count,
        },
      };

      await fs.writeFile(filepath, JSON.stringify(record, null, 2), 'utf-8');

      console.log(`✅ Decision log saved: ${filename}`);

      // ✅ NEW: Auto-save closed positions to separate file
      await this.saveClosedPositionsFromDecision(record);

      return filepath;
    } catch (error) {
      console.error('❌ Failed to save decision log:', error);
      return null;
    }
  }

  /**
   * Extract and save closed positions from a decision record
   * Called automatically by saveDecision()
   */
  private async saveClosedPositionsFromDecision(decision: DecisionRecord): Promise<void> {
    try {
      // Find all close actions in this decision
      const closeActions = decision.decisions.filter(
        d => d.action === 'close_long' || d.action === 'close_short'
      );

      if (closeActions.length === 0) {
        return; // No positions closed
      }

      // Load recent decisions to find open times
      const recentDecisions = await this.getRecentDecisions(200);
      const sortedDecisions = [...recentDecisions].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const closeAction of closeActions) {
        const side = closeAction.action === 'close_long' ? 'long' : 'short';
        const symbol = closeAction.symbol;

        // Find position in snapshot
        const position = decision.positions_snapshot.find(
          p => p.symbol === symbol && p.side === side
        );

        if (!position) {
          console.warn(`[DecisionLogger] Position not found for ${symbol} ${side}`);
          continue;
        }

        // Find open time by looking backwards
        let openTime: string | null = null;

        for (let i = 0; i < sortedDecisions.length; i++) {
          const d = sortedDecisions[i];

          if (d.cycle_number >= decision.cycle_number) break;

          const currentPos = d.positions_snapshot.find(
            p => p.symbol === symbol && p.side === side
          );

          const prevPos = i > 0
            ? sortedDecisions[i - 1].positions_snapshot.find(
                p => p.symbol === symbol && p.side === side
              )
            : null;

          // Position appeared for the first time
          if (currentPos && !prevPos) {
            openTime = d.timestamp;
            break;
          }
        }

        // Fallback: look for open action
        if (!openTime) {
          for (const d of sortedDecisions) {
            if (d.cycle_number >= decision.cycle_number) break;

            for (const action of d.decisions) {
              const actionSide = action.action.includes('long') ? 'long' : action.action.includes('short') ? 'short' : null;
              if ((action.action === 'open_long' || action.action === 'open_short') &&
                  action.symbol === symbol && actionSide === side) {
                openTime = d.timestamp;
                break;
              }
            }
            if (openTime) break;
          }
        }

        if (!openTime) {
          console.warn(`[DecisionLogger] Could not find open time for ${symbol} ${side}`);
          continue;
        }

        // Save closed position
        await this.saveClosedPosition(decision, closeAction, position, openTime);
      }
    } catch (error) {
      console.error('Failed to save closed positions from decision:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get recent decision records (sorted by timestamp, newest first)
   */
  async getRecentDecisions(limit: number = 100): Promise<DecisionRecord[]> {
    try {
      const files = await fs.readdir(this.logDir);

      // Filter decision files and sort by name (which contains timestamp)
      const decisionFiles = files
        .filter(f => f.startsWith('decision_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const records: DecisionRecord[] = [];

      for (const file of decisionFiles) {
        try {
          const filepath = path.join(this.logDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const record = JSON.parse(content) as DecisionRecord;
          records.push(record);
        } catch (error) {
          console.error(`Failed to read decision file ${file}:`, error);
        }
      }

      return records;
    } catch (error) {
      console.error('Failed to get recent decisions:', error);
      return [];
    }
  }

  /**
   * Get decision by cycle number
   */
  async getDecisionByCycle(cycleNumber: number): Promise<DecisionRecord | null> {
    try {
      const files = await fs.readdir(this.logDir);
      const targetFile = files.find(f =>
        f.startsWith('decision_') &&
        f.includes(`cycle${cycleNumber}.json`)
      );

      if (!targetFile) {
        return null;
      }

      const filepath = path.join(this.logDir, targetFile);
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content) as DecisionRecord;
    } catch (error) {
      console.error(`Failed to get decision for cycle ${cycleNumber}:`, error);
      return null;
    }
  }

  /**
   * Analyze performance from recent decisions
   * Returns comprehensive trading performance metrics including Sharpe Ratio
   */
  async analyzePerformance(recentCount: number = 100): Promise<{
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    avg_profit: number;
    avg_loss: number;
    profit_factor: number;
    sharpe_ratio: number;
    max_drawdown: number;
    avg_holding_time_minutes: number;
    sample_trades: Array<{
      symbol: string;
      side: string;
      open_time: string;
      close_time: string;
      pnl: number;
      pnl_pct: number;
      leverage: number;
    }>;
  }> {
    try {
      const decisions = await this.getRecentDecisions(recentCount);

      if (decisions.length === 0) {
        return this.getEmptyPerformance();
      }

      // Extract closed trades from decision logs
      const closedTrades = this.extractClosedTrades(decisions);

      if (closedTrades.length === 0) {
        return this.getEmptyPerformance();
      }

      // Calculate basic statistics
      const winningTrades = closedTrades.filter(t => t.pnl > 0);
      const losingTrades = closedTrades.filter(t => t.pnl < 0);

      const totalTrades = closedTrades.length;
      const winningCount = winningTrades.length;
      const losingCount = losingTrades.length;
      const winRate = totalTrades > 0 ? (winningCount / totalTrades) * 100 : 0;

      // Calculate average profit and loss
      const avgProfit = winningCount > 0
        ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningCount
        : 0;

      const avgLoss = losingCount > 0
        ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingCount
        : 0;

      // Calculate profit factor
      const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
      const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
      const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? 999 : 0);

      // Get initial balance from first decision's account snapshot
      const initialBalance = decisions.length > 0 && decisions[0].account_snapshot.initial_balance
        ? decisions[0].account_snapshot.initial_balance
        : 100; // Fallback to 100 if not available

      // Calculate Sharpe Ratio (using account equity return method)
      const sharpeRatio = this.calculateSharpeRatio(closedTrades, initialBalance);

      // Calculate max drawdown from equity curve
      const maxDrawdown = this.calculateMaxDrawdown(decisions);

      // Calculate average holding time
      const avgHoldingTime = closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + t.holding_time_minutes, 0) / closedTrades.length
        : 0;

      // Get sample trades (last 10)
      const sampleTrades = closedTrades.slice(0, 10).map(t => ({
        symbol: t.symbol,
        side: t.side,
        open_time: t.open_time,
        close_time: t.close_time,
        pnl: t.pnl,
        pnl_pct: t.pnl_pct,
        leverage: t.leverage,
      }));

      return {
        total_trades: totalTrades,
        winning_trades: winningCount,
        losing_trades: losingCount,
        win_rate: winRate,
        avg_profit: avgProfit,
        avg_loss: avgLoss,
        profit_factor: profitFactor,
        sharpe_ratio: sharpeRatio,
        max_drawdown: maxDrawdown,
        avg_holding_time_minutes: avgHoldingTime,
        sample_trades: sampleTrades,
      };
    } catch (error) {
      console.error('Failed to analyze performance:', error);
      return this.getEmptyPerformance();
    }
  }

  /**
   * Extract closed trades from decision logs by matching open/close pairs
   * Fixed version: Process ALL close actions, not just unique symbol+side combinations
   */
  private extractClosedTrades(decisions: DecisionRecord[]): Array<{
    symbol: string;
    side: string;
    open_time: string;
    close_time: string;
    open_price: number;
    close_price: number;
    quantity: number;
    leverage: number;
    pnl: number;
    pnl_pct: number;
    holding_time_minutes: number;
  }> {
    const trades: Array<{
      symbol: string;
      side: string;
      open_time: string;
      close_time: string;
      open_price: number;
      close_price: number;
      quantity: number;
      leverage: number;
      pnl: number;
      pnl_pct: number;
      holding_time_minutes: number;
    }> = [];

    if (decisions.length === 0) return trades;

    // Sort decisions oldest first
    const sortedDecisions = [...decisions].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // ✅ FIX: Collect ALL close actions (not using Map, which would overwrite duplicates)
    const allCloseActions: Array<{
      decision: DecisionRecord;
      action: any;
      symbol: string;
      side: string;
    }> = [];

    for (const decision of sortedDecisions) {
      for (const action of decision.decisions) {
        if (action.action === 'close_long' || action.action === 'close_short') {
          const side = action.action === 'close_long' ? 'long' : 'short';
          allCloseActions.push({
            decision,
            action,
            symbol: action.symbol,
            side: side,
          });
        }
      }
    }

    console.log(`[DecisionLogger] Found ${allCloseActions.length} close actions`);

    // For each close action, find the corresponding open
    for (const { decision: closeDecision, action: closeAction, symbol, side } of allCloseActions) {
      // Get position details from close decision's snapshot (before close)
      const closePosition = closeDecision.positions_snapshot.find(
        p => p.symbol === symbol && p.side === side
      );

      if (!closePosition) {
        console.warn(`[DecisionLogger] Cycle ${closeDecision.cycle_number}: ${symbol} ${side} - position not found in snapshot`);
        continue;
      }

      // ✅ FIX: Find open time by looking backwards from close time
      // Find when position FIRST appeared (wasn't in previous cycle but is in this one)
      let openTime: string | null = null;
      let openPrice = closePosition.entry_price;

      for (let i = 0; i < sortedDecisions.length; i++) {
        const decision = sortedDecisions[i];

        // Stop when we reach the close decision
        if (decision.cycle_number >= closeDecision.cycle_number) break;

        // Check if this position exists in current snapshot
        const currentPos = decision.positions_snapshot.find(
          p => p.symbol === symbol && p.side === side
        );

        // Check previous snapshot (if exists)
        const prevPos = i > 0
          ? sortedDecisions[i - 1].positions_snapshot.find(
              p => p.symbol === symbol && p.side === side
            )
          : null;

        // Position appeared for the first time (wasn't in previous, but is in current)
        if (currentPos && !prevPos) {
          openTime = decision.timestamp;
          openPrice = currentPos.entry_price;
          break;
        }
      }

      // Fallback: If still not found, look for open_long/open_short action
      if (!openTime) {
        for (const decision of sortedDecisions) {
          if (decision.cycle_number >= closeDecision.cycle_number) break;

          for (const action of decision.decisions) {
            const actionSide = action.action.includes('long') ? 'long' : action.action.includes('short') ? 'short' : null;
            if ((action.action === 'open_long' || action.action === 'open_short') &&
                action.symbol === symbol && actionSide === side) {
              openTime = decision.timestamp;
              // Try to get price from next cycle's snapshot
              const nextDecision = sortedDecisions.find(d => d.cycle_number === decision.cycle_number + 1);
              if (nextDecision) {
                const pos = nextDecision.positions_snapshot.find(p => p.symbol === symbol && p.side === side);
                if (pos) openPrice = pos.entry_price;
              }
              break;
            }
          }
          if (openTime) break;
        }
      }

      if (!openTime) {
        console.warn(`[DecisionLogger] Cycle ${closeDecision.cycle_number}: ${symbol} ${side} - could not find open time`);
        continue;
      }

      const closePrice = closePosition.mark_price;

      // Calculate PnL percentage (price change)
      const priceChange = side === 'long'
        ? (closePrice - openPrice) / openPrice
        : (openPrice - closePrice) / openPrice;

      const pnlPct = priceChange * 100;

      // Use the unrealized_pnl from snapshot (already includes leverage)
      // This is the actual PnL at the moment of closing
      const pnl = closePosition.unrealized_pnl;

      // Calculate holding time
      const openTimestamp = new Date(openTime).getTime();
      const closeTimestamp = new Date(closeDecision.timestamp).getTime();
      const holdingTimeMinutes = (closeTimestamp - openTimestamp) / (1000 * 60);

      trades.push({
        symbol: symbol,
        side: side,
        open_time: openTime,
        close_time: closeDecision.timestamp,
        open_price: openPrice,
        close_price: closePrice,
        quantity: closePosition.quantity,
        leverage: closePosition.leverage,
        pnl: pnl,
        pnl_pct: pnlPct,
        holding_time_minutes: holdingTimeMinutes,
      });
    }

    console.log(`[DecisionLogger] Successfully extracted ${trades.length} / ${allCloseActions.length} trades`);

    return trades;
  }

  /**
   * Calculate Sharpe Ratio from closed trades
   * Uses account equity return method (standard approach)
   *
   * Sharpe Ratio = Mean Return / Std Dev of Returns
   *
   * @param trades - Array of closed trades with PnL data
   * @param initialBalance - Initial account balance to calculate return percentage
   * @returns Sharpe Ratio (annualized for trading frequency)
   */
  private calculateSharpeRatio(
    trades: Array<{ pnl: number; pnl_pct: number }>,
    initialBalance: number
  ): number {
    if (trades.length < 2) {
      return 0;
    }

    // ✅ FIX: Use account equity return percentage (not price change percentage)
    // This accounts for position size and reflects true account volatility
    const returns = trades.map(t => (t.pnl / initialBalance) * 100);

    // Calculate mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate standard deviation
    const squaredDiffs = returns.map(r => Math.pow(r - meanReturn, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Sharpe Ratio (assuming risk-free rate = 0 for simplicity)
    const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;

    console.log(`[DecisionLogger] Sharpe Ratio calculation:`, {
      trades: trades.length,
      initialBalance,
      meanReturn: meanReturn.toFixed(6) + '%',
      stdDev: stdDev.toFixed(6) + '%',
      sharpeRatio: sharpeRatio.toFixed(4),
    });

    return sharpeRatio;
  }

  /**
   * Calculate maximum drawdown from equity curve
   */
  private calculateMaxDrawdown(decisions: DecisionRecord[]): number {
    if (decisions.length < 2) {
      return 0;
    }

    // Sort by timestamp (oldest first)
    const sorted = [...decisions].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let maxEquity = sorted[0].account_snapshot.total_equity;
    let maxDrawdown = 0;

    for (const decision of sorted) {
      const equity = decision.account_snapshot.total_equity;

      // Update max equity
      if (equity > maxEquity) {
        maxEquity = equity;
      }

      // Calculate drawdown from peak
      const drawdown = maxEquity > 0 ? ((equity - maxEquity) / maxEquity) * 100 : 0;

      // Track max drawdown (most negative)
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Get empty performance object when no trades available
   */
  private getEmptyPerformance() {
    return {
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_profit: 0,
      avg_loss: 0,
      profit_factor: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
      avg_holding_time_minutes: 0,
      sample_trades: [],
    };
  }

  /**
   * Get current cycle number
   */
  getCycleNumber(): number {
    return this.cycleNumber;
  }

  /**
   * Initialize cycle number from existing logs
   */
  async initializeCycleNumber(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const decisionFiles = files.filter(f =>
        f.startsWith('decision_') && f.endsWith('.json')
      );

      if (decisionFiles.length === 0) {
        this.cycleNumber = 0;
        return;
      }

      // Extract cycle numbers from filenames
      const cycleNumbers = decisionFiles
        .map(f => {
          const match = f.match(/cycle(\d+)\.json$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));

      if (cycleNumbers.length > 0) {
        this.cycleNumber = Math.max(...cycleNumbers);
        console.log(`📊 Initialized cycle number to ${this.cycleNumber} (found ${decisionFiles.length} existing logs)`);
      }
    } catch (error) {
      console.error('Failed to initialize cycle number:', error);
      this.cycleNumber = 0;
    }
  }

  // ========================================
  // Closed Positions Management (for fast access)
  // ========================================

  /**
   * Load closed positions from JSON file
   */
  private async loadClosedPositions(): Promise<ClosedPosition[]> {
    try {
      const content = await fs.readFile(this.closedPositionsFile, 'utf-8');
      return JSON.parse(content) as ClosedPosition[];
    } catch (error) {
      // File doesn't exist or is empty, return empty array
      return [];
    }
  }

  /**
   * Save closed positions to JSON file
   */
  private async saveClosedPositionsFile(positions: ClosedPosition[]): Promise<void> {
    try {
      await fs.writeFile(
        this.closedPositionsFile,
        JSON.stringify(positions, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save closed positions file:', error);
      throw error;
    }
  }

  /**
   * Append a closed position record
   * Called when a position is closed
   */
  async saveClosedPosition(
    decision: DecisionRecord,
    closeAction: Decision,
    position: {
      symbol: string;
      side: string;
      entry_price: number;
      mark_price: number;
      quantity: number;
      leverage: number;
      unrealized_pnl: number;
      unrealized_pnl_pct: number;
    },
    openTime: string
  ): Promise<void> {
    try {
      const positions = await this.loadClosedPositions();

      // Generate auto-increment ID
      const newId = positions.length > 0
        ? Math.max(...positions.map(p => p.id)) + 1
        : 1;

      // Calculate holding time
      const openTimestamp = new Date(openTime).getTime();
      const closeTimestamp = new Date(decision.timestamp).getTime();
      const holdingTimeMinutes = (closeTimestamp - openTimestamp) / (1000 * 60);

      const closedPosition: ClosedPosition = {
        id: newId,
        trader_id: this.traderId,
        cycle_number: decision.cycle_number,
        timestamp: decision.timestamp,
        symbol: position.symbol,
        side: position.side as 'long' | 'short',
        action: closeAction.action as 'close_long' | 'close_short',
        open_time: openTime,
        close_time: decision.timestamp,
        entry_price: position.entry_price,
        exit_price: position.mark_price,
        quantity: position.quantity,
        leverage: position.leverage,
        pnl: position.unrealized_pnl,
        pnl_pct: position.unrealized_pnl_pct,
        holding_time_minutes: holdingTimeMinutes,
        reasoning: closeAction.reasoning,
      };

      // Append to array (newest last)
      positions.push(closedPosition);

      // Save to file
      await this.saveClosedPositionsFile(positions);

      console.log(`💾 Saved closed position: ${position.symbol} ${position.side} (PnL: ${position.unrealized_pnl.toFixed(2)} USDT)`);
    } catch (error) {
      console.error('Failed to save closed position:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get closed positions with pagination
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @returns Paginated closed positions (newest first)
   */
  async getClosedPositions(page: number = 1, limit: number = 20): Promise<{
    data: ClosedPosition[];
    pagination: {
      page: number;
      limit: number;
      total_count: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }> {
    try {
      const allPositions = await this.loadClosedPositions();

      // Sort by timestamp (newest first)
      const sorted = [...allPositions].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const totalCount = sorted.length;
      const totalPages = Math.ceil(totalCount / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = sorted.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        pagination: {
          page,
          limit,
          total_count: totalCount,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      };
    } catch (error) {
      console.error('Failed to get closed positions:', error);
      return {
        data: [],
        pagination: {
          page: 1,
          limit,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }
}
