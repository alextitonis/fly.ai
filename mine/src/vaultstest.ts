/**
 * Fly Wallets on the compute server (src/vaults.ts): who may save a vault's settings, what the site reads, and the
 * FlightPass burn -> grant worker, against a stand-in chain and a real Postgres.
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
const FACTORY = checksumAddress("0x" + "fa".repeat(20));
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

// ---- the chain's stand-in: fly 3 is alice's, its vault V3 (not made until "funded"), fly 4's vault is a pot member
const V3 = checksumAddress("0x" + "03".repeat(20));
const FACTORY_BASE = checksumAddress("0x" + "fb".repeat(20));   // the Base factory (same stand-in RPC)
const VB3 = checksumAddress("0x" + "b3".repeat(20));            // fly 3's vault on Base
const FACTORY_POLY = checksumAddress("0x" + "fc".repeat(20));   // the Polygon (Polymarket) factory
const VP3 = checksumAddress("0x" + "c3".repeat(20));            // fly 3's Polymarket vault
const POT = checksumAddress("0x" + "0f".repeat(20));
let v3Made = false, v3Holder = "0x" + "0".repeat(40);
let allowance = 0n;
const sent: { to: string; data: string }[] = [];
let nonce = 0;
let head = 100;
const burnLogs: any[] = [];
const PASS_TOPIC = "0x" + hex(keccak_256(new TextEncoder().encode("PassBurned(uint256,uint256,address,address)")));

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
    if (method === "eth_getLogs") return answer(burnLogs);
    if (method === "eth_getCode") return answer(params[0].toLowerCase() === V3.toLowerCase() && v3Made ? "0x6080" : "0x");
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
      if (data.startsWith(selector("approve(address,uint256)").slice(2))) allowance = (1n << 256n) - 1n;
      nonce++;
      return answer(`0x${createHash("sha256").update(raw).digest("hex")}`);
    }
    if (method !== "eth_call") return revert();
    const to: string = params[0].to.toLowerCase(), data: string = params[0].data;
    const arg = BigInt(`0x${data.slice(10, 74) || "0"}`);
    if (to === FACTORY_BASE.toLowerCase() && data.startsWith(selector("vaultOf(uint256)"))) {
      return answer(`0x${word(arg === 3n ? VB3 : "0x" + word(arg).slice(-40))}`);
    }
    if (to === FACTORY_POLY.toLowerCase() && data.startsWith(selector("vaultOf(uint256)"))) {
      return answer(`0x${word(arg === 3n ? VP3 : "0x" + word(arg).slice(-40))}`);
    }
    if (to === FACTORY.toLowerCase()) {
      if (data.startsWith(selector("vaultOf(uint256)"))) return answer(`0x${word(arg === 3n ? V3 : "0x" + word(arg).slice(-40))}`);
      if (data.startsWith(selector("potOf(uint256)"))) return answer(`0x${word(arg === 4n ? POT : "0x" + "0".repeat(40))}`);
      return revert();
    }
    if (to === V3.toLowerCase() && data.startsWith(selector("holder()"))) return answer(`0x${word(v3Holder)}`);
    if (to === TRADERFLY.toLowerCase()) {
      if (data.startsWith(selector("ownerOf(uint256)"))) return arg === 3n || arg === 4n ? answer(`0x${word(alice.address)}`) : revert();
      if (data.startsWith(selector("flyaiPerDollar()"))) return answer(`0x${word(PER_DOLLAR)}`);
      return revert();
    }
    if (to === TOKEN.toLowerCase() && data.startsWith(selector("allowance(address,address)"))) return answer(`0x${word(allowance)}`);
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
      TOKEN_ADDRESS: TOKEN, VAULT_ON: "1", VAULT_FACTORY: FACTORY, VAULT_RPC: `http://127.0.0.1:${CHAIN_PORT}`,
      VAULT_TICK_SEC: "1", VAULT_GRANTER_KEY: GRANTER_KEY, ARENA_TRADERFLY: TRADERFLY,
      VAULT_FACTORY_BASE: FACTORY_BASE, VAULT_RPC_BASE: `http://127.0.0.1:${CHAIN_PORT}`,
      VAULT_FACTORY_POLYGON: FACTORY_POLY, VAULT_RPC_POLYGON: `http://127.0.0.1:${CHAIN_PORT}`,
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

  // what the site reads
  const cfg = (await api("/api/vaults/config", null)).json;
  check("config: on, the factory, the $10 grant", cfg.on === true && cfg.factory === FACTORY && cfg.grant_usd === 10);
  const fly3 = (await api("/api/vaults/fly/3", null)).json;
  check("a fly's view: its vault, owner, no pot, nothing yet", fly3.vault === V3 && fly3.owner === alice.address && fly3.pot === null
    && fly3.stats === null && fly3.settings === null, JSON.stringify(fly3));
  check("a pot member shows its pot", (await api("/api/vaults/fly/4", null)).json.pot === POT);
  check("the other chains offered", cfg.chains?.length === 2 && cfg.chains[0].chain === "base" && cfg.chains[0].factory === FACTORY_BASE
    && cfg.chains[0].stable_sym === "USDC" && !cfg.chains[0].poly, JSON.stringify(cfg.chains));
  check("Polymarket offered: USDC.e on Polygon", cfg.chains[1]?.chain === "polygon" && cfg.chains[1].poly === true
    && cfg.chains[1].chain_id === 137 && cfg.chains[1].stable_sym === "USDC.e", JSON.stringify(cfg.chains));
  check("a fly's vault on Base too", fly3.away?.[0]?.chain === "base" && fly3.away[0].vault === VB3, JSON.stringify(fly3.away));
  check("and its Polymarket vault", fly3.away?.[1]?.chain === "polygon" && fly3.away[1].vault === VP3, JSON.stringify(fly3.away));
  check("Polymarket settings: the fly's owner sets them up",
    (await api(`/api/vaults/${VP3}/settings`, a, { fly: 3, chain: "polygon", settings: doc })).status === 200);
  check("the Polymarket leaderboard is its own", (await api("/api/vaults/leaderboard?chain=polygon", null)).status === 200);
  check("Base settings: the fly's owner sets them up", (await api(`/api/vaults/${VB3}/settings`, b, { fly: 3, chain: "base", settings: doc })).status === 403
    && (await api(`/api/vaults/${VB3}/settings`, a, { fly: 3, chain: "base", settings: { ...doc, risk: 5 } })).status === 200);
  check("an unknown chain is refused", (await api(`/api/vaults/${VB3}/settings`, a, { fly: 3, chain: "solana", settings: doc })).status === 400);
  check("the Base vault's settings read back", (await api("/api/vaults/fly/3", null)).json.away[0].settings?.risk === 5);

  // settings before the vault is made: the fly's owner only, naming the fly
  check("no session, no settings", (await api(`/api/vaults/${V3}/settings`, null, { fly: 3, settings: doc })).status === 401);
  check("bob can't set up alice's fly", (await api(`/api/vaults/${V3}/settings`, b, { fly: 3, settings: doc })).status === 403);
  check("the fly must be the vault's", (await api(`/api/vaults/${V3}/settings`, a, { fly: 4, settings: doc })).status === 400);
  check("settings must be an object", (await api(`/api/vaults/${V3}/settings`, a, { fly: 3, settings: [1] })).status === 400);
  check("and not huge", (await api(`/api/vaults/${V3}/settings`, a, { fly: 3, settings: { x: "y".repeat(20_000) } })).status === 400);
  const saved = await api(`/api/vaults/${V3}/settings`, a, { fly: 3, settings: doc });
  check("alice sets up her fly's wallet", saved.status === 200 && saved.json.settings.starter === "dip_buyer");
  check("and it reads back", (await api("/api/vaults/fly/3", null)).json.settings?.starter === "dip_buyer");
  const stored = await PG.pg.one<{ t: string }>("select jsonb_typeof(doc) as t from mine.vault_settings where vault = ?", V3);
  check("stored as a JSON object (what the vault desk reads)", stored?.t === "object", stored?.t);

  // funded: the vault's holder decides
  v3Made = true;
  v3Holder = bob.address;   // (say bob funded it before alice bought the fly: the holder is who counts)
  check("a made vault: only its holder", (await api(`/api/vaults/${V3}/settings`, a, { settings: doc })).status === 403);
  check("the holder may", (await api(`/api/vaults/${V3}/settings`, b, { settings: { ...doc, risk: 4 } })).status === 200);
  v3Holder = alice.address;

  // the vault desk's snapshots
  await PG.pg.run("insert into mine.vault_public (key, value) values ('leaderboard', ?::text::jsonb), (?, ?::text::jsonb)",
    JSON.stringify({ all: [{ vault: V3, profit: 12.5 }], d7: [], h24: [] }), `vault:${V3}`, JSON.stringify({ vault: V3, value: 112.5 }));
  check("leaderboard", (await api("/api/vaults/leaderboard", null)).json.all[0].vault === V3);
  check("a vault's stats", (await api(`/api/vaults/${V3}`, null)).json.stats.value === 112.5);

  // FlightPass #9 (balance 50,000 FLYAI) burned into fly 3
  await PG.pg.run("insert into mine.ledger (wallet, kind, amount_wei, tx, at) values ('pass:9', 'deposit', ?, 'test', ?)", (50_000n * WEI).toString(), Date.now());
  burnLogs.push({ address: FACTORY, topics: [PASS_TOPIC, `0x${word(9)}`, `0x${word(3)}`, `0x${word(alice.address)}`], data: `0x${word(V3)}`,
                  transactionHash: "0x" + "ab".repeat(32), blockNumber: "0x63", logIndex: "0x0" });
  let g: any = null;
  for (let i = 0; i < 30 && g?.status !== "paid"; i++) {
    await sleep(500);
    g = await PG.pg.one<any>("select * from mine.vault_grants where pass_id = 9");
  }
  check("the burn becomes a paid grant", g?.status === "paid" && g.fly_id === 3 && g.vault === V3, JSON.stringify(g));
  const bal = await PG.pg.one<{ s: string }>("select coalesce(sum(case when kind = 'deposit' then amount_wei::numeric else -amount_wei::numeric end), 0)::text as s from mine.ledger where wallet = 'pass:9'");
  check("the pass's balance moved out (one ledger row)", bal?.s === "0" && (await PG.pg.all("select 1 from mine.ledger where tx = 'vault-grant:9'")).length === 1);
  const grantSel = selector("grant(uint256,address,uint256,bool)").slice(2), approveSel = selector("approve(address,uint256)").slice(2);
  const grants = sent.filter((s) => s.data.startsWith(grantSel));
  const amount = grants[0] ? BigInt(`0x${grants[0].data.slice(8 + 128, 8 + 192)}`) : 0n;
  check("approve first, then one grant(fly 3, FLYAI, pass + $10, locked)", sent[0]?.data.startsWith(approveSel) && grants.length === 1
    && grants[0].to.toLowerCase() === FACTORY.toLowerCase() && amount === 50_000n * WEI + 10n * PER_DOLLAR
    && BigInt(`0x${grants[0].data.slice(8, 72)}`) === 3n && BigInt(`0x${grants[0].data.slice(8 + 192, 8 + 256)}`) === 1n,
    `${sent.length} sent, amount ${amount}`);
  await sleep(2500);
  check("never paid twice", sent.filter((s) => s.data.startsWith(grantSel)).length === 1);
  const adm = await api("/api/admin/vaults", null, undefined, true);
  check("admin sees the grants", adm.status === 200 && adm.json.grants.length === 1);
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
