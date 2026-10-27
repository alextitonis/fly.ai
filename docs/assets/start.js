/**
 * /start's amount buttons (2026-10-27, the buy-flow plan step 3): $20 / $50 / $100 / $250 fill the swap box (buy.js)
 * in whatever the visitor pays with - USDG / USDC as dollars, ETH and NVDA at today's price from the same pools the
 * direct route uses (route.js usdTo). The box then quotes and buys as everywhere else.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const group = $("start-amounts");
  if (!group) return;
  let usd = 50;

  function decimal(raw, decimals, keep) {
    const one = 10n ** BigInt(decimals);
    const frac = (raw % one).toString().padStart(decimals, "0").slice(0, keep).replace(/0+$/, "");
    return (raw / one).toString() + (frac ? "." + frac : "");
  }

  async function fill() {
    const sym = $("buy-pay").value;
    for (const b of group.querySelectorAll("[data-usd]")) b.setAttribute("aria-pressed", String(Number(b.dataset.usd) === usd));
    const raw = window.flyRoute ? await window.flyRoute.usdTo(sym, usd) : null;
    if (raw == null) return;                            // a coin we can't price here: the amount stays as typed
    const dec = sym === "USDG" || sym === "USDC" ? 6 : 18;
    const input = $("buy-amount");
    input.value = decimal(raw, dec, dec === 6 ? 2 : 6);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  for (const b of group.querySelectorAll("[data-usd]")) {
    b.addEventListener("click", () => { usd = Number(b.dataset.usd); fill(); });
  }
  // a new coin or chain: the same dollars in it (after buy.js has refilled the coin list)
  $("buy-pay").addEventListener("change", () => setTimeout(fill, 0));
  if ($("buy-from")) $("buy-from").addEventListener("change", () => setTimeout(fill, 0));
  // a dollar amount in the link (/start?usd=100) picks that button
  const want = Number(new URLSearchParams(location.search).get("usd"));
  if ([20, 50, 100, 250].includes(want)) usd = want;
  fill();
})();
