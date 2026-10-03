/**
 * Bounties on the compute server (src/bounties.ts): the team posts a contest and an apply bounty, wallets enter, the
 * team picks, approves and records payouts, and the farming rules hold, against a real Postgres.
 *   npm run test:bounties
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

const PORT = 8795;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-bountiestest-${process.pid}.db`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const [team, alice, bob, carol] = [0, 1, 2, 3].map(() => {
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
const PG = await startPg(5547);
try {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "50", ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none",
      CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost", SEED_PAID: "0", ARENA_ON: "0",
      BOUNTY_ADMINS: team.address,
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
  const [t, a, b, c] = [await signIn(team), await signIn(alice), await signIn(bob), await signIn(carol)];

  // ---- posting
  check("admin only (signed-in non-admin)", (await api("/api/admin/bounties", a)).status === 403);
  check("admin only (no session)", (await api("/api/admin/bounties", null, { title: "x" })).status === 403);
  check("the team wallet is an admin", (await api("/api/bounties/mine", t)).json?.admin === true);
  check("alice isn't", (await api("/api/bounties/mine", a)).json?.admin === false);
  check("a bounty needs a known kind", (await api("/api/admin/bounties", t, { title: "x", kind: "lottery", category: "dev", summary: "s", reward: "1" })).status === 400);
  const contest = (await api("/api/admin/bounties", t, { title: "Best fly meme", kind: "contest", category: "content",
    summary: "Make a meme", reward: "100,000 $FLYAI", winners: 2, status: "draft" })).json;
  check("post a draft contest", contest?.id > 0 && contest.status === "draft", JSON.stringify(contest));
  check("drafts aren't public", (await api("/api/bounties", null)).json.bounties.length === 0);
  check("drafts can't be entered", (await api("/api/bounties/enter", a, { bounty: contest.id, x_handle: "@alice", link: "https://x.com/alice/status/1" })).status === 404);
  const opened = (await api("/api/admin/bounties", null, { ...contest, status: "open" }, true)).json;
  check("open it (admin token works too)", opened?.status === "open" && opened.id === contest.id);
  const apply = (await api("/api/admin/bounties", t, { title: "Telegram bot", kind: "apply", category: "dev",
    summary: "A bot that posts fly market moves", reward: "500,000 $FLYAI", status: "open", deadline_ms: Date.now() + 86_400_000 })).json;

  // ---- entering
  check("entering needs a session", (await api("/api/bounties/enter", null, { bounty: contest.id, x_handle: "alice", link: "https://x.com" })).status === 401);
  check("a link must be https", (await api("/api/bounties/enter", a, { bounty: contest.id, x_handle: "alice", link: "javascript:alert(1)" })).status === 400);
  check("an X handle is required", (await api("/api/bounties/enter", a, { bounty: contest.id, x_handle: "not a handle!", link: "https://x.com/a/status/1" })).status === 400);
  const e1 = (await api("/api/bounties/enter", a, { bounty: contest.id, x_handle: "@Alice", link: "https://x.com/alice/status/1", note: "my meme" })).json;
  check("alice enters the contest", e1?.stage === "entry" && e1.x_handle === "alice" && e1.status === "pending", JSON.stringify(e1));
  const e1b = (await api("/api/bounties/enter", a, { bounty: contest.id, x_handle: "alice", link: "https://x.com/alice/status/2" })).json;
  check("a pending entry can be edited (same row)", e1b?.id === e1.id && e1b.link === "https://x.com/alice/status/2");
  check("one X account per wallet: bob can't use @alice",
    (await api("/api/bounties/enter", b, { bounty: contest.id, x_handle: "alice", link: "https://x.com/b/status/1" })).status === 409);
  check("one X account per wallet: alice can't switch to @alice2",
    (await api("/api/bounties/enter", a, { bounty: apply.id, x_handle: "alice2", link: "https://github.com/alice" })).status === 409);
  check("blocked handles can't enter (09-28 farm)",
    (await api("/api/bounties/enter", b, { bounty: contest.id, x_handle: "venomtraders_", link: "https://x.com/v/status/1" })).status === 403);
  await api("/api/admin/bounties/block", t, { value: carol.address, reason: "test" });
  check("a wallet the team blocks can't enter",
    (await api("/api/bounties/enter", c, { bounty: contest.id, x_handle: "carol", link: "https://x.com/c/status/1" })).status === 403);
  await api("/api/admin/bounties/block", t, { value: carol.address, unblock: true });
  check("unblocked again", (await api("/api/bounties/enter", c, { bounty: contest.id, x_handle: "carol", link: "https://x.com/c/status/1" })).status === 200);
  const pub = (await api("/api/bounties", null)).json;
  const pc = pub.bounties.find((x: any) => x.id === contest.id);
  check("public board: counts, no pending links or wallets", pc?.entries === 2 && pc.winners_list.length === 0 && !JSON.stringify(pub).includes(alice.address.toLowerCase()),
    JSON.stringify(pc));
  check("the explorer for tx links", pub.explorer === "http://localhost");

  // ---- apply -> pick -> final
  const ap = (await api("/api/bounties/enter", a, { bounty: apply.id, x_handle: "alice", link: "https://github.com/alice", note: "built 3 bots" })).json;
  const bp = (await api("/api/bounties/enter", b, { bounty: apply.id, x_handle: "bob", link: "https://github.com/bob" })).json;
  check("applications are the apply stage", ap?.stage === "apply" && bp?.stage === "apply");
  check("no final before being picked: another apply instead", (await api("/api/bounties/enter", b, { bounty: apply.id, x_handle: "bob", link: "https://github.com/bob/2" })).json?.stage === "apply");
  check("only an application can be picked", (await api("/api/admin/bounties/entry", t, { id: e1.id, status: "picked" })).status === 400);
  check("pick bob", (await api("/api/admin/bounties/entry", t, { id: bp.id, status: "picked" })).json?.status === "picked");
  check("can't pick a second applicant", (await api("/api/admin/bounties/entry", t, { id: ap.id, status: "picked" })).status === 409);
  const board = (await api("/api/bounties", null)).json.bounties.find((x: any) => x.id === apply.id);
  check("public: the assignee shown, picked application without its link", board.assignee?.startsWith(bob.address.slice(0, 6).toLowerCase())
    && board.winners_list[0]?.x_handle === "bob" && board.winners_list[0].link === null, JSON.stringify(board));
  check("others can't apply once someone is picked", (await api("/api/bounties/enter", c, { bounty: apply.id, x_handle: "carol", link: "https://github.com/carol" })).status === 409);
  const fin = (await api("/api/bounties/enter", b, { bounty: apply.id, x_handle: "bob", link: "https://github.com/bob/flybot" })).json;
  check("the picked wallet hands in the final", fin?.stage === "final" && fin.status === "pending", JSON.stringify(fin));
  // un-pick and re-pick keeps the assignee in step
  await api("/api/admin/bounties/entry", t, { id: bp.id, status: "rejected" });
  check("un-picking clears the assignee", (await api("/api/admin/bounties", t)).json.bounties.find((x: any) => x.id === apply.id).assignee === null);
  await api("/api/admin/bounties/entry", t, { id: bp.id, status: "picked" });

  // ---- approve, pay
  check("paid needs a tx", (await api("/api/admin/bounties/entry", t, { id: fin.id, status: "paid" })).status === 400);
  check("a bad tx is refused", (await api("/api/admin/bounties/entry", t, { id: fin.id, tx_hash: "0x12" })).status === 400);
  const appr = (await api("/api/admin/bounties/entry", t, { id: e1.id, status: "approved", reward: "60,000 $FLYAI", review_note: "great meme" })).json;
  check("approve alice's meme with a reward", appr?.status === "approved" && appr.reward === "60,000 $FLYAI");
  check("alice can't edit it any more", (await api("/api/bounties/enter", a, { bounty: contest.id, x_handle: "alice", link: "https://x.com/z" })).status === 409);
  const TXH = "0x" + "ab".repeat(32);
  const paid = (await api("/api/admin/bounties/entry", t, { id: fin.id, reward: "500,000 $FLYAI", tx_hash: TXH })).json;
  check("recording the tx marks it paid", paid?.status === "paid" && paid.tx_hash === TXH, JSON.stringify(paid));
  const mineA = (await api("/api/bounties/mine", a)).json;
  check("alice sees her entries and the team's note", mineA.entries.length === 2 && mineA.entries.some((e: any) => e.review_note === "great meme"));
  const fb = (await api("/api/bounties", null)).json.bounties;
  const wonC = fb.find((x: any) => x.id === contest.id).winners_list, wonA = fb.find((x: any) => x.id === apply.id).winners_list;
  check("public winners: approved meme with its link", wonC.length === 1 && wonC[0].link === "https://x.com/alice/status/2" && wonC[0].reward === "60,000 $FLYAI");
  check("public winners: paid final with its tx", wonA.some((w: any) => w.stage === "final" && w.tx_hash === TXH));
  const adm = (await api("/api/admin/bounties", t)).json;
  check("admin view: full wallets, per-wallet entry counts, block list", adm.entries.some((e: any) => e.wallet === alice.address.toLowerCase() && e.wallet_entries === 2)
    && adm.blocked.some((x: any) => x.value === "venomtraders_"));

  // ---- deadlines and closing
  await api("/api/admin/bounties", t, { ...apply, status: "open", deadline_ms: Date.now() - 1000 });
  const late = (await api("/api/admin/bounties", t, { title: "Late", kind: "contest", category: "art", summary: "s", reward: "1", status: "open", deadline_ms: Date.now() - 1000 })).json;
  check("no entries after the deadline", (await api("/api/bounties/enter", c, { bounty: late.id, x_handle: "carol", link: "https://x.com/c/2" })).status === 409);
  await api("/api/admin/bounties", t, { ...late, status: "closed", deadline_ms: null });
  check("no entries once closed", (await api("/api/bounties/enter", c, { bounty: late.id, x_handle: "carol", link: "https://x.com/c/2" })).status === 409);
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
