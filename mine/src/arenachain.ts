/**
 * Fly Colosseum's record on chain (flytrade/contracts/src/ColosseumLedger.sol): what the server posts for each season
 * and how a single fight is proven to be part of it. Pure functions, no network, so the contract's rules can be checked
 * against these (mine/src/arenatest.ts, flytrade/contracts/test/ColosseumLedger.t.sol).
 *
 * A fight's leaf is sha256 of its record: season, round, slot, both flies, the winner and the sha256 of its events
 * (the stored JSON text), each number a 32-byte word with a "|" byte between. The round is -1 for the 3rd-place fight
 * (two's complement). Byes aren't fights and have no leaf. Leaves are ordered by round, then slot. The tree pairs
 * neighbours hashing the smaller hash first; an odd one out moves up a level unchanged. So a proof is the siblings on
 * the way up, and the contract checks it the same way (verifyFight). The page rebuilds a leaf from the fight it shows
 * and asks the contract, so the server's proof is only a helper: the chain decides.
 */
import { createHash } from "node:crypto";
import { selector } from "./staking.ts";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

const MASK = (1n << 256n) - 1n;
/** a number as a 32-byte word (negative ones in two's complement) */
const word = (n: bigint | number) => Buffer.from(((BigInt(n) & MASK).toString(16)).padStart(64, "0"), "hex");
const BAR = Buffer.from("|");

export interface FightRecord { season: number; round: number; slot: number; a: number; b: number; winner: number; events: string }

/** sha256 of the fight's record */
export function fightLeaf(f: FightRecord): string {
  return hex(sha(Buffer.concat([
    word(f.season), BAR, word(f.round), BAR, word(f.slot), BAR, word(f.a), BAR, word(f.b), BAR, word(f.winner), BAR, createHash("sha256").update(f.events).digest(),
  ])));
}

const pair = (x: string, y: string) => sha(Buffer.concat(x < y ? [Buffer.from(x, "hex"), Buffer.from(y, "hex")] : [Buffer.from(y, "hex"), Buffer.from(x, "hex")]));

/** the tree over the leaves (in the order given): its root and the proof of each leaf */
export function merkle(leaves: string[]): { root: string; proofs: string[][] } {
  if (!leaves.length) throw new Error("a season has at least one fight");
  const proofs: string[][] = leaves.map(() => []);
  let level = leaves.map((l, i) => ({ h: l, from: [i] }));
  while (level.length > 1) {
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i], r = level[i + 1];
      if (!r) { next.push(l); continue; }
      for (const i2 of l.from) proofs[i2].push(r.h);
      for (const i2 of r.from) proofs[i2].push(l.h);
      next.push({ h: hex(pair(l.h, r.h)), from: [...l.from, ...r.from] });
    }
    level = next;
  }
  return { root: level[0].h, proofs };
}

/** what the contract does with a proof */
export function verify(leaf: string, proof: string[], root: string): boolean {
  let h = leaf;
  for (const p of proof) h = hex(pair(h, p));
  return h === root;
}

// ---- calldata ----------------------------------------------------------------------------------------------------
const SEL = {
  commit: selector("commit(uint256,bytes32,uint64)"),
  reveal: selector("reveal(uint256,bytes,uint32,bytes32,bytes32,uint32,uint32,uint32)"),
  lastSeason: selector("lastSeason()"),
};
const b32 = (h: string) => { const x = h.replace(/^0x/, ""); if (!/^[0-9a-f]{64}$/i.test(x)) throw new Error("not a 32-byte hash"); return x.toLowerCase(); };
const w = (n: bigint | number) => word(n).toString("hex");

export const lastSeasonCalldata = () => SEL.lastSeason;

/** commit(season, sha256 of the seed's hex text, registration closes (unix seconds)) */
export const commitCalldata = (season: number, commitHash: string, closesAtMs: number) =>
  `${SEL.commit}${w(season)}${b32(commitHash)}${w(Math.floor(closesAtMs / 1000))}`;

/** reveal(...): `serverSeed` is the seed's 64 hex characters as text, which is what the commit was made of */
export function revealCalldata(season: number, serverSeed: string, entrants: number, digest: string, root: string, places: [number, number, number | null]): string {
  const bytes = Buffer.from(serverSeed, "utf8");
  const padded = Buffer.concat([bytes, Buffer.alloc((32 - (bytes.length % 32)) % 32)]);
  return `${SEL.reveal}${w(season)}${w(8 * 32)}${w(entrants)}${b32(digest)}${b32(root)}${w(places[0])}${w(places[1])}${w(places[2] ?? 0)}${w(bytes.length)}${padded.toString("hex")}`;
}
