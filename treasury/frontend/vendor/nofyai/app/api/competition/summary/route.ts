import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';
import type { CompetitionSummary, TraderSummary, TopPerformer } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const traderManager = await getTraderManager();
    const allStatus = traderManager.getAllStatus();

    if (allStatus.length === 0) {
      return NextResponse.json({
        total_traders: 0,
        active_traders: 0,
        total_equity: 0,
        total_pnl: 0,
        total_trades: 0,
        highest_performer: null,
        lowest_performer: null,
        leaderboard: [],
        last_updated: new Date().toISOString(),
      } as CompetitionSummary);
    }

    // Collect data from all traders
    const traderSummaries: TraderSummary[] = [];
    let totalEquity = 0;
    let totalPnl = 0;
    let totalTrades = 0;
    let activeTraders = 0;

    for (const status of allStatus) {
      try {
        const engine = traderManager.getTrader(status.trader_id);
        if (!engine) continue;

        // Get account info
        const account = await engine.getCurrentAccount();

        // Get performance
        const performance = await engine.getPerformanceMetrics();

        const summary: Omit<TraderSummary, 'ranking'> = {
          trader_id: status.trader_id,
          trader_name: status.trader_name,
          ai_model: status.ai_model,
          exchange: status.exchange,
          total_equity: account.total_equity,
          initial_balance: account.initial_balance,
          total_pnl: account.total_pnl,
          total_pnl_pct: account.total_pnl_pct,
          unrealized_pnl: account.total_unrealized_pnl,
          position_count: account.position_count,
          is_running: status.is_running,
          sharpe_ratio: performance.sharpe_ratio,
          win_rate: performance.win_rate,
          total_trades: performance.total_trades,
          max_drawdown: performance.max_drawdown,
        };

        traderSummaries.push(summary as TraderSummary);

        totalEquity += account.total_equity;
        totalPnl += account.total_pnl;
        totalTrades += performance.total_trades;
        if (status.is_running) activeTraders++;
      } catch (error) {
        console.error(`Error getting data for trader ${status.trader_id}:`, error);
        // Continue with other traders
      }
    }

    // Sort by total equity (descending) and assign rankings
    traderSummaries.sort((a, b) => b.total_equity - a.total_equity);
    traderSummaries.forEach((summary, index) => {
      summary.ranking = index + 1;
    });

    // Find highest and lowest performers (by percentage return)
    const sortedByPnlPct = [...traderSummaries].sort((a, b) => b.total_pnl_pct - a.total_pnl_pct);

    const highest = sortedByPnlPct.length > 0 ? sortedByPnlPct[0] : null;
    const lowest = sortedByPnlPct.length > 0 ? sortedByPnlPct[sortedByPnlPct.length - 1] : null;

    const highestPerformer: TopPerformer | null = highest ? {
      trader_id: highest.trader_id,
      trader_name: highest.trader_name,
      ai_model: highest.ai_model,
      total_equity: highest.total_equity,
      total_pnl_pct: highest.total_pnl_pct,
    } : null;

    const lowestPerformer: TopPerformer | null = lowest ? {
      trader_id: lowest.trader_id,
      trader_name: lowest.trader_name,
      ai_model: lowest.ai_model,
      total_equity: lowest.total_equity,
      total_pnl_pct: lowest.total_pnl_pct,
    } : null;

    const summary: CompetitionSummary = {
      total_traders: allStatus.length,
      active_traders: activeTraders,
      total_equity: totalEquity,
      total_pnl: totalPnl,
      total_trades: totalTrades,
      highest_performer: highestPerformer,
      lowest_performer: lowestPerformer,
      leaderboard: traderSummaries,
      last_updated: new Date().toISOString(),
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error in competition summary API:', error);
    return NextResponse.json(
      { error: 'Failed to get competition summary' },
      { status: 500 }
    );
  }
}
