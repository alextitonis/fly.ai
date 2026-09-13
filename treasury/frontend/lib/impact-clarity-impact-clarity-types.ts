// Impact Clarity Map — TypeScript types
// All types for the Impact Clarity Map + onboarding system

// ─── Status & Visual Types ──────────────────────────────────────────────────

export type ClarityStatus = "green" | "amber" | "red";

export type VisualAnchorType =
  | "counter-map"
  | "portfolio-grid"
  | "planting-map-funnel"
  | "flywheel"
  | "flow-diagram"
  | "regeneration-ledger";

// ─── EBF (Ecological Benefits Framework) ────────────────────────────────────

export interface EBFScores {
  air: number; // 0-1
  water: number; // 0-1
  soil: number; // 0-1
  biodiversity: number; // 0-1
  equity: number; // 0-1
  carbon: number; // 0-1
}

export type EBFPillar = keyof EBFScores;

export const EBF_PILLARS: EBFPillar[] = [
  "air",
  "water",
  "soil",
  "biodiversity",
  "equity",
  "carbon",
];

export const EBF_PILLAR_LABELS: Record<EBFPillar, string> = {
  air: "Air",
  water: "Water",
  soil: "Soil",
  biodiversity: "Biodiversity",
  equity: "Equity",
  carbon: "Carbon",
};

export const EBF_PILLAR_UNITS: Record<EBFPillar, string> = {
  air: "AQI improvement",
  water: "liters saved",
  soil: "hectares regenerated",
  biodiversity: "species protected",
  equity: "people supported",
  carbon: "tonnes CO2e",
};

// ─── Risk Scores ─────────────────────────────────────────────────────────────

export type DeFiSentinelRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";

export interface RiskScore {
  tokenSymbol: string;
  financialRiskScore: number; // 0-100, DeFi Sentinel S1-S5 weighted
  impactRiskScore: number; // 0-100, IMP/IRIS+ 10 risk types normalized
  impactQualityScore: number; // 0-100, EBF pillars equal-weighted
  combinedScore: number; // 0-100, 40/30/30 weighted
  rating: DeFiSentinelRating;
  debtCeiling: number; // USD, Gauntlet-style
  confidenceBand: number; // ±N points
  dataFreshness: DataFreshness;
  subScores: {
    s1: number;
    s2: number;
    s3: number;
    s4: number;
    s5: number;
  };
  impactRiskTypes: ImpactRiskTypeScore[];
  computedAt: string;
}

export function scoreToRating(score: number): DeFiSentinelRating {
  if (score >= 90) return "AAA";
  if (score >= 80) return "AA";
  if (score >= 70) return "A";
  if (score >= 60) return "BBB";
  if (score >= 50) return "BB";
  if (score >= 40) return "B";
  return "CCC";
}

// ─── Data Freshness ──────────────────────────────────────────────────────────

export type FreshnessStatus = "fresh" | "stale" | "degraded";

export interface DataFreshness {
  overall: FreshnessStatus;
  sources: {
    dexscreener: SourceFreshness;
    coingecko: SourceFreshness;
    defillama: SourceFreshness;
    searchx: SourceFreshness;
    onchain: SourceFreshness;
  };
}

export interface SourceFreshness {
  lastUpdated: string;
  ageMinutes: number;
  status: FreshnessStatus;
}

// ─── Risk Score Snapshot (daily, for 30-day trend) ──────────────────────────

export interface RiskScoreSnapshot {
  tokenSymbol: string;
  financialRiskScore: number;
  impactRiskScore: number;
  impactQualityScore: number;
  combinedScore: number;
  debtCeiling: number;
  confidenceBand: number;
  dataFreshnessStatus: string;
  snapshotDate: string;
}

// ─── IMP/IRIS+ Impact Risk Types ─────────────────────────────────────────────

export type ImpactRiskType =
  | "evidence"
  | "external"
  | "stakeholder_participation"
  | "drop_off"
  | "execution"
  | "unexpected_impact"
  | "inequity"
  | "efficiency"
  | "endurance"
  | "alignment";

export type ImpactRiskLevel = "low" | "medium" | "high";

export interface ImpactRiskTypeScore {
  type: ImpactRiskType;
  level: ImpactRiskLevel;
  numericScore: 1 | 2 | 3;
  rationale: string;
}

export const IMPACT_RISK_TYPES: { type: ImpactRiskType; label: string }[] = [
  { type: "evidence", label: "Evidence" },
  { type: "external", label: "External" },
  { type: "stakeholder_participation", label: "Stakeholder Participation" },
  { type: "drop_off", label: "Drop-off" },
  { type: "execution", label: "Execution" },
  { type: "unexpected_impact", label: "Unexpected Impact" },
  { type: "inequity", label: "Inequity" },
  { type: "efficiency", label: "Efficiency" },
  { type: "endurance", label: "Endurance" },
  { type: "alignment", label: "Alignment" },
];

// ─── Planetary Boundaries ────────────────────────────────────────────────────

export interface PlanetaryBoundaryMapping {
  climateChange: boolean;
  biosphereIntegrity: boolean;
  freshwaterUse: boolean;
  landSystemChange: boolean;
  atmosphericAerosols: boolean;
  socialFoundation: boolean;
}

// ─── Per-BUCKY EBF Metrics ───────────────────────────────────────────────────

export interface PerBuckyEBF {
  carbonPerBucky: { value: number | null; unit: "tonnes CO2e" };
  waterPerBucky: { value: number | null; unit: "liters saved" };
  soilPerBucky: { value: number | null; unit: "hectares regenerated" };
  biodiversityPerBucky: { value: number | null; unit: "species protected" };
  equityPerBucky: { value: number | null; unit: "people supported" };
  airPerBucky: { value: number | null; unit: "AQI improvement" };
}

// ─── EBF Snapshot (history for trend sparklines) ────────────────────────────

export interface EBFSnapshot {
  tokenSymbol: string;
  ebfScores: EBFScores;
  sdgsAddressed: number[];
  pbMapping: PlanetaryBoundaryMapping;
  confidence: "high" | "medium" | "low";
  source: "searchx" | "initial_baseline" | "manual";
  timestamp: string;
}

// ─── Geospatial Data ─────────────────────────────────────────────────────────

export interface GeospatialData {
  latitude: number | null;
  longitude: number | null;
  siteDescription: string;
  treeCoverLoss: number | null;
  treeCoverGain: number | null;
  deforestationAlerts: number | null;
  fireAlerts: number | null;
  forestCarbonDensity: number | null;
  landCoverClass: string | null;
}

// ─── Aggregate Impact ────────────────────────────────────────────────────────

export interface AggregateImpact {
  totalCO2e: number;
  totalHectares: number;
  totalPeople: number;
  totalBucky: number;
  projectCount: number;
  avgEBF: number;
}

// ─── EPA Equivalency Factors ─────────────────────────────────────────────────

export const EPA_FACTORS = {
  passengerVehicleYear: 4.6, // tCO2e per vehicle
  treeSeedling10yr: 0.06, // tCO2e per seedling
  homeElectricityYear: 8.0, // tCO2e per home
  gallonGasoline: 0.0089, // tCO2e per gallon
  mileDriven: 0.000404, // tCO2e per mile
} as const;

// ─── Impact Events ───────────────────────────────────────────────────────────

export interface ImpactEvent {
  id: number;
  eventType:
    | "onboarded"
    | "baseline_assessment"
    | "ebf_improvement"
    | "collateral_deposited"
    | "bucky_minted"
    | "new_submission"
    | "governance_proposal"
    | "goal_milestone"
    | "live_activity"
    | "risk_score_change";
  tokenSymbol: string | null;
  title: string;
  description: string | null;
  metadata: string | null;
  timestamp: string;
}

// ─── Community Goals ─────────────────────────────────────────────────────────

export interface CommunityGoal {
  id: number;
  goalType: "co2e_offset" | "hectares" | "bucky_supply" | "projects_onboarded";
  targetValue: number;
  currentValue: number;
  label: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

export interface ActivityFeedItem {
  id: number;
  eventType: string;
  title: string;
  description: string | null;
  txHash: string | null;
  walletAddress: string | null;
  impactValue: number | null;
  timestamp: string;
}

// ─── Personal Wallet Impact ──────────────────────────────────────────────────

export interface WalletImpact {
  buckyBalance: number;
  co2eOffset: number;
  hectaresSupported: number;
  peopleSupported: number;
  personalEBF: EBFScores;
  holderRank: number | null;
  totalHolders: number | null;
  percentile: number | null;
  transactionHistory: WalletTransaction[];
}

export interface WalletTransaction {
  txHash: string;
  type: "mint" | "burn" | "transfer_in" | "transfer_out";
  amount: number;
  impactValue: number | null;
  timestamp: string;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingSubmission {
  id: number;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  website: string;
  description: string;
  impactCategory: string;
  projectLocation: string | null;
  contactEmail: string;
  communityEngagement: "low" | "medium" | "high";
  operationalMonths: number;
  status: "pending" | "evaluating" | "completed" | "rejected";
  aiEvaluation: OnboardingAIEvaluation | null;
  submittedAt: string;
  evaluatedAt: string | null;
}

export interface OnboardingAIEvaluation {
  ebfScores: EBFScores;
  confidence: "high" | "medium" | "low";
  negativeExternalities: string[];
  rationalePerPillar: Record<EBFPillar, string>;
  financialRiskScore: number;
  impactRiskScore: number;
  impactQualityScore: number;
  combinedScore: number;
  recommendation: "approve" | "watchlist" | "reject";
}

// ─── 5-Layer Matrix ──────────────────────────────────────────────────────────

export interface MatrixLayer {
  layer: 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
  clarityStatus: ClarityStatus;
}

export interface ImpactProject {
  tokenSymbol: string;
  tokenName: string;
  layers: MatrixLayer[];
  riskScore: RiskScore | null;
  ebfScores: EBFScores | null;
  ebfBaseline: EBFScores | null;
  ebfHistory: EBFSnapshot[];
  sdgsAddressed: number[];
  pbMapping: PlanetaryBoundaryMapping | null;
  negativeExternalities: string[];
  confidence: "high" | "medium" | "low";
  geospatial: GeospatialData | null;
  onboardingStatus: string | null;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardHolder {
  rank: number;
  address: string;
  ensName: string | null;
  buckyBalance: number;
  co2eBacked: number;
  hectaresBacked: number;
  isYou?: boolean;
}

export interface LeaderboardProject {
  rank: number;
  tokenSymbol: string;
  tokenName: string;
  ebfScoreDelta: number;
  bestPillar: EBFPillar | null;
  trend: "improving" | "stable" | "declining";
}

export interface LeaderboardContributor {
  rank: number;
  address: string;
  ensName: string | null;
  activityScore: number;
  proposals: number;
  assessments: number;
  isYou?: boolean;
}

// ─── Risk Weights Config ────────────────────────────────────────────────────

export interface RiskWeightConfig {
  dimension: string;
  weight: number;
  minBound: number | null;
  maxBound: number | null;
  label: string;
  framework: string;
}

// ─── Treasury Composition ────────────────────────────────────────────────────

export interface TreasuryHolding {
  tokenSymbol: string;
  tokenName: string;
  balance: number;
  usdValue: number;
  percentage: number;
}

export interface TreasuryComposition {
  totalValue: number;
  holdings: TreasuryHolding[];
  diversificationScore: number;
  collateralizationRatio: number;
}
