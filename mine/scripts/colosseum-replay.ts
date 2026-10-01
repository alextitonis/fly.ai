/**
 * Have the network play a finished Fly Colosseum season again: every fight goes out as a house order of fight jobs
 * (src/fightjob.ts), and /compute/results then says whether the miners got exactly the server's results.
 *
 * Everything comes from the public API once a season is done (the server seed is revealed then, and the entrants'
 * traits and potions give their stats). The server's own result of each fight is kept in the order and never sent
 * to miners, so they can't just echo it. Safe to run again: it skips a season that already has a replay.
 *
 *   set -a; source mine/.env.local; set +a
 *   node mine/scripts/colosseum-replay.ts --season 1 [--dry-run] [--server $SERVER]
 */
import { fightLabel } from "../../world/src/arena/game.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SERVER = arg("server") ?? process.env.SERVER ?? "https://flyai-mine.fly.dev";
const TOKEN = process.env.ADMIN_TOKEN ?? "";
const DRY = process.argv.includes("--dry-run");
const SEASON = Number(arg("season"));
if (!Number.isInteger(SEASON) || SEASON < 1) throw new Error("--season N (from 1)");
if (!TOKEN && !DRY) throw new Error("ADMIN_TOKEN isn't set (source mine/.env.local)");

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${json.error ?? `HTTP ${res.status}`}`);
  return json;
}

const label = `colosseum/season-${SEASON}-replay`;
if (((await call("/api/house")).orders as { label: string }[]).some((o) => o.label === label)) {
  console.log(`${label} already exists`);
  process.exit(0);
}
const listed = (await call("/api/arena/tournaments")).tournaments as { id: string; season: number; status: string }[];
const found = listed.find((t) => t.season === SEASON);
if (!found) throw new Error(`no Season ${SEASON}`);
if (found.status !== "done") throw new Error(`Season ${SEASON} is ${found.status}: it can be replayed once it's done`);
const t = await call(`/api/arena/tournaments/${found.id}`);
const stats = new Map((t.entries as { fly: number; stats: object }[]).map((e) => [e.fly, e.stats]));

const fights = [];
for (const m of t.matches as { round: number; slot: number; a: number; b: number | null }[]) {
  if (m.b === null) continue; // a bye isn't a fight
  const f = await call(`/api/arena/tournaments/${found.id}/fights/${m.round}/${m.slot}`);
  const end = f.events[f.events.length - 1];
  const last = [...f.events].reverse().find((e: { type: string }) => e.type === "round");
  fights.push({
    server_seed: f.server_seed, digest: f.digest, label: fightLabel(m.round, m.slot), a: stats.get(m.a), b: stats.get(m.b),
    expect: { winner: end.winner, how: end.how, rounds: end.rounds, hp: last ? last.hp : [0, 0], seeds: f.seeds },
  });
}
console.log(`Season ${SEASON}: ${fights.length} fights`);
if (DRY) {
  console.log(JSON.stringify(fights[0], null, 2));
  process.exit(0);
}
const made = await call("/api/admin/house", { label, spec: { kind: "fight", fights, redundancy: 2 }, max_parallel: 64 });
console.log(`${label}: order ${made.id}, ${made.jobs} jobs`);
