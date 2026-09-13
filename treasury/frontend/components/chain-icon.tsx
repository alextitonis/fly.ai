import type { SVGProps, FC } from "react";
import { Tooltip } from "@/components/ui-tooltip";
import { cn } from "@/lib/utils";

import BaseIcon from "@/icons/chain-base.svg?react";

type ChainMeta = {
  label: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
};

const CHAIN_META: Record<number, ChainMeta> = {
  8453: { label: "Base", Icon: BaseIcon },
  84532: { label: "Base Sepolia", Icon: BaseIcon },
};

type ChainIconProps = {
  chainId: number;
  size?: number;
  rounded?: boolean;
};

export function ChainIcon({ chainId, size = 20, rounded = false }: ChainIconProps) {
  const meta = CHAIN_META[chainId];

  if (!meta) {
    return (
      <Tooltip title={`Chain ${chainId}`}>
        <div
          className={cn(
            "inline-flex shrink-0 items-center justify-center bg-zinc-600",
            rounded ? "rounded-full" : "rounded-md",
          )}
          style={{ width: size, height: size }}
        >
          <span className="font-semibold leading-none text-white" style={{ fontSize: size * 0.5 }}>
            ?
          </span>
        </div>
      </Tooltip>
    );
  }

  const { Icon, label } = meta;
  return (
    <Tooltip title={label}>
      <span
        role="img"
        aria-label={label}
        className={cn("inline-flex shrink-0 overflow-hidden", rounded && "rounded-full")}
        style={{ width: size, height: size }}
      >
        <Icon width={size} height={size} />
      </span>
    </Tooltip>
  );
}
