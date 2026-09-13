import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as api from "../services/mockApi";
import type {
  PortfolioSummary,
  SignalItem,
  OpsHealth,
  MarketPrice,
  PortfolioHistoryPoint,
} from "../services/mockApi";

// Mock the equity chart to avoid running its internal data fetching logic in tests.
vi.mock("../components/charts/PortfolioEquityChart", () => ({
  PortfolioEquityChart: () => <div data-testid="equity-chart" />,
}));

// Import after mocks so the component uses the mocked dependencies.
import { DashboardPage } from "./Dashboard";

const mockPortfolio: PortfolioSummary = {
  totalEquity: 100000,
  pnl24hPct: 2.5,
  openRiskUsd: 2500,
  openRiskR: 1.5,
  activeStrategies: 3,
  strategiesNote: "3 active strategies running.",
};

const mockSignals: SignalItem[] = [
  {
    id: "sig-1",
    symbol: "BTCUSDT",
    direction: "long",
    timeframe: "H1",
    status: "open",
    plR: 0.5,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
];

const mockOpsHealth: OpsHealth = {
  executionEngine: "healthy",
  signalPipeline: "healthy",
  connectivityNote: "All exchanges reachable.",
};

const mockMarketPrice: MarketPrice = {
  symbol: "BTC",
  priceUsd: 12345,
  source: "coingecko",
};

const mockHistory: PortfolioHistoryPoint[] = [
  { timestamp: "2025-01-01T00:00:00.000Z", equity: 95000 },
  { timestamp: "2025-01-02T00:00:00.000Z", equity: 100000 },
];

beforeEach(() => {
  vi.spyOn(api, "fetchPortfolioSummary").mockResolvedValue(mockPortfolio);
  vi.spyOn(api, "fetchRecentSignals").mockResolvedValue(mockSignals);
  vi.spyOn(api, "fetchOpsHealth").mockResolvedValue(mockOpsHealth);
  vi.spyOn(api, "fetchMarketPrice").mockResolvedValue(mockMarketPrice);
  vi.spyOn(api, "fetchPortfolioHistory").mockResolvedValue(mockHistory);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DashboardPage", () => {
  it("renders portfolio overview heading", async () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: /portfolio overview/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(1);
      expect(api.fetchRecentSignals).toHaveBeenCalledTimes(1);
      expect(api.fetchOpsHealth).toHaveBeenCalledTimes(1);
    });
  });

  it("renders live BTC price when market data is available", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(api.fetchMarketPrice).toHaveBeenCalledTimes(1);
    });

    const priceElement = await screen.findByText(/\$12,?345/);
    expect(priceElement).toBeInTheDocument();

    expect(screen.getByText(/coingecko/i)).toBeInTheDocument();
  });
});
