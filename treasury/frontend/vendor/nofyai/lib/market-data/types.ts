// ========================================
// Market Data Type Definitions
// ========================================

/**
 * Kline (Candlestick) data structure from Binance API
 */
export interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;        // Base asset volume (e.g., BTC)
  closeTime: number;
  quoteVolume: number;   // Quote asset volume (e.g., USDT) - 用于成交量计算
}
