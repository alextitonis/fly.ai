'use strict';
/* follow: copy the entries of wallets you trust. every CurveBuy by one of them, on any curve, is read the moment
   it lands; the launch behind it goes through the same rules as the sniper's, then the desk mirrors the buy with
   its own size and leaves on its own exits. on paper by default, --live from the wallet. */
const fs = require('fs');
const { makeFeed } = require('../feed');
const { cardLines, refLine } = require('./hunt');
const { attachWallet, arm, parseEth, fmtEth } = require('../live');
const { makeSniper, rulesFrom, refuseText, exitsText } = require('../sniper');
const { makeNotifier } = require('../notify');
const { makeTrader } = require('../trade');
const { isAddr } = require('../token');
const { pad32 } = require('../chain');

module.exports = async function follow(ctx) {
  const { ui, log, flags, env, chain, args } = ctx, C = ui.C;
  const live = !!flags.live;
  const wallets = args._.join(',').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!wallets.length || wallets.some(w => !isAddr(w))) { log.error('usage: loxley follow 0xwallet [0xwallet…] [--live] [--eth X] [--any] [--for S]   (wallets separated by spaces or commas)'); return 1; }
  if (flags.sim) { log.error('follow reads real CurveBuy logs; the simulator has no wallets to follow. npm run mock has.'); return 1; }
  const rules = rulesFrom(ctx, live);
  const any = !!flags.any;   /* mirror without the rules: the wallet's judgement is the rule */
  const forS = flags.for != null ? parseFloat(flags.for) : null, rec = flags.rec ? String(flags.rec) : null;
  const notify = makeNotifier(env, log);
  let T = null, wallet = null;
  const rl = refLine(ctx); if (rl) log.raw(rl);
  const who = wallets.map(w => ui.short(w)).join(', ');
  if (live) {
    wallet = await attachWallet(ctx, { need: true }); T = ctx.trader;
    const bal = await T.balance();
    const plan = [ui.badge('LIVE') + ' ' + C.red(C.bold('real ETH moves in this session.')) + C.dim(' every mirror is a signed curve buy, every exit a signed sell.'), ui.kv([
      ['wallet', C.white(wallet.address) + C.dim('  ' + fmtEth(bal) + ' · ' + wallet.source)],
      ['following', C.white(who) + C.dim('  every CurveBuy they make, on any curve')],
      ['per mirror', C.white(rules.eth + ' ETH') + C.dim('  budget ' + rules.budget + ' ETH · max open ' + rules.maxOpen)],
      ['rules', any ? C.amber('none: --any mirrors whatever they buy') : refuseText(ui, rules, live)],
      ['draw', 'waits until the opening tax is ≤ ' + rules.taxCeiling + ' bps, ' + (rules.drawMax / 1000) + ' s at most · slippage ' + rules.slippage + ' bps'],
      ['exits', exitsText(rules, live)], ['alerts', notify.on ? notify.where : C.dim('off')]
    ]), ''];
    if (bal < parseEth(rules.eth)) { plan.forEach(l => log.raw(l)); log.error('the wallet holds ' + fmtEth(bal) + ', less than one mirror of ' + rules.eth + ' ETH'); return 1; }
    const ok = await arm(ctx, plan, 'follow'); if (!ok) return 3;
  } else {
    T = makeTrader(ctx, null);
    log.raw(ui.wrap(ui.badge('PAPER') + C.dim(' every mirror below is a paper position marked with real quotes. --live arms the wallet.'), ui.cols() - 1, 8));
    log.raw(ui.kv([['following', C.white(who) + C.dim('  every CurveBuy they make, on any curve')], ['per mirror', rules.eth + ' ETH · budget ' + rules.budget + ' ETH · max open ' + rules.maxOpen], ['rules', any ? C.amber('none: --any mirrors whatever they buy') : refuseText(ui, rules, live)], ['exits', exitsText(rules, live)]]));
  }
  log.raw('');
  const feed = makeFeed(ctx, { window: flags.window != null ? parseInt(flags.window, 10) : undefined, who: live ? wallet.address : null });
  const S = makeSniper(ctx, rules, { live, trader: T, feed, notify, tag: 'follow' });
  log.dim('reading the factory…');
  const st = await feed.start();
  const byCurve = {}; st.index.launches.forEach(e => { byCurve[e.curve] = e; });
  feed.on(e => { if (e.kind === 'launch') byCurve[e.curve] = e; });
  log.raw(ui.kv([['on record', st.index.launches.length + ' launches · ' + Object.keys(st.index.byDeployer).length + ' wallets']]));
  log.raw(''); log.dim('watching ' + wallets.length + ' wallet' + (wallets.length > 1 ? 's' : '') + '…' + (forS ? ' (for ' + forS + ' s)' : ' ctrl+c ends the session'));
  S.startMarks(live ? Math.max(2, env.num('MARK_EVERY_S')) * 1000 : 5000);

  /* the tracked wallets' buys: one topic-filtered log query per poll, no address filter, so any curve counts */
  const topics = [chain.T.BUY, wallets.map(w => '0x' + pad32(w))];
  let last = st.head, stop = false, seen = {};
  (async () => {
    while (!stop) {
      const t0 = Date.now();
      try {
        const head = await chain.blockNumber();
        if (head > last) {
          const logs = await chain.getLogs(undefined, topics, last + 1, head);
          last = head;
          for (const lg of logs) {
            const b = chain.parseFactoryLog(lg); if (!b || b.kind !== 'buy') continue;
            const key = lg.transactionHash + ':' + lg.logIndex; if (seen[key]) continue; seen[key] = 1;
            let launch = byCurve[b.curve];
            if (!launch) { /* a curve older than the window: ask the factory which launch it belongs to */
              const found = await chain.getLogs(chain.factory, [chain.T.LAUNCH, null, '0x' + pad32(b.curve)], Math.max(0, head - 400000), head, { wide: true }).catch(() => []);
              if (found.length) { launch = chain.parseFactoryLog(found[0]); byCurve[b.curve] = launch; }
            }
            if (!launch) { log.raw(ui.stamp() + '  ' + ui.badge('FOLLOW') + ' ' + C.dim(ui.short(b.who) + ' bought ' + (b.quote || 0).toFixed(4) + ' ETH on ' + ui.short(b.curve) + ', launch not found, skipped')); continue; }
            let L; try { L = await feed.enrich(launch); } catch (err) { log.warn('unreadable launch ' + ui.short(launch.token)); continue; }
            log.raw(ui.wrap(ui.stamp() + '  ' + ui.badge('FOLLOW') + ' ' + C.white(ui.short(b.who)) + C.dim(' bought ') + C.white((b.quote || 0).toFixed(4) + ' ETH') + C.dim(' of ') + C.white('$' + (L.symbol || '…')) + C.dim(' · block ' + b.bn + ' · tax paid ' + (b.tax || 0).toFixed(5) + ' ETH · ' + (Date.now() - t0) + ' ms after the poll'), ui.cols() - 1, 10));
            await S.consider(L, { skipRules: any, why: 'mirror of ' + ui.short(b.who), card: cardLines(ctx, L, { links: false }) });
          }
        }
      } catch (e) { log.warn('follow: ' + e.message); await chain.sleep(1500); }
      const wait = env.num('POLL_MS') - (Date.now() - t0); if (wait > 0 && !stop) await chain.sleep(wait);
    }
  })();
  await new Promise(res => { const end = () => res(); process.on('SIGINT', end); if (forS) setTimeout(end, forS * 1000); });
  stop = true; feed.stop();
  await S.finish();
  S.summary(wallet && wallet.address);
  if (rec) { try { fs.writeFileSync(rec, JSON.stringify({ loxley: 1, version: ctx.VERSION, kind: live ? 'live-session' : 'paper-session', mode: 'follow', wallets, recorded: new Date().toISOString(), rules, positions: S.P.positions.map(p => Object.assign({}, p, { L: undefined, hist: undefined, lastMark: undefined, book: p.book ? p.book.id : undefined, tokensWei: p.tokensWei == null ? undefined : String(p.tokensWei), devMoves: undefined })) }, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1)); log.ok('session written to ' + rec); } catch (e) { log.warn('could not write ' + rec); } }
  return 0;
};
