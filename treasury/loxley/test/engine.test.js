'use strict';
/* the maths, without a chain: node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../cli/engine');
const chain = require('../cli/chain');
const pad = a => '0x' + a.replace(/^0x/, '').padStart(64, '0');
const word = n => BigInt(n).toString(16).padStart(64, '0');

test('exit maths: impact, proceeds, safe size', () => {
  const d = E.exitMaths(15, 1);
  assert.ok(Math.abs(d.impact - 6.25) < 1e-9, 'impact of 1 into 15 is 6.25%');
  assert.ok(Math.abs(d.out - 1 * (1 - 0.0625) * 0.997) < 1e-9);
  assert.ok(Math.abs(d.safe - 15 * 0.05 / 0.95) < 1e-9);
  assert.equal(E.exitMaths(null, 1), null);
});

test('curve maths: price from phantom + real over the token reserve, fill from the threshold', () => {
  const m = E.curveMaths({ real: 2.1, tokenReserve: 8e8, thr: 4.2, feeBps: 100, creatorTaxBps: 200, supply: 1e9 }, 1.68);
  assert.ok(Math.abs(m.price - (1.68 + 2.1) / 8e8) < 1e-18);
  assert.ok(Math.abs(m.fill - 0.5) < 1e-9);
  assert.ok(Math.abs(m.fdv - m.price * 1e9) < 1e-9);
  const d = m.door(0.05);
  assert.ok(d.impact > 1 && d.impact < 2, 'a 0.05 ETH exit into 3.78 ETH of quote is ~1.3%');
  assert.ok(d.out < 0.05 && d.out > 0.047);
});

test('launch score: a clean launch fires, a farm skips', () => {
  const good = E.launchScore({ devShare: 3, creatorTaxBps: 100, pairIsEth: true, record: { launches: 2, grads: 1, twins: 0, rate: 0.5 }, buyers: 12, buys: 14, taxed: 2, fill: 0.6 });
  assert.equal(good.verdict, 'FIRE');
  assert.ok(good.total >= 75);
  const farm = E.launchScore({ devShare: 14, creatorTaxBps: 700, pairIsEth: true, record: { launches: 7, grads: 0, twins: 3, rate: 0 }, buyers: 3, buys: 3, taxed: 3 });
  assert.equal(farm.verdict, 'SKIP');
  assert.ok(farm.total < 45);
  const unread = E.launchScore({ devShare: null, creatorTaxBps: null, pairIsEth: true, record: null });
  assert.equal(unread.verdict, 'WATCH');
});

test('refusals name the rule', () => {
  const rules = { minScore: 70, ethPairsOnly: true, maxDevShare: 8, maxCreatorTax: 3, maxTwins: 1, open: 3, maxOpen: 3 };
  const L = { score: { total: 60 }, pairIsEth: false, pairSym: 'USDG', devShare: 9, creatorTaxBps: 400, record: { twins: 2 } };
  const why = E.refusals(L, rules);
  assert.equal(why.length, 6);
  assert.ok(why[0].startsWith('score 60 < 70'));
});

const pair = (liq, price, sells) => ({ chainId: 'robinhood', dexId: 'x', pairAddress: '0x2222222222222222222222222222222222222222', baseToken: { address: '0x1', symbol: 'T', name: 'T' }, quoteToken: { symbol: 'WETH' }, priceUsd: String(price), priceNative: String(price / 4000), liquidity: { usd: liq, quote: liq / 8000, base: 1e7 }, marketCap: price * 1e9, volume: { h24: 300000, m5: 1500, h1: 20000 }, priceChange: { m5: 0.1, h1: 1, h24: 5 }, txns: { m5: { buys: 20 - sells, sells }, h1: { buys: 200, sells: 190 }, h24: { buys: 2000, sells: 1800 } }, pairCreatedAt: Date.now() - 5 * 3600000, info: {} });
const view = { supply: 1e9, decimals: 18, top10: 9, holdersKnown: true, holdersCount: 900, verified: true, top: [{ address: '0x2222222222222222222222222222222222222222', amount: 1e7, pct: 1 }, { address: '0xa', amount: 3e7, pct: 3 }] };

test('survival index: a deep verified pool enters, a draining one is capped and sounds the siren', () => {
  const m0 = E.computeMetrics({ pair: pair(150000, 0.002, 8), pairs: [], chain: view });
  const s0 = E.scoreOf(m0, []);
  assert.equal(E.verdictKind(s0), 'enter');
  assert.ok(m0.topAdj < 5, 'the pool account is removed from the holder book');
  const t0 = Date.now() - 400000, hist = [];
  for (let i = 0; i < 40; i++) hist.push({ t: t0 + i * 10000, liq: 150000 * (1 - i * 0.012) });
  const m1 = E.computeMetrics({ pair: pair(hist[39].liq, 0.0015, 15), pairs: [], chain: view });
  const s1 = E.scoreOf(m1, hist);
  assert.ok(s1.total <= 30, 'drain cap holds the index down: ' + s1.total);
  assert.ok(s1.parts.some(p => p.k === 'drain cap'));
  const a = E.evalAlert(m1, hist);
  assert.equal(a.lvl, 'bad');
  assert.ok(/LIQUIDITY LEAVING|DRAIN PACE/.test(a.code));
  const v = E.verdictsOf(m1, hist);
  assert.equal(v.EXIT.state, 'bad');
});

test('hard flags cap the index and force AVOID', () => {
  const m = E.computeMetrics({ pair: pair(3000, 0.002, 8), pairs: [], chain: view });
  const s = E.scoreOf(m, []);
  assert.ok(s.hard.some(h => h.k === 'DUST LIQUIDITY'));
  assert.ok(s.total <= 34);
  assert.equal(E.verdictKind(s), 'avoid');
});

test('factory logs decode from topics and data', () => {
  const c = chain.makeChain({ RPC_URL: 'http://127.0.0.1:1', FACTORY: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e', num: () => 0, bool: () => false }, {});
  const lg = { blockNumber: '0x32ed1c0', logIndex: '0x3', transactionHash: '0xab', topics: [chain.T.LAUNCH, pad('0x1111111111111111111111111111111111111111'), pad('0xc111111111111111111111111111111111111111'), pad('0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1')], data: '0x' + word(0) + word(2) + word(4200000000000000000n) };
  const e = c.parseFactoryLog(lg);
  assert.equal(e.kind, 'launch'); assert.equal(e.token, '0x1111111111111111111111111111111111111111'); assert.equal(e.curve, '0xc111111111111111111111111111111111111111'); assert.equal(e.deployer, '0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1');
  assert.equal(e.pair, chain.ZERO); assert.equal(e.cfg, 2); assert.ok(Math.abs(e.thr - 4.2) < 1e-9); assert.equal(e.bn, 53400000);
  const g = c.parseFactoryLog({ blockNumber: '0x10', logIndex: '0x0', transactionHash: '0xcd', topics: [chain.T.GRAD, pad('0x1111111111111111111111111111111111111111')], data: '0x' + word(7) });
  assert.equal(g.kind, 'grad'); assert.equal(g.token, '0x1111111111111111111111111111111111111111');
  const b = c.parseFactoryLog({ address: '0xC111111111111111111111111111111111111111', blockNumber: '0x11', logIndex: '0x1', transactionHash: '0xee', topics: [chain.T.BUY, pad('0xb1'), pad('0xb1')], data: '0x' + word(10n ** 16n) + word(4n * 10n ** 24n) + word(10n ** 14n) + word(0) });
  assert.equal(b.kind, 'buy'); assert.ok(Math.abs(b.quote - 0.01) < 1e-12); assert.ok(Math.abs(b.tokens - 4e6) < 1e-3); assert.equal(b.tax, 0);
  const s = c.parseFactoryLog({ address: '0xc1', blockNumber: '0x12', logIndex: '0x1', transactionHash: '0xef', topics: [chain.T.SELL, pad('0xb1'), pad('0xb1')], data: '0x' + word(4n * 10n ** 24n) + word(10n ** 16n) + word(10n ** 14n) + word(0) });
  assert.equal(s.kind, 'sell'); assert.ok(Math.abs(s.quote - 0.01) < 1e-12, 'sell puts quote second'); assert.ok(Math.abs(s.tokens - 4e6) < 1e-3);
});

test('abi strings decode, dynamic and bytes32', () => {
  const dyn = '0x' + word(32) + word(4) + Buffer.from('MOCK').toString('hex').padEnd(64, '0');
  assert.equal(chain.decString(dyn), 'MOCK');
  assert.equal(chain.decString('0x' + Buffer.from('LOX').toString('hex').padEnd(64, '0')), 'LOX');
  assert.equal(chain.decString('0x'), null);
  assert.equal(chain.decUint('0x1237'), 4663);
  assert.equal(chain.decBool('0x' + word(1)), true);
});
