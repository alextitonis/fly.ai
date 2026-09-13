'use strict';
/* snipe: the sniper. detect → read → decide → wait at full draw until the opening tax is under the ceiling →
   fire → mark with real quotes → leave on the desk's exit rules.
   on paper by default: every fill is imagined, every mark is real. with --live the fill is a signed curve buy
   from the wallet, marks are exact exit quotes, and exits are signed sells, on the curve or in the pool.
   --grad fires on graduation instead: the pool leg, the moment PoolGraduated lands. */
const fs = require('fs');
const { makeFeed } = require('../feed');
const { cardLines, refLine } = require('./hunt');
const { attachWallet, arm, parseEth, fmtEth } = require('../live');
const { makeSniper, rulesFrom, refuseText, exitsText } = require('../sniper');
const { makeNotifier } = require('../notify');
const { makeTrader } = require('../trade');

module.exports = async function snipe(ctx) {
  const { ui, log, flags, env, chain, sources } = ctx, C = ui.C;
  const live = !!flags.live, grad = !!flags.grad;
  if (live && flags.sim) { log.error('--live and --sim do not mix: the simulator has no chain to sign against. run the mock chain (npm run mock) for a live rehearsal.'); return 1; }
  if (grad && flags.sim) { log.error('--grad needs a chain with a v4 quoter; the simulator has none. npm run mock has one.'); return 1; }
  const rules = rulesFrom(ctx, live);
  if (!(rules.eth > 0)) { log.error('--eth must be a positive number'); return 1; }
  const forS = flags.for != null ? parseFloat(flags.for) : null, rec = flags.rec ? String(flags.rec) : null;
  const notify = makeNotifier(env, log);
  let T = null, wallet = null;
  const rl = refLine(ctx); if (rl) log.raw(rl);
  if (live) {
    wallet = await attachWallet(ctx, { need: true }); T = ctx.trader;
    const bal = await T.balance();
    const openNow = T.book.open_();
    const plan = [ui.badge('LIVE') + ' ' + C.red(C.bold('real ETH moves in this session.')) + C.dim(' every fill is a signed ' + (grad ? 'pool' : 'curve') + ' buy, every exit a signed sell.'), ui.kv([
      ['wallet', C.white(wallet.address) + C.dim('  ' + fmtEth(bal) + ' · ' + wallet.source)],
      ['per shot', C.white(rules.eth + ' ETH') + C.dim('  budget ' + rules.budget + ' ETH this session · max open ' + rules.maxOpen + (openNow.length ? ' · ' + openNow.length + ' already open in the book' : ''))],
      ['refuses', refuseText(ui, rules, live)],
      [grad ? 'trigger' : 'draw', grad ? 'PoolGraduated on a launch that passes the rules: a buy in the v4 pool at once' : 'waits until the opening tax is ≤ ' + rules.taxCeiling + ' bps, ' + (rules.drawMax / 1000) + ' s at most · slippage ' + rules.slippage + ' bps'],
      ['exits', exitsText(rules, live)],
      ['alerts', notify.on ? notify.where : C.dim('off (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, or DISCORD_WEBHOOK)')]
    ]), ''];
    if (bal < parseEth(rules.eth)) { plan.forEach(l => log.raw(l)); log.error('the wallet holds ' + fmtEth(bal) + ', less than one shot of ' + rules.eth + ' ETH'); return 1; }
    const ok = await arm(ctx, plan, 'fire'); if (!ok) return 3;
  } else {
    T = flags.sim ? null : makeTrader(ctx, null);
    log.raw(ui.wrap(ui.badge('PAPER') + C.dim(' every fire below is a paper position marked with real quotes. nothing is signed. --live arms the wallet.'), ui.cols() - 1, 8));
    log.raw(ui.kv([['per shot', rules.eth + ' ETH · budget ' + rules.budget + ' ETH · max open ' + rules.maxOpen], ['refuses', refuseText(ui, rules, live)], [grad ? 'trigger' : 'draw', grad ? 'PoolGraduated on a launch that passes the rules: a paper buy in the v4 pool, quoted by the quoter' : 'waits until the opening tax is ≤ ' + rules.taxCeiling + ' bps, ' + (rules.drawMax / 1000) + ' s at most'], ['exits', exitsText(rules, live)], ['alerts', notify.on ? notify.where : C.dim('off')]]));
  }
  log.raw('');
  const feed = makeFeed(ctx, { sim: !!flags.sim, window: flags.window != null ? parseInt(flags.window, 10) : undefined, who: live ? wallet.address : null });
  const S = makeSniper(ctx, rules, { live, trader: T, feed, notify, tag: grad ? 'grad' : 'snipe' });
  log.dim('reading the factory' + (flags.sim ? ' (simulator)' : '') + '…');
  const st = await feed.start();
  log.raw(ui.kv([['on record', st.index.launches.length + ' launches · ' + Object.keys(st.index.byDeployer).length + ' wallets' + (flags.sim ? ' · SIMULATED' : '')]]));
  log.raw(''); log.dim('waiting for ' + (grad ? 'graduations' : 'launches') + '…' + (forS ? ' (for ' + forS + ' s)' : ' ctrl+c ends the session' + (live ? (rules.exitOnStop ? ' and sells everything open' : '; open positions stay in the book') : ' and marks every open position')));
  S.startMarks(live ? Math.max(2, env.num('MARK_EVERY_S')) * 1000 : 5000);

  feed.on(async e => {
    if (grad) {
      if (e.kind !== 'grad') return;
      const launch = st.index.byToken[e.token]; if (!launch) { log.raw(ui.stamp() + '  ' + C.dim('grad  ') + C.dim(ui.short(e.token) + ' graduated, launch not in the window, skipped')); return; }
      let L; try { L = await feed.enrich(launch); } catch (err) { log.warn('unreadable ' + ui.short(e.token)); return; }
      L.graduated = true;
      await S.consider(L, { venue: 'pool', why: 'graduated', card: cardLines(ctx, L, { links: false }) });
      return;
    }
    if (e.kind !== 'launch') return;
    let L; try { L = await feed.enrich(e); } catch (err) { log.warn('unreadable launch ' + ui.short(e.token)); return; }
    await S.consider(L, { card: cardLines(ctx, L, { links: false }) });
  });
  await new Promise(res => { const stop = () => res(); process.on('SIGINT', stop); if (forS) setTimeout(stop, forS * 1000); });
  feed.stop();
  await S.finish();
  S.summary(wallet && wallet.address);
  if (rec) { try { fs.writeFileSync(rec, JSON.stringify({ loxley: 1, version: ctx.VERSION, kind: live ? 'live-session' : 'paper-session', mode: grad ? 'grad' : 'launch', recorded: new Date().toISOString(), rules, positions: S.P.positions.map(p => Object.assign({}, p, { L: undefined, hist: undefined, lastMark: undefined, book: p.book ? p.book.id : undefined, tokensWei: p.tokensWei == null ? undefined : String(p.tokensWei), devMoves: undefined })) }, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1)); log.ok('session written to ' + rec); } catch (e) { log.warn('could not write ' + rec); } }
  return 0;
};
