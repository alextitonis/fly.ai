/**
 * Follow a fly (src/follow.ts) against a real Postgres and a fake chain: the price split checked on chain, the holder and
 * the 500k rule, each payment once, a second week extends, the followed fly lands in the follower's track option.
 *   npm run test:follow
 */
import type { ServerResponse } from "node:http";
import { BURN_FLYAI, OWNER_FLYAI, WEEK_MS, createFollow } from "./follow.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const DEAD = "0x000000000000000000000000000000000000dead";
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const xfer = (from: string, to: string, flyai: number) => ({ status: "0x1", logs: [{ address: "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c",
  topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(from), pad(to)], data: `0x${(BigInt(flyai) * E18).toString(16)}` }] });

const PG = await startPg(5557);
try {
  const { pg } = PG;
  const ME = addr(0xa1), OWNER = addr(0xb1), POOR = addr(0xc1);
  const FLY_ME = addr(0x1001), FLY_TARGET = addr(0x1002), FLY_POOR = addr(0x1003);
  const PARTNER_WALLET = addr(0x2001);
  await pg.run(`insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:1', 1, ?, 'x', 'x'), ('fly:2', 2, ?, 'x', 'x'), ('fly:3', 3, ?, 'x', 'x')`,
    FLY_ME, FLY_TARGET, FLY_POOR);
  await pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values (?, 'robinhood', ?, 50), (?, 'robinhood', ?, 10)", FLY_ME, ME, FLY_POOR, POOR);
  await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::text::jsonb, 'v', ?, 1)`,
    FLY_ME, JSON.stringify({ starter: "custom", options: [{ id: "core", on: true, share_pct: 30, params: {} }] }), ME);
  await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::text::jsonb, 'v', ?, 1)`,
    `p_enjoyoors:${PARTNER_WALLET}`, JSON.stringify({ starter: "partner", options: [{ id: "core", on: true, share_pct: 25, params: {} }] }), ME);
  const held = new Map([[ME, 600_000n * E18], [POOR, 150_000n * E18]]);
  const receipts = new Map<string, any>();
  let session = ME, body: any = null, now = 1_800_000_000_000;
  let out: { status: number; body: any } = { status: 0, body: null };
  const f = createFollow({ pg, HttpError, send: (_r: ServerResponse, status, b) => { out = { status, body: b }; }, readJson: async () => body,
    sessionWallet: async () => session, holdings: async (w) => held.get(w) ?? 0n, starterSettings: async () => ({ starter: "let_it_fly", options: [] }),
    partnerWallet: async (partner, token) => partner === "enjoyoors" && token === 42 ? { wallet: PARTNER_WALLET, vault: `p_enjoyoors:${PARTNER_WALLET}`, owner: ME, holder: null } : null,
    partnerCandidates: async () => [{ partner: "enjoyoors", name: "Enjoyooors", token: 42, wallet: PARTNER_WALLET }],
    receipt: async (tx) => receipts.get(tx) ?? null, ownerOf: async (n) => (n === 2 ? OWNER : n === 1 ? ME : POOR), now: () => now });
  const call = async (method: string, path: string, b?: unknown) => {
    body = b ?? null;
    try { await f.route({ method } as any, {} as any, new URL(`http://x${path}`)); } catch (e) { out = { status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } }; }
    return out;
  };

  let r = await call("GET", "/api/follow/fly/2");
  check("info: price and split", r.body?.price?.owner_flyai === OWNER_FLYAI && r.body.price.burn_flyai === BURN_FLYAI && r.body.followers === 0 && r.body.owner === OWNER, JSON.stringify(r.body));
  receipts.set(TX(1), xfer(ME, OWNER, OWNER_FLYAI)); receipts.set(TX(2), xfer(ME, DEAD, BURN_FLYAI));
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(1), burn_tx: TX(2) });
  check("a paid pass", r.status === 200 && new Date(r.body.ends_at).getTime() - new Date(r.body.starts_at).getTime() === WEEK_MS, JSON.stringify(r.body));
  const doc = (await pg.one<{ doc: any }>("select doc from mine.vault_settings where vault = ?", FLY_ME))!.doc;
  const tr = doc.options.find((o: any) => o.id === "track");
  check("the followed fly is in the follower's track option, the rest kept", tr?.on && tr.wallets[0].address === FLY_TARGET && doc.options.some((o: any) => o.id === "core"), JSON.stringify(doc));
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(1), burn_tx: TX(2) });
  check("the same payments buy once", r.status === 409, JSON.stringify(r.body));
  receipts.set(TX(3), xfer(ME, OWNER, OWNER_FLYAI)); receipts.set(TX(4), xfer(ME, DEAD, BURN_FLYAI));
  now += 86_400_000;
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(3), burn_tx: TX(4) });
  check("a second week extends the first", r.status === 200 && new Date(r.body.ends_at).getTime() === 1_800_000_000_000 + 2 * WEEK_MS, JSON.stringify(r.body));
  const again = (await pg.one<{ doc: any }>("select doc from mine.vault_settings where vault = ?", FLY_ME))!.doc;
  check("tracked once, not twice", again.options.find((o: any) => o.id === "track").wallets.length === 1);
  r = await call("GET", "/api/follow/fly/2");
  check("info: 1 follower, mine shows", r.body.followers === 1 && r.body.mine[0]?.follower_fly === 1, JSON.stringify(r.body));

  receipts.set(TX(11), xfer(ME, OWNER, OWNER_FLYAI)); receipts.set(TX(12), xfer(ME, DEAD, BURN_FLYAI));
  r = await call("POST", "/api/follow/fly/2", { follower_partner: "enjoyoors", follower_token: 42, owner_tx: TX(11), burn_tx: TX(12) });
  check("a partner NFT can buy a follow pass", r.status === 200 && r.body.follower_partner === "enjoyoors" && r.body.follower_token === 42, JSON.stringify(r.body));
  const partnerDoc = (await pg.one<{ doc: any }>("select doc from mine.vault_settings where vault = ?", `p_enjoyoors:${PARTNER_WALLET}`))!.doc;
  check("the partner wallet tracks the followed fly and keeps its settings", partnerDoc.options.find((o: any) => o.id === "track")?.wallets[0]?.address === FLY_TARGET && partnerDoc.options.some((o: any) => o.id === "core"), JSON.stringify(partnerDoc));
  r = await call("GET", "/api/follow/fly/2");
  check("partner follow appears in the holder's active passes", r.body.partner_mine.some((x: any) => x.partner === "enjoyoors" && x.token === 42));

  receipts.set(TX(5), xfer(ME, OWNER, OWNER_FLYAI - 1)); receipts.set(TX(6), xfer(ME, DEAD, BURN_FLYAI));
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(5), burn_tx: TX(6) });
  check("short of the owner's part: refused", r.status === 400 && /owner/.test(r.body.error), JSON.stringify(r.body));
  receipts.set(TX(7), xfer(ME, OWNER, OWNER_FLYAI)); receipts.set(TX(8), xfer(ME, addr(0xee), BURN_FLYAI));
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(7), burn_tx: TX(8) });
  check("not burned: refused", r.status === 400 && /burn/.test(r.body.error));
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(77), burn_tx: TX(78) });
  check("not mined yet: try again", r.status === 409);
  r = await call("POST", "/api/follow/fly/1", { follower_fly: 1, owner_tx: TX(1), burn_tx: TX(2) });
  check("a fly can't follow itself", r.status === 400);
  session = POOR;
  receipts.set(TX(9), xfer(POOR, OWNER, OWNER_FLYAI)); receipts.set(TX(10), xfer(POOR, DEAD, BURN_FLYAI));
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 3, owner_tx: TX(9), burn_tx: TX(10) });
  check("under 200k: refused", r.status === 403 && /200,000/.test(r.body.error), JSON.stringify(r.body));
  session = OWNER;
  r = await call("POST", "/api/follow/fly/2", { follower_fly: 1, owner_tx: TX(9), burn_tx: TX(10) });
  check("not your fly: refused", r.status === 403);
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
