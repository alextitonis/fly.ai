// The pet's own window (2026-11-13, the user: "when opening always ask to auth, which is needed, then it needs you to select a
// fly, this will show the logs what it does, also should be able to ask if it wants something, will be showing the alpha calls
// that the discord does, also chat can make it like watch these (a button to make it easy in the ui)").
//   1. connect: the site signs the holder in, the app gets the address and the pet token (mine src/pet.ts)
//   2. pick: one of the wallet's flies or partner NFTs (the fly chat's inbox), the one that lives on the desktop
//   3. the fly: its log, a chat (cards approved here: settings and watch lists only; money moves open the site), the alpha calls
import { t, type Key } from "./i18n.ts";
import {
  alphaCalls, applyLang, chatAnswer, chatRead, chatSend, chatWatch, claimLink, flyFeed, inbox, newLink, prefs, saveSettings,
  setPrefs, signedIn, SignedOut, type AlphaCall, type ChatMe, type ChatMsg, type FlyFeed, type InboxRow, type Who,
} from "./store.ts";

const native = window.flyNative;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SITE = "https://www.flyaiworld.com";
const LINK_POLL_MS = 3000, FLY_MS = 60_000, CHAT_MS = 20_000, ALPHA_MS = 120_000, WATCH_MAX = 5;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string | null | false | undefined)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, String(v));
  }
  e.append(...kids.filter((k): k is Node | string => k != null && k !== false));
  return e;
};
const money = (n: number | null | undefined) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`);
const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const open = (url: string) => (native ? native.openUrl(url) : (window.open(url), Promise.resolve()));
const say = (k: Key, vars?: Record<string, string | number>) => t(k, vars);

function words() {
  applyLang();
  document.querySelectorAll<HTMLElement>("[data-t]").forEach((x) => { x.textContent = t(x.dataset.t as Key); });
  $<HTMLInputElement>("chatInput").placeholder = t("p.say");
  $<HTMLInputElement>("watchInput").placeholder = t("p.watchPrompt");
  $<HTMLInputElement>("coachNote").placeholder = t("c.note");
}

// ---- which step ---------------------------------------------------------------------------------------------------
function show(step: "connect" | "pick" | "fly" | "coach") {
  $("stepCoach").hidden = step !== "coach";
  $("stepConnect").hidden = step !== "connect";
  $("stepPick").hidden = step !== "pick";
  $("stepFly").hidden = step !== "fly";
}
function route() {
  const p = prefs();
  if (!signedIn(p)) { show("connect"); return; }
  if (coachPick) { show("coach"); void fillCoach(); return; }
  if (p.fly == null) { show("pick"); void fillPick(); return; }
  // picked: its chat opens on the fly itself (src/talk.ts) and this window goes away
  if (native) { native.closePanel(); return; }
  show("fly");
  void loadFly();
}
const signedOut = (e: unknown) => {
  if (e instanceof SignedOut) { $("connectNote").textContent = t("p.signedOut"); route(); return true; }
  return false;
};

// ---- 1. connect ---------------------------------------------------------------------------------------------------
let linking = false;
$("connect").addEventListener("click", async () => {
  if (linking) return;
  linking = true;
  const btn = $<HTMLButtonElement>("connect"), note = $("connectNote");
  btn.disabled = true;
  note.classList.remove("error");
  try {
    const link = await newLink();
    await open(link.url);
    note.textContent = t("set.waiting");
    while (Date.now() < link.expires_at) {
      await new Promise((r) => setTimeout(r, LINK_POLL_MS));
      const got = await claimLink(link.code, link.secret);
      if (got.status === "linked" && got.wallet) {
        if (!got.token) throw new Error(t("set.failed"));
        const changed = prefs().wallet?.toLowerCase() !== got.wallet.toLowerCase();
        setPrefs({ wallet: got.wallet, petToken: got.token, petTokenUntil: got.token_expires_at ?? 0, ...(changed ? { fly: null, flies: null } : {}) });
        note.textContent = "";
        route();
        return;
      }
    }
    throw new Error(t("set.expired"));
  } catch (err) {
    note.textContent = err instanceof Error ? err.message : t("set.failed");
    note.classList.add("error");
  } finally {
    linking = false;
    btn.disabled = false;
  }
});
function signOut() {
  setPrefs({ petToken: null, petTokenUntil: 0, fly: null });
  route();
}
$("signOut1").addEventListener("click", signOut);

// ---- 2. pick a fly ------------------------------------------------------------------------------------------------
const nameOf = (r: { fly: number; who?: Who | null }) => (r.who ? `${r.who.name} #${r.who.token}` : say("p.flyName", { id: r.fly }));
function avatar(who: Who | null | undefined) {
  return who?.image ? el("span", { class: "av" }, el("img", { src: who.image, alt: "" })) : el("span", { class: "av" }, "🪰");
}
async function fillPick() {
  const list = $("pickList"), note = $("pickNote");
  list.replaceChildren(el("p", { class: "mute" }, t("p.loading")));
  note.textContent = "";
  note.classList.remove("error");
  const slow = setTimeout(() => { note.textContent = t("p.slow"); }, 8000);
  try {
    const { flies } = await inbox();
    list.replaceChildren(...flies.map((r) => el("button", { class: "pick", type: "button", onclick: () => { setPrefs({ fly: r.fly }); route(); } },
      avatar(r.who), el("span", { class: "grow" }, el("b", {}, nameOf(r)), el("br"), el("span", { class: "mute" }, r.funded ? say("p.funded") : say("set.noMoney"))))));
    note.textContent = flies.length ? "" : t("p.noFlies");
  } catch (e) {
    console.error("fly list:", e);
    if (signedOut(e)) return;
    list.replaceChildren(el("button", { class: "plain small", type: "button", onclick: () => void fillPick() }, t("p.retry")));
    note.textContent = `${t("set.readFailed")} ${e instanceof Error ? e.message : ""}`;
    note.classList.add("error");
  } finally {
    clearTimeout(slow);
  }
}

// ---- the game coach's window (src/coach.ts): the open windows, pick the game ---------------------------------------
let coachPick = location.hash === "#coach";
async function fillCoach() {
  const list = $("coachList"), msg = $("coachMsg"), note = $<HTMLInputElement>("coachNote");
  note.value = prefs().coachNote ?? "";
  if (!native) { msg.textContent = t("c.appOnly"); return; }
  list.replaceChildren(el("p", { class: "mute" }, t("p.loading")));
  const wins = await native.coachSources().catch(() => []);
  const had = prefs().coachSource?.name;
  list.replaceChildren(...wins.map((w) => el("button", { class: `win${w.name === had ? " on" : ""}`, type: "button", title: w.name,
    onclick: async () => {
      msg.textContent = "…";
      const process = await native.coachProcess(w.name).catch(() => null);
      setPrefs({ coachSource: { id: w.id, name: w.name, process }, coachNote: note.value.trim().slice(0, 300) });
      coachPick = false;
      window.close();
    } }, el("img", { src: w.thumb, alt: "" }), el("span", {}, w.name))));
  msg.textContent = wins.length ? "" : t("c.noWindows");
}
$("coachRefresh").addEventListener("click", () => void fillCoach());
$<HTMLInputElement>("coachNote").addEventListener("change", (e) => setPrefs({ coachNote: (e.target as HTMLInputElement).value.trim().slice(0, 300) }));

// ---- 3. the fly ---------------------------------------------------------------------------------------------------
let feed: FlyFeed | null = null;
let tab: "log" | "chat" | "alpha" = "log";
document.querySelectorAll<HTMLButtonElement>("nav [data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab as typeof tab)));
function setTab(next: typeof tab) {
  tab = next;
  document.querySelectorAll<HTMLButtonElement>("nav [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === next));
  $("paneLog").hidden = next !== "log";
  $("paneChatBox").hidden = next !== "chat";
  $("paneAlpha").hidden = next !== "alpha";
  if (next === "chat") void loadChat(true);
  if (next === "alpha") void loadAlpha();
}
$("change").addEventListener("click", () => { setPrefs({ fly: null }); route(); });

async function loadFly() {
  const id = prefs().fly;
  if (id == null) return;
  try {
    feed = await flyFeed(id);
    const f = feed.fly;
    $("flyName").textContent = nameOf({ fly: id, who: feed.who });
    $("flyAv").replaceWith(Object.assign(avatar(feed.who), { id: "flyAv" }));
    $("flyStats").textContent = f && f.funded ? say("p.stats", { value: money(f.value), all: signedMoney(f.profit), today: signedMoney(f.profit_24h) }) : say("set.noMoney");
    renderLog();
    chips();
  } catch (e) {
    $("paneLog").replaceChildren(el("p", { class: "mute" }, e instanceof Error ? e.message : t("set.readFailed")));
  }
}
function renderLog() {
  const rows = (feed?.log ?? []).filter((r) => r.type === "trade" || r.type === "move");
  $("paneLog").replaceChildren(...(rows.length ? rows.map((r) => {
    const what = r.type === "trade"
      ? el("span", { class: "grow" }, el("b", { class: r.side === "buy" ? "up" : "down" }, `${r.side} `), `${r.symbol ?? ""} `,
        r.usd != null ? money(r.usd) : "", r.status && r.status !== "filled" ? el("span", { class: "mute" }, ` · ${r.status}`) : null,
        r.pnl_pct != null ? el("span", { class: r.pnl_pct >= 0 ? "up" : "down" }, ` ${r.pnl_pct > 0 ? "+" : ""}${r.pnl_pct}%`) : null,
        r.why ? el("div", { class: "why" }, r.why) : null)
      : el("span", { class: "grow" }, `${r.kind ?? ""} `, r.usd != null ? money(r.usd) : "");
    return el("div", { class: "row" }, el("span", { class: "when" }, when(r.at)), what);
  }) : [el("p", { class: "mute" }, t("p.noLog"))]));
}

// ---- the chat -----------------------------------------------------------------------------------------------------
let msgs: ChatMsg[] = [], me: ChatMe | null = null, wait = 0, busy = false, localId = -1;
async function loadChat(scroll = false) {
  const id = prefs().fly;
  if (id == null) return;
  try {
    const r = await chatRead(id);
    msgs = [...r.messages, ...msgs.filter((m) => m.local)].sort((a, b) => a.at - b.at || a.id - b.id);
    me = r.me; wait = r.me.wait_s;
    renderChat(scroll);
  } catch (e) {
    if (signedOut(e)) return;
    $("chatNote").textContent = e instanceof Error ? e.message : t("set.readFailed");
  }
}
function renderChat(scroll = false) {
  const box = $("chat"), pane = box.parentElement!;
  const atBottom = scroll || pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
  box.replaceChildren(...(msgs.length ? msgs.map((m) => el("div", { class: `msg ${m.role}` }, el("p", {}, m.text), m.card ? cardView(m) : null))
    : [el("p", { class: "mute" }, t("p.hello"))]));
  if (atBottom) pane.scrollTop = pane.scrollHeight;
  const note = $("chatNote");
  note.textContent = !me ? "" : !me.can_chat ? t("p.needHold") : me.resting ? t("p.resting") : t("p.left", { n: me.left_today });
  $<HTMLButtonElement>("chatSend").disabled = busy || wait > 0 || !!(me && !me.can_chat);
  $<HTMLButtonElement>("chatSend").textContent = busy ? "…" : wait > 0 ? `${wait}s` : t("p.send");
}
setInterval(() => { if (wait > 0) { wait--; if (tab === "chat") renderChat(); } }, 1000);

async function send(text: string) {
  const id = prefs().fly, s = text.trim();
  if (id == null || !s || busy || wait > 0) return;
  busy = true;
  const tmp = localId--;
  msgs.push({ id: tmp, at: Date.now(), role: "user", text: s, card: null, status: null, desk: null, local: true });
  renderChat(true);
  try {
    const r = await chatSend(id, s, prefs().lang ?? navigator.language.split("-")[0] ?? "en");
    msgs = [...msgs.filter((m) => m.id !== tmp), ...r.messages];
    wait = 30;
    if (me) me.left_today = Math.max(0, me.left_today - 1);
  } catch (e) {
    msgs = msgs.filter((m) => m.id !== tmp);
    if (!signedOut(e)) {
      const m = e instanceof Error ? e.message : "", w = /wait (\d+)s/.exec(m);
      if (w) wait = Number(w[1]); else $("chatNote").textContent = m;
    }
  } finally {
    busy = false;
    renderChat(true);
  }
}
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("chatInput");
  const text = input.value;
  input.value = "";
  void send(text);
});

/** the settings a card changes, flattened ("risk: 3 → 2"), at most 8 */
function diff(a: any, b: any, path = ""): string[] {
  const out: string[] = [];
  const v = (x: any) => (x === true ? "on" : x === false ? "off" : x == null ? "-" : Array.isArray(x) ? (x.every((y) => typeof y !== "object") ? x.join(", ") || "-" : `${x.length}`) : typeof x === "object" ? "…" : String(x));
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (k === "starter" || k === "v") continue;
    const x = a?.[k], y = b?.[k], p = path ? `${path}.${k}` : k;
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) out.push(...diff(x, y, p));
    else out.push(`${p}: ${v(x)} → ${v(y)}`);
  }
  return out.slice(0, 8);
}
function cardView(m: ChatMsg) {
  const c = m.card!, moneyMove = c.kind === "withdraw" || c.kind === "move";
  const body = c.kind === "settings" ? [el("b", {}, c.summary), el("ul", {}, ...diff(c.before, c.after).map((l) => el("li", {}, l)))]
    : c.kind === "watch" ? [el("b", {}, t("p.watchCard", { token: short(c.token) })), el("span", { class: "mute" }, t("p.watchNote"))]
    : c.kind === "withdraw" ? [el("b", {}, t("p.withdrawCard", { pct: c.pct }))]
    : [el("b", {}, t("p.moveCard", { usd: c.usd, to: c.to_chain }))];
  const status = m.status && m.status !== "pending" ? el("span", { class: `mute ${m.status === "approved" ? "up" : m.status === "failed" ? "down" : ""}` },
    t(m.status === "approved" ? "p.done" : m.status === "declined" ? "p.declined" : "p.cardFailed")) : null;
  const actions = m.status === "pending"
    ? moneyMove
      ? el("div", { class: "actions" }, el("span", { class: "mute" }, t("p.onSite")),
        el("button", { class: "small", type: "button", onclick: () => void open(sitePage()) }, t("p.openSite")))
      : el("div", { class: "actions" },
        el("button", { class: "small", type: "button", onclick: () => void answer(m, true) }, t("p.approve")),
        el("button", { class: "small plain", type: "button", onclick: () => void answer(m, false) }, t("p.decline")))
    : null;
  const desk = m.desk ? el("span", { class: `mute ${m.desk.verdict === "pass" ? "up" : m.desk.verdict === "fail" ? "down" : ""}` },
    m.desk.pending ? t("p.deskPending") : `${t("p.desk")} ${m.desk.text ?? ""}`) : null;
  return el("div", { class: `card${moneyMove ? " money" : ""}` }, ...body, actions, status, desk);
}
const sitePage = () => feed?.who?.page ? SITE + feed.who.page : `${SITE}/traderflies/fly?id=${prefs().fly}`;

/** approve or decline a card: settings and watch lists go through the pet's token; nothing here moves money */
async function answer(m: ChatMsg, ok: boolean) {
  const id = prefs().fly;
  if (id == null || !m.card) return;
  const mark = (status: string) => { m.status = status; if (status === "approved" && m.card?.kind === "watch") m.desk = { pending: true }; renderChat(); };
  const tell = (status: string) => (m.local ? Promise.resolve() : chatAnswer(id, m.id, status).catch(() => {}));
  try {
    if (!ok) { await tell("declined"); mark("declined"); return; }
    const fresh = await flyFeed(id);                   // the latest settings: change those, not an old copy
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
    void loadFly();
  } catch (e) {
    if (signedOut(e)) return;
    await tell("failed");
    mark("failed");
    $("chatNote").textContent = e instanceof Error ? e.message : t("set.failed");
  }
}

/** a watch card made here, no model needed (the "watch these" button, the alpha calls) */
function watchCard(token: string) {
  const w: string[] = (feed?.settings?.watch ?? []).map((x: string) => x.toLowerCase());
  if (w.includes(token.toLowerCase())) { $("chatNote").textContent = t("p.already"); return; }
  if (w.length >= WATCH_MAX) { $("chatNote").textContent = t("p.full", { n: WATCH_MAX }); return; }
  msgs.push({ id: localId--, at: Date.now(), role: "fly", text: t("p.watchAsk"), card: { kind: "watch", token: token.toLowerCase() },
    status: "pending", desk: null, local: true });
  setTab("chat");
  renderChat(true);
}
function chips() {
  const ask = (k: Key) => () => void send(t(k));
  const paused = feed?.settings?.trading === false;
  $("chips").replaceChildren(
    el("button", { class: "small plain", type: "button", onclick: ask("p.askDoing") }, t("p.qDoing")),
    el("button", { class: "small plain", type: "button", onclick: ask("p.askWant") }, t("p.qWant")),
    el("button", { class: "small plain", type: "button", onclick: () => { $("watchBox").hidden = !$("watchBox").hidden; $("watchInput").focus(); } }, t("p.qWatch")),
    el("button", { class: "small plain", type: "button", onclick: () => void send(paused ? "resume" : "pause") }, t(paused ? "p.qResume" : "p.qPause")));
}
$("watchGo").addEventListener("click", () => {
  const v = $<HTMLInputElement>("watchInput").value.trim();
  if (!ADDRESS.test(v)) { $("chatNote").textContent = t("p.badToken"); return; }
  $<HTMLInputElement>("watchInput").value = "";
  $("watchBox").hidden = true;
  watchCard(v);
});

// ---- the alpha calls (the Discord bot's, discord/src/alpha.ts) ----------------------------------------------------------
const k = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
async function loadAlpha() {
  const pane = $("paneAlpha");
  try {
    const { calls } = await alphaCalls();
    pane.replaceChildren(...(calls.length ? calls.map(callView) : [el("p", { class: "mute" }, t("p.alphaNone"))]));
  } catch (e) {
    pane.replaceChildren(el("p", { class: "mute" }, e instanceof Error ? e.message : t("set.readFailed")));
  }
}
function callView(c: AlphaCall) {
  const rh = c.chain === "robinhood" || c.chain === "";
  const watched = (feed?.settings?.watch ?? []).map((x: string) => x.toLowerCase()).includes(c.ca.toLowerCase());
  const chart = `https://dexscreener.com/${c.chain || "robinhood"}/${c.ca}`;
  return el("div", { class: "call" },
    el("div", { class: "top" }, c.image ? el("span", { class: "av" }, el("img", { src: c.image, alt: "" })) : el("span", { class: "av" }, "📣"),
      el("span", { class: "grow" }, el("b", {}, `$${c.symbol}`), el("span", { class: "mute" }, ` · ${c.chain || "robinhood"} · ${when(c.at)}`), el("br"), c.head)),
    c.why ? el("span", { class: "mute" }, c.why) : null,
    el("div", { class: "stats" }, el("span", {}, `MC ${k(c.mcap)}`), el("span", {}, `Liq ${k(c.liq)}`), el("span", {}, `Vol ${k(c.vol24)}`)),
    el("span", { class: "ca" }, c.ca),
    el("div", { class: "actions" },
      rh ? el("button", { class: "small", type: "button", disabled: watched, onclick: () => watchCard(c.ca) }, t(watched ? "p.watching" : "p.watch"))
        : el("span", { class: "mute" }, t("p.rhOnly")),
      el("button", { class: "small plain", type: "button", onclick: () => void open(chart) }, t("p.chart")),
      el("button", { class: "small plain", type: "button", onclick: (e: Event) => { void navigator.clipboard.writeText(c.ca); (e.target as HTMLElement).textContent = t("p.copied"); } }, t("p.copy"))));
}

// ---- start --------------------------------------------------------------------------------------------------------
words();
route();
window.addEventListener("storage", () => { words(); });
setInterval(() => { if (!$("stepFly").hidden) { void loadFly(); if (tab === "chat") void loadChat(); } }, FLY_MS);
setInterval(() => { if (!$("stepFly").hidden && tab === "chat" && msgs.some((m) => m.desk?.pending)) void loadChat(); }, CHAT_MS);
setInterval(() => { if (!$("stepFly").hidden && tab === "alpha") void loadAlpha(); }, ALPHA_MS);
native?.onPanel?.((what: string) => { if (what === "pick") setPrefs({ fly: null }); coachPick = what === "coach"; route(); });
if (location.hash === "#pick") { setPrefs({ fly: null }); route(); }
