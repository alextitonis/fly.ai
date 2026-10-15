/** docs/referrals.html (2026-10-15): your link, milestones, who referred you, your referrals and what they earned you.
 *  The numbers come from the mine server (mine/src/referrals.ts); the rule is flytrade/desk/referrals.py. */
import { t, locale } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
const SITE = "https://www.flyaiworld.com";
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
const usd = (v) => `$${(Number(v) || 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v).toLocaleString(locale(), { maximumFractionDigits: 2 })}%`;
const day = (v) => new Date(v).toLocaleDateString(locale(), { day: "numeric", month: "short" });

function tiersTable(tiers, current) {
  const head = el("tr", null, ...["at", "cut", "fee"].map((k) => el("th", null, t(`referrals.tiers.th.${k}`))));
  const rows = tiers.map((x) => el("tr", { class: current && current.at === x.at ? "on" : null },
    el("td", { class: "mono" }, `${x.at}+`, current && current.at === x.at ? el("span", { class: "ref-you" }, t("referrals.tiers.you")) : null),
    el("td", { class: "mono" }, pct(x.cut_pct)),
    el("td", { class: "mono" }, x.fee_discount ? `−${pct(x.fee_discount * 100)}` : t("referrals.tiers.none"))));
  $("ref-tiers").replaceChildren(el("thead", null, head), el("tbody", null, ...rows));
}

function linkBox(me) {
  const url = `${SITE}${me.link}`;
  const input = el("input", { class: "mono", value: url, readonly: true, "aria-label": t("referrals.link.title") });
  const copy = el("button", { class: "btn red", type: "button", on: { click: async () => {
    try { await navigator.clipboard.writeText(url); } catch { input.select(); document.execCommand?.("copy"); }
    copy.textContent = t("referrals.link.copied");
    setTimeout(() => { copy.textContent = t("referrals.link.copy"); }, 1500);
  } } }, t("referrals.link.copy"));
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", `${t("referrals.link.shareText")} ${url}`);
  const share = el("a", { class: "btn", href: intent.toString(), target: "_blank", rel: "noopener" }, t("referrals.link.share"));
  $("ref-link-body").replaceChildren(el("div", { class: "ref-linkrow" }, input, copy, share),
    el("p", { class: "ref-muted mono" }, t("referrals.link.code", { code: me.code })));
}

function tiles(me) {
  const tile = (label, value, sub) => el("div", { class: "card ref-tile" }, el("span", null, label), el("b", null, value), sub ? el("small", null, sub) : null);
  $("ref-tiles").replaceChildren(
    tile(t("referrals.tiles.referred"), String(me.total)),
    tile(t("referrals.tiles.real"), String(me.real)),
    tile(t("referrals.tiles.cut"), pct(me.tier.cut_pct), t("referrals.tiles.ofProfit")),
    tile(t("referrals.tiles.earned"), usd(me.earned.total_usd),
      t("referrals.tiles.earnedSplit", { wallet: usd(me.earned.wallet_usd), desk: usd(me.earned.desk_usd) })));
  $("ref-tiles").hidden = false;
  $("ref-next").textContent = me.next
    ? t("referrals.tiers.next", { count: me.next.at - me.real, cut: me.next.cut_pct, fee: Math.round(me.next.fee_discount * 100) })
    : t("referrals.tiers.top");
}

function byBox(me, reload) {
  const box = $("ref-by");
  if (me.referrer) {
    box.replaceChildren(el("p", null, t("referrals.by.locked", { name: me.referrer.name })));
  } else if (me.can_set) {
    const input = el("input", { maxlength: "40", placeholder: t("referrals.by.hint") });
    const msg = el("p", { class: "ref-muted" }, t("referrals.by.once"));
    const go = el("button", { class: "btn red", type: "button", on: { click: async () => {
      msg.textContent = "…";
      try { reload(await call("/api/referral", { code: input.value, via: "profile" })); } catch (e) { msg.textContent = e.message; }
    } } }, t("referrals.by.set"));
    box.replaceChildren(el("div", { class: "ref-linkrow" }, input, go), msg);
  } else {
    box.replaceChildren(el("p", { class: "ref-muted" }, t("referrals.by.none", { days: me.new_for_days })));
  }
  $("ref-by-card").hidden = false;
}

function lists(me) {
  const status = (r) => r.real ? el("span", { class: "tag mint" }, t("referrals.list.real"))
    : el("span", { class: "tag" }, t(r.funded ? "referrals.list.counting" : "referrals.list.waiting"));
  const head = el("tr", null, ...["who", "since", "status", "earned"].map((k) => el("th", null, t(`referrals.list.th.${k}`))));
  $("ref-list").replaceChildren(el("thead", null, head), el("tbody", null,
    ...(me.referred.length ? me.referred.map((r) => el("tr", null, el("td", null, r.name), el("td", null, day(r.since)),
      el("td", null, status(r)), el("td", { class: "mono" }, usd(r.earned_usd))))
      : [el("tr", null, el("td", { colspan: "4", class: "ref-muted" }, t("referrals.list.empty")))])));
  $("ref-list-card").hidden = false;
  if (me.recent.length) {
    $("ref-recent").replaceChildren(el("tbody", null, ...me.recent.map((e) => el("tr", null,
      el("td", null, day(e.at)),
      el("td", null, e.source === "desk" ? t("referrals.recent.desk", { epoch: e.epoch ?? "" }) : t("referrals.recent.wallet"),
        " ", el("small", { class: "ref-muted" }, t("referrals.recent.from", { name: e.from }))),
      el("td", { class: "mono" }, usd(e.usd))))));
    $("ref-recent-card").hidden = false;
  }
}

function render(me) {
  linkBox(me);
  tiles(me);
  byBox(me, render);
  lists(me);
  if (me.referrer?.via === "link") {
    $("ref-invite").textContent = t("referrals.invited.joined", { name: me.referrer.name });
    $("ref-invite").hidden = false;
  }
}

// the tiers show signed out too
// (drawn at once from the rule as published - flytrade/desk/referrals.py TIERS - then from the server's own copy)
const TIERS = [{ at: 0, cut_pct: 0.5, fee_discount: 0 }, { at: 10, cut_pct: 0.75, fee_discount: 0.1 },
  { at: 25, cut_pct: 1, fee_discount: 0.25 }, { at: 50, cut_pct: 1.25, fee_discount: 0.5 }];
tiersTable(TIERS, null);
const tiersP = call("/api/referral/tiers").then((x) => x.tiers).catch(() => TIERS);
tiersP.then((tiers) => tiers && tiersTable(tiers, null));

// a visitor who came through a link: say whose (nav.js keeps the code until they sign in)
const linked = new URLSearchParams(location.search).get("ref");
if (linked && !session()) {
  call(`/api/referral/who?code=${encodeURIComponent(linked)}`).then((w) => {
    if (!w.ok) return;
    $("ref-invite").textContent = `${t("referrals.invited.by", { name: w.name })} ${t("referrals.invited.signIn")}`;
    $("ref-invite").hidden = false;
  }).catch(() => {});
}

if (session()) {
  // a pending link is posted by nav.js as the page loads: read after it, so the page shows the result
  const load = () => Promise.all([call("/api/referral"), tiersP]).then(([me, tiers]) => {
    render(me);
    if (tiers) tiersTable(tiers, me.tier);
  }).catch((e) => { $("ref-link-body").replaceChildren(el("p", { class: "ref-muted" }, e.message)); });
  let pending = false;
  try { pending = !!localStorage.getItem("flyai.ref"); } catch {}
  setTimeout(load, pending ? 1500 : 0);
}
