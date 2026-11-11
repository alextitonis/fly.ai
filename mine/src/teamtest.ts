/**
 * Team reports (src/team.ts): only allowlisted wallets report, admins keep the list and see everyone, against a real
 * Postgres.
 *   npm run test:team
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { startPg } from "./pgtest.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8796;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-teamtest-${process.pid}.db`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const [team, alice, bob] = [0, 1, 2].map(() => {
  const sk = secp256k1.utils.randomSecretKey();
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});

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
const PG = await startPg(5548);
try {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "50", ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none",
      CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost", SEED_PAID: "0", ARENA_ON: "0",
      BOUNTY_ADMINS: alice.address, TEAM_ADMINS: team.address,
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
  const [t, a, b] = [await signIn(team), await signIn(alice), await signIn(bob)];

  const A = alice.address.toLowerCase(), B = bob.address.toLowerCase();
  check("no session: 401", (await api("/api/team/me", null)).status === 401);
  const meA = (await api("/api/team/me", a)).json;
  check("alice isn't on the list yet", meA?.member === false && meA.admin === false, JSON.stringify(meA));
  check("a BOUNTY_ADMINS wallet is NOT a team admin", (await api("/api/team/me", a)).json?.admin === false);
  check("the TEAM_ADMINS wallet is admin", (await api("/api/team/me", t)).json?.admin === true);
  check("non-member can't report", (await api("/api/team/report", a, { what: "did stuff" })).status === 403);
  check("non-member can't read", (await api("/api/team/reports", a)).status === 403);
  check("non-admin can't add", (await api("/api/team/members", a, { wallet: A, name: "Alice" })).status === 403);
  check("bad wallet rejected", (await api("/api/team/members", t, { wallet: "0x123", name: "x" })).status === 400);
  check("admin adds alice", (await api("/api/team/members", t, { wallet: alice.address, name: "Alice TR" })).json?.members?.[A]?.name === "Alice TR");
  check("admin token adds bob", (await api("/api/team/members", null, { wallet: bob.address, name: "Bob" }, true)).status === 200);
  check("alice is a member now", (await api("/api/team/me", a)).json?.member === true);
  check("empty report rejected", (await api("/api/team/report", a, { what: "  " })).status === 400);
  check("javascript: link rejected", (await api("/api/team/report", a, { what: "a thread", links: "javascript:alert(1)" })).status === 400);
  const r1 = (await api("/api/team/report", a, { what: "Posted a thread in Turkish", links: "https://x.com/a/status/1\nyoutube.com/watch?v=x https://x.com/a/status/1" })).json;
  check("alice reports, links cleaned + deduped", r1?.report?.links?.length === 2 && r1.report.links[1] === "https://youtube.com/watch?v=x", JSON.stringify(r1));
  const r2 = (await api("/api/team/report", b, { what: "Ran the Discord AMA", links: [] })).json;
  check("bob reports", !!r2?.report?.id);
  const la = (await api("/api/team/reports", a)).json;
  check("alice sees only her own", la?.reports?.length === 1 && la.reports[0].name === "Alice TR" && !la.members, JSON.stringify(la));
  const lt = (await api("/api/team/reports", t)).json;
  check("admin sees both + members table", lt?.reports?.length === 2 && lt.members?.length === 2 && lt.members.every((m: any) => m.week === 1), JSON.stringify(lt));
  check("admin filters by wallet", (await api(`/api/team/reports?wallet=${B}`, t)).json?.reports?.length === 1);
  check("alice can't delete bob's", (await api("/api/team/report/delete", a, { id: r2.report.id })).status === 403);
  check("alice deletes her own", (await api("/api/team/report/delete", a, { id: r1.report.id })).status === 200);
  check("admin deletes bob's", (await api("/api/team/report/delete", t, { id: r2.report.id })).status === 200);
  check("admin removes alice", (await api("/api/team/members/remove", t, { wallet: A })).status === 200);
  check("alice locked out again", (await api("/api/team/report", a, { what: "more stuff" })).status === 403);
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
