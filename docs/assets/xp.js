/** docs/xp.html (2026-11-03): XP season 1's leaderboard and the signed-in wallet's place on it. Names open the profile
 *  card (nav.js -> flyprofile.js, data-fly-profile), and "How to earn XP" its help. The rules: mine/src/xp.ts. */
import { t } from "./i18n/i18n.js";

const NAV = window.flyNav;
const LOCAL_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api");
const READ = LOCAL_API || NAV?.MINE_READ || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 3000); });

const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
};
const session = NAV?.session || (() => {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.expires_at > Date.now() && s.wallet && s.token ? s : null; } catch { return null; }
});
const fmt = (n) => Math.round(n).toLocaleString();
const short = (w) => `${w.slice(0, 6)}…${w.slice(-4)}`;
function msg(html, kind = "") {
  const m = $("xp-msg");
  m.innerHTML = html;   // our own strings and numbers only
  m.className = `xp-msg${kind ? ` ${kind}` : ""}`;
}
// the profile card's code is nav.js's to load; without nav.js the names stay plain
const profile = (w) => NAV?.profile?.(w);
const help = async () => {
  if (!window.flyProfile && NAV?.profile) await NAV.profile("").catch(() => {});   // loads flyprofile.js; an empty wallet opens nothing
  window.flyProfile?.help();
};
$("xp-help").addEventListener("click", () => { help(); });

// the tabs: the season's board, or the giveaway round (#giveaway in the address keeps it)
function tab(round) {
  $("xp-tab-season").classList.toggle("on", !round); $("xp-tab-round").classList.toggle("on", round);
  $("xp-tab-season").setAttribute("aria-selected", String(!round)); $("xp-tab-round").setAttribute("aria-selected", String(round));
  $("xp-panel-season").hidden = round; $("xp-panel-round").hidden = !round;
  history.replaceState(history.state, "", round ? "#giveaway" : location.pathname + location.search);
  if (round) drawRound().catch((err) => msg(String(err?.message || err), "err"));
}
$("xp-tab-season").addEventListener("click", () => tab(false));
$("xp-tab-round").addEventListener("click", () => tab(true));
$("xp-profile").addEventListener("click", () => { const s = session(); if (s) profile(s.wallet.toLowerCase()); });

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const who = (r) => el("a", { class: "xp-who", href: "#", title: r.wallet, "data-fly-profile": r.wallet }, r.nickname || (r.x ? `@${r.x}` : short(r.wallet)),
  r.nickname && r.x ? el("small", null, `@${r.x}`) : null);
const avatar = (r) => (r.avatar ? el("img", { class: "xp-av", src: r.avatar, alt: "", width: "28", height: "28", loading: "lazy", referrerpolicy: "no-referrer" }) : el("span", { class: "xp-av" }));

async function drawRound() {
  const mine = session()?.wallet.toLowerCase();
  const [cur, past] = await Promise.all([
    fetch(`${READ}/api/xp/round${mine ? `?wallet=${mine}` : ""}`).then((r) => r.json()),
    fetch(`${READ}/api/xp/rounds`).then((r) => r.json()),
  ]);
  if (cur.round) {
    $("xp-round-title").textContent = t("xp.round.title", { n: cur.round.id });
    $("xp-round-ends").textContent = t("xp.round.ends", { date: when(cur.round.ends) });
  }
  $("xp-round-total").textContent = t("xp.board.total", { n: cur.total ?? 0 });
  $("xp-round-empty").hidden = (cur.rows || []).length > 0;
  const line = (r, me, apart) => el("li", { class: `xp-row${me ? " me" : ""}${apart ? " apart" : ""}` },
    el("span", { class: "xp-rank" }, `#${r.rank}`), avatar(r), who(r),
    el("span", { class: "xp-level" }, t("xp.board.level", { n: r.level })), el("span", { class: "xp-points" }, `+${fmt(r.gain)}`));
  const rows = (cur.rows || []).map((r) => line(r, r.wallet === mine));
  if (cur.me && !(cur.rows || []).some((r) => r.wallet === mine)) rows.push(line(cur.me, true, true));
  $("xp-round-rows").replaceChildren(...rows);
  const rounds = past.rounds || [];
  $("xp-history-empty").hidden = rounds.length > 0;
  $("xp-history").replaceChildren(...rounds.map((r) => {
    const list = r.winners.length
      ? r.winners.map((w, i) => el("li", { class: "xp-row" }, el("span", { class: "xp-rank" }, w.rank ? `#${w.rank}` : `${i + 1}.`), avatar(w), who(w),
        el("span", { class: "xp-reward" }, w.reward)))
      : r.top.slice(0, 5).map((w) => el("li", { class: "xp-row" }, el("span", { class: "xp-rank" }, `#${w.rank}`), avatar(w), who(w),
        el("span", { class: "xp-points" }, `+${fmt(w.gain)}`)));
    return el("div", { class: "xp-round" },
      el("h4", null, t("xp.round.title", { n: r.id }), el("small", null, `${day(r.starts)} – ${day(r.ends)}`)),
      r.note ? el("p", null, r.note) : null,
      r.winners.length ? null : el("p", null, t("xp.history.pending")),
      el("ol", { class: "xp-rows" }, ...list));
  }));
}

function row(r, me, apart) {
  const name = r.nickname || (r.x ? `@${r.x}` : short(r.wallet));
  return el("li", { class: `xp-row${me ? " me" : ""}${apart ? " apart" : ""}` },
    el("span", { class: "xp-rank" }, `#${r.rank}`),
    r.avatar ? el("img", { class: "xp-av", src: r.avatar, alt: "", width: "28", height: "28", loading: "lazy", referrerpolicy: "no-referrer" }) : el("span", { class: "xp-av" }),
    el("a", { class: "xp-who", href: "#", title: r.wallet, "data-fly-profile": r.wallet }, name, r.nickname && r.x ? el("small", null, `@${r.x}`) : null),
    el("span", { class: "xp-level" }, t("xp.board.level", { n: r.level })),
    el("span", { class: "xp-points" }, fmt(r.xp)));
}

async function draw() {
  const s = session();
  const mine = s?.wallet.toLowerCase();
  const r = await fetch(`${READ}/api/xp/leaderboard${mine ? `?wallet=${mine}` : ""}`);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
  $("xp-signin").hidden = !!s;
  $("xp-profile").hidden = !s;
  if (!b.on) { msg(t("xp.status.soon")); return; }
  $("xp-season").textContent = b.season.over ? t("xp.status.over") : t("xp.status.ends");   // no date: it isn't public
  $("xp-total").textContent = t("xp.board.total", { n: b.total });
  $("xp-empty").hidden = b.rows.length > 0;
  const rows = b.rows.map((x) => row(x, x.wallet === mine));
  if (b.me && !b.rows.some((x) => x.wallet === mine)) rows.push(row(b.me, true, true));
  $("xp-rows").replaceChildren(...rows);
  if (!s) msg(t("xp.status.signedOut"));
  else if (b.me) msg(t("xp.status.me", { xp: `<b>${fmt(b.me.xp)}</b>`, level: b.me.level, rank: b.me.rank, of: b.total }));
  else msg(t("xp.status.none"));
}

try {
  if (location.hash === "#giveaway") tab(true);
  await draw();
} catch (err) {
  msg(String(err?.message || err), "err");
}
addEventListener("flyai-session", () => {
  draw().catch((err) => msg(String(err?.message || err), "err"));
  if (!$("xp-panel-round").hidden) drawRound().catch(() => {});
});

// 2x XP windows (mine/src/xp.ts, set by the team): the live one with its countdown, or the next one's start
const left = (ms) => { const m = Math.max(1, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
let boost = null;
function drawBoost() {
  const box = $("xp-boost");
  const b = boost && (boost.live || boost.next);
  if (!b) { box.hidden = true; return; }
  const live = !!boost.live && Date.parse(b.to) > Date.now();
  const mult = `${b.mult}x`;
  box.hidden = false;
  box.classList.toggle("live", live);
  box.replaceChildren(
    el("p", { class: "xp-boost-title" }, el("b", null, live ? t("xp.boost.live", { mult }) : t("xp.boost.next", { mult, when: when(b.from) })),
      live ? el("span", { class: "xp-boost-left" }, t("xp.boost.left", { left: left(Date.parse(b.to) - Date.now()) })) : null),
    el("p", { class: "xp-boost-rules" }, t("xp.boost.rules", { mult, days: boost.clawback_days ?? 3 })));
}
async function loadBoost() {
  try { boost = await fetch(`${READ}/api/xp/boost`).then((r) => r.json()); } catch { boost = null; }
  drawBoost();
}
loadBoost();
setInterval(drawBoost, 30_000);
setInterval(loadBoost, 300_000);
