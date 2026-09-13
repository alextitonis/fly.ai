'use strict';
/* dev: one deployer, every launch by it in the window, with its phase. the record behind the deployer line. */
const { isAddr } = require('../token');
const { makeLinks } = require('../pons');

module.exports = async function dev(ctx) {
  const { ui, log, args, env, chain, flags } = ctx, C = ui.C, K = makeLinks(env);
  const who = (args._[0] || '').toLowerCase();
  if (!isAddr(who)) { log.error('usage: loxley dev 0x…deployer [--window 400000]'); return 1; }
  const head = await chain.blockNumber();
  const window = flags.window != null ? parseInt(flags.window, 10) : 400000;
  log.dim('reading every launch by ' + ui.short(who) + ' in the last ' + window + ' blocks…');
  const from = Math.max(0, head - window);
  const logs = await chain.getLogs(chain.factory, [chain.T.LAUNCH, null, null, '0x' + chain.dec.pad32(who)], from, head, { wide: true });
  const launches = logs.map(lg => chain.parseFactoryLog(lg)).filter(e => e && e.kind === 'launch');
  if (!launches.length) { log.raw(C.dim('  no launch by ' + who + ' in the last ' + window + ' blocks')); return 0; }
  const bt = await chain.measureBlockTime(head).catch(() => ({ blockTime: 0.25, headAt: Date.now() }));
  const rows = [];
  let grads = 0, swept = 0;
  /* the full address is 42 cells and the last column: under a hundred it is shortened rather than run off */
  const narrow = ui.cols() < 100;
  for (const e of launches.sort((a, b) => b.bn - a.bn).slice(0, 40)) {
    const [tk, rec] = await Promise.all([chain.tokenRead(e.token).catch(() => ({})), chain.factoryRecord(e.token).catch(() => null)]);
    const phase = rec ? rec.phase : null; if (phase === 2) grads++; if (phase === 1) swept++;
    const ph = phase == null ? C.dim('n/a') : phase === 0 ? 'on the curve' : phase === 1 ? C.amber('swept') : phase === 2 ? C.green('pool created') : C.red('rescued');
    rows.push([ui.fmtAge(bt.headAt - (head - e.bn) * bt.blockTime * 1000 > 0 ? Date.now() - (bt.headAt - (head - e.bn) * bt.blockTime * 1000) : 0) + ' ago', C.white('$' + (tk.symbol || '…')), ph, rec && rec.creatorTaxBps != null ? (rec.creatorTaxBps / 100).toFixed(1) + '%' : 'n/a', C.dim(ui.link(K.explorer(e.token), narrow ? ui.short(e.token) : e.token))]);
  }
  log.raw('');
  log.raw(ui.wrap(C.bold(C.white(who)) + '  ' + ui.badge(launches.length >= 5 && grads === 0 ? 'SERIAL' : launches.length >= 2 ? 'REPEAT' : 'FRESH') + C.dim('  ' + launches.length + ' launch' + (launches.length === 1 ? '' : 'es') + ' · ' + grads + ' graduated · ' + swept + ' swept · window ' + window + ' blocks'), ui.cols() - 1, 2));
  log.raw(ui.table(['when', 'token', 'phase', 'tax', 'address'], rows));
  log.raw(''); log.raw(C.dim('  open ') + C.blue(ui.link(K.address(who), K.address(who))));
  return 0;
};
