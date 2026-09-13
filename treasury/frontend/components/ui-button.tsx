import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all cursor-pointer disabled:pointer-events-none disabled:bg-surface-a5 disabled:text-disabled-t disabled:shadow-none [&_svg]:pointer-events-none  shrink-0 [&_svg]:shrink-0 outline-none  aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-surface-button-primary text-inverted-primary-t shadow-button-primary hover:bg-surface-button-primary-hover",
        secondary:
          "bg-surface-button-secondary shadow-button-secondary text-primary-t hover:bg-surface-button-secondary-hover",
        tertiary: "text-primary-t hover:bg-surface-a5",
        link: "text-primary underline-offset-4 hover:underline",
        destructive: "bg-red-500 text-white hover:bg-red-500/90",
        outline: "border border-a10-b bg-transparent hover:bg-surface-a3",
        ghost: "hover:bg-surface-a3 hover:text-primary-t",
      },
      size: {
        xs: "text-[12px]/[16px] h-[24px] gap-[6px] px-[12px] has-[>svg:first-child]:pl-[9px] has-[>svg:last-child]:pr-[9px] [&_svg:not([class*='size-'])]:size-[12px]",
        sm: "text-[12px]/[16px] h-[32px] gap-[8px] px-[14px] has-[>svg:first-child]:pl-[12px] has-[>svg:last-child]:pr-[12px] [&_svg:not([class*='size-'])]:size-[16px]",
        md: "text-[14px]/[20px] h-[40px] px-[16px] py-2.5 has-[>svg:first-child]:pl-[12px] has-[>svg:last-child]:pr-[12px] gap-[8px] [&_svg:not([class*='size-'])]:size-[20px]",
        lg: "text-[18px]/[24px] h-[48px] px-[24px] has-[>svg:first-child]:pl-[20px] has-[>svg:last-child]:pr-[20px] gap-[10px] [&_svg:not([class*='size-'])]:size-[24px]",
        icon: "h-[40px] w-[40px] p-0 [&_svg:not([class*='size-'])]:size-[20px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

function Button({
  className,
  variant,
  size,
  render,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    render?: React.ReactElement;
  }) {
  const wrappedChildren = React.Children.map(children, (child) =>
    typeof child === "string" ? <span>{child}</span> : child,
  );

  return useRender({
    defaultTagName: "button",
    render,
    props: {
      "data-slot": "button",
      className: cn(buttonVariants({ variant, size, className })),
      children: wrappedChildren,
      ...props,
    },
  });
}

export { Button, buttonVariants };
