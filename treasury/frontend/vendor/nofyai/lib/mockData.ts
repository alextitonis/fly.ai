// Mock data for development and testing
// This simulates the data that would come from the real trading system

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
} from '@/types';

// Mock Traders
export const mockTraders: TraderInfo[] = [
  {
    trader_id: 'deepseek_trader',
    trader_name: 'DeepSeek Trader',
    ai_model: 'deepseek',
  },
  {
    trader_id: 'qwen_trader',
    trader_name: 'Qwen Trader',
    ai_model: 'qwen',
  },
];

// Mock Competition Data
export const mockCompetition: CompetitionData = {
  count: 2,
  traders: [
    {
      trader_id: 'deepseek_trader',
      trader_name: 'DeepSeek Trader',
      ai_model: 'deepseek',
      total_equity: 10250.50,
      total_pnl: 250.50,
      total_pnl_pct: 2.51,
      position_count: 2,
      margin_used_pct: 35.2,
      call_count: 156,
      is_running: true,
    },
    {
      trader_id: 'qwen_trader',
      trader_name: 'Qwen Trader',
      ai_model: 'qwen',
      total_equity: 9875.20,
      total_pnl: -124.80,
      total_pnl_pct: -1.25,
      position_count: 1,
      margin_used_pct: 22.5,
      call_count: 148,
      is_running: true,
    },
  ],
};

// Mock System Status
export const mockStatus: SystemStatus = {
  is_running: true,
  start_time: new Date(Date.now() - 3600000 * 24).toISOString(),
  runtime_minutes: 1440,
  call_count: 156,
  initial_balance: 10000,
  scan_interval: '3m',
  stop_until: '',
  last_reset_time: new Date(Date.now() - 3600000 * 24).toISOString(),
  ai_provider: 'deepseek',
};

// Mock Account Info
export const mockAccount: AccountInfo = {
  total_equity: 10250.50,
  available_balance: 6637.82,
  total_pnl: 250.50,
  total_pnl_pct: 2.51,
  total_unrealized_pnl: 85.30,
  margin_used: 3612.68,
  margin_used_pct: 35.2,
  position_count: 2,
  initial_balance: 10000,
  daily_pnl: 125.80,
};

// Mock Positions
export const mockPositions: Position[] = [
  {
    symbol: 'BTCUSDT',
    side: 'long',
    entry_price: 42150.50,
    mark_price: 42485.20,
    quantity: 0.05,
    leverage: 5,
    unrealized_pnl: 55.30,
    unrealized_pnl_pct: 1.58,
    liquidation_price: 33720.40,
    margin_used: 2124.26,
  },
  {
    symbol: 'ETHUSDT',
    side: 'short',
    entry_price: 2250.80,
    mark_price: 2238.50,
    quantity: 2.5,
    leverage: 3,
    unrealized_pnl: 30.00,
    unrealized_pnl_pct: 0.55,
    liquidation_price: 2700.96,
    margin_used: 1488.42,
  },
];

// Mock Decisions
export const mockDecisions: DecisionRecord[] = [
  {
    timestamp: new Date(Date.now() - 180000).toISOString(),
    cycle_number: 156,
    trader_id: 'mock-trader-1',
    success: true,
    input_prompt: 'Market analysis for cycle 156...',
    cot_trace: '分析当前市场状态：BTC在42000-42500区间震荡，成交量适中，RSI处于55水平，显示中性偏多信号。ETH相对弱势，建议保持观望或小仓位做空。',
    decision_json: JSON.stringify([
      { action: 'hold', symbol: 'BTCUSDT', confidence: 0.75 },
      { action: 'open_short', symbol: 'ETHUSDT', quantity: 2.5, leverage: 3, confidence: 0.82 },
    ]),
    account_snapshot: {
      total_equity: 10250.50,
      available_balance: 6637.82,
      total_pnl: 85.30,
      total_pnl_pct: 0.83,
      margin_used: 3612.68,
      margin_used_pct: 35.2,
      position_count: 2,
    },
    positions_snapshot: [
      {
        symbol: 'BTCUSDT',
        side: 'long',
        entry_price: 42150.50,
        mark_price: 42485.20,
        quantity: 0.05,
        leverage: 5,
        unrealized_pnl: 55.30,
        unrealized_pnl_pct: 2.61,
      },
    ],
    candidate_coins: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    decisions: [
      {
        action: 'open_short',
        symbol: 'ETHUSDT',
        reasoning: 'Technical indicators suggest a short opportunity at current levels with favorable risk/reward ratio',
      },
    ],
    execution_results: [
      {
        symbol: 'ETHUSDT',
        action: 'open_short',
        success: true,
      },
    ],
    execution_log: [
      '✓ 开空 ETHUSDT 成功，数量: 2.5, 杠杆: 3x',
      '✓ 设置止损价格: 2340.00',
      '✓ 设置止盈价格: 2180.00',
    ],
    error_message: '',
  },
];

// Mock Statistics
export const mockStatistics: Statistics = {
  total_cycles: 156,
  successful_cycles: 142,
  failed_cycles: 14,
  total_open_positions: 89,
  total_close_positions: 87,
};

// Mock Equity History (last 24 hours, every 30 minutes)
export const mockEquityHistory: EquityPoint[] = Array.from({ length: 48 }, (_, i) => ({
  timestamp: new Date(Date.now() - (47 - i) * 30 * 60000).toISOString(),
  total_equity: 10000 + Math.random() * 500 - 200 + i * 5,
  available_balance: 6000 + Math.random() * 1000,
  total_pnl: Math.random() * 500 - 200 + i * 5,
  total_pnl_pct: (Math.random() * 5 - 2 + i * 0.05),
  position_count: Math.floor(Math.random() * 3),
  margin_used_pct: Math.random() * 50 + 10,
  cycle_number: 100 + i,
}));

// Mock Performance Analysis
export const mockPerformance: PerformanceAnalysis = {
  total_trades: 87,
  winning_trades: 52,
  losing_trades: 35,
  win_rate: 0.5977,
  avg_profit: 125.50,
  avg_loss: -78.30,
  profit_factor: 1.85,
  sharpe_ratio: 0.65,
  max_drawdown: -8.5,
  avg_holding_time_minutes: 245,
  sample_trades: [
    {
      symbol: 'BTCUSDT',
      side: 'long',
      open_time: new Date(Date.now() - 7200000).toISOString(),
      close_time: new Date(Date.now() - 3600000).toISOString(),
      pnl: 150.25,
      pnl_pct: 3.2,
      leverage: 5,
    },
    {
      symbol: 'ETHUSDT',
      side: 'short',
      open_time: new Date(Date.now() - 10800000).toISOString(),
      close_time: new Date(Date.now() - 5400000).toISOString(),
      pnl: -65.50,
      pnl_pct: -1.8,
      leverage: 3,
    },
    {
      symbol: 'SOLUSDT',
      side: 'long',
      open_time: new Date(Date.now() - 14400000).toISOString(),
      close_time: new Date(Date.now() - 7200000).toISOString(),
      pnl: 220.80,
      pnl_pct: 5.5,
      leverage: 4,
    },
  ],
};

// Mock System Config
export const mockConfig: MaskedSystemConfig = {
  traders: [
    {
      id: 'deepseek_trader',
      name: 'DeepSeek Trader',
      enabled: true,
      ai_model: 'deepseek',
      exchange: 'binance',
      initial_balance: 10000,
      scan_interval_minutes: 3,
      binance_api_key_masked: 'AbCd****XyZ1',
      binance_secret_key_masked: '1234****5678',
      deepseek_key_masked: 'sk-1****8901',
    },
    {
      id: 'qwen_trader',
      name: 'Qwen Trader',
      enabled: true,
      ai_model: 'qwen',
      exchange: 'binance',
      initial_balance: 10000,
      scan_interval_minutes: 3,
      binance_api_key_masked: 'EfGh****WvUt',
      binance_secret_key_masked: 'abcd****efgh',
      qwen_key_masked: 'qw-2****3456',
    },
  ],
  leverage: {
    btc_eth_leverage: 5,
    altcoin_leverage: 5,
  },
  use_default_coins: true,
  default_coins: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'HYPEUSDT'],
  coin_pool_api_url: '',
  oi_top_api_url: '',
  api_server_port: 3000,
  max_daily_loss: 10.0,
  max_drawdown: 20.0,
  stop_trading_minutes: 60,
};

// Helper function to get trader-specific data
export function getTraderData(traderId: string) {
  const isDeepSeek = traderId === 'deepseek_trader';

  return {
    status: mockStatus,
    account: isDeepSeek ? mockAccount : {
      ...mockAccount,
      total_equity: 9875.20,
      total_pnl: -124.80,
      total_pnl_pct: -1.25,
    },
    positions: isDeepSeek ? mockPositions : mockPositions.slice(0, 1),
    decisions: mockDecisions,
    statistics: mockStatistics,
    equityHistory: mockEquityHistory,
    performance: mockPerformance,
  };
}
