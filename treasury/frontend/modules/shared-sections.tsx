import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export function SectionWrapper({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-20", className)}>
      {children}
    </section>
  );
}

export function SectionHead({
  kicker,
  title,
  subtitle,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl mb-12" data-reveal>
      {kicker && (
        <span className="block font-mono text-sm uppercase tracking-wider text-yellow mb-3">
          {kicker}
        </span>
      )}
      <h2 className="font-serif text-3xl md:text-4xl font-medium leading-tight">{title}</h2>
      {subtitle && <p className="text-secondary-t mt-3 text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}

export function PhaseBanner({
  variant,
  title,
  subtitle,
}: {
  variant: "live" | "coming-soon";
  title: string;
  subtitle: string;
}) {
  const isLive = variant === "live";
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border px-6 py-5 mb-10 shadow-card",
        isLive ? "border-green/30 bg-green/10" : "border-yellow/30 bg-yellow/10",
      )}
      data-reveal
    >
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap",
          isLive ? "bg-green/20 text-green" : "bg-yellow/20 text-yellow",
        )}
      >
        {isLive ? (
          <>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-green opacity-75 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-green" />
            </span>
            Live now
          </>
        ) : (
          "🔒 Coming soon"
        )}
      </span>
      <div>
        <div className="font-serif text-lg leading-tight">{title}</div>
        <p className="text-secondary-t text-base mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

export function ProductCard({
  icon,
  symbol,
  name,
  tagline,
  description,
  details: { rows },
  hideDetails,
}: {
  icon: string;
  symbol: string;
  name: string;
  tagline: string;
  description: string;
  details: { rows: { label: string; value: string }[] };
  hideDetails?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="border border-a10-b rounded-2xl bg-gradient-to-br from-surface-bg-l2 to-surface-bg-l1 p-6 flex flex-col shadow-card transition-all hover:-translate-y-1"
      data-reveal
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "size-9 rounded-full flex items-center justify-center text-lg overflow-hidden",
            symbol === "SHIT" && "bg-green/20",
            symbol === "BUCKY" && "bg-yellow/20",
            symbol === "RIDX" && "bg-blue/20",
          )}
        >
          {icon.startsWith("/") ? (
            <img
              src={icon}
              alt={name}
              loading="lazy"
              decoding="async"
              className="size-full object-contain"
            />
          ) : (
            icon
          )}
        </div>
        <span className="font-mono text-xs text-secondary-t border border-a20-b px-2.5 py-1 rounded-full">
          {symbol}
        </span>
      </div>
      <h3 className="font-serif text-xl mt-4">{name}</h3>
      <div className="text-yellow text-base mt-1 font-medium">{tagline}</div>
      <p className="text-secondary-t mt-3 text-base flex-1 leading-relaxed">{description}</p>
      {!hideDetails && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="mt-4 flex items-center gap-2 font-mono text-sm text-secondary-t hover:text-primary-t transition-colors self-start"
          >
            {open ? "Hide technical details" : "Technical details"}
            <span className={cn("transition-transform text-xs", open && "rotate-180")}>▾</span>
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              open ? "max-h-64 mt-3" : "max-h-0",
            )}
          >
            <div className="border-t border-a10-b pt-3 flex flex-col gap-2">
              {rows.map((row) => (
                <div key={row.label} className="flex justify-between font-mono text-base">
                  <span className="text-secondary-t">{row.label}</span>
                  <span className="text-primary-t">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
