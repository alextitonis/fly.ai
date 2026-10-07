/**
 * Trading-rule replays on the network, end to end on a real server: the price data goes up once as an upload, a
 * house order of settings (reversal, core, stockgap, model) goes out, two miners run each with src/replay.ts and must
 * return the same bytes, and the order settles by agreement and pays points.
 *
 *   npm run test:replay      (~20 seconds)
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeReplayData, pySum, runReplay, runReplayJob, type ReplaySetting } from "./replay.ts";
import { startPg } from "./pgtest.ts";

const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-replaytest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-replaytest-blobs-${process.pid}`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const api = async (path: string, body?: unknown, auth?: string) => {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": body instanceof Uint8Array ? "application/octet-stream" : "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json };
};

/** Replay data the way flytrade/research/replay_net/build_data.py packs it: 6 tokens, 400 bars of random walks. */
async function syntheticData(): Promise<Uint8Array> {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const n = 400;
  const tokens = [
    { s: "MEMEA", category: "meme", liquidity: 120_000 }, { s: "MEMEB", category: "meme", liquidity: 80_000 },
    { s: "MEMEC", category: "meme", liquidity: 60_000 }, { s: "TSLA", category: "stock", liquidity: 300_000 },
    { s: "NVDA", category: "stock", liquidity: 500_000 }, { s: "AMC", category: "stock", liquidity: 90_000 },
  ];
  const px = tokens.map((t, i) => {
    const a = new Float64Array(n);
    let p = t.category === "meme" ? 1e-5 * (i + 1) : 50 * (i + 1);
    for (let k = 0; k < n; k++) {
      p *= Math.exp((rnd() - 0.5) * (t.category === "meme" ? 0.12 : 0.02));
      a[k] = i === 2 && k < 50 ? NaN : rnd() < 0.1 ? NaN : p; // a late listing, and bars with no trade
    }
    return a;
  });
  const real = tokens.filter((t) => t.category === "stock").map((t) => {
    const src = px[tokens.indexOf(t)];
    const a = new Float64Array(n);
    let last = NaN;
    for (let k = 0; k < n; k++) {
      if (src[k] === src[k]) last = src[k];
      a[k] = k % 3 ? last * (1 + (rnd() - 0.5) * 0.04) : NaN; // the share trades around the token, off hours none
    }
    return a;
  });
  const mu = tokens.map(() => Float32Array.from({ length: n }, (_, k) => (k < 100 ? NaN : (rnd() - 0.45) * 0.05)));
  const rt = tokens.map(() => Float32Array.from({ length: n }, (_, k) => (k < 100 ? NaN : 0.008)));
  const header = new TextEncoder().encode(JSON.stringify({ start: 1_790_000_100 - (1_790_000_100 % 900), bar: 900, n, tokens,
    real: tokens.filter((t) => t.category === "stock").map((t) => t.s), model: { horizon: "1h" } }));
  const pad = (-(12 + header.length) % 8 + 8) % 8;
  const parts: Uint8Array[] = [new TextEncoder().encode("FLYRPLY1"), new Uint8Array(new Uint32Array([header.length]).buffer), header, new Uint8Array(pad)];
  for (const a of [...px, ...real]) parts.push(new Uint8Array(a.buffer));
  for (const a of [...mu, ...rt]) parts.push(new Uint8Array(a.buffer));
  const raw = new Uint8Array(pySum(parts.map((p) => p.length)));
  let off = 0;
  for (const p of parts) raw.set(p, (off += p.length) - p.length);
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}

const SETTINGS: ReplaySetting[] = [
  { name: "rev-meme", fee: 0.003, usd: 2500, every: 16,
    rule: { strategy: "reversal", categories: ["meme"], lookback_bars: 4, hold_bars: 4, frac: 0.5, band: 0.25, partial: 0.5, min_trade_usd: 3, signals: {} } },
  { name: "rev-signals-guard", fee: 0.003, usd: 2500, every: 16,
    rule: { strategy: "reversal", categories: ["meme", "stock"], lookback_bars: 8, hold_bars: 8, frac: 0.3, band: 0.5, partial: 0.5, min_trade_usd: 3,
      signals: { reversal: 1, settled: 1, calm: 0.5, fit: 0.5 }, knife_pct: 30, vol_pause: 3, trend_bars: 16, settle_bars: 2 } },
  { name: "core-stock", fee: 0.003, usd: 2500, every: 16,
    rule: { strategy: "core", top: 2, hold_bars: 96, band: 0.25, partial: 1, min_trade_usd: 5, trim_pct: 8, categories: ["stock"] } },
  { name: "gap", fee: 0.005, usd: 2500, every: 16,
    rule: { strategy: "stockgap", categories: ["stock"], entry_pct: 1, exit_pct: 0.25, max_hold_bars: 16, max_positions: 2, avg_bars: 96, min_seen: 8 } },
  { name: "model-top2", fee: 0.003, usd: 2500, every: 16,
    rule: { strategy: "model", hold_bars: 4, max_positions: 2, band: 0.5, edge_bps: 0, categories: ["meme", "stock"], min_pool_usd: 50_000 } },
];

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5538);
try {
  const gz = await syntheticData();
  const d = await decodeReplayData(gz);
  check("replay data round-trips: tokens, real prices, model scores", d.n === 400 && d.tokens.length === 6 && d.real.size === 3 && d.mu?.length === 6
    && Number.isNaN(d.px[2][10]) && Number.isNaN(d.mu![0][50]) && d.mu![0][150] === d.mu![0][150]);
  const local = SETTINGS.map((s) => runReplay(d, s));
  check("every strategy trades on the synthetic data", local.every((r) => r.trades > 0), local.map((r) => `${r.name} ${r.trades}`).join(", "));
  check("a replay is the same bytes every time", JSON.stringify(SETTINGS.map((s) => runReplay(d, s))) === JSON.stringify(local));
  check("Python's sum: compensated, 1e16 + 1 - 1e16 = 1", pySum([1e16, 1, -1e16]) === 1);

  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "20", ADMIN_TOKEN: ADMIN, MIN_CHECKED: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }

  const missing = "ab".repeat(32);
  check("a replay order needs its data uploaded first", (await api("/api/admin/house", { label: "replay/bad", spec: { kind: "replay", data: missing, settings: SETTINGS } }, ADMIN)).status === 400);
  const up = (await api("/api/blobs", gz, ADMIN)).json;
  check("the data uploads as one blob", typeof up?.hash === "string" && up.size === gz.length, JSON.stringify(up));
  const bad = async (settings: unknown[]) => (await api("/api/admin/house", { label: "replay/bad", spec: { kind: "replay", data: up.hash, settings } }, ADMIN)).status;
  check("a reversal setting without its band is refused", await bad([{ ...SETTINGS[0], rule: { ...SETTINGS[0].rule, band: undefined } }]) === 400);
  check("an unknown strategy is refused", await bad([{ ...SETTINGS[0], rule: { strategy: "martingale" } }]) === 400);
  check("two settings with one name are refused", await bad([SETTINGS[0], SETTINGS[0]]) === 400);
  const order = (await api("/api/admin/house", { label: "replay/desk-test/all", spec: { kind: "replay", data: up.hash, settings: SETTINGS } }, ADMIN)).json;
  check("a replay order: one job per setting", order?.status === "live" && order.jobs === SETTINGS.length, JSON.stringify(order?.error ?? order?.jobs));

  const register = async () => (await api("/api/register", {})).json.token as string;
  const [ta, tb, old] = [await register(), await register(), await register()];
  const oldJobs = (await api("/api/claim", { count: 8, kinds: ["connectome", "world", "probe", "fight"], open_max: 8 }, old)).json?.jobs ?? [];
  check("miners that don't ask for replays never get one", oldJobs.every((j: any) => j.kind !== "replay"));

  const fetchBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const play = async (t: string) => {
    const seen: any[] = [];
    for (;;) {
      const jobs = ((await api("/api/claim", { count: 16, kinds: ["replay"], open_max: 16 }, t)).json?.jobs ?? []) as any[];
      if (!jobs.length) break;
      for (const j of jobs) {
        seen.push(j);
        const out = await runReplayJob({ ...j.params, data_url: BASE + j.params.data_url }, fetchBytes);
        await api("/api/submit", { job: j.job, result: { output: Buffer.from(out).toString("base64") } }, t);
      }
    }
    return seen;
  };
  const seenA = await play(ta);
  check("replay jobs carry the setting and a link to the data", seenA.length === SETTINGS.length && seenA.every((j) => j.kind === "replay"
    && j.params.setting?.rule?.strategy && j.params.data === up.hash && j.params.data_url === `/api/blobs/${up.hash}`), JSON.stringify(seenA[0]?.params).slice(0, 300));
  await play(tb);

  const res = (await api(`/api/orders/${order.id}/results`)).json;
  check("two agreeing miners settle every setting", res.status === "done" && res.rows.length === SETTINGS.length && res.rows.every((r: any) => r.checked_by === "agreement"),
    JSON.stringify(res.rows?.map((r: any) => r.checked_by)));
  const outs = await Promise.all(res.rows.map(async (r: any) => JSON.parse(Buffer.from(await (await fetch(BASE + r.output.url)).arrayBuffer()).toString("utf8"))));
  check("the settled answers are the local replays", outs.every((o: any) => JSON.stringify(o) === JSON.stringify(local.find((l) => l.name === o.name))));
  const me = (await api("/api/me", undefined, ta)).json;
  check("replays earn points", me.units > 0, JSON.stringify({ units: me.units }));
  const exp = (await api("/api/experiments")).json?.experiments ?? [];
  check("replay results stay off the public experiments page", !exp.some((e: any) => e.label?.startsWith("replay/")));
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  await sleep(300);
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* busy */ }
  rmSync(BLOBS, { recursive: true, force: true });
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "replay checks passed");
process.exit(failed ? 1 : 0);
