/**
 * Trader Flies as ERC-8004 agents (2026-11-04): the registration file each fly's wallet points the ERC-8004 Identity
 * Registry on Robinhood Chain at (flytrade/vaults/vagents.py sends register(<this URL>) from the fly's own wallet).
 *
 *   GET /api/agents/fly/<fly>.json  -> the ERC-8004 registration file (eips.ethereum.org/EIPS/eip-8004#registration-v1)
 *   GET /api/agents                 -> { registry, chain_id, agents: [{ fly, wallet, agent_id, rating: { stars, count } | null }] }
 *   GET /api/agents/fly/<fly>/ratings[?fresh=1]  -> its ratings: stars, count, by kind of rater, the latest with comments
 *   GET /api/agents/fly/<fly>/rater?wallet=0x..  -> may this wallet rate it (and as what), and its own last rating
 *
 * Read live, so the file never needs a second transaction: the fly's wallet (mine.vault_wallets), its strategy and
 * whether it trades (the leaderboard), its agent id once registered ("vault:agent:<wallet>"), its art (the Trader Fly's
 * own tokenURI, cached a day). Past facts only: no returns promised.
 *
 * Ratings (2026-11-04, the user: "a ui Rate fly ... and we can be showing the rate"): a rater's OWN wallet sends
 * giveFeedback to the ERC-8004 Reputation Registry (never ours: our wallets rating our flies is farming; the registry
 * itself refuses the fly's own wallet). Stars 1-5 = value 20..100, tag1 "trading", tag2 the kind of rater, an optional
 * comment as a data: URI. The site offers the button to wallets with a real tie to the fly: its owner, a past holder of
 * its wallet, or the community (200k+ $FLYAI or a fly of their own). Anyone can call the registry directly, so the
 * kind is worked out HERE when a rating is indexed, never taken from tag2; ratings from nobody (or the team) are shown
 * as unverified and left out of the stars. A wallet's latest rating of a fly is the one that counts; revoked ones go.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const CHAIN_ID = 4663;
const TRADERFLY = "0x18d4d831ca89672126172b73ba05f5a318ad5a72";
const SITE = "https://flyaiworld.com";
const ART_MS = 24 * 3_600_000;
export const REPUTATION = "0x8004baa17c55a88189ae136b182e5fda19de9b63";
export const NEW_FEEDBACK = "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc";
export const REVOKED = "0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d";
const RATINGS_FROM = 105_858_000;          // the first fly registered at 105,858,944 (11-04)
const SCAN_MS = 180_000, FRESH_MS = 15_000, LOG_SPAN = 50_000;
const ACTIVE_AT = 200_000n * 10n ** 18n;
export type RaterKind = "owner" | "former" | "community";
export type Rating = { agent: number; client: string; index: number; score: number; tag2: string; comment: string | null;
  who: RaterKind | null; at: number; block: number; tx: string; revoked?: boolean };
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
    supportedTrust: ["reputation"],
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

const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"}`);
function stringAt(data: string, i: number): string {
  const off = Number(word(data, i)) * 2 + 2;
  const n = Number(BigInt(`0x${data.slice(off, off + 64) || "0"}`));
  return Buffer.from(data.slice(off + 64, off + 64 + n * 2), "hex").toString("utf8");
}
/** A NewFeedback log: (feedbackIndex, value int128, decimals, tag1, tag2, endpoint, feedbackURI, hash); agent + client in topics. */
export function decodeFeedback(l: { topics: string[]; data: string }) {
  let v = word(l.data, 1);
  if (v >= 1n << 255n) v -= 1n << 256n;                     // int128, sign-extended into its word
  const dec = Number(word(l.data, 2));
  return { agent: Number(BigInt(l.topics[1])), client: `0x${l.topics[2].slice(-40)}`.toLowerCase(), index: Number(word(l.data, 0)),
    score: Number(v) / 10 ** Math.min(dec, 18), tag1: stringAt(l.data, 3), tag2: stringAt(l.data, 4), uri: stringAt(l.data, 6) };
}
/** The comment in a feedback's data: URI, made safe to show: plain text, no links, 200 characters. */
export function commentOf(uri: string): string | null {
  const m = /^data:application\/json;base64,(.+)$/.exec(uri ?? "");
  if (!m) return null;
  try {
    const c = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"))?.comment;
    if (typeof c !== "string") return null;
    const clean = c.replace(/[\u0000-\u001f\u007f<>]/g, " ")
      .replace(/(https?:\/\/|www\.)\S*/gi, "").replace(/\b\S+\.(com|io|xyz|net|org|app|fun|gg|co|me|ly|link|site|top)\b\S*/gi, "")
      .replace(/\s+/g, " ").trim().slice(0, 200);
    return clean || null;
  } catch { return null; }
}
const starsOf = (score: number) => Math.round(Math.max(0, Math.min(100, score)) / 20 * 10) / 10;
/** A fly's stars from its ratings: each wallet's latest, unrevoked; unverified ones (who null) counted apart. */
export function summarize(ratings: Rating[]) {
  const latest = new Map<string, Rating>();
  for (const r of [...ratings].sort((a, b) => a.block - b.block || a.index - b.index)) latest.set(r.client, r);
  const live = [...latest.values()].filter((r) => !r.revoked);
  const ok = live.filter((r) => r.who);
  const by: Record<string, number> = {};
  for (const r of ok) by[r.who!] = (by[r.who!] ?? 0) + 1;
  const avg = ok.length ? ok.reduce((s, r) => s + Math.max(0, Math.min(100, r.score)), 0) / ok.length : 0;
  return { stars: ok.length ? starsOf(avg) : null, count: ok.length, by, unverified: live.length - ok.length,
    latest: live.sort((a, b) => b.block - a.block || b.index - a.index) };
}

type FeedbackLog = { topics: string[]; data: string; blockNumber: string; transactionHash: string };
export function createAgents(d: {
  pg: Pg;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  rpc: string;
  tokenUri?: (fly: number) => Promise<string>;      // tests
  now?: () => number;
  /** the team's wallets: never a verified rater, except `personal` ones for flies they own */
  exclude?: string[];
  personal?: string[];
  /** tests: the registry's feedback logs and block times */
  chain?: { head(): Promise<number>; logs(from: number, to: number): Promise<FeedbackLog[]>; blockTime(n: number): Promise<number> };
}) {
  const now = d.now ?? Date.now;
  const team = new Set((d.exclude ?? []).map((w) => w.toLowerCase()));
  /** team wallets that may still rate flies they own (the user's personal wallet); RATE_OWNER_OK overrides */
  const personal = new Set((d.personal ?? (process.env.RATE_OWNER_OK ?? "0xae92d64584e7f8e54995c362eaa8d7949fac8b1b").split(","))
    .map((w) => w.trim().toLowerCase()).filter(Boolean));
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch(d.rpc, { method: "POST", headers: { "content-type": "application/json", "user-agent": "fly.ai agents" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
    const j = await r.json() as { result?: any; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const chain = d.chain ?? {
    head: async () => Number(await rpc("eth_blockNumber", [])),
    logs: (from: number, to: number) => rpc("eth_getLogs", [{ address: REPUTATION, topics: [[NEW_FEEDBACK, REVOKED]],
      fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }]) as Promise<FeedbackLog[]>,
    blockTime: async (n: number) => Number((await rpc("eth_getBlockByNumber", [`0x${n.toString(16)}`, false])).timestamp) * 1000,
  };
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

  // ---- ratings ----
  type Store = { cursor: number; ratings: Rating[] };
  const load = async (): Promise<Store> =>
    (await d.pg.one<{ value: Store }>("select value from mine.vault_public where key = 'agent_ratings'"))?.value ?? { cursor: RATINGS_FROM, ratings: [] };
  const save = (s: Store) => d.pg.run(`insert into mine.vault_public (key, value, updated_at) values ('agent_ratings', ?::text::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`, JSON.stringify(s));
  const agentOf = async (wallet: string) => {
    const a = await d.pg.one<{ value: any }>("select value from mine.vault_public where lower(key) = ?", `vault:agent:${wallet.toLowerCase()}`);
    return Number.isInteger(a?.value?.agent_id) ? Number(a!.value.agent_id) : null;
  };
  const walletOf = async (fly: number) =>
    (await d.pg.one<{ address: string }>("select address from mine.vault_wallets where fly_id = ? order by id limit 1", fly))?.address ?? null;
  /** our agents: agent id -> { fly, wallet } */
  async function ours() {
    const rows = await d.pg.all<{ key: string; value: any }>("select key, value from mine.vault_public where key like 'vault:agent:%'");
    return new Map(rows.filter((r) => Number.isInteger(r.value?.agent_id))
      .map((r) => [Number(r.value.agent_id), { fly: Number(r.value.fly), wallet: r.key.slice("vault:agent:".length).toLowerCase() }]));
  }

  /** What tie a wallet has to a fly, if any: its owner now, a past holder of its wallet, or the community. */
  async function raterKind(fly: number, flyWallet: string, wallet: string): Promise<RaterKind | null> {
    const w = wallet.toLowerCase(), fw = flyWallet.toLowerCase();
    // a team wallet counts only as the owner (or past holder) of a fly it really holds - the user's own wallet holds
    // and runs flies (11-04: "i hold flies and have them active"); never as "community"
    const ownerOnly = personal.has(w);
    if (!/^0x[0-9a-f]{40}$/.test(w) || (team.has(w) && !ownerOnly) || w === fw) return null;
    const [owner, holder, former, held] = await Promise.all([
      d.pg.one<{ owner: string }>("select lower(owner) as owner from mine.xp_flies where id = ?", fly).catch(() => undefined),
      d.pg.one<{ holder: string }>("select lower(holder) as holder from mine.vault_ledger where lower(wallet) = ? and chain = 'robinhood'", fw).catch(() => undefined),
      d.pg.one<{ n: number }>("select count(*)::int as n from mine.vault_moves where lower(wallet) = ? and lower(holder) = ?", fw, w).catch(() => undefined),
      d.pg.one<{ total: string; flies: number }>("select (liquid + staked + locked)::text as total, flies from mine.xp_holders where wallet = ?", w).catch(() => undefined),
    ]);
    if (owner?.owner === w || holder?.holder === w) return "owner";
    if ((former?.n ?? 0) > 0) return "former";
    if (ownerOnly) return null;
    if (held && (BigInt(held.total.split(".")[0]) >= ACTIVE_AT || held.flies > 0)) return "community";
    return null;
  }

  let scanning: Promise<void> | null = null, scannedAt = 0;
  /** New feedback on our agents since the cursor, a span at a time; each new rating gets its rater's kind now. */
  async function scan() {
    const s = await load();
    const mine = await ours();
    const head = (await chain.head()) - 2;
    let a = s.cursor, span = LOG_SPAN;
    const times = new Map<number, number>();
    while (a <= head) {
      const b = Math.min(head, a + span - 1);
      let logs: FeedbackLog[];
      try { logs = await chain.logs(a, b); } catch (err) {
        if (span <= 500) throw err;
        span = Math.floor(span / 4);
        continue;
      }
      for (const l of logs) {
        const agent = Number(BigInt(l.topics[1] ?? "0x0"));
        const ag = mine.get(agent);
        if (!ag) continue;
        const block = Number(l.blockNumber);
        if (l.topics[0] === REVOKED) {
          const client = `0x${l.topics[2].slice(-40)}`.toLowerCase(), index = Number(BigInt(l.topics[3]));
          for (const r of s.ratings) if (r.agent === agent && r.client === client && r.index === index) r.revoked = true;
          continue;
        }
        if (l.topics[0] !== NEW_FEEDBACK) continue;
        const f = decodeFeedback(l);
        if (s.ratings.some((r) => r.agent === agent && r.client === f.client && r.index === f.index)) continue;
        if (!times.has(block)) times.set(block, await chain.blockTime(block).catch(() => now()));
        s.ratings.push({ agent, client: f.client, index: f.index, score: f.score, tag2: f.tag2.slice(0, 32), comment: commentOf(f.uri),
          who: f.tag1 === "trading" ? await raterKind(ag.fly, ag.wallet, f.client) : null, at: times.get(block)!, block, tx: l.transactionHash });
      }
      a = b + 1;
      span = Math.min(LOG_SPAN, span * 2);
    }
    s.cursor = a;
    await save(s);
    scannedAt = now();
  }
  const refresh = () => (scanning ??= scan().catch((err) => console.error(`agents ratings: ${err instanceof Error ? err.message : err}`))
    .finally(() => { scanning = null; }));
  function start() {
    setTimeout(refresh, 20_000).unref();
    setInterval(refresh, SCAN_MS).unref();
  }

  async function names(wallets: string[]) {
    const m = new Map<string, string>();
    if (!wallets.length) return m;
    const list = `{${wallets.join(",")}}`;
    const [nicks, xs] = await Promise.all([
      d.pg.all<{ wallet: string; nickname: string }>("select wallet, nickname from mine.profiles where wallet = any(?::text[])", list).catch(() => []),
      d.pg.all<{ wallet: string; username: string }>("select wallet, username from mine.x_links where wallet = any(?::text[])", list).catch(() => []),
    ]);
    for (const x of xs) m.set(x.wallet, `@${x.username}`);
    for (const n of nicks) if (n.nickname) m.set(n.wallet, n.nickname);
    return m;
  }

  async function ratingsOf(fly: number) {
    const wallet = await walletOf(fly);
    if (!wallet) return null;
    const id = await agentOf(wallet);
    const s = id === null ? null : summarize((await load()).ratings.filter((r) => r.agent === id));
    const recent = (s?.latest ?? []).slice(0, 20);
    const who = await names(recent.map((r) => r.client));
    return { fly, wallet, agent_id: id, reputation: REPUTATION, stars: s?.stars ?? null, count: s?.count ?? 0, by: s?.by ?? {},
      unverified: s?.unverified ?? 0,
      recent: recent.map((r) => ({ wallet: r.client, name: who.get(r.client) ?? null, stars: starsOf(r.score), who: r.who,
        comment: r.comment, at: new Date(r.at).toISOString(), tx: r.tx })) };
  }

  async function rater(fly: number, wallet: string) {
    const fw = await walletOf(fly);
    if (!fw || !/^0x[0-9a-f]{40}$/.test(wallet)) return null;
    const id = await agentOf(fw);
    const who = id === null ? null : await raterKind(fly, fw, wallet);
    const last = id === null ? null : summarize((await load()).ratings.filter((r) => r.agent === id && r.client === wallet)).latest[0] ?? null;
    return { fly, agent_id: id, reputation: REPUTATION, can: who !== null, who,
      mine: last ? { stars: starsOf(last.score), comment: last.comment, at: new Date(last.at).toISOString() } : null };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET") return false;
    const rm = /^\/api\/agents\/fly\/(\d{1,6})\/(ratings|rater)$/.exec(url.pathname);
    if (rm) {
      const fly = Number(rm[1]);
      if (rm[2] === "ratings") {
        if (url.searchParams.get("fresh") === "1" && now() - scannedAt > FRESH_MS) await refresh();
        const r = await ratingsOf(fly);
        d.send(res, r ? 200 : 404, r ?? { error: "no wallet for this fly" });
      } else {
        const r = await rater(fly, (url.searchParams.get("wallet") ?? "").toLowerCase());
        d.send(res, r ? 200 : 400, r ?? { error: "a fly with a wallet, and ?wallet=0x.." });
      }
      return true;
    }
    const m = /^\/api\/agents\/fly\/(\d{1,6})(\.json)?$/.exec(url.pathname);
    if (m) {
      const f = await facts(Number(m[1]));
      if (!f) { d.send(res, 404, { error: "no wallet for this fly" }); return true; }
      d.send(res, 200, registration(f));
      return true;
    }
    if (url.pathname === "/api/agents") {
      const [rows, store] = await Promise.all([
        d.pg.all<{ key: string; value: any }>("select key, value from mine.vault_public where key like 'vault:agent:%'"), load()]);
      const byAgent = new Map<number, Rating[]>();
      for (const r of store.ratings) (byAgent.get(r.agent) ?? byAgent.set(r.agent, []).get(r.agent)!).push(r);
      d.send(res, 200, { registry: REGISTRY, reputation: REPUTATION, chain_id: CHAIN_ID, agents: rows
        .map((r) => {
          const s = summarize(byAgent.get(r.value?.agent_id) ?? []);
          return { fly: r.value?.fly, wallet: r.key.slice("vault:agent:".length), agent_id: r.value?.agent_id,
            rating: s.count ? { stars: s.stars, count: s.count } : null };
        })
        .sort((a, b) => a.fly - b.fly) });
      return true;
    }
    return false;
  }

  return { route, facts, scan, start, ratingsOf, rater, raterKind };
}
