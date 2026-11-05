/**
 * The fly messenger (2026-11-04, the user: "a chat ui in general everywhere that shows all the fly chats etc and you
 * can select and enter like messenger"; flies only, no Desk chat). nav.js puts a 💬 in the bar for a signed-in wallet
 * on every page and loads this on the first open (or on a fly's page, where it opens on that fly).
 *
 * Inbox: GET /api/flychat/inbox (mine src/flychat.ts) - the flies this wallet can talk to, last message first.
 * A chat: GET/POST /api/flychat/<fly> as before (300 characters, one message every 30 s, 20 a day a fly). Cards are
 * approved here with the same endpoints the Trader Flies wallet panel uses (/api/vaults/<wallet>/settings|withdraw|move),
 * then the card's answer is posted back; a page that shows the fly hears "fly:changed" and reloads its numbers.
 * Unread: the time each chat was last opened, in this browser (flyai.chat.seen).
 *   window.flyChat.open(fly?, { auto })   fly: that chat, else the inbox; auto: only on a desktop and not closed in this tab
 *   window.flyChat.close()  .unread()     (unread: a count from the inbox, for the nav's dot)
 */
(function () {
  "use strict";
  if (window.flyChat) return;
  const NAV = window.flyNav || {};
  const API = NAV.MINE_API || "https://flyai-mine.fly.dev";
  const SESSION_KEY = "flyai.compute.session";
  const SEEN_KEY = "flyai.chat.seen", CLOSED_KEY = "flychat:closed", LAST_KEY = "flychat:fly";
  const LANGS = ["en", "zh-Hans", "zh-Hant", "ko", "tr", "es"];
  const WATCH_MAX = 5;
  // chat packs (2026-11-05, flytrade/UTILITY-PLAN.md): past the free messages, a pack is bought by burning $FLYAI
  const ACCOUNT_JS = "/compute/mine/web/account.js";
  const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C", CHAIN = 4663;
  const NETS = { robinhood: "Robinhood Chain", base: "Base", arbitrum: "Arbitrum", bsc: "BNB Chain", polygon: "Polymarket", solana: "Solana" };
  const EN = {
    chats: "Chats", chatsAria: "Your fly chats", title: "Fly #{id}", close: "Close", back: "Back to chats", flyPage: "Fly page",
    noFlies: "No flies to chat with yet. Get a Trader Fly and put money in its wallet, or hold 200k $FLYAI.", getFly: "Trader Flies",
    signIn: "Sign in at the top right to chat with your flies.", noMsgs: "Say hi", you: "You", card: "Card",
    hello: "Hi! Ask me why I traded (or didn't), or tell me what to change. Tap a button below for the usual changes. I only suggest: nothing happens until you approve it.",
    placeholder: "Ask or tell your fly…", resting: "Resting for today: the buttons still work", send: "Send",
    left: "{n} of {max} messages left today · one every {gap} s", doneToday: "That's all for today: back tomorrow",
    freeLeft: "{n} of {max} free messages left today", packLeft: "{n} from packs", gapNote: "one every {gap} s",
    freeDone: "Today's {max} free messages are used.", buyPack: "Buy {n} messages · burns {flyai} $FLYAI",
    buyConfirm: "Burn {flyai} $FLYAI (sent to 0x…dEaD) for {n} chat messages? The messages never expire.",
    buyWallet: "Confirm the burn in your wallet…", buyWaiting: "Waiting for the chain…", buyDone: "+{n} messages",
    needHold: "Put money in this fly's wallet or hold 200k $FLYAI to chat.", cantLoad: "Couldn't load the chat",
    quickAsk: "{what}? Here's what changes:", approve: "Approve", decline: "Decline", desk: "Fly Desk:",
    deskPending: "Sent to the Fly Desk for its rug checks…",
    q: { earn: "Only lending", letItFly: "Let it fly", safe: "Play safe", stocks: "Stocks", pause: "Pause", resume: "Resume", careful: "More careful", bolder: "Bolder" },
    cardText: { withdraw: "Withdraw {pct}% on {chain}", move: "Move ${usd} from {from} to {to}", watch: "Always watch this token",
      watchNote: "Your fly trades watched tokens without its rug filters, so the risk is yours. The Fly Desk checks it too and may add it for every fly if it looks good.",
      moneyNote: "This moves money. It goes through the normal withdrawal rules (the profit fee applies)." },
    status: { approved: "Done", declined: "Declined", failed: "Didn't go through", pending: "" },
  };
  let TEXT = EN;
  const get = (obj, path) => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  function t(key, vars) {
    let v = get(TEXT, key);
    if (typeof v !== "string") v = get(EN, key);
    if (typeof v !== "string") v = key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ""));
  }
  function lang() {
    let l = "en";
    try { l = new URLSearchParams(location.search).get("lang") || localStorage.getItem("flyai.lang") || "en"; } catch {}
    return LANGS.includes(l) ? l : "en";
  }
  const textReady = lang() === "en" ? Promise.resolve() : fetch(`/assets/i18n/${lang()}/common.json`).then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.flychat) TEXT = j.flychat; }).catch(() => {});

  const store = (area) => ({ get: (k) => { try { return area().getItem(k); } catch { return null; } },
    set: (k, v) => { try { area().setItem(k, v); } catch { /* private window */ } } });
  const local = store(() => localStorage), tab = store(() => sessionStorage);
  function session() {
    if (NAV.session) return NAV.session();
    try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.expires_at > Date.now() && s.token ? s : null; } catch { return null; }
  }
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  async function api(path, body) {
    const s = session();
    const res = await fetch(API + path, { method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(s ? { "x-flyai-session": s.token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(body === undefined ? 10_000 : 45_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || `HTTP ${res.status}`);
    return data;
  }
  const errText = (e) => (e && e.message) || String(e);
  const seen = () => { try { return JSON.parse(local.get(SEEN_KEY) || "{}") || {}; } catch { return {}; } };
  const markSeen = (fly) => { const s = seen(); s[fly] = Date.now(); local.set(SEEN_KEY, JSON.stringify(s)); dot(); };
  const isUnread = (f, s) => !!(f.last && f.last.role === "fly" && f.last.at > (s[f.fly] || 0));
  const ago = (at) => {
    const m = Math.max(1, Math.round((Date.now() - at) / 60000));
    return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
  };
  const phone = () => matchMedia("(max-width: 720px)").matches;
  /** replaceChildren without the nulls (it would write them out as text) */
  const fill = (node, ...kids) => node.replaceChildren(...kids.filter((k) => k !== null && k !== undefined && k !== false && k !== ""));
  const el = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, ""); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false && k !== ""));
    return e;
  };

  /** "risk: 3 → 2", "trading: on → off": the settings a card changes, flattened, at most 8 (FlyChat.tsx did the same). */
  function diff(a, b, path) {
    const out = [];
    const show = (v) => (v === true ? "on" : v === false ? "off" : v == null ? "-" : Array.isArray(v)
      ? (v.every((x) => typeof x !== "object") ? v.join(", ") || "-" : `${v.length}`) : typeof v === "object" ? "…" : String(v));
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      if (k === "starter" || k === "v") continue;
      const x = a ? a[k] : undefined, y = b ? b[k] : undefined, p = path ? `${path}.${k}` : k;
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      if (k === "options" && Array.isArray(x) && Array.isArray(y)) {
        for (const id of new Set([...x.map((o) => o.id), ...y.map((o) => o.id)])) {
          const ox = x.find((o) => o.id === id), oy = y.find((o) => o.id === id);
          if (JSON.stringify(ox) === JSON.stringify(oy)) continue;
          out.push(`${id}: ${ox ? (ox.on ? `${ox.share_pct}%` : "off") : "-"} → ${oy ? (oy.on ? `${oy.share_pct}%` : "off") : "-"}`);
        }
      } else if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) out.push(...diff(x, y, p));
      else out.push(`${p}: ${show(x)} → ${show(y)}`);
    }
    return out.slice(0, 8);
  }

  // ---- state ----
  const S = { open: false, fly: null, inbox: null, inboxErr: "", msgs: [], me: null, view: null, starters: [], err: "", busy: false,
    wait: 0, doing: null, draft: "", localId: -1, loadSeq: 0 };
  let root = null, timer = null, deskTimer = null, inboxAt = 0;

  async function loadInbox(force) {
    if (!session()) { S.inbox = null; return null; }
    if (!force && S.inbox && Date.now() - inboxAt < 60_000) return S.inbox;
    const who = String(session().wallet || "").toLowerCase();
    if (!force && !S.inbox) {                                 // a page change: the last page's read, up to 2 minutes old
      try {
        const hit = JSON.parse(tab.get("flychat:inbox") || "null");
        if (hit && hit.wallet === who && Date.now() - hit.t < 120_000) { S.inbox = hit.v; inboxAt = hit.t; dot(); return S.inbox; }
      } catch {}
    }
    try {
      S.inbox = (await api("/api/flychat/inbox")).flies || []; S.inboxErr = ""; inboxAt = Date.now();
      tab.set("flychat:inbox", JSON.stringify({ wallet: who, t: inboxAt, v: S.inbox }));
    } catch (e) { S.inboxErr = errText(e); }
    dot();
    return S.inbox;
  }
  function unread() { const s = seen(); return (S.inbox || []).filter((f) => isUnread(f, s)).length; }
  function dot() {
    const n = unread();
    for (const b of document.querySelectorAll(".chat-n")) { b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n); }
  }

  async function loadChat(fly) {
    const my = ++S.loadSeq;
    try {
      const [r, view] = await Promise.all([api(`/api/flychat/${fly}`), api(`/api/vaults/fly/${fly}`).catch(() => null)]);
      if (my !== S.loadSeq || S.fly !== fly) return;
      S.msgs = [...r.messages, ...S.msgs.filter((m) => m.local)].sort((a, b) => a.at - b.at || a.id - b.id);
      S.me = r.me; S.wait = r.me.wait_s; S.err = "";
      if (view) S.view = view;
    } catch (e) { if (my === S.loadSeq) S.err = e instanceof ApiError ? e.message : t("cantLoad"); }
    render();
    deskWatch();
  }
  /** a chat pack: burn the pack's $FLYAI from the signed-in wallet (one transaction), then the server credits it */
  async function buyPack() {
    const me = S.me, fly = S.fly;
    if (!me || !me.pack || S.busy) return;
    const n = me.pack.messages, flyai = me.pack.flyai;
    if (!confirm(t("buyConfirm", { n, flyai: flyai.toLocaleString() }))) return;
    S.busy = true;
    let acct = null;
    try {
      acct = await import(ACCOUNT_JS);
      const word = (x) => x.toString(16).padStart(64, "0");
      const data = "0xa9059cbb" + word(BigInt(me.pack.burn_to)) + word(BigInt(flyai) * 10n ** 18n);
      S.packMsg = t("buyWallet"); render();
      const hash = await acct.transact(FLYAI, data, () => { S.packMsg = t("buyWallet"); render(); }, CHAIN);
      S.packMsg = t("buyWaiting"); render();
      await acct.mined(hash, CHAIN);
      let r = null;
      for (let i = 0; i < 6 && !r; i++) {                // the server reads the receipt: a moment after it's mined
        try { r = await api("/api/flychat/pack", { tx: hash }); }
        catch (e) { if (!(e instanceof ApiError && e.status === 409)) throw e; await new Promise((ok) => setTimeout(ok, 2500)); }
      }
      S.packMsg = "";
      S.err = r ? "" : t("cantLoad");
      if (r && fly === S.fly) S.me = { ...S.me, credits: r.credits, left_today: (S.me.free_left || 0) + r.credits };
    } catch (e) {
      S.packMsg = "";
      S.err = acct && acct.errorText ? acct.errorText(e) : errText(e);
    } finally {
      S.busy = false;
      render();
      if (fly === S.fly) void loadChat(fly);
    }
  }
  function deskWatch() {
    clearInterval(deskTimer);
    if (S.open && S.fly && S.msgs.some((m) => m.desk && m.desk.pending)) deskTimer = setInterval(() => void loadChat(S.fly), 20_000);
  }

  function settingsNow() {
    const v = S.view;
    const s = v && v.settings;
    if (s) return s;
    const st = S.starters.find((x) => x.id === "let_it_fly");
    return st ? st.settings : null;
  }
  function quicks() {
    const s = settingsNow();
    if (!s) return [];
    const keep = (x) => ({ ...x, watch: s.watch || [], ...(s.maker ? { maker: s.maker } : {}) });
    const from = (id) => { const st = S.starters.find((x) => x.id === id); return st ? keep({ ...st.settings, starter: id }) : null; };
    return [
      [t("q.earn"), from("just_earn")], [t("q.letItFly"), from("let_it_fly")], [t("q.safe"), from("safe_majors")], [t("q.stocks"), from("stock_swing")],
      s.trading ? [t("q.pause"), { ...s, trading: false, starter: "custom" }] : [t("q.resume"), { ...s, trading: true, starter: "custom" }],
      [t("q.careful"), s.risk > 1 ? { ...s, risk: s.risk - 1, starter: "custom" } : null],
      [t("q.bolder"), s.risk < 5 ? { ...s, risk: s.risk + 1, starter: "custom" } : null],
    ].filter(([, x]) => x);
  }
  function quick(label, after) {
    const before = settingsNow();
    if (!before || !after) return;
    S.msgs.push({ id: S.localId--, at: Date.now(), role: "fly", text: t("quickAsk", { what: label }), local: true,
      card: { kind: "settings", summary: label, before, after }, status: "pending", desk: null });
    render(true);
  }

  async function send(text) {
    const fly = S.fly, s = text.trim();
    if (!s || S.busy || S.wait > 0) return;
    S.busy = true; S.err = ""; S.draft = "";
    // the owner's message goes into the chat at once with the fly "typing"; the saved pair replaces it when it answers
    const id = S.localId--;
    S.msgs.push({ id, at: Date.now(), role: "user", text: s, card: null, status: null, desk: null, local: true, sending: true });
    render(true);
    try {
      const r = await api(`/api/flychat/${fly}`, { text: s, lang: lang() });
      if (S.fly === fly) {
        S.msgs = [...S.msgs.filter((m) => m.id !== id), ...r.messages];
        S.wait = (S.me && S.me.gap_s) || 30;
        if (S.me) S.me.left_today = Math.max(0, S.me.left_today - 1);
      }
      const row = (S.inbox || []).find((f) => f.fly === fly);
      const last = r.messages[r.messages.length - 1];
      if (row && last) row.last = { at: last.at, role: last.role, text: last.text, card: last.card ? last.card.kind : null, status: last.status };
      if (row) tab.set("flychat:inbox", JSON.stringify({ wallet: String(session().wallet || "").toLowerCase(), t: inboxAt, v: S.inbox }));
      markSeen(fly);
    } catch (e) {
      S.msgs = S.msgs.filter((m) => m.id !== id);
      if (S.fly === fly && !S.draft) S.draft = s;               // give the text back so it can be sent again
      const m = errText(e), w = /wait (\d+)s/.exec(m);
      if (w) S.wait = Number(w[1]); else S.err = m;
    } finally { S.busy = false; S.focus = true; render(true); }
  }

  async function answer(m, ok) {
    const view = S.view, fly = S.fly;
    if (!m.card || !view || !view.wallet || S.doing !== null) return;
    S.doing = m.id; S.err = ""; render();
    const mark = (status) => {
      const x = S.msgs.find((y) => y.id === m.id);
      if (x) { x.status = status; if (status === "approved" && m.card.kind === "watch") x.desk = { pending: true }; }
    };
    const tell = (status) => (m.local ? Promise.resolve() : api(`/api/flychat/${fly}/card/${m.id}`, { status }).catch(() => {}));
    try {
      if (!ok) { await tell("declined"); mark("declined"); return; }
      const c = m.card, w = view.wallet;
      if (c.kind === "settings") await api(`/api/vaults/${w}/settings`, { settings: c.after, chain: "robinhood" });
      else if (c.kind === "withdraw") await api(`/api/vaults/${w}/withdraw`, { bps: Math.round(c.pct * 100), chain: c.chain });
      else if (c.kind === "move") await api(`/api/vaults/${w}/move`, { usd: c.usd, to_chain: c.to_chain, chain: c.chain });
      else if (c.kind === "watch") {
        const now = (await api(`/api/vaults/fly/${fly}`).catch(() => null)) || view;   // the latest settings: add to them, not to an old copy
        const base = now.settings || settingsNow();
        const watch = [...new Set([...((base && base.watch) || []), c.token])].slice(0, WATCH_MAX);
        await api(`/api/vaults/${w}/settings`, { settings: { ...base, watch }, chain: "robinhood" });
        await api(`/api/flychat/${fly}/watch`, { token: c.token, card: m.id }).catch(() => {});
      }
      await tell("approved"); mark("approved");
      window.dispatchEvent(new CustomEvent("fly:changed", { detail: { fly } }));
      api(`/api/vaults/fly/${fly}`).then((v) => { if (S.fly === fly) { S.view = v; render(); } }).catch(() => {});
    } catch (e) {
      await tell("failed"); mark("failed");
      S.err = errText(e);
    } finally { S.doing = null; render(); deskWatch(); }
  }

  // ---- open / close ----
  function open(fly, opts) {
    opts = opts || {};
    if (opts.auto && (phone() || tab.get(CLOSED_KEY) === "1")) return;
    tab.set(CLOSED_KEY, "0");
    S.open = true;
    mount();
    void loadInbox(!S.inbox);
    if (fly) enter(Number(fly)); else if (!S.fly) { const last = Number(tab.get(LAST_KEY) || 0); if (last && !opts.inbox) enter(last); else render(); } else render();
    if (!timer) timer = setInterval(() => { if (S.wait > 0) { S.wait--; tickButton(); } }, 1000);
  }
  function close() {
    S.open = false; tab.set(CLOSED_KEY, "1");
    clearInterval(timer); timer = null; clearInterval(deskTimer);
    if (root) root.hidden = true;
    document.documentElement.classList.remove("flychat-full");
  }
  function enter(fly) {
    if (S.fly !== fly) { S.msgs = []; S.me = null; S.view = null; S.err = ""; S.draft = ""; S.wait = 0; }
    S.fly = fly; S.focus = true; tab.set(LAST_KEY, String(fly));
    markSeen(fly);
    render();
    void loadChat(fly);
  }
  function leave() { S.fly = null; S.loadSeq++; tab.set(LAST_KEY, ""); clearInterval(deskTimer); void loadInbox(true).then(render); render(); }

  // ---- drawing ----
  function mount() {
    if (!root) {
      style();
      root = el("div", { class: "flychat", role: "dialog", "aria-label": t("chatsAria") });
      document.body.append(root);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.open) close(); });
      void textReady.then(() => { if (S.open) render(); });
      void api("/api/vaults/config").then((c) => { S.starters = c.starters || []; if (S.open && S.fly) render(); }).catch(() => {});
    }
    root.hidden = false;
  }
  function head(title, withBack) {
    return el("header", { class: "fcm-head" },
      withBack ? el("button", { class: "fcm-icon", type: "button", "aria-label": t("back"), title: t("back"), onclick: leave }, "←") : null,
      el("b", null, title),
      withBack ? el("a", { class: "fcm-page", href: `/traderflies/fly?id=${S.fly}` }, t("flyPage"), " ↗") : null,
      el("button", { class: "fcm-icon", type: "button", "aria-label": t("close"), title: t("close"), onclick: close }, "×"));
  }
  function render(scroll) {
    if (!root || !S.open) return;
    document.documentElement.classList.toggle("flychat-full", phone());
    if (!S.fly) return renderInbox();
    const list = root.querySelector(".fcm-list");
    const keepBottom = scroll || !list || list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const prevTop = list ? list.scrollTop : 0;
    const msgs = el("div", { class: "fcm-list" },
      !S.msgs.length ? el("p", { class: "fcm-hello" }, t("hello")) : null,
      S.msgs.map((m) => el("div", { class: `fcm-msg ${m.role}${m.sending ? " sending" : ""}` }, el("p", null, m.text), m.card ? cardView(m) : null)),
      S.msgs.some((m) => m.sending) ? el("div", { class: "fcm-msg fly fcm-typing", "aria-label": "…" }, el("p", null, el("i"), el("i"), el("i"))) : null);
    const chips = el("div", { class: "fcm-quick" }, quicks().map(([label, s]) => el("button", { type: "button", class: "fcm-chip", onclick: () => quick(label, s) }, label)));
    fill(root, head(t("title", { id: S.fly }), true), msgs, chips,
      S.err ? el("p", { class: "fcm-err" }, S.err) : null, el("div", { class: "fcm-formbox" }));
    renderForm();
    msgs.scrollTop = keepBottom ? msgs.scrollHeight : prevTop;
  }
  function renderForm() {
    const box = root && root.querySelector(".fcm-formbox");
    if (!box) return;
    const me = S.me;
    const live = box.querySelector("input");
    if (live) S.draft = live.value;
    const hadFocus = live && document.activeElement === live;
    if (me && !me.can_chat) return box.replaceChildren(el("p", { class: "fcm-note" }, t("needHold")));
    const done = !!me && me.left_today === 0;
    const packBtn = me && me.pack && me.free_left === 0
      ? el("button", { class: "fcm-pack", type: "button", disabled: S.busy, onclick: () => { void buyPack(); } },
        S.packMsg || t("buyPack", { n: me.pack.messages, flyai: me.pack.flyai.toLocaleString() })) : null;
    const counter = !me ? null : me.free_per_day == null
      ? (done ? t("doneToday") : t("left", { n: me.left_today, max: me.per_day || 20, gap: me.gap_s || 30 }))
      : [me.free_left > 0 ? t("freeLeft", { n: me.free_left, max: me.free_per_day }) : t("freeDone", { max: me.free_per_day }),
        me.credits > 0 ? t("packLeft", { n: me.credits }) : "", t("gapNote", { gap: me.gap_s || 30 })].filter(Boolean).join(" · ");
    const input = el("input", { class: "fcm-input", maxlength: String((me && me.max_len) || 300), value: S.draft, enterkeyhint: "send",
      placeholder: me && me.resting ? t("resting") : t("placeholder"), "aria-label": t("placeholder"), disabled: done });
    input.value = S.draft;
    const btn = el("button", { class: "fcm-send", type: "submit", disabled: S.busy || S.wait > 0 || !S.draft.trim() || done },
      S.busy ? "…" : S.wait > 0 ? `${S.wait}s` : t("send"));
    input.addEventListener("input", () => { S.draft = input.value; tickButton(); });
    const form = el("form", { class: "fcm-form", onsubmit: (e) => { e.preventDefault(); void send(input.value); } }, input, btn);
    fill(box, form, me ? el("p", { class: "fcm-fine" }, counter) : null, packBtn);
    if (hadFocus || (S.focus && !phone())) { S.focus = false; input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
  /** the countdown: only the button changes, so typing (and the page's own focus) is left alone */
  function tickButton() {
    const btn = root && root.querySelector(".fcm-send"), input = root && root.querySelector(".fcm-input");
    if (!btn) return;
    const done = !!S.me && S.me.left_today === 0;
    btn.textContent = S.busy ? "…" : S.wait > 0 ? `${S.wait}s` : t("send");
    btn.disabled = S.busy || S.wait > 0 || !((input && input.value) || "").trim() || done;
  }
  function renderInbox() {
    let body;
    if (!session()) body = el("p", { class: "fcm-hello" }, t("signIn"));
    else if (!S.inbox) body = S.inboxErr ? el("p", { class: "fcm-err" }, S.inboxErr) : el("p", { class: "fcm-hello" }, "…");
    else if (!S.inbox.length) body = el("div", { class: "fcm-empty" }, el("p", null, t("noFlies")), el("a", { class: "fcm-chip", href: "/traderflies/" }, t("getFly")));
    else {
      const s = seen();
      body = el("ul", { class: "fcm-inbox" }, S.inbox.map((f) => {
        const last = f.last, unreadNow = isUnread(f, s);
        const preview = !last ? t("noMsgs") : `${last.role === "user" ? `${t("you")}: ` : ""}${last.text || (last.card ? t("card") : "")}`;
        return el("li", null, el("button", { type: "button", class: `fcm-row${unreadNow ? " unread" : ""}`, onclick: () => enter(f.fly) },
          el("span", { class: `fcm-av${f.funded ? " funded" : ""}`, "aria-hidden": "true" }, "🪰"),
          el("span", { class: "fcm-row-main" },
            el("span", { class: "fcm-row-top" }, el("b", null, t("title", { id: f.fly })), last ? el("small", null, ago(last.at)) : null),
            el("span", { class: "fcm-row-last" }, preview)),
          unreadNow ? el("i", { class: "fcm-dot", "aria-hidden": "true" }) : null));
      }));
    }
    root.replaceChildren(head(t("chats"), false), el("div", { class: "fcm-list" }, body));
  }
  function cardView(m) {
    const c = m.card, money = c.kind === "withdraw" || c.kind === "move", busy = S.doing === m.id;
    const net = (x) => NETS[x] || x;
    return el("div", { class: `fcm-card${money ? " money" : ""}` },
      c.kind === "settings" ? [el("b", null, c.summary), el("ul", null, diff(c.before, c.after).map((l) => el("li", null, l)))] : null,
      c.kind === "withdraw" ? el("b", null, t("cardText.withdraw", { pct: c.pct, chain: net(c.chain) })) : null,
      c.kind === "move" ? el("b", null, t("cardText.move", { usd: c.usd, from: net(c.chain), to: net(c.to_chain) })) : null,
      c.kind === "watch" ? [el("b", null, t("cardText.watch")), el("span", { class: "fcm-token" }, c.token), el("small", null, t("cardText.watchNote"))] : null,
      money ? el("small", null, t("cardText.moneyNote")) : null,
      m.status === "pending"
        ? el("div", { class: "fcm-actions" },
            el("button", { type: "button", class: "fcm-yes", disabled: busy || !S.view, onclick: () => void answer(m, true) }, busy ? "…" : t("approve")),
            el("button", { type: "button", class: "fcm-no", disabled: busy || !S.view, onclick: () => void answer(m, false) }, t("decline")))
        : el("span", { class: `fcm-status ${m.status || ""}` }, t(`status.${m.status}`)),
      m.desk ? el("small", { class: `fcm-desk ${m.desk.verdict || ""}` }, m.desk.pending ? t("deskPending") : `${t("desk")} ${m.desk.text}`) : null);
  }

  function style() {
    const css = document.createElement("style");
    css.textContent = `
.flychat { position: fixed; right: 16px; bottom: 16px; z-index: 1000; margin: 0; padding: 0; width: min(370px, calc(100vw - 24px)); height: min(560px, calc(100vh - 90px));
  display: flex; flex-direction: column; background: var(--panel, #0a0b0b); color: var(--text, #f4f7f6); border: 1px solid var(--line-2, #2a2f2d);
  border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.6); overflow: hidden; font: 14px/1.4 var(--sans, "Outfit", "Inter", system-ui, sans-serif); }
.flychat[hidden] { display: none; }
.flychat * { box-sizing: border-box; }
html.flychat-full .flychat { inset: 0; width: auto; height: auto; border-radius: 0; border: 0; }
html.flychat-full body { overflow: hidden; }
.fcm-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line, #1a1d1c); }
.fcm-head b { flex: 1; font-size: 15px; }
.fcm-icon { background: none; border: 0; color: inherit; font-size: 20px; line-height: 1; padding: 4px 6px; cursor: pointer; border-radius: 8px; }
.fcm-icon:hover { background: rgba(255,255,255,.06); }
.fcm-page { color: var(--mint, #5ef2cc); font-size: 12px; text-decoration: none; }
.fcm-list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.fcm-hello, .fcm-note, .fcm-fine { color: var(--muted, #9ba5a1); font-size: 13px; margin: 0; }
.fcm-fine { font-size: 11px; padding: 0 12px 10px; }
.fcm-pack { margin: 0 12px 12px; width: calc(100% - 24px); padding: 9px 12px; border-radius: 999px; border: 1px solid var(--mint, #5ef2cc);
  background: transparent; color: var(--mint, #5ef2cc); font: 600 13px/1.2 inherit; cursor: pointer; }
.fcm-pack:hover { background: rgba(94,242,204,.08); } .fcm-pack[disabled] { opacity: .6; cursor: wait; }
.fcm-note { padding: 10px 12px; }
.fcm-err { color: var(--red, #ff5c6c); font-size: 12px; margin: 0; padding: 4px 12px; }
.fcm-empty { display: grid; gap: 10px; justify-items: start; color: var(--muted, #9ba5a1); }
.fcm-empty p { margin: 0; }
.fcm-inbox { list-style: none; margin: -12px; padding: 4px 0; }
.fcm-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: none; border: 0; color: inherit; text-align: left;
  cursor: pointer; font: inherit; }
.fcm-row:hover { background: rgba(255,255,255,.05); }
.fcm-av { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; background: var(--panel-2, #121514);
  border: 1px solid var(--line, #1a1d1c); }
.fcm-av.funded { border-color: var(--mint, #5ef2cc); }
.fcm-row-main { flex: 1; min-width: 0; display: grid; gap: 2px; }
.fcm-row-top { display: flex; justify-content: space-between; gap: 8px; }
.fcm-row-top small { color: var(--muted, #9ba5a1); font-size: 11px; }
.fcm-row-last { color: var(--muted, #9ba5a1); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fcm-row.unread .fcm-row-last { color: var(--text, #f4f7f6); font-weight: 600; }
.fcm-dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--mint, #5ef2cc); }
.fcm-msg { max-width: 88%; }
.fcm-msg p { margin: 0; padding: 8px 11px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.fcm-msg.user { align-self: flex-end; }
.fcm-msg.user p { background: var(--mint, #5ef2cc); color: #000; border-bottom-right-radius: 4px; }
.fcm-msg.fly p { background: var(--panel-2, #121514); border-bottom-left-radius: 4px; }
.fcm-msg.sending p { opacity: .7; }
.fcm-typing p { display: flex; gap: 4px; padding: 11px 12px; }
.fcm-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted, #9ba5a1); animation: fcm-dot 1s infinite ease-in-out; }
.fcm-typing i:nth-child(2) { animation-delay: .15s; } .fcm-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes fcm-dot { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.fcm-card { margin-top: 6px; padding: 10px; border: 1px solid var(--line-2, #2a2f2d); border-radius: 12px; display: flex; flex-direction: column; gap: 6px;
  font-size: 13px; background: var(--bg-2, #060707); }
.fcm-card.money { border-color: var(--red, #ff5c6c); }
.fcm-card ul { margin: 0; padding-left: 16px; color: var(--muted, #9ba5a1); font: 12px/1.4 var(--mono, ui-monospace, monospace); }
.fcm-card small { color: var(--muted, #9ba5a1); font-size: 11px; }
.fcm-token { font: 11px var(--mono, ui-monospace, monospace); overflow-wrap: anywhere; }
.fcm-actions { display: flex; gap: 8px; }
.fcm-yes, .fcm-no, .fcm-send, .fcm-chip { font: 600 13px/1 var(--sans, inherit); border-radius: 999px; padding: 8px 14px; cursor: pointer; border: 1px solid var(--line-2, #2a2f2d);
  background: transparent; color: inherit; text-decoration: none; display: inline-block; }
.fcm-yes, .fcm-send { background: var(--mint, #5ef2cc); color: #000; border-color: var(--mint, #5ef2cc); }
.fcm-yes:disabled, .fcm-no:disabled, .fcm-send:disabled { opacity: .5; cursor: default; }
.fcm-status { font-size: 12px; color: var(--muted, #9ba5a1); }
.fcm-status.approved { color: var(--mint, #5ef2cc); } .fcm-status.failed { color: var(--red, #ff5c6c); }
.fcm-desk.pass { color: var(--mint, #5ef2cc); } .fcm-desk.fail { color: var(--red, #ff5c6c); }
.fcm-quick { display: flex; gap: 6px; overflow-x: auto; padding: 8px 12px 0; scrollbar-width: none; }
.fcm-quick:empty { display: none; }
.fcm-chip { flex: none; padding: 6px 11px; font-size: 12px; font-weight: 500; }
.fcm-chip:hover { border-color: var(--mint, #5ef2cc); }
.fcm-form { display: flex; gap: 8px; padding: 10px 12px 6px; }
.fcm-input { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--line-2, #2a2f2d);
  background: var(--bg, #000); color: inherit; }
.fcm-input:focus { outline: none; border-color: var(--mint, #5ef2cc); }
`;
    document.head.append(css);
  }

  window.flyChat = { open, close, unread, inbox: loadInbox, isOpen: () => S.open };
  window.addEventListener("flyai-session", () => { S.inbox = null; inboxAt = 0; if (S.open) { void loadInbox(true).then(render); if (S.fly) void loadChat(S.fly); } });
  matchMedia("(max-width: 720px)").addEventListener("change", () => render());
})();
