/**
 * SCREEN_JOBS_DAY on a real server: with no limit, start-up fills OPEN_TARGET with screen rounds; with a tiny daily
 * budget it adds only the one round the day starts with, keeps the count in counters, and a restart on the same day
 * adds nothing more.
 *
 *   npm run test:screenbudget
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { startPg } from "./pgtest.ts";

const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
const PER_ROUND = 1107;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PG = await startPg(5541);

async function run(db: string, budget: string, look: (d: DatabaseSync) => void): Promise<void> {
  const blobs = `${db}-blobs`;
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: db, MINE_PG_URL: PG.url, BLOBS_DIR: blobs, VERIFIERS: "1", CANARY_POOL: "0", AUDITS: "0", OPEN_TARGET: "3000", SCREEN_JOBS_DAY: budget },
    stdio: ["ignore", "ignore", "inherit"],
  });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
      if (i > 120) throw new Error("server didn't start");
      await sleep(500);
    }
    const d = new DatabaseSync(db, { readOnly: true });
    try { look(d); } finally { d.close(); }
  } finally {
    const gone = new Promise((r) => server.once("exit", r));
    server.kill();
    await gone;
  }
}
const screen = (d: DatabaseSync) => (d.prepare("select count(*) as n from tasks where kind = 'connectome'").get() as { n: number }).n;
const counter = (d: DatabaseSync, name: string) => (d.prepare("select n from counters where name = ?").get(name) as { n: number } | undefined)?.n;

const free = join(tmpdir(), `mine-screenbudget-free-${process.pid}.db`);
const capped = join(tmpdir(), `mine-screenbudget-capped-${process.pid}.db`);
try {
  await run(free, "0", (d) => {
    check("no limit: start-up fills OPEN_TARGET", screen(d) >= 3000, String(screen(d)));
    check("no limit: no day counter kept", counter(d, "screen_day_jobs") === undefined);
  });
  await run(capped, "1", (d) => {
    check("budget 1/day: only the day's first round", screen(d) === PER_ROUND, String(screen(d)));
    check("the day's count is kept", counter(d, "screen_day_jobs") === PER_ROUND && counter(d, "screen_day") === Math.floor(Date.now() / 86_400_000));
  });
  await run(capped, "1", (d) => {
    check("a restart the same day adds nothing", screen(d) === PER_ROUND, String(screen(d)));
  });
} finally {
  for (const f of [free, capped]) for (const x of [f, `${f}-wal`, `${f}-shm`, `${f}-blobs`]) rmSync(x, { recursive: true, force: true });
  await PG.stop?.();
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("screen budget: all ok");
process.exit(0);
