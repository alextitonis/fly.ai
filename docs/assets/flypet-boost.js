/** docs/flypet-boost.html (2026-11-18): bring the Fly Pet's trip in flight home with a $FLYAI burn. The pet holds no key,
 *  so it opens this page; the price and the check are the mine server's (src/expeditions.ts, POST /api/pet/exp/speedup). */
import { t } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = NAV?.MINE_API || "https://flyai-mine.fly.dev";
const ACCOUNT_JS = "/compute/mine/web/account.js";   // the shared sign-in and wallet calls (as nav.js's quest burns)
const CHAIN = 4663;
const LANGS = ["en", "zh-Hans", "zh-Hant", "ko", "tr", "es"];
if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 3000); });

const $ = (id) => document.getElementById(id);
const session = () => { try { return NAV?.session ? NAV.session() : null; } catch { return null; } };
const msg = (text, kind = "") => { $("fb-msg").textContent = text; $("fb-msg").className = `fb-msg${kind ? ` ${kind}` : ""}`; };
const left = (ms) => { const m = Math.max(1, Math.ceil(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
async function call(path, body) {
  const s = session();
  const r = await fetch(API + path, body === undefined ? { headers: { "x-flyai-session": s?.token ?? "" } }
    : { method: "POST", headers: { "content-type": "application/json", "x-flyai-session": s?.token ?? "" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

let view = null, busy = false;
async function draw() {
  const s = session();
  $("fb-out").hidden = !!s;
  if (!s) { $("fb-trip").hidden = true; $("fb-none").hidden = true; return; }
  try { view = await call("/api/pet/exp"); } catch (err) { msg(String(err.message || err), "err"); return; }
  const tr = view.me?.trip, sp = view.me?.speedup;
  const out = !!tr && tr.ends_at > Date.now();
  $("fb-none").hidden = out;
  $("fb-trip").hidden = !out;
  if (!out) return;
  const lang = LANGS.indexOf(document.documentElement.lang);
  const place = view.places.find((p) => p.id === tr.place);
  $("fb-where").textContent = t("flypetboost.out", { place: place ? place.names[lang >= 0 ? lang : 0] : tr.place, time: left(tr.ends_at - Date.now()) });
  const can = sp && sp.flyai != null && sp.used < sp.max;
  $("fb-price").textContent = sp && sp.flyai != null ? t("flypetboost.price", { n: sp.flyai.toLocaleString(), usd: sp.usd.toFixed(2) }) : "";
  $("fb-limit").textContent = sp ? (sp.used < sp.max ? t("flypetboost.limit", { left: sp.max - sp.used, max: sp.max }) : t("flypetboost.used")) : "";
  $("fb-go").hidden = !can;
  $("fb-go").disabled = busy;
}

$("fb-go").addEventListener("click", async () => {
  const sp = view?.me?.speedup;
  if (busy || !sp || sp.flyai == null) return;
  busy = true; $("fb-go").disabled = true;
  try {
    const acct = await import(ACCOUNT_JS);
    const word = (x) => x.toString(16).padStart(64, "0");
    const data = "0x42966c68" + word(BigInt(sp.flyai) * 10n ** 18n);   // burn(amount)
    msg(t("flypetboost.wallet"));
    const hash = await acct.transact(sp.token, data, () => msg(t("flypetboost.wallet")), CHAIN);
    msg(t("flypetboost.wait"));
    await acct.mined(hash, CHAIN);
    let done = null, last = null;
    for (let i = 0; i < 5 && !done; i++) {
      try { done = await call("/api/pet/exp/speedup", { tx: hash }); }
      catch (err) { last = err; if (!/mined/.test(String(err.message))) break; await new Promise((r) => setTimeout(r, 3000)); }
    }
    if (!done) throw last || new Error("try again");
    msg(t("flypetboost.done"), "ok");
  } catch (err) {
    msg(String(err?.message || err), "err");
  } finally {
    busy = false;
    draw();
  }
});

addEventListener("flyai-session", () => { draw(); });
draw();
setInterval(() => { if (!busy) draw(); }, 30_000);
