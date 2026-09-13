'use strict';
/* xray: the wallet behind a token, or a wallet on its own */
const { isAddr, findLaunch } = require('../token');

module.exports = async function xray(ctx) {
  const { ui, log, args, env, sources, chain } = ctx, C = ui.C;
  const a = (args._[0] || '').toLowerCase();
  if (!isAddr(a)) { log.error('usage: loxley xray 0x… (a token or a wallet)'); return 1; }
  log.dim('reading ' + a + '…');
  const code = await chain.getCode(a).catch(() => null);
  const isContract = code && code !== '0x';
  let x, launch = null;
  if (isContract) { launch = await findLaunch(chain, a).catch(() => null); x = await sources.xray(a, launch ? { deployer: launch.deployer } : null); }
  else x = await sources.xray(null, { deployer: a });
  if (!x) { log.warn('the explorer had nothing on ' + (isContract ? 'the deployer of this contract' : 'this wallet')); return 1; }
  const tg = sources.xrayTag(x);
  log.raw('');
  log.raw(C.bold(C.white(isContract ? 'deployer of ' + ui.short(a) : 'wallet ' + ui.short(a))) + '  ' + ui.badge(tg.t) + (launch ? C.dim('  from the TokenLaunched event') : C.dim(isContract ? '  from the creation transaction' : '')));
  log.raw(ui.kv([
    ['wallet', x.dep],
    ['holds', (x.balance == null ? 'n/a' : (x.balance < 0.005 ? C.red : C.white)(x.balance.toFixed(4) + ' ETH')) + C.dim(x.ntx != null ? '  ' + ui.fmtNum(x.ntx) + ' transactions' : '') + C.dim(x.ntt != null ? ' · ' + ui.fmtNum(x.ntt) + ' token transfers' : '')],
    ['launches', x.sample ? x.launches + ' in its last ' + x.sample + ' transactions' + (x.more ? C.dim(' (older pages not read)') : '') + C.dim('  calls to the pons factory, the launch router, the launch deployer, and contract creations') : 'explorer shows no transactions'],
    ['verdict', tg.t === 'SERIAL' ? C.red('a production line, not a founder') : tg.t === 'REPEAT' ? C.amber('has done this before') : tg.t === 'FRESH HANDS' ? C.green('first launch in the sample') : C.dim('nothing to judge')],
    ['first seen', x.firstT ? ui.fmtAge(Date.now() - x.firstT) + ' ago' + C.dim(' (oldest of the sample)') : 'n/a'],
    ['last active', x.lastT ? ui.fmtAge(Date.now() - x.lastT) + ' ago' : 'n/a'],
    ['explorer', C.blue(env.EXPLORER_URL + '/address/' + x.dep)]
  ]));
  if (x.balance != null && x.balance < 0.005) log.raw('  ' + C.red('■ the wallet is nearly empty: whoever built this has nothing left in the game'));
  return 0;
};
