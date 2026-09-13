'use strict';
/* hunt: launches as they land, one card each, follow-ups at +15 s and +60 s */
const { makeFeed } = require('../feed');
const { makeLinks } = require('../pons');

/* the open: line every card ends with, clickable where the terminal allows it */
function openLine(ctx, L) {
  const { ui } = ctx, C = ui.C, K = makeLinks(ctx.env);
  return '          ' + C.dim('open: ') + [C.lime(ui.link(K.pons(L.token), 'pons')), C.lime(ui.link(K.axiom(L.curve), 'axiom')), C.lime(ui.link(K.fomo(L.token), 'fomo')), C.lime(ui.link(K.explorer(L.token), 'explorer')), C.lime(ui.link(K.dexscreener(L.token), 'dexscreener'))].join(C.dim(' · ')) + C.dim('  ctrl+click in Windows Terminal, iTerm2, kitty, VS Code');
}
/* the line under the banner: where to sign up, when the handles are set */
function refLine(ctx) {
  const { ui, env } = ctx, C = ui.C, K = makeLinks(env);
  const parts = [];
  if (K.signup.axiom) parts.push(C.dim('sign up ') + C.lime(ui.link(K.signup.axiom, 'axiom')));
  if (K.signup.fomo) parts.push(C.lime(ui.link(K.signup.fomo, 'fomo')));
  return parts.length ? '  ' + parts.join(C.dim(' · ')) : '';
}
function socialsText(ctx, L) {
  const C = ctx.ui.C;
  if (L.socials === undefined) return C.dim('unread');
  if (!L.socials || !L.socials.count) return C.amber('none');
  const s = L.socials.socials || {}, out = [];
  if (s.twitter) out.push(ctx.ui.link(s.twitter, 'x')); if (s.telegram) out.push(ctx.ui.link(s.telegram, 'tg')); if (s.website) out.push(ctx.ui.link(s.website, 'web')); if (s.discord) out.push(ctx.ui.link(s.discord, 'discord')); if (s.farcaster) out.push(ctx.ui.link(s.farcaster, 'farcaster'));
  return C.white(out.join(' '));
}
function cardLines(ctx, L, opts) {
  const { ui, env } = ctx, C = ui.C, m = L.maths || {}, K = makeLinks(env);
  const sym = C.bold(C.white(ui.link(K.axiom(L.curve), '$' + (L.symbol || '…')))), name = L.name ? C.dim(' ' + L.name.slice(0, 28)) : '';
  const v = L.score.verdict, badge = ui.badge(v) + ' ' + C.bold(String(L.score.total));
  const rec = L.record || {};
  const depNote = rec.launches <= 1 ? 'first in the window' : rec.launches + ' launches · ' + rec.grads + ' graduated' + (rec.twins ? ' · ' + rec.twins + ' twin' + (rec.twins > 1 ? 's' : '') + ' in 30 min' : '');
  const head = ui.stamp() + '  ' + sym + name + '  ' + C.dim(ui.link(K.fomo(L.token), L.token)) + '  ' + badge + (L.sim ? ' ' + ui.badge('SIM') : '') + (L.farm ? ' ' + ui.badge('FARM') : '');
  const l1 = '          ' + C.dim('deployer ') + ui.short(L.deployer) + C.dim('  ' + depNote) + (L.farm ? C.red('  launch farm: ' + L.farm + ' sibling' + (L.farm > 1 ? 's' : '') + ' inside 30 min') : '');
  const l1bHead = '          ' + C.dim('socials ') + socialsText(ctx, L) + C.dim('  fees → ') + (L.feeThird ? C.amber('third party ' + ui.short(L.feeRecipient)) : L.feeRecipient ? 'deployer' : C.dim('n/a')) + C.dim('  exempt wallets ') + (L.exempt == null ? C.dim('n/a') : L.exempt.length ? C.red(String(L.exempt.length) + ' declared') : C.green('0'));
  /* the deployer's own blurb takes whatever room is left on the line and no more, so the card never runs off */
  const blurbRoom = ui.cols() - 1 - ui.width(l1bHead) - 2;
  const blurb = L.description ? L.description.replace(/\s+/g, ' ').trim() : '';
  const l1b = l1bHead + (blurb && blurbRoom > 12 ? C.dim('  ' + (ui.width(blurb) > blurbRoom ? blurb.slice(0, Math.max(0, blurbRoom - 1)) + '…' : blurb)) : '');
  const tax = L.taxBps == null ? 'n/a' : (L.taxBps / 100).toFixed(L.taxBps >= 100 ? 0 : 2) + '%';
  const l2 = '          ' + C.dim('dev buy ') + (L.devShare == null ? 'n/a' : (L.devShare === 0 ? C.amber('none') : (L.devShare > 10 ? C.red : C.white)(L.devShare.toFixed(2) + '%')) + (L.devQuote ? C.dim(' (' + L.devQuote.toFixed(4) + ' ETH)') : '')) +
    C.dim('  creator tax ') + (L.creatorTaxBps == null ? 'n/a' : (L.creatorTaxBps > 500 ? C.red : C.white)((L.creatorTaxBps / 100).toFixed(1) + '%')) + C.dim('  fee ') + (L.feeBps == null ? 'n/a' : (L.feeBps / 100).toFixed(1) + '%') +
    C.dim('  pair ') + (L.pairIsEth ? 'ETH' : C.blue(L.pairSym || 'not ETH')) + C.dim('  opening tax now ') + (L.taxBps > 1000 ? C.red(tax) : L.taxBps > 0 ? C.amber(tax) : C.green(tax));
  const fill = L.fill == null ? null : L.fill;
  const l3 = '          ' + C.dim('curve ') + (fill == null ? 'n/a' : ui.bar(fill, 12) + ' ' + Math.round(fill * 100) + '%') + C.dim(' · ') + (L.real == null ? 'n/a' : L.real.toFixed(2) + '/' + (L.thr || 0).toFixed(2) + ' ETH') +
    (m.fdv != null ? C.dim(' · fdv ') + m.fdv.toFixed(2) + ' ETH' + (m.exact ? '' : C.dim(' est')) : '') + (L.graduated ? '  ' + ui.badge('GRAD') : '');
  const d = m.door ? m.door(0.05) : null;
  const l4 = '          ' + C.dim('door  ') + (d ? '0.05 ETH leaves at ' + (d.impact > 5 ? C.amber : C.green)(d.impact.toFixed(2) + '% impact') + C.dim(' · gets ') + d.out.toFixed(4) + ' ETH' + C.dim(' · safe ') + m.safe.toFixed(3) + ' ETH' + C.dim(' · ' + (m.fee / 100).toFixed(1) + '% fee + ' + (m.tax / 100).toFixed(1) + '% tax') : 'n/a');
  const l5 = ui.joinWrap('          ' + C.dim('score '), L.score.parts.map(p => (p.v > 0 ? C.green('+' + p.v) : p.v < 0 ? C.red(String(p.v)) : C.dim('0')) + ' ' + C.dim(p.k + (p.note ? ' ' + p.note : ''))), C.faint(' · '), 16);
  /* every line of the card hangs under the card's own indent, so a narrow window folds it rather than losing it */
  const fold = l => ui.wrap(l, ui.cols() - 1, 12);
  const out = [head, l1, l1b, l2, l3, l4].map(fold).concat([l5]);   /* l5 wraps itself, part by part */
  if (opts && opts.links !== false) out.push(openLine(ctx, L));
  if (L.readMs != null && !(opts && opts.noRead)) out.push('          ' + C.faint('read in ' + L.readMs + ' ms'));
  return out;
}
function followLine(ctx, L, tag) {
  const { ui } = ctx, C = ui.C;
  const bundle = L.bundlePct == null ? '' : C.dim(' · block-0 ') + (L.bundlePct > 8 ? C.red : C.dim)(L.bundlePct.toFixed(1) + '%' + (L.bundleWallets ? ' / ' + L.bundleWallets + 'w' : ''));
  const top5 = L.top5Pct == null ? '' : C.dim(' · top-5 ') + (L.top5Pct > 40 ? C.amber : C.dim)(L.top5Pct.toFixed(0) + '%');
  const dev = L.devSells ? C.red(' · dev sold ' + (L.devSoldPct != null ? L.devSoldPct.toFixed(2) + '%' : L.devSells + 'x')) : '';
  return ui.wrap(ui.stamp() + '  ' + C.dim(tag) + ' ' + C.white('$' + (L.symbol || '…')) + C.dim('  curve ') + (L.fill == null ? 'n/a' : Math.round(L.fill * 100) + '%') + C.dim(' · ') + (L.buyers == null ? '' : L.buyers + ' buyer' + (L.buyers === 1 ? '' : 's') + (L.taxed ? C.dim(' · ' + L.taxed + ' taxed') : '') + C.dim(' · ')) + (L.sells ? L.sells + ' sells' + C.dim(' · ') : '') + ui.badge(L.score.verdict) + ' ' + L.score.total + bundle + top5 + dev + (L.graduated ? '  ' + ui.badge('GRAD') : ''), ui.cols() - 1, 12);
}
function gradLine(ctx, e, L) {
  const { ui } = ctx, C = ui.C;
  return ui.stamp() + '  ' + ui.badge('GRAD') + ' ' + C.white('$' + ((L && L.symbol) || ui.short(e.token))) + C.dim(' graduated: the curve is closed, a pool exists. ') + C.lime('loxley watch ' + e.token);
}

module.exports = async function hunt(ctx, hooks) {
  const { ui, log, flags, env, chain } = ctx, C = ui.C;
  const feed = makeFeed(ctx, { sim: !!flags.sim, window: flags.window != null ? parseInt(flags.window, 10) : undefined });
  const json = !!flags.json, fireOnly = !!flags['fire-only'], follow = flags.follow !== false;
  const minScore = flags['min-score'] != null ? parseFloat(flags['min-score']) : 0;
  const forS = flags.for != null ? parseFloat(flags.for) : null;
  const seen = {}, timers = [];
  if (!json) log.dim('reading the factory' + (flags.sim ? ' (simulator)' : ' at ' + ui.short(env.FACTORY) + ' through ' + env.RPC_URL) + '…');
  const st = await feed.start();
  const idx = st.index, deps = Object.keys(idx.byDeployer).length, grads = idx.launches.filter(e => e.grad).length;
  if (!json) {
    const rl = refLine(ctx); if (rl) log.raw(rl);
    log.raw(ui.kv([['feed', (flags.sim ? 'simulated launches' : 'pons v2 factory logs, polled every ' + env.POLL_MS + ' ms')], ['window', flags.sim ? 'backlog' : (st.index.to - st.index.from) + ' blocks · ' + (st.blockTime * 1000).toFixed(0) + ' ms per block'], ['on record', idx.launches.length + ' launches · ' + grads + ' graduated · ' + deps + ' wallets'], ['rules', 'FIRE ≥ 75 · WATCH ≥ 45 · SKIP below' + (minScore ? ' · showing ≥ ' + minScore : '') + (fireOnly ? ' · fire only' : '')]]));
    log.raw('');
  }
  const emitJson = o => log.raw(JSON.stringify(o));
  const strip = L => ({ t: new Date().toISOString(), kind: 'launch', token: L.token, curve: L.curve, deployer: L.deployer, symbol: L.symbol, name: L.name, pair: L.pairSym, devShare: L.devShare, creatorTaxBps: L.creatorTaxBps, feeBps: L.feeBps, openingTaxBps: L.taxBps, fill: L.fill, real: L.real, thr: L.thr, fdvEth: L.maths && L.maths.fdv, record: L.record, buyers: L.buyers, taxed: L.taxed, socials: L.socials ? L.socials.socials : null, description: L.description || null, exempt: L.exempt, feeRecipient: L.feeRecipient, feeThird: !!L.feeThird, farm: L.farm || 0, bundlePct: L.bundlePct, bundleWallets: L.bundleWallets, top5Pct: L.top5Pct, devSells: L.devSells, score: L.score.total, verdict: L.score.verdict, reasons: L.score.parts, readMs: L.readMs, sim: !!L.sim, bn: L.bn, tx: L.tx });

  /* the newest launches on record, so the screen is not empty while the next one lands */
  const backlog = idx.launches.slice(0, flags.sim ? 4 : 3);
  for (const e of backlog.reverse()) {
    try { const L = await feed.enrich(e); seen[e.token] = L; if (fireOnly && L.score.verdict !== 'FIRE') continue; if (L.score.total < minScore) continue; if (json) emitJson(Object.assign(strip(L), { backlog: true })); else { log.raw(C.dim('  on record · ' + ui.fmtAge(Date.now() - (e.at || Date.now())) + ' ago')); log.raw(cardLines(ctx, L, { links: false }).join('\n')); log.raw(''); } } catch (err) { log.warn('could not read ' + ui.short(e.token) + ': ' + err.message); }
  }
  if (!json) log.dim('listening for the next launch…' + (forS ? ' (for ' + forS + ' s)' : ' ctrl+c to stop'));

  feed.on(async e => {
    if (e.kind === 'grad') { const L = seen[e.token]; if (json) emitJson({ t: new Date().toISOString(), kind: 'grad', token: e.token, symbol: L && L.symbol, bn: e.bn }); else log.raw(gradLine(ctx, e, L)); if (hooks && hooks.onGrad) hooks.onGrad(e, L); return; }
    if (e.kind === 'swept') { const L = seen[e.token]; if (json) emitJson({ t: new Date().toISOString(), kind: 'swept', token: e.token, symbol: L && L.symbol, bn: e.bn, quoteOut: e.quoteOut }); else log.raw(ui.stamp() + '  ' + ui.badge('SWEPT') + ' ' + C.white('$' + ((L && L.symbol) || ui.short(e.token))) + C.dim(' the curve is swept' + (e.quoteOut != null ? ' (' + e.quoteOut.toFixed(3) + ' ETH out)' : '') + ': nothing trades until PoolGraduated lands')); return; }
    if (e.kind !== 'launch') return;
    let L;
    try { L = await feed.enrich(e); } catch (err) { log.warn('unreadable launch ' + ui.short(e.token) + ': ' + err.message); return; }
    seen[e.token] = L;
    if (hooks && hooks.onLaunch) hooks.onLaunch(L);
    const show = (!fireOnly || L.score.verdict === 'FIRE') && L.score.total >= minScore;
    if (show) { if (json) emitJson(strip(L)); else { log.raw(cardLines(ctx, L).join('\n')); log.raw(''); } }
    if (follow) {
      [15000, 60000].forEach((ms, i) => timers.push(setTimeout(async () => {
        try { await feed.followUp(L); } catch (err) { return; }
        if (hooks && hooks.onFollow) hooks.onFollow(L, i ? 60 : 15);
        if (!show && !(fireOnly && L.score.verdict === 'FIRE')) return;
        if (json) emitJson(Object.assign(strip(L), { kind: 'follow', after: i ? 60 : 15 })); else log.raw(followLine(ctx, L, '+' + (i ? '60' : '15') + 's'));
      }, ms)));
    }
  });
  await new Promise(res => { const stop = () => { feed.stop(); timers.forEach(clearTimeout); res(); }; process.on('SIGINT', stop); if (forS) setTimeout(stop, forS * 1000); if (hooks && hooks.stopper) hooks.stopper(stop); });
  if (!json) log.raw(''), log.dim('feed closed · ' + st.events + ' event' + (st.events === 1 ? '' : 's') + ' · ' + chain.rpc.stats.calls + ' rpc calls' + (chain.rpc.stats.rejected ? ' · ' + chain.rpc.stats.rejected + ' rejected' : ''));
  return 0;
};
module.exports.cardLines = cardLines;
module.exports.followLine = followLine;
module.exports.openLine = openLine;
module.exports.refLine = refLine;
