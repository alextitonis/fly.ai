import { Search, Bell, User, Radio, Menu } from "lucide-react";
import { cn } from "../../lib/utils";
import { TokenIcon } from "../ui/TokenIcon";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="h-[56px] border-b border-brand-border flex items-center justify-between px-4 md:px-5 bg-brand-bg relative z-10 shrink-0">
      
      {/* Left: Mobile Menu & Search */}
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-hover transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-brand-text-muted" />
          <input 
            type="text" 
            placeholder="Search" 
            className="h-[40px] w-[180px] md:w-[240px] bg-[#121316] rounded-xl pl-9 pr-4 text-[13px] text-brand-text placeholder-brand-text-muted border border-brand-border-subtle focus:border-brand-border focus:outline-none transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
          />
        </div>
      </div>

      {/* Right: Market Pills & Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        
        {/* Market Ticker Pills (Hidden on Mobile) */}
        <div className="hidden lg:flex items-center gap-2">
          <TickPill symbol="BTC" percent="+4.8%" color="text-profit" />
          <TickPill symbol="ETH" percent="+3.1%" color="text-profit" />
          <TickPill symbol="USDC" percent="Stable" color="text-brand-text-secondary" />
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-[1px] h-4 bg-brand-border mx-1" />

        {/* Live Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 h-[28px] rounded-full border border-brand-border-subtle bg-[#151618]">
          <Radio className="w-3.5 h-3.5 text-profit" />
          <span className="hidden sm:inline text-[12px] font-medium text-brand-text">Live</span>
        </div>

        <div className="flex items-center gap-1">
          <button className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-brand-surface border border-transparent hover:border-brand-border-subtle active:scale-[0.95] transition-all duration-200">
            <Bell className="w-4 h-4 text-brand-text-secondary" />
          </button>

          <button className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-[#151618] border border-brand-border-subtle hover:bg-brand-surface-hover active:scale-[0.95] shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] transition-all duration-200">
            <User className="w-4 h-4 text-brand-text-secondary" />
          </button>
        </div>

      </div>
    </header>
  );
}

function TickPill({ symbol, percent, color }: { symbol: string, percent: string, color: string }) {
  return (
    <button className="flex items-center gap-2 px-3 h-[28px] rounded-full bg-[#151618] border border-brand-border-subtle cursor-pointer hover:bg-brand-surface-hover active:scale-[0.98] shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] transition-all duration-200 text-[11px] font-medium">
      <TokenIcon symbol={symbol} className="w-3.5 h-3.5" />
      <span className="text-brand-text">{symbol}</span>
      <span className={color}>{percent}</span>
    </button>
  );
}

