import { lazy, Suspense } from "react";
import { createHashRouter, Navigate } from "react-router";
import AppLayout from "@/layouts/app-layout";
import { RouteErrorElement } from "@/components/route-error-element";
import { RouteLoadingFallback } from "@/components/route-loading-fallback";

function retryLazy<T>(
  factory: () => Promise<T>,
  retries = 2,
): Promise<T> {
  return factory().catch((err) => {
    const msg = err?.message ?? "";
    if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
      window.location.reload();
      return new Promise(() => {});
    }
    if (retries <= 0) throw err;
    return new Promise((resolve) => {
      setTimeout(() => resolve(retryLazy(factory, retries - 1)), 300);
    });
  });
}

const VerifyPage = lazy(() =>
  retryLazy(() => import("@/modules/verify-verify-page")).then((m) => ({ default: m.VerifyPage })),
);
const ContractsPage = lazy(() =>
  retryLazy(() => import("@/modules/contracts-contracts-page")).then((m) => ({ default: m.ContractsPage })),
);
const WhitepaperPage = lazy(() =>
  retryLazy(() => import("@/modules/protocol-whitepaper-page")).then((m) => ({ default: m.WhitepaperPage })),
);
const WhitelistPage = lazy(() =>
  retryLazy(() => import("@/modules/whitelist-whitelist-page")).then((m) => ({ default: m.WhitelistPage })),
);

const DocsPage = lazy(() =>
  retryLazy(() => import("@/modules/protocol-docs-page")).then((m) => ({ default: m.DocsPage })),
);

const BugBountyPage = lazy(() =>
  retryLazy(() => import("@/modules/protocol-bug-bounty-page")).then((m) => ({
    default: m.BugBountyPage,
  })),
);

const DashboardPage = lazy(() =>
  retryLazy(() => import("@/modules/protocol-dashboard-page")).then((m) => ({
    default: m.DashboardPage,
  })),
);

const BondPage = lazy(() =>
  retryLazy(() => import("@/modules/bonds-bond-page")).then((m) => ({
    default: m.BondPage,
  })),
);

const WrapPage = lazy(() =>
  retryLazy(() => import("@/modules/shit-wrap-page")).then((m) => ({
    default: m.WrapPage,
  })),
);

const CoolerBorrowPage = lazy(() =>
  retryLazy(() => import("@/modules/cooler-borrow-page")).then((m) => ({
    default: m.CoolerBorrowPage,
  })),
);

const RBSPage = lazy(() =>
  retryLazy(() => import("@/modules/rbs-rbs-page")).then((m) => ({
    default: m.RBSPage,
  })),
);

const UnifiedDashboardPage = lazy(() =>
  retryLazy(() => import("@/modules/protocol-unified-dashboard-page")).then((m) => ({
    default: m.UnifiedDashboardPage,
  })),
);

const FiveHitOverviewPage = lazy(() =>
  retryLazy(() => import("@/modules/5h1t-overview-page")).then((m) => ({ default: m.FiveHitOverviewPage })),
);
const FiveHitTradersPage = lazy(() =>
  retryLazy(() => import("@/modules/5h1t-traders-page")).then((m) => ({ default: m.FiveHitTradersPage })),
);
const FiveHitTreasuryPage = lazy(() =>
  retryLazy(() => import("@/modules/5h1t-treasury-page")).then((m) => ({ default: m.FiveHitTreasuryPage })),
);

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>
);

export const router = createHashRouter([
  {
    path: "/",
    Component: AppLayout,
    errorElement: <RouteErrorElement />,
    children: [
      { index: true, element: withSuspense(<FiveHitOverviewPage />) },
      { path: "traders", element: withSuspense(<FiveHitTradersPage />) },
      { path: "treasury", element: withSuspense(<FiveHitTreasuryPage />) },
      { path: "verify", element: withSuspense(<VerifyPage />) },
      { path: "contracts", element: withSuspense(<ContractsPage />) },
      { path: "whitepaper", element: withSuspense(<WhitepaperPage />) },
      { path: "docs/:docId", element: withSuspense(<DocsPage />) },
      { path: "bug-bounty", element: withSuspense(<BugBountyPage />) },
      { path: "whitelist", element: withSuspense(<WhitelistPage />) },
      { path: "dashboard", element: withSuspense(<DashboardPage />) },
      { path: "bonds", element: withSuspense(<BondPage />) },
      { path: "stake-wrap", element: withSuspense(<WrapPage />) },
      { path: "borrow", element: withSuspense(<CoolerBorrowPage />) },
      { path: "rbs", element: withSuspense(<RBSPage />) },
      { path: "dashboards", element: withSuspense(<UnifiedDashboardPage />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
