// Provides in-memory mock data for portfolio, signals and trades.
// This module encapsulates exchange-like data access.

function getPortfolioSummary() {
  const baseEquity = 123450;
  const drift = Math.random() * 1000 - 500;
  const totalEquity = Math.round(baseEquity + drift);

  const pnl24hPct = Math.round((4.2 + (Math.random() * 0.8 - 0.4)) * 100) / 100;
  const openRiskUsd = Math.round(18300 + (Math.random() * 800 - 400));
  const openRiskR =
    Math.round((3.1 + (Math.random() * 0.4 - 0.2)) * 10) / 10;

  return {
    totalEquity,
    pnl24hPct,
    openRiskUsd,
    openRiskR,
    activeStrategies: 5,
    strategiesNote: "3 trend, 2 mean-reversion",
  };
}

function getSignals() {
  return [
    {
      id: "sig-1",
      symbol: "BTCUSDT",
      direction: "long",
      timeframe: "H1",
      status: "executed",
      plR: 0.8,
      createdAt: "2025-01-01T12:03:00Z",
    },
    {
      id: "sig-2",
      symbol: "ETHUSDT",
      direction: "short",
      timeframe: "M15",
      status: "open",
      plR: null,
      createdAt: "2025-01-01T11:40:00Z",
    },
    {
      id: "sig-3",
      symbol: "SOLUSDT",
      direction: "long",
      timeframe: "H4",
      status: "executed",
      plR: -0.4,
      createdAt: "2025-01-01T10:10:00Z",
    },
  ];
}

function getTrades() {
  return [
    {
      id: "trade-1",
      symbol: "BTCUSDT",
      side: "long",
      size: "0.25 BTC",
      rMultiple: 1.3,
      status: "closed",
      openedAt: "2025-01-01T09:30:00Z",
      closedAt: "2025-01-01T10:15:00Z",
    },
    {
      id: "trade-2",
      symbol: "SOLUSDT",
      side: "short",
      size: "1500 SOL",
      rMultiple: -0.7,
      status: "closed",
      openedAt: "2025-01-01T08:00:00Z",
      closedAt: "2025-01-01T09:00:00Z",
    },
  ];
}

function getPortfolioHistory() {
  const baseEquity = 120000;
  const points = [];
  const now = Date.now();
  let equity = baseEquity;

  for (let i = 13; i >= 0; i--) {
    const ts = new Date(now - i * 24 * 60 * 60 * 1000);
    const drift = Math.random() * 4000 - 2000;
    equity = Math.max(80000, equity + drift);

    points.push({
      timestamp: ts.toISOString(),
      equity: Math.round(equity),
    });
  }

  return points;
}

function getOpsHealth() {
  const connectivityStates = [
    "nominal",
    "degraded on exchange B (mock)",
    "elevated latency to exchange A (mock)",
  ];
  const connectivityNote =
    connectivityStates[Math.floor(Math.random() * connectivityStates.length)];

  return {
    executionEngine: "healthy",
    signalPipeline: "healthy",
    connectivityNote,
  };
}

module.exports = {
  getPortfolioSummary,
  getSignals,
  getTrades,
  getPortfolioHistory,
  getOpsHealth,
};
