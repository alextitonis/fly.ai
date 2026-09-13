import { useEffect, useState } from "react";
import {
  fetchPortfolioSummary,
  fetchRecentSignals,
  fetchOpsHealth,
  fetchMarketPrice,
  type PortfolioSummary,
  type SignalItem,
  type OpsHealth,
  type MarketPrice,
} from "../services/mockApi";
import { PortfolioEquityChart } from "../components/charts/PortfolioEquityChart";

export function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [opsHealth, setOpsHealth] = useState<OpsHealth | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Holds live market price data and its loading/error state.
  const [marketPrice, setMarketPrice] = useState<MarketPrice | null>(null);
  const [isMarketLoading, setIsMarketLoading] = useState<boolean>(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Loads dashboard data (portfolio, signals, ops health) with periodic refresh.
  useEffect(() => {
    let cancelled = false;

    async function load(initial: boolean) {
      if (initial) setIsLoading(true);

      try {
        const [p, s, o] = await Promise.all([
          fetchPortfolioSummary(),
          fetchRecentSignals(),
          fetchOpsHealth(),
        ]);

        if (!cancelled) {
          setPortfolio(p);
          setSignals(s);
          setOpsHealth(o);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load data from backend API.");
          setPortfolio(null);
          setSignals([]);
          setOpsHealth(null);
        }
      } finally {
        if (initial && !cancelled) setIsLoading(false);
      }
    }

    void load(true);

    const id = setInterval(() => {
      void load(false);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Loads live BTC/USD price with periodic refresh and resilient error handling.
  useEffect(() => {
    let cancelled = false;

    async function loadPrice(initial: boolean) {
      if (initial) setIsMarketLoading(true);

      try {
        const data = await fetchMarketPrice();

        if (!cancelled) {
          setMarketPrice(data);
          setMarketError(null); // Clear previous errors once data is recovered.
        }
      } catch (err) {
        if (!cancelled) {
          // Keep previous price if it exists to avoid showing null during transient failures.
          setMarketError("Failed to load market price.");
        }
      } finally {
        if (initial && !cancelled) setIsMarketLoading(false);
      }
    }

    void loadPrice(true);

    const id = setInterval(() => {
      void loadPrice(false);
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Portfolio Overview
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            High-level view of current portfolio state and system performance.
          </p>
        </div>

        <div className="text-right text-xs text-slate-500 space-y-0.5">
          {isLoading && <div>Updating…</div>}
          {!isLoading && error && (
            <div className="text-rose-400">Backend unreachable</div>
          )}
        </div>
      </section>

      {/* Portfolio metrics and live BTC price */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-xs uppercase text-slate-500">Total Equity</div>
          <div className="mt-2 text-2xl font-semibold">
            {portfolio ? `$${portfolio.totalEquity.toLocaleString()}` : "—"}
          </div>
          <div className="mt-1 text-xs">
            {portfolio ? (
              <span
                className={
                  portfolio.pnl24hPct >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                {portfolio.pnl24hPct >= 0 ? "+" : ""}
                {portfolio.pnl24hPct.toFixed(2)}% last 24h
              </span>
            ) : error ? (
              <span className="text-rose-400">No data available</span>
            ) : (
              <span className="text-slate-500">waiting for data…</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-xs uppercase text-slate-500">Open Risk</div>
          <div className="mt-2 text-2xl font-semibold">
            {portfolio ? `$${portfolio.openRiskUsd.toLocaleString()}` : "—"}
          </div>
          <div className="mt-1 text-xs text-amber-400">
            {portfolio ? `${portfolio.openRiskR.toFixed(1)}R at risk` : "—"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-xs uppercase text-slate-500">
            Active Strategies
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {portfolio ? portfolio.activeStrategies : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {portfolio
              ? portfolio.strategiesNote
              : error
              ? "No strategy data available"
              : "loading…"}
          </div>
        </div>

        {/* Live BTC price */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-slate-500">
              Live BTC price
            </div>
            <div className="text-[10px] text-slate-500">
              {marketPrice?.source ?? "market feed"}
            </div>
          </div>

          <div className="mt-2 text-xl font-semibold">
            {isMarketLoading && <span className="text-slate-500">Loading…</span>}

            {!isMarketLoading && marketError && (
              <span className="text-rose-400">
                {marketPrice
                  ? `$${marketPrice.priceUsd.toLocaleString()}`
                  : "Error"}
              </span>
            )}

            {!isMarketLoading && !marketError && marketPrice && (
              <span>${marketPrice.priceUsd.toLocaleString()}</span>
            )}

            {!isMarketLoading && !marketError && !marketPrice && (
              <span className="text-slate-500">No data</span>
            )}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            {marketError
              ? "Using last known value. Live price temporarily unavailable."
              : "Price updated periodically from external market data provider."}
          </div>
        </div>
      </section>

      {/* Equity chart */}
      <section>
        <PortfolioEquityChart />
      </section>

      {/* Signals and operational health */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Signals */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent Signals</h2>
            <span className="text-[11px] text-slate-500">
              trading signal feed
            </span>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            {isLoading && !error && (
              <div className="text-slate-500">Loading signals…</div>
            )}

            {error && (
              <div className="text-rose-400">Failed to load trading signals.</div>
            )}

            {!isLoading && !error && signals.length === 0 && (
              <div className="text-slate-500">No signals loaded.</div>
            )}

            {!error &&
              signals.map((sig) => (
                <div
                  key={sig.id}
                  className="flex items-center justify-between"
                >
                  <span className="text-slate-300">
                    {sig.symbol} · {sig.direction} ({sig.timeframe})
                  </span>
                  <span className="text-right">
                    {sig.plR != null && (
                      <span
                        className={
                          sig.plR >= 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {sig.plR >= 0 ? "+" : ""}
                        {sig.plR.toFixed(1)}R
                      </span>
                    )}
                    <span className="block text-slate-500 text-[11px]">
                      {sig.status}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Operational health */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Ops Health</h2>
            <span className="text-[11px] text-slate-500">
              bots and infrastructure
            </span>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            {isLoading && !error && (
              <div className="text-slate-500">Loading ops health…</div>
            )}

            {error && (
              <div className="text-rose-400">
                Failed to load operational health.
              </div>
            )}

            {!error && opsHealth && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Execution engine</span>
                  <span className="text-emerald-400">
                    {opsHealth.executionEngine}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Signal pipeline</span>
                  <span className="text-emerald-400">
                    {opsHealth.signalPipeline}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Exchange connectivity</span>
                  <span className="text-amber-400">
                    {opsHealth.connectivityNote}
                  </span>
                </div>
              </>
            )}

            {!isLoading && !error && !opsHealth && (
              <div className="text-slate-500">No ops data.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
