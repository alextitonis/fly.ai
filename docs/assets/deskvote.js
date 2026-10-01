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

  function render() {
    if (!data) return;
    const tally = data.tally || { usd: {}, voters: {} };
    const total = MODES.reduce((s, m) => s + (tally.usd[m] || 0), 0);
    const lead = MODES.reduce((a, m) => ((tally.usd[m] || 0) > (tally.usd[a] || 0) ? m : a), "balanced");
    $("vote-today").innerHTML = `<span class="vote-badge" data-mode="${esc(data.today.mode)}">${esc(t("today", { mode: t(data.today.mode) }))}</span>`;
    $("vote-cards").innerHTML = MODES.map((m) => {
      const u = tally.usd[m] || 0, n = tally.voters[m] || 0;
      const share = total ? Math.round((100 * u) / total) : 0;
      const on = mine === m;
      return `<button type="button" class="vote-card${on ? " on" : ""}${total && m === lead ? " lead" : ""}" data-mode="${m}"
          aria-pressed="${on}" ${busy ? "disabled" : ""}>
        <span class="vc-name">${esc(t(m))}${on ? ` <small>${esc(t("yours"))}</small>` : ""}</span>
        <span class="vc-desc">${esc(t(m + "Desc"))}</span>
        <span class="vc-bar"><i style="width:${share}%"></i></span>
        <span class="vc-num"><b>${usd(u)}</b> <span>${share}% · ${esc(t("voters", { count: n }))}</span></span>
        <span class="vc-cta">${esc(t("pick", { mode: t(m) }))}</span>
      </button>`;
    }).join("");
    const when = new Date(data.closes_at).toLocaleString(lang(), { weekday: "short", hour: "2-digit", minute: "2-digit" });
    $("vote-close").textContent = t("closes", { when });
    const hist = data.history || [];
    $("vote-hist-wrap").hidden = !hist.length;
    if (hist.length) {
      $("vote-hist").innerHTML = `<thead><tr><th>${esc(t("day"))}</th><th>${esc(t("mode"))}</th><th class="r">${esc(t("weight"))}</th></tr></thead><tbody>` +
        hist.map((h) => `<tr><td>${esc(h.day)}</td><td>${esc(t(h.mode))}</td><td class="r">${usd(MODES.reduce((s, m) => s + ((h.usd || {})[m] || 0), 0))}</td></tr>`).join("") + "</tbody>";
    }
  }

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

  async function connect() {
    if (!window.ethereum) { msg(t("noWallet"), "err"); return null; }
    const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
    wallet = (accs && accs[0] || "").toLowerCase() || null;
    if (wallet) {
      $("vote-connect").textContent = short(wallet);
      try { mine = localStorage.getItem("deskvote:" + data.day + ":" + wallet); } catch { mine = null; }
      msg(t("connected", { wallet: short(wallet) }));
      render();
    }
    return wallet;
  }

  const hex = (s) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

  async function vote(mode) {
    if (busy || !data) return;
    try {
      if (!wallet && !(await connect())) return;
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
    if (e.target.closest("#vote-connect")) connect().catch(() => msg(t("cancelled"), "err"));
  });

  async function start() {
    if (!window.flyI18n) {
      try { en = await (await fetch("assets/i18n/en/desk.json")).json(); } catch { en = {}; }
    }
    await load();
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
