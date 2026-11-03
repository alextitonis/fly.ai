/**
 * Connect X (src/xlink.ts) against a real Postgres and a fake X: start, X's redirect back, the PKCE check, one X
 * account per wallet, unlink, used-once states, return_to kept to our site.
 *   npm run test:xlink
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { startPg } from "./pgtest.ts";
import { createXLink } from "./xlink.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

// the fake X: codes -> the user who signed in; the token endpoint checks the PKCE verifier against the challenge
const X_PORT = 8811, PORT = 8812;
const challenges = new Map<string, string>();   // code -> challenge
const users = new Map<string, any>();           // code -> user
let meCalls = 0;
const fakeX = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  if (url.pathname === "/2/oauth2/token") {
    let body = "";
    for await (const c of req) body += c;
    const f = new URLSearchParams(body);
    const code = f.get("code")!;
    const ok = req.headers.authorization === `Basic ${Buffer.from("cid:sec").toString("base64")}`
      && challenges.get(code) === createHash("sha256").update(f.get("code_verifier")!).digest("base64url");
    res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
    return res.end(JSON.stringify(ok ? { access_token: `tok-${code}` } : { error: "invalid_request" }));
  }
  if (url.pathname === "/2/users/me") {
    meCalls++;
    const u = users.get(String(req.headers.authorization).replace("Bearer tok-", ""));
    res.writeHead(u ? 200 : 401, { "content-type": "application/json" });
    return res.end(JSON.stringify(u ? { data: u } : {}));
  }
  res.writeHead(404).end();
});
await new Promise<void>((ok) => fakeX.listen(X_PORT, ok));

const PG = await startPg(5551);
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readJson = async (req: IncomingMessage) => { let s = ""; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };
const sessionWallet = async (req: IncomingMessage) => {
  const w = req.headers["x-test-wallet"];
  if (!w) throw new HttpError(401, "not signed in");
  return String(w);
};
const x = createXLink({
  pg: PG.pg, HttpError, send, readJson, sessionWallet, api: `http://localhost:${X_PORT}`,
  env: { X_CLIENT_ID: "cid", X_CLIENT_SECRET: "sec", X_REDIRECT_URI: `http://localhost:${PORT}/api/x/callback`, SITE_ORIGIN: "https://www.flyaiworld.com" },
});
const server = createServer(async (req, res) => {
  try { if (!(await x.route(req, res, new URL(req.url!, "http://localhost")))) send(res, 404, {}); }
  catch (e: any) { send(res, e.status ?? 500, { error: e.message }); }
});
await new Promise<void>((ok) => server.listen(PORT, ok));

const ALICE = "0x" + "a".repeat(40), BOB = "0x" + "b".repeat(40);
const api = async (path: string, wallet: string | null, body?: unknown) => {
  const r = await fetch(`http://localhost:${PORT}${path}`, { method: body === undefined ? "GET" : "POST", redirect: "manual",
    headers: { "content-type": "application/json", ...(wallet ? { "x-test-wallet": wallet } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, location: r.headers.get("location"), json: await r.json().catch(() => null) };
};
/** start as wallet, "sign in on X" as user, follow X's redirect back: the site URL we land on */
async function link(wallet: string, user: any, code: string, returnTo = "https://www.flyaiworld.com/traderflies/?a=1") {
  const s = await api("/api/x/start", wallet, { return_to: returnTo });
  const auth = new URL(s.json.url);
  challenges.set(code, auth.searchParams.get("code_challenge")!);
  users.set(code, user);
  return { auth, back: (await api(`/api/x/callback?state=${auth.searchParams.get("state")}&code=${code}`, null)).location! };
}

try {
  check("start needs a session", (await api("/api/x/start", null, {})).status === 401);
  const a = await link(ALICE, { id: "111", username: "alice_fly", name: "Alice", profile_image_url: "https://pbs.twimg.com/a.jpg" }, "c1");
  check("authorize URL", a.auth.origin === "https://x.com" && a.auth.searchParams.get("code_challenge_method") === "S256"
    && a.auth.searchParams.get("scope") === "users.read tweet.read", a.auth.href);
  check("lands back linked on the page it came from", a.back === "https://www.flyaiworld.com/traderflies/?a=1&x=linked", a.back);
  const me = (await api("/api/x", ALICE)).json;
  check("GET /api/x shows the account", me.enabled && me.linked?.username === "alice_fly" && me.linked?.avatar?.includes("a.jpg"), JSON.stringify(me));
  check("one users/me call per link", meCalls === 1, String(meCalls));
  check("no token kept", !JSON.stringify(await PG.pg.all("select * from mine.x_links")).includes("tok-"));

  const replay = await api(`/api/x/callback?state=${a.auth.searchParams.get("state")}&code=c1`, null);
  check("a state works once", replay.location === "https://www.flyaiworld.com/?x=expired", replay.location ?? "");

  const b = await link(BOB, { id: "111", username: "alice_fly" }, "c2");
  check("an X account on another wallet is taken", b.back.endsWith("x=taken") && (await api("/api/x", BOB)).json.linked === null, b.back);

  const s = await api("/api/x/start", BOB, { return_to: "https://www.flyaiworld.com/" });
  const denied = await api(`/api/x/callback?state=${new URL(s.json.url).searchParams.get("state")}&error=access_denied`, null);
  check("cancelled on X", denied.location === "https://www.flyaiworld.com/?x=denied", denied.location ?? "");

  // a wrong verifier: X refuses the code
  const s2 = await api("/api/x/start", BOB, {});
  challenges.set("c3", "nope");
  users.set("c3", { id: "222", username: "bob" });
  const bad = await api(`/api/x/callback?state=${new URL(s2.json.url).searchParams.get("state")}&code=c3`, null);
  check("a refused code fails", bad.location === "https://www.flyaiworld.com/?x=failed", bad.location ?? "");

  check("return_to stays on our site", x.returnTo("https://evil.example/x") === "https://www.flyaiworld.com/"
    && x.returnTo("http://www.flyaiworld.com/") === "https://www.flyaiworld.com/"
    && x.returnTo("http://localhost:8080/docs/?x=linked") === "http://localhost:8080/docs/");

  const h = (await api(`/api/x/handles?wallets=${ALICE},${BOB},junk`, null)).json;
  check("handles in bulk", h[ALICE] === "alice_fly" && !(BOB in h), JSON.stringify(h));

  await api("/api/x/unlink", ALICE, {});
  check("unlink", (await api("/api/x", ALICE)).json.linked === null);
  const b2 = await link(BOB, { id: "111", username: "alice_fly" }, "c4");
  check("after unlink another wallet can link it", b2.back.endsWith("x=linked"), b2.back);
} finally {
  server.close();
  fakeX.close();
  await PG.stop();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
