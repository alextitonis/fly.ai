/**
 * The profile card (2026-11-03, the user: "a popup profile, which also we should move inside the username, X etc" and
 * "a ? that opens a popup saying how to earn exp"). nav.js loads this on the first click of anything with
 * data-fly-profile="0x…" (leaderboards, names) or the account menu's XP button, then calls window.flyProfile.open(wallet).
 * One read of /api/xp/profile per open. The XP rules live in mine/src/xp.ts; help() lists them.
 */
(function () {
  "use strict";
  const SRC = document.currentScript && document.currentScript.src;
  const NAV = window.flyNav || {};
  const LOCAL_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api");
  const API = LOCAL_API || NAV.MINE_API || "https://flyai-mine.fly.dev";
  const READ = LOCAL_API || NAV.MINE_READ || API;
  const EN = {
    loading: "Loading…", failed: "Couldn't load this profile.", close: "Close", help: "How to earn XP",
    level: "Level {n}", xp: "{xp} XP", toNext: "{n} XP to level {level}", rank: "#{rank} of {of}", unranked: "Not ranked yet",
    team: "Team wallet: not ranked", flies: "Flies", active: "active", inactive: "not trading (hold 200k $FLYAI)",
    streak: "Streak", streakWeeks: "{n} weeks without selling · x{m}", streakNone: "Starts when you hold $FLYAI",
    badges: "Badges", noBadges: "No badges yet", sources: "Where the XP comes from", noXp: "No XP yet", refCode: "Referral code",
    board: "XP leaderboard", share: "Share on X", shareHint: "Post about fly.ai from your linked X account, then paste the link: +20 XP, once a day.",
    sharePh: "https://x.com/you/status/…", shareBtn: "Add", shareOk: "+{n} XP", shareDone: "Today's post is in. Come back tomorrow.",
    connectX: "Connect your X account in the account menu to share for XP.", seasonEnds: "Season 1 ends {date}. XP counts toward the New Year drop.",
    seasonOver: "Season 1 is over. XP counted toward the New Year drop.",
    s_hold: "Holding $FLYAI", s_flies: "Active flies", s_deposits: "Fly wallet deposits", s_feed: "Feeding the Fly Desk", s_market: "Marketplace trades",
    s_buy: "Swap box buys", s_claimstake: "Claim and stake", s_breed: "Breeding", s_passburn: "FlightPass burns", s_badges: "Badges",
    account: "Your account", badgesBtn: "🏅 Badges", referralsBtn: "Referrals",
    log: "XP log", logBefore: "everything up to {date}", noLog: "Nothing logged yet.", logTx: "tx", logPost: "post",
    s_referrals: "Referrals", s_x: "X connected", s_share: "X posts", s_flybook: "Flybook days",
    h_title: "How to earn XP", h_intro: "XP adds up through Season 1 and counts toward the New Year drop. It updates about every 10 minutes.",
    h_hold: "<b>Hold $FLYAI</b>: 10 XP a day per 200k. Staked or locked: 12.5.",
    h_flies: "<b>Active Trader Flies</b>: 10 XP a day each, while your wallet holds 200k $FLYAI.",
    h_streak: "<b>Streak</b>: +10% on holding and fly XP for every week you don't sell, up to 2x. A sell starts it again.",
    h_deposits: "<b>Fly wallet deposits</b> of $10 or more: 10 XP per $1. Taking your deposit back out takes its XP; profit doesn't.",
    h_feed: "<b>Feed the Fly Desk</b>: 10 XP per $1 your fly leaves in.",
    h_market: "<b>Marketplace</b>: 1 XP per 10k $FLYAI traded, buyer and seller.",
    h_buy: "<b>Buy $FLYAI in our swap box</b> (/start): 1 XP per 10k bought.",
    h_claimstake: "<b>Claim and stake</b> a Fly Desk payout within the hour: 50 XP.",
    h_breed: "<b>Breed</b> two flies: 500 XP.",
    h_passburn: "<b>Burn a FlightPass</b> (send it to 0x…dEaD): 100 XP.",
    h_badges: "<b>Badges</b> you claim: common 25, uncommon 100, rare 250, legendary 500.",
    h_referrals: "<b>Referrals</b>: +10% of the XP of everyone you bring who becomes a real referral.",
    h_x: "<b>X</b>: 50 XP for connecting your account, 20 XP a day for a post about fly.ai.",
    h_flybook: "<b>Flybook</b>: 5 XP a day you like, comment, poke or caption (for holders and fly owners).",
    h_foot: "Team wallets and fly wallets aren't ranked. Levels: level 1 at 50 XP, 2 at 200, 3 at 450, 10 at 5,000.",
  };
  const HELP = ["hold", "flies", "streak", "deposits", "feed", "market", "buy", "claimstake", "breed", "passburn", "badges", "referrals", "x", "flybook"];

  function t(key, vars) {
    let v = window.flyI18n ? window.flyI18n.t("common.xp." + key, vars) : null;
    if (!v || v === "common.xp." + key) v = (EN[key] || key).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
    return v;
  }
  const el = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props || {}); e.append(...kids.filter((k) => k !== null && k !== undefined && k !== "")); return e; };
  const html = (tag, props, markup) => { const e = el(tag, props); e.innerHTML = markup; return e; };   // our own strings only
  const fmt = (n) => Math.round(n).toLocaleString();
  const short = (w) => (NAV.short ? NAV.short(w) : `${w.slice(0, 6)}…${w.slice(-4)}`);
  const badgeSrc = (id) => (SRC ? new URL(`badges/${id}.svg`, SRC).href : `/assets/badges/${id}.svg`);
  const session = () => (NAV.session ? NAV.session() : null);

  let css = null;
  function style() {
    if (css) return;
    css = document.createElement("style");
    css.textContent = `.flyprof-back { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.6); display: flex; align-items: center;
        justify-content: center; padding: 16px; }
      .flyprof-pop { background: var(--bg, #0b0b0b); color: var(--text, #fff); border: 1px solid var(--line, #2a2a2a); border-radius: 16px;
        width: min(520px, 100%); max-height: 88vh; overflow: auto; padding: 20px; font: 14px/1.5 var(--sans, inherit); }
      .flyprof-head { display: flex; gap: 12px; align-items: center; }
      .flyprof-head img.av { width: 48px; height: 48px; border-radius: 50%; flex: none; background: var(--line, #2a2a2a); }
      .flyprof-head .who { flex: 1; min-width: 0; }
      .flyprof-head h3 { margin: 0; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .flyprof-head a.x, .flyprof-head .w { font: 12px var(--mono, monospace); color: var(--muted, #9ba5a1); text-decoration: none; }
      .flyprof-q { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line, #2a2a2a); background: none; color: var(--text, #fff);
        font: 600 15px var(--sans, inherit); cursor: pointer; flex: none; }
      .flyprof-q:hover { border-color: var(--mint, #5ef2cc); color: var(--mint, #5ef2cc); }
      .flyprof-level { margin: 16px 0 4px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .flyprof-level b { font: 700 22px var(--sans, inherit); color: var(--mint, #5ef2cc); }
      .flyprof-level span { font: 13px var(--mono, monospace); color: var(--muted, #9ba5a1); }
      .flyprof-bar { height: 6px; border-radius: 3px; background: var(--line, #2a2a2a); overflow: hidden; }
      .flyprof-bar span { display: block; height: 100%; background: var(--mint, #5ef2cc); }
      .flyprof-sub { margin: 4px 0 0; color: var(--muted, #9ba5a1); font-size: 13px; }
      .flyprof-sec { margin-top: 16px; }
      .flyprof-sec h4 { margin: 0 0 6px; font-size: 13px; color: var(--muted, #9ba5a1); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
      .flyprof-kv { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-top: 1px solid var(--line, #2a2a2a); }
      .flyprof-kv:first-of-type { border-top: 0; }
      .flyprof-kv span:last-child { font: 13px var(--mono, monospace); color: var(--text, #fff); text-align: right; }
      .flyprof-badges { display: flex; flex-wrap: wrap; gap: 6px; }
      .flyprof-badges img { width: 36px; height: 36px; border-radius: 8px; }
      .flyprof-share { display: flex; gap: 6px; margin-top: 6px; }
      .flyprof-share input { flex: 1; min-width: 0; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--line, #2a2a2a); background: transparent; color: inherit; font: inherit; }
      .flyprof-msg { margin: 6px 0 0; font-size: 13px; color: var(--muted, #9ba5a1); }
      .flyprof-msg.ok { color: var(--mint, #5ef2cc); } .flyprof-msg.err { color: var(--red-hi, #ff6b6b); }
      .flyprof-help li { margin: 0 0 8px; color: var(--muted, #9ba5a1); } .flyprof-help li b { color: var(--text, #fff); }
      .flyprof-help ul { padding-left: 18px; margin: 10px 0; }
      .flyprof-log { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow: auto; }
      .flyprof-log li { display: grid; grid-template-columns: 74px minmax(0, 1fr) auto; gap: 8px; padding: 4px 0; border-top: 1px solid var(--line, #2a2a2a); font-size: 13px; }
      .flyprof-log li:first-child { border-top: 0; }
      @media (max-width: 520px) { .flyprof-log { max-height: none; overflow: visible; } }   /* one scroll on phones: the card's */
      .flyprof-log time { font: 12px var(--mono, monospace); color: var(--dim, #7a8480); }
      .flyprof-log span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .flyprof-log a { color: var(--muted, #9ba5a1); font-size: 12px; margin-left: 6px; }
      .flyprof-log b { font: 600 13px var(--mono, monospace); color: var(--mint, #5ef2cc); text-align: right; }
      .flyprof-settings > div:not([hidden]) { display: grid; gap: 6px; padding: 8px 0; border-top: 1px solid var(--line, #2a2a2a); }
      .flyprof-settings > div:first-of-type { border-top: 0; }
      .flyprof-settings label { font-size: 12px; color: var(--muted, #9ba5a1); }
      .flyprof-settings .acct-nick > div, .flyprof-settings .acct-ref > div, .flyprof-settings .acct-x > div { display: flex; gap: 6px; align-items: center; }
      .flyprof-settings .acct-x > div { justify-content: space-between; }
      .flyprof-settings input { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 6px 8px; border-radius: 8px;
        border: 1px solid var(--line, #2a2a2a); background: var(--bg, #000); color: var(--text, #f4f7f6); }
      .flyprof-settings small { font-size: 12px; color: var(--muted, #9ba5a1); min-height: 1em; }
      .flyprof-settings .acct-x-handle { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: inherit; }
      .flyprof-settings .acct-x-handle img { border-radius: 50%; flex: none; }
      .flyprof-settings .acct-badges:not([hidden]) { display: flex; flex-wrap: wrap; gap: 4px; }
      .flyprof-settings .acct-badges .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(94,242,204,.12); color: var(--mint, #5ef2cc); }
      .flyprof-row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }`;
    document.head.append(css);
  }

  /** A modal: Escape, the backdrop and Close shut it. */
  function modal(...kids) { return modalWith(null, ...kids); }
  function modalWith(onClose, ...kids) {
    style();
    const shut = el("button", { type: "button", className: "btn sm ghost", textContent: t("close") });
    const row = el("div", { className: "flyprof-row" }, shut);
    const pop = el("div", { className: "flyprof-pop" }, ...kids, row);
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "true");
    const back = el("div", { className: "flyprof-back" }, pop);
    const close = () => { back.remove(); document.removeEventListener("keydown", esc); if (onClose) onClose(); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    back.addEventListener("click", (e) => { e.stopPropagation(); if (e.target === back) close(); });
    shut.addEventListener("click", close);
    document.body.append(back);
    shut.focus();
    return { pop, row, close };
  }

  function help() {
    const list = el("ul", null, ...HELP.map((k) => html("li", null, t("h_" + k))));
    modal(el("div", { className: "flyprof-help" }, el("h3", { textContent: t("h_title") }, ), el("p", { className: "flyprof-sub", textContent: t("h_intro") }), list,
      el("p", { className: "flyprof-sub", textContent: t("h_foot") })));
  }
  const helpButton = () => {
    const q = el("button", { type: "button", className: "flyprof-q", textContent: "?", title: t("help") });
    q.setAttribute("aria-label", t("help"));
    q.addEventListener("click", (e) => { e.stopPropagation(); help(); });
    return q;
  };

  function shareBox(p) {
    const box = el("div", { className: "flyprof-sec" }, el("h4", { textContent: t("share") }));
    if (!p.x) return box.append(el("p", { className: "flyprof-msg", textContent: t("connectX") })), box;
    if (p.shared_today) return box.append(el("p", { className: "flyprof-msg ok", textContent: t("shareDone") })), box;
    const input = el("input", { type: "url", placeholder: t("sharePh") });
    const go = el("button", { type: "button", className: "btn sm", textContent: t("shareBtn") });
    const msg = el("p", { className: "flyprof-msg", textContent: t("shareHint") });
    go.addEventListener("click", async () => {
      const s = session();
      if (!s) return;
      go.disabled = true;
      try {
        const r = await fetch(`${API}/api/xp/share`, { method: "POST", body: JSON.stringify({ url: input.value.trim() }),
          headers: { "content-type": "application/json", "x-flyai-session": s.token } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        msg.className = "flyprof-msg ok";
        msg.textContent = t("shareOk", { n: j.xp });
        input.disabled = true;
      } catch (err) {
        msg.className = "flyprof-msg err";
        msg.textContent = String(err.message || err);
        go.disabled = false;
      }
    });
    box.append(el("div", { className: "flyprof-share" }, input, go), msg);
    return box;
  }

  /** The XP log: what came from where, newest first. */
  function logList(items) {
    const box = el("div", { className: "flyprof-sec" }, el("h4", { textContent: t("log") }));
    if (!items || !items.length) return box.append(el("p", { className: "flyprof-msg", textContent: t("noLog") })), box;
    const date = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    box.append(el("ul", { className: "flyprof-log" }, ...items.map((i) => el("li", null,
      // a daily row is a UTC day: show that day, not the local date of its last second
      el("time", { textContent: date(i.day ? `${i.day}T12:00:00` : i.at), dateTime: i.day || i.at }),
      el("span", null, t("s_" + i.source), i.before ? ` · ${t("logBefore", { date: date(`${i.day}T12:00:00`) })}` : "",
        i.tx ? el("a", { href: `https://robinhoodchain.blockscout.com/tx/${i.tx}`, target: "_blank", rel: "noopener", textContent: t("logTx") }) : null,
        i.post ? el("a", { href: `https://x.com/i/status/${i.post}`, target: "_blank", rel: "noopener", textContent: t("logPost") }) : null),
      el("b", { textContent: `+${fmt(i.xp)}` })))));
    return box;
  }

  function render(p, mine, log, account) {
    const name = p.nickname || (p.x ? `@${p.x}` : short(p.wallet));
    const head = el("div", { className: "flyprof-head" },
      p.avatar ? el("img", { className: "av", src: p.avatar, alt: "", width: 48, height: 48, referrerPolicy: "no-referrer" }) : el("img", { className: "av", alt: "" }),
      el("div", { className: "who" }, el("h3", { textContent: name }),
        p.x ? el("a", { className: "x", href: `https://x.com/${p.x}`, target: "_blank", rel: "noopener", textContent: `@${p.x}` }) : null,
        p.x ? el("span", { className: "w", textContent: " · " }) : null,
        el("a", { className: "w", href: `https://robinhoodchain.blockscout.com/address/${p.wallet}`, target: "_blank", rel: "noopener", textContent: short(p.wallet) })),
      helpButton());
    const prev = p.level > 0 ? 50 * p.level * p.level : 0;
    const pct = Math.max(0, Math.min(100, ((p.xp - prev) / Math.max(1, p.next - prev)) * 100));
    const level = [
      el("div", { className: "flyprof-level" }, el("b", { textContent: t("level", { n: p.level }) }), el("span", { textContent: t("xp", { xp: fmt(p.xp) }) })),
      el("div", { className: "flyprof-bar" }, el("span", { style: `width:${pct.toFixed(1)}%` })),
      el("p", { className: "flyprof-sub", textContent: `${t("toNext", { n: fmt(p.next - p.xp), level: p.level + 1 })} · ${
        p.team ? t("team") : p.rank ? t("rank", { rank: p.rank, of: p.of }) : t("unranked")}` }),
    ];
    const kv = (k, v) => el("div", { className: "flyprof-kv" }, el("span", { textContent: k }), el("span", { textContent: v }));
    const stats = el("div", { className: "flyprof-sec" },
      kv(t("flies"), p.flies ? `${p.flies} · ${p.active ? t("active") : t("inactive")}` : "0"),
      kv(t("streak"), p.streak_weeks || p.multiplier > 1 ? t("streakWeeks", { n: p.streak_weeks, m: p.multiplier.toFixed(1) }) : t("streakNone")),
      p.ref_code ? kv(t("refCode"), p.ref_code) : null);
    const badges = el("div", { className: "flyprof-sec" }, el("h4", { textContent: t("badges") }),
      p.badges.length ? el("div", { className: "flyprof-badges" }, ...p.badges.map((id) => el("img", { src: badgeSrc(id), alt: "", width: 36, height: 36 })))
        : el("p", { className: "flyprof-msg", textContent: t("noBadges") }));
    const rows = Object.entries(p.sources || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const sources = el("div", { className: "flyprof-sec" }, el("h4", { textContent: t("sources") }),
      ...(rows.length ? rows.map(([k, v]) => kv(t("s_" + k), fmt(v))) : [el("p", { className: "flyprof-msg", textContent: t("noXp") })]));
    const season = p.season ? el("p", { className: "flyprof-sub", textContent: p.season.over ? t("seasonOver")
      : t("seasonEnds", { date: new Date(Date.parse(p.season.end) - 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }) }) : null;
    return [head, ...level, stats, account, badges, sources, logList(log && log.items), mine ? shareBox(p) : null, season].filter(Boolean);
  }

  /**
   * opts (nav.js, for the signed-in wallet's own card): settings = the account menu's hidden holder (nickname, X,
   * referral, locked $FLYAI, the "Named" chips), shown here while the card is open and put back when it closes;
   * badges() opens the badges popup; referrals = the referrals page.
   */
  async function open(wallet, opts) {
    wallet = String(wallet || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) return;
    opts = opts || {};
    const holder = opts.settings || null;
    const moved = holder ? [...holder.children] : [];
    const account = holder ? el("div", { className: "flyprof-sec flyprof-settings" }, el("h4", { textContent: t("account") }), ...moved) : null;
    const body = el("div", null, el("p", { className: "flyprof-sub", textContent: t("loading") }), account);
    const m = modalWith(holder ? () => holder.append(...moved) : null, body);
    if (opts.referrals) m.row.prepend(el("a", { className: "btn sm ghost", href: opts.referrals, textContent: t("referralsBtn") }));
    if (opts.badges) {
      const b = el("button", { type: "button", className: "btn sm ghost", textContent: t("badgesBtn") });
      b.addEventListener("click", () => { m.close(); opts.badges(); });
      m.row.prepend(b);
    }
    m.row.prepend(el("a", { className: "btn sm", href: "/xp", textContent: t("board") }));   // the XP leaderboard, from every card
    try {
      const s = session();
      const mine = !!(s && s.wallet && s.wallet.toLowerCase() === wallet);
      const [r, log] = await Promise.all([
        fetch(mine ? `${API}/api/xp/me` : `${READ}/api/xp/profile?wallet=${wallet}`, { headers: mine ? { "x-flyai-session": s.token } : {} }),
        fetch(`${READ}/api/xp/log?wallet=${wallet}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
      ]);
      const p = await r.json();
      if (!r.ok || !p.on) throw new Error(p.error || "off");
      if (!body.isConnected) return;   // closed while loading: the settings are back in the menu
      body.replaceChildren(...render(p, mine, log, account));
    } catch (err) {
      console.warn("profile:", err);
      if (body.isConnected) body.replaceChildren(el("p", { className: "flyprof-msg err", textContent: t("failed") }), ...(account ? [account] : []));
    }
  }

  window.flyProfile = { open, help, helpButton };
})();
