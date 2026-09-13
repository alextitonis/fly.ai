'use strict';
/* claim: take your creator fees out of the escrow. one transaction, from the wallet, after the word. */
const { attachWallet, arm, explorerTx, fmtEth, short } = require('../live');
const { makeEscrow } = require('../pons');

module.exports = async function claim(ctx) {
  const { ui, log, env, chain, flags } = ctx, C = ui.C;
  const w = await attachWallet(ctx, { need: true }), T = ctx.trader;
  const escrow = makeEscrow(chain, env);
  const bal = await escrow.balanceOf(w.address);
  log.raw(ui.kv([['wallet', C.white(w.address)], ['escrow', escrow.address], ['unclaimed', bal == null ? 'n/a' : (bal > 0n ? C.green : C.dim)(fmtEth(bal))]]));
  if (bal == null) { log.error('the escrow did not answer balanceOf()'); return 1; }
  if (bal === 0n) { log.raw(C.dim('  nothing to claim')); return 0; }
  if (flags.dry) { log.raw(''); log.raw(ui.badge('DRY') + C.dim(' claim() would move ' + fmtEth(bal) + ' to the wallet. nothing signed.')); return 0; }
  const ok = await arm(ctx, [''], 'claim'); if (!ok) return 3;
  log.dim('simulating, signing, sending…');
  try {
    const sim = await T.pub.simulateContract({ account: T.account, address: escrow.address, abi: escrow.ABI, functionName: 'claim' });
    const hash = await T.wc.writeContract(sim.request);
    const rc = await T.pub.waitForTransactionReceipt({ hash, timeout: env.num('TX_TIMEOUT_MS') });
    if (rc.status !== 'success') { log.error('claim reverted on chain: ' + hash); return 1; }
    log.raw(ui.stamp() + '  ' + ui.badge('OK') + ' ' + C.green('claimed ' + fmtEth(bal)) + C.dim('  gas ' + fmtEth(rc.gasUsed * (rc.effectiveGasPrice || 0n), 6)));
    log.raw(ui.kv([['tx', C.blue(explorerTx(env, hash))]]));
    return 0;
  } catch (e) { log.error('claim did not fill: ' + short(e)); return 1; }
};
