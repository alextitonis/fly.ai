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
  const NAV = [
    ["Home", "/"],
    ["Fly Colosseum", "/colosseum/"],
    ["Traders", "/traderflies/traders"],
    ["research", "Research", [
      ["All findings", "/research", "Fighting, the 3-D world, what failed"],
      ["Talking flies", "/research/flybook", "Flybook: can two brains signal?"],
      ["On air", "/research/radio", "How a radio station run by a real fly brain works"],
      ["Roadmap", "/roadmap", "What's done and what's next"],
    ]],
    ["apps", "Apps", [
      ["Simulation", "/simulation/", "Flies with real brains in a 3-D world"],
      ["Flybook", "/flybook/", "The live feed written by fly brains"],
      ["Fly Radio", "/radio/", "A station played by a real fly brain"],
      ["Fly Roulette", "/roulette/", "Fly brains vs a toy cap gun"],
      ["Fly Slots", "/slots/", "Spin the reels, a fly brain reacts"],
      ["Fly Race", "/race/", "Six fly brains race to the fruit"],
      ["Flinder", "/flinder/", "A fly brain swipes on dating profiles"],
      ["Compute", "/compute/", "Mine with your browser, earn $FLYAI"],
    ]],
    ["market", "Market", [
      ["Fly Market", "/traderflies/market", "Buy and sell Trader Flies"],
      ["OpenSea", "https://opensea.io/collection/trader-fly-294099831", "Trader Flies on OpenSea"],
    ]],
    ["nfts", "NFTs", [
      ["Trader Flies", "/traderflies/", "The collection and your flies"],
      ["Breed", "/traderflies/breed", "Merge two flies into one"],
      ["Claim", "/traderflies/claim", "Collect your flies' $FLYAI"],
      ["Hardware NFTs", "/traderflies/pets", "FLYAI pets: pre-order a pocket fly"],
      ["FlightPass", "/traderflies/pass", "Put your flies on autopilot"],
    ]],
    ["flydesk", "Fly Desk", [
      ["Fly Desk", "/desk", "Fly brains trade a paper book"],
      ["API & skills", "/desk-api", "Buy the desk's answers over x402"],
    ], true],
    ["token", "$FLYAI", [
      ["Token", "/token", "Contract, chain, where to buy"],
      ["Merch", "/shop", "Fly shirts and more", true],
      ["For Agents", "/agents", "Make Claude talk like a fly"],
    ], true],
  ];
  const FOLLOW = "https://x.com/flydotai";

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
    for (const item of NAV) {
      if (!Array.isArray(item[2])) { ul.append(el("li", null, link(item))); continue; }
      const [id, label, items, right] = item;
      const btn = el("button", { class: "ddbtn ddlabel", type: "button", "aria-expanded": "false", "aria-controls": `dd-${id}` },
        `${label} `, el("span", { "aria-hidden": "true" }, "▾"));
      const menu = el("ul", { class: right ? "ddmenu right" : "ddmenu", id: `dd-${id}` });
      for (const it of items) menu.append(el("li", null, link(it)));
      if (menu.querySelector("a.on")) btn.classList.add("on");
      ul.append(el("li", { class: "dd" }, btn, menu));
    }
    ul.append(el("li", null, el("a", { class: "btn sm", href: FOLLOW, target: "_blank", rel: "noopener" }, "Follow @flydotai")));

    const brand = el("a", { class: "brand", href: fileHref("/") },
      el("img", { class: "logo", src: root ? `${root}assets/logo-t.webp` : "/assets/logo-t.webp", alt: "fly.ai", width: "988", height: "439" }), "$FLYAI");
    nav.replaceChildren(el("div", { class: "wrap" }, brand, ul));
  }

  const menus = [...nav.querySelectorAll("li.dd")];
  const close = (dd) => { dd.classList.remove("open"); dd.querySelector(".ddbtn").setAttribute("aria-expanded", "false"); };
  for (const dd of menus) {
    const btn = dd.querySelector(".ddbtn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !dd.classList.contains("open");
      menus.forEach(close);
      if (open) { dd.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    });
    dd.addEventListener("focusout", (e) => { if (!dd.contains(e.relatedTarget)) close(dd); });
  }
  document.addEventListener("click", (e) => menus.forEach((dd) => { if (!dd.contains(e.target)) close(dd); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menus.forEach(close); });
})();
