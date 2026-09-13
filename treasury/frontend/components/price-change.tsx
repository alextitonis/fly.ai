import { cn } from "@/lib/utils";
import { RiArrowUpSFill, RiArrowDownSFill } from "@remixicon/react";
import { NumberFlow } from "@/components/ui-number-flow.tsx";
export function PriceChange({ percentage, timeframe }: { percentage: number; timeframe: string }) {
  const isPositive = percentage >= 0;

  return (
    <div className="flex items-center gap-x-1 text-xs/4 font-normal">
      <div className="flex items-center gap-x-1 ">
        <div
          className={cn("rounded-full flex items-center justify-start size-4", {
            "bg-red/10": !isPositive,
            "bg-green/10": isPositive,
          })}
        >
          {isPositive ? (
            <RiArrowUpSFill size={16} className="text-green" />
          ) : (
            <RiArrowDownSFill size={16} className="text-red" />
          )}
        </div>
        <NumberFlow
          className={cn("font-medium", {
            "text-red": !isPositive,
            "text-green": isPositive,
          })}
          format={{ style: "percent" }}
          value={Math.abs(percentage / 100)}
        />
      </div>
      <p className="text-tertiary-t">{timeframe}</p>
    </div>
  );
}
