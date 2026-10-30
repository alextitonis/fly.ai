/** Fly DEX (docs/dex.html, 2026-10-30): the swap box's calldata, kept pure so the launchpad's fork run sends these exact
 *  bytes (flytrade/desk/fork_launchpad.py) and a token's first real trade isn't their first test.
 *  On the curve a token is bought with USDG or ETH and sold for USDG, at the launchpad. At graduation the raise turns
 *  into FLYAI by itself (the keeper) and from then on the token's one pair is TOKEN/FLYAI (the user, 2026-10-30), through
 *  GIGA's SmartRouter. Nothing of ours sits in the middle and there's no fee of ours on top. */
export const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const WETH = "0x0Bd7D308f8E1639FAb988DF18A8011F41EAcAd73";
export const NATIVE = "0x0000000000000000000000000000000000000000";
export const GIGA_ROUTER = "0x57a148316B58C6a20d748a8581Cd416ed7dBE82D";
export const GIGA_QUOTER = "0x78cD9561bd33e5A3Bdb6D4A92cE67CB535289655";
export const POOL_FEE = 10000n;                       // a graduated pool's tier: 1%
const ETH_POOL_FEE = 100n;                            // the launchpad's WETH/USDG pool for buyWithEth: 0.01%

const hex = (v) => String(v).replace(/^0x/, "").toLowerCase();
export const word = (v) => (typeof v === "bigint" ? v.toString(16) : hex(v)).padStart(64, "0");
const pad = (h) => h.padEnd(Math.ceil(h.length / 64) * 64, "0");
const same = (a, b) => hex(a) === hex(b);

/** The route a trade takes. pay only matters for a curve buy: USDG or ETH. */
export function routeOf({ state, token, side, pay }) {
  if (state === "graduated") return { via: "pool", tin: side === "buy" ? FLYAI : token, tout: side === "buy" ? token : FLYAI };
  if (side === "sell") return { via: "curve", tin: token, tout: USDG };
  return { via: "curve", tin: pay === "ETH" ? NATIVE : USDG, tout: token };
}
export const isEth = (route) => same(route.tin, NATIVE);

/** ETH on the curve is two quotes: this one (ETH -> USDG on the launchpad's pool), then quoteCall with the USDG. */
export const ethQuoteCall = (amount) =>
  [GIGA_QUOTER, "0xc6a5026a" + word(WETH) + word(USDG) + word(amount) + word(ETH_POOL_FEE) + word(0n)];

/** The eth_call that quotes it: [to, data]. Every one of them answers with the amount out in its first word.
 *  For an ETH buy, `amount` is the USDG from ethQuoteCall. */
export function quoteCall(route, amount, launchpad) {
  if (route.via === "curve") {
    const selling = same(route.tout, USDG);
    return [launchpad, (selling ? "0xd98b2f5c" + word(route.tin) : "0x0d7a94f6" + word(route.tout)) + word(amount)];
  }
  return [GIGA_QUOTER, "0xc6a5026a" + word(route.tin) + word(route.tout) + word(amount) + word(POOL_FEE) + word(0n)];
}

/** Who has to be approved for the paid token (nobody for ETH). */
export const spenderOf = (route, launchpad) => (isEth(route) ? null : route.via === "curve" ? launchpad : GIGA_ROUTER);

/** The wallet's transactions: an exact approve when the allowance is short, then the trade.
 *  minUsdg: an ETH buy's floor on the ETH -> USDG leg. */
export function swapTxs({ route, user, amount, minOut, minUsdg = 0n, allowance = 0n, deadline, launchpad }) {
  if (isEth(route)) {
    return [{ kind: "swap", to: launchpad, data: "0x8085d06d" + word(route.tout) + word(minUsdg) + word(minOut), value: `0x${amount.toString(16)}` }];
  }
  const txs = [];
  const spender = spenderOf(route, launchpad);
  if (allowance < amount) txs.push({ kind: "approve", to: route.tin, data: "0x095ea7b3" + word(spender) + word(amount), value: "0x0" });
  if (route.via === "curve") {
    const selling = same(route.tout, USDG);
    const data = (selling ? "0x6a272462" + word(route.tin) : "0xa59ac6dd" + word(route.tout)) + word(amount) + word(minOut);
    txs.push({ kind: "swap", to: launchpad, data, value: "0x0" });
    return txs;
  }
  const swap = "04e45aaf" + word(route.tin) + word(route.tout) + word(POOL_FEE) + word(user) + word(amount) + word(minOut) + word(0n);
  // multicall(uint256 deadline, bytes[] data) with one call: head, the array, its one element
  const data = "0x5ae401dc" + word(deadline) + word(64n) + word(1n) + word(32n) + word(BigInt(swap.length / 2)) + pad(swap);
  txs.push({ kind: "swap", to: GIGA_ROUTER, data, value: "0x0" });
  return txs;
}

// ---- creating a token (docs/launch.html) -----------------------------------------------------------------------
export const LAUNCHED_TOPIC = "0xe924ff694e1bd050d6c78edb8446e222e3eba1717fcb26858da4eb88814825c4";
const SUPPLY = 1_000_000_000n * 10n ** 18n;
const BPS = 10000n;

/** The dev buy is the curve's first trade, so its tokens are known exactly: the contract's _fill on the launch's rules. */
export function devQuote(rules, usdg, taxBps) {
  const x0 = BigInt(rules.x0), y0 = BigInt(rules.y0);
  const net = usdg - (usdg * (BigInt(rules.feeBps) + BigInt(taxBps))) / BPS;
  const product = x0 * y0, newX = x0 + net;
  return y0 - (product + newX - 1n) / newX;
}

/** The most USDG a dev buy can be: its tokens may not pass maxDevBps of the supply. */
export function maxDevBuy(rules, taxBps) {
  const x0 = BigInt(rules.x0), y0 = BigInt(rules.y0), keep = BPS - BigInt(rules.feeBps) - BigInt(taxBps);
  const cap = (SUPPLY * BigInt(rules.maxDevBps)) / BPS;
  let usdg = ((x0 * y0) / (y0 - cap) - x0) * BPS / keep;
  while (usdg > 0n && devQuote(rules, usdg, taxBps) > cap) usdg -= 1n;   // rounding: back off to what the contract takes
  return usdg;
}

/** What's wrong with a launch's fields, as a string key; null when it's fine. The chain only checks the tax. */
export function launchProblem({ name, symbol, uri, taxBps }) {
  const bytes = (s) => new TextEncoder().encode(s).length;
  if (!name.trim() || name !== name.trim() || bytes(name) > 32) return "name";
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return "symbol";
  // our own token's name is what a fake would pick first
  if (/^\$?fly\s*\.?\s*ai$/i.test(name) || symbol === "FLYAI") return "reserved";
  if (uri && (bytes(uri) > 300 || !/^(https:\/\/|ipfs:\/\/)\S+$/.test(uri))) return "logo";
  if (!(taxBps >= 0 && taxBps <= 200)) return "tax";
  return null;
}

/** create((name, symbol, uri, creatorTaxBps, devBuyUsdg, minDevTokens)) */
export function createData({ name, symbol, uri, taxBps, devBuy, minDev }) {
  const text = (s) => {
    const b = [...new TextEncoder().encode(s)].map((x) => x.toString(16).padStart(2, "0")).join("");
    return word(BigInt(b.length / 2)) + pad(b);
  };
  const parts = [text(name), text(symbol), text(uri)];
  let at = 192n;                                      // six head words
  const offsets = parts.map((p) => { const o = at; at += BigInt(p.length / 2); return word(o); });
  return "0xf35a09fa" + word(32n) + offsets.join("") + word(BigInt(taxBps)) + word(devBuy) + word(minDev) + parts.join("");
}

/** The wallet's transactions for a launch: an exact USDG approve for a dev buy when it's short, then create with the fee. */
export function createTxs({ launchpad, fee, allowance = 0n, ...args }) {
  const txs = [];
  if (args.devBuy > 0n && allowance < args.devBuy) txs.push({ kind: "approve", to: USDG, data: "0x095ea7b3" + word(launchpad) + word(args.devBuy), value: "0x0" });
  txs.push({ kind: "create", to: launchpad, data: createData(args), value: `0x${BigInt(fee).toString(16)}` });
  return txs;
}

/** "12.5" -> 12500000n, no float rounding; null when it isn't a number. */
export function units(amount, decimals) {
  const [i, f = "", extra] = String(amount).trim().split(".");
  if (extra !== undefined || !/^\d*$/.test(i) || !/^\d*$/.test(f) || (i === "" && f === "")) return null;
  return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** The floor under a quote, slippage in basis points. */
export const floorOf = (out, slipBps) => (out * (10000n - BigInt(slipBps))) / 10000n;
