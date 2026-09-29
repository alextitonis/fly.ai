/**
 * Fly Slots' rules, the one copy everything plays by: free spins in the page, bet spins on the server
 * (mine/src/slots.ts), FlightPass autopilot spins, and the page's Verify replay (2026-09-29, the user: "another mini
 * game like the roulette for the pass holders ... slots", "fair RNG + fly reacts", 95% RTP).
 *
 * A spin's chance comes from one generator seeded with sha256(serverSeed:clientSeed), the same derivation as Fly
 * Roulette (../roulette/game.ts deriveRng): three draws, one stop on each reel's 32-stop strip. Given the two seeds
 * the result is fixed, so a revealed server seed lets anyone replay it. The fly beside the reels (a real connectome,
 * in the page) only REACTS to the result; it never changes it.
 *
 * Paytable (a multiple of the stake, the stake included): three alike on the line, else the first two alike, else a
 * crown on the first reel. Spiders never pay. Return to player, exactly over all 32,768 outcomes: RTP below
 * (62226/65536 = 94.95%); a win about 1 spin in 5.6; the top prize 400x.
 */
import { deriveRng, sha256Hex } from "../roulette/game.ts";

export { deriveRng, sha256Hex };

export const SYMBOLS = ["crown", "fly", "honey", "grape", "banana", "apple", "spider"] as const;
export type Sym = (typeof SYMBOLS)[number];

/** how many of each symbol a reel's 32 stops hold (every reel the same) */
export const WEIGHTS: Record<Sym, number> = { crown: 1, fly: 2, honey: 3, grape: 5, banana: 7, apple: 8, spider: 6 };

/** a reel's 32 stops in order, spread out so no symbol bunches (the page draws this strip; stops index into it) */
export const STRIP: Sym[] = ["apple", "banana", "spider", "grape", "apple", "honey", "banana", "spider", "apple", "fly",
  "banana", "grape", "spider", "apple", "banana", "crown", "apple", "grape", "spider", "banana", "honey", "apple",
  "grape", "spider", "banana", "fly", "apple", "grape", "spider", "banana", "honey", "apple"];

export const PAYS = {
  three: { crown: 400, fly: 80, honey: 40, grape: 20, banana: 10, apple: 8 } as Record<Exclude<Sym, "spider">, number>,
  two: { crown: 40, fly: 14, honey: 8, grape: 4, banana: 3, apple: 3 } as Record<Exclude<Sym, "spider">, number>,
  crown: 3,
};
export const TOP_MULT = PAYS.three.crown;

export type Line = "three" | "two" | "crown" | null;
export interface Spin {
  /** each reel's stop: an index into STRIP */
  stops: [number, number, number];
  symbols: [Sym, Sym, Sym];
  /** what it pays, as a multiple of the stake (0 = a loss) */
  mult: number;
  line: Line;
}

/** Scores three symbols on the line. */
export function score(s: [Sym, Sym, Sym]): { mult: number; line: Line } {
  const [a, b, c] = s;
  if (a !== "spider" && a === b && b === c) return { mult: PAYS.three[a], line: "three" };
  if (a !== "spider" && a === b) return { mult: PAYS.two[a], line: "two" };
  if (a === "crown") return { mult: PAYS.crown, line: "crown" };
  return { mult: 0, line: null };
}

/** One spin from a generator: three draws, reel 1 first. Draw order is part of the rules. */
export function spinWith(rng: () => number): Spin {
  const stops = [0, 1, 2].map(() => Math.floor(rng() * STRIP.length)) as [number, number, number];
  const symbols = stops.map((i) => STRIP[i]) as [Sym, Sym, Sym];
  return { stops, symbols, ...score(symbols) };
}

/** The spin two seeds make (the server's bet spins and the page's Verify both call this). */
export async function spin(serverSeed: string, clientSeed: string): Promise<Spin> {
  return spinWith(await deriveRng(serverSeed, clientSeed));
}

/** Return to player over every outcome, from STRIP and PAYS (the tests pin it to 62226/65536). */
export function rtp(): { rtp: number; hit: number } {
  const n = STRIP.length;
  let total = 0, hit = 0;
  for (const a of STRIP) for (const b of STRIP) for (const c of STRIP) {
    const m = score([a, b, c]).mult;
    total += m;
    if (m > 0) hit++;
  }
  return { rtp: total / n ** 3, hit: hit / n ** 3 };
}
