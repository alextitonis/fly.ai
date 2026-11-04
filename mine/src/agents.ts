/**
 * Trader Flies as ERC-8004 agents (2026-11-04): the registration file each fly's wallet points the ERC-8004 Identity
 * Registry on Robinhood Chain at (flytrade/vaults/vagents.py sends register(<this URL>) from the fly's own wallet).
 *
 *   GET /api/agents/fly/<fly>.json  -> the ERC-8004 registration file (eips.ethereum.org/EIPS/eip-8004#registration-v1)
 *   GET /api/agents                 -> { registry, chain_id, agents: [{ fly, wallet, agent_id }] }
 *
 * Read live, so the file never needs a second transaction: the fly's wallet (mine.vault_wallets), its strategy and
 * whether it trades (the leaderboard), its agent id once registered ("vault:agent:<wallet>"), its art (the Trader Fly's
 * own tokenURI, cached a day). Past facts only: no returns promised.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const CHAIN_ID = 4663;
const TRADERFLY = "0x18d4d831ca89672126172b73ba05f5a318ad5a72";
const SITE = "https://flyaiworld.com";
const ART_MS = 24 * 3_600_000;
const STRATEGY: Record<string, string> = { stock_swing: "stock swing", let_it_fly: "let it fly", custom: "custom",
  snipe: "sniper", core: "core", solana: "Solana" };

export type FlyFacts = { fly: number; wallet: string; agentId: number | null; strategy: string | null; active: boolean;
  trades: number | null; image: string | null };

/** The ERC-8004 registration file for one fly. */
export function registration(f: FlyFacts) {
  const how = f.strategy ? ` Strategy: ${STRATEGY[f.strategy] ?? f.strategy.replace(/_/g, " ")}.` : "";
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: `Trader Fly #${f.fly}`,
    description: `A Trader Fly from fly.ai: a real fruit-fly connectome that trades from its own wallet (${f.wallet}) on `
      + `Robinhood Chain. Its owner funds it; the fly's brain makes the calls, and every trade is public on chain.${how}`,
    image: f.image ?? `${SITE}/assets/og/traderflies.jpg`,
    services: [
      { name: "web", endpoint: `${SITE}/traderflies/fly?id=${f.fly}` },
      { name: "agentWallet", endpoint: `eip155:${CHAIN_ID}:${f.wallet}` },
    ],
    x402Support: false,
    active: f.active,
    registrations: f.agentId === null ? [] : [{ agentId: f.agentId, agentRegistry: `eip155:${CHAIN_ID}:${REGISTRY}` }],
  };
}

/** A tokenURI answer (data:application/json;base64,... or a URL's JSON) -> its image. */
export function imageOf(uri: string): string | null {
  const m = /^data:application\/json;base64,(.+)$/.exec(uri);
  if (!m) return null;
  try {
    const img = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"))?.image;
    return typeof img === "string" && /^(https|ipfs):\/\//.test(img) ? img : null;
  } catch { return null; }
}

export function createAgents(d: {
  pg: Pg;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  rpc: string;
  tokenUri?: (fly: number) => Promise<string>;      // tests
  now?: () => number;
}) {
  const now = d.now ?? Date.now;
  const art = new Map<number, { at: number; image: string | null }>();

  const tokenUri = d.tokenUri ?? (async (fly: number) => {
    const data = "0xc87b56dd" + fly.toString(16).padStart(64, "0");
    const r = await fetch(d.rpc, { method: "POST", headers: { "content-type": "application/json", "user-agent": "fly.ai agents" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: TRADERFLY, data }, "latest"] }),
      signal: AbortSignal.timeout(10_000) });
    const hex: string = (await r.json())?.result ?? "0x";
    const b = Buffer.from(hex.slice(2), "hex");
    if (b.length < 64) return "";
    const n = Number(BigInt("0x" + b.subarray(32, 64).toString("hex")));
    return b.subarray(64, 64 + n).toString("utf8");
  });

  async function image(fly: number): Promise<string | null> {
    const c = art.get(fly);
    if (c && now() - c.at < ART_MS) return c.image;
    let img: string | null = c?.image ?? null;
    try { img = imageOf(await tokenUri(fly)) ?? img; } catch { /* the last one, or the collection's */ }
    art.set(fly, { at: now(), image: img });
    return img;
  }

  async function facts(fly: number): Promise<FlyFacts | null> {
    const w = await d.pg.one<{ address: string }>("select address from mine.vault_wallets where fly_id = ? order by id limit 1", fly);
    if (!w) return null;
    const wallet = w.address;
    const [agent, board] = await Promise.all([
      d.pg.one<{ value: any }>("select value from mine.vault_public where lower(key) = ?", `vault:agent:${wallet.toLowerCase()}`),
      d.pg.one<{ row: any }>(`select r as row from mine.vault_public, jsonb_array_elements(value->'all') r
        where key = 'leaderboard' and lower(r->>'vault') = ? limit 1`, wallet.toLowerCase()).catch(() => null),
    ]);
    const row = board?.row ?? null;
    const id = agent?.value?.agent_id;
    return { fly, wallet, agentId: Number.isInteger(id) ? id : null, strategy: row?.starter ?? null,
      active: Boolean(row?.active) && !row?.closing, trades: row ? Number(row.trades ?? 0) : null, image: await image(fly) };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET") return false;
    const m = /^\/api\/agents\/fly\/(\d{1,6})(\.json)?$/.exec(url.pathname);
    if (m) {
      const f = await facts(Number(m[1]));
      if (!f) { d.send(res, 404, { error: "no wallet for this fly" }); return true; }
      d.send(res, 200, registration(f));
      return true;
    }
    if (url.pathname === "/api/agents") {
      const rows = await d.pg.all<{ key: string; value: any }>("select key, value from mine.vault_public where key like 'vault:agent:%'");
      d.send(res, 200, { registry: REGISTRY, chain_id: CHAIN_ID, agents: rows
        .map((r) => ({ fly: r.value?.fly, wallet: r.key.slice("vault:agent:".length), agent_id: r.value?.agent_id }))
        .sort((a, b) => a.fly - b.fly) });
      return true;
    }
    return false;
  }

  return { route, facts };
}
