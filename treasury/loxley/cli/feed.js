'use strict';
/* feed: launches as they land. live: the factory's logs, polled by block range through the rpc gate.
   sim: made-up launches. either way the caller gets the same event objects. */
const { makeSimFeed } = require('./sim');
const { curveMaths, launchScore, farmOf } = require('./engine');
const pons = require('./pons');

function makeFeed(ctx, opts) {
  opts = opts || {};
  const { chain, env, log } = ctx;
  const state = { sim: !!opts.sim, index: null, head: null, blockTime: 0.25, headAt: Date.now(), lastBlock: null, running: false, events: 0, errors: 0, started: Date.now(), recent: [] };
  const scoreRules = { maxBundlePct: env.num('MAX_BUNDLE_PCT') };
  let simFeed = null, timer = null, handlers = [];
  const emit = e => handlers.forEach(h => { try { h(e); } catch (err) { log.error('handler: ' + err.message); } });

  async function start() {
    state.running = true;
    if (state.sim) {
      simFeed = makeSimFeed();
      state.index = { launches: [], byToken: {}, byDeployer: {}, grads: {}, from: 0, to: 0 };
      simFeed.backlog.forEach(e => { addSim(e); });
      state.head = simFeed.head();
      timer = setInterval(() => { simFeed.tick().forEach(e => { if (e.kind === 'grad') { const t = state.index.launches.find(x => x.curve === e.curve); if (t) { e.token = t.token; t.grad = true; state.index.grads[t.token] = e.bn; } } else addSim(e); state.events++; emit(e); }); state.head = simFeed.head(); state.headAt = Date.now(); }, env.num('POLL_MS'));
      return state;
    }
    const head = await chain.blockNumber();
    const bt = await chain.measureBlockTime(head);
    state.head = head; state.blockTime = bt.blockTime; state.headAt = bt.headAt;
    const window = opts.window != null ? opts.window : env.num('WINDOW_BLOCKS');
    state.index = await chain.buildIndex(window, head);
    state.index.launches.forEach(e => { e.at = state.headAt - (head - e.bn) * state.blockTime * 1000; });
    state.lastBlock = head;
    loop();
    return state;
  }
  function addSim(e) { const idx = state.index; if (idx.byToken[e.token]) return; idx.byToken[e.token] = e; idx.launches.unshift(e); (idx.byDeployer[e.deployer] = idx.byDeployer[e.deployer] || []).push(e); if (e.grad) idx.grads[e.token] = e.bn; }
  async function loop() {
    while (state.running) {
      const t0 = Date.now();
      try {
        const head = await chain.blockNumber();
        if (head > state.lastBlock) {
          const logs = await chain.getLogs(chain.factory, [[chain.T.LAUNCH, chain.T.GRAD, chain.T.GRAD_ALT, chain.T.SWEPT]], state.lastBlock + 1, head);
          state.head = head; state.headAt = Date.now(); state.lastBlock = head;
          logs.forEach(lg => { const e = chain.parseFactoryLog(lg); if (!e || e.removed) return; e.at = Date.now(); if (chain.addToIndex(state.index, e)) { state.events++; emit(e); } });
        }
        state.errors = 0;
      } catch (e) { state.errors++; state.lastError = e.message; if (state.errors % 5 === 1) log.warn('feed: ' + e.message + (state.errors > 1 ? ' (x' + state.errors + ')' : '')); await chain.sleep(Math.min(8000, 1000 * state.errors)); }
      const wait = env.num('POLL_MS') - (Date.now() - t0); if (wait > 0) await chain.sleep(wait);
    }
  }
  function stop() { state.running = false; if (timer) clearInterval(timer); }
  function on(h) { handlers.push(h); }

  /* one launch, read in full: token, curve, dev buy, deployer record, score */
  async function enrich(e) {
    const L = Object.assign({ pairIsEth: e.pair === chain.ZERO, pairSym: e.pair === chain.ZERO ? 'ETH' : null }, e);
    const t0 = Date.now();
    if (state.sim) {
      const tk = simFeed.tokenOf(e), c = simFeed.curve(e.curve, e.thr), db = simFeed.devBuy(e.curve), info = simFeed.info(e.curve);
      Object.assign(L, { symbol: tk.symbol, name: tk.name, supply: tk.supply, curveState: c, feeBps: c.feeBps, creatorTaxBps: c.creatorTaxBps, taxBps: c.taxBps, devShare: db ? db.share : null, devQuote: db ? db.quote : null, devQuoteWei: db ? String(Math.round(db.quote * 1e18)) : null, fill: c.thr ? Math.min(1, c.real / c.thr) : null, real: c.real, graduated: c.graduated, socials: info.socials, exempt: info.exempt, feeThird: false, feeRecipient: e.deployer });
    } else {
      /* one multicall for the curve, the token, its metadata and the factory record; the launch tx and its receipt on the side */
      const [one, declared] = await Promise.all([chain.readLaunch(e, opts.who), pons.launchDeclared(chain, e)]);
      const tk = one.token, c = one.curve, info = one.info, rec = one.record;
      Object.assign(L, { symbol: tk.symbol, name: tk.name, supply: tk.supply, curveState: c, feeBps: c.feeBps, creatorTaxBps: c.creatorTaxBps, taxBps: c.taxBps, real: c.real, graduated: c.graduated, fill: (c.real != null && e.thr) ? Math.min(1, c.real / e.thr) : null });
      /* socials: the token's own getTokenInfo, the launch calldata as a fallback; unreadable stays unread, not "none" */
      if (info) L.socials = info; else if (declared && declared.socials) { const cnt = Object.values(declared.socials).filter(Boolean).length; L.socials = { socials: declared.socials, count: cnt, has: cnt > 0, description: declared.description }; } else L.socials = undefined;
      L.description = (info && info.description) || (declared && declared.description) || null;
      L.exempt = declared && declared.exempt ? declared.exempt : null;
      L.feeRecipient = rec ? rec.feeRecipient : (declared && declared.creatorFeeRecipient) || null;
      L.feeThird = L.feeRecipient != null && L.feeRecipient !== e.deployer && L.feeRecipient !== chain.ZERO;
      if (rec && rec.creatorTaxBps != null && L.creatorTaxBps == null) L.creatorTaxBps = rec.creatorTaxBps;
      const db = await chain.devBuy(e, tk.supply);
      L.devShare = db ? db.share : null; L.devQuote = db ? db.quote : null; L.devQuoteWei = db ? db.quoteWei : null;
      if (!L.pairSym && e.pair) { const pt = await chain.tokenRead(e.pair).catch(() => null); L.pairSym = (pt && pt.symbol) || e.pair.slice(0, 8); }
    }
    L.record = chain.deployerRecord(state.index, e.deployer, state.head, state.blockTime);
    L.farm = farmOf(L, state.recent);
    L.maths = curveMaths(Object.assign({ thr: e.thr, supply: L.supply }, L.curveState || {}), env.num('PHANTOM_ETH'));
    L.score = launchScore(L, scoreRules);
    L.readAt = Date.now(); L.readMs = Date.now() - t0;
    state.recent.push({ deployer: L.deployer, devQuoteWei: L.devQuoteWei, creatorTaxBps: L.creatorTaxBps, socials: L.socials, readAt: L.readAt }); if (state.recent.length > 400) state.recent.shift();
    return L;
  }
  /* +15 s and +60 s: fill, buyers, taxed buys */
  async function followUp(L) {
    if (state.sim) { const c = simFeed.curve(L.curve, L.thr), b = simFeed.buyers(L.curve); L.curveState = c; L.real = c.real; L.fill = c.thr ? Math.min(1, c.real / c.thr) : null; L.taxBps = c.taxBps; Object.assign(L, { buys: b.buys, sells: b.sells, buyers: b.buyers, taxed: b.taxed, quoteIn: b.quoteIn, bundlePct: b.bundlePct, bundleWallets: b.bundleWallets, top5Pct: b.top5Pct, holders: b.holders, devSells: b.devSells }); L.graduated = c.graduated; }
    else {
      const c = await chain.curveRead(L.curve, { full: true, tax: true }); L.curveState = c; L.real = c.real; L.fill = (c.real != null && L.thr) ? Math.min(1, c.real / L.thr) : null; L.taxBps = c.taxBps; L.graduated = c.graduated;
      const b = await chain.curveBuyers(L, state.head, L.supply); Object.assign(L, { buys: b.buys, sells: b.sells, buyers: b.buyers, taxed: b.taxed, quoteIn: b.quoteIn, quoteOut: b.quoteOut, bundlePct: b.bundlePct, bundleWallets: b.bundleWallets, top5Pct: b.top5Pct, holders: b.holders, devSells: b.devSells, devSoldPct: b.devSoldPct });
    }
    L.record = chain.deployerRecord(state.index, L.deployer, state.head, state.blockTime);
    L.maths = curveMaths(Object.assign({ thr: L.thr, supply: L.supply }, L.curveState || {}), env.num('PHANTOM_ETH'));
    L.score = launchScore(L, scoreRules);
    return L;
  }
  /* a quick re-read of the curve only: fill and tax */
  async function curveNow(L) {
    const c = state.sim ? simFeed.curve(L.curve, L.thr) : await chain.curveRead(L.curve, { full: true, tax: true });
    L.curveState = c; L.real = c.real; L.taxBps = c.taxBps; L.graduated = c.graduated; L.fill = (c.real != null && L.thr) ? Math.min(1, c.real / L.thr) : null;
    L.maths = curveMaths(Object.assign({ thr: L.thr, supply: L.supply }, c), env.num('PHANTOM_ETH'));
    return L;
  }
  return { state, start, stop, on, enrich, followUp, curveNow, get sim() { return state.sim; } };
}
module.exports = { makeFeed };
