/**
 * Trader Flies as ERC-8004 agents (src/agents.ts) against a real Postgres: the registration file before and after the
 * fly registers, its art from the tokenURI, an unknown fly, and the list.
 *   npm run test:agents
 */
import type { ServerResponse } from "node:http";
import { NEW_FEEDBACK, REGISTRY, REVOKED, commentOf, createAgents, decodeFeedback, imageOf, registration } from "./agents.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const W = "0xc72B0796CCC11D27dA3808fc8A98801C741B6c42";
const IMG = "https://example.mypinata.cloud/ipfs/bafy/122.png";
const uri = "data:application/json;base64," + Buffer.from(JSON.stringify({ name: "Uncommon Fly #122", image: IMG })).toString("base64");

{
  check("tokenURI art", imageOf(uri) === IMG);
  check("no art from junk", imageOf("data:application/json;base64,!!!") === null && imageOf("https://x/1.json") === null);
  const r = registration({ fly: 7, wallet: W, agentId: null, strategy: "stock_swing", active: true, trades: 3, image: null });
  check("ERC-8004 type", r.type === "https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
  check("no registration before the id", r.registrations.length === 0);
  check("wallet as a service", r.services.some((s) => s.name === "agentWallet" && s.endpoint === `eip155:4663:${W}`));
  check("no return promises", !/profit|earn|return|%/i.test(r.description));
}

const PG = await startPg(5556);
try {
  const { pg } = PG;
  let calls = 0;
  let out: { status: number; body: any } = { status: 0, body: null };
  const send = (_res: ServerResponse, status: number, body: unknown) => { out = { status, body }; };
  const a = createAgents({ pg, send, rpc: "", tokenUri: async () => { calls++; return uri; } });
  const get = async (path: string) => {
    const handled = await a.route({ method: "GET" } as any, {} as any, new URL("https://x" + path));
    return handled ? out : null;
  };
  await pg.run(`insert into mine.vault_wallets (id, fly_id, address, enc_key, nonce) values ('fly:122', 122, ?, 'x', 'x')`, W);
  await pg.run(`insert into mine.vault_public (key, value) values ('leaderboard', ?::text::jsonb)`,
    JSON.stringify({ all: [{ vault: W.toLowerCase(), flies: [122], starter: "stock_swing", active: true, closing: false, trades: 6 }] }));

  let r = await get("/api/agents/fly/122.json");
  check("file served", r?.status === 200 && r.body.name === "Trader Fly #122", JSON.stringify(r?.body));
  check("art from the fly", r?.body.image === IMG);
  check("active from the board", r?.body.active === true);
  check("strategy in words", /stock swing/.test(r?.body.description));
  check("not registered yet", r?.body.registrations.length === 0);

  await pg.run(`insert into mine.vault_public (key, value) values (?, ?::text::jsonb)`, `vault:agent:${W}`,
    JSON.stringify({ fly: 122, agent_id: 42, registry: REGISTRY, chain_id: 4663, tx: "0xabc", at: 1 }));
  r = await get("/api/agents/fly/122");
  check("agent id after", r?.body.registrations?.[0]?.agentId === 42
    && r.body.registrations[0].agentRegistry === `eip155:4663:${REGISTRY}`, JSON.stringify(r?.body.registrations));
  check("art cached", calls === 1, String(calls));

  r = await get("/api/agents/fly/999.json");
  check("unknown fly 404", r?.status === 404);
  r = await get("/api/agents");
  check("list", r?.body.agents.length === 1 && r.body.agents[0].agent_id === 42 && r.body.agents[0].fly === 122);
  check("other paths pass", (await get("/api/agentsx")) === null && (await get("/api/agents/fly/abc")) === null);
  check("trust model declared", (await get("/api/agents/fly/122.json"))?.body.supportedTrust?.[0] === "reputation");

  // ---- ratings: a fake registry, real tables ----
  const OWNER = `0x${"0a".repeat(20)}`, FORMER = `0x${"0b".repeat(20)}`, WHALE = `0x${"0c".repeat(20)}`, NOBODY = `0x${"0d".repeat(20)}`, TEAM = `0x${"0e".repeat(20)}`;
  await pg.run("insert into mine.xp_flies (id, owner) values (122, ?)", OWNER);
  await pg.run("insert into mine.vault_moves (wallet, chain, kind, holder, usd) values (?, 'robinhood', 'deposit', ?, 20)", W, FORMER);
  await pg.run(`insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, ?, 0, 0, 0), (?, 0, 0, 0, 0), (?, ?, 0, 0, 0)`,
    WHALE, (300_000n * 10n ** 18n).toString(), NOBODY, TEAM, (900_000n * 10n ** 18n).toString());
  const fb = (agent: number, client: string, index: number, value: number, tag1: string, tag2: string, comment: string | null, block: number) => {
    const w = (n: bigint | number) => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, "0");
    const str = (s: string) => { const b = Buffer.from(s, "utf8"); return w(b.length) + b.toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0"); };
    const uriText = comment === null ? "" : `data:application/json;base64,${Buffer.from(JSON.stringify({ comment })).toString("base64")}`;
    const tails = [tag1, tag2, "", uriText].map(str);
    let off = 8 * 32;
    const heads = tails.map((t) => { const h = w(off); off += t.length / 2; return h; });
    return { topics: [NEW_FEEDBACK, `0x${w(agent)}`, `0x${w(BigInt(client))}`, `0x${"00".repeat(32)}`],
      data: `0x${w(index)}${w(value)}${w(0)}${heads.join("")}${"0".repeat(64)}${tails.join("")}`, blockNumber: `0x${block.toString(16)}`, transactionHash: `0x${block.toString(16).padStart(64, "0")}` };
  };
  const decoded = decodeFeedback(fb(42, OWNER, 1, 80, "trading", "owner", "solid fly", 1));
  check("decode", decoded.agent === 42 && decoded.client === OWNER && decoded.score === 80 && decoded.tag1 === "trading" && decoded.tag2 === "owner"
    && commentOf(decoded.uri) === "solid fly", JSON.stringify(decoded));
  check("negative values decode", decodeFeedback(fb(42, OWNER, 1, -5, "trading", "", null, 1)).score === -5);
  check("links stripped from comments", commentOf(`data:application/json;base64,${Buffer.from(JSON.stringify({ comment: "great, go to https://scam.xyz/x or scam.io now" })).toString("base64")}`) === "great, go to or now");

  const logs = [
    fb(42, OWNER, 1, 60, "trading", "owner", "ok", 105_900_000),
    fb(42, OWNER, 2, 100, "trading", "owner", "better now https://x.co", 105_900_010),       // latest per wallet counts
    fb(42, FORMER, 1, 40, "trading", "owner", null, 105_900_020),                             // claims owner; is a former holder
    fb(42, WHALE, 1, 80, "trading", "community", null, 105_900_030),
    fb(42, NOBODY, 1, 100, "trading", "owner", null, 105_900_040),                            // no tie: unverified
    fb(42, TEAM, 1, 100, "trading", "community", null, 105_900_050),                          // the team: unverified
    fb(42, WHALE, 2, 20, "spam", "", null, 105_900_060),                                     // not "trading": unverified, and replaces WHALE's
    fb(77, OWNER, 1, 100, "trading", "owner", null, 105_900_070),                            // someone else's agent
  ];
  let head = 105_900_100;
  const b = createAgents({ pg, send, rpc: "", exclude: [TEAM], tokenUri: async () => uri, now: () => 1_800_000_000_000,
    chain: { head: async () => head, logs: async (from, to) => logs.filter((l) => Number(l.blockNumber) >= from && Number(l.blockNumber) <= to),
      blockTime: async (n) => n * 1000 } });
  await b.scan();
  let s = await b.ratingsOf(122);
  check("stars from verified raters", s?.count === 2 && s.stars === 3.5 && s.by.owner === 1 && s.by.former === 1, JSON.stringify(s));
  check("unverified apart", s?.unverified === 3, String(s?.unverified));
  check("latest first, comment cleaned", s?.recent[0].wallet === WHALE && s.recent.find((x) => x.wallet === OWNER)?.comment === "better now", JSON.stringify(s?.recent.map((x) => [x.wallet.slice(0, 4), x.comment])));
  check("kinds", s?.recent.find((x) => x.wallet === FORMER)?.who === "former" && s.recent.find((x) => x.wallet === NOBODY)?.who === null);
  await b.scan();
  check("a second scan adds nothing", (await b.ratingsOf(122))?.recent.length === 5);
  logs.push({ topics: [REVOKED, logs[0].topics[1], logs[2].topics[2], `0x${"0".repeat(63)}1`], data: "0x", blockNumber: `0x${(105_900_200).toString(16)}`, transactionHash: "0xr" });
  head = 105_900_300;
  await b.scan();
  s = await b.ratingsOf(122);
  check("a revoked rating goes", s?.count === 1 && s.stars === 5 && !s.recent.some((x) => x.wallet === FORMER), JSON.stringify(s));

  for (const [w, want] of [[OWNER, "owner"], [FORMER, "former"], [WHALE, "community"], [NOBODY, null], [TEAM, null], [W.toLowerCase(), null]] as const) {
    const rr = await b.rater(122, w);
    check(`rater ${String(want)}`, rr?.who === want && rr.can === (want !== null), JSON.stringify(rr));
  }
  check("own last rating", (await b.rater(122, OWNER))?.mine?.stars === 5);
  // the user's personal wallet: a team wallet, but it rates the flies it holds; never as community
  const ME = `0x${"0f".repeat(20)}`, ME2 = `0x${"1f".repeat(20)}`;
  await pg.run("insert into mine.vault_ledger (wallet, chain, holder) values (?, 'robinhood', ?)", W, ME);
  await pg.run("insert into mine.xp_holders (wallet, liquid, staked, locked, flies) values (?, ?, 0, 0, 3)", ME2, (5_000_000n * 10n ** 18n).toString());
  const c = createAgents({ pg, send, rpc: "", exclude: [TEAM, ME, ME2], personal: [ME, ME2], tokenUri: async () => uri });
  check("personal wallet rates a fly it holds", (await c.rater(122, ME))?.who === "owner");
  check("personal wallet is never community", (await c.rater(122, ME2))?.who === null);
  check("other team wallets still out", (await c.rater(122, TEAM))?.who === null);
  const list = await (async () => { await b.route({ method: "GET" } as any, {} as any, new URL("https://x/api/agents")); return out.body; })();
  check("stars in the list", list.agents[0].rating?.stars === 5 && list.agents[0].rating.count === 1, JSON.stringify(list.agents[0]));
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
