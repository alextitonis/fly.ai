import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const traderId = searchParams.get('trader_id');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 5;

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

    const latestDecisions = await trader.getLatestDecisions(limit);

    // Fix old records that don't have success field (default to true if null/undefined)
    const decisionsWithSuccess = latestDecisions.map(decision => ({
      ...decision,
      success: decision.success ?? true
    }));

    return NextResponse.json(decisionsWithSuccess);
  } catch (error) {
    console.error('Failed to fetch latest decisions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch latest decisions' },
      { status: 500 }
    );
  }
}
