/**
 * Wallet sign-in against a real server: the website flow (miner token), the extension flow (link code),
 * every way a sign-in should fail, and the upgrade of a schema-2 database (the one deployed before wallets).
 *
 *   npm run test:auth
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { startPg } from "./pgtest.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8781;
const BASE = `http://localhost:${PORT}`;
const DB = join(tmpdir(), `mine-authtest-${process.pid}.db`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** A test wallet that signs like MetaMask's personal_sign: r || s || v. */
function wallet() {
  const sk = secp256k1.utils.randomSecretKey();
  const address = checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`);
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { address, sign };
}

async function call(path: string, token: string | null, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// a schema-2 database, as deployed before wallets, with one miner in it
for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
{
  const old = new DatabaseSync(DB);
  old.exec(`
    pragma user_version = 2;
    create table tasks (id integer primary key, params text not null unique, units real not null, round integer not null,
      r real not null, state text not null default 'open', truth text, checked_at integer);
    create table miners (id text primary key, token_hash text not null unique, label text, created_at integer not null,
      last_seen integer, strikes integer not null default 0);
    create table assignments (id text primary key, miner text not null, task integer not null, issued_at integer not null,
      expires_at integer not null, submitted_at integer, day text, result text, status text not null);
    insert into miners (id, token_hash, label, created_at) values ('old-miner', 'x', 'from before', 1);
  `);
  old.close();
}

const PG = await startPg(5531);
const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
  env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", OPEN_TARGET: "10" },
  stdio: ["ignore", "pipe", "inherit"],
});
let log = "";
server.stdout!.on("data", (d) => { log += d; });

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* not up yet */ }
    if (i > 60) throw new Error("server didn't start");
    await sleep(500);
  }
  const upgraded = new DatabaseSync(DB, { readOnly: true });
  const cols = (upgraded.prepare("pragma table_info(miners)").all() as { name: string }[]).map((c) => c.name);
  check("schema-2 database upgraded in place", cols.includes("wallet") && log.includes("upgraded to schema 3")
    && (upgraded.prepare("select label from miners where id = 'old-miner'").get() as { label: string }).label === "from before");
  upgraded.close();

  // ---- the website: sign in with the miner's own token
  const { json: { token } } = await call("/api/register", null, { label: "site" });
  const alice = wallet();
  const n1 = await call("/api/auth/nonce", token, { address: alice.address.toLowerCase() });
  const message: string = n1.json.message;
  check("message is EIP-4361 for this server", n1.status === 200 && message.startsWith(`localhost:${PORT} wants you to sign in with your Ethereum account:\n${alice.address}\n`)
    && message.includes(`URI: ${BASE}`) && message.includes("Chain ID: 4663") && message.includes(`Nonce: ${n1.json.nonce}`), message.split("\n")[0]);
  const v1 = await call("/api/auth/verify", null, { nonce: n1.json.nonce, signature: alice.sign(message) });
  check("valid signature links the wallet", v1.status === 200 && v1.json.wallet === alice.address, JSON.stringify(v1.json));
  check("me shows the wallet", (await call("/api/me", token)).json.wallet === alice.address);
  check("nonce can't be used twice", (await call("/api/auth/verify", null, { nonce: n1.json.nonce, signature: alice.sign(message) })).status === 410);

  const bob = wallet();
  const n2 = await call("/api/auth/nonce", token, { address: alice.address });
  check("someone else's signature is refused", (await call("/api/auth/verify", null, { nonce: n2.json.nonce, signature: bob.sign(n2.json.message) })).status === 401);
  check("a signature over different text is refused", (await call("/api/auth/verify", null, { nonce: n2.json.nonce, signature: alice.sign(n2.json.message + " ") })).status === 401);
  check("malformed signature is refused", (await call("/api/auth/verify", null, { nonce: n2.json.nonce, signature: "0x1234" })).status === 400);
  check("wallet unchanged after failed attempts", (await call("/api/me", token)).json.wallet === alice.address);
  check("bad address refused", (await call("/api/auth/nonce", token, { address: "0xnope" })).status === 400);
  check("no token and no code refused", (await call("/api/auth/nonce", null, { address: alice.address })).status === 401);
  check("unknown nonce refused", (await call("/api/auth/verify", null, { nonce: "deadbeef", signature: alice.sign("x") })).status === 410);

  // changing wallet: sign again with another one
  const n3 = await call("/api/auth/nonce", token, { address: bob.address });
  check("miner can move to another wallet", (await call("/api/auth/verify", null, { nonce: n3.json.nonce, signature: bob.sign(n3.json.message) })).json.wallet === bob.address
    && (await call("/api/me", token)).json.wallet === bob.address);

  // ---- the extension: a link code opened in a tab, no token there
  const { json: { token: extToken } } = await call("/api/register", null, { label: "extension" });
  const linkRes = await call("/api/link", extToken, {});
  check("link code issued with a /compute/connect URL", linkRes.status === 200 && linkRes.json.url === `${BASE}/compute/connect#${linkRes.json.code}`, linkRes.json.url);
  check("link needs a miner token", (await call("/api/link", null, {})).status === 401);
  const carol = wallet();
  const n4 = await call("/api/auth/nonce", null, { address: carol.address, code: linkRes.json.code });
  check("link code stands in for the token", n4.status === 200);
  check("extension's miner gets the wallet", (await call("/api/auth/verify", null, { nonce: n4.json.nonce, signature: carol.sign(n4.json.message) })).json.wallet === carol.address
    && (await call("/api/me", extToken)).json.wallet === carol.address);
  check("link code can't be used twice", (await call("/api/auth/nonce", null, { address: carol.address, code: linkRes.json.code })).status === 410);
  check("the website's miner is untouched", (await call("/api/me", token)).json.wallet === bob.address);
  check("/compute/connect page served", (await fetch(`${BASE}/compute/connect`)).status === 200 && (await fetch(`${BASE}/compute/mine/web/connect.js`)).status === 200);

  // ---- one sign-in for every page: a session, then linking without another signature
  const withSession = async (path: string, session: string | null, miner: string | null, body?: unknown) => {
    const res = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(miner ? { authorization: `Bearer ${miner}` } : {}), ...(session ? { "x-flyai-session": session } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const dave = wallet();
  const sn = await call("/api/session/nonce", null, { address: dave.address });
  check("a session sign-in needs no miner", sn.status === 200 && sn.json.message.includes("Sign in to fly.ai (compute and Fly Roulette) for 30 days") && sn.json.message.includes("Chain ID: 4663"));
  check("a session needs the address's own signature", (await call("/api/session", null, { nonce: sn.json.nonce, signature: carol.sign(sn.json.message) })).status === 401);
  const sn2 = await call("/api/session/nonce", null, { address: dave.address });
  const started = await call("/api/session", null, { nonce: sn2.json.nonce, signature: dave.sign(sn2.json.message) });
  const session: string = started.json?.session;
  check("signing in starts a 30-day session", started.status === 200 && /^[0-9a-f]{64}$/.test(session) && started.json.wallet === dave.address
    && Math.abs(started.json.expires_at - Date.now() - 30 * 86_400_000) < 60_000, JSON.stringify(started.json));
  check("the sign-in nonce is single use", (await call("/api/session", null, { nonce: sn2.json.nonce, signature: dave.sign(sn2.json.message) })).status === 410);
  check("the session names its wallet", (await withSession("/api/session", session, null)).json?.wallet === dave.address);
  check("no session, no wallet", (await withSession("/api/session", null, null)).status === 401 && (await withSession("/api/session", "ab".repeat(32), null)).status === 401);

  const { json: { token: siteToken } } = await call("/api/register", null, { label: "session site" });
  check("linking needs a session", (await withSession("/api/session/link", null, siteToken, {})).status === 401);
  const linked = await withSession("/api/session/link", session, siteToken, {});
  check("the session links this site's miner, no signature", linked.status === 200 && linked.json.wallet === dave.address && (await call("/api/me", siteToken)).json.wallet === dave.address);
  check("linking needs a miner or a code", (await withSession("/api/session/link", session, null, {})).status === 401);
  const { json: { token: ext2 } } = await call("/api/register", null, { label: "session extension" });
  const code2 = (await call("/api/link", ext2, {})).json.code;
  check("the session links the extension's miner by its code", (await withSession("/api/session/link", session, null, { code: code2 })).json?.wallet === dave.address
    && (await call("/api/me", ext2)).json.wallet === dave.address);
  check("that code is spent", (await withSession("/api/session/link", session, null, { code: code2 })).status === 410);
  check("CORS lets pages send the session header", ((await fetch(`${BASE}/api/session`, { method: "OPTIONS" })).headers.get("access-control-allow-headers") ?? "").includes("x-flyai-session"));

  const out = await withSession("/api/session/end", session, null, {});
  check("signing out ends the session", out.status === 200 && (await withSession("/api/session", session, null)).status === 401
    && (await withSession("/api/session/link", session, siteToken, {})).status === 401);
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server.kill();
  await sleep(300);
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}
console.log(failed ? `${failed} FAILED` : "wallet sign-in checks passed");
process.exit(failed ? 1 : 0);
