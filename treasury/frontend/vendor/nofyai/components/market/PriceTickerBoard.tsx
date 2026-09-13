'use client';

import PriceTicker from './PriceTicker';

type PriceTickerBoardProps = {
  symbols: string[];
};

export default function PriceTickerBoard({ symbols }: PriceTickerBoardProps) {
  if (!symbols || symbols.length === 0) return null;
  return (
    <div className="flex items-center justify-end overflow-x-auto pb-1 scrollbar-hide divide-x divide-border/80">
      {symbols.map((s) => (
        <div key={s} className="pl-3 first:pl-0 first:divide-x-0">
          <PriceTicker symbol={s} />
        </div>
      ))}
    </div>
  );
}
