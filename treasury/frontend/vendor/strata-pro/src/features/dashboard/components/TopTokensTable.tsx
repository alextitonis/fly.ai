import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { topTokens } from '../dashboard.data';
import { Card } from './Card';
import { cn } from '../../../lib/utils';
import { ChevronDown } from 'lucide-react';

import { TokenIcon } from '../../../components/ui/TokenIcon';

type Token = typeof topTokens[0];

const columnHelper = createColumnHelper<Token>();

const columns = [
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => (
      <div className="flex items-center gap-3 py-1">
        <TokenIcon symbol={info.row.original.symbol} className="w-8 h-8" />
        <div className="flex flex-col">
          <span className="text-[14px] font-medium text-brand-text">{info.getValue()}</span>
          <span className="text-[11px] text-brand-text-muted">{info.row.original.symbol}</span>
        </div>
      </div>
    ),
  }),

  columnHelper.accessor('liquidity', {
    header: 'Liquidity',
    cell: (info) => <span className="text-[14px] font-medium text-brand-text-secondary">{info.getValue()}</span>,
  }),
  columnHelper.accessor('volume', {
    header: 'Volume (24h)',
    cell: (info) => <span className="text-[14px] font-medium text-brand-text-secondary">{info.getValue()}</span>,
  }),
  columnHelper.accessor('price', {
    header: 'Price',
    cell: (info) => <span className="text-[14px] font-medium text-brand-text-secondary">{info.getValue()}</span>,
  }),
  columnHelper.accessor('change', {
    header: 'Price Change (24h)',
    cell: (info) => (
      <span className={cn("text-[14px] font-medium", info.row.original.isPositive ? "text-profit" : "text-loss")}>
        {info.getValue()}
      </span>
    ),
  }),
];

export function TopTokensTable() {
  const table = useReactTable({
    data: topTokens,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card className="px-0 py-0 overflow-hidden flex flex-col">
      
      {/* Table Header Wrapper */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border shrink-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-brand-text">Top Tokens</h2>
        <button className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-brand-border-subtle bg-[#121316] cursor-pointer hover:bg-brand-surface-2 active:scale-[0.97] text-[12px] font-medium text-brand-text-secondary transition-all duration-200 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
          24h Volume <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </div>

      <div className="w-full overflow-x-auto custom-scrollbar flex-1 relative">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-brand-border bg-[#101113]">
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="py-3 px-4 md:px-6 text-[12px] font-medium text-brand-text-muted whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr 
                key={row.id} 
                className="group border-b border-brand-border/50 hover:bg-brand-surface-hover active:bg-brand-surface-2 transition-colors duration-200 cursor-pointer"
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="py-2.5 px-4 md:px-6 h-[64px] align-middle whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
