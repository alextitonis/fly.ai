'use strict';
/* replay: a black box from the desk or from watch --rec, played through the same rules, in the terminal */
const fs = require('fs');
const { makeWatcher } = require('./watch');
const { councilTable } = require('./scan');

module.exports = async function replay(ctx) {
  const { ui, log, args, flags } = ctx, C = ui.C;
  const file = args._[0];
  if (!file) { log.error('usage: loxley replay <file.json> [--speed 20]   (recordings/sample-drill.json ships with the repo)'); return 1; }
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { log.error('could not read ' + file + ': ' + e.message); return 1; }
  if (!j || !Array.isArray(j.frames) || !j.frames.length || !j.frames[0].pair) { log.error('that is not a loxley recording (no frames with a pair inside)'); return 1; }
  const speed = Math.max(1, Math.min(400, flags.speed != null ? parseFloat(flags.speed) : 20));
  const drill = j.kind === 'drill';
  const frames = j.frames, sym = j.symbol || (frames[0].pair.baseToken && frames[0].pair.baseToken.symbol) || '?';
  log.raw(ui.wrap((drill ? ui.badge('DRILL') : ui.badge('REPLAY')) + ' ' + C.bold(C.white('$' + sym)) + C.dim('  ' + frames.length + ' frames · recorded ' + (j.recorded || 'n/a').slice(0, 19).replace('T', ' ') + (j.source ? ' by ' + j.source : ' by the desk') + ' · ' + speed + 'x' + (drill ? ' · synthetic frames, a drill' : '')), ui.cols() - 1, 8));
  log.raw('');
  const watcher = makeWatcher(ctx, { paper: flags.paper != null ? parseFloat(flags.paper) : 0.5 });
  let stop = false; process.on('SIGINT', () => { stop = true; });
  for (let i = 0; i < frames.length && !stop; i++) {
    const f = frames[i], next = frames[i + 1];
    const r = watcher.step(f.pair, f.chain || null, f.t);
    if (i === 0) { log.raw(councilTable(ctx, r.m, r.score, r.verd)); log.raw(''); }
    const tag = C.faint(ui.padStart(String(i + 1), String(frames.length).length) + '/' + frames.length);
    log.raw(watcher.line(r, tag));
    watcher.eventLines(r).forEach(l => log.raw(l));
    if (r.events.some(e => e.kind === 'alert' && e.alert.lvl === 'bad')) ui.bell();
    const gap = next ? Math.max(0, next.t - f.t) : 0;
    const wait = Math.min(2500, Math.max(40, gap / speed));
    if (next) await new Promise(res => setTimeout(res, wait));
  }
  log.raw('');
  log.raw(ui.kv(watcher.summary()));
  log.raw(ui.note(C.dim('the same frames play in the browser: drop the file on the desk.')));
  return 0;
};
