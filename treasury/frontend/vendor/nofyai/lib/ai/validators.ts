// ========================================
// Decision Validation Functions
// ========================================

import type { Decision } from './types';

/**
 * Validate a trading decision
 * @param decision - Decision to validate
 * @param accountEquity - Current account equity
 * @param btcEthLeverage - Max leverage for BTC/ETH
 * @param altcoinLeverage - Max leverage for altcoins
 * @returns Error message if invalid, null if valid
 */
export function validateDecision(
  decision: Decision,
  accountEquity: number,
  btcEthLeverage: number,
  altcoinLeverage: number
): string | null {
  const validActions = [
    'open_long',
    'open_short',
    'close_long',
    'close_short',
    'hold',
    'wait',
  ];

  if (!validActions.includes(decision.action)) {
    return `无效的action: ${decision.action}`;
  }

  // 开仓操作必须提供完整参数
  if (decision.action === 'open_long' || decision.action === 'open_short') {
    const isBTCETH = decision.symbol === 'BTCUSDT' || decision.symbol === 'ETHUSDT';
    const maxLeverage = isBTCETH ? btcEthLeverage : altcoinLeverage;
    const maxPositionValue = isBTCETH ? accountEquity * 10 : accountEquity * 1.5;

    if (!decision.leverage || decision.leverage <= 0 || decision.leverage > maxLeverage) {
      return `杠杆必须在1-${maxLeverage}之间（${decision.symbol}，当前配置上限${maxLeverage}倍）: ${decision.leverage}`;
    }

    if (!decision.position_size_usd || decision.position_size_usd <= 0) {
      return `仓位大小必须大于0: ${decision.position_size_usd}`;
    }

    // 验证仓位价值上限（1%容差）
    const tolerance = maxPositionValue * 0.01;
    if (decision.position_size_usd > maxPositionValue + tolerance) {
      if (isBTCETH) {
        return `BTC/ETH单币种仓位价值不能超过${maxPositionValue.toFixed(0)} USDT（10倍账户净值），实际: ${decision.position_size_usd.toFixed(0)}`;
      } else {
        return `山寨币单币种仓位价值不能超过${maxPositionValue.toFixed(0)} USDT（1.5倍账户净值），实际: ${decision.position_size_usd.toFixed(0)}`;
      }
    }

    if (!decision.stop_loss || decision.stop_loss <= 0) {
      return '止损必须大于0';
    }

    if (!decision.take_profit || decision.take_profit <= 0) {
      return '止盈必须大于0';
    }

    // 验证止损止盈合理性
    if (decision.action === 'open_long') {
      if (decision.stop_loss >= decision.take_profit) {
        return '做多时止损价必须小于止盈价';
      }
    } else {
      if (decision.stop_loss <= decision.take_profit) {
        return '做空时止损价必须大于止盈价';
      }
    }

    // 验证风险回报比（≥3:1）
    let entryPrice: number;
    let riskPercent: number;
    let rewardPercent: number;

    if (decision.action === 'open_long') {
      entryPrice = decision.stop_loss + (decision.take_profit - decision.stop_loss) * 0.2;
      riskPercent = ((entryPrice - decision.stop_loss) / entryPrice) * 100;
      rewardPercent = ((decision.take_profit - entryPrice) / entryPrice) * 100;
    } else {
      entryPrice = decision.stop_loss - (decision.stop_loss - decision.take_profit) * 0.2;
      riskPercent = ((decision.stop_loss - entryPrice) / entryPrice) * 100;
      rewardPercent = ((entryPrice - decision.take_profit) / entryPrice) * 100;
    }

    const riskRewardRatio = riskPercent > 0 ? rewardPercent / riskPercent : 0;

    if (riskRewardRatio < 3.0) {
      return `风险回报比过低(${riskRewardRatio.toFixed(2)}:1)，必须≥3.0:1 [风险:${riskPercent.toFixed(2)}% 收益:${rewardPercent.toFixed(2)}%] [止损:${decision.stop_loss.toFixed(2)} 止盈:${decision.take_profit.toFixed(2)}]`;
    }
  }

  return null; // Valid
}
