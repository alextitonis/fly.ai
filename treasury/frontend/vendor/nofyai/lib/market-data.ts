// ========================================
// Binance Market Data Integration
// ========================================

import type { MarketData } from './ai';
import { getOICache } from './oi-cache';

// Import from modularized market-data package
import type { KlineData } from './market-data/types';
import {
  fetchKlines,
  fetchOpenInterest,
  fetchTicker,
  fetchFundingRate,
} from './market-data/fetcher';
import {
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateATR,
} from './market-data/indicators';
import {
  calculateEMASeries,
  calculateMACDSeries,
  calculateRSISeries,
} from './market-data/time-series';

// Re-export types for backward compatibility
export type { KlineData };

// ========================================
// Main Market Data Function
// ========================================

export async function getMarketData(symbol: string): Promise<MarketData> {
  try {
    // Normalize symbol (ensure USDT suffix)
    const normalizedSymbol = symbol.toUpperCase().includes('USDT')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}USDT`;

    console.log(`[getMarketData] Starting fetch for ${normalizedSymbol}...`);

    // Fetch K-line data for multiple timeframes
    console.log(`[getMarketData] 🔄 Fetching K-line data for ${normalizedSymbol}...`);

    // 🎯 Split into batches to reduce concurrent load on proxy
    // Batch 1: K-lines (most important)
    const [klines15m, klines1h, klines4h, klines1d] = await Promise.all([
      fetchKlines(normalizedSymbol, '15m', 100), // 15-minute candles
      fetchKlines(normalizedSymbol, '1h', 100),  // 1-hour candles
      fetchKlines(normalizedSymbol, '4h', 60),   // 4-hour candles
      fetchKlines(normalizedSymbol, '1d', 100),  // 1-day candles
    ]);

    // Delay between batches to reduce proxy load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Batch 2: Ticker and funding rate
    const [ticker, fundingRate] = await Promise.all([
      fetchTicker(normalizedSymbol),
      fetchFundingRate(normalizedSymbol),
    ]);

    // 🎯 Log fetched data lengths for debugging
    console.log(`[getMarketData] 📊 K-line data received:`, {
      symbol: normalizedSymbol,
      '15m': klines15m.length,
      '1h': klines1h.length,
      '4h': klines4h.length,
      '1d': klines1d.length
    });

    if (klines1h.length < 26) {
      console.warn(`[getMarketData] ⚠️ WARNING: 1h K-line data insufficient (${klines1h.length} < 26) - MACD will be 0`);
    }
    if (klines4h.length < 26) {
      console.warn(`[getMarketData] ⚠️ WARNING: 4h K-line data insufficient (${klines4h.length} < 26) - MACD will be 0`);
    }
    if (klines1d.length < 26) {
      console.warn(`[getMarketData] ⚠️ WARNING: 1d K-line data insufficient (${klines1d.length} < 26) - MACD will be 0`);
    }

    // Get Open Interest
    const oi = await fetchOpenInterest(normalizedSymbol);

    // Current price and OHLC (from 15m, most recent candle)
    const latestCandle = klines15m[klines15m.length - 1];
    const currentPrice = latestCandle.close;

    // Calculate multi-timeframe MACD
    const macd15m = calculateMACD(klines15m);
    const macd1h = calculateMACD(klines1h);
    const macd4h = calculateMACD(klines4h);
    const macd1d = calculateMACD(klines1d);

    // Calculate multi-timeframe RSI
    const rsi15m = calculateRSI(klines15m, 14);
    const rsi1h = calculateRSI(klines1h, 14);
    const rsi4h = calculateRSI(klines4h, 14);
    const rsi1d = calculateRSI(klines1d, 14);

    // Calculate EMA20 (based on 15m)
    const ema20 = calculateEMA(klines15m.map(k => k.close), 20);

    // Calculate ATR (based on 15m)
    const atr = calculateATR(klines15m, 14);

    // Calculate time series data (15m timeframe, last 10 points)
    const seriesLength = 10;
    const closes15m = klines15m.map(k => k.close);

    // Price series (最近10个15分钟K线的收盘价)
    const priceSeries15m = closes15m.slice(-seriesLength);

    // MACD series
    const macdSeries15m = calculateMACDSeries(klines15m, seriesLength);

    // RSI series
    const rsiSeries15m = calculateRSISeries(klines15m, 14, seriesLength);

    // Volume series (convert to millions for readability)
    const volumeSeries15m = klines15m
      .slice(-seriesLength)
      .map(k => k.quoteVolume / 1_000_000);

    // EMA20 series
    const ema20Series15m = calculateEMASeries(closes15m, 20, seriesLength);

    // EMA50 series
    const ema50Series15m = calculateEMASeries(closes15m, 50, seriesLength);

    console.log(`[getMarketData] ${normalizedSymbol} time series: price=${priceSeries15m.length}, macd=${macdSeries15m.length}, rsi=${rsiSeries15m.length}, volume=${volumeSeries15m.length}`);

    // Calculate price changes
    // NOTE: currentPrice = klines15m[length-1].close (latest candle)
    // Compare to previous candle's close to get true time-period change
    let priceChange15m = 0;
    if (klines15m.length >= 2) {
      const price15mAgo = klines15m[klines15m.length - 2].close;
      priceChange15m = ((currentPrice - price15mAgo) / price15mAgo) * 100;
      console.log(`[getMarketData] ${normalizedSymbol} 15m change: ${currentPrice} vs ${price15mAgo} = ${priceChange15m.toFixed(4)}%`);
    }

    let priceChange1h = 0;
    if (klines1h.length >= 2) {
      const price1hAgo = klines1h[klines1h.length - 2].close;
      priceChange1h = ((currentPrice - price1hAgo) / price1hAgo) * 100;
      console.log(`[getMarketData] ${normalizedSymbol} 1h change: ${currentPrice} vs ${price1hAgo} = ${priceChange1h.toFixed(4)}%`);
    }

    let priceChange4h = 0;
    if (klines4h.length >= 2) {
      const price4hAgo = klines4h[klines4h.length - 2].close;
      priceChange4h = ((currentPrice - price4hAgo) / price4hAgo) * 100;
      console.log(`[getMarketData] ${normalizedSymbol} 4h change: ${currentPrice} vs ${price4hAgo} = ${priceChange4h.toFixed(4)}%`);
    }

    // Calculate volume average (需要更长时间窗口的移动平均)
    // 方案：使用最近7天的数据计算平均24h成交量
    // 7天 = 168小时 = 672 x 15分钟K线，但我们只取了100根
    // 简化：使用1h K线（100根 = 约4天）来估算历史平均成交量

    // 计算每小时成交量（使用quoteVolume字段 = USDT金额），然后估算24h平均
    if (klines1h.length >= 24) {
      // 取最近96小时（4天）的1h K线数据
      const recentHours = Math.min(96, klines1h.length);
      const quoteVolumes1h = klines1h.slice(-recentHours).map(k => k.quoteVolume);

      // 计算每小时平均成交量（USDT）
      const volumePerHour = quoteVolumes1h.reduce((sum, v) => sum + v, 0) / quoteVolumes1h.length;

      // 估算历史平均24h成交量（过去4天的平均值）
      const historicalAvg24h = volumePerHour * 24;

      console.log(`[getMarketData] ${normalizedSymbol} volume: current 24h=${(ticker.volume / 1e6).toFixed(2)}M, historical avg=${(historicalAvg24h / 1e6).toFixed(2)}M, ratio=${(ticker.volume / historicalAvg24h).toFixed(2)}x`);

      return {
        symbol: normalizedSymbol,
        current_price: currentPrice,

        // Price changes
        price_change_15m: priceChange15m,
        price_change_1h: priceChange1h,
        price_change_4h: priceChange4h,

        // Multi-timeframe MACD
        macd_15m: macd15m,
        macd_1h: macd1h,
        macd_4h: macd4h,
        macd_1d: macd1d,

        // Multi-timeframe RSI
        rsi_15m: rsi15m,
        rsi_1h: rsi1h,
        rsi_4h: rsi4h,
        rsi_1d: rsi1d,

        // EMA
        ema20: ema20,

        // Volume (使用历史平均值)
        volume_24h: ticker.volume,
        volume_avg_24h: historicalAvg24h,

        // Open Interest
        oi_value: oi.current,
        oi_change_pct: oi.change_pct,

        // Market sentiment
        buy_sell_ratio: ticker.buySellRatio,
        funding_rate: fundingRate,

        // OHLC (latest candle)
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,

        // Volatility
        atr: atr,

        // Time series data (15m timeframe, last 10 points)
        price_series_15m: priceSeries15m,
        macd_series_15m: macdSeries15m,
        rsi_series_15m: rsiSeries15m,
        volume_series_15m: volumeSeries15m,
        ema20_series_15m: ema20Series15m,
        ema50_series_15m: ema50Series15m,

        // Legacy fields (for compatibility)
        current_macd: macd15m,
        current_rsi7: rsi15m,
        current_rsi14: rsi1h,
      };
    } else {
      // Fallback: 如果1h数据不足，使用15m数据（旧逻辑）
      const quoteVolumes15m = klines15m.slice(-96).map(k => k.quoteVolume);
      const volumeAvg = quoteVolumes15m.reduce((sum, v) => sum + v, 0) / quoteVolumes15m.length;
      const volumeAvg24h = volumeAvg * 96;

      console.log(`[getMarketData] ${normalizedSymbol} volume (fallback): using 15m data, ratio=${(ticker.volume / volumeAvg24h).toFixed(2)}x`);

      return {
        symbol: normalizedSymbol,
        current_price: currentPrice,

        // Price changes
        price_change_15m: priceChange15m,
        price_change_1h: priceChange1h,
        price_change_4h: priceChange4h,

        // Multi-timeframe MACD
        macd_15m: macd15m,
        macd_1h: macd1h,
        macd_4h: macd4h,
        macd_1d: macd1d,

        // Multi-timeframe RSI
        rsi_15m: rsi15m,
        rsi_1h: rsi1h,
        rsi_4h: rsi4h,
        rsi_1d: rsi1d,

        // EMA
        ema20: ema20,

        // Volume (fallback to 15m-based calculation)
        volume_24h: ticker.volume,
        volume_avg_24h: volumeAvg24h,

        // Open Interest
        oi_value: oi.current,
        oi_change_pct: oi.change_pct,

        // Market sentiment
        buy_sell_ratio: ticker.buySellRatio,
        funding_rate: fundingRate,

        // OHLC (latest candle)
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,

        // Volatility
        atr: atr,

        // Time series data (15m timeframe, last 10 points)
        price_series_15m: priceSeries15m,
        macd_series_15m: macdSeries15m,
        rsi_series_15m: rsiSeries15m,
        volume_series_15m: volumeSeries15m,
        ema20_series_15m: ema20Series15m,
        ema50_series_15m: ema50Series15m,

        // Legacy fields (for compatibility)
        current_macd: macd15m,
        current_rsi7: rsi15m,
        current_rsi14: rsi1h,
      };
    }
  } catch (error) {
    console.error(`[getMarketData] Failed to fetch data for ${symbol}:`, error);
    throw error;
  }
}

// ========================================
// Batch Fetch for Multiple Symbols
// ========================================

export async function getMarketDataBatch(symbols: string[]): Promise<Record<string, MarketData>> {
  console.log(`📊 Fetching market data for ${symbols.length} symbols...`);

  const results: Record<string, MarketData> = {};

  // Fetch in parallel but with delay to avoid overwhelming the proxy
  const promises = symbols.map(async (symbol, index) => {
    // Add delay between symbols to avoid rate limiting and proxy overload
    await new Promise(resolve => setTimeout(resolve, index * 500));

    try {
      const data = await getMarketData(symbol);
      results[symbol] = data;
      console.log(`  ✓ ${symbol}: $${data.current_price.toFixed(2)} | MACD(15m/1h/4h): ${data.macd_15m.toFixed(2)}/${data.macd_1h.toFixed(2)}/${data.macd_4h.toFixed(2)}`);
    } catch (error) {
      console.error(`  ✗ ${symbol}: ${error instanceof Error ? error.message : error}`);
    }
  });

  await Promise.all(promises);

  console.log(`✓ Fetched ${Object.keys(results).length}/${symbols.length} symbols`);

  return results;
}

// ========================================
// Helper: Get Default Trading Symbols
// ========================================

export const DEFAULT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
];

export async function getDefaultMarketData(): Promise<Record<string, MarketData>> {
  return await getMarketDataBatch(DEFAULT_SYMBOLS);
}
