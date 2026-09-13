import type { Locale } from './zh-CN';

export const enUS: Locale = {
  common: {
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    cancel: 'Cancel',
    back: 'Back',
    copy: 'Copy',
    close: 'Close',
    noData: 'No Data',
  },

  nav: {
    competition: 'Competition',
    traders: 'Traders',
    config: 'Configuration',
    backToCompetition: 'Back to Competition',
    analytics: 'Analytics',
    documentation: 'Documentation',
    api: 'API',
    github: 'GitHub',
    login: 'Login',
    logout: 'Logout',
  },

  auth: {
    // Status
    admin: 'Admin',
    guest: 'Guest',

    // Login Modal
    loginTitle: 'Admin Login',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter admin password',
    loginButton: 'Login',
    loggingIn: 'Logging in...',
    loginToManage: 'Login to Manage',

    // Messages
    loginSuccess: 'Login successful',
    loginFailed: 'Login failed',
    invalidPassword: 'Invalid password',
    loginRequired: 'Login required',
    unauthorized: 'Unauthorized',
    sessionExpired: 'Session expired',

    // Info
    loginInfo: 'Logging in will grant access to start/stop trading and close positions.',
    loginInfoShort: 'Login to manage trading operations',
  },

  trader: {
    // Account metrics
    totalEquity: 'Total Equity',
    available: 'Available',
    totalPnL: 'Total P&L',
    positions: 'Positions',
    marginUsed: 'Margin Used',
    positionCount: 'Positions',
    leverage: 'Leverage',

    // Tabs
    performance: 'Performance',
    decisions: 'Decisions',
    trades: 'Trades',

    // Trade actions
    openLong: 'Open Long',
    openShort: 'Open Short',
    closeLong: 'Close Long',
    closeShort: 'Close Short',
    buy: 'Buy',
    sell: 'Sell',
    long: 'Long',
    short: 'Short',
    wait: 'Wait',
    hold: 'Hold',

    // Status
    liveTrading: 'Live Trading',
    offline: 'Offline',
    startTrading: 'Start Trading',
    stopTrading: 'Stop Trading',
    emergencyStop: 'Emergency Stop',
    traderNotStarted: 'Trader Not Started',
    traderDetails: 'Trader Details',

    // Messages
    confirmStop: 'Stop this trader?',
    confirmStart: 'Start trading?',
    confirmEmergencyStop: '⚠️ EMERGENCY STOP\n\nThis will:\n1. Stop the trading engine\n2. Close ALL open positions\n\nAre you sure?',
    traderStopped: '✅ Trader stopped successfully.',
    traderStarted: '✅ Trader started successfully.',
    emergencyStopComplete: '✅ Emergency stop completed. All positions closed.',
    confirmClosePosition: 'Close {side} position for {symbol}?',
    positionClosed: '✅ Position closed',
    promptCopied: '✅ Prompt copied to clipboard!',

    // Performance
    performanceNote: 'Performance metrics only include closed trades, excluding unrealized P&L from open positions.',
    winRate: 'Win Rate',
    profitFactor: 'Profit Factor',
    sharpeRatio: 'Sharpe Ratio',
    maxDrawdown: 'Max Drawdown',
    avgProfit: 'Avg Profit',
    avgLoss: 'Avg Loss',
    totalTrades: 'Total Trades',
    winningTrades: 'Wins',
    losingTrades: 'Losses',
    avgHoldingTime: 'Avg Holding Time',

    // Performance ratings
    excellent: 'Excellent',
    good: 'Good',
    positive: 'Positive',
    slightLoss: 'Slight Loss',
    needsImprovement: 'Needs Improvement',
    consistentLoss: 'Consistent Loss',
    limitedSample: 'Limited Sample',
    noData: 'No Data',

    // Performance advice
    adviceNoData: '📊 Start trading to see metrics',
    adviceTooFewTrades: '📈 Too few trades, keep accumulating data',
    adviceFewTrades: '⏳ Limited sample, recommend at least 10 trades',
    adviceExcellent: '🚀 Excellent performance, consider increasing position size',
    adviceGood: '✅ Good performance, maintain current strategy',
    advicePositive: '📊 Positive returns, stay cautious',
    adviceSlightLoss: '⚠️ Slight losses, strictly control risk',
    adviceNeedsImprovement: '🔍 Strategy needs optimization, reduce position size',
    adviceConsistentLoss: '🛑 Poor performance, consider pausing to reflect',

    // Profit Factor advice
    profitFactorAwaitingData: '📊 Awaiting data',
    profitFactorExcellent: '✅ Excellent profit ratio',
    profitFactorPositive: '📊 Positive profit ratio',
    profitFactorInsufficient: '⚠️ Insufficient profits',

    // Max Drawdown advice
    maxDrawdownNoData: '📊 No drawdown',
    maxDrawdownHighRisk: '⚠️ High risk',
    maxDrawdownAcceptable: '📉 Acceptable',

    // Other labels
    tradesCount: 'trades',
    perWin: 'Per win',
    perLoss: 'Per loss',
    completed: 'Completed',

    // Decisions
    cycleNumber: 'Cycle',
    timestamp: 'Time',
    success: 'Success',
    failed: 'Failed',
    actions: 'Actions',
    noDecisionsYet: 'No Decisions Yet',
    decisionsWillAppear: 'AI decisions will appear here',
    showingLatest100Decisions: 'Showing latest 100 decisions only for performance optimization',
    showingDecisions: 'Showing',
    decisionsCount: 'decisions',
    loadMore: 'Load More',
    loading: 'Loading...',
    allDecisionsLoaded: 'All decisions loaded',

    // Trades
    tradingHistory: 'Trading History',
    noTradesYet: 'No Trades Yet',
    tradesWillAppear: 'Trading actions will appear here',
    allTradesLoaded: 'All trades loaded',
    holdingTime: 'Holding Time',
    opened: 'Opened',
    closed: 'Closed',
    aiReasoning: 'AI Reasoning',

    // Chart
    equityPerformance: 'Equity Performance',
    noEquityHistory: 'No Equity History',
    chartWillAppear: 'Chart will appear as trading progresses',
    initial: 'Initial',
    cycle: 'Cycle',
    margin: 'Margin',

    // Positions table
    symbol: 'Symbol',
    side: 'Side',
    entryPrice: 'Entry',
    currentPrice: 'Current',
    exitPrice: 'Exit',
    quantity: 'Qty',
    unrealizedPnL: 'Unrealized P&L',
    action: 'Action',
    closePosition: 'Close',
    noActivePositions: 'No active positions',

    // Info
    aiProvider: 'AI',
    cycles: 'Cycles',
    runtime: 'Runtime',
    initialBalance: 'Initial Balance',

    // Banner
    traderNotStartedTitle: 'Trader Not Started',
    traderNotStartedDesc: 'Start the AI trader to begin autonomous trading',
    startTradingButton: 'Start Trading',

    // Labels
    ai: 'AI',
    cyclesLabel: 'Cycles',
    runtimeLabel: 'Runtime',
    free: 'free',
    lev: 'Lev',
    currentPositions: 'Current Positions',
    loadingPerformance: 'Loading performance data...',
    close: 'Close',
    failedToStartTrader: 'Failed to start trader',
    failedToStopTrader: 'Failed to stop trader',
    failedToEmergencyStop: 'Failed to emergency stop',
    failedToClosePosition: 'Failed to close position',

    // Decision Detail Modal
    decisionDetail: 'AI Decision Details',
    errorMessage: 'Error Message',
    accountSnapshot: 'Account Snapshot',
    accountEquity: 'Account Equity',
    availableBalance: 'Available Balance',
    positionSnapshot: 'Position Snapshot',
    candidateCoins: 'Candidate Coins',
    coins: 'coins',
    inputPrompt: 'Input Prompt (Market Data Sent to AI)',
    cotAnalysis: 'AI Analysis',
    systemPrompt: 'System',
    userInput: 'User',
    decisionJson: 'Decision JSON',
    executionLog: 'Execution Log',
    decisionActions: 'AI Decision Actions',
    decisionReasoning: 'AI Reasoning:',
  },

  competition: {
    title: 'AI Trading Competition',
    subtitle: 'Live algorithmic trading competition powered by AI',
    leaderboard: 'Leaderboard',
    performanceComparison: 'Performance Comparison',
    roiOverTime: 'ROI % over time',
    rankedByROI: 'Ranked by ROI',
    currentLeader: 'Current Leader',
    rank: 'Rank',
    traderName: 'Trader',
    trader: 'Trader',
    traders: 'Traders',
    aiModel: 'AI Model',
    model: 'Model',
    pnl: 'P&L',
    profitAndLoss: 'Profit & Loss',
    roi: 'ROI',
    equity: 'Equity',
    totalEquity: 'Total Equity',
    totalTrades: 'Total Trades',
    sharpeRatio: 'Sharpe',
    status: 'Status',
    viewDetails: 'View Details',
    running: 'Running',
    live: 'Live',
    stopped: 'Stopped',
    cycles: 'cycles',
    positions: 'positions',
    marginUsed: 'Margin Used',
    failedToLoad: 'Failed to load competition data',
    config: 'Config',
    noTradersActive: 'No Traders Active',
    startBackend: 'Start the backend to see live trading data',
  },

  config: {
    title: 'System Configuration',
    pageTitle: 'System Configuration',
    pageDescription: 'View current system configuration and trader settings',
    traders: 'Traders',
    leverage: 'Leverage Settings',
    riskManagement: 'Risk Management',
    telegramNotifications: 'Telegram Notifications',
    enabled: 'Enabled',
    disabled: 'Disabled',
    testNotification: 'Send Test Notification',
    btcEthLeverage: 'BTC/ETH Leverage',
    altcoinLeverage: 'Altcoin Leverage',
    maxDailyLoss: 'Max Daily Loss',
    maxDrawdown: 'Max Drawdown',
    stopTradingMinutes: 'Stop Trading Minutes',

    // Config errors
    failedToLoadConfig: 'Failed to load configuration',

    // System Configuration
    systemConfiguration: 'System Configuration',
    stopTradingDuration: 'Stop Trading Duration',
    apiServerPort: 'API Server Port',

    // Telegram
    notificationStatus: 'Notification Status',
    telegramActive: 'Telegram notifications are active',
    telegramDisabled: 'Telegram notifications are disabled',
    botToken: 'Bot Token',
    chatId: 'Chat ID',
    notificationTypes: 'Notification Types',
    tradeNotifications: 'Trade Notifications',
    errorNotifications: 'Error Notifications',
    dailySummary: 'Daily Summary',
    performanceWarnings: 'Performance Warnings',
    on: 'ON',
    off: 'OFF',
    testYourConfiguration: 'Test Your Configuration',
    sendTestMessage: 'Send a test notification to verify your Telegram bot is working',
    sending: 'Sending...',
    sendTestNotification: 'Send Test Notification',
    testSuccess: 'Success!',
    testFailed: 'Failed',
    telegramNotificationsDisabled: 'Telegram Notifications Disabled',
    enableTelegramInConfig: 'Enable Telegram notifications in config.json to receive real-time trading alerts',
    telegramNotConfigured: 'Telegram Not Configured',
    addTelegramToConfig: 'Add Telegram configuration to config.json to enable notifications',

    // Coin Pool
    coinPoolConfiguration: 'Coin Pool Configuration',
    useDefaultCoins: 'Use Default Coins',
    useDefaultCoinsDesc: 'Use predefined coin list instead of dynamic pool',
    defaultCoinList: 'Default Coin List',
    coins: 'coins',
    ai500CoinPoolApi: 'AI500 Coin Pool API',
    oiTopApi: 'OI Top API',

    // Trader Config
    traderConfigurations: 'Trader Configurations',
    initialBalance: 'Initial Balance',
    scanInterval: 'Scan Interval',
    binanceApiKey: 'Binance API Key',
    hyperliquidWallet: 'Hyperliquid Wallet',
    testnet: 'Testnet',
    yes: 'Yes',
    no: 'No',
    asterUser: 'Aster User (Main Wallet)',
    asterSigner: 'Aster Signer (API Wallet)',
    customApiUrl: 'Custom API URL',
    modelName: 'Model Name',
    apiKeysMasked: 'API keys are masked for security (showing first/last 4 characters only)',
  },

  footer: {
    description: 'AI-Powered Algorithmic Trading Operating System',
    riskWarning: '⚠️ AI automated trading carries risk. Use small amounts for testing.',
  },
};
