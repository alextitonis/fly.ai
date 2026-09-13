import type * as React from "react";
import { Drawer } from "@base-ui/react/drawer";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof Drawer.Root>) {
  return <Drawer.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof Drawer.Trigger>) {
  return <Drawer.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof Drawer.Close>) {
  return <Drawer.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof Drawer.Portal>) {
  return <Drawer.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof Drawer.Backdrop>) {
  return (
    <Drawer.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: React.ComponentProps<typeof Drawer.Popup> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <Drawer.Popup
        data-slot="sheet-content"
        className={cn(
          "bg-surface-bg-l1 data-[open]:animate-in data-[closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[closed]:duration-300 data-[open]:duration-500",
          side === "left" &&
            "data-[closed]:slide-out-to-left data-[open]:slide-in-from-left inset-y-0 left-0 h-full w-[320px] max-w-[85vw]",
          side === "right" &&
            "data-[closed]:slide-out-to-right data-[open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "top" &&
            "data-[closed]:slide-out-to-top data-[open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[closed]:slide-out-to-bottom data-[open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className,
        )}
        {...props}
      >
        {children}
        <Drawer.Close className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4 text-primary-t" />
          <span className="sr-only">Close</span>
        </Drawer.Close>
      </Drawer.Popup>
    </SheetPortal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof Drawer.Title>) {
  return (
    <Drawer.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Description>) {
  return (
    <Drawer.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
