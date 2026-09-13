import { useQuery } from "@tanstack/react-query";
import { createPublicClient, erc20Abi, formatUnits, type Address, type Chain } from "viem";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import type { TokenInfo } from "@/lib/tokens";
import { useMockData } from "@/lib/mock-provider";
import {
  transports,
  allChains,
  base,
  baseSepolia,
} from "@/lib/chains";

const ACTIVE_CHAIN_IDS: Set<number> = new Set(allChains.map((c) => c.id));

const CHAIN_MAP: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
};

export type ChainBalance = {
  chainId: number;
  chainName: string;
  balance: bigint;
  formattedBalance: string;
};

export type MultiChainBalanceResult = {
  balances: ChainBalance[];
  totalBalance: bigint;
  formattedTotalBalance: string;
  isLoading: boolean;
  error: Error | null;
};

const EMPTY_RESULT: MultiChainBalanceResult = {
  balances: [],
  totalBalance: 0n,
  formattedTotalBalance: "0",
  isLoading: false,
  error: null,
};

export function useMultiChainBalance(token: TokenInfo): MultiChainBalanceResult {
  const mock = useMockData();
  const { address: account } = useConnectedAddress();
  const chainIds = Object.keys(token.addresses)
    .map(Number)
    .filter((id) => ACTIVE_CHAIN_IDS.has(id));

  const { data, isLoading, error } = useQuery({
    queryKey: ["multiChainBalance", token.symbol, account],
    enabled: !mock && !!account && chainIds.length > 0,
    queryFn: async () => {
      const results = await Promise.allSettled(
        chainIds.map(async (chainId) => {
          const chain = CHAIN_MAP[chainId];
          const transport = transports[chainId];
          if (!chain || !transport) return null;

          const client = createPublicClient({ chain, transport });
          const tokenAddress = token.addresses[chainId];
          if (!tokenAddress) return null;

          const balance = await client.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account as Address],
          });

          return {
            chainId,
            chainName: chain.name,
            balance,
            formattedBalance: formatUnits(balance, token.decimals),
          } satisfies ChainBalance;
        }),
      );

      return results
        .filter((r): r is PromiseFulfilledResult<ChainBalance | null> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((r): r is ChainBalance => r !== null);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (mock) {
    return mock.scenario.balances[token.symbol] ?? EMPTY_RESULT;
  }

  const balances = data ?? [];
  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0n);

  return {
    balances,
    totalBalance,
    formattedTotalBalance: formatUnits(totalBalance, token.decimals),
    isLoading,
    error: error as Error | null,
  };
}
