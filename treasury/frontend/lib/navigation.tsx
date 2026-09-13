import { isValidElement, type ComponentType, type ReactNode } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Trophy,
} from "lucide-react";

export type NavItem = {
  label: string;
  section: string;
  external?: boolean;
  exact?: boolean;
  requiresMultisig?: boolean;
};

export type AnimatedIconProps = { isHovered: boolean; isActive: boolean };

export type NavSection = {
  id: string;
  label: string;
  sidebarTitle: string;
  icon: ReactNode | ComponentType<AnimatedIconProps> | ComponentType<{ className?: string }>;
  section: string;
  items: NavItem[];
  isNew?: boolean;
  hideNavIfNotMultisig?: boolean;
  isComingSoon?: boolean;
  route?: string;
};

export function isAnimatedIcon(
  icon: ReactNode | ComponentType<AnimatedIconProps> | ComponentType<{ className?: string }>,
): icon is ComponentType<AnimatedIconProps> {
  return typeof icon === "function" && (icon as any).__lottie === true;
}

function isIconComponent(
  icon: unknown,
): icon is ComponentType<{ className?: string }> {
  if (typeof icon === "function") return true;
  if (icon && typeof icon === "object" && !isValidElement(icon)) {
    const typeSymbol = (icon as any).$$typeof;
    return (
      typeSymbol === Symbol.for("react.forward_ref") ||
      typeSymbol === Symbol.for("react.memo")
    );
  }
  return false;
}

export function renderNavIcon(
  icon: NavSection["icon"],
  { isActive, isHovered, className }: { isActive?: boolean; isHovered?: boolean; className?: string } = {},
): ReactNode {
  if (isAnimatedIcon(icon)) {
    const AnimatedIcon = icon;
    return <AnimatedIcon isHovered={isHovered ?? false} isActive={isActive ?? false} />;
  }
  if (isIconComponent(icon)) {
    const Comp = icon;
    return <Comp className={className} />;
  }
  if (isValidElement(icon)) {
    return icon;
  }
  return null;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "5H1T",
    sidebarTitle: "5H1T Overview",
    icon: TrendingUp,
    section: "overview",
    items: [
      { label: "Hero", section: "overview" },
      { label: "Brain Map", section: "overview" },
      { label: "Leaderboard", section: "overview" },
      { label: "How it works", section: "overview" },
    ],
  },
  {
    id: "traders",
    label: "Traders",
    sidebarTitle: "Connectome Traders & Betting",
    icon: Trophy,
    section: "traders",
    route: "traders",
    items: [],
  },
  {
    id: "treasury",
    label: "Treasury",
    sidebarTitle: "FLYAI Reserves & Treasury Ops",
    icon: TrendingUp,
    section: "treasury",
    route: "treasury",
    items: [],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    sidebarTitle: "Grow & Borrow",
    icon: LayoutDashboard,
    section: "dashboard",
    route: "dashboard",
    items: [
      { label: "Balances", section: "dashboard" },
      { label: "Stake", section: "dashboard" },
      { label: "Bonds", section: "dashboard" },
      { label: "Borrow", section: "dashboard" },
    ],
  },
];

export function scrollToSection(sectionId: string) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
