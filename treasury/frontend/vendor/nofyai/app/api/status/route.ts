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

    const session = trader.getSession();
    const traderInfo = trader.getTraderInfo();
    const config = trader.getConfig();

    const runtimeMinutes = session.startTime
      ? (Date.now() - session.startTime.getTime()) / 60000
      : 0;

    return NextResponse.json({
      is_running: session.isRunning,
      start_time: session.startTime?.toISOString() || '',
      runtime_minutes: Math.round(runtimeMinutes),
      call_count: session.callCount,
      initial_balance: traderInfo.initial_balance,
      scan_interval: `${config.scanIntervalMinutes} minutes`,
      stop_until: '', // No stop mechanism implemented yet
      last_reset_time: '', // No reset mechanism implemented yet
      ai_provider: traderInfo.ai_model,
    });
  } catch (error) {
    console.error('Failed to fetch status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
