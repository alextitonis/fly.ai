import { cn } from "../../lib/utils";
import { useState } from "react";

export const TokenIcon = ({ symbol, className }: { symbol: string, className?: string }) => {
  const iconUrl = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
  const [hasError, setHasError] = useState(false);

  return (
    <div className={cn("rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-brand-surface-2 border border-brand-border-subtle", className)}>
      {hasError ? (
        <span className="text-[10px] font-bold text-brand-text-secondary leading-none">
          {symbol.substring(0, 3)}
        </span>
      ) : (
        <img
          src={iconUrl}
          alt={symbol}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
};
