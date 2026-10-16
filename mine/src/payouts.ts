/**
 * Monthly payouts: split a pool of $FLYAI across wallets by points, and commit to the split with a Merkle
 * root that contracts/src/MonthlyClaims.sol checks claims against.
 *
 *   leaf  = keccak256(keccak256(abi.encode(address wallet, uint256 amount)))   (OpenZeppelin's standard leaf)
 *   pairs = keccak256(min(a, b) || max(a, b))                                  (MerkleProof's sorted pairs)
 *
 * Amounts are in wei (18 decimals) and add up to the pool exactly.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { checksumAddress } from "./wallet.ts";

export const DECIMALS = 18n;

export interface Allocation {
  wallet: string;
  points: number;
  amount: bigint;
}

const hex = (b: Uint8Array) => `0x${Buffer.from(b).toString("hex")}`;
const bytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
const word = (n: bigint) => bytes(n.toString(16).padStart(64, "0"));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** "2026-09" -> 202609, the month id the contract uses. */
export function monthId(month: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`month is YYYY-MM, got ${month}`);
  return Number(m[1]) * 100 + Number(m[2]);
}

/** Whole tokens ("1000000" or "1000.5") to wei. */
export function toWei(tokens: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(tokens.trim());
  if (!m) throw new Error(`pool must be a number of tokens, got ${tokens}`);
  return BigInt(m[1]) * 10n ** DECIMALS + BigInt((m[2] ?? "").padEnd(18, "0"));
}

export const fromWei = (wei: bigint): string => {
  const whole = wei / 10n ** DECIMALS;
  const frac = (wei % 10n ** DECIMALS).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
};

/**
 * pool * points / all points for each wallet, floored, then the leftover wei one each to the largest
 * remainders (ties by address), so the amounts add up to the pool exactly and the split is reproducible.
 */
export function allocate(entries: { wallet: string; points: number }[], pool: bigint): Allocation[] {
  const scaled = entries
    .map((e) => ({ wallet: checksumAddress(e.wallet), points: e.points, p: BigInt(Math.round(e.points * 10_000)) }))
    .filter((e) => e.p > 0n);
  const total = scaled.reduce((s, e) => s + e.p, 0n);
  if (total === 0n) return [];
  const rows = scaled.map((e) => ({ ...e, amount: (pool * e.p) / total, rem: (pool * e.p) % total }));
  let left = pool - rows.reduce((s, r) => s + r.amount, 0n);
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? (a.wallet.toLowerCase() < b.wallet.toLowerCase() ? -1 : 1) : a.rem > b.rem ? -1 : 1));
  for (const r of order) {
    if (left === 0n) break;
    r.amount += 1n;
    left -= 1n;
  }
  return rows.map(({ wallet, points, amount }) => ({ wallet, points, amount }));
}

/** A referrer's cut of each referred miner's month, in basis points (2026-10-16, the user: 0.5%, "for mining paid by
 * fly.ai"): on top of the pool, so the miner keeps every wei of their own share. */
export const MINING_REF_BPS = 50n;

/**
 * The referrers' cuts for a month's split: MINING_REF_BPS of each referred wallet's amount, floored, added to the
 * referrer's own row (a new row with no points if the referrer didn't mine). `referrerOf` is keyed by lowercase
 * wallet. Returns the new split, what each cut came from (for mine.ref_earnings) and the extra the pool needs.
 */
export function withReferrals(split: Allocation[], referrerOf: Map<string, string>) {
  const out = split.map((a) => ({ ...a }));
  const cuts: { referrer: string; wallet: string; amount: bigint }[] = [];
  for (const a of split) {
    const ref = referrerOf.get(a.wallet.toLowerCase());
    const amount = (a.amount * MINING_REF_BPS) / 10_000n;
    if (!ref || amount <= 0n) continue;
    const row = out.find((r) => r.wallet.toLowerCase() === ref.toLowerCase());
    if (row) row.amount += amount;
    else out.push({ wallet: checksumAddress(ref), points: 0, amount });
    cuts.push({ referrer: ref.toLowerCase(), wallet: a.wallet.toLowerCase(), amount });
  }
  return { split: out, cuts, extra: cuts.reduce((s, c) => s + c.amount, 0n) };
}

export function leafHash(wallet: string, amount: bigint): string {
  const encoded = concat(new Uint8Array(12), bytes(checksumAddress(wallet)), word(amount));
  return hex(keccak_256(keccak_256(encoded)));
}

const pairHash = (a: string, b: string) => hex(keccak_256(concat(...(a < b ? [bytes(a), bytes(b)] : [bytes(b), bytes(a)]))));

/** The root and each leaf's proof. Leaves are sorted first, so the tree doesn't depend on input order. */
export function merkleTree(leaves: string[]): { root: string; proof(leaf: string): string[] } {
  if (!leaves.length) throw new Error("no leaves");
  const layers: string[][] = [[...leaves].sort()];
  while (layers[layers.length - 1].length > 1) {
    const below = layers[layers.length - 1];
    const above: string[] = [];
    for (let i = 0; i < below.length; i += 2) above.push(i + 1 < below.length ? pairHash(below[i], below[i + 1]) : below[i]);
    layers.push(above);
  }
  return {
    root: layers[layers.length - 1][0],
    proof(leaf) {
      let index = layers[0].indexOf(leaf);
      if (index < 0) throw new Error("leaf not in tree");
      const out: string[] = [];
      for (let level = 0; level < layers.length - 1; level++) {
        const sibling = index % 2 ? index - 1 : index + 1;
        if (sibling < layers[level].length) out.push(layers[level][sibling]);
        index = Math.floor(index / 2);
      }
      return out;
    },
  };
}

/** What MerkleProof.verify does, for tests. */
export function verifyProof(proof: string[], root: string, leaf: string): boolean {
  return proof.reduce((h, sibling) => pairHash(h, sibling), leaf) === root;
}

const selector = (signature: string) => hex(keccak_256(new TextEncoder().encode(signature)).subarray(0, 4));
const addressWord = (a: string) => concat(new Uint8Array(12), bytes(checksumAddress(a)));

/** Calldata for MonthlyClaims.claim(uint256 month, address account, uint256 amount, bytes32[] proof). */
export function claimCalldata(month: number, wallet: string, amount: bigint, proof: string[]): string {
  return selector("claim(uint256,address,uint256,bytes32[])") + Buffer.from(concat(
    word(BigInt(month)), addressWord(wallet), word(amount), word(0x80n), word(BigInt(proof.length)), ...proof.map(bytes),
  )).toString("hex");
}

/** Calldata for MonthlyClaims.months(uint256): the first returned word is the root, zero until opened. */
export function monthCalldata(month: number): string {
  return selector("months(uint256)") + Buffer.from(word(BigInt(month))).toString("hex");
}

/** Calldata for MonthlyClaims.hasClaimed(uint256 month, address account). */
export function hasClaimedCalldata(month: number, wallet: string): string {
  return selector("hasClaimed(uint256,address)") + Buffer.from(concat(word(BigInt(month)), addressWord(wallet))).toString("hex");
}
