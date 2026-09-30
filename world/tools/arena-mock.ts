/**
 * A local stand-in for the Colosseum's API, only to look at the page (no chain, no database, no money):
 *   node --experimental-strip-types tools/arena-mock.ts            -> http://localhost:5200
 *   MOCK=1 npx vite --config vite.colosseum.dev.config.ts --port 5199
 * Season 1 is finished (8 fights' worth of bracket played by the real rules with a stand-in brain); season 2 follows
 * the state set by GET /mock/state/open|running|done. /mock/rpc answers the page's eth_call of verifyFight like the ledger contract would. You are signed in as a wallet holding Trader Flies 188, 157 and 33.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { deriveRng, entriesDigest, maxHp, playTournament, roundsFor, runFight, sfc32, type Match } from "../src/arena/game.ts";
import { fightLeaf, merkle, verify } from "../../mine/src/arenachain.ts";
import { AURAS } from "../src/arena/shop.ts";
import { BACKGROUNDS, COLORWAYS, EXTRAS, GEAR, MAX_POTIONS, POSES, POTION_IDS, POTIONS, RARITIES, statsOf, type PotionId, type Traits } from "../src/arena/stats.ts";

const REVEAL = "../flytrade/nft/reveal";
const traitsOf = (id: number): Traits => {
  const a = Object.fromEntries((JSON.parse(readFileSync(`${REVEAL}/${id}.json`, "utf8")).attributes as { trait_type: string; value: string }[]).map((x) => [x.trait_type, x.value]));
  const rarity = RARITIES.indexOf(a.Rarity);
  return { rarity, pose: POSES.findIndex((p) => p[0] === a.Pose), colorway: COLORWAYS[rarity].indexOf(a.Colorway),
    background: BACKGROUNDS.findIndex((p) => p[0] === a.Background), gear: GEAR.findIndex((p) => p[0] === a.Gear), extra: EXTRAS.findIndex((p) => p[0] === a.Extra) };
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const LEDGER = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ME = "0x1234567890abcdef1234567890abcdef12345678";
const OTHER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MINE = [188, 157, 33];

/** a brain stand-in: charge spikes about 38 + 35 x scent, escape spikes follow the loom */
const brainFor = (seed: number) => {
  const u = sfc32(seed, seed ^ 0x9e3779b9, 7, 11);
  return (scent: number, loom: number) => ({ charge: Math.round(38 + 35 * scent + (u() - 0.5) * 12), escape: Math.max(0, Math.round(4 + loom * 420 + (u() - 0.5) * 8)) });
};

interface Entry { fly: number; wallet: string; potions: PotionId[]; client_seed: string; aura: string | null }
interface Season {
  id: string; season: number; status: "open" | "running" | "done" | "void"; entries: Entry[]; matches: Match[]; places: (number | null)[] | null;
  server_seed: string; digest: string | null; closes_at: number; entry: number;
}
const view = (e: Entry, s: Season) => {
  const traits = traitsOf(e.fly), stats = statsOf(traits, e.potions);
  const place = s.places ? s.places.indexOf(e.fly) + 1 || null : null;
  const pool = s.entries.length * s.entry * 0.9;
  const prize = place ? Math.round(pool * [0.6, 0.25, 0.15][place - 1]) : null;
  return { fly: e.fly, wallet: e.wallet, traits, potions: e.potions, stats, hp: maxHp(stats), aura: e.aura, place, prize: prize ? String(prize) : null, claimed: false, client_seed: s.status === "done" ? e.client_seed : null };
};
const summary = (s: Season) => {
  const pot = s.entries.length * s.entry;
  return { id: s.id, season: s.season, name: `Season ${s.season}`, status: s.status, entry: String(s.entry), potion_price: "25000", fee_bps: 1000, min_entrants: 4, max_entrants: 256, max_per_wallet: 3,
    opens_at: Date.now() - 3600_000, closes_at: s.closes_at, done_at: s.status === "done" ? Date.now() - 1000 : null, entrants: s.entries.length, pot: String(pot), fee: String(pot * 0.1), prize_pool: String(pot * 0.9),
    places: s.places, commit_hash: sha(s.server_seed), digest: s.digest, server_seed: s.status === "done" ? s.server_seed : null,
    fee_to: ME, fee_tx: s.status === "done" ? "0x" + "12".repeat(32) : null,
    chain: s.status === "done" ? { commit_tx: "0x" + "ab".repeat(32), result_tx: "0x" + "cd".repeat(32), results_root: "0x" + "ef".repeat(32) } : null };
};
const full = (s: Season) => ({
  ...summary(s), rounds: s.entries.length >= 2 ? roundsFor(s.entries.length) : 0,
  progress: s.status === "running" ? { fought: 3, fights: s.entries.length } : null,
  entries: s.entries.map((e) => view(e, s)),
  matches: s.status === "done" ? s.matches.map((m) => ({ round: m.round, slot: m.slot, a: m.a, b: m.b, winner: m.winner, how: m.how, rounds: Math.max(0, m.events.length - 1) })) : [],
});

/** every fight of a done season as the ledger would record it: leaf, root and proof */
function results(s: Season) {
  const fights = s.matches.filter((m) => m.b !== null).sort((x, y) => x.round - y.round || x.slot - y.slot);
  const leaves = fights.map((m) => fightLeaf({ season: s.season, round: m.round, slot: m.slot, a: m.a, b: m.b!, winner: m.winner, events: JSON.stringify(m.events) }));
  const tree = merkle(leaves);
  return { root: tree.root, byKey: new Map(fights.map((m, i) => [`${m.round}:${m.slot}`, { leaf: leaves[i], proof: tree.proofs[i] }])) };
}

async function play(s: Season): Promise<void> {
  s.digest = await entriesDigest(s.entries.map((e) => ({ fly: e.fly, clientSeed: e.client_seed })));
  const stats = new Map(s.entries.map((e) => [e.fly, statsOf(traitsOf(e.fly), e.potions)]));
  s.matches = [];
  for await (const m of playTournament(s.entries.map((e) => e.fly), s.server_seed, s.digest,
    (label, a, b) => runFight(s.server_seed, s.digest!, label, [stats.get(a)!, stats.get(b)!], (seed) => brainFor(seed)))) {
    if (m.type === "match") s.matches.push(m);
    else s.places = m.places;
  }
}

const mk = (id: string, season: number, flies: number[], status: Season["status"], closes: number): Season => ({
  id, season, status, closes_at: closes, entry: 100000, server_seed: sha(id), digest: null, matches: [], places: null,
  entries: flies.map((fly, i) => ({ fly, wallet: MINE.includes(fly) ? ME : OTHER, potions: i % 3 === 0 ? ["preworkout"] : [], client_seed: `seed${fly}`, aura: i === 2 ? "gold" : null })),
});
const s1 = mk("00000000-0000-0000-0000-000000000001", 1, [126, 219, 250, 281, 312, 343, 410, 441], "done", Date.now() - 86_400_000);
const s2 = mk("00000000-0000-0000-0000-000000000002", 2, [503, 534, 472, 410, 33, 126], "open", Date.now() + 23 * 3600_000 + 41 * 60_000);
await play(s1);
const seasons = [s2, s1];
let balance = 120000;
const owned: Record<number, string[]> = { 188: [], 157: ["frost"], 33: [] };
const worn: Record<number, string | null> = { 188: null, 157: "frost", 33: null };
const forever: Record<number, string[]> = { 188: ["hopium"], 157: [], 33: [] };

const json = (res: any, code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const body = (req: any): Promise<any> => new Promise((r) => { let b = ""; req.on("data", (c: string) => (b += c)); req.on("end", () => r(b ? JSON.parse(b) : {})); });

const ACCOUNT_JS = `let w = "${ME}"; const subs = [];
export const signedIn = () => w; export const sessionHeaders = () => ({}); export const onAccount = (f) => subs.push(f);
export const signIn = async () => w; export const signOut = async () => { w = null; subs.forEach((f) => f(null)); };
export const transact = async () => "0x"; export const mined = async () => {}; export const errorText = (e) => String((e && e.message) || e);`;

createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x"), p = url.pathname;
  try {
    if (p === "/compute/mine/web/config.js") { res.writeHead(200, { "content-type": "text/javascript" }); return void res.end('export const API = "";'); }
    if (p === "/compute/mine/web/account.js") { res.writeHead(200, { "content-type": "text/javascript" }); return void res.end(ACCOUNT_JS); }
    const st = /^\/mock\/state\/(open|running|done)$/.exec(p);
    if (st) { s2.status = st[1] as Season["status"]; if (s2.status === "done") await play(s2); return json(res, 200, { season2: s2.status }); }
    if (req.method === "POST" && p === "/mock/rpc") {
      const b = await body(req), data: string = b.params[0].data;
      // verifyFight(uint256 season, bytes32 leaf, bytes32[] proof)
      const w = (i: number) => data.slice(10 + i * 64, 10 + (i + 1) * 64);
      const season = seasons.find((x) => x.season === Number(BigInt("0x" + w(0))));
      const n = Number(BigInt("0x" + w(3)));
      const proof = Array.from({ length: n }, (_, i) => w(4 + i));
      const ok = !!season && season.status === "done" && verify(w(2), proof, results(season).root);
      return json(res, 200, { jsonrpc: "2.0", id: b.id, result: "0x" + (ok ? "1" : "0").padStart(64, "0") });
    }
    if (p === "/api/arena/config") return json(res, 200, { on: true, contract: "0x0", image: "", potion_price: "25000", potion_forever_price: "100000", ledger: LEDGER, rpc: "/mock/rpc", explorer: "https://explorer.example", potions: POTION_IDS.map((id) => ({ id, name: POTIONS[id].name, add: POTIONS[id].add })), max_potions: MAX_POTIONS, auras: AURAS });
    if (p === "/api/arena/current") return json(res, 200, { tournament: full(s2) });
    if (p === "/api/arena/tournaments") return json(res, 200, { tournaments: seasons.map(summary) });
    let m: RegExpExecArray | null;
    if ((m = /^\/api\/arena\/tournaments\/([0-9-]+)$/.exec(p))) { const s = seasons.find((x) => x.id === m![1]); return s ? json(res, 200, full(s)) : json(res, 404, { error: "no such tournament" }); }
    if ((m = /^\/api\/arena\/tournaments\/([0-9-]+)\/fights\/(-?\d+)\/(\d+)$/.exec(p))) {
      const s = seasons.find((x) => x.id === m![1])!, mt = s.matches.find((x) => x.round === Number(m![2]) && x.slot === Number(m![3]));
      if (!mt || mt.b === null) return json(res, 404, { error: "no such fight" });
      const side = (f: number) => view(s.entries.find((e) => e.fly === f)!, s);
      const r = results(s), c = r.byKey.get(`${mt.round}:${mt.slot}`)!;
      return json(res, 200, { chain: { season: s.season, leaf: c.leaf, proof: c.proof, root: r.root }, tournament: s.id, round: mt.round, slot: mt.slot, a: side(mt.a), b: side(mt.b), winner: mt.winner, how: mt.how, seeds: mt.seeds, events: mt.events, server_seed: s.server_seed, digest: s.digest, commit_hash: sha(s.server_seed) });
    }
    if ((m = /^\/api\/arena\/flies\/(\d+)$/.exec(p))) { const t = traitsOf(Number(m[1])), stats = statsOf(t); return json(res, 200, { fly: Number(m[1]), traits: t, stats, hp: maxHp(stats), aura: null, auras: [], record: { fights: 0, wins: 0, titles: 0 } }); }
    if (p === "/api/arena/me") {
      const flies = MINE.map((fly) => { const e = s2.entries.find((x) => x.fly === fly), t = traitsOf(fly), potions = e?.potions ?? []; const stats = statsOf(t, potions);
        return { fly, traits: t, potions, stats, hp: maxHp(stats), entered: !!e, aura: worn[fly], auras: owned[fly], potions_owned: forever[fly] }; });
      return json(res, 200, { wallet: ME, balance: String(balance), terms_accepted: true, flies, prizes: s1.places?.includes(188) ? [] : [] });
    }
    if (req.method === "POST" && p === "/api/arena/enter") { const b = await body(req); balance -= 5000; s2.entries.push({ fly: b.fly, wallet: ME, potions: b.potions ?? [], client_seed: b.client_seed, aura: worn[b.fly] ?? null }); return json(res, 200, full(s2)); }
    if (req.method === "POST" && p === "/api/arena/potion") { const b = await body(req); balance -= 2500; s2.entries.find((e) => e.fly === b.fly)?.potions.push(b.potion); return json(res, 200, full(s2)); }
    if (req.method === "POST" && p === "/api/arena/aura") { const b = await body(req); balance -= 25000; owned[b.fly].push(b.aura); worn[b.fly] = b.aura; return json(res, 200, {}); }
    if (req.method === "POST" && p === "/api/arena/potion-forever") { const b = await body(req); balance -= 100000; forever[b.fly].push(b.potion); return json(res, 200, {}); }
    if (req.method === "POST" && p === "/api/arena/wear") { const b = await body(req); worn[b.fly] = b.aura; return json(res, 200, {}); }
    if (p === "/api/orders/config") return json(res, 200, { pay_to: ME, token: "0x0", chain_id: 4663 });
    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: String((err as Error).message) });
  }
}).listen(5200, () => console.log("arena mock on http://localhost:5200 (season 2: /mock/state/open|running|done)"));
