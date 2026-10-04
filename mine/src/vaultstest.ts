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
const PROMO_START = Date.now() - 60_000;
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
      PROMO_ON: "1", PROMO_START_MS: String(PROMO_START), PROMO_SLOTS: "2", BOUNTY_ADMINS: alice.address, PROMO_AUTO: "0",
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

  // nicknames for the leaderboards (src/profiles.ts)
  check("a nickname needs a signed-in wallet", (await api("/api/profile", null, { nickname: "Alice" })).status === 401);
  check("too short or odd characters are refused", (await api("/api/profile", a, { nickname: "al" })).status === 400
    && (await api("/api/profile", a, { nickname: "<script>" })).status === 400);
  check("names posing as the team or an address are refused", (await api("/api/profile", a, { nickname: "FlyAI" })).status === 400
    && (await api("/api/profile", a, { nickname: "0x1234abcd" })).status === 400);
  check("alice sets hers", (await api("/api/profile", a, { nickname: "Alice  Fly" })).json.nickname === "Alice Fly");
  check("bob can't take it, in any case", (await api("/api/profile", b, { nickname: "alice fly" })).status === 409);
  check("bob sets his", (await api("/api/profile", b, { nickname: "bob_trades" })).status === 200);
  const names = (await api(`/api/profiles?wallets=${alice.address},${bob.address},0x${"12".repeat(20)}`, null)).json;
  check("anyone reads them in bulk", names[alice.address.toLowerCase()] === "Alice Fly" && names[bob.address.toLowerCase()] === "bob_trades"
    && Object.keys(names).length === 2, JSON.stringify(names));
  check("and clears his own", (await api("/api/profile", b, { nickname: "" })).json.nickname === null
    && (await api("/api/profile", b)).json.nickname === null);

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
  // the terminal's feed: every funded fly's stats in one read (fly 3 holds bob's money; fly 4 nobody's)
  const fd = (await api("/api/vaults/feed", null)).json;
  check("the terminal feed", fd.flies?.["3"]?.value === 112.5 && !fd.flies?.["4"] && Object.keys(fd.flies).length === 1, JSON.stringify(fd).slice(0, 120));

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

  // the deposit competition (2026-10-04): 2 slots, $20 minimum, $20 bonus locked 14 days; alice is a BOUNTY_ADMINS wallet
  const pub0 = (await api("/api/vaults/promo", null)).json;
  check("promo: the public numbers before anyone qualifies", pub0.on === true && pub0.slots === 2 && pub0.taken === 0 && pub0.left === 2
    && pub0.min_usd === 20 && pub0.bonus_usd === 20 && pub0.hold_days === 14 && pub0.start_ms === PROMO_START, JSON.stringify(pub0));
  const PW = [5, 6, 7, 8, 9].map((n) => checksumAddress("0x" + String(n).padStart(2, "0").repeat(20)));
  const [W5, W6, W7, W8, W9] = PW;
  await PG.pg.run(`insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ${PW.map((_, i) => `('fly:${i + 5}', ${i + 5}, ?, 'x', 'y')`).join(", ")}`, ...PW);
  const X = checksumAddress("0x" + "ab".repeat(20)), Z = checksumAddress("0x" + "cd".repeat(20));
  const t = (s: number) => new Date(PROMO_START + s * 1000).toISOString();
  // W6 (alice) qualifies first, then X's W7; X's W5 is his second wallet; W8's money came in during a sale; W3's before the start
  await PG.pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, usd, at, detail) values
    (?, 'robinhood', 'deposit', ?, 15, ?::timestamptz, '{}'), (?, 'robinhood', 'deposit', ?, 10, ?::timestamptz, '{}'),
    (?, 'robinhood', 'deposit', ?, 25, ?::timestamptz, '{}'), (?, 'robinhood', 'deposit', ?, 30, ?::timestamptz, '{}'),
    (?, 'robinhood', 'deposit', ?, 50, ?::timestamptz, '{"while_closing": true}'), (?, 'robinhood', 'deposit', ?, 20, ?::timestamptz, '{}'),
    (?, 'robinhood', 'deposit', ?, 100, ?::timestamptz, '{}'), (?, 'base', 'deposit', ?, 90, ?::timestamptz, '{}')`,
    W5, X, t(1), W5, X, t(5), W6, alice.address, t(2), W7, X.toLowerCase(), t(3), W8, Z, t(4), W9, Z, t(600), W3, bob.address, t(-10),
    W4, bob.address, t(1));
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'robinhood', ?, 25), (?, 'robinhood', ?, 30)",
    W6, alice.address, W7, X.toLowerCase());
  let promos: any[] = [];
  for (let i = 0; i < 20 && promos.length < 2; i++) { await sleep(500); promos = await PG.pg.all<any>("select * from mine.vault_promos order by qualified_at"); }
  await sleep(1500);   // a few more ticks: still two
  promos = await PG.pg.all<any>("select * from mine.vault_promos order by qualified_at");
  check("candidates first come first served, up to the slots", promos.length === 2 && promos[0].wallet === W6 && promos[1].wallet === W7
    && promos[0].status === "candidate" && promos[0].fly_id === 6 && promos[0].deposit_usd === 25, JSON.stringify(promos.map((p) => [p.wallet, p.status])));
  check("a holder's second wallet gets no slot (any case)", !promos.some((p) => p.wallet === W5));
  check("the public endpoint: none left", (await api("/api/vaults/promo", null)).json.left === 0);
  check("non-admins can't list", (await api("/api/admin/promo", b)).status === 403 && (await api("/api/admin/promo", null)).status === 403);
  check("non-admins can't approve or reject", (await api(`/api/admin/promo/${promos[0].id}/approve`, b, {})).status === 403
    && (await api(`/api/admin/promo/${promos[1].id}/reject`, null, {})).status === 403);
  const list = await api("/api/admin/promo", a);
  const r6 = list.json?.rows?.find((r: any) => r.wallet === W6), r7 = list.json?.rows?.find((r: any) => r.wallet === W7);
  check("a signed-in admin lists them with the sybil hints", list.status === 200 && r6?.nickname === "Alice Fly" && r6.holder_wallets === 1
    && r6.deposits.length === 1 && r6.deposits[0].usd === 25 && r7?.deposits.length === 1 && JSON.stringify(r6.near) === JSON.stringify([r7.id])
    && r6.ledger?.principal_usd === 25, JSON.stringify(list.json).slice(0, 300));
  check("and the admin token too", (await api("/api/admin/promo", null, undefined, true)).status === 200);
  const rej = await api(`/api/admin/promo/${promos[1].id}/reject`, null, {}, true);
  check("reject frees the slot", rej.status === 200 && rej.json.status === "rejected");
  let w9: any = null;
  for (let i = 0; i < 20 && !w9; i++) { await sleep(500); w9 = await PG.pg.one<any>("select * from mine.vault_promos where wallet = ?", W9); }
  check("for the next one (not the rejected holder's other wallet, not money sent during a sale)", w9?.status === "candidate"
    && !(await PG.pg.one("select 1 from mine.vault_promos where wallet = ? or wallet = ?", W5, W8)), JSON.stringify(w9));
  check("a rejected one stays rejected", (await api(`/api/admin/promo/${promos[1].id}/approve`, a, {})).status === 409);
  const before = sent.filter((x) => x.data.startsWith(transferSel)).length;
  const ok = await api(`/api/admin/promo/${promos[0].id}/approve`, a, {});
  check("alice approves W6", ok.status === 200 && ok.json.status === "approved", JSON.stringify(ok.json));
  let paid: any = null;
  for (let i = 0; i < 30 && !(paid?.status === "paid" && paid.request_id); i++) { await sleep(500); paid = await PG.pg.one<any>("select *, (extract(epoch from paid_at) * 1000)::float8 as paid_ms from mine.vault_promos where id = ?", promos[0].id); }
  await sleep(2500);   // more ticks: never twice
  const ptx = sent.filter((x) => x.data.startsWith(transferSel)).slice(before);
  const pamt = ptx[0] ? BigInt(`0x${ptx[0].data.slice(8 + 64, 8 + 128)}`) : 0n;
  check("one $20 FLYAI transfer into the fly's wallet, once", ptx.length === 1 && ptx[0].to.toLowerCase() === TOKEN.toLowerCase()
    && `0x${ptx[0].data.slice(8 + 24, 8 + 64)}`.toLowerCase() === W6.toLowerCase() && pamt === 20n * PER_DOLLAR, `${ptx.length} sent, ${pamt}`);
  check("paid, decided by alice", paid?.status === "paid" && paid.grant_tx?.startsWith("0x") && paid.decided_by === alice.address.toLowerCase()
    && paid.grant_wei === (20n * PER_DOLLAR).toString(), JSON.stringify(paid));
  const preqs = await PG.pg.all<any>("select * from mine.vault_requests where kind = 'promo_grant'");
  check("exactly one promo_grant request for the desk, locked 14 days", preqs.length === 1 && preqs[0].wallet === W6 && preqs[0].id == paid.request_id
    && preqs[0].requester === "mine" && preqs[0].params.promo_id == promos[0].id && preqs[0].params.usd === 20 && preqs[0].params.tx === paid.grant_tx
    && preqs[0].params.wei === paid.grant_wei && preqs[0].params.until_ms === Math.round(paid.paid_ms) + 14 * 86_400_000, JSON.stringify(preqs));
  check("a paid one can't be approved or rejected again", (await api(`/api/admin/promo/${promos[0].id}/approve`, a, {})).status === 409
    && (await api(`/api/admin/promo/${promos[0].id}/reject`, a, {})).status === 409);
  const pub1 = (await api("/api/vaults/promo", null)).json;
  check("public numbers: rejected rows don't count", pub1.taken === 2 && pub1.left === 0, JSON.stringify(pub1));

  // automatic (2026-10-04, the user: "make it automatic actually"): W9 waits while its wallet isn't trading, then pays
  { const s0 = server as unknown as ReturnType<typeof spawn>; const gone = new Promise((r) => s0.once("exit", r)); s0.kill("SIGKILL"); await gone; }
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'robinhood', ?, 30) on conflict (wallet, chain) do update set principal_usd = 30, holder = excluded.holder",
    W9, w9.holder);
  // the test's deposits are stamped ahead of the clock: settled = qualified an hour ago
  await PG.pg.run("update mine.vault_promos set qualified_at = now() - interval '1 hour' where wallet = ?", W9);
  await startServer({ PROMO_AUTO: "1", PROMO_SETTLE_MIN: "30", PROMO_NEAR_MIN: "0" });
  await sleep(3000);
  check("auto: not while the wallet isn't trading (under the $FLYAI hold)",
    (await PG.pg.one<any>("select status from mine.vault_promos where wallet = ?", W9))?.status === "candidate");
  const sentBefore = sent.filter((x) => x.data.startsWith(transferSel)).length;
  await PG.pg.run("insert into mine.vault_public (key, value) values (?, ?::text::jsonb) on conflict (key) do update set value = excluded.value",
    `vault:${W9}`, JSON.stringify({ vault: W9, value: 30, active: true }));
  let w9p: any = null;
  for (let i = 0; i < 30 && !(w9p?.status === "paid" && w9p.request_id); i++) { await sleep(500); w9p = await PG.pg.one<any>("select * from mine.vault_promos where wallet = ?", W9); }
  await sleep(2500);
  check("auto: trading and settled -> paid once, decided by 'auto'", w9p?.status === "paid" && w9p.decided_by === "auto"
    && sent.filter((x) => x.data.startsWith(transferSel)).length - sentBefore === 1, JSON.stringify(w9p));
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
