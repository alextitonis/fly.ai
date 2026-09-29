/**
 * The machine's entry point on fly.io (Dockerfile CMD): two server processes over the one SQLite database, and a proxy
 * in front on PORT that sends each request to its side.
 *
 *   mining  miners, orders, verifiers, research: busy, and its thread can stall for seconds under the fleet
 *   user    sign-in, Fly Roulette and FlightPass: what players' pages wait on
 *   research  the research summaries (/api/experiments), 45 s of work a run
 *
 * Split 2026-09-29 after mining stalls held FlightPass pages for up to 40 s and failed fly's health checks, which then
 * refused every request. The proxy does no work of its own, so it stays quick while either side is busy, and fly's
 * health check asks it (/healthz): up while both processes run. Either process exiting ends the machine and fly
 * restarts it, as a crash of the single server did before.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { Agent, createServer, request } from "node:http";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? "8080");
const MINING_PORT = PORT + 1, USER_PORT = PORT + 2, RESEARCH_PORT = PORT + 3;
let stopping = false, running = 0;

/** The user side: everything a player's page calls, and its admin endpoints. */
/** The research summaries: worked out for 45 s at a time, in a process of their own. */
const RESEARCH_PATHS = /^\/api\/experiments$/;
const USER_PATHS = /^\/api\/(flightpass|roulette|session|admin\/flightpass|admin\/roulette)(\/|$)|^\/api\/balance\/(deposit|withdraw-request)$/;

function run(role: string, port: number): ChildProcess {
  const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, ROLE: role, PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code, signal) => {
    if (stopping) { if (--running === 0) process.exit(0); return; }
    console.error(`${role} process exited (${signal ?? code}); stopping the machine so fly restarts it`);
    process.exit(1);
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
const mining = run("mining", MINING_PORT);
await listening(MINING_PORT, 180_000);
const user = run("user", USER_PORT);
await listening(USER_PORT, 60_000);
const research = run("research", RESEARCH_PORT);
await listening(RESEARCH_PORT, 120_000);

const agent = new Agent({ keepAlive: true, maxSockets: 512 });
const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    const ok = mining.exitCode === null && user.exitCode === null && research.exitCode === null;
    res.writeHead(ok ? 200 : 503, { "content-type": "text/plain" }).end(ok ? "ok" : "down");
    return;
  }
  const path = (req.url ?? "/").split("?")[0];
  const port = USER_PATHS.test(path) ? USER_PORT : RESEARCH_PATHS.test(path) ? RESEARCH_PORT : MINING_PORT;
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
  process.on(sig, () => { stopping = true; mining.kill(sig); user.kill(sig); research.kill(sig); setTimeout(() => process.exit(0), 20_000).unref(); });
}
