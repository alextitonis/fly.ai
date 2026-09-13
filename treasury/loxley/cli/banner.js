'use strict';
/* banner: the wordmark, drawn rather than typed.
   Nearly every terminal banner is a bitmap font printed one pixel per character cell, which is why they all look
   the same. This one is a small 1-bit canvas that the whole mark is drawn into: a geometric stroke face cut at 45
   degrees, an arrow flying through the word on one unbroken hairline, notched fletching at the nock and a barbed
   broadhead at the point. The canvas is then folded two pixels at a time in both directions and printed with the
   quadrant blocks (space ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█), so one character cell carries four pixels: twice the resolution in each
   direction, which is what buys the diagonals, the chamfers and the hairline.

   Colour is per cell along a ramp that runs from a dark green at the fletching to the desk's lime at the head, so
   the mark reads left to right, the way the arrow is going.

   LOXLEY_BANNER=arrow (default) | word (no arrow) | plain (just the word, one line). */

/* ---------- a 1-bit canvas with a layer under it ---------- */
function canvas(w, h) {
  const px = new Uint8Array(w * h);          /* 0 empty, else the layer id that painted it */
  const set = (x, y, layer) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = layer; };
  const clear = (x, y) => set(x, y, 0);
  const get = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : 0);
  /* a stroke of `t` pixels, drawn as a walk with a square nib: sharp ends, sharp joints, nothing anti-aliased */
  function stroke(x0, y0, x1, y1, t, layer) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy)) * 2 + 1, r = (t - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const cx = x0 + dx * i / n, cy = y0 + dy * i / n;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) set(cx + ox, cy + oy, layer);
    }
  }
  /* a filled triangle, by scanline: the fletching and the broadhead are the only solids on the canvas */
  function triangle(a, b, c, layer) {
    const ys = [a[1], b[1], c[1]], y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    const side = (p, q, y) => (q[1] === p[1] ? null : p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]));
    for (let y = y0; y <= y1; y++) {
      const xs = [[a, b], [b, c], [c, a]].map(e => {
        const lo = Math.min(e[0][1], e[1][1]), hi = Math.max(e[0][1], e[1][1]);
        return y < lo || y > hi ? null : side(e[0], e[1], y);
      }).filter(v => v != null);
      if (xs.length < 2) continue;
      for (let x = Math.round(Math.min.apply(null, xs)); x <= Math.round(Math.max.apply(null, xs)); x++) set(x, y, layer);
    }
  }
  return { w: w, h: h, px: px, set: set, get: get, clear: clear, stroke: stroke, triangle: triangle };
}

/* ---------- the face: strokes on a 13 x 14 body ----------
   Condensed and angular, three pixels of stroke, every corner cut at 45 degrees. The O is an octagon rather than a
   circle, the Y meets in a wedge, the E carries a high crossbar so the arrow's line has clear air under it, and
   the X is two straight diagonals: the shapes a bow and an arrow are made of. Centrelines run x 1..11 and y 1..12,
   so with a three-pixel nib every letter fills 0..12 by 0..13 exactly. The body is an even number of rows, which
   is what keeps the letters from dangling half a pixel into a row of their own when the canvas is folded. */
const GLYPH = {
  L: [[2, 1, 2, 12], [2, 12, 10, 12]],
  O: [[2, 3, 2, 10], [10, 3, 10, 10], [4, 1, 8, 1], [4, 12, 8, 12], [2, 3, 4, 1], [8, 1, 10, 3], [2, 10, 4, 12], [8, 12, 10, 10]],
  X: [[1, 1, 11, 12], [11, 1, 1, 12]],
  E: [[2, 1, 2, 12], [2, 1, 10, 1], [2, 6, 8, 6], [2, 12, 10, 12]],
  Y: [[1, 1, 6, 7], [11, 1, 6, 7], [6, 7, 6, 12]],
  A: [[6, 1, 1, 12], [6, 1, 11, 12], [3, 8, 9, 8]],
  N: [[2, 12, 2, 1], [2, 1, 10, 12], [10, 12, 10, 1]],
  D: [[2, 1, 2, 12], [2, 1, 7, 1], [2, 12, 7, 12], [7, 1, 10, 4], [7, 12, 10, 9], [10, 4, 10, 9]],
  I: [[6, 1, 6, 12]],
  T: [[1, 1, 11, 1], [6, 1, 6, 12]],
  ' ': []
};
const ADV = 14, GBOX = 13, GH = 14, STROKE = 3;
const PAD = 2;                                   /* the body sits at y 2..15, so the fold never splits a letter */
const TOP = PAD, BOT = PAD + GH - 1, LINE = PAD + 6;    /* LINE 8: the arrow's path, dead centre of the body */
const FLETCH_W = 15, HEAD_W = 17, GAP = 6;
const LAYER = { WORD: 1, SHAFT: 2, HEAD: 3, FLETCH: 4 };

/* ---------- the mark ---------- */
function draw(word, opts) {
  opts = opts || {};
  const arrow = opts.arrow !== false;
  const fletchW = arrow ? FLETCH_W : 0, headW = arrow ? HEAD_W : 0, gap = arrow ? GAP : 0;
  const wordW = word.length ? word.length * ADV - (ADV - GBOX) : 0;
  const W = fletchW + gap + wordW + gap + headW, H = GH + PAD * 2;
  const cv = canvas(W, H);
  const wordX = fletchW + gap, xb = W - headW;

  /* the letters, and a list of the corners their square caps leave behind */
  const corners = [];
  word.split('').forEach((ch, i) => {
    const g = GLYPH[ch.toUpperCase()]; if (!g) return;
    const ox = wordX + i * ADV;
    g.forEach(s => {
      const x0 = ox + s[0], y0 = PAD + s[1], x1 = ox + s[2], y1 = PAD + s[3];
      cv.stroke(x0, y0, x1, y1, STROKE, LAYER.WORD);
      const r = (STROKE - 1) / 2;
      if (y0 === y1) {                                        /* a horizontal: the caps are at its two ends */
        const lo = Math.min(x0, x1) - r, hi = Math.max(x0, x1) + r;
        corners.push([lo, y0 - r, -1, -1], [lo, y0 + r, -1, 1], [hi, y0 - r, 1, -1], [hi, y0 + r, 1, 1]);
      } else if (x0 === x1) {                                 /* a vertical */
        const lo = Math.min(y0, y1) - r, hi = Math.max(y0, y1) + r;
        corners.push([x0 - r, lo, -1, -1], [x0 + r, lo, 1, -1], [x0 - r, hi, -1, 1], [x0 + r, hi, 1, 1]);
      }
    });
  });
  /* cut every corner at 45 degrees, the same angle the arrow and the O are built on. A candidate is only cut if
     it is still a convex corner once the whole word is down, which is what keeps the cut out of the joints where
     a bar meets a stem, and off the diagonals of the X and the Y, which have no square caps to begin with. */
  corners.forEach(c => {
    const x = c[0], y = c[1], dx = c[2], dy = c[3];
    if (cv.get(x, y) !== LAYER.WORD) return;
    if (cv.get(x + dx, y) || cv.get(x, y + dy) || cv.get(x + dx, y + dy)) return;
    if (cv.get(x - dx, y) !== LAYER.WORD || cv.get(x, y - dy) !== LAYER.WORD) return;
    cv.clear(x, y);
  });
  if (!arrow) return cv;

  /* the fletching: one swept vane above the line and one below, each notched at the nock */
  cv.triangle([0, TOP], [0, LINE], [fletchW, LINE], LAYER.FLETCH);
  cv.triangle([0, BOT], [0, LINE + 1], [fletchW, LINE + 1], LAYER.FLETCH);
  cv.triangle([0, LINE], [4, LINE], [0, LINE - 4], 0);
  cv.triangle([0, LINE + 1], [4, LINE + 1], [0, LINE + 5], 0);

  /* the head: a broadhead, symmetric about the line, with the back corners barbed into a V */
  cv.triangle([W - 1, LINE], [xb, TOP], [xb, LINE], LAYER.HEAD);
  cv.triangle([W - 1, LINE + 1], [xb, LINE + 1], [xb, BOT], LAYER.HEAD);
  cv.triangle([xb + 5, LINE], [xb - 1, TOP + 3], [xb - 1, LINE], 0);
  cv.triangle([xb + 5, LINE + 1], [xb - 1, LINE + 1], [xb - 1, BOT - 3], 0);

  /* the shaft: one pixel, laid last and laid all the way, so the arrow's line is unbroken from the nock to the
     head and threads the notch behind it. Every pixel already held by a letter stays a letter, which is what
     makes the arrow read as passing behind the word rather than striking it out. */
  for (let x = 0; x <= xb + 6; x++) if (!cv.get(x, LINE)) cv.set(x, LINE, LAYER.SHAFT);

  /* nothing of the arrow may sit on top of a letter, or within a pixel of one */
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const v = cv.get(x, y);
    if (v !== LAYER.FLETCH && v !== LAYER.HEAD) continue;
    let near = false;
    for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) if (cv.get(x + ox, y + oy) === LAYER.WORD) { near = true; break; }
    if (near) cv.clear(x, y);
  }
  return cv;
}

/* ---------- the canvas, folded into quadrant characters ---------- */
const QUAD = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
/* a green that walks to the desk's lime: xterm 256, dark at the nock, brightest at the head */
const RAMP = [22, 22, 28, 28, 34, 34, 40, 40, 46, 46, 82, 82, 118, 118, 154, 190];

function render(cv, paint) {
  const rows = [];
  for (let y = 0; y < cv.h; y += 2) {
    let line = '';
    for (let x = 0; x < cv.w; x += 2) {
      const a = cv.get(x, y), b = cv.get(x + 1, y), c = cv.get(x, y + 1), d = cv.get(x + 1, y + 1);
      const bits = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (!bits) { line += ' '; continue; }
      /* the cell takes the colour of the layer with the most pixels in it, the head and the fletching winning ties */
      const tally = {};
      [a, b, c, d].forEach(v => { if (v) tally[v] = (tally[v] || 0) + 1; });
      const layer = Object.keys(tally).map(Number).sort((p, q) => (tally[q] - tally[p]) || (q - p))[0];
      line += paint(QUAD[bits], layer, cv.w > 1 ? x / (cv.w - 1) : 1);
    }
    rows.push(line.replace(/\s+$/, ''));
  }
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  return rows;
}

/* the width in character cells a given mark will take */
const widthOf = (word, arrow) => Math.ceil(draw(word, { arrow: arrow }).w / 2);

/* where the word starts, in character cells, so a caption can be hung under it */
const wordCell = arrow => (arrow === false ? 0 : Math.round((FLETCH_W + GAP) / 2));

module.exports = { canvas: canvas, draw: draw, render: render, widthOf: widthOf, wordCell: wordCell,
  QUAD: QUAD, RAMP: RAMP, LAYER: LAYER, GLYPH: GLYPH, ADV: ADV, GH: GH };
