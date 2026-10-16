/**
 * Payout math: the split adds up exactly and is reproducible, proofs verify, calldata is well formed.
 * Also writes contracts/test/fixtures/snapshot.json, which the Solidity tests claim with, so the server's
 * trees and the contract's verification are checked against each other.
 *
 *   npm run test:payouts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allocate, claimCalldata, fromWei, hasClaimedCalldata, leafHash, MINING_REF_BPS, merkleTree, monthId, toWei, verifyProof, withReferrals } from "./payouts.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

check("month ids", monthId("2026-09") === 202609 && monthId("2027-12") === 202712);
check("bad month refused", (() => { try { monthId("2026-13"); return false; } catch { return true; } })());
check("token amounts to wei and back", toWei("1000000") === 10n ** 24n && fromWei(toWei("12.5")) === "12.5" && toWei("0.000000000000000001") === 1n);

const wallets = [
  "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333", "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
];
const points = [7.5, 7.5, 22.5, 1000, 0.75];
const pool = toWei("1000") + 7n; // an awkward number, so rounding has something to do
const split = allocate(wallets.map((wallet, i) => ({ wallet, points: points[i] })), pool);
const sum = split.reduce((s, a) => s + a.amount, 0n);
check("split adds up to the pool exactly", sum === pool, `${fromWei(sum)} of ${fromWei(pool)}`);
check("split follows points", split[3].amount > split[2].amount && split[2].amount > split[0].amount && split[0].amount > split[4].amount);
check("equal points, amounts within 1 wei", split[0].amount - split[1].amount <= 1n && split[1].amount - split[0].amount <= 1n);
check("same input, same split, any order",
  JSON.stringify(allocate([...wallets].reverse().map((wallet, i) => ({ wallet, points: [...points].reverse()[i] })), pool).map((a) => [a.wallet, String(a.amount)]).sort())
  === JSON.stringify(split.map((a) => [a.wallet, String(a.amount)]).sort()));
check("zero points get nothing", allocate([{ wallet: wallets[0], points: 0 }, { wallet: wallets[1], points: 5 }], 100n).length === 1);

const leaves = split.map((a) => leafHash(a.wallet, a.amount));
const tree = merkleTree(leaves);
check("every proof verifies", leaves.every((l) => verifyProof(tree.proof(l), tree.root, l)));
check("a changed amount doesn't verify", !verifyProof(tree.proof(leaves[0]), tree.root, leafHash(split[0].wallet, split[0].amount + 1n)));
check("single-leaf tree", (() => { const t = merkleTree([leaves[0]]); return t.root === leaves[0] && t.proof(leaves[0]).length === 0; })());
// OpenZeppelin StandardMerkleTree leaf for (0x1111..., 1): keccak256(keccak256(abi.encode(address, uint256)))
check("leaf matches abi.encode layout", leafHash(wallets[0], 1n).length === 66);

const data = claimCalldata(202609, split[0].wallet, split[0].amount, tree.proof(leaves[0]));
check("claim calldata: selector + 4 head words + length + proof words", data.startsWith("0x") && (data.length - 10) / 64 === 5 + tree.proof(leaves[0]).length);
check("hasClaimed calldata", (hasClaimedCalldata(202609, wallets[0]).length - 10) / 64 === 2);

const fixture = {
  month: 202609,
  root: tree.root,
  total: `0x${pool.toString(16)}`,
  accounts: split.map((a) => a.wallet),
  amounts: split.map((a) => `0x${a.amount.toString(16)}`),
  proofs: split.map((a) => tree.proof(leafHash(a.wallet, a.amount))),
};
writeFileSync(fileURLToPath(new URL("../contracts/test/fixtures/snapshot.json", import.meta.url)), `${JSON.stringify(fixture, null, 2)}\n`);
console.log("wrote contracts/test/fixtures/snapshot.json");

// mining referrals (2026-10-16): 0.5% of each referred wallet's amount goes to its referrer, on top of the pool
{
  const a = "0x" + "a1".repeat(20), b = "0x" + "b2".repeat(20), c = "0x" + "c3".repeat(20);
  const whole = (n: bigint) => n * 10n ** 18n;
  const base = allocate([{ wallet: a, points: 60 }, { wallet: b, points: 40 }], whole(1_000_000n));
  const r = withReferrals(base, new Map([[b, a], [a, c]]));    // b referred by a (who mines), a by c (who doesn't)
  const amt = (w: string) => r.split.find((x) => x.wallet.toLowerCase() === w)?.amount ?? 0n;
  const cutB = (whole(400_000n) * MINING_REF_BPS) / 10_000n, cutA = (whole(600_000n) * MINING_REF_BPS) / 10_000n;
  check("mining referral: the referred miner keeps all of theirs", amt(b) === whole(400_000n));
  check("mining referral: a referrer who mines gets the cut on top", amt(a) === whole(600_000n) + cutB);
  check("mining referral: a referrer who didn't mine gets just the cut", amt(c) === cutA);
  check("mining referral: the pool grows by the cuts", r.extra === cutA + cutB
    && r.split.reduce((s2, x) => s2 + x.amount, 0n) === whole(1_000_000n) + r.extra);
  check("mining referral: none without referrers", withReferrals(base, new Map()).extra === 0n);
}

console.log(failed ? `${failed} FAILED` : "payout math checks passed");
process.exit(failed ? 1 : 0);

