/** docs/index.html (moved out of the page 2026-10-04): "Welcome back" and the Continue row for a signed-in visitor;
 * "Connect wallet" signs in with the site's one session. The session and nicknames come from nav.js (window.flyNav)
 * when it loaded, else read here. */
const NAV = window.flyNav;
const KEY = "flyai.compute.session", API = NAV?.MINE_API || "https://flyai-mine.fly.dev";
let s = null;
if (NAV) s = NAV.session();
else try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
if (s && s.expires_at > Date.now() && s.wallet) {
  document.getElementById("continue").hidden = false;
  // the numbers come with the nav's one summary read (nav.js loadSummary)
  const fill = (v) => {
    if (!v) return;
    const c = document.querySelector("#continue a[href*='view=mine']");
    const usd = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (c && v.wallets && v.wallets.count) c.textContent += ` · ${usd(v.wallets.value)} (${v.wallets.profit >= 0 ? "+" : "−"}${usd(Math.abs(v.wallets.profit))})`;
    const k = document.querySelector("#continue a[href='/colosseum/']");
    if (k && v.colosseum && v.colosseum.entries) k.textContent += ` · ${v.colosseum.wins}/${v.colosseum.entries}`;
  };
  if (window.flySummary) fill(window.flySummary); else window.addEventListener("fly:summary", (e) => fill(e.detail), { once: true });
  document.getElementById("start-connect").hidden = true;
  const w = document.getElementById("welcome");
  const show = (name) => { w.textContent = (window.flyI18n?.t?.("index.start.welcome") || "Welcome back, {name}").replace("{name}", name); w.hidden = false; };
  show(NAV ? NAV.short(s.wallet) : `${s.wallet.slice(0, 6)}…${s.wallet.slice(-4)}`);
  (NAV ? NAV.names([s.wallet]) : fetch(`${API}/api/profiles?wallets=${s.wallet}`).then((r) => r.json()))
    .then((n) => { if (n[s.wallet.toLowerCase()]) show(n[s.wallet.toLowerCase()]); }).catch(() => {});
}
else {
  let seen = "1";
  try { seen = localStorage.getItem("flyai.welcomed") || ""; } catch {}
  if (!seen) document.getElementById("firstvisit").hidden = false;
}
document.getElementById("fv-x").addEventListener("click", () => {
  document.getElementById("firstvisit").hidden = true;
  try { localStorage.setItem("flyai.welcomed", "1"); } catch {}
});
document.getElementById("start-connect").addEventListener("click", async () => {
  try { const a = await import("/compute/mine/web/account.js"); if (await a.signIn()) location.reload(); }
  catch (e) { console.warn(e); }
});
