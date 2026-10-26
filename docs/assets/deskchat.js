/**
 * The holders' chat on the Fly Desk (desk.html #chat; flytrade/DESK-CHAT-PLAN.md). Everyone reads; wallets holding
 * 10k+ $FLYAI post through the mine server (mine/src/deskchat.ts), each message with its writer's weight (size x time
 * held). The desk answers every token named with its own rug checks (flytrade/desk/chat.py). History from the mine
 * server, new rows live from Supabase Realtime (public.desk_chat, anon read); polling if Realtime can't load.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("chat")) return;
  const SUPABASE = "https://fixyinamewrjrcybjoua.supabase.co";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpeHlpbmFtZXdyanJjeWJqb3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNTUyNjMsImV4cCI6MjEwNDgzMTI2M30.-Ri3FIUheo4Tc9TFOUMAfV9OkDUp_0JK_hPvKVnagik";
  const RT_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  const nav = window.flyNav || {};
  const MINE_API = new URLSearchParams(location.search).get("chatapi") || nav.MINE_API || "https://flyai-mine.fly.dev";
  const MINE_READ = new URLSearchParams(location.search).get("chatapi") || nav.MINE_READ || MINE_API;
  const POLL_MS = 20_000;
  const MAX_ROWS = 200;

  let en = null;
  const pick = (o, k) => k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), o);
  function t(key, vars) {
    if (window.flyI18n) return window.flyI18n.t("desk.chat." + key, vars);
    let v = pick(en, "chat." + key);
    if (v && typeof v === "object") v = vars && vars.count === 1 ? v.one : v.other;
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  }
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const num = (x, d = 0) => new Intl.NumberFormat(lang(), { maximumFractionDigits: d }).format(x || 0);
  const knum = (x) => new Intl.NumberFormat(lang(), { notation: "compact", maximumFractionDigits: 1 }).format(x || 0);
  const pctf = (x) => new Intl.NumberFormat(lang(), { style: "percent", maximumFractionDigits: 0 }).format(x || 0);
  const session = () => (nav.session ? nav.session() : null);

  const rows = new Map();          // id -> row (messages and the desk's checks)
  const names = {};                // wallet -> nickname
  let me = null;                   // GET /api/desk-chat/me
  let busy = false;

  /** A row as the mine server or Realtime gives it, in one shape. */
  function norm(r) {
    return {
      id: Number(r.id), at: typeof r.at === "number" ? r.at : Date.parse(r.at), kind: r.kind, wallet: r.wallet,
      text: r.text, weight: Number(r.weight) || 0, held: r.held == null ? null : Number(r.held), days: r.days,
      tokens: r.tokens || [], reply_to: r.reply_to == null ? null : Number(r.reply_to), verdict: r.verdict,
      meta: r.meta || {}, checked: r.checked != null ? r.checked : r.checked_at != null,
    };
  }
  function take(list) {
    for (const r of list) rows.set(Number(r.id), norm(r));
    if (rows.size > MAX_ROWS) [...rows.keys()].sort((a, b) => a - b).slice(0, rows.size - MAX_ROWS).forEach((k) => rows.delete(k));
  }

  function when(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return t("now");
    if (s < 3600) return t("minAgo", { n: Math.floor(s / 60) });
    if (s < 86400) return t("hAgo", { n: Math.floor(s / 3600) });
    return new Date(ms).toLocaleDateString(lang(), { month: "short", day: "numeric" });
  }
  /** $TOKENS and addresses lit in a message (escaped first). */
  const lit = (text) => esc(text).replace(/(\$[A-Za-z][A-Za-z0-9]{1,11}\b|0x[0-9a-fA-F]{40}\b)/g, '<b class="ch-tok">$1</b>');
  const weightBadge = (w) => `<span class="ch-w" style="--w:${Math.max(0.04, w)}" title="${esc(t("weightTip"))}">${t("w")} ${num(w, 2)}</span>`;

  /** The desk's reply to one token, in the visitor's language from its facts. */
  function checkLine(c) {
    const m = c.meta || {};
    const name = m.symbol ? "$" + m.symbol : short(m.token || "");
    const facts = [];
    if (m.holders != null) facts.push(t("holders", { n: num(m.holders) }));
    if (m.whales != null) facts.push(t("whales", { p: pctf(m.whales) }));
    if (m.creator != null) facts.push(t("creator", { p: pctf(m.creator) }));
    if (m.pool_usd) facts.push(t("pool", { usd: "$" + knum(m.pool_usd) }));
    if (m.age_h != null) facts.push(m.age_h >= 48 ? t("days", { n: num(m.age_h / 24) }) : t("hours", { n: num(m.age_h) }));
    const verdict = c.verdict === "pass" ? (m.known ? t("passed") : t("passUnlisted"))
      : c.verdict === "fail" ? t("fail") : "";
    const why = c.verdict === "pass" && m.known ? "" : String(m.why || "").replace(/^(rug screen|entry): /, "");
    return `<div class="ch-check" data-v="${esc(c.verdict)}"><span class="ch-desk">${esc(t("desk"))}</span>
      <b>${esc(name)}</b> <span class="ch-verdict">${esc(verdict)}</span>${why ? ` <span class="ch-why">${esc(why)}</span>` : ""}
      ${facts.length ? `<span class="ch-facts">${esc(facts.join(" · "))}</span>` : ""}</div>`;
  }

  function render() {
    const log = $("chat-log");
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const all = [...rows.values()];
    const msgs = all.filter((r) => r.kind === "msg").sort((a, b) => a.id - b.id);
    const checks = all.filter((r) => r.kind === "check");
    if (!msgs.length) {
      log.innerHTML = `<p class="ch-empty">${esc(t("empty"))}</p>`;
    } else {
      log.innerHTML = msgs.map((m) => {
        const mine = me && m.wallet === me.wallet;
        const who = names[m.wallet] ? esc(names[m.wallet]) : short(m.wallet);
        const replies = checks.filter((c) => c.reply_to === m.id).sort((a, b) => a.id - b.id).map(checkLine).join("");
        const waiting = m.tokens.length && !m.checked && !replies ? `<div class="ch-check" data-v="wait"><span class="ch-desk">${esc(t("desk"))}</span> ${esc(t("checking"))}</div>` : "";
        return `<div class="ch-msg${mine ? " mine" : ""}">
          <div class="ch-head"><a class="ch-who" href="https://robinhoodchain.blockscout.com/address/${esc(m.wallet)}" target="_blank" rel="noopener">${who}</a>
            ${weightBadge(m.weight)}<span class="ch-at">${esc(when(m.at))}</span></div>
          <div class="ch-text">${lit(m.text)}</div>${replies}${waiting}</div>`;
      }).join("");
    }
    if (stick) log.scrollTop = log.scrollHeight;
    $("chat-count").textContent = msgs.length ? t("count", { count: msgs.length }) : "";
    const missing = [...new Set(msgs.map((m) => m.wallet))].filter((w) => !(w in names));
    if (missing.length && nav.names) {
      missing.forEach((w) => (names[w] = null));
      nav.names(missing).then((got) => { Object.assign(names, got); if (Object.keys(got).length) render(); });
    }
  }

  function renderMe() {
    const s = session();
    $("chat-connect").hidden = !!s;
    $("chat-row").hidden = !s;
    const box = $("chat-me");
    if (!s) { box.textContent = t("readOnly"); return; }
    if (!me) { box.textContent = ""; return; }
    const can = me.can_post;
    $("chat-input").disabled = !can;
    $("chat-send").disabled = !can || busy;
    box.innerHTML = can
      ? `${weightBadge(me.weight)} ${esc(t("you", { held: knum(me.held), days: num(me.days) }))}${me.team ? " · " + esc(t("team")) : ""}`
      : esc(me.held < me.min_hold ? t("needHold", { n: num(me.min_hold) }) : t("blocked"));
  }

  function msg(text, kind) {
    const el = $("chat-msg");
    el.textContent = text || "";
    el.dataset.kind = kind || "";
  }

  async function loadHistory() {
    const r = await fetch(`${MINE_READ}/api/desk-chat`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    take((await r.json()).messages || []);
    render();
  }
  async function loadMe() {
    const s = session();
    if (!s) { me = null; renderMe(); return; }
    try {
      const r = await fetch(`${MINE_API}/api/desk-chat/me`, { headers: { "x-flyai-session": s.token } });
      me = r.ok ? await r.json() : null;
    } catch { me = null; }
    renderMe();
    render();
  }

  async function send(e) {
    e.preventDefault();
    const s = session();
    const input = $("chat-input");
    const text = input.value.trim();
    if (!s || !text || busy) return;
    busy = true; renderMe(); msg("");
    try {
      const r = await fetch(`${MINE_API}/api/desk-chat`, {
        method: "POST", headers: { "content-type": "application/json", "x-flyai-session": s.token }, body: JSON.stringify({ text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      input.value = "";
      take([j]);
      $("chat-log").scrollTop = 1e9;
      render();
    } catch (err) {
      msg(String(err.message || err), "err");
    } finally {
      busy = false; renderMe();
    }
  }

  // the tokens the chat put in the brain's view, from the desk's own snapshot (desk.js "desk-board")
  window.addEventListener("desk-board", (ev) => {
    const v = (ev.detail && ev.detail.chat_view) || {};
    const keys = Object.keys(v).sort((a, b) => v[b] - v[a]);
    const el = $("chat-watch");
    el.hidden = !keys.length;
    el.innerHTML = keys.length ? `<span>${esc(t("watching"))}</span>` + keys.map((k) => `<b class="ch-tok">$${esc(k)}</b> <small>${t("w")} ${num(v[k], 2)}</small>`).join(" ") : "";
  });

  function realtime() {
    return new Promise((resolve, reject) => {
      const go = () => {
        try {
          const client = window.supabase.createClient(SUPABASE, ANON, { auth: { persistSession: false } });
          client.channel("desk-chat").on("postgres_changes", { event: "*", schema: "public", table: "desk_chat" }, (p) => {
            if (p.new && p.new.id) { take([p.new]); render(); }
          }).subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
          });
        } catch (e) { reject(e); }
      };
      if (window.supabase && window.supabase.createClient) return go();
      const sc = document.createElement("script");
      sc.src = RT_JS; sc.async = true; sc.onload = go; sc.onerror = () => reject(new Error("realtime script"));
      document.head.appendChild(sc);
    });
  }

  async function start() {
    if (!window.flyI18n) {
      try { en = await (await fetch("assets/i18n/en/desk.json")).json(); } catch { en = {}; }
    }
    $("chat-form").addEventListener("submit", send);
    $("chat-connect").addEventListener("click", () => {      // the nav's sign-in (as deskvote.js)
      const b = document.querySelector('nav li.acct[data-signin] button');
      if (b) { window.scrollTo({ top: 0, behavior: "smooth" }); b.click(); }
    });
    window.addEventListener("flyai-session", loadMe);
    renderMe();
    await loadHistory().catch(() => { $("chat-log").innerHTML = `<p class="ch-empty">${esc(t("error"))}</p>`; });
    loadMe();
    let poll = null;
    realtime().catch(() => { poll = poll || setInterval(() => loadHistory().catch(() => {}), POLL_MS); });
    setInterval(render, 60_000);                       // "2 min ago" moves on
  }
  if (window.flyI18n) start();
  else {
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    window.addEventListener("i18n:ready", go, { once: true });
    setTimeout(go, 2500);
  }
})();
