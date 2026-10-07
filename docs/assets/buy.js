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
 *
 * window.flyRelay (2026-10-07): the same quote + checks for other pages, without this box. The Earn page
 * (assets/earn.js) uses it for its ETH and FLYAI tabs: swap to USDG through Relay, then lend what arrived.
 *
 * Pay from any chain (2026-10-07): ETH or USDC on Base, Arbitrum or Ethereum buys $FLYAI on Robinhood Chain in one step -
 * Relay takes it on that chain and delivers on Robinhood (ORIGINS). The same checks run against Relay's contracts for
 * the chain paid on; the box follows the delivery (Relay's status) after the wallet's transaction.
 *
 * Our own GIGA DEX pool (2026-10-07, the user: "the Swapping to use this one without extra fees (as we take from
 * there)"): USDG <-> FLYAI is also quoted straight from our FLYAI/USDG pool on GIGA DEX (its QuoterV2); when it gives
 * more than Relay's quote (which carries our app fee), the box swaps there through GIGA's SmartRouter with no app fee -
 * we earn the pool's LP fee instead. Its two transactions are built here, to GIGA's router only: approve exactly the
 * amount paid (when the allowance is short), then exactInputSingle to the visitor's own wallet with a 1% floor.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

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
  // the chains a visitor can pay from: their coin and their USDC (public RPCs for the balance line)
  const ORIGINS = {
    4663: { rpc: RPC, explorer: EXPLORER, pay: PAY },
    8453: { rpc: "https://mainnet.base.org", explorer: "https://basescan.org",
            pay: { USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }, ETH: PAY.ETH } },
    42161: { rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io",
             pay: { USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 }, ETH: PAY.ETH } },
    1: { rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io",
         pay: { USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 }, ETH: PAY.ETH } },
  };
  const APPROVE = "0x095ea7b3";
  const allowedCache = {};

  // ---- our FLYAI/USDG pool on GIGA DEX (flytrade/desk/onchain.py GIGA_*; checked on a fork: fills == quotes) ----
  const GIGA = {
    router: "0x57a148316B58C6a20d748a8581Cd416ed7dBE82D", quoter: "0x78cD9561bd33e5A3Bdb6D4A92cE67CB535289655",
    fee: 10000, pool: "0x73d20f446394a477eb9257388df5f6403143af33", slipBps: 100n,
  };
  const word = (v) => (typeof v === "bigint" ? v.toString(16) : String(v).replace(/^0x/, "").toLowerCase()).padStart(64, "0");
  async function call(to, data) {
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.result;
  }
  // only USDG <-> FLYAI goes through our pool (ETH would need wrapping first: Relay keeps that)
  const gigaPair = (tin, tout) => {
    const a = [tin.toLowerCase(), tout.toLowerCase()].sort().join();
    return a === [FLYAI.toLowerCase(), PAY.USDG.address.toLowerCase()].sort().join();
  };
  async function gigaQuote(tin, tout, amount) {
    const ret = await call(GIGA.quoter, "0xc6a5026a" + word(tin) + word(tout) + word(amount) + word(BigInt(GIGA.fee)) + word(0n));
    return BigInt("0x" + ret.slice(2, 66));
  }
  async function gigaTxs(user, tin, tout, amount, out) {
    const txs = [];
    const allowance = BigInt(await call(tin, "0xdd62ed3e" + word(user) + word(GIGA.router)));
    if (allowance < amount) txs.push({ to: tin, data: APPROVE + word(GIGA.router) + word(amount), value: "0x0" });
    const minOut = out * (10000n - GIGA.slipBps) / 10000n;
    const single = "04e45aaf" + word(tin) + word(tout) + word(BigInt(GIGA.fee)) + word(user) + word(amount) + word(minOut) + word(0n);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    // multicall(uint256 deadline, bytes[] data) with one call: head, the array, its one element
    const len = single.length / 2;
    const data = "0x5ae401dc" + word(deadline) + word(64n) + word(1n) + word(32n) + word(BigInt(len))
      + single.padEnd(Math.ceil(single.length / 64) * 64, "0");
    txs.push({ to: GIGA.router, data, value: "0x0" });
    return txs;
  }

  async function allowed(chainId) {
    chainId = chainId || CHAIN;
    if (allowedCache[chainId]) return allowedCache[chainId];
    const r = await fetch(API + "/chains");
    const c = ((await r.json()).chains || []).find((x) => Number(x.id) === chainId);
    if (!c) throw new Error("Relay does not list chain " + chainId);
    const k = c.contracts || {};
    const calls = new Set([k.approvalProxy, k.erc20Router, k.relayReceiver, ...Object.values(k.v3 || {})]
      .concat(Object.values(c.protocol || {}).map((v) => v && v.depository)).filter(Boolean).map((a) => a.toLowerCase()));
    const solvers = new Set((c.solverAddresses || []).map((a) => a.toLowerCase()));
    return (allowedCache[chainId] = { calls, solvers });
  }

  // a Relay quote into Robinhood Chain, our app fee included: tin (on `origin`, Robinhood by default) -> tout, exact input
  async function relayQuote(user, tin, tout, amount, origin) {
    const r = await fetch(API + "/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user, recipient: user, originChainId: origin || CHAIN, destinationChainId: CHAIN,
        originCurrency: tin, destinationCurrency: tout, amount: amount.toString(),
        tradeType: "EXACT_INPUT", appFees: [{ recipient: FEE_TO, fee: String(FEE_BPS) }],
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.steps) throw new Error(d.message || "no quote");
    return d;
  }

  // the desk's relay.check_steps, in the browser: the quote's transactions (all on `origin`, the chain paid on), or an error
  async function relayCheck(q, tokenIn, nativeIn, amount, origin) {
    origin = origin || CHAIN;
    const { calls, solvers } = await allowed(origin);
    tokenIn = tokenIn.toLowerCase();
    const txs = [];
    for (const step of q.steps) {
      if (step.kind !== "transaction") throw new Error("unexpected step: " + step.kind);
      for (const it of step.items || []) {
        const d = it.data || {};
        const to = String(d.to || "").toLowerCase(), data = String(d.data || "0x"), value = BigInt(d.value || 0);
        if (Number(d.chainId || origin) !== origin) throw new Error("a transaction on another chain");
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

  window.flyRelay = { quote: relayQuote, check: relayCheck, FEE_BPS, tokens: { USDG: PAY.USDG, ETH: PAY.ETH, FLYAI: FLY } };
  if (!$("buy")) return;

  const origin = () => Number(($("buy-from") && $("buy-from").value) || CHAIN);
  const away = () => origin() !== CHAIN;                            // paying on another chain: buying only
  const selling = () => !away() && $("buy-dir").value === "sell";
  const payOf = (sym) => ORIGINS[origin()].pay[sym] || PAY[sym];
  // what the wallet pays and what it gets: [token paid, token got, symbol paid, symbol got]
  const sides = (other) => selling() ? [FLY, PAY[other], "FLYAI", other] : [payOf(other), FLY, other, "FLYAI"];
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

  let wallet = null, quote = null, quoteFor = "", timer = null, busy = false;
  // the route (2026-10-07, the user: "the front-end can use our swap for USDG when selecting directly"): "best" takes
  // whichever gives more (our GIGA pool or Relay); "giga" always swaps through our own pool, no app fee
  let route = "best";
  const routable = () => !away() && $("buy-pay").value === "USDG";   // our pool is FLYAI/USDG, on Robinhood
  let bal = null, balFor = "";                         // the paid token's balance (base units) for the wallet
  const GAS_KEEP = 3n * 10n ** 14n;                     // Max on ETH leaves 0.0003 ETH for this swap's gas

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

  // the better of Relay (our 0.25% app fee in it) and our own GIGA pool (no app fee), for what the visitor gets
  async function getQuote(user, pay, amount) {
    const [tin, tout] = sides(pay);
    if (away()) return relayQuote(user, tin.address, tout.address, amount, origin());   // Relay brings it over
    if (route === "giga" && routable()) {
      const out = await gigaQuote(tin.address, tout.address, amount);
      if (!(out > 0n)) throw new Error("no quote");
      return { via: "giga", out, amount, tin: tin.address, tout: tout.address, relay: null };
    }
    const [rq, gq] = await Promise.all([
      relayQuote(user, tin.address, tout.address, amount).catch((e) => e),
      gigaPair(tin.address, tout.address) ? gigaQuote(tin.address, tout.address, amount).catch(() => 0n) : Promise.resolve(0n),
    ]);
    const relayOut = rq instanceof Error ? 0n : BigInt(rq.details.currencyOut.amount || 0);
    if (gq > 0n && gq >= relayOut) return { via: "giga", out: gq, amount, tin: tin.address, tout: tout.address, relay: rq instanceof Error ? null : rq };
    if (rq instanceof Error) throw rq;
    return rq;
  }
  const checked = (q, pay, amount) => {
    if (q.via === "giga") return gigaTxs(wallet, q.tin, q.tout, amount, q.out);
    const [tin, , symIn] = sides(pay);
    return relayCheck(q, tin.address, symIn === "ETH", amount, origin());
  };

  function show(q, pay) {
    if (q.via === "giga") {
      const sym = sides(pay)[3], dec = sides(pay)[1].decimals;
      const got = Number(decimalOf(q.out, dec, 8));
      $("buy-out").textContent = fmt(got, sym === "FLYAI" ? 0 : 2) + " " + (sym === "FLYAI" ? "$FLYAI" : sym);
      const usd = sym === "FLYAI" ? Number(decimalOf(q.amount, 6, 6)) : got;
      $("buy-detail").textContent = t("direct", { usd: fmt(usd, 2) });
      return;
    }
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
      const key = $("buy-dir").value + ":" + pay + ":" + amount + ":" + route + ":" + origin();
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

  // ---- the paid token's balance and the 25 / 50 / 75 / Max buttons (2026-10-05, the user: "like metamask") ----
  async function rpc(method, params, url) {
    const r = await fetch(url || RPC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.result;
  }

  function decimalOf(raw, decimals, maxFrac) {          // 1234500000n, 6 -> "1234.5" (exact, trimmed)
    const neg = raw < 0n, v = neg ? -raw : raw, one = 10n ** BigInt(decimals);
    let frac = (v % one).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
    return (neg ? "-" : "") + (v / one).toString() + (frac ? "." + frac : "");
  }

  function compact(raw, decimals) {                     // what the balance line shows: 12.4M, 1,234.5, 0.0031
    const x = Number(decimalOf(raw, decimals, 8));
    if (x >= 1e6) return new Intl.NumberFormat(lang(), { notation: "compact", maximumFractionDigits: 2 }).format(x);
    return fmt(x, x >= 1000 ? 0 : x >= 1 ? 2 : 6);
  }

  async function loadBalance() {
    const pay = $("buy-pay").value, [tin, , symIn] = sides(pay), key = (wallet || "") + ":" + symIn + ":" + origin();
    const url = ORIGINS[origin()].rpc;
    balFor = key;
    if (!wallet) { bal = null; showBalance(); return; }
    try {
      const raw = symIn === "ETH"
        ? await rpc("eth_getBalance", [wallet, "latest"], url)
        : await rpc("eth_call", [{ to: tin.address, data: "0x70a08231" + wallet.slice(2).toLowerCase().padStart(64, "0") }, "latest"], url);
      if (balFor !== key) return;                       // the coin or wallet changed meanwhile
      bal = BigInt(raw);
    } catch (e) {
      if (balFor === key) bal = null;
    }
    showBalance();
  }

  function showBalance() {
    const [tin, , symIn] = sides($("buy-pay").value);
    $("buy-balrow").hidden = bal == null;
    if (bal != null) $("buy-bal").textContent = t("balance", { amt: compact(bal, tin.decimals) + " " + symIn });
  }

  function usePct(pct) {
    if (bal == null) return;
    const [tin, , symIn] = sides($("buy-pay").value);
    let amt = bal * BigInt(pct) / 100n;
    if (symIn === "ETH" && pct === 100) amt = amt > GAS_KEEP ? amt - GAS_KEEP : 0n;
    $("buy-amount").value = decimalOf(amt, tin.decimals, symIn === "USDG" || symIn === "USDC" ? 6 : symIn === "ETH" ? 8 : 4);
    refresh();
  }

  async function ensureChain(id) {
    const eth = window.ethereum, hex = "0x" + (id || CHAIN).toString(16);
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() === hex) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      if (e && e.code !== 4902) throw e;
      if (hex !== CHAIN_HEX) throw e;                   // the other chains are in every wallet already
      await eth.request({ method: "wallet_addEthereumChain", params: [{
        chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
    }
  }

  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

  // 2026-10-05 (a real buy): "Nonce provided for the transaction is lower than the current nonce" - the wallet sent
  // the swap right after the approve, before its own node had seen the approve. The same step is asked again a few
  // times, a little later each time; anything else is a real error.
  async function sendStep(tx, id) {
    id = id || CHAIN;
    for (let attempt = 0; ; attempt++) {
      try {
        if (acct) return await acct.transact(tx.to, tx.data, () => {}, id, tx.value);
        return await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: wallet, ...tx, chainId: "0x" + id.toString(16) }] });
      } catch (e) {
        const why = String((e && (e.shortMessage || e.details || e.message)) || e);
        if (attempt >= 4 || !/nonce/i.test(why)) throw e;
        msg(t("waiting"));
        await sleep(3000 * (attempt + 1));
      }
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

  // a payment from another chain: Relay delivers on Robinhood a few seconds after the wallet's transaction
  async function delivered(q) {
    const id = q.steps && q.steps[0] && q.steps[0].requestId;
    if (!id) return "unknown";
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch(API + "/intents/status/v2?requestId=" + id);
        const s = (await r.json()).status;
        if (s === "success" || s === "failure" || s === "refund") return s;
      } catch (e) { /* the next try */ }
      await sleep(4000);
    }
    return "pending";
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
      loadBalance();
      return true;
    }
    if (!window.ethereum) { msg(t("noWallet"), "err"); return false; }
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) || [];
    if (!accs.length) return false;
    wallet = accs[0];
    label();
    loadBalance();
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
      const from = origin();
      if (!acct) await ensureChain(from);              // the shared wallet kit switches chains itself
      msg(t("quoting"));
      const q = await getQuote(wallet, pay, amount);  // a fresh quote for this wallet
      show(q, pay);
      const txs = await checked(q, pay, amount);
      let last = null;
      for (let i = 0; i < txs.length; i++) {
        if (i > 0) await sleep(2500);                    // let the wallet's node see the approve before the swap
        msg(t("confirm", { n: i + 1, of: txs.length }));
        last = await sendStep(txs[i], from);
        msg(t("waiting"));
        if (acct) {
          await acct.mined(last, from);                 // throws if it reverted
        } else {
          const r = await receipt(last);
          if (r.status !== "0x1") throw new Error("the transaction failed");
        }
      }
      if (from !== CHAIN) {                            // Relay brings it over to Robinhood Chain
        msg(t("arriving"));
        const s = await delivered(q);
        if (s === "failure" || s === "refund") throw new Error(t("notDelivered"));
        msg(s === "success" ? t("done") : t("arrivingSoon"), "ok", ORIGINS[from].explorer + "/tx/" + last);
      } else {
        msg(t("done"), "ok", EXPLORER + "/tx/" + last);
      }
      loadBalance();
    } catch (e) {
      const why = acct ? acct.errorText(e) : (e && e.message) || String(e);
      const cancelled = (e && (e.code === 4001 || (e.cause && e.cause.code === 4001))) || /rejected|denied|cancel/i.test(why);
      msg(cancelled ? t("cancelled") : t("failed", { why }), "err");
    } finally {
      busy = false;
      $("buy-go").disabled = false;
    }
  }

  function showRoute() {
    const box = $("buy-route");
    if (box) {
      box.hidden = !routable();
      for (const b of box.querySelectorAll("[data-route]")) b.setAttribute("aria-checked", String(b.dataset.route === route));
    }
    $("buy-fee").textContent = route === "giga" && routable() ? t("noFee") : t("fee", { pct: fmt(FEE_BPS / 100, 2) });
  }

  function start() {
    $("buy-amount").addEventListener("input", refresh);
    for (const b of document.querySelectorAll("#buy-route [data-route]")) {
      b.addEventListener("click", () => { route = b.dataset.route; showRoute(); refresh(); });
    }
    const sym = () => { $("buy-paysym").textContent = selling() ? "FLYAI" : $("buy-pay").value; };
    $("buy-pay").addEventListener("change", () => { sym(); showRoute(); refresh(); loadBalance(); });
    // the chain paid on: its own coins (USDC instead of USDG away from Robinhood), buying only
    const fillPay = () => {
      const keep = $("buy-pay").value;
      const syms = Object.keys(ORIGINS[origin()].pay);
      $("buy-pay").innerHTML = syms.map((s) => '<option value="' + s + '">' + s + "</option>").join("");
      $("buy-pay").value = syms.includes(keep) ? keep : keep === "USDG" || keep === "USDC" ? syms[0] : "ETH";
      if (away() && $("buy-dir").value === "sell") $("buy-dir").value = "buy";
      $("buy-dir").querySelector('option[value="sell"]').disabled = away();
    };
    if ($("buy-from")) $("buy-from").addEventListener("change", () => { fillPay(); sym(); showRoute(); label(); refresh(); loadBalance(); });
    for (const b of document.querySelectorAll("#buy [data-pct]")) b.addEventListener("click", () => usePct(Number(b.dataset.pct)));
    $("buy-dir").addEventListener("change", () => {
      const sell = selling();
      $("buy-amount").value = sell ? "100000" : "25";
      $("buy-with").textContent = sell ? t("for") : t("with");
      sym();
      label();
      refresh();
      loadBalance();
    });
    sym();
    $("buy-go").addEventListener("click", buy);
    // signed in already (the nav's session): show Buy at once, then follow sign-ins and sign-outs on any page/tab
    const s = window.flyNav && window.flyNav.session && window.flyNav.session();
    if (s && s.wallet) wallet = s.wallet;
    loadAcct().then((a) => { if (a) a.onAccount((w) => { wallet = w; label(); refresh(); loadBalance(); }); else label(); });
    label();
    loadBalance();
    showRoute();
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
