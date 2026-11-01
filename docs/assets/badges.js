/** docs/badges.html (2026-10-31): the soulbound badges, the signed-in wallet's progress on each, and one claim for
 *  whatever it has earned. The server (mine/src/badges.ts) checks the rules and hands back a ready claim transaction. */
import { t } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const ACCOUNT_JS = "/compute/mine/web/account.js";
const EXPLORER = "https://robinhoodchain.blockscout.com/token/";
const SESSION_KEY = "flyai.compute.session";
const IDS = { larva: 1, lord: 2, diamond: 3, og: 4, flyowner: 5, swarm: 6, queen: 7, payday: 8, payroll: 9, recruiter: 10, piedpiper: 11 };
const KEYS = Object.keys(IDS);
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
async function call(path, body) {
  const s = session();
  const r = await fetch(API + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(s ? { "x-flyai-session": s.token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}
function msg(text, kind = "") {
  const m = $("badges-msg");
  m.textContent = text;
  m.className = `badges-msg${kind ? ` ${kind}` : ""}`;
}

// what a shared badge says, in English like the rest of the site's posts (the page's words are for the page)
const SHARE = {
  larva: ["Larva", "Held 100,000+ $FLYAI for 7 days straight."], lord: ["Lord of the Flies", "Held 10,000,000+ $FLYAI for 30 days straight."],
  diamond: ["Diamond Wings", "Held 100,000+ $FLYAI for 90 days straight."], og: ["OG", "In $FLYAI since its first 14 days, and still holding."],
  flyowner: ["Fly Owner", "Held a Trader Fly for 30 days."], swarm: ["Swarm", "Held 10+ Trader Flies for 30 days straight."],
  queen: ["Queen of the Hive", "Held 50+ Trader Flies for 30 days straight."], payday: ["Payday", "Claimed 4 Fly Desk payouts."], payroll: ["On Payroll", "Claimed 8 Fly Desk payouts."],
  recruiter: ["Recruiter", "Brought 1 real referral to fly.ai."], piedpiper: ["Pied Piper", "Brought 10 real referrals to fly.ai."],
};
const shareUrl = (key) => `https://x.com/intent/post?text=${encodeURIComponent(
  `I earned the ${SHARE[key][0]} badge on @flydotai.\n\n${SHARE[key][1]} Soulbound, so it stays with my wallet.\n\nhttps://flyaiworld.com/badges`)}`;

/** A 1200x630 card to post: the badge, its name and what it took. */
async function shareImage(key) {
  const img = new Image();
  await new Promise((ok, fail) => {
    img.onload = ok;
    img.onerror = () => fail(new Error("the badge image didn't load"));
    img.src = `assets/badges/${IDS[key]}.svg`;
  });
  const c = Object.assign(document.createElement("canvas"), { width: 1200, height: 630 });
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 1200, 630);
  g.drawImage(img, 60, 75, 480, 480);
  g.textBaseline = "top";
  g.fillStyle = "#5ef2cc";
  g.font = "600 28px Outfit, sans-serif";
  g.fillText("FLY BADGE", 600, 150);
  g.fillStyle = "#fff";
  const [name, need] = SHARE[key];
  let size = 76;
  do { g.font = `700 ${size}px Outfit, sans-serif`; size -= 4; } while (g.measureText(name).width > 540 && size > 36);
  g.fillText(name, 600, 200);
  g.fillStyle = "#9ba5a1";
  g.font = "400 32px Inter, sans-serif";
  let line = "", y = 310;
  for (const word of need.split(" ")) {
    if (g.measureText(`${line}${word}`).width > 540) { g.fillText(line.trim(), 600, y); y += 44; line = ""; }
    line += `${word} `;
  }
  g.fillText(line.trim(), 600, y);
  g.fillStyle = "#fff";
  g.font = "600 30px Outfit, sans-serif";
  g.fillText("flyaiworld.com/badges", 600, 480);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `fly-badge-${key}.png` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return blob.size;
}

function shareRow(key) {
  const image = el("button", { type: "button", class: "btn sm ghost" }, t("badges.share.image"));
  image.addEventListener("click", () => shareImage(key).catch((err) => msg(String(err?.message || err), "err")));
  return el("div", { class: "badge-share" },
    el("a", { class: "btn sm", href: shareUrl(key), target: "_blank", rel: "noopener" }, t("badges.share.x")), image);
}

/** How rare a badge is: its holders against every wallet that holds any badge. */
const rarity = (n, total) => {
  if (!n || !total) return null;
  const share = n / total;
  return share >= 0.25 ? "common" : share >= 0.1 ? "uncommon" : share >= 0.02 ? "rare" : "legendary";
};

function card(key, mine, claimed, total) {
  const state = mine?.state;
  const p = mine?.progress;
  const done = p ? p.days ?? p.payouts ?? p.referrals : 0;
  const line = !mine ? "" : state !== "working" || !p ? t(`badges.state.${state}`)
    : p.referrals !== undefined ? t("badges.state.progressReferrals", { n: Math.min(done, p.need), need: p.need })
    : p.payouts !== undefined ? t("badges.state.progressPayouts", { n: Math.min(done, p.need), need: p.need })
    : t("badges.state.progress", { days: Math.min(done, p.need), need: p.need });
  return el("article", { class: `card badge-card${state === "held" || state === "claimable" || !mine ? "" : " dim"}` },
    el("img", { src: `assets/badges/${IDS[key]}.svg`, alt: "", loading: "lazy", width: "512", height: "512" }),
    el("h3", null, t(`badges.list.${key}.name`)),
    el("p", { class: "badge-need" }, t(`badges.list.${key}.need`)),
    state === "working" && p ? el("div", { class: "badge-progress", "aria-hidden": "true" }, el("span", { style: `width:${Math.min(100, (done / p.need) * 100)}%` })) : null,
    line ? el("span", { class: `badge-state ${state}` }, line) : null,
    state === "held" ? shareRow(key) : null,
    claimed !== null ? el("span", { class: "badge-claimed" },
      rarity(claimed, total) ? el("b", { class: `badge-rarity ${rarity(claimed, total)}` }, t(`badges.rarity.${rarity(claimed, total)}`)) : null,
      rarity(claimed, total) ? " · " : null, t("badges.holders", { n: claimed })) : null);
}

const NAMES = Object.fromEntries(Object.entries(IDS).map(([k, id]) => [id, k]));
function row(r, me, apart) {
  const name = r.nickname || `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`;
  return el("li", { class: `badges-row${me ? " me" : ""}${apart ? " apart" : ""}` },
    el("span", { class: "badges-rank" }, `#${r.rank}`),
    el("span", { class: "badges-who", title: r.wallet }, name),
    el("span", { class: "badges-icons" }, r.ids.filter((id) => NAMES[id]).map((id) => {
      const label = t(`badges.list.${NAMES[id]}.name`);
      return el("img", { src: `assets/badges/${id}.svg`, alt: label, title: label, loading: "lazy", width: "24", height: "24" });
    })),
    el("span", { class: "badges-count" }, String(r.badges)));
}
async function drawBoard() {
  const s = session();
  const b = await call(`/api/badges/leaderboard${s ? `?wallet=${s.wallet.toLowerCase()}` : ""}`);
  $("badges-board").hidden = !b.on;
  if (!b.on) return;
  const mine = s?.wallet.toLowerCase();
  $("badges-board-total").textContent = t("badges.board.total", { n: b.total });
  $("badges-board-empty").hidden = b.rows.length > 0;
  const rows = b.rows.map((r) => row(r, r.wallet === mine));
  if (b.me && !b.rows.some((r) => r.wallet === mine)) rows.push(row(b.me, true, true));
  $("badges-rows").replaceChildren(...rows);
}

async function claim() {
  const go = $("badges-claim");
  go.disabled = true;
  let acct = null;
  try {
    acct = await import(ACCOUNT_JS);
    const v = await call("/api/badges/vouchers", {});
    msg(t("badges.status.confirm"));
    const hash = await acct.transact(v.to, v.data, () => msg(t("badges.status.confirm")), v.chain_id);
    msg(t("badges.status.waiting"));
    await acct.mined(hash, v.chain_id);
    await draw();
    msg(t("badges.status.done"), "ok");
  } catch (err) {
    msg(acct ? acct.errorText(err) : String(err?.message || err), "err");
    go.disabled = false;
  }
}
$("badges-claim").addEventListener("click", claim);

async function draw() {
  const pub = await call("/api/badges");
  const counts = Object.fromEntries((pub.badges || []).map((b) => [b.key, b.claimed]));
  const on = !!pub.on;
  if (on) {
    const a = $("badges-contract");
    a.href = EXPLORER + pub.contract;
    a.hidden = false;
  }
  const signedIn = !!session();
  const me = on && signedIn ? await call("/api/badges/me") : null;
  const by = Object.fromEntries((me?.badges || []).map((b) => [b.key, b]));
  const total = on ? (await call("/api/badges/leaderboard").catch(() => null))?.total ?? 0 : 0;
  $("badges-grid").replaceChildren(...KEYS.map((k) => card(k, by[k], on ? counts[k] ?? 0 : null, total)));
  const open = (me?.badges || []).filter((b) => b.state === "claimable").length;
  const go = $("badges-claim");
  go.hidden = !open;
  go.disabled = false;
  go.textContent = t("badges.status.claim", { n: open });
  $("badges-signin").hidden = !on || signedIn;
  if (!on) msg(t("badges.status.soon"));
  else if (!signedIn) msg(t("badges.status.signedOut"));
  else if (!me.synced) msg(t("badges.status.syncing"));
  else if (open) msg(t("badges.status.ready", { n: open }));
  else if (me.badges.some((b) => b.state === "held")) msg(t("badges.status.all"));
  else msg(t("badges.status.none"));
  drawBoard().catch((err) => console.warn("badges board:", err));
}

try {
  await draw();
} catch (err) {
  $("badges-grid").replaceChildren(...KEYS.map((k) => card(k, null, null)));
  msg(String(err?.message || err), "err");
}
addEventListener("flyai-session", () => { draw().catch((err) => msg(String(err?.message || err), "err")); });
