import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';
import type { AIDecision } from '@/types';

/**
 * GET /api/statistics
 * Returns trading statistics for a specific trader
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const traderId = searchParams.get('trader_id');

    if (!traderId) {
      return NextResponse.json(
        { error: 'trader_id parameter is required' },
        { status: 400 }
      );
    }

    const manager = await getTraderManager();
    const trader = manager.getTrader(traderId);

    if (!trader) {
      return NextResponse.json(
        { error: `Trader ${traderId} not found` },
        { status: 404 }
      );
    }

    // Get all decisions to calculate statistics
    const allDecisions = await trader.getLatestDecisions(1000);

    let totalOpenPositions = 0;
    let totalClosePositions = 0;
    let successfulCycles = 0;
    let failedCycles = 0;

    allDecisions.forEach(decision => {
      // Count cycles
      if (decision.success === true || decision.success === undefined) {
        successfulCycles++;
      } else {
        failedCycles++;
      }

      // Count position actions
      decision.decisions.forEach((d: AIDecision) => {
        if (d.action === 'open_long' || d.action === 'open_short') {
          totalOpenPositions++;
        } else if (d.action === 'close_long' || d.action === 'close_short') {
          totalClosePositions++;
        }
      });
    });

    const statistics = {
      total_cycles: allDecisions.length,
      successful_cycles: successfulCycles,
      failed_cycles: failedCycles,
      total_open_positions: totalOpenPositions,
      total_close_positions: totalClosePositions,
    };

    return NextResponse.json(statistics);
  } catch (error) {
    console.error('Failed to fetch statistics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
