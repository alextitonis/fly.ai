/**
 * Fly Race's rules, the one copy everything plays by: free play in the page, bet races on the server
 * (mine/src/race.worker.ts) and the page's Verify replay of a bet race.
 *
 * Six flies race down six lanes towards fruit. The race has LEGS legs; in each leg every fly smells its lane's
 * fruit (the lane's odour for that leg, plus a small whiff of plume noise of its own) and its own brain answers:
 * we count its odour-driven descending spikes over a short window (readout.ts runLeg), and the fly moves
 * distanceFor(spikes) = 7/16 x spikes along the track. The first to reach TRACK wins.
 *
 * All chance comes from one generator seeded with sha256(serverSeed:clientSeed), drawn in this order (the order is
 * part of the rules):
 *   setupRace: 6 names (which fly runs in which lane), 6 brain seeds (each fly's neural noise), then the odour of
 *              every lane for every leg, leg by leg (odour[leg][lane], uniform in [ODOUR_MIN, ODOUR_MAX]);
 *   playRace:  before each leg, one plume draw per lane, lane 0 first (uniform in +-PLUME);
 *              at the end, one tie-break key per lane, lane 0 first.
 * Given the two seeds the whole race is fixed, so a revealed server seed lets anyone replay it.
 *
 * Finishing order: a fly that crosses the line in an earlier leg is ahead; two that cross in the same leg are
 * ordered by the share of that leg they needed ((TRACK - position before) / moved, compared exactly); flies that
 * never cross are ordered by distance. Anything still equal is settled by the tie-break keys, never by lane.
 *
 * Fairness by symmetry: the lanes are exchangeable. Every lane gets an independent brain seed, independent odour
 * draws from the same range and independent plume draws, the same brain code runs every lane, which fly runs in
 * which lane is a random draw, and ties go to a random key. Nothing in the rules looks at the lane number, so
 * every ordering of lanes is equally likely: each lane finishes 1st with probability exactly 1/6 and in the top 3
 * with probability exactly 1/2, whichever lane a player backs. A "win" bet pays 6 x (1 - edge) and a "podium" bet
 * 2 x (1 - edge) (stake included), so the house keeps `edge` on average and nothing more.
 * (mine/src/racetest.ts checks this over many seeds with a stand-in brain.)
 */
import { deriveRng, sfc32, sha256Hex } from "../roulette/game.ts";
import { distanceFor } from "./readout.ts";

export { deriveRng, sfc32, sha256Hex };

export const LANES = 6, LEGS = 5, TRACK = 100;
/** a lane's fruit smell per leg: the voltage per step on the fruit ORNs (readout.ts) */
export const ODOUR_MIN = 0.06, ODOUR_MAX = 0.3;
/** each fly's own whiff of the plume, added to its lane's odour each leg */
export const PLUME = 0.02;

export const NAMES = ["Buzzy", "Sir Buzzalot", "Lil' Wing", "Big Stinky", "Captain Compound", "Fruit Loop", "Zzzack",
  "Maggie Maggot", "Hoverboi", "Dr. Proboscis", "Six Legs Sally", "Banana Joe", "Swatless", "Wingston", "Larva Lou",
  "Count Buzzula", "Flyonce", "Tiny Rick", "Mr. Bristles", "Spud"];

export type BetType = "win" | "podium";
export const BET_TYPES: BetType[] = ["win", "podium"];
/** what a winning bet pays per token staked, before the house edge: multiply by (1 - edge) */
export const MULT: Record<BetType, number> = { win: 6, podium: 2 };
/** how many places a bet type covers */
export const PLACES: Record<BetType, number> = { win: 1, podium: 3 };

/** Did a `bet` on lane `pick` win, given the finishing order (lanes, 1st first)? */
export const betWon = (bet: BetType, pick: number, order: number[]) => order.slice(0, PLACES[bet]).includes(pick);
/** The payout multiplier with the house edge, e.g. 5.7 for "win" at edge 0.05. */
export const multiplier = (bet: BetType, edge: number) => Number((MULT[bet] * (1 - edge)).toFixed(4));

const int = (rng: () => number, n: number) => Math.floor(rng() * n);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export interface Race {
  /** the fly in each lane */
  names: string[];
  /** each lane's brain seed */
  seeds: number[];
  /** odour[leg][lane]: the fruit smell down each lane in each leg */
  odour: number[][];
}

/** Who runs where and what each lane smells. Draw order is part of the rules. */
export function setupRace(rng: () => number): Race {
  const pool = [...NAMES];
  const names: string[] = [];
  for (let i = 0; i < LANES; i++) names.push(pool.splice(int(rng, pool.length), 1)[0]);
  const seeds = names.map(() => Math.floor(rng() * 4294967296) >>> 0);
  const odour: number[][] = [];
  for (let leg = 0; leg < LEGS; leg++) {
    const row: number[] = [];
    for (let lane = 0; lane < LANES; lane++) row.push(r4(ODOUR_MIN + (ODOUR_MAX - ODOUR_MIN) * rng()));
    odour.push(row);
  }
  return { names, seeds, odour };
}

export interface LegEvent {
  type: "leg";
  leg: number;
  /** each lane's odour-driven descending spikes this leg */
  spikes: number[];
  /** distance each lane covered this leg (distanceFor(spikes)) */
  moved: number[];
  /** each lane's distance so far, capped at TRACK */
  positions: number[];
}
export interface EndEvent {
  type: "end";
  /** lanes in finishing order, 1st first */
  order: number[];
  winner: number;
}
export type RaceEvent = LegEvent | EndEvent;

/** runs one lane's brain for one leg at this odour intensity and returns its spike count (may be async) */
export type LegBrain = (lane: number, leg: number, intensity: number) => number | Promise<number>;

/**
 * Plays a race to the end. `legBrain` runs one fly's brain for one leg (a worker, the server's queue); lanes run
 * lane 0 first within a leg. `distance` turns spikes into track units (readout.ts distanceFor). Yields every leg,
 * then the finishing order. The race stops early once every fly has crossed the line.
 */
export async function* playRace(race: Race, rng: () => number, legBrain: LegBrain,
  distance: (spikes: number) => number = distanceFor): AsyncGenerator<RaceEvent> {
  const pos = new Array<number>(LANES).fill(0);
  // where each fly crossed: the leg, and the share of it needed as need/moved
  const doneLeg = new Array<number>(LANES).fill(Infinity);
  const need = new Array<number>(LANES).fill(0), took = new Array<number>(LANES).fill(1);
  for (let leg = 0; leg < LEGS; leg++) {
    const plume: number[] = [];
    for (let lane = 0; lane < LANES; lane++) plume.push(r4(PLUME * (2 * rng() - 1)));
    const spikes: number[] = [], moved: number[] = [];
    for (let lane = 0; lane < LANES; lane++) {
      const s = await legBrain(lane, leg, r4(race.odour[leg][lane] + plume[lane]));
      spikes.push(s);
      moved.push(distance(s));
    }
    for (let lane = 0; lane < LANES; lane++) {
      if (doneLeg[lane] === Infinity && moved[lane] > 0 && pos[lane] + moved[lane] >= TRACK) {
        doneLeg[lane] = leg;
        need[lane] = TRACK - pos[lane];
        took[lane] = moved[lane];
      }
      pos[lane] = Math.min(TRACK, pos[lane] + moved[lane]);
    }
    yield { type: "leg", leg, spikes, moved, positions: [...pos] };
    if (doneLeg.every((l) => l !== Infinity)) break;
  }
  const key: number[] = [];
  for (let lane = 0; lane < LANES; lane++) key.push(rng());
  const cmp = (a: number, b: number): number => {
    if (doneLeg[a] !== doneLeg[b]) return doneLeg[a] < doneLeg[b] ? -1 : 1;
    if (doneLeg[a] !== Infinity) {
      // need/took, compared without dividing: sixteenths, so the products are exact
      const x = need[a] * took[b], y = need[b] * took[a];
      if (x !== y) return x < y ? -1 : 1;
    } else if (pos[a] !== pos[b]) return pos[a] > pos[b] ? -1 : 1;
    return key[a] - key[b];
  };
  const order = Array.from({ length: LANES }, (_, i) => i).sort(cmp);
  yield { type: "end", order, winner: order[0] };
}
