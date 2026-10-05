/**
 * Shared page script.
 *
 * Set CONTRACT_ADDRESS and SWAP_URL once, at launch, and every page updates:
 * the CA boxes fill in, the copy button turns on, the "pre-launch" tags flip to
 * "live", and the buy links appear. Until then the page says plainly that the
 * token is not deployed and no buy link is shown, so there is nothing for a
 * scam address to hide behind.
 */

/** The deployed $FLYAI contract on Robinhood Chain. Empty until launch. */
const CONTRACT_ADDRESS = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";

/**
 * Where to send people to buy it: the Pons / Robinhood Chain page for the
 * token. Paste the real URL here at launch - it is deliberately not guessed.
 */
const SWAP_URL = "https://www.ponsfamily.com/launchpad/0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";

/** Blockscout page for the token on Robinhood Chain. */
const EXPLORER_URL = "https://robinhoodchain.blockscout.com/token/0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";

const X_URL = "https://x.com/flydotai";
const GITHUB_URL = "https://github.com/alextitonis/fly.ai";

(function () {
  // text set here is English; a data-i18n key on it lets i18n/page.js (which runs after) translate it
  const tr = (key, english) => (window.flyI18n ? window.flyI18n.t(key) : english);
  const set = (id, text, live, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (key) el.setAttribute("data-i18n", key);
    else el.removeAttribute("data-i18n");
    if (live) el.className = "v live";
  };

  if (CONTRACT_ADDRESS) {
    set("ca", CONTRACT_ADDRESS);
    set("ca-2", CONTRACT_ADDRESS, true);
    set("token-status", "live", true, "common.words.live");
    set("chain-state", "live", false, "common.words.live");

    const btn = document.getElementById("ca-copy");
    if (btn) {
      btn.disabled = false;
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
          btn.textContent = tr("common.words.copied", "Copied");
          setTimeout(() => (btn.textContent = tr("common.words.copy", "Copy")), 1500);
        });
      });
    }
  }

  // the buy links only exist once there is an address to buy
  for (const host of document.querySelectorAll(".buylinks")) {
    if (CONTRACT_ADDRESS && SWAP_URL) {
      // the primary button is our own box (assets/buy.js, 2026-10-05): this page's #buy, or the token page's
      const buy = document.createElement("a");
      buy.className = "btn red";
      buy.href = document.getElementById("buy") ? "#buy" : "token.html#buy";
      buy.textContent = "Buy $FLYAI";
      buy.setAttribute("data-i18n", "common.words.buyHere");
      host.prepend(buy);
      const a = document.createElement("a");
      a.className = "btn";
      a.href = SWAP_URL;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Buy $FLYAI on Pons";
      a.setAttribute("data-i18n", "common.words.buyOnPons");
      buy.after(a);
      if (EXPLORER_URL) {
        const ex = document.createElement("a");
        ex.className = "btn";
        ex.href = EXPLORER_URL;
        ex.target = "_blank";
        ex.rel = "noopener";
        ex.textContent = "View on explorer";
        ex.setAttribute("data-i18n", "common.words.explorer");
        a.after(ex);
      }
    } else {
      const p = document.createElement("p");
      p.className = "srcline";
      p.textContent = "Not deployed yet — the buy link appears here and on @flydotai at launch.";
      p.setAttribute("data-i18n", "common.words.notDeployedLong");
      host.appendChild(p);
    }
  }
})();

// Reveal on scroll (2026-09-29 modern layer, site.css .rv): each section's blocks fade up as they come into view.
// Only when IntersectionObserver exists and the reader has not asked for reduced motion; anything already on screen
// shows at once, so nothing is ever left hidden.
(function () {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const sel = "section .wrap > *, section .grid3 > *, section .grid2 > *, section .band > *, section .next-pages > *, section .videos > *";
  const items = [...document.querySelectorAll(sel)].filter((el) => !el.closest(".grid3, .grid2, .band, .next-pages, .videos") || el.parentElement.matches(".grid3, .grid2, .band, .next-pages, .videos"));
  if (!items.length) return;
  document.documentElement.classList.add("reveal-on");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  items.forEach((el, i) => {
    el.classList.add("rv");
    if (el.getBoundingClientRect().top < innerHeight) { el.classList.add("in"); return; }
    el.style.transitionDelay = `${(i % 3) * 70}ms`;
    io.observe(el);
  });
})();
