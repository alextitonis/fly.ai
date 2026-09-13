import { useEffect, useRef } from 'react';
import { createChart, ColorType, HistogramSeries } from 'lightweight-charts';
import { chartData, useDashboardStore } from '../dashboard.data';
import { Card, CardHeader } from './Card';
import { cn } from '../../../lib/utils';

const RANGES = ['1d', '7d', '30d'];

export function VolumeChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const activeRange = useDashboardStore(s => s.volumeRange);
  const setRange = useDashboardStore(s => s.setVolumeRange);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.46)',
        fontSize: 11,
        fontFamily: 'Inter',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)', style: 4 },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)', style: 4 }, 
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.15)',
          width: 1,
          style: 3,
          labelBackgroundColor: '#101113',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.15)',
          width: 1,
          style: 3,
          labelBackgroundColor: '#101113',
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
      },
      autoSize: true,
    });

    const series = chart.addSeries(HistogramSeries, {
      color: '#22C55E',
      base: 0,
      priceFormat: {
        type: 'volume',
      },
    });

    series.setData(chartData.volume);
    
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, []);

  return (
    <Card className="flex flex-col h-[340px] md:h-[400px]">
      <CardHeader title="Volume">
        <div className="flex bg-[#121316] rounded-lg p-0.5 border border-brand-border-subtle shadow-[inset_0_1px_1px_rgba(0,0,0,0.3)]">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-2.5 py-1 text-[12px] font-medium rounded-md transition-all duration-200 cursor-pointer active:scale-[0.95]",
                activeRange === r 
                  ? "bg-brand-surface-2 text-brand-text shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.02)] border border-brand-border-subtle" 
                  : "text-brand-text-muted hover:text-brand-text-secondary hover:bg-brand-surface-hover"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </CardHeader>
      
      <div className="flex items-baseline gap-3 mb-4 shrink-0">
        <span className="text-[32px] font-semibold tracking-tight leading-none">$1.28B</span>
        <div className="flex items-center text-[12px] font-medium text-profit">
          <span className="mr-0.5">▲</span> +47.36%
        </div>
      </div>
      
      <div className="relative flex-1 min-h-0 w-full" ref={chartContainerRef} />
    </Card>
  );
}
