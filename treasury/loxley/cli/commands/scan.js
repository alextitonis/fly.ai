'use strict';
/* scan: one token, everything the desk can read about it, in the order you would ask */
const { isAddr, readToken } = require('../token');
const E = require('../engine');
const { attachWallet, big, fmtEth, fmtTok } = require('../live');
const pons = require('../pons');

const AGENTS = ['SCOUT', 'AUDIT', 'WHALE', 'LP', 'FLOW', 'VOL', 'SNIPER', 'EXIT'];
const AGENT_READS = { SCOUT: 'pools, pair age', AUDIT: 'source, holders', WHALE: 'top-10 ex-pool', LP: 'depth', FLOW: 'buys vs sells 5m', VOL: 'volume honesty', SNIPER: 'impact of 1 ETH', EXIT: 'safe size, pool trend' };

function councilTable(ctx, m, score, verd) {
  const { ui } = ctx, C = ui.C;
  const rows = AGENTS.map(a => { const v = verd[a] || { state: 'na', text: 'n/a' }; const dot = ui.tone(v.state)('●'); return [dot + ' ' + a, C.dim(AGENT_READS[a]), ui.tone(v.state)(v.text)]; });
  return ui.table(['agent', 'reads', 'vote'], rows);
}
function scoreLines(ctx, score) {
  const { ui } = ctx, C = ui.C;
  return score.parts.map(p => '  ' + (p.v >= 0 ? C.green(ui.padStart('+' + p.v.toFixed(1), 6)) : C.red(ui.padStart(p.v.toFixed(1), 6))) + C.dim(' / ' + (p.max || '-')) + '  ' + p.k + C.dim(p.note ? '  ' + p.note : '')).join('\n');
}
function stampBadge(ui, kind) { return ui.badge(kind === 'enter' ? 'ENTER' : kind === 'avoid' ? 'AVOID' : 'CAREFUL'); }

module.exports = async function scan(ctx) {
  const { ui, log, args, env } = ctx, C = ui.C;
  const token = args._[0];
  if (!isAddr(token)) { log.error('usage: loxley scan 0x… (40 hex characters)'); return 1; }
  log.dim('reading ' + token + '…');
  const T = await readToken(ctx, token);
  const title = C.bold(C.white('$' + (T.symbol || '…'))) + (T.name ? C.dim('  ' + T.name) : '') + C.dim('  ' + token);
  log.raw(''); log.raw(title);
  const phase = T.pair ? 'pool' : T.launch ? (T.grad || (T.curve && T.curve.graduated) ? 'graduated, pool not indexed yet' : 'on the curve') : 'no launch, no pool';
  log.raw(ui.note(C.dim('phase ') + phase + (T.launch ? C.dim('  launched ') + ui.fmtAge(Date.now() - T.launchAt) + C.dim(' ago, block ' + T.launch.bn) : '') + C.dim('  supply ') + (T.supply ? ui.fmtNum(T.supply) : 'n/a')));

  /* the curve */
  if (T.launch) {
    const c = T.curve || {}, mth = E.curveMaths(Object.assign({ thr: T.launch.thr, supply: T.supply }, c), env.num('PHANTOM_ETH'));
    log.raw(''); log.raw(C.lime('  CURVE') + C.dim('  pons v2 · ' + ui.short(T.launch.curve)));
    const rows = [
      ['fill', mth.fill == null ? 'n/a' : ui.bar(mth.fill, 20) + '  ' + Math.round(mth.fill * 100) + '%' + C.dim('  ' + (c.real == null ? 'n/a' : c.real.toFixed(3)) + ' / ' + T.launch.thr.toFixed(2) + ' ' + (T.pairSym || 'ETH') + ' real quote')],
      ['pair', T.pairIsEth ? 'ETH' : C.blue(T.pairSym || T.launch.pair)],
      ['fee · creator tax', (c.feeBps == null ? 'n/a' : (c.feeBps / 100).toFixed(1) + '%') + ' · ' + (c.creatorTaxBps == null ? 'n/a' : (c.creatorTaxBps / 100).toFixed(1) + '%')],
      ['opening tax now', c.taxBps == null ? 'n/a' : (c.taxBps > 0 ? C.amber : C.green)((c.taxBps / 100).toFixed(2) + '%')],
      ['graduated', c.graduated == null ? (T.grad ? 'yes (PoolGraduated seen)' : 'n/a') : (c.graduated ? C.green('yes') + (T.grad ? C.dim(' · block ' + T.grad.bn) : '') : (c.ready ? C.amber('ready, not swept') : 'no'))],
      [mth.exact ? 'price' : 'price est', mth.price == null ? 'n/a' : mth.price.toExponential(3) + ' ETH' + C.dim('  fdv ' + (mth.fdv == null ? 'n/a' : mth.fdv.toFixed(2) + ' ETH') + (mth.exact ? '  (getReserves: ' + mth.phantom.toFixed(2) + ' ETH phantom + ' + (c.real == null ? '?' : c.real.toFixed(3)) + ' real)' : '  (phantom ' + env.PHANTOM_ETH + ' ETH assumed, PHANTOM_ETH)')) + (T.pair ? C.amber('  the curve is closed: the POOL block below is where this trades now') : '')]
    ];
    if (c.phase != null) rows.push(['phase()', String(c.phase)]);
    log.raw(ui.kv(rows, 4));
    if (!T.pair) {
      const door = [0.01, 0.05, 0.1, 0.5].map(x => { const d = mth.door(x); return [x + ' ETH', d.impact.toFixed(2) + '%', d.out.toFixed(4) + ' ETH', d.impact > 5 ? C.amber('wide') : C.green('clean')]; });
      log.raw(''); log.raw(C.dim('    the door on the curve' + (mth.exact ? '' : ', estimated') + ': selling x ETH worth now'));
      log.raw(ui.table(['sell', 'impact', 'you get', ''], door, 4));
    }
    log.raw(''); log.raw(C.lime('  LAUNCH'));
    const d = T.devBuy, b = T.buyers;
    /* what the launch declared about itself: socials from the token, the fee recipient from the factory record, the exempt wallets from the calldata */
    const [info, rec, declared] = await Promise.all([pons.tokenInfo(ctx.chain, token).catch(() => null), ctx.chain.factoryRecord(token).catch(() => null), pons.launchDeclared(ctx.chain, T.launch).catch(() => null)]);
    const soc = info || (declared && declared.socials ? { socials: declared.socials, count: Object.values(declared.socials).filter(Boolean).length } : null);
    const socText = soc == null ? C.dim('unread') : !soc.count ? C.amber('none declared') : Object.keys(soc.socials).filter(k => soc.socials[k]).map(k => C.white(k === 'twitter' ? 'x' : k) + C.dim(' ' + soc.socials[k])).join(C.dim(' · '));
    const feeRecipient = rec ? rec.feeRecipient : (declared && declared.creatorFeeRecipient) || null;
    const feeThird = feeRecipient != null && feeRecipient !== T.launch.deployer && feeRecipient !== ctx.chain.ZERO;
    const exempt = declared && declared.exempt ? declared.exempt : null;
    const K = pons.makeLinks(env);
    log.raw(ui.kv([
      ['deployer', ui.short(T.launch.deployer) + C.dim('  ' + T.launch.deployer)],
      ['socials', socText + ((info && info.description) || (declared && declared.description) ? C.dim('  "' + ((info && info.description) || declared.description).replace(/\s+/g, ' ').slice(0, 80) + '"') : '')],
      ['fees →', feeRecipient == null ? C.dim('n/a') : feeThird ? C.amber('third party ' + feeRecipient) : 'the deployer' + (rec && rec.creatorTaxBps != null ? C.dim('  creator tax ' + (rec.creatorTaxBps / 100).toFixed(1) + '%') : '')],
      ['exempt wallets', exempt == null ? C.dim('n/a (launch calldata unread)') : exempt.length ? C.red(exempt.length + ' declared exempt from the opening tax') + C.dim('  ' + exempt.map(a => ui.short(a)).join(' ')) : C.green('0') + C.dim('  no bundle declared in the launch calldata')],
      ['dev buy', d == null ? 'n/a' : d.n === 0 ? C.amber('none') : (d.share == null ? d.tokens.toExponential(2) + ' tokens' : (d.share > 10 ? C.red : C.white)(d.share.toFixed(2) + '% of supply')) + C.dim('  ' + d.quote.toFixed(4) + ' ' + (T.pairSym || 'ETH') + ' in the launch tx')],
      ['curve trades', b ? b.buys + ' buys · ' + b.sells + ' sells · ' + b.buyers + ' distinct buyer' + (b.buyers === 1 ? '' : 's') + (b.taxed ? C.dim(' · ' + b.taxed + ' paid the opening tax') : '') + C.dim('  in ' + b.quoteIn.toFixed(3) + ' · out ' + b.quoteOut.toFixed(3)) : 'n/a'],
      ['block-0 bundle', b && b.bundlePct != null ? (b.bundlePct > env.num('MAX_BUNDLE_PCT') ? C.red : C.white)(b.bundlePct.toFixed(2) + '% of supply') + C.dim(' taken in the launch block by ' + b.bundleWallets + ' wallet' + (b.bundleWallets === 1 ? '' : 's') + (b.top5Pct != null ? ' · top-5 buyers hold ' + b.top5Pct.toFixed(1) + '%' : '')) : 'n/a'],
      ['dev sold', b ? (b.devSells ? C.red(b.devSells + ' sell' + (b.devSells === 1 ? '' : 's') + (b.devSoldPct != null ? ' · ' + b.devSoldPct.toFixed(2) + '% of supply' : '')) : C.green('nothing on the curve')) : 'n/a'],
      ['launch tx', C.blue(ui.link(K.tx(T.launch.tx), K.tx(T.launch.tx)))],
      ['open', ui.hasLinks() ? [ui.link(K.pons(token), 'pons'), ui.link(K.axiom(T.launch.curve), 'axiom'), ui.link(K.fomo(token), 'fomo'), ui.link(K.explorer(token), 'explorer'), ui.link(K.dexscreener(token), 'dexscreener')].map(x => C.lime(x)).join(C.dim(' · ')) : C.blue(K.pons(token)) + '\n' + ' '.repeat(20) + C.blue(K.axiom(T.launch.curve)) + '\n' + ' '.repeat(20) + C.blue(K.fomo(token))]
    ], 4));
    const L = { devShare: d ? d.share : null, creatorTaxBps: c.creatorTaxBps, pairIsEth: T.pairIsEth, record: null, buyers: b ? b.buyers : null, buys: b ? b.buys : null, taxed: b ? b.taxed : null, fill: mth.fill, socials: soc == null ? undefined : soc, exempt, feeThird, bundlePct: b ? b.bundlePct : null, bundleWallets: b ? b.bundleWallets : null, top5Pct: b ? b.top5Pct : null };
    const ls = E.launchScore(L);
    log.raw(''); log.raw(ui.wrap('    ' + ui.badge(ls.verdict) + ' ' + C.bold(String(ls.total)) + C.dim('  launch score, deployer record not in this read (loxley hunt keeps one)'), ui.cols() - 1, 6));
    log.raw(scoreLines(ctx, { parts: ls.parts.map(p => ({ k: p.k, v: p.v, max: null, note: p.note })) }).replace(/ \/ -/g, ''));
  }

  /* the pool */
  if (T.pair) {
    const tok = { pair: T.pair, pairs: T.pairs, chain: T.view };
    const m = E.computeMetrics(tok), score = E.scoreOf(m, []), verd = E.verdictsOf(m, []), kind = E.verdictKind(score);
    log.raw(''); log.raw(C.lime('  POOL') + C.dim('  ' + (T.pair.dexId || 'dex') + ' · ' + (T.pair.quoteToken ? T.pair.quoteToken.symbol : '') + ' · ' + T.pairs.length + ' pool' + (T.pairs.length > 1 ? 's' : '') + ' on the chain'));
    log.raw(ui.kv([
      ['price', ui.fmtPrice(m.price) + C.dim('  ' + ui.fmtPct(m.chg5, 2) + ' 5m · ' + ui.fmtPct(m.chg1, 1) + ' 1h · ' + ui.fmtPct(m.chg24, 0) + ' 24h')],
      ['market cap · pool', ui.fmtUsd(m.mcap) + ' · ' + ui.fmtUsd(m.liq) + C.dim(m.liqRatio != null ? '  depth ' + (m.liqRatio * 100).toFixed(1) + '% of cap' : '')],
      ['reserve', m.reserveSol == null ? 'n/a' : m.reserveSol.toFixed(2) + ' ETH'],
      ['flow 5m · 1h', (m.tx5 ? Math.round((m.sell5 || 0) * 100) + '% sells of ' + m.tx5 : 'no trades') + ' · ' + (m.tx1 ? Math.round((m.sell1 || 0) * 100) + '% sells of ' + m.tx1 : 'no trades')],
      ['volume 24h', ui.fmtUsd(m.vol24) + C.dim(m.turnover != null ? '  turnover ' + m.turnover.toFixed(1) + 'x' + (m.avgTrade24 != null ? ' · avg ticket ' + ui.fmtUsd(m.avgTrade24) : '') : '')],
      ['holders', (m.holdersCount != null ? ui.fmtNum(m.holdersCount) + ' addresses' : 'n/a') + C.dim(m.topAdj != null ? '  top-10 ex-pool ' + m.topAdj.toFixed(1) + '%' + (m.poolHolders ? ' (' + m.poolHolders + ' pool account' + (m.poolHolders > 1 ? 's' : '') + ' removed)' : '') : (m.top10 != null ? '  top-10 ' + m.top10.toFixed(1) + '%' : ''))],
      ['source', m.verified === true ? C.green('verified on the explorer') : m.verified === false ? C.amber('not verified') : 'explorer n/a'],
      ['pair age', ui.fmtAge(m.ageMs)]
    ], 4));
    log.raw(''); log.raw(C.lime('  COUNCIL'));
    log.raw(councilTable(ctx, m, score, verd));
    log.raw(''); log.raw('    ' + stampBadge(ui, kind) + ' ' + C.bold(String(score.total)) + C.dim('  survival index'));
    log.raw(scoreLines(ctx, score));
    if (score.hard.length) score.hard.forEach(h => log.raw('    ' + C.red('■ ' + h.k) + C.dim('  ' + h.v)));
    const ex = [0.25, 1, 3].map(x => { const d = E.exitMaths(m.reserveSol, x); return d ? [x + ' ETH', d.impact.toFixed(2) + '%', d.out.toFixed(4) + ' ETH', d.impact > 10 ? C.red('moves the market') : d.impact > 3 ? C.amber('the tape will see you') : C.green('clean door')] : [x + ' ETH', 'n/a', 'n/a', '']; });
    log.raw(''); log.raw(C.lime('  EXIT') + C.dim('  from the reserve, 0.3% fee' + (m.safeSol != null ? ' · safe size ' + m.safeSol.toFixed(3) + ' ETH keeps impact under 5%' : '')));
    log.raw(ui.table(['sell', 'impact', 'you get', ''], ex, 4));
  } else if (!T.launch) {
    log.raw(''); log.warn('no pons v2 launch and no DexScreener pool for this address on ' + env.CHAIN_SLUG + '. is it a token?');
  } else if (!T.pair) {
    log.raw(''); log.raw(ui.note(C.dim('no pool yet: the council needs a graduated pool to vote. the curve section above is the whole story so far.')));
  }

  /* the deployer */
  const x = T.xray;
  log.raw(''); log.raw(C.lime('  X-RAY') + C.dim('  the wallet behind it'));
  if (!x) log.raw(C.dim('    the explorer had nothing on the deployer'));
  else {
    const tg = ctx.sources.xrayTag(x);
    log.raw(ui.kv([
      ['wallet', x.dep + '  ' + ui.badge(tg.t)],
      ['holds', (x.balance == null ? 'n/a' : (x.balance < 0.005 ? C.red : C.white)(x.balance.toFixed(4) + ' ETH')) + C.dim(x.ntx != null ? '  ' + ui.fmtNum(x.ntx) + ' tx' : '') + C.dim(x.ntt != null ? ' · ' + ui.fmtNum(x.ntt) + ' token transfers' : '')],
      ['launches', x.sample ? x.launches + ' in its last ' + x.sample + ' transactions' + (x.more ? C.dim(' (older pages not read)') : '') : 'explorer shows no transactions'],
      ['token born', x.born ? ui.fmtAge(Date.now() - x.born) + ' ago' : 'n/a'],
      ['last active', x.lastT ? ui.fmtAge(Date.now() - x.lastT) + ' ago' : 'n/a'],
      ['explorer', C.blue(env.EXPLORER_URL + '/address/' + x.dep)]
    ], 4));
  }
  /* the wallet: what it holds of this token, what leaving would fetch, what the book says */
  try { await attachWallet(ctx, { need: false, noPrompt: true }); } catch (e) { /* no wallet, no block */ }
  if (ctx.walletAddress && T.launch) {
    const tr = ctx.trader, who = ctx.walletAddress;
    log.raw(''); log.raw(C.lime('  WALLET') + C.dim('  ' + ui.short(who) + (ctx.walletLocked ? ' · keystore locked, reads only' : '')));
    try {
      const held = await tr.tokenBalance(token, who);
      if (held <= 0n) log.raw(ui.kv([['holds', C.dim('none of $' + (T.symbol || '…')) + C.dim('  loxley buy ' + token + ' ' + env.LIVE_ETH)]], 4));
      else {
        const q = await tr.exitQuote(token, held, who).catch(() => null);
        const open = tr.book.byToken(token), ethIn = open.reduce((s, p) => s + big(p.entry.ethWei), 0n), realised = open.reduce((s, p) => s + big(p.realisedWei), 0n);
        const rows = [['holds', C.white(fmtTok(held) + ' $' + (T.symbol || '…')) + C.dim(T.supply ? '  ' + (Number(held) / 1e18 / T.supply * 100).toFixed(3) + '% of supply' : '')],
          ['leaving now', q && q.ethOut != null ? C.white(fmtEth(q.ethOut)) + C.dim(' on the ' + q.venue) : C.red('n/a') + C.dim(q && q.note ? '  ' + q.note : '')]];
        if (open.length) rows.push(['book', open.map(p => p.id).join(', ') + C.dim(' · ' + fmtEth(ethIn) + ' in' + (realised > 0n ? ' · ' + fmtEth(realised) + ' already back' : '')) + (q && q.ethOut != null && ethIn > 0n ? '  ' + (realised + q.ethOut >= ethIn ? C.green : C.red)(ui.fmtPct((Number(realised + q.ethOut) / Number(ethIn) - 1) * 100, 1)) + C.dim(' if you leave now') : '')]);
        rows.push(['leave', C.lime('loxley sell ' + token + ' all') + C.dim(' · or loxley watch ' + token + ' --guard')]);
        log.raw(ui.kv(rows, 4));
      }
    } catch (e) { log.raw(C.dim('    the wallet block could not be read: ' + e.message)); }
  }
  log.raw(''); log.raw(ui.note(C.dim('open  ') + C.blue(env.EXPLORER_URL + '/token/' + token) + (T.pair && T.pair.url ? C.dim(' · ') + C.blue(T.pair.url) : '') + C.dim(' · desk ') + C.blue('index.html?token=' + token)));
  log.raw(ui.note(C.dim('' + ctx.chain.rpc.stats.calls + ' rpc calls · ' + ctx.sources.stats.calls + ' http calls · every one a read')));
  return 0;
};
module.exports.councilTable = councilTable;
module.exports.scoreLines = scoreLines;
module.exports.stampBadge = stampBadge;
