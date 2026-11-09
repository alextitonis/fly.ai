import "dotenv/config";
import { getAddress, type Address } from "viem";

const num = (k: string, d: number) => {
  const v = process.env[k];
  if (v === undefined || v.trim() === "") return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number, got "${v}"`);
  return n;
};
const str = (k: string, d = "") => (process.env[k] ?? d).trim();
const addrList = (k: string): Address[] =>
  str(k)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => getAddress(s));

export const TESTNET_RPC = "https://testnet-rpc.elysium.kinetiq.xyz";
export const TESTNET_CHAIN_ID = 99801;
/** Known WHYPE per chain: testnet checked 2026-11-06, mainnet 2026-11-09 against Kinetiq's published docs. */
export const KNOWN: Record<number, { whype?: Address; name: string }> = {
  99801: { whype: "0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234", name: "Elysium testnet" },
  99901: { whype: "0xbA876237B0f021A6C6D852d6C26e107997cC5E81", name: "Elysium mainnet" },
};

export function loadConfig() {
  const rpc = str("RPC_URL", TESTNET_RPC);
  return {
    rpc,
    privateKey: str("PRIVATE_KEY") as `0x${string}` | "",
    /** WHYPE (wrapped HYPE). Empty = the known one for this chain; v4 pools paired with native HYPE work without it. */
    whype: str("WHYPE") ? getAddress(str("WHYPE")) : undefined,
    /** Only trade pools from these factories / PoolManagers. Empty = any (each pool must still pass the round trip). */
    allowFactories: addrList("ALLOW_FACTORIES"),
    dataDir: str("DATA_DIR", "data"),

    // sizing (HYPE)
    buyHype: num("BUY_HYPE", 0.5),
    maxOpen: num("MAX_OPEN", 4),
    maxSpendHype: num("MAX_SPEND_HYPE", 5),
    gasReserveHype: num("GAS_RESERVE_HYPE", 0.05),
    maxBuysPerHour: num("MAX_BUYS_PER_HOUR", 12),
    paperBalanceHype: num("PAPER_BALANCE_HYPE", 10),

    // entry gates
    maxPoolAgeSec: num("MAX_POOL_AGE_SEC", 300),
    maxRoundTripLossPct: num("MAX_ROUNDTRIP_LOSS_PCT", 12),
    /** Price impact of our buy, measured against a probe 1/20 our size: a thin pool moves a lot. */
    maxImpactPct: num("MAX_IMPACT_PCT", 8),
    minTaxRatio: num("MIN_TAX_RATIO", 0.9),

    // exits
    tpX: num("TP_X", 2),
    tpPart: num("TP_PART", 0.5),
    trailPct: num("TRAIL_PCT", 25),
    trailArmX: num("TRAIL_ARM_X", 1.3),
    stopPct: num("STOP_PCT", 40),
    maxHoldMin: num("MAX_HOLD_MIN", 30),
    slippagePct: num("SLIPPAGE_PCT", 8),
    recheckSec: num("RECHECK_SEC", 15),

    // loop
    pollMs: num("POLL_MS", 1000),
    lookbackBlocks: num("LOOKBACK_BLOCKS", 3000),
    maxLogRange: num("MAX_LOG_RANGE", 5000),
  };
}

export type Config = ReturnType<typeof loadConfig>;
