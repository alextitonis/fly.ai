import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui-card";
import { Input } from "@/components/ui-input";
import { Button } from "@/components/ui-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-table";
import { RiExternalLinkLine, RiSearchLine } from "@remixicon/react";

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
  tokenUsdValue: number;
  givethTotalUsd: number;
  octantTotalLockedGLM: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  "token-holder": "Token Holder",
  octant: "Octant",
  giveth: "Giveth",
  gitcoin: "Gitcoin",
  artizen: "Artizen",
  lens: "Lens",
  farcaster: "Farcaster",
};

const SOURCE_COLORS: Record<string, string> = {
  "token-holder": "bg-emerald-500/15 text-emerald-400",
  octant: "bg-blue-500/15 text-blue-400",
  giveth: "bg-purple-500/15 text-purple-400",
  gitcoin: "bg-orange-500/15 text-orange-400",
  artizen: "bg-pink-500/15 text-pink-400",
  lens: "bg-cyan-500/15 text-cyan-400",
  farcaster: "bg-indigo-500/15 text-indigo-400",
};

const PAGE_SIZE = 50;

export function ImpactLeaderboardPage() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<"rank" | "score" | "sources" | "tokenUsd" | "givethUsd">("rank");

  useEffect(() => {
    fetch("/data-leaderboard-full.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: { keys: string[]; data: unknown[][] }) => {
        const entries: LeaderboardEntry[] = json.data.map((arr) => ({
          rank: arr[0] as number,
          address: arr[1] as string,
          score: arr[2] as number,
          sources: arr[3] as string[],
          sourceCount: arr[4] as number,
          multiplier: arr[5] as number,
          ensName: (arr[6] as string) ?? null,
          lensHandle: (arr[7] as string) ?? null,
          farcasterUsername: (arr[8] as string) ?? null,
          displayName: (arr[9] as string) ?? null,
          tokenUsdValue: (arr[10] as number) ?? 0,
          givethTotalUsd: (arr[11] as number) ?? 0,
          octantTotalLockedGLM: (arr[12] as string) ?? null,
        }));
        setData(entries);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (e) =>
        e.address.toLowerCase().includes(q) ||
        (e.ensName?.toLowerCase().includes(q) ?? false) ||
        (e.lensHandle?.toLowerCase().includes(q) ?? false) ||
        (e.farcasterUsername?.toLowerCase().includes(q) ?? false) ||
        (e.displayName?.toLowerCase().includes(q) ?? false),
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case "score":
        arr.sort((a, b) => b.score - a.score);
        break;
      case "sources":
        arr.sort((a, b) => b.sourceCount - a.sourceCount);
        break;
      case "tokenUsd":
        arr.sort((a, b) => b.tokenUsdValue - a.tokenUsdValue);
        break;
      case "givethUsd":
        arr.sort((a, b) => b.givethTotalUsd - a.givethTotalUsd);
        break;
      default:
        arr.sort((a, b) => a.rank - b.rank);
    }
    return arr;
  }, [filtered, sortBy]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function formatAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function formatGlm(glm: string | null) {
    if (!glm) return null;
    const val = Number(glm) / 1e18;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val.toFixed(0);
  }

  function getExplorerLink(addr: string) {
    return `https://basescan.org/address/${addr}`;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-a3 rounded w-1/3" />
          <div className="h-4 bg-surface-a3 rounded w-1/2" />
          <div className="h-96 bg-surface-a3 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <Card className="p-6 border-red-500/30">
          <p className="text-sm text-secondary-t">
            Failed to load leaderboard data: {error}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      {/* Header */}
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-tertiary-t mb-2">
          ReFi Climate Leaderboard
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-medium leading-[1.07] tracking-tight mb-3">
          Climate actor wallet rankings
        </h1>
        <p className="text-secondary-t text-base max-w-2xl">
          A transparent, on-chain ranking of {data.length.toLocaleString()} wallets actively
          participating in climate and regenerative finance (ReFi). Scores are computed from
          token holdings, donations, and governance participation across 7 data sources.
        </p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-tertiary-t mb-1">Total Wallets</p>
          <p className="text-2xl font-semibold">{data.length.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-tertiary-t mb-1">Top Score</p>
          <p className="text-2xl font-semibold">{data[0]?.score.toFixed(1)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-tertiary-t mb-1">Data Sources</p>
          <p className="text-2xl font-semibold">7</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-tertiary-t mb-1">Median Score</p>
          <p className="text-2xl font-semibold">
            {data.length > 0 ? data[Math.floor(data.length / 2)].score.toFixed(1) : "—"}
          </p>
        </Card>
      </div>

      {/* Radicle repo link */}
      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Full dataset & pipeline code</p>
          <p className="text-xs text-tertiary-t mt-0.5">
            {data.length.toLocaleString()} wallets with full scoring breakdown, social profiles, and raw data
          </p>
        </div>
        <a
          href="https://radicle.network/nodes/rosa.radicle.network/rad%3Az2kY22UBjvyrbxfKZftjF4H66C7Wx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline shrink-0"
        >
          View on Radicle
          <RiExternalLinkLine className="size-4" />
        </a>
      </Card>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary-t" />
          <Input
            placeholder="Search by address, ENS, Lens, or Farcaster..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "rank", label: "Rank" },
              { key: "score", label: "Score" },
              { key: "sources", label: "Sources" },
              { key: "tokenUsd", label: "Token USD" },
              { key: "givethUsd", label: "Giveth USD" },
            ] as const
          ).map((opt) => (
            <Button
              key={opt.key}
              variant={sortBy === opt.key ? "default" : "secondary"}
              size="sm"
              onClick={() => {
                setSortBy(opt.key);
                setPage(0);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">Rank</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="hidden md:table-cell">Sources</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Token USD</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Giveth USD</TableHead>
              <TableHead className="hidden xl:table-cell text-right">Octant GLM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((entry) => (
              <TableRow key={entry.address}>
                <TableCell className="text-right font-mono text-sm text-tertiary-t">
                  {entry.rank}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <a
                        href={getExplorerLink(entry.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm hover:text-primary transition-colors"
                      >
                        {formatAddress(entry.address)}
                      </a>
                      {entry.ensName && (
                        <span className="text-xs text-secondary-t">{entry.ensName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-tertiary-t">
                      {entry.lensHandle && <span>{entry.lensHandle}</span>}
                      {entry.farcasterUsername && entry.farcasterUsername !== "!" && (
                        <span>@{entry.farcasterUsername}</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold">{entry.score.toFixed(1)}</span>
                  {entry.multiplier > 1 && (
                    <span className="text-xs text-tertiary-t ml-1">×{entry.multiplier}</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {entry.sources.map((src) => (
                      <span
                        key={src}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          SOURCE_COLORS[src] ?? "bg-surface-a3 text-tertiary-t"
                        }`}
                      >
                        {SOURCE_LABELS[src] ?? src}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right text-sm text-secondary-t">
                  {entry.tokenUsdValue > 0 ? `$${entry.tokenUsdValue.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-right text-sm text-secondary-t">
                  {entry.givethTotalUsd > 0 ? `$${entry.givethTotalUsd.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-right text-sm text-secondary-t">
                  {formatGlm(entry.octantTotalLockedGLM) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-tertiary-t">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-tertiary-t flex items-center px-2">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-tertiary-t">
            No wallets found matching "{search}"
          </p>
        </Card>
      )}
    </div>
  );
}
