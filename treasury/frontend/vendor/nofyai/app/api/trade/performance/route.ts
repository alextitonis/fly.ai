import { NextResponse } from 'next/server';
import { DecisionLogger } from '@/lib/decision-logger';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get('trader_id') || 'default_trader';
  // Default to 1000 to analyze all historical trades (was 100, too small)
  const recentCount = parseInt(searchParams.get('recent_count') || '1000', 10);

  try {
    const logger = new DecisionLogger(traderId);
    const performance = await logger.analyzePerformance(recentCount);

    if (!performance) {
      return NextResponse.json({
        success: true,
        performance: {
          total_decisions: 0,
          total_opens: 0,
          total_closes: 0,
          avg_positions: 0,
          recent_pnl: 0,
          recent_pnl_pct: 0,
        },
        message: 'No decision history found',
      });
    }

    return NextResponse.json({
      success: true,
      performance,
    });
  } catch (error) {
    console.error('Failed to analyze performance:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
