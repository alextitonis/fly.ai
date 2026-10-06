/*
 * The market's mood, in one strip (2026-10-06, the user: "an overall market condition bar on both the fly desk and
 * trader flies like coinmarketcap, to show that the market is red"): the whole crypto market's 24 h change, BTC, ETH,
 * Fear & Greed, $FLYAI and whether US stocks (the stock tokens the flies trade) are open. Used by the Fly Desk
 * (desk.js) and Trader Flies (flytrade/web, src/MarketBar.tsx):
 *
 *   window.flyMarketBar.mount(el, t)   t(key) -> text, or a falsy value for the English below
 *
 * Free public APIs, read from the browser: CoinGecko (global + simple/price), alternative.me (Fear & Greed),
 * DexScreener ($FLYAI). Refreshed every REFRESH_MS while the page is visible; the last answer is kept in
 * localStorage so a reload shows it at once.
 */
(function () {
  "use strict";
  var REFRESH_MS = 120000;
  var KEEP = "flyai.marketbar.v1";
  var FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
  var RED_PCT = -1, GREEN_PCT = 1;                       // the whole market's 24 h move that reads as red / green
  var EN = {
    label: "Market",
    red: "Market is red: most of crypto is down today",
    green: "Market is green: most of crypto is up today",
    flat: "Market is flat today",
    crypto: "Crypto 24h",
    fngLabel: "Fear & Greed",
    stocks: "US stocks",
    open: "open",
    closed: "closed",
    "fng.extremeFear": "Extreme fear",
    "fng.fear": "Fear",
    "fng.neutral": "Neutral",
    "fng.greed": "Greed",
    "fng.extremeGreed": "Extreme greed",
  };

  function getJSON(url) {
    return fetch(url, { headers: { accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function load() {
    var parts = [
      getJSON("https://api.coingecko.com/api/v3/global").then(function (j) {
        var d = j.data || {};
        return { cap: (d.total_market_cap || {}).usd, capPct: d.market_cap_change_percentage_24h_usd };
      }),
      getJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true")
        .then(function (j) {
          return { btc: (j.bitcoin || {}).usd, btcPct: (j.bitcoin || {}).usd_24h_change,
                   eth: (j.ethereum || {}).usd, ethPct: (j.ethereum || {}).usd_24h_change };
        }),
      getJSON("https://api.alternative.me/fng/?limit=1").then(function (j) {
        var r = (j.data || [])[0] || {};
        return { fng: Number(r.value), fngClass: r.value_classification };
      }),
      getJSON("https://api.dexscreener.com/latest/dex/tokens/" + FLYAI).then(function (j) {
        var best = (j.pairs || []).sort(function (a, b) {
          return ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0);
        })[0];
        return best ? { flyai: Number(best.priceUsd), flyaiPct: (best.priceChange || {}).h24 } : {};
      }),
    ];
    return Promise.allSettled(parts).then(function (got) {
      var out = {};
      got.forEach(function (g) { if (g.status === "fulfilled") Object.assign(out, g.value); });
      return out;
    });
  }

  // NYSE regular hours, 9:30-16:00 New York time on weekdays (holidays not known here)
  function usOpen(now) {
    var ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    var day = ny.getDay(), mins = ny.getHours() * 60 + ny.getMinutes();
    return day >= 1 && day <= 5 && mins >= 570 && mins < 960;
  }

  function pct(v) {
    if (v == null || !isFinite(v)) return "—";
    return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  }
  function tone(v) { return v == null || !isFinite(v) ? "" : v > 0.05 ? "up" : v < -0.05 ? "down" : ""; }
  function money(v) {
    if (v == null || !isFinite(v)) return "—";
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (v >= 1) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
    return "$" + v.toPrecision(3);
  }
  function fngKey(c) {
    var k = String(c || "").toLowerCase();
    return k === "extreme fear" ? "fng.extremeFear" : k === "fear" ? "fng.fear" : k === "neutral" ? "fng.neutral"
      : k === "greed" ? "fng.greed" : k === "extreme greed" ? "fng.extremeGreed" : null;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function render(el, m, say) {
    var mood = m.capPct == null ? null : m.capPct <= RED_PCT ? "red" : m.capPct >= GREEN_PCT ? "green" : "flat";
    var fk = fngKey(m.fngClass);
    var open = usOpen(new Date());
    var cell = function (name, value, change) {
      if (value === "—") return "";                       // a source that didn't answer: no empty cell
      return '<span class="mb-cell"><span class="mb-k">' + esc(name) + '</span> <b class="mb-v">' + esc(value) + "</b>" +
        (change === undefined ? "" : ' <span class="mb-c ' + tone(change) + '">' + esc(pct(change)) + "</span>") + "</span>";
    };
    el.dataset.mood = mood || "unknown";
    el.innerHTML =
      (mood ? '<span class="mb-mood"><i class="mb-dot"></i>' + esc(say(mood)) + "</span>" : "") +
      '<span class="mb-cells">' +
      cell(say("crypto"), money(m.cap), m.capPct) +
      cell("BTC", money(m.btc), m.btcPct) +
      cell("ETH", money(m.eth), m.ethPct) +
      (isFinite(m.fng) ? '<span class="mb-cell"><span class="mb-k">' + esc(say("fngLabel")) + '</span> <b class="mb-v ' +
        (m.fng < 45 ? "down" : m.fng > 55 ? "up" : "") + '">' + m.fng + "</b>" +
        (fk ? ' <span class="mb-c">' + esc(say(fk)) + "</span>" : "") + "</span>" : "") +
      cell("$FLYAI", money(m.flyai), m.flyaiPct) +
      '<span class="mb-cell"><span class="mb-k">' + esc(say("stocks")) + '</span> <b class="mb-v ' + (open ? "up" : "") +
        '">' + esc(say(open ? "open" : "closed")) + "</b></span>" +
      "</span>";
    el.hidden = false;
  }

  function mount(el, t) {
    if (!el || el.dataset.mounted) return;
    el.dataset.mounted = "1";
    el.classList.add("marketbar");
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", (t && t("label")) || EN.label);
    // a missing string comes back as its own key (e.g. "desk.market.red"): the English then
    var say = function (k) { var v = t && t(k); return v && v.indexOf("market." + k) < 0 ? v : EN[k] || k; };
    var last = null;
    try { last = JSON.parse(localStorage.getItem(KEEP) || "null"); } catch (e) { last = null; }
    if (last && last.m) render(el, last.m, say); else el.hidden = true;
    var busy = false;
    var tick = function () {
      if (busy || document.visibilityState === "hidden") return;
      if (last && Date.now() - last.at < REFRESH_MS - 1000) return;
      busy = true;
      load().then(function (m) {
        if (!Object.keys(m).length) return;
        last = { at: Date.now(), m: m };
        try { localStorage.setItem(KEEP, JSON.stringify(last)); } catch (e) { /* private mode */ }
        render(el, m, say);
      }).catch(function () { /* keep what is shown */ }).then(function () { busy = false; });
    };
    tick();
    setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
  }

  window.flyMarketBar = { mount: mount };
})();
