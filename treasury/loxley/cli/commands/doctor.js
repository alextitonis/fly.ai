'use strict';
/* doctor: is the chain there, does the explorer answer, is the factory where we think, how fast do blocks come,
   is there a wallet and does it hold anything, are the trading contracts where the desk expects them */
const { attachWallet, fmtEth } = require('../live');
module.exports = async function doctor(ctx) {
  const { env, chain, sources, ui, log, flags } = ctx;
  const C = ui.C, rows = [];
  const t0 = Date.now();
  /* two grades of check. a hard one is the chain itself: without it nothing reads and nothing signs, and the
     commands fall back to --sim. a soft one is a convenience that degrades on its own: the explorer fills the
     x-ray, dexscreener fills the market table, the wallet only matters when something is armed. A soft check
     that fails prints WARN and says what is lost, and never claims the chain is down. */
  const soft = [];
  const row = (name, ok, detail) => rows.push([ok === true ? ui.badge('OK') : ok === false ? ui.badge('FAIL') : ui.badge('WARN'), name, detail]);
  const softRow = (name, ok, detail, lost) => {
    rows.push([ok === true ? ui.badge('OK') : ui.badge('WARN'), name, detail]);
    if (ok !== true) soft.push(lost);
  };

  const cid = await chain.chainId().catch(e => ({ err: e.message }));
  if (cid && cid.err) row('rpc ' + env.RPC_URL, false, cid.err);
  else row('rpc ' + env.RPC_URL, String(cid) === String(env.CHAIN_ID), 'chain id ' + cid + (String(cid) === String(env.CHAIN_ID) ? '' : ', expected ' + env.CHAIN_ID) + ' · ' + (Date.now() - t0) + ' ms');

  let head = null;
  if (!(cid && cid.err)) {
    head = await chain.blockNumber().catch(() => null);
    const bt = head ? await chain.measureBlockTime(head) : null;
    row('head block', !!head, head ? head + ' · ' + (bt ? (bt.blockTime * 1000).toFixed(0) + ' ms per block over the last 400' : '') + (bt ? ' · sealed ' + ui.fmtAge(Date.now() - bt.headAt) + ' ago' : '') : 'no answer');
    const code = await chain.getCode(env.FACTORY);
    row('pons v2 factory ' + ui.short(env.FACTORY), code && code !== '0x' ? true : false, code && code !== '0x' ? (code.length / 2 - 1) + ' bytes of code' : 'no code at that address');
    if (head) {
      const logs = await chain.getLogs(chain.factory, [[chain.T.LAUNCH, chain.T.GRAD, chain.T.GRAD_ALT, chain.T.SWEPT]], Math.max(0, head - 2000), head).catch(e => ({ err: e.message }));
      if (logs && logs.err) row('factory logs, last 2000 blocks', false, logs.err);
      else { const l = logs.filter(x => (x.topics[0] || '').toLowerCase() === chain.T.LAUNCH).length, g = logs.length - l; row('factory logs, last 2000 blocks', true, l + ' launches · ' + g + ' graduations'); if (flags.probe && l) { const e = chain.parseFactoryLog(logs.find(x => (x.topics[0] || '').toLowerCase() === chain.T.LAUNCH)); const c = await chain.curveRead(e.curve, { full: true, tax: true }); row('curve probe ' + ui.short(e.curve), c.real != null, c.real != null ? 'real quote ' + c.real.toFixed(4) + ' · fee ' + (c.feeBps == null ? 'n/a' : c.feeBps / 100 + '%') + ' · creator tax ' + (c.creatorTaxBps == null ? 'n/a' : c.creatorTaxBps / 100 + '%') + ' · opening tax now ' + (c.taxBps == null ? 'n/a' : c.taxBps / 100 + '%') + ' · graduated ' + c.graduated : 'the curve did not answer realQuoteReserve()'); } }
    }
  }
  const st = await sources.ex.stats();
  const apiHost = sources.api.replace(/^https?:\/\//, '').replace(/\/api\/v2$/, '');
  softRow('explorer api ' + apiHost + (sources.hasKey() ? ' · keyed' : ''), !!st,
    st ? 'block ' + ui.fmtNum(parseFloat(st.total_blocks)) + (st.gas_prices && st.gas_prices.average != null ? ' · gas ' + st.gas_prices.average + ' gwei' : '') + (st.transactions_today ? ' · ' + ui.fmtNum(parseFloat(st.transactions_today)) + ' tx today' : '') : sources.why(sources.api),
    'the explorer api is not answering: the x-ray of a deployer, its transaction counts and the token page read n/a. the chain, the curves and every trade are unaffected. ' +
      (sources.hasKey() ? 'the key is set, so check it at dev.blockscout.com, or EXPLORER_API= another blockscout' : 'blockscout serves this chain behind a key: take a free one at dev.blockscout.com and put EXPLORER_API_KEY= in .env, or EXPLORER_API= your own blockscout'));
  const bx = await sources.dex.boosts();
  softRow('dexscreener ' + env.DEX_URL, Array.isArray(bx), Array.isArray(bx) ? bx.filter(x => x.chainId === env.CHAIN_SLUG).length + ' boosted tokens on ' + env.CHAIN_SLUG : sources.why(env.DEX_URL),
    'dexscreener is not answering: market has no table and the dollar prices read n/a. hunt, scan on a curve, snipe and every trade are unaffected');
  /* the wallet and the trading contracts */
  let w = null; try { w = await attachWallet(ctx, { need: false, noPrompt: true }); } catch (e) { row('wallet', false, e.message); }
  if (ctx.walletAddress) {
    let bal = null; try { bal = await ctx.trader.balance(ctx.walletAddress); } catch (e) { /* chain down */ }
    /* a wallet with nothing in it is a state, not a fault: everything reads, only the armed commands wait */
    row('wallet ' + ui.short(ctx.walletAddress), bal == null || bal === 0n ? null : true, (ctx.walletSource || '') + (bal == null ? ' · balance n/a' : ' · ' + fmtEth(bal) + (bal === 0n ? ' · reads and paper runs are fine; fund it before --live' : '')) + (ctx.walletLocked ? ' · locked (passphrase asked when it trades)' : ''));
    const open = ctx.trader.book.open_(); if (open.length) row('positions', null, open.length + ' open in the book · loxley positions');
  } else row('wallet', null, 'none · reads only. loxley wallet import, or PRIVATE_KEY= / MNEMONIC= in .env, arms buy, sell, snipe --live and watch --guard');
  if (!(cid && cid.err)) {
    const want = [['universal router', env.UNIVERSAL_ROUTER], ['v4 quoter', env.V4_QUOTER], ['v4 state view', env.V4_STATE_VIEW], ['permit2', env.PERMIT2]];
    const codes = await Promise.all(want.map(x => chain.getCode(x[1])));
    const missing = want.filter((x, i) => !codes[i] || codes[i] === '0x');
    softRow('pool leg contracts', missing.length === 0, missing.length ? 'no code at ' + missing.map(x => x[0]).join(', ') : 'router, quoter, state view and permit2 all have code',
      'a pool leg contract has no code: trading a graduated token would fail. curves are unaffected');
  }

  log.raw(ui.table(['', 'check', 'result'], rows));
  log.raw('');
  log.raw(ui.kv([['rpc calls', String(chain.rpc.stats.calls) + (chain.rpc.stats.rejected ? C.amber(' · ' + chain.rpc.stats.rejected + ' rejected') : '')], ['http calls', String(sources.stats.calls) + (sources.stats.fails ? C.amber(' · ' + sources.stats.fails + ' failed') : '')], ['phantom reserve', env.PHANTOM_ETH + ' ETH behind a fresh curve (PHANTOM_ETH)'], ['rules', 'paper ' + env.PAPER_ETH + ' ETH · live ' + env.LIVE_ETH + ' ETH per shot, ' + env.LIVE_BUDGET_ETH + ' ETH budget · min score ' + env.MIN_SCORE + ' · tax ceiling ' + env.TAX_CEILING_BPS + ' bps · slippage ' + env.SLIPPAGE_BPS + ' bps']]));
  const fails = rows.filter(r => ui.strip(r[0]).trim() === 'FAIL').length;
  log.raw('');
  if (fails) log.warn(fails + ' check' + (fails > 1 ? 's' : '') + ' failed. hunt, radar, watch and snipe run with --sim until the chain is back in reach.');
  else if (soft.length) {
    log.ok('the chain is there. ' + soft.length + ' thing' + (soft.length > 1 ? 's' : '') + ' to know, none of them stops a read or a trade:');
    soft.forEach(t => log.raw(ui.note(C.dim(t))));
  } else log.ok('all clear. loxley hunt to watch launches land, loxley snipe to rehearse on paper, loxley snipe --live when the wallet is funded.');
  return fails ? 1 : 0;
};
