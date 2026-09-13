import { NextResponse } from 'next/server';
import { getMarketData, getDefaultMarketData } from '@/lib/market-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  try {
    if (symbol) {
      // Fetch single symbol
      const data = await getMarketData(symbol);
      return NextResponse.json({
        success: true,
        data,
      });
    } else {
      // Fetch default symbols
      const data = await getDefaultMarketData();
      return NextResponse.json({
        success: true,
        count: Object.keys(data).length,
        data,
      });
    }
  } catch (error) {
    console.error('Failed to fetch market data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
