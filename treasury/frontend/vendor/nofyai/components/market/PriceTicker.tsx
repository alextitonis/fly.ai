'use client';

import useSWR from 'swr';
import { useEffect, useMemo, useRef, useState } from 'react';

type PriceTickerProps = {
  symbol?: string; // e.g. 'BTCUSDT'
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function PriceTicker({ symbol }: PriceTickerProps) {
  const normalized = useMemo(() => {
    if (!symbol) return 'BTCUSDT';
    const s = symbol.toUpperCase();
    return s.includes('USDT') ? s : `${s}USDT`;
  }, [symbol]);

  const { data, error, isLoading } = useSWR(
    `/api/market-data?symbol=${encodeURIComponent(normalized)}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const price = data?.data?.current_price as number | undefined;

  const lastPriceRef = useRef<number | undefined>(undefined);
  const [trend, setTrend] = useState<'up' | 'down' | 'none'>('none');

  useEffect(() => {
    if (price === undefined) return;
    const last = lastPriceRef.current;
    if (last !== undefined && price !== last) {
      const direction = price > last ? 'up' : 'down';
      setTrend(direction);
      const timer = setTimeout(() => setTrend('none'), 450);
      return () => clearTimeout(timer);
    }
    lastPriceRef.current = price;
  }, [price]);

  useEffect(() => {
    // Keep lastPriceRef updated after trend effect has been scheduled
    if (price !== undefined) {
      lastPriceRef.current = price;
    }
  }, [price]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-0.5 text-xs text-danger">
        <span className="leading-none">{normalized.replace('USDT', '/USDT')}</span>
        <span className="leading-none">⚠️</span>
      </div>
    );
  }

  const trendClasses =
    trend === 'up'
      ? 'text-success -translate-y-0.5'
      : trend === 'down'
      ? 'text-danger translate-y-0.5'
      : 'text-text-primary translate-y-0';

  // Map well-known symbols to icon filenames
  const base = normalized.replace(/USDT$/i, '');
  const iconName = (() => {
    const b = base.toUpperCase();
    if (b.startsWith('BTC')) return 'btc';
    if (b.startsWith('ETH')) return 'eth';
    if (b.startsWith('BNB')) return 'bnb';
    if (b.startsWith('SOL')) return 'sol';
    if (b.startsWith('ZEC')) return 'zec';
    return undefined;
  })();

  const iconKey = (iconName || base.toLowerCase()).toLowerCase();
  const iconCandidates = useMemo(() => [
    `/icons/${iconKey}.svg`,
    `/icons/${iconKey}.png`,
    `/icons/default.svg`,
    `/icons/default.png`,
  ], [iconKey]);
  const [iconIdx, setIconIdx] = useState(0);
  const imgSrc = iconCandidates[iconIdx];

  useEffect(() => {
    setIconIdx(0);
  }, [iconCandidates]);

  return (
    <div className="flex flex-col items-center select-none">
      <div className="flex items-center gap-1">
        {imgSrc ? (
          // Prefer SVG; fall back to PNG if SVG not found
          <img
            src={imgSrc}
            alt={`${base} icon`}
            className="w-4 h-4"
            onError={() => {
              setIconIdx((prev) => (prev < iconCandidates.length - 1 ? prev + 1 : prev));
            }}
          />
        ) : (
          <div className="w-4 h-4 rounded-full bg-text-tertiary/20" aria-hidden />
        )}
        <span className="text-[11px] font-semibold text-text-secondary leading-none">
          {base}/USDT
        </span>
      </div>
      <div
        className={`mt-1 min-w-[88px] text-center font-mono text-sm font-bold transition-transform duration-300 ease-out ${trendClasses}`}
      >
        {isLoading || price === undefined ? '—' : price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </div>
    </div>
  );
}

export default PriceTicker;
