// ========================================
// Time Series Calculation Functions
// ========================================
// Calculate indicator series (arrays) for trend analysis

import type { KlineData } from './types';

/**
 * Calculate EMA series for the most recent N points
 * Returns array of EMA values for the last N data points
 * @param prices - Array of price values
 * @param period - EMA period (e.g., 20, 50)
 * @param seriesLength - Number of recent points to return (default 10)
 * @returns Array of EMA values
 */
export function calculateEMASeries(prices: number[], period: number, seriesLength: number = 10): number[] {
  if (prices.length < period) return [];

  const multiplier = 2 / (period + 1);
  const series: number[] = [];

  // Calculate initial EMA
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

  // Calculate EMA for each point
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
    // Only save the last seriesLength points
    if (i >= prices.length - seriesLength) {
      series.push(ema);
    }
  }

  return series;
}

/**
 * Calculate MACD series for the most recent N points
 * @param klines - Array of kline data
 * @param seriesLength - Number of recent points to return (default 10)
 * @returns Array of MACD values
 */
export function calculateMACDSeries(klines: KlineData[], seriesLength: number = 10): number[] {
  const closes = klines.map(k => k.close);
  if (closes.length < 26) return [];

  const multiplier12 = 2 / 13;
  const multiplier26 = 2 / 27;
  const series: number[] = [];

  // Calculate initial EMAs
  let ema12 = closes.slice(0, 12).reduce((sum, p) => sum + p, 0) / 12;
  let ema26 = closes.slice(0, 26).reduce((sum, p) => sum + p, 0) / 26;

  // Calculate MACD for each point after initial period
  for (let i = 26; i < closes.length; i++) {
    // Update EMA12
    ema12 = (closes[i] - ema12) * multiplier12 + ema12;
    // Update EMA26
    ema26 = (closes[i] - ema26) * multiplier26 + ema26;

    const macd = ema12 - ema26;

    // Only save the last seriesLength points
    if (i >= closes.length - seriesLength) {
      series.push(macd);
    }
  }

  return series;
}

/**
 * Calculate RSI series for the most recent N points
 * @param klines - Array of kline data
 * @param period - RSI period (typically 14)
 * @param seriesLength - Number of recent points to return (default 10)
 * @returns Array of RSI values
 */
export function calculateRSISeries(klines: KlineData[], period: number, seriesLength: number = 10): number[] {
  if (klines.length < period + 1) return [];

  const closes = klines.map(k => k.close);
  const changes: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  const series: number[] = [];
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

  // Calculate RSI for each subsequent point
  for (let i = period; i < changes.length; i++) {
    if (changes[i] > 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    // Only save the last seriesLength points
    if (i >= changes.length - seriesLength) {
      series.push(rsi);
    }
  }

  return series;
}
