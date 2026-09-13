'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
type EquityPoint = { timestamp: string; total_equity: number; available_balance: number; total_pnl: number; total_pnl_pct: number; cycle_number: number; position_count: number; margin_used_pct: number; trader: string; };
const formatUSD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercent = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
void formatPercent;
const useTranslations = () => ({ equity: 'Equity', pnl: 'P&L', available: 'Available', totalPnl: 'Total P&L', timestamp: 'Time', timeRange: { '24h': '24H', '7d': '7D', '30d': '30D', all: 'All' }, trader: { totalEquity: 'Total Equity', positions: 'Positions', margin: 'Margin Used', cycle: 'Cycle', noEquityHistory: 'No equity history yet', chartWillAppear: 'Chart will appear here', initial: 'Initial Balance' } });

export type TimeRange = '24h' | '7d' | '30d' | 'all';

interface EquityChartProps {
  data: EquityPoint[];
  initialBalance: number;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  showTimeSelector?: boolean;
}

export function EquityChart({
  data,
  initialBalance,
  timeRange: externalTimeRange,
  onTimeRangeChange,
  showTimeSelector = true
}: EquityChartProps) {
  const t = useTranslations();
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>('7d');

  // Use external timeRange if provided, otherwise use internal state
  const timeRange = externalTimeRange ?? internalTimeRange;

  const handleTimeRangeChange = (range: TimeRange) => {
    if (onTimeRangeChange) {
      onTimeRangeChange(range);
    } else {
      setInternalTimeRange(range);
    }
  };

  // Sort and filter data by timestamp and selected time range
  const sortedData = useMemo(() => {
    // First, sort all data
    const sorted = [...data].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // If "all" is selected, return all data
    if (timeRange === 'all') {
      return sorted;
    }

    // Calculate time threshold based on selected range
    const now = new Date();
    const thresholds: Record<Exclude<TimeRange, 'all'>, number> = {
      '24h': 24 * 60 * 60 * 1000,      // 24 hours in milliseconds
      '7d': 7 * 24 * 60 * 60 * 1000,   // 7 days in milliseconds
      '30d': 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    };

    const threshold = now.getTime() - thresholds[timeRange];

    // Filter data within the selected time range
    const filtered = sorted.filter(point =>
      new Date(point.timestamp).getTime() >= threshold
    );

    console.log(`[EquityChart] Time range: ${timeRange}, total points: ${sorted.length}, filtered points: ${filtered.length}`);

    return filtered;
  }, [data, timeRange]);

  // Calculate Y-axis domain to center initial balance and show changes clearly
  const yAxisDomain = useMemo(() => {
    if (sortedData.length === 0) {
      return ['auto', 'auto'];
    }

    // Find min and max equity
    const equities = sortedData.map(d => d.total_equity);
    const maxEquity = Math.max(...equities);
    const minEquity = Math.min(...equities);
    const range = maxEquity - minEquity;

    console.log('[EquityChart] Equity stats:', {
      initialBalance,
      maxEquity: maxEquity.toFixed(2),
      minEquity: minEquity.toFixed(2),
      range: range.toFixed(2),
      rangePercent: ((range / initialBalance) * 100).toFixed(2) + '%'
    });

    // Calculate minimum visible range (at least 2% of initial balance)
    // This prevents the chart from appearing as a flat line when changes are small
    const minVisibleRange = initialBalance * 0.02; // 2%

    // Calculate space above and below initial balance
    const spaceAbove = maxEquity - initialBalance;
    const spaceBelow = initialBalance - minEquity;

    // Use the larger of the two spaces to create symmetry around initial balance
    // Also ensure minimum visible range
    const symmetricRange = Math.max(
      spaceAbove,
      spaceBelow,
      minVisibleRange / 2,
      range / 2
    );

    // Add 20% padding to prevent line from touching edges
    const paddedRange = symmetricRange * 1.2;

    // Calculate domain centered on initial balance
    const yMin = initialBalance - paddedRange;
    const yMax = initialBalance + paddedRange;

    console.log('[EquityChart] Y-axis domain:', {
      yMin: yMin.toFixed(2),
      yMax: yMax.toFixed(2),
      centerPosition: 'initialBalance at center',
      rangeUsed: (paddedRange * 2).toFixed(2)
    });

    return [yMin, yMax];
  }, [sortedData, initialBalance]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffHours < 168) { // 7 days
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        hour: '2-digit'
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  // Custom tooltip - simplified without PnL data
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as EquityPoint;

      return (
        <div className="bg-white border border-border rounded-lg shadow-lg p-3">
          <div className="text-xs text-text-secondary mb-2">
            {new Date(data.timestamp).toLocaleString()}
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-text-tertiary">{t.trader.totalEquity}</div>
              <div className="text-base font-bold text-text-primary">
                {formatUSD(data.total_equity)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <div className="text-xs text-text-tertiary">{t.trader.positions}</div>
                <div className="text-sm font-semibold text-text-primary">
                  {data.position_count}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">{t.trader.margin}</div>
                <div className="text-sm font-semibold text-text-primary">
                  {data.margin_used_pct.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="text-xs text-text-tertiary pt-1">
              {t.trader.cycle} #{data.cycle_number}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Check if we have data
  if (!sortedData || sortedData.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-30">📈</div>
          <div className="font-semibold mb-2">{t.trader.noEquityHistory}</div>
          <div className="text-sm">{t.trader.chartWillAppear}</div>
        </div>
      </div>
    );
  }

  // Determine if overall profitable
  const latestPoint = sortedData[sortedData.length - 1];
  const isProfitable = latestPoint.total_pnl >= 0;
  const strokeColor = isProfitable ? '#16C784' : '#EA3943';
  const fillGradientId = isProfitable ? 'colorProfit' : 'colorLoss';

  return (
    <div className="w-full space-y-2 md:space-y-3">
      {/* Time Range Selector - Conditional */}
      {showTimeSelector && (
        <div className="flex justify-end">
          <div className="flex gap-1 bg-background-secondary rounded-lg p-1">
            {(['24h', '7d', '30d', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => handleTimeRangeChange(range)}
                className={`px-2 md:px-3 py-1 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                  timeRange === range
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {range === 'all' ? 'All' : range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart Container - Responsive height */}
      <div className="w-full h-[200px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={sortedData}
            margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          >
            {/* Gradient definitions for profit and loss areas */}
            <defs>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16C784" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#16C784" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EA3943" stopOpacity={0.05}/>
                <stop offset="95%" stopColor="#EA3943" stopOpacity={0.3}/>
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#EFF2F5"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTimestamp}
              stroke="#9CA3AF"
              style={{ fontSize: '12px' }}
              tickLine={false}
              axisLine={{ stroke: '#EFF2F5' }}
            />
            <YAxis
              domain={yAxisDomain}
              tickFormatter={(value) => formatUSD(value)}
              stroke="#9CA3AF"
              style={{ fontSize: '12px' }}
              tickLine={false}
              axisLine={{ stroke: '#EFF2F5' }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Reference line for initial balance */}
            <ReferenceLine
              y={initialBalance}
              stroke="#9CA3AF"
              strokeDasharray="3 3"
              label={{
                value: t.trader.initial,
                position: 'right',
                fill: '#9CA3AF',
                fontSize: 11,
              }}
            />

            {/* Area chart with smooth curve and gradient fill */}
            <Area
              type="basis"
              dataKey="total_equity"
              stroke={strokeColor}
              strokeWidth={2.5}
              fill={`url(#${fillGradientId})`}
              fillOpacity={1}
              baseValue={initialBalance}
              dot={false}
              activeDot={{
                r: 6,
                fill: strokeColor,
                stroke: '#fff',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
