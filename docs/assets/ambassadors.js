/** docs/ambassadors.html (2026-11-09): what ambassadors get, who they are (FlyBadges #12 holders, blue check) and the
 *  application form. Server: mine/src/ambassadors.ts; plan: flytrade/AMBASSADOR-PLAN.md. */
import { t, locale } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 3000); });

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
const short = (w) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const day = (v) => new Date(v).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
const LANGS = ["zh", "ko", "tr", "es", "en", "other"];

async function people() {
  try {
    const d = await call("/api/ambassadors");
    if (!d.ambassadors?.length) return;
    $("amb-list").replaceChildren(el("ul", { class: "amb-people" }, ...d.ambassadors.map((a) => el("li", null,
      el("a", { href: "#", "data-fly-profile": a.wallet, title: a.wallet }, a.name || (a.x ? `@${a.x}` : short(a.wallet))),
      el("span", { class: "fly-verified", title: "fly.ai ambassador" }, "✓"),
      a.lang ? el("span", { class: "tag" }, t(`ambassadors.apply.langs.${a.lang}`)) : null,
      el("small", null, t("ambassadors.list.since", { date: day(a.since) }))))));
  } catch { /* the "none yet" line stays */ }
}

function form(me) {
  const app = me.application;
  if (me.ambassador) return $("amb-form").replaceChildren(el("p", { class: "amb-msg" }, t("ambassadors.apply.already")));
  const field = (key, input) => el("label", null, t(`ambassadors.apply.${key}`), input);
  const name = el("input", { maxlength: 60, value: app?.name || "", autocomplete: "nickname" });
  const x = el("input", { maxlength: 40, value: app?.x ? `@${app.x}` : "", placeholder: "@" });
  const tg = el("input", { maxlength: 40, value: app?.telegram ? `@${app.telegram}` : "", placeholder: "@" });
  const lang = el("select", null, ...LANGS.map((l) => el("option", { value: l, selected: (app?.lang || "zh") === l }, t(`ambassadors.apply.langs.${l}`))));
  const community = el("textarea", { maxlength: 400 }); community.value = app?.community || "";
  const why = el("textarea", { maxlength: 800 }); why.value = app?.why || "";
  const msg = el("p", { class: "amb-msg" }, app ? t("ambassadors.apply.update", { date: day(app.at) }) : "");
  const send = el("button", { class: "btn red", type: "submit" }, t("ambassadors.apply.send"));
  const f = el("form", { class: "amb-form", on: { submit: async (e) => {
    e.preventDefault();
    send.disabled = true; msg.className = "amb-msg"; msg.textContent = "…";
    try {
      await call("/api/ambassadors/apply", { name: name.value, x: x.value, telegram: tg.value, lang: lang.value, community: community.value, why: why.value });
      msg.textContent = t("ambassadors.apply.sent");
    } catch (err) {
      msg.className = "amb-msg err"; msg.textContent = t("ambassadors.apply.failed", { error: err.message });
    } finally { send.disabled = false; }
  } } },
    field("name", name), el("div", { class: "amb-row" }, field("x", x), field("telegram", tg)), field("lang", lang),
    field("community", community), field("why", why), send, msg);
  $("amb-form").replaceChildren(f);
}

async function signedIn() {
  if (!session()) return;
  try { form(await call("/api/ambassadors/me")); } catch { /* stays on the sign-in prompt */ }
}

people();
signedIn();
addEventListener("flyai:session", signedIn);
