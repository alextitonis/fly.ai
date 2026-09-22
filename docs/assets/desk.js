/**
 * The Fly Desk (desk.html): reads the desk's flies-only public snapshot (desk_public "site", publish.site_view,
 * written after every bar, readable with the anon key) and draws it. No libraries.
 * ?src=<url> reads a snapshot JSON from elsewhere (local testing).
 */
(function () {
  "use strict";
  const SUPABASE = "https://fixyinamewrjrcybjoua.supabase.co";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpeHlpbmFtZXdyanJjeWJqb3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNTUyNjMsImV4cCI6MjEwNDgzMTI2M30.-Ri3FIUheo4Tc9TFOUMAfV9OkDUp_0JK_hPvKVnagik";
  const REFRESH_MS = 60_000;
  const BAR_MIN = 15;
  const $ = (id) => document.getElementById(id);
  const src = new URLSearchParams(location.search).get("src");

  // ------------------------------------------------------------------ text
  let en = null;
  const pick = (obj, key) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function t(key, vars) {
    if (window.flyI18n) return window.flyI18n.t("desk." + key, vars);
    let v = pick(en, key);
    if (v && typeof v === "object") v = vars && vars.count === 1 ? v.one : v.other;
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------------ numbers
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const nf = (d) => new Intl.NumberFormat(lang(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (x, d = 2) => (x == null || isNaN(x) ? "—" : (x < 0 ? "-$" : "$") + nf(d).format(Math.abs(x)));
  const susd = (x, d = 2) => (x == null || isNaN(x) ? "—" : (x > 0 ? "+" : x < 0 ? "-" : "") + "$" + nf(d).format(Math.abs(x)));
  const pct = (x, d = 2) => (x == null || isNaN(x) ? "—" : (x > 0 ? "+" : x < 0 ? "-" : "") + nf(d).format(Math.abs(x)) + "%");
  const cls = (x) => (x > 0 ? "up" : x < 0 ? "down" : "");
  function qty(x) {
    if (x == null) return "—";
    const a = Math.abs(x);
    const d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
    return new Intl.NumberFormat(lang(), { maximumFractionDigits: d, notation: a >= 1e7 ? "compact" : "standard" }).format(x);
  }
  function price(x) {
    if (x == null) return "—";
    const a = Math.abs(x);
    if (a === 0) return "$0";
    if (a < 0.0001) return "$" + x.toPrecision(3);
    return "$" + new Intl.NumberFormat(lang(), { maximumFractionDigits: a >= 100 ? 2 : a >= 1 ? 3 : 6 }).format(x);
  }
  function ago(iso) {
    if (!iso) return t("t.never");
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    const r = new Intl.RelativeTimeFormat(lang(), { numeric: "auto", style: "short" });
    if (s < 60) return r.format(-Math.round(s), "second");
    if (s < 3600) return r.format(-Math.round(s / 60), "minute");
    if (s < 86400) return r.format(-Math.round(s / 3600), "hour");
    return r.format(-Math.round(s / 86400), "day");
  }
  const time = (iso) => new Date(iso).toLocaleString(lang(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const hhmm = (iso) => new Date(iso).toLocaleTimeString(lang(), { hour: "2-digit", minute: "2-digit" });

  // ------------------------------------------------------------------ data
  async function fetchBoard() {
    if (src) {
      const r = await fetch(src, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }
    const r = await fetch(`${SUPABASE}/rest/v1/desk_public?key=eq.site&select=value`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const rows = await r.json();
    if (!rows.length) throw new Error("no scoreboard");
    return rows[0].value;
  }

  /** The curve as series: {times, pot, books: {fly: [...]}, variants: {name: [...]}}. */
  function series(b) {
    const c = b.curve;
    if (!c || !c.points || !c.points.length) {                 // an older snapshot: the daily pot only
      const s = b.series || [];
      return { times: s.map((d) => d.day + "T23:59:00Z"), pot: s.map((d) => d.pot_usd), books: {}, variants: {} };
    }
    const books = {}, variants = {};
    c.books.forEach((n) => (books[n] = []));
    c.variants.forEach((n) => (variants[n] = []));
    const out = { times: [], pot: [], books, variants };
    for (const [ts, vals, gv] of c.points) {
      let pot = 0;
      vals.forEach((v, i) => { books[c.books[i]].push(v); if (v != null) pot += v; });
      gv.forEach((v, i) => variants[c.variants[i]].push(v));
      out.times.push(ts); out.pot.push(+pot.toFixed(2));
    }
    return out;
  }

  // ------------------------------------------------------------------ chart
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  // "ret": every line as a return on its own starting capital (the books start with different money);
  // "usd": the pot alone, in dollars
  let zoom = "ret";
  function drawChart(host, s, starts) {
    host.innerHTML = "";
    const W = host.clientWidth, H = host.clientHeight;
    const m = { l: 62, r: 14, t: 10, b: 26 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" }, host);
    const asRet = (vals, st) => vals.map((v) => (v == null || !st ? null : +((100 * (v - st)) / st).toFixed(3)));
    const ret = zoom === "ret";
    // the whole desk thick, each fly thin (in return % only: the flies start with the same money)
    const lines = [{ key: "pot", color: "var(--s-pot)", w: 2.4, label: t("pot.seriesPot"), raw: s.pot, st: starts.pot }]
      .concat(Object.keys(s.books).map((b) => ({ key: b, color: flyColor(b), w: 1.3, label: bookLabel(b), raw: s.books[b], st: starts.books[b] })))
      .filter((l) => l.raw.length && (ret || l.key === "pot"))
      .map((l) => ({ ...l, data: ret ? asRet(l.raw, l.st) : l.raw }));
    const start = ret ? 0 : starts.pot;
    const fmt = (v, d) => (ret ? pct(v, d == null ? 1 : d) : usd(v, d == null ? 0 : d));
    const n = s.times.length;
    if (n < 2) {
      el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "empty" }, svg).textContent = t("pot.none");
      return;
    }
    const all = lines.flatMap((l) => l.data).concat([start]).filter((v) => v != null);
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || (ret ? 0.5 : Math.max(1, hi * 0.01));
    lo -= pad; hi += pad;
    const x = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    const grid = el("g", { class: "grid" }, svg), axis = el("g", { class: "axis" }, svg);
    for (const v of niceTicks(lo, hi, H < 280 ? 4 : 5)) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grid);
      el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, axis).textContent = fmt(v, ret ? (hi - lo < 4 ? 1 : 0) : hi - lo < 20 ? 2 : 0);
    }
    const nx = Math.max(2, Math.min(6, Math.floor(W / 150)));
    for (let k = 0; k < nx; k++) {
      const i = Math.round((k / (nx - 1)) * (n - 1));
      const span = Date.parse(s.times[n - 1]) - Date.parse(s.times[0]);
      el("text", { x: x(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === nx - 1 ? "end" : "middle" }, axis)
        .textContent = span < 36 * 3600e3 ? hhmm(s.times[i]) : time(s.times[i]);
    }
    el("line", { x1: m.l, x2: W - m.r, y1: y(start), y2: y(start), stroke: "var(--ink-faint)", "stroke-dasharray": "4 3", "stroke-width": 1 }, svg);
    for (const l of lines.slice().reverse()) {
      let d = "";
      l.data.forEach((v, i) => { if (v != null) d += (d ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); });
      el("path", { d, fill: "none", stroke: l.color, "stroke-width": l.w, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }, svg);
    }
    // hover
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--line-2)", visibility: "hidden" }, svg);
    const dots = lines.map((l) => el("circle", { r: 3.5, fill: l.color, visibility: "hidden" }, svg));
    const tip = document.createElement("div");
    tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      lines.forEach((l, k) => {
        const v = l.data[i];
        dots[k].setAttribute("visibility", v == null ? "hidden" : "visible");
        if (v != null) { dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(v)); }
      });
      tip.innerHTML = `<div class="t">${esc(time(s.times[i]))}</div>` + lines.map((l) =>
        `<div class="row"><span><i style="background:${l.color}"></i> ${esc(l.label)}</span><b>${ret ? pct(l.data[i]) + " · " : ""}${usd(l.raw[i])}</b></div>`).join("");
      tip.hidden = false;
      const left = (x(i) / W) * r.width;
      tip.style.left = Math.max(80, Math.min(r.width - 80, left)) + "px";
      tip.style.top = Math.max(0, (y(lines[0].data[i] == null ? start : lines[0].data[i]) / H) * r.height - 12) + "px";
    };
    const leave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); };
    svg.addEventListener("mousemove", move);
    svg.addEventListener("touchmove", move, { passive: true });
    svg.addEventListener("mouseleave", leave);
    svg.addEventListener("touchend", leave);
    $("legend").innerHTML = lines.map((l) => `<li><i style="background:${l.color}"></i>${esc(l.label)}</li>`).join("") +
      `<li><i class="dash"></i>${esc(t("pot.seriesStart"))} ${ret ? "" : usd(start, 0)}</li>`;
  }

  function spark(vals, color) {
    const v = vals.filter((x) => x != null);
    if (v.length < 2) return "";
    const W = 110, H = 26, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    let d = "";
    vals.forEach((x, i) => { if (x != null) d += (d ? "L" : "M") + ((i / (vals.length - 1)) * W).toFixed(1) + "," + (H - 2 - ((x - lo) / span) * (H - 4)).toFixed(1); });
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
  }

  // ------------------------------------------------------------------ sections
  const FLY_COLORS = ["var(--f1)", "var(--f2)", "var(--f3)", "var(--f4)", "var(--f5)", "var(--f6)"];
  const flyColor = (name) => {
    if (name === "house") return "var(--ink-dim)";                // the house's own buys, never a fly's
    const n = parseInt(String(name).replace(/\D/g, ""), 10);
    return FLY_COLORS[Number.isFinite(n) ? (n - 1) % FLY_COLORS.length : 0];
  };
  const bookLabel = (name) => (name === "house" ? t("chains.house") : String(name).replace(/^fly:/, "Fly #"));
  /** Which chain a token is on: "base:BRETT" is Base, a bare ticker is Robinhood Chain (the desk's home). */
  const CHAIN_NAMES = { robinhood: "Robinhood", base: "Base", bsc: "BNB", solana: "Solana" };
  const chainOf = (sym) => {
    const m = /^([a-z]+):(.+)$/.exec(String(sym));
    return m && CHAIN_NAMES[m[1]] ? [m[1], m[2]] : ["robinhood", String(sym)];
  };
  const chainTag = (c) => `<span class="tag chain ${c}">${esc(CHAIN_NAMES[c])}</span>`;
  const tok = (sym) => { const [c, name] = chainOf(sym); return `${esc(name)}${chainTag(c)}`; };
  const VAR_COLORS = ["var(--s-v1)", "var(--s-v2)", "var(--s-v3)", "var(--s-v4)"];
  const table = (id, head, rows, empty) => {
    $(id).innerHTML = `<thead><tr>${head.map(([h, r]) => `<th${r ? ' class="r"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
      (rows.length ? rows.join("") : `<tr class="empty"><td colspan="${head.length}">${esc(empty || "—")}</td></tr>`) + "</tbody>";
  };

  let board = null, curve = null, posBook = null;

  /** 24h high, low and change, and the high since the curve begins (the desk's start, until the curve is a week long). */
  function renderStats(s, start) {
    const box = $("stats");
    const n = s.pot.length;
    if (n < 2 || !start) { box.innerHTML = ""; return; }
    const lastT = Date.parse(s.times[n - 1]);
    const ix = s.times.map((ts, i) => i).filter((i) => s.pot[i] != null);
    const day = ix.filter((i) => Date.parse(s.times[i]) >= lastT - 24 * 3600e3);
    const hiOf = (is) => is.reduce((a, i) => (s.pot[i] > s.pot[a] ? i : a), is[0]);
    const loOf = (is) => is.reduce((a, i) => (s.pot[i] < s.pot[a] ? i : a), is[0]);
    const vs = (v) => (100 * (v - start)) / start;
    const cell = (label, v, p, when) =>
      `<div class="st"><span class="k">${esc(label)}</span><b>${usd(v)}</b> <span class="${cls(p)}">${pct(p)}</span>` +
      (when ? `<span class="when">${esc(when)}</span>` : "") + `</div>`;
    const h = hiOf(day), l = loOf(day), ath = hiOf(ix);
    const first = day[0], chg = s.pot[n - 1] - s.pot[first];
    const since = Date.parse(s.times[ix[0]]) <= lastT - 6.9 * 86400e3 ? t("stats.week") : t("stats.sinceStart");
    box.innerHTML =
      cell(t("stats.high24"), s.pot[h], vs(s.pot[h]), hhmm(s.times[h])) +
      cell(t("stats.low24"), s.pot[l], vs(s.pot[l]), hhmm(s.times[l])) +
      `<div class="st"><span class="k">${esc(t("stats.change24"))}</span><b class="${cls(chg)}">${susd(chg)}</b> <span class="${cls(chg)}">${pct(s.pot[first] ? (100 * chg) / s.pot[first] : 0)}</span></div>` +
      athCell(s.pot[ath], s.times[ath], since);
  }
  /** The all-time high: the desk's best bar ever and what it had earned then, kept by the server (engine.all_time_high)
   * so it outlives the chart's week; before the server has one, the high of the curve on hand. */
  function athCell(curveHi, curveAt, since) {
    const a = board && board.ath, start = board && board.capital_usd;
    if (!a || !a.at || !start) return `<div class="st"><span class="k">${esc(t("stats.ath", { when: since }))}</span><b>${usd(curveHi)}</b> ` +
      `<span class="${cls(curveHi - start)}">${pct((100 * (curveHi - start)) / start)}</span><span class="when">${esc(time(curveAt))}</span></div>`;
    const p = (100 * a.earned_usd) / start;
    return `<div class="st"><span class="k">${esc(t("stats.athAll"))}</span><b class="${cls(a.earned_usd)}">${susd(a.earned_usd)}</b> ` +
      `<span class="${cls(p)}">${pct(p)}</span><span class="when">${esc(usd(a.pot_usd) + " · " + time(a.at))}</span></div>`;
  }
  const starts = () => {
    const books = {};
    board.books.forEach((x) => (books[x.book] = x.start_usd));
    return { pot: board.capital_usd || board.books.reduce((a, x) => a + x.start_usd, 0), books };
  };

  /** 06: the flies' books on other chains (paper, outside the pot): per chain its flies, their holdings, recent fills. */
  function renderChains(cs) {
    const keys = Object.keys(cs).filter((k) => cs[k] && (cs[k].books || []).length);
    $("chains").hidden = !keys.length;
    const head = (cols) => `<thead><tr>${cols.map(([h, r]) => `<th${r ? ' class="r"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>`;
    $("chains-body").innerHTML = keys.map((k) => {
      const c = cs[k];
      const books = c.books.map((x) =>
        `<tr><td class="strong"><span class="swatch" style="background:${flyColor(x.book)}"></span>${esc(bookLabel(x.book))}</td>
         <td class="r strong">${usd(x.value_usd)}</td><td class="r"><span class="${cls(x.return_pct)}">${pct(x.return_pct)}</span></td>
         <td class="r">${nf(0).format(x.trades)}</td>
         <td>${x.holdings.length ? x.holdings.slice(0, 4).map(tok).join(", ") : `<span class="dim">${esc(t("books.cash"))}</span>`}</td></tr>`).join("");
      const tape = (c.tape || []).slice(0, 12).map((r) => {
        const sell = /sell|profit|arb|exercise/.test(r.side);
        return `<tr><td>${esc(time(r.at))}</td><td><span class="swatch" style="background:${flyColor(r.book)}"></span>${esc(bookLabel(r.book))}</td>
          <td class="${sell ? "up" : ""}">${esc(sideName(r.side))}</td><td class="strong">${tok(r.symbol)}</td><td class="r">${usd(r.usd)}</td></tr>`;
      }).join("");
      const pinned = (c.pinned || []).map((p) => esc(chainOf(p)[1])).join(", ");
      return `<h3 class="chain-h">${chainTag(k)} ${esc(t("chains.tokens", { n: nf(0).format(c.tokens || 0) }))}` +
        (pinned ? ` <span class="dim">· ${esc(t("chains.pinned", { list: pinned }))}</span>` : "") + `</h3>` +
        `<div class="scroll"><table class="tbl">${head([[t("books.thBook")], [t("books.thValue"), 1], [t("books.thReturn"), 1], [t("books.thTrades"), 1], [t("books.thHolds")]])}<tbody>${books}</tbody></table></div>` +
        `<h3 class="chain-h">${esc(t("chains.fills"))}</h3>` +
        `<div class="scroll"><table class="tbl">${head([[t("tape.thTime")], [t("tape.thBook")], [t("tape.thSide")], [t("tape.thToken")], [t("tape.thUsd"), 1]])}` +
        `<tbody>${tape || `<tr class="empty"><td colspan="5">${esc(t("tape.none"))}</td></tr>`}</tbody></table></div>`;
    }).join("");
  }

  function render() {
    const b = board;
    const s = curve;
    const start = b.capital_usd;
    // masthead
    const age = (Date.now() - Date.parse(b.updated)) / 60000;
    const state = age < BAR_MIN * 2.5 ? "live" : age < BAR_MIN * 8 ? "stalled" : "offline";
    $("conn").dataset.state = state;
    $("conn-text").textContent = t("chip." + state);
    const u = b.universe || {};
    const f = b.fills || {};
    $("sysline").innerHTML = [
      [t("sys.mode"), b.mode],
      s.times.length ? [t("sys.bars"), s.times.length] : null,
      [t("sys.flies"), b.books.length],
      f.trades != null ? [t("sys.trades"), nf(0).format(f.trades)] : null,
      u.tokens ? [t("sys.tokens"), nf(0).format(u.tokens)] : null,
      [t("sys.updated"), ago(b.updated)],
    ].filter(Boolean).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join("");

    // 01 the pot
    const pnl = b.pot_usd - start;
    $("k-pot").textContent = usd(b.pot_usd);
    $("k-ret").innerHTML = `<span class="${cls(pnl)}">${susd(pnl)}</span> <span class="sub ${cls(pnl)}">${pct(start ? (100 * pnl) / start : 0)}</span>`;
    const best = b.books.slice().sort((a, c) => c.return_pct - a.return_pct)[0];
    $("k-best").innerHTML = best ? `${esc(bookLabel(best.book))} <span class="${cls(best.return_pct)}">${pct(best.return_pct)}</span>` : "—";
    // the median fly: half the flies did better, half worse (the middle two averaged when the count is even)
    const med = (xs) => { const v = xs.slice().sort((a, c) => a - c), m = v.length >> 1; return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : null; };
    const mv = med(b.books.map((x) => x.value_usd)), mr = med(b.books.map((x) => x.return_pct));
    $("k-median").innerHTML = mv == null ? "—" : `${usd(mv)} <span class="sub ${cls(mr)}">${pct(mr)}</span>`;
    renderStats(s, start);
    drawChart($("chart"), s, starts());
    const flyNames = Object.keys(s.books);
    table("curve-tbl", [[t("pot.thTime")], [t("pot.seriesPot"), 1]].concat(flyNames.map((n) => [bookLabel(n), 1])),
      s.times.map((ts, i) => i).reverse().map((i) =>
        `<tr><td>${esc(time(s.times[i]))}</td><td class="r strong">${usd(s.pot[i])}</td>` +
        flyNames.map((n) => `<td class="r">${usd(s.books[n][i])}</td>`).join("") + `</tr>`),
      t("pot.none"));

    // 03 books
    const maxAbs = Math.max(1, ...b.books.map((x) => Math.abs(x.return_pct)));
    table("books-tbl", [[t("books.thBook")], [t("books.thValue"), 1], [t("books.thReturn"), 1], [t("books.thTrades"), 1], [t("books.thHolds")], [t("books.thCurve")]],
      b.books.map((x) => {
        const w = (Math.abs(x.return_pct) / maxAbs) * 50;
        const bar = `<span class="bar"><span style="${x.return_pct >= 0 ? "left:50%" : `left:${50 - w}%`};width:${w}%;background:${x.return_pct >= 0 ? "var(--up)" : "var(--down)"}"></span></span>`;
        const holds = x.holdings.length ? x.holdings.slice(0, 4).map((h) => esc(chainOf(h)[1])).join(", ") + (x.holdings.length > 4 ? " …" : "") : `<span class="dim">${esc(t("books.cash"))}</span>`;
        return `<tr><td class="strong"><span class="swatch" style="background:${flyColor(x.book)}"></span>${esc(bookLabel(x.book))}</td>
          <td class="r strong">${usd(x.value_usd)}</td><td class="r"><span class="${cls(x.return_pct)}">${pct(x.return_pct)}</span>${bar}</td>
          <td class="r">${nf(0).format(x.trades)}</td><td>${holds}</td><td>${spark((s.books[x.book] || []), flyColor(x.book))}</td></tr>`;
      }));

    // 04 positions
    const pos = b.positions || {};
    const names = b.books.map((x) => x.book).filter((n) => pos[n]);
    if (!posBook || !pos[posBook]) posBook = names.find((n) => pos[n].count) || names[0];
    $("pos-tabs").innerHTML = names.map((n) =>
      `<button type="button" role="tab" aria-selected="${n === posBook}" data-book="${esc(n)}">${esc(bookLabel(n))} <span class="dim">${pos[n].count}</span></button>`).join("");
    const P = pos[posBook];
    $("pos-cash").innerHTML = P ? `${esc(t("pos.cash"))}: <b>${usd(P.cash_usd)}</b>` : "";
    table("pos-tbl", [[t("pos.thSymbol")], [t("pos.thQty"), 1], [t("pos.thPrice"), 1], [t("pos.thValue"), 1], [t("pos.thPnl"), 1]],
      ((P && P.rows) || []).map((r) =>
        `<tr><td class="strong">${tok(r.symbol)}</td><td class="r">${qty(r.qty)} <span class="dim">@ ${usd(r.cost_usd)}</span></td>
         <td class="r">${price(r.price)}</td><td class="r strong">${usd(r.value_usd)}</td>
         <td class="r"><span class="${cls(r.pnl_pct)}">${pct(r.pnl_pct)}</span></td></tr>`),
      t("pos.empty"));

    // 06 tape
    table("tape-tbl", [[t("tape.thTime")], [t("tape.thBook")], [t("tape.thSide")], [t("tape.thToken")], [t("tape.thUsd"), 1]],
      (b.recent_trades || []).map((r) => {
        const sell = /sell|profit|arb|exercise/.test(r.side);
        return `<tr><td>${esc(time(r.at))}</td><td><span class="swatch" style="background:${flyColor(r.book)}"></span>${esc(bookLabel(r.book))}</td>
          <td class="${sell ? "up" : ""}">${esc(sideName(r.side))}</td><td class="strong">${tok(r.symbol)}</td><td class="r">${usd(r.usd)}</td></tr>`;
      }), t("tape.none"));
    renderChains(b.chains || {});

    // launches
    const launches = b.launches || [];
    $("launch-list").innerHTML = launches.length ? launches.slice().reverse().map((l) =>
      `<li><b>$${esc(l.symbol)}</b> ${esc(l.name)} <span class="dim">· ${esc(l.sent ? t("launch.sent") : t("launch.simulated"))} · ${esc(ago(new Date(l.at * 1000).toISOString()))}</span>` +
      (l.swarm ? `<br><span class="dim">${esc(l.swarm.wanted)}/${esc(l.swarm.of)} flies · ${esc(l.swarm.buzzing)} buzzing</span>` : "") + `</li>`).join("")
      : `<li class="empty">${esc(t("launch.none"))}</li>`;
  }


  // ------------------------------------------------------------------ the fly's eye
  // A replay of one fly's bar (engine.look_of): the tokens in its field of view as cards, the fly flying over them from
  // the quietest move to the loudest, the target and threat senses locking on, then the action that won - with sparks.
  const ACTS = ["turned", "buzzed", "groomed", "backed_up", "jumped"];
  const WON = { buy: "turned", take_profit: "groomed", sell: "backed_up", panic_sell: "jumped" };
  const STEP_MS = 520, LOCK_MS = 900, FLASH_MS = 1700, REST_MS = 2800;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const eye = { fly: null, idx: -1, t0: 0, raf: 0, auto: true, visible: true, key: "", sparks: [], sparked: "" };
  const cssv = (v) => getComputedStyle(document.body).getPropertyValue(v).trim() || "#7deaff";
  const rgba = (hex, a) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const flyOrder = (a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10);

  function looksBy() {
    const by = {};
    (board.looks || []).forEach((l) => (by["fly:" + l.fly] = by["fly:" + l.fly] || []).push(l));
    Object.values(by).forEach((a) => a.sort((x, y) => x.bar - y.bar));
    return by;
  }

  function cardsOf(l) {
    const seen = l.seen || {};
    const must = [l.symbol, l.target && l.target.symbol, l.threat && l.threat.symbol].concat(l.held || []).filter(Boolean);
    const rest = Object.keys(seen).filter((s) => must.indexOf(s) < 0).sort((a, b) => Math.abs(seen[b]) - Math.abs(seen[a]));
    return [...new Set(must.concat(rest))].slice(0, 10).sort((a, b) => a.localeCompare(b))
      .map((s) => ({ sym: s, z: seen[s] == null ? null : seen[s] }));
  }

  function layout(cards, W, H) {
    const n = cards.length;
    const cols = W < 520 ? 2 : n <= 4 ? Math.max(1, n) : n <= 6 ? 3 : n <= 8 ? 4 : 5;
    const rows = Math.ceil(n / cols);
    const pad = Math.max(12, W * 0.03), gap = Math.max(10, W * 0.016);
    const band = Math.max(46, Math.min(22, W / 40) + 30);     // a strip at the top for the decision banner
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const ch = Math.min((H - band - pad - gap * (rows - 1)) / rows, cw * 0.62);
    const top = band + (H - band - pad - (ch * rows + gap * (rows - 1))) / 2;
    cards.forEach((c, i) => {
      const r = Math.floor(i / cols), k = i % cols, inRow = Math.min(cols, n - r * cols);
      const left = (W - (cw * inRow + gap * (inRow - 1))) / 2;
      Object.assign(c, { x: left + k * (cw + gap), y: top + r * (ch + gap), w: cw, h: ch });
    });
  }

  function script(l, cards) {
    const by = {};
    cards.forEach((c) => (by[c.sym] = c));
    const scan = cards.filter((c) => c.z != null).slice().sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
    const traded = !!l.symbol && l.action !== "hold" && l.action !== "skipped";
    const focus = by[l.symbol] || by[(l.target || {}).symbol] || scan[scan.length - 1] || cards[0];
    const path = scan.filter((c) => c !== focus).concat(focus ? [focus] : []);
    return { path, focus, traded };
  }

  // the cursor is a fly: body, head, two buzzing wings; it faces where it is flying
  function drawFly(ctx, x, y, ang, now, buzz, ink, accent, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(scale, scale);
    const flap = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / (buzz ? 18 : 45));
    ctx.fillStyle = rgba(accent, 0.22 + 0.25 * flap);
    ctx.strokeStyle = rgba(accent, 0.7);
    ctx.lineWidth = 1;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.rotate(side * (0.35 + 0.55 * flap));
      ctx.beginPath(); ctx.ellipse(-5, side * 7, 9, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    ctx.fillStyle = "#1a2029"; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(-2, 0, 8, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(7.5, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff5b4f";
    ctx.beginPath(); ctx.arc(8.6, -2.1, 1.5, 0, Math.PI * 2); ctx.arc(8.6, 2.1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.06 + Math.random() * 0.22;
      eye.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, t0: performance.now(), life: 700 + Math.random() * 700, color });
    }
  }

  function drawEye(now) {
    eye.raf = 0;
    const cv = $("room");
    if (!cv || !board) return;
    const list = looksBy()[eye.fly] || [];
    const l = list[eye.idx];
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050609"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(157,171,183,.07)";
    for (let x = 13; x < W; x += 26) for (let y = 13; y < H; y += 26) ctx.fillRect(x, y, 1, 1);
    const MONO = cssv("--mono") || "monospace";
    const accent = cssv("--accent"), amber = cssv("--amber"), down = cssv("--down"), up = cssv("--up"), fly = cssv("--s-fly");
    const ink = cssv("--ink"), dim = cssv("--ink-dim"), line2 = cssv("--line-2");
    if (!l) {
      ctx.fillStyle = cssv("--ink-faint"); ctx.font = "13px " + MONO; ctx.textAlign = "center";
      ctx.fillText(t("eye.none"), W / 2, H / 2);
      renderActs({ acts: [] }, false);
      return;
    }
    const cards = cardsOf(l);
    layout(cards, W, H);
    const sc = script(l, cards);
    const el = reduced ? 1e9 : now - eye.t0;
    const scanEnd = sc.path.length * STEP_MS, flashAt = scanEnd + LOCK_MS;
    const center = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
    const step = Math.max(0, Math.min(sc.path.length - 1, Math.floor(el / STEP_MS)));
    let cur = sc.path.length ? center(sc.path[step]) : { x: W / 2, y: H / 2 }, ang = 0, moving = false;
    if (el < scanEnd && step > 0) {
      const k = Math.min(1, (el - step * STEP_MS) / (STEP_MS * 0.62)), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const a = center(sc.path[step - 1]), b = center(sc.path[step]);
      // a little arc, like a fly and not a mouse
      const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.18, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18;
      cur = { x: (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * mx + e * e * b.x, y: (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * my + e * e * b.y };
      ang = Math.atan2(b.y - a.y, b.x - a.x);
      moving = k < 1;
    } else if (!reduced) {                              // hovering: a small idle wobble
      cur = { x: cur.x + Math.sin(now / 260) * 2.2, y: cur.y + Math.cos(now / 340) * 1.6 };
      ang = Math.sin(now / 900) * 0.25 - Math.PI / 2;
    }
    const visited = new Set(sc.path.slice(0, step + 1).map((c) => c.sym));
    const lockK = reduced ? 1 : Math.max(0, Math.min(1, (el - scanEnd) / 350));
    const tSym = (l.target || {}).symbol, thSym = (l.threat || {}).symbol;
    const fs = Math.max(12, Math.min(20, cards[0] ? cards[0].w * 0.105 : 14)), small = Math.max(10, fs * 0.64);
    cards.forEach((c) => {
      const isT = lockK > 0 && c.sym === tSym && (l.target.amount || 0) > 0;
      const isTh = lockK > 0 && c.sym === thSym && (l.threat.amount || 0) > 0;
      const here = c === sc.path[step] && el < flashAt + FLASH_MS;
      ctx.fillStyle = here ? "#141a24" : visited.has(c.sym) ? "#10141b" : "#0b0e13";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      if (isT || isTh) {                                // a lock-on pulse
        const col = isT ? accent : down, pulse = reduced ? 0 : (Math.sin(now / 160) + 1) / 2;
        ctx.shadowColor = rgba(col, .6); ctx.shadowBlur = 10 + 10 * pulse * lockK;
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.strokeRect(c.x + .5, c.y + .5, c.w - 1, c.h - 1);
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = here ? rgba(accent, .5) : line2; ctx.lineWidth = 1;
        ctx.strokeRect(c.x + .5, c.y + .5, c.w - 1, c.h - 1);
      }
      const p = Math.max(9, c.w * 0.06);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.font = "700 " + fs + "px " + MONO; ctx.fillStyle = ink;
      ctx.fillText(c.sym.length > 10 ? c.sym.slice(0, 9) + "…" : c.sym, c.x + p, c.y + p + fs * 0.85);
      if ((l.held || []).indexOf(c.sym) >= 0) {
        ctx.font = "600 " + (small - 1) + "px " + MONO;
        const word = t("eye.held").toUpperCase(), tw = ctx.measureText(word).width;
        ctx.strokeStyle = rgba(fly, .9); ctx.lineWidth = 1;
        ctx.strokeRect(c.x + c.w - p - tw - 8 + .5, c.y + p + .5, tw + 8, small + 5);
        ctx.fillStyle = ink; ctx.fillText(word, c.x + c.w - p - tw - 4, c.y + p + small + .5);
      }
      if (c.z != null && visited.has(c.sym)) {
        ctx.font = "500 " + small + "px " + MONO;
        ctx.fillStyle = c.z > 0.05 ? up : c.z < -0.05 ? down : dim;
        ctx.fillText((c.z > 0 ? "▲ +" : c.z < 0 ? "▼ " : "") + c.z.toFixed(2) + "σ", c.x + p, c.y + c.h - p);
        const bw = Math.min(1, Math.abs(c.z) / 4) * (c.w - p * 2);
        ctx.fillStyle = rgba(c.z >= 0 ? up : down, .4);
        ctx.fillRect(c.x + p, c.y + c.h - p - small - 8, bw, 3);
      }
      if (isT || isTh) {
        ctx.font = "700 " + (small - 1) + "px " + MONO; ctx.fillStyle = isT ? accent : down;
        ctx.globalAlpha = lockK;
        ctx.fillText((isT ? "◎ " + t("eye.target") : "⚠ " + t("eye.threat")).toUpperCase(), c.x + p, c.y + p + fs + small + 8);
        ctx.globalAlpha = 1;
      }
    });
    // the flight trail: a dotted path of where it has been
    ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(fly, .55); ctx.lineWidth = 1.4; ctx.beginPath();
    sc.path.slice(0, step + 1).forEach((c, i) => { const q = center(c); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    if (moving) ctx.lineTo(cur.x, cur.y);
    ctx.stroke(); ctx.setLineDash([]);
    // the eye window
    const ew = cards[0] ? cards[0].w * 1.1 : 120, eh = cards[0] ? cards[0].h * 1.14 : 80;
    const ex = cur.x - ew / 2, ey = cur.y - eh / 2;
    const flashing = el >= flashAt && el < flashAt + FLASH_MS;
    ctx.strokeStyle = flashing ? rgba(amber, .95) : rgba(accent, .45); ctx.lineWidth = 1;
    ctx.strokeRect(ex + .5, ey + .5, ew, eh);
    const kk = Math.min(12, ew * .08); ctx.lineWidth = 2; ctx.beginPath();
    [[ex, ey, 1, 1], [ex + ew, ey, -1, 1], [ex, ey + eh, 1, -1], [ex + ew, ey + eh, -1, -1]].forEach((q) => {
      ctx.moveTo(q[0] + q[2] * kk, q[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(q[0], q[1] + q[3] * kk); });
    ctx.stroke();
    // the decision: rings, sparks and the word
    if (el >= flashAt) {
      const kf = Math.min(1, (el - flashAt) / FLASH_MS), e = 1 - Math.pow(1 - kf, 2);
      const col = !sc.traded ? dim : l.action === "buy" ? up : amber;
      if (sc.traded && eye.sparked !== eye.key && !reduced) { eye.sparked = eye.key; burst(cur.x, cur.y, col, 34); }
      if (!reduced && kf < 1) {
        ctx.strokeStyle = rgba(col, 1 - kf); ctx.lineWidth = 3 - 2 * kf;
        ctx.beginPath(); ctx.arc(cur.x, cur.y, 12 + 70 * e, 0, Math.PI * 2); ctx.stroke();
        if (sc.traded) { ctx.strokeStyle = rgba(ink, (1 - kf) * .7); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cur.x, cur.y, 12 + 110 * e, 0, Math.PI * 2); ctx.stroke(); }
      }
      // the decision as a banner above the cards, with a thin lead to the card it is about
      const word = decisionWord(l);
      const pop = reduced ? 1 : Math.min(1, (el - flashAt) / 220);
      const size = Math.max(14, Math.min(22, W / 40)) * (0.75 + 0.25 * pop);
      ctx.font = "800 " + size + "px " + MONO;
      const tw = ctx.measureText(word).width;
      const top = Math.min(...cards.map((q) => q.y));
      const bx = W / 2 - tw / 2, by = Math.max(size + 6, (top - size) / 2 + size - 2);
      if (sc.focus) {
        ctx.strokeStyle = rgba(col, .45); ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath();
        ctx.moveTo(W / 2, by + 8); ctx.lineTo(cur.x, sc.focus.y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = "rgba(5,6,9,.92)"; ctx.fillRect(bx - 12, by - size - 2, tw + 24, size + 12);
      ctx.strokeStyle = rgba(col, .85); ctx.lineWidth = 1.2; ctx.strokeRect(bx - 11.5, by - size - 1.5, tw + 23, size + 11);
      ctx.fillStyle = col; ctx.textAlign = "left"; ctx.fillText(word, bx, by + 2);
    }
    // sparks
    eye.sparks = eye.sparks.filter((sp) => now - sp.t0 < sp.life);
    eye.sparks.forEach((sp) => {
      const dt = now - sp.t0, k = dt / sp.life;
      ctx.fillStyle = rgba(sp.color, 1 - k);
      ctx.fillRect(sp.x + sp.vx * dt, sp.y + sp.vy * dt + 0.00012 * dt * dt, 2.4, 2.4);
    });
    drawFly(ctx, cur.x, cur.y, ang, now, moving, ink, accent, Math.max(1.3, Math.min(2.4, (cards[0] ? cards[0].w : 200) / 110)));
    cv.setAttribute("aria-label", eyeCaption(l));
    renderActs(l, el >= scanEnd);
    const done = el >= flashAt + FLASH_MS && !eye.sparks.length;
    if (eye.visible && !reduced) eye.raf = requestAnimationFrame(drawEye);   // keeps hovering and buzzing
    if (done && eye.auto && !eye.queued) {
      eye.queued = true;
      clearTimeout(eye.next);
      eye.next = setTimeout(() => { eye.queued = false; if (eye.auto) nextFly(); }, REST_MS);
    }
  }

  function sideName(sd) { const k = "tape.side." + sd; const v = t(k); return v === k || v === "desk." + k ? String(sd).replace(/_/g, " ") : v; }
  function decisionWord(l) {
    const side = (a) => sideName(a).toUpperCase();
    if (l.action === "skipped") return t("eye.passed", { what: side(l.wanted || "buy"), sym: l.symbol || "" }).toUpperCase();
    if (!l.symbol || l.action === "hold") return t("eye.hold").toUpperCase();
    return side(l.action) + " " + l.symbol + (l.usd ? " · " + usd(l.usd) : "");
  }
  function eyeCaption(l) {
    const top = (l.acts || []).slice().sort((a, b) => b.z - a.z)[0];
    const lead = bookLabel("fly:" + l.fly) + " · " + time(l.at) + " · ";
    if (!top) return lead + t("eye.capQuiet");
    const what = t("eye.capFired", { act: t("eye.act." + top.key), z: top.z.toFixed(1) });
    if (l.action === "skipped") return lead + what + " — " + t("eye.capSkipped", { why: l.why || "" });
    if (!l.symbol || l.action === "hold") return lead + what + " — " + t("eye.capHeld");
    return lead + what + " → " + sideName(l.action) + " " + l.symbol + (l.usd ? " (" + usd(l.usd) + ")" : "");
  }

  function renderActs(l, show) {
    const z = {};
    (l.acts || []).forEach((a) => (z[a.key] = a.z));
    const won = WON[l.action] || (l.action === "skipped" ? WON[l.wanted] : null);
    const k = eye.key + ":" + show;
    const box = $("acts");
    if (box.dataset.k === k) return;
    box.dataset.k = k;
    box.innerHTML = ACTS.map((key) => {
      const v = z[key];
      const w = show && v != null ? Math.min(100, (v / 8) * 100) : 0;
      return `<div class="act${v != null && show ? " fired" : ""}${show && key === won ? " won" : ""}"><div class="nm"><span>${esc(t("eye.act." + key))}</span><b>${v != null && show ? v.toFixed(1) + "σ" : ""}</b></div><div class="meter"><span style="width:${w}%"></span></div></div>`;
    }).join("");
  }

  function playEye(restart) {
    const by = looksBy();
    const flies = Object.keys(by).sort(flyOrder);
    if (!eye.fly || !by[eye.fly]) eye.fly = flies[0] || null;
    const list = by[eye.fly] || [];
    if (eye.idx < 0 || eye.idx >= list.length) eye.idx = list.length - 1;
    const l = list[eye.idx];
    const key = l ? eye.fly + ":" + l.bar : "";
    $("eye-flies").innerHTML = flies.map((f) =>
      `<button type="button" role="tab" aria-selected="${f === eye.fly}" data-eyefly="${esc(f)}"><span class="swatch" style="background:${flyColor(f)}"></span>${esc(bookLabel(f))}</button>`).join("");
    $("eye-bar").textContent = l ? time(l.at) : "—";
    $("eye-prev").disabled = eye.idx <= 0;
    $("eye-next").disabled = eye.idx >= list.length - 1;
    $("eye-caption").textContent = l ? eyeCaption(l) : "";
    if (restart || key !== eye.key) { eye.key = key; eye.t0 = performance.now(); eye.queued = false; }
    cancelAnimationFrame(eye.raf);
    eye.raf = requestAnimationFrame(drawEye);
  }
  function nextFly() {
    const flies = Object.keys(looksBy()).sort(flyOrder);
    if (!flies.length) return;
    eye.fly = flies[(flies.indexOf(eye.fly) + 1) % flies.length];
    eye.idx = -1;
    playEye(true);
  }
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-eyefly]");
    const hit = f || e.target.closest("#eye-prev, #eye-next, #eye-play");
    if (!hit || !board) return;
    eye.auto = hit.id === "eye-play" ? eye.auto : false;
    clearTimeout(eye.next); eye.queued = false;
    if (f) { eye.fly = f.dataset.eyefly; eye.idx = -1; }
    else if (hit.id === "eye-prev") eye.idx = Math.max(0, eye.idx - 1);
    else if (hit.id === "eye-next") eye.idx += 1;
    playEye(true);
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => es.forEach((en) => {
      eye.visible = en.isIntersecting;
      cancelAnimationFrame(eye.raf);
      if (eye.visible && board) eye.raf = requestAnimationFrame(drawEye);
    })).observe(document.getElementById("eye"));
  }

  // ------------------------------------------------------------------ the ticker (the latest fills, scrolling)
  function renderTicker() {
    const box = $("ticker");
    if (!box) return;
    const rows = (board.recent_trades || []).slice(0, 16);
    if (!rows.length) { box.hidden = true; return; }
    const item = (r) => {
      const buy = r.side === "buy";
      return `<span class="tk"><span class="swatch" style="background:${flyColor(r.book)}"></span>${esc(bookLabel(r.book))} <b class="${buy ? "up" : "amber"}">${esc(sideName(r.side))}</b> ${tok(r.symbol)} <span class="dim">${usd(r.usd)}</span></span>`;
    };
    const html = rows.map(item).join("");
    const k = rows.map((r) => r.at + r.symbol).join("|");
    if (box.dataset.k === k) return;
    box.dataset.k = k;
    box.hidden = false;
    box.innerHTML = `<div class="tk-track">${html}${html}</div>`;
  }

  // ------------------------------------------------------------------ loop
  async function tick() {
    try {
      board = await fetchBoard();
      curve = series(board);
      $("err").hidden = true;
      render();
      renderTicker();
      playEye(false);
    } catch (e) {
      $("err").hidden = false;
      $("conn").dataset.state = "offline";
      $("conn-text").textContent = t("chip.offline");
    }
  }

  document.addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]");
    if (z) {
      zoom = z.dataset.zoom;
      document.querySelectorAll("[data-zoom]").forEach((b) => b.classList.toggle("on", b === z));
      if (board) drawChart($("chart"), curve, starts());
    }
    const tab = e.target.closest("#pos-tabs [data-book]");
    if (tab) { posBook = tab.dataset.book; render(); }
  });
  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (board) { drawChart($("chart"), curve, starts()); eye.sparks = []; } }, 120); });

  async function start() {
    if (!window.flyI18n) {
      try { en = await (await fetch("assets/i18n/en/desk.json")).json(); } catch { en = {}; }
    }
    await tick();
    setInterval(tick, REFRESH_MS);
  }
  if (window.flyI18n) start();
  else {
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    window.addEventListener("i18n:ready", go, { once: true });
    setTimeout(go, 2500);
  }
})();
