/**
 * Referrals on the compute server (src/referrals.ts): codes and links, the set-once referrer, new wallets only, no
 * self or loop referrals, nicknames as codes, real referrals and tiers, against a real Postgres.
 *   npm run test:referrals
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { startPg } from "./pgtest.ts";
import { createReferrals } from "./referrals.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8797;
const BASE = `http://localhost:${PORT}`;
const DB = join(tmpdir(), `mine-referralstest-${process.pid}.db`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const [alice, bob, carol, dave, erin] = [0, 1, 2, 3, 4].map(() => {
  const sk = secp256k1.utils.randomSecretKey();
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});

async function api(path: string, session: string | null, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(session ? { "x-flyai-session": session } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5549);
try {
  // carol was here before referrals launched (the migration's backfill marks such wallets old)
  await PG.pg.run("insert into mine.wallets_seen (wallet, old) values (?, true)", carol.address.toLowerCase());
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "50", ADMIN_TOKEN: "x", CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none",
      CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost", SEED_PAID: "0", ARENA_ON: "0",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const [a, b, c, d, e] = [await signIn(alice), await signIn(bob), await signIn(carol), await signIn(dave), await signIn(erin)];

  check("needs a session", (await api("/api/referral", null)).status === 401);
  const ma = (await api("/api/referral", a)).json;
  check("a code and a link of its own", /^[a-z0-9]{6,12}$/.test(ma?.code) && ma.link === `/?ref=${ma.code}`, JSON.stringify(ma));
  check("the same code every time", (await api("/api/referral", a)).json.code === ma.code);
  check("a new wallet may set a referrer", ma.can_set === true && ma.why_not === null && ma.referrer === null);
  check("who a code belongs to", (await api(`/api/referral/who?code=${ma.code}`, null)).json?.ok === true);
  check("an unknown code", (await api("/api/referral", b, { code: "zzzzzzzz", via: "link" })).status === 404);
  check("not your own code", (await api("/api/referral", a, { code: ma.code, via: "profile" })).status === 400);

  const mb = (await api("/api/referral", b, { code: ma.code.toUpperCase(), via: "link" })).json;
  check("bob joins through alice's link", mb?.referrer?.via === "link" && mb.can_set === false && mb.why_not === "set", JSON.stringify(mb));
  check("never changed after", (await api("/api/referral", b, { code: (await api("/api/referral", d)).json.code, via: "profile" })).status === 409);
  check("alice can't be referred back by bob", (await api("/api/referral", a, { code: mb.code, via: "profile" })).status === 400);
  const mc = (await api("/api/referral", c)).json;
  check("an old wallet can't set one", mc.can_set === false && mc.why_not === "old"
    && (await api("/api/referral", c, { code: ma.code, via: "link" })).status === 403);

  await api("/api/profile", a, { nickname: "Alicefly" });
  const md = (await api("/api/referral", d, { code: "alicefly", via: "profile" })).json;
  check("a nickname works as a code in the profile", md?.referrer?.name === "Alicefly", JSON.stringify(md));
  await PG.pg.run("update mine.wallets_seen set first_seen = now() - interval '15 days' where wallet = ?", erin.address.toLowerCase());
  check("too late after the first 14 days", (await api("/api/referral", e, { code: ma.code, via: "link" })).status === 403);

  // ---- real referrals and the tier
  let me = (await api("/api/referral", a)).json;
  check("two referred, none real yet", me.total === 2 && me.real === 0 && me.tier.cut_pct === 0.5 && me.next?.at === 10, JSON.stringify(me));
  const refs = createReferrals({ pg: PG.pg, HttpError: Error as any, send: () => {}, readJson: async () => ({}), sessionWallet: async () => "" });
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values ('0xv1', 'robinhood', ?, 25), ('0xv2', 'robinhood', ?, 5)",
    bob.address, dave.address);
  await refs.qualify();
  const row = await PG.pg.one<{ funded_since: string | null; qualified_at: string | null }>("select funded_since, qualified_at from mine.referrals where wallet = ?", bob.address.toLowerCase());
  check("funded >= $20: counting from now, not real yet", !!row?.funded_since && !row.qualified_at);
  check("under $20: not counting", !(await PG.pg.one<{ funded_since: string | null }>("select funded_since from mine.referrals where wallet = ?", dave.address.toLowerCase()))?.funded_since);
  await PG.pg.run("update mine.referrals set funded_since = now() - interval '8 days' where wallet = ?", bob.address.toLowerCase());
  await refs.qualify();
  me = (await api("/api/referral", a)).json;
  check("kept 7 days: real", me.real === 1 && me.referred.some((r: any) => r.real), JSON.stringify(me.referred));
  await PG.pg.run("update mine.vault_ledger set principal_usd = 0 where holder = ?", bob.address);
  await refs.qualify();
  check("real stays real after it's withdrawn", (await api("/api/referral", a)).json.real === 1);

  await PG.pg.run("insert into mine.ref_earnings (referrer, wallet, source, usd) values (?, ?, 'wallet', 0.25), (?, ?, 'desk', 1.5)",
    alice.address.toLowerCase(), bob.address.toLowerCase(), alice.address.toLowerCase(), bob.address.toLowerCase());
  me = (await api("/api/referral", a)).json;
  check("earnings by source", me.earned.wallet_usd === 0.25 && me.earned.desk_usd === 1.5 && me.earned.total_usd === 1.75 && me.recent.length === 2,
    JSON.stringify(me.earned));
  const tiers = (await api("/api/referral/tiers", null)).json;
  check("public tiers", tiers.tiers.length === 4 && tiers.tiers[3].at === 50 && tiers.tiers[3].cut_pct === 1.25);
  check("tier math", refs.tierOf(9).tier.cut_pct === 0.5 && refs.tierOf(10).tier.fee_discount === 0.1 && refs.tierOf(60).next === null);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  const s = server as ReturnType<typeof spawn> | null;
  if (s) { const gone = new Promise((r) => s.once("exit", r)); s.kill("SIGKILL"); await gone; }
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
