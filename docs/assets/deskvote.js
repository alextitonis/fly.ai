/**
 * The holder vote on the Fly Desk (desk.html #vote; the desk's votes.py): $FLYAI holders pick tomorrow's trading
 * mode. The wallet signs a plain message (personal_sign, no gas); the desk checks it, weighs the vote by the wallet's
 * $FLYAI in dollars, and at 00:00 UTC the mode with the most dollars behind it trades the next day.
 */
(function () {
  "use strict";
  const API = new URLSearchParams(location.search).get("voteapi") || "https://flytrade-desk.fly.dev";   // ?voteapi= local testing
  const REFRESH_MS = 30_000;
  const $ = (id) => document.getElementById(id);
  if (!$("vote")) return;

  let en = null;
  const pick = (o, k) => k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), o);
  function t(key, vars) {
    if (window.flyI18n) return window.flyI18n.t("desk.vote." + key, vars);
    let v = pick(en, "vote." + key);
    if (v && typeof v === "object") v = vars && vars.count === 1 ? v.one : v.other;
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  }
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (x) => "$" + new Intl.NumberFormat(lang(), { maximumFractionDigits: x >= 100 ? 0 : 2 }).format(x || 0);
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const MODES = ["safe", "balanced", "risky"];

  let data = null;       // GET /public/votes.json
  let wallet = null;
  let mine = null;       // this wallet's vote today (this browser)
  let busy = false;

  function msg(text, kind) {
    const el = $("vote-msg");
    el.textContent = text || "";
    el.dataset.kind = kind || "";
  }

  // what each mode changes, when the desk does not say (votes.json "presets" carries the live numbers)
  const PRESETS = {
    safe: { buy: 0.5, pool: 100000, stop: 6, tp: 15 },
    balanced: { buy: 1, pool: 50000, stop: 10, tp: 25 },
    risky: { buy: 1.5, pool: 25000, stop: 15, tp: 40 },
  };
  const ICON = {
    safe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 4 5.6v6.1c0 4.9 3.3 8.6 8 9.8 4.7-1.2 8-4.9 8-9.8V5.6L12 2.5Z"/><path d="m8.6 12 2.4 2.4 4.6-4.8"/></svg>',
    balanced: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/><circle cx="12" cy="17" r="1.4"/></svg>',
    risky: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6c.6 3.2 4.9 5.4 4.9 10.3a4.9 4.9 0 0 1-9.8 0c0-2 .9-3.4 2-4.5.2 1.6 1 2.6 2 3 0-3.2-.2-5.9.9-8.8Z"/></svg>',
  };
  const kusd = (x) => "$" + new Intl.NumberFormat(lang(), { notation: "compact", maximumFractionDigits: 0 }).format(x);
  const mult = (x) => new Intl.NumberFormat(lang(), { maximumFractionDigits: 2 }).format(x) + "×";
  function countdown(iso) {
    const s = Math.max(0, (Date.parse(iso) - Date.now()) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  function render() {
    if (!data) return;
    const tally = data.tally || { usd: {}, voters: {} };
    const total = MODES.reduce((s, m) => s + (tally.usd[m] || 0), 0);
    const wallets = MODES.reduce((s, m) => s + (tally.voters[m] || 0), 0);
    const lead = total ? MODES.reduce((a, m) => ((tally.usd[m] || 0) > (tally.usd[a] || 0) ? m : a), "balanced") : null;
    const today = data.today.mode;
    $("vote-status").innerHTML =
      `<span class="vs-now" data-mode="${esc(today)}"><span class="vs-ico">${ICON[today] || ""}</span>
         <span><span class="vs-k">${esc(t("todayLabel"))}</span><b>${esc(t(today))}</b></span></span>
       <span class="vs-facts">
         <span><span class="vs-k">${esc(t("closesIn"))}</span><b class="mono" id="vote-cd">${countdown(data.closes_at)}</b></span>
         <span><span class="vs-k">${esc(t("pooled"))}</span><b class="mono">${total ? usd(total) : "—"}</b></span>
         <span><span class="vs-k">${esc(t("walletsLabel"))}</span><b class="mono">${wallets}</b></span>
       </span>`;
    $("vote-split").innerHTML = total
      ? MODES.map((m) => { const p = (100 * (tally.usd[m] || 0)) / total; return p ? `<i data-mode="${m}" style="flex:${p}"></i>` : ""; }).join("")
      : `<span class="vs-empty">${esc(t("empty"))}</span>`;
    $("vote-split").classList.toggle("is-empty", !total);
    const pre = data.presets || PRESETS;
    $("vote-cards").innerHTML = MODES.map((m) => {
      const u = tally.usd[m] || 0, n = tally.voters[m] || 0;
      const share = total ? Math.round((100 * u) / total) : 0;
      const on = mine === m;
      const p = pre[m] || PRESETS[m];
      const chips = [[t("chipBuy"), mult(p.buy)], [t("chipPool"), kusd(p.pool) + "+"],
                     [t("chipStop"), "-" + p.stop + "%"], [t("chipTp"), "+" + p.tp + "%"]];
      return `<button type="button" class="vote-card${on ? " on" : ""}${m === lead ? " lead" : ""}" data-mode="${m}"
          aria-pressed="${on}" ${busy ? "disabled" : ""}>
        <span class="vc-top"><span class="vc-ico">${ICON[m]}</span>
          ${on ? `<span class="vc-tag">${esc(t("yours"))}</span>` : m === lead ? `<span class="vc-tag lead">${esc(t("leading"))}</span>` : ""}</span>
        <span class="vc-name">${esc(t(m))}</span>
        <span class="vc-desc">${esc(t(m + "Desc"))}</span>
        <span class="vc-chips">${chips.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join("")}</span>
        <span class="vc-num">${total ? `<b>${usd(u)}</b><span>${share}% · ${esc(t("voters", { count: n }))}</span>`
                                     : `<span>${esc(t("noVotes"))}</span>`}</span>
        <span class="vc-cta">${esc(on ? t("voted") : t("pick", { mode: t(m) }))}</span>
      </button>`;
    }).join("");
    $("vote-close").textContent = t("closes");
    const hist = data.history || [];
    $("vote-hist-wrap").hidden = !hist.length;
    if (hist.length) {
      $("vote-hist").innerHTML = `<thead><tr><th>${esc(t("day"))}</th><th>${esc(t("mode"))}</th><th class="r">${esc(t("weight"))}</th></tr></thead><tbody>` +
        hist.map((h) => `<tr><td>${esc(h.day)}</td><td>${esc(t(h.mode))}</td><td class="r">${usd(MODES.reduce((s, m) => s + ((h.usd || {})[m] || 0), 0))}</td></tr>`).join("") + "</tbody>";
    }
  }
  setInterval(() => { const el = $("vote-cd"); if (el && data) el.textContent = countdown(data.closes_at); }, 30_000);

  async function load() {
    try {
      const r = await fetch(API + "/public/votes.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      render();
    } catch (e) {
      if (!data) msg(t("down"));
    }
  }

  // one sign-in for the whole site (2026-10-05, the user: the desk had its own "connect wallet"): the wallet is the
  // nav's session (nav.js window.flyNav); signed out, the button is the nav's sign-in (data-nav-signin)
  function navWallet() {
    const s = window.flyNav && window.flyNav.session && window.flyNav.session();
    return s && s.wallet ? s.wallet.toLowerCase() : null;
  }
  function useSession() {
    wallet = navWallet();
    const b = $("vote-connect");
    if (wallet) {
      b.hidden = true;
      try { mine = data ? localStorage.getItem("deskvote:" + data.day + ":" + wallet) : null; } catch { mine = null; }
    }
    return wallet;
  }
  function signIn() {
    const b = document.querySelector('nav li.acct[data-signin] button');
    if (b) { window.scrollTo({ top: 0, behavior: "smooth" }); b.click(); }
  }
  // the signature still comes from the wallet app: it must be the signed-in wallet
  async function signer() {
    if (!window.ethereum) { msg(t("noWallet"), "err"); return false; }
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) || [];
    if (accs.some((a) => String(a).toLowerCase() === wallet)) return true;
    msg(t("switchTo", { wallet: short(wallet) }), "err");
    return false;
  }

  const hex = (s) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

  async function vote(mode) {
    if (busy || !data) return;
    try {
      if (!useSession()) { signIn(); return; }
      if (!(await signer())) return;
      busy = true; render();
      const text = data.message.replace("{day}", data.day).replace("{mode}", mode).replace("{wallet}", wallet);
      msg(t("signing"));
      let signature;
      try {
        signature = await window.ethereum.request({ method: "personal_sign", params: [hex(text), wallet] });
      } catch (e) { msg(t("cancelled"), "err"); return; }
      msg(t("sending"));
      const r = await fetch(API + "/vote", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, mode, day: data.day, signature }) });
      const a = await r.json().catch(() => ({}));
      if (!r.ok) { msg(a.error || t("down"), "err"); return; }
      mine = mode;
      try { localStorage.setItem("deskvote:" + data.day + ":" + wallet, mode); } catch {}
      msg(t("done", { mode: t(mode), usd: usd(a.usd) }), "ok");
      await load();
    } catch (e) {
      msg(t("down"), "err");
    } finally {
      busy = false; render();
    }
  }

  document.addEventListener("click", (e) => {
    const c = e.target.closest("#vote-cards [data-mode]");
    if (c) vote(c.dataset.mode);
    if (e.target.closest("#vote-connect") && !navWallet()) signIn();
  });

  async function start() {
    if (!window.flyI18n) {
      try { en = await (await fetch("assets/i18n/en/desk.json")).json(); } catch { en = {}; }
    }
    await load();
    if (useSession()) render();
    setInterval(load, REFRESH_MS);
  }
  if (window.flyI18n) start();
  else {
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    window.addEventListener("i18n:ready", go, { once: true });
    setTimeout(go, 2500);
  }
})();
