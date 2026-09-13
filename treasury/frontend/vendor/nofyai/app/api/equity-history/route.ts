import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

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

    const equityHistory = await trader.getEquityHistory();
    return NextResponse.json(equityHistory);
  } catch (error) {
    console.error('Failed to fetch equity history:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch equity history' },
      { status: 500 }
    );
  }
}
