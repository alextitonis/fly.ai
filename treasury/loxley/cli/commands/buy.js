'use strict';
/* buy: one token, one amount of ETH, on the curve or in the pool, whichever phase the launch is in.
   the plan is printed, simulated, and sent only after the word. --dry stops after the plan. */
const { isAddr } = require('../token');
const { attachWallet, arm, parseEth, explorerTx, openPosition, fmtEth, fmtTok, short } = require('../live');
const { quoteBuy } = require('../trade');

module.exports = async function buy(ctx) {
  const { ui, log, args, env, flags } = ctx, C = ui.C;
  const token = args._[0], amount = args._[1] != null ? args._[1] : env.LIVE_ETH;
  if (!isAddr(token)) { log.error('usage: loxley buy 0x… <eth> [--slippage 300] [--max-tax 300] [--dry] [--yes]'); return 1; }
  let ethWei; try { ethWei = parseEth(amount); } catch (e) { log.error(e.message); return 1; }
  const slippage = flags.slippage != null ? parseInt(flags.slippage, 10) : env.num('SLIPPAGE_BPS');
  const maxTax = flags['max-tax'] != null ? parseInt(flags['max-tax'], 10) : env.num('TAX_CEILING_BPS');
  await attachWallet(ctx, { need: true });
  const T = ctx.trader;
  log.dim('reading ' + token + ' as ' + ui.short(T.address) + '…');
  const [rec, meta, bal] = await Promise.all([T.record(token), T.tokenMeta(token), T.balance()]);
  if (!rec) { log.error('the pons v2 factory has no record of ' + token + ': not a launch on this chain'); return 1; }
  const ph = Number(rec.phase);
  const head = [['token', C.white('$' + (meta.symbol || '…')) + C.dim('  ' + token)], ['phase', ph === 0 ? C.green(rec.phaseText) : ph === 2 ? C.blue(rec.phaseText) : C.red(rec.phaseText)], ['wallet', ui.short(T.address) + C.dim('  ' + fmtEth(bal))], ['spend', C.white(fmtEth(ethWei)) + C.dim('  slippage ' + slippage + ' bps')]];
  if (bal < ethWei) { log.raw(ui.kv(head)); log.error('the wallet holds ' + fmtEth(bal) + ', less than the ' + fmtEth(ethWei) + ' to spend (gas comes on top)'); return 1; }
  let plan, dry;
  try {
    if (ph === 0) {
      const s = await T.curveState(rec.curve, T.address);
      if (!s.isNativeQuote) { log.error('this launch is paired with ' + s.pairToken + ', not ETH. loxley buys ETH-paired curves only'); return 1; }
      const tax = s.openingTaxBps == null ? 0 : s.openingTaxBps;
      const q = quoteBuy(s, ethWei, tax);
      plan = head.concat([
        ['curve', ui.short(rec.curve) + C.dim('  fill ' + (s.fill == null ? 'n/a' : Math.round(s.fill * 100) + '%') + ' · ' + fmtEth(s.real, 3) + ' real of ' + fmtEth(s.threshold, 2) + ' · phantom ' + fmtEth(s.phantom, 2))],
        ['price', s.price == null ? 'n/a' : s.price.toExponential(3) + ' ETH' + C.dim('  exact, getReserves()')],
        ['fees', C.dim('curve ') + (Number(s.feeBps) / 100).toFixed(1) + '%' + C.dim('  creator ') + (Number(s.creatorTaxBps) / 100).toFixed(1) + '%' + C.dim('  opening tax now ') + (tax > maxTax ? C.red : tax > 0 ? C.amber : C.green)((tax / 100).toFixed(2) + '%')],
        ['you get', C.white(fmtTok(q.tokensOut, meta.decimals) + ' $' + (meta.symbol || '')) + C.dim('  at least ' + fmtTok(T.minOutFromRate(q.tokensOut, BigInt(slippage)), meta.decimals) + ' or the tx reverts' + (q.capped ? ' · capped at the sellable supply, ' + fmtEth(q.refund) + ' refunded' : ''))]
      ]);
      if (s.graduated || s.ready) { log.raw(ui.kv(plan)); log.error('the curve is ' + (s.graduated ? 'graduated' : 'ready to graduate') + ': no curve buys now, the pool comes next'); return 1; }
      if (tax > maxTax) { log.raw(ui.kv(plan)); log.error('the opening tax is ' + (tax / 100).toFixed(2) + '%, above the ceiling of ' + (maxTax / 100).toFixed(2) + '% (--max-tax to raise it, or wait: it decays)'); return 2; }
      dry = await T.buyCurve({ token, record: rec, state: s, ethWei, slippageBps: slippage, maxTaxBps: maxTax, dry: true });
    } else if (ph === 2) {
      dry = await T.swapPool({ token, record: rec, sell: false, amount: ethWei, slippageBps: slippage, dry: true });
      plan = head.concat([['pool', 'uniswap v4 behind the pons hook' + C.dim('  tick spacing ' + dry.key.tickSpacing + ' · fee ' + dry.key.fee)], ['you get', C.white(fmtTok(dry.amountOut, meta.decimals) + ' $' + (meta.symbol || '')) + C.dim('  at least ' + fmtTok(dry.minOut, meta.decimals) + ' or the tx reverts')]]);
    } else { log.raw(ui.kv(head)); log.error('trading is halted: ' + rec.phaseText + '. between the sweep and the pool nothing trades'); return 2; }
  } catch (e) { log.error(short(e)); return 1; }
  if (flags.dry) { log.raw(ui.kv(plan)); log.raw(''); log.raw(ui.badge('DRY') + C.dim(' simulated only, nothing signed. drop --dry to send it.')); return 0; }
  const ok = await arm(ctx, [ui.kv(plan), ''], 'buy');
  if (!ok) return 3;
  log.dim('simulating, signing, sending…');
  let r;
  try { r = ph === 0 ? await T.buyCurve({ token, record: rec, ethWei, slippageBps: slippage, maxTaxBps: maxTax }) : await T.swapPool({ token, record: rec, sell: false, amount: ethWei, slippageBps: slippage }); }
  catch (e) { log.error('not filled: ' + short(e)); if (flags.debug) console.error(e); return 1; }
  const got = ph === 0 ? r.tokensOut : r.amountOut;
  const p = openPosition(ctx, r, { token, symbol: meta.symbol, curve: rec.curve, decimals: meta.decimals, source: 'buy', taxBps: r.tax != null && r.quoteIn ? Number(r.tax * 10000n / r.quoteIn) : null, ethWei });
  log.raw('');
  log.raw(ui.stamp() + '  ' + ui.badge('FILLED') + ' ' + C.white('$' + (meta.symbol || '…')) + '  ' + fmtEth(ethWei) + C.dim(' → ') + C.white(fmtTok(got, meta.decimals)) + C.dim(' on the ' + r.venue + ' · ' + r.ms + ' ms · gas ' + fmtEth(r.gasWei, 6) + (r.approvals && r.approvals.length ? ' · ' + r.approvals.length + ' approval' + (r.approvals.length > 1 ? 's' : '') : '')));
  log.raw(ui.kv([['tx', C.blue(explorerTx(env, r.hash))], ['position', p.id + C.dim('  loxley positions · loxley sell ' + token + ' all')]]));
  return 0;
};
