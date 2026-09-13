'use strict';
/* watch: the exit watch. one line per poll, the siren when the pool turns, a black box if you ask for one.
   with --guard the wallet's whole holding of the token is sold the moment the siren sounds, or when the
   position's own exit rules trip (take profit, stop, trail): the desk's judgement, with a hand on the door. */
const fs = require('fs');
const { isAddr, readToken } = require('../token');
const { makeSimPool } = require('../sim');
const E = require('../engine');
const { councilTable } = require('./scan');
const { attachWallet, arm, applyExit, explorerTx, big, fmtEth, fmtTok, short } = require('../live');

const AGENTS = ['SCOUT', 'AUDIT', 'WHALE', 'LP', 'FLOW', 'VOL', 'SNIPER', 'EXIT'];
function stampOf(ui, kind) { return ui.badge(kind === 'enter' ? 'ENTER' : kind === 'avoid' ? 'AVOID' : 'CAREFUL'); }

/* the watch engine: feed it frames, it keeps the history and tells you what changed */
function makeWatcher(ctx, opts) {
  const { ui } = ctx, C = ui.C;
  const W = { hist: [], series: [], polls: 0, sirens: 0, alert: null, lastVerd: {}, lastKind: null, entry: null, peak: 0, minLiq: Infinity, maxLiq: 0, frames: [], t0: Date.now(), paper: opts.paper || 0 };
  function step(pair, chainView, now, extra) {
    now = now || Date.now();
    const tok = { pair, pairs: [pair], chain: chainView };
    const m = E.computeMetrics(tok, now);
    if (m.liq != null) { W.hist.push({ t: now, liq: m.liq }); if (W.hist.length > 90) W.hist.shift(); W.minLiq = Math.min(W.minLiq, m.liq); W.maxLiq = Math.max(W.maxLiq, m.liq); }
    if (m.price != null) { W.series.push({ t: now, p: m.price }); if (W.series.length > 900) W.series.shift(); }
    const score = E.scoreOf(m, W.hist), verd = E.verdictsOf(m, W.hist), kind = E.verdictKind(score), alert = E.evalAlert(m, W.hist, extra);
    W.polls++;
    const out = { m, score, verd, kind, alert, lines: [], events: [] };
    if (!W.entry && m.priceNative) W.entry = { pn: m.priceNative, pu: m.price, R: m.reserveSol, t: now };
    /* paper mark: tokens bought at entry with the entry's own impact, sold now into the current reserve */
    if (W.entry && W.paper > 0 && m.priceNative && m.reserveSol) {
      const x = W.paper, tk = x * (1 - (W.entry.R ? x / (x + W.entry.R) : 0)) * 0.997 / W.entry.pn;
      const gross = tk * m.priceNative, imp = gross / (gross + m.reserveSol), val = gross * (1 - imp) * 0.997;
      out.paper = { val, pnl: (val / x - 1) * 100 }; W.peak = Math.max(W.peak, out.paper.pnl);
    }
    /* votes: only the turn to bad, once a minute per agent, so the stream is not the tape's noise */
    W.voteAt = W.voteAt || {};
    AGENTS.forEach(a => { const v = verd[a]; const prev = W.lastVerd[a]; if (prev && v && prev.state !== 'bad' && v.state === 'bad' && now - (W.voteAt[a] || 0) > 60000) { out.events.push({ kind: 'vote', a, from: prev.state, to: v.state, text: v.text }); W.voteAt[a] = now; } W.lastVerd[a] = v; });
    /* the stamp: printed when it has held for two polls */
    if (kind === W.pendingKind && kind !== W.lastKind) { if (W.lastKind) out.events.push({ kind: 'stamp', from: W.lastKind, to: kind, score: score.total }); W.lastKind = kind; }
    if (!W.lastKind) W.lastKind = kind;
    W.pendingKind = kind;
    const prevCode = W.alert && W.alert.code;
    if ((alert && alert.code) !== prevCode) { if (alert) { out.events.push({ kind: 'alert', alert }); if (alert.lvl === 'bad') W.sirens++; } else if (prevCode) out.events.push({ kind: 'clear', code: prevCode }); }
    W.alert = alert;
    W.frames.push({ t: now, pair: JSON.parse(JSON.stringify(pair)), chain: chainView || null });
    if (W.frames.length > 2400) W.frames.shift();
    return out;
  }
  function line(r, tag) {
    const m = r.m, sc = r.score.total;
    const liqDelta = W.hist.length > 1 ? (m.liq - W.hist[W.hist.length - 2].liq) / W.hist[W.hist.length - 2].liq * 100 : null;
    const dl = liqDelta == null ? C.dim('   --  ') : (liqDelta >= 0 ? C.green : C.red)(ui.padStart((liqDelta >= 0 ? '▲' : '▼') + Math.abs(liqDelta).toFixed(1) + '%', 7));
    const sells = m.sell5 == null ? C.dim('sells n/a') : (m.sell5 > 0.65 ? C.red : m.sell5 > 0.52 ? C.amber : C.dim)('sells ' + ui.padStart(Math.round(m.sell5 * 100) + '%', 3));
    const safe = m.safeSol == null ? C.dim('safe n/a') : (m.safeSol < 0.06 ? C.red : m.safeSol < 0.6 ? C.amber : C.green)('safe ' + m.safeSol.toFixed(2) + ' ETH');
    const gauge = ui.bar(sc / 100, 10, sc >= 70 ? C.green : sc >= 40 ? C.amber : C.red) + ' ' + ui.padStart(String(sc), 3) + ' ' + stampOf(ui, r.kind);
    const paper = r.paper ? '  ' + C.dim('paper ') + (r.paper.pnl >= 0 ? C.green : C.red)(ui.fmtPct(r.paper.pnl, 1)) : '';
    const siren = r.alert ? '  ' + (r.alert.lvl === 'bad' ? C.red('■ ' + r.alert.code) : C.amber('▲ ' + r.alert.code)) : '';
    /* the poll line is a dashboard, and a dashboard that runs off the window is unreadable. The segments carry the
       order they are dropped in: the market cap first, then the buy/sell split, then the paper mark, then the safe
       size. The price, the pool, the move and the stamp are what a siren is read off, so they never go, and the
       siren itself never goes. Everything is measured, not guessed at a breakpoint. */
    const fixedHead = ui.stamp() + (tag ? ' ' + tag : '') + '  ' + ui.padEnd(ui.fmtPrice(m.price), 11);
    const segs = [
      { drop: 4, s: C.dim(' mcap ') + ui.padEnd(ui.fmtUsd(m.mcap), 8) },
      { drop: 0, s: C.dim(' pool ') + ui.padEnd(ui.fmtUsd(m.liq), 8) + ' ' + dl },
      { drop: 3, s: '  ' + sells },
      { drop: 1, s: '  ' + safe },
      { drop: 0, s: '  ' + gauge },
      { drop: 2, s: paper },
      { drop: 0, s: siren }
    ];
    const room = ui.cols() - 1;
    let keep = segs.map((_, i) => i);
    const render = () => fixedHead + keep.map(i => segs[i].s).join('');
    for (let guard = 0; guard < segs.length && ui.width(render()) > room; guard++) {
      const goes = keep.filter(i => segs[i].drop > 0).sort((a, b) => segs[b].drop - segs[a].drop)[0];
      if (goes === undefined) break;
      keep = keep.filter(i => i !== goes);
    }
    /* if it still does not fit, the siren goes to its own line under the poll rather than off the side of it */
    if (siren && ui.width(render()) > room) {
      keep = keep.filter(i => segs[i].s !== siren);
      return render() + '\n' + ' '.repeat(10) + siren.trim();
    }
    return render();
  }
  function eventLines(r) {
    /* an event is a sentence, so it hangs under the card's indent instead of running past the window */
    const fold = l => (l ? ui.wrap(l, ui.cols() - 1, 12) : l);
    return r.events.map(ev => {
      if (ev.kind === 'alert') { const a = ev.alert; return '          ' + (a.lvl === 'bad' ? ui.badge('SIREN') : ui.badge('WARN')) + ' ' + (a.lvl === 'bad' ? C.red : C.amber)(C.bold(a.code)) + C.dim('  ' + a.msg + (opts.guard ? (a.lvl === 'bad' ? ' · the guard pulls the trigger' : ' · a warning, the guard waits for red') : ' · signal only, nothing is traded for you')); }
      if (ev.kind === 'clear') return '          ' + C.dim('siren cleared: ' + ev.code + ' no longer holds');
      if (ev.kind === 'stamp') return '          ' + C.dim('stamp ') + stampOf(ui, ev.from) + C.dim(' → ') + stampOf(ui, ev.to) + C.dim('  at ' + ev.score);
      if (ev.kind === 'vote') return '          ' + C.dim(ev.a + ' ') + ui.tone(ev.from)(ev.from) + C.dim(' → ') + ui.tone(ev.to)(ev.to) + C.dim('  ' + ev.text);
      return '';
    }).filter(Boolean).map(fold);
  }
  function summary() {
    const first = W.series[0], last = W.series[W.series.length - 1];
    return [['polls', String(W.polls) + C.dim('  over ' + ui.fmtAge(Date.now() - W.t0))], ['price', first && last ? ui.fmtPrice(first.p) + ' → ' + ui.fmtPrice(last.p) + C.dim('  ' + ui.fmtPct((last.p / first.p - 1) * 100, 1)) : 'n/a'], ['pool', isFinite(W.minLiq) ? ui.fmtUsd(W.minLiq) + ' … ' + ui.fmtUsd(W.maxLiq) : 'n/a'], ['sirens', String(W.sirens)], ['paper', W.paper ? W.paper + ' ETH · peak ' + ui.fmtPct(W.peak, 1) : 'off (--paper X to size one)']];
  }
  function box(meta) { return Object.assign({ loxley: 1, version: ctx.VERSION, chain: ctx.env.CHAIN_SLUG, kind: 'recording', recorded: new Date().toISOString(), source: 'loxley watch', frames: W.frames }, meta || {}); }
  return { W, step, line, eventLines, summary, box };
}

module.exports = async function watch(ctx) {
  const { ui, log, args, flags, env, sources } = ctx, C = ui.C;
  const sim = !!flags.sim, token = args._[0], guard = !!flags.guard;
  if (!sim && !isAddr(token)) { log.error('usage: loxley watch 0x… [--every 8] [--for 600] [--rec box.json] [--paper 0.5] [--guard [--tp 80] [--sl 35] [--yes]]   or   loxley watch --sim'); return 1; }
  if (guard && sim) { log.error('--guard and --sim do not mix: there is nothing to sell in the simulator'); return 1; }
  const every = Math.max(2, flags.every != null ? parseFloat(flags.every) : 8), forS = flags.for != null ? parseFloat(flags.for) : null;
  const rec = flags.rec ? String(flags.rec) : null, paper = flags.paper != null ? parseFloat(flags.paper) : 0;
  const watcher = makeWatcher(ctx, { paper, guard });
  let pool = null, T = null, view = null, symbol = null, mint = token;
  if (sim) { pool = makeSimPool('DEMO'); view = pool.chain; symbol = 'DEMO'; mint = pool.token; log.raw(ui.badge('SIM') + C.dim(' a made-up pool that drifts, then drains, then dumps. nothing here is real.')); }
  else {
    log.dim('reading ' + token + '…');
    T = await readToken(ctx, token, { buyers: false });
    if (!T.pair) { log.warn('no pool on DexScreener for this token' + (T.launch ? ': it is still on its curve (' + (T.curve && T.curve.real != null ? (T.curve.real / T.launch.thr * 100).toFixed(0) + '% to graduation' : 'fill n/a') + '). loxley hunt follows curves; watch needs a pool.' : '.')); return 1; }
    view = T.view; symbol = T.symbol;
    const x = T.xray, tg = x ? sources.xrayTag(x) : null;
    log.raw(C.bold(C.white('$' + (symbol || '…'))) + (T.name ? C.dim('  ' + T.name) : '') + C.dim('  ' + T.pair.dexId + ' · ' + (T.pair.quoteToken ? T.pair.quoteToken.symbol : '') + ' · pair ' + ui.fmtAge(Date.now() - (T.pair.pairCreatedAt || Date.now())) + ' old') + (x ? C.dim('  deployer ') + ui.short(x.dep) + ' ' + ui.badge(tg.t) : ''));
  }
  /* the guard: the wallet's holding, the book's entry, the rules that pull the trigger */
  const notify = guard ? require('../notify').makeNotifier(env, log) : null;
  const G = guard ? { held: 0n, ethIn: 0n, tp: flags.tp != null ? parseFloat(flags.tp) : env.num('TAKE_PROFIT_PCT'), sl: flags.sl != null ? parseFloat(flags.sl) : env.num('STOP_LOSS_PCT'), trail: env.num('TRAILING_PCT'), peak: -Infinity, sold: false, selling: false, slippage: flags.slippage != null ? parseInt(flags.slippage, 10) : env.num('SLIPPAGE_BPS'), onlySiren: !!flags['siren-only'] } : null;
  if (guard) {
    const w = await attachWallet(ctx, { need: true }); const tr = ctx.trader;
    G.held = await tr.tokenBalance(token); G.decimals = (await tr.tokenMeta(token)).decimals;
    if (G.held <= 0n) { log.error('nothing to guard: ' + ui.short(w.address) + ' holds no $' + (symbol || 'tokens')); return 1; }
    const open = tr.book.byToken(token); G.ethIn = open.reduce((s, p) => s + big(p.entry.ethWei), 0n); G.remBook = open.reduce((s, p) => s + big(p.remainingWei), 0n);
    const q = await tr.exitQuote(token, G.held, w.address).catch(() => null);
    const plan = [ui.badge('GUARD') + ' ' + C.red(C.bold('the whole holding is sold when the desk says leave.')) + C.dim(' a signed sell from the wallet, no second question.'), ui.kv([
      ['wallet', C.white(w.address) + C.dim('  ' + w.source)],
      ['holding', fmtTok(G.held, G.decimals) + ' $' + (symbol || '…') + C.dim(q && q.ethOut != null ? '  worth ' + fmtEth(q.ethOut) + ' now on the ' + q.venue : '  (exit quote n/a)')],
      ['entry', G.ethIn > 0n ? fmtEth(G.ethIn) + C.dim(' in the book' + (G.remBook !== G.held ? ' (book holds ' + fmtTok(G.remBook, G.decimals) + ', wallet ' + fmtTok(G.held, G.decimals) + ': p&l rules use the wallet)' : '')) : C.amber('unknown') + C.dim('  bought outside loxley: only the siren pulls the trigger' + (G.onlySiren ? '' : ', take profit and stop need an entry'))],
      ['pulls', 'the siren (pool leaving, drain pace, crash, distribution) · the deployer\'s tokens moving' + (G.ethIn > 0n && !G.onlySiren ? ' · take profit ' + (G.tp >= 0 ? '+' : '') + G.tp + '% · stop −' + G.sl + '% · trail ' + G.trail + '% below the peak' : '')],
      ['slippage', G.slippage + ' bps'],
      ['alerts', notify.on ? notify.where : C.dim('off')]
    ]), ''];
    const ok = await arm(ctx, plan, 'guard'); if (!ok) return 3;
  }
  log.raw(ui.note(C.dim('every ' + every + ' s · siren rules: pool −15% leaving, −7% thinning, drain pace, crash −15%/5m, distribution, narrow exit' + (rec ? ' · black box → ' + rec : '') + (paper ? ' · paper ' + paper + ' ETH' : '') + (guard ? ' · guard armed' : ''))));
  log.raw('');
  async function pullTrigger(why) {
    if (!G || G.sold || G.selling) return; G.selling = true;
    const tr = ctx.trader;
    try {
      const held = await tr.tokenBalance(token);
      const r = await tr.sellAnywhere({ token, tokensWei: held, slippageBps: G.slippage });
      const out = r.venue === 'curve' ? r.quoteOut : r.amountOut;
      applyExit(ctx, token, held, out, r.hash, 'guard: ' + why, r.venue);
      G.sold = true;
      log.raw('          ' + ui.badge('SOLD') + ' ' + C.white('$' + (symbol || '…')) + '  ' + fmtTok(held, G.decimals) + C.dim(' → ') + C.white(fmtEth(out)) + C.dim(' on the ' + r.venue + ' · ' + why + ' · gas ' + fmtEth(r.gasWei, 6)) + (G.ethIn > 0n ? '  ' + (out >= G.ethIn ? C.green : C.red)(ui.fmtPct((Number(out) / Number(G.ethIn) - 1) * 100, 1)) + C.dim(' against the book') : ''));
      log.raw('          ' + C.dim('tx ') + C.blue(explorerTx(env, r.hash)));
      ui.bell();
      if (notify) notify.send('SOLD $' + (symbol || '…') + ' ' + fmtTok(held, G.decimals) + ' → ' + fmtEth(out) + ' on the ' + r.venue + ' · guard: ' + why + ' · ' + explorerTx(env, r.hash));
      if (!flags.stay) stop = true;
    } catch (e) { G.selling = false; log.warn('guard: the sell did not fill (' + short(e) + '), trying again on the next poll'); G.pending = why; }
  }
  let stop = false, n = 0;
  const end = () => { stop = true; };
  process.on('SIGINT', end);
  if (forS) setTimeout(end, forS * 1000);
  /* the deployer's own moves: a sell or a transfer out of its wallet since the last poll is a red siren */
  const dep = !sim && T && T.launch ? T.launch.deployer : null, curveAddr = !sim && T && T.launch ? T.launch.curve : null;
  let devFrom = null, devMoves = null;
  while (!stop) {
    const t0 = Date.now();
    let pair = null;
    if (sim) pair = pool.frame();
    else {
      const pairs = await sources.dex.pairs(mint);
      if (pairs && pairs.length) pair = pairs[0];
      if (n > 0 && n % 5 === 0) { const v = await sources.chainView(mint); if (v && v.explorer) view = v; }
      if (dep) { try { const head = await ctx.chain.blockNumber(); if (devFrom == null) devFrom = head; else if (head > devFrom) { const mv = await ctx.chain.devMoves(mint, curveAddr, dep, devFrom + 1, head); devFrom = head; if (mv.moved) { mv.pct = T.supply ? mv.tokens / T.supply * 100 : null; devMoves = mv; } } } catch (e) { /* next poll */ } }
    }
    if (!pair) log.warn('feed hiccup: DexScreener did not answer, retrying on the next poll');
    else {
      const r = watcher.step(pair, view, null, devMoves ? { devMoves } : null);
      if (n === 0) { log.raw(councilTable(ctx, r.m, r.score, r.verd)); log.raw(''); }
      log.raw(watcher.line(r, sim ? ui.badge('SIM') : (guard ? ui.badge('GUARD') : null)));
      watcher.eventLines(r).forEach(l => log.raw(l));
      if (r.events.some(e => e.kind === 'alert' && e.alert.lvl === 'bad')) { ui.bell(); if (notify) r.events.filter(e => e.kind === 'alert' && e.alert.lvl === 'bad').forEach(e => notify.send('SIREN ' + e.alert.code + ' on $' + (symbol || '…') + ': ' + e.alert.msg)); }
      if (G && !G.sold) {
        let why = G.pending || null;
        if (!why && r.alert && r.alert.lvl === 'bad') why = 'siren: ' + r.alert.code;
        if (!why && G.ethIn > 0n && !G.onlySiren) {
          const q = await ctx.trader.exitQuote(token, G.held, ctx.trader.address).catch(() => null);
          if (q && q.ethOut != null) { const pnl = (Number(q.ethOut) / Number(G.ethIn) - 1) * 100; G.peak = Math.max(G.peak, pnl); G.lastPnl = pnl; if (pnl >= G.tp) why = 'take profit ' + (G.tp >= 0 ? '+' : '') + G.tp + '%'; else if (pnl <= -G.sl) why = 'stop loss −' + G.sl + '%'; else if (G.peak >= 10 && pnl <= G.peak - G.trail) why = 'trailing ' + G.trail + '% below the peak of ' + ui.fmtPct(G.peak, 0); if (n % 5 === 0) log.raw('          ' + C.dim('guard ') + (pnl >= 0 ? C.green : C.red)(ui.fmtPct(pnl, 1)) + C.dim('  ' + fmtEth(q.ethOut) + ' for the holding on the ' + q.venue + ' · peak ' + ui.fmtPct(G.peak, 0))); }
        }
        if (why) await pullTrigger(why);
      }
      if (rec) { try { fs.writeFileSync(rec, JSON.stringify(watcher.box({ mint, symbol, sim }))); } catch (e) { log.warn('could not write ' + rec + ': ' + e.message); } }
    }
    n++;
    const wait = every * 1000 - (Date.now() - t0);
    if (!stop && wait > 0) await new Promise(res => { const t = setTimeout(res, wait); const iv = setInterval(() => { if (stop) { clearTimeout(t); clearInterval(iv); res(); } }, 200); setTimeout(() => clearInterval(iv), wait + 10); });
  }
  log.raw(''); log.raw(ui.kv(watcher.summary().concat(G ? [['guard', G.sold ? C.amber('pulled the trigger') : C.dim('armed, never pulled' + (G.lastPnl != null ? ' · last ' + ui.fmtPct(G.lastPnl, 1) : ''))]] : [])));
  if (rec) log.ok('black box: ' + watcher.W.frames.length + ' frames in ' + rec + ' · loxley replay ' + rec + ', or drop it on the desk');
  return 0;
};
module.exports.makeWatcher = makeWatcher;
