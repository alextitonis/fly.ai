/* the private HTML demo draws the same wordmark as the cli, from the same source: this lifts cli/banner.js into
   the page between the two markers, so the two can never drift. run it after touching the banner. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = process.argv[2];
if (!HTML) { console.error('usage: node scripts/embed-banner.js <path to the html demo>'); process.exit(1); }
if (!fs.existsSync(HTML)) { console.error('no such file: ' + HTML); process.exit(1); }
const src = fs.readFileSync(path.join(ROOT, 'cli', 'banner.js'), 'utf8')
  .replace(/^'use strict';\n/, '')
  .replace(/^module\.exports[\s\S]*$/m, '')
  .replace(/^\/\* where the word starts[\s\S]*?wordCell = [^\n]*\n/m, (m) => m)
  .trimEnd();
const block = [
  '/* ===== banner: lifted from cli/banner.js by scripts/embed-banner.js, do not edit here ===== */',
  'const BANNER = (function () {',
  src.split('\n').map(l => (l ? '  ' + l : l)).join('\n'),
  '  return { draw: draw, render: render, widthOf: widthOf, wordCell: wordCell, RAMP: RAMP, LAYER: LAYER };',
  '})();',
  '/* xterm-256 to css, so the page and the terminal walk the same ramp */',
  'const XTERM = (function () { const lv = [0, 95, 135, 175, 215, 255], m = {}; for (let i = 0; i < 216; i++) m[16 + i] = "#" + [lv[Math.floor(i / 36)], lv[Math.floor(i / 6) % 6], lv[i % 6]].map(v => v.toString(16).padStart(2, "0")).join(""); return m; })();',
  'function markLines(word, arrow) {',
  '  const cv = BANNER.draw(word, { arrow: arrow }), last = BANNER.RAMP.length - 1, SEP = "\\u0000";',
  '  return BANNER.render(cv, (glyph, layer, t) => {',
  '    let i = Math.round(t * last);',
  '    if (layer === BANNER.LAYER.HEAD) i = last;',
  '    else if (layer === BANNER.LAYER.SHAFT) i = Math.max(0, i - 4);',
  '    else if (layer === BANNER.LAYER.FLETCH) i = Math.max(0, i - 1);',
  '    return SEP + BANNER.RAMP[i] + SEP + glyph;',
  '  }).map(r => {',
  '    const parts = r.split(SEP); let out = esc(parts[0]), cur = null, run = "";',
  '    const flush = () => { if (run) out += \'<span style="color:\' + (XTERM[cur] || "#d7ff00") + \'">\' + esc(run) + "</span>"; run = ""; };',
  '    for (let i = 1; i + 1 < parts.length + 1; i += 2) {',
  '      const code = parts[i], glyph = parts[i + 1];',
  '      if (glyph == null) break;',
  '      if (code !== cur) { flush(); cur = code; }',
  '      run += glyph;',
  '    }',
  '    flush(); return out;',
  '  });',
  '}',
  'const logo = sub => markLines("LOXLEY", true).concat([C.dim(" ".repeat(BANNER.wordCell(true) + 1) + sub)]);',
  '/* ===== end banner ===== */'
].join('\n');

let html = fs.readFileSync(HTML, 'utf8');
const START = '/* ===== banner: lifted from cli/banner.js', END = '/* ===== end banner ===== */';
if (html.indexOf(START) >= 0) {
  const a = html.indexOf(START), b = html.indexOf(END) + END.length;
  html = html.slice(0, a) + block + html.slice(b);
} else {
  const a = html.indexOf('/* 5x7 pixel font, the banner the cli prints */');
  const b = html.indexOf('\n', html.indexOf("const logo = sub =>"));
  if (a < 0 || b < 0) { console.error('could not find the old banner block in ' + HTML); process.exit(1); }
  html = html.slice(0, a) + block + html.slice(b);
}
fs.writeFileSync(HTML, html);
console.log('embedded the mark into ' + HTML + ' (' + block.split('\n').length + ' lines)');
