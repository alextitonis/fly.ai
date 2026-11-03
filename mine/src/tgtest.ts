/**
 * Connect Telegram (src/tglink.ts) against a real Postgres and a fake Bot API: the widget's signature (right, tampered,
 * stale), one account per wallet, membership on link, "check again", the daily recheck taking it back, and the XP.
 *   npm run test:tg
 */
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { checkLogin, createTgLink, isMember } from "./tglink.ts";
import { createXp, xpConfig } from "./xp.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const TOKEN = "123:test-token";
const sign = (data: Record<string, string | number>) => {
  const lines = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
  return { ...data, hash: createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(lines).digest("hex") };
};
const nowS = 1_800_000_000;

{
  const ok = sign({ id: 42, first_name: "Fly", username: "flyer", auth_date: nowS - 60 });
  check("a signed answer passes", checkLogin(ok, TOKEN, nowS)?.id === "42");
  check("a changed field fails", checkLogin({ ...ok, id: 43 }, TOKEN, nowS) === null);
  check("another bot's token fails", checkLogin(ok, "999:other", nowS) === null);
  check("a day-old answer fails", checkLogin(sign({ id: 42, first_name: "Fly", auth_date: nowS - 90_000 }), TOKEN, nowS) === null);
  check("members: member, admin, creator, restricted-in; not left or kicked",
    isMember({ status: "member" }) && isMember({ status: "administrator" }) && isMember({ status: "creator" }) && isMember({ status: "restricted", is_member: true })
    && !isMember({ status: "left" }) && !isMember({ status: "kicked" }) && !isMember({ status: "restricted", is_member: false }) && !isMember(null));
}

// the fake Bot API: who is in the group
const inGroup = new Map<string, string>([["42", "member"], ["77", "left"]]);
const api = createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  const id = u.searchParams.get("user_id") ?? "";
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(inGroup.has(id) ? { ok: true, result: { status: inGroup.get(id) } } : { ok: false, description: "Bad Request: user not found" }));
});
await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
const API = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const PG = await startPg(5554);
try {
  const { pg } = PG;
  let clock = nowS * 1000;
  let session = `0x${"a".repeat(40)}`;
  const tg = createTgLink({ pg, HttpError, send: () => {}, readJson: async () => ({}), sessionWallet: async () => session,
    env: { TG_BOT_TOKEN: TOKEN, TG_GROUP_ID: "-100123" }, api: API, now: () => clock });
  const A = session, B = `0x${"b".repeat(40)}`;
  const linked = await tg.link(A, sign({ id: 42, first_name: "Fly", username: "flyer", auth_date: nowS - 10 })) as any;
  check("linking reads membership at once", linked.linked?.member === true && linked.linked.username === "flyer");
  let taken = 0;
  try { await tg.link(B, sign({ id: 42, first_name: "Fly", auth_date: nowS - 10 })); } catch (e) { taken = (e as HttpError).status; }
  check("the same Telegram account can't go to a second wallet", taken === 409);
  let bad = 0;
  try { await tg.link(B, { id: 77, auth_date: nowS, hash: "0".repeat(64) }); } catch (e) { bad = (e as HttpError).status; }
  check("a forged answer is refused", bad === 400);
  const b = await tg.link(B, sign({ id: 77, first_name: "Gone", auth_date: nowS - 10 })) as any;
  check("not in the group: linked, but no member", b.linked?.member === false);

  // the XP: only members
  const chain = { head: async () => 0, blockTime: async () => 0, logs: async () => [], isContract: async () => false };
  const xp = createXp({ pg, chain, cfg: { ...xpConfig({}), fromBlock: 1 }, HttpError, send: () => {}, readJson: async () => ({}),
    sessionWallet: async () => session, now: () => clock });
  const c1 = await xp.compute();
  check("a member gets 50 XP, a non-member none", c1.rows.get(A)?.sources.telegram === 50 && !c1.rows.get(B)?.sources.telegram);

  // B joins and asks again; A leaves and the daily recheck notices
  inGroup.set("77", "member");
  const again = await tg.check(B) as any;
  check("'check again' after joining", again.linked?.member === true);
  inGroup.set("42", "left");
  await tg.recheck();
  check("the recheck waits a day", (await tg.mine(A) as any).linked.member === true);
  clock += 25 * 3_600_000;
  await tg.recheck();
  check("a day later, leaving takes the membership back", (await tg.mine(A) as any).linked.member === false);
} finally {
  await PG.stop();
  api.close();
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
