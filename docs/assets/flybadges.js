/**
 * The soulbound badges in the account menu (2026-10-31, the user: "a button in profile that is for badges and a popup
 * that shows them"). nav.js loads this when the button is pressed and calls window.flyBadges.open(session): one read of
 * /api/badges/me per press, nothing on page load, since that read goes to the chain. Claiming stays on /badges.
 * mine/src/badges.ts has the rules, flytrade/contracts/src/FlyBadges.sol the NFTs.
 */
(function () {
  "use strict";
  const SRC = document.currentScript && document.currentScript.src;
  const LOCAL_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api");
  const API = LOCAL_API || (window.flyNav && window.flyNav.MINE_API) || "https://flyai-mine.fly.dev";
  const NAMES = { larva: "Larva", lord: "Lord of the Flies", diamond: "Diamond Wings", og: "OG", flyowner: "Fly Owner",
    swarm: "Swarm", queen: "Queen of the Hive", payday: "Payday", payroll: "On Payroll", recruiter: "Recruiter", piedpiper: "Pied Piper" };
  const EN = {
    title: "Your badges", count: "{n} of {of} in your wallet", loading: "Loading…", soon: "Badges open soon.",
    ready: "{n} ready to claim", open: "See all badges", close: "Close", failed: "Couldn't load your badges.",
    held: "In your wallet", claimable: "Ready to claim", progress: "{days} of {need} days", progressPayouts: "{n} of {need} payouts", progressReferrals: "{n} of {need} referrals",
    revoked: "Removed", team: "Not for team wallets", closed: "Not earned", holders: "Holders: {n}",
    common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary",
  };

  function t(key, vars) {
    let v = window.flyI18n ? window.flyI18n.t("common.soulbound." + key, vars) : null;
    if (!v || v === "common.soulbound." + key) v = EN[key].replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
    return v;
  }
  const el = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props || {}); e.append(...kids); return e; };
  const image = (id) => (SRC ? new URL(`badges/${id}.svg`, SRC).href : `/assets/badges/${id}.svg`);

  let css = null;
  function style() {
    if (css) return;
    css = document.createElement("style");
    css.textContent = `.flybadges-back { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.6); display: flex; align-items: center;
        justify-content: center; padding: 16px; }
      .flybadges-pop { background: var(--bg, #0b0b0b); color: var(--text, #fff); border: 1px solid var(--line, #2a2a2a); border-radius: 16px;
        width: min(720px, 100%); max-height: 85vh; overflow: auto; padding: 20px; font: 14px/1.5 var(--sans, inherit); }
      .flybadges-pop h3 { margin: 0 0 2px; font-size: 18px; }
      .flybadges-sub { margin: 0 0 14px; color: var(--muted, #9ba5a1); }
      .flybadges-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
      @media (max-width: 520px) { .flybadges-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      .flybadges-one { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .flybadges-one img { width: 100%; height: auto; aspect-ratio: 1; border-radius: 10px; display: block; }
      .flybadges-one.dim img { opacity: .35; filter: grayscale(.7); }
      .flybadges-one b { font-size: 13px; line-height: 1.25; margin-top: 3px; }
      .flybadges-one small { font-size: 12px; line-height: 1.25; color: var(--muted, #9ba5a1); }
      .flybadges-one small.on { color: var(--mint, #5ef2cc); }
      .flybadges-one small.common { color: var(--muted, #9ba5a1); font-weight: 600; }
      .flybadges-one small.uncommon { color: var(--mint, #5ef2cc); font-weight: 600; }
      .flybadges-one small.rare { color: #8fd8ff; font-weight: 600; }
      .flybadges-one small.legendary { color: #ffd76a; font-weight: 600; }
      .flybadges-row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }`;
    document.head.append(css);
  }

  // holders against every wallet that holds any badge, as on /badges
  const rarity = (n, total) => (!n || !total ? null : n / total >= 0.25 ? "common" : n / total >= 0.1 ? "uncommon" : n / total >= 0.02 ? "rare" : "legendary");

  function badge(b, holders, total) {
    const p = b.progress;
    const line = b.state !== "working" || !p ? t(b.state)
      : p.referrals !== undefined ? t("progressReferrals", { n: Math.min(p.referrals, p.need), need: p.need })
      : p.payouts !== undefined ? t("progressPayouts", { n: Math.min(p.payouts, p.need), need: p.need })
      : t("progress", { days: Math.min(p.days, p.need), need: p.need });
    const on = b.state === "held" || b.state === "claimable";
    const tier = rarity(holders, total);
    return el("div", { className: `flybadges-one${on ? "" : " dim"}` },
      el("img", { src: image(b.id), alt: "", width: 512, height: 512 }),
      el("b", { textContent: NAMES[b.key] || b.key }), el("small", { className: on ? "on" : "", textContent: line }),
      tier ? el("small", { className: tier, textContent: t(tier) }) : "",
      holders ? el("small", { textContent: t("holders", { n: holders }) }) : "");
  }

  // held first, then ready to claim, then the rest in their usual order
  const rank = (b) => (b.state === "held" ? 0 : b.state === "claimable" ? 1 : 2);

  async function fill(session, sub, body, link) {
    const open = (path) => fetch(`${API}${path}`).then((x) => x.json()).catch(() => ({}));
    const [r, pub, board] = await Promise.all([fetch(`${API}/api/badges/me`, { headers: { "x-flyai-session": session.token } }), open("/api/badges"), open("/api/badges/leaderboard")]);
    const me = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(me.error || `HTTP ${r.status}`);
    const holders = Object.fromEntries((pub.badges || []).map((b) => [b.key, b.claimed]));
    if (!me.on) { sub.textContent = t("soon"); return; }
    const held = me.badges.filter((b) => b.state === "held").length;
    const ready = me.badges.filter((b) => b.state === "claimable").length;
    sub.textContent = t("count", { n: held, of: me.badges.length }) + (ready ? ` · ${t("ready", { n: ready })}` : "");
    body.replaceChildren(...[...me.badges].sort((a, b) => rank(a) - rank(b) || a.id - b.id).map((b) => badge(b, holders[b.key] ?? 0, board.total ?? 0)));
    link.className = ready ? "btn sm" : "btn sm ghost";
  }

  window.flyBadges = {
    open(session) {
      style();
      const sub = el("p", { className: "flybadges-sub", textContent: t("loading") });
      const body = el("div", { className: "flybadges-grid" });
      const link = el("a", { className: "btn sm ghost", href: "/badges", textContent: t("open") });
      const shut = el("button", { type: "button", className: "btn sm ghost", textContent: t("close") });
      const pop = el("div", { className: "flybadges-pop" }, el("h3", { textContent: t("title") }), sub, body, el("div", { className: "flybadges-row" }, shut, link));
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-modal", "true");
      const back = el("div", { className: "flybadges-back" }, pop);
      const close = () => { back.remove(); document.removeEventListener("keydown", esc); };
      const esc = (e) => { if (e.key === "Escape") close(); };
      document.addEventListener("keydown", esc);
      back.addEventListener("click", (e) => { e.stopPropagation(); if (e.target === back) close(); });
      shut.addEventListener("click", close);
      document.body.append(back);
      shut.focus();
      fill(session, sub, body, link).catch((err) => { console.warn("badges:", err); sub.textContent = t("failed"); });
    },
  };
})();
