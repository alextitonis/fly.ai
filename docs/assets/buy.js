/**
 * "Buy $FLYAI" on the token page (token.html #buy; 2026-10-05, the user: a swap on our own site, with a fee). The
 * visitor's own wallet buys $FLYAI with USDG or ETH - or sells it for them ("and vice versa") - on Robinhood Chain
 * through Relay (relay.link; it has no NVDA), which routes the
 * trade through the existing FLYAI pools - nothing of ours holds the money. Relay takes our app fee (FEE_BPS, to
 * FEE_TO) inside the same swap; the fees build up at Relay for FEE_TO to claim.
 *
 * Every transaction Relay hands back is checked before the wallet is asked to sign (the desk's relay.check_steps):
 * it runs on Robinhood Chain, goes to one of Relay's published contracts for it (GET /chains), sends no more coin
 * than the amount paid, and an approve is only of the token paid, to such a contract, for no more than the amount.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("buy")) return;

  const API = "https://api.relay.link";
  const CHAIN = 4663;
  const CHAIN_HEX = "0x1237";
  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const EXPLORER = "https://robinhoodchain.blockscout.com";
  const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
  const FEE_TO = "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea";
  const FEE_BPS = 25;                                   // 0.25% (the user, 2026-10-05: 0.5 -> 0.25)
  const PREVIEW_USER = "0x000000000000000000000000000000000000dEaD";   // quotes before a wallet is connected
  const PAY = {
    USDG: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 },
    ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18 },
  };
  const FLY = { address: FLYAI, decimals: 18 };
  const selling = () => $("buy-dir").value === "sell";
  // what the wallet pays and what it gets: [token paid, token got, symbol paid, symbol got]
  const sides = (other) => selling() ? [FLY, PAY[other], "FLYAI", other] : [PAY[other], FLY, other, "FLYAI"];
  const APPROVE = "0x095ea7b3";
  // the site's one sign-in (the nav's account menu, mine/web/account.ts): the same signed-in wallet and wallet picker
  // (browser wallets and WalletConnect) on every page; plain window.ethereum only if it can't load (a local copy)
  const ACCOUNT_JS = "/compute/mine/web/account.js";
  let acct = null;
  const loadAcct = () => (acct ? Promise.resolve(acct) : import(ACCOUNT_JS).then((m) => (acct = m)).catch(() => null));

  let en = null;
  const pick = (o, k) => k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), o);
  function t(key, vars) {
    if (window.flyI18n) return window.flyI18n.t("token.buy." + key, vars);
    let v = pick(en, "buy." + key);
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  }
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const fmt = (x, d) => new Intl.NumberFormat(lang(), { maximumFractionDigits: d }).format(x);

  let wallet = null, quote = null, quoteFor = "", timer = null, busy = false, allowedCache = null;

  function msg(text, kind, link) {
    const el = $("buy-msg");
    el.textContent = text || "";
    el.dataset.kind = kind || "";
    if (link) {
      const a = document.createElement("a");
      a.href = link; a.target = "_blank"; a.rel = "noopener"; a.textContent = " " + t("viewTx");
      el.appendChild(a);
    }
  }

  function units(amount, decimals) {                    // "12.5" -> 12500000n (no float rounding)
    const [i, f = ""] = String(amount).trim().split(".");
    if (!/^\d*$/.test(i) || !/^\d*$/.test(f) || (i === "" && f === "")) return null;
    return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  }

  async function allowed() {
    if (allowedCache) return allowedCache;
    const r = await fetch(API + "/chains");
    const c = ((await r.json()).chains || []).find((x) => Number(x.id) === CHAIN);
    if (!c) throw new Error("Relay does not list Robinhood Chain");
    const k = c.contracts || {};
    const calls = new Set([k.approvalProxy, k.erc20Router, k.relayReceiver, ...Object.values(k.v3 || {})]
      .concat(Object.values(c.protocol || {}).map((v) => v && v.depository)).filter(Boolean).map((a) => a.toLowerCase()));
    const solvers = new Set((c.solverAddresses || []).map((a) => a.toLowerCase()));
    return (allowedCache = { calls, solvers });
  }

  async function getQuote(user, pay, amount) {
    const [tin, tout] = sides(pay);
    const r = await fetch(API + "/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user, recipient: user, originChainId: CHAIN, destinationChainId: CHAIN,
        originCurrency: tin.address, destinationCurrency: tout.address, amount: amount.toString(),
        tradeType: "EXACT_INPUT", appFees: [{ recipient: FEE_TO, fee: String(FEE_BPS) }],
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.steps) throw new Error(d.message || "no quote");
    return d;
  }

  // the desk's relay.check_steps, in the browser
  async function checked(q, pay, amount) {
    const { calls, solvers } = await allowed();
    const [tin, , symIn] = sides(pay);
    const tokenIn = tin.address.toLowerCase(), nativeIn = symIn === "ETH";
    const txs = [];
    for (const step of q.steps) {
      if (step.kind !== "transaction") throw new Error("unexpected step: " + step.kind);
      for (const it of step.items || []) {
        const d = it.data || {};
        const to = String(d.to || "").toLowerCase(), data = String(d.data || "0x"), value = BigInt(d.value || 0);
        if (Number(d.chainId || CHAIN) !== CHAIN) throw new Error("a transaction on another chain");
        if (value > (nativeIn ? amount : 0n)) throw new Error("it would send more coin than you pay");
        if (data.slice(0, 10).toLowerCase() === APPROVE) {
          const spender = "0x" + data.slice(34, 74).toLowerCase(), allowance = BigInt("0x" + data.slice(74, 138));
          if (to !== tokenIn || !calls.has(spender) || allowance > amount) throw new Error("an unexpected approve");
        } else if (!calls.has(to) && !(solvers.has(to) && data === "0x" && nativeIn)) {
          throw new Error("a call to " + to + ", not one of Relay's contracts");
        }
        txs.push({ to: d.to, data, value: "0x" + value.toString(16) });
      }
    }
    if (!txs.length) throw new Error("no transactions");
    return txs;
  }

  function show(q, pay) {
    const out = q.details.currencyOut;
    const got = Number(out.amountFormatted), sym = sides(pay)[3];
    $("buy-out").textContent = fmt(got, sym === "FLYAI" ? 0 : sym === "ETH" ? 6 : 2) + " " + (sym === "FLYAI" ? "$FLYAI" : sym);
    const fee = (q.fees && q.fees.app && Number(q.fees.app.amountUsd)) || 0;
    const imp = q.details.totalImpact && Number(q.details.totalImpact.percent);
    $("buy-detail").textContent = t("detail", {
      usd: fmt(Number(out.amountUsd || 0), 2), fee: fmt(fee, 2),
      impact: imp == null || isNaN(imp) ? "-" : fmt(Math.abs(imp), 2),
    });
  }

  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const pay = $("buy-pay").value, amount = units($("buy-amount").value, sides(pay)[0].decimals);
      quote = null;
      $("buy-out").textContent = "–";
      $("buy-detail").textContent = "";
      if (!amount || amount <= 0n) return;
      const key = $("buy-dir").value + ":" + pay + ":" + amount;
      quoteFor = key;
      try {
        const q = await getQuote(wallet || PREVIEW_USER, pay, amount);
        if (quoteFor !== key) return;                  // the amount changed meanwhile
        quote = q;
        show(q, pay);
        msg("");
      } catch (e) {
        if (quoteFor === key) msg(t("noQuote"), "err");
      }
    }, 400);
  }

  async function ensureChain() {
    const eth = window.ethereum;
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() === CHAIN_HEX) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if (e && e.code !== 4902) throw e;
      await eth.request({ method: "wallet_addEthereumChain", params: [{
        chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
    }
  }

  async function receipt(hash) {
    for (let i = 0; i < 120; i++) {
      const r = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] });
      if (r) return r;
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    throw new Error("no receipt yet");
  }

  const label = () => {
    $("buy-go").textContent = !wallet ? (acct || window.ethereum ? t("connect") : t("noWallet")) : selling() ? t("sell") : t("buy");
  };

  async function connect() {
    const a = await loadAcct();
    if (a) {                                            // the nav's sign-in: its picker, its session
      const w = await a.requireWallet();
      if (!w) return false;
      wallet = w;
      label();
      return true;
    }
    if (!window.ethereum) { msg(t("noWallet"), "err"); return false; }
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) || [];
    if (!accs.length) return false;
    wallet = accs[0];
    label();
    return true;
  }

  async function buy() {
    if (busy) return;
    if (!wallet && !(await connect())) return;
    const pay = $("buy-pay").value, amount = units($("buy-amount").value, sides(pay)[0].decimals);
    if (!amount || amount <= 0n) { msg(t("enterAmount"), "err"); return; }
    busy = true;
    $("buy-go").disabled = true;
    try {
      if (!acct) await ensureChain();                  // the shared wallet kit switches chains itself
      msg(t("quoting"));
      const q = await getQuote(wallet, pay, amount);  // a fresh quote for this wallet
      show(q, pay);
      const txs = await checked(q, pay, amount);
      let last = null;
      for (let i = 0; i < txs.length; i++) {
        msg(t("confirm", { n: i + 1, of: txs.length }));
        if (acct) {
          last = await acct.transact(txs[i].to, txs[i].data, () => {}, CHAIN, txs[i].value);
          msg(t("waiting"));
          await acct.mined(last, CHAIN);                // throws if it reverted
        } else {
          last = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: wallet, ...txs[i], chainId: CHAIN_HEX }] });
          msg(t("waiting"));
          const r = await receipt(last);
          if (r.status !== "0x1") throw new Error("the transaction failed");
        }
      }
      msg(t("done"), "ok", EXPLORER + "/tx/" + last);
    } catch (e) {
      const why = acct ? acct.errorText(e) : (e && e.message) || String(e);
      const cancelled = (e && (e.code === 4001 || (e.cause && e.cause.code === 4001))) || /rejected|denied|cancel/i.test(why);
      msg(cancelled ? t("cancelled") : t("failed", { why }), "err");
    } finally {
      busy = false;
      $("buy-go").disabled = false;
    }
  }

  function start() {
    $("buy-amount").addEventListener("input", refresh);
    const sym = () => { $("buy-paysym").textContent = selling() ? "FLYAI" : $("buy-pay").value; };
    $("buy-pay").addEventListener("change", () => { sym(); refresh(); });
    $("buy-dir").addEventListener("change", () => {
      const sell = selling();
      $("buy-amount").value = sell ? "100000" : "25";
      $("buy-with").textContent = sell ? t("for") : t("with");
      sym();
      label();
      refresh();
    });
    sym();
    $("buy-go").addEventListener("click", buy);
    // signed in already (the nav's session): show Buy at once, then follow sign-ins and sign-outs on any page/tab
    const s = window.flyNav && window.flyNav.session && window.flyNav.session();
    if (s && s.wallet) wallet = s.wallet;
    loadAcct().then((a) => { if (a) a.onAccount((w) => { wallet = w; label(); refresh(); }); else label(); });
    label();
    $("buy-fee").textContent = t("fee", { pct: fmt(FEE_BPS / 100, 2) });
    refresh();
  }

  if (window.flyI18n) start();
  else {
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    window.addEventListener("i18n:ready", go);
    fetch("assets/i18n/en/token.json").then((r) => r.json()).then((d) => { en = d; setTimeout(go, 1500); }).catch(() => {});
  }
})();
