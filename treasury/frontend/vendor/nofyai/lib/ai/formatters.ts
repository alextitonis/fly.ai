// ========================================
// Data Formatting Functions
// ========================================

import type { MarketData } from './types';

/**
 * Format market data into human-readable text for AI
 * @param data - Market data object
 * @returns Formatted string
 */
export function formatMarketData(data: MarketData): string {
  const parts: string[] = [];

  parts.push(`**价格**: $${data.current_price.toFixed(4)}\n`);

  // 安全访问价格变化（可能为 undefined）
  const change15m = data.price_change_15m ?? 0;
  const change1h = data.price_change_1h ?? 0;
  const change4h = data.price_change_4h ?? 0;
  parts.push(
    `**涨跌**: 15m ${change15m >= 0 ? '+' : ''}${change15m.toFixed(2)}% | 1h ${change1h >= 0 ? '+' : ''}${change1h.toFixed(2)}% | 4h ${change4h >= 0 ? '+' : ''}${change4h.toFixed(2)}%\n`
  );

  // 多周期 MACD（趋势共振判断 - 优先级最高）
  const macd15m = data.macd_15m ?? data.current_macd ?? 0;
  const macd1h = data.macd_1h ?? 0;
  const macd4h = data.macd_4h ?? 0;
  const macd1d = data.macd_1d ?? 0;
  parts.push(
    `**MACD 多周期**: 15m ${macd15m.toFixed(4)} | 1h ${macd1h.toFixed(4)} | 4h ${macd4h.toFixed(4)} | 1d ${macd1d.toFixed(4)}\n`
  );

  // 多周期 RSI（防假突破检测）
  const rsi15m = data.rsi_15m ?? data.current_rsi7 ?? 50;
  const rsi1h = data.rsi_1h ?? data.current_rsi14 ?? 50;
  const rsi4h = data.rsi_4h ?? 50;
  const rsi1d = data.rsi_1d ?? 50;
  parts.push(
    `**RSI 多周期**: 15m ${rsi15m.toFixed(1)} | 1h ${rsi1h.toFixed(1)} | 4h ${rsi4h.toFixed(1)} | 1d ${rsi1d.toFixed(1)}\n`
  );

  // EMA20（趋势方向确认）
  const ema20 = data.ema20 ?? data.current_price;
  const priceDiff = Math.abs(data.current_price - ema20);
  const priceDiffPct = (priceDiff / ema20) * 100;

  parts.push(`**EMA20**: ${ema20.toFixed(4)}`);
  if (priceDiffPct < 0.01) {
    // Price is essentially equal to EMA20 (within 0.01%)
    parts.push(` (价格 = EMA20，震荡中性)\n`);
  } else if (data.current_price > ema20) {
    parts.push(` (价格 > EMA20，上升趋势)\n`);
  } else {
    parts.push(` (价格 < EMA20，下降趋势)\n`);
  }

  // 成交量（判断是否放量）
  const volumeAvg = data.volume_avg_24h ?? data.volume_24h;
  const volumeRatio = volumeAvg > 0 ? data.volume_24h / volumeAvg : 1;
  parts.push(`**24h成交量**: ${(data.volume_24h / 1e6).toFixed(2)}M | 均量: ${(volumeAvg / 1e6).toFixed(2)}M | 放量倍数: ${volumeRatio.toFixed(2)}x\n`);

  // 持仓量（OI）
  if (data.oi_value > 0) {
    const oiChangePct = data.oi_change_pct ?? 0;
    parts.push(`**持仓量**: ${data.oi_value.toFixed(2)}M USD | 变化率: ${oiChangePct >= 0 ? '+' : ''}${oiChangePct.toFixed(2)}%\n`);
  }

  // 资金费率（市场情绪）
  if (data.funding_rate !== undefined) {
    parts.push(`**资金费率**: ${data.funding_rate >= 0 ? '+' : ''}${(data.funding_rate * 100).toFixed(4)}%`);
    if (data.funding_rate > 0.01) {
      parts.push(` (多头贪婪)\n`);
    } else if (data.funding_rate < -0.01) {
      parts.push(` (空头恐慌)\n`);
    } else {
      parts.push(` (中性)\n`);
    }
  }

  // K线数据（OHLC - 用于形态判断）
  if (data.open !== undefined && data.high !== undefined && data.low !== undefined && data.close !== undefined) {
    const bodySize = Math.abs(data.close - data.open);
    const upperWick = data.high - Math.max(data.open, data.close);
    const lowerWick = Math.min(data.open, data.close) - data.low;
    const totalRange = data.high - data.low;

    parts.push(`**K线形态**: O ${data.open.toFixed(4)} | H ${data.high.toFixed(4)} | L ${data.low.toFixed(4)} | C ${data.close.toFixed(4)}\n`);
    parts.push(`  → 实体: ${bodySize.toFixed(4)} | 上影: ${upperWick.toFixed(4)} | 下影: ${lowerWick.toFixed(4)}`);

    // 判断形态类型
    if (bodySize / totalRange < 0.2 && totalRange > 0) {
      parts.push(` (十字星)\n`);
    } else if (upperWick > bodySize * 2) {
      parts.push(` (长上影)\n`);
    } else if (lowerWick > bodySize * 2) {
      parts.push(` (长下影)\n`);
    } else {
      parts.push(`\n`);
    }

    // ATR（波动率）
    if (data.atr !== undefined) {
      parts.push(`**ATR (波动率)**: ${data.atr.toFixed(4)}\n`);
    }
  }

  // 时间序列数据（15分钟时间框架，最近10个数据点，用于趋势分析和形态识别）
  if (data.price_series_15m && data.price_series_15m.length > 0) {
    parts.push('\n**📈 时间序列 (15分钟, 最近10个点)**\n');
    parts.push('⚠️ **时间顺序**: 从左到右 = 旧数据 → 新数据 (最右边是当前值)\n');
    parts.push(`**价格序列**: [${data.price_series_15m.map(p => p.toFixed(2)).join(', ')}]\n`);

    if (data.macd_series_15m && data.macd_series_15m.length > 0) {
      parts.push(`**MACD序列**: [${data.macd_series_15m.map(m => m.toFixed(4)).join(', ')}]\n`);
    }

    if (data.rsi_series_15m && data.rsi_series_15m.length > 0) {
      parts.push(`**RSI序列**: [${data.rsi_series_15m.map(r => r.toFixed(1)).join(', ')}]\n`);
    }

    if (data.volume_series_15m && data.volume_series_15m.length > 0) {
      // Convert back to raw values and use scientific notation to preserve precision
      // Use 4 significant digits for better precision on both small and large values
      parts.push(`**成交量序列**: [${data.volume_series_15m.map(v => (v * 1e6).toExponential(4)).join(', ')}]\n`);
    }

    if (data.ema20_series_15m && data.ema20_series_15m.length > 0) {
      parts.push(`**EMA20序列**: [${data.ema20_series_15m.map(e => e.toFixed(2)).join(', ')}]\n`);
    }

    if (data.ema50_series_15m && data.ema50_series_15m.length > 0) {
      parts.push(`**EMA50序列**: [${data.ema50_series_15m.map(e => e.toFixed(2)).join(', ')}]\n`);
    }
  }

  return parts.join('');
}
