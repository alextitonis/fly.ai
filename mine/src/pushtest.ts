/**
 * Phone notifications (src/push.ts): the RFC 8291 test vector for the encryption, a VAPID signature that verifies, the
 * notes' wording and grouping, and one sender pass over a fake database (cursor, kinds, a gone subscription).
 *   npm run test:push
 */
import { createDecipheriv, createECDH, createPublicKey, verify } from "node:crypto";
import { cleanPrefs, createPush, encrypt, newKeys, notesFor, vapidAuth, PREFS_DEFAULT } from "./push.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const u = (s: string) => Buffer.from(s, "base64url");

// RFC 8291 appendix A
{
  const body = encrypt(Buffer.from("When I grow up, I want to be a watermelon"),
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", "BTBZMqHH6r4Tts7J_aSIgg",
    { serverPrivate: u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), salt: u("DGv6ra1nlYgDCS1FRnbzlw") });
  const want = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
  check("RFC 8291 test vector", body.toString("base64url") === want);
}

// a round trip with a fresh browser key: the browser's side decrypts it
{
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const auth = Buffer.alloc(16, 7);
  const msg = JSON.stringify({ title: "hi" });
  const b = encrypt(Buffer.from(msg), ua.getPublicKey().toString("base64url"), auth.toString("base64url"));
  const salt = b.subarray(0, 16), idlen = b[20]!, as = b.subarray(21, 21 + idlen), ct = b.subarray(21 + idlen);
  const { createHmac } = await import("node:crypto");
  const hk = (s: Buffer, k: Buffer, i: Buffer, n: number) => createHmac("sha256", createHmac("sha256", s).update(k).digest()).update(Buffer.concat([i, Buffer.from([1])])).digest().subarray(0, n);
  const ikm = hk(auth, ua.computeSecret(as), Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), as]), 32);
  const d = createDecipheriv("aes-128-gcm", hk(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16), hk(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  check("a browser decrypts it", plain.subarray(0, plain.length - 1).toString() === msg && plain[plain.length - 1] === 2);
}

// VAPID: the JWT verifies with the public key
{
  const k = newKeys();
  const h = vapidAuth("https://fcm.googleapis.com/fcm/send/abc", { pub: k.VAPID_PUBLIC_KEY, priv: k.VAPID_PRIVATE_KEY, subject: "mailto:x@y.z" }, 1_800_000_000_000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
  const claims = JSON.parse(u(m[2]!).toString());
  const pub = u(m[4]!);
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") } });
  check("VAPID JWT verifies", verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: "ieee-p1363" }, u(m[3]!)));
  check("VAPID audience is the push service origin", claims.aud === "https://fcm.googleapis.com" && claims.sub === "mailto:x@y.z");
}

// the notes
{
  const ev = { trades: [{ vault: "v", fly: 12, symbol: "base:AERO", side: "buy", usd: 25 }], moves: [], chats: [{ fly: 12, text: "Bought AERO, it's trending." }],
    alpha: [{ symbol: "GTA6", chain: "solana", head: "GTA VI week" }] };
  const n = notesFor(PREFS_DEFAULT, ev, "/pet-mobile");
  check("one note a kind, alpha off by default", n.map((x) => x.kind).join() === "trades,chat", n.map((x) => x.kind).join());
  check("trade wording", n[0]!.title === "Fly #12 bought AERO" && n[0]!.body === "$25.00 buy" && n[0]!.url === "/traderflies/fly?id=12");
  const all = notesFor({ ...PREFS_DEFAULT, alpha: true }, { ...ev, trades: [ev.trades[0]!, { ...ev.trades[0]!, side: "sell", symbol: "ZIG" }] }, "/pet-mobile");
  check("several trades are one summary", all[0]!.title === "2 new trades" && all.some((x) => x.kind === "alpha" && x.title === "Alpha: GTA6 (solana)"));
  check("prefs are cleaned", JSON.stringify(cleanPrefs({ trades: false, alpha: "yes", evil: true })) === JSON.stringify({ ...PREFS_DEFAULT, trades: false }));
}

// one sender pass on a fake database
{
  const k = newKeys();
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const sub = { id: 1, wallet: "0xaa", endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: ua.getPublicKey().toString("base64url"),
    auth: Buffer.alloc(16, 1).toString("base64url"), prefs: PREFS_DEFAULT, cursor_ms: 1000, fails: 0 };
  const gone = { ...sub, id: 2, wallet: "0xbb", endpoint: "https://fcm.googleapis.com/fcm/send/2" };
  const updates: any[] = [], deletes: any[] = [];
  const pg: any = {
    all: async (q: string) => q.includes("from mine.push_subs") ? [sub, gone]
      : q.includes("vault_ledger") ? [{ holder: "0xaa", wallet: "0xV", fly_id: 7 }, { holder: "0xbb", wallet: "0xW", fly_id: 8 }]
      : q.includes("vault_trades") ? [{ vault: "0xV", at: 2000, symbol: "ZIG", side: "buy", usd: 10 }, { vault: "0xV", at: 500, symbol: "OLD", side: "buy", usd: 1 },
          { vault: "0xW", at: 2000, symbol: "X", side: "sell", usd: 3 }]
      : q.includes("vault_moves") ? [] : q.includes("fly_chat") ? [] : [],
    one: async () => ({ value: { calls: [] } }),
    run: async (q: string, ...a: any[]) => { (q.startsWith("delete") ? deletes : updates).push(a); return 1; },
  };
  const posted: string[] = [];
  const push = createPush({ pg, HttpError: Error as any, send: () => {}, readJson: async () => ({}), sessionWallet: async () => "",
    keys: { pub: k.VAPID_PUBLIC_KEY, priv: k.VAPID_PRIVATE_KEY, subject: "mailto:x@y.z" }, now: () => 9000,
    post: async (url) => { posted.push(url); return url.endsWith("/2") ? 410 : 201; } });
  const r = await push.tick();
  check("sends the new trade, not the old one", r.sent === 1 && posted.filter((x) => x.endsWith("/1")).length === 1, JSON.stringify(r));
  check("a gone subscription is removed", deletes.length === 1 && deletes[0][0] === 2);
  check("the cursor moves to the pass", updates.length === 1 && updates[0][0] === 9000 && updates[0][4] === 1);
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
