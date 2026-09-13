import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';
import { ClosedPositionsResponse } from '@/types';

/**
 * GET /api/trades?trader_id=xxx&page=1&limit=20
 *
 * Get closed positions (trades) for a specific trader with pagination
 * This API provides fast access to closed positions without parsing all decision logs
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const traderId = searchParams.get('trader_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Validation
    if (!traderId) {
      return NextResponse.json(
        { error: 'trader_id parameter is required' },
        { status: 400 }
      );
    }

    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters (page >= 1, 1 <= limit <= 100)' },
        { status: 400 }
      );
    }

    // Get trader
    const manager = await getTraderManager();
    const trader = manager.getTrader(traderId);

    if (!trader) {
      return NextResponse.json(
        { error: `Trader ${traderId} not found` },
        { status: 404 }
      );
    }

    // Get closed positions with pagination from DecisionLogger
    const decisionLogger = trader.getDecisionLogger();
    const result = await decisionLogger.getClosedPositions(page, limit);

    const response: ClosedPositionsResponse = {
      data: result.data,
      pagination: result.pagination,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch closed positions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch closed positions' },
      { status: 500 }
    );
  }
}
