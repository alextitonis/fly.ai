import { useQuery } from "@tanstack/react-query";
import { createPublicClient, erc20Abi, formatUnits, type Address, type Chain } from "viem";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import type { TokenInfo } from "@/lib/tokens";
import type { MultiChainBalanceResult } from "@/hooks/use-multi-chain-balance";
import { useMockData } from "@/lib/mock-provider";
import {
  transports,
  allChains,
  base,
  baseSepolia,
} from "@/lib/chains";

const CHAIN_MAP: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
};

// Cache public clients at module level — never recreated
const clientCache: Record<number, ReturnType<typeof createPublicClient>> = {};

function getClient(chainId: number) {
  if (!clientCache[chainId]) {
    const chain = CHAIN_MAP[chainId];
    const transport = transports[chainId];
    if (!chain || !transport) return null;
    clientCache[chainId] = createPublicClient({ chain, transport });
  }
  return clientCache[chainId];
}

const ACTIVE_CHAIN_IDS: Set<number> = new Set(allChains.map((c) => c.id));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms),
    ),
  ]);
}

type TokenBalancesResult = Record<string, MultiChainBalanceResult>;

/**
 * Fetches balances for multiple tokens in a single batched query.
 * Groups requests by chain and uses multicall — reduces RPC calls from
 * (N_tokens × N_chains) individual calls to N_chains multicall requests.
 */
export function useAllTokenBalances(tokens: TokenInfo[]): {
  balances: TokenBalancesResult;
  isLoading: boolean;
} {
  const mock = useMockData();
  const { address: account } = useConnectedAddress();

  const { data, isLoading } = useQuery({
    queryKey: ["allTokenBalances", tokens.map((t) => t.symbol).join(","), account],
    enabled: !mock && !!account && tokens.length > 0,
    queryFn: async () => {
      // Build a map: chainId → list of (tokenIndex, tokenAddress, tokenDecimals)
      const chainTokenMap = new Map<
        number,
        Array<{ tokenIdx: number; address: Address; decimals: number }>
      >();

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        for (const [chainIdStr, tokenAddress] of Object.entries(token.addresses)) {
          const chainId = Number(chainIdStr);
          if (!ACTIVE_CHAIN_IDS.has(chainId) || !tokenAddress) continue;
          if (!chainTokenMap.has(chainId)) chainTokenMap.set(chainId, []);
          chainTokenMap
            .get(chainId)!
            .push({ tokenIdx: i, address: tokenAddress as Address, decimals: token.decimals });
        }
      }

      // Result: tokenIdx → list of ChainBalance
      const tokenChainBalances: Array<
        Array<{ chainId: number; chainName: string; balance: bigint; formattedBalance: string }>
      > = tokens.map(() => []);

      // One multicall per chain
      await Promise.allSettled(
        Array.from(chainTokenMap.entries()).map(async ([chainId, entries]) => {
          const client = getClient(chainId);
          if (!client) return;

          const chain = CHAIN_MAP[chainId];
          const calls = entries.map(({ address }) => ({
            address,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [account as Address],
          }));

          const results = await withTimeout(
            client.multicall({ contracts: calls, allowFailure: true }),
            8_000,
          );

          for (let i = 0; i < entries.length; i++) {
            const result = results[i];
            if (result.status !== "success") continue;
            const balance = result.result as bigint;
            const { tokenIdx, decimals } = entries[i];
            tokenChainBalances[tokenIdx].push({
              chainId,
              chainName: chain.name,
              balance,
              formattedBalance: formatUnits(balance, decimals),
            });
          }
        }),
      );

      const out: TokenBalancesResult = {};
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const chainBalances = tokenChainBalances[i];
        const totalBalance = chainBalances.reduce((sum, b) => sum + b.balance, 0n);
        out[token.symbol] = {
          balances: chainBalances,
          totalBalance,
          formattedTotalBalance: formatUnits(totalBalance, token.decimals),
          isLoading: false,
          error: null,
        };
      }
      return out;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (mock) {
    const mockBalances: TokenBalancesResult = {};
    for (const token of tokens) {
      mockBalances[token.symbol] = mock.scenario.balances[token.symbol] ?? {
        balances: [],
        totalBalance: 0n,
        formattedTotalBalance: "0",
        isLoading: false,
        error: null,
      };
    }
    return { balances: mockBalances, isLoading: false };
  }

  const empty: MultiChainBalanceResult = {
    balances: [],
    totalBalance: 0n,
    formattedTotalBalance: "0",
    isLoading: true,
    error: null,
  };

  const balances: TokenBalancesResult = {};
  for (const token of tokens) {
    balances[token.symbol] = data?.[token.symbol] ?? empty;
  }

  return { balances, isLoading };
}
