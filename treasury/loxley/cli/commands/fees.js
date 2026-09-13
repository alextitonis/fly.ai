'use strict';
/* fees: who is paid on a token, how much accrued from the curve and from the pool, every claim with a timestamp.
   read from the fee escrow's own Credited / Claimed events, not from anyone's api. */
const { isAddr, findLaunch } = require('../token');
const { makeEscrow } = require('../pons');
const { fmtEth } = require('../trade');

module.exports = async function fees(ctx) {
  const { ui, log, args, env, chain } = ctx, C = ui.C;
  const token = (args._[0] || '').toLowerCase();
  if (!isAddr(token)) { log.error('usage: loxley fees 0x…token'); return 1; }
  log.dim('reading ' + token + '…');
  const head = await chain.blockNumber();
  const [launch, rec] = await Promise.all([findLaunch(chain, token, head), chain.factoryRecord(token)]);
  if (!launch && !rec) { log.error('the factory has no launch for ' + token); return 1; }
  const deployer = (rec && rec.deployer) || (launch && launch.deployer), recipient = (rec && rec.feeRecipient) || deployer, curve = (rec && rec.curve) || (launch && launch.curve);
  const escrow = makeEscrow(chain, env);
  const from = launch ? launch.bn : Math.max(0, head - 400000);
  const [bal, credited, claimed, tk] = await Promise.all([escrow.balanceOf(recipient), escrow.credited(recipient, from, head), escrow.claimed(recipient, from, head), chain.tokenRead(token)]);
  const fromCurve = credited.filter(c => c.depositor === curve).reduce((s, c) => s + c.amount, 0n);
  const fromPool = credited.filter(c => c.depositor !== curve).reduce((s, c) => s + c.amount, 0n);
  const third = recipient && deployer && recipient !== deployer;
  log.raw('');
  log.raw(C.bold(C.white('$' + (tk.symbol || '…'))) + C.dim('  ' + token + (rec ? ' · phase ' + rec.phase + (rec.phase === 0 ? ' (on the curve)' : rec.phase === 2 ? ' (pool created)' : '') : '')));
  log.raw(ui.kv([
    ['recipient', C.white(recipient || 'n/a') + (third ? '  ' + C.amber('third party, not the deployer') + C.dim('  the builder / KOL deal in one word') : C.dim('  the deployer'))],
    ['deployer', deployer || 'n/a'],
    ['creator tax', rec && rec.creatorTaxBps != null ? (rec.creatorTaxBps / 100).toFixed(1) + '%' : 'n/a'],
    ['credited', fmtEth(fromCurve + fromPool) + C.dim('  from the curve ' + fmtEth(fromCurve) + ' · from the pool ' + fmtEth(fromPool) + ' · ' + credited.length + ' event' + (credited.length === 1 ? '' : 's'))],
    ['claimed', fmtEth(claimed.reduce((s, c) => s + c.amount, 0n)) + C.dim('  ' + claimed.length + ' claim' + (claimed.length === 1 ? '' : 's'))],
    ['unclaimed', bal == null ? 'n/a' : (bal > 0n ? C.green : C.dim)(fmtEth(bal)) + C.dim('  escrow balanceOf(recipient), this recipient across all of its tokens')],
    ['checks out', bal == null ? C.dim('no balance to check against') : (() => {
      const paid = claimed.reduce((s, c) => s + c.amount, 0n), diff = (fromCurve + fromPool) - paid - bal;
      const dust = 10000000000000n;   /* 0.00001 ETH: rounding in the events, not a discrepancy */
      if (diff > -dust && diff < dust) return C.green('yes') + C.dim('  credited − claimed = the escrow balance, so this window holds the whole story');
      return C.amber((diff > 0n ? '+' : '') + fmtEth(diff)) + C.dim('  credited − claimed − balance: the window starts at the launch block ' + (launch ? launch.bn : from) + ', so ' + (diff > 0n ? 'this much was claimed before it' : 'this much was credited before it') + ' on another of this recipient\'s tokens');
    })()]
  ]));
  if (claimed.length) {
    log.raw(''); log.raw(C.lime('  CLAIMS'));
    const rows = [];
    for (const c of claimed.slice(-10)) { const b = await chain.getBlock(c.bn).catch(() => null); rows.push([b ? new Date(b.timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'block ' + c.bn, fmtEth(c.amount), C.blue(env.EXPLORER_URL + '/tx/' + c.tx)]); }
    log.raw(ui.table(['when', 'amount', 'tx'], rows));
  }
  log.raw(''); log.raw(C.dim('  ' + chain.rpc.stats.calls + ' rpc calls · every one a read'));
  return 0;
};
