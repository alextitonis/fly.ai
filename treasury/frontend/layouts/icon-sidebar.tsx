import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { SHITLogo } from "@/components/shit-logo";
import {
  NAV_SECTIONS,
  scrollToSection,
  renderNavIcon,
  type NavSection,
} from "@/lib/navigation";

const SECTION_IDS = NAV_SECTIONS.map((s) => s.section);

// Additional sections on the page that don't have their own nav entry
// but should still trigger scroll spy updates so the sidebar stays in sync
const EXTRA_SECTION_IDS = [
  "rewards",
  "admin",
];

const ALL_SECTION_IDS = [...SECTION_IDS, ...EXTRA_SECTION_IDS];

export function useScrollSpy() {
  const [activeSection, setActiveSection] = useState("overview");
  const location = useLocation();

  // Route-based active section: when on a routed page, use the route name
  const routeBasedActive = useMemo(() => {
    const path = location.pathname.replace(/^\//, "");
    if (!path) return null;
    // Try exact match first, then prefix match (e.g. /izipay/cards → izipay)
    const exact = NAV_SECTIONS.find((s) => s.route === path || s.section === path);
    if (exact) return exact.section;
    const prefix = NAV_SECTIONS.find((s) => s.route && path.startsWith(s.route + "/"));
    return prefix?.section ?? null;
  }, [location.pathname]);

  useEffect(() => {
    // If we're on a routed page, set active to the route's section
    if (routeBasedActive) {
      setActiveSection(routeBasedActive);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry closest to the top of the viewport
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Pick the topmost visible section
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );

    let attempt = 0;
    const maxAttempts = 20;
    let raf: number;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const tryObserve = () => {
      const missing: string[] = [];
      ALL_SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          observer.observe(el);
        } else {
          missing.push(id);
        }
      });
      if (missing.length > 0 && attempt < maxAttempts) {
        attempt++;
        timeout = setTimeout(tryObserve, 150);
      }
    };

    // Sections mount asynchronously after route changes and React render/layout
    // (including lazy-loaded pages), so defer attaching observers and retry
    // until the DOM is fully present.
    raf = requestAnimationFrame(() => {
      tryObserve();
    });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [location.pathname, routeBasedActive]);

  return activeSection;
}

function IconNavItem({
  section,
  isActive,
  "data-tour": dataTour,
}: {
  section: NavSection;
  isActive: boolean;
  "data-tour"?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const inner = (
    <>
      <div
        className={cn(
          "relative flex items-center justify-center size-10 rounded-full transition-all",
          isActive
            ? "sidebar-tab-active"
            : "border-[0.5px] border-transparent group-hover:bg-surface-a5 group-hover:border-a3-b",
        )}
      >
        {isActive && (
          <svg
            className="absolute inset-0 size-full pointer-events-none"
            viewBox="0 0 40 40"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="sidebar-tab-ring" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--sidebar-tab-border-top)" }} />
                <stop offset="100%" style={{ stopColor: "var(--sidebar-tab-border-bottom)" }} />
              </linearGradient>
            </defs>
            <circle
              cx="20"
              cy="20"
              r="19.75"
              fill="none"
              stroke="url(#sidebar-tab-ring)"
              strokeWidth="0.5"
            />
          </svg>
        )}
        <span
          className={cn(
            "relative [&>svg]:size-6 [&>svg]:transition-colors",
            isActive ? "text-primary-t" : "text-secondary-t group-hover:text-primary-t",
          )}
        >
          {renderNavIcon(section.icon, { isActive, isHovered, className: "size-6" })}
        </span>
      </div>
      <span
        className={cn(
          "text-xs font-medium leading-3 transition-colors",
          isActive ? "text-primary-t" : "text-secondary-t group-hover:text-primary-t",
        )}
      >
        {section.label}
      </span>
    </>
  );

  const navigate = useNavigate();
  const location = useLocation();

  const className = cn(
    "group flex flex-col items-center gap-1 w-16 rounded-[40px] px-1.25 pb-2.5",
  );

  if (section.route) {
    return (
      <a
        key={section.id}
        href={`#/${section.route}`}
        data-tour={dataTour}
        className={className}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {inner}
      </a>
    );
  }

  const handleNonRouteClick = () => {
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => scrollToSection(section.section), 150);
    } else {
      scrollToSection(section.section);
    }
  };

  return (
    <button
      type="button"
      data-tour={dataTour}
      onClick={handleNonRouteClick}
      className={className}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {inner}
    </button>
  );
}

export function IconSidebar() {
  const activeSection = useScrollSpy();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogoClick = () => {
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => scrollToSection("overview"), 150);
    } else {
      scrollToSection("overview");
    }
  };

  return (
    <aside className="shrink-0 flex items-center p-1.5">
      <div
        className="w-20 h-full flex flex-col items-center pb-3 rounded-[100px] bg-sidebar-bg shadow-surface-level-2"
        data-tour="sidebar-nav"
      >
        {/* Logo */}
        <div className="flex items-center justify-center p-4">
          <button type="button" onClick={handleLogoClick}>
            <SHITLogo className="size-8" />
          </button>
        </div>

        {/* Main nav items */}
        <nav className="flex-1 flex flex-col items-center pt-2 overflow-y-auto overflow-x-hidden">
          {NAV_SECTIONS.map((section) => (
            <IconNavItem
              key={section.id}
              section={section}
              isActive={activeSection === section.section}
              data-tour={`nav-${section.id}`}
            />
          ))}
        </nav>

      </div>
    </aside>
  );
}
