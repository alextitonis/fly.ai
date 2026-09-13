import { NextResponse } from 'next/server';
import { DecisionLogger } from '@/lib/decision-logger';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get('trader_id') || 'default_trader';
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const cycleNumber = searchParams.get('cycle');

  try {
    const logger = new DecisionLogger(traderId);

    // Get specific cycle
    if (cycleNumber) {
      const decision = await logger.getDecisionByCycle(parseInt(cycleNumber, 10));
      if (!decision) {
        return NextResponse.json(
          {
            success: false,
            error: `Decision for cycle ${cycleNumber} not found`,
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        decision,
      });
    }

    // Get recent decisions
    const decisions = await logger.getRecentDecisions(limit);
    const performance = await logger.analyzePerformance(limit);

    return NextResponse.json({
      success: true,
      count: decisions.length,
      decisions,
      performance,
    });
  } catch (error) {
    console.error('Failed to fetch decision history:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
