import { useState, useMemo, useEffect } from "react";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { SectionWrapper, SectionHead, useScrollReveal } from "@/modules/shared-sections";
import { SHITLogo } from "@/components/shit-logo";

interface AirdropEntry { a: string; s: number; src: string[]; m: number; }

interface LeaderboardEntry {
  rank: number;
  address: string;
  score: number;
  sources: string[];
  sourceCount: number;
  multiplier: number;
  ensName: string | null;
  lensHandle: string | null;
  farcasterUsername: string | null;
  displayName: string | null;
  twitterHandle: string | null;
  farcasterFid: number | null;
  openrankScore: number | null;
  tokenUsdValue: number | null;
  givethTotalUsd: number | null;
  lensPostCount: number | null;
}

interface CategoryInfo {
  count: number;
  description: string;
}

interface TokenInfo {
  token: string;
  count: number;
  totalBalance: number;
}

interface CategoryData {
  categories: Record<string, CategoryInfo>;
  tokenBreakdown: TokenInfo[];
  tiers: Record<string, number>;
  scoreBuckets: { range: string; count: number }[];
  totalAddresses: number;
}

function parseLeaderboard(raw: { keys: string[]; data: unknown[][] }): LeaderboardEntry[] {
  return raw.data.map((row) => {
    const obj: Record<string, unknown> = {};
    raw.keys.forEach((k, i) => { obj[k] = row[i]; });
    return obj as unknown as LeaderboardEntry;
  });
}

const SOURCE_LABELS: Record<string, string> = {
  lens: "Lens", farcaster: "Farcaster", "token-holder": "Token Holder",
  octant: "Octant", giveth: "GivETH", gitcoin: "Gitcoin",
  artizen: "Artizen", "celo-pg": "Celo PG",
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  "token-holder": "Holders of regen/refi tokens across supported chains — addresses that hold verified impact tokens like SLR, TREE, REGEN, DOVU, KLIMA, or CEN.",
  "celo-pg": "Celo Public Goods — addresses that participated in Celo's public goods funding rounds and governance on the Celo blockchain.",
  lens: "Lens Protocol — addresses with an active Lens profile that engaged with regen/climate content on the decentralized social graph.",
  farcaster: "Farcaster — addresses with a Farcaster account that participated in climate and regen finance conversations on the decentralized social protocol.",
  giveth: "GivETH — donors who contributed verified public goods projects on the GivETH platform, supporting regenerative and impact-driven initiatives.",
  octant: "Octant — addresses that locked GLM tokens and participated in Octant's epoch-based public goods allocation rounds.",
  gitcoin: "Gitcoin — contributors and grantees who participated in Gitcoin's quadratic funding rounds for public goods and climate projects.",
  artizen: "Artizen — participants in the Artizen fund, which supports artists and creators working on environmental and cultural impact projects.",
};

const SOURCE_COLORS: Record<string, string> = {
  lens: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  farcaster: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "token-holder": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  octant: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  giveth: "bg-green-500/20 text-green-300 border-green-500/30",
  gitcoin: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  artizen: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "celo-pg": "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

export function AirdropPage() {
  useScrollReveal();
  const { address } = useAccount();
  const [data, setData] = useState<AirdropEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchAddr, setSearchAddr] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardLimit, setLeaderboardLimit] = useState(50);
  const [catData, setCatData] = useState<CategoryData | null>(null);
  const [lbSearch, setLbSearch] = useState("");
  const [lbSourceFilter, setLbSourceFilter] = useState("");

  useEffect(() => {
    fetch("/data-airdrop-eligible.json").then((r) => r.json()).then((j: AirdropEntry[]) => {
      setData(j); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/data-leaderboard-full.json").then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((j: { keys: string[]; data: unknown[][] }) => {
      setLeaderboard(parseLeaderboard(j)); setLeaderboardLoading(false);
    }).catch((e) => {
      console.error("Leaderboard fetch error:", e);
      setLeaderboardLoading(false);
    });
  }, []);

  useEffect(() => {
    fetch("/data-categories.json").then((r) => r.json()).then(setCatData).catch(() => {});
  }, []);

  useEffect(() => {
    if (address) { setSearchAddr(address); setActiveQuery(address.toLowerCase()); }
  }, [address]);

  const searchResult = useMemo(() => {
    if (!data || !activeQuery) return null;
    return data.find((e) => e.a.toLowerCase() === activeQuery.toLowerCase()) ?? null;
  }, [data, activeQuery]);

  const totalEligible = data?.length ?? 0;

  const sourceCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const c: Record<string, number> = {};
    data.forEach((e) => e.src.forEach((s) => { c[s] = (c[s] ?? 0) + 1; }));
    return c;
  }, [data]);

  const filteredLeaderboard = useMemo(() => {
    if (!leaderboard) return [];
    let result = leaderboard;
    if (lbSearch) {
      const q = lbSearch.toLowerCase();
      result = result.filter((e) =>
        e.address.toLowerCase().includes(q) ||
        (e.ensName ?? "").toLowerCase().includes(q) ||
        (e.lensHandle ?? "").toLowerCase().includes(q) ||
        (e.farcasterUsername ?? "").toLowerCase().includes(q) ||
        (e.displayName ?? "").toLowerCase().includes(q) ||
        (e.twitterHandle ?? "").toLowerCase().includes(q)
      );
    }
    if (lbSourceFilter) {
      result = result.filter((e) => e.sources.includes(lbSourceFilter));
    }
    return result;
  }, [leaderboard, lbSearch, lbSourceFilter]);

  return (
    <div className="min-h-screen">
      <SectionWrapper id="airdrop" className="pt-12 pb-8">
        <div className="max-w-4xl">
          <h1 className="font-serif text-4xl md:text-6xl font-medium leading-[1.07] tracking-tight max-w-3xl">
            Airdrop <em className="italic text-yellow font-medium">Eligibility</em>
          </h1>
          <p className="text-secondary-t mt-6 text-lg max-w-2xl">
            Participating in our testnet or having already done regen/refi actions qualifies you for an airdrop. Check your eligibility below.
          </p>
          <div className="flex items-center gap-2 mt-5">
            <span className="font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-full bg-yellow/20 text-yellow">
              {loading ? "Loading..." : `${totalEligible.toLocaleString()} eligible addresses`}
            </span>
          </div>
        </div>
      </SectionWrapper>

      {/* What is an airdrop? */}
      <SectionWrapper id="airdrop-explainer" className="py-8">
        <Card className="p-6 max-w-2xl" data-reveal>
          <h3 className="font-serif text-xl mb-3">What is an airdrop?</h3>
          <p className="text-sm text-secondary-t leading-relaxed">
            An airdrop is when a project gives away free tokens to its early users and supporters.
            Think of it like a reward for helping the project grow. You do not need to pay anything
            to get airdropped tokens — you just need to claim them.
          </p>
          <p className="text-sm text-secondary-t leading-relaxed mt-3">
            5H1T is giving SHIT tokens to people who have helped the regenerative
            finance community. This includes people who hold impact tokens, donate to public
            goods projects, or participate in climate-focused communities. Check your wallet
            address below to see if you qualify.
          </p>
        </Card>

        <Card className="p-6 max-w-2xl mt-4" data-reveal>
          <h3 className="font-serif text-xl mb-3">Airdrop economics</h3>
          <p className="text-sm text-secondary-t leading-relaxed">
            <strong className="text-primary-t">10% of the total SHIT supply</strong> is allocated to this airdrop,
            distributed across {loading ? "..." : `${totalEligible.toLocaleString()}`} eligible addresses at approximately
            <strong className="text-green"> $100 per address</strong>.
          </p>
          <p className="text-sm text-secondary-t leading-relaxed mt-3">
            The full airdrop value of <strong className="text-green">≈ ${(totalEligible * 100).toLocaleString()}</strong> is
            claimable immediately at token launch. This represents 10% of the total SHIT supply, meaning the airdrop
            reaches its full $100-per-address value when SHIT achieves a market cap of approximately
            <strong className="text-primary-t"> ${((totalEligible * 100) / 0.1).toLocaleString()}</strong>.
          </p>
          <p className="text-sm text-secondary-t leading-relaxed mt-3">
            <strong className="text-primary-t">How does the airdrop reach ~$6 million?</strong> With approximately
            60,000 eligible addresses at $100 per address, the total airdrop pool is ~$6 million. This is funded by
            allocating 10% of the total SHIT supply to the airdrop. At token launch, these SHIT are distributed pro-rata
            to eligible addresses. The $100-per-address figure assumes SHIT reaches its target market cap — if the market
            cap is higher, each address receives more value; if lower, less.
          </p>
        </Card>
      </SectionWrapper>

      <SectionWrapper id="checker" className="py-8">
        <Card className="p-8 max-w-2xl" data-reveal>
          <h3 className="font-serif text-xl mb-4">Check Your Address</h3>
          <div className="flex items-end gap-2 mb-4">
            <div className="flex-1">
              <label className="text-secondary-t text-[13px]/[18px] mb-1 block">Wallet Address</label>
              <Input placeholder="0x..." value={searchAddr} onChange={(e) => setSearchAddr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setActiveQuery(searchAddr.trim())}
                className="font-mono text-sm" />
            </div>
            <Button size="md" onClick={() => setActiveQuery(searchAddr.trim())} disabled={loading || !searchAddr.trim()}>
              Check
            </Button>
          </div>

          {activeQuery && !loading && (
            <div className="mt-6">
              {searchResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg className="size-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-lg text-primary-t">Eligible!</p>
                      <p className="text-sm text-secondary-t font-mono">{searchResult.a.slice(0, 8)}...{searchResult.a.slice(-6)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-surface-a3 border border-a3-b p-4">
                      <p className="text-xs text-tertiary-t uppercase tracking-wide">Score</p>
                      <p className="text-2xl font-bold text-primary-t mt-1">{searchResult.s.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-a3 border border-a3-b p-4">
                      <p className="text-xs text-tertiary-t uppercase tracking-wide">Multiplier</p>
                      <p className="text-2xl font-bold text-primary-t mt-1">{searchResult.m}x</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-tertiary-t uppercase tracking-wide mb-2">Qualifying Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {searchResult.src.map((s) => (
                        <span key={s} className={`inline-block px-2.5 py-1 rounded text-xs font-medium border ${SOURCE_COLORS[s] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                          {SOURCE_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="size-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-lg text-primary-t">Not Eligible</p>
                    <p className="text-sm text-secondary-t">This wallet is not eligible for the airdrop. Participate in the testnet or contribute to regen/refi projects to qualify.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </SectionWrapper>

      {/* Source breakdown + Category dashboard */}
      <SectionWrapper id="sources" className="py-16 border-t border-a10-b">
        <SectionHead kicker="How it works" title="Qualifying Sources" subtitle="Addresses are sourced from on-chain regen/refi activity across multiple platforms." />
        <div className="grid md:grid-cols-3 gap-4" data-reveal>
          {Object.entries(sourceCounts).filter(([src]) => src !== "twitter-climate").sort(([, a], [, b]) => b - a).map(([src, count]) => (
            <Card key={src} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-block px-2.5 py-1 rounded text-xs font-medium border ${SOURCE_COLORS[src] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                  {SOURCE_LABELS[src] ?? src}
                </span>
                <span className="text-2xl font-bold text-primary-t">{count.toLocaleString()}</span>
              </div>
              <p className="text-sm text-secondary-t">addresses from this source</p>
              <p className="text-xs text-green mt-1 font-medium">≈ ${(count * 100).toLocaleString()} expected airdrop</p>
              <p className="text-xs text-tertiary-t mt-2 leading-relaxed">{SOURCE_DESCRIPTIONS[src] ?? ""}</p>
            </Card>
          ))}
        </div>

        {/* Token holders breakdown */}
        {catData && catData.tokenBreakdown.length > 0 && (
          <div className="mt-8">
            <h4 className="text-sm font-medium text-primary-t mb-3">Token Holders Breakdown</h4>
            <div className="flex flex-wrap gap-2">
              {[...catData.tokenBreakdown].sort((a, b) => b.count - a.count).map((t) => (
                <button
                  key={t.token}
                  onClick={() => { setLbSourceFilter(""); setLbSearch(t.token); }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-a10-b bg-surface-a3 text-xs hover:border-yellow/50 transition-colors"
                >
                  <span className="font-medium text-primary-t">{t.token}</span>
                  <span className="text-tertiary-t">{t.count.toLocaleString()} holders</span>
                  <span className="text-green">≈ ${(t.count * 100).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </SectionWrapper>

      {/* Leaderboard — top addresses */}
      <SectionWrapper id="leaderboard" className="py-16 border-t border-a10-b">
        <SectionHead
          kicker="Top contributors"
          title="Leaderboard"
          subtitle="The highest-scoring eligible addresses ranked by their regen/refi contributions across qualifying sources."
        />
        <Card className="p-5 max-w-3xl mb-6" data-reveal>
          <h4 className="text-sm font-semibold text-primary-t mb-2">How scores are calculated</h4>
          <p className="text-xs text-secondary-t leading-relaxed">
            Each address earns points from multiple qualifying activities, which are combined into a final score:
          </p>
          <ul className="text-xs text-secondary-t mt-2 space-y-1.5 leading-relaxed">
            <li className="flex items-start gap-2"><span className="text-green mt-0.5">●</span> <span><strong className="text-primary-t">Token holdings:</strong> Holding verified impact tokens (SLR, TREE, REGEN, DOVU, KLIMA, CEN) across supported chains — more tokens and higher balances earn more points.</span></li>
            <li className="flex items-start gap-2"><span className="text-green mt-0.5">●</span> <span><strong className="text-primary-t">Donations:</strong> Verified donations on GivETH, Gitcoin quadratic funding rounds, Octant epochs, and Celo Public Goods — larger and more frequent donations earn more points.</span></li>
            <li className="flex items-start gap-2"><span className="text-green mt-0.5">●</span> <span><strong className="text-primary-t">Social engagement:</strong> Active Lens and Farcaster profiles that engaged with regen/climate content — meaningful participation earns more points than just having an account.</span></li>
            <li className="flex items-start gap-2"><span className="text-green mt-0.5">●</span> <span><strong className="text-primary-t">Artizen participation:</strong> Contributors to the Artizen fund supporting environmental and cultural impact projects.</span></li>
            <li className="flex items-start gap-2"><span className="text-green mt-0.5">●</span> <span><strong className="text-primary-t">Multiplier:</strong> Addresses qualifying from multiple sources receive a multiplier bonus — the more ways you've contributed, the higher your multiplier (up to several x).</span></li>
          </ul>
          <p className="text-xs text-tertiary-t mt-3 leading-relaxed">
            Final score = sum of points from all qualifying sources × multiplier. The leaderboard is sorted by final score in descending order.
          </p>
        </Card>
        {leaderboardLoading ? (
          <div className="flex justify-center py-12" data-reveal>
            <p className="text-secondary-t">Loading leaderboard...</p>
          </div>
        ) : leaderboard && leaderboard.length > 0 ? (
          <div className="max-w-3xl mx-auto" data-reveal>
            {/* Search & filter controls */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search address, ENS, Lens, Farcaster, Twitter..."
                  value={lbSearch}
                  onChange={(e) => setLbSearch(e.target.value)}
                  className="text-sm"
                />
              </div>
              <select
                value={lbSourceFilter}
                onChange={(e) => setLbSourceFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-a10-b bg-surface-a3 text-sm focus:outline-none"
              >
                <option value="">All sources</option>
                {Object.keys(sourceCounts).map((s) => (
                  <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>
                ))}
              </select>
              {(lbSearch || lbSourceFilter) && (
                <Button size="sm" variant="secondary" onClick={() => { setLbSearch(""); setLbSourceFilter(""); }}>
                  Clear
                </Button>
              )}
            </div>

            <div className="max-h-[600px] overflow-y-auto rounded-2xl border border-a10-b bg-surface-bg-l2">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface-bg-l2 border-b border-a10-b">
                  <tr className="text-left text-xs uppercase tracking-wide text-tertiary-t">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium text-right">Score</th>
                    <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Sources</th>
                    <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.slice(0, leaderboardLimit).map((entry) => (
                    <tr key={entry.address} className="border-b border-a5-b last:border-0 hover:bg-surface-a3 transition-colors">
                      <td className="px-4 py-3 text-tertiary-t font-mono">{entry.rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-primary-t">
                            {entry.displayName ?? entry.ensName ?? entry.lensHandle ?? entry.farcasterUsername ?? `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`}
                          </span>
                          <div className="flex items-center flex-wrap gap-2 text-xs text-tertiary-t">
                            <span className="font-mono">{entry.address.slice(0, 6)}...{entry.address.slice(-4)}</span>
                            {entry.ensName && (
                              <a href={`https://app.ens.domains/${entry.ensName}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                                ENS
                              </a>
                            )}
                            {entry.farcasterUsername && (
                              <a href={`https://warpcast.com/${entry.farcasterUsername}`} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                                fc
                              </a>
                            )}
                            {entry.lensHandle && (
                              <a href={`https://lensfrens.xyz/${entry.lensHandle}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                                lens
                              </a>
                            )}
                            {entry.twitterHandle && (
                              <a href={`https://x.com/${entry.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">
                                x
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-t">{entry.score.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {entry.sources.map((s) => (
                            <span key={s} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${SOURCE_COLORS[s] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                              {SOURCE_LABELS[s] ?? s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-secondary-t hidden md:table-cell">{entry.multiplier}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-center mt-3">
              <p className="text-xs text-tertiary-t mb-3">
                Showing {Math.min(leaderboardLimit, filteredLeaderboard.length).toLocaleString()} of {filteredLeaderboard.length.toLocaleString()} addresses
                {(lbSearch || lbSourceFilter) && ` (filtered from ${leaderboard.length.toLocaleString()})`}
              </p>
              {leaderboardLimit < filteredLeaderboard.length && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLeaderboardLimit((prev) => prev + 50)}
                >
                  Load More
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-12" data-reveal>
            <p className="text-secondary-t">Leaderboard data unavailable.</p>
          </div>
        )}
      </SectionWrapper>

      <footer className="py-12 border-t border-a10-b">
        <div className="flex justify-between items-start flex-wrap gap-6">
          <div>
            <div className="flex items-center gap-2 font-serif text-base">
              <SHITLogo className="size-6" /> SHIT
            </div>
            <p className="text-tertiary-t text-sm max-w-sm mt-2.5">
              SHIT is a decentralized savings protocol backed by a shared treasury, including verified climate impact assets.
            </p>
          </div>
          <div className="flex gap-6 text-sm text-secondary-t flex-wrap">
            <a href="#/" className="hover:text-primary-t transition-colors">Back to home</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
