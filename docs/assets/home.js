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
