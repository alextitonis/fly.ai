/**
 * Monthly claims and staking end to end on a local chain: anvil + MonthlyClaims + FlyStaking + a real server.
 * Stake tiers read from the chain, points from a past month with a stake multiplier, the admin snapshot, the
 * owner funding the month on-chain, and a wallet claiming with the calldata the server hands out. Needs Foundry (anvil, forge) on PATH.
 *
 *   npm run test:claims            (add -- --hold to leave everything running for the browser test)
 */
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { startPg } from "./pgtest.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const HOLD = process.argv.includes("--hold");
const RPC = "http://127.0.0.1:8546";
const PORT = 8782;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-claimtest-${process.pid}.db`);
const CONTRACTS = fileURLToPath(new URL("../contracts/", import.meta.url));
const WEI = 10n ** 18n;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

// anvil's development accounts: unlocked on the node, keys read from its startup output
const anvil = spawn("anvil", ["--port", "8546"], { stdio: ["ignore", "pipe", "ignore"] });
const anvilKeys: string[] = await new Promise((resolve, reject) => {
  let out = "";
  anvil.stdout!.on("data", (d) => {
    out += d;
    const keys = [...out.matchAll(/\(\d+\) 0x([0-9a-f]{64})/g)].map((m) => m[1]);
    if (keys.length >= 3 && out.includes("Listening on")) resolve(keys);
  });
  anvil.on("exit", () => reject(new Error("anvil exited")));
});
const KEYS = anvilKeys.slice(0, 3).map((k) => {
  const sk = Uint8Array.from(Buffer.from(k, "hex"));
  const address = checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`);
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { key: `0x${k}`, address, sign };
});
const [owner, alice, bob] = KEYS;

const selector = (sig: string) => hex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4));
const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const calldata = (sig: string, ...args: (bigint | string)[]) => `0x${selector(sig)}${args.map(word).join("")}`;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (res.error) throw new Error(res.error.message);
  return res.result;
}
async function send(from: string, to: string, data: string): Promise<boolean> {
  const hash = await rpc("eth_sendTransaction", [{ from, to, data }]);
  for (let i = 0; i < 50; i++) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt.status === "0x1";
    await sleep(100);
  }
  return false;
}
const reverts = (from: string, to: string, data: string) => rpc("eth_call", [{ from, to, data }, "latest"]).then(() => false, () => true);
const balance = async (token: string, who: string) => BigInt(await rpc("eth_call", [{ to: token, data: calldata("balanceOf(address)", who) }, "latest"]));

async function api(path: string, token: string | null, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function deploy(contract: string, ...args: string[]): string {
  const out = execFileSync("forge", ["create", contract, "--rpc-url", RPC, "--private-key", owner.key, "--broadcast", ...(args.length ? ["--constructor-args", ...args] : [])],
    { cwd: CONTRACTS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const m = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(out);
  if (!m) throw new Error(`forge create ${contract} failed:\n${out}`);
  return m[1];
}

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5532);
try {
  for (let i = 0; ; i++) {
    try { await rpc("eth_chainId", []); break; } catch { if (i > 50) throw new Error("anvil didn't start"); await sleep(200); }
  }
  const unlocked = (await rpc("eth_accounts", [])).map((x: string) => x.toLowerCase());
  check("test wallets are anvil's unlocked accounts", [owner, alice, bob].every((w) => unlocked.includes(w.address.toLowerCase())), bob.address);
  const token = deploy("test/MonthlyClaims.t.sol:TestToken");
  const claims = deploy("src/MonthlyClaims.sol:MonthlyClaims", token, String(90 * 24 * 3600), owner.address);
  const staking = deploy("src/FlyStaking.sol:FlyStaking", token, String(7 * 24 * 3600));
  console.log(`token ${token}, MonthlyClaims ${claims}, FlyStaking ${staking}`);

  // alice stakes 100 on-chain before linking her wallet
  check("alice stakes 100", await send(owner.address, token, calldata("mint(address,uint256)", alice.address, 1000n * WEI))
    && await send(alice.address, token, calldata("approve(address,uint256)", staking, 100n * WEI))
    && await send(alice.address, staking, calldata("stake(uint256)", 100n * WEI)));

  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", OPEN_TARGET: "50",
      STAKING_CONTRACT: staking, STAKE_RPC: RPC, TOKEN_ADDRESS: token,
      STAKE_TIERS: JSON.stringify([{ name: "Holder", min: "0", multiplier: 1 }, { name: "Operator", min: "100", multiplier: 2 }]),
      ADMIN_TOKEN: ADMIN, CLAIMS_CONTRACT: claims, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "anvil", CLAIM_RPC: RPC, CLAIM_EXPLORER: "http://localhost",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* starting */ }
    if (i > 60) throw new Error("server didn't start");
    await sleep(500);
  }

  // three miners: alice's and bob's wallets linked, a third never linked
  const link = async (w: typeof alice) => {
    const { json: { token: t, miner } } = await api("/api/register", null, {});
    const n = await api("/api/auth/nonce", t, { address: w.address });
    await api("/api/auth/verify", null, { nonce: n.json.nonce, signature: w.sign(n.json.message) });
    return { token: t as string, miner: miner as string };
  };
  const a = await link(alice);
  const b = await link(bob);
  const { json: loose } = await api("/api/register", null, {});

  // a past month of checked work, written straight into the database
  const db = new DatabaseSync(DB);
  db.exec("pragma busy_timeout = 5000");
  const tasks = (db.prepare("select id from tasks order by id limit 40").all() as { id: number }[]).map((t) => t.id);
  let n = 0;
  const work = (miner: string, day: string, status: string) =>
    db.prepare("insert into assignments (id, miner, task, issued_at, expires_at, submitted_at, day, result, status) values (?, ?, ?, 0, 0, 0, ?, '{}', ?)")
      .run(`test-${n}`, miner, tasks[n++ % tasks.length], day, status);
  for (let i = 0; i < 4; i++) work(a.miner, "2026-08-10", "accepted"); // 30 units, x2: alice was staked that day
  await PG.pg.run("insert into mine.stake_samples (wallet, day, staked_wei, last_wei, sampled_at) values (?, ?, ?, ?, 0)", alice.address, "2026-08-10", (100n * WEI).toString(), (100n * WEI).toString());
  work(a.miner, "2026-08-11", "accepted");
  work(a.miner, "2026-08-11", "accepted");
  work(a.miner, "2026-08-11", "rejected"); // zeroed day: nothing
  work(b.miner, "2026-08-20", "accepted");
  work(b.miner, "2026-08-20", "accepted"); // 15 points
  work(loose.miner, "2026-08-20", "accepted");
  work(loose.miner, "2026-08-20", "accepted"); // 15 points, no wallet
  // and some of this month: bob 5 jobs at 1x (37.5), alice 2 jobs at 2x, staked all day (30)
  const now = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 5; i++) work(b.miner, now, "accepted");
  for (let i = 0; i < 2; i++) work(a.miner, now, "accepted");
  db.close();

  // ---- this month: rank, days left, estimate only once a pool is announced
  await sleep(61_000); // /api/me's month numbers are cached for a minute
  const meNow = (await api("/api/me", b.token)).json;
  check("rank and days left for the running month", meNow.month_rank === 1 && meNow.month_wallets === 2 && meNow.month_days_left >= 0 && meNow.month_days_left <= 31,
    JSON.stringify({ rank: meNow.month_rank, of: meNow.month_wallets, days: meNow.month_days_left }));
  check("no estimate while no pool is announced", meNow.month_estimate === null && meNow.month_announced_pool === null);
  const current = new Date().toISOString().slice(0, 7);
  check("announcing needs the admin token", (await api("/api/admin/announce", "wrong", { month: current, pool: "1000" })).status === 403);
  check("a finished month can't be announced", (await api("/api/admin/announce", ADMIN, { month: "2026-08", pool: "1000" })).status === 409);
  check("announce this month's pool", (await api("/api/admin/announce", ADMIN, { month: current, pool: "1000" })).json.announced_pool === "1000");
  const est = (await api("/api/me", b.token)).json;
  check("estimate = announced pool x share", est.month_estimate !== null && Math.abs(est.month_estimate - 1000 * est.month_share) < 1e-9, String(est.month_estimate));
  const board = (await api(`/api/month?month=${current}`, null)).json;
  check("leaderboard ranks wallets and shows the pool", board.wallets[0]?.rank === 1 && board.wallets[0].wallet === bob.address && board.announced_pool === "1000" && typeof board.ends_at === "string");
  check("withdraw the announcement", (await api("/api/admin/announce", ADMIN, { month: current, pool: null })).json.announced_pool === null
    && (await api("/api/me", b.token)).json.month_estimate === null);
  check("/compute/leaderboard page served", (await fetch(`${BASE}/compute/leaderboard`)).status === 200 && (await fetch(`${BASE}/compute/mine/web/leaderboard.js`)).status === 200);

  // the stake sampled on-chain when alice linked
  await sleep(500);
  const meA = (await api("/api/me", a.token)).json;
  check("alice's tier read from the chain", meA.stake?.tier === "Operator" && meA.stake.multiplier === 2 && meA.stake.staked === "100", JSON.stringify(meA.stake));
  check("bob, not staked, is Holder 1x", (await api("/api/me", b.token)).json.stake?.multiplier === 1);

  // stake added after today's first sample doesn't boost today (the lowest sample counts), only tomorrow
  await send(owner.address, token, calldata("mint(address,uint256)", bob.address, 200n * WEI));
  await send(bob.address, token, calldata("approve(address,uint256)", staking, 200n * WEI));
  await send(bob.address, staking, calldata("stake(uint256)", 200n * WEI));
  const relink = await api("/api/auth/nonce", b.token, { address: bob.address });
  await api("/api/auth/verify", null, { nonce: relink.json.nonce, signature: bob.sign(relink.json.message) }); // signing in again samples at once
  await sleep(500);
  const meB = (await api("/api/me", b.token)).json.stake;
  check("stake added mid-day counts from tomorrow, not today", meB?.staked === "200" && meB.counted === "0" && meB.multiplier === 1
    && meB.tomorrow?.multiplier === 2, JSON.stringify(meB));
  const cfg = (await api("/api/stake-config", null)).json;
  check("stake config for the page", cfg.contract === staking && cfg.tiers.length === 2 && /^0x[0-9a-f]{8}$/.test(cfg.selectors.stake));

  const aug = await api("/api/month?month=2026-08", null);
  const pts = (w: string) => aug.json.wallets.find((x: { wallet: string }) => x.wallet === w)?.points;
  check("month points per wallet: stake multiplier applied, zeroed day excluded", pts(alice.address) === 60 && pts(bob.address) === 15 && aug.json.total_points === 75, JSON.stringify(aug.json.wallets));
  check("unlinked miners' points counted separately", aug.json.unlinked_points === 15 && aug.json.closed === true);

  check("snapshot needs the admin token", (await api("/api/admin/snapshot", "wrong", { month: "2026-08", pool: "900" })).status === 403
    && (await api("/api/admin/snapshot", null, { month: "2026-08", pool: "900" })).status === 403);
  const thisMonth = new Date().toISOString().slice(0, 7);
  check("the running month can't be snapshotted", (await api("/api/admin/snapshot", ADMIN, { month: thisMonth, pool: "900" })).status === 409);
  const snap = await api("/api/admin/snapshot", ADMIN, { month: "2026-08", pool: "900" });
  check("snapshot splits the pool", snap.status === 200 && snap.json.wallets === 2 && snap.json.pool_wei === (900n * WEI).toString(), JSON.stringify(snap.json));
  check("a month is snapshotted once", (await api("/api/admin/snapshot", ADMIN, { month: "2026-08", pool: "1" })).status === 409);

  const aliceClaims = (await api(`/api/claims?wallet=${alice.address.toLowerCase()}`, null)).json;
  const ac = aliceClaims.claims[0];
  check("alice's claim: 4/5 of the pool", ac?.amount === "720" && aliceClaims.contract === claims && aliceClaims.chain_id === 31337, JSON.stringify(ac && { amount: ac.amount, points: ac.points }));
  check("bob's claim: 1/5", (await api(`/api/claims?wallet=${bob.address}`, null)).json.claims[0]?.amount === "180");

  // not funded yet: the claim can't go through
  check("claims fail before the month is opened", await reverts(alice.address, claims, ac.claim_data));

  // the owner funds the month with the snapshot's root
  check("owner mints, approves and opens the month",
    await send(owner.address, token, calldata("mint(address,uint256)", owner.address, 900n * WEI))
    && await send(owner.address, token, calldata("approve(address,uint256)", claims, 900n * WEI))
    && await send(owner.address, claims, calldata("openMonth(uint256,bytes32,uint128)", 202608n, snap.json.root, 900n * WEI)));
  check("contract holds the pool", await balance(token, claims) === 900n * WEI);

  check("alice claims with the server's calldata", await send(alice.address, claims, ac.claim_data));
  check("alice received 720", await balance(token, alice.address) === (900n + 720n) * WEI);
  check("hasClaimed reads true", BigInt(await rpc("eth_call", [{ to: claims, data: ac.has_claimed_data }, "latest"])) === 1n);
  check("alice can't claim twice", await reverts(alice.address, claims, ac.claim_data));
  check("bob can't use alice's claim", await reverts(bob.address, claims, ac.claim_data.replace(alice.address.slice(2).toLowerCase(), bob.address.slice(2).toLowerCase())));

  if (HOLD) {
    await send(owner.address, token, calldata("mint(address,uint256)", bob.address, 500n * WEI));
    console.log(`HOLD ${JSON.stringify({ server: BASE, rpc: RPC, token, claims, staking, bob: bob.address })}`);
    console.log("holding for the browser test (bob's claim is left open); Ctrl+C to stop");
    await sleep(15 * 60_000);
  }
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  anvil.kill();
  await sleep(300);
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}
console.log(failed ? `${failed} FAILED` : "monthly claims checks passed");
process.exit(failed ? 1 : 0);
