'use strict';
/* positions: the book, marked live. every fill loxley made is here with what it fetches right now. */
const { attachWallet, markPosition, big, fmtEth, fmtTok } = require('../live');

module.exports = async function positions(ctx) {
  const { ui, log, flags, env } = ctx, C = ui.C;
  await attachWallet(ctx, { need: false, noPrompt: true });
  const T = ctx.trader, book = T.book;
  if (flags.clear) { if (!flags.yes) { log.error('--clear wipes ' + book.file + '. add --yes.'); return 1; } book.write({ loxley: 1, kind: 'positions', positions: [] }); log.ok('book cleared'); return 0; }
  const all = book.all(), open = all.filter(p => p.status === 'open'), closed = all.filter(p => p.status !== 'open');
  /* --json keeps stdout pure for a pipeline: an empty book is an empty book, and the hint goes to stderr */
  if (!all.length) { if (flags.json) { log.dim('the book is empty: ' + book.file); return 0; } log.raw(ui.note(C.dim('the book is empty: ' + book.file))); log.raw(ui.note(C.dim('loxley buy 0x… 0.005, or loxley snipe --live, writes to it.'))); return 0; }
  const out = { open: [], closed: [] };
  const rows = [];
  for (const p of open) {
    let mk = null; try { mk = await markPosition(ctx, p); } catch (e) { mk = { venue: 'n/a', ethOut: null, err: e.message }; }
    const inn = big(p.entry.ethWei), rem = big(p.remainingWei), realised = big(p.realisedWei);
    const pnl = mk && mk.pnlPct != null ? mk.pnlPct : null;
    const age = Date.now() - new Date(p.openedAt).getTime();
    rows.push([p.id, C.white('$' + (p.symbol || '…')), fmtTok(rem, p.decimals), fmtEth(inn), mk && mk.ethOut != null ? fmtEth(mk.ethOut) : C.dim('n/a'), pnl == null ? C.dim('n/a') : (pnl >= 0 ? C.green : C.red)(ui.fmtPct(pnl, 1)), mk ? (mk.venue === 'halted' ? C.red(mk.venue) : C.dim(mk.venue)) : '', ui.fmtAge(age), C.dim(p.source || '')]);
    out.open.push({ id: p.id, token: p.token, symbol: p.symbol, remaining: rem.toString(), ethIn: inn.toString(), realised: realised.toString(), markEth: mk && mk.ethOut != null ? mk.ethOut.toString() : null, pnlPct: pnl, venue: mk ? mk.venue : null, openedAt: p.openedAt, source: p.source });
  }
  if (flags.json) { closed.forEach(p => out.closed.push({ id: p.id, token: p.token, symbol: p.symbol, ethIn: p.entry.ethWei, realised: p.realisedWei, pnlPct: p.pnlPct, why: p.why, openedAt: p.openedAt, closedAt: p.closedAt })); log.raw(JSON.stringify(out)); return 0; }
  if (rows.length) { log.raw(C.lime('  OPEN') + C.dim('  marked now: what the remaining tokens fetch on the curve or in the pool, after fees')); log.raw(ui.table(['id', 'token', 'holding', 'in', 'worth now', 'p&l', 'venue', 'age', 'via'], rows)); }
  else log.raw(C.dim('  no open positions'));
  if (closed.length && (flags.all || !rows.length)) {
    log.raw(''); log.raw(C.lime('  CLOSED'));
    log.raw(ui.table(['id', 'token', 'in', 'out', 'p&l', 'why', 'held'], closed.slice(-20).map(p => { const inn = big(p.entry.ethWei), realised = big(p.realisedWei); const pnl = inn > 0n ? (Number(realised) / Number(inn) - 1) * 100 : null; return [p.id, C.white('$' + (p.symbol || '…')), fmtEth(inn), fmtEth(realised), pnl == null ? 'n/a' : (pnl >= 0 ? C.green : C.red)(ui.fmtPct(pnl, 1)), C.dim(p.why || ''), ui.fmtAge(new Date(p.closedAt || p.openedAt).getTime() - new Date(p.openedAt).getTime())]; })));
  } else if (closed.length) log.raw(C.dim('  ' + closed.length + ' closed · --all shows them'));
  const inn = all.reduce((s, p) => s + big(p.entry.ethWei), 0n), realised = all.reduce((s, p) => s + big(p.realisedWei), 0n);
  const marks = out.open.reduce((s, p) => s + (p.markEth ? big(p.markEth) : 0n), 0n);
  log.raw(''); log.raw(ui.kv([['book', book.file], ['deployed', fmtEth(inn) + C.dim('  across ' + all.length + ' fill' + (all.length > 1 ? 's' : ''))], ['back', fmtEth(realised) + C.dim(' realised') + (marks ? C.dim(' + ') + fmtEth(marks) + C.dim(' marked open') : '')], ['p&l', inn > 0n ? ((realised + marks >= inn ? C.green : C.red)(ui.fmtPct((Number(realised + marks) / Number(inn) - 1) * 100, 1))) : 'n/a']]));
  if (!ctx.wallet) log.raw(C.dim('  marks are read without a wallet; loxley sell needs one'));
  return 0;
};
