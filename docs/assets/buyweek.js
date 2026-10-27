/**
 * The "You're in" card (2026-10-27, the buy-flow plan step 4): under the swap box on /start and the token page, what a
 * buyer's wallet stands at in Buy Week - net $FLYAI bought and still held, the tier, the estimated Sunday bonus, the
 * loyalty +5%, the draw tickets and how far the next tier / the next "everyone" bonus is (mine GET /api/buyweek/<wallet>,
 * an estimate: the team checks the payout at the snapshot). Outside the week it shows the next step instead: hold 200k
 * $FLYAI with a Trader Fly to earn from the Fly Desk. Drawn for the signed-in wallet, and again right after a buy
 * (buy.js fires "flyai:bought"), when it asks the server to read the newest blocks first.
 */
(function () {
  "use strict";
  const box = document.getElementById("buyweek");
  if (!box) return;
  const MINE = (window.flyNav && window.flyNav.MINE_API) || "https://flyai-mine.fly.dev";
  const t = (k, v) => (window.flyI18n ? window.flyI18n.t("token.bw." + k, v) : k);
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const n0 = (x) => new Intl.NumberFormat(lang(), { maximumFractionDigits: 0 }).format(x);
  const usd = (x) => "$" + new Intl.NumberFormat(lang(), { maximumFractionDigits: 2 }).format(x);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function draw(s) {
    if (!s) { box.hidden = true; return; }
    box.hidden = false;
    if (!s.on) {
      box.innerHTML = `<h3>${esc(t("nextTitle"))}</h3><p>${esc(t("nextText", { amount: n0(s.next.hold) }))}</p>
        <p class="bw-links"><a class="btn sm" href="/traderflies/">${esc(t("nextFlies"))}</a> <a class="btn sm ghost" href="/desk">${esc(t("nextDesk"))}</a></p>`;
      return;
    }
    if (s.excluded) { box.innerHTML = `<p class="fine">${esc(t("excluded"))}</p>`; return; }
    const end = new Date(s.window.end).toLocaleString(lang(), { weekday: "long", hour: "2-digit", minute: "2-digit" });
    const lines = [];
    if (s.tier_pct) {
      lines.push(`<li><b>${esc(t("tier", { pct: s.tier_pct }))}</b></li>`);
      if (s.community_pct) lines.push(`<li>${esc(t("community", { pct: s.community_pct, n: s.buyers }))}</li>`);
      if (s.loyal_pct) lines.push(`<li>${esc(t("loyal", { pct: s.loyal_pct }))}</li>`);
      lines.push(`<li>${esc(t("tickets", { n: s.tickets }))}</li>`);
    }
    const next = [];
    if (s.next_tier) next.push(t("nextTier", { usd: usd(s.next_tier.need_usd), pct: s.next_tier.pct }));
    if (s.next_community) next.push(t("nextCommunity", { n: s.next_community.need, pct: s.next_community.pct }));
    box.innerHTML = `
      <h3>${esc(s.tier_pct ? t("inTitle") : t("notYetTitle"))}</h3>
      <p class="bw-big"><b>${esc(n0(s.counted_flyai))} $FLYAI</b> <span class="fine">≈ ${esc(usd(s.usd))} · ${esc(t("held"))}</span></p>
      ${s.tier_pct ? `<p>${esc(t("bonus", { amount: n0(s.est_bonus_flyai), pct: s.bonus_pct, when: end }))}</p>` : `<p>${esc(t("notYet"))}</p>`}
      ${lines.length ? `<ul class="bw-list">${lines.join("")}</ul>` : ""}
      ${next.length ? `<p class="fine">${esc(next.join(" · "))}</p>` : ""}
      <p class="fine">${esc(t("keep", { when: end }))} ${esc(t("estimate"))}</p>`;
  }

  let wallet = null, timer = null;
  async function load(fresh) {
    if (!wallet) { box.hidden = true; return; }
    try {
      const r = await fetch(MINE + "/api/buyweek/" + wallet + (fresh ? "?fresh=1" : ""));
      draw(r.ok ? await r.json() : null);
    } catch (e) { /* the card just stays as it was */ }
  }
  function start() {
    const s = window.flyNav && window.flyNav.session && window.flyNav.session();
    wallet = s && s.wallet ? s.wallet.toLowerCase() : null;
    load(false);
    window.addEventListener("flyai:bought", (e) => {
      wallet = String((e.detail && e.detail.wallet) || wallet || "").toLowerCase() || null;
      clearTimeout(timer);
      load(true);
      timer = setTimeout(() => load(true), 25_000);     // the chain may need a few more seconds to show the buy
    });
    window.addEventListener("i18n:ready", () => load(false));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
