import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui-button";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, scrollToSection } from "@/lib/navigation";
import { useScrollSpy } from "@/layouts/icon-sidebar";

const NEXT_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Manage your balances, stake, bonds, and borrowing.",
  markets: "Explore the protocol treasury and analytics.",
};

export function PageNav() {
  const navigate = useNavigate();
  const activeSection = useScrollSpy();
  const currentIndex = NAV_SECTIONS.findIndex((s) => s.section === activeSection);
  const next = currentIndex >= 0 ? NAV_SECTIONS[currentIndex + 1] : null;

  if (!next) {
    return null;
  }

  const description = NEXT_DESCRIPTIONS[next.id] ?? `Continue to ${next.sidebarTitle}.`;

  const handleClick = () => {
    if (next.route) {
      navigate(`/${next.route}`);
    } else {
      scrollToSection(next.section);
    }
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-30 w-full border-b border-a10-b bg-surface-bg-l1/95 backdrop-blur",
        "px-4 py-3 md:px-8",
      )}
    >
      <div className="mx-auto w-full max-w-(--max-content-width) flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary-t">Next: {next.sidebarTitle}</p>
          <p className="text-xs text-secondary-t truncate">{description}</p>
        </div>
        <Button size="sm" onClick={handleClick}>
          {next.label}
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>
    </div>
  );
}
