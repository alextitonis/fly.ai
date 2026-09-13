import { Separator } from "@/components/ui-separator.tsx";
import { CircleProgress } from "@/components/ui-progress.tsx";
import { Icon } from "@/components/icon.tsx";
import { cn } from "@/lib/utils";
import { NumberFlow } from "@/components/ui-number-flow.tsx";
import { ConnectButton } from "@/components/connect-button";
import {
  RiMoonLine,
  RiSunLine,
  RiContrastLine,
  RiTwitterXFill,
  RiGitBranchLine,
  RiBookOpenLine,
  RiFileListLine,
} from "@remixicon/react";
import { Tooltip } from "@/components/ui-tooltip.tsx";
import { type Theme, useTheme } from "@/components/theme-provider.tsx";
import { useEpochTimer } from "@/hooks/liveness-useEpochTimer";
import type * as React from "react";
import { useToken } from "@/hooks/use-token";
import { TokenName } from "@/lib/tokens.ts";

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <RiContrastLine className="size-4" /> },
  { value: "light", label: "Light", icon: <RiSunLine className="size-4" /> },
  { value: "dark", label: "Dark", icon: <RiMoonLine className="size-4" /> },
];

const SOCIAL_LINKS = [
  { href: "https://twitter.com/SHITFinance", icon: RiTwitterXFill, label: "X" },
  { href: "https://radicle.network/nodes/rosa.radicle.network/rad%3Az2kY22UBjvyrbxfKZftjF4H66C7Wx", icon: RiGitBranchLine, label: "Radicle" },
  { href: "/#/whitepaper", icon: RiBookOpenLine, label: "Whitepaper" },
  { href: "/#/contracts", icon: RiFileListLine, label: "Contracts" },
];

function ThemeSwitcher({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <div className="flex items-center gap-x-0.5">
      {THEME_OPTIONS.map((option) => (
        <Tooltip
          key={option.value}
          title={option.label}
          contentProps={{ side: "top", sideOffset: 4 }}
        >
          <button
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center justify-center size-6 rounded-full transition-colors",
              theme === option.value
                ? "text-primary-t bg-surface-elastic-tab shadow-drop-100"
                : "text-secondary-t hover:text-primary-t hover:bg-surface-a3",
            )}
          >
            {option.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function Footer() {
  const { theme, setTheme } = useTheme();
  const { hours, minutes, seconds, progress } = useEpochTimer();
  const WSTSHITToken = useToken(TokenName.WSTSHIT);
  const SHITToken = useToken(TokenName.SHIT);

  const beatLabel = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return (
    <footer className="bg-surface-bg-l1 h-auto min-[650px]:h-9 shrink-0 z-30">
      <Separator className="w-full" />

      {/* Mobile: two rows (< 650px) */}
      <div className="flex flex-col gap-1 px-3 safe-area-pb min-[650px]:hidden">
        {/* Row 1: Next Beat + socials */}
        <div className="flex items-center justify-center gap-x-3">
          <div className="flex items-center gap-x-2 w-[160px] shrink-0">
            <CircleProgress size={16} type="success" value={progress} />
            <div className="flex items-center gap-x-1 text-sm whitespace-nowrap">
              <p className="text-secondary-t">Next Beat</p>
              <p>{beatLabel}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-5 w-px" />
          <div className="flex items-center gap-x-0.5">
            {SOCIAL_LINKS.map((link) => (
              <Tooltip
                key={link.href}
                title={link.label}
                contentProps={{ side: "top", sideOffset: 4 }}
              >
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center size-7 rounded-full transition-colors hover:bg-surface-a5"
                >
                  <link.icon
                    size={20}
                    className="text-secondary-t transition-colors hover:text-primary-t"
                  />
                </a>
              </Tooltip>
            ))}
          </div>
        </div>
        <Separator />

        {/* Row 2: Connect + Theme */}
        <div className="flex items-center gap-x-2 justify-between">
          <ConnectButton />
          <div className="flex items-center gap-x-2">
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </div>

      {/* Desktop: single row (≥ 650px) */}
      <div className="hidden min-[650px]:flex px-6 items-center justify-between w-full h-full">
        <div className="flex items-center">
          <div className="flex items-center gap-x-2 w-[160px] shrink-0">
            <CircleProgress size={16} type="success" value={progress} />
            <div className="flex items-center gap-x-1 text-sm whitespace-nowrap">
              <p className="text-secondary-t">Next Beat</p>
              <p>{beatLabel}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-5 mx-4 w-px" />
          <div className="flex items-center gap-x-0.5">
            {SOCIAL_LINKS.map((link) => (
              <Tooltip
                key={link.href}
                title={link.label}
                contentProps={{ side: "top", sideOffset: 4 }}
              >
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center size-7 rounded-full transition-colors hover:bg-surface-a5"
                >
                  <link.icon
                    size={20}
                    className="text-secondary-t transition-colors hover:text-primary-t"
                  />
                </a>
              </Tooltip>
            ))}
          </div>
        </div>
        <div className="flex items-center">
          <div className="flex items-center gap-x-1">
            <Icon name={SHITToken.icon} className="size-4" />
            <NumberFlow value={SHITToken.price} className="text-sm" />
          </div>
          <Separator orientation="vertical" className="h-5 mx-4 w-px" />
          <div className="flex items-center gap-x-1">
            <Icon name={WSTSHITToken.icon} className="size-4" />
            <NumberFlow value={WSTSHITToken.price} className="text-sm" />
          </div>
          <Separator orientation="vertical" className="h-5 mx-4 w-px" />
          <ConnectButton />
          <Separator orientation="vertical" className="h-5 mx-4 w-px" />
          <ThemeSwitcher theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </footer>
  );
}
