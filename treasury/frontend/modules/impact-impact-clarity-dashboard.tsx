import { useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, Cell, Tooltip, XAxis, YAxis,
  LineChart, Line, Legend,
} from "recharts";
import { useImpactData, type LiveTokenData } from "./impact-lib-use-impact-data";
import { computeProjectsLeaderboard, TOKENS, type TokenMeta } from "./impact-lib-project-registry";
import { cn, formatNumber } from "./impact-lib-icm-utils";
import {
  EBF_PILLARS, EBF_PILLAR_LABELS, EBF_PILLAR_COLORS,
  EBF_METHODOLOGY, SENTINEL_METHODOLOGY, SENTINEL_FORMULA,
  IRIS_METHODOLOGY, IRIS_FORMULA, COMBINED_FORMULA, DEBT_CEILING_FORMULA,
  scoreToRating, ratingColor,
  type ImpactProject, type LeaderboardProject, type EBFPillar,
} from "./impact-icm-types";

const RATING_SCALE = [
  { rating: "AAA", min: 90, color: "#22c55e" },
  { rating: "AA", min: 80, color: "#4ade80" },
  { rating: "A", min: 70, color: "#86efac" },
  { rating: "BBB", min: 60, color: "#fde047" },
  { rating: "BB", min: 50, color: "#fbbf24" },
  { rating: "B", min: 40, color: "#f97316" },
  { rating: "CCC", min: 0, color: "#ef4444" },
];

function EBFRadarCard({ projects }: { projects: ImpactProject[] }) {
  const [hovered, setHovered] = useState<{ label: string; values: { symbol: string; value: number; color: string }[] } | null>(null);

  const data = EBF_PILLARS.map((pillar) => ({
    pillar: EBF_PILLAR_LABELS[pillar],
    ...Object.fromEntries(projects.map((p) => [p.tokenSymbol, p.ebfScores ? Math.round(p.ebfScores[pillar] * 10000) / 100 : 0])),
  }));

  const setHoveredFromPillar = (pillarLabel: string) => {
    const payload = data.find((d) => d.pillar === pillarLabel) as Record<string, number> | undefined;
    if (!payload) return;
    const values = projects
      .map((p, i) => {
        const value = payload[p.tokenSymbol] as number;
        if (typeof value !== "number") return null;
        return { symbol: p.tokenSymbol, value, color: `hsl(${i * 60}, 70%, 60%)` };
      })
      .filter((v): v is { symbol: string; value: number; color: string } => v !== null)
      .sort((a, b) => b.value - a.value);
    setHovered({ label: pillarLabel, values });
  };

  const handlePillarHover = (state: any) => {
    if (state?.activeLabel) setHoveredFromPillar(state.activeLabel);
  };

  const handleRadarClick = (d: any) => {
    const payload = d?.payload || d;
    if (payload?.pillar) setHoveredFromPillar(payload.pillar);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 items-start">
      <div className="w-full md:w-28 shrink-0 pt-4">
        <div className="rounded-xl border border-a10-b bg-surface-a5 p-3 space-y-1.5">
          {hovered ? (
            hovered.values.map((v) => (
              <div key={v.symbol} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: v.color }} />
                  <span className="font-mono">{v.symbol}</span>
                </span>
                <span className="font-mono">{v.value.toFixed(2)}</span>
              </div>
            ))
          ) : (
            projects.map((p, i) => (
              <div key={p.tokenSymbol} className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: `hsl(${i * 60}, 70%, 60%)` }} />
                <span className="font-mono">{p.tokenSymbol}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="h-64 md:h-[420px] w-full md:flex-1 md:min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            outerRadius="90%"
            cx="50%"
            onMouseMove={handlePillarHover}
            onMouseLeave={() => setHovered(null)}
          >
            <PolarGrid stroke="var(--border-a10)" />
            <PolarAngleAxis dataKey="pillar" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--text-tertiary)", fontSize: 9 }} tickFormatter={(v: number) => v.toFixed(0)} />
            {projects.map((p) => (
              <Radar
                key={p.tokenSymbol}
                dataKey={p.tokenSymbol}
                stroke={`hsl(${projects.indexOf(p) * 60}, 70%, 60%)`}
                fill={`hsl(${projects.indexOf(p) * 60}, 70%, 60%)`}
                fillOpacity={0.1}
                onClick={handleRadarClick}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="hidden md:block w-36 shrink-0 pt-4">
        {hovered ? (
          <div className="rounded-xl border border-a10-b bg-surface-a5 p-3">
            <p className="text-xs font-medium text-secondary-t mb-2">{hovered.label}</p>
            <div className="space-y-1.5">
              {hovered.values
                .sort((a, b) => b.value - a.value)
                .map((v) => (
                  <div key={v.symbol} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: v.color }} />
                      <span className="font-mono">{v.symbol}</span>
                    </span>
                    <span className="font-mono">{v.value.toFixed(2)}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-a10-b bg-surface-a5 p-3 text-xs text-secondary-t italic">
            Hover or tap a pillar to see scores
          </div>
        )}
      </div>
    </div>
  );
}

function RatingScale() {
  return (
    <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5">
      <h3 className="text-sm font-medium mb-3 text-primary-t">Rating Scale</h3>
      <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
        {RATING_SCALE.map((r) => (
          <div key={r.rating} className="rounded-lg border border-a10-b bg-surface-a5 p-2 text-center">
            <p className="text-base font-bold" style={{ color: r.color }}>{r.rating}</p>
            <p className="text-xs text-secondary-t">{r.min}+</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { projects, tokenData, aggregate, isLoading, isFetching, lastUpdated } = useImpactData();
  const projectsLb = computeProjectsLeaderboard();

  const [activeTab, setActiveTab] = useState<"overview" | "risk" | "impact" | "methodology">("overview");

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-a10-b bg-gradient-to-br from-surface-bg-l2 to-surface-bg-l1 p-8 ">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-green mb-2">Impact Clarity Map</h1>
          <p className="text-secondary-t max-w-2xl">
            Transparent, real-time view of climate impact tokens. Risk scores computed live from
            DexScreener, CoinGecko, and DeFiLlama data using DeFi Sentinel + IMP/IRIS+ frameworks.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-green/20 bg-green/5 px-3 py-1.5 text-xs text-green">
            <span className={cn("size-1.5 rounded-full bg-green", isFetching && "animate-pulse")} />
            {isLoading
              ? "Fetching from DexScreener, CoinGecko, DeFiLlama..."
              : isFetching
                ? "Refreshing live data..."
                : `Live data · Updated ${lastUpdated ? formatRelative(lastUpdated) : "just now"}`}
          </div>
        </div>
      </div>

      {/* Live Counters — from real API data */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CounterCard label="Total Liquidity" value={aggregate.totalLiquidity} unit="$" color="#10b981" sub="across all tokens" loading={isLoading} source="DexScreener" />
        <CounterCard label="Total Market Cap" value={aggregate.totalMarketCap} unit="$" color="#22c55e" sub="CoinGecko aggregate" loading={isLoading} source="CoinGecko" />
        <CounterCard label="24h Volume" value={aggregate.totalVolume24h} unit="$" color="#06b6d4" sub="DexScreener aggregate" loading={isLoading} source="DexScreener" />
        <CounterCard label="Avg Combined Score" value={Math.round(aggregate.avgCombinedScore)} unit="" color="#ec4899" sub={`${aggregate.projectCount} projects · EBF avg: ${formatNumber(aggregate.avgEBF * 100)}`} loading={isLoading} source="Computed" />
      </div>

      {/* Rating Scale — visible on every tab */}
      <RatingScale />

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-a10-b">
        {(["overview", "risk", "impact", "methodology"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "text-green border-green"
                : "text-secondary-t border-transparent hover:text-primary-t",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab projects={projects} tokenData={tokenData} loading={isLoading} />
      )}
      {activeTab === "risk" && (
        <RiskTab projects={projects} tokenData={tokenData} loading={isLoading} />
      )}
      {activeTab === "impact" && (
        <ImpactTab projects={projects} projectsLb={projectsLb} loading={isLoading} />
      )}
      {activeTab === "methodology" && <MethodologyTab />}
    </div>
  );
}

// ─── Data Source Badge ───────────────────────────────────────────────────────

function SourceBadge({ sources }: { sources: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-surface-a5 text-secondary-t border border-a10-b"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

const SOURCES = {
  dexscreener: "DexScreener",
  coingecko: "CoinGecko",
  defillama: "DeFiLlama",
  geckoterminal: "GeckoTerminal",
  ebf: "EBF Assessment",
  iris: "IMP/IRIS+",
  sentinel: "DeFi Sentinel",
  gfw: "Global Forest Watch",
  onchain: "On-chain",
  computed: "Computed",
};

// ─── Counter Card ────────────────────────────────────────────────────────────

function CounterCard({ label, value, unit, color, sub, loading, source }: {
  label: string; value: number; unit: string; color: string; sub: string; loading: boolean; source: string;
}) {
  return (
    <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-secondary-t uppercase tracking-wide">{label}</p>
        <SourceBadge sources={[source]} />
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-surface-a5 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold" style={{ color }}>
          {unit === "$" ? "$" : ""}{formatNumber(value)}{unit !== "$" && unit && <span className="text-sm text-secondary-t ml-1">{unit}</span>}
        </p>
      )}
      <p className="text-xs text-secondary-t mt-1">{sub}</p>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ projects, tokenData, loading }: {
  projects: ImpactProject[]; tokenData: Record<string, LiveTokenData>; loading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* EBF Radar */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">EBF Pillar Scores — All Projects</h3>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>
        {projects.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <EBFRadarCard projects={projects} />
        )}
      </div>

      {/* Projects Leaderboard */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Top Impact Projects</h3>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>
        {projects.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <ProjectsLeaderboard projects={computeProjectsLeaderboard()} />
        )}
      </div>

      {/* Project Cards */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Impact Projects — Live Data</h3>
          <SourceBadge sources={[SOURCES.dexscreener, SOURCES.coingecko, SOURCES.defillama]} />
        </div>
        {projects.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.tokenSymbol}
                project={project}
                liveData={tokenData[project.tokenSymbol]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, liveData }: { project: ImpactProject; liveData?: LiveTokenData }) {
  const risk = project.riskScore;
  const rating = risk ? scoreToRating(risk.combinedScore) : null;
  const token = TOKENS.find((t) => t.symbol === project.tokenSymbol);

  return (
    <div className="rounded-lg border border-a10-b bg-surface-a5 p-4 space-y-3 hover:border-a20-b transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-base">{project.tokenName}</p>
          <p className="text-sm text-secondary-t">{project.tokenSymbol} · {token?.category}</p>
        </div>
        {rating && (
          <span className="text-lg font-bold" style={{ color: ratingColor(rating) }}>{rating}</span>
        )}
      </div>

      {/* Live market data — prefer DexScreener, fall back to GeckoTerminal */}
      {liveData && (() => {
        const liqUsd = liveData.dex?.liquidityUsd ?? liveData.geckoterminal?.liquidityUsd ?? 0;
        const vol24h = liveData.dex?.volume24h ?? liveData.geckoterminal?.volume24h ?? 0;
        const mcap = liveData.coingecko?.marketCap || liveData.dex?.marketCap || liveData.geckoterminal?.marketCap || liveData.geckoterminal?.fdv || 0;
        const change30d = liveData.coingecko?.priceChange30d || liveData.dex?.priceChange24h || liveData.geckoterminal?.priceChange24h || 0;
        const hasData = liqUsd > 0 || vol24h > 0 || mcap > 0;
        if (!hasData) return <p className="text-secondary-t text-sm">No live market data available</p>;
        return (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-secondary-t">Liquidity</p>
              <p className="font-medium text-primary-t">${formatNumber(Math.round(liqUsd))}</p>
            </div>
            <div>
              <p className="text-secondary-t">24h Volume</p>
              <p className="font-medium text-primary-t">${formatNumber(Math.round(vol24h))}</p>
            </div>
            <div>
              <p className="text-secondary-t">Market Cap</p>
              <p className="font-medium text-primary-t">{mcap > 0 ? `$${formatNumber(mcap)}` : "N/A"}</p>
            </div>
            <div>
              <p className="text-secondary-t">{liveData.coingecko ? "30d Change" : "24h Change"}</p>
              <p className={cn("font-medium", change30d >= 0 ? "text-green" : "text-red")}>
                {change30d !== 0 ? `${change30d >= 0 ? "+" : ""}${change30d.toFixed(1)}%` : "N/A"}
              </p>
            </div>
          </div>
        );
      })()}

      {/* EBF bars */}
      {project.ebfScores && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-secondary-t">EBF Pillars</p>
            <SourceBadge sources={[SOURCES.ebf]} />
          </div>
          <div className="flex gap-1">
            {EBF_PILLARS.map((p) => (
              <div key={p} className="flex-1">
                <div className="h-1.5 rounded-full bg-surface-bg-l1 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(project.ebfScores![p] * 100).toFixed(0)}%`, background: EBF_PILLAR_COLORS[p] }} />
                </div>
                <p className="text-xs text-secondary-t mt-0.5 text-center">{EBF_PILLAR_LABELS[p].slice(0, 3)}</p>
                <p className="text-xs text-primary-t text-center font-medium">{(project.ebfScores![p] * 100).toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk scores */}
      {risk && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-secondary-t">Risk Scores</p>
            <SourceBadge sources={[SOURCES.sentinel, SOURCES.iris]} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <p className="text-secondary-t">Financial</p>
              <p className="font-medium text-primary-t">{Math.round(risk.financialRiskScore)}</p>
            </div>
            <div className="text-center">
              <p className="text-secondary-t">Impact</p>
              <p className="font-medium text-primary-t">{Math.round(risk.impactRiskScore)}</p>
            </div>
            <div className="text-center">
              <p className="text-secondary-t">Quality</p>
              <p className="font-medium text-primary-t">{Math.round(risk.impactQualityScore)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Data sources */}
      <div className="flex items-center gap-1 pt-2 border-t border-a10-b flex-wrap">
        <span className="text-xs text-secondary-t">Data:</span>
        <SourceBadge sources={[
          liveData?.dex ? "✓ DexScreener" : "✗ DexScreener",
          liveData?.coingecko ? "✓ CoinGecko" : "✗ CoinGecko",
          liveData?.defillama ? "✓ DeFiLlama" : "✗ DeFiLlama",
          liveData?.geckoterminal ? "✓ GeckoTerminal" : "✗ GeckoTerminal",
        ]} />
      </div>
    </div>
  );
}

// ─── Risk Tab ────────────────────────────────────────────────────────────────

function RiskTab({ projects, tokenData, loading }: {
  projects: ImpactProject[]; tokenData: Record<string, LiveTokenData>; loading: boolean;
}) {
  if (projects.length === 0) return <EmptyState loading={loading} fullPage />;

  return (
    <div className="space-y-6">
      {projects.map((project) => (
        <RiskProjectCard
          key={project.tokenSymbol}
          project={project}
          liveData={tokenData[project.tokenSymbol]}
        />
      ))}
    </div>
  );
}

function RiskProjectCard({ project, liveData }: { project: ImpactProject; liveData?: LiveTokenData }) {
  const risk = project.riskScore;
  if (!risk) return null;
  const rating = scoreToRating(risk.combinedScore);
  const token = TOKENS.find((t) => t.symbol === project.tokenSymbol);

  return (
    <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg">{project.tokenName} <span className="text-secondary-t text-sm">({project.tokenSymbol})</span></h3>
          <p className="text-xs text-secondary-t">
            Combined: {Math.round(risk.combinedScore)} · Rating: <span style={{ color: ratingColor(rating) }}>{rating}</span>
            {token && <span> · {token.category}</span>}
          </p>
        </div>
        <div className="text-right text-xs text-secondary-t space-y-0.5">
          <p>Confidence: ±{risk.confidenceBand}</p>
          <p>Freshness: <span className={risk.dataFreshness.overall === "fresh" ? "text-green" : risk.dataFreshness.overall === "stale" ? "text-yellow" : "text-red"}>{risk.dataFreshness.overall}</span></p>
        </div>
      </div>

      {/* Data sources for this project */}
      <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
        <span className="text-secondary-t">Live data sources:</span>
        <SourceBadge sources={[
          liveData?.dex ? "✓ DexScreener" : "✗ DexScreener",
          liveData?.coingecko ? "✓ CoinGecko" : "✗ CoinGecko",
          liveData?.defillama ? "✓ DeFiLlama" : "✗ DeFiLlama",
          liveData?.geckoterminal ? "✓ GeckoTerminal" : "✗ GeckoTerminal",
        ]} />
      </div>

      {/* Live market data detail */}
      {liveData && (() => {
        const hasDex = liveData.dex || liveData.geckoterminal;
        const hasCg = liveData.coingecko || liveData.geckoterminal;
        if (!hasDex && !hasCg) return null;
        const liqUsd = liveData.dex?.liquidityUsd ?? liveData.geckoterminal?.liquidityUsd ?? 0;
        const vol24h = liveData.dex?.volume24h ?? liveData.geckoterminal?.volume24h ?? 0;
        const mcap = liveData.coingecko?.marketCap ?? liveData.geckoterminal?.marketCap ?? liveData.geckoterminal?.fdv ?? 0;
        const liqSource = liveData.dex ? "DexScreener" : "GeckoTerminal";
        const mcapSource = liveData.coingecko ? "CoinGecko" : "GeckoTerminal";
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
            {liqUsd > 0 && <Metric label="Liquidity" value={`$${formatNumber(Math.round(liqUsd))}`} source={liqSource} />}
            {vol24h > 0 && <Metric label="24h Volume" value={`$${formatNumber(Math.round(vol24h))}`} source={liqSource} />}
            {mcap > 0 && <Metric label="Market Cap" value={`$${formatNumber(Math.round(mcap))}`} source={mcapSource} />}
            {liveData.coingecko && liveData.coingecko.ath > 0 && (
              <Metric label="ATH Drawdown" value={`${(((liveData.coingecko.ath - liveData.coingecko.currentPrice) / liveData.coingecko.ath) * 100).toFixed(0)}%`} source="CoinGecko" />
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sub-scores */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs text-secondary-t uppercase">DeFi Sentinel Sub-Scores</h4>
            <SourceBadge sources={[SOURCES.sentinel]} />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[
              { name: "S1", score: risk.subScores.s1 ?? 40, label: "Smart Contract" },
              { name: "S2", score: risk.subScores.s2 ?? 40, label: "Economic" },
              { name: "S3", score: risk.subScores.s3 ?? 40, label: "Governance" },
              { name: "S4", score: risk.subScores.s4 ?? 40, label: "Sustainability" },
              { name: "S5", score: risk.subScores.s5 ?? 40, label: "Reputation" },
            ]}>
              <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={{ stroke: "var(--border-a10)" }} />
              <YAxis domain={[0, 100]} tick={{ fill: "var(--text-tertiary)", fontSize: 9 }} axisLine={{ stroke: "var(--border-a10)" }} />
              <Tooltip contentStyle={{ background: "var(--surface-a5)", border: "1px solid var(--border-a10)", borderRadius: 8 }} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {[
                  { name: "S1", score: risk.subScores.s1 ?? 40 },
                  { name: "S2", score: risk.subScores.s2 ?? 40 },
                  { name: "S3", score: risk.subScores.s3 ?? 40 },
                  { name: "S4", score: risk.subScores.s4 ?? 40 },
                  { name: "S5", score: risk.subScores.s5 ?? 40 },
                ].map((entry, i) => (
                  <Cell key={i} fill={entry.score >= 70 ? "#22c55e" : entry.score >= 50 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-5 gap-1 mt-2 text-xs text-secondary-t text-center">
            <span>S1: Smart Contract</span>
            <span>S2: Economic</span>
            <span>S3: Governance</span>
            <span>S4: Sustainability</span>
            <span>S5: Reputation</span>
          </div>
        </div>

        {/* Impact Risk Types */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs text-secondary-t uppercase">IMP/IRIS+ Impact Risk Types</h4>
            <SourceBadge sources={[SOURCES.iris]} />
          </div>
          <div className="space-y-1.5">
            {risk.impactRiskTypes.map((rt) => (
              <div key={rt.type} className="flex items-center justify-between text-xs">
                <div className="flex-1 min-w-0">
                  <span className="text-secondary-t capitalize">{rt.type.replace(/_/g, " ")}</span>
                  <p className="text-xs text-secondary-t truncate">{rt.rationale}</p>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded-full font-medium ml-2 shrink-0",
                  rt.level === "low" && "bg-green/15 text-green",
                  rt.level === "medium" && "bg-yellow/15 text-yellow",
                  rt.level === "high" && "bg-red/15 text-red",
                )}>{rt.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {project.negativeExternalities.length > 0 && (
        <div className="mt-4 rounded-lg border border-yellow/20 bg-yellow/5 p-3">
          <p className="text-xs font-medium text-yellow mb-1">Negative Externalities</p>
          <ul className="text-xs text-secondary-t list-disc list-inside">
            {project.negativeExternalities.map((ext) => <li key={ext}>{ext}</li>)}
          </ul>
        </div>
      )}

      {/* Debt ceiling */}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-a5 p-3">
        <div>
          <p className="text-xs text-secondary-t">Debt Ceiling (Gauntlet formula)</p>
          <p className="text-lg font-bold">${formatNumber(risk.debtCeiling)}</p>
        </div>
        <SourceBadge sources={[SOURCES.sentinel, SOURCES.dexscreener]} />
      </div>
    </div>
  );
}

function Metric({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="rounded-lg bg-surface-a5 p-2">
      <div className="flex items-center justify-between">
        <p className="text-secondary-t">{label}</p>
        <span className="text-xs text-secondary-t">{source}</span>
      </div>
      <p className="font-medium">{value}</p>
    </div>
  );
}

// ─── EBF Pillar Rationale Generator ──────────────────────────────────────────

function generatePillarRationale(
  pillar: EBFPillar,
  project: ImpactProject,
  token: TokenMeta | undefined,
  score: number,
  baseline: number,
  delta: number,
): string {
  if (!token) return `Score of ${score}/100. No detailed metadata available.`;

  const hist = project.ebfHistory;
  const latestSnap = hist?.[hist.length - 1];

  // Map pillar to planetary boundary for qualitative context
  const pillarToBoundary: Record<EBFPillar, string> = {
    air: "atmospheric aerosols and air quality",
    water: "freshwater use",
    soil: "land system change",
    biodiversity: "biosphere integrity",
    equity: "social foundation",
    carbon: "climate change",
  };

  // Build qualitative trend narrative from historic snapshots
  const trendDesc = (() => {
    if (!hist || hist.length < 2) {
      return delta > 0 ? `Assessment notes improvement (${baseline}→${score}) since baseline.` : delta < 0 ? `Assessment notes decline (${baseline}→${score}) since baseline.` : `Assessment reports stability at ${score}/100.`;
    }
    const pillarScores = hist.map((snap) => Math.round(snap.ebfScores[pillar] * 100));
    const months = hist.map((snap) => new Date(snap.timestamp).toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
    const firstScore = pillarScores[0];
    const lastScore = pillarScores[pillarScores.length - 1];
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];

    let increasing = 0, decreasing = 0;
    for (let i = 1; i < pillarScores.length; i++) {
      if (pillarScores[i] > pillarScores[i - 1]) increasing++;
      else if (pillarScores[i] < pillarScores[i - 1]) decreasing++;
    }

    const trajectory = increasing > decreasing ? "a steady upward trend" : decreasing > increasing ? "a gradual decline" : "minor fluctuations";

    const recentDelta = pillarScores[pillarScores.length - 1] - pillarScores[pillarScores.length - 2];
    const recentDesc = recentDelta > 0
      ? `The most recent assessment (${months[months.length - 2]}→${lastMonth}) shows a ${recentDelta}-point gain, suggesting improving on-ground conditions.`
      : recentDelta < 0
      ? `The most recent assessment (${months[months.length - 2]}→${lastMonth}) shows a ${Math.abs(recentDelta)}-point drop, warranting continued monitoring.`
      : `The latest assessment (${months[months.length - 2]}→${lastMonth}) confirms no change, indicating stable conditions.`;

    return `Over ${hist.length} months (${firstMonth}→${lastMonth}), this pillar shows ${trajectory}, with scores moving from ${firstScore} to ${lastScore}. ${recentDesc}`;
  })();

  // Build planetary boundary context from latest snapshot
  const pbContext = (() => {
    if (!latestSnap) return "";
    const pb = latestSnap.pbMapping;
    const activeBoundaries: string[] = [];
    if (pb.climateChange) activeBoundaries.push("climate change");
    if (pb.biosphereIntegrity) activeBoundaries.push("biosphere integrity");
    if (pb.freshwaterUse) activeBoundaries.push("freshwater use");
    if (pb.landSystemChange) activeBoundaries.push("land system change");
    if (pb.atmosphericAerosols) activeBoundaries.push("atmospheric aerosols");
    if (pb.socialFoundation) activeBoundaries.push("social foundation");
    if (activeBoundaries.length === 0) return "";
    return ` This project maps to the following planetary boundaries: ${activeBoundaries.join(", ")}.`;
  })();

  // Build SDG context from latest snapshot
  const sdgContext = latestSnap
    ? ` The project addresses SDGs ${latestSnap.sdgsAddressed.join(", ")}.`
    : ` The project addresses SDGs ${token.sdgs.join(", ")}.`;

  // Geospatial context
  const geoContext = (() => {
    if (!token.geospatial) return "";
    const g = token.geospatial;
    const alerts: string[] = [];
    if (g.deforestationAlerts > 0) alerts.push(`${g.deforestationAlerts} GFW deforestation alert${g.deforestationAlerts > 1 ? "s" : ""}`);
    if (g.fireAlerts > 0) alerts.push(`${g.fireAlerts} fire alert${g.fireAlerts > 1 ? "s" : ""}`);
    if (g.treeCoverLoss > 0) alerts.push(`${g.treeCoverLoss}% tree cover loss`);
    if (alerts.length === 0) return ` GFW data at ${g.desc} shows no active alerts detected.`;
    return ` GFW data at ${g.desc} flags ${alerts.join(", ")}.`;
  })();

  const confidenceNote = token.confidence === "high"
    ? `Confidence is high — assessment is backed by on-chain evidence and third-party audits.`
    : token.confidence === "medium"
    ? `Confidence is medium — assessment relies on a mix of verified and self-reported data.`
    : `Confidence is low — limited verifiable data; scores depend heavily on project disclosures.`;

  const parts: string[] = [];

  // Pillar-specific reasoning based on project category and metadata
  switch (pillar) {
    case "air":
      if (token.category === "Clean Energy") {
        parts.push(`As a clean energy token, ${token.name} directly displaces fossil fuel emissions by rewarding verified solar energy production (1 SLR per MWh). Air quality benefits stem from reduced CO2 and particulate matter associated with displaced coal and gas generation.`);
      } else if (token.category === "Reforestation") {
        parts.push(`${token.name}'s mangrove restoration sequesters CO2 and improves local air quality through tree cover. However, air quality impact is indirect compared to direct emissions reduction projects.`);
      } else if (token.category === "Regenerative Agriculture") {
        parts.push(`Regenerative agriculture practices by ${token.name} reduce airborne pollutants from synthetic fertilizers, though methane emissions from livestock in partnered farms constrain the air quality score.`);
      } else if (token.category === "Carbon Sequestration") {
        parts.push(`${token.name} facilitates carbon credit retirement, which indirectly improves air quality by incentivizing emissions reductions through carbon markets rather than direct interventions.`);
      } else {
        parts.push(`${token.name}'s air quality impact is indirect, primarily through funded climate initiatives rather than direct emissions reduction.`);
      }
      break;
    case "water":
      if (token.category === "Reforestation") {
        parts.push(`Mangrove restoration at ${token.location} directly protects coastal water quality, prevents erosion, and supports marine ecosystems. GFW satellite data confirms active restoration at ${token.geospatial?.desc ?? "the project site"}.`);
      } else if (token.category === "Regenerative Agriculture") {
        parts.push(`Regenerative practices by ${token.name} reduce agricultural runoff and improve soil water retention, though water-specific interventions are not the project's primary focus.`);
      } else if (token.category === "Biodiversity Conservation") {
        parts.push(`${token.name}'s ecological verification framework includes freshwater use monitoring as part of its planetary boundary mapping, contributing to water stewardship assessment.`);
      } else {
        parts.push(`Water quality impact for ${token.name} is assessed through indirect contributions to watershed protection and reduced pollution from funded projects.`);
      }
      break;
    case "soil":
      if (token.category === "Regenerative Agriculture") {
        parts.push(`${token.name} specializes in soil carbon sequestration from regenerative farming — this is its strongest pillar. Verified practices include cover cropping, reduced tillage, and compost application across UK agricultural sites.`);
      } else if (token.category === "Reforestation") {
        parts.push(`Mangrove restoration by ${token.name} stabilizes coastal soils, prevents erosion, and builds soil organic matter in intertidal zones at ${token.location}.`);
      } else if (token.category === "Biodiversity Conservation") {
        parts.push(`${token.name}'s ecological registry includes land system change monitoring, which indirectly tracks soil health through land-use patterns.`);
      } else {
        parts.push(`Soil health impact for ${token.name} is indirect, primarily through funded regenerative agriculture and conservation projects.`);
      }
      break;
    case "biodiversity":
      if (token.category === "Biodiversity Conservation") {
        parts.push(`${token.name} is purpose-built for biodiversity conservation, providing on-chain verification of ecological claims and managing registries for biodiversity credits. This is its highest-scoring pillar.`);
      } else if (token.category === "Reforestation") {
        parts.push(`Mangrove restoration by ${token.name} creates critical habitat for marine and terrestrial species. GFW data shows ${token.geospatial?.deforestationAlerts ?? 0} deforestation alert${(token.geospatial?.deforestationAlerts ?? 0) !== 1 ? "s" : ""} at ${token.geospatial?.desc ?? "the site"}.`);
      } else if (token.category === "Regenerative Agriculture") {
        parts.push(`Regenerative practices by ${token.name} promote pollinator habitat and above-ground biodiversity, though some partnered farms retain livestock operations that limit biodiversity gains.`);
      } else {
        parts.push(`Biodiversity impact for ${token.name} is assessed through its funding of conservation initiatives and ecosystem protection projects.`);
      }
      break;
    case "equity":
      if (token.category === "Community Development") {
        parts.push(`${token.name} scores highest in equity due to its permanent endowment model directing funds to community-driven sustainability projects. It aligns with SDGs ${token.sdgs.join(", ")}, including poverty reduction and gender equality.`);
      } else if (token.category === "Biodiversity Conservation") {
        parts.push(`${token.name}'s stakeholder equity is evaluated through governance participation (${token.governanceParticipation}%) and ${token.communityEngagement} community engagement, with SDG alignment covering ${token.sdgs.join(", ")}.`);
      } else if (token.category === "Clean Energy") {
        parts.push(`${token.name} rewards solar producers globally, providing equitable access to energy markets. Governance participation is at ${token.governanceParticipation}% with ${token.communityEngagement} community engagement.`);
      } else {
        parts.push(`Equity assessment for ${token.name} considers governance participation (${token.governanceParticipation}%), community engagement (${token.communityEngagement}), and SDG alignment (${token.sdgs.join(", ")}).`);
      }
      break;
    case "carbon":
      if (token.category === "Carbon Sequestration") {
        parts.push(`${token.name} is a dedicated carbon market protocol facilitating trading and retirement of tokenized carbon credits. This is its strongest pillar, directly enabling verifiable carbon offset retirement on-chain.`);
      } else if (token.category === "Clean Energy") {
        parts.push(`${token.name} achieves high carbon scores by displacing fossil fuel generation — each MWh of verified solar production avoids approximately 0.4–0.9 tons of CO2 emissions.`);
      } else if (token.category === "Reforestation") {
        parts.push(`Mangrove forests sequester carbon at 3–5x the rate of terrestrial forests. ${token.name}'s Proof of Tree protocol verifies actual tree growth, ensuring carbon claims are backed by living biomass.`);
      } else if (token.category === "Regenerative Agriculture") {
        parts.push(`${token.name} tokenizes verified soil carbon offsets, directly linking regenerative farming to carbon credit markets. However, methane emissions from livestock in some partnered farms partially offset carbon gains.`);
      } else {
        parts.push(`Carbon impact for ${token.name} is assessed through its funding of climate initiatives, though direct sequestration verification remains limited.`);
      }
      break;
  }

  // Add negative externalities if present
  if (token.negativeExternalities.length > 0) {
    parts.push(`Risk factors capping this score: ${token.negativeExternalities.join("; ")}.`);
  }

  // Add planetary boundary context
  parts.push(`This pillar relates to ${pillarToBoundary[pillar]}.${pbContext}${sdgContext}${geoContext}`);

  // Add dynamic trend from searchx historic data and confidence
  parts.push(trendDesc);
  parts.push(confidenceNote);

  return parts.join(" ");
}

// ─── Impact Tab ──────────────────────────────────────────────────────────────

function ImpactTab({ projects, projectsLb, loading }: {
  projects: ImpactProject[]; projectsLb: LeaderboardProject[]; loading: boolean;
}) {
  const allSymbols = projects.map((p) => p.tokenSymbol);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set(allSymbols));
  const [selectedPillars, setSelectedPillars] = useState<Set<string>>(new Set(EBF_PILLARS));
  const [showAverages, setShowAverages] = useState(true);

  function toggleProject(sym: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });
  }

  function togglePillar(pillar: string) {
    setSelectedPillars((prev) => {
      const next = new Set(prev);
      if (next.has(pillar)) next.delete(pillar); else next.add(pillar);
      return next;
    });
  }

  // Build combined time-series data: each row has all project averages + all pillar scores per project
  const combinedHistory = projects.length > 0 && projects[0].ebfHistory
    ? projects[0].ebfHistory.map((snap, i) => {
        const date = new Date(snap.timestamp);
        const label = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        const entry: Record<string, string | number> = { label };
        for (const p of projects) {
          const hist = p.ebfHistory;
          if (hist && hist[i]) {
            const s = hist[i].ebfScores;
            entry[p.tokenSymbol] = Math.round(((s.air + s.water + s.soil + s.biodiversity + s.equity + s.carbon) / 6) * 100);
            entry[`${p.tokenSymbol} Air`] = Math.round(s.air * 100);
            entry[`${p.tokenSymbol} Water`] = Math.round(s.water * 100);
            entry[`${p.tokenSymbol} Soil`] = Math.round(s.soil * 100);
            entry[`${p.tokenSymbol} Biodiversity`] = Math.round(s.biodiversity * 100);
            entry[`${p.tokenSymbol} Equity`] = Math.round(s.equity * 100);
            entry[`${p.tokenSymbol} Carbon`] = Math.round(s.carbon * 100);
          }
        }
        return entry;
      })
    : [];

  // Filtered project list
  const visibleProjects = projects.filter((p) => selectedProjects.has(p.tokenSymbol));
  const visiblePillars = EBF_PILLARS.filter((p) => selectedPillars.has(p));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* EBF Radar */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">EBF Pillar Scores — All Projects</h3>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>
        {projects.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <EBFRadarCard projects={projects} />
        )}
      </div>

      {/* Projects Leaderboard */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Top Impact Projects</h3>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>
        {projectsLb.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <ProjectsLeaderboard projects={projectsLb} />
        )}
      </div>

      {/* EBF Score History — Combined By Project + By Pillar with Filters */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium">EBF Score History — By Project & Pillar</h3>
            <p className="text-xs text-secondary-t mt-0.5">
              Thick lines = project averages · Thin lines = individual pillar scores
            </p>
          </div>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4 pb-3 border-b border-a10-b">
          {/* Project filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary-t uppercase tracking-wide">Projects:</span>
            {allSymbols.map((sym) => {
              const idx = projects.findIndex((p) => p.tokenSymbol === sym);
              const color = `hsl(${idx * 60}, 70%, 60%)`;
              const active = selectedProjects.has(sym);
              return (
                <button
                  key={sym}
                  onClick={() => toggleProject(sym)}
                  className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-all", active ? "text-white" : "text-secondary-t opacity-50")}
                  style={active ? { background: color, borderColor: color } : { borderColor: "var(--border-a10)" }}
                >{sym}</button>
              );
            })}
          </div>

          {/* Pillar filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary-t uppercase tracking-wide">Pillars:</span>
            {EBF_PILLARS.map((pillar) => {
              const active = selectedPillars.has(pillar);
              return (
                <button
                  key={pillar}
                  onClick={() => togglePillar(pillar)}
                  className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-all", active ? "text-white" : "text-secondary-t opacity-50")}
                  style={active ? { background: EBF_PILLAR_COLORS[pillar], borderColor: EBF_PILLAR_COLORS[pillar] } : { borderColor: "var(--border-a10)" }}
                >{EBF_PILLAR_LABELS[pillar]}</button>
              );
            })}
          </div>

          {/* Average toggle */}
          <button
            onClick={() => setShowAverages((v) => !v)}
            className={cn("px-2 py-0.5 rounded text-xs font-medium border transition-all", showAverages ? "bg-primary-t text-inverted-primary-t" : "text-secondary-t opacity-50")}
            style={{ borderColor: "var(--border-a10)" }}
          >Avg</button>
        </div>

        {combinedHistory.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <ResponsiveContainer width="100%" height={480}>
            <LineChart data={combinedHistory} margin={{ top: 10, right: 10, left: -20, bottom: 60 }}>
              <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={{ stroke: "var(--border-a10)" }} />
              <YAxis domain={[0, 100]} tick={{ fill: "var(--text-tertiary)", fontSize: 9 }} axisLine={{ stroke: "var(--border-a10)" }} />
              <Tooltip contentStyle={{ background: "var(--surface-a5)", border: "1px solid var(--border-a10)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 9, paddingTop: 8, maxHeight: 80, overflowY: "auto" }} layout="horizontal" align="center" verticalAlign="bottom" />

              {/* Project average lines (thick) — only for selected projects */}
              {showAverages && visibleProjects.map((p) => {
                const i = projects.indexOf(p);
                return (
                  <Line
                    key={p.tokenSymbol}
                    type="monotone"
                    dataKey={p.tokenSymbol}
                    stroke={`hsl(${i * 60}, 70%, 60%)`}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                );
              })}

              {/* Per-project pillar lines (thin, colored by pillar) — only for selected projects + pillars */}
              {visibleProjects.map((p) =>
                visiblePillars.map((pillar) => (
                  <Line
                    key={`${p.tokenSymbol}-${pillar}`}
                    type="monotone"
                    dataKey={`${p.tokenSymbol} ${EBF_PILLAR_LABELS[pillar]}`}
                    stroke={EBF_PILLAR_COLORS[pillar]}
                    strokeWidth={1}
                    strokeOpacity={0.5}
                    dot={false}
                  />
                ))
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-project EBF detail */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">EBF Pillar Detail</h3>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>
        {projects.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const token = TOKENS.find((t) => t.symbol === project.tokenSymbol);
              return (
                <div key={project.tokenSymbol} className="rounded-lg border border-a10-b bg-surface-a5 p-4 space-y-3">
                  <div>
                    <p className="font-medium text-sm">{project.tokenName}</p>
                    <p className="text-xs text-secondary-t">{project.tokenSymbol} · {token?.category}</p>
                  </div>
                  {project.ebfScores && (
                    <div className="space-y-2">
                      {EBF_PILLARS.map((p) => {
                        const score = Math.round(project.ebfScores![p] * 100);
                        const baseline = token ? Math.round(token.ebfBaseline[p] * 100) : 0;
                        const delta = score - baseline;
                        const rationale = generatePillarRationale(p, project, token, score, baseline, delta);
                        return (
                          <div key={p} className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-20 text-secondary-t">{EBF_PILLAR_LABELS[p]}</span>
                              <div className="flex-1 h-2 rounded-full bg-surface-bg-l1 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${score}%`, background: EBF_PILLAR_COLORS[p] }} />
                              </div>
                              <span className="w-8 text-right font-medium">{score}</span>
                              {delta !== 0 && (
                                <span className={cn("text-xs", delta > 0 ? "text-green" : "text-red")}>
                                  {delta > 0 ? "+" : ""}{delta}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-secondary-t leading-relaxed pl-[88px] mt-0.5">{rationale}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {project.geospatial && (
                    <div className="pt-2 border-t border-a10-b">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-secondary-t">Geospatial Data</p>
                        <SourceBadge sources={[SOURCES.gfw]} />
                      </div>
                      <p className="text-xs text-secondary-t">{project.geospatial.siteDescription}</p>
                      <p className="text-xs text-secondary-t mt-1">
                        {project.geospatial.latitude?.toFixed(2)}, {project.geospatial.longitude?.toFixed(2)}
                        {project.geospatial.deforestationAlerts != null && ` · ${project.geospatial.deforestationAlerts} GFW alerts`}
                      </p>
                    </div>
                  )}
                  <div className="pt-2 border-t border-a10-b">
                    <p className="text-xs text-secondary-t">SDGs: {project.sdgsAddressed.join(", ")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Methodology Tab ─────────────────────────────────────────────────────────

function MethodologyTab() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-6">
        <h3 className="text-sm font-medium mb-3">Scoring Framework Overview</h3>
        <p className="text-sm text-secondary-t mb-4">
          The Impact Clarity Map uses three complementary frameworks to evaluate impact tokens.
          All financial data is fetched live from public APIs — no data is fabricated.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">DeFi Sentinel</h4>
            <p className="text-xs text-secondary-t">5-dimensional financial risk framework (S1-S5) using live market data from DexScreener, CoinGecko, and DeFiLlama.</p>
            <p className="text-xs text-secondary-t mt-2 font-mono">{SENTINEL_FORMULA}</p>
          </div>
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">IMP/IRIS+</h4>
            <p className="text-xs text-secondary-t">10 impact risk types from the IMP/IRIS+ framework, assessing evidence, execution, equity, and endurance of impact claims.</p>
            <p className="text-xs text-secondary-t mt-2 font-mono">{IRIS_FORMULA}</p>
          </div>
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">EBF Assessment</h4>
            <p className="text-xs text-secondary-t">6 ecological pillars (Air, Water, Soil, Biodiversity, Equity, Carbon) scored 0.0-1.0 from AI assessment of project documentation.</p>
            <p className="text-xs text-secondary-t mt-2">Impact Quality = Average(all 6 pillars) × 100</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-surface-a5 p-3">
          <p className="text-xs text-secondary-t mb-1">Combined Score Formula:</p>
          <p className="text-sm font-mono text-primary-t">{COMBINED_FORMULA}</p>
        </div>
        <div className="mt-2 rounded-lg bg-surface-a5 p-3">
          <p className="text-xs text-secondary-t mb-1">Debt Ceiling Formula (Gauntlet-style):</p>
          <p className="text-sm font-mono text-primary-t">{DEBT_CEILING_FORMULA}</p>
        </div>
      </div>

      {/* EBF Pillars Methodology */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">EBF Pillar Scoring Methodology</h3>
          <SourceBadge sources={[SOURCES.ebf]} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EBF_METHODOLOGY.map((m) => (
            <div key={m.pillar} className="rounded-lg border border-a10-b bg-surface-a5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="size-3 rounded-full" style={{ background: EBF_PILLAR_COLORS[m.pillar] }} />
                <h4 className="text-sm font-medium">{m.label}</h4>
              </div>
              <p className="text-xs text-secondary-t mb-3">{m.description}</p>
              <div className="space-y-1 mb-3">
                <p className="text-xs text-secondary-t uppercase">Scoring Criteria:</p>
                {m.scoringCriteria.map((c) => (
                  <p key={c} className="text-xs text-secondary-t pl-2">• {c}</p>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-secondary-t uppercase">Data Source:</p>
                <p className="text-xs text-secondary-t">{m.dataSource}</p>
                <p className="text-xs text-secondary-t mt-1">Scale: {m.scale}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DeFi Sentinel Methodology */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">DeFi Sentinel Sub-Score Methodology</h3>
          <SourceBadge sources={[SOURCES.sentinel, SOURCES.dexscreener, SOURCES.coingecko, SOURCES.defillama]} />
        </div>
        <div className="space-y-3">
          {SENTINEL_METHODOLOGY.map((s) => (
            <div key={s.code} className="rounded-lg border border-a10-b bg-surface-a5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-medium">
                    <span className="text-green">{s.code}</span> — {s.name}
                    <span className="text-secondary-t text-xs ml-2">(weight: {(s.weight * 100).toFixed(0)}%)</span>
                  </h4>
                </div>
              </div>
              <p className="text-xs text-secondary-t mb-2">{s.description}</p>
              <div className="rounded bg-surface-bg-l1 p-2 mb-2">
                <p className="text-xs font-mono text-primary-t">{s.formula}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-secondary-t uppercase">Inputs:</p>
                {s.inputs.map((inp) => (
                  <div key={inp.label} className="text-xs">
                    <span className="text-secondary-t font-medium">{inp.label}</span>
                    <span className="text-secondary-t"> — {inp.source}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-surface-a5 p-3">
          <p className="text-xs text-secondary-t mb-1">Overall Financial Risk:</p>
          <p className="text-sm font-mono text-primary-t">{SENTINEL_FORMULA}</p>
        </div>
      </div>

      {/* IRIS+ Methodology */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">IMP/IRIS+ Impact Risk Type Methodology</h3>
          <SourceBadge sources={[SOURCES.iris]} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {IRIS_METHODOLOGY.map((rt) => (
            <div key={rt.type} className="rounded-lg border border-a10-b bg-surface-a5 p-3">
              <h4 className="text-sm font-medium mb-1">{rt.label}</h4>
              <p className="text-xs text-secondary-t mb-2">{rt.description}</p>
              <div className="space-y-1">
                {rt.scoringCriteria.map((c) => (
                  <div key={c.level} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full font-medium w-12 text-center",
                      c.level === "low" && "bg-green/15 text-green",
                      c.level === "medium" && "bg-yellow/15 text-yellow",
                      c.level === "high" && "bg-red/15 text-red",
                    )}>{c.level}</span>
                    <span className="text-secondary-t">({c.score} pts)</span>
                    <span className="text-secondary-t">{c.condition}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-surface-a5 p-3">
          <p className="text-xs text-secondary-t mb-1">Impact Risk Score:</p>
          <p className="text-sm font-mono text-primary-t">{IRIS_FORMULA}</p>
          <p className="text-xs text-secondary-t mt-1">Each risk type scored 1 (low), 2 (medium), or 3 (high). Average across all 10 types, then inverted to a 0-100 scale.</p>
        </div>
      </div>

      {/* Data Sources */}
      <div className="rounded-2xl border border-a10-b bg-surface-bg-l2 p-6">
        <h3 className="text-sm font-medium mb-4">Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">DexScreener</h4>
            <p className="text-xs text-secondary-t mb-2">Provides: liquidity, 24h/1h volume, price changes, FDV, pair age, slippage estimation</p>
            <p className="text-xs text-secondary-t">API: api.dexscreener.com/latest/dex/tokens/{`{address}`}</p>
            <p className="text-xs text-secondary-t">Used in: S1 (liquidity, pair age), S2 (slippage, volatility), S4 (liquidity)</p>
          </div>
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">CoinGecko</h4>
            <p className="text-xs text-secondary-t mb-2">Provides: ATH/ATL, market cap, circulating/total supply, 7d/30d/200d price changes</p>
            <p className="text-xs text-secondary-t">API: api.coingecko.com/api/v3/coins/{`{id}`}</p>
            <p className="text-xs text-secondary-t">Used in: S2 (supply distribution), S4 (30d volatility), S5 (ATH drawdown, time since ATH)</p>
          </div>
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">DeFiLlama</h4>
            <p className="text-xs text-secondary-t mb-2">Provides: TVL, TVL change (24h/7d/30d), chain breakdown</p>
            <p className="text-xs text-secondary-t">API: api.llama.fi/protocol/{`{slug}`}</p>
            <p className="text-xs text-secondary-t">Used in: S4 (TVL trend)</p>
          </div>
          <div className="rounded-lg border border-a10-b bg-surface-a5 p-4">
            <h4 className="text-sm font-medium text-green mb-2">EBF Assessment</h4>
            <p className="text-xs text-secondary-t mb-2">Provides: 6 ecological pillar scores (0.0-1.0), confidence level, negative externalities, SDG mapping</p>
            <p className="text-xs text-secondary-t">Source: AI assessment from project documentation, third-party verification reports, and ecological monitoring data</p>
            <p className="text-xs text-secondary-t">Used in: Impact Quality Score, IRIS+ risk types (inequity, efficiency, endurance)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Projects Leaderboard ────────────────────────────────────────────────────

function ProjectsLeaderboard({ projects }: { projects: LeaderboardProject[] }) {
  return (
    <div className="space-y-2">
      {projects.map((p) => (
        <div key={p.rank} className="flex items-center gap-3 text-sm">
          <span className="text-secondary-t w-6">#{p.rank}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{p.tokenName}</p>
            <p className="text-xs text-secondary-t">{p.tokenSymbol}</p>
          </div>
          <span className={cn(
            "text-xs font-medium",
            p.trend === "improving" && "text-green",
            p.trend === "stable" && "text-secondary-t",
            p.trend === "declining" && "text-red",
          )}>
            {p.ebfScoreDelta > 0 ? "+" : ""}{p.ebfScoreDelta.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ loading, fullPage }: { loading: boolean; fullPage?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center text-center", fullPage && "min-h-[300px]")}>
      <div>
        {loading ? (
          <>
            <div className="inline-block size-8 border-2 border-green border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-secondary-t">Fetching from DexScreener, CoinGecko, DeFiLlama...</p>
          </>
        ) : (
          <>
            <div className="inline-block size-8 rounded-full bg-surface-a5 flex items-center justify-center mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                <path d="M3 3v18h18M7 14l4-4 4 4 6-6" />
              </svg>
            </div>
            <p className="text-sm text-secondary-t">No data available.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
