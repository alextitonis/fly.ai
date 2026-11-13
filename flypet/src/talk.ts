// The fly's own chat, on the fly (2026-11-13, the user: "the chat etc to be on itself not a separate thing/tab"). A click on
// the fly opens a panel just above it, in the pet's own window: one stream, newest at the bottom, of
//   - the chat with it (mine src/flychat.ts, the pet token): cards approved right here - settings and watch lists only;
//     withdrawals and moves send you to the site
//   - what it did: its filled trades of the last day, as its own short lines (the log)
//   - the alpha calls (the Discord bot's, discord/src/alpha.ts), each with Watch, Chart and Copy
// with quick buttons (What are you doing? / Need anything? / Watch a token / Pause-Resume) and the box to type in.
import { t, type Key } from "./i18n.ts";
import {
  alphaCalls, chatAnswer, chatRead, chatSend, chatWatch, flyFeed, notes, prefs, saveSettings, SignedOut,
  type AlphaCall, type ChatMe, type ChatMsg, type FlyFeed, type LogRow,
} from "./store.ts";

const native = window.flyNative;
const SITE = "https://www.flyaiworld.com";
const WATCH_MAX = 5, REFRESH_MS = 60_000, DESK_MS = 20_000, DAY_MS = 86_400_000;
const TRADES_SHOWN = 12, CALLS_SHOWN = 6;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string | null | false | undefined)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, String(v));
  }
  e.append(...kids.filter((k): k is Node | string => k != null && k !== false));
  return e;
};
const money = (n: number | null | undefined) => (n == null ? "" : `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`);
const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const k = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const open = (url: string) => (native ? native.openUrl(url) : (window.open(url), Promise.resolve()));

export interface Talk { open(what?: string): void; close(): void; isOpen(): boolean; refresh(): void }

export function setupTalk(box: HTMLElement, hooks: { onClose: () => void; onSignedOut: () => void }): Talk {
  let feed: FlyFeed | null = null, calls: AlphaCall[] = [], msgs: ChatMsg[] = [], me: ChatMe | null = null;
  let wait = 0, busy = false, localId = -1, isOpen = false, timer = 0, deskTimer = 0;

  // ---- the frame: header, stream, quick buttons, a watch box, the input -------------------------------------------
  const avatar = el("span", { class: "tk-av" }, "🪰");
  const name = el("b"), stats = el("span", { class: "tk-mute" });
  const stream = el("div", { class: "tk-stream" });
  const chipsRow = el("div", { class: "tk-chips" });
  const watchInput = el("input", { type: "text", maxlength: "42", class: "tk-input" }) as HTMLInputElement;
  const watchBox = el("div", { class: "tk-watch", hidden: true }, watchInput,
    el("button", { class: "tk-btn", type: "button", onclick: () => watchFromBox() }, t("p.watch")));
  const input = el("input", { type: "text", maxlength: "300", class: "tk-input" }) as HTMLInputElement;
  const sendBtn = el("button", { class: "tk-btn", type: "submit" }, t("p.send")) as HTMLButtonElement;
  const form = el("form", { class: "tk-form", onsubmit: (e: Event) => { e.preventDefault(); const v = input.value; input.value = ""; void send(v); } }, input, sendBtn);
  const note = el("p", { class: "tk-note" });
  box.replaceChildren(
    el("header", { class: "tk-head" }, avatar, el("span", { class: "tk-grow" }, name, el("br"), stats),
      el("button", { class: "tk-x", type: "button", title: t("p.changeFly"), onclick: () => { hooks.onClose(); native?.openPanel("pick"); } }, "⇄"),
      el("button", { class: "tk-x", type: "button", title: t("p.close"), onclick: () => hooks.onClose() }, "×")),
    stream, chipsRow, watchBox, form, note);
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") hooks.onClose(); });

  const signedOut = (e: unknown) => {
    if (e instanceof SignedOut) { hooks.onSignedOut(); return true; }
    return false;
  };
  const sitePage = () => feed?.who?.page ? SITE + feed.who.page : `${SITE}/traderflies/fly?id=${prefs().fly}`;

  // ---- loading ----------------------------------------------------------------------------------------------------
  async function loadFly() {
    const id = prefs().fly;
    if (id == null) return;
    try {
      feed = await flyFeed(id);
      const f = feed.fly;
      name.textContent = feed.who ? `${feed.who.name} #${feed.who.token}` : t("p.flyName", { id });
      stats.textContent = f && f.funded ? t("p.stats", { value: money(f.value), all: signedMoney(f.profit), today: signedMoney(f.profit_24h) }) : t("set.noMoney");
      avatar.replaceChildren(feed.who?.image ? el("img", { src: feed.who.image, alt: "" }) : "🪰");
    } catch { /* the stream keeps what it had */ }
  }
  async function loadChat() {
    const id = prefs().fly;
    if (id == null) return;
    try {
      const r = await chatRead(id);
      msgs = [...r.messages, ...msgs.filter((m) => m.local)].sort((a, b) => a.at - b.at || a.id - b.id);
      me = r.me; wait = r.me.wait_s;
    } catch (e) {
      if (!signedOut(e)) note.textContent = e instanceof Error ? e.message : t("set.readFailed");
    }
  }
  async function loadCalls() {
    try { calls = (await alphaCalls()).calls; } catch { /* the next look */ }
  }
  async function refresh(scroll = false) {
    await Promise.all([loadFly(), loadChat(), loadCalls()]);
    render(scroll);
  }

  // ---- the stream -------------------------------------------------------------------------------------------------
  type Item = { at: number; node: HTMLElement };
  function tradeLine(r: LogRow): HTMLElement {
    const buy = r.side === "buy";
    return el("div", { class: "tk-msg fly tk-trade" }, el("p", {},
      el("b", { class: buy ? "tk-up" : "tk-down" }, buy ? t("p.iBought") : t("p.iSold")), ` ${r.symbol ?? ""}`, r.usd != null ? ` · ${money(r.usd)}` : "",
      r.pnl_pct != null ? el("span", { class: r.pnl_pct >= 0 ? "tk-up" : "tk-down" }, ` ${r.pnl_pct > 0 ? "+" : ""}${r.pnl_pct}%`) : null,
      r.why ? el("span", { class: "tk-why" }, ` — ${r.why}`) : null),
      el("span", { class: "tk-time" }, time(r.at)));
  }
  function callCard(c: AlphaCall): HTMLElement {
    const rh = c.chain === "robinhood" || c.chain === "";
    const watched = (feed?.settings?.watch ?? []).map((x: string) => x.toLowerCase()).includes(c.ca.toLowerCase());
    return el("div", { class: "tk-msg fly" }, el("div", { class: "tk-card tk-call" },
      el("div", { class: "tk-row" }, c.image ? el("span", { class: "tk-av sm" }, el("img", { src: c.image, alt: "" })) : el("span", { class: "tk-av sm" }, "📣"),
        el("span", { class: "tk-grow" }, el("b", {}, `$${c.symbol}`), el("span", { class: "tk-mute" }, ` · ${c.chain || "robinhood"}`), el("br"),
          el("span", {}, c.head))),
      el("span", { class: "tk-mute" }, `MC ${k(c.mcap)} · Liq ${k(c.liq)} · Vol ${k(c.vol24)}`),
      el("div", { class: "tk-actions" },
        rh ? el("button", { class: "tk-btn sm", type: "button", disabled: watched, onclick: () => watchCard(c.ca) }, t(watched ? "p.watching" : "p.watch")) : null,
        el("button", { class: "tk-btn sm plain", type: "button", onclick: () => void open(`https://dexscreener.com/${c.chain || "robinhood"}/${c.ca}`) }, t("p.chart")),
        el("button", { class: "tk-btn sm plain", type: "button", onclick: (e: Event) => { void navigator.clipboard.writeText(c.ca); (e.target as HTMLElement).textContent = t("p.copied"); } }, t("p.copy")))),
      el("span", { class: "tk-time" }, `${t("p.alphaCall")} · ${time(c.at)}`));
  }
  function render(scroll = false) {
    const atBottom = scroll || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 40;
    const since = Date.now() - DAY_MS;
    const items: Item[] = [
      ...msgs.map((m) => ({ at: m.at, node: el("div", { class: `tk-msg ${m.role}` }, el("p", {}, m.text), m.card ? cardView(m) : null) })),
      ...(feed?.log ?? []).filter((r) => r.type === "trade" && r.status === "filled" && r.at >= since).slice(0, TRADES_SHOWN).map((r) => ({ at: r.at, node: tradeLine(r) })),
      ...calls.filter((c) => c.at >= since).slice(0, CALLS_SHOWN).map((c) => ({ at: c.at, node: callCard(c) })),
      // its alerts (money moves, $FLYAI's price) while the chat was closed: the same words it said in its bubbles
      ...notes().filter((n) => n.at >= since && (n.fly == null || n.fly === prefs().fly)).map((n) => ({ at: n.at,
        node: el("div", { class: "tk-msg fly tk-trade" }, el("p", {}, `🔔 ${n.text}`), el("span", { class: "tk-time" }, time(n.at))) })),
    ].sort((a, b) => a.at - b.at);
    stream.replaceChildren(...(items.length ? items.map((i) => i.node) : [el("p", { class: "tk-mute tk-hello" }, t("p.hello"))]),
      ...(busy ? [el("div", { class: "tk-msg fly tk-typing", "aria-label": t("p.typing") }, el("p", {}, el("i"), el("i"), el("i")))] : []));
    if (atBottom) stream.scrollTop = stream.scrollHeight;
    note.replaceChildren(!me ? "" : !me.can_chat ? t("p.needHold") : me.resting ? t("p.resting") : t("p.left", { n: me.left_today }),
      me && me.can_chat && me.pack ? el("button", { class: "tk-link", type: "button", onclick: () => void open(sitePage()) },
        t("p.buyMore", { n: me.pack.messages, flyai: me.pack.flyai.toLocaleString() })) : "");
    sendBtn.disabled = busy || wait > 0 || !!(me && !me.can_chat);
    sendBtn.textContent = busy ? "…" : wait > 0 ? `${wait}s` : t("p.send");
    chips();
  }
  setInterval(() => { if (wait > 0 && isOpen) { wait--; sendBtn.textContent = wait > 0 ? `${wait}s` : t("p.send"); sendBtn.disabled = busy || wait > 0; } }, 1000);

  // ---- the chat ---------------------------------------------------------------------------------------------------
  async function send(text: string) {
    const id = prefs().fly, s = text.trim();
    if (id == null || !s || busy || wait > 0) return;
    busy = true;
    const tmp = localId--;
    msgs.push({ id: tmp, at: Date.now(), role: "user", text: s, card: null, status: null, desk: null, local: true });
    render(true);
    try {
      const r = await chatSend(id, s, prefs().lang ?? navigator.language.split("-")[0] ?? "en");
      msgs = [...msgs.filter((m) => m.id !== tmp), ...r.messages];
      wait = 30;
      if (me) me.left_today = Math.max(0, me.left_today - 1);
      void loadChat().then(() => render());              // the server's count of what's left
    } catch (e) {
      msgs = msgs.filter((m) => m.id !== tmp);
      if (!signedOut(e)) {
        const m = e instanceof Error ? e.message : "", w = /wait (\d+)s/.exec(m);
        if (w) wait = Number(w[1]); else note.textContent = m;
      }
    } finally {
      busy = false;
      render(true);
    }
  }

  function diff(a: any, b: any, path = ""): string[] {
    const out: string[] = [];
    const v = (x: any) => (x === true ? "on" : x === false ? "off" : x == null ? "-" : Array.isArray(x) ? (x.every((y) => typeof y !== "object") ? x.join(", ") || "-" : `${x.length}`) : typeof x === "object" ? "…" : String(x));
    for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
      if (key === "starter" || key === "v") continue;
      const x = a?.[key], y = b?.[key], p = path ? `${path}.${key}` : key;
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) out.push(...diff(x, y, p));
      else out.push(`${p}: ${v(x)} → ${v(y)}`);
    }
    return out.slice(0, 8);
  }
  function cardView(m: ChatMsg) {
    const c = m.card!, moneyMove = c.kind === "withdraw" || c.kind === "move";
    const body = c.kind === "settings" ? [el("b", {}, c.summary), el("ul", {}, ...diff(c.before, c.after).map((l) => el("li", {}, l)))]
      : c.kind === "watch" ? [el("b", {}, t("p.watchCard", { token: short(c.token) })), el("span", { class: "tk-mute" }, t("p.watchNote"))]
      : c.kind === "withdraw" ? [el("b", {}, t("p.withdrawCard", { pct: c.pct }))]
      : [el("b", {}, t("p.moveCard", { usd: c.usd, to: c.to_chain }))];
    const status = m.status && m.status !== "pending" ? el("span", { class: `tk-mute ${m.status === "approved" ? "tk-up" : m.status === "failed" ? "tk-down" : ""}` },
      t(m.status === "approved" ? "p.done" : m.status === "declined" ? "p.declined" : "p.cardFailed")) : null;
    const actions = m.status === "pending"
      ? moneyMove
        ? el("div", { class: "tk-actions" }, el("span", { class: "tk-mute" }, t("p.onSite")),
          el("button", { class: "tk-btn sm", type: "button", onclick: () => void open(sitePage()) }, t("p.openSite")))
        : el("div", { class: "tk-actions" },
          el("button", { class: "tk-btn sm", type: "button", onclick: () => void answer(m, true) }, t("p.approve")),
          el("button", { class: "tk-btn sm plain", type: "button", onclick: () => void answer(m, false) }, t("p.decline")))
      : null;
    const desk = m.desk ? el("span", { class: `tk-mute ${m.desk.verdict === "pass" ? "tk-up" : m.desk.verdict === "fail" ? "tk-down" : ""}` },
      m.desk.pending ? t("p.deskPending") : `${t("p.desk")} ${m.desk.text ?? ""}`) : null;
    return el("div", { class: `tk-card${moneyMove ? " money" : ""}` }, ...body, actions, status, desk);
  }

  /** approve or decline a card: settings and watch lists through the pet's token; nothing here moves money */
  async function answer(m: ChatMsg, ok: boolean) {
    const id = prefs().fly;
    if (id == null || !m.card) return;
    const mark = (status: string) => { m.status = status; if (status === "approved" && m.card?.kind === "watch") m.desk = { pending: true }; render(); };
    const tell = (status: string) => (m.local ? Promise.resolve() : chatAnswer(id, m.id, status).catch(() => {}));
    try {
      if (!ok) { await tell("declined"); mark("declined"); return; }
      const fresh = await flyFeed(id);                 // the latest settings: change those, not an old copy
      if (!fresh.wallet) throw new Error(t("p.noWallet"));
      if (m.card.kind === "settings") await saveSettings(fresh.wallet, m.card.after, fresh.who);
      else if (m.card.kind === "watch") {
        const base = fresh.settings ?? {};
        const watch = [...new Set([...(base.watch ?? []), m.card.token.toLowerCase()])].slice(0, WATCH_MAX);
        await saveSettings(fresh.wallet, { ...base, watch }, fresh.who);
        await chatWatch(id, m.card.token, m.local ? undefined : m.id).catch(() => {});
      }
      await tell("approved");
      mark("approved");
      void loadFly().then(() => render());
    } catch (e) {
      if (signedOut(e)) return;
      await tell("failed");
      mark("failed");
      note.textContent = e instanceof Error ? e.message : t("set.failed");
    }
  }

  /** a watch card made here, no model needed (the Watch buttons) */
  function watchCard(token: string) {
    const w: string[] = (feed?.settings?.watch ?? []).map((x: string) => x.toLowerCase());
    if (w.includes(token.toLowerCase())) { note.textContent = t("p.already"); return; }
    if (w.length >= WATCH_MAX) { note.textContent = t("p.full", { n: WATCH_MAX }); return; }
    msgs.push({ id: localId--, at: Date.now(), role: "fly", text: t("p.watchAsk"), card: { kind: "watch", token: token.toLowerCase() },
      status: "pending", desk: null, local: true });
    render(true);
  }
  function watchFromBox() {
    const v = watchInput.value.trim();
    if (!ADDRESS.test(v)) { note.textContent = t("p.badToken"); return; }
    watchInput.value = "";
    watchBox.hidden = true;
    watchCard(v);
  }
  watchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); watchFromBox(); } });
  function chips() {
    const ask = (key: Key) => () => void send(t(key));
    const paused = feed?.settings?.trading === false;
    chipsRow.replaceChildren(
      el("button", { class: "tk-chip", type: "button", onclick: ask("p.askDoing") }, t("p.qDoing")),
      el("button", { class: "tk-chip", type: "button", onclick: ask("p.askWant") }, t("p.qWant")),
      el("button", { class: "tk-chip", type: "button", onclick: () => { watchBox.hidden = !watchBox.hidden; if (!watchBox.hidden) watchInput.focus(); } }, t("p.qWatch")),
      el("button", { class: "tk-chip", type: "button", onclick: () => void send(paused ? "resume" : "pause") }, t(paused ? "p.qResume" : "p.qPause")));
  }

  // ---- open / close -----------------------------------------------------------------------------------------------
  function words() {
    input.placeholder = t("p.say");
    watchInput.placeholder = t("p.watchPrompt");
  }
  return {
    open() {
      isOpen = true;
      box.hidden = false;
      words();
      render(true);
      void refresh(true);
      clearInterval(timer); clearInterval(deskTimer);
      timer = window.setInterval(() => void refresh(), REFRESH_MS);
      deskTimer = window.setInterval(() => { if (msgs.some((m) => m.desk?.pending)) void loadChat().then(() => render()); }, DESK_MS);
      setTimeout(() => input.focus(), 50);
    },
    close() {
      isOpen = false;
      box.hidden = true;
      clearInterval(timer); clearInterval(deskTimer);
    },
    isOpen: () => isOpen,
    refresh: () => { if (isOpen) render(); },
  };
}
