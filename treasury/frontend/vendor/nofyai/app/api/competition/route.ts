import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

export async function GET(request: NextRequest) {
  try {
    const manager = await getTraderManager();
    const allStatus = manager.getAllStatus();

    // Fetch real account data for each trader
    const traders = await Promise.all(
      allStatus.map(async status => {
        const trader = manager.getTrader(status.trader_id);
        if (!trader) {
          return {
            trader_id: status.trader_id,
            trader_name: status.trader_name,
            ai_model: status.ai_model,
            total_equity: 0,
            available_balance: 0,
            total_pnl: 0,
            total_pnl_pct: 0,
            margin_used: 0,
            margin_used_pct: 0,
            position_count: 0,
            is_running: status.is_running,
            call_count: 0,
          };
        }

        try {
          const account = await trader.getCurrentAccount();

          return {
            trader_id: status.trader_id,
            trader_name: status.trader_name,
            ai_model: status.ai_model,
            total_equity: account.total_equity,
            available_balance: account.available_balance,
            total_pnl: account.total_pnl,
            total_pnl_pct: account.total_pnl_pct,
            margin_used: account.margin_used,
            margin_used_pct: account.margin_used_pct,
            position_count: account.position_count,
            is_running: status.is_running,
            call_count: status.session.callCount,
          };
        } catch (error) {
          console.error(`Error fetching account for ${status.trader_id}:`, error);
          // Return fallback data if fetching fails
          return {
            trader_id: status.trader_id,
            trader_name: status.trader_name,
            ai_model: status.ai_model,
            total_equity: 0,
            available_balance: 0,
            total_pnl: 0,
            total_pnl_pct: 0,
            margin_used: 0,
            margin_used_pct: 0,
            position_count: 0,
            is_running: status.is_running,
            call_count: status.session.callCount,
          };
        }
      })
    );

    // Sort by ROI (highest first)
    const sortedTraders = traders.sort((a, b) => b.total_pnl_pct - a.total_pnl_pct);

    return NextResponse.json({
      count: traders.length,
      traders: sortedTraders,
    });
  } catch (error) {
    console.error('Failed to fetch competition data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch competition data' },
      { status: 500 }
    );
  }
}
