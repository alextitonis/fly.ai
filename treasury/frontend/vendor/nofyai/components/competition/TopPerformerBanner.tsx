'use client';

import type { TopPerformer } from '@/types';
import Link from 'next/link';

interface TopPerformerBannerProps {
  highest: TopPerformer | null;
  lowest: TopPerformer | null;
}

export default function TopPerformerBanner({ highest, lowest }: TopPerformerBannerProps) {
  const formatPnL = (pct: number) => {
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };

  const formatEquity = (equity: number) => {
    return `$${equity.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getModelBadgeColor = (aiModel: string) => {
    const colors: Record<string, string> = {
      qwen: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      deepseek: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      custom: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    };
    return colors[aiModel] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  };

  if (!highest || !lowest) {
    return null;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between gap-8">
        {/* Highest Performer */}
        <Link
          href={`/trader/${highest.trader_id}`}
          className="flex-1 group hover:bg-gray-800/50 rounded-lg p-4 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                HIGHEST
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-1 rounded text-xs font-mono border ${getModelBadgeColor(highest.ai_model)}`}>
                  {highest.ai_model.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-300">
                  {highest.trader_name}
                </span>
              </div>
            </div>
            <div className="flex-1 text-right">
              <div className="text-2xl font-mono text-white mb-1">
                {formatEquity(highest.total_equity)}
              </div>
              <div className={`text-sm font-mono ${
                highest.total_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatPnL(highest.total_pnl_pct)}
              </div>
            </div>
          </div>
        </Link>

        {/* Divider */}
        <div className="w-px h-16 bg-gray-800" />

        {/* Lowest Performer */}
        <Link
          href={`/trader/${lowest.trader_id}`}
          className="flex-1 group hover:bg-gray-800/50 rounded-lg p-4 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                LOWEST
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-1 rounded text-xs font-mono border ${getModelBadgeColor(lowest.ai_model)}`}>
                  {lowest.ai_model.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-300">
                  {lowest.trader_name}
                </span>
              </div>
            </div>
            <div className="flex-1 text-right">
              <div className="text-2xl font-mono text-white mb-1">
                {formatEquity(lowest.total_equity)}
              </div>
              <div className={`text-sm font-mono ${
                lowest.total_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatPnL(lowest.total_pnl_pct)}
              </div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
