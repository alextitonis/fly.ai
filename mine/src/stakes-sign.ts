/**
 * Signing Flyverse stake payouts for the FlyStakes contract (flytrade/contracts/src/FlyStakes.sol, 2026-11-23):
 * claimHash = keccak256(abi.encode(chainid, contract, id, to, amount, refund)), signed EIP-191 ("\x19Ethereum Signed
 * Message:\n32" + hash) with the server's stakes key (FLYVERSE_STAKES_KEY). Lives in mine/ for its crypto packages;
 * flyverse/server/stakes.ts gets it through the hook (and its tests import it from here).
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => Uint8Array.from((h.replace(/^0x/, "").match(/../g) ?? []).map((x) => parseInt(x, 16)));
const word = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");

export interface StakeSigner {
  address: string;
  /** the 65-byte signature (r, s, v) the contract's claim() wants */
  sign(id: string, to: string, units: bigint, refund: boolean): string;
}

export function makeStakeSigner(key: string, contract: string, chainId = 4663): StakeSigner {
  const priv = bytes(key);
  if (priv.length !== 32) throw new Error("stakes key must be 32 bytes hex");
  const pub = secp256k1.getPublicKey(priv, false).slice(1);
  const address = "0x" + hex(keccak_256(pub)).slice(-40);
  return {
    address,
    sign(id, to, units, refund) {
      const enc = word(chainId.toString(16)) + word(contract) + word(id) + word(to) + word(units.toString(16)) + word(refund ? "1" : "0");
      const h = keccak_256(bytes(enc));
      const msg = keccak_256(new Uint8Array([...new TextEncoder().encode("\x19Ethereum Signed Message:\n32"), ...h]));
      const sig = secp256k1.sign(msg, priv, { prehash: false, format: "recovered" }) as Uint8Array;
      // noble's recovered format is (recovery, r, s): the contract wants (r, s, v = 27 + recovery)
      return "0x" + hex(sig.slice(1)) + (27 + sig[0]).toString(16);
    },
  };
}
