import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { NuqsAdapter } from "nuqs/adapters/react-router/v8";
import { Providers } from "@/components/providers";
import { IconSidebar } from "@/layouts/icon-sidebar";
import { MobileNav } from "@/layouts/mobile-nav";
import { ToasterProvider } from "@/components/ui-sonner";
import { PageNav } from "@/components/page-nav";
import { Footer } from "@/layouts/footer.tsx";
import { FeatureTour } from "@/components/feature-tour";
import { trackPageView, trackNetworkQuality } from "@/lib/analytics";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";
import { useScrollDepthTracking } from "@/hooks/use-scroll-depth-tracking";
import { initWebVitals } from "@/hooks/use-web-vitals";
import { ReferralFeeTracker } from "@/hooks/use-referral-fee-tracker";
import { ReferralAutoBind } from "@/hooks/use-referral-auto-bind";

const WalletAnalytics = lazy(() =>
  import("@/hooks/use-wallet-analytics").then((m) => ({ default: m.WalletAnalyticsTracker })),
);

function PageviewTracker() {
  const location = useLocation();
  useEffect(() => {
    // Defer to a macrotask so synchronous `<Navigate replace />` redirects
    // (e.g. `/` → `/pulse/overview`) supersede the source pageview.
    const id = setTimeout(() => {
      trackPageView({ pathname: location.pathname, search: location.search });
    }, 0);
    return () => clearTimeout(id);
  }, [location.pathname, location.search]);
  return null;
}

function GlobalErrorHandler() {
  useGlobalErrorHandler();
  return null;
}

function RoutePrefetcher() {
  useRoutePrefetch();
  return null;
}

function ScrollDepthTracker() {
  useScrollDepthTracking();
  return null;
}

function useIsSocialsSubdomain() {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.location.hostname === "socials.shit.finance";
  }, []);
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isSocials = useIsSocialsSubdomain();

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [pathname]);

  useEffect(() => {
    trackNetworkQuality();
    initWebVitals();
  }, []);

  return (
    <NuqsAdapter>
      <Providers>
        <PageviewTracker />
        <Suspense fallback={null}>
          <WalletAnalytics />
        </Suspense>
        <GlobalErrorHandler />
        <RoutePrefetcher />
        <ScrollDepthTracker />
        <ReferralAutoBind />
        <ReferralFeeTracker />
        <div className="flex h-dvh bg-surface-bg-l1 overflow-hidden">
          {/* Desktop icon sidebar — hidden on mobile and socials subdomain */}
          {!isSocials && (
            <div className="hidden md:flex">
              <IconSidebar />
            </div>
          )}

          {/* SubNav + main + footer wrapper */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <main
                ref={mainRef}
                className="flex-1 min-w-0 flex flex-col overflow-y-auto bg-surface-bg-l1"
              >
                <div className="flex md:hidden items-center justify-end px-4 py-3">
                  <MobileNav />
                </div>
                <PageNav />
                <div className="flex-1 px-4 pb-4 md:px-8 md:pb-8 w-full max-w-(--max-content-width) mx-auto relative">
                  <Outlet />
                </div>
              </main>
            </div>
            <Footer />
          </div>
        </div>
        <ToasterProvider />
        <FeatureTour />
      </Providers>
    </NuqsAdapter>
  );
}
