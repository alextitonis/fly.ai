export const zhCN = {
  common: {
    loading: '加载中...',
    error: '错误',
    success: '成功',
    confirm: '确认',
    cancel: '取消',
    back: '返回',
    copy: '复制',
    close: '关闭',
    noData: '暂无数据',
  },

  nav: {
    competition: '竞赛排行',
    traders: '交易者',
    config: '系统配置',
    backToCompetition: '返回竞赛',
    analytics: '分析',
    documentation: '文档',
    api: 'API',
    github: 'GitHub',
    login: '登录',
    logout: '登出',
  },

  auth: {
    // Status
    admin: '管理员',
    guest: '访客',

    // Login Modal
    loginTitle: '管理员登录',
    passwordLabel: '密码',
    passwordPlaceholder: '请输入管理员密码',
    loginButton: '登录',
    loggingIn: '登录中...',
    loginToManage: '登录管理',

    // Messages
    loginSuccess: '登录成功',
    loginFailed: '登录失败',
    invalidPassword: '密码错误',
    loginRequired: '需要登录',
    unauthorized: '未授权',
    sessionExpired: '会话已过期',

    // Info
    loginInfo: '登录后可启动/停止交易和平仓',
    loginInfoShort: '登录后可管理交易操作',
  },

  trader: {
    // Account metrics
    totalEquity: '总权益',
    available: '可用余额',
    totalPnL: '总盈亏',
    positions: '持仓',
    marginUsed: '保证金占用',
    positionCount: '持仓数',
    leverage: '杠杆',

    // Tabs
    performance: '表现',
    decisions: '决策',
    trades: '交易',

    // Trade actions
    openLong: '买入做多',
    openShort: '卖出做空',
    closeLong: '平多仓',
    closeShort: '平空仓',
    buy: '买',
    sell: '卖',
    long: '做多',
    short: '做空',
    wait: '等待',
    hold: '持有',

    // Status
    liveTrading: '实盘交易',
    offline: '离线',
    startTrading: '开始交易',
    stopTrading: '停止交易',
    emergencyStop: '紧急停止',
    traderNotStarted: '交易者未启动',
    traderDetails: '交易者详情',

    // Messages
    confirmStop: '确认停止该交易者？',
    confirmStart: '确认开始交易？',
    confirmEmergencyStop: '⚠️ 紧急停止\n\n这将会：\n1. 停止交易引擎\n2. 平掉所有持仓\n\n确定吗？',
    traderStopped: '✅ 交易者已成功停止',
    traderStarted: '✅ 交易者已成功启动',
    emergencyStopComplete: '✅ 紧急停止完成。所有持仓已平掉。',
    confirmClosePosition: '确认平掉 {side} 仓位 {symbol}？',
    positionClosed: '✅ 仓位已平仓',
    promptCopied: '✅ 提示词已复制到剪贴板！',

    // Performance
    performanceNote: 'Performance 数据说明：以下指标仅统计已平仓交易，不包括当前未平仓持仓的盈亏。',
    winRate: '胜率',
    profitFactor: '盈利因子',
    sharpeRatio: '夏普比率',
    maxDrawdown: '最大回撤',
    avgProfit: '平均盈利',
    avgLoss: '平均亏损',
    totalTrades: '总交易',
    winningTrades: '盈利',
    losingTrades: '亏损',
    avgHoldingTime: '平均持仓时间',

    // Performance ratings
    excellent: '优异',
    good: '良好',
    positive: '正收益',
    slightLoss: '轻微亏损',
    needsImprovement: '需要改进',
    consistentLoss: '持续亏损',
    limitedSample: '样本较少',
    noData: '无数据',

    // Performance advice
    adviceNoData: '📊 开始交易以查看指标',
    adviceTooFewTrades: '📈 样本太少，继续积累数据',
    adviceFewTrades: '⏳ 样本偏少，建议至少10笔交易后评估',
    adviceExcellent: '🚀 表现优异，可适度扩大仓位',
    adviceGood: '✅ 表现良好，维持当前策略',
    advicePositive: '📊 正收益，保持谨慎',
    adviceSlightLoss: '⚠️ 轻微亏损，严格控制风险',
    adviceNeedsImprovement: '🔍 需要优化策略，降低仓位',
    adviceConsistentLoss: '🛑 表现不佳，建议暂停交易深度反思',

    // Profit Factor advice
    profitFactorAwaitingData: '📊 等待数据',
    profitFactorExcellent: '✅ 优秀盈亏比',
    profitFactorPositive: '📊 正盈亏比',
    profitFactorInsufficient: '⚠️ 盈利不足',

    // Max Drawdown advice
    maxDrawdownNoData: '📊 无回撤',
    maxDrawdownHighRisk: '⚠️ 高风险',
    maxDrawdownAcceptable: '📉 可接受',

    // Other labels
    tradesCount: '笔交易',
    perWin: '每次盈利',
    perLoss: '每次亏损',
    completed: '已完成',

    // Decisions
    cycleNumber: '周期',
    timestamp: '时间',
    success: '成功',
    failed: '失败',
    actions: '操作',
    noDecisionsYet: '暂无决策',
    decisionsWillAppear: 'AI 决策将在此处显示',
    showingLatest100Decisions: '仅显示最近100条决策记录以优化性能',
    showingDecisions: '显示',
    decisionsCount: '条决策',
    loadMore: '加载更多',
    loading: '加载中...',
    allDecisionsLoaded: '已加载全部决策',

    // Trades
    tradingHistory: '交易历史',
    noTradesYet: '暂无交易',
    tradesWillAppear: '交易操作将在此处显示',
    allTradesLoaded: '已加载全部交易',
    holdingTime: '持仓时长',
    opened: '开仓',
    closed: '平仓',
    aiReasoning: 'AI 决策理由',

    // Chart
    equityPerformance: '权益表现',
    noEquityHistory: '暂无权益历史',
    chartWillAppear: '图表将在交易进行时显示',
    initial: '初始',
    cycle: '周期',
    margin: '保证金',

    // Positions table
    symbol: '交易对',
    side: '方向',
    entryPrice: '入场价',
    currentPrice: '当前价',
    exitPrice: '平仓价',
    quantity: '数量',
    unrealizedPnL: '未实现盈亏',
    action: '操作',
    closePosition: '平仓',
    noActivePositions: '无活跃持仓',

    // Info
    aiProvider: 'AI',
    cycles: '周期',
    runtime: '运行时长',
    initialBalance: '初始资金',

    // Banner
    traderNotStartedTitle: '交易者未启动',
    traderNotStartedDesc: '启动 AI 交易者以开始自主交易',
    startTradingButton: '开始交易',

    // Labels
    ai: 'AI',
    cyclesLabel: '周期',
    runtimeLabel: '运行时长',
    free: '可用',
    lev: '杠杆',
    currentPositions: '当前持仓',
    loadingPerformance: '加载性能数据中...',
    close: '关闭',
    failedToStartTrader: '启动交易者失败',
    failedToStopTrader: '停止交易者失败',
    failedToEmergencyStop: '紧急停止失败',
    failedToClosePosition: '平仓失败',

    // Decision Detail Modal
    decisionDetail: 'AI 决策详情',
    errorMessage: '错误信息',
    accountSnapshot: '账户状态快照',
    accountEquity: '账户净值',
    availableBalance: '可用余额',
    positionSnapshot: '持仓快照',
    candidateCoins: '候选币种',
    coins: '个',
    inputPrompt: '输入 Prompt（发送给AI的市场数据）',
    cotAnalysis: 'AI分析',
    systemPrompt: '系统',
    userInput: '用户',
    decisionJson: '决策 JSON',
    executionLog: '执行日志',
    decisionActions: 'AI 决策动作',
    decisionReasoning: 'AI 决策理由：',
  },

  competition: {
    title: 'AI 交易竞赛',
    subtitle: '由 AI 驱动的实时算法交易竞赛',
    leaderboard: '排行榜',
    performanceComparison: '表现对比',
    roiOverTime: '收益率随时间变化',
    rankedByROI: '按回报率排名',
    currentLeader: '当前领先',
    rank: '排名',
    traderName: '交易者',
    trader: '交易者',
    traders: '交易者',
    aiModel: 'AI 模型',
    model: '模型',
    pnl: '盈亏',
    profitAndLoss: '盈亏',
    roi: '回报率',
    equity: '权益',
    totalEquity: '总权益',
    totalTrades: '总交易数',
    sharpeRatio: '夏普',
    status: '状态',
    viewDetails: '查看详情',
    running: '运行中',
    live: '运行中',
    stopped: '已停止',
    cycles: '周期',
    positions: '持仓',
    marginUsed: '保证金占用',
    failedToLoad: '加载竞赛数据失败',
    config: '配置',
    noTradersActive: '暂无活跃交易者',
    startBackend: '启动后端以查看实时交易数据',
  },

  config: {
    title: '系统配置',
    pageTitle: '系统配置',
    pageDescription: '查看当前系统配置和交易者设置',
    traders: '交易者',
    leverage: '杠杆设置',
    riskManagement: '风险管理',
    telegramNotifications: 'Telegram 通知',
    enabled: '已启用',
    disabled: '已禁用',
    testNotification: '发送测试通知',
    btcEthLeverage: 'BTC/ETH 杠杆',
    altcoinLeverage: '山寨币杠杆',
    maxDailyLoss: '最大日损失',
    maxDrawdown: '最大回撤',
    stopTradingMinutes: '停止交易时长(分钟)',

    // Config errors
    failedToLoadConfig: '加载配置失败',

    // System Configuration
    systemConfiguration: '系统配置',
    stopTradingDuration: '停止交易时长',
    apiServerPort: 'API 服务器端口',

    // Telegram
    notificationStatus: '通知状态',
    telegramActive: 'Telegram 通知已启用',
    telegramDisabled: 'Telegram 通知已禁用',
    botToken: 'Bot Token',
    chatId: 'Chat ID',
    notificationTypes: '通知类型',
    tradeNotifications: '交易通知',
    errorNotifications: '错误通知',
    dailySummary: '每日总结',
    performanceWarnings: '表现警告',
    on: '开启',
    off: '关闭',
    testYourConfiguration: '测试您的配置',
    sendTestMessage: '发送测试消息以验证 Telegram bot 是否正常工作',
    sending: '发送中...',
    sendTestNotification: '发送测试通知',
    testSuccess: '成功！',
    testFailed: '失败',
    telegramNotificationsDisabled: 'Telegram 通知已禁用',
    enableTelegramInConfig: '在 config.json 中启用 Telegram 通知以接收实时交易提醒',
    telegramNotConfigured: 'Telegram 未配置',
    addTelegramToConfig: '在 config.json 中添加 Telegram 配置以启用通知',

    // Coin Pool
    coinPoolConfiguration: '币池配置',
    useDefaultCoins: '使用默认币种',
    useDefaultCoinsDesc: '使用预定义的币种列表而不是动态币池',
    defaultCoinList: '默认币种列表',
    coins: '币种',
    ai500CoinPoolApi: 'AI500 币池 API',
    oiTopApi: 'OI Top API',

    // Trader Config
    traderConfigurations: '交易者配置',
    initialBalance: '初始资金',
    scanInterval: '扫描间隔',
    binanceApiKey: 'Binance API Key',
    hyperliquidWallet: 'Hyperliquid 钱包',
    testnet: '测试网',
    yes: '是',
    no: '否',
    asterUser: 'Aster 用户（主钱包）',
    asterSigner: 'Aster 签名者（API 钱包）',
    customApiUrl: '自定义 API URL',
    modelName: '模型名称',
    apiKeysMasked: 'API 密钥已脱敏（仅显示前后4个字符）',
  },

  footer: {
    description: 'AI 驱动的算法交易操作系统',
    riskWarning: '⚠️ AI 自动交易存在风险，请使用少量资金进行测试。',
  },
};

export type Locale = typeof zhCN;
