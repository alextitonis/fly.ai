import { cn } from "@/lib/utils";

type CardVisualProps = {
  cardType: "visa" | "mastercard";
  cardId: string;
  status: string;
  balance?: number;
  className?: string;
};

export function CardVisual({ cardType, cardId, status, balance, className }: CardVisualProps) {
  const last4 = cardId.replace(/-/g, "").slice(-4) || "0000";
  const displayNumber = `**** **** **** ${last4}`;

  return (
    <div
      className={cn(
        "relative aspect-[1.586/1] w-full rounded-2xl p-5 overflow-hidden transition-transform hover:scale-[1.02]",
        "bg-gradient-to-br from-[hsl(38_15%_12%)] via-[hsl(38_12%_9%)] to-[hsl(38_15%_6%)]",
        "border border-[hsl(38_10%_20%)] shadow-xl",
        className,
      )}
    >
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-[hsl(155_45%_50%_/_0.08)] blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-[hsl(45_50%_55%_/_0.06)] blur-2xl" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(155_45%_50%)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[hsl(38_15%_7%)]" fill="currentColor">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-[hsl(45_25%_93%)]">5H1TPay</span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            status === "active" && "bg-green-500/20 text-green-400",
            status === "pending" && "bg-yellow-500/20 text-yellow-400",
            status === "failed" && "bg-red-500/20 text-red-400",
            status === "frozen" && "bg-blue-500/20 text-blue-400",
            !["active", "pending", "failed", "frozen"].includes(status) && "bg-white/10 text-white/60",
          )}
        >
          {status}
        </span>
      </div>

      <div className="relative mt-4 flex items-center gap-3">
        <div className="h-7 w-9 rounded-md bg-gradient-to-br from-yellow-600/40 to-yellow-800/30 border border-yellow-700/30" />
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-[hsl(45_25%_93%_/_0.4)]" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5v14" strokeLinecap="round" />
        </svg>
      </div>

      <div className="relative mt-3">
        <p className="font-mono text-sm tracking-widest text-[hsl(45_25%_93%)]">{displayNumber}</p>
      </div>

      <div className="relative mt-auto flex items-end justify-between pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[hsl(45_25%_93%_/_0.5)]">Balance</p>
          <p className="text-lg font-bold text-[hsl(45_25%_93%)]">
            {balance !== undefined ? `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          </p>
        </div>
        {cardType === "visa" ? (
          <div className="text-right">
            <span className="text-xl font-bold italic text-[hsl(45_25%_93%)] tracking-tight">VISA</span>
          </div>
        ) : (
          <div className="flex items-center">
            <div className="h-7 w-7 rounded-full bg-red-500/80" />
            <div className="h-7 w-7 -ml-3 rounded-full bg-yellow-500/80" />
          </div>
        )}
      </div>
    </div>
  );
}
