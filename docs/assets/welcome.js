/**
 * The first-visit popup (2026-10-27, the user: "if user first time enters, it shows an eli5"): fly.ai in 30 seconds,
 * the levels to start at, the one real contract. nav.js loads this only when localStorage flyai.welcome.seen is unset
 * and nobody is signed in; it shows once per browser. ?welcome in a URL shows it again (for checking).
 * Words: English here, the page's language from /assets/i18n/<lang>/welcome.json (the same files the site uses).
 */
(function () {
  const SEEN_KEY = "flyai.welcome.seen";
  const LANGS = ["en", "zh-Hans", "zh-Hant", "ko", "tr", "es"];   // i18n.js LANGUAGES
  // 2026-11-18 (PostHog: 75% of new visitors left after one screen, most without scrolling): three lines, not a page,
  // and it no longer covers the first screen - it waits for a scroll past it or a second page (see the bottom)
  const EN = {
    eyebrow: "New here?",
    title: "fly.ai in 3 lines",
    l1: "Scientists mapped every neuron of a real fruit fly: <b>166,700 neurons</b>. fly.ai runs that map as software.",
    l2: "A <b>Trader Fly</b> is an NFT with its own wallet. The brain picks its trades, and every trade is public.",
    l3: "Hold <b>200,000 $FLYAI</b> and your flies trade and share the Fly Desk's weekly payout.",
    risk: "Only put in what you'd be fine losing. The only real $FLYAI contract is below. Nobody from the team will DM you first.",
    watch: "Watch a fly trade",
    buy: "Buy $FLYAI",
    look: "Just look around",
    close: "Close",
  };
  const CONTRACT = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";

  function lang() {
    let l = "en";
    try { l = new URLSearchParams(location.search).get("lang") || localStorage.getItem("flyai.lang") || "en"; } catch {}
    return LANGS.includes(l) ? l : "en";
  }
  /** nav.js's i18nBase: a docs page opened from disk reads the folder beside it. */
  function i18nBase() {
    const docs = location.protocol === "file:" ? location.pathname.lastIndexOf("/docs/") : -1;
    return docs >= 0 ? `${location.pathname.slice(0, docs + 6)}assets/i18n/` : "/assets/i18n/";
  }
  function href(path) {
    const docs = location.protocol === "file:" ? location.pathname.lastIndexOf("/docs/") : -1;
    return docs >= 0 ? `${location.pathname.slice(0, docs + 6)}${path.slice(1)}.html` : path;
  }
  async function words() {
    const l = lang();
    if (l === "en") return EN;
    try {
      const r = await fetch(`${i18nBase()}${l}/welcome.json`);
      return r.ok ? { ...EN, ...(await r.json()) } : EN;
    } catch { return EN; }
  }

  const CSS = `
.fw-sheet { position: fixed; inset: 0; z-index: 1001; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(0,0,0,.72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: fw-in .25s ease-out; }
.fw-panel { position: relative; width: min(520px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; box-sizing: border-box;
  background: var(--panel, #0a0b0b); border: 1px solid rgba(94,242,204,.28); border-radius: 22px; padding: 26px 24px 22px;
  color: var(--text, #f4f7f6); font: 15px/1.55 var(--sans, Inter, system-ui, sans-serif); text-align: left;
  box-shadow: 0 0 0 1px rgba(255,255,255,.03), 0 30px 80px rgba(0,0,0,.6), 0 0 60px rgba(94,242,204,.08); animation: fw-up .3s ease-out; }
.fw-panel * { box-sizing: border-box; }
.fw-panel:lang(ko) { word-break: keep-all; }
.fw-x { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border-radius: 999px; border: 0; background: none;
  color: var(--muted, #9ba5a1); font-size: 22px; line-height: 1; cursor: pointer; }
.fw-x:hover { background: rgba(255,255,255,.06); color: var(--text, #f4f7f6); }
.fw-eye { margin: 0 0 4px; font: 500 12px var(--mono, ui-monospace, monospace); letter-spacing: .06em; text-transform: uppercase; color: var(--mint, #5ef2cc); }
.fw-panel h2 { margin: 0 0 12px; font: 700 26px/1.15 var(--display, Outfit, system-ui, sans-serif); letter-spacing: -.01em; }
.fw-panel h3 { margin: 18px 0 8px; font: 600 15px var(--display, Outfit, system-ui, sans-serif); color: var(--text, #f4f7f6); }
.fw-panel p { margin: 0; color: var(--muted, #9ba5a1); }
.fw-panel b { color: var(--text, #f4f7f6); font-weight: 600; }
.fw-lines { margin: 0; padding-left: 20px; display: grid; gap: 8px; color: var(--muted, #9ba5a1); }
.fw-lines li::marker { color: var(--mint, #5ef2cc); font-weight: 600; }
.fw-does { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.fw-does li { display: flex; gap: 10px; align-items: flex-start; color: var(--muted, #9ba5a1); }
.fw-does li span { flex: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; background: rgba(94,242,204,.08); font-size: 15px; }
.fw-levels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.fw-levels div { position: relative; padding: 10px 10px 9px; border: 1px solid var(--line, #1a1d1c); border-radius: 14px; background: rgba(255,255,255,.02); }
.fw-levels div b { display: block; font: 600 14px var(--display, Outfit, system-ui, sans-serif); }
.fw-levels div small { display: block; margin-top: 2px; font-size: 12px; line-height: 1.35; color: var(--dim, #7a8480); }
.fw-levels div + div::before { content: "→"; position: absolute; left: -9px; top: 50%; transform: translate(-50%, -50%); font-size: 11px; color: var(--dim, #7a8480); }
.fw-risk { margin-top: 16px !important; padding: 10px 12px; border-radius: 12px; background: rgba(255,91,79,.07); border: 1px solid rgba(255,91,79,.22); font-size: 13px; }
.fw-ca { display: block; margin-top: 6px; font: 500 11.5px var(--mono, ui-monospace, monospace); color: var(--text, #f4f7f6); word-break: break-all; }
.fw-act { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.fw-act a, .fw-act button { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0 16px;
  border-radius: 999px; font: 600 14px var(--display, Outfit, system-ui, sans-serif); text-decoration: none; cursor: pointer; border: 1px solid var(--line, #1a1d1c);
  background: rgba(255,255,255,.03); color: var(--text, #f4f7f6); }
.fw-act .fw-buy { background: var(--mint, #5ef2cc); border-color: var(--mint, #5ef2cc); color: #001a12; }
.fw-act .fw-buy:hover { background: var(--mint-hi, #a4fbe6); }
.fw-act a:not(.fw-buy):hover, .fw-act button:hover { border-color: rgba(94,242,204,.4); }
.fw-act .fw-look { flex-basis: 100%; background: none; border: 0; min-height: 34px; color: var(--muted, #9ba5a1); font-weight: 500; }
.fw-act .fw-look:hover { color: var(--text, #f4f7f6); }
body.fw-open { overflow: hidden; }
@keyframes fw-in { from { opacity: 0; } }
@keyframes fw-up { from { opacity: 0; transform: translateY(14px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .fw-sheet, .fw-panel { animation: none; } }
@media (max-width: 480px) {
  .fw-sheet { align-items: flex-end; padding: 0; }
  .fw-panel { border-radius: 22px 22px 0 0; max-height: 92dvh; padding: 22px 16px 18px; }
  .fw-panel h2 { font-size: 23px; }
  .fw-levels { gap: 6px; }
  .fw-levels div { padding: 8px 8px 7px; }
}`;

  async function show() {
    const w = await words();
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);

    const sheet = document.createElement("div");
    sheet.className = "fw-sheet";
    sheet.lang = lang();
    sheet.innerHTML = `
<div class="fw-panel" role="dialog" aria-modal="true" aria-labelledby="fw-title">
  <button type="button" class="fw-x" aria-label="${w.close}">×</button>
  <p class="fw-eye">${w.eyebrow}</p>
  <h2 id="fw-title">${w.title}</h2>
  <ol class="fw-lines">${["l1", "l2", "l3"].map((k) => `<li>${w[k]}</li>`).join("")}</ol>
  <p class="fw-risk">${w.risk}<code class="fw-ca">${CONTRACT}</code></p>
  <div class="fw-act">
    <a class="fw-buy" href="${href("/traderflies/leaderboard")}">${w.watch}</a>
    <a href="${href("/start")}">${w.buy}</a>
    <button type="button" class="fw-look">${w.look}</button>
  </div>
</div>`;
    const before = document.activeElement;
    const close = () => {
      sheet.remove();
      document.body.classList.remove("fw-open");
      document.removeEventListener("keydown", onKey);
      if (before && before.focus) before.focus();
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest(".fw-x, .fw-look")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.append(sheet);
    document.body.classList.add("fw-open");
    sheet.querySelector(".fw-buy").focus({ preventScroll: true });
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch {}
  }

  // when: ?welcome at once; else on this browser's second page, or once the visitor scrolls past the first screen
  const PAGES_KEY = "flyai.welcome.pages";
  let pages = 1, forced = false;
  try {
    forced = new URLSearchParams(location.search).has("welcome");
    pages = Number(sessionStorage.getItem(PAGES_KEY) || 0) + 1;
    sessionStorage.setItem(PAGES_KEY, String(pages));
  } catch {}
  let shown = false;
  const once = () => { if (!shown) { shown = true; window.removeEventListener("scroll", onScroll); void show(); } };
  const onScroll = () => { if (window.scrollY > window.innerHeight * 0.9) once(); };
  const arm = () => {
    if (forced) setTimeout(once, 600);
    else if (pages >= 2) setTimeout(once, 1500);
    else window.addEventListener("scroll", onScroll, { passive: true });
  };
  if (document.readyState === "complete") arm();
  else window.addEventListener("load", arm, { once: true });
})();
