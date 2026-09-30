/**
 * Fly Colosseum's rules, the one copy everything plays by: the tournament on the server (mine/src/arena.worker.ts),
 * sparring in the page and the page's Verify replay of a tournament fight.
 *
 * A fight is two Trader Flies and up to RULES.rounds rounds. In every round each fly smells its rival (the round's
 * scent) and sees it charge (a looming shape, bigger the harder the rival charged in the round before and the more
 * squarely it comes, the round's view), and its own brain answers: we count its charge spikes and its escape spikes over a short window (readout.ts runRound). Then,
 * for each fly, with its stats in points (stats.ts, worked out from its traits):
 *
 *   hit    = charge spikes x 2 x (1 + 0.25% x Power) x (1 + 0.5% x Fury, only while it is below half its HP)
 *   block  = escape spikes x 0.8 x (1 + 0.6% x Guard)
 *   damage to the rival = hit - the rival's block, rounded, never below 0
 *
 * Both flies hit at once. A fly starts with 200 HP + 1 per point of Vitality (the numbers are RULES, below: the
 * stats are weighted so a point of any of them is worth about the same, tools/arena.ts --balance). The fight ends when a fly has none left
 * (a knockout; if both go down in the same round the one with more HP left wins), or after the last round on
 * points: the bigger share of its own HP left wins. Anything still equal is settled by a drawn key, never by side.
 *
 * All chance in a fight comes from one generator seeded with sha256(serverSeed:digest:label) (fightRng), drawn in
 * this order (the order is part of the rules):
 *   setupFight: 2 brain seeds (each fly's neural noise), side 0 first;
 *   playFight:  before each round, one scent per fly, side 0 first (uniform in [scentMin, scentMax]), then one
 *               view per fly, side 0 first (uniform in [viewMin, viewMax]);
 *               at the end, one tie-break key per fly, side 0 first.
 * Given the seeds and the two flies' stats the whole fight is fixed, so a revealed server seed lets anyone replay it.
 *
 * Fairness by symmetry: two flies with the same stats are exchangeable (independent brain seeds, independent scents
 * from the same range, the same brain code, a drawn tie-break), so each wins half the time whichever side it is on.
 * What tilts a fight is the stats, and those are public before anyone enters.
 *
 * A tournament is single elimination. Its server seed is committed (sha256) when registration opens; every entry
 * brings a client seed, and `digest` is the hash of all entries (entriesDigest), fixed when registration closes. The
 * bracket is a shuffle drawn from fightRng("bracket"): with fewer entrants than the bracket has seats, the first
 * entrants of the shuffle get a bye in round 0. The two beaten semi-finalists fight for 3rd place ("bronze").
 * (mine/src/arenatest.ts checks all of this with a stand-in brain, and replays served fights on the real one.)
 */
import { deriveRng, sfc32, sha256Hex } from "../roulette/game.ts";
import type { Counts } from "./readout.ts";
import type { Stats } from "./stats.ts";

export { deriveRng, sfc32, sha256Hex };

export const RULES = {
  rounds: 10,
  /** the rival's smell each round: the voltage per step on the pheromone ORNs (readout.ts) */
  scentMin: 0.04, scentMax: 0.2,
  /** how big the charging rival looms: (loomBase + loomPerSpike x its charge spikes of the round before) x view, up to loomMax */
  loomBase: 0.02, loomPerSpike: 0.002, loomMax: 0.16,
  /** how squarely the fly sees the charge coming this round */
  viewMin: 0.5, viewMax: 1.5,
  hp: 200, hpPerVit: 1,
  /** HP per spike in basis points (1/10000) at 0 points: what a charge spike hits for and an escape spike blocks */
  hitBp: 20000, blockBp: 8000,
  /** basis points per point: Power on the hit, Guard on the block, Fury on the hit while below half HP */
  powBp: 25, grdBp: 60, furyBp: 50,
};
export type Rules = typeof RULES;

export const maxHp = (s: Stats, rules: Rules = RULES) => rules.hp + rules.hpPerVit * s.vit;

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export interface Fight { seeds: [number, number] }

/** Each fly's brain seed. Draw order is part of the rules. */
export function setupFight(rng: () => number): Fight {
  const seed = () => Math.floor(rng() * 4294967296) >>> 0;
  const a = seed(), b = seed();
  return { seeds: [a, b] };
}

type Pair<T> = [T, T];
export interface RoundEvent {
  type: "round";
  round: number;
  /** what each fly smelled and saw */
  scent: Pair<number>;
  view: Pair<number>;
  loom: Pair<number>;
  /** each fly's spikes this round */
  charge: Pair<number>;
  escape: Pair<number>;
  /** below half its HP when the round began */
  fury: Pair<boolean>;
  /** each fly's hit and block, before rounding */
  hit: Pair<number>;
  block: Pair<number>;
  /** damage each fly dealt to the other */
  dealt: Pair<number>;
  /** HP left after the round (can be below 0 on a knockout) */
  hp: Pair<number>;
}
export type How = "ko" | "points" | "coin";
export interface EndEvent { type: "end"; winner: 0 | 1; how: How; rounds: number }
export type FightEvent = RoundEvent | EndEvent;

/** runs one fly's brain for one round and returns its spike counts (may be async) */
export type RoundBrain = (side: 0 | 1, round: number, scent: number, loom: number) => Counts | Promise<Counts>;

/**
 * Plays a fight to the end. `brain` runs one fly's brain for one round (a worker, the server's queue); side 0 runs
 * first within a round. Yields every round, then the winner.
 */
export async function* playFight(stats: Pair<Stats>, rng: () => number, brain: RoundBrain, rules: Rules = RULES): AsyncGenerator<FightEvent> {
  const max: Pair<number> = [maxHp(stats[0], rules), maxHp(stats[1], rules)];
  const hp: Pair<number> = [max[0], max[1]];
  let last: Pair<number> = [0, 0];                 // each fly's charge spikes in the round before
  let rounds = 0;
  for (let round = 0; round < rules.rounds; round++) {
    const scent: Pair<number> = [0, 0];
    for (const i of [0, 1]) scent[i] = r4(rules.scentMin + (rules.scentMax - rules.scentMin) * rng());
    const view: Pair<number> = [0, 0];
    for (const i of [0, 1]) view[i] = r4(rules.viewMin + (rules.viewMax - rules.viewMin) * rng());
    const loom = [0, 1].map((i) => r4(Math.min(rules.loomMax, (rules.loomBase + rules.loomPerSpike * last[1 - i]) * view[i]))) as Pair<number>;
    const fury = [0, 1].map((i) => hp[i] * 2 < max[i]) as Pair<boolean>;
    const n0 = await brain(0, round, scent[0], loom[0]);
    const n1 = await brain(1, round, scent[1], loom[1]);
    const n = [n0, n1];
    // whole numbers of 1e-12 HP (far below 2^53), so the sums are exact in every engine
    const hit = [0, 1].map((i) => n[i].charge * rules.hitBp * (10000 + rules.powBp * stats[i].pow) * (fury[i] ? 10000 + rules.furyBp * stats[i].fury : 10000));
    const block = [0, 1].map((i) => n[i].escape * rules.blockBp * (10000 + rules.grdBp * stats[i].grd) * 10000);
    const dealt = [0, 1].map((i) => Math.max(0, Math.round((hit[i] - block[1 - i]) / 1e12))) as Pair<number>;
    hp[0] -= dealt[1];
    hp[1] -= dealt[0];
    last = [n0.charge, n1.charge];
    rounds = round + 1;
    yield {
      type: "round", round, scent, view, loom, charge: [n0.charge, n1.charge], escape: [n0.escape, n1.escape], fury,
      hit: hit.map((x) => x / 1e12) as Pair<number>, block: block.map((x) => x / 1e12) as Pair<number>, dealt, hp: [hp[0], hp[1]],
    };
    if (hp[0] <= 0 || hp[1] <= 0) break;
  }
  const key = [rng(), rng()];
  const coin = (): 0 | 1 => (key[0] < key[1] ? 0 : 1);
  let winner: 0 | 1, how: How;
  if (hp[0] <= 0 || hp[1] <= 0) {
    how = hp[0] === hp[1] ? "coin" : "ko";
    winner = hp[0] === hp[1] ? coin() : hp[0] > hp[1] ? 0 : 1;
  } else {
    // the share of its own HP each has left, compared without dividing
    const x = hp[0] * max[1], y = hp[1] * max[0];
    how = x === y ? "coin" : "points";
    winner = x === y ? coin() : x > y ? 0 : 1;
  }
  yield { type: "end", winner, how, rounds };
}

// ---- the tournament ---------------------------------------------------------------------------------------

/** the round number of the 3rd-place fight (rounds count from 0; the final is the last of them) */
export const BRONZE = -1;
export const fightLabel = (round: number, slot: number) => (round === BRONZE ? "bronze" : `${round}:${slot}`);

/** The hash of every entry, fixed when registration closes: fly ids in rising order, each with its client seed. */
export const entriesDigest = (entries: { fly: number; clientSeed: string }[]) =>
  sha256Hex([...entries].sort((a, b) => a.fly - b.fly).map((e) => `${e.fly}:${e.clientSeed}`).join("|"));

/** The generator of one draw of a tournament: the bracket ("bracket") or a fight (fightLabel). */
export const fightRng = (serverSeed: string, digest: string, label: string) => deriveRng(serverSeed, `${digest}:${label}`);

/** how many rounds a field of n needs (2 -> 1, 3..4 -> 2, 5..8 -> 3) */
export const roundsFor = (n: number) => Math.max(1, Math.ceil(Math.log2(n)));

/**
 * Round 0 of the bracket: the fly ids shuffled (Fisher-Yates from the end, one draw per step), then seated. With
 * byes = seats - entrants, the first `byes` flies of the shuffle sit alone (b = null) and go through; the rest pair up
 * in order.
 */
export function drawBracket(flies: number[], rng: () => number): [number, number | null][] {
  if (flies.length < 2) throw new Error("a tournament needs two flies");
  const order = [...flies].sort((a, b) => a - b);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const seats = 2 ** roundsFor(order.length), byes = seats - order.length;
  const out: [number, number | null][] = [];
  for (let i = 0; i < byes; i++) out.push([order[i], null]);
  for (let i = byes; i < order.length; i += 2) out.push([order[i], order[i + 1]]);
  return out;
}

export interface Match {
  round: number;
  slot: number;
  a: number;
  /** null: a bye, `a` goes through without a fight */
  b: number | null;
  winner: number;
  how: How | "bye";
  /** the fight's brain seeds and events; empty for a bye */
  seeds: [number, number] | null;
  events: FightEvent[];
}
export interface Podium { type: "podium"; places: [number, number, number | null] }

/** One fight of a tournament from its seeds: `brainFor` makes a fly's brain for this fight from its brain seed. */
export async function runFight(serverSeed: string, digest: string, label: string, stats: Pair<Stats>,
  brainFor: (seed: number, side: 0 | 1) => (scent: number, loom: number) => Counts | Promise<Counts>, rules: Rules = RULES,
): Promise<{ seeds: [number, number]; events: FightEvent[] }> {
  const rng = await fightRng(serverSeed, digest, label);
  const { seeds } = setupFight(rng);
  const brains = [brainFor(seeds[0], 0), brainFor(seeds[1], 1)];
  const events: FightEvent[] = [];
  for await (const e of playFight(stats, rng, (side, _round, scent, loom) => brains[side](scent, loom), rules)) events.push(e);
  return { seeds, events };
}

/**
 * Plays a whole tournament: every round in slot order, then the bronze fight, then the final, then the podium.
 * `fight` plays one fight (runFight with the caller's brains) and returns its seeds and events.
 */
export async function* playTournament(flies: number[], serverSeed: string, digest: string,
  fight: (label: string, a: number, b: number) => Promise<{ seeds: [number, number]; events: FightEvent[] }>,
): AsyncGenerator<({ type: "match" } & Match) | Podium> {
  let pairs = drawBracket(flies, await fightRng(serverSeed, digest, "bracket"));
  const rounds = roundsFor(flies.length);
  const play = async (round: number, slot: number, a: number, b: number | null): Promise<Match> => {
    if (b === null) return { round, slot, a, b, winner: a, how: "bye", seeds: null, events: [] };
    const { seeds, events } = await fight(fightLabel(round, slot), a, b);
    const end = events[events.length - 1] as EndEvent;
    return { round, slot, a, b, winner: end.winner === 0 ? a : b, how: end.how, seeds, events };
  };
  let semiLosers: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const final = round === rounds - 1;
    if (final && semiLosers.length === 2) {
      const bronze = await play(BRONZE, 0, semiLosers[0], semiLosers[1]);
      yield { type: "match", ...bronze };
      semiLosers = [bronze.winner];
    }
    const winners: number[] = [], losers: number[] = [];
    for (let slot = 0; slot < pairs.length; slot++) {
      const m = await play(round, slot, pairs[slot][0], pairs[slot][1]);
      yield { type: "match", ...m };
      winners.push(m.winner);
      if (m.b !== null) losers.push(m.winner === m.a ? m.b : m.a);
    }
    if (final) {
      yield { type: "podium", places: [winners[0], losers[0], semiLosers[0] ?? null] };
      return;
    }
    if (round === rounds - 2) semiLosers = losers;
    pairs = [];
    for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
  }
}

// ---- the pot ----------------------------------------------------------------------------------------------

/** the prize shares of 1st, 2nd and 3rd in basis points of the pot after the fee; with no 3rd place, of 1st and 2nd */
export const SPLIT3 = [6000, 2500, 1500], SPLIT2 = [7000, 3000];

/** The fee and each place's prize. What rounding leaves over goes to 1st, so fee + prizes is exactly the pot. */
export function prizes(pot: bigint, feeBps: number, places: 2 | 3): { fee: bigint; prizes: bigint[] } {
  const fee = (pot * BigInt(feeBps)) / 10_000n;
  const rest = pot - fee;
  const out = (places === 3 ? SPLIT3 : SPLIT2).map((bps) => (rest * BigInt(bps)) / 10_000n);
  out[0] += rest - out.reduce((s, x) => s + x, 0n);
  return { fee, prizes: out };
}
