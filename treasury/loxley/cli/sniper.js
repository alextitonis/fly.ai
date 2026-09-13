'use strict';
/* sniper: the positions, the marks and the exits that snipe, snipe --grad and follow share.
   on paper a fill is imagined and marked with real quotes; live it is a signed buy, marked with exact exit quotes
   and left with signed sells. the venue is the curve or the pool; the rules are the desk's. */
const E = require('./engine');
const { parseEth, explorerTx, openPosition, applyExit, markPosition, big, fmtEth, fmtTok, short } = require('./live');

function rulesFrom(ctx, live) {
  const { flags, env } = ctx;
  const perShot = flags.eth != null ? parseFloat(flags.eth) : env.num(live ? 'LIVE_ETH' : 'PAPER_ETH');
  return {
    eth: perShot, minScore: flags['min-score'] != null ? parseFloat(flags['min-score']) : env.num('MIN_SCORE'), maxOpen: flags['max-open'] != null ? parseInt(flags['max-open'], 10) : env.num(live ? 'LIVE_MAX_OPEN' : 'MAX_OPEN'),
    taxCeiling: flags['tax-ceiling'] != null ? parseFloat(flags['tax-ceiling']) : env.num('TAX_CEILING_BPS'), maxDevShare: env.num('MAX_DEV_SHARE'), maxCreatorTax: env.num('MAX_CREATOR_TAX'),
    ethPairsOnly: flags['allow-pairs'] ? false : (live ? true : env.bool('ETH_PAIRS_ONLY')), maxTwins: env.num('MAX_TWINS'),
    maxExempt: flags['max-exempt'] != null ? parseInt(flags['max-exempt'], 10) : env.num('MAX_EXEMPT'), maxBundlePct: env.num('MAX_BUNDLE_PCT'), requireSocials: flags.socials ? true : env.bool('REQUIRE_SOCIALS'), refuseFarms: flags['allow-farms'] ? false : env.bool('REFUSE_FARMS'),
    tp: flags.tp != null ? parseFloat(flags.tp) : env.num('TAKE_PROFIT_PCT'), sl: flags.sl != null ? parseFloat(flags.sl) : env.num('STOP_LOSS_PCT'), trail: env.num('TRAILING_PCT'), hold: flags.hold != null ? parseFloat(flags.hold) : env.num('MAX_HOLD_MIN'),
    budget: flags.budget != null ? parseFloat(flags.budget) : (live ? env.num('LIVE_BUDGET_ETH') : env.num('PAPER_ETH') * 5),
    keyword: flags.keyword ? new RegExp(String(flags.keyword), 'i') : null, deployer: flags.deployer ? String(flags.deployer).toLowerCase().split(',') : null,
    drawMax: (flags.draw != null ? parseFloat(flags.draw) : env.num('DRAW_MAX_S')) * 1000, slippage: flags.slippage != null ? parseInt(flags.slippage, 10) : env.num('SLIPPAGE_BPS'),
    exitOnStop: !!flags['exit-on-stop'], open: 0
  };
}
function refuseText(ui, rules, live) {
  return 'score < ' + rules.minScore + (rules.ethPairsOnly ? ' · non-ETH pairs' : '') + ' · dev share > ' + rules.maxDevShare + '% · creator tax > ' + rules.maxCreatorTax + '% · twins > ' + rules.maxTwins + ' · exempt wallets > ' + rules.maxExempt + ' · block-0 bundle > ' + rules.maxBundlePct + '%' + (rules.refuseFarms ? ' · launch farms' : '') + (rules.requireSocials ? ' · no socials' : '') + (rules.keyword ? ' · not /' + rules.keyword.source + '/' : '') + (rules.deployer ? ' · deployer not in list' : '');
}
function exitsText(rules, live) {
  return 'take profit +' + rules.tp + '% · stop −' + rules.sl + '% · trail ' + rules.trail + '% below the peak · hold ' + rules.hold + ' min · the siren on a pool · dev sold' + (live ? (rules.exitOnStop ? ' · everything sold when the session ends' : ' · open positions stay open when the session ends') : '');
}

function makeSniper(ctx, rules, o) {
  const { ui, log, env, chain, sources } = ctx, C = ui.C;
  const live = !!o.live, T = o.trader, feed = o.feed, notify = o.notify, tagWord = o.tag || 'snipe';
  const P = { positions: [], spent: 0, fired: 0, passed: 0, closed: 0, pnl: 0, t0: Date.now(), gas: 0n };
  const openPositions = () => P.positions.filter(p => p.status === 'open');
  const tag = p => C.white('$' + p.symbol);
  /* every line the sniper prints is a sentence about one position: it hangs under the timestamp column rather than
     running off the window, so a receipt, a siren and a close all read as blocks at any width */
  const say = s => log.raw(ui.wrap(s, ui.cols() - 1, 10));
  const tell = s => { if (notify) notify.send(s); };

  /* ---------- marks ---------- */
  function markCurvePaper(p, L) {
    const m = L.maths; if (!m || m.price == null) return null;
    const gross = p.tokens * m.price, imp = gross / (gross + m.quote), val = gross * (1 - imp) * (1 - m.fee / 10000) * (1 - m.tax / 10000);
    return { val, pnl: (val / p.eth - 1) * 100, price: m.price, src: m.exact ? 'curve' : 'curve est' };
  }
  function markPoolDex(p, pair) {
    const m = E.computeMetrics({ pair, pairs: [pair], chain: null }); if (!m.priceNative || !m.reserveSol) return null;
    p.hist = p.hist || []; if (m.liq != null) { p.hist.push({ t: Date.now(), liq: m.liq }); if (p.hist.length > 90) p.hist.shift(); }
    const gross = p.tokens * m.priceNative, imp = gross / (gross + m.reserveSol), val = gross * (1 - imp) * 0.997;
    return { val, pnl: (val / p.eth - 1) * 100, price: m.priceNative, src: 'pool', alert: E.evalAlert(m, p.hist, { devMoves: p.devMoves }), m };
  }
  async function devWatch(p) {
    /* the deployer's own moves since the last mark: a sell or a transfer out is a red siren */
    if (feed && feed.sim) return;
    try {
      const head = await chain.blockNumber(); const from = p.devFrom || p.block || head - 20;
      if (head <= from) return;
      const mv = await chain.devMoves(p.token, p.curveOpen ? p.curve : null, p.deployer, from + 1, head);
      p.devFrom = head;
      if (mv.moved) { mv.pct = p.supply ? mv.tokens / p.supply * 100 : null; p.devMoves = mv; }
    } catch (e) { /* next mark */ }
  }
  async function mark(p) {
    const L = p.L; let mk = null;
    if (p.deployer) await devWatch(p);
    if (live) {
      let q; try { q = await markPosition(ctx, p.book); } catch (e) { return; }
      if (!q || q.ethOut == null) { if (q && q.venue === 'halted' && !p.haltedSaid) { p.haltedSaid = true; say(ui.stamp() + '  ' + C.dim('mark  ') + tag(p) + C.dim('  the curve is ready to graduate: sells closed until the pool opens, marks resume there')); } return; }
      p.haltedSaid = false; p.curveOpen = q.venue === 'curve';
      const val = Number(q.ethOut) / 1e18; mk = { val, pnl: (val / p.eth - 1) * 100, src: q.venue };
      if (q.venue === 'pool' && !(feed && feed.sim)) { const pairs = await sources.dex.pairs(p.token); if (pairs && pairs.length) { const pm = markPoolDex(p, pairs[0]); if (pm) mk.alert = pm.alert; } }
      if (!mk.alert && p.devMoves) mk.alert = E.evalAlert({}, [], { devMoves: p.devMoves });
    } else if (p.venue === 'pool') {
      /* a paper position in the pool: the quoter says what the tokens fetch, dexscreener runs the siren */
      let q = null; if (T && !(feed && feed.sim)) { try { q = await T.exitQuote(p.token, p.tokensWei, T.address || undefined); } catch (e) { q = null; } }
      const pairs = feed && feed.sim ? null : await sources.dex.pairs(p.token);
      if (q && q.ethOut != null) { const val = Number(q.ethOut) / 1e18; mk = { val, pnl: (val / p.eth - 1) * 100, src: 'pool' }; if (pairs && pairs.length) { const pm = markPoolDex(p, pairs[0]); if (pm) mk.alert = pm.alert; } }
      else if (pairs && pairs.length) mk = markPoolDex(p, pairs[0]);
      else mk = p.lastMark;
      if (mk && !mk.alert && p.devMoves) mk.alert = E.evalAlert({}, [], { devMoves: p.devMoves });
    } else {
      if (!p.graduated) { try { await feed.curveNow(L); } catch (e) { return; } if (L.graduated) { p.graduated = true; say(ui.stamp() + '  ' + ui.badge('GRAD') + ' ' + tag(p) + C.dim(' graduated while held: marks move to the pool')); } else mk = markCurvePaper(p, L); }
      if (p.graduated) { const pairs = feed.sim ? null : await sources.dex.pairs(p.token); if (pairs && pairs.length) mk = markPoolDex(p, pairs[0]); else if (!feed.sim) mk = p.lastMark; else mk = markCurvePaper(p, L); }
      if (mk && !mk.alert && p.devMoves) mk.alert = E.evalAlert({}, [], { devMoves: p.devMoves });
    }
    if (!mk) return;
    p.lastMark = mk; p.peak = Math.max(p.peak == null ? -Infinity : p.peak, mk.pnl); p.marks++;
    if (live) T.book.update(p.book.id, { peakPnl: Math.max(p.book.peakPnl || 0, mk.pnl) });
    const held = (Date.now() - p.t) / 60000;
    let why = p.pendingExit || null;
    if (!why) {
      if (mk.alert && mk.alert.lvl === 'bad') why = 'siren: ' + mk.alert.code;
      else if (mk.pnl >= rules.tp) why = 'take profit +' + rules.tp + '%';
      else if (mk.pnl <= -rules.sl) why = 'stop loss −' + rules.sl + '%';
      else if (p.peak >= 10 && mk.pnl <= p.peak - rules.trail) why = 'trailing ' + rules.trail + '% below the peak of ' + ui.fmtPct(p.peak, 0);
      else if (held >= rules.hold) why = 'max hold ' + rules.hold + ' min';
    }
    if (why) { if (mk.alert && mk.alert.lvl === 'bad' && why.startsWith('siren')) { say(ui.stamp() + '  ' + ui.badge('SIREN') + ' ' + tag(p) + '  ' + C.red(C.bold(mk.alert.code)) + C.dim('  ' + mk.alert.msg)); ui.bell(); tell('SIREN ' + mk.alert.code + ' on $' + p.symbol + ': ' + mk.alert.msg); } if (live) await closeLive(p, why); else closePaper(p, mk, why); return; }
    if (p.marks % 3 === 1) say(ui.stamp() + '  ' + C.dim('mark  ') + tag(p) + '  ' + (mk.pnl >= 0 ? C.green : C.red)(ui.fmtPct(mk.pnl, 1)) + C.dim('  ' + mk.val.toFixed(4) + ' ETH · peak ' + ui.fmtPct(p.peak, 0) + ' · ' + mk.src + (L && L.fill != null && !p.graduated && !live && p.venue !== 'pool' ? ' · curve ' + Math.round(L.fill * 100) + '%' : '') + (mk.alert ? ' · ' : '')) + (mk.alert ? (mk.alert.lvl === 'bad' ? C.red : C.amber)(mk.alert.code) : ''));
  }
  let marking = false, marker = null;
  function startMarks(ms) { marker = setInterval(async () => { if (marking) return; marking = true; for (const p of openPositions()) { try { await mark(p); } catch (e) { /* next tick */ } } marking = false; }, ms); }
  function stopMarks() { if (marker) clearInterval(marker); }

  /* ---------- closing ---------- */
  function closePaper(p, mk, why) {
    p.status = 'closed'; p.out = mk ? mk.val : 0; p.pnl = mk ? mk.pnl : -100; p.why = why; p.closedAt = Date.now(); P.closed++; P.pnl += p.out - p.eth; rules.open = openPositions().length;
    say(ui.stamp() + '  ' + ui.badge('CLOSED') + ' ' + tag(p) + '  ' + (p.pnl >= 0 ? C.green : C.red)(ui.fmtPct(p.pnl, 1)) + C.dim('  ' + p.out.toFixed(4) + ' ETH back for ' + Number(p.eth).toFixed(4) + ' ETH · ' + why + ' · held ' + ui.fmtAge(p.closedAt - p.t) + (mk ? ' · marked on the ' + mk.src : '')));
    tell('CLOSED $' + p.symbol + ' ' + ui.fmtPct(p.pnl, 1) + ' on paper · ' + why);
  }
  async function closeLive(p, why) {
    if (p.selling) return; p.selling = true;
    try {
      const rem = big(p.book.remainingWei);
      const r = await T.sellAnywhere({ token: p.token, tokensWei: rem, slippageBps: rules.slippage });
      const out = r.venue === 'curve' ? r.quoteOut : r.amountOut;
      const touched = applyExit(ctx, p.token, rem, out, r.hash, why, r.venue);
      const mine = touched.find(x => x.id === p.book.id); if (mine) p.book = mine;
      p.status = 'closed'; p.out = Number(out) / 1e18; p.pnl = (p.out / p.eth - 1) * 100; p.why = why; p.closedAt = Date.now(); P.closed++; P.pnl += p.out - p.eth; P.gas += r.gasWei; rules.open = openPositions().length;
      say(ui.stamp() + '  ' + ui.badge('CLOSED') + ' ' + tag(p) + '  ' + (p.pnl >= 0 ? C.green : C.red)(ui.fmtPct(p.pnl, 1)) + C.dim('  ' + fmtEth(out) + ' back for ' + Number(p.eth).toFixed(4) + ' ETH · ' + why + ' · held ' + ui.fmtAge(p.closedAt - p.t) + ' · sold on the ' + r.venue + ' · gas ' + fmtEth(r.gasWei, 6)));
      say('          ' + C.dim('tx ') + C.blue(explorerTx(env, r.hash)));
      ui.bell(); tell('CLOSED $' + p.symbol + ' ' + ui.fmtPct(p.pnl, 1) + ' · ' + why + ' · ' + fmtEth(out) + ' back · ' + explorerTx(env, r.hash));
    } catch (e) {
      p.selling = false;
      if (e.code === 'HALTED') { if (!p.haltedSaid) { p.haltedSaid = true; say(ui.stamp() + '  ' + ui.badge('WAIT') + ' ' + tag(p) + C.dim('  wants out (' + why + ') but trading is halted between the sweep and the pool. retrying every mark until the pool opens.')); tell('WAIT $' + p.symbol + ': wants out (' + why + '), trading halted until the pool opens'); } p.pendingExit = why; return; }
      log.warn('exit of $' + p.symbol + ' did not fill: ' + short(e) + ' · retrying on the next mark'); p.pendingExit = why;
    }
  }

  /* ---------- the draw: wait for the opening tax to fall ---------- */
  async function draw(L, who) {
    const t0 = Date.now(); let last = L.taxBps;
    while (Date.now() - t0 < rules.drawMax) {
      if (last != null && last <= rules.taxCeiling) return { ok: true, taxBps: last, ms: Date.now() - t0 };
      await chain.sleep(live ? 200 : 150);
      try { if (feed && feed.sim) { await feed.curveNow(L); last = L.taxBps; } else { const c = await chain.curveRead(L.curve, { tax: who || true }); last = c.taxBps; L.taxBps = c.taxBps; L.real = c.real; } } catch (e) { }
    }
    return { ok: false, taxBps: last, ms: Date.now() - t0 };
  }

  /* ---------- the fire ---------- */
  function base(L, extra) { return Object.assign({ token: L.token, curve: L.curve, deployer: L.deployer, supply: L.supply, symbol: L.symbol || '…', t: Date.now(), peak: null, marks: 0, status: 'open', L, curveOpen: true }, extra || {}); }
  async function fireCurveLive(L, d, why) {
    const ethWei = parseEth(rules.eth);
    const r = await T.buyCurve({ token: L.token, ethWei, slippageBps: rules.slippage, maxTaxBps: rules.taxCeiling });
    const bookP = openPosition(ctx, r, { token: L.token, symbol: L.symbol, curve: L.curve, decimals: 18, source: tagWord, taxBps: r.quoteIn > 0n ? Number(r.tax * 10000n / r.quoteIn) : null, ethWei });
    const p = base(L, { eth: Number(r.quoteIn) / 1e18, tokens: Number(r.tokensOut) / 1e18, tokensWei: r.tokensOut, taxBps: d ? d.taxBps : null, price: r.quote.price, graduated: false, waitMs: d ? d.ms : null, book: bookP, hash: r.hash, block: r.block, venue: 'curve', why });
    P.positions.push(p); P.spent += p.eth; P.fired++; P.gas += r.gasWei; rules.open = openPositions().length;
    say(ui.stamp() + '  ' + ui.badge('FIRE') + ' ' + tag(p) + C.dim('  live ') + fmtEth(r.quoteIn) + C.dim(' → ') + C.white(fmtTok(r.tokensOut)) + C.dim(' tokens · tax paid ' + fmtEth(r.tax, 6) + ' · fee ' + fmtEth(r.fee, 6) + ' · ' + r.ms + ' ms to the receipt · block ' + r.block + ' · gas ' + fmtEth(r.gasWei, 6) + (why ? ' · ' + why : '')));
    say('          ' + C.dim('tx ') + C.blue(explorerTx(env, r.hash)) + C.dim('  position ' + bookP.id));
    ui.bell(); tell('FIRE $' + p.symbol + ' ' + fmtEth(r.quoteIn) + ' → ' + fmtTok(r.tokensOut) + ' on the curve' + (d ? ' · tax at entry ' + ((d.taxBps || 0) / 100).toFixed(2) + '%' : '') + ' · ' + explorerTx(env, r.hash));
    return p;
  }
  function fireCurvePaper(L, d, why) {
    const m = L.maths; if (!m || m.price == null) { P.passed++; say(ui.stamp() + '  ' + C.dim('pass  ') + C.white('$' + (L.symbol || '…')) + C.dim('  the curve price could not be read, no paper shot without a mark')); return null; }
    const x = rules.eth, imp = x / (x + m.quote), tokens = x * (1 - imp) * (1 - m.fee / 10000) * (1 - (d && d.taxBps ? d.taxBps : 0) / 10000) / m.price;
    const p = base(L, { eth: x, tokens, taxBps: d ? d.taxBps : null, price: m.price, graduated: !!L.graduated, waitMs: d ? d.ms : null, venue: 'curve', why });
    P.positions.push(p); P.spent += x; P.fired++; rules.open = openPositions().length;
    say(ui.stamp() + '  ' + ui.badge('FIRE') + ' ' + tag(p) + C.dim('  paper ') + x + ' ETH' + C.dim(' → ') + ui.fmtNum(tokens) + ' tokens' + C.dim(' · tax at entry ' + ((d && d.taxBps ? d.taxBps : 0) / 100).toFixed(2) + '% · ' + (d ? d.ms : 0) + ' ms after the read · price ' + m.price.toExponential(3) + ' ETH' + (m.exact ? '' : ' est') + (why ? ' · ' + why : '')));
    ui.bell(); tell('FIRE $' + p.symbol + ' ' + x + ' ETH on paper' + (why ? ' · ' + why : ''));
    return p;
  }
  /* the pool leg: a buy the moment the pool exists, or a mirror of a wallet that bought there */
  async function firePool(L, why) {
    const ethWei = parseEth(rules.eth);
    if (live) {
      const r = await T.swapPool({ token: L.token, sell: false, amount: ethWei, slippageBps: rules.slippage });
      const bookP = openPosition(ctx, r, { token: L.token, symbol: L.symbol, curve: L.curve, decimals: 18, source: tagWord, ethWei });
      const p = base(L, { eth: rules.eth, tokens: Number(r.amountOut) / 1e18, tokensWei: r.amountOut, graduated: true, book: bookP, hash: r.hash, block: r.block, venue: 'pool', why, curveOpen: false });
      P.positions.push(p); P.spent += p.eth; P.fired++; P.gas += r.gasWei; rules.open = openPositions().length;
      say(ui.stamp() + '  ' + ui.badge('FIRE') + ' ' + tag(p) + C.dim('  live ') + fmtEth(ethWei) + C.dim(' → ') + C.white(fmtTok(r.amountOut)) + C.dim(' tokens in the pool · ' + r.ms + ' ms · block ' + r.block + ' · gas ' + fmtEth(r.gasWei, 6) + (why ? ' · ' + why : '')));
      say('          ' + C.dim('tx ') + C.blue(explorerTx(env, r.hash)) + C.dim('  position ' + bookP.id));
      ui.bell(); tell('FIRE $' + p.symbol + ' ' + fmtEth(ethWei) + ' in the pool' + (why ? ' · ' + why : '') + ' · ' + explorerTx(env, r.hash));
      return p;
    }
    let tokensWei = null;
    if (T) { try { const rec = await T.record(L.token); const key = await T.poolKey(rec); tokensWei = (await T.quotePool(rec, key, false, ethWei)).amountOut; } catch (e) { tokensWei = null; } }
    if (tokensWei == null) { P.passed++; say(ui.stamp() + '  ' + C.dim('pass  ') + C.white('$' + (L.symbol || '…')) + C.dim('  the pool did not quote, no paper shot without a mark')); return null; }
    const p = base(L, { eth: rules.eth, tokens: Number(tokensWei) / 1e18, tokensWei, graduated: true, venue: 'pool', why, curveOpen: false });
    P.positions.push(p); P.spent += p.eth; P.fired++; rules.open = openPositions().length;
    say(ui.stamp() + '  ' + ui.badge('FIRE') + ' ' + tag(p) + C.dim('  paper ') + rules.eth + ' ETH' + C.dim(' → ') + ui.fmtNum(p.tokens) + ' tokens' + C.dim(' in the pool, quoted by the v4 quoter' + (why ? ' · ' + why : '')));
    ui.bell(); tell('FIRE $' + p.symbol + ' ' + rules.eth + ' ETH in the pool on paper' + (why ? ' · ' + why : ''));
    return p;
  }

  /* the whole decision for a fresh launch: refusals, the draw, the fire */
  async function consider(L, o2) {
    o2 = o2 || {};
    rules.open = openPositions().length + (live ? T.book.open_().filter(b => !P.positions.some(p => p.book && p.book.id === b.id)).length : 0);
    const why = o2.skipRules ? [] : E.refusals(L, rules);
    if (rules.keyword && !rules.keyword.test((L.symbol || '') + ' ' + (L.name || '') + ' ' + (L.description || ''))) why.push('no keyword match');
    if (rules.deployer && rules.deployer.indexOf(L.deployer) < 0) why.push('deployer not in list');
    if (P.spent + rules.eth > rules.budget + 1e-12) why.push('budget ' + rules.budget + ' ETH spent');
    if (rules.open >= rules.maxOpen && why.indexOf('open positions ' + rules.open + ' ≥ ' + rules.maxOpen) < 0) why.push('open positions ' + rules.open + ' ≥ ' + rules.maxOpen);
    if (P.positions.some(p => p.token === L.token && p.status === 'open')) why.push('already holding it');
    if (why.length) { P.passed++; require('./stats').countRefusal(env, why[0]); say(ui.stamp() + '  ' + C.dim('pass  ') + C.white('$' + (L.symbol || '…')) + C.dim('  score ' + L.score.total + ' · ' + why[0] + (why.length > 1 ? ' (+' + (why.length - 1) + ')' : ''))); return null; }
    if (o2.card) say(o2.card.join('\n'));
    if (o2.venue === 'pool') { try { return await firePool(L, o2.why); } catch (err) { P.passed++; say(ui.stamp() + '  ' + C.red('miss  ') + C.white('$' + (L.symbol || '…')) + C.dim('  the pool buy did not fill: ' + short(err))); return null; } }
    say(ui.stamp() + '  ' + C.amber('draw  ') + C.white('$' + (L.symbol || '…')) + C.dim('  opening tax now ' + (L.taxBps == null ? 'n/a' : (L.taxBps / 100).toFixed(2) + '%') + ' · waiting for ≤ ' + (rules.taxCeiling / 100).toFixed(2) + '%'));
    const d = await draw(L, live ? T.address : null);
    if (!d.ok) { P.passed++; say(ui.stamp() + '  ' + C.dim('pass  ') + C.white('$' + (L.symbol || '…')) + C.dim('  the opening tax stayed at ' + (d.taxBps == null ? 'n/a' : (d.taxBps / 100).toFixed(2) + '%') + ' for ' + Math.round(d.ms / 1000) + ' s, no shot')); return null; }
    if (live) { try { return await fireCurveLive(L, d, o2.why); } catch (err) { P.passed++; say(ui.stamp() + '  ' + C.red('miss  ') + C.white('$' + (L.symbol || '…')) + C.dim('  the buy did not fill: ' + short(err))); if (ctx.flags.debug) console.error(err); return null; } }
    return fireCurvePaper(L, d, o2.why);
  }

  async function finish() {
    stopMarks();
    if (live) { if (rules.exitOnStop) { for (const p of openPositions()) await closeLive(p, 'session end'); } }
    else for (const p of openPositions()) { const mk = p.lastMark || (p.venue === 'pool' ? null : markCurvePaper(p, p.L)); closePaper(p, mk, 'session end'); }
  }
  function summary(walletAddr) {
    const rows = P.positions.map(p => ['$' + p.symbol, p.eth.toFixed(4) + ' ETH', p.status === 'open' ? C.dim('open') : (p.pnl >= 0 ? C.green : C.red)(ui.fmtPct(p.pnl, 1)), p.out != null ? p.out.toFixed(4) + ' ETH' : (p.lastMark ? C.dim(p.lastMark.val.toFixed(4) + ' ETH marked') : 'n/a'), ui.fmtAge((p.closedAt || Date.now()) - p.t), C.dim(p.why || (p.book ? p.book.id + ' still open · loxley positions' : 'open'))]);
    say('');
    if (rows.length) say(ui.table(['position', 'in', 'result', 'out', 'held', 'why'], rows)); else say(C.dim('  no shot fired' + (P.passed ? ', ' + P.passed + ' launches refused by the rules' : '')));
    say(''); say(ui.kv([['session', ui.fmtAge(Date.now() - P.t0) + ' · ' + P.fired + ' fired · ' + P.passed + ' passed · ' + P.closed + ' closed'], [live ? 'realised p&l' : 'paper p&l', (P.pnl >= 0 ? C.green : C.red)((P.pnl >= 0 ? '+' : '') + P.pnl.toFixed(4) + ' ETH') + C.dim(' on ' + P.spent.toFixed(4) + ' ETH deployed' + (live ? ' · gas ' + fmtEth(P.gas, 6) : ''))], ['signed', live ? C.amber(P.fired + ' buys, ' + P.closed + ' sells, from ' + ui.short(walletAddr)) : C.green('nothing: paper')]].concat(notify && notify.on ? [['alerts', notify.stats.sent + ' sent to ' + notify.where + (notify.stats.failed ? C.amber(' · ' + notify.stats.failed + ' failed') : '')]] : [])));
    if (live && openPositions().length) log.warn(openPositions().length + ' position' + (openPositions().length > 1 ? 's' : '') + ' still open in the book: loxley positions to mark, loxley sell <token> all to leave, or --exit-on-stop next time');
  }
  return { P, rules, openPositions, consider, draw, fireCurveLive, fireCurvePaper, firePool, startMarks, stopMarks, finish, summary, mark };
}
module.exports = { makeSniper, rulesFrom, refuseText, exitsText };
