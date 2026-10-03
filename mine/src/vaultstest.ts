/**
 * Fly Wallets on the compute server (src/vaults.ts, the plain-wallet redesign): what the site reads, who may save a fly
 * wallet's settings and ask for a withdrawal, and the FlightPass burn -> grant worker, against a stand-in chain and a
 * real Postgres.
 *   npm run test:vaults
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { startPg } from "./pgtest.ts";
import { selector } from "./staking.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8791, CHAIN_PORT = 8792;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-vaultstest-${process.pid}.db`);
const TRADERFLY = "0x18d4D831cA89672126172B73bA05f5A318ad5A72";
const TOKEN = checksumAddress("0x" + "f1".repeat(20));
const GRANTER_KEY = "22".repeat(32);
const WEI = 10n ** 18n;
const PER_DOLLAR = 6858n * WEI;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const word = (v: bigint | number | string) =>
  typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0");

const [alice, bob] = [0, 1].map(() => {
  const sk = secp256k1.utils.randomSecretKey();
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});

// ---- the chain's stand-in: flies 3 and 4 are alice's; FlightPass #9 is alice's until she sends it to 0x...dEaD
const W3 = checksumAddress("0x" + "03".repeat(20));          // fly 3's wallet (the desk made it)
const W4 = checksumAddress("0x" + "04".repeat(20));
const FLIGHTPASS = checksumAddress("0x" + "9a".repeat(20));
const DEAD = "0x000000000000000000000000000000000000dEaD";
let pass9Owner = "";
const sent: { to: string; data: string }[] = [];
let nonce = 0;
let head = 100;

function rlpDecode(b: Buffer, at = 0): [unknown, number] {
  const t = b[at];
  if (t < 0x80) return [b.subarray(at, at + 1), at + 1];
  if (t < 0xb8) return [b.subarray(at + 1, at + 1 + t - 0x80), at + 1 + t - 0x80];
  if (t < 0xc0) { const n = t - 0xb7, len = Number(BigInt(`0x${b.subarray(at + 1, at + 1 + n).toString("hex")}`)); return [b.subarray(at + 1 + n, at + 1 + n + len), at + 1 + n + len]; }
  let start: number, end: number;
  if (t < 0xf8) { start = at + 1; end = start + t - 0xc0; } else { const n = t - 0xf7, len = Number(BigInt(`0x${b.subarray(at + 1, at + 1 + n).toString("hex")}`)); start = at + 1 + n; end = start + len; }
  const items: unknown[] = [];
  for (let p = start; p < end;) { const [item, next] = rlpDecode(b, p); items.push(item); p = next; }
  return [items, end];
}

const chain = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const { id, method, params } = JSON.parse(body);
    const answer = (result: unknown) => res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    const revert = () => res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } }));
    res.setHeader("content-type", "application/json");
    if (method === "eth_blockNumber") return answer(`0x${(head++).toString(16)}`);   // the chain moves on
    if (method === "eth_estimateGas") return answer("0x30000");
    if (method === "eth_chainId") return answer("0x7a69");
    if (method === "eth_getTransactionCount") return answer(`0x${nonce.toString(16)}`);
    if (method === "eth_getBlockByNumber") return answer({ baseFeePerGas: "0x1" });
    if (method === "eth_maxPriorityFeePerGas") return answer("0x1");
    if (method === "eth_getTransactionReceipt") return answer({ status: "0x1" });
    if (method === "eth_getBalance") return answer("0xde0b6b3a7640000");
    if (method === "eth_sendRawTransaction") {
      const raw = Buffer.from(params[0].slice(2), "hex");
      const f = rlpDecode(raw.subarray(1))[0] as Buffer[];
      const to = `0x${f[5].toString("hex")}`, data = f[7].toString("hex");
      sent.push({ to, data });
      nonce++;
      return answer(`0x${createHash("sha256").update(raw).digest("hex")}`);
    }
    if (method !== "eth_call") return revert();
    const to: string = params[0].to.toLowerCase(), data: string = params[0].data;
    const arg = BigInt(`0x${data.slice(10, 74) || "0"}`);
    if (to === TRADERFLY.toLowerCase()) {
      if (data.startsWith(selector("ownerOf(uint256)"))) return arg === 3n || arg === 4n ? answer(`0x${word(alice.address)}`) : revert();
      if (data.startsWith(selector("flyaiPerDollar()"))) return answer(`0x${word(PER_DOLLAR)}`);
      return revert();
    }
    if (to === FLIGHTPASS.toLowerCase() && data.startsWith(selector("ownerOf(uint256)")) && arg === 9n) return answer(`0x${word(pass9Owner)}`);
    revert();
  });
});
await new Promise<void>((r) => chain.listen(CHAIN_PORT, "127.0.0.1", r));

async function api(path: string, session: string | null, body?: unknown, admin = false): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(session ? { "x-flyai-session": session } : {}),
               ...(admin ? { authorization: `Bearer ${ADMIN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5546);
async function startServer(extra: Record<string, string> = {}): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "50", ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none",
      CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost", SEED_PAID: "0", ARENA_ON: "0",
      TOKEN_ADDRESS: TOKEN, VAULT_ON: "1", VAULT_RPC: `http://127.0.0.1:${CHAIN_PORT}`, VAULT_CHAINS: "base,polygon",
      VAULT_TICK_SEC: "1", VAULT_GRANTER_KEY: GRANTER_KEY, ARENA_TRADERFLY: TRADERFLY, VAULT_FLIGHTPASS: FLIGHTPASS,
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

try {
  await startServer();
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const a = await signIn(alice), b = await signIn(bob);
  const doc = { starter: "dip_buyer", risk: 2 };
  // the desk made the flies' wallets (keys encrypted; mine only ever reads addresses)
  await PG.pg.run(`insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:3', 3, ?, 'x', 'y'), ('fly:4', 4, ?, 'x', 'y')`, W3, W4);

  // what the site reads
  const cfg = (await api("/api/vaults/config", null)).json;
  check("config: on, the $10 grant, where passes are burnt", cfg.on === true && cfg.grant_usd === 10 && cfg.dead === DEAD
    && cfg.flightpass === FLIGHTPASS, JSON.stringify(cfg));
  check("the other chains offered (VAULT_CHAINS)", cfg.chains?.length === 2 && cfg.chains[0].chain === "base" && cfg.chains[0].stable_sym === "USDC"
    && cfg.chains[1].chain === "polygon" && cfg.chains[1].poly === true && cfg.chains[1].stable_sym === "USDC.e", JSON.stringify(cfg.chains));
  const fly3 = (await api("/api/vaults/fly/3", null)).json;
  check("a fly's view: its wallet, owner, nobody's money yet", fly3.wallet === W3 && fly3.owner === alice.address && fly3.ledger === null
    && fly3.stats === null && fly3.settings === null && fly3.pass === null, JSON.stringify(fly3));
  check("the same wallet on every chain", fly3.away?.length === 2 && fly3.away[0].chain === "base" && fly3.away[1].chain === "polygon");
  check("no wallet yet for a fly the desk hasn't reached", (await api("/api/vaults/fly/5", null)).json.wallet === null);

  // settings while nobody's money is in it: the fly's owner
  check("no session, no settings", (await api(`/api/vaults/${W3}/settings`, null, { settings: doc })).status === 401);
  check("bob can't set up alice's fly", (await api(`/api/vaults/${W3}/settings`, b, { settings: doc })).status === 403);
  check("not a fly wallet", (await api(`/api/vaults/${checksumAddress("0x" + "77".repeat(20))}/settings`, a, { settings: doc })).status === 404);
  check("settings must be an object", (await api(`/api/vaults/${W3}/settings`, a, { settings: [1] })).status === 400);
  check("and not huge", (await api(`/api/vaults/${W3}/settings`, a, { settings: { x: "y".repeat(20_000) } })).status === 400);
  check("an unknown chain is refused", (await api(`/api/vaults/${W3}/settings`, a, { chain: "solana", settings: doc })).status === 400);
  const saved = await api(`/api/vaults/${W3}/settings`, a, { settings: doc });
  check("alice sets up her fly's wallet", saved.status === 200 && saved.json.settings.starter === "dip_buyer");
  check("Polymarket settings are their own", (await api(`/api/vaults/${W3}/settings`, a, { chain: "polygon", settings: { ...doc, risk: 5 } })).status === 200);
  const v3 = (await api("/api/vaults/fly/3", null)).json;
  check("and they read back per chain", v3.settings?.starter === "dip_buyer" && v3.away[1].settings?.risk === 5 && v3.away[0].settings === null);
  const keys = (await PG.pg.all<{ vault: string; t: string }>("select vault, jsonb_typeof(doc) as t from mine.vault_settings order by vault")).map((r) => `${r.vault}:${r.t}`);
  check("stored per chain as JSON objects (what the desk reads)", keys.join(",") === `${W3}:object,polygon:${W3}:object`, keys.join(","));

  // money in (the desk's ledger): the holder decides and withdraws
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'robinhood', ?, 100)", W3, bob.address);
  check("with money in it: only its holder", (await api(`/api/vaults/${W3}/settings`, a, { settings: doc })).status === 403);
  check("the holder may", (await api(`/api/vaults/${W3}/settings`, b, { settings: { ...doc, risk: 4 } })).status === 200);
  check("the ledger shows on the fly", (await api("/api/vaults/fly/3", null)).json.ledger?.holder === bob.address);
  check("funded flies listed (the Breed page won't merge them)", JSON.stringify((await api("/api/vaults/funded", null)).json.flies) === "[3]");
  check("only the holder withdraws", (await api(`/api/vaults/${W3}/withdraw`, a, { bps: 5000 })).status === 403);
  check("bps 1..10000", (await api(`/api/vaults/${W3}/withdraw`, b, { bps: 0 })).status === 400);
  await PG.pg.run("update mine.vault_ledger set closing = true where wallet = ?", W3);
  const sold = await api(`/api/vaults/${W3}/withdraw`, b, { bps: 5000 });
  check("no withdrawal while a sold fly is paid out (it could take the new owner's money)", sold.status === 409, JSON.stringify(sold.json));
  await PG.pg.run("update mine.vault_ledger set closing = false where wallet = ?", W3);
  const w = await api(`/api/vaults/${W3}/withdraw`, b, { bps: 5000 });
  check("a withdrawal request for the desk", w.status === 200 && w.json.status === "new", JSON.stringify(w.json));
  check("one at a time", (await api(`/api/vaults/${W3}/withdraw`, b, { bps: 5000 })).status === 409);
  const r = (await api(`/api/vaults/requests/${w.json.id}`, null)).json;
  check("it can be followed", r.kind === "withdraw" && r.status === "new" && r.wallet === W3, JSON.stringify(r));
  check("no withdrawal on a chain with nobody's money", (await api(`/api/vaults/${W3}/withdraw`, b, { chain: "base", bps: 5000 })).status === 403);
  check("one withdrawal or move at a time", (await api(`/api/vaults/${W3}/move`, b, { to_chain: "polygon", usd: 20 })).status === 409);
  await PG.pg.run("update mine.vault_requests set status = 'done' where id = ?", w.json.id);
  check("only the holder moves money", (await api(`/api/vaults/${W3}/move`, a, { to_chain: "polygon", usd: 20 })).status === 403);
  check("a move needs another offered chain", (await api(`/api/vaults/${W3}/move`, b, { to_chain: "robinhood", usd: 20 })).status === 400
    && (await api(`/api/vaults/${W3}/move`, b, { to_chain: "solana", usd: 20 })).status === 400);
  check("at least $5", (await api(`/api/vaults/${W3}/move`, b, { to_chain: "polygon", usd: 1 })).status === 400);
  const mv = await api(`/api/vaults/${W3}/move`, b, { to_chain: "polygon", usd: 20 });
  check("a move to Polymarket for the desk", mv.status === 200 && (await api(`/api/vaults/requests/${mv.json.id}`, null)).json.kind === "move");

  // the desk's snapshots
  await PG.pg.run("insert into mine.vault_public (key, value) values ('leaderboard', ?::text::jsonb), (?, ?::text::jsonb), (?, ?::text::jsonb)",
    JSON.stringify({ all: [{ vault: W3, profit: 12.5 }], d7: [], h24: [] }), `vault:${W3}`, JSON.stringify({ vault: W3, value: 112.5 }),
    `vault:polygon:${W3}`, JSON.stringify({ vault: W3, value: 7 }));
  check("leaderboard", (await api("/api/vaults/leaderboard", null)).json.all[0].vault === W3);
  const v3b = (await api("/api/vaults/fly/3", null)).json;
  check("the stats per chain", v3b.stats?.value === 112.5 && v3b.away[1].stats?.value === 7);

  // FlightPass #9 (balance 50,000 FLYAI) burnt into fly 4
  await PG.pg.run("insert into mine.ledger (wallet, kind, amount_wei, tx, at) values ('pass:9', 'deposit', ?, 'test', ?)", (50_000n * WEI).toString(), Date.now());
  pass9Owner = bob.address;
  check("only the pass's owner registers its burn", (await api("/api/vaults/fly/4/pass", a, { pass: 9 })).status === 403);
  pass9Owner = alice.address;
  check("only the fly's owner", (await api("/api/vaults/fly/4/pass", b, { pass: 9 })).status === 403);
  const reg = await api("/api/vaults/fly/4/pass", a, { pass: 9 });
  check("alice registers it: send the pass to 0x...dEaD", reg.status === 200 && reg.json.send_to === DEAD && reg.json.wallet === W4, JSON.stringify(reg.json));
  const again = await api("/api/vaults/fly/4/pass", a, { pass: 9 });
  check("a registration never burnt (cancelled in the wallet) can be made again", again.status === 200, JSON.stringify(again.json));
  check("and stays one row", (await PG.pg.all("select 1 from mine.vault_grants where fly_id = 4")).length === 1);
  await sleep(2500);
  check("nothing paid before the pass is burnt", sent.length === 0);
  pass9Owner = DEAD;
  let g: any = null;
  for (let i = 0; i < 30 && g?.status !== "paid"; i++) {
    await sleep(500);
    g = await PG.pg.one<any>("select * from mine.vault_grants where pass_id = 9");
  }
  check("the burn becomes a paid grant", g?.status === "paid" && g.fly_id === 4 && g.vault === W4, JSON.stringify(g));
  const bal = await PG.pg.one<{ s: string }>("select coalesce(sum(case when kind = 'deposit' then amount_wei::numeric else -amount_wei::numeric end), 0)::text as s from mine.ledger where wallet = 'pass:9'");
  check("the pass's balance moved out (one ledger row)", bal?.s === "0" && (await PG.pg.all("select 1 from mine.ledger where tx = 'vault-grant:9'")).length === 1);
  const transferSel = selector("transfer(address,uint256)").slice(2);
  const tx = sent.filter((x) => x.data.startsWith(transferSel));
  const amount = tx[0] ? BigInt(`0x${tx[0].data.slice(8 + 64, 8 + 128)}`) : 0n;
  check("one FLYAI transfer of the pass + $10 into the fly's wallet", tx.length === 1 && tx[0].to.toLowerCase() === TOKEN.toLowerCase()
    && `0x${tx[0].data.slice(8 + 24, 8 + 64)}`.toLowerCase() === W4.toLowerCase() && amount === 50_000n * WEI + 10n * PER_DOLLAR, `${sent.length} sent, ${amount}`);
  const lock = await PG.pg.one<any>("select * from mine.vault_requests where kind = 'pass_burn'");
  check("the desk is asked to lock it all", lock?.wallet === W4 && Math.abs(lock.params.grant_usd - (50_000 / 6858 + 10)) < 0.01, JSON.stringify(lock?.params));
  check("one pass per fly, ever", (await api("/api/vaults/fly/4/pass", a, { pass: 10 })).status === 409);
  await sleep(2500);
  check("never paid twice", sent.filter((x) => x.data.startsWith(transferSel)).length === 1);
  const adm = await api("/api/admin/vaults", null, undefined, true);
  check("admin sees wallets, funded, requests, grants", adm.status === 200 && adm.json.wallets === 2 && adm.json.funded.length === 1
    && adm.json.requests.length === 3 && adm.json.grants.length === 1, JSON.stringify(adm.json).slice(0, 200));
  check("admin only", (await api("/api/admin/vaults", a)).status === 403);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  const s = server as ReturnType<typeof spawn> | null;
  if (s) { const gone = new Promise((r) => s.once("exit", r)); s.kill("SIGKILL"); await gone; }
  await PG.stop();
  chain.close();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
