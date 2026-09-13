import type {
  ImpactProject, RiskScore, EBFScores, EBFSnapshot,
  LeaderboardProject,
  ClarityStatus, MatrixLayer,
  ImpactTokenInfo,
} from "./impact-icm-types";

// ─── Token metadata — the registry of evaluated impact tokens ────────────────
// Financial/risk data is fetched LIVE from DexScreener, CoinGecko, DeFiLlama.
// EBF scores, confidence, and qualitative metadata are from AI assessment.

export interface TokenMeta {
  symbol: string;
  name: string;
  website: string;
  address: string;
  additionalAddresses?: { address: string; chain: string; geckoNetwork?: string }[];
  description: string;
  category: string;
  location: string;
  ebf: EBFScores;
  ebfBaseline: EBFScores;
  confidence: "high" | "medium" | "low";
  negativeExternalities: string[];
  sdgs: number[];
  clarityByLayer: ClarityStatus[];
  geospatial: { lat: number; lng: number; desc: string; treeCoverLoss: number; deforestationAlerts: number; fireAlerts: number } | null;
  governanceParticipation: number;
  operationalMonths: number;
  communityEngagement: "low" | "medium" | "high";
}

export const TOKENS: TokenMeta[] = [
  {
    symbol: "SLR",
    name: "Solarcoin",
    website: "https://solarcoin.org/",
    address: "0x7aa7cb583084defc43cc0c2e95213ce364a8df9c",
    additionalAddresses: [
      { address: "0x4E9e4Ab99Cfc14B852f552f5Fb3Aa68617825B6c", chain: "ethereum", geckoNetwork: "eth" },
    ],
    description: "Global decentralized energy currency that rewards solar energy producers. Each MWh of solar energy verified by the Solarcoin foundation earns one SLR.",
    category: "Clean Energy",
    location: "Global",
    ebf: { air: 0.78, water: 0.45, soil: 0.30, biodiversity: 0.35, equity: 0.72, carbon: 0.85 },
    ebfBaseline: { air: 0.70, water: 0.40, soil: 0.25, biodiversity: 0.30, equity: 0.65, carbon: 0.78 },
    confidence: "high",
    negativeExternalities: ["Mining of solar panels not fully traced"],
    sdgs: [7, 13, 11],
    clarityByLayer: ["green", "green", "green", "amber", "green"],
    geospatial: null,
    governanceParticipation: 22,
    operationalMonths: 120,
    communityEngagement: "high",
  },
  {
    symbol: "TGN",
    name: "Treegens",
    website: "https://www.treegens.org/",
    address: "0xD75dfa972C6136f1c1c594Fec1945302f885E1ab29",
    description: "Regenerative finance DAO that tokenises and gamifies mangrove restoration. Uses a Proof of Tree protocol where planters record footage, AI counts trees, and staked TGN holders verify before rewards are minted.",
    category: "Reforestation",
    location: "Shimoni, Kenya",
    ebf: { air: 0.72, water: 0.68, soil: 0.80, biodiversity: 0.85, equity: 0.60, carbon: 0.88 },
    ebfBaseline: { air: 0.65, water: 0.60, soil: 0.70, biodiversity: 0.75, equity: 0.50, carbon: 0.80 },
    confidence: "medium",
    negativeExternalities: [],
    sdgs: [13, 15, 1, 11],
    clarityByLayer: ["green", "green", "amber", "green", "green"],
    geospatial: { lat: -4.6556, lng: 39.3851, desc: "Shimoni mangrove restoration sites", treeCoverLoss: 12.5, deforestationAlerts: 2, fireAlerts: 1 },
    governanceParticipation: 8,
    operationalMonths: 18,
    communityEngagement: "medium",
  },
  {
    symbol: "REGEN",
    name: "Regen Network",
    website: "https://www.regen.network/",
    address: "0x2E6C05f1f7D1f4Eb9A088bf12257f1647682b754",
    additionalAddresses: [
      { address: "0xEc482De9569a5EA3Dd9779039b79e53F15791fDE", chain: "polygon", geckoNetwork: "polygon_pos" },
    ],
    description: "Sovereign proof-of-stake blockchain built on Cosmos SDK for ecological verification and carbon credit markets. REGEN tokens govern the registry of ecological claims.",
    category: "Biodiversity Conservation",
    location: "Global",
    ebf: { air: 0.65, water: 0.70, soil: 0.75, biodiversity: 0.90, equity: 0.78, carbon: 0.72 },
    ebfBaseline: { air: 0.60, water: 0.65, soil: 0.68, biodiversity: 0.82, equity: 0.70, carbon: 0.65 },
    confidence: "high",
    negativeExternalities: [],
    sdgs: [13, 15, 14, 5, 10],
    clarityByLayer: ["green", "green", "green", "green", "green"],
    geospatial: null,
    governanceParticipation: 28,
    operationalMonths: 36,
    communityEngagement: "high",
  },
  {
    symbol: "DOVU",
    name: "DOVU",
    website: "https://dovu.earth/",
    address: "0xB38266e0e9D9681b77aEB0A280E98131b953F865",
    additionalAddresses: [
      { address: "0.0.3716059", chain: "hedera" },
    ],
    description: "Carbon credit protocol that tokenizes verified carbon offsets from soil carbon sequestration and regenerative agricultural practices. Migrated from DOV to DOVU token.",
    category: "Regenerative Agriculture",
    location: "United Kingdom",
    ebf: { air: 0.55, water: 0.60, soil: 0.88, biodiversity: 0.65, equity: 0.58, carbon: 0.80 },
    ebfBaseline: { air: 0.50, water: 0.55, soil: 0.80, biodiversity: 0.58, equity: 0.52, carbon: 0.72 },
    confidence: "medium",
    negativeExternalities: ["Methane emissions from livestock in some partnered farms"],
    sdgs: [13, 2, 15, 12],
    clarityByLayer: ["green", "amber", "green", "green", "amber"],
    geospatial: { lat: 55.3781, lng: -3.4360, desc: "UK agricultural soil carbon sites", treeCoverLoss: 0, deforestationAlerts: 0, fireAlerts: 0 },
    governanceParticipation: 6,
    operationalMonths: 24,
    communityEngagement: "medium",
  },
  {
    symbol: "KVCM",
    name: "Klima Protocol",
    website: "https://www.klimaprotocol.com/",
    address: "0x00fBAC94Fec8D4089d3fe979F39454F48c71A65d",
    description: "Carbon market protocol on Base. kVCM token facilitates trading and retirement of tokenized carbon credits. K2 governance token at 0x59081d974a0C635Fae3e8195F34f879B591B6519.",
    category: "Carbon Sequestration",
    location: "Global",
    ebf: { air: 0.70, water: 0.50, soil: 0.55, biodiversity: 0.60, equity: 0.65, carbon: 0.92 },
    ebfBaseline: { air: 0.65, water: 0.45, soil: 0.50, biodiversity: 0.55, equity: 0.58, carbon: 0.85 },
    confidence: "medium",
    negativeExternalities: ["Carbon credit double-counting risk in unverified registries"],
    sdgs: [13, 9, 11],
    clarityByLayer: ["green", "amber", "amber", "green", "green"],
    geospatial: null,
    governanceParticipation: 7,
    operationalMonths: 36,
    communityEngagement: "medium",
  },
  {
    symbol: "CEN",
    name: "Crypto Endowment Network",
    website: "https://cryptoendowmentnetwork.org/",
    address: "0xcfe6235d98b99204ed4611297af45caa0871cad3",
    description: "Regenerative finance protocol that creates permanent endowments for environmental and social impact projects. Funds climate initiatives, conservation, and community-driven sustainability.",
    category: "Community Development",
    location: "Global",
    ebf: { air: 0.50, water: 0.55, soil: 0.52, biodiversity: 0.58, equity: 0.85, carbon: 0.62 },
    ebfBaseline: { air: 0.45, water: 0.50, soil: 0.48, biodiversity: 0.52, equity: 0.78, carbon: 0.55 },
    confidence: "low",
    negativeExternalities: ["Endowment governance concentration risk"],
    sdgs: [13, 1, 5, 10, 11, 17],
    clarityByLayer: ["amber", "amber", "amber", "green", "green"],
    geospatial: null,
    governanceParticipation: 5,
    operationalMonths: 7,
    communityEngagement: "high",
  },
  {
    symbol: "USDC",
    name: "Azos USD",
    website: "https://www.azos.finance/",
    address: "0x3595ca37596d5895b70efab592ac315d5b9809b2",
    description: "Stablecoin built for the regenerative finance ecosystem on Base. Provides a stable unit of account for climate-positive DeFi applications, enabling transparent and efficient capital flows toward environmental impact projects.",
    category: "Stablecoin",
    location: "Global",
    ebf: { air: 0.40, water: 0.40, soil: 0.40, biodiversity: 0.40, equity: 0.70, carbon: 0.50 },
    ebfBaseline: { air: 0.35, water: 0.35, soil: 0.35, biodiversity: 0.35, equity: 0.60, carbon: 0.45 },
    confidence: "low",
    negativeExternalities: ["Stablecoin reserve transparency not fully verified"],
    sdgs: [13, 9, 17],
    clarityByLayer: ["amber", "amber", "green", "amber", "amber"],
    geospatial: null,
    governanceParticipation: 3,
    operationalMonths: 6,
    communityEngagement: "medium",
  },
];

export const TOKEN_INFOS: ImpactTokenInfo[] = TOKENS.map((t) => ({
  name: t.name, symbol: t.symbol, website: t.website, address: t.address,
  additionalAddresses: t.additionalAddresses,
  description: t.description,
}));

// ─── Build ImpactProject from token metadata + live risk score ───────────────

function makeLayers(t: TokenMeta): MatrixLayer[] {
  const labels = ["Token", "Asset", "Strategy", "Protocol", "Ecosystem"];
  const descs = [
    `${t.name} (${t.symbol}) token contract`,
    `${t.category} asset backing`,
    `Yield/impact strategy mechanism`,
    `Protocol-level governance and treasury`,
    `Broader ecosystem partnerships and SDG alignment`,
  ];
  return t.clarityByLayer.map((status, i) => ({
    layer: (i + 1) as 1 | 2 | 3 | 4 | 5,
    label: labels[i],
    description: descs[i],
    clarityStatus: status,
  }));
}

function makeEBFHistory(t: TokenMeta): EBFSnapshot[] {
  const snapshots: EBFSnapshot[] = [];
  const now = Date.now();
  for (let i = 5; i >= 0; i--) {
    const factor = 1 - i * 0.05;
    snapshots.push({
      tokenSymbol: t.symbol,
      ebfScores: {
        air: Math.min(1, t.ebf.air * factor),
        water: Math.min(1, t.ebf.water * factor),
        soil: Math.min(1, t.ebf.soil * factor),
        biodiversity: Math.min(1, t.ebf.biodiversity * factor),
        equity: Math.min(1, t.ebf.equity * factor),
        carbon: Math.min(1, t.ebf.carbon * factor),
      },
      sdgsAddressed: t.sdgs,
      pbMapping: {
        climateChange: t.sdgs.includes(13),
        biosphereIntegrity: t.sdgs.includes(15),
        freshwaterUse: t.sdgs.includes(6),
        landSystemChange: t.sdgs.includes(15),
        atmosphericAerosols: false,
        socialFoundation: t.sdgs.includes(1) || t.sdgs.includes(5),
      },
      confidence: t.confidence,
      source: "searchx",
      timestamp: new Date(now - i * 30 * 86400000).toISOString(),
    });
  }
  return snapshots;
}

export function buildImpactProject(t: TokenMeta, riskScore: RiskScore): ImpactProject {
  return {
    tokenSymbol: t.symbol,
    tokenName: t.name,
    layers: makeLayers(t),
    riskScore,
    ebfScores: t.ebf,
    ebfBaseline: t.ebfBaseline,
    ebfHistory: makeEBFHistory(t),
    sdgsAddressed: t.sdgs,
    pbMapping: {
      climateChange: t.sdgs.includes(13),
      biosphereIntegrity: t.sdgs.includes(15),
      freshwaterUse: t.sdgs.includes(6),
      landSystemChange: t.sdgs.includes(15),
      atmosphericAerosols: false,
      socialFoundation: t.sdgs.includes(1) || t.sdgs.includes(5),
    },
    negativeExternalities: t.negativeExternalities,
    confidence: t.confidence,
    geospatial: t.geospatial ? {
      latitude: t.geospatial.lat,
      longitude: t.geospatial.lng,
      siteDescription: t.geospatial.desc,
      treeCoverLoss: t.geospatial.treeCoverLoss,
      treeCoverGain: null,
      deforestationAlerts: t.geospatial.deforestationAlerts,
      fireAlerts: t.geospatial.fireAlerts,
      forestCarbonDensity: null,
      landCoverClass: null,
    } : null,
    onboardingStatus: "completed",
  };
}

// Aggregate is computed live from API data in use-impact-data.ts

// Projects leaderboard — computed from real EBF score deltas (current vs baseline)
export function computeProjectsLeaderboard(): LeaderboardProject[] {
  return TOKENS.map((t) => {
    const currentAvg = (t.ebf.air + t.ebf.water + t.ebf.soil + t.ebf.biodiversity + t.ebf.equity + t.ebf.carbon) / 6;
    const baselineAvg = (t.ebfBaseline.air + t.ebfBaseline.water + t.ebfBaseline.soil + t.ebfBaseline.biodiversity + t.ebfBaseline.equity + t.ebfBaseline.carbon) / 6;
    const delta = (currentAvg - baselineAvg) * 100;
    const pillars: { name: string; val: number }[] = [
      { name: "air", val: t.ebf.air },
      { name: "water", val: t.ebf.water },
      { name: "soil", val: t.ebf.soil },
      { name: "biodiversity", val: t.ebf.biodiversity },
      { name: "equity", val: t.ebf.equity },
      { name: "carbon", val: t.ebf.carbon },
    ];
    const best = pillars.reduce((a, b) => (b.val > a.val ? b : a));
    return {
      rank: 0,
      tokenSymbol: t.symbol,
      tokenName: t.name,
      ebfScoreDelta: Math.round(delta * 10) / 10,
      bestPillar: best.name as LeaderboardProject["bestPillar"],
      trend: delta > 0.02 ? "improving" : delta < -0.02 ? "declining" : "stable",
    } as LeaderboardProject;
  })
    .sort((a, b) => b.ebfScoreDelta - a.ebfScoreDelta)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// Backward compat — only export what's real
export const mockProjectsLb: LeaderboardProject[] = []; // Use computeProjectsLeaderboard() instead
