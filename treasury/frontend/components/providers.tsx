import { lazy, Suspense } from "react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui-tooltip";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount < 3 && error instanceof Error) {
          return !error.message.includes("User rejected");
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});

const Web3Providers = lazy(() =>
  import("@/components/web3-providers").then((m) => ({ default: m.Web3Providers })),
);

const DevProvider = lazy(() =>
  import("@/components/dev-provider").then((m) => ({ default: m.DevProvider })),
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="shit-theme">
        <TooltipProvider delay={100}>
          <Suspense fallback={null}>
            <Web3Providers>
              <DevProvider>{children}</DevProvider>
            </Web3Providers>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
