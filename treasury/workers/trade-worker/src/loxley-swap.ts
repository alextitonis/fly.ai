// loxley-swap.ts — Pure swap encoding functions extracted from loxley (MIT, shmidtqq65/loxley).
// These are verbatim copies of the pure (no fs/path) functions from loxley/cli/trade.js.
// License: MIT — Copyright (c) 2026 shmidtqq
// Source: https://github.com/shmidtqq65/loxley/blob/main/cli/trade.js

import { parseAbi, encodeAbiParameters, encodePacked, keccak256, getAddress } from "viem";

export const BPS = 10000n;
export const ZERO = "0x0000000000000000000000000000000000000000" as const;
export const PHASE = ["on the curve", "swept, pool not created yet", "pool created", "rescued"] as const;

// V4 command bytes (from loxley)
const V4 = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE_ALL: 0x0c, TAKE_ALL: 0x0f, COMMAND_V4_SWAP: 0x10 };

// ABIs (from loxley/cli/trade.js)
export const ABI = {
  factory: parseAbi([
    "function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists) record)",
    "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)",
    "function snipeTaxStartBps() view returns (uint256)",
    "function snipeTaxSeconds() view returns (uint256)",
  ]),
  curve: parseAbi([
    "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
    "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
    "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
    "function realQuoteReserve() view returns (uint256)",
    "function sellableTokens() view returns (uint256)",
    "function reservedTokens() view returns (uint256)",
    "function graduationThreshold() view returns (uint256)",
    "function readyToGraduate() view returns (bool)",
    "function graduated() view returns (bool)",
    "function feeBps() view returns (uint256)",
    "function creatorTaxBps() view returns (uint256)",
    "function isNativeQuote() view returns (bool)",
    "function pairToken() view returns (address)",
    "function launchedAt() view returns (uint256)",
    "function currentSnipeTaxBps(address buyer) view returns (uint256)",
    "function snipeTaxExempt(address who) view returns (bool)",
    "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
    "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
  ]),
  erc20: parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ]),
  permit2: parseAbi([
    "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
    "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  ]),
  quoter: parseAbi([
    "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
  ]),
  stateView: parseAbi([
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  ]),
  router: parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]),
} as const;

// Uniswap V2 Router02 ABI (for non-Pons tokens)
export const V2_ROUTER_ABI = parseAbi([
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
]) as const;

const POOL_KEY_TYPE = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const;

// ---------- curve maths, integer, to the wei (pons v2) — from loxley ----------
export const amountOut = (inp: bigint, reserveIn: bigint, reserveOut: bigint): bigint =>
  (inp * reserveOut) / (reserveIn + inp);
export const amountIn = (out: bigint, reserveIn: bigint, reserveOut: bigint): bigint =>
  (out * reserveIn) / (reserveOut - out) + 1n;
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export function quoteBuy(s: any, spent: bigint, openingTaxBps: number) {
  const fee = (spent * s.feeBps) / BPS;
  const tax = (spent * s.creatorTaxBps) / BPS;
  const opening = (spent * BigInt(openingTaxBps || 0)) / BPS;
  const net = spent - fee - tax - opening;
  if (net <= 0n) return { tokensOut: 0n, fee, tax, opening, net, spent, refund: 0n, capped: false };
  let tokensOut = amountOut(net, s.quoteReserve, s.tokenReserve);
  let refund = 0n, capped = false, gross = spent;
  if (s.sellableTokens != null && tokensOut > s.sellableTokens) {
    tokensOut = s.sellableTokens;
    capped = true;
    const needNet = amountIn(tokensOut, s.quoteReserve, s.tokenReserve);
    gross = ceilDiv(needNet * BPS, BPS - s.feeBps - s.creatorTaxBps - BigInt(openingTaxBps || 0));
    refund = spent > gross ? spent - gross : 0n;
  }
  const priceWeiPerToken = tokensOut > 0n ? Number(gross) / Number(tokensOut) : null;
  return { tokensOut, fee, tax, opening, net, spent: gross, refund, capped, price: priceWeiPerToken };
}

export function quoteSell(s: any, tokensIn: bigint) {
  if (tokensIn <= 0n || tokensIn >= s.tokenReserve + tokensIn)
    return { quoteOut: 0n, gross: 0n, fee: 0n, tax: 0n };
  const gross = amountOut(tokensIn, s.tokenReserve, s.quoteReserve);
  const fee = (gross * s.feeBps) / BPS;
  const tax = (gross * s.creatorTaxBps) / BPS;
  const quoteOut = gross - fee - tax;
  return { quoteOut: quoteOut > 0n ? quoteOut : 0n, gross, fee, tax };
}

export const minOutFromRate = (amount: bigint, slippageBps: bigint): bigint =>
  (amount * (BPS - BigInt(slippageBps))) / BPS;

// ---------- v4 encoding, the universal router behind the pons hook — from loxley ----------
function sortCurrencies(a: `0x${string}`, b: `0x${string}`): [`0x${string}`, `0x${string}`] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

export function poolKeyFor(
  token: `0x${string}`,
  pairToken: `0x${string}`,
  tickSpacing: number | null,
  hooks: `0x${string}`,
  fee: number | null,
) {
  const [c0, c1] = sortCurrencies(getAddress(token), getAddress(pairToken || ZERO));
  return {
    currency0: c0,
    currency1: c1,
    fee: fee == null ? 0 : Number(fee),
    tickSpacing: tickSpacing == null ? 200 : Number(tickSpacing),
    hooks: getAddress(hooks),
  };
}

export const poolIdOf = (k: any): `0x${string}` =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );

export function encodeV4Swap(
  key: any,
  zeroForOne: boolean,
  amountIn_: bigint,
  amountOutMin: bigint,
  layout?: string,
) {
  const actions = encodePacked(["uint8", "uint8", "uint8"], [
    V4.SWAP_EXACT_IN_SINGLE,
    V4.SETTLE_ALL,
    V4.TAKE_ALL,
  ]);
  const cIn = zeroForOne ? key.currency0 : key.currency1;
  const cOut = zeroForOne ? key.currency1 : key.currency0;
  const swap =
    layout === "legacy"
      ? encodeAbiParameters(
          [
            {
              type: "tuple",
              components: [
                { name: "poolKey", ...POOL_KEY_TYPE },
                { name: "zeroForOne", type: "bool" },
                { name: "amountIn", type: "uint128" },
                { name: "amountOutMinimum", type: "uint128" },
                { name: "hookData", type: "bytes" },
              ],
            },
          ],
          [{ poolKey: key, zeroForOne, amountIn: amountIn_, amountOutMinimum: amountOutMin, hookData: "0x" }],
        )
      : encodeAbiParameters(
          [
            {
              type: "tuple",
              components: [
                { name: "poolKey", ...POOL_KEY_TYPE },
                { name: "zeroForOne", type: "bool" },
                { name: "amountIn", type: "uint128" },
                { name: "amountOutMinimum", type: "uint128" },
                { name: "minHopPriceX36", type: "uint256" },
                { name: "hookData", type: "bytes" },
              ],
            },
          ],
          [
            {
              poolKey: key,
              zeroForOne,
              amountIn: amountIn_,
              amountOutMinimum: amountOutMin,
              minHopPriceX36: 0n,
              hookData: "0x",
            },
          ],
        );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [cIn, amountIn_]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [cOut, amountOutMin]);
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [swap, settle, take]]);
  return {
    commands: encodePacked(["uint8"], [V4.COMMAND_V4_SWAP]),
    inputs: [input],
    value: cIn === ZERO ? amountIn_ : 0n,
    cIn,
    cOut,
  };
}

// Robinhood Chain addresses (from loxley/cli/env.js)
export const ADDRESSES = {
  FACTORY: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const,
  LAUNCH_ROUTER: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" as const,
  PONS_HOOK: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044" as const,
  UNIVERSAL_ROUTER: "0x8876789976decbfcbbbe364623c63652db8c0904" as const,
  V4_QUOTER: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as const,
  V4_STATE_VIEW: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as const,
  V4_POOL_MANAGER: "0x8366a39cc670b4001a1121b8f6a443a643e40951" as const,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
  WETH: "0x0Bd7D308f3E1639FAb988df18A8011f41EAcAD73" as const,
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11" as const,
  UNISWAP_V2_ROUTER02: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" as const,
} as const;
