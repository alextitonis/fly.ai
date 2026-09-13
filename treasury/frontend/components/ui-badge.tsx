import type * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center justify-center w-full", {
  variants: {
    variant: {
      filled: "rounded-full font-semibold w-max  text-center",
      ghost: "border text-[10px]/[14px] font-medium rounded-full  w-max",
      default: "rounded-full border-transparent bg-primary text-primary-foreground px-2.5 py-0.5 text-xs font-semibold w-max",
      secondary: "rounded-full border-transparent bg-surface-a5 text-primary-t px-2.5 py-0.5 text-xs font-semibold w-max",
      destructive: "rounded-full border-transparent bg-red-500 text-white px-2.5 py-0.5 text-xs font-semibold w-max",
      success: "rounded-full border-transparent bg-green-500 text-white px-2.5 py-0.5 text-xs font-semibold w-max",
      warning: "rounded-full border-transparent bg-yellow-500 text-white px-2.5 py-0.5 text-xs font-semibold w-max",
      outline: "rounded-full border text-primary-t px-2.5 py-0.5 text-xs font-semibold w-max",
    },
    color: {
      orange: "",
      blue: "",
      green: "",
      red: "",
      gray: "",
      purple: "",
    },
    size: {
      sm: "h-5 py-[3px] px-[6px] text-[10px]/[14px]",
      md: "h-5 py-[2px] px-[8px] text-[12px]/[16px]",
      lg: "h-6 py-[2px] px-[8px] text-[15px]/[20px]",
    },
  },
  compoundVariants: [
    {
      variant: "filled",
      color: "orange",
      className: "bg-yellow/20 text-yellow",
    },
    {
      variant: "filled",
      color: "blue",
      className: "bg-blue/20 text-blue",
    },
    {
      variant: "filled",
      color: "green",
      className: "bg-green/20 text-green",
    },
    {
      variant: "filled",
      color: "red",
      className: "bg-red/20 text-red",
    },
    {
      variant: "filled",
      color: "purple",
      className: "bg-purple/20 text-purple",
    },
    {
      variant: "filled",
      color: "gray",
      className: "bg-surface-a5 text-secondary-t",
    },
    {
      variant: "ghost",
      color: "orange",
      className: "border-orange/20 text-orange",
    },
    {
      variant: "ghost",
      color: "blue",
      className: "border-blue/20 text-blue",
    },
    {
      variant: "ghost",
      color: "green",
      className: "border-green/20 text-green",
    },
    {
      variant: "ghost",
      color: "red",
      className: "border-red/20 text-red",
    },
    {
      variant: "ghost",
      color: "gray",
      className: "border-surface-a10 text-secondary-t",
    },
  ],
});

function Badge({
  className,
  variant = "filled",
  color,
  size,
  render,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { render?: React.ReactElement }) {
  // "filled"/"ghost" use the color+size axes below; the flat variants
  // (default/secondary/destructive/success/warning/outline) are fully
  // self-styled and don't combine with color/size.
  const isLegacyVariant = variant === "filled" || variant === "ghost";
  const resolvedColor = isLegacyVariant ? (color ?? "orange") : undefined;
  const resolvedSize = isLegacyVariant ? (size ?? "sm") : undefined;

  return useRender({
    defaultTagName: "span",
    render,
    props: {
      "data-slot": "badge",
      className: cn(badgeVariants({ variant, color: resolvedColor, size: resolvedSize }), className),
      ...props,
    },
  });
}

export { Badge, badgeVariants };
