/**
 * Fly Race end to end (2026-09-29). No chain: balances are booked straight into the ledger, as a deposit books them
 * (deposits are roulette's, tested in roulettetest.ts).
 * - the rules are fair by symmetry: over many races with a stand-in brain (the same for every lane) each lane wins
 *   1/6 and makes the podium 1/2 (chi-square), also when every fly ties; the same seeds give the same race;
 * - config: limits, lanes, legs and the multipliers;
 * - commit-reveal: the commit is sha256(server seed), revealed once the race is over, and the race replayed here from
 *   the revealed seeds on the real brain gives exactly the served events;
 * - a race booked exactly: the stake as a `bet`, a win paid 5.7x once, a loss nothing, a podium paid 1.9x
 *   (the test reads each commit's seed from the database and replays the race first, to back a winner or a loser);
 * - terms (roulette's), limits (min, max, the biggest payout, per day), bad input, used and expired commits;
 * - a server killed mid-race plays it on from its seeds after a restart and settles it once;
 * - the house's books, the house stop, the off switch.
 * Plays real brain races on the CPU (a minute or two).
 *
 *   npm run test:race
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ConnectomeBrain, cells } from "../../world/src/connectome.ts";
import { deriveRng, LANES, LEGS, NAMES, ODOUR_MAX, ODOUR_MIN, playRace, setupRace, sfc32, TRACK, type LegEvent, type RaceEvent } from "../../world/src/race/game.ts";
import { distanceFor, groups, runLeg } from "../../world/src/race/readout.ts";
import { loadModel } from "./load.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8788;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-racetest-${process.pid}.db`);
const CONNECTOME = fileURLToPath(new URL("../../world/public/connectome/", import.meta.url));
const WEI = 10n ** 18n;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

// ---- 1. the rules are fair by symmetry ---------------------------------------------------------------------
{
  const RACES = Number(process.env.RACE_FAIR_RACES ?? 30000);
  // chi-square critical value at p = 0.001 for 5 degrees of freedom
  const CRIT5 = 20.52;
  /** a stand-in brain: the same function for every lane, noise from the lane's own brain seed */
  async function fairness(label: string, n: number, stub: (race: ReturnType<typeof setupRace>) => (lane: number, leg: number, x: number) => number) {
    const wins = new Array(LANES).fill(0), podium = new Array(LANES).fill(0);
    const places = Array.from({ length: LANES }, () => new Array(LANES).fill(0));
    let bad = 0;
    for (let r = 0; r < n; r++) {
      const rng = await deriveRng(`fair-${label}-${r}`, `client-${r}`);
      const race = setupRace(rng);
      let end: Extract<RaceEvent, { type: "end" }> | null = null, legs = 0;
      for await (const e of playRace(race, rng, stub(race))) {
        if (e.type === "leg") {
          legs++;
          if (e.positions.some((p) => p > TRACK) || e.moved.some((m, i) => m !== distanceFor(e.spikes[i]))) bad++;
        } else end = e;
      }
      if (!end || [...end.order].sort().join() !== "0,1,2,3,4,5" || end.winner !== end.order[0] || legs < 1 || legs > LEGS) { bad++; continue; }
      wins[end.winner]++;
      end.order.forEach((lane, k) => { places[lane][k]++; if (k < 3) podium[lane]++; });
    }
    const chi = (obs: number[], p: number) => obs.reduce((s, o) => s + (o - n * p) ** 2 / (n * p), 0);
    const cw = chi(wins, 1 / 6);
    check(`${label}: each lane wins 1/6 (${n} races)`, bad === 0 && cw < CRIT5, `wins ${wins.join(" ")}, chi-square ${cw.toFixed(1)} (limit ${CRIT5}), ${bad} bad`);
    // podium: each lane's count is Binomial(n, 1/2); allow 4 standard deviations
    const sdPod = Math.sqrt(n / 4);
    const worst = Math.max(...podium.map((x) => Math.abs(x - n / 2) / sdPod));
    check(`${label}: each lane makes the podium 1/2`, worst < 4, `podium ${podium.join(" ")}, worst ${worst.toFixed(2)} sd`);
    const cp = Math.max(...places.map((row) => chi(row, 1 / 6)));
    check(`${label}: every lane's place is uniform`, cp < CRIT5 + 4, `worst chi-square ${cp.toFixed(1)}`);
  }
  const t0 = Date.now();
  // odour matters and brains differ: spikes grow with the smell, plus each brain's own noise (the same code for all lanes)
  await fairness("stand-in brain", RACES, (race) => {
    const noise = race.seeds.map((s) => sfc32(s, s ^ 0x9e3779b9, 7, 11));
    return (lane, _leg, x) => Math.floor(20 + 100 * x + 12 * noise[lane]());
  });
  // every fly the same: the whole order is the tie-break draw, never the lane number
  await fairness("all tied", Math.round(RACES / 3), () => () => 50);
  const a = setupRace(await deriveRng("s", "c")), b = setupRace(await deriveRng("s", "c"));
  check("same seeds, same race", JSON.stringify(a) === JSON.stringify(b));
  check("the race's draws: 6 distinct names, 5 x 6 odours in range", new Set(a.names).size === LANES && a.names.every((x) => NAMES.includes(x))
    && a.odour.length === LEGS && a.odour.every((row) => row.length === LANES && row.every((x) => x >= ODOUR_MIN && x <= ODOUR_MAX)));
  console.log(`     (fairness: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---- 2. bets on the server -----------------------------------------------------------------------------------
const [alice, bob] = [0, 1].map(() => {
  const sk = secp256k1.utils.randomSecretKey();
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});

async function api(path: string, session: string | null, body?: unknown, admin = false): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(session ? { "x-flyai-session": session } : {}),
      ...(admin ? { authorization: `Bearer ${ADMIN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let server: ReturnType<typeof spawn> | null = null;
async function startServer(extra: Record<string, string> = {}): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50",
      ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none", CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost",
      SEED_PAID: "0",
      // a win of the biggest bet (1000 x 5.7) would pay past the 5000 cap; its podium (1900) wouldn't
      RACE_ON: "1", RACE_EDGE: "0.05", RACE_MIN_BET: "10", RACE_MAX_BET: "1000", RACE_MAX_DAY: "3000", RACE_MAX_PAYOUT: "5000",
      RACE_HOUSE_STOP: "100000", RACE_MAX_LIVE: "8",
      ...extra,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
}
async function stopServer(): Promise<void> {
  if (!server) return;
  const s = server;
  server = null;
  const gone = new Promise((r) => s.once("exit", r));
  s.kill("SIGKILL");
  await gone;
}
const dbDo = <T>(fn: (db: DatabaseSync) => T): T => {
  const db = new DatabaseSync(DB);
  try { return fn(db); } finally { db.close(); }
};

/** The race again, here, from its seeds: the same rules, engine and legs as the server's worker. */
let model: ReturnType<typeof loadModel> | null = null;
async function replay(serverSeed: string, clientSeed: string): Promise<RaceEvent[]> {
  model ??= loadModel(CONNECTOME);
  const g = groups(model.meta, cells);
  const rng = await deriveRng(serverSeed, clientSeed);
  const race = setupRace(rng);
  const brains: ConnectomeBrain[] = [];
  const out: RaceEvent[] = [];
  for await (const e of playRace(race, rng, (lane, _leg, x) => runLeg(brains[lane] ??= new ConnectomeBrain(model!.w, model!.meta.params, race.seeds[lane]), g, x))) out.push(e);
  return out;
}
const orderOf = (events: RaceEvent[]) => (events.at(-1) as Extract<RaceEvent, { type: "end" }>).order;
const served = (r: any) => JSON.stringify(r.events.map(({ seq: _s, ...e }: any) => e));

/** Waits for a race to finish; returns its final view (every event). */
async function finished(id: string, maxS = 300): Promise<any> {
  for (let i = 0; i < maxS * 2; i++) {
    const r = (await api(`/api/race/races/${id}`, null)).json;
    if (r.status !== "live") return r;
    await sleep(500);
  }
  throw new Error(`race ${id} didn't finish`);
}

try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  await startServer();
  check("schema 20 with the race tables", dbDo((db) => (db.prepare("pragma user_version").get() as { user_version: number }).user_version === 20
    && (db.prepare("select count(*) as n from sqlite_master where name in ('race_commits', 'race_games', 'race_events')").get() as { n: number }).n === 3));

  // ---- config
  const cfg = (await api("/api/race/config", null)).json;
  check("config: on, limits, lanes, legs, multipliers", JSON.stringify(cfg) === JSON.stringify({
    on: true, paused: false, edge: 0.05, terms_version: 1, min_bet: "10", max_bet: "1000", max_day: "3000", max_payout: "5000",
    lanes: 6, legs: 5, mult: { win: 5.7, podium: 1.9 },
  }), JSON.stringify(cfg));

  // ---- sign-in and balances (booked as a deposit books them)
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  check("no session, no account", (await api("/api/race/me", null)).status === 401);
  const a = await signIn(alice), b = await signIn(bob);
  dbDo((db) => db.prepare("insert into ledger (wallet, order_id, kind, amount_wei, tx, at) values (?, null, 'deposit', ?, ?, ?)")
    .run(alice.address, (10_000n * WEI).toString(), "0x" + "ab".repeat(32), Date.now()));
  check("the balance shows", (await api("/api/race/me", a)).json.balance === "10000");

  // ---- commits, terms and limits
  const commit = async (s: string) => (await api("/api/race/commit", s, {})).json;
  let c = await commit(a);
  check("a commit is a sha256 hash with an expiry", /^[0-9a-f]{64}$/.test(c.hash) && /^[0-9a-f-]{36}$/.test(c.commit_id) && c.expires_at > Date.now());
  const race = (s: string, body: object) => api("/api/race/races", s, { commit_id: c.commit_id, client_seed: "alice-seed-1", pick: 0, bet: "win", stake: "100", ...body });
  check("no bets before the terms", (await race(a, {})).status === 403);
  check("the roulette terms cover the race", (await api("/api/roulette/terms", a, { over18: true, accept: true })).status === 200
    && (await api("/api/race/me", a)).json.terms_accepted === true);
  check("below the smallest bet", (await race(a, { stake: "5" })).status === 400);
  check("above the biggest bet", (await race(a, { stake: "2000" })).status === 400);
  const cap = await race(a, { stake: "1000" });
  check("a win that would pay past the cap", cap.status === 400 && /at most 5000/.test(cap.json?.error ?? ""), JSON.stringify(cap.json));
  check("a lane that isn't on the track", (await race(a, { pick: 6 })).status === 400 && (await race(a, { pick: -1 })).status === 400);
  check("a bet type that doesn't exist", (await race(a, { bet: "place" })).status === 400);
  check("a bad client seed", (await race(a, { client_seed: "no spaces" })).status === 400);
  check("a bad stake", (await race(a, { stake: "lots" })).status === 400);
  check("someone else's commit", (await api("/api/race/races", b, { commit_id: c.commit_id, client_seed: "x", pick: 0, bet: "win", stake: "100" })).status === 404);

  /** The seed behind a commit, read where only the server can: so the test knows the race before it bets. */
  const seedOf = (commitId: string) => dbDo((db) => (db.prepare("select server_seed from race_commits where id = ?").get(commitId) as { server_seed: string }).server_seed);
  const books = (id: string) => dbDo((db) => ({
    bets: db.prepare("select amount_wei from ledger where kind = 'bet' and tx = ?").all(`race:${id}`) as { amount_wei: string }[],
    wins: db.prepare("select amount_wei from ledger where kind = 'payout' and tx = ?").all(`race-win:${id}`) as { amount_wei: string }[],
  }));
  let balance = 10_000;
  const balanceNow = async () => Number((await api("/api/race/me", a)).json.balance);

  // ---- a win: back the lane the seeds make the winner
  const seed1 = "alice-win-1";
  const ev1 = await replay(seedOf(c.commit_id), seed1);
  const o1 = orderOf(ev1);
  const placed = await race(a, { client_seed: seed1, pick: o1[0], bet: "win", stake: "100" });
  const p1 = placed.json;
  check("a race placed: live, lined up, the seed still secret", placed.status === 200 && p1.status === "live" && p1.bet === "win" && p1.pick === o1[0]
    && p1.stake === "100" && p1.payout === "570" && p1.won === null && p1.server_seed === null && p1.commit_hash === c.hash && p1.client_seed === seed1
    && p1.names.length === 6 && typeof p1.created_at === "number", JSON.stringify(p1).slice(0, 300));
  check("the names follow from the seeds", JSON.stringify(p1.names) === JSON.stringify(setupRace(await deriveRng(seedOf(c.commit_id), seed1)).names));
  balance -= 100;
  check("the stake leaves the balance", (await balanceNow()) === balance);
  check("a used commit can't be used again", (await race(a, { client_seed: "again" })).status === 409);
  c = await commit(a);
  check("one race at a time", (await race(a, { client_seed: "two-at-once" })).status === 409);
  check("me: the live race", (await api("/api/race/me", a)).json.live_race === p1.id);
  const r1 = await finished(p1.id);
  check("the race runs leg by leg to a finishing order", r1.status === "done" && r1.won === true && r1.events.every((e: any, k: number) => e.seq === k)
    && r1.events.at(-1).type === "end" && r1.events.slice(0, -1).every((e: LegEvent, k: number) => e.type === "leg" && e.leg === k && e.spikes.length === 6
      && e.positions.every((p) => p >= 0 && p <= TRACK)), `${r1.events.length - 1} legs, order ${r1.events.at(-1)?.order}`);
  check("the server seed is revealed and matches the commit", !!r1.server_seed && sha256hex(r1.server_seed) === r1.commit_hash);
  check("the revealed seeds replay to exactly the served events", served(r1) === JSON.stringify(ev1));
  const after = (await api(`/api/race/races/${p1.id}?after=2`, null)).json;
  check("?after= serves only the later events", after.events.length === r1.events.length - 2 && after.events[0].seq === 2);
  balance += 570;
  check("a win pays 5.7x once", (await balanceNow()) === balance && books(p1.id).bets.length === 1 && books(p1.id).wins.length === 1
    && books(p1.id).wins[0].amount_wei === (570n * WEI).toString());

  // ---- a loss: back the lane the seeds make last
  const seed2 = "alice-lose-2";
  const ev2 = await replay(seedOf(c.commit_id), seed2);
  const p2 = (await race(a, { client_seed: seed2, pick: orderOf(ev2)[5], bet: "win", stake: "100" })).json;
  const r2 = await finished(p2.id);
  balance -= 100;
  check("a loss pays nothing", r2.status === "done" && r2.won === false && (await balanceNow()) === balance && books(p2.id).bets.length === 1
    && books(p2.id).wins.length === 0 && served(r2) === JSON.stringify(ev2));

  // ---- a podium: the lane that comes 3rd
  c = await commit(a);
  const seed3 = "alice-podium-3";
  const ev3 = await replay(seedOf(c.commit_id), seed3);
  const p3 = (await race(a, { client_seed: seed3, pick: orderOf(ev3)[2], bet: "podium", stake: "200" })).json;
  check("a podium bet pays 1.9x", p3.bet === "podium" && p3.payout === "380");
  const r3 = await finished(p3.id);
  balance += -200 + 380;
  check("3rd place makes the podium: paid once", r3.won === true && (await balanceNow()) === balance && books(p3.id).wins.length === 1
    && books(p3.id).wins[0].amount_wei === (380n * WEI).toString() && served(r3) === JSON.stringify(ev3));

  // ---- a restart in the middle of a race: a podium bet on 4th place, which loses
  c = await commit(a);
  const seed4 = "restart-me";
  const ev4 = await replay(seedOf(c.commit_id), seed4);
  const p4 = (await race(a, { client_seed: seed4, pick: orderOf(ev4)[3], bet: "podium", stake: "200" })).json;
  let before: any = null;
  for (let i = 0; i < 600; i++) {
    before = (await api(`/api/race/races/${p4.id}`, null)).json;
    if (before.events.length >= 1 || before.status !== "live") break;
    await sleep(100);
  }
  await stopServer();
  await startServer();
  const r4 = await finished(p4.id);
  balance -= 200;
  check("after a restart the race plays on from its seeds and settles once", before.status === "live" && before.events.length >= 1 && before.events.length < ev4.length
    && r4.status === "done" && r4.won === false && books(p4.id).bets.length === 1 && books(p4.id).wins.length === 0 && (await balanceNow()) === balance,
    `${before.events.length} events before the restart, ${r4.events.length} after`);
  check("and it's the same race the seeds give", served(r4) === JSON.stringify(ev4));

  // ---- my races
  const me = (await api("/api/race/me", a)).json;
  check("me: history, day staked, no live race", me.wallet === alice.address && me.history.length === 4 && me.day_staked === "600" && me.live_race === null
    && me.withdraw_request === null && me.history[0].id === p4.id && me.history[0].bet === "podium" && me.history[0].won === false
    && JSON.stringify(me.history[0].order) === JSON.stringify(orderOf(ev4)) && me.history.every((h: any) => typeof h.created_at === "number" && h.status === "done"),
    JSON.stringify(me.history[0]));

  // ---- expired commits and the daily limit
  c = await commit(a);
  dbDo((db) => db.prepare("update race_commits set created_at = created_at - 16 * 60000 where id = ?").run(c.commit_id));
  check("an expired commit", (await race(a, { client_seed: "late" })).status === 409);
  await stopServer();
  await startServer({ RACE_MAX_DAY: "700" });
  c = await commit(a);
  const capped = await race(a, { client_seed: "one-more", stake: "200" });
  check("the daily limit holds (600 staked, 700 a day)", capped.status === 400 && /a day/.test(capped.json?.error ?? ""), JSON.stringify(capped.json));

  // ---- the books and the house
  const adm = await api("/api/admin/race", null, undefined, true);
  check("admin: races and the house's net", adm.status === 200 && JSON.stringify(adm.json) === JSON.stringify({
    on: true, paused: false, live_races: 0, races: 4, house_net_all: "-350", house_net_24h: "-350",
  }), JSON.stringify(adm.json));
  check("admin is admin only", (await api("/api/admin/race", null)).status === 403);
  await api("/api/roulette/terms", b, { over18: true, accept: true });
  c = await commit(b);
  check("an empty balance", (await race(b, { client_seed: "bob" })).status === 402);
  check("an unknown race", (await api("/api/race/races/00000000-0000-0000-0000-000000000000", null)).status === 404);

  // ---- the house stop: a pretend race the house lost badly
  dbDo((db) => db.prepare(`insert into race_games (id, wallet, bet, pick, stake_wei, payout_wei, edge, commit_hash, server_seed, client_seed, names, status, won, finish, created_at, done_at)
    values ('00000000-0000-0000-0000-000000000001', ?, 'win', 0, '0', ?, 0.05, 'x', 'x', 'x', '[]', 'done', 1, '[0,1,2,3,4,5]', ?, ?)`)
    .run(bob.address, (100_000n * WEI).toString(), Date.now(), Date.now()));
  check("the house stop pauses racing", (await api("/api/race/config", null)).json.paused === true && (await api("/api/race/commit", a, {})).status === 503
    && (await api("/api/admin/race", null, undefined, true)).json.paused === true);

  // ---- the off switch
  await stopServer();
  await startServer({ RACE_ON: "0" });
  check("off means off", (await api("/api/race/config", null)).json.on === false && (await api("/api/race/commit", a, {})).status === 503);
  check("history still readable when it's off", (await api("/api/race/me", a)).status === 200 && (await api(`/api/race/races/${p1.id}`, null)).json.won === true);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stopServer();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
