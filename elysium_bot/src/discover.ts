/** Finds new pools by their creation events, from ANY factory / PoolManager (Elysium's mainnet addresses are only
 * published at launch): Uniswap v2 PairCreated, v3 PoolCreated, v4 Initialize. Keeps pools paired with HYPE. */
import { decodeAbiParameters, getAddress, type Address, type Hex, type Log } from "viem";
import { NO_KEY, ZERO, type Route } from "./helper.js";

export const TOPICS = {
  v2: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9", // PairCreated(address,address,address,uint256)
  v3: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118", // PoolCreated(address,address,uint24,int24,address)
  v4: "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438", // Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)
} as const;

export interface Found {
  id: string; // pool address, or v4 manager:poolId
  factory: Address; // factory (v2/v3) or PoolManager (v4)
  block: bigint;
  route: Route;
}

const topicAddr = (t: Hex) => getAddress("0x" + t.slice(26));

/** Turns one creation log into a route against HYPE, or null if neither side is HYPE / WHYPE. */
export function parseLog(log: Pick<Log, "address" | "topics" | "data" | "blockNumber">, whype?: Address): Found | null {
  const t = log.topics as Hex[];
  const factory = getAddress(log.address);
  const block = log.blockNumber ?? 0n;
  const w = whype ? getAddress(whype) : undefined;
  if (t[0] === TOPICS.v2 && t.length >= 3) {
    if (!w) return null;
    const [t0, t1] = [topicAddr(t[1]), topicAddr(t[2])];
    if (t0 !== w && t1 !== w) return null;
    const [pair] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], log.data as Hex);
    return {
      id: getAddress(pair), factory, block,
      route: { kind: 2, pool: getAddress(pair), token: t0 === w ? t1 : t0, quote: w, v2FeeBps: 30, key: NO_KEY },
    };
  }
  if (t[0] === TOPICS.v3 && t.length >= 4) {
    if (!w) return null;
    const [t0, t1] = [topicAddr(t[1]), topicAddr(t[2])];
    if (t0 !== w && t1 !== w) return null;
    const [, pool] = decodeAbiParameters([{ type: "int24" }, { type: "address" }], log.data as Hex);
    return {
      id: getAddress(pool), factory, block,
      route: { kind: 3, pool: getAddress(pool), token: t0 === w ? t1 : t0, quote: w, v2FeeBps: 0, key: NO_KEY },
    };
  }
  if (t[0] === TOPICS.v4 && t.length >= 4) {
    const [c0, c1] = [topicAddr(t[2]), topicAddr(t[3])];
    let quote: Address | null = null;
    if (c0 === ZERO) quote = ZERO;
    else if (w && (c0 === w || c1 === w)) quote = w;
    if (quote === null) return null;
    const token = c0 === quote ? c1 : c0;
    const [fee, tickSpacing, hooks] = decodeAbiParameters(
      [{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }],
      log.data as Hex,
    );
    return {
      id: `${factory}:${t[1]}`, factory, block,
      route: {
        kind: 4, pool: factory, token, quote, v2FeeBps: 0,
        key: { currency0: c0, currency1: c1, fee: Number(fee), tickSpacing: Number(tickSpacing), hooks: getAddress(hooks) },
      },
    };
  }
  return null;
}

/** v2 forks charge different fees and the pair does not say which; the lowest fee whose swap passes is the real one. */
export const V2_FEES = [10, 17, 20, 25, 30, 50, 100];
