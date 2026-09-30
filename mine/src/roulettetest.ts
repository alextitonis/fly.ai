/**
 * Fly Roulette bets end to end on a local chain: anvil + a test token + a real server, its ledger and games in a
 * local Postgres (PGlite, src/pgtest.ts).
 * - balances are the ledger's rows;
 * - deposits by transfer, credited once and only to the sender;
 * - terms, limits (min, max, per day, biggest payout) and one live game per wallet;
 * - a bet is debited, played by the server, settled once (exactly stake x flies x 0.95 on a win), and its server
 *   seed revealed matches the commit; the revealed seeds replayed here give the same events;
 * - a server killed mid-game plays the game on from its seeds after a restart and settles it once;
 * - withdrawal requests and the operator's withdrawal; the house's books; the house stop; the off switch.
 * Plays real brain turns on the CPU (a few minutes). Needs Foundry (anvil, forge) on PATH.
 *
 *   npm run test:roulette
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ConnectomeBrain, cells } from "../../world/src/connectome.ts";
import { deriveRng, playGame, setup, type GameEvent } from "../../world/src/roulette/game.ts";
import { groups, runTurn } from "../../world/src/roulette/readout.ts";
import { loadModel } from "./load.ts";
import { startPg } from "./pgtest.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const RPC = "http://127.0.0.1:8548";
const PORT = 8784;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-roulettetest-${process.pid}.db`);
const CONTRACTS = fileURLToPath(new URL("../contracts/", import.meta.url));
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
const PG = await startPg(5541);

const anvil = spawn("anvil", ["--port", "8548"], { stdio: ["ignore", "pipe", "ignore"] });
const anvilKeys: string[] = await new Promise((resolve, reject) => {
  let out = "";
  anvil.stdout!.on("data", (d) => {
    out += d;
    const keys = [...out.matchAll(/\(\d+\) 0x([0-9a-f]{64})/g)].map((m) => m[1]);
    if (keys.length >= 3 && out.includes("Listening on")) resolve(keys);
  });
  anvil.on("exit", () => reject(new Error("anvil exited")));
});
const [owner, alice, bob] = anvilKeys.slice(0, 3).map((k) => {
  const sk = Uint8Array.from(Buffer.from(k, "hex"));
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { key: `0x${k}`, address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});

const selector = (sig: string) => hex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4));
const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const calldata = (sig: string, ...args: (bigint | string)[]) => `0x${selector(sig)}${args.map(word).join("")}`;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (res.error) throw new Error(res.error.message);
  return res.result;
}
async function sendTx(from: string, to: string, data: string): Promise<string> {
  const hash = await rpc("eth_sendTransaction", [{ from, to, data }]);
  for (let i = 0; i < 50; i++) {
    if (await rpc("eth_getTransactionReceipt", [hash])) return hash;
    await sleep(100);
  }
  throw new Error("no receipt");
}

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
let token = "";
async function startServer(extra: Record<string, string> = {}): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50",
      ADMIN_TOKEN: ADMIN, TOKEN_ADDRESS: token, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "anvil", CLAIM_RPC: RPC, CLAIM_EXPLORER: "http://localhost",
      PAY_TO: owner.address, SEED_PAID: "0",
      ROULETTE_ON: "1", ROULETTE_EDGE: "0.05", ROULETTE_MIN_BET: "10", ROULETTE_MAX_BET: "1000", ROULETTE_MAX_DAY: "3000",
      ROULETTE_MAX_PAYOUT: "5000", ROULETTE_HOUSE_STOP: "100000", ROULETTE_MAX_LIVE: "8",
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

/** Waits for a game to finish; returns its final view (every event). */
async function finished(id: string, maxS = 240): Promise<any> {
  for (let i = 0; i < maxS; i++) {
    const g = (await api(`/api/roulette/games/${id}`, null)).json;
    if (g.status !== "live") return g;
    await sleep(1000);
  }
  throw new Error(`game ${id} didn't finish`);
}

/** The game again, here, from its revealed seeds: the same rules, engine and turns as the server's worker. */
let model: ReturnType<typeof loadModel> | null = null;
async function replay(serverSeed: string, clientSeed: string, flies: number): Promise<GameEvent[]> {
  model ??= loadModel(CONNECTOME);
  const g = groups(model.meta, cells);
  const rng = await deriveRng(serverSeed, clientSeed);
  const table = setup(flies, rng);
  const brains: ConnectomeBrain[] = [];
  const out: GameEvent[] = [];
  for await (const e of playGame(table, rng, (i, chamber) => runTurn(brains[i] ??= new ConnectomeBrain(model!.w, model!.meta.params, table.seeds[i]), g, chamber))) out.push(e);
  return out;
}

try {
  for (let i = 0; ; i++) {
    try { await rpc("eth_chainId", []); break; } catch { if (i > 50) throw new Error("anvil didn't start"); await sleep(200); }
  }
  const out = execFileSync("forge", ["create", "test/MonthlyClaims.t.sol:TestToken", "--rpc-url", RPC, "--private-key", owner.key, "--broadcast"],
    { cwd: CONTRACTS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  token = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(out)![1];
  for (const w of [alice, bob]) await sendTx(owner.address, token, calldata("mint(address,uint256)", w.address, 100_000n * WEI));
  const payIn = (from: string, amount: bigint) => sendTx(from, token, calldata("transfer(address,uint256)", owner.address, amount * WEI));

  // ---- a balance is the ledger's rows: a compute deposit, an order funded from it, the order's unspent part back
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  // booked once the server has started: its first start copies the (empty) SQLite money tables into an empty Postgres
  await startServer();
  const add = (kind: string, amount: bigint, tx: string | null) =>
    PG.pg.run("insert into mine.ledger (wallet, order_id, kind, amount_wei, tx, at) values (?, null, ?, ?, ?, 1)", bob.address, kind, (amount * WEI).toString(), tx);
  await add("deposit", 700n, "0x" + "ab".repeat(32));
  await add("fund", 200n, null);
  await add("release", 50n, null);
  check("a balance is deposits and releases less funding", (await api(`/api/balance?wallet=${bob.address}`, null)).json.balance === "550");

  // ---- sign-in and config
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const cfg = (await api("/api/roulette/config", null)).json;
  check("config: on, limits and multipliers", cfg.on && !cfg.paused && cfg.min_bet === "10" && cfg.max_bet === "1000" && cfg.multipliers["2"] === 1.9 && cfg.multipliers["10"] === 9.5);
  check("no session, no account", (await api("/api/roulette/me", null)).status === 401);
  const a = await signIn(alice), b = await signIn(bob);

  // ---- deposits
  const tx1 = await payIn(alice.address, 5000n);
  const dep = await api("/api/balance/deposit", a, { tx: tx1 });
  check("a transfer to the deposit address is credited", dep.status === 200 && dep.json.deposited === "5000" && dep.json.balance === "5000", JSON.stringify(dep.json));
  check("the same transaction twice is refused", (await api("/api/balance/deposit", a, { tx: tx1 })).status === 409);
  const tx2 = await payIn(alice.address, 10n);
  check("someone else's transfer isn't yours", (await api("/api/balance/deposit", b, { tx: tx2 })).status === 402);
  check("nor is the same hash in capitals", (await api("/api/balance/deposit", a, { tx: tx1.toUpperCase().replace("0X", "0x") })).status === 409);
  {
    // a transfer that already paid a compute order sits in the same ledger: it can't be a deposit too
    const tx3 = await payIn(alice.address, 300n);
    await PG.pg.run("insert into mine.ledger (wallet, order_id, kind, amount_wei, tx, at) values (?, 'some-order', 'deposit', ?, ?, ?)", alice.address, (300n * WEI).toString(), tx3.toLowerCase(), Date.now());
    await PG.pg.run("insert into mine.ledger (wallet, order_id, kind, amount_wei, at) values (?, 'some-order', 'fund', ?, ?)", alice.address, (300n * WEI).toString(), Date.now());
    const r = await api("/api/balance/deposit", a, { tx: tx3 });
    check("an order's payment can't be claimed as a deposit", r.status === 409 && (await api("/api/roulette/me", a)).json.balance === "5000", `${r.status}`);
  }
  // transfers to PAY_TO (the dev wallet) from before deposits opened were for something else
  await stopServer();
  await startServer({ ROULETTE_DEPOSITS_SINCE: new Date(Date.now() + 3_600_000).toISOString() });
  const old = await api("/api/balance/deposit", a, { tx: tx2 });
  check("a transfer older than deposits isn't credited", old.status === 402 && /older/.test(old.json.error ?? JSON.stringify(old.json)), JSON.stringify(old.json));
  await stopServer();
  await startServer();
  const late = await api("/api/balance/deposit", a, { tx: tx2 });
  check("a transfer the page never reported is credited later by its hash", late.status === 200 && late.json.balance === "5010", JSON.stringify(late.json));

  // ---- terms and limits
  const commit = async (s: string) => (await api("/api/roulette/commit", s, {})).json;
  let c = await commit(a);
  check("a commit is a sha256 hash", /^[0-9a-f]{64}$/.test(c.hash));
  const bet = (s: string, body: object) => api("/api/roulette/games", s, { commit_id: c.commit_id, client_seed: "alice-seed-1", flies: 2, pick: 0, stake: "100", ...body });
  check("no bets before the terms", (await bet(a, {})).status === 403);
  check("the terms need 18+", (await api("/api/roulette/terms", a, { over18: false, accept: true })).status === 400);
  check("terms accepted", (await api("/api/roulette/terms", a, { over18: true, accept: true })).status === 200);
  check("below the smallest bet", (await bet(a, { stake: "5" })).status === 400);
  check("above the biggest bet", (await bet(a, { stake: "2000" })).status === 400);
  check("a win can't pay past the cap", (await bet(a, { stake: "1000", flies: 10 })).status === 400);
  check("11 flies don't fit", (await bet(a, { flies: 11 })).status === 400);
  check("a seat that isn't at the table", (await bet(a, { pick: 2 })).status === 400);
  check("a bad client seed", (await bet(a, { client_seed: "no spaces" })).status === 400);
  check("someone else's commit", (await api("/api/roulette/games", b, { commit_id: c.commit_id, client_seed: "x", flies: 2, pick: 0, stake: "100" })).status === 404);

  // ---- a game
  const placed = await bet(a, {});
  check("bet placed, the table seated", placed.status === 200 && placed.json.status === "live" && placed.json.names.length === 2 && placed.json.server_seed === null, JSON.stringify(placed.json).slice(0, 200));
  check("the stake leaves the balance", (await api("/api/roulette/me", a)).json.balance === "4910");
  check("a used commit can't be used again", (await bet(a, {})).status === 409);
  c = await commit(a);
  check("one game at a time", (await bet(a, {})).status === 409);
  const g1 = await finished(placed.json.id);
  const turns = g1.events.filter((e: any) => e.type === "turn");
  const end = g1.events.at(-1);
  check("the game plays to one winner", g1.status === "done" && end.type === "end" && end.winner === g1.winner && turns.length >= 1 && g1.events.every((e: any, k: number) => e.seq === k), `${turns.length} turns, winner ${g1.winner}`);
  check("the server seed is revealed and matches the commit", !!g1.server_seed && sha256hex(g1.server_seed) === g1.commit_hash);
  const expectBal = g1.won ? 4910 + 190 : 4910;
  check(`settled once: ${g1.won ? "won 1.9x" : "lost"}`, (await api("/api/roulette/me", a)).json.balance === String(expectBal));
  const again = await replay(g1.server_seed, g1.client_seed, g1.flies);
  check("the revealed seeds replay to the same game", JSON.stringify(again) === JSON.stringify(g1.events.map(({ seq: _s, ...e }: any) => e)));
  check("the names follow from the seeds", JSON.stringify(setup(2, await deriveRng(g1.server_seed, g1.client_seed)).names) === JSON.stringify(g1.names));

  // ---- a restart in the middle of a game
  c = await commit(a);
  const long = await bet(a, { flies: 6, pick: 3, stake: "200", client_seed: "restart-me" });
  check("a 6-fly bet", long.status === 200, JSON.stringify(long.json).slice(0, 160));
  for (let i = 0; i < 120; i++) {
    const g = (await api(`/api/roulette/games/${long.json.id}`, null)).json;
    if (g.events.length >= 2 || g.status !== "live") break;
    await sleep(500);
  }
  const before = (await api(`/api/roulette/games/${long.json.id}`, null)).json;
  await stopServer();
  await startServer();
  const g2 = await finished(long.json.id);
  {
    const bets = (await PG.pg.one<{ n: number }>("select count(*) as n from mine.ledger where tx = ?", `roulette:${g2.id}`))!.n;
    const wins = (await PG.pg.one<{ n: number }>("select count(*) as n from mine.ledger where tx = ?", `roulette-win:${g2.id}`))!.n;
    check("after a restart the game plays on and settles once", before.status === "live" && before.events.length >= 1 && g2.status === "done" && bets === 1 && wins === (g2.won ? 1 : 0),
      `${before.events.length} events before the restart, ${g2.events.length} after`);
  }
  const again2 = await replay(g2.server_seed, g2.client_seed, g2.flies);
  check("and it's the same game the seeds give", JSON.stringify(again2) === JSON.stringify(g2.events.map(({ seq: _s, ...e }: any) => e)));

  // ---- the daily limit (3000): 100 + 200 staked so far
  const me = (await api("/api/roulette/me", a)).json;
  check("my history", me.history.length === 2 && me.day_staked === "300" && me.terms_accepted && me.live_game === null);
  for (const stake of ["1000", "1000"]) {
    c = await commit(a);
    const r = await bet(a, { stake, flies: 2, client_seed: `day-${stake}-${Math.random().toString(36).slice(2)}` });
    if (r.status === 200) await finished(r.json.id);
  }
  c = await commit(a);
  check("the daily limit holds", (await bet(a, { stake: "1000" })).status === 400);

  // ---- withdrawals
  const bal = Number((await api("/api/roulette/me", a)).json.balance);
  check("can't ask for more than the balance", (await api("/api/balance/withdraw-request", a, { amount: String(bal + 1) })).status === 400);
  check("a withdrawal request", (await api("/api/balance/withdraw-request", a, { amount: "100" })).json.withdraw_request?.amount === "100");
  check("one request at a time", (await api("/api/balance/withdraw-request", a, { amount: "50" })).status === 409);
  const cancelled = await api("/api/balance/withdraw-cancel", a, {});
  check("the player cancels it: no request, the balance as it was", cancelled.status === 200 && cancelled.json.withdraw_request === null && Number(cancelled.json.balance) === bal, JSON.stringify(cancelled.json).slice(0, 160));
  check("nothing left to cancel", (await api("/api/balance/withdraw-cancel", a, {})).status === 404);
  check("and asks again", (await api("/api/balance/withdraw-request", a, { amount: "100" })).json.withdraw_request?.amount === "100");
  const adm = (await api("/api/admin/roulette", null, undefined, true)).json;
  check("admin sees the request, the house's books and what's held", adm.withdraw_requests.length === 1 && adm.games_played === 4 && typeof adm.balances_held === "string", JSON.stringify(adm).slice(0, 240));
  const sentBack = await sendTx(owner.address, token, calldata("transfer(address,uint256)", alice.address, 100n * WEI));
  const w = await api("/api/admin/withdraw", null, { wallet: alice.address, amount: "100", tx: sentBack }, true);
  check("the operator's withdrawal closes the request", w.status === 200 && (await api("/api/roulette/me", a)).json.withdraw_request === null
    && Number((await api("/api/roulette/me", a)).json.balance) === bal - 100);

  // ---- the house: its net matches the games, and a big loss pauses betting
  {
    let net = 0n;
    for (const r of await PG.pg.all<any>("select stake_wei, payout_wei, pick, winner from mine.roulette_games where status = 'done'")) {
      net += BigInt(r.stake_wei) - (r.winner === r.pick ? BigInt(r.payout_wei) : 0n);
    }
    check("the house's net is stakes less winnings", (await api("/api/admin/roulette", null, undefined, true)).json.house_net_all === String(Number(net) / 1e18).replace(/\.0+$/, "") || Number((await api("/api/admin/roulette", null, undefined, true)).json.house_net_all) === Number(net) / 1e18);
    // a pretend game the house lost badly, to trip the stop
    await PG.pg.run(`insert into mine.roulette_games (id, wallet, flies, pick, stake_wei, payout_wei, edge, commit_hash, server_seed, client_seed, names, status, winner, created_at, done_at)
      values ('00000000-0000-0000-0000-000000000000', ?, 10, 0, '0', ?, 0.05, 'x', 'x', 'x', '[]', 'done', 0, ?, ?)`, bob.address, (200000n * WEI).toString(), Date.now(), Date.now());
  }
  check("the house stop pauses betting", (await api("/api/roulette/config", null)).json.paused === true && (await api("/api/roulette/commit", a, {})).status === 503);

  // ---- the off switch
  await stopServer();
  await startServer({ ROULETTE_ON: "0" });
  check("off means off", (await api("/api/roulette/config", null)).json.on === false && (await api("/api/roulette/commit", a, {})).status === 503);
  check("balances still readable when it's off", (await api("/api/roulette/me", a)).status === 200);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stopServer();
  anvil.kill();
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
