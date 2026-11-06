/**
 * $FLYAI burns paid for things on the site (2026-11-06, the user: "burn use the normal pons burn function"): the
 * wallet calls the token's own burn(amount), which destroys it and lowers the total supply (a Transfer to the zero
 * address). A send to the dead address - how chat packs and follow passes burned before - still counts, so a
 * transaction a cached page sent the old way isn't lost.
 *
 * burnedBy(receipt, wallet) = the $FLYAI wei that receipt shows the wallet burning, either way.
 */
export const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
export const ZERO = "0x0000000000000000000000000000000000000000";
export const DEAD = "0x000000000000000000000000000000000000dead";
export const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const BURN_SELECTOR = "0x42966c68";   // burn(uint256)

export type Receipt = { status?: string; logs?: { address?: string; topics?: string[]; data?: string }[] } | null;
const pad = (a: string) => `0x${a.toLowerCase().slice(2).padStart(64, "0")}`;

export function burnedBy(rec: Receipt, wallet: string, token = FLYAI): bigint {
  if (!rec || rec.status !== "0x1") return 0n;
  const me = pad(wallet), sinks = new Set([pad(ZERO), pad(DEAD)]);
  let wei = 0n;
  for (const l of rec.logs ?? []) {
    if (l.address?.toLowerCase() === token && l.topics?.[0] === TRANSFER && l.topics[1]?.toLowerCase() === me
        && sinks.has(l.topics[2]?.toLowerCase() ?? "")) wei += BigInt(l.data ?? "0x0");
  }
  return wei;
}

/** calldata for burn(amount) on the token */
export const burnCall = (wei: bigint) => `${BURN_SELECTOR}${wei.toString(16).padStart(64, "0")}`;
