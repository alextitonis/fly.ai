'use client';

type TraderSummary = { trader_id: string; trader_name: string; ai_model: string; exchange: string; total_equity: number; total_pnl: number; total_pnl_pct: number; win_rate: number; total_trades: number; sharpe_ratio: number; is_running: boolean; ranking: number; initial_balance: number; position_count: number; };

interface LeaderboardTableProps {
  traders: TraderSummary[];
}

export default function LeaderboardTable({ traders }: LeaderboardTableProps) {
  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPnL = (pct: number) => {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };

  const getModelBadgeColor = (aiModel: string) => {
    const colors: Record<string, string> = {
      qwen: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      deepseek: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      custom: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    };
    return colors[aiModel] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  };

  const getSharpeGrade = (sharpe: number, totalTrades: number) => {
    if (totalTrades < 10) return { label: 'Limited', color: 'text-gray-500' };
    if (sharpe > 1.5) return { label: 'Excellent', color: 'text-green-400' };
    if (sharpe > 0.5) return { label: 'Good', color: 'text-green-400' };
    if (sharpe > 0) return { label: 'Positive', color: 'text-blue-400' };
    if (sharpe > -0.5) return { label: 'Slight Loss', color: 'text-orange-400' };
    if (sharpe > -1.5) return { label: 'Needs Work', color: 'text-red-400' };
    return { label: 'Poor', color: 'text-red-500' };
  };

  if (traders.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center text-gray-500">
        No traders available
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/50">
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Rank
              </th>
              <th className="text-left py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Trader
              </th>
              <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Equity
              </th>
              <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Return
              </th>
              <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Sharpe
              </th>
              <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Win Rate
              </th>
              <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Trades
              </th>
              <th className="text-center py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {traders.map((trader, index) => {
              const sharpeGrade = getSharpeGrade(trader.sharpe_ratio, trader.total_trades);
              const isTop3 = index < 3;
              
              return (
                <tr
                  key={trader.trader_id}
                  className={`border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${
                    isTop3 ? 'bg-gray-800/20' : ''
                  }`}
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      {isTop3 && (
                        <span className="text-xl">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                        </span>
                      )}
                      <span className="text-lg font-bold text-white">
                        #{trader.ranking}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div
                      className="flex flex-col gap-1 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="text-sm font-medium text-white">
                        {trader.trader_name}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 rounded text-xs font-mono border ${getModelBadgeColor(trader.ai_model)}`}>
                          {trader.ai_model.toUpperCase()}
                        </div>
                        <span className="text-xs text-gray-500">
                          {trader.exchange}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="text-base font-mono text-white">
                      ${formatNumber(trader.total_equity)}
                    </div>
                    <div className="text-xs text-gray-500">
                      from ${formatNumber(trader.initial_balance)}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className={`text-base font-mono font-bold ${
                      trader.total_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatPnL(trader.total_pnl_pct)}
                    </div>
                    <div className={`text-xs ${
                      trader.total_pnl >= 0 ? 'text-green-400/70' : 'text-red-400/70'
                    }`}>
                      ${formatNumber(trader.total_pnl)}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="text-base font-mono text-white">
                      {trader.sharpe_ratio.toFixed(2)}
                    </div>
                    <div className={`text-xs ${sharpeGrade.color}`}>
                      {sharpeGrade.label}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="text-base font-mono text-white">
                      {trader.win_rate.toFixed(1)}%
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="text-base font-mono text-white">
                      {trader.total_trades}
                    </div>
                    <div className="text-xs text-gray-500">
                      {trader.position_count} open
                    </div>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      trader.is_running
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-gray-500/10 text-gray-400 border border-gray-500/30'
                    }`}>
                      {trader.is_running ? 'Active' : 'Paused'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
