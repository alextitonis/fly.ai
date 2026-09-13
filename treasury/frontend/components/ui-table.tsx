import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

type TableVariant = "default" | "condensed";

const TableVariantContext = React.createContext<TableVariant>("default");

function Table({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"table"> & { variant?: TableVariant }) {
  return (
    <TableVariantContext.Provider value={variant}>
      <div
        data-slot="table-container"
        data-variant={variant}
        className="relative w-full overflow-x-auto border-a5-b bg-surface-bg-l2 text-secondary-t shadow-surface-level-2 rounded-3xl "
      >
        <table data-slot="table" className={cn("w-full caption-bottom  ", className)} {...props} />
      </div>
    </TableVariantContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b px-3 border-a5-b bg-surface-a3", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-transparent border-t font-medium [&>tr]:last:border-b-0 border-a5-b",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-surface-a3 data-[state=selected]:bg-surface-a3 border-b border-a5-b transition-colors px-3",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  const variant = React.useContext(TableVariantContext);
  const heightClass = variant === "condensed" ? "h-[var(--table-row-height-condensed)]" : "h-10";
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-xs text-secondary-t p-3 first:pl-6 last:pr-6 text-left align-middle font-normal whitespace-nowrap [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        heightClass,
        className,
      )}
      {...props}
    />
  );
}

const tableCellVariants = cva(
  "px-3 text-primary-t first:pl-6 last:pr-6 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "h-[var(--table-row-height)] py-3 text-[15px]/[20px]",
        condensed: "h-[var(--table-row-height-condensed)] py-0 text-xs font-normal [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  const variant = React.useContext(TableVariantContext);
  return (
    <td
      data-slot="table-cell"
      className={cn(tableCellVariants({ variant }), className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
