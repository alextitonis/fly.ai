import { NextRequest, NextResponse } from 'next/server';
import { getTraderManager } from '@/lib/trader-manager';
import type { MultiTraderEquityHistory } from '@/types';

export const dynamic = 'force-dynamic';

// Color palette for different traders (matching nof1.ai style)
const TRADER_COLORS = [
  '#8b5cf6', // Purple (Qwen style)
  '#3b82f6', // Blue (DeepSeek style)
  '#f97316', // Orange (Claude style)
  '#10b981', // Green (GPT style)
  '#ec4899', // Pink (Gemini style)
  '#f59e0b', // Amber (Grok style)
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
];

export async function GET(request: NextRequest) {
  try {
    const traderManager = await getTraderManager();
    const allStatus = traderManager.getAllStatus();

    const traders: MultiTraderEquityHistory['traders'] = [];

    for (let i = 0; i < allStatus.length; i++) {
      const status = allStatus[i];
      try {
        const engine = traderManager.getTrader(status.trader_id);
        if (!engine) continue;

        // Get equity history
        const equityHistory = await engine.getEquityHistory();

        traders.push({
          trader_id: status.trader_id,
          trader_name: status.trader_name,
          ai_model: status.ai_model,
          color: TRADER_COLORS[i % TRADER_COLORS.length],
          data: equityHistory,
        });
      } catch (error) {
        console.error(`Error getting equity history for trader ${status.trader_id}:`, error);
        // Continue with other traders
      }
    }

    const response: MultiTraderEquityHistory = {
      traders,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in competition equity history API:', error);
    return NextResponse.json(
      { error: 'Failed to get equity history' },
      { status: 500 }
    );
  }
}
