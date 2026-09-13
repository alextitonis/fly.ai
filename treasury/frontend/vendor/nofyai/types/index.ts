// System Status
export interface SystemStatus {
  is_running: boolean;
  start_time: string;
  runtime_minutes: number;
  call_count: number;
  initial_balance: number;
  scan_interval: string;
  stop_until: string;
  last_reset_time: string;
  ai_provider: string;
}

// Account Information
export interface AccountInfo {
  total_equity: number;
  available_balance: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_unrealized_pnl: number;
  margin_used: number;
  margin_used_pct: number;
  position_count: number;
  initial_balance: number;
  daily_pnl: number;
}

// Position Information
export interface Position {
  symbol: string;
  side: string;
  entry_price: number;
  mark_price: number;
  quantity: number;
  leverage: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  liquidation_price: number;
  margin_used: number;
}

// AI Decision (from AI response)
export interface AIDecision {
  symbol: string;
  action: string;
  reasoning: string;
  // Optional AI-provided parameters
  position_size_usd?: number;
  leverage?: number;
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;
  risk_usd?: number;
}

// Execution Result
export interface ExecutionResult {
  symbol: string;
  action: string;
  success: boolean;
  error?: string;
}

// Decision Record
export interface DecisionRecord {
  timestamp: string;
  cycle_number: number;
  trader_id: string;
  success: boolean;

  // AI Decision
  cot_trace: string;
  decisions: AIDecision[];

  // Account State (snapshot before execution)
  account_snapshot: {
    total_equity: number;
    available_balance: number;
    total_pnl: number;
    total_pnl_pct: number;
    margin_used: number;
    margin_used_pct: number;
    position_count: number;
  };

  // Positions (snapshot before execution)
  positions_snapshot: Array<{
    symbol: string;
    side: string;
    entry_price: number;
    mark_price: number;
    quantity: number;
    leverage: number;
    unrealized_pnl: number;
    unrealized_pnl_pct: number;
  }>;

  // Execution Results
  execution_results: ExecutionResult[];

  // Optional fields
  input_prompt?: string;
  system_prompt?: string; // 系统提示词
  decision_json?: string;
  candidate_coins?: string[];
  execution_log?: string[];
  error_message?: string;
  performance?: {
    runtime_minutes: number;
    total_cycles: number;
  };
}

// Statistics
export interface Statistics {
  total_cycles: number;
  successful_cycles: number;
  failed_cycles: number;
  total_open_positions: number;
  total_close_positions: number;
}

// Trader Information
export interface TraderInfo {
  trader_id: string;
  trader_name: string;
  ai_model: string;
}

// Competition Data
export interface CompetitionData {
  count: number;
  traders: Array<{
    trader_id: string;
    trader_name: string;
    ai_model: string;
    total_equity: number;
    total_pnl: number;
    total_pnl_pct: number;
    position_count: number;
    margin_used_pct: number;
    call_count: number;
    is_running: boolean;
  }>;
}

// Equity History Point
export interface EquityPoint {
  timestamp: string;
  total_equity: number;
  available_balance: number;
  total_pnl: number;
  total_pnl_pct: number;
  position_count: number;
  margin_used_pct: number;
  cycle_number: number;
}

// Performance Analysis
export interface PerformanceAnalysis {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_profit: number;
  avg_loss: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown: number;
  avg_holding_time_minutes: number;
  sample_trades: Array<{
    symbol: string;
    side: string;
    open_time: string;
    close_time: string;
    pnl: number;
    pnl_pct: number;
    leverage: number;
  }>;
}

// Configuration Types

// Single Trader Configuration
export interface TraderConfig {
  id: string;
  name: string;
  enabled: boolean;
  ai_model: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  exchange: 'binance' | 'hyperliquid' | 'aster';

  // Exchange API Configurations
  binance_api_key?: string;
  binance_secret_key?: string;
  hyperliquid_private_key?: string;
  hyperliquid_wallet_addr?: string;
  hyperliquid_testnet?: boolean;
  aster_user?: string;
  aster_signer?: string;
  aster_private_key?: string;

  // AI API Configurations
  qwen_key?: string;
  deepseek_key?: string;
  kimi_api_key?: string;
  kimi_model_name?: string;
  custom_api_url?: string;
  custom_api_key?: string;
  custom_model_name?: string;

  // Trading Parameters
  initial_balance: number;
  scan_interval_minutes: number;

  // Prompt Template Configuration
  prompt_template?: string; // 提示词模板名称 (adaptive/default/nof1/taro)，默认 adaptive
}

// Leverage Configuration
export interface LeverageConfig {
  btc_eth_leverage: number;
  altcoin_leverage: number;
}

// Telegram Configuration
export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
  notify_on_trade: boolean;
  notify_on_error: boolean;
  notify_on_daily_summary: boolean;
  notify_on_performance_warning: boolean;
}

// Admin Configuration
export interface AdminConfig {
  password: string; // Plain text or bcrypt hash
  session_timeout_minutes: number; // Session timeout in minutes
}

// System Configuration
export interface SystemConfig {
  traders: TraderConfig[];
  leverage: LeverageConfig;
  telegram?: TelegramConfig;
  admin?: AdminConfig;
  use_default_coins: boolean;
  default_coins: string[];
  coin_pool_api_url: string;
  oi_top_api_url: string;
  api_server_port: number;
  max_daily_loss: number;
  max_drawdown: number;
  stop_trading_minutes: number;

  // Market Data Configuration
  binance_region?: 'global' | 'us'; // Binance API region (default: global)
}

// Masked Trader Config (for frontend display, hiding sensitive keys)
export interface MaskedTraderConfig extends Omit<TraderConfig,
  'binance_api_key' | 'binance_secret_key' | 'hyperliquid_private_key' |
  'aster_private_key' | 'qwen_key' | 'deepseek_key' | 'kimi_api_key' | 'custom_api_key'> {
  binance_api_key_masked?: string;
  binance_secret_key_masked?: string;
  hyperliquid_private_key_masked?: string;
  aster_private_key_masked?: string;
  qwen_key_masked?: string;
  deepseek_key_masked?: string;
  kimi_api_key_masked?: string;
  custom_api_key_masked?: string;
}

// Masked System Config (for frontend display)
export interface MaskedSystemConfig extends Omit<SystemConfig, 'traders'> {
  traders: MaskedTraderConfig[];
}

// Competition Summary Types

// Single trader summary for leaderboard
export interface TraderSummary {
  trader_id: string;
  trader_name: string;
  ai_model: string;
  exchange: string;
  total_equity: number;
  initial_balance: number;
  total_pnl: number;
  total_pnl_pct: number;
  unrealized_pnl: number;
  position_count: number;
  is_running: boolean;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  max_drawdown: number;
  ranking: number;
}

// Top performer info
export interface TopPerformer {
  trader_id: string;
  trader_name: string;
  ai_model: string;
  total_equity: number;
  total_pnl_pct: number;
}

// Competition summary response
export interface CompetitionSummary {
  total_traders: number;
  active_traders: number;
  total_equity: number;
  total_pnl: number;
  total_trades: number;
  highest_performer: TopPerformer | null;
  lowest_performer: TopPerformer | null;
  leaderboard: TraderSummary[];
  last_updated: string;
}

// Multi-trader equity history (for comparison chart)
export interface MultiTraderEquityHistory {
  traders: Array<{
    trader_id: string;
    trader_name: string;
    ai_model: string;
    color: string; // Chart line color
    data: EquityPoint[];
  }>;
}

// Market price ticker data
export interface MarketPrice {
  symbol: string;
  price: number;
  change_24h: number;
  change_24h_pct: number;
}

// Closed Position (stored in closed_positions.json for fast access)
export interface ClosedPosition {
  id: number; // Auto-increment ID
  trader_id: string;
  cycle_number: number;
  timestamp: string; // Close timestamp
  symbol: string;
  side: 'long' | 'short';
  action: 'close_long' | 'close_short';

  // Trade Details
  open_time: string;
  close_time: string;
  entry_price: number;
  exit_price: number; // Mark price at close
  quantity: number;
  leverage: number;

  // PnL
  pnl: number; // Realized PnL (USDT)
  pnl_pct: number; // PnL percentage (price change)
  holding_time_minutes: number;

  // Optional: AI reasoning for close
  reasoning?: string;
}

// Paginated response for closed positions
export interface ClosedPositionsResponse {
  data: ClosedPosition[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
