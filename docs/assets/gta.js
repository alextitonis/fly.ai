/** docs/gta.html (2026-10-23): the GTA VI giveaway - the pot's bar, whether the signed-in wallet is in, the current and
 *  past winners, the winner's contact form and the team's draw list. Numbers from the mine server (mine/src/gta.ts). */
import { t, locale } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const READ = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? API : NAV?.MINE_READ || API;
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
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.expires_at > Date.now() && s.wallet && s.token ? s : null; } catch { return null; }
});
async function call(path, body, base = API) {
  const s = session();
  const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(s && base === API ? { "x-flyai-session": s.token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const usd = (v) => `$${(Number(v) || 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => Number(v).toLocaleString(locale(), { maximumFractionDigits: 0 });
const day = (v) => new Date(v).toLocaleDateString(locale(), { day: "numeric", month: "short" });
const short = (w) => `${w.slice(0, 6)}…${w.slice(-4)}`;

function bar(v) {
  const open = Date.now() < v.end;
  $("gta-round").textContent = t("gta.bar.round", { n: v.giveaway });
  const days = Math.max(0, Math.ceil((v.end - Date.now()) / 86_400_000));
  $("gta-days").textContent = open ? t("gta.bar.days", { count: days }) : t("gta.bar.over");
  $("gta-fill").style.width = `${Math.max(1, v.progress_pct)}%`;
  $("gta-track").setAttribute("aria-valuenow", String(Math.round(v.progress_pct)));
  $("gta-pct").textContent = `${v.progress_pct.toLocaleString(locale(), { maximumFractionDigits: 1 })}%`;
  $("gta-left").textContent = t("gta.bar.left", { have: usd(v.progress_usd), price: usd(v.price_usd), left: usd(v.left_usd) });
  $("gta-fees").textContent = t("gta.bar.fees", { total: usd(v.fees_usd.total), pot: usd(v.pot_usd), copies: v.copies_funded });
}

const statusTag = (s) => el("span", { class: `tag${s === "sent" ? " mint" : ""}` }, t(`gta.status.${s}`));
const proof = (r, explorer) => r.seed_hash
  ? el("a", { class: "mono", href: `${explorer}/block/${r.seed_block}`, target: "_blank", rel: "noopener" }, t("gta.winner.block", { n: r.seed_block }))
  : null;

function current(v, me) {
  const r = v.current;
  if (!r) return;
  const box = $("gta-current");
  if (r.status === "waiting") {
    box.replaceChildren(el("p", { class: "gta-status" }, t("gta.winner.drawing", { n: r.round })),
      el("p", { class: "gta-muted" }, t("gta.winner.waiting", { entrants: r.entrants, block: r.seed_block })));
    return;
  }
  const mine = me && r.winner === me;
  box.replaceChildren(...[
    el("p", { class: "gta-muted" }, t("gta.winner.round", { n: r.round, date: day(r.drawn_at) }), " ", statusTag(r.status)),
    el("p", { class: "gta-big" }, mine ? t("gta.winner.you") : short(r.winner)),
    el("p", { class: "gta-muted" }, t("gta.winner.odds", { held: num(r.winner_weight), entrants: r.entrants }), " · ", proof(r, v.explorer)),
    r.note ? el("p", { class: "gta-muted" }, r.note) : null,
    mine && r.status === "won" ? contactForm(r) : null].filter(Boolean));
}

function contactForm(r) {
  const input = el("input", { maxlength: "120", placeholder: t("gta.contact.hint") });
  const msg = el("p", { class: "gta-muted" }, r.contacted ? t("gta.contact.got") : t("gta.contact.ask"));
  const go = el("button", { class: "btn red", type: "button", on: { click: async () => {
    msg.textContent = "…";
    try { await call("/api/gta/contact", { contact: input.value }); msg.textContent = t("gta.contact.got"); input.value = ""; }
    catch (e) { msg.textContent = e.message; }
  } } }, t("gta.contact.send"));
  return el("div", null, msg, el("div", { class: "gta-row" }, input, go));
}

function past(v) {
  const rows = v.past;
  const head = el("tr", null, ...["round", "winner", "held", "status"].map((k) => el("th", null, t(`gta.past.th.${k}`))));
  $("gta-past").replaceChildren(el("thead", null, head), el("tbody", null, ...(rows.length
    ? rows.map((r) => el("tr", null, el("td", { class: "mono" }, `#${r.round}`),
        el("td", { class: "mono" }, r.winner_short ?? "—", " ", proof(r, v.explorer)),
        el("td", { class: "mono" }, r.winner_weight ? num(r.winner_weight) : "—"), el("td", null, statusTag(r.status))))
    : [el("tr", null, el("td", { colspan: "4", class: "gta-muted" }, t("gta.past.empty")))])));
}

function meBox(v) {
  const m = v.me;
  if (!m) return;
  const body = [el("p", { class: `gta-status${m.eligible ? " in" : ""}` }, t(m.eligible ? "gta.me.in" : "gta.me.out")),
    el("p", { class: "gta-muted" }, t("gta.me.holding", { n: num(m.holding), wallet: short(m.wallet) }))];
  if (m.eligible) body.push(el("p", { class: "gta-muted" }, t("gta.me.odds", { pct: m.odds_pct.toLocaleString(locale(), { maximumFractionDigits: 2 }) })));
  else if (m.reason === "below") body.push(el("p", { class: "gta-muted" }, t("gta.me.short", { n: num(m.short_by), min: num(v.min_hold) })),
    el("div", { class: "gta-row" }, el("a", { class: "btn red", href: "/token#buy" }, t("gta.me.buy"))));
  else body.push(el("p", { class: "gta-muted" }, t(`gta.me.why.${m.reason}`)));
  $("gta-me-body").replaceChildren(...body);
}

async function admin() {
  let a;
  try { a = await call("/api/admin/gta"); } catch { return; }
  const act = (r, status) => el("button", { class: "btn", type: "button", on: { click: async () => {
    const note = prompt(status === "sent" ? "Public note (e.g. sent on Steam)" : "Why (public note)") ?? undefined;
    try { await call("/api/admin/gta", { round: r.round, status, note }); load(); } catch (e) { alert(e.message); }
  } } }, status);
  $("gta-admin-list").replaceChildren(el("tbody", null, ...a.draws.map((r) => el("tr", null,
    el("td", { class: "mono" }, `#${r.round}.${r.attempt}`), el("td", { class: "mono" }, r.winner ?? "—"),
    el("td", null, r.contact ?? "—"), el("td", null, r.status),
    el("td", null, r.status === "won" ? [act(r, "sent"), " ", act(r, "void")] : r.note ?? "")))));
  $("gta-admin").hidden = false;
}

async function load() {
  const s = session();
  const v = await call(`/api/gta${s ? `?wallet=${s.wallet.toLowerCase()}` : ""}`, undefined, READ);
  bar(v);
  current(v, s?.wallet.toLowerCase());
  past(v);
  meBox(v);
  if (s) admin();
}
load().catch((e) => { $("gta-pct").textContent = "—"; $("gta-left").textContent = e.message; });
