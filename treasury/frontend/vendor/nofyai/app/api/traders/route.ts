import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

/**
 * GET /api/traders
 * Returns list of all initialized traders
 */
export async function GET(request: NextRequest) {
  try {
    const traderManager = await getTraderManager();
    const allStatus = traderManager.getAllStatus();

    const traders = allStatus.map(status => ({
      trader_id: status.trader_id,
      trader_name: status.trader_name,
      ai_model: status.session.lastDecision?.decisions?.[0]?.reasoning ? 'AI' : 'Unknown',
    }));

    return NextResponse.json(traders);
  } catch (error) {
    console.error('Error fetching traders:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch traders' },
      { status: 500 }
    );
  }
}
