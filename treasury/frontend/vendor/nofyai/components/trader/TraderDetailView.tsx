'use client';

import { useState } from 'react';
import {
  useStatus,
  useAccount,
  usePositions,
  useDecisionsInfinite,
  useEquityHistory,
  usePerformance,
  useClosedTrades,
} from '@/hooks/useTrading';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { EquityChart, TimeRange } from '@/components/trader/EquityChart';
import { DecisionDetailModal } from '@/components/trader/DecisionDetailModal';
import { PerformanceMetrics } from '@/components/trader/PerformanceMetrics';
import { LoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/hooks/useAuth';
import { formatUSD, formatPercent } from '@/lib/utils';
import { DecisionRecord } from '@/types';
import { useTranslations } from '@/lib/i18n-context';

interface TraderDetailViewProps {
  traderId: string;
  showHeader?: boolean; // Whether to show the control header (for standalone page)
}

export function TraderDetailView({ traderId, showHeader = false }: TraderDetailViewProps) {
  const t = useTranslations();
  const { isAuthenticated } = useAuth();
  const [selectedDecision, setSelectedDecision] = useState<DecisionRecord | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [chartTimeRange, setChartTimeRange] = useState<TimeRange>('7d');

  const { data: status } = useStatus(traderId);
  const { data: account } = useAccount(traderId);
  const { data: positions } = usePositions(traderId);
  const {
    decisions,
    isLoading: decisionsLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    pagination,
  } = useDecisionsInfinite(traderId, 20);
  const { data: equityHistory } = useEquityHistory(traderId);
  const { data: performance } = usePerformance(traderId);

  // ✅ NEW: Use dedicated closed trades endpoint
  const {
    trades: closedTrades,
    isLoading: tradesLoading,
    isLoadingMore: tradesLoadingMore,
    hasMore: tradesHasMore,
    loadMore: tradesLoadMore,
    pagination: tradesPagination,
  } = useClosedTrades(traderId, 20);

  if (!status || !account) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const isRunning = status.is_running;
  const isProfitable = account.total_pnl >= 0;

  return (
    <>
      {/* Not Started Banner */}
      {!isRunning && status.call_count === 0 && (
        <div className="mb-4 md:mb-6 p-3 md:p-4 bg-gradient-to-r from-primary/10 to-accent-purple/10 border-2 border-primary/30 rounded-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="text-2xl md:text-3xl">🚀</div>
              <div>
                <h3 className="text-sm md:text-base font-bold text-text-primary mb-1">
                  {t.trader.traderNotStartedTitle}
                </h3>
                <p className="text-[10px] md:text-xs text-text-secondary">
                  {t.trader.traderNotStartedDesc}
                </p>
              </div>
            </div>
            {isAuthenticated ? (
              <button
                onClick={async () => {
                  try {
                    await fetch(`/api/trade/start?trader_id=${traderId}`, { method: 'POST' });
                    window.location.reload();
                  } catch (error) {
                    alert(t.trader.failedToStartTrader);
                  }
                }}
                className="w-full sm:w-auto px-4 md:px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold text-xs md:text-sm whitespace-nowrap"
              >
                {t.trader.startTradingButton}
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="w-full sm:w-auto px-4 md:px-6 py-2 bg-background-secondary border border-border text-text-secondary rounded-lg hover:border-primary hover:text-primary transition-colors font-semibold text-xs md:text-sm whitespace-nowrap flex items-center justify-center gap-2"
              >
                <span>🔒</span>
                <span>{t.auth.loginToManage}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trader Header - Compact */}
      <div className="mb-3 md:mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-primary to-accent-purple flex items-center justify-center text-xl md:text-2xl shadow-lg flex-shrink-0">
              🤖
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-2xl font-bold text-text-primary truncate">{traderId}</h1>
              <div className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs text-text-secondary flex-wrap">
                <span>{t.trader.ai}: <span className="font-semibold text-primary">{status.ai_provider?.toUpperCase() || 'UNKNOWN'}</span></span>
                <span className="hidden sm:inline">•</span>
                <span>{t.trader.cyclesLabel}: {status.call_count || 0}</span>
                <span className="hidden sm:inline">•</span>
                <span>{t.trader.runtimeLabel}: {status.runtime_minutes || 0}m</span>
                <span className="hidden sm:inline">•</span>
                {/* Status Indicator */}
                <div className="flex items-center gap-1 md:gap-1.5">
                  <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isRunning ? 'bg-success animate-pulse' : 'bg-text-tertiary'}`}></div>
                  <span className={`font-medium ${isRunning ? 'text-success' : 'text-text-tertiary'}`}>
                    {isRunning ? t.trader.liveTrading : t.trader.offline}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Control Buttons - Only shown when showHeader=true and trader has been started at least once */}
          {showHeader && status.call_count > 0 && (
            <TooltipProvider>
              <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto overflow-x-auto pb-1">
                {!isAuthenticated ? (
                  // Login button when not authenticated
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="px-3 md:px-4 py-1.5 bg-background-secondary border border-border text-text-secondary rounded-lg hover:border-primary hover:text-primary transition-colors font-semibold text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap"
                  >
                    <span>🔒</span>
                    <span className="hidden sm:inline">{t.auth.loginToManage}</span>
                    <span className="sm:hidden">{t.nav.login}</span>
                  </button>
                ) : isRunning ? (
                  <>
                    {/* Stop Button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={async () => {
                            if (!confirm(t.trader.confirmStop)) {
                              return;
                            }
                            try {
                              const response = await fetch(`/api/trade/stop?trader_id=${traderId}`, {
                                method: 'POST',
                              });

                              if (!response.ok) {
                                const error = await response.json();
                                throw new Error(error.error || t.trader.failedToStopTrader);
                              }

                              alert(t.trader.traderStopped);
                              window.location.reload();
                            } catch (error) {
                              alert(error instanceof Error ? error.message : t.trader.failedToStopTrader);
                            }
                          }}
                          className="px-3 md:px-4 py-1.5 bg-warning text-white rounded-lg hover:bg-warning/90 transition-colors font-semibold text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap"
                        >
                          <span>⏸️</span>
                          <span className="hidden sm:inline">{t.trader.stopTrading}</span>
                          <span className="sm:hidden">Stop</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">停止自动交易循环，但保留现有持仓。可随时重新启动继续交易。</p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Emergency Stop */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={async () => {
                            if (!confirm(t.trader.confirmEmergencyStop)) {
                              return;
                            }
                            try {
                              const response = await fetch('/api/emergency-stop', {
                                method: 'POST',
                              });

                              if (!response.ok) {
                                const error = await response.json();
                                throw new Error(error.error || t.trader.failedToEmergencyStop);
                              }

                              alert(t.trader.emergencyStopComplete);
                              window.location.reload();
                            } catch (error) {
                              alert(error instanceof Error ? error.message : t.trader.failedToEmergencyStop);
                            }
                          }}
                          className="px-3 md:px-4 py-1.5 bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors font-semibold text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap"
                        >
                          <span>🚨</span>
                          <span className="hidden sm:inline">{t.trader.emergencyStop}</span>
                          <span className="sm:hidden">Emergency</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">⚠️ 紧急停止所有交易者并平掉全部持仓。用于市场异常或需要立即退出时。</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  // Start Button - shown when stopped after having run before
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/trade/start?trader_id=${traderId}`, {
                          method: 'POST',
                        });

                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || t.trader.failedToStartTrader);
                        }

                        alert(t.trader.traderStarted);
                        window.location.reload();
                      } catch (error) {
                        alert(error instanceof Error ? error.message : t.trader.failedToStartTrader);
                      }
                    }}
                    className="px-3 md:px-4 py-1.5 bg-success text-white rounded-lg hover:bg-success/90 transition-colors font-semibold text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap"
                  >
                    <span>▶️</span>
                    <span className="hidden sm:inline">{t.trader.startTrading}</span>
                    <span className="sm:hidden">Start</span>
                  </button>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Account Overview - Top Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-6">
        <Card className="p-2 md:p-3">
          <div className="text-[10px] md:text-xs text-text-secondary uppercase tracking-wider mb-1">{t.trader.totalEquity}</div>
          <div className="text-base md:text-xl font-bold text-text-primary truncate">{formatUSD(account.total_equity)}</div>
          <div className={`text-[10px] md:text-xs font-semibold ${isProfitable ? 'text-success' : 'text-danger'}`}>
            {formatPercent(account.total_pnl_pct)}
          </div>
        </Card>

        <Card className="p-2 md:p-3">
          <div className="text-[10px] md:text-xs text-text-secondary uppercase tracking-wider mb-1">{t.trader.available}</div>
          <div className="text-base md:text-xl font-bold text-text-primary truncate">{formatUSD(account.available_balance)}</div>
          <div className="text-[10px] md:text-xs text-text-tertiary">
            {account.total_equity > 0
              ? `${((account.available_balance / account.total_equity) * 100).toFixed(1)}% ${t.trader.free}`
              : `100% ${t.trader.free}`
            }
          </div>
        </Card>

        <Card className="p-2 md:p-3">
          <div className="text-[10px] md:text-xs text-text-secondary uppercase tracking-wider mb-1">{t.trader.totalPnL}</div>
          <div className={`text-base md:text-xl font-bold ${isProfitable ? 'text-success' : 'text-danger'} truncate`}>
            {isProfitable ? '+' : ''}{formatUSD(account.total_pnl)}
          </div>
          <div className={`text-[10px] md:text-xs font-semibold ${isProfitable ? 'text-success' : 'text-danger'}`}>
            {formatPercent(account.total_pnl_pct)}
          </div>
        </Card>

        <Card className="p-2 md:p-3">
          <div className="text-[10px] md:text-xs text-text-secondary uppercase tracking-wider mb-1">{t.trader.positions}</div>
          <div className="text-base md:text-xl font-bold text-text-primary">{account.position_count}</div>
          <div className="text-[10px] md:text-xs text-text-tertiary">
            {t.trader.margin}: {(account.margin_used_pct || 0).toFixed(1)}%
          </div>
        </Card>
      </div>

      {/* Two Column Layout - Adjusted ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        {/* LEFT COLUMN - Performance & Decisions Tabs (2/5 width) */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <Card className="overflow-hidden h-full">
            <Tabs defaultValue="performance">
              <TabsList className="w-full text-xs md:text-sm">
                <TabsTrigger value="performance" className="flex-1">{t.trader.performance}</TabsTrigger>
                <TabsTrigger value="decisions" className="flex-1">{t.trader.decisions}</TabsTrigger>
              </TabsList>

              {/* Performance Tab */}
              <TabsContent value="performance" className="p-2 md:p-4">
                {performance ? (
                  <PerformanceMetrics performance={performance} />
                ) : (
                  <div className="text-center py-8 md:py-12 text-text-tertiary">
                    <div className="text-3xl md:text-4xl mb-2">📊</div>
                    <div className="text-xs md:text-sm">{t.trader.loadingPerformance}</div>
                  </div>
                )}
              </TabsContent>

              {/* Decisions Tab */}
              <TabsContent value="decisions" className="p-2 md:p-4">
                {decisions && decisions.length > 0 ? (
                  <>
                    {/* Pagination info */}
                    {pagination && (
                      <div className="mb-3 flex items-center justify-between text-[10px] md:text-xs text-text-secondary">
                        <span>
                          {t.trader.showingDecisions || '显示'} {decisions.length} / {pagination.total_count} {t.trader.decisionsCount || '条决策'}
                        </span>
                      </div>
                    )}
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {decisions.map((decision, i) => (
                        <div
                          key={i}
                          className="p-3 bg-background-secondary rounded-lg border border-border hover:border-primary/50 transition-all cursor-pointer"
                          onClick={() => setSelectedDecision(decision)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-semibold text-text-primary text-sm">{t.trader.cycle} #{decision.cycle_number}</span>
                              <span className="text-xs text-text-secondary ml-2">
                                {new Date(decision.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <Badge variant={decision.success ? 'success' : 'danger'}>
                              {decision.success ? t.trader.success : t.trader.failed}
                            </Badge>
                          </div>
                          {decision.decisions && decision.decisions.length > 0 && (
                            <div className="text-xs text-text-secondary mb-1">
                              {decision.decisions.length} {t.trader.actions}
                            </div>
                          )}
                          {decision.cot_trace && (
                            <div className="text-xs text-text-tertiary truncate">
                              💭 {decision.cot_trace.substring(0, 100)}...
                            </div>
                          )}
                        </div>
                      ))}

                    {/* Load More Button */}
                    {hasMore && (
                      <div className="mt-3 flex justify-center">
                        <button
                          onClick={loadMore}
                          disabled={isLoadingMore}
                          className="px-4 md:px-6 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-semibold text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoadingMore ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                              {t.trader.loading || '加载中...'}
                            </span>
                          ) : (
                            <span>{t.trader.loadMore || '加载更多'}</span>
                          )}
                        </button>
                      </div>
                    )}

                    {/* End of list indicator */}
                    {!hasMore && decisions.length > 20 && (
                      <div className="mt-3 text-center text-xs text-text-tertiary">
                        {t.trader.allDecisionsLoaded || '已加载全部决策'}
                      </div>
                    )}
                  </div>
                </>
                ) : decisionsLoading ? (
                  <div className="text-center py-8 md:py-12 text-text-tertiary">
                    <div className="text-3xl md:text-4xl mb-2">⏳</div>
                    <div className="text-xs md:text-sm">{t.trader.loading || '加载中...'}</div>
                  </div>
                ) : (
                  <div className="text-center py-8 md:py-12 text-text-tertiary">
                    <div className="text-3xl md:text-4xl mb-2">🧠</div>
                    <div className="font-semibold mb-1 text-xs md:text-sm">{t.trader.noDecisionsYet}</div>
                    <div className="text-[10px] md:text-xs">{t.trader.decisionsWillAppear}</div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* RIGHT COLUMN - Chart & Positions (3/5 width) */}
        <div className="lg:col-span-3 space-y-4 md:space-y-6">
          {/* Equity Chart - Large */}
          <Card className="p-2 md:p-4">
            {/* Title and Time Selector in same row */}
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <h3 className="text-xs md:text-sm font-bold text-text-primary">{t.trader.equityPerformance}</h3>
              {/* Time Range Selector */}
              {equityHistory && equityHistory.length > 0 && (
                <div className="flex gap-1 bg-background-secondary rounded-lg p-1">
                  {(['24h', '7d', '30d', 'all'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setChartTimeRange(range)}
                      className={`px-2 md:px-3 py-1 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                        chartTimeRange === range
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-text-tertiary hover:text-text-secondary'
                      }`}
                    >
                      {range === 'all' ? 'All' : range.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {equityHistory && equityHistory.length > 0 ? (
              <EquityChart
                data={equityHistory}
                initialBalance={status.initial_balance}
                timeRange={chartTimeRange}
                onTimeRangeChange={setChartTimeRange}
                showTimeSelector={false}
              />
            ) : (
              <div className="h-[200px] md:h-[400px] flex items-center justify-center text-text-tertiary">
                <div className="text-center">
                  <div className="text-3xl md:text-5xl mb-2 md:mb-3 opacity-30">📈</div>
                  <div className="text-xs md:text-sm font-semibold mb-1">{t.trader.noEquityHistory}</div>
                  <div className="text-[10px] md:text-xs">{t.trader.chartWillAppear}</div>
                </div>
              </div>
            )}
          </Card>

          {/* Positions Table - Compact */}
          <Card className="p-2 md:p-4">
            <h3 className="text-xs md:text-sm font-bold text-text-primary mb-2 md:mb-3">{t.trader.currentPositions}</h3>
            {positions && positions.length > 0 ? (
              <div className="overflow-x-auto -mx-3 md:mx-0">
                <table className="w-full text-[10px] md:text-xs min-w-[600px] md:min-w-0">
                  <thead className="border-b border-border">
                    <tr className="text-left">
                      <th className="pb-2 font-semibold text-text-secondary px-2 md:px-0">{t.trader.symbol}</th>
                      <th className="pb-2 font-semibold text-text-secondary px-2 md:px-0">{t.trader.side}</th>
                      <th className="pb-2 font-semibold text-text-secondary px-2 md:px-0">{t.trader.entryPrice}</th>
                      <th className="pb-2 font-semibold text-text-secondary px-2 md:px-0">{t.trader.lev}</th>
                      <th className="pb-2 font-semibold text-text-secondary text-right px-2 md:px-0">{t.trader.unrealizedPnL}</th>
                      <th className="pb-2 font-semibold text-text-secondary text-center px-2 md:px-0">{t.trader.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 font-semibold px-2 md:px-0">{pos.symbol}</td>
                        <td className="py-2 px-2 md:px-0">
                          <Badge variant={pos.side === 'long' ? 'success' : 'danger'} className="text-[9px] md:text-[10px]">
                            {pos.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2 font-mono px-2 md:px-0">{formatUSD(pos.entry_price)}</td>
                        <td className="py-2 font-semibold text-primary px-2 md:px-0">{pos.leverage}x</td>
                        <td className={`py-2 text-right ${pos.unrealized_pnl >= 0 ? 'text-success' : 'text-danger'} px-2 md:px-0`}>
                          <div className="font-semibold">
                            {pos.unrealized_pnl >= 0 ? '+' : ''}{formatUSD(pos.unrealized_pnl)}
                          </div>
                          <div className="text-[9px] md:text-xs opacity-75">
                            ({formatPercent(pos.unrealized_pnl_pct)})
                          </div>
                        </td>
                        <td className="py-2 text-center px-2 md:px-0">
                          {isAuthenticated ? (
                            <button
                              onClick={async () => {
                                if (!confirm(t.trader.confirmClosePosition.replace('{side}', pos.side).replace('{symbol}', pos.symbol))) {
                                  return;
                                }
                                try {
                                  const response = await fetch('/api/positions/close', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      trader_id: traderId,
                                      symbol: pos.symbol,
                                      side: pos.side,
                                    }),
                                  });

                                  if (!response.ok) {
                                    const error = await response.json();
                                    throw new Error(error.error || t.trader.failedToClosePosition);
                                  }

                                  window.location.reload();
                                } catch (error) {
                                  alert(error instanceof Error ? error.message : t.trader.failedToClosePosition);
                                }
                              }}
                              className="px-2 md:px-3 py-1 bg-danger/10 text-danger hover:bg-danger hover:text-white rounded transition-colors font-semibold text-[9px] md:text-xs"
                            >
                              {t.trader.close}
                            </button>
                          ) : (
                            <button
                              onClick={() => setShowLoginModal(true)}
                              className="px-2 md:px-3 py-1 bg-background-secondary border border-border text-text-secondary hover:border-primary hover:text-primary rounded transition-colors text-[9px] md:text-xs font-semibold"
                            >
                              🔒
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 md:py-8 text-text-tertiary">
                <div className="text-3xl md:text-4xl mb-2 opacity-30">📊</div>
                <div className="text-[10px] md:text-xs">{t.trader.noActivePositions}</div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Trading History Section */}
      <div className="w-full py-4 md:py-6">
        <Card className="p-4 md:p-6">
          <h3 className="text-base md:text-lg font-bold text-text-primary mb-4 md:mb-6">{t.trader.tradingHistory}</h3>

          {closedTrades && closedTrades.length > 0 ? (
            <>
              {/* Pagination info */}
              {tradesPagination && (
                <div className="mb-4 flex items-center justify-between text-xs md:text-sm text-text-secondary">
                  <span>
                    {t.trader.showingDecisions || '显示'} {closedTrades.length} / {tradesPagination.total_count} {t.trader.tradesCount}
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {closedTrades.map((trade) => {
                  const actionLabel = trade.action === 'close_long' ? t.trader.closeLong : t.trader.closeShort;
                  const actionType: 'buy' | 'sell' = trade.action === 'close_short' ? 'buy' : 'sell';
                  const isProfitable = trade.pnl >= 0;

                  // Format holding time
                  const formatHoldingTime = (minutes: number) => {
                    if (minutes < 60) {
                      return `${Math.round(minutes)}m`;
                    } else if (minutes < 1440) {
                      const hours = Math.floor(minutes / 60);
                      const mins = Math.round(minutes % 60);
                      return `${hours}h ${mins}m`;
                    } else {
                      const days = Math.floor(minutes / 1440);
                      const hours = Math.floor((minutes % 1440) / 60);
                      return `${days}d ${hours}h`;
                    }
                  };

                  return (
                    <div
                      key={trade.id}
                      className={`relative p-3 md:p-4 bg-gradient-to-br rounded-lg border transition-all duration-200 hover:shadow-md ${
                        isProfitable
                          ? 'from-success/5 to-background-secondary border-success/20 hover:border-success/40'
                          : 'from-danger/5 to-background-secondary border-danger/20 hover:border-danger/40'
                      }`}
                    >
                      {/* Header Row - Symbol, Side, and PnL */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {/* Side Indicator */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold ${
                            trade.side === 'long'
                              ? 'bg-gradient-to-br from-success/20 to-success/10 text-success'
                              : 'bg-gradient-to-br from-danger/20 to-danger/10 text-danger'
                          }`}>
                            {trade.side === 'long' ? '📈' : '📉'}
                          </div>

                          {/* Symbol and Action */}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-base md:text-lg font-bold text-text-primary">
                                {trade.symbol}
                              </span>
                              <Badge
                                variant={trade.side === 'long' ? 'success' : 'danger'}
                                className="text-[10px] font-semibold px-1.5 py-0"
                              >
                                {trade.side.toUpperCase()}
                              </Badge>
                              <span className="text-[10px] text-text-tertiary">#{trade.cycle_number}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-text-secondary mt-0.5">
                              <span>⏱️ {formatHoldingTime(trade.holding_time_minutes)}</span>
                              <span>•</span>
                              <span>{new Date(trade.close_time).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* PnL Badge - Compact */}
                        <div className={`text-right px-2.5 py-1.5 rounded-md ${
                          isProfitable ? 'bg-success/10' : 'bg-danger/10'
                        }`}>
                          <div className={`text-base md:text-lg font-bold ${isProfitable ? 'text-success' : 'text-danger'}`}>
                            {isProfitable ? '+' : ''}{formatUSD(trade.pnl)}
                          </div>
                          <div className={`text-xs font-semibold ${isProfitable ? 'text-success' : 'text-danger'}`}>
                            {formatPercent(trade.pnl_pct)}
                          </div>
                        </div>
                      </div>

                      {/* Trading Details Grid - Compact */}
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        <div className="bg-background-primary/50 rounded p-2">
                          <div className="text-[9px] text-text-tertiary mb-0.5">{t.trader.entryPrice}</div>
                          <div className="text-xs md:text-sm font-bold text-text-primary font-mono">
                            {formatUSD(trade.entry_price)}
                          </div>
                        </div>
                        <div className="bg-background-primary/50 rounded p-2">
                          <div className="text-[9px] text-text-tertiary mb-0.5">{t.trader.exitPrice}</div>
                          <div className="text-xs md:text-sm font-bold text-text-primary font-mono">
                            {formatUSD(trade.exit_price)}
                          </div>
                        </div>
                        <div className="bg-background-primary/50 rounded p-2">
                          <div className="text-[9px] text-text-tertiary mb-0.5">{t.trader.quantity}</div>
                          <div className="text-xs md:text-sm font-bold text-text-primary">
                            {trade.quantity.toFixed(4)}
                          </div>
                        </div>
                        <div className="bg-background-primary/50 rounded p-2">
                          <div className="text-[9px] text-text-tertiary mb-0.5">{t.trader.lev}</div>
                          <div className="text-xs md:text-sm font-bold text-primary">
                            {trade.leverage}x
                          </div>
                        </div>
                      </div>

                      {/* AI Reasoning - Compact */}
                      {trade.reasoning && (
                        <div className="bg-primary/5 border-l-2 border-primary rounded-r p-2">
                          <div className="flex items-start gap-1.5">
                            <span className="text-sm mt-0.5">🤖</span>
                            <div className="flex-1">
                              <div className="text-[10px] font-bold text-primary mb-0.5 uppercase tracking-wide">
                                {t.trader.aiReasoning}
                              </div>
                              <div className="text-xs text-text-primary leading-snug">
                                {trade.reasoning}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Load More Button */}
                {tradesHasMore && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={tradesLoadMore}
                      disabled={tradesLoadingMore}
                      className="px-6 md:px-8 py-3 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-semibold text-sm md:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {tradesLoadingMore ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                          {t.trader.loading || '加载中...'}
                        </span>
                      ) : (
                        <span>{t.trader.loadMore || '加载更多'}</span>
                      )}
                    </button>
                  </div>
                )}

                {/* End of list indicator */}
                {!tradesHasMore && closedTrades.length > 20 && (
                  <div className="mt-6 text-center text-sm text-text-tertiary">
                    {t.trader.allTradesLoaded}
                  </div>
                )}
              </div>
            </>
          ) : tradesLoading ? (
            <div className="text-center py-12 md:py-16 text-text-tertiary">
              <div className="text-4xl md:text-5xl mb-3">⏳</div>
              <div className="text-sm md:text-base">{t.trader.loading || '加载中...'}</div>
            </div>
          ) : (
            <div className="text-center py-12 md:py-16 text-text-tertiary">
              <div className="text-4xl md:text-5xl mb-3">📊</div>
              <div className="font-semibold mb-2 text-sm md:text-base">{t.trader.noTradesYet}</div>
              <div className="text-xs md:text-sm">{t.trader.tradesWillAppear}</div>
            </div>
          )}
        </Card>
      </div>

      {/* Decision Detail Modal */}
      <DecisionDetailModal
        decision={selectedDecision}
        onClose={() => setSelectedDecision(null)}
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={() => {
          setShowLoginModal(false);
          window.location.reload();
        }}
      />
    </>
  );
}
