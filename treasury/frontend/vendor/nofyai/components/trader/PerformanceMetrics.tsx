'use client';

import { PerformanceAnalysis } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUSD, formatPercent } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n-context';

interface PerformanceMetricsProps {
  performance: PerformanceAnalysis;
}

export function PerformanceMetrics({ performance }: PerformanceMetricsProps) {
  const t = useTranslations();
  const hasData = performance.total_trades > 0;
  const hasSufficientData = performance.total_trades >= 10; // 至少10笔交易才有统计意义

  // 判断夏普比率等级（考虑样本量）
  const getSharpeRating = (sharpe: number, trades: number) => {
    if (!hasData) return { label: t.trader.noData, color: 'text-text-tertiary', bgColor: 'bg-background-secondary' };
    if (trades < 10) return { label: t.trader.limitedSample, color: 'text-text-secondary', bgColor: 'bg-background-secondary' };
    if (sharpe > 1.5) return { label: t.trader.excellent, color: 'text-success', bgColor: 'bg-success/10' };
    if (sharpe > 0.5) return { label: t.trader.good, color: 'text-success', bgColor: 'bg-success/10' };
    if (sharpe > 0) return { label: t.trader.positive, color: 'text-success', bgColor: 'bg-success/10' };
    if (sharpe > -0.5) return { label: t.trader.slightLoss, color: 'text-warning', bgColor: 'bg-warning/10' };
    if (sharpe > -1.5) return { label: t.trader.needsImprovement, color: 'text-warning', bgColor: 'bg-warning/10' };
    return { label: t.trader.consistentLoss, color: 'text-danger', bgColor: 'bg-danger/10' };
  };

  // 获取Sharpe建议
  const getSharpeAdvice = (sharpe: number, trades: number) => {
    if (!hasData) return t.trader.adviceNoData;
    if (trades < 5) return t.trader.adviceTooFewTrades;
    if (trades < 10) return t.trader.adviceFewTrades;
    if (sharpe > 1.5) return t.trader.adviceExcellent;
    if (sharpe > 0.5) return t.trader.adviceGood;
    if (sharpe > 0) return t.trader.advicePositive;
    if (sharpe > -0.5) return t.trader.adviceSlightLoss;
    if (sharpe > -1.5) return t.trader.adviceNeedsImprovement;
    return t.trader.adviceConsistentLoss;
  };

  const sharpeRating = getSharpeRating(performance.sharpe_ratio, performance.total_trades);
  const sharpeAdvice = getSharpeAdvice(performance.sharpe_ratio, performance.total_trades);

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Info Banner */}
      <div className="p-2 md:p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-start gap-1.5 md:gap-2">
          <span className="text-xs md:text-sm">ℹ️</span>
          <div className="text-[10px] md:text-xs text-text-secondary">
            {t.trader.performanceNote}
          </div>
        </div>
      </div>

      {/* Warning Banner - System is Losing Money */}
      {hasData && performance.profit_factor < 1.0 && (
        <div className="p-2 md:p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <div className="flex items-start gap-1.5 md:gap-2">
            <span className="text-xs md:text-sm">⚠️</span>
            <div className="text-[10px] md:text-xs">
              <div className="font-semibold text-warning mb-1">
                System is Currently Losing Money
              </div>
              <div className="text-text-secondary">
                Profit Factor {performance.profit_factor.toFixed(2)}x &lt; 1.0 means average losses exceed average profits.
                Total P&L: {formatUSD((performance.avg_profit * performance.winning_trades) - (Math.abs(performance.avg_loss) * performance.losing_trades))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid - Compact 2 column */}
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        {/* Sharpe Ratio - 最重要的指标 */}
        <Card className={`p-3 md:p-4 ${sharpeRating.bgColor} border-2 ${sharpeRating.color.replace('text-', 'border-')}/30 col-span-2`}>
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider">
              {t.trader.sharpeRatio} {performance.total_trades < 10 && hasData && `(${performance.total_trades} ${t.trader.tradesCount})`}
            </div>
            <Badge variant={hasSufficientData && performance.sharpe_ratio > 0 ? 'success' : hasSufficientData && performance.sharpe_ratio < -0.5 ? 'danger' : 'secondary'} className="text-[9px] md:text-xs">
              {sharpeRating.label}
            </Badge>
          </div>
          <div className={`text-2xl md:text-3xl font-bold ${sharpeRating.color} mb-1`}>
            {hasData ? performance.sharpe_ratio.toFixed(2) : '--'}
          </div>
          <div className="text-[10px] md:text-xs text-text-secondary">
            {sharpeAdvice}
          </div>
        </Card>

        {/* Win Rate */}
        <Card className="p-2 md:p-4">
          <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1">{t.trader.winRate}</div>
          <div className="text-lg md:text-2xl font-bold text-text-primary mb-1">
            {formatPercent(performance.win_rate)}
          </div>
          <div className="flex items-center justify-between text-[9px] md:text-xs text-text-secondary">
            <span>{performance.winning_trades}W</span>
            <span>•</span>
            <span>{performance.losing_trades}L</span>
          </div>
        </Card>

        {/* Profit Factor */}
        <Card className="p-2 md:p-4">
          <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1">{t.trader.profitFactor}</div>
          <div className={`text-lg md:text-2xl font-bold mb-1 ${performance.profit_factor >= 1.5 ? 'text-success' : performance.profit_factor >= 1 ? 'text-text-primary' : 'text-danger'}`}>
            {performance.profit_factor.toFixed(2)}x
          </div>
          <div className="text-[9px] md:text-xs text-text-secondary">
            {!hasData ? t.trader.profitFactorAwaitingData :
             performance.profit_factor >= 1.5 ? t.trader.profitFactorExcellent :
             performance.profit_factor >= 1 ? t.trader.profitFactorPositive :
             t.trader.profitFactorInsufficient}
          </div>
        </Card>

        {/* Average Profit */}
        <Card className="p-2 md:p-4">
          <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1">{t.trader.avgProfit}</div>
          <div className="text-base md:text-xl font-bold text-success mb-1">
            +{formatUSD(performance.avg_profit)}
          </div>
          <div className="text-[9px] md:text-xs text-text-secondary">
            {t.trader.perWin}
          </div>
        </Card>

        {/* Average Loss */}
        <Card className="p-2 md:p-4">
          <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1">{t.trader.avgLoss}</div>
          <div className="text-base md:text-xl font-bold text-danger mb-1">
            {formatUSD(performance.avg_loss)}
          </div>
          <div className="text-[9px] md:text-xs text-text-secondary">
            {t.trader.perLoss}
          </div>
        </Card>

        {/* Max Drawdown */}
        <Card className="p-2 md:p-4">
          <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1">{t.trader.maxDrawdown}</div>
          <div className={`text-base md:text-xl font-bold mb-1 ${Math.abs(performance.max_drawdown) > 20 ? 'text-danger' : hasData ? 'text-warning' : 'text-text-tertiary'}`}>
            {formatPercent(performance.max_drawdown)}
          </div>
          <div className="text-[9px] md:text-xs text-text-secondary">
            {!hasData ? t.trader.maxDrawdownNoData :
             Math.abs(performance.max_drawdown) > 20 ? t.trader.maxDrawdownHighRisk : t.trader.maxDrawdownAcceptable}
          </div>
        </Card>

        {/* Total Trades */}
        <Card className="p-2 md:p-4">
          <div className="text-[10px] md:text-xs text-text-tertiary uppercase tracking-wider mb-1">{t.trader.totalTrades}</div>
          <div className="text-base md:text-xl font-bold text-text-primary mb-1">
            {performance.total_trades}
          </div>
          <div className="text-[9px] md:text-xs text-text-secondary">
            {t.trader.completed}
          </div>
        </Card>
      </div>
    </div>
  );
}
