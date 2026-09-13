'use strict';
/* exit: what leaving costs right now, from the pool's reserve, or from the curve while there is no pool */
const { isAddr, readToken } = require('../token');
const E = require('../engine');

module.exports = async function exit(ctx) {
  const { ui, log, args, env } = ctx, C = ui.C;
  const token = args._[0], x = args._[1] != null ? parseFloat(args._[1]) : null;
  if (!isAddr(token)) { log.error('usage: loxley exit 0x… [eth]'); return 1; }
  log.dim('reading ' + token + '…');
  const T = await readToken(ctx, token, { xray: false, buyers: false });
  const sizes = x != null && x > 0 ? [x] : [0.1, 0.25, 0.5, 1, 3];
  log.raw('');
  if (T.pair) {
    const m = E.computeMetrics({ pair: T.pair, pairs: T.pairs, chain: T.view });
    log.raw(C.bold(C.white('$' + (T.symbol || '…'))) + C.dim('  pool ' + ui.fmtUsd(m.liq) + ' · reserve ' + (m.reserveSol == null ? 'n/a' : m.reserveSol.toFixed(2) + ' ETH') + ' · price ' + ui.fmtPrice(m.price)));
    if (m.reserveSol == null) { log.warn('the pool reserve could not be read, no exit maths'); return 1; }
    const rows = sizes.map(s => { const d = E.exitMaths(m.reserveSol, s); return [s + ' ETH', d.impact.toFixed(2) + '%', d.out.toFixed(4) + ' ETH', (d.impact > 10 ? C.red('moves the market, split it or leave earlier') : d.impact > 3 ? C.amber('noticeable, the tape will see you') : C.green('clean door'))]; });
    log.raw(ui.table(['sell', 'impact', 'you get', ''], rows));
    log.raw(''); log.raw(ui.kv([['safe size', m.safeSol.toFixed(3) + ' ETH' + C.dim('  the most that leaves with impact under 5%')], ['maths', C.dim('impact = x / (x + R) · out = x × (1 − impact) × 0.997')]]));
  } else if (T.launch && T.curve) {
    const mth = E.curveMaths(Object.assign({ thr: T.launch.thr, supply: T.supply }, T.curve), env.num('PHANTOM_ETH'));
    log.raw(C.bold(C.white('$' + (T.symbol || '…'))) + C.dim('  still on the curve · fill ' + (mth.fill == null ? 'n/a' : Math.round(mth.fill * 100) + '%') + ' · real quote ' + (T.curve.real == null ? 'n/a' : T.curve.real.toFixed(3) + ' ' + (T.pairSym || 'ETH')) + ' · fee ' + (mth.fee / 100).toFixed(1) + '% · creator tax ' + (mth.tax / 100).toFixed(1) + '%'));
    const rows = sizes.map(s => { const d = mth.door(s); return [s + ' ETH', d.impact.toFixed(2) + '%', d.out.toFixed(4) + ' ETH', d.impact > 10 ? C.red('the curve will feel it') : d.impact > 5 ? C.amber('wide') : C.green('clean')]; });
    log.raw(ui.table(['sell', 'impact', 'you get', ''], rows));
    log.raw(''); log.raw(ui.kv([['safe size', mth.safe.toFixed(3) + ' ETH' + C.dim('  under 5% impact on the curve')], ['maths', C.dim('constant product with a ' + env.PHANTOM_ETH + ' ETH phantom reserve (PHANTOM_ETH), an estimate')]]));
  } else { log.warn('no pool and no curve found for this address'); return 1; }
  return 0;
};
