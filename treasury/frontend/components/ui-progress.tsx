import type * as React from "react";
import { useMemo } from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  indicatorColor?: string;
  indicatorClassName?: string;
  /** When provided, renders a split bar: primary color fills (100 - overflowPercent)%,
   *  secondary (red) fills overflowPercent%. The bar appears 100% full. */
  overflowPercent?: number;
}

function Progress({
  className,
  value,
  indicatorColor,
  indicatorClassName,
  overflowPercent,
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(value ?? 0, 100);
  const primaryWidth = overflowPercent !== undefined ? 100 - overflowPercent : clampedValue;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={overflowPercent !== undefined ? null : (value ?? null)}
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-surface-a10", className)}
      {...props}
    >
      <ProgressPrimitive.Track className="h-full w-full">
        {overflowPercent !== undefined ? (
          <div className="flex h-full w-full">
            <div
              className={cn(
                "h-full bg-green shadow-(--shadow-button-secondary) transition-all",
                indicatorClassName,
              )}
              style={{ width: `${primaryWidth}%` }}
            />
            <div className="h-full flex-1 bg-red" />
          </div>
        ) : (
          <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            className={cn(
              "h-full bg-green transition-all shadow-(--shadow-button-secondary)",
              indicatorClassName,
            )}
            style={
              !indicatorClassName && indicatorColor
                ? { backgroundColor: indicatorColor }
                : undefined
            }
          />
        )}
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

interface ICircleProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  size: number;
  strokeWidth?: number;
  type?: "success" | "error" | "warning";
}

const CircleProgress = (props: ICircleProgressProps) => {
  const { value, size, strokeWidth = 3, className, style, type = "success", ...rest } = props;

  const radius = useMemo(() => (size - strokeWidth) / 2, [size, strokeWidth]);
  const center = useMemo(() => size / 2, [size]);

  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div
      data-slot="progress"
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <svg width={size} height={size} fill="none" aria-hidden="true">
        {/* Background circle */}
        <circle
          stroke="currentColor"
          className="stroke-surface-a10"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={center}
          cy={center}
        />
        {/* Progress circle */}
        <circle
          data-slot="progress-indicator"
          stroke="currentColor"
          className={cn({
            "stroke-green": type === "success",
            "stroke-red": type === "error",
            "stroke-orange": type === "warning",
          })}
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={center}
          cy={center}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            transform: "rotate(-90deg)",
            transformOrigin: "center",
          }}
        />
      </svg>
    </div>
  );
};

export { Progress, CircleProgress };
