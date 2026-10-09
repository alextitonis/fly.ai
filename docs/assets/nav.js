/**
 * The site's one top nav, shared by every page: the docs pages, the Trader Flies app, the world apps (radio,
 * roulette, slots, race, flinder, colosseum) and compute. A page only carries an empty <nav aria-label="Main"></nav>
 * and loads this at the end of <body>; the menu lives here alone, so adding a link is one edit. The link to the
 * page you are on gets .on (and its menu's label too).
 *
 * Hover and keyboard focus open a menu in CSS; this lets a tap or click on its label toggle it (phones have no
 * hover), and closes it on an outside click or Escape. i18n.js translates the links by where they go.
 */
(function () {
  // [label, href, desc] for a link; [menu id, label, items, right-aligned?] for a menu
  // 2026-10-03 (the user, "make Fly AI feel like one product"): every app under Apps - the Colosseum and Trader Flies
  // too, not as separate top-level worlds - and the account menu on the right of every page
  const NAV = [
    ["Home", "/"],
    ["apps", "Apps", [
      ["Flybook", "/flybook/", "The live feed written by fly brains"],
      ["Simulation", "/simulation/", "Flies with real brains in a 3-D world"],
      ["Fly Colosseum", "/colosseum/", "Trader Flies battle for $FLYAI"],
      ["Trader Flies", "/traderflies/traders", "Every fly's wallet, the leaderboard, yours"],
      ["Fly Market", "/traderflies/market", "Buy and sell Trader Flies"],
      ["Fly Terminal", "/terminal", "Watch the flies trade live"],
      ["Fly Desk", "/desk", "Real fly brains trade live; Trader Flies share the profit"],   // live since 2026-10-05: under Apps and NFTs, not Research
      ["Fly Roulette", "/roulette/", "Fly brains vs a toy cap gun"],
      ["Fly Slots", "/slots/", "Spin the reels, a fly brain reacts"],
      ["Fly Race", "/race/", "Six fly brains race to the fruit"],
      // 2026-10-08: pool betting on REK's robot fights (FightPools); the 5th field marks a link "New"
      ["Robot Fights", "/fights/", "Bet on robot fights in USDG, FLYAI or ETH", false, true],
      ["Fly Radio", "/radio/", "A station played by a real fly brain"],
      ["Flinder", "/flinder/", "A fly brain swipes on dating profiles"],
      ["Hardware NFTs", "/traderflies/pets", "FLYAI pets: pre-order a pocket fly"],
      ["Compute", "/compute/", "Mine with your browser, earn $FLYAI"],
      ["Bounties", "/bounties", "Get paid in $FLYAI for memes, bots, research"],
    ]],
    ["nfts", "NFTs", [
      ["How it works", "/how", "The brain, the pots, payouts and partners"],   // 2026-10-05: the explainer page
      ["Trader Flies", "/traderflies/", "The collection and your flies"],
      // 2026-10-03, the user: the inventory and the leaderboard under NFTs, each a page of its own
      ["Inventory", "/traderflies/inventory", "Your flies and their wallets"],
      ["Leaderboard", "/traderflies/leaderboard", "The best Fly Wallets, live"],
      ["Fly Market", "/traderflies/market", "Buy and sell Trader Flies"],
      ["Breed", "/traderflies/breed", "Merge two flies into one"],
      ["Claim", "/traderflies/claim", "Collect your flies' $FLYAI"],
      ["Fly Desk", "/desk", "Real fly brains trade live; Trader Flies share the profit"],
      ["FlightPass", "/traderflies/pass", "Put your flies on autopilot"],
      ["OpenSea", "https://opensea.io/collection/trader-fly-294099831", "Trader Flies on OpenSea"],
    ]],
    // partner collections (2026-10-07, the user: "add on top partners category"): each its own page (Partner.tsx)
    ["partners", "Partners", [
      ["Bullas", "/traderflies/partner", "Bullas NFTs: their own trading wallets and a shared pot"],
    ]],
    ["research", "Research", [
      ["All findings", "/research", "Fighting, the 3-D world, what failed"],
      ["Talking flies", "/research/flybook", "Flybook: can two brains signal?"],
      ["On air", "/research/radio", "How a radio station run by a real fly brain works"],
      ["Roadmap", "/roadmap", "What's done and what's next"],
      ["Changelog", "/changelog", "Everything we shipped, day by day"],   // 2026-10-09
    ]],
    ["token", "$FLYAI", [
      ["Token", "/token", "Contract, chain, where to buy"],
      ["Earn", "/earn", "Lend USDG from your wallet"],   // 2026-10-06: flytrade/EARN-PAGE-PLAN.md
      ["How it works", "/how", "The brain, the pots, payouts and partners"],
      ["Merch", "/shop", "Fly shirts and more", true],
      ["API & skills", "/desk-api", "Buy the desk's answers over x402"],
      ["For Agents", "/agents", "Make Claude talk like a fly"],
    ], true],
  ];
  // the community links (2026-10-05, the user: "add discord & X link in the website"): icons in the bar, a row in the
  // phone menu; the footers carry them as text
  const SOCIAL = [
    ["X", "https://x.com/flydotai", '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2Zm-1.1 18.1h1.7L6.3 3.8H4.5l13.3 16.3Z"/></svg>'],
    ["Discord", "https://discord.gg/2KqfZs4aK8", '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9 -.3 13.5.1 18a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.6ZM8.3 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.4 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>'],
  ];
  const SESSION_KEY = "flyai.compute.session";            // mine/web/account.ts: one session for every app
  const ACCOUNT_JS = "/compute/mine/web/account.js";       // the shared sign-in (built from mine/web)
  const MINE_API = "https://flyai-mine.fly.dev";
  // public reads (leaderboards, fly views, partner pots, stats) through our own domain: vercel.json rewrites /mapi/* to
  // the mine server and Vercel's edge keeps each answer ~30 s (its s-maxage), so a crowd of visitors is one request
  // (2026-10-07). Signed-in calls and writes keep going to MINE_API directly.
  const MINE_READ = /(^|\.)flyaiworld\.com$/.test(location.hostname) ? "/mapi" : MINE_API;
  // the account/search/bell words: English here so the bar renders at once; the page's language comes from
  // /assets/i18n/<lang>/common.json nav.acct (the same file and URL i18n.js loads, so the browser cache is shared) and
  // relabels the bar when it lands (2026-10-04: one home for the translations instead of a table here)
  const ACCT_EN = {
      signInHint: "Sign in at the top right ↗", signIn: "Sign in", myFlies: "My flies", leaderboard: "Leaderboard", nickname: "Nickname", nickHint: "3-20 letters",
      save: "Save", saved: "Saved", compute: "Compute & balance", signOut: "Sign out",
      search: "Search", searchHint: "Apps, #fly, people", openFly: "Open the fly", flies: "Flies", noResults: "Nothing found", notifications: "Notifications", nothingYet: "Nothing yet: fund a fly or play a game", bought: "bought", sold: "sold", colosseum: "Colosseum", place: "place {n}", finished: "finished", payout: "Payout", b_nickname: "Named", b_funded: "Funded a fly", b_profit: "In profit", b_trader: "10+ trades", b_gladiator: "Gladiator", b_champion: "Champion", b_player: "Player", b_regular: "Regular" };
  const LANGS = ["en", "zh-Hans", "zh-Hant", "ko", "tr", "es"];   // i18n.js LANGUAGES
  let acctText = ACCT_EN;

  let hintCss = null;                                      // pageSignIns' style, rebuilt by relabel()

  // 2026-10-04: pages read the session, the mine server and nicknames from here instead of their own copies
  // (they keep a fallback: this loads at the end of <body> and may fail)
  const nickCache = new Map();                             // wallet -> Promise<nickname | null>, for names()
  window.flyNav = { session, MINE_API, MINE_READ, short, names };

  const nav = document.querySelector('nav[aria-label="Main"]');
  if (!nav) return;

  if (!nav.querySelector("ul")) {
    // "/research/flybook.html", "/research/flybook/", "/research/flybook" -> "research/flybook"; "/" -> ""
    const route = (path) => path.replace(/(^|\/)index\.html$/, "/").replace(/\.html$/, "").replace(/^\/+|\/+$/g, "");
    let here = location.pathname;
    // docs pages opened from disk: keep the part after the site folder, and point links at the files beside it
    const docs = location.protocol === "file:" ? here.lastIndexOf("/docs/") : -1;
    const root = docs >= 0 ? here.slice(0, docs + 6) : null;
    if (root) here = here.slice(docs + 5);
    here = route(here);
    const fileHref = (href) => {
      if (!root || !href.startsWith("/")) return href;
      const r = route(href);
      return root + (r === "" ? "index.html" : href.endsWith("/") ? `${r}/index.html` : `${r}.html`);
    };
    const el = (tag, attrs, ...kids) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      e.append(...kids);
      return e;
    };
    const external = (href) => /^https?:/.test(href);
    const link = ([label, href, desc, newTab, isNew]) => {
      const a = el("a", { href: fileHref(href) }, label);
      if (isNew) a.append(el("span", { class: "nav-new" }, "New"));
      if (desc) a.append(el("small", null, desc));
      if (external(href) || newTab) { a.target = "_blank"; a.rel = "noopener"; }
      if (!external(href) && route(href) === here) a.className = "on";
      return a;
    };

    const ul = el("ul");
    // phones (2026-10-03, the user: "the website view on mobile is awful"): the menus fold into one ☰ panel, so the
    // bar is a single row - logo, search, bell, account, ☰ - instead of three
    const panel = el("div", { class: "mnav", id: "mnav", hidden: "" });
    for (const item of NAV) {
      if (!Array.isArray(item[2])) { panel.append(el("ul", { class: "mnav-top" }, el("li", null, link([item[0], item[1]])))); continue; }
      panel.append(el("section", { class: "mnav-sec" }, el("p", { class: "mnav-h", "data-menu": item[0] }, item[1]),
        el("ul", null, ...item[2].map(([label, href, , newTab, isNew]) => el("li", null, link([label, href, undefined, newTab, isNew]))))));
    }
    panel.append(el("ul", { class: "mnav-top mnav-social" }, ...SOCIAL.map(([label, href]) => el("li", null, link([label, href])))));
    for (const item of NAV) {
      if (!Array.isArray(item[2])) { ul.append(el("li", { class: "main" }, link(item))); continue; }
      const [id, label, items, right] = item;
      const btn = el("button", { class: "ddbtn ddlabel", type: "button", "aria-expanded": "false", "aria-controls": `dd-${id}` },
        `${label} `, el("span", { "aria-hidden": "true" }, "▾"));
      // a long menu goes two columns (2026-10-04, the user: Apps "going down of the screen because it's too long")
      const menu = el("ul", { class: `ddmenu${right ? " right" : ""}${items.length > 8 ? " wide" : ""}`, id: `dd-${id}` });
      for (const it of items) menu.append(el("li", null, link(it)));
      if (menu.querySelector("a.on")) btn.classList.add("on");
      ul.append(el("li", { class: "dd main" }, btn, menu));
    }
    const burger = el("button", { class: "burger-btn", type: "button", "aria-expanded": "false", "aria-controls": "mnav", "aria-label": "Menu" },
      el("i"), el("i"), el("i"));                         // three drawn bars that turn into an X (CSS), not the ☰ glyph
    const social = el("li", { class: "main social" });
    for (const [label, href, svg] of SOCIAL) {
      const a = el("a", { href, target: "_blank", rel: "noopener", "aria-label": label, title: label });
      a.innerHTML = svg;
      social.append(a);
    }
    ul.append(social, searchBox(el), ...(session() || follows().length ? [bell(el)] : []), account(el, fileHref), el("li", { class: "burger" }, burger));

    const brand = el("a", { class: "brand", href: fileHref("/") },
      el("img", { class: "logo", src: root ? `${root}assets/logo-t.webp` : "/assets/logo-t.webp", alt: "fly.ai", width: "988", height: "439" }));
    nav.replaceChildren(el("div", { class: "wrap" }, brand, ul), panel);
  }
  {
    const burger = nav.querySelector(".burger-btn"), panel = nav.querySelector("#mnav");
    if (burger && panel) {
      const set = (open) => { panel.hidden = !open; burger.setAttribute("aria-expanded", String(open));
        document.documentElement.classList.toggle("mnav-open", open); };
      burger.addEventListener("click", (e) => { e.stopPropagation(); set(panel.hidden); });
      document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target)) set(false); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) set(false); });
      matchMedia("(min-width: 761px)").addEventListener("change", (m) => { if (m.matches) set(false); });
    }
  }

  const textReady = loadText(nav);
  wireAccount(nav);
  pageSignIns(nav);
  wireSearch(nav, NAV);
  wireBell(nav, textReady);
  const menus = [...nav.querySelectorAll("li.dd")];
  const close = (dd) => { dd.classList.remove("open"); dd.querySelector(".ddbtn").setAttribute("aria-expanded", "false"); };
  // one menu at a time (2026-10-03, the user: "open a dropdown and then another, the previous stays open"): a menu shows
  // on hover, on focus inside it or when clicked open, so opening one shuts every other - its click state, its
  // keyboard focus, and (.shut) its hover/focus rules - until the pointer or focus goes back to it
  const only = (dd) => {
    for (const m of menus) {
      if (m === dd) { m.classList.remove("shut"); continue; }
      close(m);
      m.classList.add("shut");
      if (m.contains(document.activeElement)) document.activeElement.blur();
    }
  };
  for (const dd of menus) {
    dd.addEventListener("mouseenter", () => only(dd));
    dd.addEventListener("focusin", () => only(dd));
  }
  for (const dd of menus) {
    const btn = dd.querySelector(".ddbtn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !dd.classList.contains("open");
      only(dd);
      close(dd);
      if (open) { dd.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
      else if (dd.contains(document.activeElement)) document.activeElement.blur();   // a second click really closes it
    });
    dd.addEventListener("focusout", (e) => { if (!dd.contains(e.relatedTarget)) close(dd); });
  }
  document.addEventListener("click", (e) => menus.forEach((dd) => { if (!dd.contains(e.target)) close(dd); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menus.forEach(close); });

  /**
   * The account menu on every page (2026-10-03, "sign in once, a global user menu"): the site's one wallet session
   * (localStorage flyai.compute.session - the Colosseum, games, compute and Trader Flies already share it), shown by
   * nickname (the mine server's /api/profiles). Signed out: "Sign in", which loads the shared sign-in
   * (/compute/mine/web/account.js) only when clicked. Signed in: my flies, the leaderboard, a nickname box, Flybook,
   * compute, sign out.
   */
  function account(el, fileHref) {
    const s = session();
    const li = el("li", { class: "dd acct" });
    const btn = el("button", { class: "ddbtn ddlabel acct-btn", type: "button", "aria-expanded": "false", "aria-controls": "dd-acct" });
    const menu = el("ul", { class: "ddmenu right", id: "dd-acct" });
    if (!s) {
      const b = el("button", { class: "btn sm acct-in", type: "button", "data-l": "signIn" }, L("signIn"));   // a button, not a menu
      const plain = el("li", { class: "acct" }, b);
      plain.dataset.signin = "1";
      return plain;
    }
    btn.append(el("span", { class: "acct-name" }, short(s.wallet)), el("span", { "aria-hidden": "true" }, " ▾"));
    const item = (key, href) => el("li", null, el("a", { href: fileHref(href), ...(key in ACCT_EN ? { "data-l": key } : {}) }, L(key)));
    const form = el("li", { class: "acct-nick" },
      el("label", { for: "acct-nick", "data-l": "nickname" }, L("nickname")),
      el("div", null, el("input", { id: "acct-nick", maxlength: "20", placeholder: L("nickHint"), "data-l-ph": "nickHint" }),
        el("button", { type: "button", class: "btn sm", "data-l": "save" }, L("save"))),
      el("small", { class: "acct-msg" }));
    menu.append(el("li", { class: "acct-badges", hidden: "" }),
      item("myFlies", "/traderflies/traders?view=mine"), item("leaderboard", "/traderflies/traders?view=board"),
      form, item("Flybook", "/flybook/"), item("compute", "/compute/"),
      el("li", null, el("button", { type: "button", class: "acct-out", "data-l": "signOut" }, L("signOut"))));
    li.append(btn, menu);
    return li;
  }

  function wireAccount(nav) {
    const li = nav.querySelector("li.acct");
    if (!li) return;
    if (li.dataset.signin) {
      li.querySelector("button").addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const acct = await import(ACCOUNT_JS);
          const w = await acct.signIn();
          if (w) location.reload();
        } catch (err) { console.warn("sign in:", err); }
      });
      return;
    }
    const s = session();
    // the nickname instead of 0x... once the server answers
    names([s.wallet]).then((got) => {
      const nick = got[s.wallet.toLowerCase()];
      if (nick) {
        li.querySelector(".acct-name").textContent = nick;
        li.querySelector("#acct-nick").value = nick;
      }
    }).catch(() => {});
    const input = li.querySelector("#acct-nick"), msg = li.querySelector(".acct-msg");
    li.querySelector(".acct-nick button").addEventListener("click", async (e) => {
      e.stopPropagation();
      msg.textContent = "…";
      try {
        const r = await fetch(`${MINE_API}/api/profile`, { method: "POST", body: JSON.stringify({ nickname: input.value }),
          headers: { "content-type": "application/json", "x-flyai-session": s.token } });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        li.querySelector(".acct-name").textContent = body.nickname || short(s.wallet);
        msg.textContent = L("saved");
      } catch (err) { msg.textContent = String(err.message || err); }
    });
    li.querySelector(".acct-nick").addEventListener("click", (e) => e.stopPropagation());   // typing doesn't close it
    li.querySelector(".acct-out").addEventListener("click", async () => {
      try { (await import(ACCOUNT_JS)).signOut(); } catch { /* the page had no wallet code: clear it here */ }
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      location.reload();
    });
  }

  /**
   * One sign-in button per page (2026-10-04, the user: "double login buttons to some pages while the navbar has 1"):
   * signed out, a page's own sign-in button (marked data-nav-signin) shows as a pointer to the nav's and a
   * click on it runs the nav's sign-in. Signed in, the page's buttons are back as they were (a Trader Flies page may
   * still need its wallet reconnected).
   */
  function pageSignIns(nav) {
    const btn = nav.querySelector("li.acct[data-signin] button");
    if (!btn) return;
    const root = document.documentElement;
    root.classList.add("nav-signed-out");
    // the look lives here, not in site.css: the game pages don't load site.css
    hintCss = document.createElement("style");
    hintCss.textContent = hintStyle();
    document.head.append(hintCss);
    document.addEventListener("click", (e) => {
      if (!e.target.closest || !e.target.closest("[data-nav-signin]")) return;
      e.preventDefault();
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: "smooth" });
      btn.click();
    }, true);   // capture: before the page's own handler
  }
  function hintStyle() {
    return `.nav-signed-out [data-nav-signin] { background: none !important; border: 0 !important; box-shadow: none !important;
      padding: 0 !important; width: auto !important; min-width: 0 !important; font-size: 0 !important; cursor: pointer; }
    .nav-signed-out [data-nav-signin] * { display: none !important; }
    .nav-signed-out [data-nav-signin]::after { content: ${JSON.stringify(L("signInHint"))}; font: 600 14px/1.4 var(--sans, inherit);
      color: var(--mint, #5ef2cc); text-decoration: underline; text-underline-offset: 3px; }`;
  }

  function session() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return s && s.expires_at > Date.now() && s.wallet && s.token ? s : null;
    } catch { return null; }
  }
  function short(w) { return `${w.slice(0, 6)}…${w.slice(-4)}`; }
  /** wallet (lowercase) -> nickname for a list of wallets, one /api/profiles call per uncached batch; never throws. */
  async function names(wallets) {
    const want = [...new Set((wallets || []).filter(Boolean).map((w) => String(w).toLowerCase()))];
    const miss = want.filter((w) => !nickCache.has(w));
    for (let i = 0; i < miss.length; i += 100) {
      const part = miss.slice(i, i + 100);
      const got = fetch(`${MINE_API}/api/profiles?wallets=${part.join(",")}`).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
      for (const w of part) nickCache.set(w, got.then((m) => (m && m[w]) || null));
    }
    const out = {};
    for (const w of want) { const n = await nickCache.get(w); if (n) out[w] = n; }
    return out;
  }
  function L(key) { return acctText[key] || ACCT_EN[key] || key; }
  /** The page's language, picked like i18n/boot.js: ?lang=, then the saved choice. */
  function pageLang() {
    let lang = "en";
    try { lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("flyai.lang") || "en"; } catch {}
    return LANGS.includes(lang) ? lang : "en";
  }
  /** Loads nav.acct for the page's language (never rejects; English stays on any failure), then relabels the bar. */
  function loadText(nav) {
    const lang = pageLang();
    if (lang === "en") return Promise.resolve();
    // i18n.js's own URL for common.json; a docs page opened from disk reads the folder beside it
    const docs = location.protocol === "file:" ? location.pathname.lastIndexOf("/docs/") : -1;
    const base = docs >= 0 ? `${location.pathname.slice(0, docs + 6)}assets/i18n/` : "/assets/i18n/";
    return fetch(`${base}${lang}/common.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const got = j && j.nav && j.nav.acct;
      if (!got) return;
      acctText = { ...ACCT_EN, ...got };
      relabel(nav);
    }).catch(() => {});
  }
  /** Puts L() words on everything built before they loaded: data-l text, data-l-ph placeholder, data-l-aria label. */
  function relabel(nav) {
    if (nav) {
      for (const e of nav.querySelectorAll("[data-l]")) e.textContent = L(e.dataset.l);
      for (const e of nav.querySelectorAll("[data-l-ph]")) e.placeholder = L(e.dataset.lPh);
      for (const e of nav.querySelectorAll("[data-l-aria]")) { e.setAttribute("aria-label", L(e.dataset.lAria)); e.title = L(e.dataset.lAria); }
    }
    if (hintCss) hintCss.textContent = hintStyle();
  }

  // ---- search, notifications, badges (2026-10-03, "one product": global search, a notification center, achievements) ----

  /** 🔍 for everyone: apps by name (the menu itself), a fly by number (#471), people by nickname (the mine server). */
  function searchBox(el) {
    return el("li", { class: "dd srch" },
      el("button", { class: "ddbtn ddlabel srch-btn", type: "button", "aria-expanded": "false", "aria-controls": "dd-srch",
        "aria-label": L("search"), title: L("search"), "data-l-aria": "search" }, "🔍"),
      el("ul", { class: "ddmenu right", id: "dd-srch" },
        el("li", { class: "srch-box" }, el("input", { type: "search", id: "srch-q", placeholder: L("searchHint"), "data-l-ph": "searchHint", autocomplete: "off" })),
        el("li", { class: "srch-out" })));
  }
  function wireSearch(nav, NAV) {
    const li = nav.querySelector("li.srch");
    if (!li) return;
    const input = li.querySelector("#srch-q"), out = li.querySelector(".srch-out");
    const apps = [];
    for (const it of NAV) for (const x of Array.isArray(it[2]) ? it[2] : [it]) if (typeof x[1] === "string" && x[1].startsWith("/")) apps.push(x);
    li.addEventListener("click", (e) => { if (e.target.closest(".srch-box, .srch-out")) e.stopPropagation(); });
    li.querySelector(".srch-btn").addEventListener("click", () => setTimeout(() => input.focus(), 0));
    let seq = 0;
    const row = (label, sub, href) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (sub) { const s_ = document.createElement("small"); s_.textContent = sub; a.append(s_); }
      return a;
    };
    input.addEventListener("input", async () => {
      const q = input.value.trim(), my = ++seq;
      out.replaceChildren();
      if (!q) return;
      const num = q.replace(/^#/, "");
      if (/^\d{1,4}$/.test(num)) out.append(row(`Trader Fly #${num}`, L("openFly"), `/traderflies/fly?id=${num}`));
      for (const a of apps.filter((x) => x[0].toLowerCase().includes(q.toLowerCase())).slice(0, 5)) out.append(row(a[0], a[2] || "", a[1]));
      if (q.length >= 2 && !/^\d+$/.test(num)) {
        try {
          const people = await (await fetch(`${MINE_API}/api/profiles/search?q=${encodeURIComponent(q)}`)).json();
          if (my !== seq) return;
          for (const p of people) {
            const f = (p.flies || [])[0];
            out.append(row(p.nickname, f ? `${L("flies")}: ${(p.flies || []).slice(0, 5).map((x) => "#" + x).join(" ")}` : short(p.wallet),
              f ? `/traderflies/fly?id=${f}` : `/traderflies/traders?view=board`));
          }
        } catch { /* people are a nicety */ }
      }
      if (my === seq && !out.children.length) out.append(Object.assign(document.createElement("small"), { textContent: L("noResults") }));
    });
  }

  /** 🔔 for a signed-in wallet: what happened lately (its flies' trades, Colosseum results, payouts); unread since last open. */
  function bell(el) {
    return el("li", { class: "dd bell" },
      el("button", { class: "ddbtn ddlabel bell-btn", type: "button", "aria-expanded": "false", "aria-controls": "dd-bell",
        "aria-label": L("notifications"), title: L("notifications"), "data-l-aria": "notifications" }, "🔔", el("b", { class: "bell-n", hidden: "" })),
      el("ul", { class: "ddmenu right", id: "dd-bell" }, el("li", { class: "bell-list" }, el("small", null, "…"))));
  }
  async function loadSummary() {
    const s = session();
    if (!s) return null;
    try {
      const hit = JSON.parse(sessionStorage.getItem("flyai.summary") || "null");
      if (hit && hit.wallet === s.wallet.toLowerCase() && Date.now() - hit.t < 60_000) return hit.v;
    } catch {}
    try {
      const r = await fetch(`${MINE_API}/api/profile/summary`, { headers: { "x-flyai-session": s.token } });
      if (!r.ok) return null;
      const v = await r.json();
      try { sessionStorage.setItem("flyai.summary", JSON.stringify({ wallet: v.wallet, t: Date.now(), v })); } catch {}
      return v;
    } catch { return null; }
  }
  function wireBell(nav, textReady) {
    const li = nav.querySelector("li.bell");
    if (!session() && !follows().length) return;
    void Promise.all([loadSummary(), textReady, followFeed()]).then(([v, , followed]) => {
      window.flySummary = v;
      window.dispatchEvent(new CustomEvent("fly:summary", { detail: v }));
      if (v && v.nickname) { const n_ = nav.querySelector(".acct-name"); if (n_) n_.textContent = v.nickname; }
      const badges = nav.querySelector(".acct-badges");
      if (v && badges && v.badges && v.badges.length) {
        badges.hidden = false;
        badges.replaceChildren(...v.badges.map((b) => Object.assign(document.createElement("span"), { className: "badge", textContent: L("b_" + b), title: L("b_" + b) })));
      }
      if (!li) return;
      // the account's own news and the followed flies' trades, newest first (one row per trade)
      const key = (f) => `${f.kind}:${f.fly}:${f.at}:${f.symbol}`;
      const feed = [...new Map([...((v && v.feed) || []), ...followed].map((f) => [key(f), f])).values()]
        .sort((a, b) => b.at - a.at).slice(0, 30);
      let seen = 0;
      try { seen = Number(localStorage.getItem("flyai.notif.seen") || 0); } catch {}
      const unread = feed.filter((f) => f.at > seen).length;
      const n = li.querySelector(".bell-n");
      if (unread) { n.textContent = unread > 9 ? "9+" : String(unread); n.hidden = false; }
      const list = li.querySelector(".bell-list");
      list.replaceChildren(...(feed.length ? feed.map((f) => feedRow(f, f.at > seen)) : [Object.assign(document.createElement("small"), { textContent: L("nothingYet") })]));
      li.querySelector(".bell-btn").addEventListener("click", () => {
        try { localStorage.setItem("flyai.notif.seen", String(Date.now())); } catch {}
        n.hidden = true;
      });
    });
  }

  /**
   * Following flies (2026-10-04, from what Fomo does: "watched your trades and want the next one pushed"): the fly numbers
   * this browser follows (localStorage flyai.follows; the Follow buttons on the fly page and the leaderboard use
   * window.flyFollow). Their trades come from the mine server's combined feed (one read, cached there) into the bell,
   * and while a page is open a new one also shows as a browser notification when the person allowed them.
   */
  function follows() {
    try { return (JSON.parse(localStorage.getItem("flyai.follows") || "[]") || []).map(Number).filter((x) => x > 0); } catch { return []; }
  }
  async function followFeed() {
    const ids = follows();
    if (!ids.length) return [];
    try {
      const f = await fetch(`${MINE_READ}/api/vaults/feed?chain=robinhood`).then((r) => r.json());
      return ids.flatMap((id) => (((f.flies || {})[id] || {}).recent || []).map((r) => ({ kind: "trade", fly: id,
        side: r.side === "buy" ? "buy" : "sell", symbol: r.label || r.symbol, usd: r.usd, pnl_pct: r.pnl_pct, at: r.at * 1000 })));
    } catch { return []; }
  }
  window.flyFollow = {
    list: follows,
    has: (id) => follows().includes(Number(id)),
    /** follow or unfollow; following asks once to allow notifications */
    toggle(id) {
      id = Number(id);
      const now = follows(), on = !now.includes(id);
      const next = on ? [...now, id].slice(-50) : now.filter((x) => x !== id);
      try { localStorage.setItem("flyai.follows", JSON.stringify(next)); } catch {}
      if (on && "Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      window.dispatchEvent(new CustomEvent("fly:follows", { detail: next }));
      return on;
    },
  };
  // while a page is open: a followed fly's new trade pops up (every 2 minutes, only when the tab is in view)
  setInterval(async () => {
    if (document.hidden || !follows().length || !("Notification" in window) || Notification.permission !== "granted") return;
    let last = 0;
    try { last = Number(localStorage.getItem("flyai.follows.notified") || Date.now()); } catch {}
    const fresh = (await followFeed()).filter((f) => f.at > last).sort((a, b) => a.at - b.at);
    if (!fresh.length) return;
    try { localStorage.setItem("flyai.follows.notified", String(fresh[fresh.length - 1].at)); } catch {}
    for (const f of fresh.slice(-3)) {
      const pnl = f.pnl_pct != null ? ` ${f.pnl_pct >= 0 ? "+" : ""}${Number(f.pnl_pct).toFixed(1)}%` : "";
      const note = new Notification(`#${f.fly} ${L(f.side === "buy" ? "bought" : "sold")} ${f.symbol}${pnl}`, { body: "fly.ai", icon: "/assets/logo.webp", tag: `fly-${f.fly}-${f.at}` });
      note.onclick = () => { window.focus(); location.href = `/traderflies/fly?id=${f.fly}`; };
    }
  }, 120_000);
  try { if (!localStorage.getItem("flyai.follows.notified")) localStorage.setItem("flyai.follows.notified", String(Date.now())); } catch {}
  function feedRow(f, isNew) {
    const a = document.createElement("a");
    const ago = (t) => {
      const m = Math.max(1, Math.round((Date.now() - t) / 60000));
      return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
    };
    const flai = (wei) => Math.round(Number(BigInt(wei || "0") / 10n ** 15n) / 1000).toLocaleString();
    let text = "";
    if (f.kind === "trade") {
      a.href = f.fly ? `/traderflies/fly?id=${f.fly}` : "/traderflies/traders?view=mine";
      text = `${f.fly ? "#" + f.fly + " " : ""}${L(f.side === "buy" ? "bought" : "sold")} ${f.symbol}${f.usd ? ` · $${Number(f.usd).toFixed(2)}` : ""}${f.pnl_pct != null ? ` · ${f.pnl_pct >= 0 ? "+" : ""}${Number(f.pnl_pct).toFixed(1)}%` : ""}`;
    } else if (f.kind === "colosseum") {
      a.href = "/colosseum/";
      text = `${L("colosseum")} · #${f.fly} ${f.place ? L("place").replace("{n}", f.place) : L("finished")}${f.prize_wei && f.prize_wei !== "0" ? ` · +${flai(f.prize_wei)} $FLYAI` : ""}`;
    } else {
      a.href = "/traderflies/pass";
      text = `${L("payout")} · ${flai(f.amount_wei)} $FLYAI`;
    }
    a.textContent = text;
    const t = document.createElement("small");
    t.textContent = ago(f.at);
    a.append(t);
    if (isNew) a.className = "new";
    return a;
  }
})();
