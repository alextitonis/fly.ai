/** docs/index.html (moved out of the page 2026-10-04): "Welcome back" and the Fly Desk section's "Your flies" box. The
 * wallet is asked for there and in the swap only (2026-10-16 brief: "ask for connection only when it unlocks a
 * specific action"): signed out the box explains why and offers Connect; signed in it shows the flies' numbers. The
 * session and nicknames come from nav.js (window.flyNav) when it loaded, else read here. */
const NAV = window.flyNav;
const KEY = "flyai.compute.session", API = NAV?.MINE_API || "https://flyai-mine.fly.dev";
const $ = (id) => document.getElementById(id);
let s = null;
if (NAV) s = NAV.session();
else try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
if (s && s.expires_at > Date.now() && s.wallet) {
  $("you-out").hidden = true;
  $("you-in").hidden = false;
  // the numbers come with the nav's one summary read (nav.js loadSummary)
  const fill = (v) => {
    if (!v || !v.wallets || !v.wallets.count) return;
    const usd = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const sum = $("you-sum");
    sum.removeAttribute("data-i18n");   // live numbers, not the placeholder line
    const vars = { n: v.wallets.count, value: usd(v.wallets.value), profit: `${v.wallets.profit >= 0 ? "+" : "−"}${usd(Math.abs(v.wallets.profit))}` };
    sum.textContent = window.flyI18n?.t?.("index.home.desk.youSum", vars) || `${vars.n} fly wallets · ${vars.value} (${vars.profit})`;
  };
  if (window.flySummary) fill(window.flySummary); else window.addEventListener("fly:summary", (e) => fill(e.detail), { once: true });
  const w = $("welcome");
  const show = (name) => { w.textContent = (window.flyI18n?.t?.("index.start.welcome") || "Welcome back, {name}").replace("{name}", name); w.hidden = false; };
  show(NAV ? NAV.short(s.wallet) : `${s.wallet.slice(0, 6)}…${s.wallet.slice(-4)}`);
  (NAV ? NAV.names([s.wallet]) : fetch(`${API}/api/profiles?wallets=${s.wallet}`).then((r) => r.json()))
    .then((n) => { if (n[s.wallet.toLowerCase()]) show(n[s.wallet.toLowerCase()]); }).catch(() => {});
}
$("start-connect").addEventListener("click", async () => {
  try { const a = await import("/compute/mine/web/account.js"); if (await a.signIn()) location.reload(); }
  catch (e) { console.warn(e); }
});

/** The first screen's "latest real trade" (2026-11-18): the newest filled buy or sell of any fly (mine
 * /api/vaults/feed: each fly's recent trades), win or loss, with its fly linked. "Watch a fly trade"
 * opens that fly. Nothing shows if the reads fail (the box stays hidden). */
const SKIP_WHY = /^(funding|earn|fee|refund|withdraw|deposit|top.?up|rebalance)/i;
const tr = (k, vars, en) => {
  const v = window.flyI18n?.t?.(k, vars);
  return v && v !== k ? v : en.replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? "");
};
const shortSym = (sym) => (sym.includes(":") ? sym.split(":")[1] : sym).split(".")[0];
const ago = (ms) => {   // "54 minutes ago" in the page's language (Intl), "{t} ago" only if Intl can't
  const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  const [n, unit] = m < 60 ? [m, "minute"] : m < 1440 ? [Math.round(m / 60), "hour"] : [Math.round(m / 1440), "day"];
  try { return new Intl.RelativeTimeFormat(document.documentElement.lang || "en", { numeric: "auto" }).format(-n, unit); }
  catch { return tr("index.home.liveAgo", { t: `${n} ${unit}s` }, "{t} ago"); }
};
const PERP = {   // a Perps trade's side -> its line (string key, English)
  long: ["liveLong", "Fly #{n} opened a long on {sym} for {usd}"],
  short: ["liveShort", "Fly #{n} opened a short on {sym} for {usd}"],
  "close long": ["liveCloseLong", "Fly #{n} closed its {sym} long at {pct}"],
  "close short": ["liveCloseShort", "Fly #{n} closed its {sym} short at {pct}"],
};
async function liveTrade() {
  // every fly's recent trades in one read (2026-11-19: the four flies with the most trades ALL-TIME were read, so it
  // kept showing #805's trade from 15 hours earlier while other flies traded minutes ago)
  const feed = await fetch(`${API}/api/vaults/feed`).then((r) => r.json());
  const all = [];
  for (const [fly, f] of Object.entries(feed.flies || {})) {
    for (const x of f.recent || []) all.push({ ...x, fly: Number(fly), at: Number(x.at) * 1000 });
    // longs and shorts (Lighter): "long" | "short" | "close long" | "close short"
    for (const x of f.perps_recent || []) if (PERP[x.side]) all.push({ ...x, perp: true, fly: Number(fly), at: Number(x.at) * 1000 });
  }
  const t = all.filter((x) => (x.perp || x.side === "buy" || x.side === "sell") && x.tag !== "earn" && x.tag !== "manual"
    && !/^(hip4|azuro|poly):/.test(x.symbol || "") && /^[\x20-\x7e]+$/.test(shortSym(x.symbol || ""))
    && !SKIP_WHY.test(x.why || "")).sort((a, b) => b.at - a.at)[0];
  if (!t) return;
  // token symbols are chosen by whoever deploys the token: escaped before they reach innerHTML
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sym = esc(shortSym(t.symbol)), usd = `$${Number(t.usd || 0).toFixed(2)}`;
  const pct = t.pnl_pct == null ? null : Number(t.pnl_pct);
  const pctHtml = pct == null ? usd : `<b class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%</b>`;
  const text = t.perp ? tr(`index.home.${PERP[t.side][0]}`, { n: t.fly, sym, usd, pct: pctHtml }, PERP[t.side][1])
    : t.side === "buy" || pct == null
    ? tr(t.side === "buy" ? "index.home.liveBought" : "index.home.liveSoldPlain", { n: t.fly, sym, usd },
      t.side === "buy" ? "Fly #{n} bought {sym} for {usd}" : "Fly #{n} sold {sym} for {usd}")
    : tr("index.home.liveSold", { n: t.fly, sym, pct: pctHtml },
      "Fly #{n} sold {sym} at {pct}");
  const link = `/traderflies/fly?id=${t.fly}`;
  $("hh-live-text").innerHTML = `${text}<small>${ago(t.at)}</small>`;
  $("hh-live").href = link;
  $("hh-live").hidden = false;
  $("hh-watch").href = link;
}
liveTrade().catch(() => {});
