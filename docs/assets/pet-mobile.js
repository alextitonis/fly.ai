/* Fly Pet on phones (docs/pet-mobile.html, 2026-11-16): the install / sign-in / notifications steps, the chat button and
   the latest alpha calls. Notifications: the browser's push subscription goes to the mine server (mine/src/push.ts) with
   the site session; pet-sw.js shows what it sends. All the words are in the page (data-i18n); this only shows and hides. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var nav = function () { return window.flyNav || {}; };
  var API = function () { return nav().MINE_API || "https://flyai-mine.fly.dev"; };
  var READ = function () { return nav().MINE_READ || API(); };
  var session = function () { try { return nav().session ? nav().session() : null; } catch (e) { return null; } };
  var show = function (id, on) { var el = $(id); if (el) el.hidden = !on; };
  var word = function (id) { var el = $(id); return el ? el.textContent : ""; };
  var msg = function (id) { $("pu-msg").textContent = id ? word(id) : ""; };

  var ua = navigator.userAgent || "";
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  // a wallet's own browser (MetaMask, Trust, OKX, Binance, Coinbase...): no Add to Home Screen, no push
  var inApp = /MetaMask|Trust|TokenPocket|OKApp|OKEx|Bitget|BitKeep|Binance|CoinbaseWallet|Phantom|Rabby|imToken|SafePal|FBAN|FBAV|Instagram|Line\//i.test(ua)
    || (ios && !/Safari/.test(ua) && !standalone);
  var pushable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // ---- step 1: install
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; show("in-btn", true); });
  window.addEventListener("appinstalled", function () { standalone = true; render(); });
  $("in-btn").addEventListener("click", function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function () { deferred = null; show("in-btn", false); });
  });
  $("in-copy").addEventListener("click", function () {
    var url = location.origin + "/pet-mobile";
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
      $("in-copy").textContent = "✓ " + url;
    }).catch(function () { prompt("Copy:", url); });
  });

  // ---- step 3: notifications
  var reg = null, sub = null, prefs = null;
  function headers() {
    var s = session();
    return { "content-type": "application/json", "x-flyai-session": s ? s.token : "" };
  }
  function post(path, body) {
    return fetch(API() + path, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j; });
    });
  }
  function keyBytes(b64) {
    var s = (b64 + "===".slice((b64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function getReg() {
    if (reg) return Promise.resolve(reg);
    return navigator.serviceWorker.register("/pet-sw.js", { scope: "/pet-mobile" }).then(function (r) { reg = r; return navigator.serviceWorker.ready.then(function () { return r; }); });
  }
  function loadSub() {
    if (!pushable || !session()) return Promise.resolve(null);
    return getReg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (s) {
      sub = s;
      if (!s) { prefs = null; return null; }
      return post("/api/push/me", { endpoint: s.endpoint }).then(function (j) { prefs = j.subscribed ? j.prefs : null; return s; });
    }).catch(function () { return null; });
  }
  function turnOn() {
    msg("");
    fetch(READ() + "/api/push/key").then(function (r) { return r.json(); }).then(function (k) {
      if (!k.key) { msg("t-serveroff"); throw null; }
      return Notification.requestPermission().then(function (p) {
        if (p !== "granted") { render(); throw null; }
        return getReg().then(function (r) {
          return r.pushManager.getSubscription().then(function (old) {
            return old || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) });
          });
        });
      });
    }).then(function (s) {
      sub = s;
      return post("/api/push/subscribe", { sub: s.toJSON(), prefs: prefs || undefined });
    }).then(function (j) { prefs = j.prefs; msg("t-saved"); render(); })
      .catch(function (e) { if (e) msg("t-fail"); render(); });
  }
  function turnOff() {
    if (!sub) return;
    var endpoint = sub.endpoint;
    sub.unsubscribe().catch(function () {}).then(function () { return post("/api/push/unsubscribe", { endpoint: endpoint }).catch(function () {}); })
      .then(function () { sub = null; prefs = null; msg("t-offmsg"); render(); });
  }
  $("pu-on").addEventListener("click", turnOn);
  $("pu-off").addEventListener("click", turnOff);
  $("pu-test").addEventListener("click", function () {
    if (!sub) return;
    post("/api/push/test", { endpoint: sub.endpoint }).then(function (j) { msg(j.ok ? "t-sent" : "t-fail"); }).catch(function () { msg("t-fail"); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("#pu-set input[data-kind]"), function (box) {
    box.addEventListener("change", function () {
      if (!sub || !prefs) return;
      var next = Object.assign({}, prefs); next[box.dataset.kind] = box.checked;
      post("/api/push/prefs", { endpoint: sub.endpoint, prefs: next }).then(function (j) { prefs = j.prefs; msg("t-saved"); })
        .catch(function () { box.checked = !box.checked; msg("t-fail"); });
    });
  });

  // ---- step 4: chat (the site's own messenger); ?chat=<fly> from a notification opens that fly's
  $("ch-open").addEventListener("click", function () { if (nav().chat) nav().chat(); });

  // ---- the alpha calls
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(n) { return n == null ? "" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "k" : "$" + Math.round(n); }
  fetch(READ() + "/api/pet/alpha").then(function (r) { return r.json(); }).then(function (j) {
    var calls = (j.calls || []).slice(0, 8);
    $("al-list").innerHTML = calls.length ? calls.map(function (c) {
      var chart = "https://dexscreener.com/" + encodeURIComponent(c.chain || "") + "/" + encodeURIComponent(c.ca || "");
      return '<div class="pm-call"><b>' + esc(c.symbol) + '</b><small>' + esc(c.chain) + (c.mcap ? " · mcap " + money(c.mcap) : "") + "</small>"
        + "<div>" + esc(c.head) + '</div><small><a href="' + chart + '" target="_blank" rel="noopener">Chart</a> · ' + new Date(c.at).toLocaleString() + "</small></div>";
    }).join("") : '<p class="fine">—</p>';
  }).catch(function () { $("al-list").innerHTML = '<p class="fine">—</p>'; });

  // ---- the steps' state
  function render() {
    var s = session();
    var installed = standalone;
    show("in-done", installed);
    show("in-inapp", !installed && inApp);
    show("in-ios", !installed && !inApp && ios);
    show("in-android", !installed && !inApp && android);
    show("in-desktop", !installed && !inApp && !ios && !android);
    $("st-install").classList.toggle("done", installed);

    show("sg-out", !s); show("sg-btn", !s); show("sg-in", !!s);
    if (s) $("sg-who").textContent = s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4);
    $("st-sign").classList.toggle("done", !!s);

    var perm = pushable ? Notification.permission : "unsupported";
    var on = !!(sub && prefs);
    show("pu-need", !s);
    show("pu-nosupport", !!s && !pushable);
    show("pu-blocked", !!s && pushable && perm === "denied");
    show("pu-on", !!s && pushable && perm !== "denied" && !on);
    show("pu-set", !!s && on);
    if (on) Array.prototype.forEach.call(document.querySelectorAll("#pu-set input[data-kind]"), function (b) { b.checked = !!prefs[b.dataset.kind]; });
    $("st-push").classList.toggle("done", on);
    $("st-chat").classList.toggle("done", false);
  }
  window.addEventListener("flyai-session", function () { loadSub().then(render); });
  loadSub().then(function () {
    render();
    var c = new URLSearchParams(location.search).get("chat");
    if (c && session() && nav().chat) nav().chat(Number(c) || undefined);
  });
  render();
})();
