import type * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const tabsVariants = cva("flex flex-col gap-2", {
  variants: {
    variant: {
      segments: "",
      underline: "",
      primary: "gap-3",
    },
  },
  defaultVariants: {
    variant: "segments",
  },
});

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> &
  VariantProps<typeof tabsVariants>;

function Tabs({ className, variant, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(tabsVariants({ variant, className }))}
      {...props}
    />
  );
}

const tabsListVariants = cva("inline-flex p-[4px] w-fit items-center justify-center gap-0.5", {
  variants: {
    variant: {
      segments: "bg-surface-a3 rounded-full outline outline-1 -outline-offset-1 outline-a3-b",
      underline: "",
      primary: "gap-x-4 p-0",
    },
    size: {
      lg: "",
      md: "",
      sm: "",
    },
  },
  compoundVariants: [
    { variant: "segments", size: "lg", className: "h-[48px]" },
    { variant: "segments", size: "md", className: "h-[40px]" },
    { variant: "segments", size: "sm", className: "h-[32px]" },
  ],
  defaultVariants: {
    variant: "segments",
    size: "md",
  },
});

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>;

function TabsList({ className, variant, size, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(tabsListVariants({ variant, size, className }))}
      {...props}
    />
  );
}

const tabsTriggerVariants = cva(
  "cursor-pointer inline-flex items-center justify-center whitespace-nowrap transition-[color,box-shadow] disabled:pointer-events-none disabled:text-disabled-t disabled:[&_svg]:text-disabled-t [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        segments:
          "bg-transparent rounded-full transition-colors text-xs leading-4 font-semibold text-secondary-t [&_svg]:text-secondary-t hover:bg-surface-a3 hover:text-primary-t hover:[&_svg]:text-primary-t group-data-[active]/tabs-trigger:bg-surface-elastic-tab group-data-[active]/tabs-trigger:text-primary-t group-data-[active]/tabs-trigger:[&_svg]:text-primary-t group-data-[active]/tabs-trigger:shadow-drop-100 group-data-[active]/tabs-trigger:hover:bg-surface-elastic-tab group-data-[active]/tabs-trigger:hover:text-primary-t group-data-[active]/tabs-trigger:hover:[&_svg]:text-primary-t",
        underline:
          "py-[18px] px-[20px] text-secondary-t text-sm hover:text-primary-t hover:bg-surface-a3 relative after:content-[''] after:absolute after:transition-colors after:left-0 after:right-0 after:bottom-0 after:w-full after:h-[3px] group-data-[active]/tabs-trigger:after:bg-primary-t",
        primary:
          "text-tertiary-t text-base/6 md:text-[20px]/[24px] font-semibold hover:text-secondary-t group-data-[active]/tabs-trigger:text-primary-t transition-colors p-0",
      },
      size: {
        lg: "",
        md: "",
        sm: "",
      },
    },
    compoundVariants: [
      {
        variant: "segments",
        size: "lg",
        className: "h-[40px] [&_svg:not([class*='size-'])]:size-[24px] gap-3 py-[8px] px-[14px]",
      },
      {
        variant: "segments",
        size: "md",
        className: "h-[32px] [&_svg:not([class*='size-'])]:size-[20px] gap-2 py-[6px] px-[12px]",
      },
      {
        variant: "segments",
        size: "sm",
        className: "h-[24px] [&_svg:not([class*='size-'])]:size-[16px] gap-1.5 py-[4px] px-[8px]",
      },
    ],
    defaultVariants: {
      variant: "segments",
      size: "md",
    },
  },
);

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Tab> &
  VariantProps<typeof tabsTriggerVariants>;

function TabsTrigger({
  className,
  variant = "segments",
  size,
  children,
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn("group/tabs-trigger", {
        "relative before:hidden inline-flex items-center": variant === "segments",
        "w-full": variant !== "segments",
      })}
      {...props}
    >
      <span className={cn(tabsTriggerVariants({ variant, size, className }))}>{children}</span>
    </TabsPrimitive.Tab>
  );
}

const tabsContentVariants = cva("flex-1 outline-none", {
  variants: {
    variant: {
      segments: "",
      underline: "",
      primary: "",
    },
  },
  defaultVariants: {
    variant: "segments",
  },
});

type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Panel> &
  VariantProps<typeof tabsContentVariants>;

function TabsContent({ className, variant, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(tabsContentVariants({ variant, className }))}
      {...props}
    />
  );
}

interface ISegmentedProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  options: { value: string; label: React.ReactNode }[];
  classNameTrigger?: string;
  size?: "lg" | "md" | "sm";
}

function Segmented({
  className,
  options,
  classNameTrigger,
  size = "md",
  ...props
}: ISegmentedProps) {
  return (
    <Tabs {...props}>
      <TabsList size={size} className={className}>
        {options.map((option) => (
          <TabsTrigger
            size={size}
            className={classNameTrigger}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, Segmented };
