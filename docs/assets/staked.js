/**
 * The wallet's FlyStaking stake and its $ value, for the balance lines (2026-10-27, the user: "show the staked FLYAI
 * (and its $ value) next to the wallet balance on the site wherever we show the user's FLYAI balance"). A stake sits in
 * the FlyStaking contract with no receipt token, so the wallet app and balanceOf never show it.
 *
 * window.flyStaked(wallet) -> Promise<{ wei: bigint, usd: number | null }> (cached a minute per wallet; the price two)
 * window.flyStakedNote(st) -> "+ 1.2M staked (~$340)", or "" with nothing staked
 * window.flyaiUsd() -> Promise<$ per FLYAI | null>; window.flyUsd(usd) -> "~$340"
 * Reads: the public Robinhood RPC (as deskstake.js); the price: DEX Screener's deepest FLYAI pair (as marketbar.js).
 */
(function () {
  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const STAKING = "0x5279dafA0858d4A5B2DCeb05E5b41f954CD692Cc";
  const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
  const STAKED_OF = "0xaf500ba3";
  const WEI = 10n ** 18n;
  const EN = { stakedNote: "+ {amount} staked{usd}" };

  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  function t(key, vars) {
    let v = window.flyI18n ? window.flyI18n.t("common.words." + key, vars) : null;
    if (!v || v === "common.words." + key) v = EN[key].replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
    return v;
  }

  let price = null;                                  // { at, value: Promise<number | null> }
  function flyaiUsd() {
    if (price && Date.now() - price.at < 120_000) return price.value;
    const value = fetch("https://api.dexscreener.com/latest/dex/tokens/" + FLYAI).then((r) => r.json()).then((j) => {
      const best = (j.pairs || []).sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0];
      const p = best ? Number(best.priceUsd) : NaN;
      return isFinite(p) && p > 0 ? p : null;
    }).catch(() => null);
    price = { at: Date.now(), value };
    return value;
  }

  const cache = new Map();                           // wallet -> { at, value }
  async function stakedOf(wallet) {
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1,
      method: "eth_call", params: [{ to: STAKING, data: STAKED_OF + wallet.slice(2).toLowerCase().padStart(64, "0") }, "latest"] }) });
    const b = await r.json();
    if (b.error || !b.result || b.result === "0x") return 0n;
    return BigInt(b.result.slice(0, 66));
  }

  window.flyStaked = function (wallet) {
    if (!wallet) return Promise.resolve({ wei: 0n, usd: null });
    const key = wallet.toLowerCase(), hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    const value = Promise.all([stakedOf(wallet).catch(() => 0n), flyaiUsd()]).then(([wei, p]) =>
      ({ wei, usd: p == null ? null : (Number(wei / WEI) + Number(wei % WEI) / 1e18) * p }));
    cache.set(key, { at: Date.now(), value });
    return value;
  };

  window.flyaiUsd = flyaiUsd;
  window.flyUsd = (usd) => (usd == null ? "" : "~$" + new Intl.NumberFormat(lang(), { maximumFractionDigits: usd >= 100 ? 0 : 2 }).format(usd));

  window.flyStakedNote = function (st) {
    if (!st || !st.wei) return "";
    const x = Number(st.wei / WEI) + Number(st.wei % WEI) / 1e18;
    const amount = new Intl.NumberFormat(lang(), x >= 1e6 ? { notation: "compact", maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }).format(x);
    return t("stakedNote", { amount, usd: st.usd == null ? "" : " (" + window.flyUsd(st.usd) + ")" });
  };
})();
