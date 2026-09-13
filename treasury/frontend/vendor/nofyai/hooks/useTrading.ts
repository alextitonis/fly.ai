'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { api, PaginatedResponse } from '@/lib/api';
import type {
  CompetitionData,
  TraderInfo,
  SystemStatus,
  AccountInfo,
  Position,
  DecisionRecord,
  Statistics,
  EquityPoint,
  PerformanceAnalysis,
  MaskedSystemConfig,
  ClosedPositionsResponse,
  ClosedPosition,
} from '@/types';

// SWR configuration
const defaultConfig = {
  refreshInterval: 15000, // 15 seconds
  revalidateOnFocus: false,
  dedupingInterval: 10000,
};

/**
 * Fetch competition data (all traders comparison)
 */
export function useCompetition() {
  return useSWR<CompetitionData>(
    'competition',
    () => api.getCompetition(),
    {
      refreshInterval: 15000,
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch all traders list
 */
export function useTraders() {
  return useSWR<TraderInfo[]>(
    'traders',
    () => api.getTraders(),
    {
      refreshInterval: 10000,
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch system status for a specific trader
 */
export function useStatus(traderId?: string) {
  return useSWR<SystemStatus>(
    traderId ? `status-${traderId}` : null,
    () => api.getStatus(traderId),
    defaultConfig
  );
}

/**
 * Fetch account info for a specific trader
 */
export function useAccount(traderId?: string) {
  return useSWR<AccountInfo>(
    traderId ? `account-${traderId}` : null,
    () => api.getAccount(traderId),
    {
      ...defaultConfig,
      refreshInterval: 10000, // More frequent for account data
    }
  );
}

/**
 * Fetch positions for a specific trader
 */
export function usePositions(traderId?: string) {
  return useSWR<Position[]>(
    traderId ? `positions-${traderId}` : null,
    () => api.getPositions(traderId),
    defaultConfig
  );
}

/**
 * Fetch decision records with pagination support
 */
export function useDecisionsPaginated(traderId?: string, page: number = 1, limit: number = 20) {
  return useSWR<PaginatedResponse<DecisionRecord>>(
    traderId ? `decisions-${traderId}-${page}-${limit}` : null,
    () => api.getDecisions(traderId, page, limit),
    {
      refreshInterval: 30000, // Less frequent
      revalidateOnFocus: false,
    }
  );
}

/**
 * Hook for infinite scroll / load more pattern
 */
export function useDecisionsInfinite(traderId?: string, pageSize: number = 20) {
  const [allDecisions, setAllDecisions] = useState<DecisionRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data, error, isLoading } = useSWR<PaginatedResponse<DecisionRecord>>(
    traderId ? `decisions-infinite-${traderId}-${page}-${pageSize}` : null,
    () => api.getDecisions(traderId, page, pageSize),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      onSuccess: (data) => {
        if (page === 1) {
          // First page - replace all
          setAllDecisions(data.decisions);
        } else {
          // Subsequent pages - append
          setAllDecisions(prev => [...prev, ...data.decisions]);
        }
        setHasMore(data.pagination.has_more);
        setIsLoadingMore(false);
      },
    }
  );

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading) {
      setIsLoadingMore(true);
      setPage(prev => prev + 1);
    }
  }, [hasMore, isLoadingMore, isLoading]);

  const reset = useCallback(() => {
    setPage(1);
    setAllDecisions([]);
    setHasMore(true);
  }, []);

  return {
    decisions: allDecisions,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    reset,
    pagination: data?.pagination,
  };
}

/**
 * Fetch all decision records for a specific trader (legacy - for backward compatibility)
 * @deprecated Use useDecisionsPaginated or useDecisionsInfinite instead
 */
export function useDecisions(traderId?: string) {
  return useSWR<DecisionRecord[]>(
    traderId ? `decisions-legacy-${traderId}` : null,
    async () => {
      const response = await api.getDecisions(traderId, 1, 100);
      return response.decisions;
    },
    {
      refreshInterval: 30000, // Less frequent
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch latest decision records for a specific trader
 */
export function useLatestDecisions(traderId?: string) {
  return useSWR<DecisionRecord[]>(
    traderId ? `decisions-latest-${traderId}` : null,
    () => api.getLatestDecisions(traderId),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch statistics for a specific trader
 */
export function useStatistics(traderId?: string) {
  return useSWR<Statistics>(
    traderId ? `statistics-${traderId}` : null,
    () => api.getStatistics(traderId),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch equity history for a specific trader
 */
export function useEquityHistory(traderId?: string) {
  return useSWR<EquityPoint[]>(
    traderId ? `equity-history-${traderId}` : null,
    () => api.getEquityHistory(traderId),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch performance analysis for a specific trader
 */
export function usePerformance(traderId?: string) {
  return useSWR<PerformanceAnalysis>(
    traderId ? `performance-${traderId}` : null,
    () => api.getPerformance(traderId),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );
}

/**
 * Fetch system configuration (masked sensitive keys)
 */
export function useConfig() {
  return useSWR<MaskedSystemConfig>(
    'config',
    () => api.getConfig(),
    {
      refreshInterval: 60000, // 1 minute (config rarely changes)
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  );
}

/**
 * Fetch closed trades (平仓记录) with pagination support
 * Uses the new /api/trades endpoint for fast access to closed positions
 */
export function useClosedTrades(traderId?: string, pageSize: number = 20) {
  const [allTrades, setAllTrades] = useState<ClosedPosition[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data, error, isLoading } = useSWR<ClosedPositionsResponse>(
    traderId ? `closed-trades-${traderId}-${page}-${pageSize}` : null,
    () => api.getClosedTrades(traderId!, page, pageSize),
    {
      refreshInterval: 30000, // Refresh every 30s
      revalidateOnFocus: false,
      onSuccess: (data) => {
        if (page === 1) {
          // First page - replace all
          setAllTrades(data.data);
        } else {
          // Subsequent pages - append
          setAllTrades(prev => [...prev, ...data.data]);
        }
        setHasMore(data.pagination.has_next);
        setIsLoadingMore(false);
      },
    }
  );

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading) {
      setIsLoadingMore(true);
      setPage(prev => prev + 1);
    }
  }, [hasMore, isLoadingMore, isLoading]);

  const reset = useCallback(() => {
    setPage(1);
    setAllTrades([]);
    setHasMore(true);
  }, []);

  return {
    trades: allTrades,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    reset,
    pagination: data?.pagination,
  };
}
