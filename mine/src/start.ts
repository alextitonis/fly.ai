/**
 * The machine's entry point on fly.io (Dockerfile CMD): two server processes over the one SQLite database, and a proxy
 * in front on PORT that sends each request to its side.
 *
 *   mining  miners, orders, verifiers, research: busy, and its thread can stall for seconds under the fleet
 *   user    sign-in, Fly Roulette, Fly Slots, Fly Race, Fly Colosseum and FlightPass: what players' pages wait on
 *   research  the research summaries (/api/experiments), 45 s of work a run
 *
 * Split 2026-09-29 after mining stalls held FlightPass pages for up to 40 s and failed fly's health checks, which then
 * refused every request. The proxy does no work of its own, so it stays quick while either side is busy, and fly's
 * health check asks it (/healthz): up while the proxy runs.
 *
 * 2026-10-01: a process that exits is restarted ON ITS OWN, and the others keep serving: before, any exit ended the
 * machine, so a mining crash also took down sign-in, FlightPass and the games for the minute fly needed to restart it
 * (and a slow SQLite recovery made that much longer). Only a side that keeps crashing (CHILD_MAX_RESTARTS within ten
 * minutes) still ends the machine, for fly to start it fresh.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { Agent, createServer, request } from "node:http";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? "8080");
const MINING_PORT = PORT + 1, USER_PORT = PORT + 2, RESEARCH_PORT = PORT + 3;
let stopping = false, running = 0;

/**
 * The user side: everything a player's page calls, and its admin endpoints. Fly Wallets (/api/vaults) since
 * 2026-10-03: left on the mining side, every Traders card and fly page waited 2-5 s behind its stalls (the arena,
 * on this side, answered in 0.2 s); their timer already ran here.
 */
/** The research summaries: worked out for 45 s at a time, in a process of their own. */
const RESEARCH_PATHS = /^\/api\/experiments$/;
const USER_PATHS = /^\/api\/(flightpass|roulette|slots|race|arena|session|vaults|admin\/vaults|admin\/flightpass|admin\/roulette|admin\/slots|admin\/race|admin\/arena)(\/|$)|^\/api\/balance\/(deposit|withdraw-request)$/;
/**
 * Pages and read-only views anyone can open, served by the user side too (2026-09-29: "the hashing power rankings
 * page takes a long time to load and often freezes" - /api/month and even /api/stake-config took 4-12 s behind the
 * mining thread while /api/session answered in 0.2 s). They only read the database and settings: the compute site's
 * HTML, scripts and strings, the monthly ranking, staking and claims config, the price, the order form's config.
 * Miners' own calls (/api/me, jobs, results) stay on the mining side.
 */
const PUBLIC_PATHS = /^\/(compute(\/|$)|assets\/i18n\/|$)|^\/(leaderboard|stake|claim|results|connect|bench|jobs)$|^\/api\/(month|stake-config|claims|price|orders\/config)$/;

const MAX_RESTARTS = Number(process.env.CHILD_MAX_RESTARTS ?? "5");
const children = new Map<string, ChildProcess>();
const restarts = new Map<string, number[]>();

function run(role: string, port: number): ChildProcess {
  const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, ROLE: role, PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.set(role, child);
  child.on("exit", (code, signal) => {
    if (stopping) { if (--running === 0) process.exit(0); return; }
    running--;
    const now = Date.now();
    const times = (restarts.get(role) ?? []).filter((t) => t > now - 10 * 60_000);
    times.push(now);
    restarts.set(role, times);
    if (times.length > MAX_RESTARTS) {
      console.error(`${role} process exited (${signal ?? code}), ${times.length} times in ten minutes; stopping the machine so fly restarts it`);
      process.exit(1);
    }
    // a short pause that grows with each crash, so a side failing at once doesn't spin
    const wait = Math.min(30_000, 1_000 * 2 ** (times.length - 1));
    console.error(`${role} process exited (${signal ?? code}); restarting it alone in ${wait / 1000} s (the other sides keep serving)`);
    setTimeout(() => { if (!stopping) run(role, port); }, wait);
  });
  running++;
  return child;
}

/** Resolves once something answers on the port (the server listens only after its startup, migrations included). */
async function listening(port: number, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const up = await new Promise<boolean>((done) => {
      const r = request({ host: "127.0.0.1", port, path: "/api/session", method: "GET", timeout: 2_000 }, (res) => { res.resume(); done(true); });
      r.on("error", () => done(false));
      r.on("timeout", () => { r.destroy(); done(false); });
      r.end();
    });
    if (up) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`nothing listening on ${port} after ${ms / 1000} s`);
}

// mining first: it runs the schema upgrades, and the user side must not start on a half-upgraded database
run("mining", MINING_PORT);
// 2026-10-01: after crashes in the middle of a big write (a full disk), SQLite's recovery of the leftover journal took
// longer than the old 3 minutes; each timeout restarted the machine and the recovery began again, for good
await listening(MINING_PORT, Number(process.env.MINING_START_S ?? "1200") * 1000);
run("user", USER_PORT);
await listening(USER_PORT, 60_000);
run("research", RESEARCH_PORT);
await listening(RESEARCH_PORT, 120_000);

const agent = new Agent({ keepAlive: true, maxSockets: 512 });
const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    // the proxy answering is the machine being up: a side that died is restarted by run(), not by fly
    const down = [...children].filter(([, c]) => c.exitCode !== null || c.signalCode !== null).map(([r]) => r);
    res.writeHead(200, { "content-type": "text/plain" }).end(down.length ? `ok (restarting ${down.join(", ")})` : "ok");
    return;
  }
  const path = (req.url ?? "/").split("?")[0];
  const port = USER_PATHS.test(path) || PUBLIC_PATHS.test(path) ? USER_PORT : RESEARCH_PATHS.test(path) ? RESEARCH_PORT : MINING_PORT;
  const up = request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: req.headers, agent }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `server unavailable: ${err.message}` }));
  });
  req.pipe(up);
  // a client gone mid-stream (the live feeds) closes its upstream request too
  res.on("close", () => { if (!res.writableFinished) up.destroy(); });
});
// same as the servers behind it: miners reuse connections between claim and submit
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(PORT, () => console.log(`proxy on ${PORT}: mining on ${MINING_PORT}, user on ${USER_PORT}, research on ${RESEARCH_PORT}`));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  // both servers stop as the single one did (their own signal handling), then the machine
  process.on(sig, () => { stopping = true; for (const c of children.values()) c.kill(sig); setTimeout(() => process.exit(0), 20_000).unref(); });
}
