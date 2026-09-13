'use strict';
/* the market the mock chain serves.
   These twelve rows are a real recording: the tokens DexScreener listed on Robinhood Chain on 2026-09-06 12:00 UTC
   with their deepest pool, taken from its own `token-boosts`, `token-profiles` and `tokens/v1` endpoints. Price,
   pooled value, 24 h volume, the 1 h and 24 h moves, the fdv, the pair's birthday and the day's buys and sells are
   the recorded figures. What the recording did not carry, and what is therefore apportioned here rather than
   measured, is the split of that day into shorter windows: the 5 m, 1 h and 6 h volume and trade counts are shares
   of the 24 h ones, and the 5 m and 6 h price moves are interpolated. Nothing else is invented.

   Two rows are quoted in a stock token rather than ether (TTWO, SPCX), which is the case the desk has to survive:
   `priceNative` on those pairs is priced in that token, so dividing by it would value a stock token as ether. It is
   why `market` takes one ether price from the median of the ETH-quoted pairs and prices every exit in dollars.

   The mock adds its own two pools to this list: $MOCK, the graduated fixture whose reserves the rpc side also
   answers for, and $THIN, a pool with $3.8K in it and four sells for every buy, so a table always has one row the
   rules refuse. */

/* sym, name, token, priceUsd, priceNative, liquidity usd, volume 24h, 1h %, 24h %, fdv, pair created (ms), buys 24h, sells 24h, quote symbol */
const ROWS = [
  ['CHUMP', 'Chump Coin', '0x0E0d2C89a5a019FE1cF762e5e33187631DACC21B', 0.04105, 0.00001667, 1172856.97, 2642116.16, 2.03, 31.09, 41053159, 1785462271000, 6943, 5683, 'WETH'],
  ['ORDIHOOD', 'Ordihood', '0xb27ac340261a8486b8f39dd23b8a95D434a071Bc', 0.0002710, 0.0000001079, 48308.06, 681010.28, -13.99, -11.75, 250131, 1788390600000, 2402, 1796, 'ETH'],
  ['CATSTRO', 'Fidel Catstro', '0x157A752F3446fe891d6e2881006813703fbB3aD9', 0.0001873, 0.00000007483, 40094.28, 1226018.9, -8.18, -82.02, 187322, 1788583835000, 4335, 4003, 'ETH'],
  ['WASTED', 'WASTED', '0x2bBd69Fc69dC9922f9f76142251D2827fD46188C', 0.0001942, 0.0000008711, 30683.13, 424073.14, -7.08, 632, 112932, 1788615636000, 2423, 1840, 'TTWO'],
  ['ORBIT', 'EnginesCreation', '0x62F1F3cf2c72bebdd4bc2C628ed1A03626761e18', 0.0001189, 0.0000007861, 79623.48, 81600.55, -38.92, -62.54, 118964, 1788590189000, 513, 402, 'SPCX'],
  ['ORE', 'Oreva', '0x8620b1ED6AB043b4dE85597B74C333e0DF50a63e', 0.0004069, 0.0000001658, 18684.77, 304435.12, -13.75, 456, 35811, 1788537324000, 1683, 1312, 'WETH'],
  ['QUOTA', 'Quota', '0x50aC4a09C6764B69F0132E283B059C8Ab1374b36', 0.00004074, 0.00000001628, 18700.21, 87874.49, 12.87, -65.68, 39373, 1788593453000, 590, 569, 'ETH'],
  ['RIG', 'Stock Miner', '0x3c31029d4Eb1CD8BCa6B26E03aF647dE5dfa943f', 0.00002422, 0.000000009676, 14421.38, 57475.15, 3.02, -22.19, 24192, 1788572975000, 422, 484, 'ETH'],
  ['Stocker', 'Stocker', '0x1F20837dAf4F566Ba0db16Ceb25F879fB411ab1c', 0.00001759, 0.000000007071, 12251.66, 1483591.57, 2.38, -97.23, 16921, 1788543461000, 5059, 6699, 'ETH'],
  ['Hx402', 'Hood X402', '0xbc406cc0b7855e51A023b7073861Ecd27da7A060', 0.0001530, 0.00000006112, 11792.87, 177840.62, -24.94, 100, 13617, 1788620401000, 1183, 1046, 'WETH'],
  ['BRRR', 'NVDA BRRR', '0x43b96E852E662033031770125F860aE03b473dC8', 0.000008186, 0.000000003290, 8118.92, 169597.95, -1.19, -31.14, 8187, 1788564387000, 2373, 718, 'ETH'],
  ['STOCKFATHER', 'The Stock Father', '0x5D1560f892470e01346165073383C04f4F39ae3E', 0.000005764, 0.000000002316, 7013.39, 10358.36, 0.27, -37.3, 5764, 1788545824000, 238, 137, 'ETH']
];

/* what the recording was taken at, so ages are read against it rather than against whenever the mock is started */
const SNAPSHOT_AT = 1788696000000;   /* 2026-09-06 12:00 UTC */

const QUOTE_ADDR = {
  WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', ETH: '0x0000000000000000000000000000000000000000',
  TTWO: '0x7a6f1e4bd2bb51a3ec4b6ad0b1c5c4a3a1e4d7c2', SPCX: '0x3fb2c1e0a9d51e7a31c0ffee4d2bb9f0e9a15c8d'
};

/* one DexScreener pair object per row. the h24 numbers are the recording; the shorter windows are shares of them */
function pairs(nowMs) {
  const drift = (nowMs || Date.now()) - SNAPSHOT_AT;
  return ROWS.map(r => {
    const [sym, name, token, price, native, liq, vol24, h1, h24, fdv, created, buys, sells, quote] = r;
    const quoteUsd = native > 0 ? price / native : 0;     /* what one unit of the quote token is worth in dollars */
    const share = (n, f) => Math.max(0, Math.round(n * f));
    return {
      chainId: 'robinhood', dexId: 'uniswap', pairAddress: (token.slice(0, 40) + 'a1').toLowerCase(),
      url: 'https://dexscreener.com/robinhood/' + token.toLowerCase(),
      baseToken: { address: token, name: name, symbol: sym },
      quoteToken: { address: QUOTE_ADDR[quote] || QUOTE_ADDR.ETH, symbol: quote },
      priceUsd: String(price), priceNative: String(native),
      liquidity: { usd: liq, quote: quoteUsd > 0 ? liq / 2 / quoteUsd : 0, base: liq / 2 / price },
      marketCap: fdv, fdv: fdv,
      volume: { h24: vol24, h6: vol24 * 0.45, h1: vol24 * 0.09, m5: vol24 * 0.008 },
      priceChange: { h24: h24, h6: (h24 + h1) / 2, h1: h1, m5: h1 / 12 },
      txns: {
        h24: { buys: buys, sells: sells },
        h6: { buys: share(buys, 0.45), sells: share(sells, 0.45) },
        h1: { buys: share(buys, 0.09), sells: share(sells, 0.09) },
        m5: { buys: share(buys, 0.008), sells: share(sells, 0.008) }
      },
      pairCreatedAt: created + drift,   /* held at the age it had when the recording was taken */
      info: { socials: [{ type: 'twitter', url: 'https://x.com/' + sym.toLowerCase() }] }
    };
  });
}

const addresses = () => ROWS.map(r => r[2]);
const ethUsd = () => {           /* the ether price the recording implies, from its ETH-quoted pairs only */
  const v = ROWS.filter(r => /^(ETH|WETH)$/i.test(r[13])).map(r => r[3] / r[4]).sort((a, b) => a - b);
  return v.length ? Math.round(v[Math.floor(v.length / 2)]) : 2500;
};

module.exports = { ROWS, SNAPSHOT_AT, pairs, addresses, ethUsd };
