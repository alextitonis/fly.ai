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
 * Pay from any chain (2026-10-07): ETH or USDC on Base, Arbitrum or Ethereum (or BERA / USDC on Berachain) buys $FLYAI on
 * Robinhood Chain in one step -
 * Relay takes it on that chain and delivers on Robinhood (ORIGINS). The same checks run against Relay's contracts for
 * the chain paid on; the box follows the delivery (Relay's status) after the wallet's transaction.
 *
 * Our own GIGA DEX pool (2026-10-07, the user: "the Swapping to use this one without extra fees (as we take from
 * there)"): USDG <-> FLYAI is also quoted straight from our FLYAI/USDG pool on GIGA DEX (its QuoterV2); when it gives
 * more than Relay's quote (which carries our app fee), the box swaps there through GIGA's SmartRouter with no app fee -
 * we earn the pool's LP fee instead. Its two transactions are built here, to GIGA's router only: approve exactly the
 * amount paid (when the allowance is short), then exactInputSingle to the visitor's own wallet with a 1% floor.
 */
/*
 * The buy flow (2026-10-27, the buy-flow plan):
 *  - the direct route (assets/route.js): USDG / ETH / NVDA -> NVDA -> $FLYAI through Pons' v4 pool in one Universal
 *    Router call, our 0.25% fee inside it. Best price compares it with Relay and our GIGA pool and takes whichever
 *    gives the most $FLYAI; a USDG buy that would need new Permit2 approvals takes it only when it's DIRECT_EDGE_BPS
 *    better (an extra signature costs buyers more than a hair of price). NVDA (Relay has none) only goes direct.
 *  - gas on the chain paid from: USDC from Base / Arbitrum / Ethereum with too little coin there for gas goes through
 *    Relay's gasless permit (one signature, no transaction) when Relay offers it; otherwise the box says so before
 *    the click.
 *  - every step is logged to mine /api/swaplog (quote, route, approved, sent, success / failed and why), and a buy
 *    that went through fires "flyai:bought" (assets/buyweek.js redraws the "You're in" card).
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
    // $FLYAI's main pair (Pons' FLYAI/NVDA pool): buying only, through the direct route (Relay has no NVDA)
    NVDA: { address: "0xd0601ce157dB5bDc3162BBAc2A2c8Af5320d9eEC", decimals: 18 },
  };
  const FLY = { address: FLYAI, decimals: 18 };
  const DIRECT_ONLY = ["NVDA"];
  const DIRECT_EDGE_BPS = 30n;                          // a USDG buy needing new approvals goes direct only this much better
  const MINE = (window.flyNav && window.flyNav.MINE_API) || "https://flyai-mine.fly.dev";
  // gas on the chain paid from (wei): under this a USDC payment there needs Relay's gasless permit, or coin first
  const GAS_MIN = { 8453: 3n * 10n ** 13n, 42161: 3n * 10n ** 13n, 1: 6n * 10n ** 14n, 80094: 10n ** 16n };
  const CHAIN_NAMES = { 8453: "Base", 42161: "Arbitrum", 1: "Ethereum", 80094: "Berachain" };
  // the chains a visitor can pay from: their coin and their USDC (public RPCs for the balance line)
  const ORIGINS = {
    4663: { rpc: RPC, explorer: EXPLORER, pay: PAY },
    8453: { rpc: "https://mainnet.base.org", explorer: "https://basescan.org",
            pay: { USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }, ETH: PAY.ETH } },
    42161: { rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io",
             pay: { USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 }, ETH: PAY.ETH } },
    1: { rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io",
         pay: { USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 }, ETH: PAY.ETH } },
    // 2026-10-07 (the user: buy with BERA from Berachain): its coin is BERA, not ETH; Relay quotes both into $FLYAI
    80094: { rpc: "https://rpc.berachain.com", explorer: "https://berascan.com",
             pay: { BERA: { address: "0x0000000000000000000000000000000000000000", decimals: 18 },
                    USDC: { address: "0x549943e04f40284185054145c6e4e9568c1d3241", decimals: 6 } },
             add: { chainName: "Berachain", rpcUrls: ["https://rpc.berachain.com"], blockExplorerUrls: ["https://berascan.com"],
                    nativeCurrency: { name: "BERA", symbol: "BERA", decimals: 18 } } },
  };
  const NATIVE_SYMS = ["ETH", "BERA"];                  // a chain's own coin: no approve, its balance by eth_getBalance
  const isNative = (sym) => NATIVE_SYMS.includes(sym);
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
  async function relayQuote(user, tin, tout, amount, origin, usePermit) {
    const r = await fetch(API + "/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user, recipient: user, originChainId: origin || CHAIN, destinationChainId: CHAIN,
        originCurrency: tin, destinationCurrency: tout, amount: amount.toString(),
        tradeType: "EXACT_INPUT", appFees: [{ recipient: FEE_TO, fee: String(FEE_BPS) }],
        // gasless (2026-10-27): the token's own permit (EIP-3009 / 2612) signed instead of an approve + deposit
        ...(usePermit ? { usePermit: true } : {}),
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
      if (step.kind === "signature" && q.gasless) {        // the gasless permit: checked here, signed in buy()
        for (const it of step.items || []) {
          const sg = (it.data || {}).sign || {}, post = (it.data || {}).post || {}, v = sg.value || {};
          if (sg.signatureKind !== "eip712" || Number((sg.domain || {}).chainId) !== origin ||
              String((sg.domain || {}).verifyingContract || "").toLowerCase() !== tokenIn ||
              !calls.has(String(v.to || v.spender || "").toLowerCase()) || BigInt(v.value || 0) > amount ||
              !/^\/execute\/permits/.test(String(post.endpoint || ""))) throw new Error("an unexpected signature request");
          txs.push({ sign: sg, post });
        }
        continue;
      }
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

  function msg(text, kind, link, help) {
    const el = $("buy-msg");
    el.textContent = text || "";
    el.dataset.kind = kind || "";
    if (link || help) {
      const a = document.createElement("a");
      a.href = link || help; a.target = "_blank"; a.rel = "noopener"; a.textContent = " " + t(link ? "viewTx" : "gasHelp");
      el.appendChild(a);
    }
  }

  // ---- where visitors give up (the buy-flow plan step 5): one row a step to mine, nothing personal but the wallet ----
  const SESSION = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const PAGE = (location.pathname.replace(/^\/|\.html$|\/$/g, "") || "home").replace(/[^a-z]/g, "").slice(0, 16) || "home";
  let quoted = false;
  function routeOf(q) { return !q ? null : q.via === "direct" ? "direct" : q.via === "giga" ? "giga" : q.gasless ? "gasless" : "relay"; }
  function track(step, q, pay, amount, reason) {
    if (step === "quote") { if (quoted) return; quoted = true; }   // the first quote of a visit is enough
    let usd = null;
    try {
      const sym = sides(pay)[2];
      if (amount && (sym === "USDG" || sym === "USDC")) usd = Number(decimalOf(amount, 6, 2));
    } catch (e) { /* no amount */ }
    const body = { session: SESSION, step, wallet: wallet || null, route: routeOf(q), pay: sides(pay || "USDG")[2], chain: origin(),
                   usd, reason: reason ? String(reason).slice(0, 160) : null, page: PAGE };
    try {
      fetch(MINE + "/api/swaplog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        keepalive: true }).catch(() => {});
    } catch (e) { /* never in the buyer's way */ }
  }

  function units(amount, decimals) {                    // "12.5" -> 12500000n (no float rounding)
    const [i, f = ""] = String(amount).trim().split(".");
    if (!/^\d*$/.test(i) || !/^\d*$/.test(f) || (i === "" && f === "")) return null;
    return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  }

  // the better of Relay (our 0.25% app fee in it) and our own GIGA pool (no app fee), for what the visitor gets
  /** The paying wallet's coin on the chain paid from is under what its gas needs (USDC payments only). */
  async function gasLow(user, symIn) {
    if (!away() || isNative(symIn) || !user || user === PREVIEW_USER || !GAS_MIN[origin()]) return false;
    try { return BigInt(await rpc("eth_getBalance", [user, "latest"], ORIGINS[origin()].rpc)) < GAS_MIN[origin()]; }
    catch (e) { return false; }
  }

  // does a direct buy with this token need new approvals (Permit2) from this wallet? (no wallet yet: assume it does)
  async function directSetup(user, q) {
    if (q.sym === "ETH" || !user || user === PREVIEW_USER) return q.sym !== "ETH";
    try { return (await window.flyRoute.txs(user, q.plan)).length > 1; } catch (e) { return true; }
  }

  async function getQuote(user, pay, amount) {
    const [tin, tout, symIn] = sides(pay);
    if (away()) {                                   // Relay brings it over; with no gas there, its gasless permit
      if (await gasLow(user, symIn)) {
        const g = await relayQuote(user, tin.address, tout.address, amount, origin(), true).catch(() => null);
        if (g && g.steps && g.steps.some((s) => s.kind === "signature")) { g.gasless = true; return g; }
        const q = await relayQuote(user, tin.address, tout.address, amount, origin());
        q.gasLow = true;
        return q;
      }
      return relayQuote(user, tin.address, tout.address, amount, origin());
    }
    if (route === "giga" && routable()) {
      const out = await gigaQuote(tin.address, tout.address, amount);
      if (!(out > 0n)) throw new Error("no quote");
      return { via: "giga", out, amount, tin: tin.address, tout: tout.address, relay: null };
    }
    const direct = !selling() && window.flyRoute ? window.flyRoute.quote(symIn, amount).catch(() => null) : Promise.resolve(null);
    if (DIRECT_ONLY.includes(symIn)) {
      const d = await direct;
      if (!d) throw new Error("no quote");
      return { via: "direct", out: d.out, amount, plan: d, impact: d.impact };
    }
    const [rq, gq, dq] = await Promise.all([
      relayQuote(user, tin.address, tout.address, amount).catch((e) => e),
      gigaPair(tin.address, tout.address) ? gigaQuote(tin.address, tout.address, amount).catch(() => 0n) : Promise.resolve(0n),
      direct,
    ]);
    const relayOut = rq instanceof Error ? 0n : BigInt(rq.details.currencyOut.amount || 0);
    // every route's amount rides along so the box can show the visitor what each gives (2026-10-13 review: "doesn't
    // clearly compare the final amount received")
    const all = { giga: gq, relay: relayOut, direct: dq ? dq.out : 0n };
    const both = [all.giga, all.relay, all.direct].filter((x) => x > 0n).length > 1 ? all : null;
    // the direct route wins on more $FLYAI; with new approvals to sign first, only by DIRECT_EDGE_BPS or more
    const edge = dq && (await directSetup(user, { sym: symIn, plan: dq })) ? DIRECT_EDGE_BPS : 0n;
    const rival = gq > relayOut ? gq : relayOut;
    if (dq && dq.out * 10000n >= rival * (10000n + edge) && dq.out > 0n) {
      return { via: "direct", out: dq.out, amount, plan: dq, impact: dq.impact, both };
    }
    if (gq > 0n && gq >= relayOut) return { via: "giga", out: gq, amount, tin: tin.address, tout: tout.address, relay: rq instanceof Error ? null : rq, both };
    if (rq instanceof Error) throw rq;
    rq.both = both;
    return rq;
  }
  const checked = async (q, pay, amount) => {
    if (q.via === "direct") return window.flyRoute.check(await window.flyRoute.txs(wallet, q.plan), q.plan)
      .map((t) => ({ to: t.to, data: t.data, value: t.value, kind: t.kind }));
    if (q.via === "giga") return gigaTxs(wallet, q.tin, q.tout, amount, q.out);
    const [tin, , symIn] = sides(pay);
    return relayCheck(q, tin.address, isNative(symIn), amount, origin());
  };

  // the fee line follows the route this quote really takes (Best price can land on either)
  const feeText = (q) => (q && q.via === "giga" ? t("noFee") : t("fee", { pct: fmt(FEE_BPS / 100, 2) }));
  function compareLine(q, pay) {
    if (!q.both) return "";
    const [, tout, , sym] = sides(pay), d = sym === "FLYAI" ? 0 : 2;
    const amt = (raw) => fmt(Number(decimalOf(raw, tout.decimals, 8)), d) + " " + (sym === "FLYAI" ? "$FLYAI" : sym);
    // each route that quoted, what it gives (the direct route and Relay with our fee in, our GIGA pool without)
    return [["direct", "cmpDirect"], ["relay", "cmpRelay"], ["giga", "cmpGiga"]]
      .filter(([k]) => q.both[k] > 0n).map(([k, s]) => t(s, { amt: amt(q.both[k]) })).join(" · ");
  }

  function show(q, pay) {
    $("buy-fee").textContent = feeText(q);
    const cmp = $("buy-compare");                    // only token.html has the Best-price comparison line
    if (cmp) cmp.textContent = compareLine(q, pay);
    if (q.via === "direct") {                        // "You get X FLYAI · price impact Y% · route: direct"
      $("buy-out").textContent = fmt(Number(decimalOf(q.out, 18, 2)), 0) + " $FLYAI";
      $("buy-detail").textContent = t("detailDirect", { impact: q.impact == null ? "-" : fmt(q.impact, 2) });
      return;
    }
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
    $("buy-out").textContent = fmt(got, sym === "FLYAI" ? 0 : isNative(sym) ? 6 : 2) + " " + (sym === "FLYAI" ? "$FLYAI" : sym);
    const fee = (q.fees && q.fees.app && Number(q.fees.app.amountUsd)) || 0;
    const imp = q.details.totalImpact && Number(q.details.totalImpact.percent);
    $("buy-detail").textContent = t("detail", {
      usd: fmt(Number(out.amountUsd || 0), 2), fee: fmt(fee, 2),
      impact: imp == null || isNaN(imp) ? "-" : fmt(Math.abs(imp), 2),
    }) + " · " + t(q.gasless ? "routeGasless" : "routeRelay");
    // no gas on the chain paid from, and no gasless way there: say so before the click
    if (q.gasLow) msg(t("gasLow", { chain: CHAIN_NAMES[origin()] || "", coin: Object.keys(ORIGINS[origin()].pay).find(isNative) || "ETH" }), "err", null, GAS_HELP);
  }
  const GAS_HELP = "https://relay.link/bridge";

  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const pay = $("buy-pay").value, amount = units($("buy-amount").value, sides(pay)[0].decimals);
      quote = null;
      $("buy-out").textContent = "–";
      $("buy-detail").textContent = "";
      if ($("buy-compare")) $("buy-compare").textContent = "";
      if (!amount || amount <= 0n) return;
      const key = $("buy-dir").value + ":" + pay + ":" + amount + ":" + route + ":" + origin();
      quoteFor = key;
      try {
        const q = await getQuote(wallet || PREVIEW_USER, pay, amount);
        if (quoteFor !== key) return;                  // the amount changed meanwhile
        quote = q;
        msg("");
        show(q, pay);
        track("quote", q, pay, amount);
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
      const raw = isNative(symIn)
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
    if (bal == null) return;
    const line = t("balance", { amt: compact(bal, tin.decimals) + " " + symIn });
    $("buy-bal").textContent = line;
    // FLYAI staked in FlyStaking isn't in the wallet's balance (no receipt token): say it beside it (staked.js)
    if (symIn !== "FLYAI" || !window.flyStaked) return;
    const who = wallet;
    window.flyStaked(who).then((st) => {
      const note = window.flyStakedNote(st);
      if (note && who === wallet && sides($("buy-pay").value)[2] === "FLYAI") $("buy-bal").textContent = line + " " + note;
    });
  }

  function usePct(pct) {
    if (bal == null) return;
    const [tin, , symIn] = sides($("buy-pay").value);
    let amt = bal * BigInt(pct) / 100n;
    if (isNative(symIn) && pct === 100) amt = amt > GAS_KEEP ? amt - GAS_KEEP : 0n;
    $("buy-amount").value = decimalOf(amt, tin.decimals, symIn === "USDG" || symIn === "USDC" ? 6 : isNative(symIn) ? 8 : 4);
    refresh();
  }

  async function ensureChain(id) {
    const eth = window.ethereum, hex = "0x" + (id || CHAIN).toString(16);
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() === hex) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      if (e && e.code !== 4902) throw e;
      const extra = (ORIGINS[id] || {}).add;           // Berachain may be missing from a wallet; Base/Arbitrum/Ethereum aren't
      if (hex !== CHAIN_HEX && !extra) throw e;
      await eth.request({ method: "wallet_addEthereumChain", params: [hex === CHAIN_HEX ? {
        chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } } : { chainId: hex, ...extra }] });
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
    // no wallet yet: always "Connect wallet" - the sign-in's picker has WalletConnect, so a browser without a wallet
    // extension can still connect from a phone (2026-10-13 review: "No wallet found" was a dead end on the button)
    $("buy-go").textContent = !wallet ? t("connect") : selling() ? t("sell") : t("buy");
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
    let q = null;
    try {
      const from = origin();
      if (!acct) await ensureChain(from);              // the shared wallet kit switches chains itself
      msg(t("quoting"));
      q = await getQuote(wallet, pay, amount);        // a fresh quote for this wallet
      msg("");
      show(q, pay);
      if (q.gasLow) { track("gas_low", q, pay, amount, "no gas on " + from); return; }   // the box already says what's needed
      track("route", q, pay, amount);
      const txs = await checked(q, pay, amount);
      let last = null;
      for (let i = 0; i < txs.length; i++) {
        if (i > 0) await sleep(2500);                    // let the wallet's node see the approve before the swap
        msg(t("confirm", { n: i + 1, of: txs.length }));
        if (txs[i].sign) {                               // the gasless permit: a signature, posted to Relay
          const sg = txs[i].sign;
          const typed = { domain: sg.domain, types: sg.types, primaryType: sg.primaryType, message: sg.value };
          const sig = acct ? await acct.signTyped(typed)
            : await window.ethereum.request({ method: "eth_signTypedData_v4", params: [wallet, JSON.stringify({
              ...typed, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" },
                { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], ...sg.types } })] });
          const p = txs[i].post;
          const r = await fetch(API + p.endpoint + (p.endpoint.includes("?") ? "&" : "?") + "signature=" + sig, {
            method: p.method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.body || {}) });
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).message) || "Relay refused the signature");
          track("sent", q, pay, amount);
          continue;
        }
        last = await sendStep(txs[i], from);
        track(i < txs.length - 1 ? "approved" : "sent", q, pay, amount);
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
        msg(s === "success" ? t("done") : t("arrivingSoon"), "ok", last ? ORIGINS[from].explorer + "/tx/" + last : null);
      } else {
        msg(t("done"), "ok", EXPLORER + "/tx/" + last);
      }
      track("success", q, pay, amount);
      if (!selling()) window.dispatchEvent(new CustomEvent("flyai:bought", { detail: { wallet } }));
      loadBalance();
    } catch (e) {
      const why = acct ? acct.errorText(e) : (e && e.message) || String(e);
      const cancelled = (e && (e.code === 4001 || (e.cause && e.cause.code === 4001))) || /rejected|denied|cancel/i.test(why);
      track(cancelled ? "cancelled" : "failed", q, pay, amount, why);
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
    // 2026-10-16 brief ("explain the fee and routing consequence beside each option, before the visitor commits"):
    // with a choice, each route card carries its own note; without one, this line says Relay routes it and its fee
    const help = $("buy-routehelp");
    // on Robinhood every quote's own line says its route (direct / Relay / GIGA, 2026-10-27): the note is for other chains
    if (help) help.hidden = !away();
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
      $("buy-pay").value = syms.includes(keep) ? keep
        : keep === "USDG" || keep === "USDC" ? (syms.find((s) => s === "USDC") || syms[0]) : (syms.find(isNative) || syms[0]);
      if (away() && $("buy-dir").value === "sell") $("buy-dir").value = "buy";
      $("buy-dir").querySelector('option[value="sell"]').disabled = away();
    };
    if ($("buy-from")) $("buy-from").addEventListener("change", () => { fillPay(); sym(); showRoute(); label(); refresh(); loadBalance(); });
    for (const b of document.querySelectorAll("#buy [data-pct]")) b.addEventListener("click", () => usePct(Number(b.dataset.pct)));
    // NVDA is buying only (the direct route); selling into it isn't offered
    const directOnly = () => {
      for (const o of $("buy-pay").options) if (DIRECT_ONLY.includes(o.value)) o.disabled = selling();
      if (selling() && DIRECT_ONLY.includes($("buy-pay").value)) $("buy-pay").value = "USDG";
    };
    $("buy-dir").addEventListener("change", () => {
      directOnly();
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
