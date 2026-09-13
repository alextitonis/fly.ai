import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';
import { withAuth } from '@/lib/auth-middleware';

/**
 * POST /api/emergency-stop
 * Emergency stop: Stop all traders and close all positions
 */
export const POST = withAuth(async (request: NextRequest) => {
  try {
    const traderManager = await getTraderManager();

    console.log('🚨 Emergency stop requested via API');

    await traderManager.emergencyStopAll();

    return NextResponse.json({
      success: true,
      message: 'Emergency stop completed. All traders stopped and positions closed.',
    });
  } catch (error) {
    console.error('Error during emergency stop:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
