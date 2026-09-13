import { BarChart2, Coins, Share2, Users, LineChart, FileText, MessageSquare, Twitter, X } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="w-full lg:w-[248px] h-full bg-brand-sidebar border-r border-brand-border flex flex-col shrink-0">
      
      {/* Brand Header */}
      <div className="h-[56px] px-5 flex items-center justify-between mt-1 group">
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="relative w-8 h-8 rounded-xl bg-gradient-to-b from-[#33343A] to-[#0B0C0E] p-[1px] shadow-[0_4px_12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.25),inset_0_-1px_1px_rgba(0,0,0,0.6)] transition-transform duration-200 group-active:scale-[0.96]">
            <div className="absolute inset-[1px] rounded-[11px] bg-gradient-to-b from-[#16171A] to-[#090A0C] flex items-center justify-center overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent opacity-50" />
              <div className="absolute top-0 left-0 w-full h-[50%] bg-gradient-to-b from-white/[0.06] to-transparent" />
              <div className="w-3.5 h-3.5 rotate-45 rounded-[4px] bg-gradient-to-br from-[#FFFFFF] via-[#E2E2E8] to-[#80808A] shadow-[0_2px_4px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-1px_1px_rgba(0,0,0,0.3)]" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[17px] tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-[#FFFFFF] via-[#F4F4F5] to-[#A1A1AA] transition-opacity duration-200 group-hover:opacity-90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Strata</span>
            <div className="px-1.5 py-0.5 rounded-[4px] bg-gradient-to-b from-[#A1A1AA]/20 to-transparent border border-[#A1A1AA]/20 flex items-center justify-center">
              <span className="text-[9px] font-bold tracking-wider text-[#E2E2E8]">PRO</span>
            </div>
          </div>
        </div>
        
        {onClose && (
          <button 
            onClick={onClose}
            className="lg:hidden p-1.5 -mr-1.5 rounded-lg text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 py-4 space-y-8 overflow-y-auto">
        
        <div>
          <div className="space-y-1">
            <NavItem icon={BarChart2} label="Overview" active />
            <NavItem icon={Coins} label="Tokens" />
            <NavItem icon={Share2} label="Pairs" />
            <NavItem icon={Users} label="Accounts" />
          </div>
        </div>

        <div className="space-y-1">
          <NavItem icon={LineChart} label="Analytics" muted />
          <NavItem icon={FileText} label="Docs" muted />
          <NavItem icon={MessageSquare} label="Discord" muted />
          <NavItem icon={Twitter} label="X" muted href="https://x.com/milonspace" />
        </div>

      </nav>

      {/* Footer Status */}
      <div className="p-5 mt-auto">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />
          <span className="text-[11px] font-medium text-brand-text-muted">Demo market feed</span>
        </div>
      </div>
      
    </aside>
  );
}

function NavItem({ icon: Icon, label, active, muted, href }: { icon: any, label: string, active?: boolean, muted?: boolean, href?: string }) {
  const Component = href ? 'a' : 'button';
  return (
    <Component
      href={href}
      target={href ? "_blank" : undefined}
      rel={href ? "noreferrer" : undefined}
      className={cn(
        "w-full flex items-center gap-3 px-3 h-9 rounded-lg transition-all duration-200 text-[13px] font-medium cursor-pointer active:scale-[0.98]",
        active 
          ? "bg-brand-border-subtle border border-brand-border-subtle text-brand-text shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]" 
          : "text-brand-text-secondary hover:text-brand-text hover:bg-brand-surface-hover active:bg-brand-surface-2"
      )}
    >
      <Icon className={cn("w-[15px] h-[15px]", active ? "text-brand-text" : "text-brand-text-muted opacity-80")} />
      <span className={cn(muted && !active && "opacity-80")}>{label}</span>
    </Component>
  );
}
