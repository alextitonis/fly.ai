import { NextResponse } from 'next/server';
import { getMarketData } from '@/lib/market-data';

export async function GET() {
  try {
    console.log('🧪 [Test Market Data] Starting market data test...');

    // Test fetching market data for BTC
    const symbol = 'BTCUSDT';
    console.log(`🧪 [Test Market Data] Fetching data for ${symbol}...`);

    const marketData = await getMarketData(symbol);

    console.log(`✅ [Test Market Data] Successfully fetched data for ${symbol}`);
    console.log(`   Current Price: $${marketData.current_price.toFixed(2)}`);
    console.log(`   RSI(15m): ${marketData.rsi_15m.toFixed(2)}`);
    console.log(`   MACD(15m): ${marketData.macd_15m.toFixed(4)}`);
    console.log(`   EMA20: $${marketData.ema20.toFixed(2)}`);
    console.log(`   Buy/Sell Ratio: ${(marketData.buy_sell_ratio || 0).toFixed(3)}`);
    console.log(`   OI Value: ${marketData.oi_value.toFixed(2)}M`);

    return NextResponse.json({
      success: true,
      symbol: symbol,
      data: {
        current_price: marketData.current_price,
        price_change_15m: marketData.price_change_15m.toFixed(2) + '%',
        price_change_1h: marketData.price_change_1h.toFixed(2) + '%',
        price_change_4h: marketData.price_change_4h.toFixed(2) + '%',
        rsi_15m: marketData.rsi_15m.toFixed(2),
        rsi_1h: marketData.rsi_1h.toFixed(2),
        rsi_4h: marketData.rsi_4h.toFixed(2),
        macd_15m: marketData.macd_15m.toFixed(4),
        macd_1h: marketData.macd_1h.toFixed(4),
        macd_4h: marketData.macd_4h.toFixed(4),
        ema20: marketData.ema20.toFixed(2),
        volume_24h: marketData.volume_24h,
        volume_avg_24h: marketData.volume_avg_24h,
        buy_sell_ratio: (marketData.buy_sell_ratio || 0).toFixed(3),
        oi_value: marketData.oi_value.toFixed(2) + 'M',
        oi_change_pct: marketData.oi_change_pct.toFixed(2) + '%',
        funding_rate: (marketData.funding_rate || 0).toFixed(4) + '%',
      },
      summary: '✅ Market data fetched successfully with BuySellRatio!',
    });
  } catch (error) {
    console.error('❌ [Test Market Data] Test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
