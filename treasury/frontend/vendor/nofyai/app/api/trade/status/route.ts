import { NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get('trader_id');

  try {
    const manager = await getTraderManager();

    if (traderId) {
      // Get specific trader status
      const trader = manager.getTrader(traderId);
      if (!trader) {
        return NextResponse.json(
          {
            success: false,
            error: `Trader ${traderId} not found`,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        trader_id: traderId,
        session: trader.getSession(),
      });
    } else {
      // Get all traders status
      const allStatus = manager.getAllStatus();
      const count = manager.getCount();

      return NextResponse.json({
        success: true,
        count,
        traders: allStatus,
      });
    }
  } catch (error) {
    console.error('Failed to get trader status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
