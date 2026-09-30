/**
 * Many eth_calls in one request through Multicall3 (aggregate3 with allowFailure), for reads over a whole collection:
 * the public RPC refuses a burst of hundreds of single calls. On a chain without Multicall3 (a local test chain) the
 * calls go one at a time.
 */
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const AGGREGATE3 = selector("aggregate3((address,bool,bytes)[])");
export const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

export function multicall(rpcUrl: string) {
  const call = (to: string, data: string) => rpc(rpcUrl, "eth_call", [{ to, data }, "latest"]) as Promise<string>;
  let has: boolean | null = null;
  /** Each call's return data, or null where it reverted. */
  async function batch(calls: { to: string; data: string }[]): Promise<(string | null)[]> {
    has ??= ((await rpc(rpcUrl, "eth_getCode", [MULTICALL3, "latest"]).catch(() => "0x")) as string).length > 2;
    const out: (string | null)[] = [];
    if (!has) {
      for (const c of calls) out.push(await call(c.to, c.data).catch(() => null));
      return out;
    }
    for (let i = 0; i < calls.length; i += 100) {
      const part = calls.slice(i, i + 100);
      // (address target, bool allowFailure, bytes callData)[]: a head word per tuple, then the tuples
      const heads: string[] = [], bodies: string[] = [];
      let at = part.length * 32;
      for (const c of part) {
        const bytes = c.data.slice(2);
        const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
        heads.push(word(at));
        const tuple = c.to.slice(2).toLowerCase().padStart(64, "0") + word(1) + word(96) + word(bytes.length / 2) + padded;
        bodies.push(tuple);
        at += tuple.length / 2;
      }
      const ret = (await call(MULTICALL3, AGGREGATE3 + word(32) + word(part.length) + heads.join("") + bodies.join(""))).slice(2);
      const w = (pos: number) => BigInt(`0x${ret.slice(pos * 2, pos * 2 + 64)}`);
      const base = Number(w(0)) + 32; // the array's content starts after its length word
      const n = Number(w(Number(w(0))));
      for (let k = 0; k < n; k++) {
        const t = base + Number(w(base + k * 32));
        const ok = w(t) !== 0n;
        const p = t + Number(w(t + 32));
        const len = Number(w(p));
        out.push(ok ? `0x${ret.slice((p + 32) * 2, (p + 32 + len) * 2)}` : null);
      }
    }
    return out;
  }
  return { call, batch };
}
