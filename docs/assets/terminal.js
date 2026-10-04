/**
 * fly.ai terminal (terminal.html; 2026-10-04, the user: "a /terminal ... a cool ui of trading", futuristic like NEXUS//FLOW,
 * Grok Desk and GRAN). Every number is the live Fly Wallets' own: the mine server's leaderboard and each fly's view
 * (/api/vaults/fly/:id: its trades tagged by the part that made them, its holdings, its hourly curve). Nothing is made
 * up: between real trades the screen only breathes (the brain's particles, the pulse line's baseline).
 *
 * Load on the mine server: one combined read (/api/vaults/feed) when the server has it; until then the flies are read
 * one at a time, a few seconds apart, the biggest wallets first (a visitor costs ~0.25 requests a second).
 */
import { locale, t } from "./i18n/i18n.js";

const MINE = (window.flyNav && window.flyNav.MINE_API) || "https://flyai-mine.fly.dev";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const BOARD_EVERY = 60_000, FLY_EVERY = 4_000, FEED_EVERY = 10_000, TOP_N = 24;

// the desk's parts: each trade row's tag says which one made it (flytrade/vaults: the brain and the options)
const PARTS = [
  { key: "brain", name: "BRAIN", c: "#5ef2cc", tags: ["brain"] },
  { key: "trend", name: "TREND", c: "#7cc7ff", tags: ["trend"] },
  { key: "dip", name: "DIP", c: "#b69cff", tags: ["dip", "reversal", "flush"] },
  { key: "momentum", name: "MOMENTUM", c: "#ffc66b", tags: ["momentum"] },
  { key: "fomo", name: "FOMO", c: "#ff7ab8", tags: ["fomo"] },
  { key: "copy", name: "COPY", c: "#8ff0a4", tags: ["copy", "track"] },
  { key: "launch", name: "LAUNCH", c: "#ffe270", tags: ["fresh", "launch", "sniper"] },
  { key: "exec", name: "EXEC", c: "#e8f2ef", tags: [] },
];
const partOf = (tag) => PARTS.find((p) => p.tags.includes(tag)) ?? PARTS[0];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n, d) => n.toLocaleString(locale(), { maximumFractionDigits: d });   // the site language's digits
const usd = (n, sign = false) => n == null || !isFinite(n) ? "—"
  : `${sign && n > 0 ? "+" : n < 0 ? "−" : ""}$${num(Math.abs(n), Math.abs(n) < 100 ? 2 : 0)}`;
const pct = (n) => n == null || !isFinite(n) ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), Math.abs(n) < 10 ? 2 : 1)}%`;
const hhmmss = (t) => new Date(t * 1000).toISOString().slice(11, 19);
const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
/** "#168 took profit on FLYAI" in the page's language (fly and symbol come in as text or HTML) */
const said = (side, fly, sym) => t(`terminal.stream.${["buy", "sell", "take_profit", "panic_sell", "stop"].includes(side) ? side : "sell"}`, { fly, sym });
const isSell = (s) => s !== "buy";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  board: [], views: new Map(), trades: new Map(), started: false, feed: null, watch: null,
  events: 0, lastBoard: 0, partLive: new Map(),
};
const keyOf = (fly, r) => `${fly}:${r.at}:${r.symbol}:${r.side}:${r.tag}`;

// ---- reading the desk -----------------------------------------------------------------------------------------------
const get = (p) => fetch(MINE + p, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

async function readBoard() {
  const b = await get("/api/vaults/leaderboard?chain=robinhood");
  state.board = (b.all ?? []).filter((r) => r.flies?.length);
  state.lastBoard = b.updated ?? Date.now() / 1000;
  live(true);
  drawKpis(); drawLeaders();
}

/** one fly's view in: its new trades become events (not on the first read: those are history) */
function takeView(id, v) {
  const s = v?.stats; if (!s) return;
  state.views.set(id, s);
  for (const r of s.recent ?? []) {
    const k = keyOf(id, r);
    if (state.trades.has(k)) continue;
    const t = { ...r, fly: id, key: k };
    state.trades.set(k, t);
    if (state.started) fire(t);
  }
}

let queue = [];
async function pollFlies() {
  if (!queue.length) queue = [...state.board].sort((a, b) => b.value - a.value).slice(0, TOP_N).map((r) => r.flies[0]);
  const id = queue.shift();
  if (id != null) {
    try { takeView(id, await get(`/api/vaults/fly/${id}`)); } catch { /* the next lap reads it again */ }
    if (!state.started && !queue.length) begin();
    redraw();
  }
  setTimeout(pollFlies, state.started ? FLY_EVERY : 600);   // the first lap fast, then gently
}

async function pollFeed() {
  // the combined read: { flies: { [id]: stats } } (mine /api/vaults/feed); 404 until the server has it
  try {
    const f = await get("/api/vaults/feed?chain=robinhood");
    for (const [id, s] of Object.entries(f.flies ?? {})) takeView(Number(id), { stats: s });
    if (!state.started) begin();
    state.feed = true;
    live(true);
    redraw();
    setTimeout(pollFeed, FEED_EVERY);
    return true;
  } catch {
    if (!state.feed) return false;              // no feed on this server: read the flies one by one
    live(false); setTimeout(pollFeed, FEED_EVERY * 3);   // the feed had worked: a blip, try again
    return true;
  }
}

function begin() {
  state.started = true;
  const all = [...state.trades.values()].sort((a, b) => a.at - b.at);
  for (const tr of all.slice(-30)) log(tr, false);
  sys(t("terminal.stream.linked", { wallets: state.board.length, fills: state.trades.size }));
  $("core-sub").textContent = t("terminal.stream.listening");
}

function live(on) {
  const el = $("tm-live");
  el.classList.toggle("on", on);
  el.textContent = t(on ? "terminal.status.live" : "terminal.status.reconnecting");
}

// ---- events -----------------------------------------------------------------------------------------------------------
function fire(tr) {
  state.events++;
  log(tr, true);
  const p = partOf(tr.tag);
  lightPart(p.key); lightPart("exec");
  core.pulse(p.key, isSell(tr.side) && (tr.pnl_pct ?? 0) < 0 ? "#ff5a52" : p.c, Math.min(1, 0.35 + (tr.usd ?? 1) / 40));
  beat.spike(Math.min(1, 0.3 + (tr.usd ?? 1) / 30), isSell(tr.side) && (tr.pnl_pct ?? 0) < 0);
  $("core-sub").textContent = `${p.name} · ${said(tr.side, `#${tr.fly}`, tr.label ?? tr.symbol)}`;
}

function lightPart(key) {
  state.partLive.set(key, Date.now() + 4500);
  const el = document.querySelector(`.tm-part[data-k="${key}"]`);
  if (el) { el.classList.add("live"); el.querySelector("header em").textContent = t("terminal.parts.live"); }
}
setInterval(() => {
  for (const [k, until] of state.partLive) if (Date.now() > until) {
    state.partLive.delete(k);
    const el = document.querySelector(`.tm-part[data-k="${k}"]`);
    if (el) { el.classList.remove("live"); el.querySelector("header em").textContent = t("terminal.parts.idle"); }
  }
}, 500);

function log(tr, fresh) {
  const p = partOf(tr.tag);
  const res = tr.pnl_pct != null && isSell(tr.side) ? ` <b class="${tr.pnl_pct >= 0 ? "up" : "down"}">${pct(tr.pnl_pct)}</b>` : "";
  const li = document.createElement("li");
  if (fresh) li.className = "new";
  if (state.watch === tr.fly) li.classList.add("watch");
  li.dataset.fly = tr.fly;
  li.innerHTML = `<span class="tm-tag" style="--c:${p.c}">${p.name}</span>`
    + `<span>${said(tr.side, `<a href="/traderflies/fly?id=${tr.fly}" class="dim">#${tr.fly}</a>`, `<b>${esc(tr.label ?? tr.symbol)}</b>`)}${res}</span>`
    + `<span class="dim">${usd(tr.usd)}</span>`;
  push(li);
}
function sys(text) {
  const li = document.createElement("li");
  li.className = "sys new";
  li.innerHTML = `<span class="tm-tag" style="--c:#7d918b">SYS</span><span>${text}</span>`;
  push(li);
}
function push(li) {
  const ol = $("stream");
  ol.prepend(li);
  while (ol.children.length > 80) ol.lastChild.remove();
  $("s-count").textContent = t("terminal.stream.count", { fills: state.trades.size, live: state.events });
}

// ---- panels -----------------------------------------------------------------------------------------------------------
const trades = () => [...state.trades.values()].sort((a, b) => b.at - a.at);

function drawKpis() {
  const b = state.board;
  const value = b.reduce((s, r) => s + r.value, 0), principal = b.reduce((s, r) => s + r.principal, 0);
  const profit = b.reduce((s, r) => s + r.profit, 0);
  const day = b.reduce((s, r) => s + (r.profit_24h ?? 0), 0), week = b.reduce((s, r) => s + (r.profit_7d ?? 0), 0);
  set("k-value", usd(value)); $("k-wallets").textContent = t("terminal.kpis.wallets", { count: b.length });
  set("k-profit", usd(profit, true), profit);
  set("k-profit-pct", principal > 0 ? t("terminal.kpis.on", { pct: pct((profit / principal) * 100), usd: usd(principal) }) : "—", profit);
  set("k-day", usd(day, true), day); set("k-week", t("terminal.kpis.week", { usd: usd(week, true) }), week);
  const all = trades(), now = Date.now() / 1000;
  const dayT = all.filter((x) => x.at > now - 86400);
  set("k-trades", dayT.length ? num(dayT.length, 0) : "—");
  $("k-last").textContent = all[0] ? t("terminal.kpis.last", { ago: ago(all[0].at) }) : t("terminal.kpis.lastNone");
  const closed = all.filter((x) => isSell(x.side) && x.pnl_pct != null), wins = closed.filter((x) => x.pnl_pct > 0).length;
  set("k-hit", closed.length ? `${Math.round((wins / closed.length) * 100)}%` : "—");
  $("k-wl").textContent = closed.length ? t("terminal.kpis.wl", { w: wins, l: closed.length - wins }) : t("terminal.kpis.closedNone");
}
function set(id, text, sign) {
  const el = $(id); el.textContent = text;
  el.classList.toggle("up", sign > 0); el.classList.toggle("down", sign < 0);
}

function drawTape() {
  $("tape").innerHTML = trades().slice(0, 60).map((x) => {
    const p = partOf(x.tag), sell = isSell(x.side);
    const res = x.pnl_pct != null && sell ? `<span class="${x.pnl_pct >= 0 ? "up" : "down"}">${pct(x.pnl_pct)}</span>` : "";
    const tx = x.tx ? `<a href="${EXPLORER}/tx/${esc(x.tx.split(",")[0])}" target="_blank" rel="noreferrer">${esc(x.tx.slice(0, 6))}…↗</a>` : "";
    return `<tr class="${state.watch === x.fly ? "watch" : ""}"><td class="dim">${hhmmss(x.at)}</td><td>#${x.fly}</td>`
      + `<td class="${sell ? "down" : "up"}">${t(sell ? "terminal.tape.sell" : "terminal.tape.buy")}</td><td><b>${esc(x.label ?? x.symbol)}</b></td>`
      + `<td>${usd(x.usd)}</td><td>${res}</td><td><span class="tm-tag" style="--c:${p.c}">${p.name}</span></td><td>${tx}</td></tr>`;
  }).join("");
  $("tape-count").textContent = t("terminal.tape.count", { count: state.trades.size });
}

/** what the flies hold together: per token, the flies in it, the money, the P&L at today's price */
function holdings() {
  const tok = new Map();
  for (const [fly, s] of state.views) for (const w of s.wallet ?? []) {
    if (w.kind !== "token" || !w.value || w.value < 0.05) continue;
    const h = tok.get(w.symbol) ?? { sym: w.symbol, flies: new Map(), value: 0, cost: 0, price: w.price };
    h.flies.set(fly, w); h.value += w.value; h.cost += w.cost ?? w.value; h.price = w.price ?? h.price;
    tok.set(w.symbol, h);
  }
  return [...tok.values()].sort((a, b) => b.value - a.value);
}
const price = (p) => p == null ? "—" : p >= 1 ? `$${num(p, 2)}` : `$${p.toPrecision(3)}`;

function drawPulse(h) {
  $("pulse").innerHTML = h.slice(0, 8).map((x) => {
    const r = x.cost > 0 ? (x.value / x.cost - 1) * 100 : null;
    return `<div class="tm-tok" data-sym="${esc(x.sym)}"><div><b>${esc(x.sym)}</b><span class="${r >= 0 ? "up" : "down"}">${pct(r)}</span></div>`
      + `<small>${price(x.price)} · ${t("terminal.pulse.flies", { count: x.flies.size })} · ${usd(x.value)}</small></div>`;
  }).join("") || `<small class="dim">${t("terminal.pulse.reading")}</small>`;
}

function drawHeat(h) {
  const toks = h.slice(0, 10), flies = [...state.board].sort((a, b) => b.value - a.value).slice(0, 12).map((r) => r.flies[0]);
  const max = Math.max(1, ...toks.flatMap((x) => [...x.flies.values()].map((w) => w.value)));
  const g = $("heat");
  g.style.gridTemplateColumns = `44px repeat(${toks.length}, minmax(18px, 1fr))`;
  let html = `<span></span>` + toks.map((x) => `<span class="ht">${esc(x.sym)}</span>`).join("");
  for (const f of flies) {
    html += `<a class="hl" href="/traderflies/fly?id=${f}">#${f}</a>`;
    for (const x of toks) {
      const w = x.flies.get(f);
      if (!w) { html += `<span class="hc"></span>`; continue; }
      const a = 0.18 + 0.82 * Math.sqrt(w.value / max), up = (w.pnl_pct ?? 0) >= 0;
      const col = up ? `rgba(94,242,204,${a.toFixed(2)})` : `rgba(255,90,82,${a.toFixed(2)})`;
      html += `<span class="hc" style="background:${col};box-shadow:0 0 ${Math.round(a * 10)}px ${col}" title="#${f} ${esc(x.sym)} ${usd(w.value)} ${pct(w.pnl_pct)}"></span>`;
    }
  }
  g.innerHTML = toks.length ? html : `<small class="dim">${t("terminal.pulse.reading")}</small>`;
}

function spark(curve) {
  if (!curve || curve.length < 2) return "";
  const v = curve.map((p) => p.profit), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const d = v.map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * 70).toFixed(1)},${(20 - ((y - lo) / span) * 18).toFixed(1)}`).join(" ");
  const up = v[v.length - 1] >= v[0];
  return `<svg viewBox="0 0 70 22"><path d="${d}" fill="none" stroke="${up ? "#5ef2cc" : "#ff5a52"}" stroke-width="1.5"/></svg>`;
}
function drawLeaders() {
  const rows = [...state.board].sort((a, b) => b.profit - a.profit).slice(0, 12);
  $("leaders").innerHTML = rows.map((r, i) => {
    const id = r.flies[0], s = state.views.get(id);
    return `<li><span class="dim">${i + 1}</span><a href="/traderflies/fly?id=${id}">#${id} <small class="dim">${esc((r.starter ?? "").replace(/_/g, " "))}</small></a>`
      + `${spark(s?.curve)}<b class="${r.profit >= 0 ? "up" : "down"}">${usd(r.profit, true)}</b></li>`;
  }).join("");
}

/** one-hour blips in a fly's curve (a deposit booked a bar before its principal) would draw as spikes: a point far off
 *  both neighbours, in the same direction, takes their average */
function despike(c) {
  const out = c.map((p) => ({ ...p }));
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1].profit, b = c[i].profit, d = c[i + 1].profit, mid = (a + d) / 2;
    if ((b - a) * (b - d) > 0 && Math.abs(b - mid) > Math.max(2, 3 * Math.abs(d - a))) out[i].profit = mid;
  }
  return out;
}

/** every fly's hourly profit added up (a fly with no point at an hour keeps its last one) */
function combined() {
  const curves = [...state.views.values()].map((s) => despike(s.curve ?? [])).filter((c) => c.length);
  const hours = [...new Set(curves.flatMap((c) => c.map((p) => p.t)))].sort((a, b) => a - b);
  return hours.map((t) => ({ t, v: curves.reduce((s, c) => { let last = 0; for (const p of c) { if (p.t > t) break; last = p.profit; } return s + last; }, 0) }));
}

function drawParts() {
  const all = trades();
  $("parts").innerHTML = PARTS.map((p) => {
    const mine = p.key === "exec" ? all : all.filter((x) => p.tags.includes(x.tag));
    const closed = mine.filter((x) => isSell(x.side) && x.pnl_pct != null), wins = closed.filter((x) => x.pnl_pct > 0).length;
    let money = 0;
    for (const s of state.views.values()) for (const [k, b] of Object.entries(s.books ?? {}))
      if (p.key === "exec" || p.tags.includes(k)) money += (b.cash ?? 0) + (b.positions ?? []).reduce((a, x) => a + (x.cost ?? 0), 0);
    const on = state.partLive.has(p.key);
    const line = p.key === "exec" ? t("terminal.parts.routed", { n: mine.length })
      : `${t("terminal.parts.fills", { n: mine.length })}${closed.length ? ` · ${t("terminal.parts.won", { w: wins, c: closed.length })}` : ""} · ${usd(money)}`;
    return `<article class="tm-part${on ? " live" : ""}" data-k="${p.key}" style="--c:${p.c}"><header><span>${String(PARTS.indexOf(p) + 1).padStart(2, "0")}</span>`
      + `<em>${t(on ? "terminal.parts.live" : "terminal.parts.idle")}</em></header>`
      + `${mascot(p)}<b>${p.name}</b><i>${t(`terminal.role.${p.key}`)}</i><small>${line}</small></article>`;
  }).join("");
}

/** a little cartoon fly per part: body, wings, two eyes; the colour is the part's */
function mascot(p) {
  const i = PARTS.indexOf(p);
  const body = ["M14 30c0-10 8-17 18-17s18 7 18 17-8 19-18 19-18-9-18-19z", "M16 22h32l-4 26H20z", "M32 12l18 34H14z",
    "M32 14l17 10v20L32 54 15 44V24z", "M12 32c0-11 9-18 20-18s20 7 20 18-9 16-20 16-20-5-20-16z", "M15 18h34v30H15z",
    "M32 12c11 0 18 9 18 20s-7 20-18 20-18-9-18-20 7-20 18-20z", "M18 16h28l6 16-6 16H18l-6-16z"][i] ?? "";
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="17" cy="20" rx="11" ry="6" fill="${p.c}" opacity=".22" transform="rotate(-30 17 20)"/>`
    + `<ellipse cx="47" cy="20" rx="11" ry="6" fill="${p.c}" opacity=".22" transform="rotate(30 47 20)"/>`
    + `<path d="${body}" fill="${p.c}"/><circle cx="25" cy="32" r="4.2" fill="#000"/><circle cx="39" cy="32" r="4.2" fill="#000"/>`
    + `<circle cx="26.3" cy="30.6" r="1.4" fill="#fff"/><circle cx="40.3" cy="30.6" r="1.4" fill="#fff"/></svg>`;
}

let drawn = 0;
function redraw() {
  if (Date.now() - drawn < 400) return;   // a burst of reads draws once
  drawn = Date.now();
  const h = holdings();
  drawKpis(); drawTape(); drawPulse(h); drawHeat(h); drawLeaders(); drawParts();
  const c = combined();
  equity.set(c);
  const now = Date.now() / 1000, n = trades().filter((x) => x.at > now - 3600).length;
  $("beat-rate").textContent = t("terminal.beat.rate", { n, w: state.board.length });
}

// ---- canvases ---------------------------------------------------------------------------------------------------------
function fit(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  const ctx = cv.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

/** the brain: a cloud in a fly brain's shape (central brain + two optic lobes), turning; the parts orbit it */
const core = (() => {
  const cv = $("core"), pts = [], pulses = [];
  const lump = (n, cx, cy, cz, rx, ry, rz) => { for (let i = 0; i < n; i++) {
    let x, y, z; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
    pts.push({ x: cx + x * rx, y: cy + y * ry, z: cz + z * rz, f: Math.random() * 6.28, s: Math.random() }); } };
  lump(1500, 0, 0, 0, 0.8, 0.52, 0.48);      // central brain
  lump(700, -1.25, 0.04, 0, 0.36, 0.62, 0.42); // optic lobes
  lump(700, 1.25, 0.04, 0, 0.36, 0.62, 0.42);
  lump(260, 0, -0.38, 0.1, 0.42, 0.14, 0.2);   // mushroom bodies' calyces, a denser band on top
  let rot = 0;
  const nodes = PARTS.map((p, i) => ({ p, a: (i / PARTS.length) * Math.PI * 2 - Math.PI / 2 }));
  function frame(ts) {
    const { ctx, w, h } = fit(cv);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.5, R = Math.min(w * 0.22, h * 0.3);
    rot += reduced ? 0 : 0.0022;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
    glow.addColorStop(0, "rgba(94,242,204,.10)"); glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    // orbit and the lines to each part
    const orx = Math.min(w / 2 - 44, R * 2.35), ory = Math.min(h / 2 - 26, R * 1.45);   // the chips stay inside
    ctx.strokeStyle = "rgba(94,242,204,.10)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, orx, ory, 0, 0, Math.PI * 2); ctx.stroke();
    const at = nodes.map((n) => { const a = n.a + rot * 0.6; return { n, x: cx + Math.cos(a) * orx, y: cy + Math.sin(a) * ory }; });
    for (const q of at) {
      const lit = state.partLive.has(q.n.p.key);
      ctx.strokeStyle = lit ? q.n.p.c : "rgba(94,242,204,.07)"; ctx.globalAlpha = lit ? 0.55 : 1;
      ctx.setLineDash(lit ? [] : [2, 5]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // the particles, back to front
    const cs = Math.cos(rot), sn = Math.sin(rot), tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
    const pr = pts.map((p) => { const x = p.x * cs - p.z * sn, z0 = p.x * sn + p.z * cs, y = p.y * ct - z0 * st, z = p.y * st + z0 * ct; return { x, y, z, p }; })
      .sort((a, b) => a.z - b.z);
    const t = ts / 1000;
    for (const q of pr) {
      const depth = (q.z + 1.2) / 2.4, fire = Math.max(0, Math.sin(t * (0.6 + q.p.s * 1.8) + q.p.f)) ** 18;
      ctx.fillStyle = fire > 0.4 ? "#eafff8" : "#5ef2cc";
      ctx.globalAlpha = Math.min(1, 0.12 + depth * 0.5 + fire * 0.8);
      const sz = 0.6 + depth * 1.3 + fire * 1.6;
      ctx.fillRect(cx + q.x * R - sz / 2, cy + q.y * R - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    // pulses running out to the part that acted
    for (let i = pulses.length - 1; i >= 0; i--) {
      const u = pulses[i], k = (ts - u.t0) / 900, q = at.find((x) => x.n.p.key === u.key);
      if (k > 1.6 || !q) { pulses.splice(i, 1); continue; }
      const e = Math.min(1, k), x = cx + (q.x - cx) * e, y = cy + (q.y - cy) * e;
      ctx.fillStyle = u.c; ctx.shadowColor = u.c; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, y, 3 + u.size * 4, 0, Math.PI * 2); ctx.fill();
      if (k > 1) { ctx.globalAlpha = 1.6 - k; ctx.strokeStyle = u.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 10 + (k - 1) * 60, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.shadowBlur = 0;
    }
    // the part chips on the orbit
    ctx.font = "700 10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const q of at) {
      const lit = state.partLive.has(q.n.p.key), tw = ctx.measureText(q.n.p.name).width + 18;
      ctx.fillStyle = lit ? "rgba(0,0,0,.85)" : "rgba(4,7,6,.9)"; ctx.strokeStyle = lit ? q.n.p.c : "rgba(94,242,204,.22)";
      if (lit) { ctx.shadowColor = q.n.p.c; ctx.shadowBlur = 14; }
      ctx.beginPath(); ctx.roundRect(q.x - tw / 2, q.y - 11, tw, 22, 6); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = lit ? q.n.p.c : "rgba(232,242,239,.75)"; ctx.fillText(q.n.p.name, q.x, q.y + 0.5);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { pulse: (key, c, size) => pulses.push({ key, c, size, t0: performance.now() }) };
})();

/** the combined profit curve, glowing, its last point pulsing */
const equity = (() => {
  const cv = $("equity"); let pts = [];
  function frame(ts) {
    const { ctx, w, h } = fit(cv);
    ctx.clearRect(0, 0, w, h);
    if (pts.length > 1) {
      const v = pts.map((p) => p.v), lo = Math.min(0, ...v), hi = Math.max(...v), span = hi - lo || 1, pad = 8;
      const X = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2), Y = (y) => h - pad - ((y - lo) / span) * (h - pad * 2);
      const up = v[v.length - 1] >= 0, col = up ? "#5ef2cc" : "#ff5a52";
      if (lo < 0) { ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(w - pad, Y(0)); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); v.forEach((y, i) => (i ? ctx.lineTo(X(i), Y(y)) : ctx.moveTo(X(i), Y(y))));
      const line = new Path2D(); v.forEach((y, i) => (i ? line.lineTo(X(i), Y(y)) : line.moveTo(X(i), Y(y))));
      ctx.lineTo(X(v.length - 1), h - pad); ctx.lineTo(X(0), h - pad); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, up ? "rgba(94,242,204,.28)" : "rgba(255,90,82,.25)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.stroke(line); ctx.shadowBlur = 0;
      const ex = X(v.length - 1), ey = Y(v[v.length - 1]), k = (Math.sin(ts / 300) + 1) / 2;
      ctx.fillStyle = col; ctx.globalAlpha = 0.25 + 0.25 * k; ctx.beginPath(); ctx.arc(ex, ey, 6 + 6 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill();
    } else { ctx.fillStyle = "#7d918b"; ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillText(t("terminal.equity.reading"), 8, 20); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { set: (p) => { pts = p; const last = p[p.length - 1]?.v; const el = $("eq-total"); el.textContent = last == null ? "—" : usd(last, true); el.className = last >= 0 ? "up" : "down"; } };
})();

/** the desk's heartbeat: a calm baseline; every real trade is a beat (red for a losing exit) */
const beat = (() => {
  const cv = $("beat"), hist = Array.from({ length: 1200 }, () => ({ v: (Math.random() - 0.5) * 0.04, red: false })); let pending = [];
  function frame() {
    const { ctx, w, h } = fit(cv);
    const n = Math.max(2, Math.floor(w / 2));
    let y = (Math.random() - 0.5) * 0.04, c = 0;
    if (pending.length) { const s = pending.shift(); hist.push(...[0.15, -0.25, s.a, -s.a * 0.55, 0.12].map((v) => ({ v, red: s.red }))); c = 1; }
    if (!c) hist.push({ v: y, red: false });
    while (hist.length > n) hist.shift();
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(94,242,204,.06)";
    for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.lineWidth = 1.6; ctx.shadowBlur = 8;
    for (let i = 1; i < hist.length; i++) {
      const a = hist[i - 1], b = hist[i], x0 = w - (hist.length - i + 1) * 2, x1 = x0 + 2;
      const col = b.red || a.red ? "#ff5a52" : "#5ef2cc";
      ctx.strokeStyle = col; ctx.shadowColor = col;
      ctx.beginPath(); ctx.moveTo(x0, h / 2 - a.v * h * 0.42); ctx.lineTo(x1, h / 2 - b.v * h * 0.42); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    setTimeout(() => requestAnimationFrame(frame), reduced ? 200 : 33);
  }
  frame();
  return { spike: (a, red) => pending.push({ a, red }) };
})();

// ---- the command line -------------------------------------------------------------------------------------------------
const HELP = () => esc(t("terminal.cmd.help"));   // the commands stay English; what they say back is translated
$("cmd").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("cmd-in"), raw = input.value.trim(); input.value = "";
  if (!raw) return;
  const [cmd, arg = ""] = raw.toLowerCase().replace(/#/g, "").split(/\s+/);
  const id = Number(arg);
  sys(`<span class="up">fly&gt;</span> ${esc(raw)}`);
  if (cmd === "help") sys(HELP());
  else if (cmd === "top") {
    const rows = [...state.board].sort((a, b) => b.profit - a.profit).slice(0, 5);
    rows.reverse().forEach((r, i) => sys(t("terminal.cmd.top", { rank: 5 - i, fly: `#${r.flies[0]}`,
      profit: `<b class="${r.profit >= 0 ? "up" : "down"}">${usd(r.profit, true)}</b>`, value: usd(r.value), n: r.trades })));
  } else if (cmd === "watch" && id) { state.watch = id; restyleWatch(); const r = state.board.find((x) => x.flies[0] === id);
    sys(r ? t("terminal.cmd.watch", { fly: `#${id}`, value: usd(r.value), profit: usd(r.profit, true) }) : t("terminal.cmd.noWallet", { fly: `#${id}` })); }
  else if (cmd === "unwatch") { state.watch = null; restyleWatch(); sys(t("terminal.cmd.unwatch")); }
  else if (cmd === "token" && arg) {
    const x = holdings().find((h) => h.sym.toLowerCase() === arg);
    sys(x ? t("terminal.cmd.token", { sym: esc(x.sym), price: price(x.price), n: x.flies.size, value: usd(x.value),
      pct: pct(x.cost > 0 ? (x.value / x.cost - 1) * 100 : null), list: [...x.flies.keys()].map((f) => `#${f}`).join(" ") })
      : t("terminal.cmd.tokenNone", { sym: esc(arg.toUpperCase()) }));
  } else if ((cmd === "open" || cmd === "share") && id) location.href = `/traderflies/fly?id=${id}`;
  else if (cmd === "clear") $("stream").innerHTML = "";
  else sys(t("terminal.cmd.unknown", { help: HELP() }));
});
function restyleWatch() {
  for (const li of $("stream").children) li.classList.toggle("watch", state.watch != null && Number(li.dataset.fly) === state.watch);
  drawn = 0; redraw();
}
$("pulse").addEventListener("click", (e) => { const s = e.target.closest(".tm-tok")?.dataset.sym; if (s) { $("cmd-in").value = `token ${s}`; $("cmd").requestSubmit(); } });

// ---- clock and start --------------------------------------------------------------------------------------------------
setInterval(() => { $("tm-clock").textContent = `${new Date().toISOString().slice(11, 19)} UTC`; }, 1000);
(async () => {
  // the page's language first: assets/i18n/page.js loads the strings, then says so (or 4 s and go on in English)
  if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 4000); });
  drawParts();
  sys(t("terminal.stream.linking"));
  for (;;) { try { await readBoard(); break; } catch { live(false); await new Promise((r) => setTimeout(r, 5000)); } }
  setInterval(() => readBoard().catch(() => live(false)), BOARD_EVERY);
  if (!(await pollFeed())) pollFlies();
})();
