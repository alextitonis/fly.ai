/** docs/bounties.html's board, entry forms and admin panel (moved out of the page 2026-10-04). */
import { t, locale } from "./i18n/i18n.js";
// the session and the mine server come from nav.js (window.flyNav) when it loaded; the fallbacks keep the page
// working if it didn't
const NAV = window.flyNav;
// a local mine server can stand in, on a local page only (a session token never goes to another host)
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
const ACCOUNT_JS = "/compute/mine/web/account.js";
// the page's words come from assets/i18n/<lang>/bounties.json (page.js loads them); bounty titles and details stay as written
if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 3000); });
const CAT = (c) => ({ content: t("bounties.cat.content"), dev: t("bounties.cat.dev"), research: t("bounties.cat.research"), art: t("bounties.cat.art"),
  security: t("bounties.cat.security"), community: t("bounties.cat.community") })[c] || c;
const STATUS = (s) => ({ pending: t("bounties.status.pending"), picked: t("bounties.status.picked"), approved: t("bounties.status.approved"),
  rejected: t("bounties.status.rejected"), paid: t("bounties.status.paid") })[s] || s;

// templates for the admin form (bounty ideas, 2026-10-03)
const IDEAS = [
  { title: "Fly meme of the week", kind: "contest", category: "content", winners: 3, reward: "50,000 $FLYAI each",
    summary: "Make the best meme about fly.ai, Flybook or Trader Flies.",
    details: "Post it on X, tag @flydotai and enter the post's link here.\n\nJudged on: creativity first, then how funny it is and how well it does. Plain info posts and AI-made filler score low.\nOne entry per person." },
  { title: "60-second explainer: a real fly brain trades crypto", kind: "contest", category: "content", winners: 2, reward: "250,000 $FLYAI",
    summary: "A short video showing how Trader Flies work, for people who've never heard of us.",
    details: "60-90 s, vertical or horizontal, on X, YouTube or TikTok. Show a real fly's wallet and trades (traderflies/traders).\n\nJudged on: clarity, editing, reach." },
  { title: "My fly's life story", kind: "contest", category: "content", winners: 3, reward: "75,000 $FLYAI",
    summary: "A thread telling the story of your Flybook fly or Trader Fly: friends, enemies, trades, matings.",
    details: "Use real posts, duels, relationships and trades (screenshots welcome). The more dramatic and true, the better." },
  { title: "Best clip from the fly games", kind: "contest", category: "content", winners: 3, reward: "40,000 $FLYAI",
    summary: "Your best Fly Race, Colosseum, Roulette or Slots moment as a short clip.",
    details: "Record it, post it on X with @flydotai, enter the link." },
  { title: "Telegram / Discord bot for fly events", kind: "apply", category: "dev", winners: 1, reward: "500,000 $FLYAI",
    summary: "A bot that posts fly market moves, Colosseum results, new matings and big trades to a chat.",
    details: "Apply with: your plan, which events you'll post, and links to bots you've built.\n\nFinal: open-source repo + a running bot in our community chat. Data from the public APIs only." },
  { title: "flybrain examples and notebooks", kind: "apply", category: "dev", winners: 1, reward: "300,000 $FLYAI",
    summary: "Five clear notebooks for the flybrain pip package: \"make your fly react to X\".",
    details: "pip install flybrain. Each notebook runs on a laptop CPU in under 5 min and explains what the neurons do.\n\nFinal: a PR to the repo." },
  { title: "Independent fairness checker for Roulette and Slots", kind: "apply", category: "dev", winners: 1, reward: "300,000 $FLYAI",
    summary: "A small tool anyone can run to check a game's provably fair seeds.",
    details: "Takes a game id or seeds and recomputes the result from the published commit and reveal.\n\nFinal: open-source repo + a web page." },
  { title: "Beat FLYBRAIN on sshfighter", kind: "contest", category: "dev", winners: 1, reward: "200,000 $FLYAI",
    summary: "Build a bot that beats our connectome fighter on sshfighter.com.",
    details: "Any method. Enter a link to the match replays and your code (can be private until judged)." },
  { title: "Find a new sense the fly brain can read", kind: "apply", category: "research", winners: 1, reward: "up to 1,000,000 $FLYAI",
    summary: "Show a sensory input whose effect can be read from the descending neurons, beyond threat, mate, wind, taste and touch.",
    details: "Pre-register what you'll test and how you'll call it a pass, then run it on the public flybrain package.\n\nFinal: notebook + short write-up. Negative results with a clean method also count." },
  { title: "Translate the site into a new language", kind: "apply", category: "community", winners: 1, reward: "150,000 $FLYAI",
    summary: "Add a language we don't have yet (we have English, 简体, 繁體, 한국어, Türkçe, Español).",
    details: "Native speakers only. Translate docs/assets/i18n/en/*.json.\n\nFinal: a PR." },
  { title: "Fly skins and 3D models", kind: "contest", category: "art", winners: 3, reward: "100,000 $FLYAI",
    summary: "Make fly skins or low-poly 3D models for the Simulation world.",
    details: "glb/fbx under 2 MB, a CC0 or CC-BY license. Enter a link to the files and a render." },
  { title: "Merch design", kind: "contest", category: "art", winners: 2, reward: "100,000 $FLYAI + the shirt",
    summary: "Design a fly shirt or hoodie for shop.flyaiworld.com.",
    details: "Print-ready PNG, 4500x5400. Winning designs go on sale in the store." },
  { title: "Security bug bounty", kind: "contest", category: "security", winners: 100, reward: "$50 / $250 / $1,000+ in $FLYAI",
    summary: "Report bugs in our contracts, games, wallets or desk. Paid by severity.",
    details: "Low $50, medium $250, high/critical $1,000+ (paid in $FLYAI).\n\nDM @flydotai FIRST, don't post it publicly. Then enter here with a private link (gist or doc) to the report. No testing that spends other people's money, and no denial-of-service attacks." },
];

const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
};
const session = NAV?.session || (() => {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.expires_at > Date.now() && s.token ? s : null; } catch { return null; }
});
async function call(path, body) {
  const s = session();
  const r = await fetch(API + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(s ? { "x-flyai-session": s.token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function signIn() {
  try { const acct = await import(ACCOUNT_JS); if (await acct.signIn()) location.reload(); } catch (e) { alert(String(e.message || e)); }
}
/** text with https links made clickable, nothing else interpreted */
function linkify(s) {
  const out = [];
  let last = 0;
  for (const m of s.matchAll(/https:\/\/[^\s<>"')]+/g)) {
    out.push(s.slice(last, m.index), el("a", { href: m[0], target: "_blank", rel: "noopener nofollow" }, m[0]));
    last = m.index + m[0].length;
  }
  out.push(s.slice(last));
  return out;
}
function left(ms) {
  if (!ms) return t("bounties.card.no_deadline");
  const d = ms - Date.now();
  if (d <= 0) return t("bounties.card.closed_on", { date: new Date(ms).toLocaleDateString(locale()) });
  const h = Math.floor(d / 3.6e6);
  return h >= 48 ? t("bounties.card.days_left", { count: Math.floor(h / 24) }) : h >= 1 ? t("bounties.card.hours_left", { count: h })
    : t("bounties.card.minutes_left", { count: Math.max(1, Math.floor(d / 6e4)) });
}

let board = { bounties: [], explorer: "" }, me = null, filter = "open";
const txLink = (h) => el("a", { href: `${board.explorer}/tx/${h}`, target: "_blank", rel: "noopener" }, t("bounties.card.tx", { hash: `${h.slice(0, 10)}…` }));

function renderFilters() {
  const cats = [...new Set(board.bounties.map((b) => b.category))];
  const opts = [["open", t("bounties.filter.open")], ["all", t("bounties.filter.all")], ...cats.map((c) => [c, CAT(c)])];
  $("filters").replaceChildren(...opts.map(([k, label]) =>
    el("button", { type: "button", class: filter === k ? "on" : "", on: { click: () => { filter = k; renderFilters(); renderList(); } } }, label)));
}

function entryForm(b) {
  const s = session();
  const final = b.kind === "apply" && me && me.entries.some((e) => e.bounty_id === b.id && e.stage === "apply" && e.status === "picked");
  const closed = b.status !== "open" || (b.deadline_ms && b.deadline_ms < Date.now()) || (b.kind === "apply" && b.assignee);
  if (!final && closed) return el("p", { class: "msg" }, b.status === "done" ? t("bounties.form.done") : t("bounties.form.closed"));
  if (!s) return el("div", null, el("button", { class: "btn red", type: "button", on: { click: signIn } }, t("bounties.form.sign_in")));
  const stage = final ? "final" : b.kind === "apply" ? "apply" : "entry";
  const had = me?.entries.find((e) => e.bounty_id === b.id && e.stage === stage);
  const handle = had?.x_handle || me?.entries[0]?.x_handle || "";
  const msg = el("p", { class: "msg" });
  const f = el("form", { class: "bform" },
    el("label", null, t("bounties.form.handle"), el("input", { name: "x_handle", placeholder: "@you", value: handle ? "@" + handle : "", required: true, maxlength: "16" })),
    el("label", null, stage === "apply" ? t("bounties.form.link_apply") : stage === "final" ? t("bounties.form.link_final") : t("bounties.form.link_entry"),
      el("input", { name: "link", type: "url", placeholder: "https://", value: had?.link || "", required: true })),
    el("label", null, stage === "apply" ? t("bounties.form.note_apply") : t("bounties.form.note"),
      el("textarea", { name: "note", maxlength: "2000", required: stage === "apply" }, had?.note || "")),
    el("div", null, el("button", { class: "btn red", type: "submit" }, had ? t("bounties.form.update") : stage === "apply" ? t("bounties.form.apply") : stage === "final" ? t("bounties.form.final") : t("bounties.form.enter"))),
    msg);
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    msg.className = "msg"; msg.textContent = "…";
    try {
      await call("/api/bounties/enter", { bounty: b.id, ...d });
      msg.textContent = t("bounties.form.sent");
      await loadMine();
    } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
  });
  return el("div", null, final ? el("p", { class: "msg" }, t("bounties.form.picked")) : null, f);
}

function renderList() {
  const list = board.bounties.filter((b) => filter === "all" || (filter === "open" ? b.status === "open" : b.category === filter));
  if (!list.length) {
    $("list").replaceChildren(el("p", { class: "msg" }, filter === "open" ? t("bounties.list.none_open") : t("bounties.list.none")));
    return;
  }
  const open = new URLSearchParams(location.hash.slice(1)).get("b");
  $("list").replaceChildren(...list.map((b) => {
    const winners = b.winners_list.filter((w) => w.status !== "picked");
    const picked = b.winners_list.find((w) => w.status === "picked");
    return el("details", { class: "card bounty", id: `b${b.id}`, open: String(b.id) === open },
      el("summary", null,
        el("div", null,
          el("div", { class: "tags" },
            el("span", { class: "tag mint" }, b.kind === "apply" ? t("bounties.card.kind_apply") : t("bounties.card.kind_contest")),
            el("span", { class: "tag" }, CAT(b.category)),
            b.status !== "open" ? el("span", { class: "tag dim" }, b.status === "done" ? t("bounties.card.done") : t("bounties.card.closed")) : null),
          el("h3", null, b.title),
          el("p", { class: "sum" }, b.summary)),
        el("div", { class: "rew" }, b.reward,
          el("small", null, [b.winners > 1 && b.winners < 100 ? t("bounties.card.winners", { count: b.winners }) : null, left(b.deadline_ms),
            b.kind === "apply" ? t("bounties.card.applied", { count: b.entries }) : t("bounties.card.entered", { count: b.entries })].filter(Boolean).join(" · ")))),
      el("div", { class: "bbody" },
        b.details ? el("p", { class: "details" }, ...linkify(b.details)) : null,
        picked ? el("p", { class: "msg" }, t("bounties.card.building", { handle: picked.x_handle })) : null,
        winners.length ? el("div", null, el("h4", { style: "margin: 0 0 8px" }, t("bounties.card.winners_title")),
          el("ul", { class: "winners" }, ...winners.map((w) => el("li", null,
            el("a", { href: `https://x.com/${w.x_handle}`, target: "_blank", rel: "noopener" }, `@${w.x_handle}`), " ",
            w.link ? el("a", { href: w.link, target: "_blank", rel: "noopener nofollow" }, t("bounties.card.work")) : null,
            w.reward ? ` · ${w.reward}` : "", w.tx_hash ? [" · ", txLink(w.tx_hash)] : w.status === "approved" ? ` · ${t("bounties.card.payout_coming")}` : "")))) : null,
        entryForm(b)));
  }));
  if (open) document.getElementById(`b${open}`)?.scrollIntoView({ block: "start" });
}

function renderMine() {
  if (!me || !me.entries.length) { $("mine-sec").hidden = true; return; }
  $("mine-sec").hidden = false;
  const title = (id) => board.bounties.find((b) => b.id === id)?.title || `Bounty #${id}`;
  $("mine").replaceChildren(...me.entries.map((e) => el("div", { class: "card" },
    el("b", { style: "color: var(--text)" }, title(e.bounty_id)), ` · ${e.stage === "apply" ? t("bounties.mine.application") : e.stage === "final" ? t("bounties.mine.final") : t("bounties.mine.entry")} · `,
    STATUS(e.status), e.reward ? ` · ${e.reward}` : "", e.tx_hash ? [" · ", txLink(e.tx_hash)] : "",
    e.review_note ? el("div", { style: "margin-top: 6px" }, `${t("bounties.mine.team")} `, e.review_note) : null)));
}

async function loadBoard() {
  try { board = await call("/api/bounties"); } catch (e) { $("list").replaceChildren(el("p", { class: "msg err" }, t("bounties.list.load_error", { error: e.message }))); return; }
  renderFilters(); renderList();
}
async function loadMine() {
  if (!session()) return;
  try { me = await call("/api/bounties/mine"); } catch { me = null; }
  renderMine(); renderList();
  if (me?.admin) loadAdmin();
}

// ---- admin --------------------------------------------------------------------------------------------------------
let adm = null;
const af = $("aform");
$("idea").append(...IDEAS.map((x, i) => el("option", { value: String(i) }, `${x.category}: ${x.title}`)));
$("idea").addEventListener("change", () => { const x = IDEAS[Number($("idea").value)]; if (x) fill({ ...x, id: "", status: "draft", deadline_ms: null }); });
const pad = (n) => String(n).padStart(2, "0");
const localInput = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function fill(b) {
  for (const k of ["id", "title", "kind", "category", "status", "reward", "winners", "summary", "details"]) af.elements[k].value = b[k] ?? "";
  af.elements.deadline.value = localInput(b.deadline_ms);
  af.scrollIntoView({ block: "start" });
}
$("areset").addEventListener("click", () => { $("idea").value = ""; setTimeout(() => { af.elements.id.value = ""; }, 0); });
af.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const d = Object.fromEntries(new FormData(af));
  const body = { ...d, id: d.id ? Number(d.id) : undefined, winners: Number(d.winners || 1), deadline_ms: d.deadline ? new Date(d.deadline).getTime() : null };
  delete body.deadline;
  $("amsg").className = "msg"; $("amsg").textContent = "…";
  try {
    const saved = await call("/api/admin/bounties", body);
    af.elements.id.value = saved.id;
    $("amsg").textContent = `Saved #${saved.id} (${saved.status}).${saved.status === "draft" ? " Set the status to open to publish it." : ""}`;
    await Promise.all([loadAdmin(), loadBoard()]);
  } catch (e) { $("amsg").className = "msg err"; $("amsg").textContent = e.message; }
});
async function review(id, body, msg) {
  msg.textContent = "…";
  try { await call("/api/admin/bounties/entry", { id, ...body }); await Promise.all([loadAdmin(), loadBoard()]); }
  catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
}
async function loadAdmin() {
  try { adm = await call("/api/admin/bounties"); } catch (e) { return; }
  $("admin").classList.add("show");
  $("abounties").replaceChildren(...adm.bounties.map((b) => {
    const entries = adm.entries.filter((e) => e.bounty_id === b.id);
    const pending = entries.filter((e) => e.status === "pending").length;
    return el("details", { class: "card adm-b" },
      el("summary", null, `#${b.id} ${b.title} · ${b.status} · ${b.kind} · ${entries.length} entries${pending ? ` (${pending} to review)` : ""}`),
      el("div", { style: "margin: 10px 0; display: flex; gap: 8px; flex-wrap: wrap;" },
        el("button", { class: "btn sm", type: "button", on: { click: () => fill(b) } }, "Edit"),
        el("a", { class: "btn sm", href: `/bounties#b=${b.id}`, target: "_blank" }, "Public link")),
      ...entries.map((e) => {
        const msg = el("span", { class: "msg" });
        const reward = el("input", { placeholder: "reward", value: e.reward || "", size: "14" });
        const tx = el("input", { placeholder: "payout tx 0x…", value: e.tx_hash || "", size: "22" });
        const note = el("input", { placeholder: "note to them", value: e.review_note || "", size: "18" });
        const btn = (label, status) => el("button", { class: "btn sm", type: "button", on: { click: () => review(e.id, { status, reward: reward.value, review_note: note.value }, msg) } }, label);
        return el("div", { class: "adm-entry" },
          el("div", null, el("b", { style: "color: var(--text)" }, `${e.stage} · ${e.status}`), " · ",
            el("a", { href: `https://x.com/${e.x_handle}`, target: "_blank", rel: "noopener" }, `@${e.x_handle}`), " · ",
            el("code", null, e.wallet), e.wallet_entries > 3 ? el("span", { class: "flag" }, ` · ${e.wallet_entries} entries from this wallet`) : null),
          el("div", null, el("a", { href: e.link, target: "_blank", rel: "noopener nofollow" }, e.link)),
          e.note ? el("div", { class: "details" }, e.note) : null,
          el("div", { class: "acts" }, reward, note,
            e.stage === "apply" ? btn("Pick", "picked") : btn("Approve", "approved"), btn("Reject", "rejected"), btn("Pending", "pending"),
            tx, el("button", { class: "btn sm", type: "button", on: { click: () => review(e.id, { tx_hash: tx.value, reward: reward.value }, msg) } }, "Mark paid"),
            msg));
      }));
  }));
  $("blocked").textContent = `Blocked: ${adm.blocked.map((x) => x.value).join(", ") || "none"}`;
}
async function block(unblock) {
  const f = $("bform");
  $("bmsg").className = "msg"; $("bmsg").textContent = "…";
  try { const r = await call("/api/admin/bounties/block", { value: f.elements.value.value, reason: f.elements.reason.value, unblock }); $("bmsg").textContent = `${r.value} ${r.blocked ? "blocked" : "unblocked"}`; loadAdmin(); }
  catch (e) { $("bmsg").className = "msg err"; $("bmsg").textContent = e.message; }
}
$("bform").addEventListener("submit", (ev) => { ev.preventDefault(); block(false); });
$("unblock").addEventListener("click", () => block(true));

await loadBoard();
await loadMine();
