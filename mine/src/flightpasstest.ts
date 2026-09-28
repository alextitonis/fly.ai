/**
 * FlightPass end to end on a local chain: anvil + a test token + stand-in pass and market contracts + a real server.
 * - a schema 16 ledger upgrades to 17 (kinds prefund and fee) with every row kept;
 * - the team's prefund, once per existing pass, locked: played but never withdrawn;
 * - deposits by the owner only; withdrawals only after a deposit, only above the prefund, 99% to send + 1% fee,
 *   cancelled back or marked paid by the operator;
 * - a listed pass takes no deposits, withdrawals or setting changes;
 * - settings need the roulette terms, belong to the owner who wrote them and lapse when the pass changes hands;
 * - the autopilot bets from the pass, within its daily cap, and stops for a new owner;
 * - the Flybook worker's list (its key only, unlisted passes with a Flybook game on);
 * - the mining boost: x1.25 on the points of a wallet-day a pass was held throughout, none on a broken day;
 * - off without FLIGHTPASS.
 * Plays a few real brain turns on the CPU (a minute or two). Needs Foundry (anvil, forge) on PATH.
 *
 *   npm run test:flightpass
 */
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const RPC = "http://127.0.0.1:8549";
const PORT = 8785;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const WORKER = "test-worker-key";
const DB = join(tmpdir(), `mine-flightpasstest-${process.pid}.db`);
const CONTRACTS = fileURLToPath(new URL("../contracts/", import.meta.url));
const WEI = 10n ** 18n;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const anvil = spawn("anvil", ["--port", "8549"], { stdio: ["ignore", "pipe", "ignore"] });
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
const word = (v: bigint | string | boolean) => (typeof v === "boolean" ? (v ? 1n : 0n).toString(16).padStart(64, "0")
  : typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const calldata = (sig: string, ...args: (bigint | string | boolean)[]) => `0x${selector(sig)}${args.map(word).join("")}`;

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
const deploy = (what: string) => /Deployed to: (0x[0-9a-fA-F]{40})/.exec(execFileSync("forge", ["create", what, "--rpc-url", RPC, "--private-key", owner.key, "--broadcast"],
  { cwd: CONTRACTS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))![1];

async function api(path: string, session: string | null, body?: unknown, auth?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(session ? { "x-flyai-session": session } : {}),
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let server: ReturnType<typeof spawn> | null = null;
let token = "", pass = "", market = "";
async function startServer(extra: Record<string, string> = {}): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50",
      ADMIN_TOKEN: ADMIN, TOKEN_ADDRESS: token, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "anvil", CLAIM_RPC: RPC, CLAIM_EXPLORER: "http://localhost",
      PAY_TO: owner.address, SEED_PAID: "0",
      ROULETTE_ON: "1", ROULETTE_EDGE: "0.05", ROULETTE_MIN_BET: "10", ROULETTE_MAX_BET: "1000", ROULETTE_MAX_DAY: "3000",
      ROULETTE_MAX_PAYOUT: "5000", ROULETTE_HOUSE_STOP: "100000", ROULETTE_MAX_LIVE: "8",
      FLIGHTPASS: pass, PASSMARKET: market, FLIGHTPASS_WORKER_KEY: WORKER, FLIGHTPASS_TICK_SEC: "1", FLIGHTPASS_BET_GAP_MIN: "0",
      FLIGHTPASS_DEPOSITS_SINCE: "2020-01-01T00:00:00Z",
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

try {
  for (let i = 0; ; i++) {
    try { await rpc("eth_chainId", []); break; } catch { if (i > 50) throw new Error("anvil didn't start"); await sleep(200); }
  }
  token = deploy("test/MonthlyClaims.t.sol:TestToken");
  pass = deploy("test/MockFlightPass.sol:MockFlightPass");
  market = deploy("test/MockFlightPass.sol:MockPassMarket");
  for (const w of [alice, bob]) await sendTx(owner.address, token, calldata("mint(address,uint256)", w.address, 100_000n * WEI));
  const setOwner = (id: bigint, who: string) => sendTx(owner.address, pass, calldata("set(uint256,address)", id, who));
  const setListed = (id: bigint, on: boolean) => sendTx(owner.address, market, calldata("set(uint256,bool)", id, on));
  await setOwner(1n, alice.address);
  await setOwner(2n, bob.address);
  await setOwner(3n, alice.address);
  const payIn = (from: string, amount: bigint) => sendTx(from, token, calldata("transfer(address,uint256)", owner.address, amount * WEI));

  // ---- a schema 16 ledger upgrades to 17
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  await startServer();
  await stopServer();
  dbDo((db) => {
    db.exec(`
      drop table ledger;
      create table ledger (id integer primary key, wallet text not null, order_id text,
        kind text not null check (kind in ('deposit', 'fund', 'release', 'withdraw', 'charge', 'bet', 'payout')),
        amount_wei text not null, pool_wei text, month text, tx text, at integer not null);
      pragma user_version = 16;`);
    db.prepare("insert into ledger (wallet, order_id, kind, amount_wei, tx, at) values (?, null, 'deposit', ?, ?, 1)").run(bob.address, (700n * WEI).toString(), "0x" + "cd".repeat(32));
  });
  await startServer();
  {
    const [v, sql] = dbDo((db) => [(db.prepare("pragma user_version").get() as { user_version: number }).user_version,
      (db.prepare("select sql from sqlite_master where name = 'ledger'").get() as { sql: string }).sql] as const);
    check("a schema 16 ledger upgrades to 17 with prefund and fee", v === 17 && sql.includes("'prefund'") && sql.includes("'fee'"));
  }
  check("balances survive the upgrade", (await api(`/api/balance?wallet=${bob.address}`, null)).json.balance === "700");

  // ---- config, sign-in, prefund
  const cfg = (await api("/api/flightpass/config", null)).json;
  check("config: on, fee, boost", cfg.on && cfg.withdraw_fee_bps === 100 && cfg.mining_boost === 1.25 && cfg.contract.toLowerCase() === pass.toLowerCase());
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const a = await signIn(alice), b = await signIn(bob);
  check("prefund is admin only", (await api("/api/admin/flightpass/prefund", null, { ids: [1], amount: "500" })).status === 403);
  const pf = await api("/api/admin/flightpass/prefund", null, { ids: [1, 2, 3, 9], amount: "500" }, ADMIN);
  check("prefund: existing passes once, a missing one skipped", pf.status === 200 && pf.json.prefunded === 3 && pf.json.skipped === 1, JSON.stringify(pf.json));
  check("prefund again does nothing", (await api("/api/admin/flightpass/prefund", null, { all: true, amount: "500" }, ADMIN)).json.prefunded === 0);

  const mineA = (await api("/api/flightpass/mine", a)).json;
  check("my passes", mineA.passes.map((p: any) => p.id).join() === "1,3");
  const p1 = mineA.passes[0];
  check("a prefunded pass: all locked, nothing to withdraw", p1.balance === "500" && p1.locked === "500" && p1.withdrawable === "0" && !p1.has_deposited, JSON.stringify(p1).slice(0, 200));
  const pub = (await api("/api/flightpass/2", a)).json;
  check("someone else's pass: balance but no settings", pub.balance === "500" && pub.owner === bob.address && pub.settings === undefined);

  // ---- deposits and withdrawals
  check("no withdrawal before a deposit", (await api("/api/flightpass/1/withdraw", a, { amount: "1" })).status === 403);
  const txA = await payIn(alice.address, 1000n);
  check("only the owner deposits", (await api("/api/flightpass/1/deposit", b, { tx: txA })).status === 403);
  const dep = await api("/api/flightpass/1/deposit", a, { tx: txA });
  check("a deposit, no fee", dep.status === 200 && dep.json.balance === "1500" && dep.json.withdrawable === "1000" && dep.json.has_deposited, JSON.stringify(dep.json).slice(0, 200));
  check("the same transaction twice", (await api("/api/flightpass/1/deposit", a, { tx: txA })).status === 409);
  check("not the prefund", (await api("/api/flightpass/1/withdraw", a, { amount: "1000.5" })).status === 400);
  const wd = await api("/api/flightpass/1/withdraw", a, { amount: "1000" });
  check("a withdrawal: 990 to send, 10 fee, leaves the pass at once", wd.status === 200 && wd.json.balance === "500" && wd.json.withdrawals[0].amount === "990" && wd.json.withdrawals[0].fee === "10", JSON.stringify(wd.json.withdrawals));
  const adm = (await api("/api/admin/flightpass", null, undefined, ADMIN)).json;
  check("the operator sees it", adm.withdrawals.length === 1 && adm.withdrawals[0].send === "990" && adm.withdrawals[0].wallet === alice.address && adm.locked === "1500", JSON.stringify(adm).slice(0, 300));
  const wid = adm.withdrawals[0].id;
  check("cancelled: it all goes back", (await api("/api/admin/flightpass/withdrawal", null, { id: wid, cancel: true }, ADMIN)).status === 200
    && (await api("/api/flightpass/1", a)).json.balance === "1500");
  await api("/api/flightpass/1/withdraw", a, { amount: "100" });
  const w2 = (await api("/api/admin/flightpass", null, undefined, ADMIN)).json.withdrawals[0];
  const sent = await sendTx(owner.address, token, calldata("transfer(address,uint256)", alice.address, 99n * WEI));
  check("paid", (await api("/api/admin/flightpass/withdrawal", null, { id: w2.id, tx: sent }, ADMIN)).json.status === "paid"
    && (await api("/api/flightpass/1", a)).json.balance === "1400"
    && (await api("/api/admin/flightpass/withdrawal", null, { id: w2.id, cancel: true }, ADMIN)).status === 409);

  // ---- listed: everything stops
  await setListed(1n, true);
  const txL = await payIn(alice.address, 10n);
  check("listed: no deposits", (await api("/api/flightpass/1/deposit", a, { tx: txL })).status === 409);
  check("listed: no withdrawals", (await api("/api/flightpass/1/withdraw", a, { amount: "1" })).status === 409);
  check("listed: no setting changes", (await api("/api/flightpass/1/settings", a, { flybook: { missions: true } })).status === 409);
  check("listed: shows it, nothing withdrawable", (await api("/api/flightpass/1", a)).json.listed === true && (await api("/api/flightpass/1", a)).json.withdrawable === "0");
  await setListed(1n, false);
  check("unlisted: the deposit goes through", (await api("/api/flightpass/1/deposit", a, { tx: txL })).json.balance === "1410");

  // ---- settings and the Flybook worker's list
  const roulette = { on: true, stake: "100", flies: 2, max_day: "200" };
  check("roulette needs the terms", (await api("/api/flightpass/1/settings", a, { roulette })).status === 403);
  await api("/api/roulette/terms", a, { over18: true, accept: true });
  check("a stake below the smallest bet", (await api("/api/flightpass/1/settings", a, { roulette: { ...roulette, stake: "5" } })).status === 400);
  check("not someone else's pass", (await api("/api/flightpass/2/settings", a, { flybook: { missions: true } })).status === 403);
  check("flybook on for pass 3", (await api("/api/flightpass/3/settings", a, { flybook: { missions: true, duels: true } })).json.settings.flybook.duels === true);
  check("worker list: the key only", (await api("/api/flightpass/autopilot?game=flybook", null, undefined, "wrong")).status === 403);
  let list = (await api("/api/flightpass/autopilot?game=flybook", null, undefined, WORKER)).json.passes;
  check("worker list: pass 3 and its owner", list.length === 1 && list[0].pass === 3 && list[0].owner === alice.address && list[0].settings.missions && !list[0].settings.breed, JSON.stringify(list));
  await setListed(3n, true);
  await api("/api/flightpass/3", a); // a fresh read notices the listing
  list = (await api("/api/flightpass/autopilot?game=flybook", null, undefined, WORKER)).json.passes;
  check("worker list: a listed pass is left out", list.length === 0);
  await setListed(3n, false);
  await api("/api/flightpass/3", a);

  // ---- the autopilot: bets from the pass up to its daily cap
  check("roulette on for pass 1", (await api("/api/flightpass/1/settings", a, { roulette })).json.settings.roulette.on === true);
  let v: any = null;
  for (let i = 0; i < 300; i++) {
    v = (await api("/api/flightpass/1", a)).json;
    if (v.games.length >= 2 && v.games.every((g: any) => g.status !== "live")) break;
    await sleep(1000);
  }
  const won = v.games.filter((g: any) => g.won).length;
  check("the autopilot played two games from the pass", v.games.length === 2 && v.day_bet === "200", `${v.games.length} games, day ${v.day_bet}`);
  check("and the books add up", Number(v.balance) === 1410 - 200 + won * 190, `balance ${v.balance}, won ${won}`);
  await sleep(4000);
  check("the daily cap holds", (await api("/api/flightpass/1", a)).json.games.length === 2);
  check("the player's own roulette balance is untouched", (await api("/api/roulette/me", a)).json.balance === "0");

  // ---- a new owner: the old settings lapse
  await setOwner(1n, bob.address);
  const nb = (await api("/api/flightpass/1", b)).json;
  check("the new owner sees the balance, everything off", nb.owner === bob.address && nb.settings.roulette.on === false && nb.balance === v.balance);
  check("the old owner can't touch it", (await api("/api/flightpass/1/withdraw", a, { amount: "1" })).status === 403);

  // ---- mining: x1.25 on a wallet-day a pass was held throughout
  const today = new Date().toISOString().slice(0, 10);
  const carol = "0x000000000000000000000000000000000000c0Fe", dave = "0x000000000000000000000000000000000000dAvE".replace("dAvE", "dA7E");
  await stopServer();
  dbDo((db) => {
    db.prepare("delete from flightpass_days").run();
    const miner = db.prepare("insert into miners (id, token_hash, created_at, wallet) values (?, ?, 1, ?)");
    const credit = db.prepare("insert into day_credit (day, miner, units, accepted) values (?, ?, 10, 5)");
    const held = db.prepare("insert into flightpass_days (pass, day, wallet, broken, samples) values (?, ?, ?, ?, 3)");
    for (const [id, w] of [["m-alice", alice.address], ["m-carol", carol], ["m-dave", dave]] as const) { miner.run(id, id, w); credit.run(today, id); }
    held.run(3, today, alice.address, 0);
    held.run(7, today, dave, 1); // dave's pass changed hands today
  });
  await startServer({ FLIGHTPASS_SAMPLE_MIN: "600" });
  const wallets = new Map(((await api("/api/month", null)).json.wallets as { wallet: string; points: number }[]).map((r) => [r.wallet, r.points]));
  check("a pass held all day: x1.25", wallets.get(alice.address) === 12.5, `${wallets.get(alice.address)}`);
  check("no pass: x1", wallets.get(carol) === 10, `${wallets.get(carol)}`);
  check("a pass that changed hands that day: x1", wallets.get(dave) === 10, `${wallets.get(dave)}`);

  // ---- off
  await stopServer();
  await startServer({ FLIGHTPASS: "" });
  check("off without FLIGHTPASS", (await api("/api/flightpass/config", null)).json.on === false && (await api("/api/flightpass/mine", a)).status === 503);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stopServer();
  anvil.kill();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
