'use strict';
/* engine: pure maths, the same rules the desk runs in the browser. no io in this file.
   pool side: computeMetrics → hardFlags → scoreOf → verdictsOf, the siren in evalAlert.
   curve side: launchScore for a fresh pons v2 launch, curveMaths for the door on the curve. */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = v => { v = parseFloat(v); return isFinite(v) ? v : null; };
const fmtUsd = v => (v == null ? 'n/a' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(v < 1 ? 4 : 2));
const fmtNum = v => (v == null ? 'n/a' : v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v)));
const fmtAge = ms => (ms == null ? 'n/a' : ms / 3600000 < 1 ? Math.round(ms / 60000) + 'm' : ms / 3600000 < 48 ? (ms / 3600000).toFixed(1) + 'h' : Math.round(ms / 86400000) + 'd');

/* ---------- pool side ---------- */
function computeMetrics(tok, now) {
  now = now || Date.now();
  const p = tok.pair, m = {};
  m.price = num(p.priceUsd); m.priceNative = num(p.priceNative);
  m.solPrice = (m.price && m.priceNative) ? m.price / m.priceNative : null;
  m.liq = p.liquidity ? num(p.liquidity.usd) : null; m.liqQuote = p.liquidity ? num(p.liquidity.quote) : null;
  m.mcap = num(p.marketCap) || num(p.fdv);
  if (m.mcap == null && tok.chain && tok.chain.supply && m.price) m.mcap = tok.chain.supply * m.price;
  m.fdv = num(p.fdv);
  m.vol24 = p.volume ? num(p.volume.h24) : null; m.vol5 = p.volume ? num(p.volume.m5) : null; m.vol1 = p.volume ? num(p.volume.h1) : null;
  m.chg5 = p.priceChange ? num(p.priceChange.m5) : null; m.chg1 = p.priceChange ? num(p.priceChange.h1) : null; m.chg6 = p.priceChange ? num(p.priceChange.h6) : null; m.chg24 = p.priceChange ? num(p.priceChange.h24) : null;
  const share = o => { if (!o) return null; const b = o.buys || 0, s = o.sells || 0; return (b + s) > 0 ? s / (b + s) : null; };
  m.sell5 = p.txns ? share(p.txns.m5) : null; m.sell1 = p.txns ? share(p.txns.h1) : null;
  m.tx5 = p.txns && p.txns.m5 ? (p.txns.m5.buys || 0) + (p.txns.m5.sells || 0) : 0;
  m.tx1 = p.txns && p.txns.h1 ? (p.txns.h1.buys || 0) + (p.txns.h1.sells || 0) : 0;
  m.tx24 = p.txns && p.txns.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : 0;
  m.ageMs = p.pairCreatedAt ? (now - p.pairCreatedAt) : null;
  m.liqRatio = (m.liq && m.mcap) ? m.liq / m.mcap : null;
  m.turnover = (m.vol24 && m.liq) ? m.vol24 / m.liq : null;
  m.pools = (tok.pairs || [p]).length;
  const quoteIsEth = p.quoteToken && /^(ETH|WETH)$/i.test(p.quoteToken.symbol || '');
  if (quoteIsEth && m.liqQuote) m.reserveSol = m.liqQuote;
  else if (m.liq && m.solPrice) m.reserveSol = (m.liq / 2) / m.solPrice;
  else m.reserveSol = null;
  m.impact = x => (m.reserveSol ? (x / (x + m.reserveSol)) * 100 : null);
  m.safeSol = m.reserveSol ? (m.reserveSol * 0.05 / 0.95) : null;
  m.top10 = tok.chain ? tok.chain.top10 : null; m.verified = tok.chain ? tok.chain.verified : undefined;
  m.holdersCount = tok.chain ? tok.chain.holdersCount : null; m.supply = tok.chain ? tok.chain.supply : null;
  m.avgTrade24 = (m.vol24 && m.tx24) ? m.vol24 / m.tx24 : null; m.avgTrade1 = (m.vol1 && m.tx1) ? m.vol1 / m.tx1 : null;
  m.poolBase = p.liquidity ? num(p.liquidity.base) : null;
  m.topAdj = null; m.poolHolders = 0; m.topList = [];
  if (tok.chain && tok.chain.top && tok.chain.top.length && tok.chain.supply) {
    const poolTokens = m.poolBase || 0, pairAddr = (p.pairAddress || '').toLowerCase(); let sumAdj = 0, counted = 0;
    m.topList = tok.chain.top.map(h => {
      const isPool = ((h.address || '').toLowerCase() === pairAddr && !!pairAddr) || (poolTokens > 0 && Math.abs(h.amount - poolTokens) / poolTokens < 0.25);
      if (isPool) m.poolHolders++; else if (counted < 10) { sumAdj += h.amount; counted++; }
      return { address: h.address, amount: h.amount, pct: h.pct, pool: isPool };
    });
    m.topAdj = sumAdj / tok.chain.supply * 100;
  }
  const flags = [];
  if (m.avgTrade24 != null && m.avgTrade24 < 25 && m.tx24 > 800) flags.push('tiny average trade $' + m.avgTrade24.toFixed(1) + ' across ' + fmtNum(m.tx24) + ' trades');
  if (m.turnover != null && m.turnover > 40) flags.push('volume is ' + m.turnover.toFixed(0) + 'x the pool in 24h');
  const b24 = p.txns && p.txns.h24 ? p.txns.h24.buys || 0 : 0, s24 = p.txns && p.txns.h24 ? p.txns.h24.sells || 0 : 0;
  if (b24 + s24 > 500 && Math.abs(b24 - s24) / (b24 + s24) < 0.02) flags.push('buys and sells almost perfectly mirrored');
  m.washFlags = flags; m.washScore = clamp(flags.length * 34, 0, 100);
  const info = p.info || {}; m.socials = (info.socials || []).length + (info.websites || []).length; m.socialList = [].concat(info.websites || [], info.socials || []);
  m.symbol = p.baseToken && p.baseToken.symbol; m.name = p.baseToken && p.baseToken.name; m.dex = p.dexId; m.quote = p.quoteToken && p.quoteToken.symbol;
  return m;
}
function hardFlags(m) {
  const out = [];
  if (m.liq != null && m.liq < 5000) out.push({ k: 'DUST LIQUIDITY', v: 'only ' + fmtUsd(m.liq) + ' in the pool, any exit destroys the price' });
  const im1 = m.impact ? m.impact(1) : null;
  if (im1 != null && im1 > 25) out.push({ k: 'EXIT COSTS ' + im1.toFixed(0) + '%', v: 'a 1 ETH sell eats a quarter of the price' });
  if (m.topAdj != null && m.topAdj > 70) out.push({ k: 'HOLDER CARTEL', v: 'top-10 wallets outside the pool hold ' + m.topAdj.toFixed(0) + '% of supply' });
  if (m.washFlags && m.washFlags.length >= 2) out.push({ k: 'VOLUME LOOKS PAINTED', v: m.washFlags[0] });
  return out;
}
function liqTrend(hist) {
  const h = hist || []; if (h.length < 3) return null;
  const first = h[0], last = h[h.length - 1], span = (last.t - first.t) / 1000; if (span < 75) return null;
  const pct = (last.liq - first.liq) / first.liq * 100; let falling = true;
  for (let i = Math.max(1, h.length - 3); i < h.length; i++) if (h[i].liq > h[i - 1].liq * 1.005) falling = false;
  return { pct, span, polls: h.length, from: first.liq, to: last.liq, falling };
}
function drainClock(m, hist) {
  const t = liqTrend(hist); if (!t || t.pct > -8 || !t.falling) return null;
  const perSec = (t.from - t.to) / t.span; if (perSec <= 0) return null;
  return { secs: m.liq / perSec, pct: t.pct, span: t.span, polls: t.polls, perMin: perSec * 60 };
}
function scoreOf(m, hist) {
  const parts = []; let total = 0;
  const add = (k, v, max, note) => { v = clamp(v, 0, max); parts.push({ k, v, max, note }); total += v; };
  const absDepth = m.liq == null ? 8 : m.liq >= 1e6 ? 25 : m.liq >= 250e3 ? 19 : m.liq >= 50e3 ? 12 : m.liq >= 10e3 ? 6 : 2;
  const relDepth = m.liqRatio != null ? m.liqRatio * 250 : 0;
  add('depth', Math.max(absDepth, relDepth), 25, (m.liq != null ? fmtUsd(m.liq) + ' pooled' : 'no data') + (m.liqRatio != null ? ' · ' + (m.liqRatio * 100).toFixed(1) + '% of mcap' : ''));
  const buyShare = m.sell5 != null ? 1 - m.sell5 : (m.sell1 != null ? 1 - m.sell1 : null);
  add('flow', buyShare != null ? (buyShare - 0.30) / 0.35 * 20 : 10, 20, buyShare != null ? Math.round(buyShare * 100) + '% buys' : 'thin flow');
  const conc = m.topAdj != null ? m.topAdj : m.top10;
  add('holders', conc != null ? (70 - conc) / 50 * 15 : 7, 15, conc != null ? conc.toFixed(1) + '% top-10 outside the pool' : 'explorer n/a');
  add('contract', m.verified === true ? 15 : m.verified === undefined ? 7.5 : 4, 15, m.verified === true ? 'source verified' : (m.verified === undefined ? 'scan n/a' : 'unverified'));
  const ah = m.ageMs != null ? m.ageMs / 3600000 : null;
  add('age', ah != null ? (ah < 1 ? 3 : ah < 6 ? 7 : ah < 24 ? 11 : 15) : 6, 15, ah != null ? fmtAge(m.ageMs) + ' old' : 'unknown');
  const to = m.turnover;
  add('turnover', to != null ? (to < 0.2 ? 3 : to < 3 ? 10 : to < 15 ? 7 : 3) : 5, 10, to != null ? to.toFixed(1) + 'x' : 'no data');
  const wash = m.washScore || 0;
  if (wash) { total -= wash * 0.18; parts.push({ k: 'wash penalty', v: -(wash * 0.18), max: 0, note: m.washFlags[0] }); }
  const hf = hardFlags(m);
  if (hf.length) total = Math.min(total, hf.length > 1 ? 18 : 34);
  const tr = liqTrend(hist);
  if (tr && tr.falling && tr.pct <= -15) { const cap = tr.pct <= -40 ? 15 : 30; if (total > cap) { parts.push({ k: 'drain cap', v: cap - total, max: 0, note: 'pool ' + tr.pct.toFixed(0) + '% over ' + Math.round(tr.span) + 's' }); total = cap; } }
  return { total: Math.round(clamp(total, 0, 100)), parts, hard: hf };
}
function verdictsOf(m, hist) {
  const v = (state, text) => ({ state, text }); const out = {};
  out.SCOUT = m.pools ? v(m.ageMs != null && m.ageMs < 3600000 ? 'warn' : 'ok', m.pools + ' pool' + (m.pools > 1 ? 's' : '') + ' · ' + fmtAge(m.ageMs)) : v('na', 'no pools');
  out.AUDIT = (m.verified === undefined) ? v('na', 'scan n/a') : (m.verified ? v('ok', 'source verified') : v('warn', 'unverified src'));
  const conc = m.topAdj != null ? m.topAdj : m.top10;
  out.WHALE = conc == null ? v('na', 'explorer n/a') : v(conc > 60 ? 'bad' : conc > 35 ? 'warn' : 'ok', conc.toFixed(1) + '% ex-pool');
  if (m.liq == null) out.LP = v('na', 'no pool data');
  else { const deep = m.liq >= 250e3 || (m.liqRatio != null && m.liqRatio >= 0.06), thin = m.liq < 50e3 && (m.liqRatio == null || m.liqRatio < 0.02); out.LP = v(thin ? 'bad' : deep ? 'ok' : 'warn', fmtUsd(m.liq) + (m.liqRatio != null ? ' · ' + (m.liqRatio * 100).toFixed(1) + '%' : '')); }
  const sp = m.sell5 != null ? m.sell5 : m.sell1;
  out.FLOW = sp == null ? v('na', 'no trades') : v(sp > 0.65 ? 'bad' : sp > 0.52 ? 'warn' : 'ok', Math.round(sp * 100) + '% sells');
  const honesty = 100 - (m.washScore || 0);
  out.VOL = !m.tx24 ? v('na', 'no trades') : v(honesty >= 80 ? 'ok' : honesty >= 50 ? 'warn' : 'bad', honesty + '/100 honest');
  const im1 = m.impact ? m.impact(1) : null;
  out.SNIPER = im1 == null ? v('na', 'no reserve') : v(im1 > 10 ? 'bad' : im1 > 3 ? 'warn' : 'ok', '1 ETH → ' + (im1 < 0.1 ? '<0.1' : im1.toFixed(1)) + '%');
  const dc = drainClock(m, hist), tr = liqTrend(hist);
  out.EXIT = (tr && tr.pct <= -15 && tr.falling) ? v('bad', 'pool ' + tr.pct.toFixed(0) + '% in ' + Math.round(tr.span) + 's')
    : dc && dc.secs < 600 ? v('bad', 'draining ' + fmtUsd(dc.perMin) + '/min')
    : m.safeSol == null ? v('na', 'no reserve') : v(m.safeSol < 0.06 ? 'bad' : m.safeSol < 0.6 ? 'warn' : 'ok', m.safeSol.toFixed(2) + ' ETH at 5%');
  return out;
}
function verdictKind(score) { if (!score) return null; if ((score.hard || []).length >= 1 || score.total < 40) return 'avoid'; if (score.total >= 70) return 'enter'; return 'careful'; }
function evalAlert(m, hist, extra) {
  const flags = [], tr = liqTrend(hist), dc = drainClock(m, hist);
  if (extra && extra.devMoves && extra.devMoves.moved) flags.push({ lvl: 'bad', code: 'DEV SOLD', msg: 'the deployer moved ' + (extra.devMoves.pct != null ? extra.devMoves.pct.toFixed(2) + '% of supply' : fmtNum(extra.devMoves.tokens) + ' tokens') + ' out of its wallet (' + extra.devMoves.sells.length + ' sell' + (extra.devMoves.sells.length === 1 ? '' : 's') + ', ' + extra.devMoves.transfers.length + ' transfer' + (extra.devMoves.transfers.length === 1 ? '' : 's') + ')' });
  if (tr && tr.pct <= -15 && tr.falling) flags.push({ lvl: 'bad', code: 'LIQUIDITY LEAVING', msg: 'pool went from ' + fmtUsd(tr.from) + ' to ' + fmtUsd(tr.to) + ' over ' + Math.round(tr.span) + 's across ' + tr.polls + ' polls' });
  else if (tr && tr.pct <= -7 && tr.falling) flags.push({ lvl: 'warn', code: 'POOL THINNING', msg: 'pool down ' + Math.abs(tr.pct).toFixed(1) + '% over the last ' + Math.round(tr.span) + 's' });
  if (dc && dc.secs < 20 * 60) flags.push({ lvl: dc.secs < 8 * 60 ? 'bad' : 'warn', code: 'DRAIN PACE', msg: fmtUsd(dc.perMin) + ' leaving per minute, roughly ' + Math.round(dc.secs / 60) + 'm of depth left at that pace' });
  if (m.chg5 != null && m.chg5 < -15) flags.push({ lvl: 'bad', code: 'CRASH', msg: 'price down ' + Math.abs(m.chg5).toFixed(1) + '% in five minutes' });
  if (m.sell5 != null && m.sell5 > 0.68 && m.chg5 != null && m.chg5 < -4) flags.push({ lvl: 'bad', code: 'DISTRIBUTION', msg: Math.round(m.sell5 * 100) + '% of the last trades are sells while price bleeds' });
  if (m.safeSol != null && m.safeSol < 0.05) flags.push({ lvl: 'warn', code: 'NARROW EXIT', msg: 'less than 0.05 ETH can leave without moving price 5%' });
  flags.sort((a, b) => (b.lvl === 'bad') - (a.lvl === 'bad'));
  return flags[0] || null;
}
function exitMaths(R, x, feeBps, taxBps) {
  if (!R || !(x > 0)) return null;
  const fee = (feeBps == null ? 30 : feeBps) / 10000, tax = (taxBps == null ? 0 : taxBps) / 10000;
  const impact = x / (x + R); const out = x * (1 - impact) * (1 - fee) * (1 - tax);
  return { impact: impact * 100, out, safe: R * 0.05 / 0.95, fee: fee * 100, tax: tax * 100 };
}

/* ---------- curve side ---------- */
/* a pons v2 curve is a constant product with a virtual quote reserve behind it. when getReserves() answered,
   quoteReserve is the exact figure and the price is exact; otherwise (phantom + real) / tokenReserve stands in,
   labelled an estimate everywhere it shows */
function curveMaths(c, phantom) {
  const real = c.real == null ? 0 : c.real, tr = c.tokenReserve;
  const exact = c.quoteReserve != null && c.quoteReserve > 0;
  const quote = exact ? c.quoteReserve : (phantom || 0) + real;
  const price = tr ? quote / tr : null;                /* ETH per token */
  const fill = c.thr ? clamp(real / c.thr, 0, 1) : null;
  const fee = c.feeBps == null ? 100 : c.feeBps, tax = c.creatorTaxBps == null ? 0 : c.creatorTaxBps;
  const door = x => { const imp = x / (x + quote); return { impact: imp * 100, out: x * (1 - imp) * (1 - fee / 10000) * (1 - tax / 10000) }; };
  return { price, fdv: price != null && c.supply ? price * c.supply : null, fill, quote, fee, tax, door, safe: quote * 0.05 / 0.95, exact, phantom: exact ? quote - real : (phantom || 0) };
}
/* the launch score: what the chain says about a launch in its first minute */
function launchScore(L, rules) {
  rules = rules || {};
  const parts = []; let total = 50;
  const add = (k, v, note) => { parts.push({ k, v, note }); total += v; };
  if (L.devShare == null) add('dev buy', 0, 'unread');
  else if (L.devShare === 0) add('dev buy', -10, 'no dev buy, no skin');
  else if (L.devShare <= 6 && L.devShare >= 1) add('dev buy', 15, L.devShare.toFixed(2) + '%, inside the 1–6% band');
  else if (L.devShare > 10) add('dev buy', -25, L.devShare.toFixed(1) + '%, over 10%: a bag to dump');
  else add('dev buy', 4, L.devShare.toFixed(2) + '%');
  if (L.creatorTaxBps == null) add('creator tax', 0, 'unread');
  else if (L.creatorTaxBps === 0) add('creator tax', 5, 'none');
  else if (L.creatorTaxBps <= 200) add('creator tax', 10, (L.creatorTaxBps / 100).toFixed(1) + '%, creator earns on volume');
  else if (L.creatorTaxBps > 500) add('creator tax', -25, (L.creatorTaxBps / 100).toFixed(1) + '% kills the volume');
  else add('creator tax', 0, (L.creatorTaxBps / 100).toFixed(1) + '%');
  if (L.feeThird) add('fees', -5, 'paid to a third party, not the deployer');
  if (L.pairIsEth === false) add('pair', -5, 'not paired with ETH'); else if (L.pairIsEth) add('pair', 5, 'ETH pair');
  if (L.socials === undefined) { /* not read: no opinion */ }
  else if (!L.socials || !L.socials.count) add('socials', -15, 'none');
  else { let v = 0, notes = []; if (L.socials.socials.twitter) { v += 8; notes.push('X'); } if (L.socials.socials.website) { v += 8; notes.push('website'); } if (L.socials.socials.telegram) { v += 4; notes.push('telegram'); } add('socials', Math.min(16, v), notes.join(' + ')); }
  if (L.exempt != null) { if (L.exempt.length) add('bundle', -25, L.exempt.length + ' wallet' + (L.exempt.length > 1 ? 's' : '') + ' declared exempt from the opening tax'); else add('bundle', 5, 'no declared bundle wallets'); }
  if (L.farm) add('farm', -25, 'same dev buy, tax and links from ' + L.farm + ' fresh wallet' + (L.farm > 1 ? 's' : '') + ' inside 30 min');
  const r = L.record;
  if (r) {
    if (r.launches <= 1) add('deployer', 5, 'first launch in the window');
    else if (r.launches >= 5 && r.grads === 0) add('deployer', -25, r.launches + ' launches, none graduated: a production line');
    else if (r.rate != null && r.rate >= 0.3) add('deployer', 15, r.grads + ' of ' + r.launches + ' graduated');
    else add('deployer', -5, r.launches + ' launches, ' + r.grads + ' graduated');
    if (r.twins >= 2) add('twins', -25, r.twins + ' more launches by the same wallet inside 30 min');
    else if (r.twins === 1) add('twins', -8, 'one more launch by the same wallet inside 30 min');
  } else add('deployer', 0, 'index unread');
  if (L.buyers != null) {
    if (L.buyers >= 10) add('buyers', 10, L.buyers + ' distinct buyers in the first minute');
    else add('buyers', 0, L.buyers + ' distinct buyer' + (L.buyers === 1 ? '' : 's') + ' so far');
    if (L.buys > 0 && L.taxed === L.buys) add('bots', -10, 'every early buy paid the opening tax');
  }
  const maxBundle = rules.maxBundlePct == null ? 8 : rules.maxBundlePct;
  if (L.bundlePct != null) { if (L.bundlePct > maxBundle) add('block-0', -20, L.bundlePct.toFixed(1) + '% of supply taken in the launch block by ' + L.bundleWallets + ' wallet' + (L.bundleWallets > 1 ? 's' : '')); else if (L.bundleWallets) add('block-0', 0, L.bundleWallets + ' wallet' + (L.bundleWallets > 1 ? 's' : '') + ', ' + L.bundlePct.toFixed(1) + '% of supply'); }
  if (L.top5Pct != null && L.top5Pct > 40) add('top-5', -10, 'top-5 buyers hold ' + L.top5Pct.toFixed(0) + '% of supply');
  if (L.fill != null && L.fill >= 0.5) add('curve', 8, Math.round(L.fill * 100) + '% to graduation');
  total = Math.round(clamp(total, 0, 100));
  return { total, parts, verdict: total >= 75 ? 'FIRE' : total >= 45 ? 'WATCH' : 'SKIP' };
}
/* the launch-farm fingerprint: the same dev buy (to the wei), the same creator tax and the same links from other
   fresh wallets inside 30 minutes is one operator with many wallets. recent: what this session has read */
function farmOf(L, recent, now) {
  now = now || Date.now();
  if (L.devQuoteWei == null || !L.devQuoteWei) return 0;
  const key = x => String(x.devQuoteWei) + '|' + (x.creatorTaxBps == null ? '?' : x.creatorTaxBps) + '|' + (x.socials && x.socials.socials ? [x.socials.socials.twitter, x.socials.socials.website, x.socials.socials.telegram].map(v => v || '').join(',') : '');
  const k = key(L), deps = {};
  (recent || []).forEach(x => { if (x.deployer !== L.deployer && now - (x.readAt || 0) <= 1800000 && key(x) === k) deps[x.deployer] = 1; });
  return Object.keys(deps).length;
}
/* the sniper's refusals, the rule that says no is named */
function refusals(L, rules) {
  const out = [];
  if (L.score.total < rules.minScore) out.push('score ' + L.score.total + ' < ' + rules.minScore);
  if (rules.ethPairsOnly && L.pairIsEth === false) out.push('pair is ' + (L.pairSym || 'not ETH'));
  if (L.devShare != null && L.devShare > rules.maxDevShare) out.push('dev share ' + L.devShare.toFixed(1) + '% > ' + rules.maxDevShare + '%');
  if (L.creatorTaxBps != null && L.creatorTaxBps / 100 > rules.maxCreatorTax) out.push('creator tax ' + (L.creatorTaxBps / 100).toFixed(1) + '% > ' + rules.maxCreatorTax + '%');
  if (L.record && L.record.twins > rules.maxTwins) out.push(L.record.twins + ' twins > ' + rules.maxTwins);
  if (rules.maxExempt != null && L.exempt && L.exempt.length > rules.maxExempt) out.push(L.exempt.length + ' exempt wallet' + (L.exempt.length > 1 ? 's' : '') + ' > ' + rules.maxExempt + ' (declared bundle)');
  if (rules.maxBundlePct != null && L.bundlePct != null && L.bundlePct > rules.maxBundlePct) out.push('block-0 bundle ' + L.bundlePct.toFixed(1) + '% > ' + rules.maxBundlePct + '%');
  if (rules.requireSocials && L.socials !== undefined && !(L.socials && L.socials.count)) out.push('no socials');
  if (rules.refuseFarms && L.farm) out.push('launch farm (' + L.farm + ' sibling' + (L.farm > 1 ? 's' : '') + ')');
  if (rules.open >= rules.maxOpen) out.push('open positions ' + rules.open + ' ≥ ' + rules.maxOpen);
  return out;
}
module.exports = { clamp, num, fmtUsd, fmtNum, fmtAge, computeMetrics, hardFlags, liqTrend, drainClock, scoreOf, verdictsOf, verdictKind, evalAlert, exitMaths, curveMaths, launchScore, farmOf, refusals };
