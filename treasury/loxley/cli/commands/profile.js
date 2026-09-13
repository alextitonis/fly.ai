'use strict';
/* profile: the desk's own record, from the book (~/.loxley/positions.json) and the tally (~/.loxley/stats.json).
   fires, wins, what came back, the best and the worst, the exits by reason, a month of p&l in a sparkline, the
   launches refused and the rule that refused them. reads only, nothing leaves the machine. */
const W = require('../wallet');
const { makeTrader } = require('../trade');
const { fmtEth, big, ethNum } = require('../live');
const stats = require('../stats');

module.exports = async function profile(ctx) {
  const { ui, log, env, flags } = ctx, C = ui.C;
  const days = Math.max(1, parseInt(flags.days != null ? flags.days : 30, 10) || 30);
  const locked = await W.resolveWallet(env, { locked: true }).catch(() => null);
  ctx.trader = makeTrader(ctx, null);
  const all = ctx.trader.book.all();
  const since = Date.now() - days * 86400000;
  const inWindow = all.filter(p => new Date(p.openedAt).getTime() >= since);
  const closed = inWindow.filter(p => p.status === 'closed'), open = inWindow.filter(p => p.status === 'open');
  const pnlWei = p => big(p.realisedWei) - big(p.entry.ethWei);
  const wins = closed.filter(p => pnlWei(p) > 0n), losses = closed.filter(p => pnlWei(p) <= 0n);
  const deployed = inWindow.reduce((s, p) => s + big(p.entry.ethWei), 0n), realised = closed.reduce((s, p) => s + pnlWei(p), 0n);
  const gas = inWindow.reduce((s, p) => s + big(p.entry.gasWei || 0), 0n);
  const avg = list => list.length ? list.reduce((s, p) => s + (p.pnlPct || 0), 0) / list.length : null;
  const held = p => p.closedAt ? new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime() : 0;
  const avgHold = closed.length ? closed.reduce((s, p) => s + held(p), 0) / closed.length : null;
  const tally = stats.read(env);
  const refusedTotal = Object.values(tally.refused).reduce((s, n) => s + n, 0);
  if (flags.json) { log.raw(JSON.stringify({ days, wallet: locked ? locked.address : null, fired: inWindow.length, closed: closed.length, open: open.length, wins: wins.length, winRate: closed.length ? wins.length / closed.length : null, deployedEth: ethNum(deployed), realisedEth: ethNum(realised), gasEth: ethNum(gas), avgWinPct: avg(wins), avgLossPct: avg(losses), avgHoldMs: avgHold, refused: tally.refused, positions: closed.map(p => ({ id: p.id, symbol: p.symbol, pnlPct: p.pnlPct, why: p.why, held: held(p) })) })); return 0; }
  log.raw('');
  log.raw(C.white(C.bold('  ' + (env.LOXLEY_USER || 'the desk'))) + C.dim('  ' + days + ' days · ' + (locked ? 'wallet ' + ui.short(locked.address) : 'no wallet') + ' · ' + all.length + ' fills in the book since ' + (all.length ? all[0].openedAt.slice(0, 10) : 'never')));
  log.raw('');
  if (!inWindow.length) {
    log.raw(ui.note(C.dim('nothing fired in the last ' + days + ' days. loxley snipe rehearses on paper; loxley snipe --live, loxley follow --live and loxley buy fill the book.')));
    if (refusedTotal) log.raw(ui.note(C.dim('refused ' + refusedTotal + ' launches: ' + Object.keys(tally.refused).sort((a, b) => tally.refused[b] - tally.refused[a]).map(k => k + ' ' + tally.refused[k]).join(' · '))));
    return 0;
  }
  const byWhy = {}; closed.forEach(p => { const k = String(p.why || 'sell').replace(/^guard: /, '').replace(/^siren: /, 'siren: '); byWhy[k] = (byWhy[k] || 0) + 1; });
  const sirens = Object.keys(byWhy).filter(k => /^siren/.test(k)).sort((a, b) => byWhy[b] - byWhy[a]);
  const others = Object.keys(byWhy).filter(k => !/^siren/.test(k)).sort((a, b) => byWhy[b] - byWhy[a]);
  /* the best and the worst must not be the same fills wearing two hats: with five closed positions there are three
     best and two worst, with three there is one of each, and a book of one has a best and no worst at all */
  const ranked = closed.slice().sort((a, b) => (b.pnlPct || 0) - (a.pnlPct || 0));
  const nBest = Math.max(1, Math.min(3, Math.ceil(ranked.length / 2))), nWorst = Math.min(2, ranked.length - nBest);
  const best = ranked.slice(0, nBest), worst = nWorst > 0 ? ranked.slice(-nWorst).reverse() : [];
  const one = p => C.white('$' + (p.symbol || ui.short(p.token))) + ' ' + ((p.pnlPct || 0) >= 0 ? C.green : C.red)(ui.fmtPct(p.pnlPct || 0, 1)) + C.dim(' (' + (p.why || 'sell').replace(/^guard: /, '') + ')');
  /* a month of realised p&l, one bar per day */
  const daily = new Array(Math.min(days, 30)).fill(0);
  closed.forEach(p => { const d = Math.floor((Date.now() - new Date(p.closedAt).getTime()) / 86400000); if (d >= 0 && d < daily.length) daily[daily.length - 1 - d] += ethNum(pnlWei(p)); });
  /* the bars are scaled to the root of the best day, not to it: one 400% position is worth forty ordinary days, and
     on a linear scale that single day flattens the whole month into a line */
  const bars = '▁▂▃▄▅▆▇█', peak = Math.max(...daily.map(v => Math.abs(v))) || 1;
  const spark = daily.map(v => { const b = bars[Math.max(0, Math.min(7, Math.round(Math.sqrt(Math.abs(v) / peak) * 7)))]; return v > 0 ? C.green(b) : v < 0 ? C.red(b) : C.faint('▁'); }).join('');
  const bestDay = Math.max(...daily), worstDay = Math.min(...daily);
  log.raw(ui.kv([
    ['fired', C.white(String(inWindow.length)) + C.dim(' · closed ' + closed.length + ' · open ' + open.length)],
    ['won', closed.length ? C.white(wins.length + ' of ' + closed.length) + C.dim(' · ') + (wins.length / closed.length >= 0.5 ? C.green : C.amber)(Math.round(wins.length / closed.length * 100) + '%') + C.dim(' · avg win ') + C.green(avg(wins) == null ? 'n/a' : ui.fmtPct(avg(wins), 0)) + C.dim(' · avg loss ') + C.red(avg(losses) == null ? 'n/a' : ui.fmtPct(avg(losses), 0)) + C.dim(avgHold != null ? ' · avg hold ' + ui.fmtAge(avgHold) : '') : C.dim('nothing closed yet')],
    ['realised', (realised >= 0n ? C.green : C.red)((realised >= 0n ? '+' : '') + fmtEth(realised)) + C.dim(' on ' + fmtEth(deployed) + ' deployed · gas ' + fmtEth(gas, 6))],
    ['p&l, ' + daily.length + ' d', spark + C.dim('  one bar per day, root-scaled · best day ' + (bestDay >= 0 ? '+' : '') + bestDay.toFixed(4) + ' ETH · worst day ' + worstDay.toFixed(4) + ' ETH')],
    ['best', best.length ? best.map(one).join(C.dim(' · ')) : C.dim('n/a')],
    ['worst', worst.length ? worst.map(one).join(C.dim(' · ')) : C.dim('n/a')],
    ['left on', others.length ? others.map(k => k + C.dim(' ×' + byWhy[k])).join(C.dim(' · ')) : C.dim('n/a')],
    ['sirens', sirens.length ? sirens.map(k => C.red(k.replace(/^siren: /, '') + ' ×' + byWhy[k])).join(C.dim(' · ')) : C.dim('none pulled the trigger')],
    ['refused', refusedTotal ? C.white(refusedTotal + ' launches') + C.dim(' · ' + Object.keys(tally.refused).sort((a, b) => tally.refused[b] - tally.refused[a]).map(k => k + ' ' + tally.refused[k]).join(' · ')) : C.dim('no tally yet: the sniper keeps one')]
  ]));
  log.raw('');
  const rows = closed.slice().sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, 8).map(p => [ui.fmtAge(Date.now() - new Date(p.closedAt).getTime()) + ' ago', C.white('$' + (p.symbol || ui.short(p.token))), fmtEth(big(p.entry.ethWei), 4), fmtEth(big(p.realisedWei), 4), ((p.pnlPct || 0) >= 0 ? C.green : C.red)(ui.fmtPct(p.pnlPct || 0, 1)), ui.fmtAge(held(p)), /siren/.test(p.why || '') ? C.red(String(p.why).replace(/^guard: /, '')) : C.dim(String(p.why || 'sell').replace(/^guard: /, ''))]);
  if (rows.length) log.raw(ui.table(['when', 'token', 'in', 'out', 'result', 'held', 'left on'], rows));
  log.raw(''); log.raw(ui.note(C.dim('the book is ' + ctx.trader.book.file + '; loxley positions --all prints every fill with its hash. --days N · --json')));
  return 0;
};
