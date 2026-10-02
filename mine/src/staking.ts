/**
 * Stake tiers: how much $FLYAI a wallet has in FlyStaking (contracts/src/FlyStaking.sol) sets the multiplier
 * on its points. The server samples `stakedOf` for active wallets during the day and each day counts with
 * the day's lowest sample, so stake has to be in place the whole day to count for it. Stake can't be pulled
 * out between samples either: unstaking stops counting at once and locks the tokens for the cooldown.
 * A failed RPC read adds no sample; the day keeps its lowest so far.
 *
 * Off until STAKING_CONTRACT is set: every wallet counts 1x, as before staking existed.
 */
import { postRpc } from "./rpcpool.ts";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { checksumAddress } from "./wallet.ts";

export interface Tier {
  name: string;
  /** whole tokens staked to reach this tier */
  min: string;
  multiplier: number;
}

/** Placeholder thresholds until real ones are chosen; override with STAKE_TIERS (JSON). Ascending by min. */
export const DEFAULT_TIERS: Tier[] = [
  { name: "Holder", min: "0", multiplier: 1 },
  { name: "Operator", min: "100000", multiplier: 1.25 },
  { name: "Foundry", min: "1000000", multiplier: 1.5 },
];

export const selector = (signature: string): string =>
  `0x${Buffer.from(keccak_256(new TextEncoder().encode(signature)).subarray(0, 4)).toString("hex")}`;
const addressWord = (a: string) => checksumAddress(a).slice(2).toLowerCase().padStart(64, "0");

/** Selectors the /stake page calls through the wallet. */
export const STAKE_SELECTORS = {
  stake: selector("stake(uint256)"),
  requestUnstake: selector("requestUnstake(uint256)"),
  cancelUnstake: selector("cancelUnstake()"),
  withdraw: selector("withdraw()"),
  stakedOf: selector("stakedOf(address)"),
  unstaking: selector("unstaking(address)"),
  cooldown: selector("cooldown()"),
  totalStaked: selector("totalStaked()"),
  approve: selector("approve(address,uint256)"),
  allowance: selector("allowance(address,address)"),
  balanceOf: selector("balanceOf(address)"),
};

export function parseTiers(json: string | undefined): Tier[] {
  if (!json) return DEFAULT_TIERS;
  const tiers = JSON.parse(json) as Tier[];
  if (!Array.isArray(tiers) || !tiers.length || tiers.some((t) => typeof t.name !== "string" || !/^\d+$/.test(String(t.min)) || !(t.multiplier >= 0))) {
    throw new Error("STAKE_TIERS must be a JSON array of {name, min (whole tokens), multiplier}");
  }
  return [...tiers].sort((a, b) => (BigInt(a.min) < BigInt(b.min) ? -1 : 1));
}

/** The highest tier `stakedWei` reaches, or null below the first tier (which then earns nothing). */
export function tierFor(tiers: Tier[], stakedWei: bigint): Tier | null {
  let found: Tier | null = null;
  for (const t of tiers) if (stakedWei >= BigInt(t.min) * 10n ** 18n) found = t;
  return found;
}

/** FlyStaking.stakedOf(wallet) through a JSON-RPC endpoint. */
export async function readStake(rpc: string, contract: string, wallet: string): Promise<bigint> {
  const body = await postRpc(rpc, { jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: contract, data: STAKE_SELECTORS.stakedOf + addressWord(wallet) }, "latest"] });
  if (body.error || typeof body.result !== "string") throw new Error(`stakedOf: ${JSON.stringify(body.error ?? body)}`);
  return BigInt(body.result);
}
