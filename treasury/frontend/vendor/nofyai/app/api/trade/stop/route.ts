import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';
import { withAuth } from '@/lib/auth-middleware';

export const POST = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get('trader_id');

  try {
    const manager = await getTraderManager();

    if (traderId) {
      // Stop specific trader
      manager.stopTrader(traderId);

      const trader = manager.getTrader(traderId);
      if (!trader) {
        throw new Error(`Trader ${traderId} not found`);
      }

      return NextResponse.json({
        success: true,
        message: `Trader ${traderId} stopped`,
        session: trader.getSession(),
      });
    } else {
      // Stop all traders
      manager.stopAll();

      return NextResponse.json({
        success: true,
        message: 'All traders stopped',
        status: manager.getAllStatus(),
      });
    }
  } catch (error) {
    console.error('Failed to stop trader(s):', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
});
