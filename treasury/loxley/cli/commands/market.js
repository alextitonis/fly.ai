'use strict';
/* market: what is trading on Robinhood Chain right now. DexScreener's own lists for the chain (the boosted tokens and
   the latest profiles), each token's deepest pool, and the desk's pool rules on what a pool answers: depth, flow, age,
   turnover, the wash flags. the explorer's two votes (source, holders) are `loxley scan`'s job, so a score here stops
   at 85 out of 100 and the footer says so. reads only. */
const E = require('../engine');
const { makeLinks } = require('../pons');

const MAX_SCORE = 85;   /* 100 minus the 15 points that need the explorer: contract 15 → 7.5, holders 15 → 7 */

module.exports = async function market(ctx) {
  const { ui, log, flags, env, sources } = ctx, C = ui.C, K = makeLinks(env);
  const json = !!flags.json, top = Math.max(1, parseInt(flags.top != null ? flags.top : 15, 10) || 15);
  const by = String(flags.by || 'liq');
  if (!json) log.dim('reading the pools on Robinhood Chain through ' + env.DEX_URL + '…');
  const [boosts, profiles] = await Promise.all([sources.dex.boosts(), sources.dex.profiles()]);
  const addrs = [];
  const push = a => { a = String(a || '').toLowerCase(); if (/^0x[0-9a-f]{40}$/.test(a) && addrs.indexOf(a) < 0) addrs.push(a); };
  (Array.isArray(boosts) ? boosts : []).forEach(b => { if (b && b.chainId === env.CHAIN_SLUG) push(b.tokenAddress); });
  (Array.isArray(profiles) ? profiles : []).forEach(b => { if (b && b.chainId === env.CHAIN_SLUG) push(b.tokenAddress); });
  String(flags.token || '').split(/[,\s]+/).forEach(push);
  if (!addrs.length) { log.error('DexScreener listed no token on ' + env.CHAIN_SLUG + ' (or did not answer). --token 0x… reads one directly.'); return 1; }
  const best = await sources.dex.pairsMany(addrs.slice(0, 90));
  const rows = [];
  Object.keys(best).forEach(k => {
    const p = best[k], m = E.computeMetrics({ pair: p, pairs: [p], chain: null }), score = E.scoreOf(m, []), kind = E.verdictKind(score);
    const quoteIsEth = /^(ETH|WETH)$/i.test(m.quote || '');
    rows.push({ token: k, pair: p.pairAddress, symbol: m.symbol, name: m.name, price: m.price, quoteUsd: m.solPrice, quoteIsEth, chg1: m.chg1, chg24: m.chg24, liq: m.liq, vol24: m.vol24, buys24: p.txns && p.txns.h24 ? p.txns.h24.buys || 0 : 0, sells24: p.txns && p.txns.h24 ? p.txns.h24.sells || 0 : 0, ageMs: m.ageMs, turnover: m.turnover, score: score.total, stamp: kind, hard: score.hard, quote: m.quote, dex: m.dex });
  });
  /* one ETH price for the whole table, from the ETH-quoted pairs only: on a TTWO or USDG pair priceNative is in
     that token, and dividing by it would price a stock token as ether. the median keeps one odd pair from moving it. */
  const eths = rows.filter(r => r.quoteIsEth && r.quoteUsd > 100 && r.quoteUsd < 100000).map(r => r.quoteUsd).sort((a, b) => a - b);
  const ethUsd = eths.length ? eths[Math.floor(eths.length / 2)] : null;
  /* what leaving costs: 1 ETH worth against half the pool, in dollars, so an ETH pair and a stock-token pair are
     measured the same way. x / (x + reserve), the constant-product impact the desk uses everywhere. */
  const exitUsd = ethUsd || 2500;
  rows.forEach(r => { r.exitPct = r.liq > 0 ? exitUsd / (exitUsd + r.liq / 2) * 100 : null; });
  const key = { liq: r => r.liq || 0, vol: r => r.vol24 || 0, age: r => -(r.ageMs || 0), change: r => r.chg24 || 0, score: r => r.score }[by] || (r => r.liq || 0);
  rows.sort((a, b) => key(b) - key(a));
  const shown = rows.slice(0, top);
  if (json) { shown.forEach(r => log.raw(JSON.stringify(Object.assign({ t: new Date().toISOString(), kind: 'market', exitEthUsd: exitUsd, maxScore: MAX_SCORE }, r)))); return 0; }
  log.raw('');
  log.raw(ui.wrap(C.lime(C.bold('  MARKET')) + C.dim('  Robinhood Chain · ' + rows.length + ' tokens on DexScreener\'s lists, ' + shown.length + ' shown by ' + by + (ethUsd ? ' · ETH $' + ethUsd.toFixed(0) : '') + ' · ' + new Date().toISOString().slice(11, 16) + ' UTC'), ui.cols() - 1, 10));
  log.raw('');
  /* the table fits the terminal for real: the optional columns are dropped one at a time, cheapest first, until the
     rendered table is inside the window. Measuring the built table is the only honest way to know, since a symbol
     with emoji or CJK in it is two cells wide and a price can be twenty characters long. */
  const w = ui.cols();
  const badge = r => ui.badge(r.stamp === 'enter' ? 'ENTER' : r.stamp === 'avoid' ? 'AVOID' : 'CAREFUL') + ' ' + ui.padStart(String(r.score), 2);
  const chg = v => v == null ? C.dim('n/a') : (v > 0 ? C.green : v < 0 ? C.red : C.dim)(v > 999 ? '+' + (v / 100).toFixed(0) + '×' : ui.fmtPct(v, 1));
  /* every column, and how readily it goes when the window is small. token, price, pool, the exit and the stamp are
     what the table is for, so they carry drop 0 and never go. */
  const COLS = [
    { k: 'token', drop: 0, cell: r => C.white(ui.link(K.dexscreener(r.token), '$' + ui.symbolOf(r.symbol, 11))) },
    { k: 'price', drop: 0, cell: r => ui.fmtPrice(r.price) },
    { k: '1h', drop: 6, cell: r => chg(r.chg1) },
    { k: '24h', drop: 5, cell: r => chg(r.chg24) },
    { k: 'pool', drop: 0, cell: r => ui.fmtUsd(r.liq) },
    { k: 'vol 24h', drop: 3, cell: r => ui.fmtUsd(r.vol24) },
    { k: 'flow 24h', drop: 4, cell: r => { const tx = r.buys24 + r.sells24, bs = tx ? r.buys24 / tx : null; return bs == null ? C.dim('no trades') : (bs >= 0.55 ? C.green : bs < 0.45 ? C.red : C.dim)(Math.round(bs * 100) + '% buys'); } },
    { k: 'age', drop: 2, cell: r => (r.ageMs == null ? C.dim('n/a') : ui.fmtAge(r.ageMs)) },
    { k: '1 ETH out', drop: 0, cell: r => (r.exitPct == null ? C.dim('n/a') : (r.exitPct > 10 ? C.red : r.exitPct > 5 ? C.amber : C.green)(r.exitPct.toFixed(1) + '%')) },
    { k: 'stamp', drop: 0, cell: badge },
    { k: 'address', drop: 7, cell: r => C.dim(ui.short(r.token)) }
  ];
  const build = keep => ui.table(COLS.filter(c => keep.indexOf(c.k) >= 0).map(c => c.k), shown.map(r => COLS.filter(c => keep.indexOf(c.k) >= 0).map(c => c.cell(r))));
  const tooWide = t => t.split('\n').some(l => ui.width(l) > w - 1);
  let keep = COLS.map(c => c.k), built = build(keep), dropped = [];
  for (let guard = 0; guard < COLS.length && tooWide(built); guard++) {
    const goes = COLS.filter(c => c.drop > 0 && keep.indexOf(c.k) >= 0).sort((a, b) => b.drop - a.drop)[0];
    if (!goes) break;
    keep = keep.filter(k => k !== goes.k); dropped.push(goes.k); built = build(keep);
  }
  log.raw(built);
  log.raw('');
  log.raw(ui.note(C.dim('1 ETH out: what selling ' + (ethUsd ? '1 ETH (' + ui.fmtUsd(exitUsd) + ')' : ui.fmtUsd(exitUsd)) + ' into that pool moves the price by, from half the pooled value. flow 24h: the buy share of the day\'s trades.')));
  log.raw(ui.note(C.dim('stamp: how easily you could leave, not whether the price goes up: depth, the buy share, the pair\'s age and whether the volume matches the pool. A token down 60% on the day can still have a pool you can exit.')));
  log.raw(ui.note(C.dim('it stops at ' + MAX_SCORE + '/100 here because the explorer\'s two votes (verified source, holder spread) need ' + C.lime('loxley scan <address>') + C.dim('.'))));
  if (dropped.length) log.raw(ui.note(C.dim('a wider terminal adds back: ' + dropped.slice().reverse().join(', '))));
  log.raw(ui.note(C.dim('--by liq|vol|age|change|score · --top N · --json · --token 0x…,0x… adds addresses DexScreener does not list · ' + sources.stats.calls + ' http calls, every one a read')));
  return 0;
};
