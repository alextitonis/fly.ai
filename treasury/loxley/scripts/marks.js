/* the three marks GitHub asks for, drawn from cli/banner.js so they are exactly the shape the terminal prints:
     assets/banner.png  the README header
     assets/social.png  the card GitHub shows when a link to the repo is posted
     assets/avatar.png  the square mark, the arrow on its own
   run: node scripts/marks.js   (needs playwright, a dev convenience only: the repository ships the pngs) */
const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const ROOT = path.join(__dirname, '..');
const banner = require(path.join(ROOT, 'cli', 'banner.js'));
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  console.error('this one needs playwright, which the terminal itself does not:  npm i -D playwright && npx playwright install chromium');
  console.error('the repository already ships the three pngs, so you only need this if you are changing the mark.');
  process.exit(1);
}

/* xterm-256 to css, so the pngs walk the same ramp the terminal does */
const lv = [0, 95, 135, 175, 215, 255], XT = {};
for (let i = 0; i < 216; i++) XT[16 + i] = '#' + [lv[Math.floor(i / 36)], lv[Math.floor(i / 6) % 6], lv[i % 6]].map(v => v.toString(16).padStart(2, '0')).join('');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SEP = '§';   /* not a quadrant block and not a space, so it can mark the colour runs */

/* the mark as html, one span per run of colour */
function mark(word, arrow) {
  const cv = banner.draw(word, { arrow: arrow }), last = banner.RAMP.length - 1;
  return banner.render(cv, (glyph, layer, t) => {
    let i = Math.round(t * last);
    if (layer === banner.LAYER.HEAD) i = last;
    else if (layer === banner.LAYER.SHAFT) i = Math.max(0, i - 4);
    else if (layer === banner.LAYER.FLETCH) i = Math.max(0, i - 1);
    return SEP + banner.RAMP[i] + SEP + glyph;
  }).map(r => {
    const parts = r.split(SEP);
    let out = esc(parts[0]), cur = null, run = '';
    const flush = () => { if (run) out += '<span style="color:' + XT[cur] + '">' + esc(run) + '</span>'; run = ''; };
    for (let i = 1; i + 1 < parts.length + 1; i += 2) {
      if (parts[i + 1] == null) break;
      if (parts[i] !== cur) { flush(); cur = parts[i]; }
      run += parts[i + 1];
    }
    flush();
    return out;
  }).join('\n');
}

const FONT = '"DejaVu Sans Mono","JetBrains Mono",monospace';
const GRID = 'background:#050505;background-image:radial-gradient(rgba(120,160,90,.16) 1px,transparent 1px);background-size:22px 22px';
const GLOW = 'filter:drop-shadow(0 0 22px rgba(190,255,60,.28))';

/* the radar sweep that has been on the banner since the first version */
function radar(cx, cy, r) {
  const c = r + 4;
  return '<svg width="' + (r * 2 + 8) + '" height="' + (r * 2 + 8) + '" style="position:absolute;left:' + (cx - r) + 'px;top:' + (cy - r) + 'px;opacity:.85">' +
    [1, 0.72, 0.44, 0.2].map(k => '<circle cx="' + c + '" cy="' + c + '" r="' + (r * k) + '" fill="none" stroke="#3d5a12" stroke-width="1"/>').join('') +
    '<path d="M' + c + ' ' + c + ' L' + (c + r) + ' ' + (c - r * 0.55) + ' A' + r + ' ' + r + ' 0 0 0 ' + (c + r * 0.62) + ' ' + (c - r * 0.78) + ' Z" fill="#4a6b0f" opacity=".55"/>' +
    '<circle cx="' + (c + r * 0.55) + '" cy="' + (c - r * 0.3) + '" r="4" fill="#d7ff00"/>' +
    '<circle cx="' + (c - r * 0.28) + '" cy="' + (c + r * 0.34) + '" r="4" fill="#00d700"/>' +
    '<circle cx="' + (c + r * 0.12) + '" cy="' + (c + r * 0.62) + '" r="4" fill="#ff8c00"/>' +
    '</svg>';
}

const page = (w, h, body) => '<!doctype html><meta charset="utf-8"><style>' +
  'html,body{margin:0;padding:0}body{width:' + w + 'px;height:' + h + 'px;overflow:hidden;position:relative;' + GRID + ';font-family:' + FONT + '}' +
  'pre{margin:0;white-space:pre;line-height:1;letter-spacing:0}' +
  '.sub{color:#c9d1c4}.dim{color:#7e8a78}.lime{color:#d7ff00}' +
  '</style>' + body;

const DOT = ' &nbsp;·&nbsp; ';
const SHOTS = {
  'banner.png': { w: 1600, h: 440, html: () => page(1600, 440,
    radar(1400, 214, 172) +
    '<div style="position:absolute;left:78px;top:56px;' + GLOW + '"><pre style="font-size:27px">' + mark('LOXLEY', true) + '</pre></div>' +
    '<div style="position:absolute;left:78px;top:276px;font-size:25px;line-height:1.62">' +
      '<div class="sub">the exit desk for Robinhood Chain</div>' +
      '<div class="dim" style="font-size:20px">a sniper, a guard, a follow' + DOT + 'reads by default, signs when you arm it' + DOT + 'nothing to install</div>' +
      '<div class="lime" style="font-size:20px;margin-top:14px">the entry is a guess. &nbsp;the exit is arithmetic.</div>' +
    '</div>') },
  'social.png': { w: 1280, h: 640, html: () => page(1280, 640,
    radar(1120, 520, 200) +
    '<div style="position:absolute;left:84px;top:176px;' + GLOW + '"><pre style="font-size:25px">' + mark('LOXLEY', true) + '</pre></div>' +
    '<div style="position:absolute;left:84px;top:378px;font-size:26px;line-height:1.7">' +
      '<div class="sub">the exit desk for Robinhood Chain</div>' +
      '<div class="dim" style="font-size:21px">a sniper, a guard, a follow' + DOT + 'reads by default, signs when you arm it</div>' +
      '<div class="lime" style="font-size:21px;margin-top:16px">node bin/loxley.js tour &nbsp;<span class="dim">' + DOT + 'no wallet, no money, no install</span></div>' +
    '</div>') },
  'avatar.png': { w: 512, h: 512, html: () => page(512, 512,
    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px">' +
      '<pre style="font-size:25px;' + GLOW + '">' + mark(' ', true) + '</pre>' +
      '<pre style="font-size:8px;' + GLOW + '">' + mark('LOXLEY', false) + '</pre>' +
    '</div>') }
};

(async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loxley-marks-')), 'mark.html');
  let browser;
  try { browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); }
  catch (e) {
    console.error('playwright has no browser to launch:  npx playwright install chromium   (or set CHROMIUM to one)');
    console.error(String(e.message || e).split('\n')[0]);
    process.exit(1);
  }
  for (const name of Object.keys(SHOTS)) {
    const s = SHOTS[name];
    fs.writeFileSync(tmp, s.html());
    const p = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
    await p.goto(url.pathToFileURL(tmp).href);
    await p.waitForTimeout(220);
    await p.screenshot({ path: path.join(ROOT, 'assets', name) });
    await p.close();
    console.log('wrote assets/' + name);
  }
  await browser.close();
})();
