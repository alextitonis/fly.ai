import type * as React from "react";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "data-[orientation=horizontal]:bg-[linear-gradient(90deg,transparent_0%,var(--surface-a10)_10%,var(--surface-a10)_90%,transparent_100%)] shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:bg-[linear-gradient(180deg,transparent_0%,var(--surface-a10)_30%,var(--surface-a10)_70%,transparent_100%)] data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
