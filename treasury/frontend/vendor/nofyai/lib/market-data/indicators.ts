// ========================================
// Technical Indicators Calculation
// ========================================
// Pure functions for calculating technical indicators
// No side effects, easy to test and maintain

import type { KlineData } from './types';

/**
 * Calculate Exponential Moving Average (EMA)
 * @param prices - Array of price values
 * @param period - EMA period (e.g., 12, 20, 26, 50)
 * @returns EMA value
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate Moving Average Convergence Divergence (MACD)
 * @param klines - Array of kline data
 * @returns MACD value (EMA12 - EMA26)
 */
export function calculateMACD(klines: KlineData[]): number {
  const closes = klines.map(k => k.close);

  console.log(`[calculateMACD] Data length: ${closes.length}`);

  if (closes.length < 26) {
    console.warn(`[calculateMACD] Insufficient data: need 26, got ${closes.length} - returning 0`);
    return 0;
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macd = ema12 - ema26;

  console.log(`[calculateMACD] EMA12=${ema12.toFixed(4)}, EMA26=${ema26.toFixed(4)}, MACD=${macd.toFixed(4)}`);

  return macd;
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param klines - Array of kline data
 * @param period - RSI period (typically 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(klines: KlineData[], period: number): number {
  if (klines.length < period + 1) return 50;

  const closes = klines.map(k => k.close);
  const changes: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // Calculate subsequent averages
  for (let i = period; i < changes.length; i++) {
    if (changes[i] > 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Average True Range (ATR)
 * Measures market volatility
 * @param klines - Array of kline data
 * @param period - ATR period (typically 14)
 * @returns ATR value
 */
export function calculateATR(klines: KlineData[], period: number = 14): number {
  if (klines.length < period + 1) return 0;

  const trueRanges: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trueRanges.push(tr);
  }

  // Calculate average of last 'period' true ranges
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}
