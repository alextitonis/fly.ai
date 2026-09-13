'use strict';
/* sim: made-up launches and a made-up pool, for --sim and for the desk when the chain is out of reach.
   every line the simulator produces is labelled SIM by the command that prints it. */
const SYMS = ['HOODCAT', 'SHERIFF', 'MARIAN', 'TUCK', 'NOTTS', 'ARROW', 'FEATHER', 'BOWSTRING', 'GREENWOOD', 'OUTLAW', 'QUIVER', 'LONGBOW', 'WARDEN', 'YEOMAN', 'MERRYMEN', 'GISBORNE', 'ALANDALE', 'TITHE', 'MAJOROAK', 'LOXLEY'];
const NAMES = { HOODCAT: 'Hood Cat', SHERIFF: 'Sheriff of Nottingham', MARIAN: 'Maid Marian', TUCK: 'Friar Tuck', NOTTS: 'Notts', ARROW: 'Broadhead', FEATHER: 'Feather', BOWSTRING: 'Bowstring', GREENWOOD: 'Greenwood', OUTLAW: 'Outlaw', QUIVER: 'Quiver', LONGBOW: 'Longbow', WARDEN: 'Warden', YEOMAN: 'Yeoman', MERRYMEN: 'Merry Men', GISBORNE: 'Guy of Gisborne', ALANDALE: 'Alan-a-Dale', TITHE: 'Tithe', MAJOROAK: 'Major Oak', LOXLEY: 'Robin of Loxley' };
let seed = 7;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function hexAddr(tag, i) { const s = (tag + i.toString(16)).padEnd(40, 'a').slice(0, 40); return '0x' + s; }

function makeSimFeed(opts) {
  opts = opts || {};
  const deployers = []; for (let i = 0; i < 9; i++) deployers.push(hexAddr('d' + i, i * 7919));
  let n = 0, bn = 53400000, head = bn;
  const curves = {};
  function launch(agoS) {
    const i = n++; const sym = SYMS[i % SYMS.length];
    const dep = deployers[i < 3 ? i : Math.floor(rnd() * deployers.length)];
    const token = hexAddr('7' + i, i * 104729), curve = hexAddr('c' + i, i * 15485863);
    const e = { kind: 'launch', token, curve, deployer: dep, pair: '0x0000000000000000000000000000000000000000', cfg: 0, thr: 4.2, bn: head - Math.round((agoS || 0) / 0.25), idx: 0, tx: '0x' + 'ab'.repeat(32), sim: true, at: Date.now() - (agoS || 0) * 1000, sym, name: NAMES[sym] || sym };
    const dev = rnd(), soc = rnd();
    curves[curve] = { real: rnd() * 0.4, tokenReserve: 1e9, feeBps: 100, creatorTaxBps: [0, 100, 200, 300, 700][Math.floor(rnd() * 5)], devShare: dev < 0.25 ? 0 : dev < 0.8 ? 1 + rnd() * 5 : 8 + rnd() * 10, buyers: Math.floor(rnd() * 14), taxed: 0, at: e.at, grad: false, supply: 1e9,
      socials: soc < 0.3 ? { count: 0, has: false, socials: {} } : { count: soc < 0.6 ? 1 : 2, has: true, socials: { twitter: 'https://x.com/' + sym.toLowerCase(), website: soc >= 0.6 ? 'https://' + sym.toLowerCase() + '.xyz' : null } },
      exempt: rnd() < 0.15 ? ['0x' + 'e1'.repeat(20), '0x' + 'e2'.repeat(20)] : [], bundlePct: rnd() < 0.2 ? 9 + rnd() * 12 : rnd() * 3, bundleWallets: 1 + Math.floor(rnd() * 4), top5Pct: 10 + rnd() * 40 };
    return e;
  }
  const backlog = [];
  [1500, 1100, 800, 600, 420, 300, 200, 130, 70, 20].forEach(a => backlog.push(launch(a)));
  backlog[1].grad = true; curves[backlog[1].curve].grad = true; curves[backlog[1].curve].real = 4.2;
  let nextAt = Date.now() + 4000 + rnd() * 6000;
  return {
    sim: true,
    backlog,
    head: () => head,
    tick() { head += 4; const out = []; if (Date.now() >= nextAt) { out.push(launch(0)); nextAt = Date.now() + 6000 + rnd() * 12000; }
      Object.keys(curves).forEach(k => { const c = curves[k]; if (!c.grad) { c.real = Math.min(4.2, c.real + rnd() * 0.02); c.tokenReserve = Math.max(4e8, c.tokenReserve - rnd() * 4e6); c.buyers += rnd() < 0.3 ? 1 : 0; if (c.real >= 4.2) { c.grad = true; out.push({ kind: 'grad', token: null, curve: k, bn: head, idx: 0, tx: '0x' + 'cd'.repeat(32), sim: true }); } } });
      return out; },
    curve(addr, thr) { const c = curves[addr]; if (!c) return { curve: addr, real: null }; return { curve: addr, real: c.real, tokenReserve: c.tokenReserve, graduated: c.grad, ready: c.real >= 4.2, feeBps: c.feeBps, creatorTaxBps: c.creatorTaxBps, phase: c.grad ? 3 : 1, taxBps: (Date.now() - c.at) < 3000 ? Math.round(9900 * Math.exp(-(Date.now() - c.at) / 700)) : 0, thr: thr || 4.2, supply: c.supply }; },
    /* the quote a dev sends for `share` % of a fresh curve, off the same constant product the rest of the tree uses:
       net = supply·share/100 · phantom / (supply − supply·share/100), then the curve fee and the creator tax added
       back on. at 3 % with a 1 % tax that is 0.0530 ETH, which with the 0.0005 launch fee is 0.0535. */
    devBuy(addr) {
      const c = curves[addr]; if (!c) return null;
      const s = c.devShare, net = s > 0 ? s * 1.68 / (100 - s) : 0;
      const quote = net / ((1 - c.feeBps / 1e4) * (1 - c.creatorTaxBps / 1e4));
      return { quote, tokens: c.supply * s / 100, share: s, n: s ? 1 : 0 };
    },
    buyers(addr) { const c = curves[addr]; return c ? { buys: c.buyers + (c.devShare ? 1 : 0), sells: Math.floor(c.buyers / 5), buyers: c.buyers, sellers: Math.floor(c.buyers / 5), taxed: Math.min(c.buyers, 2), quoteIn: c.real, quoteOut: c.real * 0.1, bundlePct: c.bundlePct, bundleWallets: c.bundleWallets, top5Pct: c.top5Pct, holders: c.buyers, devSells: 0 } : null; },
    info(addr) { const c = curves[addr]; return c ? { socials: c.socials, exempt: c.exempt, feeThird: false } : null; },
    tokenOf(e) { return { symbol: e.sym, name: e.name, decimals: 18, supply: 1e9 }; }
  };
}

/* a made-up pool that drifts, then drains, then dumps: the desk's simulator, one frame per call */
function makeSimPool(symbol, opts) {
  opts = opts || {};
  let t = 0, pr = 0.0024, liq = 145000, ethp = 4000, supply = 1e9;
  const token = '0xdead00000000000000000000000000000000beef';
  const rug = opts.rug !== false;
  function frame() {
    t += 1;
    const ph = !rug ? 'calm' : t < 30 ? 'calm' : t < 55 ? 'drain' : t < 75 ? 'dump' : 'dead';
    let buys, sells, m5v;
    if (ph === 'calm') { pr *= 1 + (rnd() * 0.016 - 0.007); liq *= 1 + (rnd() * 0.006 - 0.0025); buys = 9 + Math.round(rnd() * 12); sells = 7 + Math.round(rnd() * 9); m5v = 1500 + rnd() * 2500; }
    else if (ph === 'drain') { pr *= 0.990; liq *= 0.987; buys = 6 + Math.round(rnd() * 5); sells = 14 + Math.round(rnd() * 10); m5v = 2500 + rnd() * 3000; }
    else if (ph === 'dump') { pr *= 0.946; liq *= 0.952; buys = 2 + Math.round(rnd() * 4); sells = 26 + Math.round(rnd() * 16); m5v = 6000 + rnd() * 8000; }
    else { pr *= 0.985; liq *= 0.985; buys = Math.round(rnd() * 2); sells = 3 + Math.round(rnd() * 4); m5v = 200 + rnd() * 400; }
    return {
      chainId: 'robinhood', dexId: 'sim', pairAddress: '0xde30000000000000000000000000000000000001', url: null,
      baseToken: { address: token, name: 'Simulated ' + symbol, symbol }, quoteToken: { address: '0x0', symbol: 'WETH' },
      priceUsd: String(pr), priceNative: String(pr / ethp), liquidity: { usd: liq, quote: liq / (2 * ethp), base: liq / (2 * pr) },
      marketCap: pr * supply, fdv: pr * supply, volume: { h24: 520000, m5: m5v, h1: m5v * 9, h6: 170000 },
      priceChange: { m5: ph === 'calm' ? +(rnd() * 1.4 - 0.5).toFixed(2) : ph === 'drain' ? -3.9 : ph === 'dump' ? -16.4 : -2.3, h1: +((pr / 0.0024 - 1) * 100).toFixed(1), h6: -3.2, h24: +((pr / 0.0024 - 1) * 100 + 11).toFixed(1) },
      txns: { m5: { buys, sells }, h1: { buys: buys * 8, sells: sells * 8 }, h6: { buys: 1500, sells: 1390 }, h24: { buys: 3100, sells: 2900 } },
      pairCreatedAt: Date.now() - 26 * 3600000 - t * 8000, info: { socials: [{ type: 'twitter', url: 'https://x.com/example' }] }, sim: true, phase: ph
    };
  }
  const chain = { supply, decimals: 18, top10: 15.0, holdersKnown: true, holdersCount: 1840, verified: true,
    top: [{ address: '0xde30000000000000000000000000000000000001', amount: 3.0e7, pct: 3.0 }, { address: '0xa11ce', amount: 3.2e7, pct: 3.2 }, { address: '0xb0b', amount: 2.1e7, pct: 2.1 }, { address: '0xc0de', amount: 1.6e7, pct: 1.6 }] };
  return { token, frame, chain, sim: true };
}
module.exports = { makeSimFeed, makeSimPool, SYMS };
