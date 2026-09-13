import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';

/**
 * GET /api/decisions
 * Returns paginated decision records for a specific trader
 * Query params:
 *   - trader_id: required
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const traderId = searchParams.get('trader_id');
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    if (!traderId) {
      return NextResponse.json(
        { error: 'trader_id parameter is required' },
        { status: 400 }
      );
    }

    // Parse pagination params
    const page = Math.max(1, parseInt(pageParam || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '20', 10)));

    const manager = await getTraderManager();
    const trader = manager.getTrader(traderId);

    if (!trader) {
      return NextResponse.json(
        { error: `Trader ${traderId} not found` },
        { status: 404 }
      );
    }

    // Get more decisions to support pagination (fetch 1000 max from storage)
    const allDecisions = await trader.getLatestDecisions(1000);

    // Fix old records that don't have success field
    const decisionsWithSuccess = allDecisions.map(decision => ({
      ...decision,
      success: decision.success ?? true
    }));

    // Calculate pagination
    const totalCount = decisionsWithSuccess.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedDecisions = decisionsWithSuccess.slice(startIndex, endIndex);

    // Build response with pagination metadata
    const response = {
      decisions: paginatedDecisions,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: totalPages,
        has_more: page < totalPages,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch decisions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch decisions' },
      { status: 500 }
    );
  }
}
