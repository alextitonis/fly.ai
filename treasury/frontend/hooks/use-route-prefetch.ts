import { useEffect } from "react";

const PREFETCHED = new Set<string>();

const PREFETCH_ROUTES = [
  () => import("@/modules/protocol-protocol-overview-page"),
  () => import("@/modules/protocol-coming-soon-page"),
  () => import("@/modules/impact-impact-tokens-page"),
  () => import("@/modules/impact-impact-clarity-dashboard"),
  () => import("@/modules/airdrop-airdrop-page"),
  () => import("@/modules/referral-referral-page"),
  () => import("@/modules/izipay-izipay-dashboard-page"),
  () => import("@/modules/verify-verify-page"),
  () => import("@/modules/contracts-contracts-page"),
];

export function useRoutePrefetch() {
  useEffect(() => {
    const prefetch = () => {
      for (const loader of PREFETCH_ROUTES) {
        const key = loader.toString();
        if (PREFETCHED.has(key)) continue;
        PREFETCHED.add(key);
        loader().catch(() => {
          PREFETCHED.delete(key);
        });
      }
    };

    if ("requestIdleCallback" in window) {
      const id = (window as Window).requestIdleCallback(prefetch, { timeout: 3000 });
      return () => (window as Window).cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);
}
