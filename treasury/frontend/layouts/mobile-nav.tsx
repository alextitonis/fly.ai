import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Menu, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui-button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui-sheet";
import { SHITLogo } from "@/components/shit-logo";
import { NAV_SECTIONS, scrollToSection, renderNavIcon, type NavSection } from "@/lib/navigation";

const SECTION_IDS = NAV_SECTIONS.map((s) => s.section);

function useScrollSpy() {
  const [activeSection, setActiveSection] = useState("overview");
  const location = useLocation();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    // Sections mount asynchronously after route changes, so defer attaching
    // observers by a frame to ensure the new DOM is present.
    const raf = requestAnimationFrame(() => {
      SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [location.pathname]);

  return activeSection;
}

function MobileSectionItem({
  section,
  isActive,
  onSelect,
}: {
  section: NavSection;
  isActive: boolean;
  onSelect: (section: NavSection) => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "[&>svg]:size-5 [&>svg]:transition-colors",
          isActive ? "text-primary-t" : "text-secondary-t",
        )}
      >
        {renderNavIcon(section.icon, { isActive, className: "size-5" })}
      </span>
      <span
        className={cn(
          "text-sm leading-tight transition-colors",
          isActive ? "text-primary-t font-medium" : "text-secondary-t",
        )}
      >
        {section.label}
      </span>
    </>
  );

  const className = cn(
    "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors w-full text-left",
    isActive ? "bg-surface-a10" : "hover:bg-surface-a3",
  );

  if (section.route) {
    return (
      <a
        key={section.id}
        href={`#/${section.route}`}
        onClick={() => onSelect(section)}
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(section)}
      className={className}
    >
      {content}
    </button>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const scrollActive = useScrollSpy();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSectionSelect = (section: NavSection) => {
    if (!section.route) {
      if (location.pathname !== "/") {
        navigate("/");
        setTimeout(() => scrollToSection(section.section), 150);
      } else {
        scrollToSection(section.section);
      }
    }
    setOpen(false);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Button variant="tertiary" size="sm" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col py-4">
            {/* Logo */}
            <div className="flex items-center justify-center pb-4">
              <button
                type="button"
                onClick={() => {
                  if (location.pathname !== "/") {
                    navigate("/");
                  }
                  scrollToSection("overview");
                  handleClose();
                }}
              >
                <SHITLogo className="size-7" />
              </button>
            </div>

            {/* Section items */}
            <nav className="flex-1 flex flex-col gap-0.5 px-2">
              {NAV_SECTIONS.map((section) => (
                <MobileSectionItem
                  key={section.id}
                  section={section}
                  isActive={scrollActive === section.section}
                  onSelect={handleSectionSelect}
                />
              ))}
            </nav>

            {/* Bottom items */}
            <div className="flex flex-col gap-0.5 px-2 pt-2 border-t border-a10-b">
              <a
                href="/#/whitepaper"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClose}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-a3 w-full"
              >
                <FileText className="size-5 text-secondary-t" />
                <span className="text-sm text-secondary-t">Docs</span>
              </a>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
