'use strict';
/* radar: the launch radar drawn with characters. newest at the centre, the sweep lights what it passes,
   the ring of a blip is not drawable here so the list on the right carries the curve fill. */
const { makeFeed } = require('../feed');

const RING = [[60, '1m'], [300, '5m'], [900, '15m'], [3600, '1h']];
const ageR = age => { const k = Math.log(1 + age / 15) / Math.log(1 + 3600 / 15); return 0.10 + 0.86 * Math.max(0, Math.min(1, k)); };
function toneOf(L, byDep) {
  const n = (byDep[L.deployer] || []).length;
  if (L.grad || L.graduated) return { c: 'green', tag: 'GRAD' };
  if (n >= 4) return { c: 'red', tag: 'SERIAL' };
  if (n >= 2) return { c: 'amber', tag: 'REPEAT' };
  if (L.pairIsEth === false) return { c: 'blue', tag: (L.pairSym || 'PAIR').slice(0, 6) };
  return { c: 'lime', tag: 'FRESH' };
}

module.exports = async function radar(ctx) {
  const { ui, log, flags, env } = ctx, C = ui.C;
  const feed = makeFeed(ctx, { sim: !!flags.sim, window: flags.window != null ? parseInt(flags.window, 10) : undefined });
  const forS = flags.for != null ? parseFloat(flags.for) : null;
  process.stdout.write(C.dim('reading the factory…') + '\n');
  const st = await feed.start();
  const idx = st.index, items = {};
  const events = [];
  const note = (s, c) => { events.unshift({ t: ui.clock(), s, c: c || 'dim' }); if (events.length > 6) events.pop(); };
  const angleOf = tok => { let h = 5381; for (let i = 2; i < tok.length; i++) h = ((h * 33) ^ tok.charCodeAt(i)) >>> 0; return (h / 4294967295) * Math.PI * 2; };
  function track(e) { if (items[e.token]) return items[e.token]; const L = Object.assign({ symbol: e.sym || null, ang: angleOf(e.token), pairIsEth: e.pair === '0x0000000000000000000000000000000000000000', flash: 0 }, e); items[e.token] = L; return L; }
  idx.launches.forEach(track);
  let stop = false;
  const queue = idx.launches.slice(0, 12).map(e => e.token);
  (async () => { while (!stop && queue.length) { const t = queue.shift(); const L = items[t]; if (!L || L.readAt) continue; try { Object.assign(L, await feed.enrich(L)); } catch (e) { L.symbol = L.symbol || null; } } })();
  feed.on(async e => {
    if (e.kind === 'grad') { const L = items[e.token]; if (L) { L.grad = true; L.flash = Date.now(); note('$' + (L.symbol || ui.short(e.token)) + ' graduated', 'green'); } return; }
    if (e.kind === 'swept') { const L = items[e.token]; if (L) { L.swept = true; note('$' + (L.symbol || ui.short(e.token)) + ' swept, pool pending', 'amber'); } return; }
    if (e.kind !== 'launch') return;
    const L = track(e); L.flash = Date.now(); note('launch ' + ui.short(e.token) + ' by ' + ui.short(e.deployer), 'lime');
    try { Object.assign(L, await feed.enrich(e)); note('$' + (L.symbol || '…') + ' ' + L.score.verdict + ' ' + L.score.total + ' · dev ' + (L.devShare == null ? 'n/a' : L.devShare.toFixed(1) + '%'), L.score.verdict === 'FIRE' ? 'lime' : L.score.verdict === 'WATCH' ? 'amber' : 'dim'); } catch (err) { /* unreadable, the blip stays */ }
  });
  /* curve fill refresh for the ten freshest */
  const refresh = setInterval(async () => { if (stop) return; const list = Object.values(items).filter(L => !L.grad && !L.graduated && L.readAt).sort((a, b) => b.bn - a.bn).slice(0, 10); for (const L of list) { if (stop) break; try { await feed.curveNow(L); if (L.graduated) { L.grad = true; note('$' + (L.symbol || '…') + ' graduated', 'green'); } } catch (e) { } } }, 12000);

  const t0 = Date.now();
  ui.cur.hide(); ui.cur.clear();
  const draw = () => {
    const cols = ui.cols(), rows = process.stdout.rows || 36;
    const H = Math.max(17, Math.min(rows - 3, 33));
    /* the dish takes what is left after the list beside it, and shrinks rather than pushing the list off the window.
       Under about eighty-five columns there is no room for both, so the list goes underneath instead. */
    const stacked = cols < 86;
    const W = stacked ? Math.max(25, Math.min(cols - 2, H * 2 + 1)) : Math.max(37, Math.min(cols - 46, H * 2 + 1));
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2), Rv = cy - 1, Rh = Math.min(Rv * 2, Math.floor((W - 1) / 2));
    const grid = []; for (let y = 0; y < H; y++) { grid.push([]); for (let x = 0; x < W; x++) grid[y].push(null); }
    const set = (x, y, ch, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = { ch, c }; };
    const now = Date.now(), sw = ((now - t0) / 1000) * 1.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - cx) / Rh, dy = (y - cy) / Rv, r = Math.sqrt(dx * dx + dy * dy);  /* r = 1 at the rim */
      if (r > 1.03) continue;
      const ang = Math.atan2(dy, dx);
      let d = ((sw - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const onRing = RING.some(rg => Math.abs(r - ageR(rg[0])) < 0.03);
      if (d < 1.1) set(x, y, d < 0.12 ? '▓' : d < 0.45 ? '▒' : '░', d < 0.12 ? 'lime' : 'faint');
      else if (onRing) set(x, y, '·', 'faint');
      else if (Math.abs(y - cy) < 0.5 || Math.abs(x - cx) < 0.5) set(x, y, '·', 'faint');
      if (Math.abs(r - 1) < 0.035) set(x, y, '·', 'dim');
    }
    RING.forEach(rg => { const rr = ageR(rg[0]); set(cx + rr * 0.7071 * Rh + 1, cy - rr * 0.7071 * Rv, rg[1][0], 'faint'); if (rg[1].length > 1) set(cx + rr * 0.7071 * Rh + 2, cy - rr * 0.7071 * Rv, rg[1][1], 'faint'); });
    set(cx, cy, '+', 'lime');
    const list = Object.values(items).sort((a, b) => b.bn - a.bn);
    const labels = [];
    list.slice().reverse().forEach((L, i) => {
      const age = Math.max(0, (now - (L.at || now)) / 1000); if (age > 4000) return;
      const rr = ageR(age), bx = cx + Math.cos(L.ang) * rr * Rh, by = cy + Math.sin(L.ang) * rr * Rv;
      const t = toneOf(L, idx.byDeployer);
      let dd = ((sw - L.ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const lit = dd < 1.7, flash = now - (L.flash || 0) < 1500;
      set(bx, by, flash ? '◉' : lit ? '●' : '•', lit || flash ? t.c : 'dim');
      const rank = list.indexOf(L);
      if (rank < 8 && L.symbol) labels.push({ x: Math.round(bx) + (bx >= cx ? 2 : -(L.symbol.length + 2)), y: Math.round(by), s: '$' + L.symbol, c: lit ? 'white' : 'dim' });
    });
    const taken = [];
    labels.forEach(lb => {
      const clash = y => taken.some(t => t.y === y && lb.x < t.x + t.w + 1 && t.x < lb.x + lb.s.length + 1);
      for (const dy of [0, 1, -1, 2, -2, 3]) { if (!clash(lb.y + dy)) { lb.y += dy; break; } }
      taken.push({ x: lb.x, y: lb.y, w: lb.s.length });
      for (let i = 0; i < lb.s.length; i++) set(lb.x + i, lb.y, lb.s[i], lb.c);
    });
    const colour = c => (C[c] || C.none);
    const lines = grid.map(row => row.map(cell => cell ? colour(cell.c)(cell.ch) : ' ').join(''));
    /* right panel */
    const inW = list.filter(L => now - (L.at || 0) < 300000).length, grads = list.filter(L => L.grad || L.graduated).length, deps = Object.keys(idx.byDeployer).length;
    const side = [];
    side.push(C.lime(C.bold('LAUNCH RADAR')) + C.dim(' · pons v2 · ' + (flags.sim ? 'SIMULATED' : 'live')));
    side.push(C.dim(list.length + ' on screen · ' + inW + ' in 5 min · ' + grads + ' graduated · ' + deps + ' wallets'));
    side.push('');
    side.push(C.dim(ui.padEnd('age', 5) + ui.padEnd('symbol', 11) + ui.padEnd('verdict', 9) + ui.padEnd('curve', 7) + 'deployer'));
    list.slice(0, Math.max(5, H - 13)).forEach(L => {
      const t = toneOf(L, idx.byDeployer), age = ui.fmtAge(now - (L.at || now));
      const v = L.score ? (L.score.verdict === 'FIRE' ? C.lime : L.score.verdict === 'WATCH' ? C.amber : C.dim)(ui.padEnd(L.score.verdict + ' ' + L.score.total, 9)) : C.faint(ui.padEnd('reading', 9));
      side.push(ui.padEnd(C.dim(age), 5) + ui.padEnd(colour(t.c)('$' + (L.symbol || '…').slice(0, 9)), 11) + v + ui.padEnd(L.fill == null ? C.faint('n/a') : (L.grad || L.graduated ? C.green('done') : String(Math.round(L.fill * 100)) + '%'), 7) + C.dim(ui.short(L.deployer)) + (t.tag !== 'FRESH' ? ' ' + colour(t.c)(t.tag.toLowerCase()) : ''));
    });
    side.push('');
    events.forEach(ev => side.push(C.faint(ev.t + ' ') + colour(ev.c)(ev.s)));
    while (side.length < H) side.push('');
    const out = [];
    const sideRoom = cols - W - 3;
    const clip = t => { if (ui.width(t) <= sideRoom) return t; let acc = '', n = 0; for (const ch of t.split('')) { const cw = ui.width(ch); if (ch === '\x1b') { acc += ch; continue; } if (n + cw > sideRoom) break; acc += ch; n += cw; } return acc; };
    if (stacked) {
      for (let y = 0; y < H; y++) out.push(lines[y] || '');
      side.filter(l => ui.strip(l).trim()).forEach(l => out.push(ui.wrap(l, cols - 1, 2)));
    } else for (let y = 0; y < H; y++) out.push(ui.padEnd(lines[y] || '', W) + '  ' + clip(side[y] || ''));
    out.push(ui.wrap(C.dim('newest at the centre · rings 1m 5m 15m 1h · sweep every 4 s · ' + (forS ? 'stops in ' + Math.max(0, Math.round(forS - (now - t0) / 1000)) + ' s' : 'ctrl+c to stop')), cols - 1, 2));
    ui.cur.home(); process.stdout.write(out.join('\n') + '\n'); ui.cur.clearDown();
  };
  const timer = setInterval(draw, ui.isTTY ? 120 : 2000); draw();
  await new Promise(res => { const end = () => { stop = true; clearInterval(timer); clearInterval(refresh); feed.stop(); res(); }; process.on('SIGINT', end); if (forS) setTimeout(end, forS * 1000); });
  ui.cur.show();
  process.stdout.write('\n');
  log.dim('radar closed · ' + Object.keys(items).length + ' launches seen');
  return 0;
};
