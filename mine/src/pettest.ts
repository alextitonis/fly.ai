/**
 * The desktop pet's server side (src/pet.ts) against a real Postgres: the wallet link, the wallet feed and the public feed.
 *   npm run test:pet
 */
import type { ServerResponse } from "node:http";
import { createPet, LINK_TTL_MS } from "./pet.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const HOLDER = "0xAe92D64584e7F8E54995C362EAA8d7949faC8b1b", OTHER = "0x70652b7cABCFA48461eD76E3A620E57388BfF482";
const V1 = "0x1888DF00BdAdB211B52BB1398954B25e8E28e078", V2 = "0x557E2c43c1E671DD530B42Aa0F67f896C1866Ba2", V3 = "0x663A000000000000000000000000000000000001";

const PG = await startPg(5553);
let clock = Date.now(), session: string | null = HOLDER;
let sweeps = 0, sweepBroken = false;
let sweepList = [{ id: 318, owner: HOLDER.toLowerCase() }, { id: 7, owner: HOLDER.toLowerCase() }, { id: 54, owner: OTHER.toLowerCase() }];
const pet = createPet({
  pg: PG.pg, HttpError, readJson: async (req: any) => req.body,
  send: (res: any, status, body) => { res.status = status; res.body = body; },
  sessionWallet: async () => { if (!session) throw new HttpError(401, "not signed in"); return session; },
  price: async () => 0.0002, site: "https://site.test", now: () => clock,
  sweepOwners: async () => { sweeps++; if (sweepBroken) throw new Error("rpc down"); return sweepList; },
});
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res: any = {};
  try {
    const hit = await pet.route({ method, body } as any, res as ServerResponse, new URL(path, "http://x"));
    return hit ? res : { status: 404, body: null };
  } catch (err: any) {
    return { status: err.status ?? 500, body: { error: err.message } };
  }
}

try {
  // --- the link ---
  const l = (await call("POST", "/api/pet/link", {})).body;
  check("link opens the site with the code in the fragment", l.url === `https://site.test/traderflies/petlink#${l.code}`);
  check("claim before approval is pending", (await call("POST", "/api/pet/link/claim", { code: l.code, secret: l.secret })).body.status === "pending");
  check("a wrong secret can't claim", (await call("POST", "/api/pet/link/claim", { code: l.code, secret: "x" })).status === 403);
  session = null;
  check("approve needs a signed-in wallet", (await call("POST", "/api/pet/link/approve", { code: l.code })).status === 401);
  session = HOLDER;
  check("approve an unknown code refused", (await call("POST", "/api/pet/link/approve", { code: "nope" })).status === 410);
  check("approve names the wallet", (await call("POST", "/api/pet/link/approve", { code: l.code })).body.wallet === HOLDER);
  const got = await call("POST", "/api/pet/link/claim", { code: l.code, secret: l.secret });
  check("claim gives the address and nothing else", got.body.status === "linked" && got.body.wallet === HOLDER && Object.keys(got.body).length === 2);
  check("a link is claimed once", (await call("POST", "/api/pet/link/claim", { code: l.code, secret: l.secret })).status === 410);
  const old = (await call("POST", "/api/pet/link", {})).body;
  clock += LINK_TTL_MS + 1;
  check("a link expires", (await call("POST", "/api/pet/link/claim", { code: old.code, secret: old.secret })).status === 410);

  // --- the feeds ---
  await PG.pg.run("insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:318', 318, ?, 'x', 'x'), ('fly:54', 54, ?, 'x', 'x'), ('fly:7', 7, ?, 'x', 'x')", V1, V2, V3);
  await PG.pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'robinhood', ?, 12), (?, 'robinhood', ?, 5)", V1, HOLDER, V2, OTHER);
  await PG.pg.run("insert into mine.vault_public (key, value) values (?, ?::text::jsonb), ('leaderboard', ?::text::jsonb), (?, ?::text::jsonb)",
    `vault:${V1}`, JSON.stringify({ value: 11, profit: 2.9, profit_pct: 21, profit_24h: 0.1, profit_7d: 2, active: true }),
    JSON.stringify({ d7: [{ flies: [54] }] }), `vault:${V2}`, JSON.stringify({ value: 6, profit: 15, active: true }));
  const trade = (vault: string, side: string, status: string, tag: string, reason: object) =>
    PG.pg.run("insert into mine.vault_trades (vault, book, tag, mode, symbol, side, usd, status, reason) values (?, 'b', ?, 'live', 'AAPL', ?, 5, ?, ?::text::jsonb)", vault, tag, side, status, JSON.stringify(reason));
  await trade(V1, "sell", "filled", "brain", { pnl_pct: 4.5 });
  await trade(V1, "buy", "refused", "brain", { why: "no" });
  await trade(V1, "buy", "filled", "earn", {});
  await trade(V1, "buy", "filled", "gas", {});
  await trade(V2, "buy", "filled", "brain", {});

  const feed = (await call("GET", `/api/pet/wallet/${HOLDER.toLowerCase()}`)).body;
  check("a wallet sees all its flies, funded first", feed.flies.map((f: any) => f.id).join() === "318,7", JSON.stringify(feed.flies.map((f: any) => f.id)));
  check("funded says which trade", feed.flies[0].funded === true && feed.flies[1].funded === false);
  check("the feed carries profit", feed.flies[0].profit === 2.9 && feed.flies[0].active === true);
  const t = feed.flies[0].trades;
  check("only filled trades, no lending or gas", t.length === 1 && t[0].side === "sell" && t[0].pnl_pct === 4.5, JSON.stringify(t));
  check("a bad address refused", (await call("GET", "/api/pet/wallet/0x12")).status === 400);
  check("a wallet with nothing is empty", (await call("GET", `/api/pet/wallet/${"0x" + "1".repeat(40)}`)).body.flies.length === 0);

  const pub = (await call("GET", "/api/pet/public")).body;
  check("public: price + top fly", pub.flyai_usd === 0.0002 && pub.top?.id === 54 && pub.top.trades.length === 1, JSON.stringify(pub));

  await trade(V1, "buy", "filled", "brain", {});
  check("reads stay cached", (await call("GET", `/api/pet/wallet/${HOLDER}`)).body.flies[0].trades.length === 1);
  clock += 21_000;
  check("then refresh", (await call("GET", `/api/pet/wallet/${HOLDER}`)).body.flies[0].trades.length === 2);
  check("the owners sweep ran once", sweeps === 1, String(sweeps));

  // a fly sold on: the next sweep moves it; a failed sweep keeps the last owners
  sweepList = [{ id: 318, owner: HOLDER.toLowerCase() }, { id: 7, owner: OTHER.toLowerCase() }, { id: 54, owner: OTHER.toLowerCase() }];
  clock += 21_000;
  check("within 10 minutes the old owners answer", (await call("GET", `/api/pet/wallet/${HOLDER}`)).body.flies.length === 2);
  clock += 11 * 60_000;
  await call("GET", `/api/pet/wallet/${HOLDER}`);
  await new Promise((r) => setTimeout(r, 20));
  clock += 21_000;
  check("then a sold fly leaves", (await call("GET", `/api/pet/wallet/${HOLDER}`)).body.flies.map((f: any) => f.id).join() === "318");
  sweepBroken = true;
  clock += 11 * 60_000;
  await call("GET", `/api/pet/wallet/${HOLDER}`);
  await new Promise((r) => setTimeout(r, 20));
  clock += 21_000;
  check("a failed sweep keeps the last owners", (await call("GET", `/api/pet/wallet/${HOLDER}`)).body.flies.length === 1);
} finally {
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
