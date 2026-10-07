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

// public reads only here: through the edge cache on our own domain (nav.js MINE_READ, vercel.json /mapi)
const MINE = (window.flyNav && (window.flyNav.MINE_READ || window.flyNav.MINE_API)) || "https://flyai-mine.fly.dev";
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
/** why it traded (2026-10-04: the desk publishes the reason it wrote - "target", "stop", an option's "RSI 27 then a
 *  bounce"); a brain trade with none is the brain's own call. Known words are translated, the rest shown as written. */
const whyOf = (tr) => {
  const w = String(tr.why ?? "").trim();
  if (!w) return tr.tag === "brain" ? t("terminal.why.brain") : "";
  const k = w.startsWith("funding") ? "funding" : w.startsWith("colony") ? "colony" : w.replace(/[^a-z]+/gi, "_").toLowerCase();
  const v = t(`terminal.why.${k}`);
  return v === `terminal.why.${k}` ? w : v;
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  board: [], views: new Map(), trades: new Map(), started: false, feed: null, watch: null,
  events: 0, lastBoard: 0, partLive: new Map(),
};
const keyOf = (fly, r) => `${fly}:${r.at}:${r.symbol}:${r.side}:${r.tag}`;

// ---- reading the desk -----------------------------------------------------------------------------------------------
const net = { ms: null, ok: null };   // the footer's link light: the last read's round trip
const get = (p) => {
  const t0 = performance.now();
  return fetch(MINE + p, { cache: "no-store" }).then((r) => {
    net.ms = performance.now() - t0; net.ok = r.ok;
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }, (e) => { net.ok = false; throw e; });
};

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

// ---- the desk's bar and the miners: the screen's clock (2026-10-04, the community: "something should be happening")
// The desk reads every wallet once a bar (5 minutes) and publishes them together; each new bar sweeps the brain. The
// miners' tasks (/api/stats) tick on and land in the brain as sparks.
const BAR_SEC = 300, STATS_EVERY = 60_000;
const bar = { at: 0, events: 0 };
function checkBar() {
  let latest = 0;
  for (const s of state.views.values()) latest = Math.max(latest, s.updated ?? 0);
  if (!latest) return;
  if (!bar.at) { bar.at = latest; bar.events = state.events; $("f-bar").textContent = `${hhmmss(latest).slice(0, 5)} UTC`; return; }
  if (latest <= bar.at + 30) return;
  bar.at = latest;
  core.sweep(); beat.spike(0.55, false);
  sys(t("terminal.stream.bar", { time: hhmmss(latest).slice(0, 5), w: state.views.size, n: state.events - bar.events }));
  $("f-bar").textContent = `${hhmmss(latest).slice(0, 5)} UTC`;
  bar.events = state.events;
}
setInterval(() => {
  if (!bar.at) return;
  const left = bar.at + BAR_SEC - Date.now() / 1000, due = left <= 0;
  $("bar-fill").style.width = `${due ? 100 : Math.max(0, Math.min(100, (1 - left / BAR_SEC) * 100))}%`;
  $("bar-fill").parentElement.classList.toggle("due", due);
  $("bar-left").textContent = due ? t("terminal.cycle.reading")
    : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
}, 250);

// /api/stats is cached on the server and moves in steps: the count runs at today's average pace (jobs so far over the
// seconds since 00:00 UTC, when it resets), and each reading puts it back on the real number
const miners = { done: 0, at: 0, rate: 0 };
async function pollStats() {
  try {
    const s = await get("/api/stats"), now = Date.now();
    const sinceMidnight = (now % 86_400_000) / 1000;
    miners.rate = sinceMidnight > 600 ? (s.jobs_today ?? 0) / sinceMidnight : 0;
    miners.done = s.jobs_today ?? 0; miners.at = now;
    $("mn-online").textContent = num(s.miners_online ?? 0, 0);
    core.compute(miners.rate);
    $("mn-rate").textContent = miners.rate ? num(miners.rate, 0) : "—";
  } catch { /* the next read */ }
  setTimeout(pollStats, STATS_EVERY);
}
// the count runs on between reads at the measured pace
setInterval(() => {
  if (!miners.at) return;
  $("mn-tasks").textContent = num(Math.floor(miners.done + miners.rate * (Date.now() - miners.at) / 1000), 0);
}, 100);

let queue = [];
async function pollFlies() {
  if (!queue.length) queue = [...state.board].sort((a, b) => b.value - a.value).slice(0, TOP_N).map((r) => r.flies[0]);
  const id = queue.shift();
  if (id != null) {
    try { takeView(id, await get(`/api/vaults/fly/${id}`)); } catch { /* the next lap reads it again */ }
    if (!state.started && !queue.length) begin();
    checkBar();
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
    checkBar();
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
  $("core-sub").textContent = `${p.name} · ${said(tr.side, `#${tr.fly}`, tr.label ?? tr.symbol)}${whyOf(tr) ? ` · ${whyOf(tr)}` : ""}`;
}

function lightPart(key) {
  state.partLive.set(key, Date.now() + 4500);
  const el = document.querySelector(`.tm-part[data-k="${key}"]`);
  if (el) {
    el.classList.add("live"); el.querySelector("header em").textContent = t("terminal.parts.live");
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");   // the name pops again on every fill
  }
  core.hit(key);
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
  if (fresh) li.className = `new ${isSell(tr.side) ? "sell" : "buy"}`;
  if (state.watch === tr.fly) li.classList.add("watch");
  li.dataset.fly = tr.fly;
  li.innerHTML = `<span class="tm-tag" style="--c:${p.c}">${p.name}</span>`
    + `<span title="${esc(whyOf(tr))}">${said(tr.side, `<a href="/traderflies/fly?id=${tr.fly}" class="dim">#${tr.fly}</a>`, `<b>${esc(tr.label ?? tr.symbol)}</b>`)}${res}`
    + `${whyOf(tr) ? ` <small class="dim">· ${esc(whyOf(tr))}</small>` : ""}</span>`
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
  tween("k-value", value, (x) => usd(x)); $("k-wallets").textContent = t("terminal.kpis.wallets", { count: b.length });
  tween("k-profit", profit, (x) => usd(x, true), profit);
  set("k-profit-pct", principal > 0 ? t("terminal.kpis.on", { pct: pct((profit / principal) * 100), usd: usd(principal) }) : "—", profit);
  tween("k-day", day, (x) => usd(x, true), day); set("k-week", t("terminal.kpis.week", { usd: usd(week, true) }), week);
  const all = trades(), now = Date.now() / 1000;
  const dayT = all.filter((x) => x.at > now - 86400);
  if (dayT.length) tween("k-trades", dayT.length, (x) => num(Math.round(x), 0)); else set("k-trades", "—");
  $("k-last").textContent = all[0] ? t("terminal.kpis.last", { ago: ago(all[0].at) }) : t("terminal.kpis.lastNone");
  const closed = all.filter((x) => isSell(x.side) && x.pnl_pct != null), wins = closed.filter((x) => x.pnl_pct > 0).length;
  if (closed.length) tween("k-hit", (wins / closed.length) * 100, (x) => `${Math.round(x)}%`); else set("k-hit", "—");
  $("k-wl").textContent = closed.length ? t("terminal.kpis.wl", { w: wins, l: closed.length - wins }) : t("terminal.kpis.closedNone");
}
function set(id, text, sign) {
  const el = $(id); el.textContent = text; el._v = undefined;
  el.classList.toggle("up", sign > 0); el.classList.toggle("down", sign < 0);
}
/** a number that counts to its new value (from 0 the first time) and glows when it moves; still under reduced motion */
function tween(id, v, fmt, sign) {
  const el = $(id);
  el.classList.toggle("up", sign > 0); el.classList.toggle("down", sign < 0);
  if (el._v === v) return;
  const from = el._v ?? 0, first = el._v == null;
  el._v = v;
  cancelAnimationFrame(el._raf);
  if (!first) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); }
  if (reduced) { el.textContent = fmt(v); return; }
  const t0 = performance.now(), dur = first ? 1100 : 700;
  const step = (ts) => {
    const k = Math.min(1, (ts - t0) / dur), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (v - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

const seen = { tape: null, fresh: new Map() };   // fill key -> when it first showed on the tape
function drawTape() {
  const rows = trades().slice(0, 60), now = performance.now();
  if (seen.tape) for (const x of rows) if (!seen.tape.has(x.key)) seen.fresh.set(x.key, now);
  seen.tape = new Set(rows.map((x) => x.key));
  for (const [k, at] of seen.fresh) if (now - at > 1600) seen.fresh.delete(k);
  $("tape").innerHTML = rows.map((x) => {
    const p = partOf(x.tag), sell = isSell(x.side), f = seen.fresh.get(x.key);
    const flash = f != null ? ` new ${sell ? "sell" : "buy"}" style="animation-delay:${-Math.round(now - f)}ms` : "";
    const res = x.pnl_pct != null && sell ? `<span class="${x.pnl_pct >= 0 ? "up" : "down"}">${pct(x.pnl_pct)}</span>` : "";
    const tx = x.tx ? `<a href="${EXPLORER}/tx/${esc(x.tx.split(",")[0])}" target="_blank" rel="noreferrer">${esc(x.tx.slice(0, 6))}…↗</a>` : "";
    return `<tr class="${state.watch === x.fly ? "watch" : ""}${flash}" title="${esc(whyOf(x))}"><td class="dim">${hhmmss(x.at)}</td><td>#${x.fly}</td>`
      + `<td class="${sell ? "down" : "up"}">${t(sell ? "terminal.tape.sell" : "terminal.tape.buy")}</td><td><b>${esc(x.label ?? x.symbol)}</b></td>`
      + `<td>${usd(x.usd)}</td><td>${res}</td><td><span class="tm-tag" style="--c:${p.c}">${p.name}</span></td><td>${tx}</td></tr>`;
  }).join("");
  $("tape-count").textContent = t("terminal.tape.count", { count: state.trades.size });
  drawTicker(rows);
}

/** the ticker under the header: the newest fills, twice over so the loop has no seam; rebuilt only when a fill lands */
let tickHead = "";
function drawTicker(rows) {
  const top = rows.slice(0, 24);
  if (!top.length || top[0].key === tickHead) return;
  tickHead = top[0].key;
  const one = top.map((x) => {
    const sell = isSell(x.side), p = partOf(x.tag);
    const res = x.pnl_pct != null && sell ? ` <span class="${x.pnl_pct >= 0 ? "up" : "down"}">${pct(x.pnl_pct)}</span>` : "";
    return `<span class="tk"><i style="--c:${p.c}"></i><span class="dim">${hhmmss(x.at).slice(0, 5)}</span> #${x.fly} `
      + `<span class="${sell ? "down" : "up"}">${t(sell ? "terminal.tape.sell" : "terminal.tape.buy")}</span> <b>${esc(x.label ?? x.symbol)}</b> ${usd(x.usd)}${res}</span>`;
  }).join("");
  const run = $("ticker");
  run.innerHTML = `<div>${one}</div><div>${one}</div>`;
  run.style.setProperty("--dur", `${Math.max(30, run.firstChild.scrollWidth / 60)}s`);   // ~60 px a second
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
      // the square's size is the money in it (2026-10-04, the community: "size = value" but every cell was one size)
      const k = Math.sqrt(w.value / max), side = Math.round(5 + 13 * k), up = (w.pnl_pct ?? 0) >= 0;   // 5-18 px
      const col = up ? `rgba(94,242,204,${(0.55 + 0.45 * k).toFixed(2)})` : `rgba(255,90,82,${(0.55 + 0.45 * k).toFixed(2)})`;
      html += `<span class="hc" title="#${f} ${esc(x.sym)} ${usd(w.value)} ${pct(w.pnl_pct)}"><i style="width:${side}px;height:${side}px;`
        + `background:${col};box-shadow:0 0 ${Math.round(4 + k * 8)}px ${col}"></i></span>`;
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
  const all = trades(), now = Date.now() / 1000, n = all.filter((x) => x.at > now - 3600).length;
  $("beat-rate").textContent = t("terminal.beat.rate", { n, w: state.board.length });
  beat.set(all);
  $("f-fills").textContent = num(state.trades.size, 0);
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
  let rot = 0, sweep0 = -1e9, sparks = 0;
  const hits = new Map();   // part key -> when its last fill landed: its chip pops
  const nodes = PARTS.map((p, i) => ({ p, a: (i / PARTS.length) * Math.PI * 2 - Math.PI / 2 }));
  // a part chip glows while it acts, and in turn while a new desk bar sweeps through the brain
  const glowing = (key, ts) => {
    if (state.partLive.has(key)) return true;
    const k = (ts - sweep0) / 1600, i = PARTS.findIndex((p) => p.key === key) / PARTS.length;
    return k > 0.15 + i * 0.7 && k < 0.15 + i * 0.7 + 0.22;
  };
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
      const lit = glowing(q.n.p.key, ts);
      ctx.strokeStyle = lit ? q.n.p.c : "rgba(94,242,204,.07)"; ctx.globalAlpha = lit ? 0.55 : 1;
      ctx.setLineDash(lit ? [] : [2, 5]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // the particles, back to front
    const cs = Math.cos(rot), sn = Math.sin(rot), tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
    const pr = pts.map((p) => { const x = p.x * cs - p.z * sn, z0 = p.x * sn + p.z * cs, y = p.y * ct - z0 * st, z = p.y * st + z0 * ct; return { x, y, z, p }; })
      .sort((a, b) => a.z - b.z);
    const t = ts / 1000, sk = (ts - sweep0) / 1600, front = -1.9 + 3.8 * sk;   // a new bar: a wave left to right
    for (const q of pr) {
      const depth = (q.z + 1.2) / 2.4, wave = sk > 0 && sk < 1 ? Math.exp(-((q.x - front) ** 2) / 0.03) : 0;
      const fire = Math.max(Math.max(0, Math.sin(t * (0.6 + q.p.s * 1.8) + q.p.f)) ** 18, wave);
      ctx.fillStyle = fire > 0.4 ? "#eafff8" : "#5ef2cc";
      ctx.globalAlpha = Math.min(1, 0.12 + depth * 0.5 + fire * 0.8);
      const sz = 0.6 + depth * 1.3 + fire * 1.6;
      ctx.fillRect(cx + q.x * R - sz / 2, cy + q.y * R - sz / 2, sz, sz);
    }
    // the miners' work landing: sparks in the brain, as many as their tasks a second allow
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < sparks; i++) {
      const q = pr[(Math.random() * pr.length) | 0];
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.fillRect(cx + q.x * R - 1.5, cy + q.y * R - 1.5, 3, 3);
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
      const lit = glowing(q.n.p.key, ts), tw = ctx.measureText(q.n.p.name).width + 18;
      // a fill with this part's tag: the chip swells and settles, and keeps breathing while the part is live
      const dt = ts - (hits.get(q.n.p.key) ?? -1e9), pop = reduced ? 0 : 0.28 * Math.exp(-dt / 260) + (lit ? 0.04 * Math.sin(ts / 160) : 0);
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1 + pop, 1 + pop);
      ctx.fillStyle = lit ? "rgba(0,0,0,.85)" : "rgba(4,7,6,.9)"; ctx.strokeStyle = lit ? q.n.p.c : "rgba(94,242,204,.22)";
      if (lit) { ctx.shadowColor = q.n.p.c; ctx.shadowBlur = 14 + 20 * Math.exp(-dt / 400); }
      ctx.beginPath(); ctx.roundRect(-tw / 2, -11, tw, 22, 6); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = lit ? q.n.p.c : "rgba(232,242,239,.75)"; ctx.fillText(q.n.p.name, 0, 0.5);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    pulse: (key, c, size) => pulses.push({ key, c, size, t0: performance.now() }),
    sweep: () => { sweep0 = performance.now(); },
    hit: (key) => hits.set(key, performance.now()),
    /** tasks a second across the miners -> sparks a frame (a few hundred tasks a second already shows) */
    compute: (rate) => { sparks = reduced ? 0 : Math.min(40, Math.round(Math.sqrt(Math.max(0, rate)) / 2)); },
  };
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

/** the desk's activity: trades an hour over the last two days (buys mint, sells red, stacked) under a glowing line of
 *  the total; every live trade flashes the newest hour and rings its point */
const beat = (() => {
  const cv = $("beat"), H = 48; let bins = [], flash = -1e9, flashRed = false;
  function set(all) {
    const top = Math.floor(Date.now() / 3_600_000) * 3600;
    bins = Array.from({ length: H }, (_, i) => ({ t: top - (H - 1 - i) * 3600, buy: 0, sell: 0 }));
    for (const x of all) {
      const i = H - 1 - (top - Math.floor(x.at / 3600) * 3600) / 3600;
      if (i >= 0 && i < H) bins[i][isSell(x.side) ? "sell" : "buy"]++;
    }
  }
  function frame(ts) {
    const { ctx, w, h } = fit(cv);
    ctx.clearRect(0, 0, w, h);
    if (bins.length) {
      const padL = 26, padB = 14, padT = 8, cw = w - padL - 4, ch = h - padB - padT;
      const max = Math.max(4, ...bins.map((b) => b.buy + b.sell)), bw = cw / H;
      const X = (i) => padL + (i + 0.5) * bw, Y = (v) => padT + ch - (v / max) * ch;
      // the grid, the scale and the hours (UTC, every 6)
      ctx.font = "9px 'JetBrains Mono', monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "right";
      for (const f of [0, 0.5, 1]) {
        const y = Y(max * f);
        ctx.strokeStyle = "rgba(94,242,204,.07)"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - 4, y); ctx.stroke();
        ctx.fillStyle = "#4d605a"; ctx.fillText(num(Math.round(max * f), 0), padL - 5, y);
      }
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      bins.forEach((b, i) => { if (new Date(b.t * 1000).getUTCHours() % 6 === 0) { ctx.fillStyle = "#4d605a"; ctx.fillText(hhmmss(b.t).slice(0, 5), X(i), h - 2); } });
      // the bars; the newest hour lights up on a live trade
      const fk = Math.max(0, 1 - (ts - flash) / 1200);
      bins.forEach((b, i) => {
        const x = padL + i * bw + bw * 0.18, bwi = bw * 0.64, a = i === H - 1 ? 0.45 + 0.5 * fk : 0.3;
        ctx.fillStyle = `rgba(94,242,204,${a})`; ctx.fillRect(x, Y(b.buy), bwi, Y(0) - Y(b.buy));
        ctx.fillStyle = `rgba(255,90,82,${a})`; ctx.fillRect(x, Y(b.buy + b.sell), bwi, Y(b.buy) - Y(b.buy + b.sell));
      });
      // the total as a smooth line, glowing, with a soft fill under it
      const pts = bins.map((b, i) => [X(i), Y(b.buy + b.sell)]);
      const path = new Path2D(); path.moveTo(...pts[0]);
      for (let i = 1; i < pts.length; i++) { const mx = (pts[i - 1][0] + pts[i][0]) / 2; path.bezierCurveTo(mx, pts[i - 1][1], mx, pts[i][1], ...pts[i]); }
      const area = new Path2D(path); area.lineTo(pts[pts.length - 1][0], Y(0)); area.lineTo(pts[0][0], Y(0)); area.closePath();
      const g = ctx.createLinearGradient(0, padT, 0, Y(0)); g.addColorStop(0, "rgba(94,242,204,.16)"); g.addColorStop(1, "rgba(94,242,204,0)");
      ctx.fillStyle = g; ctx.fill(area);
      ctx.strokeStyle = "#5ef2cc"; ctx.lineWidth = 1.8; ctx.shadowColor = "#5ef2cc"; ctx.shadowBlur = 12; ctx.stroke(path); ctx.shadowBlur = 0;
      const [ex, ey] = pts[pts.length - 1], k = reduced ? 0.5 : (Math.sin(ts / 300) + 1) / 2, col = fk && flashRed ? "#ff5a52" : "#5ef2cc";
      ctx.fillStyle = col; ctx.globalAlpha = 0.2 + 0.2 * k; ctx.beginPath(); ctx.arc(ex, ey, 5 + 4 * k, 0, Math.PI * 2); ctx.fill();
      if (fk && !reduced) { ctx.globalAlpha = fk; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ex, ey, 6 + (1 - fk) * 26, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (reduced) setTimeout(() => requestAnimationFrame(frame), 500); else requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { set, spike: (a, red) => { flash = performance.now(); flashRed = red; } };
})();

// ---- the Fly Desk -----------------------------------------------------------------------------------------------------
// The house desk's public snapshot, read the way desk.js reads it: the desk's own pubserve first, the stored copy in
// desk_public (anon key) while the desk restarts. Only its flies: the snapshot's test books (ghosts, variants) stay off.
const DESK_API = "https://flytrade-desk.fly.dev";
const SUPABASE = "https://fixyinamewrjrcybjoua.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpeHlpbmFtZXdyanJjeWJqb3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNTUyNjMsImV4cCI6MjEwNDgzMTI2M30.-Ri3FIUheo4Tc9TFOUMAfV9OkDUp_0JK_hPvKVnagik";
const desk = { ok: null, curve: [] };
async function readDesk() {
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    const d = await fetch(DESK_API + "/public/site.json", { cache: "no-store", signal: ctl.signal });
    clearTimeout(timer);
    if (d.ok) return d.json();
  } catch { /* the stored copy below */ }
  const r = await fetch(`${SUPABASE}/rest/v1/desk_public?key=eq.site&select=value`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  const rows = await r.json();
  if (!rows.length) throw new Error("no snapshot");
  return rows[0].value;
}
async function pollDesk() {
  try { drawDesk(await readDesk()); desk.ok = true; } catch { desk.ok = false; $("f-mode").textContent = t("terminal.foot.down"); }
  setTimeout(pollDesk, 60_000);
}
function drawDesk(b) {
  const mode = ["paper", "shadow", "live"].includes(String(b.mode).toLowerCase()) ? String(b.mode).toLowerCase() : "paper", chip = $("dk-mode");
  // paper: the desk is not trading for real yet - the workshop teaser, no numbers at all
  const building = mode === "paper";
  chip.textContent = building ? t("terminal.desk.build.chip") : t(`terminal.desk.mode.${mode}`);
  chip.dataset.mode = building ? "build" : mode;
  $("f-mode").textContent = chip.textContent;
  $("dk-build").hidden = !building; $("dk-live").hidden = building; $("dk-meta").hidden = building;
  if (building) return;
  // live: the pool wallet's money with what the desk trades, then the split; paper today: what it trades
  const pooled = b.pool && b.total_usd != null;
  tween("dk-total", pooled ? b.total_usd : b.pot_usd, (x) => usd(x));
  $("dk-split").textContent = pooled ? t("terminal.desk.split", { trading: usd(b.pot_usd), pool: usd(b.pool.usd || 0) })
    : t("terminal.desk.trading", { usd: usd(b.pot_usd) });
  const pnl = b.pot_usd - (b.capital_usd ?? b.pot_usd);
  tween("dk-pnl", pnl, (x) => `${usd(x, true)} ${b.capital_usd ? pct((100 * x) / b.capital_usd) : ""}`, pnl);
  $("dk-books").textContent = num((b.books ?? []).filter((x) => (x.kind ?? "fly") === "fly").length, 0);
  $("dk-peak").textContent = b.ath?.pot_usd ? usd(b.ath.pot_usd) : "—";
  $("dk-updated").textContent = b.updated ? t("terminal.desk.updated", { ago: ago(Date.parse(b.updated) / 1000) }) : "";
  // the flies' books added up per bar (the curve's variants are the test ghosts: not here)
  const c = b.curve;
  desk.curve = c?.points?.length
    ? c.points.map(([, vals]) => vals.reduce((s, v, i) => s + (String(c.books[i]).startsWith("fly") && v != null ? v : 0), 0)) : [];
  drawDeskSpark();
}
/** the workshop (paper): three cogwheels turning against each other, flies at work around them */
function gear(cx, cy, r, teeth, cls) {
  const pts = [], n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = i % 4 < 2 ? r : r - 7;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<g class="cog ${cls}" style="transform-origin:${cx}px ${cy}px"><polygon points="${pts.join(" ")}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.55).toFixed(1)}" class="hole"/><circle cx="${cx}" cy="${cy}" r="3.2" class="hub"/></g>`;
}
const FLY = `<g class="fly" transform="scale(1.4)"><ellipse class="wing l" cx="-3" cy="-4" rx="5" ry="3"/><ellipse class="wing r" cx="3" cy="-4" rx="5" ry="3"/>` +
  `<ellipse class="body" cx="0" cy="0" rx="3.4" ry="5"/><circle class="head" cx="0" cy="-5.6" r="2.4"/>` +
  `<circle class="eye" cx="-1" cy="-6" r=".8"/><circle class="eye" cx="1" cy="-6" r=".8"/></g>`;
(function buildWorks() {
  const svg = $("dk-works");
  if (!svg) return;
  const tiny = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2, rr = i % 4 < 2 ? 5 : 3.4;
    return `${(rr * Math.cos(a)).toFixed(1)},${(9 + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  svg.innerHTML = gear(92, 66, 40, 12, "big") + gear(158, 40, 26, 8, "mid") + gear(162, 92, 18, 6, "small") +
    `<g class="spark s1"><circle cx="128" cy="54" r="1.4"/></g><g class="spark s2"><circle cx="140" cy="76" r="1.2"/></g>` +
    // a fly carrying a little cog between the wheels and the stack of finished parts
    `<g class="carrier"><g transform="translate(0 -2)">${FLY}</g><g class="cog tiny" style="transform-origin:0px 9px"><polygon points="${tiny}"/></g></g>` +
    // a fly hammering at the big wheel
    `<g class="smith" transform="translate(40 30)"><g class="bob">${FLY}<rect class="hammer" x="4" y="-2" width="9" height="2" rx="1"/></g></g>` +
    // a fly circling above, keeping watch
    `<g class="orbit"><g transform="translate(205 30)">${FLY}</g></g>` +
    `<g class="stack"><rect x="224" y="98" width="34" height="6" rx="2"/><rect x="228" y="91" width="26" height="6" rx="2"/>` +
    `<rect x="232" y="84" width="18" height="6" rx="2"/></g>`;
})();
function drawDeskSpark() {
  const { ctx, w, h } = fit($("dk-spark")), v = desk.curve.slice(-400);
  ctx.clearRect(0, 0, w, h);
  if (v.length < 2) return;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1, col = v[v.length - 1] >= v[0] ? "#5ef2cc" : "#ff5a52";
  const X = (i) => (i / (v.length - 1)) * (w - 4) + 2, Y = (y) => h - 3 - ((y - lo) / span) * (h - 6);
  ctx.beginPath(); v.forEach((y, i) => (i ? ctx.lineTo(X(i), Y(y)) : ctx.moveTo(X(i), Y(y))));
  ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
}
addEventListener("resize", () => desk.curve.length && drawDeskSpark());
/** the weekly payout: Sunday 23:00 UTC */
function nextPayout(now) {
  const d = new Date(now), at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((7 - d.getUTCDay()) % 7), 23);
  return at > now ? at : at + 7 * 86_400_000;
}
setInterval(() => {
  const left = Math.max(0, Math.floor((nextPayout(Date.now()) - Date.now()) / 1000)), p2 = (n) => String(n).padStart(2, "0");
  const d = Math.floor(left / 86400), hms = `${p2(Math.floor((left % 86400) / 3600))}:${p2(Math.floor((left % 3600) / 60))}:${p2(left % 60)}`;
  $("dk-count").textContent = d ? t("terminal.desk.days", { d, hms }) : hms;
  // the footer's lights
  $("f-mine").className = `tm-dot${net.ok == null ? "" : net.ok ? " on" : " off"}`;
  $("f-ms").textContent = net.ms == null ? "—" : `${num(Math.round(net.ms), 0)} ms`;
  $("f-desk").className = `tm-dot${desk.ok == null ? "" : desk.ok ? " on" : " off"}`;
}, 1000);

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
  pollDesk();
  sys(t("terminal.stream.linking"));
  for (;;) { try { await readBoard(); break; } catch { live(false); await new Promise((r) => setTimeout(r, 5000)); } }
  setInterval(() => readBoard().catch(() => live(false)), BOARD_EVERY);
  pollStats();
  if (!(await pollFeed())) pollFlies();
})();
