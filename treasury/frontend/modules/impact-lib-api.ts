// API client for the Impact Clarity Map Worker
const API_BASE = import.meta.env.VITE_IMPACT_API_ENDPOINT || "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("API not configured");
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => apiFetch<{ status: string }>("/api/v1/health"),

  impactDashboard: () => apiFetch<{
    projects: import("./impact-icm-types").ImpactProject[];
    aggregate: import("./impact-icm-types").AggregateImpact;
    tokenData: Record<string, unknown>;
  }>("/api/v1/impact-dashboard"),

  impactProjects: () => apiFetch<import("./impact-icm-types").ImpactProject[]>("/api/v1/impact-projects"),
  aggregateImpact: () => apiFetch<import("./impact-icm-types").AggregateImpact>("/api/v1/aggregate-impact"),
  impactEvents: (limit = 20) => apiFetch<import("./impact-icm-types").ImpactEvent[]>(`/api/v1/impact-events?limit=${limit}`),
  activityFeed: (limit = 20) => apiFetch<import("./impact-icm-types").ActivityFeedItem[]>(`/api/v1/activity-feed?limit=${limit}`),
  communityGoals: () => apiFetch<import("./impact-icm-types").CommunityGoal[]>("/api/v1/community-goals"),
  treasuryComposition: () => apiFetch<import("./impact-icm-types").TreasuryComposition>("/api/v1/treasury-composition"),

  riskScores: (sym: string) => apiFetch<import("./impact-icm-types").RiskScore>(`/api/v1/risk-scores/${sym}`),
  riskHistory: (sym: string) => apiFetch<import("./impact-icm-types").RiskScoreSnapshot[]>(`/api/v1/risk-history/${sym}`),
  financialHistory: (sym: string, limit = 288) => apiFetch<Record<string, unknown>[]>(`/api/v1/financial-history/${sym}?limit=${limit}`),
  riskWeights: () => apiFetch<unknown[]>("/api/v1/risk-weights"),

  impactProgress: (sym: string) => apiFetch<import("./impact-icm-types").EBFSnapshot[]>(`/api/v1/impact-progress/${sym}`),
  ebfHistory: (sym: string) => apiFetch<import("./impact-icm-types").EBFSnapshot[]>(`/api/v1/ebf-history/${sym}`),
  geospatial: (sym: string) => apiFetch<import("./impact-icm-types").GeospatialData>(`/api/v1/geospatial/${sym}`),

  leaderboardHolders: () => apiFetch<import("./impact-icm-types").LeaderboardHolder[]>("/api/v1/leaderboard/holders"),
  leaderboardProjects: () => apiFetch<import("./impact-icm-types").LeaderboardProject[]>("/api/v1/leaderboard/projects"),
  leaderboardContributors: () => apiFetch<import("./impact-icm-types").LeaderboardContributor[]>("/api/v1/leaderboard/contributors"),

  submitOnboarding: (data: Record<string, unknown>) =>
    apiFetch<{ id: number }>("/api/v1/onboard/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  onboardingSubmissions: () => apiFetch<import("./impact-icm-types").OnboardingSubmission[]>("/api/v1/onboard/submissions"),
  onboardingSubmission: (id: number) => apiFetch<import("./impact-icm-types").OnboardingSubmission>(`/api/v1/onboard/submissions/${id}`),
};

export { API_BASE };
