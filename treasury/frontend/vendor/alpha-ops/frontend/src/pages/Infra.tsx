import { useEffect, useState } from "react";
import { fetchOpsHealth, type OpsHealth } from "../services/mockApi";

export function InfraPage() {
  const [ops, setOps] = useState<OpsHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        const data = await fetchOpsHealth();
        if (!cancelled) {
          setOps(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load operational health from backend.");
          setOps(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Infra Health</h1>
        <p className="mt-1 text-sm text-slate-400">
          High-level view of bot processes, queues, and connectivity.
        </p>
      </header>

      {/* Status bar */}
      <div className="text-xs text-slate-500">
        {isLoading && <span>Loading…</span>}
        {!isLoading && error && <span className="text-rose-400">{error}</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Bot processes */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h2 className="text-sm font-medium">Bot Processes</h2>

          {isLoading && <div className="mt-3 text-xs text-slate-500">Loading…</div>}
          {error && <div className="mt-3 text-xs text-rose-400">{error}</div>}

          {!isLoading && !error && ops && (
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              <li>
                execution-engine ·{" "}
                <span className="text-emerald-400">
                  {ops.executionEngine}
                </span>
              </li>
              <li>
                signal-pipeline ·{" "}
                <span className="text-emerald-400">
                  {ops.signalPipeline}
                </span>
              </li>
              <li>
                exchange-connectivity ·{" "}
                <span className="text-amber-400">
                  {ops.connectivityNote}
                </span>
              </li>
            </ul>
          )}
        </div>

        {/* Connectivity */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h2 className="text-sm font-medium">Connectivity</h2>

          {isLoading && <div className="mt-3 text-xs text-slate-500">Loading…</div>}
          {error && <div className="mt-3 text-xs text-rose-400">{error}</div>}

          {!isLoading && !error && ops && (
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              <li>
                Exchange connectivity ·{" "}
                <span className="text-amber-400">
                  {ops.connectivityNote}
                </span>
              </li>
              <li>
                Execution engine ·{" "}
                <span className="text-emerald-400">
                  {ops.executionEngine}
                </span>
              </li>
              <li>
                Signal pipeline ·{" "}
                <span className="text-emerald-400">
                  {ops.signalPipeline}
                </span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
