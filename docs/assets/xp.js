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
$("xp-profile").addEventListener("click", () => { const s = session(); if (s) profile(s.wallet.toLowerCase()); });

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
  await draw();
} catch (err) {
  msg(String(err?.message || err), "err");
}
addEventListener("flyai-session", () => { draw().catch((err) => msg(String(err?.message || err), "err")); });
