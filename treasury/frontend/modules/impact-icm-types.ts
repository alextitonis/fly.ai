// Impact Clarity Map — shared types
// Ported from the frontend types, standalone for this app

export type ClarityStatus = "green" | "amber" | "red";

export interface EBFScores {
  air: number;
  water: number;
  soil: number;
  biodiversity: number;
  equity: number;
  carbon: number;
}

export type EBFPillar = keyof EBFScores;

export const EBF_PILLARS: EBFPillar[] = ["air", "water", "soil", "biodiversity", "equity", "carbon"];

export const EBF_PILLAR_LABELS: Record<EBFPillar, string> = {
  air: "Air",
  water: "Water",
  soil: "Soil",
  biodiversity: "Biodiversity",
  equity: "Equity",
  carbon: "Carbon",
};

export const EBF_PILLAR_COLORS: Record<EBFPillar, string> = {
  air: "#06b6d4",
  water: "#3b82f6",
  soil: "#a16207",
  biodiversity: "#22c55e",
  equity: "#ec4899",
  carbon: "#10b981",
};

export type DeFiSentinelRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";

export function scoreToRating(score: number): DeFiSentinelRating {
  if (score >= 90) return "AAA";
  if (score >= 80) return "AA";
  if (score >= 70) return "A";
  if (score >= 60) return "BBB";
  if (score >= 50) return "BB";
  if (score >= 40) return "B";
  return "CCC";
}

export function ratingColor(rating: DeFiSentinelRating): string {
  if (rating.startsWith("AA") || rating === "AAA") return "#22c55e";
  if (rating.startsWith("A") || rating.startsWith("BBB")) return "#06b6d4";
  if (rating.startsWith("BB") || rating.startsWith("B")) return "#f59e0b";
  return "#ef4444";
}

export type FreshnessStatus = "fresh" | "stale" | "degraded";

export interface DataFreshness {
  overall: FreshnessStatus;
  sources: Record<string, { lastUpdated: string; ageMinutes: number; status: FreshnessStatus }>;
}

export interface RiskScore {
  tokenSymbol: string;
  financialRiskScore: number;
  impactRiskScore: number;
  impactQualityScore: number;
  combinedScore: number;
  rating: DeFiSentinelRating;
  debtCeiling: number;
  confidenceBand: number;
  dataFreshness: DataFreshness;
  subScores: { s1: number; s2: number; s3: number; s4: number; s5: number };
  impactRiskTypes: { type: string; level: "low" | "medium" | "high"; numericScore: 1 | 2 | 3; rationale: string }[];
  computedAt: string;
}

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

export type ImpactRiskType =
  | "evidence" | "external" | "stakeholder_participation" | "drop_off"
  | "execution" | "unexpected_impact" | "inequity" | "efficiency"
  | "endurance" | "alignment";

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

export interface PlanetaryBoundaryMapping {
  climateChange: boolean;
  biosphereIntegrity: boolean;
  freshwaterUse: boolean;
  landSystemChange: boolean;
  atmosphericAerosols: boolean;
  socialFoundation: boolean;
}

export interface EBFSnapshot {
  tokenSymbol: string;
  ebfScores: EBFScores;
  sdgsAddressed: number[];
  pbMapping: PlanetaryBoundaryMapping;
  confidence: "high" | "medium" | "low";
  source: string;
  timestamp: string;
}

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

export interface AggregateImpact {
  totalLiquidity: number;
  totalMarketCap: number;
  totalVolume24h: number;
  projectCount: number;
  avgEBF: number;
  avgCombinedScore: number;
}

// ─── Scoring methodology metadata ────────────────────────────────────────────

export interface EBFPillarMethodology {
  pillar: EBFPillar;
  label: string;
  description: string;
  scoringCriteria: string[];
  dataSource: string;
  scale: string;
}

export const EBF_METHODOLOGY: EBFPillarMethodology[] = [
  {
    pillar: "air",
    label: "Air Quality",
    description: "Measures impact on atmospheric composition — reduction of pollutants, particulate matter, and greenhouse gas emissions that affect air quality.",
    scoringCriteria: [
      "0.0-0.3: No measurable air quality impact",
      "0.3-0.6: Indirect air quality benefits (e.g., displaced fossil fuel use)",
      "0.6-0.8: Direct, verified air quality improvements",
      "0.8-1.0: Significant, independently verified atmospheric impact",
    ],
    dataSource: "AI assessment from project documentation, verified emissions data, and third-party air quality monitoring",
    scale: "0.0 (no impact) to 1.0 (maximum positive impact)",
  },
  {
    pillar: "water",
    label: "Water Conservation",
    description: "Evaluates impact on freshwater systems — water saved, protected, or restored, including watershed health and water quality improvements.",
    scoringCriteria: [
      "0.0-0.3: No measurable water impact",
      "0.3-0.6: Indirect water benefits (e.g., reduced agricultural runoff)",
      "0.6-0.8: Direct, verified water conservation or restoration",
      "0.8-1.0: Significant, independently verified water system impact",
    ],
    dataSource: "AI assessment from project documentation, watershed data, and water quality monitoring reports",
    scale: "0.0 (no impact) to 1.0 (maximum positive impact)",
  },
  {
    pillar: "soil",
    label: "Soil Health",
    description: "Assesses impact on soil quality — carbon sequestration in soil, regenerative agricultural practices, erosion prevention, and soil biodiversity.",
    scoringCriteria: [
      "0.0-0.3: No measurable soil impact",
      "0.3-0.6: Indirect soil benefits (e.g., reduced chemical inputs)",
      "0.6-0.8: Direct, verified soil health improvements",
      "0.8-1.0: Significant, independently verified soil regeneration",
    ],
    dataSource: "AI assessment from soil carbon measurements, agricultural practice documentation, and regenerative farming verification",
    scale: "0.0 (no impact) to 1.0 (maximum positive impact)",
  },
  {
    pillar: "biodiversity",
    label: "Biodiversity",
    description: "Measures impact on biological diversity — habitat restoration, species protection, ecosystem services, and biodiversity conservation outcomes.",
    scoringCriteria: [
      "0.0-0.3: No measurable biodiversity impact",
      "0.3-0.6: Indirect biodiversity benefits (e.g., habitat preservation)",
      "0.6-0.8: Direct, verified biodiversity improvements with species monitoring",
      "0.8-1.0: Significant, independently verified ecosystem restoration",
    ],
    dataSource: "AI assessment from biodiversity surveys, species population data, habitat mapping, and conservation verification reports",
    scale: "0.0 (no impact) to 1.0 (maximum positive impact)",
  },
  {
    pillar: "equity",
    label: "Social Equity",
    description: "Evaluates social impact — community engagement, fair benefit distribution, indigenous rights, gender equity, and local economic empowerment.",
    scoringCriteria: [
      "0.0-0.3: No measurable equity impact or community engagement",
      "0.3-0.6: Some community benefits, limited participation",
      "0.6-0.8: Strong community engagement, fair benefit distribution",
      "0.8-1.0: Exemplary equity practices, verified community ownership and benefit sharing",
    ],
    dataSource: "AI assessment from community engagement documentation, benefit distribution records, stakeholder interviews, and governance participation data",
    scale: "0.0 (no impact) to 1.0 (maximum positive impact)",
  },
  {
    pillar: "carbon",
    label: "Carbon Sequestration",
    description: "Measures carbon impact — CO₂e sequestered, avoided emissions, carbon credit verification, and long-term carbon storage reliability.",
    scoringCriteria: [
      "0.0-0.3: No measurable carbon impact",
      "0.3-0.6: Indirect carbon benefits (e.g., displaced fossil fuels)",
      "0.6-0.8: Direct, verified carbon sequestration with third-party validation",
      "0.8-1.0: Significant, independently verified carbon impact with durable storage",
    ],
    dataSource: "AI assessment from carbon credit registries, emissions verification data, sequestration measurements, and third-party audit reports",
    scale: "0.0 (no impact) to 1.0 (maximum positive impact)",
  },
];

export interface SentinelSubScoreMethodology {
  code: string;
  name: string;
  description: string;
  formula: string;
  inputs: { label: string; source: string }[];
  weight: number;
}

export const SENTINEL_METHODOLOGY: SentinelSubScoreMethodology[] = [
  {
    code: "S1",
    name: "Smart Contract Risk",
    description: "Evaluates the technical security of the token's smart contracts, focusing on liquidity depth and pair maturity.",
    formula: "S1 = (LiquidityScore × 0.6) + (PairAgeScore × 0.4)",
    inputs: [
      { label: "Liquidity (USD)", source: "DexScreener — normalized linearly from $10K (0) to $5M (100)" },
      { label: "Pair Age (days)", source: "DexScreener — normalized linearly from 30d (0) to 730d (100)" },
    ],
    weight: 0.25,
  },
  {
    code: "S2",
    name: "Economic Risk",
    description: "Assesses economic sustainability through slippage, supply distribution, and intraday volatility.",
    formula: "S2 = (SlippageScore × 0.4) + (SupplyDistScore × 0.35) + (VolatilityScore × 0.25)",
    inputs: [
      { label: "Slippage", source: "DexScreener — estimated from volume/liquidity ratio, normalized inversely (higher slippage = lower score)" },
      { label: "Supply Distribution", source: "CoinGecko — circulating/total supply ratio, normalized from 0.3 (0) to 0.9 (100)" },
      { label: "Intraday Volatility", source: "DexScreener — |1h price change|, normalized inversely from 0% (100) to 15% (0)" },
    ],
    weight: 0.25,
  },
  {
    code: "S3",
    name: "Governance Risk",
    description: "Evaluates governance health through participation rate and operational history.",
    formula: "S3 = (GovernanceParticipationScore × 0.5) + (OperationalHistoryScore × 0.5)",
    inputs: [
      { label: "Governance Participation (%)", source: "On-chain governance data — normalized from 1% (0) to 30% (100)" },
      { label: "Operational Months", source: "Project documentation — normalized from 1mo (0) to 120mo (100)" },
    ],
    weight: 0.15,
  },
  {
    code: "S4",
    name: "Sustainability Risk",
    description: "Assesses long-term sustainability through price volatility, TVL trends, and liquidity depth.",
    formula: "S4 = (VolatilityScore × 0.4) + (TVLTrendScore × 0.35) + (LiquidityScore × 0.25)",
    inputs: [
      { label: "30d Price Volatility", source: "CoinGecko — |30d price change|, normalized inversely from 0% (100) to 100% (0)" },
      { label: "TVL 30d Change", source: "DeFiLlama — normalized linearly from -50% (0) to +50% (100)" },
      { label: "Liquidity (USD)", source: "DexScreener — normalized linearly from $10K (0) to $5M (100)" },
    ],
    weight: 0.20,
  },
  {
    code: "S5",
    name: "Reputation Risk",
    description: "Evaluates market reputation through ATH drawdown, time since ATH, and negative externalities.",
    formula: "S5 = (ATHDrawdownScore × 0.35) + (TimeSinceATHScore × 0.30) + (ExternalityScore × 0.35)",
    inputs: [
      { label: "ATH Drawdown (%)", source: "CoinGecko — (ATH - currentPrice) / ATH, normalized inversely from 0% (100) to 100% (0)" },
      { label: "Time Since ATH (days)", source: "CoinGecko — normalized inversely from 30d (100) to 1095d (0)" },
      { label: "Negative Externalities", source: "AI assessment — 0 externalities = 90, 1 = 60, 2+ = 30" },
    ],
    weight: 0.15,
  },
];

export const SENTINEL_FORMULA = "Financial Risk Score = (S1 × 0.25) + (S2 × 0.25) + (S3 × 0.15) + (S4 × 0.20) + (S5 × 0.15)";

export interface IRISRiskTypeMethodology {
  type: string;
  label: string;
  description: string;
  scoringCriteria: { level: "low" | "medium" | "high"; score: 1 | 2 | 3; condition: string }[];
}

export const IRIS_METHODOLOGY: IRISRiskTypeMethodology[] = [
  {
    type: "evidence",
    label: "Evidence Risk",
    description: "Risk that the impact data is inaccurate or insufficient. Based on confidence level and data age.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "High confidence, data age < 30 days" },
      { level: "medium", score: 2, condition: "Medium confidence, data age 30-90 days" },
      { level: "high", score: 3, condition: "Low confidence, data age > 90 days" },
    ],
  },
  {
    type: "external",
    label: "External Risk",
    description: "Risk from external events that could undermine the impact. Based on Global Forest Watch alerts.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "0 GFW deforestation/fire alerts" },
      { level: "medium", score: 2, condition: "1-5 GFW alerts near project site" },
      { level: "high", score: 3, condition: ">5 GFW alerts or critical environmental events" },
    ],
  },
  {
    type: "stakeholder_participation",
    label: "Stakeholder Participation",
    description: "Risk that stakeholders are not adequately engaged. Based on community engagement level.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "High community engagement with documented participation" },
      { level: "medium", score: 2, condition: "Medium community engagement" },
      { level: "high", score: 3, condition: "Low or no community engagement" },
    ],
  },
  {
    type: "drop_off",
    label: "Drop-off Risk",
    description: "Risk that the impact will not persist. Based on EBF trend analysis (current vs baseline).",
    scoringCriteria: [
      { level: "low", score: 1, condition: "EBF scores improving or stable over time" },
      { level: "medium", score: 2, condition: "EBF scores declining slightly" },
      { level: "high", score: 3, condition: "EBF scores declining significantly" },
    ],
  },
  {
    type: "execution",
    label: "Execution Risk",
    description: "Risk that the project will not execute its impact plan. Based on operational history.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "24+ months operational with consistent execution" },
      { level: "medium", score: 2, condition: "6-24 months operational" },
      { level: "high", score: 3, condition: "<6 months operational or execution gaps" },
    ],
  },
  {
    type: "unexpected_impact",
    label: "Unexpected Impact Risk",
    description: "Risk of unintended negative consequences. Based on identified negative externalities.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "0 negative externalities identified" },
      { level: "medium", score: 2, condition: "1 negative externality identified" },
      { level: "high", score: 3, condition: "2+ negative externalities identified" },
    ],
  },
  {
    type: "inequity",
    label: "Inequity Risk",
    description: "Risk that benefits are distributed inequitably. Based on EBF Equity pillar score.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "EBF Equity score ≥ 0.70" },
      { level: "medium", score: 2, condition: "EBF Equity score 0.50-0.69" },
      { level: "high", score: 3, condition: "EBF Equity score < 0.50" },
    ],
  },
  {
    type: "efficiency",
    label: "Efficiency Risk",
    description: "Risk that the impact is not efficient relative to resources. Based on average EBF score.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "Average EBF ≥ 0.70" },
      { level: "medium", score: 2, condition: "Average EBF 0.50-0.69" },
      { level: "high", score: 3, condition: "Average EBF < 0.50" },
    ],
  },
  {
    type: "endurance",
    label: "Endurance Risk",
    description: "Risk that the impact will not endure over time. Based on operational history and EBF trend.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "24+ months operational with improving EBF" },
      { level: "medium", score: 2, condition: "6-24 months or stable EBF" },
      { level: "high", score: 3, condition: "<6 months with declining EBF" },
    ],
  },
  {
    type: "alignment",
    label: "Alignment Risk",
    description: "Risk that the impact is not aligned with stated goals. Based on governance participation.",
    scoringCriteria: [
      { level: "low", score: 1, condition: "Governance participation ≥ 15%" },
      { level: "medium", score: 2, condition: "Governance participation 5-14%" },
      { level: "high", score: 3, condition: "Governance participation < 5%" },
    ],
  },
];

export const IRIS_FORMULA = "Impact Risk Score = ((4 - Average(numericScore)) / 3) × 100";
export const COMBINED_FORMULA = "Combined Score = (Financial Risk × 0.40) + (Impact Risk × 0.30) + (Impact Quality × 0.30)";
export const DEBT_CEILING_FORMULA = "Debt Ceiling = (Liquidity / 2) × √(Liquidity × 0.5 / 1M) × (1 - FinancialRisk × 0.3)";

export interface ImpactEvent {
  id: number;
  eventType: string;
  tokenSymbol: string | null;
  title: string;
  description: string | null;
  metadata: string | null;
  timestamp: string;
}

export interface CommunityGoal {
  id: number;
  goalType: string;
  targetValue: number;
  currentValue: number;
  label: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
}

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

export interface TreasuryComposition {
  totalValue: number;
  holdings: { tokenSymbol: string; tokenName: string; balance: number; usdValue: number; percentage: number }[];
  diversificationScore: number;
  collateralizationRatio: number;
}

export interface WalletImpact {
  buckyBalance: number;
  co2eOffset: number;
  hectaresSupported: number;
  peopleSupported: number;
  personalEBF: EBFScores;
  holderRank: number | null;
  totalHolders: number | null;
  percentile: number | null;
}

// Known impact tokens (from shit.finance)
export interface ImpactTokenInfo {
  name: string;
  symbol: string;
  website: string;
  address: string;
  additionalAddresses?: { address: string; chain: string; geckoNetwork?: string }[];
  description: string;
}

export const IMPACT_TOKENS: ImpactTokenInfo[] = [
  { name: "Solarcoin", symbol: "SLR", website: "https://solarcoin.org/", address: "0x7aa7cb583084defc43cc0c2e95213ce364a8df9c", description: "Global decentralized energy currency rewarding solar energy producers." },
  { name: "Treegens", symbol: "TGN", website: "https://treegens.app/", address: "0xD75dfa972C6136f1c594Fec1945302f885E1ab29", description: "Reforestation and mangrove restoration DAO with Proof of Tree protocol." },
  { name: "Regen Network", symbol: "REGEN", website: "https://www.regen.network/", address: "0x2e6c05f1f7d1f4eb9a088bf12257f1647682b754", description: "Ecological verification and carbon credit markets on Cosmos SDK." },
  { name: "DOVU", symbol: "DOVU", website: "https://dovu.earth/", address: "0xB38266e0e9D9681b77aEB0A280E98131b953F865", description: "Carbon credit protocol for soil carbon sequestration." },
  { name: "Klima Protocol", symbol: "KVCM", website: "https://www.klimaprotocol.com/", address: "0x00fBAC94Fec8D4089d3fe979F39454F48c71A65d", description: "Carbon market protocol on Base. kVCM token for tokenized carbon credits." },
  { name: "Crypto Endowment Network", symbol: "CEN", website: "https://cryptoendowmentnetwork.org/", address: "0xcfe6235d98b99204ed4611297af45caa0871cad3", description: "Permanent endowments for environmental impact projects." },
  { name: "Azos USD", symbol: "USDC", website: "https://www.azos.finance/", address: "0x3595ca37596d5895b70efab592ac315d5b9809b2", description: "Stablecoin for the regenerative finance ecosystem on Base." },
];
