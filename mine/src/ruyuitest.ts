/**
 * RUYUI on the compute server (src/ruyui.ts): what Ruyui's front-end reads, who may set up a RUYUI's wallet, save its
 * settings and withdraw, the partner sign-in, and that RUYUI wallets never pass for Trader Fly wallets - against a
 * stand-in chain (Abstract's owners, Robinhood's $FLYAI) and a real Postgres.
 *   npm run test:ruyui
 */
import { spawn } from "node:child_process";
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

const PORT = 8793, CHAIN_PORT = 8794;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-ruyuitest-${process.pid}.db`);
const RUYUI = "0x9ce89a1303f2d52a9d7840fcd5a6870c2a8550c0";
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const PARTNER = "https://ruyui.example";
const WEI = 10n ** 18n;
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

// ---- the chains' stand-in: RUYUI #7 and #8 are alice's; alice holds 250k $FLYAI, bob 10
const owner: Record<number, string> = {};
const flyai: Record<string, bigint> = {};
const ethOf: Record<string, bigint> = {};
const W7 = checksumAddress("0x" + "07".repeat(20));          // RUYUI #7's wallet (the desk makes it on request)
// an Abstract Global Wallet (a contract account): ERC-1271 says yes to the signatures in agwOk
const AGW = checksumAddress("0x" + "a9".repeat(20));
const agwOk = new Set<string>();
// Ruyui's staking: the contract holds staked RUYUIs; their API (served by the stand-in at /staking) lists the stakers
const STAKING = checksumAddress("0x" + "5a".repeat(20));
const stakers: { address: string; stakedCount: number; nftList: number[] }[] = [];
const chain = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/staking") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(stakers)); }
    const { id, method, params } = JSON.parse(body);
    const answer = (result: unknown) => res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    const revert = () => res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } }));
    res.setHeader("content-type", "application/json");
    if (method === "eth_getBalance") return answer(`0x${(ethOf[String(params[0]).toLowerCase()] ?? 0n).toString(16)}`);
    if (method === "eth_getCode") return answer(String(params[0]).toLowerCase() === AGW.toLowerCase() ? "0x6080" : "0x");
    if (method !== "eth_call") return revert();
    const to: string = params[0].to.toLowerCase(), data: string = params[0].data;
    if (to === RUYUI && data.startsWith(selector("ownerOf(uint256)"))) {
      const n = Number(BigInt(`0x${data.slice(10, 74)}`));
      return owner[n] ? answer(`0x${word(owner[n])}`) : revert();
    }
    if (to === AGW.toLowerCase() && data.startsWith(selector("isValidSignature(bytes32,bytes)"))) {
      const len = Number(BigInt(`0x${data.slice(10 + 128, 10 + 192)}`));
      const sig = `0x${data.slice(10 + 192, 10 + 192 + len * 2)}`.toLowerCase();
      return answer(`0x${agwOk.has(sig) ? "1626ba7e" : "ffffffff"}${"0".repeat(56)}`);
    }
    if (to === FLYAI.toLowerCase() && data.startsWith(selector("balanceOf(address)"))) {
      return answer(`0x${word(flyai[`0x${data.slice(34, 74)}`.toLowerCase()] ?? 0n)}`);
    }
    revert();
  });
});
await new Promise<void>((r) => chain.listen(CHAIN_PORT, "127.0.0.1", r));

async function api(path: string, session: string | null, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(session ? { "x-flyai-session": session } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5547);
try {
  const rpcUrl = `http://127.0.0.1:${CHAIN_PORT}`;
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "50", ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none",
      CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost", SEED_PAID: "0", ARENA_ON: "0",
      RUYUI_ON: "1", RUYUI_OWNER_TTL_SEC: "1", RUYUI_STAKING_API: `${rpcUrl}/staking`, RUYUI_STAKING_CONTRACT: STAKING, VAULT_RPC: rpcUrl, ABSTRACT_RPC: rpcUrl, PARTNER_ORIGINS: `${PARTNER}, https://other.example/`,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
  owner[7] = alice.address; owner[8] = alice.address;
  flyai[alice.address.toLowerCase()] = 250_000n * WEI;
  flyai[bob.address.toLowerCase()] = 10n * WEI;

  // sign-in from their site: the message names their domain; from anywhere else, ours
  const n1 = (await api("/api/session/nonce", null, { address: alice.address }, { origin: PARTNER })).json;
  check("their site's sign-in names their domain", n1.message.startsWith("ruyui.example wants you to sign in") && /trading wallets/.test(n1.message), n1.message.split("\n")[0]);
  const n2 = (await api("/api/session/nonce", null, { address: alice.address }, { origin: "https://evil.example" })).json;
  check("an unlisted origin gets ours", !n2.message.startsWith("evil.example") && /fly\.ai/.test(n2.message), n2.message.split("\n")[0]);
  check("a listed origin with a trailing slash in the env counts", (await api("/api/session/nonce", null, { address: alice.address }, { origin: "https://other.example" })).json.message.startsWith("other.example"));
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address }, { origin: PARTNER });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const a = await signIn(alice), b = await signIn(bob);
  check("signed in from their site", /^[0-9a-f]{64}$/.test(a) && /^[0-9a-f]{64}$/.test(b));

  const cfg = (await api("/api/ruyui/config", null)).json;
  check("config: the collection, deposits, hold, fee, pool", cfg.on === true && cfg.collection.chain_id === 2741
    && cfg.collection.contract.toLowerCase() === RUYUI && cfg.wallets.chain_id === 4663 && cfg.wallets.fee.profit_bps === 200
    && cfg.hold.amount === 200000 && cfg.hold.staked_counts === false && cfg.pool.fee_bps === 50
    && cfg.wallets.deposit.map((x: any) => x.symbol).join(",") === "ETH,USDG" && cfg.wallets.gas.min_eth === 0.00005, JSON.stringify(cfg));

  const t7 = (await api("/api/ruyui/token/7", null)).json;
  check("a RUYUI with no wallet yet", t7.token === 7 && t7.owner === alice.address && t7.wallet === null && t7.status === "no_wallet"
    && t7.hold.ok === true && t7.hold.flyai === 250000, JSON.stringify(t7));
  check("ids are 1..7000", (await api("/api/ruyui/token/0", null)).status === 400 && (await api("/api/ruyui/token/7001", null)).status === 400);
  check("a token nobody owns reads as no owner", (await api("/api/ruyui/token/9", null)).json.owner === null);

  // setup: the owner on Abstract asks; the desk makes the wallet
  check("setup needs a session", (await api("/api/ruyui/token/7/setup", null, {})).status === 401);
  check("only the owner sets up", (await api("/api/ruyui/token/7/setup", b, {})).status === 403);
  const s1 = await api("/api/ruyui/token/7/setup", a, {});
  check("alice asks for #7's wallet", s1.status === 200 && s1.json.status === "new" && s1.json.wallet === null && s1.json.request > 0, JSON.stringify(s1.json));
  const s2 = await api("/api/ruyui/token/7/setup", a, {});
  check("asking again doesn't queue twice", s2.json.request === s1.json.request);
  check("the token shows the setup on its way", (await api("/api/ruyui/token/7", null)).json.setup?.id === s1.json.request);
  check("the request can be followed", (await api(`/api/ruyui/requests/${s1.json.request}`, null)).json.kind === "register");
  // the desk (flytrade/vaults/ruyui.py register_tick) makes it
  await PG.pg.run("insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('ruyui:7', null, ?, 'x', 'y')", W7);
  await PG.pg.run("update mine.vault_requests set status = 'done', result = ?::text::jsonb where id = ?", JSON.stringify({ token: 7, wallet: W7 }), s1.json.request);
  const r1 = (await api(`/api/ruyui/requests/${s1.json.request}`, null)).json;
  check("done: the wallet is in the answer", r1.status === "done" && r1.wallet === W7 && typeof r1.at === "number", JSON.stringify(r1));
  check("setup now answers ready", (await api("/api/ruyui/token/7/setup", a, {})).json.wallet === W7);
  const t7b = (await api("/api/ruyui/token/7", null)).json;
  check("the token has its wallet, nobody's money yet", t7b.wallet === W7 && t7b.status === "not_funded" && t7b.ledger === null, JSON.stringify(t7b));
  check("looked up by the wallet too", (await api(`/api/ruyui/wallet/${W7}`, null)).json.token === 7);

  // RUYUI wallets are not Trader Fly wallets
  check("the Trader Fly endpoints refuse it", (await api(`/api/vaults/${W7}/settings`, a, { settings: { starter: "dip_buyer" } })).status !== 200);
  check("an unknown wallet is not a RUYUI's", (await api(`/api/ruyui/wallet/${checksumAddress("0x" + "77".repeat(20))}`, null)).status === 404);

  // settings: the owner before money is in
  const doc = { starter: "dip_buyer", risk: 2 };
  check("bob can't set up alice's RUYUI", (await api(`/api/ruyui/wallet/${W7}/settings`, b, { settings: doc })).status === 403);
  check("settings must be an object", (await api(`/api/ruyui/wallet/${W7}/settings`, a, { settings: [1] })).status === 400);
  const saved = await api(`/api/ruyui/wallet/${W7}/settings`, a, { settings: doc });
  check("alice sets it up", saved.status === 200 && saved.json.settings.starter === "dip_buyer" && saved.json.token === 7);
  const key = await PG.pg.one<{ vault: string; t: string }>("select vault, jsonb_typeof(doc) as t from mine.vault_settings");
  check("stored under ruyui:<wallet> as a JSON object (what the RUYUI desk reads)", key?.vault === `ruyui:${W7}` && key?.t === "object", JSON.stringify(key));
  check("and read back on the token", (await api("/api/ruyui/token/7", null)).json.settings?.starter === "dip_buyer");

  // money in (the desk's ledger under 'ruyui'): the holder decides and withdraws
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'ruyui', ?, 100)", W7, alice.address);
  check("funded in USDG only: needs gas (no loans)", (await api("/api/ruyui/token/7", null)).json.status === "needs_gas");
  ethOf[W7.toLowerCase()] = 4n * 10n ** 14n;               // the holder sends 0.0004 ETH
  const g7 = (await api("/api/ruyui/token/7", null)).json;
  check("funded and active", g7.status === "active" && g7.gas.eth === 0.0004 && g7.gas.needs_gas === false, JSON.stringify(g7.gas));
  flyai[alice.address.toLowerCase()] = 199_999n * WEI;
  check("under 200k $FLYAI: below_hold", (await api("/api/ruyui/token/7", null)).json.status === "below_hold");
  flyai[alice.address.toLowerCase()] = 250_000n * WEI;
  check("only the holder withdraws", (await api(`/api/ruyui/wallet/${W7}/withdraw`, b, { bps: 5000 })).status === 403);
  check("bps 1..10000", (await api(`/api/ruyui/wallet/${W7}/withdraw`, a, { bps: 0 })).status === 400);
  const w = await api(`/api/ruyui/wallet/${W7}/withdraw`, a, { bps: 5000 });
  check("a withdrawal for the RUYUI desk", w.status === 200 && w.json.status === "new", JSON.stringify(w.json));
  const row = await PG.pg.one<any>("select chain, kind, params from mine.vault_requests where id = ?", w.json.id);
  check("queued under chain ruyui", row?.chain === "ruyui" && row.kind === "withdraw" && row.params.bps === 5000);
  check("one at a time", (await api(`/api/ruyui/wallet/${W7}/withdraw`, a, { bps: 5000 })).status === 409);
  await PG.pg.run("update mine.vault_requests set status = 'done' where id = ?", w.json.id);
  owner[7] = bob.address;
  await sleep(1100);                                         // (the views cache owners RUYUI_OWNER_TTL_SEC)
  check("sold on Abstract: owner_changed until the desk closes it", (await api("/api/ruyui/token/7", null)).json.status === "owner_changed");
  await PG.pg.run("update mine.vault_ledger set closing = true where wallet = ?", W7);
  check("no withdrawal while a sold RUYUI is paid out", (await api(`/api/ruyui/wallet/${W7}/withdraw`, a, { bps: 5000 })).status === 409);
  check("the new owner can't change the old holder's settings", (await api(`/api/ruyui/wallet/${W7}/settings`, b, { settings: doc })).status === 403);
  check("a Trader Fly request isn't readable here", (await api(`/api/ruyui/requests/999999`, null)).status === 404);

  // the desk's snapshots: leaderboard, pool, holders
  await PG.pg.run(`insert into mine.vault_public (key, value) values ('leaderboard:ruyui', ?::text::jsonb), (?, ?::text::jsonb),
    ('ruyui:pool', ?::text::jsonb), ('ruyui:pool:holders', ?::text::jsonb), ('ruyui:pool:epoch:1', ?::text::jsonb)`,
    JSON.stringify({ all: [{ vault: W7, profit: 3 }], d7: [], h24: [] }), `vault:ruyui:${W7}`, JSON.stringify({ vault: W7, value: 103 }),
    JSON.stringify({ mode: "paper", excess: 12.5, last_check: 1790000000, epochs: [] }),
    JSON.stringify({ holders: { [alice.address.toLowerCase()]: { tokens: [7, 8], flyai: 250000, qualifies: true, epoch_hours: 12, epoch_est_usd: 4.2, owed_usd: 1 } } }),
    JSON.stringify({ epoch: 1, payable: 10 }));
  check("leaderboard", (await api("/api/ruyui/leaderboard", null)).json.all[0].vault === W7);
  check("the wallet's stats", (await api(`/api/ruyui/wallet/${W7}`, null)).json.stats?.value === 103);
  check("the pool", (await api("/api/ruyui/pool", null)).json.excess === 12.5);
  check("an epoch", (await api("/api/ruyui/pool/epochs/1", null)).json.payable === 10 && (await api("/api/ruyui/pool/epochs/2", null)).status === 404);
  const h = (await api(`/api/ruyui/holder/${alice.address}`, null)).json;
  check("a holder: tokens, wallets, the pool", h.flyai === 250000 && h.hold.ok === true && JSON.stringify(h.tokens) === "[7,8]"
    && h.wallets.length === 1 && h.wallets[0].wallet === W7 && h.pool.qualifies === true && h.pool.epoch_est_usd === 4.2
    && h.holding_money_in.length === 1 && h.tokens_checked_at === 1790000000, JSON.stringify(h));
  check("a stranger: nothing", (await api(`/api/ruyui/holder/${bob.address}`, null)).json.pool === null);
  const adm = await api("/api/admin/ruyui", null, undefined, { authorization: `Bearer ${ADMIN}` });
  check("admin", adm.status === 200 && adm.json.wallets === 1 && adm.json.funded.length === 1 && adm.json.requests.length === 2, JSON.stringify(adm.json).slice(0, 200));
  check("admin only", (await api("/api/admin/ruyui", a)).status === 403);

  // ---- an Abstract Global Wallet holds RUYUI #9; bob's Robinhood Chain wallet runs it once the AGW signed the link
  owner[9] = AGW;
  const t9 = (await api("/api/ruyui/token/9", null)).json;
  check("unlinked: the AGW is the owner", t9.owner === AGW && t9.nft_owner === AGW && t9.linked === false, JSON.stringify(t9).slice(0, 160));
  check("bob can't set up the AGW's RUYUI", (await api("/api/ruyui/token/9/setup", b, {})).status === 403);
  const lm = (await api(`/api/ruyui/link/message?owner=${AGW}&signer=${bob.address}`, null)).json;
  check("the link message names both wallets", lm.message.includes(AGW) && lm.message.includes(bob.address) && !!lm.issued_at, lm.message);
  const good = alice.sign(lm.message);                  // stands in for the AGW's own ERC-1271 signature
  agwOk.add(good.toLowerCase());
  check("linking needs a session", (await api("/api/ruyui/link", null, { owner: AGW, issued_at: lm.issued_at, signature: good })).status === 401);
  check("a wrong signature is refused", (await api("/api/ruyui/link", b, { owner: AGW, issued_at: lm.issued_at, signature: bob.sign(lm.message) })).status === 401);
  check("alice can't take bob's link", (await api("/api/ruyui/link", a, { owner: AGW, signer: bob.address, issued_at: lm.issued_at, signature: good })).status === 403);
  const ln = await api("/api/ruyui/link", b, { owner: AGW, issued_at: lm.issued_at, signature: good });
  check("the AGW's signature links bob", ln.status === 200 && ln.json.signer === bob.address && ln.json.linked === true, JSON.stringify(ln.json));
  check("an older link can't replace it", (await api("/api/ruyui/link", b, { owner: AGW, issued_at: new Date(Date.parse(lm.issued_at) - 60_000).toISOString(), signature: good })).status !== 200);
  check("a stale link is refused", (await api("/api/ruyui/link", b, { owner: AGW, issued_at: "2026-01-01T00:00:00.000Z", signature: good })).status === 400);
  const lv = (await api(`/api/ruyui/link/${AGW}`, null)).json, lb = (await api(`/api/ruyui/link/${bob.address}`, null)).json;
  check("the link reads both ways", lv.signer === bob.address && JSON.stringify(lb.acts_for) === JSON.stringify([AGW]), JSON.stringify([lv, lb]));
  await sleep(1100);                                     // the owner cache (RUYUI_OWNER_TTL_SEC=1)
  const t9b = (await api("/api/ruyui/token/9", null)).json;
  check("linked: bob runs it, the AGW still holds the NFT", t9b.owner === bob.address && t9b.nft_owner === AGW && t9b.linked === true, JSON.stringify(t9b).slice(0, 160));
  const s9 = await api("/api/ruyui/token/9/setup", b, {});
  check("bob sets up the AGW's RUYUI", s9.status === 200 && s9.json.status === "new", JSON.stringify(s9.json));
  check("alice (not linked) still can't", (await api("/api/ruyui/token/9/setup", a, {})).status === 403);

  // ---- staked RUYUIs: the staking contract holds them; the staking API (asked first) says whose they are
  owner[10] = STAKING; owner[11] = STAKING;
  stakers.push({ address: alice.address.toLowerCase(), stakedCount: 1, nftList: [10] });
  await sleep(5200);                                     // the staking list is re-read on a miss at most every 5 s
  const t10 = (await api("/api/ruyui/token/10", null)).json;
  check("staked: the staker owns it", t10.owner === alice.address && t10.nft_owner === alice.address && t10.staked === true, JSON.stringify(t10).slice(0, 180));
  const s10 = await api("/api/ruyui/token/10/setup", a, {});
  check("the staker sets it up", s10.status === 200 && s10.json.token === 10, JSON.stringify(s10.json));
  check("bob can't", (await api("/api/ruyui/token/10/setup", b, {})).status === 403);
  const t11 = await api("/api/ruyui/token/11", null);
  check("staked but not on the list: try again (503), never someone else's", t11.status === 503, JSON.stringify(t11.json));
  check("not staked: as before", (await api("/api/ruyui/token/7", null)).json.staked === false);
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
