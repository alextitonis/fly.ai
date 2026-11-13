/**
 * The site's one top nav, shared by every page: the docs pages, the Trader Flies app, the world apps (radio,
 * roulette, slots, race, flinder, colosseum - off the menus since 2026-10-24) and compute. A page only carries an empty <nav aria-label="Main"></nav>
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
  // 2026-10-16 (the user's UX brief: "the main path should be $FLYAI / Trading -> Fly Desk -> Simulation", "the drop
  // down menu has so much stuff it takes me some time to find what I'm looking for"): three main destinations, then
  // More for everything else, grouped; each link once. The 6th field is the i18n key when the route's own label
  // doesn't fit (common.nav.<key>); a menu whose items are [group id, title, links] shows its groups as columns.
  // 2026-10-24 (the user: "focus on the Coin, Fly Trader and Fly Desk, we can remove the mini games",
  // flytrade/SITE-RESTRUCTURE-PLAN.md): three products, then More. The games (roulette, slots, race, flinder, radio,
  // robot fights, colosseum), Hardware NFTs, Terminal and Bounties are off the menus; their pages stay.
  // 2026-10-30: Compute back under More, miners couldn't find where to start.
  const NAV = [
    ["token", "$FLYAI", [
      // 2026-10-27 (the buy-flow plan step 3): one page to buy from, linked from every post
      ["Buy $FLYAI", "/start", "Swap from your wallet, from any chain", false, false, "buyMenu"],
      ["Token", "/token", "Status, contract, fees and burns"],
      ["Stake", "/stake", "Stake $FLYAI for a bigger weekly payout"],   // 2026-11-02: its own page (deskstake.js), easy to find
      ["Earn", "/earn", "Lend USDG from your wallet"],   // 2026-10-06: flytrade/EARN-PAGE-PLAN.md
      ["Referrals", "/referrals", "Invite friends, earn from their fees"],   // 2026-10-15 (referrals.js)
      ["Ambassadors", "/ambassadors", "Represent fly.ai in your language", false, true],   // 2026-11-09 (ambassadors.js)
      // 2026-10-23: "New" for the launch (gta.js, mine/src/gta.ts)
      ["GTA VI giveaway", "/gta", "Hold 100k $FLYAI, win a copy", false, true],
      // 2026-10-31: soulbound NFTs (badges.js, mine/src/badges.ts, FlyBadges.sol)
      ["Badges", "/badges", "Soulbound badges for holders", false, true],
      // 2026-11-03: XP season 1 (xp.js, flyprofile.js, mine/src/xp.ts)
      ["XP Season", "/xp", "Earn XP toward the airdrop", false, true],
      ["Merch", "/shop", "Fly shirts and more", true],
    ]],
    ["traderflies", "Trader Flies", [
      ["My flies", "/traderflies/", "Your flies, their wallets, what's next", false, false, "myFlies"],
      ["Market", "/traderflies/market", "Buy and sell Trader Flies", false, false, "flyMarket"],
      ["Breed", "/traderflies/breed", "Merge two flies into one"],
      ["Leaderboard", "/traderflies/leaderboard", "Every Fly Wallet's results, live", false, false, "leaderboard"],
      // 2026-11-07: Brain vs Bots (flytrade/research/brain_vs_bots.py), the user: "put it in the FlyTraders in nav"
      ["Benchmarks", "/benchmarks", "Fly brains vs trading bots, every result", false, true, "benchmarks"],
      ["Claim", "/traderflies/claim", "Collect your flies' $FLYAI"],
      ["FlightPass", "/traderflies/pass", "Put your flies on autopilot"],
      ["OpenSea", "https://opensea.io/collection/trader-fly-294099831"],
    ]],
    ["flydesk", "Fly Desk", [
      ["Overview", "/desk", "What the desk is, how it trades and pays", false, false, "deskOverview"],
      ["How it works", "/how", "The brain, the pots, payouts and partners"],
      // 2026-10-16: market making for any token on GIGA DEX (flytrade/MAKER-PLAN.md)
      ["Fly Maker", "/maker", "Market making for your token"],
      // 2026-10-27: token / site safety scans (scan.js, mine/src/scan.ts, flytrade/SCAN-PLAN.md)
      ["Fly Scan", "/scan", "Check a token or a site before you sign", false, true],
      ["API & skills", "/desk-api"],
      ["For Agents", "/agents"],
    ]],
    ["more", "More", [
      ["Flybook", "/flybook/", "Free: the live feed written by fly brains"],
      ["Simulation", "/simulation/"],
      ["Compute", "/compute/", "Mine with your browser, earn $FLYAI"],
      ["Research", "/research", "Findings: fighting, the 3-D world, what failed", false, false, "researchAll"],
      ["Roadmap", "/roadmap"],
      ["Changelog", "/changelog"],
      ["GitHub", "https://github.com/alextitonis/fly.ai", undefined, true, false, "github"],
      ["Bullas", "/traderflies/partner?p=bullas", undefined, false, false, "traderflies_partner"],   // partner collections (2026-10-07), each its own page (Partner.tsx)
      ["Enjoyoors", "/traderflies/partner?p=enjoyoors", undefined, false, false, "enjoyoors"],        // 2026-11-10, MegaETH
      ["Waifus", "/traderflies/partner?p=waifus", undefined, false, false, "waifus"],                 // 2026-11-13, Robinhood Chain
    ], true],
  ];
  // the one action on every page (the brief: "a persistent Buy $FLYAI action"; the wallet is asked for only there)
  const BUY = ["Buy $FLYAI", "/start", undefined, false, false, "buy"];
  const isGroup = (x) => Array.isArray(x[2]);
  /** Every link in NAV, groups flattened (search, the phone panel). */
  const linksOf = (items) => items.flatMap((x) => (isGroup(x) ? x[2] : [x]));
  // the community links (2026-10-05, the user: "add discord & X link in the website"): icons in the bar, a row in the
  // phone menu; the footers carry them as text
  const SOCIAL = [
    ["X", "https://x.com/flydotai", '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2Zm-1.1 18.1h1.7L6.3 3.8H4.5l13.3 16.3Z"/></svg>'],
    ["Discord", "https://discord.gg/2KqfZs4aK8", '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9 -.3 13.5.1 18a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.6ZM8.3 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.4 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>'],
    ["Telegram", "https://t.me/+Cs5zp1zmD5NjMmI1", '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.2-8.3c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.6 2.6c.9-.3 1.7.2 1.3 1.7Z"/></svg>'],
  ];
  const SESSION_KEY = "flyai.compute.session";            // mine/web/account.ts: one session for every app
  const REF_KEY = "flyai.ref";                             // a referral link's code, kept until sign-in (keepRef)
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
      search: "Search", searchHint: "Apps, #fly, people", openFly: "Open the fly", flies: "Flies", noResults: "Nothing found", notifications: "Notifications", nothingYet: "Nothing yet: fund a fly or play a game", bought: "bought", sold: "sold", colosseum: "Colosseum", place: "place {n}", finished: "finished", payout: "Payout", deskClaim: "Fly Desk payout to claim", claimBy: "claim by {t}", b_nickname: "Named", b_funded: "Funded a fly", b_profit: "In profit", b_trader: "10+ trades", b_gladiator: "Gladiator", b_champion: "Champion", b_player: "Player", b_regular: "Regular",
      chats: "Chats", badgesBtn: "🏅 Badges", xpBtn: "⭐ XP & profile", xpChip: "Your XP level, streak and profile", xpLevel: "Lv {n}", levelUp: "Level {n}!", levelUpText: "You reached XP level {n}. It counts toward the airdrop.", levelUpSee: "See your profile", xpSoon: "+{n} XP soon", close: "Close", todayTitle: "Today", todayResets: "New day in {h} h {m} min", todayEnded: "The season is over: no more check-ins or quests.", todayGate: "Hold {n} $FLYAI or a Trader Fly to check in and do quests.", todayBuy: "Buy $FLYAI", todayStreak: "days in a row · best {best}", todayFreezeTip: "Streak freezes: one for every 7 days in a row, up to 2. A missed day uses one instead of breaking your streak.", todayNext: "Next bonus: day {n}, +{xp} XP", todayChecked: "Checked in ✓", todayCheckin: "Check in · +{xp} XP", todayMilestone: "{n} days in a row! +{xp} XP", todayFreezeUsed: "A streak freeze covered {n} missed day(s).", todayQuests: "Today's quests", todayReroll: "Swap this quest (once a day)", todaySwap: "Swap", todaySwapAsk: "Swap \"{q}\" for another quest? You get one swap a day.", todayLag: "Ticks a few minutes after you do it", todayAll: "All 3 done", todayProfile: "Your profile", todayRules: "How quests work", q_fly: "Open one of your flies", q_squads: "Look at the Squads board", q_xp: "Visit the XP page", q_flybook: "Like, comment or poke on Flybook", q_flychat: "Send your fly a message in Fly chat", q_rate: "Rate a fly", q_topup: "Top up a fly with $10 or more", q_swap: "Buy $FLYAI in the swap box", q_claimstake: "Claim and stake your payout", q_market: "Buy or sell on the Fly Market", q_leaderboard: "Check the leaderboard", q_desk: "Look at the Fly Desk", q_feed: "Feed the Fly Desk", q_xpost: "Post a meme or anything about fly.ai on X", todayBurnTip: "Burn {n} $FLYAI for a new quest in this slot, even if it's done", todayBurnAsk: "Burn {n} $FLYAI for a new quest instead of \"{q}\"? It works even if that one is done, and the new one pays XP again.", todayBurnWallet: "Confirm the burn in your wallet…", todayBurnWait: "Waiting for the burn to go through…", todayBurnDone: "🔥 Burned. Here's your new quest.", todayBurnLeft: "🔥 New quests for a burn: {n} of {max} left today", todayRefTitle: "Referral quests", todayRefQuest: "Bring {n} real referral(s)", todayRefHint: "One time each. A friend counts once they keep $20+ in Fly Wallets for 7 days.", todayPostNight: "Counted overnight: every post from your connected X (not replies) is +20 XP, up to 5 a day, and ticks this quest the next morning", profileBtn: "👤 Profile", whatsNew: "New", referrals: "Referrals", refBy: "Referred by", refHint: "A friend's code or nickname", refSet: "Set", refLocked: "Set for good", refJoined: "You joined through {name}'s link",
      xLabel: "X account", connectX: "Connect X", unlinkX: "Unlink", x_linked: "X connected", x_denied: "Cancelled on X",
      tgLabel: "Telegram", tgIn: "In the fly.ai group · +50 XP", tgOut: "Not in the group yet", tgJoin: "Join the group", tgCheck: "Check again",
      x_expired: "That took too long, try again", x_taken: "That X account is linked to another wallet", x_failed: "X didn't answer, try again" };
  const LANGS = ["en", "zh-Hans", "zh-Hant", "ko", "tr", "es"];   // i18n.js LANGUAGES
  const NAV_SRC = document.currentScript && document.currentScript.src;   // welcome.js sits beside it
  let acctText = ACCT_EN;

  let hintCss = null;                                      // pageSignIns' style, rebuilt by relabel()
  let lockJs = null;                                       // flylock.js loading (wireLock); up here: wireAccount runs early
  let badgesJs = null;                                     // flybadges.js loading (openBadges, from the profile card)
  let profileJs = null;                                    // flyprofile.js loading (openProfile)
  let chatJs = null;                                       // flychat.js loading (openChat)

  // 2026-10-04: pages read the session, the mine server and nicknames from here instead of their own copies
  // (they keep a fallback: this loads at the end of <body> and may fail)
  const nickCache = new Map();                             // wallet -> Promise<nickname | null>, for names()
  window.flyNav = { session, MINE_API, MINE_READ, short, names, profile: openProfile, chat: openChat,
    xp: { gain: (n, el) => xpGain(n, el), refresh: () => { if (nav) wireXp(nav, true); }, visit: (q) => visitQuest(q), openToday: () => openToday(),
      today: () => todayCopy } };

  keepRef();                                                // (on every page, before anything else can fail)
  welcome();
  const nav = document.querySelector('nav[aria-label="Main"]');
  if (!nav) return;
  let makeAccount = null;                                  // the account menu's builder, for redrawAccount()

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
    const link = ([label, href, desc, newTab, isNew, key]) => {
      const a = el("a", { href: fileHref(href) }, label);
      if (key) a.dataset.navKey = key;                    // i18n.js translates it by this, not by its route
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
    const noDesc = ([label, href, , newTab, isNew, key]) => link([label, href, undefined, newTab, isNew, key]);
    for (const item of NAV) {
      if (!isGroup(item)) { panel.append(el("ul", { class: "mnav-top" }, el("li", null, noDesc(item)))); continue; }
      // a menu of groups is one section per group on a phone; a plain menu is one section
      const secs = item[2].some(isGroup) ? item[2] : [item];
      for (const [id, title, items] of secs) {
        panel.append(el("section", { class: "mnav-sec" }, el("p", { class: "mnav-h", "data-menu": id }, title),
          el("ul", null, ...items.map((it) => el("li", null, noDesc(it))))));
      }
    }
    panel.append(el("ul", { class: "mnav-top mnav-social" }, ...SOCIAL.map(([label, href]) => el("li", null, link([label, href])))));
    for (const item of NAV) {
      if (!isGroup(item)) { ul.append(el("li", { class: "main" }, link(item))); continue; }
      const [id, label, items, right] = item;
      const btn = el("button", { class: "ddbtn ddlabel", type: "button", "aria-expanded": "false", "aria-controls": `dd-${id}` },
        `${label} `, el("span", { "aria-hidden": "true" }, "▾"));
      let menu;
      if (items.some(isGroup)) {
        // groups side by side, titles over them, no descriptions: a list to scan, not to read
        menu = el("ul", { class: `ddmenu groups${right ? " right" : ""}`, id: `dd-${id}` });
        for (const [gid, title, links] of items) {
          menu.append(el("li", { class: "ddgroup" }, el("p", { class: "ddh", "data-menu": gid }, title),
            el("ul", null, ...links.map((it) => el("li", null, noDesc(it))))));
        }
      } else {
        // more than 6 links go two columns (2026-10-04, the user: Apps was "going down off the screen")
        menu = el("ul", { class: `ddmenu${right ? " right" : ""}${items.length > 6 ? " wide" : ""}`, id: `dd-${id}` });
        for (const it of items) menu.append(el("li", null, link(it)));
      }
      if (menu.querySelector("a.on")) btn.classList.add("on");
      ul.append(el("li", { class: "dd main" }, btn, menu));
    }
    ul.append(el("li", { class: "buycta" }, link(BUY)));   // on phones too: the bar keeps it next to the ☰
    const burger = el("button", { class: "burger-btn", type: "button", "aria-expanded": "false", "aria-controls": "mnav", "aria-label": "Menu" },
      el("i"), el("i"), el("i"));                         // three drawn bars that turn into an X (CSS), not the ☰ glyph
    const social = el("li", { class: "main social" });
    for (const [label, href, svg] of SOCIAL) {
      const a = el("a", { href, target: "_blank", rel: "noopener", "aria-label": label, title: label });
      a.innerHTML = svg;
      social.append(a);
    }
    makeAccount = () => account(el, fileHref);
    ul.append(social, searchBox(el), chatButton(el), ...(session() || follows().length ? [bell(el)] : []), makeAccount(), el("li", { class: "burger" }, burger));

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
  shortLangs(nav);
  pageSignIns(nav);
  // a page that follows the session itself (the Trader Flies app sets window.flyaiLiveSession) gets "flyai-session"
  // instead of a reload; either side may sign in, and the account menu is redrawn in place (2026-10-24)
  window.addEventListener("flyai-session", redrawAccount);
  wireSearch(nav, NAV);
  wireBell(nav, textReady);
  wireChat(nav);
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
    const form = el("div", { class: "acct-nick" },
      el("label", { for: "acct-nick", "data-l": "nickname" }, L("nickname")),
      el("div", null, el("input", { id: "acct-nick", maxlength: "20", placeholder: L("nickHint"), "data-l-ph": "nickHint" }),
        el("button", { type: "button", class: "btn sm", "data-l": "save" }, L("save"))),
      el("small", { class: "acct-msg" }));
    // 2026-11-03 (the user: "from that drop down remove badges, locks, nickname, x, referrals, they should be in profile"):
    // the menu keeps the links; the account's own things sit in a hidden holder here, wired as before, and the
    // profile card (flyprofile.js) shows them while it is open
    const settings = el("li", { class: "acct-settings", hidden: "" },
      el("div", { class: "acct-badges", hidden: "" }), el("div", { class: "acct-lock", hidden: "" }), form,
      el("div", { class: "acct-x", hidden: "" }), el("div", { class: "acct-tg", hidden: "" }), el("div", { class: "acct-ref", hidden: "" }));
    settings.dataset.referrals = fileHref("/referrals");   // the profile card's Referrals button (fileHref lives here)
    menu.append(el("li", null, el("button", { type: "button", class: "acct-profile", "data-l": "profileBtn" }, L("profileBtn"))),
      item("myFlies", "/traderflies/traders?view=mine"), item("leaderboard", "/traderflies/traders?view=board"), item("Flybook", "/flybook/"),
      el("li", null, el("button", { type: "button", class: "acct-out", "data-l": "signOut" }, L("signOut"))), settings);
    li.append(btn, menu);
    return li;
  }

  function wireAccount(nav) {
    wireXp(nav);
    const li = nav.querySelector("li.acct");
    if (!li) return;
    if (li.dataset.signin) {
      li.querySelector("button").addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const acct = await import(ACCOUNT_JS);
          const w = await acct.signIn();
          if (w) sessionChanged();
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
    wireReferral(li, s);
    wireX(li, s);
    wireTg(li, s);
    wireLock(li, s);
    li.querySelector(".acct-profile").addEventListener("click", () => {
      li.classList.remove("open");
      li.querySelector(".ddbtn").setAttribute("aria-expanded", "false");
      openProfile(s.wallet, { settings: li.querySelector(".acct-settings"), badges: () => openBadges(s), referrals: li.querySelector(".acct-settings").dataset.referrals });
    });
    li.querySelector(".acct-out").addEventListener("click", async () => {
      try { (await import(ACCOUNT_JS)).signOut(); } catch { /* the page had no wallet code: clear it here */ }
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      sessionChanged();
    });
  }

  /**
   * Connect X (2026-11-03, mine/src/xlink.ts): the wallet's X account by OAuth. "Connect X" goes to X and back to this
   * page with ?x=linked|denied|expired|taken|failed, which the menu shows once and the address bar loses.
   */
  function wireX(li, s) {
    const box = li.querySelector(".acct-x");
    if (!box) return;
    let came = null;
    try {
      const q = new URLSearchParams(location.search);
      came = q.get("x");
      if (came && /^(linked|denied|expired|taken|failed)$/.test(came)) {
        q.delete("x");
        history.replaceState(history.state, "", location.pathname + (q.size ? `?${q}` : "") + location.hash);
      } else came = null;
    } catch {}
    const call = async (path, body) => {
      const r = await fetch(`${MINE_API}/api/x${path}`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
        headers: { "content-type": "application/json", "x-flyai-session": s.token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    };
    const show = (info, note) => {
      box.replaceChildren();
      if (!info.enabled && !info.linked) { box.hidden = true; return; }
      const msg = Object.assign(document.createElement("small"), { textContent: note || "" });
      const row = document.createElement("div");
      if (info.linked) {
        const a = Object.assign(document.createElement("a"), { href: `https://x.com/${info.linked.username}`, target: "_blank", rel: "noopener",
          className: "acct-x-handle", textContent: `@${info.linked.username}` });
        if (info.linked.avatar) a.prepend(Object.assign(document.createElement("img"), { src: info.linked.avatar, alt: "", width: 20, height: 20 }));
        const out = Object.assign(document.createElement("button"), { type: "button", className: "btn sm", textContent: L("unlinkX") });
        out.addEventListener("click", async (e) => {
          e.stopPropagation();
          msg.textContent = "…";
          try { show(await call("/unlink", {}).then(() => call(""))); } catch (err) { msg.textContent = String(err.message || err); }
        });
        row.append(a, out);
      } else {
        const go = Object.assign(document.createElement("button"), { type: "button", className: "btn sm", textContent: `𝕏 ${L("connectX")}` });
        go.addEventListener("click", async (e) => {
          e.stopPropagation();
          msg.textContent = "…";
          try { location.href = (await call("/start", { return_to: location.href })).url; } catch (err) { msg.textContent = String(err.message || err); }
        });
        row.append(go);
      }
      box.append(Object.assign(document.createElement("label"), { textContent: L("xLabel") }), row, msg);
      box.addEventListener("click", (e) => e.stopPropagation());
      box.hidden = false;
    };
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      call("").then((info) => show(info, came ? L(`x_${came}`) : "")).catch(() => { loaded = false; });
    };
    // the menu opens on hover and keyboard focus too (CSS), not only on a click
    for (const ev of ["click", "mouseenter", "focusin"]) li.addEventListener(ev, load);
    if (came) {                                            // back from X: open the menu on the answer
      load();
      li.querySelector(".acct-btn").click();
    }
  }

  /**
   * Connect Telegram (2026-11-03, mine/src/tglink.ts): Telegram's Login Widget (bot @flyai_tg_bot, domain flyaiworld.com)
   * signs who the visitor is; the server asks the bot whether that account is in the fly.ai group (XP for members).
   */
  function wireTg(li, s) {
    const box = li.querySelector(".acct-tg");
    if (!box) return;
    const call = async (path, body) => {
      const r = await fetch(`${MINE_API}/api/tg${path}`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
        headers: { "content-type": "application/json", "x-flyai-session": s.token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    };
    const btn = (text, fn, cls = "btn sm") => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: cls, textContent: text });
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        msg.textContent = "…";
        try { show(await fn()); } catch (err) { msg.textContent = String(err.message || err); }
      });
      return b;
    };
    let msg = document.createElement("small");
    const show = (info) => {
      box.replaceChildren();
      if (!info.enabled) { box.hidden = true; return; }
      msg = Object.assign(document.createElement("small"), { textContent: "" });
      const row = document.createElement("div");
      if (info.linked) {
        const who = Object.assign(document.createElement("span"), { className: "acct-x-handle",
          textContent: info.linked.username ? `@${info.linked.username}` : info.linked.name });
        if (info.linked.photo) who.prepend(Object.assign(document.createElement("img"), { src: info.linked.photo, alt: "", width: 20, height: 20 }));
        row.append(who, btn(L("unlinkX"), () => call("/unlink", {}).then(() => call(""))));
        const state = document.createElement("div");
        if (info.linked.member) state.append(Object.assign(document.createElement("small"), { className: "acct-tg-in", textContent: `✓ ${L("tgIn")}` }));
        else state.append(Object.assign(document.createElement("small"), { textContent: L("tgOut") }),
          Object.assign(document.createElement("a"), { className: "btn sm", href: info.invite, target: "_blank", rel: "noopener", textContent: L("tgJoin") }),
          btn(L("tgCheck"), () => call("/check", {}), "btn sm ghost"));
        box.append(Object.assign(document.createElement("label"), { textContent: L("tgLabel") }), row, state, msg);
      } else {
        // the widget: an iframe from telegram.org that calls window.flyTgAuth with the signed answer
        window.flyTgAuth = async (user) => {
          msg.textContent = "…";
          try { show(await call("/link", user)); } catch (err) { msg.textContent = String(err.message || err); }
        };
        const tag = document.createElement("script");
        tag.async = true;
        tag.src = "https://telegram.org/js/telegram-widget.js?22";
        tag.setAttribute("data-telegram-login", info.bot);
        tag.setAttribute("data-size", "medium");
        tag.setAttribute("data-radius", "10");
        tag.setAttribute("data-userpic", "false");
        tag.setAttribute("data-onauth", "flyTgAuth(user)");
        row.append(tag);
        box.append(Object.assign(document.createElement("label"), { textContent: L("tgLabel") }), row, msg);
      }
      box.addEventListener("click", (e) => e.stopPropagation());
      box.hidden = false;
    };
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      call("").then(show).catch(() => { loaded = false; });
    };
    for (const ev of ["click", "mouseenter", "focusin"]) li.addEventListener(ev, load);
  }

  /** Locked $FLYAI (flylock.js, 2026-10-27): the menu item shows only for a wallet with FLYAI waiting in FlyLock. */
  function wireLock(li, s) {
    const box = li.querySelector(".acct-lock");
    if (!box) return;
    if (!lockJs) {
      lockJs = new Promise((ok) => {
        const tag = document.createElement("script");
        tag.src = NAV_SRC ? new URL("flylock.js?v=20261110a", NAV_SRC).href : "/assets/flylock.js?v=20261110a";
        tag.onload = ok;
        tag.onerror = ok;
        (document.body || document.head).append(tag);
      });
    }
    lockJs.then(() => { if (window.flyLock) window.flyLock.mount(box, s.wallet); });
  }

  /** The profile card (flyprofile.js, 2026-11-03): loaded on the first open; anything with data-fly-profile="0x…" opens it. */
  function openProfile(wallet, opts) {
    if (!profileJs) {
      profileJs = new Promise((ok) => {
        const tag = document.createElement("script");
        tag.src = NAV_SRC ? new URL("flyprofile.js?v=20261111a", NAV_SRC).href : "/assets/flyprofile.js?v=20261111a";
        tag.onload = ok;
        tag.onerror = ok;
        (document.body || document.head).append(tag);
      });
    }
    return profileJs.then(() => { if (window.flyProfile) window.flyProfile.open(wallet, opts); });
  }
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("[data-fly-profile]") : null;
    if (!a) return;
    e.preventDefault();
    openProfile(a.getAttribute("data-fly-profile"));
  });

  /**
   * The fly messenger (flychat.js, 2026-11-04): 💬 in the bar for a signed-in wallet, every chat with its flies. The
   * code loads on the first open, or soon after the page for the unread dot (its inbox read is kept 2 minutes a tab).
   */
  function loadChat() {
    if (!chatJs) {
      chatJs = new Promise((ok) => {
        const tag = document.createElement("script");
        tag.src = NAV_SRC ? new URL("flychat.js?v=20261113a", NAV_SRC).href : "/assets/flychat.js?v=20261113a";
        tag.onload = ok;
        tag.onerror = ok;
        (document.body || document.head).append(tag);
      });
    }
    return chatJs;
  }
  /** window.flyNav.chat(fly?, { auto }): opens the messenger, on that fly's chat when given (FlyChat.tsx on a fly's page). */
  function openChat(fly, opts) {
    return loadChat().then(() => { if (window.flyChat) window.flyChat.open(fly, opts); });
  }
  function chatButton(el) {
    return el("li", { class: "chat", ...(session() ? {} : { hidden: "" }) },
      el("button", { class: "ddbtn ddlabel chat-btn", type: "button", "aria-label": L("chats"), title: L("chats"), "data-l-aria": "chats" },
        "💬", el("b", { class: "chat-n", hidden: "" })));
  }
  function wireChat(nav) {
    const li = nav.querySelector("li.chat");
    if (!li) return;
    li.querySelector(".chat-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      void loadChat().then(() => {
        const c = window.flyChat;
        if (!c) return;
        if (c.isOpen()) c.close(); else c.open(null, { inbox: true });
      });
    });
    const sync = () => {
      li.hidden = !session();
      if (session()) setTimeout(() => void loadChat().then(() => window.flyChat && window.flyChat.inbox()), 1500);
    };
    sync();
    window.addEventListener("flyai-session", sync);
  }

  /** Soulbound badges (flybadges.js, 2026-10-31): the popup's code and its one read wait for the profile card's button. */
  function openBadges(s) {
    if (!badgesJs) {
      badgesJs = new Promise((ok) => {
        const tag = document.createElement("script");
        tag.src = NAV_SRC ? new URL("flybadges.js?v=20261109a", NAV_SRC).href : "/assets/flybadges.js?v=20261109a";
        tag.onload = ok;
        tag.onerror = ok;
        (document.body || document.head).append(tag);
      });
    }
    badgesJs.then(() => { if (window.flyBadges) window.flyBadges.open(s); });
  }

  /**
   * The XP chip beside the account (2026-11-06, flytrade/GAMIFY-PLAN.md phase 1): "Lv 7 ▰▰▰▱▱ 🔥3" - the level, the bar
   * to the next one and the streak in weeks, from /api/xp/profile (kept a minute in this tab). A click opens the profile
   * card. A higher level than this browser last saw shows the level-up banner once. Pages call window.flyNav.xp.gain(n,
   * el) after an action that earns XP ("+n XP soon": the server books it on its next read) and .refresh() to re-read.
   */
  const XP_KEY = "flyai.xp";
  async function loadXp(wallet, fresh) {
    const w = wallet.toLowerCase();
    if (!fresh) {
      try {
        const hit = JSON.parse(sessionStorage.getItem(XP_KEY) || "null");
        if (hit && hit.wallet === w && Date.now() - hit.t < 60_000) return hit.v;
      } catch {}
    }
    try {
      const r = await fetch(`${MINE_READ}/api/xp/profile?wallet=${w}`);
      if (!r.ok) return null;
      const v = await r.json();
      if (!v || v.on === false) return null;
      try { sessionStorage.setItem(XP_KEY, JSON.stringify({ wallet: w, t: Date.now(), v })); } catch {}
      return v;
    } catch { return null; }
  }
  function wireXp(nav, fresh) {
    for (const e of nav.querySelectorAll(".xpc-btn")) e.remove();
    const s = session(), acct = nav.querySelector("li.acct");
    const menuBtn = acct && acct.querySelector(".acct-btn");
    if (!s || !menuBtn) return;
    // 2026-11-06 (the user: "this is ugly"): no separate chip any more; a level ring at the left of the account pill,
    // its progress around it. The ring opens Today; the name opens the menu as before.
    const lv = document.createElement("b"), dot = document.createElement("i");
    lv.textContent = "…";
    dot.className = "xpc-dot"; dot.hidden = true;
    const btn = document.createElement("button");
    Object.assign(btn, { type: "button", className: "xpc-btn", title: L("xpChip") });
    btn.setAttribute("aria-label", L("xpChip"));
    btn.style.setProperty("--p", "0");
    btn.append(lv, dot);
    menuBtn.before(btn);
    acct.classList.add("has-xp");
    btn.addEventListener("click", (e) => { e.stopPropagation(); openToday(); });
    loadToday().then((t) => markDot(t));
    if (/^\/xp(\.html)?\/?$/.test(location.pathname)) visitQuest("xp");   // the XP page is a visit quest
    if (/^\/desk(\.html)?\/?$/.test(location.pathname)) visitQuest("desk");   // and the Fly Desk page (2026-11-07)
    loadXp(s.wallet, fresh).then((v) => {
      if (!v || !btn.isConnected) { if (!v) { btn.remove(); acct.classList.remove("has-xp"); } return; }
      const at = 50 * v.level * v.level, next = v.next || 50 * (v.level + 1) * (v.level + 1);   // xp.ts levelXp
      const pct = Math.max(0, Math.min(1, (v.xp - at) / Math.max(1, next - at)));
      lv.textContent = String(v.level);
      btn.style.setProperty("--p", pct.toFixed(3));
      const streak = v.streak_weeks > 0 ? ` · 🔥 ${v.streak_weeks}` : "";
      btn.title = `${L("xpLevel").replace("{n}", v.level)} · ${Math.round(v.xp).toLocaleString()} / ${next.toLocaleString()} XP${streak}`;
      btn.setAttribute("aria-label", `${btn.title}. ${L("xpChip")}`);
      const key = `flyai.xp.level.${s.wallet.toLowerCase()}`;
      let seen = null;
      try { seen = localStorage.getItem(key); localStorage.setItem(key, String(v.level)); } catch {}
      if (seen != null && v.level > Number(seen)) levelUp(v.level, () => btn.click());
    });
  }
  /**
   * The language menu in the bar shows codes (EN, ES...) while the bar is tight (2026-11-06: under 1180 px it pushed the
   * nav onto a second row). The full names come back on wider screens; the ☰ panel's menu always has them.
   */
  function shortLangs(nav) {
    const tight = matchMedia("(max-width: 1180px)");
    const apply = () => {
      for (const o of nav.querySelectorAll(".wrap > ul .langpick option")) {
        if (!o.dataset.name) o.dataset.name = o.textContent;
        const want = tight.matches ? o.value.replace(/^zh-Hans$/, "简").replace(/^zh-Hant$/, "繁").toUpperCase() : o.dataset.name;
        if (o.textContent !== want) o.textContent = want;   // only on a change: the watcher below would loop on its own writes
      }
    };
    tight.addEventListener("change", apply);
    // the menu is added later by i18n.js: watch the bar's own list only, and stop once it is there
    const ul = nav.querySelector(".wrap > ul");
    if (ul && !ul.querySelector(".langpick")) {
      const watch = new MutationObserver(() => { if (ul.querySelector(".langpick")) { watch.disconnect(); apply(); } });
      watch.observe(ul, { childList: true });
    }
    apply();
  }
  /** "Level 8!" across the top, once, with a little confetti; gone after a few seconds or a click */
  function levelUp(level, see) {
    if (document.querySelector(".xpc-up")) return;
    const box = document.createElement("div");
    box.className = "xpc-up";
    box.setAttribute("role", "status");
    const b = document.createElement("b"), p = document.createElement("span"), go = document.createElement("button");
    b.textContent = L("levelUp").replace("{n}", level);
    p.textContent = L("levelUpText").replace("{n}", level);
    go.type = "button"; go.textContent = L("levelUpSee");
    go.addEventListener("click", (e) => { e.stopPropagation(); box.remove(); see(); });
    box.append(b, p, go);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) for (let i = 0; i < 28; i++) {
      const c = document.createElement("i");
      c.className = "xpc-bit";
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = ["#5ef2cc", "#ffb347", "#a78bfa", "#ff6b9d", "#f5e663"][i % 5];
      c.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
      c.style.setProperty("--dx", `${Math.round(Math.random() * 80 - 40)}px`);
      box.append(c);
    }
    box.addEventListener("click", () => box.remove());
    document.body.append(box);
    setTimeout(() => box.remove(), 7000);
  }
  /** "+n XP soon" floating up from what was pressed (or the chip), then the chip re-reads a little later */
  function xpGain(n, from) {
    const chip = nav && nav.querySelector(".xpc-btn");
    const at = (from && from.getBoundingClientRect && from.getBoundingClientRect()) || (chip && chip.getBoundingClientRect());
    const t = document.createElement("div");
    t.className = "xpc-gain";
    t.textContent = L("xpSoon").replace("{n}", Math.round(n).toLocaleString());
    if (at && at.width) { t.style.left = `${at.left + at.width / 2}px`; t.style.top = `${at.top}px`; }
    else { t.style.left = "50%"; t.style.top = "70px"; }
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
    if (chip) { chip.classList.remove("xpc-pulse"); void chip.offsetWidth; chip.classList.add("xpc-pulse"); }
  }

  /**
   * Today (2026-11-06, flytrade/GAMIFY-PLAN.md "Quests plan"; mine src/quests.ts): the daily check-in with its streak
   * and freezes, and the 3 daily quests, in a panel the XP chip opens (a bottom sheet on phones). The page reports the
   * visit quests (xp here; the Trader Flies app reports fly and squads through window.flyNav.xp.visit); the server finds
   * the rest. "fly:today" goes out with each fresh copy, for the app's strip on My flies.
   */
  const QUEST_HREF = { fly: "/traderflies/", squads: "/traderflies/leaderboard?board=squads", xp: "/xp", flybook: "/flybook/",
    flychat: "/traderflies/", rate: "/traderflies/leaderboard", topup: "/traderflies/", swap: "/token#buy", claimstake: "/traderflies/claim",
    market: "/traderflies/market", leaderboard: "/traderflies/leaderboard", desk: "/desk", feed: "/traderflies/claim",
    xpost: "https://x.com/intent/post?text=" + encodeURIComponent("@flydotai $FLYAI ") };
  const QUEST_ICON = { fly: "🪰", squads: "🛡️", xp: "⭐", flybook: "💬", flychat: "🗨️", rate: "⭐", topup: "💵", swap: "🔁", claimstake: "🏦", market: "🏷️",
    leaderboard: "🏆", desk: "📈", feed: "🍯", xpost: "😂" };
  let todayCopy = null;
  async function todayCall(path, body) {
    const s = session();
    if (!s) return null;
    try {
      const r = await fetch(`${MINE_API}${path}`, body === undefined ? { headers: { "x-flyai-session": s.token } }
        : { method: "POST", headers: { "content-type": "application/json", "x-flyai-session": s.token }, body: JSON.stringify(body) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error || `HTTP ${r.status}`);
      return v;
    } catch (err) { if (body !== undefined) throw err; return null; }
  }
  function keepToday(t) {
    if (!t || t.on === false) return null;
    todayCopy = t;
    window.dispatchEvent(new CustomEvent("fly:today", { detail: t }));
    markDot(t);
    return t;
  }
  async function loadToday() { return keepToday(await todayCall("/api/xp/today")); }
  function markDot(t) {
    const d = document.querySelector("nav .xpc-dot");
    if (d) d.hidden = !(t && t.eligible && !t.ended && (!t.checked_in || !t.all_done));
  }
  /** a visit quest done on this page: told to the server once a day per quest (it ignores ones that aren't today's) */
  async function visitQuest(quest) {
    const s = session();
    if (!s) return;
    const key = `flyai.visit.${s.wallet.toLowerCase()}.${new Date().toISOString().slice(0, 10)}.${quest}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
    try {
      const v = await todayCall("/api/xp/quest/visit", { quest });
      if (v) { keepToday(v.today); if (v.gained > 0) xpGain(v.gained); }
    } catch { /* not today's, or signed out */ }
  }
  const qText = (id) => L(`q_${id}`);
  function openToday() {
    if (document.querySelector(".td-pop")) return;
    const s = session();
    if (!s) return;
    const pop = document.createElement("div"), box = document.createElement("div");
    pop.className = "td-pop"; box.className = "td-box";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-label", L("todayTitle"));
    pop.append(box);
    let poll = 0;
    const close = () => { pop.remove(); document.removeEventListener("keydown", esc); clearInterval(poll); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    pop.addEventListener("click", (e) => { if (e.target === pop) close(); });
    const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const draw = (t, msg) => {
      box.replaceChildren();
      const head = h("div", "td-head");
      const title = h("b", null, L("todayTitle"));
      const x = h("button", "td-x", "✕"); x.type = "button"; x.setAttribute("aria-label", L("close")); x.addEventListener("click", close);
      head.append(title, x);
      box.append(head);
      if (!t) { box.append(h("p", "td-note", "…")); return; }
      const left = Math.max(0, Date.parse(t.resets_at) - Date.now()), hrs = Math.floor(left / 3_600_000), mins = Math.floor(left / 60_000) % 60;
      box.append(h("small", "td-reset", L("todayResets").replace("{h}", hrs).replace("{m}", mins)));
      if (t.ended) box.append(h("p", "td-note", L("todayEnded")));
      else if (!t.eligible) {
        const p = h("p", "td-note", L("todayGate").replace("{n}", Number(t.need_flyai).toLocaleString()));
        const a = h("a", "td-buy", L("todayBuy")); a.href = "/token#buy";
        box.append(p, a);
      }
      // the check-in and the streak
      const card = h("div", "td-check");
      const st = h("div", "td-streak");
      st.append(h("b", null, `📅 ${t.streak.days}`), h("span", null, L("todayStreak").replace("{best}", t.streak.best)));
      const fz = h("span", "td-freeze", `🧊 ${t.streak.freezes}/2`); fz.title = L("todayFreezeTip");
      st.append(fz);
      const marks = Object.keys(t.rates.milestones).map(Number).sort((a, b) => a - b);
      const next = marks.find((m) => m > t.streak.days) ?? Math.ceil((t.streak.days + 1) / 30) * 30;
      const nextXp = t.rates.milestones[next] ?? 50;
      card.append(st, h("small", "td-next", L("todayNext").replace("{n}", next).replace("{xp}", nextXp)));
      const go = h("button", `td-go${t.checked_in ? " done" : ""}`, t.checked_in ? L("todayChecked") : L("todayCheckin").replace("{xp}", t.rates.checkin));
      go.type = "button";
      go.disabled = t.checked_in || !t.eligible || t.ended;
      go.addEventListener("click", async () => {
        go.disabled = true; go.textContent = "…";
        try {
          const v = await todayCall("/api/xp/checkin", {});
          keepToday(v.today);
          if (v.gained > 0) xpGain(v.gained, go.isConnected ? go : null);
          if (v.bonus > 0) levelUpLike(L("todayMilestone").replace("{n}", v.today.streak.days).replace("{xp}", v.bonus));
          draw(v.today, v.freezes_used ? L("todayFreezeUsed").replace("{n}", v.freezes_used) : null);
        } catch (err) { draw(todayCopy, String(err.message || err)); }
      });
      card.append(go);
      box.append(card);
      if (msg) box.append(h("p", "td-msg", msg));
      // the 3 quests
      box.append(h("h4", null, L("todayQuests")));
      const ul = h("ul", "td-quests");
      for (const q of t.quests) {
        const li = h("li", q.done ? "done" : "");
        const tick = h("i", "td-tick", q.done ? "✓" : QUEST_ICON[q.id] || "•");
        const a = h("a", "td-q", qText(q.id)); a.href = QUEST_HREF[q.id] || "/";
        const xp = h("span", "td-xp", `+${q.xp}`);
        if (q.group === "move" && !q.done) a.append(h("small", "td-lag", L("todayLag")));
        // 2026-11-09: X posts are found by the nightly search (no pasting): several a day count, the quest ticks next morning
        if (q.id === "xpost" && !q.done) a.append(h("small", "td-lag", L("todayPostNight")));
        if (q.id === "xpost") { a.target = "_blank"; a.rel = "noopener"; }
        li.append(tick, a, xp);
        // 2026-11-07: a new quest for a $FLYAI burn (burn()), done or not, up to the day's limit
        const paid = t.paid;
        if (paid && paid.used < paid.max && t.eligible && !t.ended) {
          const b = h("button", "td-reroll td-burn", `🔥 ${Math.round(paid.burn_flyai / 1000)}k`); b.type = "button";
          b.title = L("todayBurnTip").replace("{n}", Number(paid.burn_flyai).toLocaleString());
          b.addEventListener("click", async () => {
            if (!confirm(L("todayBurnAsk").replace("{q}", qText(q.id)).replace("{n}", Number(paid.burn_flyai).toLocaleString()))) return;
            b.disabled = true;
            try {
              const acct = await import(ACCOUNT_JS);
              const word = (x) => x.toString(16).padStart(64, "0");
              const data = "0x42966c68" + word(BigInt(paid.burn_flyai) * 10n ** 18n);   // burn(amount)
              draw(todayCopy, L("todayBurnWallet"));
              const hash = await acct.transact(paid.token, data, () => draw(todayCopy, L("todayBurnWallet")), 4663);
              draw(todayCopy, L("todayBurnWait"));
              await acct.mined(hash, 4663);
              let v = null, last = null;
              for (let i = 0; i < 5 && !v; i++) {
                try { v = await todayCall("/api/xp/quest/buy-reroll", { group: q.group, tx: hash }); }
                catch (err) { last = err; if (!/mined/.test(String(err.message))) break; await new Promise((r) => setTimeout(r, 3000)); }
              }
              if (!v) throw last || new Error("try again");
              keepToday(v.today); draw(v.today, L("todayBurnDone"));
            } catch (err) { draw(todayCopy, String(err.message || err)); }
          });
          li.append(b);
        }
        if (!q.done && !t.reroll_used && t.eligible && !t.ended) {
          const r = h("button", "td-reroll", L("todaySwap")); r.type = "button"; r.title = L("todayReroll");
          r.addEventListener("click", async () => {
            if (!confirm(L("todaySwapAsk").replace("{q}", qText(q.id)))) return;
            r.disabled = true;
            try { const v = await todayCall("/api/xp/quest/reroll", { group: q.group }); keepToday(v.today); draw(v.today); }
            catch (err) { draw(todayCopy, String(err.message || err)); }
          });
          li.append(r);
        }
        ul.append(li);
      }
      const all = h("li", `td-all${t.all_done ? " done" : ""}`);
      all.append(h("i", "td-tick", t.all_done ? "✓" : "🎁"), h("span", "td-q", L("todayAll")), h("span", "td-xp", `+${t.rates.all}`));
      ul.append(all);
      box.append(ul);
      if (t.paid && t.eligible && !t.ended) box.append(h("small", "td-reset", L("todayBurnLeft").replace("{n}", Math.max(0, t.paid.max - t.paid.used)).replace("{max}", t.paid.max)));
      // referral quests (2026-11-09): one-off XP at 1, 3, 5, 10 and 25 real referrals, not part of the daily three
      if (t.referrals && t.referrals.quests && t.referrals.quests.length) {
        box.append(h("h4", "td-sub", L("todayRefTitle")));
        const rl = h("ul", "td-quests td-refq");
        for (const q of t.referrals.quests) {
          const li = h("li", q.done ? "done" : "");
          const a = h("a", "td-q", L("todayRefQuest").replace("{n}", q.need)); a.href = "/referrals";
          li.append(h("span", "td-tick", q.done ? "✓" : "👥"), a,
            h("small", "td-xp", q.done ? `+${q.xp} XP` : `${Math.min(t.referrals.real, q.need)}/${q.need} · +${q.xp} XP`));
          rl.append(li);
        }
        box.append(rl, h("small", "td-reset", L("todayRefHint")));
      }
      const foot = h("div", "td-foot");
      const prof = h("button", "td-link", L("todayProfile")); prof.type = "button";
      prof.addEventListener("click", () => {
        close();
        const acct = document.querySelector("nav li.acct"), p = acct && acct.querySelector(".acct-profile");
        if (p) p.click(); else openProfile(s.wallet);
      });
      const xpa = h("a", "td-link", L("todayRules")); xpa.href = "/xp#quests";
      foot.append(prof, xpa);
      box.append(foot);
    };
    draw(todayCopy);
    document.body.append(pop);
    loadToday().then((t) => { if (pop.isConnected) draw(t || todayCopy); });
    poll = setInterval(() => {
      if (!pop.isConnected) { clearInterval(poll); return; }
      if (document.hidden) return;
      loadToday().then((t) => { if (t && pop.isConnected) draw(t); });
    }, 20_000);
  }
  /** the level-up banner's look for a streak milestone */
  function levelUpLike(text) {
    if (document.querySelector(".xpc-up")) return;
    const box = document.createElement("div");
    box.className = "xpc-up"; box.setAttribute("role", "status");
    const b = document.createElement("b"); b.textContent = text;
    box.append(b);
    box.addEventListener("click", () => box.remove());
    document.body.append(box);
    setTimeout(() => box.remove(), 5000);
  }

  /** After a sign-in or sign-out: the live page hears it, every other page reloads as before. */
  function sessionChanged() {
    if (window.flyaiLiveSession) window.dispatchEvent(new Event("flyai-session"));
    else location.reload();
  }
  function redrawAccount() {
    const old = nav.querySelector("li.acct");
    if (!old || !makeAccount) return;
    old.replaceWith(makeAccount());
    wireAccount(nav);
    if (session()) document.documentElement.classList.remove("nav-signed-out");
    else pageSignIns(nav);
  }

  /**
   * Referrals (2026-10-15, mine/src/referrals.ts): a link's ?ref=<code> is kept in this browser until the wallet signs
   * in, then set as its referrer (only a new wallet can be referred, once, for good - the server decides). The account
   * menu shows who referred you, or - for a new wallet without one - a box to type a friend's code or nickname.
   */
  function keepRef() {
    try {
      const code = new URLSearchParams(location.search).get("ref");
      if (code && /^[A-Za-z0-9 _.\-]{3,40}$/.test(code)) localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }));
    } catch {}
  }
  /** The first-visit "fly.ai in 30 seconds" popup (welcome.js, 2026-10-27): once per browser, not for a signed-in
   * wallet, not on /start (a buyer from a post), not in a frame or a headless browser. ?welcome shows it anyway. */
  function welcome() {
    let force = false, seen = false;
    try { force = new URLSearchParams(location.search).has("welcome"); seen = !!localStorage.getItem("flyai.welcome.seen"); } catch { return; }
    if (!force && (seen || session() || window.top !== window || navigator.webdriver || /^\/(start|onepager)(\.html)?\/?$/.test(location.pathname))) return;   // (the one-pager: a link sent to people, 2026-11-06)
    const s = document.createElement("script");
    s.src = NAV_SRC ? new URL("welcome.js?v=20261027a", NAV_SRC).href : "/assets/welcome.js?v=20261027a";
    (document.body || document.head).append(s);
  }
  function pendingRef() {
    try {
      const r = JSON.parse(localStorage.getItem(REF_KEY) || "null");
      return r && r.code && Date.now() - r.at < 30 * 86_400_000 ? r.code : null;
    } catch { return null; }
  }
  async function refCall(s, body) {
    const r = await fetch(`${MINE_API}/api/referral`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
      headers: { "content-type": "application/json", "x-flyai-session": s.token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
  }
  function wireReferral(li, s) {
    const box = li.querySelector(".acct-ref");
    const code = pendingRef();
    const show = (info) => {
      box.replaceChildren();
      if (info.referrer) {
        box.append(Object.assign(document.createElement("small"), { textContent: `${L("refBy")}: ${info.referrer.name} · ${L("refLocked")}` }));
        box.hidden = false;
      } else if (info.can_set) {
        const input = Object.assign(document.createElement("input"), { maxLength: 40, placeholder: L("refHint") });
        const btn = Object.assign(document.createElement("button"), { type: "button", className: "btn sm", textContent: L("refSet") });
        const msg = document.createElement("small");
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          msg.textContent = "…";
          try { show(await refCall(s, { code: input.value, via: "profile" })); } catch (err) { msg.textContent = String(err.message || err); }
        });
        const lab = Object.assign(document.createElement("label"), { textContent: L("refBy") });
        const row = document.createElement("div");
        row.append(input, btn);
        box.append(lab, row, msg);
        box.addEventListener("click", (e) => e.stopPropagation());
        box.hidden = false;
      } else box.hidden = true;
    };
    // a link's code first (once: whatever the answer, it's used up unless the server couldn't be reached)
    const first = code ? refCall(s, { code, via: "link" }).then((info) => { try { localStorage.removeItem(REF_KEY); } catch {} return info; },
      (err) => { if (err.status) { try { localStorage.removeItem(REF_KEY); } catch {} } return null; }) : Promise.resolve(null);
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      first.then((got) => got || refCall(s)).then(show).catch(() => { loaded = false; });
    };
    if (code) load();                                      // a pending link is used as soon as the wallet is signed in
    li.querySelector(".acct-btn").addEventListener("click", load);
  }

  /**
   * One sign-in button per page (2026-10-04, the user: "double login buttons to some pages while the navbar has 1"):
   * signed out, a page's own sign-in button (marked data-nav-signin) shows as a pointer to the nav's and a
   * click on it runs the nav's sign-in. Signed in, the page's buttons are back as they were (a Trader Flies page may
   * still need its wallet reconnected).
   */
  function pageSignIns(nav) {
    const signIn = () => nav.querySelector("li.acct[data-signin] button");   // looked up each time: redrawAccount
    if (!signIn()) return;
    const root = document.documentElement;
    root.classList.add("nav-signed-out");
    if (hintCss) return;                                   // wired before a sign-out redraw: only the class again
    // the look lives here, not in site.css: the game pages don't load site.css
    hintCss = document.createElement("style");
    hintCss.textContent = hintStyle();
    document.head.append(hintCss);
    document.addEventListener("click", (e) => {
      if (!e.target.closest || !e.target.closest("[data-nav-signin]") || !signIn()) return;
      e.preventDefault();
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: "smooth" });
      signIn().click();
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
  /** i18n.js's own folder URL; a docs page opened from disk reads the folder beside it. */
  function i18nBase() {
    const docs = location.protocol === "file:" ? location.pathname.lastIndexOf("/docs/") : -1;
    return docs >= 0 ? `${location.pathname.slice(0, docs + 6)}assets/i18n/` : "/assets/i18n/";
  }
  /** Loads nav.acct for the page's language (never rejects; English stays on any failure), then relabels the bar. */
  function loadText(nav) {
    const lang = pageLang();
    if (lang === "en") return Promise.resolve();
    return fetch(`${i18nBase()}${lang}/common.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
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
        el("li", { class: "srch-box" }, el("input", { type: "search", id: "srch-q", placeholder: L("searchHint"), "data-l-ph": "searchHint", "aria-label": L("search"), "data-l-aria": "search", autocomplete: "off" })),
        el("li", { class: "srch-out" })));
  }
  function wireSearch(nav, NAV) {
    const li = nav.querySelector("li.srch");
    if (!li) return;
    const input = li.querySelector("#srch-q"), out = li.querySelector(".srch-out");
    const apps = [];
    for (const x of NAV.flatMap((it) => (isGroup(it) ? linksOf(it[2]) : [it]))) if (typeof x[1] === "string" && x[1].startsWith("/")) apps.push(x);
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
    void Promise.all([loadSummary(), textReady, followFeed(), newsFeed()]).then(([v, , followed, news]) => {
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
      const key = (f) => `${f.kind}:${f.fly}:${f.at}:${f.id || f.symbol}`;
      const feed = [...new Map([...((v && v.feed) || []), ...followed, ...news].map((f) => [key(f), f])).values()]
        .sort((a, b) => (b.kind === "claim") - (a.kind === "claim") || b.at - a.at).slice(0, 30);   // an open claim stays on top
      let seen = 0;
      try { seen = Number(localStorage.getItem("flyai.notif.seen") || 0); } catch {}
      const newsRead = newsSeen(news);
      const isNew = (f) => (f.kind === "news" ? !newsRead.has(f.id) : f.at > seen);
      const unread = feed.filter(isNew).length;
      const n = li.querySelector(".bell-n");
      if (unread) { n.textContent = unread > 9 ? "9+" : String(unread); n.hidden = false; }
      const list = li.querySelector(".bell-list");
      list.replaceChildren(...(feed.length ? feed.map((f) => feedRow(f, isNew(f))) : [Object.assign(document.createElement("small"), { textContent: L("nothingYet") })]));
      li.querySelector(".bell-btn").addEventListener("click", () => {
        try {
          localStorage.setItem("flyai.notif.seen", String(Date.now()));
          localStorage.setItem("flyai.news.seen", JSON.stringify([...new Set([...newsRead, ...news.map((f) => f.id)])].slice(-200)));
        } catch {}
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
  // what's new (2026-10-22, the user: "when adding new stuff in change log show it in users' notifications"): the
  // changelog's own entries (changelog.json "e", keys d<MMDD><letter>, the page's language) from the last NEWS_DAYS days,
  // each unread until the bell is opened once (flyai.news.seen: ids, so an entry added later the same day still counts)
  const NEWS_DAYS = 14, NEWS_MAX = 5;
  async function newsFeed() {
    try {
      const j = await fetch(`${i18nBase()}${pageLang()}/changelog.json`).then((r) => r.json());
      const now = new Date(), out = [];
      for (const [id, html] of Object.entries((j && j.e) || {})) {
        const m = /^d(\d\d)(\d\d)[a-z]$/.exec(id);
        if (!m) continue;
        let at = Date.UTC(now.getUTCFullYear(), Number(m[1]) - 1, Number(m[2]), 12);
        if (at > now.getTime() + 86_400_000) at = Date.UTC(now.getUTCFullYear() - 1, Number(m[1]) - 1, Number(m[2]), 12);
        if (now.getTime() - at > NEWS_DAYS * 86_400_000) continue;
        const b = /<b>(.*?)<\/b>/.exec(html);
        const title = Object.assign(document.createElement("div"), { innerHTML: b ? b[1] : html }).textContent.trim().replace(/[.。]$/, "");
        out.push({ kind: "news", id, at, title });
      }
      return out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1)).slice(0, NEWS_MAX);
    } catch { return []; }
  }
  function newsSeen(news) {
    try {
      const raw = localStorage.getItem("flyai.news.seen");
      if (raw) return new Set(JSON.parse(raw));
      // a first visit: only the last 3 days' entries count as new
      const old = news.filter((f) => Date.now() - f.at > 3 * 86_400_000).map((f) => f.id);
      localStorage.setItem("flyai.news.seen", JSON.stringify(old));
      return new Set(old);
    } catch { return new Set(news.map((f) => f.id)); }
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
    } else if (f.kind === "claim") {                  // the Sunday desk payout, until its 24 h claim window closes
      a.href = "/traderflies/claim";
      const by = new Date(f.closes).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      text = `${L("deskClaim")} · ${flai(f.amount_wei)} $FLYAI · ${L("claimBy").replace("{t}", by)}`;
    } else if (f.kind === "notice") {                // a note from the team to this wallet (mine.notices)
      a.href = f.href || "/";
      if (/^https:/.test(a.href)) { a.target = "_blank"; a.rel = "noopener"; }
      text = `📣 ${f.text}`;
    } else if (f.kind === "news") {                  // a new changelog entry
      a.href = "/changelog";
      text = `✨ ${L("whatsNew")} · ${f.title}`;
    } else if (f.kind === "colosseum") {
      a.href = "/colosseum/";
      text = `${L("colosseum")} · #${f.fly} ${f.place ? L("place").replace("{n}", f.place) : L("finished")}${f.prize_wei && f.prize_wei !== "0" ? ` · +${flai(f.prize_wei)} $FLYAI` : ""}`;
    } else {
      a.href = "/traderflies/pass";
      text = `${L("payout")} · ${flai(f.amount_wei)} $FLYAI`;
    }
    a.textContent = text;
    const t = document.createElement("small");
    t.textContent = f.kind === "news" ? new Date(f.at).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" }) : ago(f.at);
    a.append(t);
    if (isNew) a.className = "new";
    return a;
  }
})();
