/**
 * Partners on the compute server (src/partners.ts): the admin adds a partner, the site lists it, a holder finds their
 * NFTs, the owner sets up a wallet, saves settings and withdraws - against a stand-in chain (the collection's owners,
 * Robinhood's $FLYAI and gas) and a real Postgres.
 *   npm run test:partners
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

const PORT = 8795, CHAIN_PORT = 8796;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-partnerstest-${process.pid}.db`);
const NFT = "0x" + "33".repeat(20);
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
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

// ---- the chains' stand-in (one RPC plays both the collection's chain and Robinhood): Bulla #0 and #7 are alice's
const owner: Record<number, string> = {};
const flyai: Record<string, bigint> = {};
const ethOf: Record<string, bigint> = {};
const W7 = checksumAddress("0x" + "07".repeat(20));
const chain = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const { id, method, params } = JSON.parse(body);
    const answer = (result: unknown) => res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    const revert = () => res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } }));
    res.setHeader("content-type", "application/json");
    if (method === "eth_getBalance") return answer(`0x${(ethOf[String(params[0]).toLowerCase()] ?? 0n).toString(16)}`);
    if (method === "eth_getCode") return answer("0x");            // no Multicall3 here: the sweep goes one call at a time
    if (method !== "eth_call") return revert();
    const to: string = params[0].to.toLowerCase(), data: string = params[0].data;
    if (to === NFT && data.startsWith(selector("ownerOf(uint256)"))) {
      const n = Number(BigInt(`0x${data.slice(10, 74)}`));
      return owner[n] ? answer(`0x${word(owner[n])}`) : revert();
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
const admin = { authorization: `Bearer ${ADMIN}` };

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5548);
try {
  const rpcUrl = `http://127.0.0.1:${CHAIN_PORT}`;
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "50", ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none",
      CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost", SEED_PAID: "0", ARENA_ON: "0",
      VAULT_RPC: rpcUrl, PARTNERS_TTL_SEC: "1", PARTNER_OWNER_TTL_SEC: "1", PARTNER_OWNERS_TTL_SEC: "1",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
  owner[0] = alice.address; owner[7] = alice.address; owner[9] = bob.address;
  flyai[alice.address.toLowerCase()] = 250_000n * WEI;
  flyai[bob.address.toLowerCase()] = 10n * WEI;
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const a = await signIn(alice), b = await signIn(bob);

  // ---- the migration's Bullas row is off; the admin adds a test partner
  check("the seeded Bullas row is off: not listed", (await api("/api/partners", null)).json.partners.length === 0
    && (await api("/api/partners/bullas", null)).status === 404);
  const cfg = { collection: { chain: "testchain", chain_id: 31337, rpc: rpcUrl, contract: NFT, first_id: 0, last_id: 12, image: "https://img" },
                fee_bps: 400, partner_fee_to: null, hold_flyai: 200000,
                pool: { on: true, mode: "paper", asset: "USDG", paper_usd: 1000 } };
  check("admin only", (await api("/api/admin/partners/testers", a, { name: "Testers", on: true, config: cfg })).status === 403);
  check("a bad config is refused", (await api("/api/admin/partners/testers", null, { config: { ...cfg, collection: { ...cfg.collection, contract: "0x12" } } }, admin)).status === 400);
  check("a bad id is refused", (await api("/api/admin/partners/Bad_Id", null, { config: cfg }, admin)).status === 400);
  const added = await api("/api/admin/partners/testers", null, { name: "Testers", on: true, config: cfg }, admin);
  check("the admin adds it", added.status === 200 && added.json.saved.book === "p_testers" && added.json.on === true, JSON.stringify(added.json));
  const list = (await api("/api/admin/partners", null, undefined, admin)).json.partners;
  check("the admin lists both rows", list.length === 2 && list.every((r: any) => r.ok), JSON.stringify(list.map((r: any) => [r.id, r.ok, r.error])));
  const pub = (await api("/api/partners", null)).json.partners;
  check("the site lists it", pub.length === 1 && pub[0].id === "testers" && pub[0].collection.image === "https://img" && pub[0].pool.on === true
    && !("rpc" in pub[0].collection) && !("partner_fee_to" in pub[0]), JSON.stringify(pub));

  const conf = (await api("/api/partners/testers/config", null)).json;
  check("config in the Fly Wallets' shape", conf.on === true && conf.hold_flyai === 200000 && conf.grant_usd === 0
    && Array.isArray(conf.chains) && conf.wallets.fee.profit_bps === 400 && conf.partner.id === "testers", JSON.stringify(conf).slice(0, 200));

  // ---- a token: the fly view shape
  const t7 = (await api("/api/partners/testers/token/7", null)).json;
  check("an NFT with no wallet yet", t7.fly === 7 && t7.owner === alice.address && t7.wallet === null && t7.status === "no_wallet"
    && t7.chain === "p_testers" && t7.hold.ok === true && t7.hold.flyai === 250000, JSON.stringify(t7));
  check("ids are 0..12", (await api("/api/partners/testers/token/13", null)).status === 400 && (await api("/api/partners/testers/token/0", null)).status === 200);
  check("an unminted id has no owner", (await api("/api/partners/testers/token/5", null)).json.status === "no_owner");

  // ---- setup by the owner; the desk makes the wallet
  check("setup needs a session", (await api("/api/partners/testers/token/7/setup", null, {})).status === 401);
  check("only the owner sets up", (await api("/api/partners/testers/token/7/setup", b, {})).status === 403);
  const s1 = await api("/api/partners/testers/token/7/setup", a, {});
  check("alice asks for #7's wallet", s1.status === 200 && s1.json.status === "new" && s1.json.request > 0, JSON.stringify(s1.json));
  check("asking again doesn't queue twice", (await api("/api/partners/testers/token/7/setup", a, {})).json.request === s1.json.request);
  const req1 = await PG.pg.one<any>("select wallet, chain, kind, params from mine.vault_requests where id = ?", s1.json.request);
  check("queued for the partner desk", req1?.wallet === "p_testers:7" && req1.chain === "p_testers" && req1.kind === "register" && req1.params.token === 7, JSON.stringify(req1));
  check("followed like any wallet request", (await api(`/api/vaults/requests/${s1.json.request}`, null)).json.kind === "register");
  await PG.pg.run("insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('p_testers:7', null, ?, 'x', 'y')", W7);
  check("setup now answers ready", (await api("/api/partners/testers/token/7/setup", a, {})).json.wallet === W7);
  const t7b = (await api("/api/partners/testers/token/7", null)).json;
  check("its wallet, nobody's money yet", t7b.wallet === W7 && t7b.status === "not_funded" && t7b.ledger === null, JSON.stringify(t7b));
  check("looked up by the wallet", (await api(`/api/partners/testers/wallet/${W7}`, null)).json.token === 7);
  check("not a Trader Fly wallet", (await api(`/api/vaults/${W7}/settings`, a, { settings: { starter: "dip_buyer" } })).status !== 200);

  // ---- settings and money
  const doc = { starter: "dip_buyer", risk: 2 };
  check("bob can't set up alice's", (await api(`/api/partners/testers/wallet/${W7}/settings`, b, { settings: doc })).status === 403);
  const saved = await api(`/api/partners/testers/wallet/${W7}/settings`, a, { settings: doc });
  check("alice sets it up", saved.status === 200 && saved.json.chain === "p_testers" && saved.json.token === 7, JSON.stringify(saved.json));
  const key = await PG.pg.one<{ vault: string }>("select vault from mine.vault_settings");
  check("stored under p_testers:<wallet> (what the partner desk reads)", key?.vault === `p_testers:${W7}`, JSON.stringify(key));
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'p_testers', ?, 100)", W7, alice.address);
  check("funded in USDG only: needs gas", (await api("/api/partners/testers/token/7", null)).json.status === "needs_gas");
  ethOf[W7.toLowerCase()] = 4n * 10n ** 14n;
  check("active", (await api("/api/partners/testers/token/7", null)).json.status === "active");
  flyai[alice.address.toLowerCase()] = 199_999n * WEI;
  check("under the hold: below_hold", (await api("/api/partners/testers/token/7", null)).json.status === "below_hold");
  flyai[alice.address.toLowerCase()] = 250_000n * WEI;
  check("only the holder withdraws", (await api(`/api/partners/testers/wallet/${W7}/withdraw`, b, { bps: 5000 })).status === 403);
  const w = await api(`/api/partners/testers/wallet/${W7}/withdraw`, a, { bps: 5000 });
  check("a withdrawal for the partner desk", w.status === 200 && w.json.status === "new", JSON.stringify(w.json));
  check("one at a time", (await api(`/api/partners/testers/wallet/${W7}/withdraw`, a, { bps: 5000 })).status === 409);

  // ---- my NFTs, the leaderboard, the pot
  await PG.pg.run(`insert into mine.vault_public (key, value) values ('leaderboard:p_testers', ?::text::jsonb), ('p_testers:pool', ?::text::jsonb),
    ('p_testers:pool:holders', ?::text::jsonb), ('p_testers:pool:epoch:1', ?::text::jsonb)`,
    JSON.stringify({ all: [{ vault: W7, profit: 3 }], d7: [], h24: [] }), JSON.stringify({ mode: "paper", excess: 12.5, epochs: [] }),
    JSON.stringify({ holders: { [alice.address.toLowerCase()]: { tokens: [0, 7], flyai: 250000, qualifies: true, epoch_hours: 12, epoch_est_usd: 4.2, owed_usd: 1 } } }),
    JSON.stringify({ epoch: 1, payable: 10 }));
  const h = (await api(`/api/partners/testers/holder/${alice.address}`, null)).json;
  check("a holder: their NFTs, wallets, the pot", JSON.stringify(h.tokens) === "[0,7]" && h.wallets.length === 1 && h.wallets[0].wallet === W7
    && h.wallets[0].token === 7 && h.hold.ok === true && h.pool.epoch_est_usd === 4.2 && h.holding_money_in.length === 1, JSON.stringify(h));
  check("bob has #9", JSON.stringify((await api(`/api/partners/testers/holder/${bob.address}`, null)).json.tokens) === "[9]");
  check("leaderboard", (await api("/api/partners/testers/leaderboard", null)).json.all[0].vault === W7);
  check("the pot", (await api("/api/partners/testers/pool", null)).json.excess === 12.5);
  check("an epoch", (await api("/api/partners/testers/pool/epochs/1", null)).json.payable === 10
    && (await api("/api/partners/testers/pool/epochs/2", null)).status === 404);

  // ---- a sale, then the admin switches it off
  owner[7] = bob.address;
  await sleep(1100);
  check("sold: owner_changed until the desk closes it", (await api("/api/partners/testers/token/7", null)).json.status === "owner_changed");
  check("the new owner can't change the old holder's settings", (await api(`/api/partners/testers/wallet/${W7}/settings`, b, { settings: doc })).status === 403);
  check("switched off", (await api("/api/admin/partners/testers", null, { on: false }, admin)).status === 200
    && (await api("/api/partners/testers/token/7", null)).status === 404 && (await api("/api/partners", null)).json.partners.length === 0);
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
