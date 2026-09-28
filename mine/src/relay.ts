/**
 * Gasless USDC: a buyer signs an EIP-3009 transferWithAuthorization (free, no gas) and the server sends it from a
 * small relayer wallet that pays the gas. The relayer holds only gas money: the authorization fixes who pays, who gets
 * paid and how much, so the relayer can't move anything else.
 *
 * Transactions are EIP-1559 (type 2), RLP-encoded and signed here with the audited @noble libraries the server
 * already uses, one at a time so nonces never collide.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { checksumAddress } from "./wallet.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (body.error) throw Object.assign(new Error(body.error.message ?? JSON.stringify(body.error)), { rpc: true });
  return body.result;
}

// ---- RLP ----------------------------------------------------------------------------------------------------------
type Rlp = Uint8Array | Rlp[];
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const lengthBytes = (n: number) => {
  const h = n.toString(16);
  return bytes(h.length % 2 ? `0${h}` : h);
};
function rlp(item: Rlp): Uint8Array {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && item[0] < 0x80) return item;
    if (item.length <= 55) return concat([Uint8Array.of(0x80 + item.length), item]);
    const len = lengthBytes(item.length);
    return concat([Uint8Array.of(0xb7 + len.length), len, item]);
  }
  const body = concat(item.map(rlp));
  if (body.length <= 55) return concat([Uint8Array.of(0xc0 + body.length), body]);
  const len = lengthBytes(body.length);
  return concat([Uint8Array.of(0xf7 + len.length), len, body]);
}
/** an integer as RLP wants it: big-endian, no leading zeros (0 is empty) */
const int = (n: bigint) => (n === 0n ? new Uint8Array(0) : bytes(n.toString(16).length % 2 ? `0${n.toString(16)}` : n.toString(16)));

// ---- ABI ----------------------------------------------------------------------------------------------------------
const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const selector = (sig: string) => hex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4));

export interface Authorization {
  from: string; to: string; value: bigint; validAfter: bigint; validBefore: bigint; nonce: string;
  /** 65 bytes, r || s || v, as wallets return from eth_signTypedData_v4 */
  signature: string;
}

export function transferWithAuthorizationData(a: Authorization): string {
  const sig = a.signature.replace(/^0x/, "");
  const r = sig.slice(0, 64);
  const s = sig.slice(64, 128);
  let v = parseInt(sig.slice(128, 130), 16);
  if (v < 27) v += 27;
  return `0x${selector("transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)")}${
    [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, BigInt(v), r, s].map((x) => word(x as bigint | string)).join("")}`;
}

/** ABI string return value (name(), version()) */
function decodeString(result: string): string {
  const data = result.replace(/^0x/, "");
  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
  return Buffer.from(data.slice(offset + 64, offset + 64 + length * 2), "hex").toString("utf8");
}

/** The token's EIP-712 domain name and version, which the buyer's signature must use. */
export async function tokenDomain(rpcUrl: string, token: string): Promise<{ name: string; version: string }> {
  const [name, version] = await Promise.all([
    rpc(rpcUrl, "eth_call", [{ to: token, data: `0x${selector("name()")}` }, "latest"]),
    rpc(rpcUrl, "eth_call", [{ to: token, data: `0x${selector("version()")}` }, "latest"]),
  ]);
  return { name: decodeString(name), version: decodeString(version) };
}

// ---- the relayer ----------------------------------------------------------------------------------------------------
export class Relayer {
  readonly address: string;
  private readonly key: Uint8Array;
  private readonly rpcUrl: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(privateKey: string, rpcUrl: string, name = "RELAYER_KEY") {
    this.key = bytes(privateKey);
    if (this.key.length !== 32) throw new Error(`${name} must be 32 bytes of hex`);
    this.address = checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(this.key, false).subarray(1))).slice(-40)}`);
    this.rpcUrl = rpcUrl;
  }

  /** What the relayer has left for gas, in wei. */
  async balance(): Promise<bigint> {
    return BigInt(await rpc(this.rpcUrl, "eth_getBalance", [this.address, "latest"]));
  }

  /**
   * Simulate, sign, send and wait for one call. A call that would revert (a bad or used signature, too little USDC)
   * throws before any gas is spent. Resolves with the transaction hash once it's mined successfully. An error marked
   * `unsent` means nothing reached the chain; any other may have been sent.
   */
  send(to: string, data: string): Promise<string> {
    const run = this.queue.then(() => this.sendNow(to, data));
    this.queue = run.catch(() => {});
    return run;
  }

  private async sendNow(to: string, data: string): Promise<string> {
    let hash: string;
    try {
      hash = await this.broadcast(to, data);
    } catch (err) {
      if ((err as { maybeSent?: boolean }).maybeSent) throw err;
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { unsent: true });
    }
    for (let i = 0; i < 120; i++) {
      const receipt = await rpc(this.rpcUrl, "eth_getTransactionReceipt", [hash]);
      if (receipt) {
        if (receipt.status !== "0x1") throw new Error(`the transfer reverted on-chain (${hash})`);
        return hash;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`the transfer wasn't mined in 2 minutes (${hash})`);
  }

  /** Signs and sends; throws only while nothing has left (a node's own error reply included). */
  private async broadcast(to: string, data: string): Promise<string> {
    const call = { from: this.address, to, data };
    let gas: bigint;
    try {
      gas = BigInt(await rpc(this.rpcUrl, "eth_estimateGas", [call]));
    } catch (err) {
      throw Object.assign(new Error(`the transfer would fail: ${err instanceof Error ? err.message : err}`), { reverted: true });
    }
    const [chainId, nonce, block, tip] = await Promise.all([
      rpc(this.rpcUrl, "eth_chainId", []),
      rpc(this.rpcUrl, "eth_getTransactionCount", [this.address, "pending"]),
      rpc(this.rpcUrl, "eth_getBlockByNumber", ["latest", false]),
      rpc(this.rpcUrl, "eth_maxPriorityFeePerGas", []).catch(() => "0x0"),
    ]);
    const baseFee = BigInt(block.baseFeePerGas ?? "0x0");
    const priority = BigInt(tip) || 1_000_000n; // at least 0.001 gwei
    const maxFee = baseFee * 2n + priority;
    const fields: Rlp = [int(BigInt(chainId)), int(BigInt(nonce)), int(priority), int(maxFee), int((gas * 12n) / 10n), bytes(to), int(0n), bytes(data), []];
    const unsigned = concat([Uint8Array.of(2), rlp(fields)]);
    const sig = secp256k1.sign(keccak_256(unsigned), this.key, { prehash: false, format: "recovered" });
    // noble's recovered format is recovery || r || s
    const signed = concat([Uint8Array.of(2), rlp([...(fields as Rlp[]), int(BigInt(sig[0])), int(BigInt(`0x${hex(sig.subarray(1, 33))}`)), int(BigInt(`0x${hex(sig.subarray(33, 65))}`))])]);
    try {
      return await rpc(this.rpcUrl, "eth_sendRawTransaction", [`0x${hex(signed)}`]);
    } catch (err) {
      // the node answered with an error: it refused the transaction. A dropped connection may have sent it.
      if ((err as { rpc?: boolean }).rpc) throw err;
      throw Object.assign(new Error(`sending the transfer failed midway: ${err instanceof Error ? err.message : err}`), { maybeSent: true });
    }
  }
}
