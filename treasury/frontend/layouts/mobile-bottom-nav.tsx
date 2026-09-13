import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, scrollToSection, renderNavIcon } from "@/lib/navigation";

const QUICK_NAV = NAV_SECTIONS.filter((s) =>
  ["home", "impact-tokens", "dashboard", "treasury", "izipay"].includes(s.id),
);

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (section: (typeof NAV_SECTIONS)[number]) => {
    if (section.route) {
      const path = location.pathname.replace(/^\//, "");
      return path === section.route || path.startsWith(section.route + "/");
    }
    return location.pathname === "/" && false;
  };

  const handleClick = (section: (typeof NAV_SECTIONS)[number]) => {
    if (section.route) {
      navigate(`/${section.route}`);
    } else {
      if (location.pathname !== "/") {
        navigate("/");
        setTimeout(() => scrollToSection(section.section), 100);
      } else {
        scrollToSection(section.section);
      }
    }
  };

  return (
    <nav className="md:hidden w-full h-24 bg-surface-bg-l1 border-t border-a10-b">
      <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
        {QUICK_NAV.map((section) => {
          const active = isActive(section);
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => handleClick(section)}
              className="flex flex-col items-center gap-1 px-2 py-1 min-w-[56px]"
            >
              <span
                className={cn(
                  "[&>svg]:size-5 [&>svg]:transition-colors",
                  active ? "text-primary-t" : "text-secondary-t",
                )}
              >
                {renderNavIcon(section.icon, { isActive: active, className: "size-5" })}
              </span>
              <span
                className={cn(
                  "text-[10px] leading-tight transition-colors",
                  active ? "text-primary-t font-medium" : "text-secondary-t",
                )}
              >
                {section.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
