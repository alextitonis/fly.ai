import { useEffect } from "react";
import { WagmiProvider } from "wagmi";
import { hashFn } from "@wagmi/core/query";
import { useQueryClient } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { type AppKitNetwork } from "@reown/appkit/networks";
import { config } from "@/lib/wagmi-config";
import { allChains } from "@/lib/chains";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "dummy";

const networks = allChains as unknown as [AppKitNetwork, ...AppKitNetwork[]];

// Create the Reown AppKit instance once
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: WALLETCONNECT_PROJECT_ID,
  ssr: false,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId: WALLETCONNECT_PROJECT_ID,
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: "dark",
});

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      queries: {
        ...queryClient.getDefaultOptions().queries,
        queryKeyHashFn: hashFn,
      },
    });
  }, [queryClient]);

  return (
    <WagmiProvider config={config}>
      {children}
      {import.meta.env.DEV && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </WagmiProvider>
  );
}
