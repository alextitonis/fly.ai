// ========================================
// AI Module Type Definitions
// ========================================

// Import and re-export AccountInfo from unified types
import type { AccountInfo } from '@/types';
export type { AccountInfo };

/**
 * Single trading decision from AI
 */
export interface Decision {
  symbol: string;
  action: 'open_long' | 'open_short' | 'close_long' | 'close_short' | 'hold' | 'wait';
  leverage?: number;
  position_size_usd?: number;
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;
  risk_usd?: number;
  price?: number; // Add price field for close actions
  reasoning: string;
}

/**
 * Complete AI decision with context
 */
export interface FullDecision {
  user_prompt: string;
  cot_trace: string; // Chain of Thought
  decisions: Decision[];
  timestamp: Date;
}

/**
 * Position information
 */
export interface PositionInfo {
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  mark_price: number;
  quantity: number;
  leverage: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  liquidation_price: number;
  margin_used: number;
  update_time: number; // milliseconds
}

/**
 * Market data for a single symbol
 */
export interface MarketData {
  symbol: string;
  current_price: number;

  // Price changes
  price_change_1h: number;
  price_change_4h: number;
  price_change_15m: number; // 新增 15m 价格变化

  // Multi-timeframe MACD (最关键 - 用于趋势共振判断)
  macd_15m: number;
  macd_1h: number;
  macd_4h: number;
  macd_1d: number; // 日线 MACD

  // Multi-timeframe RSI (用于防假突破检测)
  rsi_15m: number;
  rsi_1h: number;
  rsi_4h: number;
  rsi_1d: number; // 日线 RSI

  // EMA (用于趋势方向确认)
  ema20: number; // 当前价格对应的 EMA20

  // Volume (成交量)
  volume_24h: number;
  volume_avg_24h: number; // 24h 平均成交量（用于判断是否放量 >1.5x）

  // Open Interest (持仓量)
  oi_value: number; // 当前持仓量价值（百万美元）
  oi_change_pct: number; // OI 变化百分比（判断 >+5% 真实突破）

  // Market sentiment (市场情绪指标)
  buy_sell_ratio?: number; // 买卖比（可选，某些交易所可能没有）
  funding_rate?: number; // 资金费率（可选）

  // OHLC data (K线数据 - 用于形态判断)
  open: number;
  high: number;
  low: number;
  close: number;

  // Volatility (波动率)
  atr: number; // 平均真实波幅

  // 时间序列数据（15分钟时间框架，最近10个数据点，用于趋势分析和形态识别）
  price_series_15m?: number[];      // 价格序列（收盘价）
  macd_series_15m?: number[];       // MACD序列
  rsi_series_15m?: number[];        // RSI序列
  volume_series_15m?: number[];     // 成交量序列（百万USDT）
  ema20_series_15m?: number[];      // EMA20序列
  ema50_series_15m?: number[];      // EMA50序列

  // Legacy fields (保持兼容)
  current_macd: number; // 废弃：使用 macd_15m
  current_rsi7: number; // 废弃：使用 rsi_15m
  current_rsi14: number; // 废弃：使用 rsi_1h
}

/**
 * Trading context passed to AI
 */
export interface TradingContext {
  current_time: string;
  runtime_minutes: number;
  call_count: number;
  account: AccountInfo;
  positions: PositionInfo[];
  market_data_map: Record<string, MarketData>;
  sharpe_ratio?: number;
  btc_eth_leverage: number;
  altcoin_leverage: number;
  prompt_template?: string; // 提示词模板名称，默认 adaptive

  // 性能指标（完整的历史表现数据）
  performance?: {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    avg_profit: number;
    avg_loss: number;
    profit_factor: number;
    sharpe_ratio: number;
    max_drawdown: number;
    avg_holding_time_minutes: number;
  };
}

/**
 * AI API configuration
 */
export interface AIConfig {
  model: 'deepseek' | 'qwen' | 'kimi' | 'custom';
  apiKey: string;
  baseURL?: string;
  modelName?: string;
}
