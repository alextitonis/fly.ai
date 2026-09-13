import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";
import { RiInformationLine } from "@remixicon/react";
import { useIsMobile } from "@/hooks/use-mobile.ts";

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}
function TooltipCore({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}
function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "bg-surface-tooltip shadow-tooltip text-sm/5 font-medium text-primary-t data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 rounded-[20px] px-3 py-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 z-50 w-fit max-w-60 origin-(--transform-origin)",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

interface ITooltipProps
  extends Omit<React.ComponentPropsWithoutRef<typeof TooltipCore>, "children"> {
  children?: React.ReactNode;
  title: React.ReactNode;
  triggerProps?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>;
  contentProps?: React.ComponentProps<typeof TooltipContent>;
  classNameContent?: string;
  className?: string;
}

function Tooltip({
  children,
  title,
  triggerProps,
  classNameContent,
  contentProps,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  ...rootProps
}: ITooltipProps) {
  const { isMobile } = useIsMobile();
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = isControlled ? (openProp as boolean) : uncontrolledOpen;

  const setOpen = React.useCallback<NonNullable<TooltipPrimitive.Root.Props["onOpenChange"]>>(
    (next, eventDetails) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChangeProp?.(next, eventDetails);
    },
    [isControlled, onOpenChangeProp],
  );

  // Pass the consumer's element directly as the Trigger's render target so
  // Base UI treats it as the actual trigger. This makes closeOnClick work
  // natively (clicking the button dismisses the tooltip). If children isn't
  // a valid element, fall back to wrapping in a span.
  const triggerRender = React.isValidElement(children) ? (
    (children as React.ReactElement)
  ) : (
    <span className="inline-flex">{children}</span>
  );

  // On mobile there's no hover, so we make tap toggle the tooltip and disable
  // Base UI's closeOnClick so the tap doesn't immediately dismiss what it opened.
  // We toggle local state directly here (rather than going through `setOpen`)
  // because Base UI's onOpenChange contract requires an eventDetails object we
  // don't have — controlled consumers should drive open state themselves.
  const { onClick: userOnClick, ...restTriggerProps } = triggerProps ?? {};
  const mobileClick: NonNullable<TooltipPrimitive.Trigger.Props["onClick"]> = (e) => {
    e.preventDefault();
    if (!isControlled) setUncontrolledOpen((prev) => !prev);
    userOnClick?.(e);
  };

  return (
    <TooltipCore open={open} onOpenChange={setOpen} {...rootProps}>
      <TooltipTrigger
        render={triggerRender}
        closeOnClick={!isMobile}
        {...restTriggerProps}
        onClick={isMobile ? mobileClick : userOnClick}
      />
      <TooltipContent
        className={cn("font-normal max-w-[250px] text-center", classNameContent)}
        {...contentProps}
      >
        {title}
      </TooltipContent>
    </TooltipCore>
  );
}

function TooltipInfo({
  children,
  title,
  triggerProps,
  classNameContent,
  contentProps,
  className,
  ...props
}: ITooltipProps) {
  return (
    <div className="flex items-center gap-x-1">
      <span className={cn("text-secondary-t font-semibold", className)}>{children}</span>
      <Tooltip
        classNameContent={classNameContent}
        triggerProps={triggerProps}
        title={title}
        contentProps={contentProps}
        {...props}
      >
        <RiInformationLine
          size={16}
          className="cursor-pointer text-tertiary-t transition-colors hover:text-secondary-t"
        />
      </Tooltip>
    </div>
  );
}

export { TooltipCore, TooltipTrigger, TooltipContent, TooltipProvider, Tooltip, TooltipInfo };
