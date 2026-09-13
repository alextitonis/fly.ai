import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const traderId = searchParams.get('trader_id');
    const recentCountParam = searchParams.get('recent_count');
    // Default to 1000 to analyze all historical trades (was 100, too small)
    const recentCount = recentCountParam ? parseInt(recentCountParam, 10) : 1000;

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

    const performance = await trader.getPerformanceMetrics(recentCount);
    return NextResponse.json(performance);
  } catch (error) {
    console.error('Failed to fetch performance:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch performance' },
      { status: 500 }
    );
  }
}
