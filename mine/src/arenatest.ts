/**
 * Fly Colosseum end to end (2026-09-30), its ledger and tournaments in a local Postgres (src/pgtest.ts) and the
 * chain played by a small JSON-RPC stand-in here (TraderFly.ownerOf and traitsOf). Balances are booked straight
 * into the ledger, as a deposit books them (deposits are roulette's, tested in roulettetest.ts).
 * - stats follow from the traits by the public tables; potions add their points;
 * - the rules are fair by symmetry: over many fights with a stand-in brain two flies with the same stats each win
 *   half, whichever side they are on; more points win more; the same seeds give the same fight;
 * - brackets: every field from 2 to 17 flies seats everyone once, gives the right byes, plays n - 1 fights plus the
 *   bronze fight, and ends in a podium; the prizes and the fee add up to the pot exactly;
 * - a tournament on the server: opened by the operator only, entered by a fly's owner only (terms, balance, seats per
 *   wallet, one entry per fly), potions, the pot; nothing of the fights shows before the end; the commit is
 *   sha256(server seed), revealed at the end, and the whole tournament replayed here from the revealed seeds on the
 *   real brain gives exactly the served fights and podium; prizes are claimed once;
 * - too few flies: void, everything paid back once;
 * - a server killed mid-tournament plays it on from its seeds after a restart, to the same fights;
 * - auras: bought by the owner, worn, kept with the fly; the operator's view; the off switch.
 * Plays real brain fights on the CPU (a minute or two).
 *
 *   npm run test:arena
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ConnectomeBrain, cells } from "../../world/src/connectome.ts";
import {
  BRONZE, deriveRng, drawBracket, entriesDigest, fightRng, maxHp, playFight, playTournament, prizes, roundsFor, RULES, runFight, setupFight, sfc32,
  type EndEvent, type FightEvent, type Match,
} from "../../world/src/arena/game.ts";
import { groups, runRound, type Counts } from "../../world/src/arena/readout.ts";
import { breakdown, statsOf, validPotions, type Stats, type Traits } from "../../world/src/arena/stats.ts";
import { loadModel } from "./load.ts";
import { startPg } from "./pgtest.ts";
import { selector } from "./staking.ts";
import { fightLeaf, merkle, verify } from "./arenachain.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";

const PORT = 8789, CHAIN_PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-arenatest-${process.pid}.db`);
const CONNECTOME = fileURLToPath(new URL("../../world/public/connectome/", import.meta.url));
const TRADERFLY = "0x18d4D831cA89672126172B73bA05f5A318ad5A72";
const LEDGER = checksumAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");
const LEDGER_KEY = "11".repeat(32);
const FEE_TO = checksumAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const WEI = 10n ** 18n;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** a stand-in brain: the same function for both flies, noise from the fly's own brain seed */
function standIn(seed: number): (scent: number, loom: number) => Counts {
  const u = sfc32(seed, seed ^ 0x9e3779b9, 7, 11);
  let windows = 0;
  return (scent, loom) => ({
    charge: Math.round((windows++ === 0 ? 17 + 58 * scent : 38 + 35 * scent) + 6 * (u() - 0.5)),
    escape: Math.round(4 + 420 * loom + 8 * (u() - 0.5)),
  });
}
const ZERO: Stats = { pow: 0, grd: 0, vit: 0, fury: 0 };

// ---- 1. stats and rules -----------------------------------------------------------------------------------
{
  // Rare, Got Rugged (fury 8), colorway 1 = Holo (Guard 4), Tangerine (Power 2), Crown (Vitality 4), Lambo Key (Power 2), +2 everywhere
  const t: Traits = { rarity: 2, pose: 9, colorway: 1, background: 3, gear: 4, extra: 9 };
  check("stats follow from the traits", JSON.stringify(statsOf(t)) === JSON.stringify({ pow: 6, grd: 6, vit: 6, fury: 10 }), JSON.stringify(statsOf(t)));
  check("every point has a line on the card", breakdown(t).map((l) => `${l.source}:${l.name}`).join() === "rarity:Rare,pose:Got Rugged,colorway:Holo,background:Tangerine,gear:Crown,extra:Lambo Key");
  check("a plain Common: the pose, the colorway and the background", JSON.stringify(statsOf({ rarity: 0, pose: 13, colorway: 0, background: 0, gear: 0, extra: 0 })) === JSON.stringify({ pow: 12, grd: 2, vit: 0, fury: 0 }));
  check("potions add 4 each", JSON.stringify(statsOf(t, ["copium", "preworkout"])) === JSON.stringify({ pow: 10, grd: 6, vit: 10, fury: 10 }));
  check("potions: known kinds, no repeats, two at most", validPotions(["hopium", "bubblewrap"]) && validPotions([]) && !validPotions(["hopium", "hopium"])
    && !validPotions(["hopium", "copium", "preworkout"]) && !validPotions(["redbull"]) && !validPotions("hopium"));
  let threw = false;
  try { statsOf({ ...t, pose: 14 }); } catch { threw = true; }
  check("traits outside the tables are refused", threw);
  check("HP is 200 plus Vitality", maxHp(ZERO) === 200 && maxHp(statsOf(t)) === 206);

  const FIGHTS = Number(process.env.ARENA_FAIR_FIGHTS ?? 20000);
  const t0 = Date.now();
  async function rate(a: Stats, b: Stats, label: string, n: number) {
    let side0 = 0, aWins = 0, bad = 0, rounds = 0;
    for (let f = 0; f < n; f++) {
      const rng = await deriveRng(`fair-${label}-${f}`, `client-${f}`);
      const brains = setupFight(rng).seeds.map(standIn);
      const flip = f % 2 === 1;
      let end: EndEvent | null = null, k = 0, hp: number[] = [];
      for await (const e of playFight(flip ? [b, a] : [a, b], rng, (side, _r, scent, loom) => brains[side](scent, loom))) {
        if (e.type === "round") {
          if (e.round !== k++ || e.dealt.some((x) => x < 0 || !Number.isInteger(x)) || e.scent.some((x) => x < RULES.scentMin || x > RULES.scentMax)
            || e.loom.some((x) => x < 0 || x > RULES.loomMax)) bad++;
          hp = e.hp;
        } else end = e;
      }
      if (!end || k < 1 || k > RULES.rounds || end.rounds !== k || (end.how === "ko" && hp[1 - end.winner] > 0) || (end.how === "points" && (hp[0] <= 0 || hp[1] <= 0))) { bad++; continue; }
      if (end.winner === 0) side0++;
      if ((end.winner === 0) !== flip) aWins++;
      rounds += k;
    }
    return { side0: side0 / n, a: aWins / n, bad, rounds: rounds / n };
  }
  const even = await rate({ pow: 5, grd: 5, vit: 5, fury: 5 }, { pow: 5, grd: 5, vit: 5, fury: 5 }, "even", FIGHTS);
  // Binomial(n, 1/2): 4 standard deviations
  const tol = 4 * Math.sqrt(0.25 / FIGHTS);
  check(`same stats: each side wins half (${FIGHTS} fights)`, even.bad === 0 && Math.abs(even.side0 - 0.5) < tol, `side 0 wins ${(100 * even.side0).toFixed(2)}%, ${even.rounds.toFixed(1)} rounds, ${even.bad} bad`);
  for (const k of ["pow", "grd", "vit", "fury"] as const) {
    const r = await rate({ ...ZERO, [k]: 12 }, ZERO, k, Math.round(FIGHTS / 5));
    check(`12 points of ${k} win more than half`, r.bad === 0 && r.a > 0.5 + tol, `${(100 * r.a).toFixed(1)}%`);
  }
  const fight = async () => runFight("s", "d", "0:0", [ZERO, ZERO], standIn);
  check("same seeds, same fight", JSON.stringify(await fight()) === JSON.stringify(await fight()));
  check("another fight of the tournament draws differently", JSON.stringify((await fight()).seeds) !== JSON.stringify((await runFight("s", "d", "0:1", [ZERO, ZERO], standIn)).seeds));

  // brackets
  let bad = "";
  for (let n = 2; n <= 17 && !bad; n++) {
    const flies = Array.from({ length: n }, (_, i) => 100 + i * 3);
    const first = drawBracket(flies, await fightRng("seed", "digest", "bracket"));
    const seats = 2 ** roundsFor(n);
    const seated = first.flatMap(([a, b]) => (b === null ? [a] : [a, b]));
    if (first.length !== seats / 2 || [...seated].sort((a, b) => a - b).join() !== flies.join() || first.filter(([, b]) => b === null).length !== seats - n) bad = `round 0 of ${n}`;
    const matches: Match[] = [];
    let places: (number | null)[] = [];
    for await (const e of playTournament(flies, "seed", "digest", (label, a, b) => runFight("seed", "digest", label, [ZERO, ZERO], standIn).then((r) => (void a, void b, r)))) {
      if (e.type === "match") matches.push(e); else places = e.places;
    }
    const fights = matches.filter((m) => m.b !== null);
    const lost = new Map<number, number>();
    for (const m of fights) { const l = m.winner === m.a ? m.b! : m.a; lost.set(l, (lost.get(l) ?? 0) + 1); }
    const bronze = matches.filter((m) => m.round === BRONZE);
    if (fights.length !== n - 1 + (n >= 4 ? 1 : 0)) bad = `${fights.length} fights for ${n}`;
    else if (bronze.length !== (n >= 4 ? 1 : 0) || (bronze[0] && bronze[0].winner !== places[2])) bad = `bronze of ${n}`;
    else if (new Set(places.filter((p) => p !== null)).size !== Math.min(3, n) || (places[2] === null) !== (n === 2)) bad = `podium of ${n}: ${places}`;
    else if (lost.has(places[0]!) || lost.get(places[1]!) !== 1) bad = `the champion of ${n} lost, or the runner-up didn't lose once`;
    else if (matches.at(-1)!.round !== roundsFor(n) - 1 || matches.at(-1)!.winner !== places[0]) bad = `the final of ${n} isn't last`;
    else if (flies.some((f) => f !== places[0] && !lost.has(f))) bad = `a fly of ${n} never lost and isn't the champion`;
  }
  check("brackets of 2 to 17: everyone seated once, byes, n - 1 fights and the bronze, a podium", !bad, bad);
  const d1 = await entriesDigest([{ fly: 7, clientSeed: "b" }, { fly: 3, clientSeed: "a" }]);
  check("the entries' hash doesn't depend on their order", d1 === await entriesDigest([{ fly: 3, clientSeed: "a" }, { fly: 7, clientSeed: "b" }]) && d1 === sha256hex("3:a|7:b"));
  const p3 = prizes(1_000_003n, 1000, 3), p2 = prizes(999n, 2000, 2);
  check("fee and prizes add up to the pot", p3.fee === 100_000n && p3.fee + p3.prizes.reduce((s, x) => s + x, 0n) === 1_000_003n && p3.prizes.length === 3
    && p3.prizes[0] > p3.prizes[1] && p3.prizes[1] > p3.prizes[2] && p2.prizes.length === 2 && p2.fee + p2.prizes[0] + p2.prizes[1] === 999n, `${p3.prizes} + ${p3.fee}`);
  console.log(`     (rules: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---- 2. the chain's stand-in ----------------------------------------------------------------------------------
const [alice, bob, carol] = [0, 1, 2].map(() => {
  const sk = secp256k1.utils.randomSecretKey();
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});
// flies 1-4 are alice's, 5-6 bob's, 8-10 carol's; 7 was never minted
const OWNER = new Map<number, string>([[1, alice.address], [2, alice.address], [3, alice.address], [4, alice.address], [5, bob.address], [6, bob.address],
  [8, carol.address], [9, carol.address], [10, carol.address]]);
const TRAITS = new Map<number, Traits>([...OWNER.keys()].map((id) => [id, { rarity: id % 4, pose: id % 14, colorway: id % 4, background: (id * 3) % 14, gear: id % 10, extra: (id * 5) % 14 }]));
const word = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");

/** the ledger contract's stand-in: the same rules as ColosseumLedger.sol (seasons in order, the seed must match its commit) */
interface Post { kind: "commit" | "reveal"; season: number; commit?: string; closesAt?: number; seed?: string; entrants?: number; digest?: string; root?: string; places?: number[] }
const posts: Post[] = [];
/** $FLYAI transfers sent by the fee payer: who got how many wei */
const transfers: { to: string; amount: bigint }[] = [];
const ledgerCommit = new Map<number, string>();
let ledgerLast = 0, ledgerNonce = 0;
/** minimal RLP decoding of a signed type-2 transaction: its `to` and `data` */
function rlpDecode(b: Buffer, at = 0): [unknown, number] {
  const t = b[at];
  if (t < 0x80) return [b.subarray(at, at + 1), at + 1];
  if (t < 0xb8) return [b.subarray(at + 1, at + 1 + t - 0x80), at + 1 + t - 0x80];
  if (t < 0xc0) { const n = t - 0xb7, len = Number(BigInt(`0x${b.subarray(at + 1, at + 1 + n).toString("hex")}`)); return [b.subarray(at + 1 + n, at + 1 + n + len), at + 1 + n + len]; }
  let start: number, end: number;
  if (t < 0xf8) { start = at + 1; end = start + t - 0xc0; } else { const n = t - 0xf7, len = Number(BigInt(`0x${b.subarray(at + 1, at + 1 + n).toString("hex")}`)); start = at + 1 + n; end = start + len; }
  const items: unknown[] = [];
  for (let p = start; p < end;) { const [item, next] = rlpDecode(b, p); items.push(item); p = next; }
  return [items, end];
}
/** applies a posted transaction to the stand-in; false = the contract would revert */
function ledgerApply(raw: Buffer): boolean {
  const fields = rlpDecode(raw.subarray(1))[0] as Buffer[];
  const data = fields[7].toString("hex");
  const arg = (i: number) => data.slice(8 + i * 64, 8 + (i + 1) * 64);
  if (data.startsWith("a9059cbb")) { transfers.push({ to: `0x${arg(0).slice(24)}`, amount: BigInt(`0x${arg(1)}`) }); return true; }
  if (data.startsWith(selector("commit(uint256,bytes32,uint64)").slice(2))) {
    const season = Number(BigInt(`0x${arg(0)}`));
    if (season !== ledgerLast + 1) return false;
    ledgerLast = season;
    ledgerCommit.set(season, arg(1));
    posts.push({ kind: "commit", season, commit: arg(1), closesAt: Number(BigInt(`0x${arg(2)}`)) });
    return true;
  }
  if (data.startsWith(selector("reveal(uint256,bytes,uint32,bytes32,bytes32,uint32,uint32,uint32)").slice(2))) {
    const season = Number(BigInt(`0x${arg(0)}`));
    const offset = Number(BigInt(`0x${arg(1)}`)) * 2, len = Number(BigInt(`0x${data.slice(8 + offset, 8 + offset + 64)}`));
    const seed = Buffer.from(data.slice(8 + offset + 64, 8 + offset + 64 + len * 2), "hex").toString("utf8");
    if (sha256hex(seed) !== ledgerCommit.get(season) || posts.some((p) => p.kind === "reveal" && p.season === season)) return false;
    posts.push({ kind: "reveal", season, seed, entrants: Number(BigInt(`0x${arg(2)}`)), digest: arg(3), root: arg(4), places: [5, 6, 7].map((i) => Number(BigInt(`0x${arg(i)}`))) });
    return true;
  }
  return false;
}
const chain = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const { id, method, params } = JSON.parse(body);
    const answer = (result: unknown) => res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    const revert = () => res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } }));
    res.setHeader("content-type", "application/json");
    if (method === "eth_getCode") return answer("0x");                     // no Multicall3 here: single calls
    // the operator's wallet posting to the ledger (src/relay.ts talks to these)
    if (method === "eth_estimateGas") return answer("0x30000");
    if (method === "eth_chainId") return answer("0x7a69");
    if (method === "eth_getTransactionCount") return answer(`0x${ledgerNonce.toString(16)}`);
    if (method === "eth_getBlockByNumber") return answer({ baseFeePerGas: "0x1" });
    if (method === "eth_maxPriorityFeePerGas") return answer("0x1");
    if (method === "eth_getTransactionReceipt") return answer({ status: "0x1" });
    if (method === "eth_sendRawTransaction") {
      const raw = Buffer.from(params[0].slice(2), "hex");
      if (!ledgerApply(raw)) return revert();
      ledgerNonce++;
      return answer(`0x${sha256hex(raw.toString("hex"))}`);
    }
    if (method === "eth_call" && params[0].to.toLowerCase() === LEDGER.toLowerCase()) return answer(`0x${word(ledgerLast)}`);   // lastSeason()
    if (method !== "eth_call" || params[0].to.toLowerCase() !== TRADERFLY.toLowerCase()) return revert();
    const data: string = params[0].data, fly = Number(BigInt(`0x${data.slice(10)}`));
    if (data.startsWith(selector("ownerOf(uint256)"))) return OWNER.has(fly) ? answer(`0x${OWNER.get(fly)!.slice(2).toLowerCase().padStart(64, "0")}`) : revert();
    if (data.startsWith(selector("traitsOf(uint256)"))) {
      const t = TRAITS.get(fly);
      return t ? answer(`0x${[t.rarity, t.pose, t.colorway, t.background, t.gear, 100, t.extra].map(word).join("")}`) : revert();
    }
    revert();
  });
});
await new Promise<void>((r) => chain.listen(CHAIN_PORT, "127.0.0.1", r));

// ---- 3. the server ------------------------------------------------------------------------------------------------
async function api(path: string, session: string | null, body?: unknown, admin = false): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(session ? { "x-flyai-session": session } : {}),
      ...(admin ? { authorization: `Bearer ${ADMIN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let server: ReturnType<typeof spawn> | null = null;
async function startServer(extra: Record<string, string> = {}): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50",
      ADMIN_TOKEN: ADMIN, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "none", CLAIM_RPC: "http://127.0.0.1:9", CLAIM_EXPLORER: "http://localhost",
      SEED_PAID: "0",
      ARENA_ON: "1", ARENA_TRADERFLY: TRADERFLY, ARENA_RPC: `http://127.0.0.1:${CHAIN_PORT}`, ARENA_MAX_ID: "10", ARENA_TICK_SEC: "1", ARENA_OWNERS_TTL_SEC: "1",
      ARENA_FEE_TO: FEE_TO, ARENA_FEE_KEY: LEDGER_KEY,
      ARENA_LEDGER: LEDGER, ARENA_LEDGER_KEY: LEDGER_KEY, ARENA_EXPLORER: "https://scan.test/",
      ARENA_IMAGE: "https://img.test/{id}.png", ARENA_ENTRY: "1000", ARENA_POTION: "400", ARENA_FEE_BPS: "1000", ARENA_MIN_ENTRANTS: "4", ARENA_MAX_PER_WALLET: "3",
      ...extra,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/stats`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
}
async function stopServer(): Promise<void> {
  if (!server) return;
  const s = server;
  server = null;
  const gone = new Promise((r) => s.once("exit", r));
  s.kill("SIGKILL");
  await gone;
}
const PG = await startPg(5544);

/** The tournament again, here, from its seeds: the same rules, engine and rounds as the server's worker. */
let model: ReturnType<typeof loadModel> | null = null;
async function replay(t: any): Promise<{ matches: Match[]; places: (number | null)[] }> {
  model ??= loadModel(CONNECTOME);
  const g = groups(model.meta, cells);
  const stats = new Map<number, Stats>(t.entries.map((e: any) => [e.fly, statsOf(e.traits, e.potions)]));
  const matches: Match[] = [];
  let places: (number | null)[] = [];
  for await (const e of playTournament(t.entries.map((e: any) => e.fly), t.server_seed, t.digest, (label, a, b) =>
    runFight(t.server_seed, t.digest, label, [stats.get(a)!, stats.get(b)!], (seed) => {
      const brain = new ConnectomeBrain(model!.w, model!.meta.params, seed);
      return (scent, loom) => runRound(brain, g, scent, loom);
    }))) {
    if (e.type === "match") { const { type: _t, ...m } = e; matches.push(m); } else places = e.places;
  }
  return { matches, places };
}

/** Waits for a tournament to leave `open` and `running`; returns its final view. */
async function finished(id: string, maxS = 600): Promise<any> {
  for (let i = 0; i < maxS * 2; i++) {
    const t = (await api(`/api/arena/tournaments/${id}`, null)).json;
    if (t.status === "done" || t.status === "void") return t;
    await sleep(500);
  }
  throw new Error(`tournament ${id} didn't finish`);
}

try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  await startServer();

  // ---- config, sign-in, balances
  const cfg = (await api("/api/arena/config", null)).json;
  check("config: on, the contract, the rules, potions and auras", cfg.on === true && cfg.contract === TRADERFLY && cfg.image === "https://img.test/{id}.png"
    && JSON.stringify(cfg.rules) === JSON.stringify(RULES) && cfg.potions.length === 4 && cfg.max_potions === 2 && cfg.auras.length === 6
    && cfg.auras[0].id === "ember" && cfg.auras[0].price === "25000" && JSON.stringify(cfg.split3) === "[6000,2500,1500]", JSON.stringify(cfg).slice(0, 200));
  check("no tournament yet", (await api("/api/arena/current", null)).json.tournament === null);
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  check("no session, no account", (await api("/api/arena/me", null)).status === 401);
  const a = await signIn(alice), b = await signIn(bob), c = await signIn(carol);
  const fund = (who: typeof alice, amount: bigint, tag: string) => PG.pg.run("insert into mine.ledger (wallet, order_id, kind, amount_wei, tx, at) values (?, null, 'deposit', ?, ?, ?)",
    who.address, (amount * WEI).toString(), "0x" + tag.repeat(32), Date.now());
  await fund(alice, 100_000n, "ab");
  await fund(bob, 3_000n, "cd");
  const balance = async (s: string) => Number((await api("/api/arena/me", s)).json.balance);
  const me0 = (await api("/api/arena/me", a)).json;
  check("me: the balance and the wallet's flies with their stats", me0.balance === "100000" && me0.flies.map((f: any) => f.fly).join() === "1,2,3,4"
    && JSON.stringify(me0.flies[0].stats) === JSON.stringify(statsOf(TRAITS.get(1)!)) && me0.flies[0].hp === maxHp(statsOf(TRAITS.get(1)!))
    && me0.flies[0].entered === false && me0.prizes.length === 0, JSON.stringify(me0).slice(0, 300));
  const fly7 = await api("/api/arena/flies/7", null), fly5 = await api("/api/arena/flies/5", null);
  check("a fly's card: traits, stats, record; none for a fly that isn't minted", fly7.status === 404 && fly5.status === 200 && JSON.stringify(fly5.json.traits) === JSON.stringify(TRAITS.get(5))
    && JSON.stringify(fly5.json.record) === JSON.stringify({ fights: 0, wins: 0, titles: 0 }) && fly5.json.aura === null, JSON.stringify(fly5.json));

  // ---- opening
  const enter = (s: string, body: object) => api("/api/arena/enter", s, { client_seed: "seed-1", ...body });
  check("nothing to enter before a tournament opens", (await enter(a, { fly: 1 })).status === 403 || (await enter(a, { fly: 1 })).status === 409);
  check("opening is the operator's", (await api("/api/admin/arena/open", null, {})).status === 403);
  check("a bad fee is refused", (await api("/api/admin/arena/open", null, { fee_bps: 6000 }, true)).status === 400);
  const opened = await api("/api/admin/arena/open", null, { name: "Test Cup", hours: 1 }, true);
  const T1 = opened.json.id as string;
  check("a tournament opens: the defaults, a commit, no seed", opened.status === 200 && opened.json.status === "open" && opened.json.name === "Test Cup" && opened.json.entry === "1000"
    && opened.json.potion_price === "400" && opened.json.fee_bps === 1000 && opened.json.min_entrants === 4 && opened.json.max_per_wallet === 3 && /^[0-9a-f]{64}$/.test(opened.json.commit_hash)
    && opened.json.server_seed === null && opened.json.pot === "0" && opened.json.entries.length === 0 && opened.json.closes_at - opened.json.opens_at === 3_600_000, JSON.stringify(opened.json).slice(0, 300));
  check("one tournament at a time", (await api("/api/admin/arena/open", null, {}, true)).status === 409);
  check("current shows it", (await api("/api/arena/current", null)).json.tournament.id === T1);

  // ---- entering
  check("no entry before the terms", (await enter(a, { fly: 1 })).status === 403);
  for (const s of [a, b, c]) await api("/api/roulette/terms", s, { over18: true, accept: true });
  check("someone else's fly", (await enter(a, { fly: 5 })).status === 403);
  check("a fly that isn't minted", (await enter(a, { fly: 7 })).status === 403);
  check("a fly number off the collection", (await enter(a, { fly: 11 })).status === 400 && (await enter(a, { fly: 0 })).status === 400);
  check("a bad client seed", (await enter(a, { fly: 1, client_seed: "no spaces" })).status === 400);
  check("bad potions", (await enter(a, { fly: 1, potions: ["hopium", "hopium"] })).status === 400 && (await enter(a, { fly: 1, potions: ["redbull"] })).status === 400
    && (await enter(a, { fly: 1, potions: ["hopium", "copium", "preworkout"] })).status === 400);
  check("an empty balance", (await enter(c, { fly: 8 })).status === 402);
  const e1 = await enter(a, { fly: 1, client_seed: "alice-1", potions: ["preworkout"] });
  check("an entry with a potion: 1,400 leaves the balance and joins the pot", e1.status === 200 && e1.json.pot === "1400" && e1.json.entries.length === 1 && e1.json.entries[0].fly === 1
    && e1.json.entries[0].wallet === alice.address && JSON.stringify(e1.json.entries[0].potions) === '["preworkout"]'
    && JSON.stringify(e1.json.entries[0].stats) === JSON.stringify(statsOf(TRAITS.get(1)!, ["preworkout"])) && e1.json.entries[0].client_seed === null
    && (await balance(a)) === 98_600, JSON.stringify(e1.json.entries));
  check("a fly enters once", (await enter(a, { fly: 1 })).status === 409);
  const pot1 = await api("/api/arena/potion", a, { fly: 1, potion: "copium" });
  check("a second potion later", pot1.status === 200 && pot1.json.pot === "1800" && JSON.stringify(pot1.json.entries[0].potions) === '["preworkout","copium"]' && (await balance(a)) === 98_200);
  check("the same potion twice, a third potion, someone else's fly, an unknown potion", (await api("/api/arena/potion", a, { fly: 1, potion: "copium" })).status === 409
    && (await api("/api/arena/potion", a, { fly: 1, potion: "hopium" })).status === 409 && (await api("/api/arena/potion", b, { fly: 1, potion: "hopium" })).status === 404
    && (await api("/api/arena/potion", a, { fly: 1, potion: "redbull" })).status === 400);
  await enter(a, { fly: 2, client_seed: "alice-2" });
  await enter(a, { fly: 3, client_seed: "alice-3" });
  const tooMany = await enter(a, { fly: 4, client_seed: "alice-4" });
  check("three flies a wallet", tooMany.status === 409 && /3 flies/.test(tooMany.json?.error ?? ""), JSON.stringify(tooMany.json));
  await enter(b, { fly: 5, client_seed: "bob-5" });
  const e5 = await enter(b, { fly: 6, client_seed: "bob-6", potions: ["hopium"] });
  check("five flies in, the pot is 6,200", e5.status === 200 && e5.json.entries.length === 5 && e5.json.pot === "6200" && e5.json.fee === "620" && e5.json.prize_pool === "5580"
    && (await balance(a)) === 96_200 && (await balance(b)) === 600, `pot ${e5.json?.pot}, alice ${await balance(a)}, bob ${await balance(b)}`);
  const meIn = (await api("/api/arena/me", a)).json;
  check("me: which flies are in, with their potions", meIn.flies.map((f: any) => f.entered).join() === "true,true,true,false" && JSON.stringify(meIn.flies[0].potions) === '["preworkout","copium"]');
  const ledger = async (like: string) => PG.pg.all<{ wallet: string; kind: string; amount_wei: string; tx: string }>("select wallet, kind, amount_wei, tx from mine.ledger where tx like ? order by id", like);
  const rows1 = await ledger(`arena%:${T1}:%`);
  check("the ledger: an entry and a row per potion", rows1.length === 8 && rows1.every((r) => r.kind === "bet")
    && rows1.filter((r) => r.tx.startsWith("arena:")).length === 5 && rows1.filter((r) => r.tx.startsWith("arena-potion:")).length === 3);
  check("no fights to see while it's open", (await api(`/api/arena/tournaments/${T1}/fights/0/0`, null)).status === 409 && e5.json.matches.length === 0);

  // ---- the fights
  check("closing is the operator's", (await api("/api/admin/arena/close", null, { id: T1 })).status === 403);
  const closed = await api("/api/admin/arena/close", null, { id: T1 }, true);
  check("registration closes: running, the entries' hash fixed, still no seed and no fights", closed.status === 200 && closed.json.status === "running" && /^[0-9a-f]{64}$/.test(closed.json.digest)
    && closed.json.server_seed === null && closed.json.matches.length === 0 && closed.json.progress.fights === 5, JSON.stringify(closed.json).slice(0, 200));
  check("no entries once it's closed", (await enter(a, { fly: 4 })).status === 409 && (await api("/api/arena/potion", a, { fly: 2, potion: "hopium" })).status === 409);
  const t1 = await finished(T1);
  check("the tournament finishes: a podium of three, every fight shown", t1.status === "done" && t1.places.length === 3 && new Set(t1.places).size === 3 && t1.rounds === 3
    && t1.matches.filter((m: any) => m.b !== null).length === 5 && t1.matches.filter((m: any) => m.b === null).length === 3 && t1.matches.some((m: any) => m.round === BRONZE),
    `places ${t1.places}, ${t1.matches.length} matches`);
  check("the server seed is revealed and matches the commit", !!t1.server_seed && sha256hex(t1.server_seed) === t1.commit_hash);
  check("the entries' hash follows from the revealed client seeds", t1.digest === await entriesDigest(t1.entries.map((e: any) => ({ fly: e.fly, clientSeed: e.client_seed }))));
  const again = await replay(t1);
  const servedFights = [];
  for (const m of t1.matches) {
    const f = (await api(`/api/arena/tournaments/${T1}/fights/${m.round}/${m.slot}`, null)).json;
    servedFights.push({ round: f.round, slot: f.slot, a: f.a.fly, b: f.b?.fly ?? null, winner: f.winner, how: f.how, seeds: f.seeds, events: f.events });
  }
  const key = (m: { round: number; slot: number }) => m.round * 10_000 + m.slot;
  check("the revealed seeds replay to exactly the served fights and podium", JSON.stringify(servedFights) === JSON.stringify([...again.matches].sort((x, y) => key(x) - key(y)))
    && JSON.stringify(t1.places) === JSON.stringify(again.places), `${servedFights.length} fights`);
  const final = servedFights.find((m) => m.round === 2)!;
  check("a fight is rounds, then the winner", final.events.at(-1).type === "end" && final.events.slice(0, -1).every((e: FightEvent, k: number) => e.type === "round" && e.round === k)
    && t1.matches.find((m: any) => m.round === 2).rounds === final.events.length - 1 && final.winner === t1.places[0]);

  // ---- prizes
  const prize = (place: number) => t1.entries.find((e: any) => e.place === place);
  check("prizes: 60 / 25 / 15 of the pot after the 10% fee", t1.fee === "620" && prize(1).prize === "3348" && prize(2).prize === "1395" && prize(3).prize === "837"
    && prize(1).fly === t1.places[0] && t1.entries.filter((e: any) => e.place === null).every((e: any) => e.prize === null), JSON.stringify(t1.entries.map((e: any) => [e.fly, e.place, e.prize])));
  const owed = (who: typeof alice) => t1.entries.filter((e: any) => e.wallet === who.address && e.prize).reduce((s: number, e: any) => s + Number(e.prize), 0);
  const before = { a: await balance(a), b: await balance(b) };
  check("nothing is paid before the claim", before.a === 96_200 && before.b === 600 && (await api("/api/arena/me", a)).json.prizes.length === t1.entries.filter((e: any) => e.wallet === alice.address && e.prize).length);
  for (const [s, who, was] of [[a, alice, before.a], [b, bob, before.b]] as const) {
    const due = owed(who);
    const r = await api("/api/arena/claim", s, { tournament: T1 });
    check(`${who === alice ? "alice" : "bob"} claims ${due}`, due > 0 ? r.status === 200 && r.json.claimed === String(due) && (await balance(s)) === was + due : r.status === 404, JSON.stringify(r.json));
    check("a claim pays once", (await api("/api/arena/claim", s, {})).status === 404 && (await balance(s)) === was + due);
  }
  const paid = await ledger(`arena-prize:${T1}:%`);
  check("the ledger: a payout per prize, the fee left with the house", paid.length === 3 && paid.every((r) => r.kind === "payout")
    && paid.reduce((s, r) => s + BigInt(r.amount_wei), 0n) === 5580n * WEI && (await api(`/api/arena/tournaments/${T1}`, null)).json.entries.every((e: any) => e.prize === null || e.claimed));
  const champ = (await api(`/api/arena/flies/${t1.places[0]}`, null)).json.record;
  check("the champion's record", champ.titles === 1 && champ.wins === champ.fights && champ.fights >= 2, JSON.stringify(champ));

  // ---- too few flies: void and paid back
  const o2 = await api("/api/admin/arena/open", null, { entry: "500", potion_price: "100", min_entrants: 4 }, true);
  const T2 = o2.json.id as string;
  check("the next tournament names itself", o2.status === 200 && o2.json.name === "Season 2" && o2.json.season === 2 && o2.json.entry === "500");
  const was2 = await balance(a);
  await enter(a, { fly: 1, client_seed: "x", potions: ["hopium"] });
  await enter(a, { fly: 2, client_seed: "y" });
  check("two flies in", (await balance(a)) === was2 - 1100);
  await api("/api/admin/arena/close", null, { id: T2 }, true);
  const t2 = await finished(T2);
  const back = await ledger(`arena-refund:${T2}:%`);
  check("too few flies: void, every entry and potion paid back once", t2.status === "void" && t2.matches.length === 0 && t2.places === null && (await balance(a)) === was2
    && back.length === 2 && back.every((r) => r.kind === "payout") && !!t2.server_seed, `status ${t2.status}, balance ${await balance(a)} (want ${was2})`);

  // ---- called off by the operator
  const o3 = await api("/api/admin/arena/open", null, { min_entrants: 2 }, true);
  await enter(a, { fly: 1, client_seed: "x" });
  const off = await api("/api/admin/arena/close", null, { id: o3.json.id, cancel: true }, true);
  check("a tournament called off pays back too", off.status === 200 && off.json.status === "void" && (await balance(a)) === was2);

  // ---- a restart in the middle of a tournament
  await fund(carol, 10_000n, "ef");
  const o4 = await api("/api/admin/arena/open", null, { min_entrants: 2, fee_bps: 2000 }, true);
  const T4 = o4.json.id as string;
  await enter(a, { fly: 1, client_seed: "r1" });
  await enter(a, { fly: 2, client_seed: "r2" });
  await enter(a, { fly: 4, client_seed: "r4", potions: ["bubblewrap", "copium"] });
  await enter(c, { fly: 8, client_seed: "r8" });
  await enter(c, { fly: 9, client_seed: "r9" });
  await enter(c, { fly: 10, client_seed: "r10" });
  await api("/api/admin/arena/close", null, { id: T4 }, true);
  let stored = 0;
  for (let i = 0; i < 1200; i++) {
    stored = (await PG.pg.one<{ n: number }>("select count(*) as n from mine.arena_matches where tournament = ? and b is not null", T4))!.n;
    if (stored >= 1) break;
    await sleep(100);
  }
  await stopServer();
  const mid = (await PG.pg.one<{ status: string }>("select status from mine.arena_tournaments where id = ?", T4))!.status;
  await startServer();
  const t4 = await finished(T4);
  const again4 = await replay(t4);
  const stored4 = (await PG.pg.all<any>("select round, slot, a, b, winner, how, seeds, events from mine.arena_matches where tournament = ? order by round, slot", T4))
    .map((m) => ({ ...m, seeds: m.seeds ? JSON.parse(m.seeds) : null, events: JSON.parse(m.events) }));
  check("after a restart the tournament plays on from its seeds", stored >= 1 && stored < 6 && mid === "running" && t4.status === "done" && t4.matches.filter((m: any) => m.b !== null).length === 6,
    `${stored} fights before the restart, was ${mid}`);
  check("and it's the same tournament the seeds give", JSON.stringify(stored4) === JSON.stringify([...again4.matches].sort((x, y) => key(x) - key(y))) && JSON.stringify(t4.places) === JSON.stringify(again4.places));
  check("20% fee: prizes and fee add up to the pot", t4.pot === "6800" && t4.fee === "1360" && t4.entries.reduce((s: number, e: any) => s + Number(e.prize ?? 0), 0) === 5440);

  // ---- auras
  const wasAura = await balance(a);
  check("an aura for someone else's fly", (await api("/api/arena/aura", a, { fly: 5, aura: "ember" })).status === 403);
  check("an aura that doesn't exist", (await api("/api/arena/aura", a, { fly: 1, aura: "rainbow" })).status === 400);
  check("an aura the balance can't pay", (await api("/api/arena/aura", b, { fly: 5, aura: "cosmic" })).status === 402);
  const au = await api("/api/arena/aura", a, { fly: 1, aura: "ember" });
  check("an aura bought: paid, on the fly, worn", au.status === 200 && au.json.aura === "ember" && JSON.stringify(au.json.auras) === '["ember"]' && (await balance(a)) === wasAura - 25_000
    && (await ledger("arena-aura:1:ember")).length === 1, JSON.stringify(au.json));
  check("an aura is bought once", (await api("/api/arena/aura", a, { fly: 1, aura: "ember" })).status === 409);
  check("taking it off and putting it on", (await api("/api/arena/wear", a, { fly: 1, aura: null })).json.aura === null && (await api("/api/arena/wear", a, { fly: 1, aura: "ember" })).json.aura === "ember"
    && (await api("/api/arena/wear", a, { fly: 1, aura: "frost" })).status === 404 && (await api("/api/arena/wear", b, { fly: 1, aura: null })).status === 403);
  check("the aura shows on the fly in a tournament", (await api(`/api/arena/tournaments/${T4}`, null)).json.entries.find((e: any) => e.fly === 1).aura === "ember"
    && (await api("/api/arena/me", a)).json.flies[0].aura === "ember");
  // the fly changes hands: the aura goes with it
  OWNER.set(1, bob.address);
  await sleep(1200);
  check("a sold fly keeps its aura, and its new owner wears it", (await api("/api/arena/me", b)).json.flies.find((f: any) => f.fly === 1)?.aura === "ember"
    && (await api("/api/arena/wear", b, { fly: 1, aura: null })).status === 200 && (await api("/api/arena/wear", a, { fly: 1, aura: "ember" })).status === 403);

  // ---- the operator's view, the list and the off switch
  const adm = await api("/api/admin/arena", null, undefined, true);
  check("admin: fees, auras sold, prizes not yet claimed", adm.status === 200 && adm.json.on === true && adm.json.live === null && adm.json.tournaments_done === 2
    && adm.json.fees_all === "1980" && adm.json.auras_sold === "25000" && adm.json.prizes_unclaimed === "5440", JSON.stringify(adm.json));
  check("admin is admin only", (await api("/api/admin/arena", null)).status === 403);
  const aurasAll = (await api("/api/arena/auras", null)).json.auras;
  check("every fly's auras in one call: owned ones, what is worn, none for flies without", aurasAll["1"]?.owned.join() === "ember" && (aurasAll["1"].worn === "ember" || aurasAll["1"].worn === null) && aurasAll["2"] === undefined, JSON.stringify(aurasAll));
  const all = (await api("/api/arena/tournaments", null)).json.tournaments;
  check("the list, newest first", all.length === 4 && all[0].id === T4 && all[3].id === T1 && all.map((t: any) => t.status).join() === "done,void,void,done" && all[0].entrants === 6);

  // ---- the record on chain: commits in order, reveals with the real seed, and every fight proven against the posted root
  await sleep(2500);   // the server posts on its ticks
  const seasons = [...all].reverse();       // oldest first
  check("seasons are numbered 1, 2, 3, 4 in the order they opened", seasons.map((t: any) => t.season).join() === "1,2,3,4");
  check("every season was committed on chain, in order, with its own commit and closing time",
    posts.filter((p) => p.kind === "commit").map((p) => p.season).join() === "1,2,3,4"
    && seasons.every((t: any, i: number) => posts.find((p) => p.kind === "commit" && p.season === i + 1)?.commit === t.commit_hash && posts.find((p) => p.kind === "commit" && p.season === i + 1)?.closesAt === Math.floor(t.closes_at / 1000)),
    JSON.stringify(posts.map((p) => `${p.kind}${p.season}`)));
  check("only finished seasons were revealed, once each", posts.filter((p) => p.kind === "reveal").map((p) => p.season).sort().join() === "1,4" && seasons.filter((t: any) => t.chain?.result_tx).map((t: any) => t.season).join() === "1,4"
    && seasons.every((t: any) => !!t.chain?.commit_tx));
  for (const t of seasons.filter((x: any) => x.status === "done")) {
    const full = (await api(`/api/arena/tournaments/${t.id}`, null)).json;
    const reveal = posts.find((p) => p.kind === "reveal" && p.season === t.season)!;
    const fights = full.matches.filter((m: any) => m.b !== null);
    let proofs = true, forged = false;
    const roots = new Set<string>();
    for (const m of fights) {
      const f = (await api(`/api/arena/tournaments/${t.id}/fights/${m.round}/${m.slot}`, null)).json;
      const leaf = fightLeaf({ season: t.season, round: m.round, slot: m.slot, a: f.a.fly, b: f.b.fly, winner: f.winner, events: JSON.stringify(f.events) });
      roots.add(f.chain.root);
      if (leaf !== f.chain.leaf || !verify(leaf, f.chain.proof, f.chain.root)) proofs = false;
      // the other side as winner is another leaf, and the proof doesn't carry it
      const other = fightLeaf({ season: t.season, round: m.round, slot: m.slot, a: f.a.fly, b: f.b.fly, winner: f.winner === f.a.fly ? f.b.fly : f.a.fly, events: JSON.stringify(f.events) });
      if (verify(other, f.chain.proof, f.chain.root)) forged = true;
    }
    check(`season ${t.season}: the reveal has the seed, the entries and the podium`, reveal.seed === full.server_seed && sha256hex(reveal.seed!) === full.commit_hash && reveal.entrants === full.entrants
      && reveal.digest === full.digest && reveal.places!.join() === full.places.map((x: number | null) => x ?? 0).join(), JSON.stringify(reveal).slice(0, 160));
    check(`season ${t.season}: all ${fights.length} fights verify against the one posted root, a swapped winner doesn't`, proofs && !forged && roots.size === 1 && roots.has(reveal.root!) && full.chain.results_root === reveal.root);
  }
  check("a season's leaves rebuild to the same root", (() => { const l = ["a", "b", "c"].map((e, i) => fightLeaf({ season: 1, round: 0, slot: i, a: 1, b: 2, winner: 1, events: e })); const m = merkle(l); return m.proofs.every((pr, i) => verify(l[i], pr, m.root)); })());
  // ---- the house fee goes to the dev wallet, once per finished season
  const feeSeasons = seasons.filter((t: any) => t.status === "done");
  const fees = transfers.filter((x) => x.to.toLowerCase() === FEE_TO.toLowerCase());
  check("each finished season's house fee was sent to the fee wallet, once, and only those", fees.length === feeSeasons.length && transfers.length === fees.length
    && fees.reduce((n, x) => n + x.amount, 0n) === feeSeasons.reduce((n: bigint, t: any) => n + BigInt(Math.round(Number(t.fee))) * WEI, 0n)
    && feeSeasons.every((t: any) => typeof t.fee_tx === "string" && t.fee_tx.startsWith("0x") && t.fee_to === FEE_TO) && seasons.filter((t: any) => t.status !== "done").every((t: any) => t.fee_tx === null),
    JSON.stringify(fees.map((x) => x.amount.toString())));
  check("an unknown tournament or fight", (await api("/api/arena/tournaments/00000000-0000-0000-0000-000000000000", null)).status === 404
    && (await api(`/api/arena/tournaments/${T1}/fights/9/0`, null)).status === 404);
  await stopServer();
  await startServer({ ARENA_ON: "0" });
  check("off means off", (await api("/api/arena/config", null)).json.on === false && (await api("/api/admin/arena/open", null, {}, true)).status === 503
    && (await enter(a, { fly: 2 })).status === 503);
  check("results and claims still work when it's off", (await api(`/api/arena/tournaments/${T1}`, null)).json.status === "done" && (await api("/api/arena/claim", a, { tournament: T4 })).status !== 503);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stopServer();
  await PG.stop();
  chain.close();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
