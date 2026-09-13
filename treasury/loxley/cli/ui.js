'use strict';
/* ui: colours, the logo, tables, the bell. plain ansi, no dependency. */
const banner = require('./banner.js');
const isTTY = !!(process.stdout && process.stdout.isTTY);
let colourOn = (isTTY || (!!process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0')) && !process.env.NO_COLOR;
function setColour(on) { colourOn = !!on; }
const wrap = (open, close) => s => colourOn ? '\x1b[' + open + 'm' + s + '\x1b[' + close + 'm' : String(s);
const C = {
  lime: wrap('38;5;190', '39'),
  green: wrap('38;5;40', '39'),
  amber: wrap('38;5;214', '39'),
  red: wrap('38;5;202', '39'),
  blue: wrap('38;5;75', '39'),
  pink: wrap('38;5;205', '39'),
  dim: wrap('38;5;245', '39'),
  faint: wrap('38;5;240', '39'),
  white: wrap('97', '39'),
  bold: wrap('1', '22'),
  inv: wrap('7', '27'),
  bgLime: wrap('48;5;190;38;5;16;1', '0'),
  bgRed: wrap('48;5;202;38;5;16;1', '0'),
  bgAmber: wrap('48;5;214;38;5;16;1', '0'),
  bgGreen: wrap('48;5;40;38;5;16;1', '0'),
  bgBlue: wrap('48;5;75;38;5;16;1', '0'),
  bgGrey: wrap('48;5;240;38;5;16;1', '0'),
  none: s => String(s)
};
const strip = s => String(s).replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '');
/* OSC 8 hyperlinks: ctrl+click in Windows Terminal, iTerm2, kitty, VS Code. plain text in a pipe or with NO_COLOR */
let linksOn = isTTY && !process.env.NO_COLOR;
function setLinks(on) { linksOn = !!on; }
const hasLinks = () => linksOn;
const link = (url, text) => (linksOn && url ? '\x1b]8;;' + url + '\x1b\\' + (text == null ? url : text) + '\x1b]8;;\x1b\\' : String(text == null ? url : text));
/* how many terminal cells a string takes: CJK and emoji are two cells wide, combining marks and
   zero-width joiners none. token symbols on this chain carry both, and a table that counts them as one
   character each is a table with a broken column. */
function charCells(cp) {
  if (cp === 0x200d || (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x1f004 && cp <= 0x1f0cf) || (cp >= 0x1f100 && cp <= 0x1f2ff) || (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2b00 && cp <= 0x2bff) || (cp >= 0x1f900 && cp <= 0x1f9ff)) return 2;
  return 1;
}
function width(s) { let n = 0; for (const ch of strip(s)) n += charCells(ch.codePointAt(0)); return n; }
function padEnd(s, n) { const w = width(s); return w >= n ? s : s + ' '.repeat(n - w); }
function padStart(s, n) { const w = width(s); return w >= n ? s : ' '.repeat(n - w) + s; }
/* the terminal's width: the tty's, else COLUMNS, else 120 */
const cols = () => (process.stdout && process.stdout.columns) || parseInt(process.env.COLUMNS, 10) || 120;
/* join parts with a separator, wrapping onto continuation lines (indented to `indent`) when the terminal is narrower */
function joinWrap(head, parts, sep, indent, max) {
  max = max || cols() - 1;
  const lines = []; let cur = head;
  parts.forEach((p, i) => {
    const piece = (i ? sep : '') + p;
    if (i && width(cur) + width(piece) > max) { lines.push(cur); cur = ' '.repeat(indent) + p; } else cur += piece;
  });
  lines.push(cur);
  return lines.join('\n');
}

/* wrap styled text on spaces at `max` cells, continuation lines indented by `indent`. Escape sequences carry no
   whitespace, so they ride along with the word they colour, and a terminal keeps its colour across a newline. A
   single word longer than a line (a url, an address) is left to overflow: a broken url is worse than a wrapped one. */
function wrapText(s, max, indent) {
  /* wrapping is for a person looking at a window. Down a pipe there is no window, and a wrapped line breaks
     `| grep`, so unless a width was asked for explicitly (COLUMNS, or a real tty) the line is left whole. */
  if (!isTTY && !process.env.COLUMNS) return String(s == null ? '' : s);
  max = max || cols() - 1; indent = indent || 0;
  /* text that is already laid out in lines (a card, a table, a block someone else wrapped) is wrapped line by line.
     Re-flowing it as one stream would treat its newlines as spaces and destroy the layout it came with. */
  const whole = String(s == null ? '' : s);
  if (whole.indexOf('\n') >= 0) return whole.split('\n').map(l => wrapText(l, max, indent)).join('\n');
  const raw = whole;
  const lead = (raw.match(/^[ \t]*/) || [''])[0];              /* the caller's own indent stays on the first line */
  const pad = ' '.repeat(indent), tokens = raw.slice(lead.length).split(/(\s+)/);
  const out = []; let line = lead, lineW = width(lead), words = 0, gap = '';
  tokens.forEach(t => {
    if (t === '') return;
    if (/^\s+$/.test(t)) { if (words > 0) gap = t; return; }
    const w = width(t);
    /* break only when something is already on the line: a lone word longer than the line overflows rather than cuts */
    if (words > 0 && lineW + width(gap) + w > max) { out.push(line); line = pad + t; lineW = indent + w; words = 1; gap = ''; return; }
    line += gap + t; lineW += width(gap) + w; words++; gap = '';
  });
  out.push(line);
  return out.join('\n');
}
/* a footer paragraph under a block: dim, indented two, wrapped to the terminal */
const note = (s, indent) => wrapText(' '.repeat(indent == null ? 2 : indent) + s, cols() - 1, (indent == null ? 2 : indent) + 2);

/* the drawn mark: banner.js paints it into a 1-bit canvas and folds it into quadrant blocks; this puts the colour
   on. One escape per run of cells rather than one per cell, so the whole banner is about a kilobyte on the wire.
   The ramp walks left to right, dark green at the nock to lime at the head, and the shaft sits a few steps back
   from the letters so the word stays in front of it. */
function markLines(word, arrow) {
  const cv = banner.draw(word, { arrow: arrow });
  const last = banner.RAMP.length - 1, SEP = '\u0000';
  const rows = banner.render(cv, (glyph, layer, t) => {
    if (!colourOn) return glyph;
    let i = Math.round(t * last);
    if (layer === banner.LAYER.HEAD) i = last;
    else if (layer === banner.LAYER.SHAFT) i = Math.max(0, i - 4);
    else if (layer === banner.LAYER.FLETCH) i = Math.max(0, i - 1);
    return SEP + banner.RAMP[i] + SEP + glyph;
  });
  if (!colourOn) return rows;
  return rows.map(r => {
    const parts = r.split(SEP);
    let out = parts[0], cur = null;
    for (let i = 1; i + 1 < parts.length + 1; i += 2) {
      const code = parts[i], glyph = parts[i + 1];
      if (glyph == null) break;
      if (code !== cur) { out += '\x1b[38;5;' + code + 'm'; cur = code; }
      out += glyph;
    }
    return cur === null ? out : out + '\x1b[39m';
  });
}

/* the banner. LOXLEY_BANNER=arrow|word|plain forces a shape; otherwise the widest one the window can hold wins. */
function logo(sub) {
  const w = cols(), out = [];
  const want = String(process.env.LOXLEY_BANNER || '').toLowerCase();
  const arrowW = banner.widthOf('LOXLEY', true), wordW = banner.widthOf('LOXLEY', false);
  let indent = 2;
  if (want === 'plain' || w < wordW + 2) {
    out.push(C.lime(C.bold('LOXLEY')));
  } else if (want === 'word' || w < arrowW + 2) {
    markLines('LOXLEY', false).forEach(l => out.push(l));
    indent = 1;
  } else {
    markLines('LOXLEY', true).forEach(l => out.push(l));
    indent = banner.wordCell(true) + 1;                          /* the caption hangs under the L */
  }
  const text = sub || 'the exit desk for Robinhood Chain';
  out.push(wrapText(C.dim(' '.repeat(indent) + text), w - 1, indent));
  return out.join('\n');
}

function badge(kind) {
  const k = String(kind).toUpperCase();
  const map = { FIRE: C.bgLime, ENTER: C.bgGreen, WATCH: C.bgAmber, CAREFUL: C.bgAmber, SKIP: C.bgGrey, AVOID: C.bgRed, SIREN: C.bgRed, SIM: C.bgAmber, PAPER: C.bgBlue, GRAD: C.bgGreen, DRILL: C.bgRed, OK: C.bgGreen, FAIL: C.bgRed, WARN: C.bgAmber, REPLAY: C.bgBlue, CLOSED: C.bgGrey, OPEN: C.bgBlue, LIVE: C.bgRed, DRY: C.bgBlue, FILLED: C.bgLime, SOLD: C.bgGreen, WAIT: C.bgAmber, GUARD: C.bgRed, SWEPT: C.bgAmber, FARM: C.bgRed, FOLLOW: C.bgBlue, MIRROR: C.bgLime, 'DEV SOLD': C.bgRed };
  return (map[k] || C.bgGrey)(' ' + k + ' ');
}
function tone(state) { return state === 'ok' ? C.green : state === 'warn' ? C.amber : state === 'bad' ? C.red : C.dim; }

/* two-column key/value block, keys dim, aligned */
function kv(rows, indent) {
  const ind = indent == null ? 2 : indent, pad = ' '.repeat(ind);
  const w = Math.max(...rows.map(r => width(r[0])));
  /* the value column wraps to the terminal with a hanging indent under itself, so a long line stays a block */
  const hang = ind + w + 2, max = cols() - 1;
  return rows.map(r => {
    const head = pad + C.dim(padEnd(r[0], w)) + '  ';
    const val = String(r[1] == null ? '' : r[1]);
    if (width(head) + width(val) <= max) return head + val;
    /* the key stays put and the value wraps under itself: the block keeps its two columns however narrow it gets */
    return wrapText(val, max - hang, 0).split('\n').map((l, i) => (i ? ' '.repeat(hang) : head) + l).join('\n');
  }).join('\n');
}
/* a table with a header row */
function table(head, rows, indent) {
  const ind = indent == null ? 2 : indent, pad = ' '.repeat(ind);
  const all = [head].concat(rows);
  const ws = head.map((_, i) => Math.max(...all.map(r => width(r[i] == null ? '' : r[i]))));
  /* the last column is not padded, so it is the one that can run off the window: wrap it under itself instead */
  const lastAt = ind + ws.slice(0, -1).reduce((a, b) => a + b + 2, 0);
  const room = Math.max(16, cols() - 1 - lastAt);
  const line = r => {
    const headCells = r.slice(0, -1).map((c, i) => padEnd(c == null ? '' : c, ws[i])).join('  ');
    const tail = String(r[r.length - 1] == null ? '' : r[r.length - 1]);
    const lead = pad + headCells + (r.length > 1 ? '  ' : '');
    if (width(tail) <= room) return lead + tail;
    return wrapText(tail, room, 0).split('\n').map((l, i) => (i ? ' '.repeat(lastAt) : lead) + l).join('\n');
  };
  /* the rule under the header is drawn per column, but the last column is as wide as its widest cell, which can be
     a sentence. Draw the rule no wider than the window, so a long final column never pushes a line of dashes off it. */
  const ruleRoom = Math.max(20, cols() - 1 - ind);
  let ruled = '', used = 0;
  ws.forEach((w, i) => { if (used >= ruleRoom) return; const gap = i ? 2 : 0; const take = Math.max(0, Math.min(w, ruleRoom - used - gap)); ruled += ' '.repeat(gap) + '─'.repeat(take); used += gap + take; });
  return [C.dim(line(head)), C.faint(pad + ruled)].concat(rows.map(line)).join('\n');
}
function bar(frac, n, colour) {
  const k = Math.max(0, Math.min(n, Math.round((isFinite(frac) ? frac : 0) * n)));
  return (colour || C.lime)('█'.repeat(k)) + C.faint('░'.repeat(n - k));
}
const bell = () => { if (isTTY) process.stdout.write('\x07'); };
function clock(d) { d = d || new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => (x < 10 ? '0' : '') + x).join(':'); }
function stamp() { return C.faint(clock()); }

/* full-screen frame helpers for radar and watch */
const cur = {
  hide: () => { if (isTTY) process.stdout.write('\x1b[?25l'); },
  show: () => { if (isTTY) process.stdout.write('\x1b[?25h'); },
  home: () => { if (isTTY) process.stdout.write('\x1b[H'); },
  clear: () => { if (isTTY) process.stdout.write('\x1b[2J\x1b[H'); },
  clearDown: () => { if (isTTY) process.stdout.write('\x1b[J'); }
};

function fmtUsd(v) {
  if (v == null || !isFinite(v)) return 'n/a';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(v < 1 ? 4 : 2);
}
function fmtNum(v) {
  if (v == null || !isFinite(v)) return 'n/a';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v * 100) / 100);
}
/* three significant digits below a cent, so a price column never runs past eleven characters */
function fmtPrice(v) {
  if (v == null || !isFinite(v)) return 'n/a';
  if (v >= 1) return '$' + v.toFixed(3);
  if (v >= 0.001) return '$' + v.toFixed(5);
  if (v <= 0) return '$0';
  const d = Math.ceil(-Math.log10(v)) + 2;
  return d > 12 ? '$' + v.toExponential(2) : '$' + v.toFixed(d);
}
/* a token symbol as an api gave it: control characters out, the leading $ out, cut to a cell budget.
   the characters themselves are kept, emoji and CJK included: that is the token's actual name. */
function symbolOf(s, max) {
  max = max || 12;
  const clean = String(s == null ? '' : s).replace(/^\$+/, '').replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '?';
  if (width(clean) <= max) return clean;
  let out = '', n = 0;
  for (const ch of clean) { const w = charCells(ch.codePointAt(0)); if (n + w > max - 1) break; out += ch; n += w; }
  return out + '…';
}
function fmtPct(v, dec) { return v == null || !isFinite(v) ? 'n/a' : (v > 0 ? '+' : '') + v.toFixed(dec == null ? 1 : dec) + '%'; }
function fmtAge(ms) {
  if (ms == null || !isFinite(ms)) return 'n/a';
  const s = Math.max(0, ms / 1000);
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return (s / 3600).toFixed(1) + 'h';
  return Math.round(s / 86400) + 'd';
}
function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : 'n/a'; }
function eth(v, d) { return v == null || !isFinite(v) ? 'n/a' : v.toFixed(d == null ? 4 : d) + ' ETH'; }

module.exports = { C, strip, width, charCells, padEnd, padStart, cols, wrap: wrapText, note, joinWrap, hasLinks, symbolOf, logo, markLines, banner, badge, tone, kv, table, bar, bell, clock, stamp, cur, isTTY, setColour, setLinks, link, fmtUsd, fmtNum, fmtPrice, fmtPct, fmtAge, short, eth };
