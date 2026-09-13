// Risk Score Calculator — ported from Worker
// Computes DeFi Sentinel 5D financial risk, IMP/IRIS+ 10 impact risk types,
// EBF equal-weighted impact quality, Gauntlet-style debt ceiling

import type {
  EBFScores, RiskScore, DataFreshness, DeFiSentinelRating,
} from "./impact-icm-types";
import type { DexScreenerData } from "./impact-lib-dexscreener";
import type { CoinGeckoData } from "./impact-lib-coingecko";
import type { DeFiLlamaData } from "./impact-lib-defillama";
import type { TokenMeta } from "./impact-lib-project-registry";

// ─── Normalization helpers ───────────────────────────────────────────────────

function normalizeLinear(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function normalizeInverse(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return 50;
  return 100 - normalizeLinear(value, min, max);
}

function scoreToRating(score: number): DeFiSentinelRating {
  if (score >= 90) return "AAA";
  if (score >= 80) return "AA";
  if (score >= 70) return "A";
  if (score >= 60) return "BBB";
  if (score >= 50) return "BB";
  if (score >= 40) return "B";
  return "CCC";
}

// ─── Default bounds for normalization ────────────────────────────────────────

const BOUNDS = {
  liquidity: { min: 1_000, max: 5_000_000 },
  volume24h: { min: 1_000, max: 1_000_000 },
  slippage: { min: 0, max: 10 },
  supplyDistribution: { min: 0.3, max: 0.9 },
  athDrawdown: { min: 0, max: 100 },
  timeSinceATH: { min: 30, max: 1095 },
  intradayVolatility: { min: 0, max: 20 },
  volatility30d: { min: 0, max: 100 },
  tvlTrend30d: { min: -50, max: 50 },
  pairAge: { min: 30, max: 730 },
  governanceParticipation: { min: 1, max: 30 },
  monthsOperational: { min: 1, max: 120 },
};

// ─── S1: Smart Contract Risk ─────────────────────────────────────────────────

function calcS1(dex: DexScreenerData | null): number {
  if (!dex) return 40;
  const liquidityScore = normalizeLinear(dex.liquidityUsd, BOUNDS.liquidity.min, BOUNDS.liquidity.max);
  const pairAgeScore = normalizeLinear(dex.pairAgeDays, BOUNDS.pairAge.min, BOUNDS.pairAge.max);
  const result = Math.round(liquidityScore * 0.6 + pairAgeScore * 0.4);
  const final = Number.isNaN(result) ? 40 : result;
  return Math.max(10, final);
}

// ─── S2: Economic Risk ───────────────────────────────────────────────────────

function calcS2(dex: DexScreenerData | null, cg: CoinGeckoData | null): number {
  if (!dex && !cg) return 40;
  const slippageScore = dex ? normalizeInverse(dex.slippage, BOUNDS.slippage.min, BOUNDS.slippage.max) : 50;
  const supplyDistScore = cg && cg.totalSupply > 0
    ? normalizeLinear(cg.circulatingSupply / cg.totalSupply, BOUNDS.supplyDistribution.min, BOUNDS.supplyDistribution.max)
    : 50;
  const volScore = dex ? normalizeInverse(Math.abs(dex.priceChange1h), 0, 15) : 50;
  const result = Math.round(slippageScore * 0.4 + supplyDistScore * 0.35 + volScore * 0.25);
  const final = Number.isNaN(result) ? 40 : result;
  return Math.max(10, final);
}

// ─── S3: Governance Risk ─────────────────────────────────────────────────────

function calcS3(token: TokenMeta): number {
  const govScore = normalizeLinear(token.governanceParticipation ?? 5, BOUNDS.governanceParticipation.min, BOUNDS.governanceParticipation.max);
  const opsScore = normalizeLinear(token.operationalMonths ?? 12, BOUNDS.monthsOperational.min, BOUNDS.monthsOperational.max);
  const result = Math.round(govScore * 0.5 + opsScore * 0.5);
  const final = Number.isNaN(result) ? 40 : result;
  return Math.max(10, final);
}

// ─── S4: Sustainability Risk ─────────────────────────────────────────────────

function calcS4(dex: DexScreenerData | null, cg: CoinGeckoData | null, dl: DeFiLlamaData | null): number {
  const vol30d = cg ? Math.abs(cg.priceChange30d) : 0;
  const volScore = normalizeInverse(vol30d, BOUNDS.volatility30d.min, BOUNDS.volatility30d.max);
  const tvlScore = dl ? normalizeLinear(dl.tvlChange30d, BOUNDS.tvlTrend30d.min, BOUNDS.tvlTrend30d.max) : 50;
  const liqScore = dex ? normalizeLinear(dex.liquidityUsd, BOUNDS.liquidity.min, BOUNDS.liquidity.max) : 50;
  const result = Math.round(volScore * 0.4 + tvlScore * 0.35 + liqScore * 0.25);
  const final = Number.isNaN(result) ? 40 : result;
  return Math.max(10, final);
}

// ─── S5: Reputation Risk ─────────────────────────────────────────────────────

function calcS5(cg: CoinGeckoData | null, token: TokenMeta): number {
  const athDrawdown = cg && cg.ath > 0 && cg.currentPrice > 0
    ? ((cg.ath - cg.currentPrice) / cg.ath) * 100
    : 100;
  const athScore = normalizeInverse(athDrawdown, BOUNDS.athDrawdown.min, BOUNDS.athDrawdown.max);
  const timeSinceATH = cg && cg.athDate
    ? (Date.now() - new Date(cg.athDate).getTime()) / 86400000
    : 1095;
  const timeScore = normalizeInverse(timeSinceATH, BOUNDS.timeSinceATH.min, BOUNDS.timeSinceATH.max);
  const extScore = token.negativeExternalities.length === 0 ? 90 : token.negativeExternalities.length === 1 ? 60 : 30;
  const result = Math.round(athScore * 0.35 + timeScore * 0.30 + extScore * 0.35);
  const final = Number.isNaN(result) ? 40 : result;
  return Math.max(10, final);
}

// ─── IMP/IRIS+ Impact Risk Types ─────────────────────────────────────────────

function calcImpactRiskTypes(token: TokenMeta, _dex: DexScreenerData | null, cg: CoinGeckoData | null) {
  const ebf = token.ebf;
  const avgEBF = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;

  const dataAgeDays = cg?.athDate ? (Date.now() - new Date(cg.athDate).getTime()) / 86400000 : 90;

  return [
    {
      type: "evidence",
      level: (token.confidence === "high" ? "low" : token.confidence === "medium" ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: (token.confidence === "high" ? 1 : token.confidence === "medium" ? 2 : 3) as 1 | 2 | 3,
      rationale: `${token.confidence} confidence, data age ${Math.round(dataAgeDays)}d`,
    },
    {
      type: "external",
      level: (token.geospatial?.deforestationAlerts ?? 0) > 0 ? "medium" : "low" as "low" | "medium" | "high",
      numericScore: (token.geospatial?.deforestationAlerts ?? 0) > 0 ? 2 : 1 as 1 | 2 | 3,
      rationale: token.geospatial ? `${token.geospatial.deforestationAlerts} GFW alerts` : "No GFW alerts",
    },
    {
      type: "stakeholder_participation",
      level: (token.communityEngagement === "high" ? "low" : token.communityEngagement === "medium" ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: (token.communityEngagement === "high" ? 1 : token.communityEngagement === "medium" ? 2 : 3) as 1 | 2 | 3,
      rationale: `Community engagement: ${token.communityEngagement}`,
    },
    {
      type: "drop_off",
      level: (() => {
        const currentAvg = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;
        const baselineAvg = (token.ebfBaseline.air + token.ebfBaseline.water + token.ebfBaseline.soil + token.ebfBaseline.biodiversity + token.ebfBaseline.equity + token.ebfBaseline.carbon) / 6;
        const delta = currentAvg - baselineAvg;
        return delta > 0.02 ? "low" : delta > -0.02 ? "medium" : "high";
      })() as "low" | "medium" | "high",
      numericScore: (() => {
        const currentAvg = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;
        const baselineAvg = (token.ebfBaseline.air + token.ebfBaseline.water + token.ebfBaseline.soil + token.ebfBaseline.biodiversity + token.ebfBaseline.equity + token.ebfBaseline.carbon) / 6;
        const delta = currentAvg - baselineAvg;
        return delta > 0.02 ? 1 : delta > -0.02 ? 2 : 3;
      })() as 1 | 2 | 3,
      rationale: (() => {
        const currentAvg = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;
        const baselineAvg = (token.ebfBaseline.air + token.ebfBaseline.water + token.ebfBaseline.soil + token.ebfBaseline.biodiversity + token.ebfBaseline.equity + token.ebfBaseline.carbon) / 6;
        const delta = (currentAvg - baselineAvg) * 100;
        return `EBF delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
      })(),
    },
    {
      type: "execution",
      level: ((token.operationalMonths ?? 12) >= 24 ? "low" : (token.operationalMonths ?? 12) >= 6 ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: ((token.operationalMonths ?? 12) >= 24 ? 1 : (token.operationalMonths ?? 12) >= 6 ? 2 : 3) as 1 | 2 | 3,
      rationale: `${token.operationalMonths ?? 12} months operational`,
    },
    {
      type: "unexpected_impact",
      level: (token.negativeExternalities.length === 0 ? "low" : token.negativeExternalities.length <= 1 ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: (token.negativeExternalities.length === 0 ? 1 : token.negativeExternalities.length <= 1 ? 2 : 3) as 1 | 2 | 3,
      rationale: `${token.negativeExternalities.length} negative externalities`,
    },
    {
      type: "inequity",
      level: (ebf.equity >= 0.7 ? "low" : ebf.equity >= 0.5 ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: (ebf.equity >= 0.7 ? 1 : ebf.equity >= 0.5 ? 2 : 3) as 1 | 2 | 3,
      rationale: `EBF Equity: ${ebf.equity.toFixed(2)}`,
    },
    {
      type: "efficiency",
      level: (avgEBF >= 0.7 ? "low" : avgEBF >= 0.5 ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: (avgEBF >= 0.7 ? 1 : avgEBF >= 0.5 ? 2 : 3) as 1 | 2 | 3,
      rationale: `Avg EBF: ${avgEBF.toFixed(2)}`,
    },
    {
      type: "endurance",
      level: (() => {
        const currentAvg = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;
        const baselineAvg = (token.ebfBaseline.air + token.ebfBaseline.water + token.ebfBaseline.soil + token.ebfBaseline.biodiversity + token.ebfBaseline.equity + token.ebfBaseline.carbon) / 6;
        const improving = currentAvg > baselineAvg;
        const months = token.operationalMonths ?? 12;
        if (months >= 24 && improving) return "low";
        if (months >= 6) return "medium";
        return "high";
      })() as "low" | "medium" | "high",
      numericScore: (() => {
        const currentAvg = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;
        const baselineAvg = (token.ebfBaseline.air + token.ebfBaseline.water + token.ebfBaseline.soil + token.ebfBaseline.biodiversity + token.ebfBaseline.equity + token.ebfBaseline.carbon) / 6;
        const improving = currentAvg > baselineAvg;
        const months = token.operationalMonths ?? 12;
        if (months >= 24 && improving) return 1;
        if (months >= 6) return 2;
        return 3;
      })() as 1 | 2 | 3,
      rationale: `${token.operationalMonths ?? 12} months, EBF ${((ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6) > ((token.ebfBaseline.air + token.ebfBaseline.water + token.ebfBaseline.soil + token.ebfBaseline.biodiversity + token.ebfBaseline.equity + token.ebfBaseline.carbon) / 6) ? "improving" : "stable"}`,
    },
    {
      type: "alignment",
      level: ((token.governanceParticipation ?? 5) >= 15 ? "low" : (token.governanceParticipation ?? 5) >= 5 ? "medium" : "high") as "low" | "medium" | "high",
      numericScore: ((token.governanceParticipation ?? 5) >= 15 ? 1 : (token.governanceParticipation ?? 5) >= 5 ? 2 : 3) as 1 | 2 | 3,
      rationale: `Gov participation: ${token.governanceParticipation ?? 5}%`,
    },
  ];
}

// ─── EBF Impact Quality Score ────────────────────────────────────────────────

function calcImpactQuality(ebf: EBFScores): number {
  const avg = (ebf.air + ebf.water + ebf.soil + ebf.biodiversity + ebf.equity + ebf.carbon) / 6;
  return Math.round(avg * 100);
}

// ─── Gauntlet-style Debt Ceiling ─────────────────────────────────────────────

function calcDebtCeiling(liquidityUsd: number, financialRiskScore: number): number {
  if (liquidityUsd <= 0) return 0;
  const buffer = liquidityUsd * 0.5;
  const riskFactor = financialRiskScore / 100;
  return Math.round((liquidityUsd / 2) * Math.sqrt(buffer / 1_000_000) * (1 - riskFactor * 0.3));
}

// ─── Confidence Band ─────────────────────────────────────────────────────────

function calcConfidenceBand(
  dex: DexScreenerData | null,
  cg: CoinGeckoData | null,
  dl: DeFiLlamaData | null,
): number {
  let sources = 0;
  let confidence = 0;
  if (dex) { sources++; confidence += 1; }
  if (cg) { sources++; confidence += 1; }
  if (dl) { sources++; confidence += 0.5; }
  if (sources === 0) return 20;
  if (sources === 1) return 12;
  if (sources === 2) return 7;
  return 3;
}

// ─── Data Freshness ──────────────────────────────────────────────────────────

function calcDataFreshness(
  dex: DexScreenerData | null,
  cg: CoinGeckoData | null,
  dl: DeFiLlamaData | null,
): DataFreshness {
  const now = Date.now();
  const sources: DataFreshness["sources"] = {};

  if (dex) {
    sources.dexscreener = { lastUpdated: new Date(now).toISOString(), ageMinutes: 0, status: "fresh" };
  }
  if (cg) {
    const age = cg.athDate ? (now - new Date(cg.athDate).getTime()) / 60000 : 0;
    sources.coingecko = { lastUpdated: new Date(now - age * 60000).toISOString(), ageMinutes: Math.round(age), status: age < 60 ? "fresh" : age < 1440 ? "stale" : "degraded" };
  }
  if (dl) {
    sources.defillama = { lastUpdated: new Date(now).toISOString(), ageMinutes: 0, status: "fresh" };
  }

  const allFresh = Object.values(sources).every((s) => s.status === "fresh");
  const anyDegraded = Object.values(sources).some((s) => s.status === "degraded");

  return {
    overall: anyDegraded ? "degraded" : allFresh ? "fresh" : "stale",
    sources,
  };
}

// ─── Main calculation ────────────────────────────────────────────────────────

export function calculateRiskScore(
  token: TokenMeta,
  dex: DexScreenerData | null,
  cg: CoinGeckoData | null,
  dl: DeFiLlamaData | null,
): RiskScore {
  const s1 = calcS1(dex);
  const s2 = calcS2(dex, cg);
  const s3 = calcS3(token);
  const s4 = calcS4(dex, cg, dl);
  const s5 = calcS5(cg, token);

  // DeFi Sentinel weighted average: S1=25%, S2=25%, S3=15%, S4=20%, S5=15%
  const financialRaw = s1 * 0.25 + s2 * 0.25 + s3 * 0.15 + s4 * 0.20 + s5 * 0.15;
  const financialRiskScore = Math.round(Number.isNaN(financialRaw) ? 0 : financialRaw);

  // Impact risk: average of 10 IRIS+ risk types (inverted: lower risk = higher score)
  const impactRiskTypes = calcImpactRiskTypes(token, dex, cg);
  const impactRiskRaw = impactRiskTypes.reduce((sum, rt) => sum + rt.numericScore, 0) / 10;
  const impactRiskScoreRaw = (4 - impactRiskRaw) / 3 * 100;
  const impactRiskScore = Math.round(Number.isNaN(impactRiskScoreRaw) ? 0 : impactRiskScoreRaw);

  // Impact quality from EBF
  const impactQualityScore = calcImpactQuality(token.ebf);

  // Combined: 40% financial, 30% impact risk, 30% impact quality
  const combinedRaw = financialRiskScore * 0.4 + impactRiskScore * 0.3 + impactQualityScore * 0.3;
  const combinedScore = Math.round(Number.isNaN(combinedRaw) ? 0 : combinedRaw);

  const debtCeiling = calcDebtCeiling(dex?.liquidityUsd ?? 0, financialRiskScore);
  const confidenceBand = calcConfidenceBand(dex, cg, dl);
  const dataFreshness = calcDataFreshness(dex, cg, dl);

  return {
    tokenSymbol: token.symbol,
    financialRiskScore,
    impactRiskScore,
    impactQualityScore,
    combinedScore,
    rating: scoreToRating(combinedScore),
    debtCeiling,
    confidenceBand,
    dataFreshness,
    subScores: { s1, s2, s3, s4, s5 },
    impactRiskTypes,
    computedAt: new Date().toISOString(),
  };
}
