/**
 * start.ts keeps the machine up when one side dies (2026-10-01): kill the mining process, and the user side
 * (sign-in, FlightPass, games) must keep answering while the mining side comes back on its own.
 *
 *   npm run test:supervisor
 */
import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPg } from "./pgtest.ts";

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const DB = join(tmpdir(), `mine-supervisortest-${process.pid}.db`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const status = (path: string) => fetch(BASE + path, { signal: AbortSignal.timeout(5_000) }).then((r) => r.status, () => 0);

/** The pid of the child listening on a port. */
function pidOn(port: number): number {
  const out = process.platform === "win32"
    ? execSync(`netstat -ano`).toString().split("\n").find((l) => new RegExp(`[:.]${port}\\s.*LISTENING`).test(l))?.trim().split(/\s+/).pop()
    : execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN`).toString().trim().split("\n")[0];
  return Number(out);
}

let start: ReturnType<typeof spawn> | null = null;
let log = "";
const PG = await startPg(5539);
try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  start = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./start.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", AUDITS: "0", OPEN_TARGET: "50" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  start.stdout!.on("data", (d) => { log += d; });
  start.stderr!.on("data", (d) => { log += d; });
  for (let i = 0; ; i++) {
    if (/proxy on/.test(log)) break;
    if (i > 360) throw new Error("start.ts didn't come up");
    await sleep(500);
  }
  check("both sides answer", (await status("/api/model")) === 200 && (await status("/api/session")) !== 0);

  const mining = pidOn(PORT + 1);
  check("found the mining process", mining > 0, String(mining));
  process.kill(mining, "SIGKILL");
  await sleep(300);
  const during = await status("/api/session");
  check("sign-in still answers while mining is down", during !== 0 && during !== 502, String(during));
  check("the health check stays up", (await status("/healthz")) === 200);
  check("the machine didn't stop", start.exitCode === null);
  let back = false;
  for (let i = 0; i < 240 && !back; i++) { back = (await status("/api/model")) === 200; if (!back) await sleep(500); }
  check("the mining side comes back by itself", back);
  check("and says so in the log", /mining process exited .* restarting it alone/.test(log));
} catch (err) {
  console.error(err);
  failed++;
} finally {
  start?.kill("SIGTERM");
  for (let i = 0; i < 60 && start?.exitCode === null; i++) await sleep(500);
  if (start?.exitCode === null) start.kill("SIGKILL");
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}
if (failed) console.log(log.slice(-2000));
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
