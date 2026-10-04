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
      ["Fly Roulette", "/roulette/", "Fly brains vs a toy cap gun"],
      ["Fly Slots", "/slots/", "Spin the reels, a fly brain reacts"],
      ["Fly Race", "/race/", "Six fly brains race to the fruit"],
      ["Fly Radio", "/radio/", "A station played by a real fly brain"],
      ["Flinder", "/flinder/", "A fly brain swipes on dating profiles"],
      ["Hardware NFTs", "/traderflies/pets", "FLYAI pets: pre-order a pocket fly"],
      ["Compute", "/compute/", "Mine with your browser, earn $FLYAI"],
      ["Bounties", "/bounties", "Get paid in $FLYAI for memes, bots, research"],
    ]],
    ["nfts", "NFTs", [
      ["Trader Flies", "/traderflies/", "The collection and your flies"],
      // 2026-10-03, the user: the inventory and the leaderboard under NFTs, each a page of its own
      ["Inventory", "/traderflies/inventory", "Your flies and their wallets"],
      ["Leaderboard", "/traderflies/leaderboard", "The best Fly Wallets, live"],
      ["Fly Market", "/traderflies/market", "Buy and sell Trader Flies"],
      ["Breed", "/traderflies/breed", "Merge two flies into one"],
      ["Claim", "/traderflies/claim", "Collect your flies' $FLYAI"],
      ["FlightPass", "/traderflies/pass", "Put your flies on autopilot"],
      ["OpenSea", "https://opensea.io/collection/trader-fly-294099831", "Trader Flies on OpenSea"],
    ]],
    ["research", "Research", [
      ["All findings", "/research", "Fighting, the 3-D world, what failed"],
      ["Talking flies", "/research/flybook", "Flybook: can two brains signal?"],
      ["On air", "/research/radio", "How a radio station run by a real fly brain works"],
      ["Fly Desk", "/desk", "Fly brains trade a paper book"],
      ["Roadmap", "/roadmap", "What's done and what's next"],
    ]],
    ["token", "$FLYAI", [
      ["Token", "/token", "Contract, chain, where to buy"],
      ["Merch", "/shop", "Fly shirts and more", true],
      ["API & skills", "/desk-api", "Buy the desk's answers over x402"],
      ["For Agents", "/agents", "Make Claude talk like a fly"],
    ], true],
  ];
  const SESSION_KEY = "flyai.compute.session";            // mine/web/account.ts: one session for every app
  const ACCOUNT_JS = "/compute/mine/web/account.js";       // the shared sign-in (built from mine/web)
  const MINE_API = "https://flyai-mine.fly.dev";
  const ACCT_TEXT = {
    en: { signInHint: "Sign in at the top right ↗", signIn: "Sign in", myFlies: "My flies", leaderboard: "Leaderboard", nickname: "Nickname", nickHint: "3-20 letters",
          save: "Save", saved: "Saved", compute: "Compute & balance", signOut: "Sign out" ,
          search: "Search", searchHint: "Apps, #fly, people", openFly: "Open the fly", flies: "Flies", noResults: "Nothing found", notifications: "Notifications", nothingYet: "Nothing yet: fund a fly or play a game", bought: "bought", sold: "sold", colosseum: "Colosseum", place: "place {n}", finished: "finished", payout: "Payout", b_nickname: "Named", b_funded: "Funded a fly", b_profit: "In profit", b_trader: "10+ trades", b_gladiator: "Gladiator", b_champion: "Champion", b_player: "Player", b_regular: "Regular" },
    es: { signInHint: "Entra arriba a la derecha ↗", signIn: "Entrar", myFlies: "Mis moscas", leaderboard: "Clasificación", nickname: "Apodo", nickHint: "3-20 letras",
          save: "Guardar", saved: "Guardado", compute: "Compute y saldo", signOut: "Salir" ,
          search: "Buscar", searchHint: "Apps, #mosca, gente", openFly: "Abrir la mosca", flies: "Moscas", noResults: "Sin resultados", notifications: "Notificaciones", nothingYet: "Nada aún: financia una mosca o juega", bought: "compró", sold: "vendió", colosseum: "Colosseum", place: "puesto {n}", finished: "terminado", payout: "Pago", b_nickname: "Con nombre", b_funded: "Financió una mosca", b_profit: "En ganancia", b_trader: "10+ operaciones", b_gladiator: "Gladiador", b_champion: "Campeón", b_player: "Jugador", b_regular: "Habitual" },
    tr: { signInHint: "Sağ üstten giriş yap ↗", signIn: "Giriş yap", myFlies: "Sineklerim", leaderboard: "Sıralama", nickname: "Takma ad", nickHint: "3-20 harf",
          save: "Kaydet", saved: "Kaydedildi", compute: "Compute ve bakiye", signOut: "Çıkış" ,
          search: "Ara", searchHint: "Uygulama, #sinek, kişi", openFly: "Sineği aç", flies: "Sinekler", noResults: "Bulunamadı", notifications: "Bildirimler", nothingYet: "Henüz yok: bir sineği fonla ya da oyna", bought: "aldı", sold: "sattı", colosseum: "Colosseum", place: "{n}. sıra", finished: "bitti", payout: "Ödeme", b_nickname: "İsimli", b_funded: "Sinek fonladı", b_profit: "Kârda", b_trader: "10+ işlem", b_gladiator: "Gladyatör", b_champion: "Şampiyon", b_player: "Oyuncu", b_regular: "Müdavim" },
    ko: { signInHint: "오른쪽 위에서 로그인 ↗", signIn: "로그인", myFlies: "내 파리", leaderboard: "리더보드", nickname: "닉네임", nickHint: "3-20자",
          save: "저장", saved: "저장됨", compute: "Compute와 잔액", signOut: "로그아웃" ,
          search: "검색", searchHint: "앱, #파리, 사람", openFly: "파리 열기", flies: "파리", noResults: "결과 없음", notifications: "알림", nothingYet: "아직 없음: 파리에 자금을 넣거나 게임을 해보세요", bought: "매수", sold: "매도", colosseum: "콜로세움", place: "{n}위", finished: "종료", payout: "지급", b_nickname: "이름 설정", b_funded: "파리 자금", b_profit: "수익 중", b_trader: "거래 10회+", b_gladiator: "검투사", b_champion: "챔피언", b_player: "플레이어", b_regular: "단골" },
    "zh-Hans": { signInHint: "请在右上角登录 ↗", signIn: "登录", myFlies: "我的苍蝇", leaderboard: "排行榜", nickname: "昵称", nickHint: "3-20 个字符",
          save: "保存", saved: "已保存", compute: "Compute 与余额", signOut: "退出" ,
          search: "搜索", searchHint: "应用、#苍蝇、用户", openFly: "打开苍蝇", flies: "苍蝇", noResults: "无结果", notifications: "通知", nothingYet: "暂无：给苍蝇注资或玩个游戏", bought: "买入", sold: "卖出", colosseum: "竞技场", place: "第 {n} 名", finished: "已结束", payout: "支付", b_nickname: "已起名", b_funded: "注资苍蝇", b_profit: "盈利中", b_trader: "10+ 笔交易", b_gladiator: "角斗士", b_champion: "冠军", b_player: "玩家", b_regular: "常客" },
    "zh-Hant": { signInHint: "請在右上角登入 ↗", signIn: "登入", myFlies: "我的蒼蠅", leaderboard: "排行榜", nickname: "暱稱", nickHint: "3-20 個字元",
          save: "儲存", saved: "已儲存", compute: "Compute 與餘額", signOut: "登出" ,
          search: "搜尋", searchHint: "應用、#蒼蠅、用戶", openFly: "打開蒼蠅", flies: "蒼蠅", noResults: "無結果", notifications: "通知", nothingYet: "暫無：替蒼蠅注資或玩個遊戲", bought: "買入", sold: "賣出", colosseum: "競技場", place: "第 {n} 名", finished: "已結束", payout: "支付", b_nickname: "已命名", b_funded: "注資蒼蠅", b_profit: "盈利中", b_trader: "10+ 筆交易", b_gladiator: "角鬥士", b_champion: "冠軍", b_player: "玩家", b_regular: "常客" },
  };

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
    const link = ([label, href, desc, newTab]) => {
      const a = el("a", { href: fileHref(href) }, label);
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
        el("ul", null, ...item[2].map(([label, href, , newTab]) => el("li", null, link([label, href, undefined, newTab]))))));
    }
    for (const item of NAV) {
      if (!Array.isArray(item[2])) { ul.append(el("li", { class: "main" }, link(item))); continue; }
      const [id, label, items, right] = item;
      const btn = el("button", { class: "ddbtn ddlabel", type: "button", "aria-expanded": "false", "aria-controls": `dd-${id}` },
        `${label} `, el("span", { "aria-hidden": "true" }, "▾"));
      const menu = el("ul", { class: right ? "ddmenu right" : "ddmenu", id: `dd-${id}` });
      for (const it of items) menu.append(el("li", null, link(it)));
      if (menu.querySelector("a.on")) btn.classList.add("on");
      ul.append(el("li", { class: "dd main" }, btn, menu));
    }
    const burger = el("button", { class: "burger-btn", type: "button", "aria-expanded": "false", "aria-controls": "mnav", "aria-label": "Menu" },
      el("i"), el("i"), el("i"));                         // three drawn bars that turn into an X (CSS), not the ☰ glyph
    ul.append(searchBox(el), ...(session() ? [bell(el)] : []), account(el, fileHref), el("li", { class: "burger" }, burger));

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

  wireAccount(nav);
  pageSignIns(nav);
  wireSearch(nav, NAV, fileHref_(nav));
  wireBell(nav);
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
      const b = el("button", { class: "btn sm acct-in", type: "button" }, L("signIn"));   // a button, not a menu
      const plain = el("li", { class: "acct" }, b);
      plain.dataset.signin = "1";
      return plain;
    }
    btn.append(el("span", { class: "acct-name" }, short(s.wallet)), el("span", { "aria-hidden": "true" }, " ▾"));
    const item = (label, href) => el("li", null, el("a", { href: fileHref(href) }, label));
    const form = el("li", { class: "acct-nick" },
      el("label", { for: "acct-nick" }, L("nickname")),
      el("div", null, el("input", { id: "acct-nick", maxlength: "20", placeholder: L("nickHint") }),
        el("button", { type: "button", class: "btn sm" }, L("save"))),
      el("small", { class: "acct-msg" }));
    menu.append(el("li", { class: "acct-badges", hidden: "" }),
      item(L("myFlies"), "/traderflies/traders?view=mine"), item(L("leaderboard"), "/traderflies/traders?view=board"),
      form, item("Flybook", "/flybook/"), item(L("compute"), "/compute/"),
      el("li", null, el("button", { type: "button", class: "acct-out" }, L("signOut"))));
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
    fetch(`${MINE_API}/api/profiles?wallets=${s.wallet}`).then((r) => r.json()).then((got) => {
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
   * signed out, a page's own sign-in button (marked data-nav-signin) shows as a pointer to the nav's (site.css) and a
   * click on it runs the nav's sign-in. Signed in, the page's buttons are back as they were (a Trader Flies page may
   * still need its wallet reconnected).
   */
  function pageSignIns(nav) {
    const btn = nav.querySelector("li.acct[data-signin] button");
    if (!btn) return;
    const root = document.documentElement;
    root.classList.add("nav-signed-out");
    root.style.setProperty("--nav-signin-hint", JSON.stringify(L("signInHint")));
    document.addEventListener("click", (e) => {
      if (!e.target.closest || !e.target.closest("[data-nav-signin]")) return;
      e.preventDefault();
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: "smooth" });
      btn.click();
    }, true);   // capture: before the page's own handler
  }

  function session() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return s && s.expires_at > Date.now() && s.wallet && s.token ? s : null;
    } catch { return null; }
  }
  function short(w) { return `${w.slice(0, 6)}…${w.slice(-4)}`; }
  function L(key) {
    let lang = "en";
    try { lang = localStorage.getItem("flyai.lang") || "en"; } catch {}
    return (ACCT_TEXT[lang] || ACCT_TEXT.en)[key] || ACCT_TEXT.en[key];
  }

  // ---- search, notifications, badges (2026-10-03, "one product": global search, a notification center, achievements) ----

  function fileHref_(nav) { return (href) => href; }

  /** 🔍 for everyone: apps by name (the menu itself), a fly by number (#471), people by nickname (the mine server). */
  function searchBox(el) {
    return el("li", { class: "dd srch" },
      el("button", { class: "ddbtn ddlabel srch-btn", type: "button", "aria-expanded": "false", "aria-controls": "dd-srch",
        "aria-label": L("search"), title: L("search") }, "🔍"),
      el("ul", { class: "ddmenu right", id: "dd-srch" },
        el("li", { class: "srch-box" }, el("input", { type: "search", id: "srch-q", placeholder: L("searchHint"), autocomplete: "off" })),
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
        "aria-label": L("notifications"), title: L("notifications") }, "🔔", el("b", { class: "bell-n", hidden: "" })),
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
  function wireBell(nav) {
    const li = nav.querySelector("li.bell");
    if (!session()) return;
    void loadSummary().then((v) => {
      window.flySummary = v;
      window.dispatchEvent(new CustomEvent("fly:summary", { detail: v }));
      if (!v) return;
      if (v.nickname) { const n_ = nav.querySelector(".acct-name"); if (n_) n_.textContent = v.nickname; }
      const badges = nav.querySelector(".acct-badges");
      if (badges && v.badges && v.badges.length) {
        badges.hidden = false;
        badges.replaceChildren(...v.badges.map((b) => Object.assign(document.createElement("span"), { className: "badge", textContent: L("b_" + b), title: L("b_" + b) })));
      }
      if (!li) return;
      let seen = 0;
      try { seen = Number(localStorage.getItem("flyai.notif.seen") || 0); } catch {}
      const unread = (v.feed || []).filter((f) => f.at > seen).length;
      const n = li.querySelector(".bell-n");
      if (unread) { n.textContent = unread > 9 ? "9+" : String(unread); n.hidden = false; }
      const list = li.querySelector(".bell-list");
      list.replaceChildren(...((v.feed || []).length ? v.feed.map((f) => feedRow(f, f.at > seen)) : [Object.assign(document.createElement("small"), { textContent: L("nothingYet") })]));
      li.querySelector(".bell-btn").addEventListener("click", () => {
        try { localStorage.setItem("flyai.notif.seen", String(Date.now())); } catch {}
        n.hidden = true;
      });
    });
  }
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
