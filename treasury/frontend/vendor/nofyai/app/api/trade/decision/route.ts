import { NextResponse } from 'next/server';
import { getTradingEngine } from '@/lib/trading-engine-singleton';

export async function GET() {
  try {
    const engine = getTradingEngine();
    const decision = await engine.getDecision();

    return NextResponse.json({
      success: true,
      decision,
    });
  } catch (error) {
    console.error('Failed to get decision:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// This might take a while, so increase timeout
export const maxDuration = 60; // 60 seconds
