// node --experimental-strip-types server/run.ts
//
// The always-on world: one field of flies that never stops, recorded as it goes.
//
//   * steps the same World the page runs (src/sim.ts), in real time (50 steps a simulated second). If the CPU cannot
//     keep up it runs slower than real time rather than skipping steps, and /health says by how much.
//   * every FLUSH_S wall seconds sends the new rows to the sink: a world row every WORLD_EVERY_S simulated seconds,
//     fly rows every FLY_EVERY_S, every event, and changed lineage and egg rows; relationships every REL_EVERY_S.
//   * every CHECKPOINT_EVERY_S saves the whole world (gzipped) and forgets what only the past needs, so it can run for
//     months and carry on after a restart or deploy. SIGTERM saves one last checkpoint.
//   * keeps the population above MIN_FLIES with newcomers (World.addImmigrant), logged as "arrive" events.
//   * streams the world live to every visitor of the page (server/live.ts, src/live.ts): one shared field, not a copy each.
//   * HTTP: /live (Server-Sent Events), /data (the Data card), /health, /state (JSON), /report (the printable report, Save as PDF), /export/<table>.csv (recent rows kept
//     in memory; the full history is in the database).
//
// Environment (all optional): PORT 8080, WORLD_SINK supabase|files (supabase if SUPABASE_URL is set), WORLD_DATA_DIR
// (files sink, default ./world-data), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORLD_SEED 1234, WORLD_START_FLIES 24,
// WORLD_MIN_FLIES 8, WORLD_MAX_FLIES 40, WORLD_EVERY_S 10, FLY_EVERY_S 60, REL_EVERY_S 300, CHECKPOINT_EVERY_S 600,
// FORGET_AFTER_S 3600, WORLD_RESET=1 (ignore the last checkpoint and start a new run), WORLD_ORIGINS (CORS),
// WORLD_STOP_AFTER_S (stop after this many simulated seconds; for tests), WORLD_SPEED (1 = real time; tests only), LIVE_MAX_CLIENTS 300, GIT_SHA.
import { createServer } from "node:http";
import { gzipSync, gunzipSync } from "node:zlib";
import { World, type WorldCheckpoint } from "../src/sim.ts";
import { toCsv, type Row, type Table } from "../src/datalog.ts";
import { buildReport } from "../src/report.ts";
import { LiveHub, sendData } from "./live.ts";
import { FileSink, SupabaseSink, type DbRow, type Sink, type TableName } from "./sink.ts";
import { PgSink } from "./pgsink.ts";

const env = process.env;
const num = (k: string, d: number) => (env[k] !== undefined && env[k] !== "" ? Number(env[k]) : d);
const CFG = {
  port: num("PORT", 8080),
  seed: num("WORLD_SEED", 1234),
  startFlies: num("WORLD_START_FLIES", 24),
  minFlies: num("WORLD_MIN_FLIES", 8),
  maxFlies: num("WORLD_MAX_FLIES", 40),
  worldEveryS: num("WORLD_EVERY_S", 10),
  flyEveryS: num("FLY_EVERY_S", 60),
  relEveryS: num("REL_EVERY_S", 300),
  checkpointEveryS: num("CHECKPOINT_EVERY_S", 600),
  forgetAfterS: num("FORGET_AFTER_S", 3600),
  flushS: 10,
  stopAfterS: num("WORLD_STOP_AFTER_S", 0),
  speed: num("WORLD_SPEED", 1),
  maxClients: num("LIVE_MAX_CLIENTS", 300),
  origins: (env.WORLD_ORIGINS ?? "https://flyaiworld.com,https://www.flyaiworld.com,http://localhost:5173").split(","),
};
const STEP_HZ = 50;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// SUPABASE_DB_URL (the pooler's Postgres URL) = straight SQL (pgsink.ts), else Flybook's REST API as before
const sink: Sink = (env.WORLD_SINK ?? (env.SUPABASE_URL || env.SUPABASE_DB_URL ? "supabase" : "files")) === "supabase"
  ? (env.SUPABASE_DB_URL ? await PgSink.connect(env.SUPABASE_DB_URL) : new SupabaseSink(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!))
  : new FileSink(env.WORLD_DATA_DIR ?? "world-data");

// ---- checkpoints: JSON with the weight arrays as base64, gzipped, as base64 text --------------------------------
function encode(c: WorldCheckpoint): string {
  const json = JSON.stringify(c, (_k, v) => (v instanceof Float32Array ? { f32: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64") } : v));
  return gzipSync(json).toString("base64");
}

function decode(data: string): WorldCheckpoint {
  return JSON.parse(gunzipSync(Buffer.from(data, "base64")).toString("utf8"), (_k, v) => {
    if (v && typeof v === "object" && typeof v.f32 === "string" && Object.keys(v).length === 1) {
      const b = Buffer.from(v.f32, "base64");
      return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    return v;
  });
}

// ---- start or resume ----------------------------------------------------------------------------------------------
let world: World;
let runId: string;
const last = env.WORLD_RESET === "1" ? null : await sink.latestCheckpoint();
if (last) {
  const restored = World.fromCheckpoint(decode(last.data));
  world = restored.world;
  runId = last.runId;
  log(`resumed run ${runId} at t=${Math.round(world.time)} s: ${world.flies.length} flies, ${world.props.length} props` +
    (restored.weightsKept ? "" : " (wiring changed since the checkpoint: genes carried over, learned synapses reset)"));
} else {
  world = new World(Math.min(CFG.startFlies, CFG.maxFlies), CFG.seed);
  runId = await sink.createRun(CFG.seed, env.GIT_SHA ?? "unknown", { ...CFG, origins: undefined });
  log(`new run ${runId}: seed ${CFG.seed}, ${world.flies.length} flies (${sink.kind} sink)`);
}
world.maxFlies = CFG.maxFlies;
// the in-memory tables only need to hold what the report and CSV endpoints show; the database keeps the rest
Object.assign(world.log.world, { cap: 3600 });
Object.assign(world.log.flies, { cap: 20_000 });
Object.assign(world.log.events, { cap: 5_000 });
const hub = new LiveHub(() => world, CFG.maxClients);

// ---- recording ----------------------------------------------------------------------------------------------------
const seen = { world: world.log.world.dropped + world.log.world.rows.length, flies: world.log.flies.dropped + world.log.flies.rows.length, events: world.log.events.dropped + world.log.events.rows.length };
const sentLineage = new Map<number, string>();
const sentEggs = new Map<number, string>();
const pending: Record<TableName, DbRow[]> = { world_seconds: [], world_fly_samples: [], world_events: [], world_lineage: [], world_eggs: [], world_relationships: [] };
const PENDING_CAP = 50_000;
const status = { lastFlushOk: true, lastError: "", rowsSent: 0, lastCheckpointT: 0, checkpoints: 0, immigrants: 0 };

/** New rows of a capped in-memory table since the last call (rows dropped from memory before we saw them are lost). */
function fresh(table: Table, key: keyof typeof seen): Row[] {
  const total = table.dropped + table.rows.length;
  const rows = table.rows.slice(Math.max(0, seen[key] - table.dropped));
  seen[key] = total;
  return rows;
}

const every = (t: unknown, s: number) => typeof t === "number" && Math.round(t) % s === 0;

function queue(table: TableName, rows: DbRow[]): void {
  const q = pending[table];
  q.push(...rows);
  if (q.length > PENDING_CAP) q.splice(0, q.length - PENDING_CAP);
}

function collect(withRelationships: boolean): void {
  queue("world_seconds", fresh(world.log.world, "world").filter((r) => every(r.t, CFG.worldEveryS)).map((r) => ({ run_id: runId, t: r.t, row: r })));
  queue("world_fly_samples", fresh(world.log.flies, "flies").filter((r) => every(r.t, CFG.flyEveryS)).map((r) => ({ run_id: runId, t: r.t, fly_id: r.id, row: r })));
  queue("world_events", fresh(world.log.events, "events").map((r) => ({ run_id: runId, t: r.t, kind: r.kind, row: r })));
  for (const [id, r] of world.log.lineage) {
    const s = JSON.stringify(r);
    if (sentLineage.get(id) !== s) { sentLineage.set(id, s); queue("world_lineage", [{ run_id: runId, fly_id: id, row: r, updated_at: new Date().toISOString() }]); }
  }
  for (const [id, r] of world.log.brood) {
    const s = JSON.stringify(r);
    if (sentEggs.get(id) !== s) { sentEggs.set(id, s); queue("world_eggs", [{ run_id: runId, egg_id: id, row: r, updated_at: new Date().toISOString() }]); }
  }
  if (withRelationships) {
    queue("world_relationships", world.relationshipRows().map((r) => ({ run_id: runId, a: r.a, b: r.b, label: r.label, row: r, updated_at: new Date().toISOString() })));
  }
}

/** Keep only the latest row per key, so a retry after an outage does not upsert the same fly a hundred times. */
function latestBy(rows: DbRow[], key: (r: DbRow) => string): DbRow[] {
  const m = new Map<string, DbRow>();
  for (const r of rows) m.set(key(r), r);
  return [...m.values()];
}

let flushing = false;
async function flush(withRelationships = false): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    collect(withRelationships);
    const plan: [TableName, string | null, ((r: DbRow) => string) | null][] = [
      ["world_seconds", null, null], ["world_fly_samples", null, null], ["world_events", null, null],
      ["world_lineage", "run_id,fly_id", (r) => String(r.fly_id)], ["world_eggs", "run_id,egg_id", (r) => String(r.egg_id)],
      ["world_relationships", "run_id,a,b", (r) => `${r.a}|${r.b}`],
    ];
    for (const [table, conflict, key] of plan) {
      const rows = key ? latestBy(pending[table], key) : pending[table];
      if (!rows.length) continue;
      if (conflict) await sink.upsert(table, rows, conflict); else await sink.insert(table, rows);
      pending[table] = [];
      status.rowsSent += rows.length;
    }
    status.lastFlushOk = true;
  } catch (e) {
    status.lastFlushOk = false;
    status.lastError = String(e).slice(0, 300);
    log("flush failed (rows kept for the next try):", status.lastError);
  } finally {
    flushing = false;
  }
}

async function checkpoint(): Promise<void> {
  await flush(true);
  if (!status.lastFlushOk) return;                        // never forget rows that have not been saved
  const gone = world.forget(CFG.forgetAfterS);
  for (const id of [...sentLineage.keys()]) if (!world.log.lineage.has(id)) sentLineage.delete(id);
  for (const id of [...sentEggs.keys()]) if (!world.log.brood.has(id)) sentEggs.delete(id);
  const data = encode(world.toCheckpoint());
  try {
    await sink.saveCheckpoint(runId, world.time, data, 3);
    status.lastCheckpointT = world.time;
    status.checkpoints++;
    log(`checkpoint t=${Math.round(world.time)} s, ${world.flies.length} flies, ${(data.length / 1e6).toFixed(2)} MB; forgot`, gone);
  } catch (e) {
    status.lastError = String(e).slice(0, 300);
    log("checkpoint failed:", status.lastError);
  }
}

// ---- the loop: real time, never skipping steps --------------------------------------------------------------------
let clock = performance.now();
let owed = 0;                                             // steps real time says we should have done
let lastImmigrant = -1e9;
const rate = { windowStart: performance.now(), steps: 0, ratio: 1 };
let stopping = false;

function loop(): void {
  if (stopping) return;
  const now = performance.now();
  owed += ((now - clock) / 1000) * STEP_HZ * CFG.speed;
  clock = now;
  // more than 5 s behind: let simulated time fall behind the wall clock instead of spiralling
  if (owed > STEP_HZ * CFG.speed * 5) owed = STEP_HZ * CFG.speed * 5;
  const until = now + 30;
  while (owed >= 1 && performance.now() < until) {
    world.step();
    hub.afterStep();
    owed--;
    rate.steps++;
    if (world.steps % STEP_HZ === 0 && world.flies.length < CFG.minFlies && world.time - lastImmigrant > 20) {
      world.addImmigrant();
      lastImmigrant = world.time;
      status.immigrants++;
    }
    if (CFG.stopAfterS && world.time >= CFG.stopAfterS) { void shutdown("stop-after"); return; }
  }
  if (now - rate.windowStart > 60_000) {
    rate.ratio = rate.steps / (((now - rate.windowStart) / 1000) * STEP_HZ * CFG.speed);
    rate.windowStart = now;
    rate.steps = 0;
  }
  setTimeout(loop, owed >= 1 ? 0 : 5);
}

// ---- HTTP ---------------------------------------------------------------------------------------------------------
const TABLES: Record<string, () => Row[]> = {
  "world.csv": () => world.log.world.rows,
  "flies.csv": () => world.log.flies.rows,
  "events.csv": () => world.log.events.rows,
  "lineage.csv": () => [...world.log.lineage.values()],
  "eggs.csv": () => [...world.log.brood.values()],
  "relationships.csv": () => world.relationshipRows(),
  "blocks.csv": () => world.driftByBlock(),
};

function summary(): Record<string, unknown> {
  return {
    run_id: runId, t: Math.round(world.time), clock: world.clock, flies: world.flies.length,
    eggs_and_larvae: world.props.filter((p) => p.kind === "egg" || p.kind === "larva").length,
    matings: world.matings, eggs_laid: world.eggsLaid, hatched: world.hatched, emerged: world.emerged,
    deaths: world.deaths, immigrants: status.immigrants, groups: world.latest.groups, in_groups: world.latest.inGroups,
    aggregation: Number.isFinite(world.latest.aggregation) ? Math.round(world.latest.aggregation * 1000) / 1000 : null,
    realtime_ratio: Math.round(rate.ratio * 100) / 100, viewers: hub.count, sink: sink.kind, rows_sent: status.rowsSent,
    last_flush_ok: status.lastFlushOk, last_error: status.lastError || null, last_checkpoint_t: Math.round(status.lastCheckpointT),
  };
}

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && CFG.origins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/live") return hub.connect(req, res, new URL(req.url ?? "/", "http://x"));
  if (path === "/data") return sendData(req, res, world);
  const send = (code: number, type: string, body: string) => { res.writeHead(code, { "Content-Type": type }); res.end(body); };
  if (path === "/health") return send(200, "application/json", JSON.stringify(summary()));
  if (path === "/state") {
    return send(200, "application/json", JSON.stringify({
      ...summary(),
      fly_list: world.flies.map((f) => ({
        id: f.id, name: f.name, sex: f.sex, generation: f.generation, state: f.state, age: Math.round(f.age),
        meals: f.meals, x: Math.round(f.x * 10) / 10, z: Math.round(f.z * 10) / 10,
        memory: Math.round(f.brain.memoryDepth() * 1000) / 1000, drift: Math.round(f.brain.drift() * 10000) / 10000,
      })),
      recent_events: world.log.events.rows.slice(-30),
    }));
  }
  if (path === "/report") return send(200, "text/html; charset=utf-8", buildReport(world));
  const m = path.match(/^\/export\/([a-z]+\.csv)$/);
  if (m && TABLES[m[1]]) {
    res.setHeader("Content-Disposition", `attachment; filename="fly-world-${m[1].replace(".csv", "")}-t${Math.round(world.time)}s.csv"`);
    return send(200, "text/csv; charset=utf-8", toCsv(TABLES[m[1]]()));
  }
  send(404, "text/plain", "not found");
});

async function shutdown(why: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`stopping (${why}): saving a last checkpoint`);
  await checkpoint();
  server.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(CFG.port, () => log(`listening on :${CFG.port}`));
setInterval(() => void flush(false), CFG.flushS * 1000);
setInterval(() => void flush(true), CFG.relEveryS * 1000);
setInterval(() => void checkpoint(), CFG.checkpointEveryS * 1000);
loop();
