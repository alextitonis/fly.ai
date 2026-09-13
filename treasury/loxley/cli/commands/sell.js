'use strict';
/* sell: what the wallet holds of a token, all of it or a part, on the curve or in the pool by phase.
   refuses while the launch is swept and the pool is not there yet: nothing trades in that gap. */
const { isAddr } = require('../token');
const { attachWallet, arm, parseTokens, explorerTx, applyExit, big, fmtEth, fmtTok, short } = require('../live');

module.exports = async function sell(ctx) {
  const { ui, log, args, env, flags } = ctx, C = ui.C;
  const token = args._[0], amountArg = args._[1] || 'all';
  if (!isAddr(token)) { log.error('usage: loxley sell 0x… [all|half|25%|1.5m] [--slippage 300] [--dry] [--yes]'); return 1; }
  const slippage = flags.slippage != null ? parseInt(flags.slippage, 10) : env.num('SLIPPAGE_BPS');
  await attachWallet(ctx, { need: true });
  const T = ctx.trader;
  log.dim('reading ' + token + ' as ' + ui.short(T.address) + '…');
  const [rec, meta, held] = await Promise.all([T.record(token), T.tokenMeta(token), T.tokenBalance(token)]);
  if (!rec) { log.error('the pons v2 factory has no record of ' + token); return 1; }
  if (held <= 0n) { log.error('the wallet holds no $' + (meta.symbol || 'tokens') + ' at ' + token); return 1; }
  let tokensWei; try { tokensWei = parseTokens(amountArg, held, meta.decimals); } catch (e) { log.error(e.message); return 1; }
  if (tokensWei <= 0n) { log.error('nothing to sell'); return 1; }
  const ph = Number(rec.phase);
  const q = await T.exitQuote(token, tokensWei, T.address);
  const open = T.book.byToken(token);
  const ethIn = open.reduce((s, p) => s + big(p.entry.ethWei), 0n), remAll = open.reduce((s, p) => s + big(p.remainingWei), 0n);
  const plan = [
    ['token', C.white('$' + (meta.symbol || '…')) + C.dim('  ' + token)],
    ['phase', ph === 0 ? C.green(rec.phaseText) : ph === 2 ? C.blue(rec.phaseText) : C.red(rec.phaseText)],
    ['held', fmtTok(held, meta.decimals) + C.dim(open.length ? '  ' + open.length + ' open position' + (open.length > 1 ? 's' : '') + ' in the book, ' + fmtEth(ethIn) + ' in' : '  no position in the book (bought elsewhere?)')],
    ['sell', C.white(fmtTok(tokensWei, meta.decimals)) + C.dim('  ' + (tokensWei === held ? 'everything' : (Number(tokensWei * 10000n / held) / 100).toFixed(1) + '% of it') + ' · slippage ' + slippage + ' bps')],
    ['venue', q.venue === 'curve' ? 'the curve ' + ui.short(rec.curve) : q.venue === 'pool' ? 'uniswap v4 behind the pons hook' : C.red('halted: ' + (q.note || rec.phaseText))],
    ['you get', q.ethOut == null ? C.red('n/a') : C.white(fmtEth(q.ethOut)) + C.dim('  at least ' + fmtEth(T.minOutFromRate(q.ethOut, BigInt(slippage))) + ' or the tx reverts' + (q.quote ? ' · fee ' + fmtEth(q.quote.fee, 6) + ' · creator tax ' + fmtEth(q.quote.tax, 6) : ''))]
  ];
  if (open.length && q.ethOut != null && remAll > 0n) { const share = ethIn * tokensWei / remAll; plan.push(['against entry', (q.ethOut >= share ? C.green : C.red)(((Number(q.ethOut) / Number(share) - 1) * 100).toFixed(1) + '%') + C.dim('  ' + fmtEth(share) + ' of the entry sits in these tokens')]); }
  if (q.venue === 'halted' || q.ethOut == null) { log.raw(ui.kv(plan)); log.error('cannot sell now: ' + (q.note || rec.phaseText) + '. loxley positions keeps watching; the pool leg opens at phase 2'); return 2; }
  if (flags.dry) { log.raw(ui.kv(plan)); log.raw(''); log.raw(ui.badge('DRY') + C.dim(' simulated only, nothing signed.')); return 0; }
  const ok = await arm(ctx, [ui.kv(plan), ''], 'sell');
  if (!ok) return 3;
  log.dim('approving if needed, simulating, signing, sending…');
  let r;
  try { r = await T.sellAnywhere({ token, record: rec, tokensWei, slippageBps: slippage }); }
  catch (e) { log.error('not filled: ' + short(e)); if (flags.debug) console.error(e); return 1; }
  const out = r.venue === 'curve' ? r.quoteOut : r.amountOut;
  const touched = applyExit(ctx, token, tokensWei, out, r.hash, flags.why || 'sell', r.venue);
  log.raw('');
  log.raw(ui.stamp() + '  ' + ui.badge('SOLD') + ' ' + C.white('$' + (meta.symbol || '…')) + '  ' + fmtTok(tokensWei, meta.decimals) + C.dim(' → ') + C.white(fmtEth(out)) + C.dim(' on the ' + r.venue + ' · ' + r.ms + ' ms · gas ' + fmtEth(r.gasWei, 6) + (r.approvals && r.approvals.length ? ' · ' + r.approvals.length + ' approval' + (r.approvals.length > 1 ? 's' : '') : '')));
  const rows = [['tx', C.blue(explorerTx(env, r.hash))]];
  touched.forEach(p => { const realised = big(p.realisedWei), inn = big(p.entry.ethWei), rem = big(p.remainingWei); rows.push([p.id, p.status === 'closed' ? ui.badge('CLOSED') + ' ' + (inn > 0n ? (realised >= inn ? C.green : C.red)(((Number(realised) / Number(inn) - 1) * 100).toFixed(1) + '%') + C.dim(' realised · ' + fmtEth(realised) + ' back for ' + fmtEth(inn)) : '') : C.dim('partial  ') + fmtEth(realised) + C.dim(' back so far of ' + fmtEth(inn) + ' in · ' + fmtTok(rem, p.decimals) + ' still held')]); });
  log.raw(ui.kv(rows));
  return 0;
};
