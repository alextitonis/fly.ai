/**
 * Fly Slots spins end to end against a real server (2026-09-29), its ledger and spins in a local Postgres
 * (src/pgtest.ts). No chain: balances are booked straight into the ledger, as a deposit would book them (deposits
 * themselves are roulette's, tested in roulettetest.ts).
 * - config: limits, the paytable and the exact RTP (62226/65536);
 * - commit-reveal: the commit is sha256(server seed), the seed is revealed with the spin, and replaying
 *   spin(server_seed, client_seed) with world/src/slots/game.ts gives the same stops, symbols and multiple;
 * - a spin books a `bet` and, on a win, a `payout` of exactly stake x mult, once each (unique tx strings);
 * - terms (roulette's), limits (min, max, per day, the top prize under the payout cap), the balance;
 * - a used or expired commit is refused, and someone else's;
 * - the house's books, the house stop, the off switch.
 *
 *   npm run test:slots
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { spin, STRIP } from "../../world/src/slots/game.ts";
import { startPg } from "./pgtest.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8786;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-slotstest-${process.pid}.db`);
const WEI = 10n ** 18n;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const PG = await startPg(5542);

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
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50",
      ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none", CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost",
      SEED_PAID: "0",
      // 400x the biggest stake would be 40,000: past the 20,000 cap, so stakes over 50 are refused
      SLOTS_ON: "1", SLOTS_MIN_BET: "10", SLOTS_MAX_BET: "100", SLOTS_MAX_DAY: "500", SLOTS_MAX_PAYOUT: "20000", SLOTS_HOUSE_STOP: "100000",
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
try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  await startServer();

  // ---- config
  const cfg = (await api("/api/slots/config", null)).json;
  check("config: on, limits, top prize, strip and pays", cfg.on === true && cfg.paused === false && cfg.min_bet === "10" && cfg.max_bet === "100"
    && cfg.max_day === "500" && cfg.max_payout === "20000" && cfg.top_mult === 400 && cfg.strip.length === 32 && cfg.pays.three.crown === 400 && cfg.pays.crown === 3,
    JSON.stringify(cfg).slice(0, 200));
  check("config: RTP is exactly 62226/65536", cfg.rtp === 62226 / 65536 && cfg.hit > 0.17 && cfg.hit < 0.19, `rtp ${cfg.rtp}, hit ${cfg.hit}`);

  // ---- sign-in and balances (booked as a deposit books them)
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  check("no session, no account", (await api("/api/slots/me", null)).status === 401);
  const a = await signIn(alice), b = await signIn(bob);
  await PG.pg.run("insert into mine.ledger (wallet, order_id, kind, amount_wei, tx, at) values (?, null, 'deposit', ?, ?, ?)",
    alice.address, (10_000n * WEI).toString(), "0x" + "ab".repeat(32), Date.now());
  check("the balance shows", (await api("/api/slots/me", a)).json.balance === "10000");

  // ---- commits, terms and limits
  const commit = async (s: string) => (await api("/api/slots/commit", s, {})).json;
  let c = await commit(a);
  check("a commit is a sha256 hash with an expiry", /^[0-9a-f]{64}$/.test(c.hash) && /^[0-9a-f-]{36}$/.test(c.commit_id) && c.expires_at > Date.now());
  const doSpin = (s: string, body: object) => api("/api/slots/spins", s, { commit_id: c.commit_id, client_seed: "alice-seed-1", stake: "50", ...body });
  check("no spins before the terms", (await doSpin(a, {})).status === 403);
  check("the roulette terms cover slots", (await api("/api/roulette/terms", a, { over18: true, accept: true })).status === 200
    && (await api("/api/slots/me", a)).json.terms_accepted === true);
  check("below the smallest spin", (await doSpin(a, { stake: "5" })).status === 400);
  check("above the biggest spin", (await doSpin(a, { stake: "200" })).status === 400);
  const top = await doSpin(a, { stake: "51" });
  check("a stake whose top prize passes the payout cap", top.status === 400 && /top prize/.test(top.json?.error ?? ""), JSON.stringify(top.json));
  check("a bad client seed", (await doSpin(a, { client_seed: "no spaces" })).status === 400);
  check("a bad stake", (await doSpin(a, { stake: "lots" })).status === 400);
  check("someone else's commit", (await api("/api/slots/spins", b, { commit_id: c.commit_id, client_seed: "x", stake: "50" })).status === 404);

  // ---- a spin: decided, settled and revealed in one answer
  const first = await doSpin(a, {});
  const s1 = first.json;
  check("a spin", first.status === 200 && /^[0-9a-f-]{36}$/.test(s1.id) && s1.stake === "50" && s1.stops.length === 3 && s1.symbols.length === 3
    && s1.client_seed === "alice-seed-1" && typeof s1.created_at === "number", JSON.stringify(s1).slice(0, 300));
  check("the seed is revealed and matches the commit", s1.commit_hash === c.hash && sha256hex(s1.server_seed) === c.hash);
  const again = await spin(s1.server_seed, s1.client_seed);
  check("replaying spin(server_seed, client_seed) gives the same spin", JSON.stringify(again.stops) === JSON.stringify(s1.stops)
    && JSON.stringify(again.symbols) === JSON.stringify(s1.symbols) && again.mult === s1.mult && again.line === s1.line
    && s1.symbols.every((sym: string, i: number) => STRIP[s1.stops[i]] === sym), JSON.stringify(again));
  check("the payout is stake x mult, and the balance moved by exactly that", s1.payout === String(50 * s1.mult) && s1.balance === String(10_000 - 50 + 50 * s1.mult),
    `mult ${s1.mult}, balance ${s1.balance}`);
  const view = (await api(`/api/slots/spins/${s1.id}`, null)).json;
  const { balance: _b, ...noBalance } = s1;
  check("GET the spin: the same, without the balance", JSON.stringify(view) === JSON.stringify(noBalance) && view.balance === undefined);
  check("an unknown spin", (await api("/api/slots/spins/00000000-0000-0000-0000-000000000000", null)).status === 404);
  check("a used commit can't be used again", (await doSpin(a, { client_seed: "another" })).status === 409);
  c = await commit(a);
  await PG.pg.run("update mine.slots_commits set created_at = created_at - 16 * 60000 where id = ?", c.commit_id);
  check("an expired commit", (await doSpin(a, {})).status === 409);

  // ---- the daily limit (500): ten spins of 50, then no more
  for (let i = 0; i < 9; i++) {
    c = await commit(a);
    const r = await doSpin(a, { client_seed: `day-${i}` });
    if (r.status !== 200) check(`spin ${i + 2}`, false, JSON.stringify(r.json));
  }
  c = await commit(a);
  const capped = await doSpin(a, { client_seed: "one-more", stake: "10" });
  check("the daily limit holds", capped.status === 400 && /a day/.test(capped.json?.error ?? ""), JSON.stringify(capped.json));
  const me = (await api("/api/slots/me", a)).json;
  check("my history and day", me.history.length === 10 && me.day_staked === "500" && me.wallet === alice.address && me.withdraw_request === null
    && me.history.every((h: any) => h.stake === "50" && h.payout === String(50 * h.mult) && h.symbols.length === 3), JSON.stringify(me).slice(0, 300));

  // ---- the books: one bet per spin, one payout per win, the balance their sum
  {
    const bets = await PG.pg.all<{ tx: string; amount_wei: string }>("select tx, amount_wei from mine.ledger where kind = 'bet' and tx like 'slots:%'");
    const wins = await PG.pg.all<{ tx: string; amount_wei: string }>("select tx, amount_wei from mine.ledger where kind = 'payout' and tx like 'slots-win:%'");
    const spins = await PG.pg.all<{ id: string; stake_wei: string; mult: number; payout_wei: string }>("select id, stake_wei, mult, payout_wei from mine.slots_spins");
    const won = spins.filter((s) => s.mult > 0);
    const exact = spins.every((s) => bets.some((r) => r.tx === `slots:${s.id}` && r.amount_wei === s.stake_wei)
      && (s.mult > 0 ? wins.some((r) => r.tx === `slots-win:${s.id}` && BigInt(r.amount_wei) === BigInt(s.stake_wei) * BigInt(s.mult)) : !wins.some((r) => r.tx === `slots-win:${s.id}`)));
    const paid = won.reduce((t, s) => t + BigInt(s.payout_wei), 0n);
    check("one bet per spin, one payout of stake x mult per win", bets.length === 10 && wins.length === won.length && exact, `${won.length} wins`);
    // whole-token stakes x integer multiples: every amount here is whole tokens
    const bal = (await api("/api/slots/me", a)).json.balance;
    check("the balance is deposits less stakes plus winnings", paid % WEI === 0n && bal === String(10_000n - 500n + paid / WEI), `balance ${bal}, won ${paid / WEI}`);
    const adm = await api("/api/admin/slots", null, undefined, true);
    check("admin: spins and the house's net", adm.status === 200 && adm.json.on === true && adm.json.paused === false && adm.json.spins === 10
      && adm.json.house_net_all === String((500n * WEI - paid) / WEI) && adm.json.house_net_24h === adm.json.house_net_all, JSON.stringify(adm.json));
    check("admin is admin only", (await api("/api/admin/slots", null)).status === 403);
  }

  // ---- no balance, no spin
  await api("/api/roulette/terms", b, { over18: true, accept: true });
  c = await commit(b);
  check("an empty balance", (await doSpin(b, { client_seed: "bob" })).status === 402);

  // ---- the house stop: a pretend spin the house lost badly (past the 100,000 stop whatever the ten real spins paid)
  await PG.pg.run(`insert into mine.slots_spins (id, wallet, stake_wei, mult, payout_wei, stops, symbols, commit_hash, server_seed, client_seed, created_at)
    values ('00000000-0000-0000-0000-000000000001', ?, ?, 400, ?, '[15,15,15]', '["crown","crown","crown"]', 'x', 'x', 'x', ?)`,
    bob.address, (250n * WEI).toString(), (101_000n * WEI).toString(), Date.now());
  check("the house stop pauses spins", (await api("/api/slots/config", null)).json.paused === true && (await api("/api/slots/commit", a, {})).status === 503
    && (await api("/api/admin/slots", null, undefined, true)).json.paused === true);

  // ---- the off switch
  await stopServer();
  await startServer({ SLOTS_ON: "0" });
  check("off means off", (await api("/api/slots/config", null)).json.on === false && (await api("/api/slots/commit", a, {})).status === 503);
  check("history still readable when it's off", (await api("/api/slots/me", a)).status === 200);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stopServer();
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
