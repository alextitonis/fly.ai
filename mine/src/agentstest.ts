/**
 * Trader Flies as ERC-8004 agents (src/agents.ts) against a real Postgres: the registration file before and after the
 * fly registers, its art from the tokenURI, an unknown fly, and the list.
 *   npm run test:agents
 */
import type { ServerResponse } from "node:http";
import { REGISTRY, createAgents, imageOf, registration } from "./agents.ts";
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
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
