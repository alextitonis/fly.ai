import type {
  SystemStatus,
  AccountInfo,
  Position,
  DecisionRecord,
  Statistics,
  TraderInfo,
  CompetitionData,
  EquityPoint,
  PerformanceAnalysis,
  MaskedSystemConfig,
  ClosedPositionsResponse,
} from '@/types';

export interface PaginatedResponse<T> {
  decisions: T[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    has_more: boolean;
  };
}

const API_BASE = '/api';

class APIClient {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Competition endpoints
  async getCompetition(): Promise<CompetitionData> {
    return this.fetch<CompetitionData>('/competition');
  }

  async getTraders(): Promise<TraderInfo[]> {
    return this.fetch<TraderInfo[]>('/traders');
  }

  // Configuration endpoint
  async getConfig(): Promise<MaskedSystemConfig> {
    return this.fetch<MaskedSystemConfig>('/config');
  }

  // Trader-specific endpoints
  async getStatus(traderId?: string): Promise<SystemStatus> {
    const url = traderId ? `/status?trader_id=${traderId}` : '/status';
    return this.fetch<SystemStatus>(url);
  }

  async getAccount(traderId?: string): Promise<AccountInfo> {
    const url = traderId ? `/account?trader_id=${traderId}` : '/account';
    return this.fetch<AccountInfo>(url, {
      cache: 'no-store',
    });
  }

  async getPositions(traderId?: string): Promise<Position[]> {
    const url = traderId ? `/positions?trader_id=${traderId}` : '/positions';
    return this.fetch<Position[]>(url);
  }

  async getDecisions(traderId?: string, page: number = 1, limit: number = 20): Promise<PaginatedResponse<DecisionRecord>> {
    const url = traderId
      ? `/decisions?trader_id=${traderId}&page=${page}&limit=${limit}`
      : `/decisions?page=${page}&limit=${limit}`;
    return this.fetch<PaginatedResponse<DecisionRecord>>(url);
  }

  async getLatestDecisions(traderId?: string): Promise<DecisionRecord[]> {
    const url = traderId
      ? `/decisions/latest?trader_id=${traderId}`
      : '/decisions/latest';
    return this.fetch<DecisionRecord[]>(url);
  }

  async getStatistics(traderId?: string): Promise<Statistics> {
    const url = traderId ? `/statistics?trader_id=${traderId}` : '/statistics';
    return this.fetch<Statistics>(url);
  }

  async getEquityHistory(traderId?: string): Promise<EquityPoint[]> {
    const url = traderId
      ? `/equity-history?trader_id=${traderId}`
      : '/equity-history';
    return this.fetch<EquityPoint[]>(url);
  }

  async getPerformance(traderId?: string): Promise<PerformanceAnalysis> {
    const url = traderId ? `/performance?trader_id=${traderId}` : '/performance';
    return this.fetch<PerformanceAnalysis>(url);
  }

  async getClosedTrades(traderId: string, page: number = 1, limit: number = 20): Promise<ClosedPositionsResponse> {
    const url = `/trades?trader_id=${traderId}&page=${page}&limit=${limit}`;
    return this.fetch<ClosedPositionsResponse>(url);
  }
}

// Export singleton instance
export const api = new APIClient();
