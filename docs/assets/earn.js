/**
 * Earn (docs/earn.html; plan: flytrade/EARN-PAGE-PLAN.md, 2026-10-06). Anyone lends USDG from their own wallet into
 * the two allow-listed ERC-4626 vaults on Robinhood Chain (Steakhouse USDG on Morpho, Spark Savings USDG). Nothing of
 * ours ever holds the money: the vault shares are minted to the visitor's own wallet.
 *
 * The 1% fee (FEE_BPS, to FEE_TO, the swap box's dev wallet) is a plain USDG transfer from the visitor's wallet in the
 * same flow, in the order approve(exact amount - fee) -> deposit(amount - fee, receiver = you) -> fee. A wallet that
 * supports EIP-5792 batches (wallet_sendCalls, atomic) signs all three at once; otherwise three prompts, and a skipped
 * fee is only re-offered, never enforced. Withdrawals are free and NOTHING of ours ever blocks them (a pause only
 * stops new deposits).
 *
 * Every call is checked before the wallet is asked (checkDeposit / checkWithdraw, like buy.js check_steps): Robinhood
 * Chain, `to` is USDG or an allow-listed vault, the approve is to that vault for exactly amount - fee, the fee is
 * exactly 1% to FEE_TO, receiver/owner = the connected wallet, the vault's asset() is USDG, and (Spark only)
 * amount - fee <= maxDeposit(you). Steakhouse is a Morpho VaultV2: its max* functions return 0 while deposits land,
 * so they are never read for it.
 *
 * Reads: the public Robinhood RPC (Multicall3) + Morpho's API + DefiLlama, only while the page is visible, cached
 * 5 minutes, never polled faster. The pure functions at the top are exported for node tests (module.exports).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure core (no DOM, no network) ----------------
  const CHAIN = 4663;
  const CHAIN_HEX = "0x1237";
  const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const USDG_DECIMALS = 6;
  const FEE_TO = "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea";
  const FEE_BPS = 100n;                                   // 1%
  const MIN_DEPOSIT = 1000000n;                           // 1 USDG
  const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";   // Multicall3, deployed on 4663 (checked 2026-10-06)
  // The allow-list lives HERE, not in earn-venues.json: the JSON can pause or describe a venue, never add one.
  // checkMaxDeposit: Spark only. Steakhouse's VaultV2 maxDeposit returns 0 while deposits land (LENDING-NOTES.md).
  const ALLOWED = {
    "0xbeeff033f34c046626b8d0a041844c5d1a5409dd": { id: "steakhouse", kind: "morpho-v2", shareDecimals: 18, checkMaxDeposit: false },
    "0xde770c84fe66e063336b31737cfe9790f18c4087": { id: "spark", kind: "spark", shareDecimals: 6, checkMaxDeposit: true },
  };
  const SEL = {
    approve: "0x095ea7b3", transfer: "0xa9059cbb", deposit: "0x6e553f65", redeem: "0xba087652", withdraw: "0xb460af94",
    balanceOf: "0x70a08231", convertToAssets: "0x07a2d13a", maxDeposit: "0x402d267d", maxWithdraw: "0xce96cb77",
    asset: "0x38d52e0f", totalAssets: "0x01e1d114", vsr: "0x1e7b14d3", aggregate3: "0x82ad56cb",
  };
  const TOPIC_DEPOSIT = "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7";   // Deposit(address,address,uint256,uint256)
  const TOPIC_WITHDRAW = "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db";  // Withdraw(address,address,address,uint256,uint256)
  const MAX_U256 = (1n << 256n) - 1n;

  const isAddr = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
  const same = (a, b) => isAddr(a) && isAddr(b) && a.toLowerCase() === b.toLowerCase();
  function addrWord(a) {
    if (!isAddr(a)) throw new Error("bad address " + a);
    return a.slice(2).toLowerCase().padStart(64, "0");
  }
  function uintWord(n) {
    n = BigInt(n);
    if (n < 0n || n > MAX_U256) throw new Error("bad uint " + n);
    return n.toString(16).padStart(64, "0");
  }
  const call = (sel, ...words) => sel + words.join("");
  const enc = {
    approve: (spender, amt) => call(SEL.approve, addrWord(spender), uintWord(amt)),
    transfer: (to, amt) => call(SEL.transfer, addrWord(to), uintWord(amt)),
    deposit: (assets, receiver) => call(SEL.deposit, uintWord(assets), addrWord(receiver)),
    redeem: (shares, receiver, owner) => call(SEL.redeem, uintWord(shares), addrWord(receiver), addrWord(owner)),
    withdraw: (assets, receiver, owner) => call(SEL.withdraw, uintWord(assets), addrWord(receiver), addrWord(owner)),
    balanceOf: (who) => call(SEL.balanceOf, addrWord(who)),
    convertToAssets: (shares) => call(SEL.convertToAssets, uintWord(shares)),
    maxDeposit: (who) => call(SEL.maxDeposit, addrWord(who)),
    maxWithdraw: (who) => call(SEL.maxWithdraw, addrWord(who)),
  };

  /** "0x<sel><words>" -> { sel, words: [bigint] }; refuses anything that isn't whole 32-byte words. */
  function decodeCall(data) {
    if (typeof data !== "string" || !/^0x[0-9a-fA-F]{8}([0-9a-fA-F]{64})*$/.test(data)) throw new Error("malformed calldata");
    const words = [];
    for (let i = 10; i < data.length; i += 64) words.push(BigInt("0x" + data.slice(i, i + 64)));
    return { sel: data.slice(0, 10).toLowerCase(), words };
  }
  function wordAddr(w) {                                  // a word that must hold an address (upper 12 bytes zero)
    if (w >> 160n) throw new Error("dirty address word");
    return "0x" + w.toString(16).padStart(40, "0");
  }

  /** "12.5" -> 12500000n (no float rounding); null if not a plain decimal or more decimals than the token has. */
  function units(amount, decimals) {
    const s = String(amount == null ? "" : amount).trim().replace(/,/g, "");
    const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[1] === "" && !m[2])) return null;
    const f = m[2] || "";
    if (f.length > decimals && /[1-9]/.test(f.slice(decimals))) return null;
    return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  }
  function decimalOf(raw, decimals, maxFrac) {           // 1234500000n, 6 -> "1234.5" (exact, trimmed)
    raw = BigInt(raw);
    const neg = raw < 0n, v = neg ? -raw : raw, one = 10n ** BigInt(decimals);
    const frac = (v % one).toString().padStart(decimals, "0").slice(0, maxFrac == null ? decimals : maxFrac).replace(/0+$/, "");
    return (neg ? "-" : "") + (v / one).toString() + (frac ? "." + frac : "");
  }

  /** The fee in USDG base units: amount x 100 / 10_000, rounded down. */
  const feeOf = (amount) => (BigInt(amount) * FEE_BPS) / 10000n;
  const vaultOf = (address) => (isAddr(address) ? ALLOWED[address.toLowerCase()] || null : null);

  /** The three calls of a deposit, in the chosen order: approve (exact) -> deposit (receiver = user) -> fee. */
  function buildDeposit({ vault, amount, user }) {
    amount = BigInt(amount);
    if (!vaultOf(vault)) throw new Error("vault not allow-listed");
    if (!isAddr(user) || /^0x0{40}$/.test(user)) throw new Error("no wallet");
    if (amount < MIN_DEPOSIT) throw new Error("below the minimum");
    const fee = feeOf(amount), net = amount - fee;
    return {
      fee, net,
      calls: [
        { to: USDG, data: enc.approve(vault, net), value: "0x0" },
        { to: vault, data: enc.deposit(net, user), value: "0x0" },
        { to: USDG, data: enc.transfer(FEE_TO, fee), value: "0x0" },
      ],
    };
  }

  function checkValueAndTarget(c) {
    if (c.value != null && BigInt(c.value) !== 0n) throw new Error("a call sends coin");
    if (!isAddr(c.to) || !(same(c.to, USDG) || vaultOf(c.to))) throw new Error("a call to " + c.to + ", not USDG or an allow-listed vault");
  }

  /** Throws unless `calls` is exactly approve -> deposit -> fee for this vault, amount and user. Returns { fee, net }. */
  function checkDeposit(calls, { vault, amount, user, chainId }) {
    amount = BigInt(amount);
    if (chainId != null && Number(chainId) !== CHAIN) throw new Error("not Robinhood Chain");
    if (!vaultOf(vault)) throw new Error("vault not allow-listed");
    if (!isAddr(user) || /^0x0{40}$/.test(user)) throw new Error("no wallet");
    if (amount < MIN_DEPOSIT) throw new Error("below the minimum");
    if (!Array.isArray(calls) || calls.length !== 3) throw new Error("expected 3 calls");
    const fee = feeOf(amount), net = amount - fee;
    calls.forEach(checkValueAndTarget);
    const [a, d, f] = calls.map((c) => ({ to: c.to, ...decodeCall(c.data) }));
    if (!same(a.to, USDG) || a.sel !== SEL.approve || a.words.length !== 2) throw new Error("call 1 is not a USDG approve");
    if (!same(wordAddr(a.words[0]), vault)) throw new Error("approve spender is not the vault");
    if (a.words[1] !== net) throw new Error("approve amount is not exactly amount - fee");
    if (!same(d.to, vault) || d.sel !== SEL.deposit || d.words.length !== 2) throw new Error("call 2 is not a deposit into the vault");
    if (d.words[0] !== net) throw new Error("deposit amount is not amount - fee");
    if (!same(wordAddr(d.words[1]), user)) throw new Error("deposit receiver is not your wallet");
    if (!same(f.to, USDG) || f.sel !== SEL.transfer || f.words.length !== 2) throw new Error("call 3 is not a USDG transfer");
    if (!same(wordAddr(f.words[0]), FEE_TO)) throw new Error("fee recipient is not the fly.ai fee wallet");
    if (f.words[1] !== fee) throw new Error("fee is not exactly 1%");
    if (fee + net !== amount) throw new Error("fee + deposit != amount");
    return { fee, net };
  }

  /** A withdraw: redeem(shares) for "all", withdraw(assets) for part; receiver = owner = user, no fee. */
  function buildWithdraw({ vault, user, shares, assets }) {
    if (!vaultOf(vault)) throw new Error("vault not allow-listed");
    if (shares != null) return { to: vault, data: enc.redeem(shares, user, user), value: "0x0" };
    return { to: vault, data: enc.withdraw(assets, user, user), value: "0x0" };
  }
  function checkWithdraw(c, { vault, user }) {
    checkValueAndTarget(c);
    if (!vaultOf(vault) || !same(c.to, vault)) throw new Error("not the chosen vault");
    const x = decodeCall(c.data);
    if ((x.sel !== SEL.redeem && x.sel !== SEL.withdraw) || x.words.length !== 3) throw new Error("not a redeem/withdraw");
    if (x.words[0] <= 0n) throw new Error("nothing to withdraw");
    if (!same(wordAddr(x.words[1]), user)) throw new Error("receiver is not your wallet");
    if (!same(wordAddr(x.words[2]), user)) throw new Error("owner is not your wallet");
    return x;
  }
  /** The fee alone (re-offered when the third prompt was skipped). */
  function checkFeeOnly(c, fee) {
    checkValueAndTarget(c);
    const x = decodeCall(c.data);
    if (!same(c.to, USDG) || x.sel !== SEL.transfer || !same(wordAddr(x.words[0]), FEE_TO) || x.words[1] !== BigInt(fee)) throw new Error("not the fee transfer");
  }

  // Multicall3.aggregate3((address target, bool allowFailure, bytes callData)[]) -> (bool success, bytes returnData)[]
  function encodeAggregate3(calls) {
    const n = calls.length;
    const tuples = calls.map(({ target, data }) => {
      const hex = data.slice(2), len = hex.length / 2, padded = hex.padEnd(Math.ceil(len / 32) * 64, "0");
      return addrWord(target) + uintWord(1) + uintWord(0x60) + uintWord(len) + padded;
    });
    let off = 32 * n, heads = "";
    for (const t of tuples) { heads += uintWord(off); off += t.length / 2; }
    return SEL.aggregate3 + uintWord(0x20) + uintWord(n) + heads + tuples.join("");
  }
  function decodeAggregate3(ret) {
    const h = ret.slice(2), word = (i) => BigInt("0x" + h.slice(i * 2, i * 2 + 64));
    const base = Number(word(0)), n = Number(word(base)), start = base + 32, out = [];
    for (let k = 0; k < n; k++) {
      const t = start + Number(word(start + 32 * k));
      const ok = word(t) === 1n, dOff = t + Number(word(t + 32)), len = Number(word(dOff));
      out.push({ ok, data: "0x" + h.slice((dOff + 32) * 2, (dOff + 32 + len) * 2) });
    }
    return out;
  }

  const YEAR = 365 * 86400;
  /** Spark's vault savings rate (per-second, ray) -> APY. */
  function apyFromVsr(vsr) {
    const x = Number(BigInt(vsr) - 10n ** 27n) / 1e27;
    return Math.expm1(YEAR * Math.log1p(x));
  }
  /** Share-price growth p0 -> p1 over `seconds` -> APY. */
  const apyFromPrices = (p0, p1, seconds) => (p0 > 0 && p1 > 0 && seconds > 0 ? Math.pow(p1 / p0, YEAR / seconds) - 1 : null);
  /** How many months of interest the 1% fee equals at `rate` (an APY, e.g. 0.039). */
  const feeMonths = (rate) => (rate > 0 ? Math.max(1, Math.round((Number(FEE_BPS) / 10000 / rate) * 12)) : null);

  /**
   * Why a venue's deposits are paused (empty = open). Withdrawals are never paused.
   * s: { manual, readOk, priceNow, priceRef, liquidityUsd, tvlNow, tvlMax24h }; rules from earn-venues.json.
   */
  function pauseReasons(s, rules) {
    const r = Object.assign({ sharePriceDropPct: 0.01, minLiquidityUsd: 5e6, tvlDrop24hPct: 20 }, rules || {});
    const why = [];
    if (s.manual) why.push("manual");
    if (!s.readOk) why.push("data");
    if (s.priceNow > 0 && s.priceRef > 0 && s.priceNow < s.priceRef * (1 - r.sharePriceDropPct / 100)) why.push("price");
    if (s.liquidityUsd == null || !(s.liquidityUsd >= r.minLiquidityUsd)) why.push("liquidity");
    if (s.tvlNow > 0 && s.tvlMax24h > 0 && s.tvlNow < s.tvlMax24h * (1 - r.tvlDrop24hPct / 100)) why.push("tvl");
    return why;
  }

  /** Net USDG put in from a wallet's Deposit (owner = user) and Withdraw (owner = user) logs. */
  function netFromLogs(logs, user) {
    let dep = 0n, wd = 0n;
    const u = addrWord(user);
    for (const l of logs || []) {
      const t = (l.topics || []).map((x) => String(x).toLowerCase().replace(/^0x/, ""));
      const assets = BigInt("0x" + String(l.data).slice(2, 66));
      if (t[0] === TOPIC_DEPOSIT.slice(2) && t[2] === u) dep += assets;
      else if (t[0] === TOPIC_WITHDRAW.slice(2) && t[3] === u) wd += assets;
    }
    return { dep, wd };
  }

  const core = {
    CHAIN, CHAIN_HEX, USDG, FEE_TO, FEE_BPS, MIN_DEPOSIT, MULTICALL, ALLOWED, SEL, TOPIC_DEPOSIT, TOPIC_WITHDRAW,
    units, decimalOf, feeOf, vaultOf, enc, decodeCall, buildDeposit, checkDeposit, buildWithdraw, checkWithdraw,
    checkFeeOnly, encodeAggregate3, decodeAggregate3, apyFromVsr, apyFromPrices, feeMonths, pauseReasons, netFromLogs,
  };
  if (typeof module === "object" && module.exports) { module.exports = core; return; }
  if (typeof document === "undefined") return;

  // ---------------------------------------------------------------- the page --------------------------------------
  const $ = (id) => document.getElementById(id);
  if (!$("earn")) return;

  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const EXPLORER = "https://robinhoodchain.blockscout.com";
  const MORPHO_API = "https://api.morpho.org/graphql";
  const LLAMA = "https://yields.llama.fi/chart/";
  const TTL = 5 * 60 * 1000;                              // reads are cached 5 minutes; nothing polls faster
  const LS = "flyai.earn.";
  const ACCOUNT_JS = "/compute/mine/web/account.js";
  const NS = "earn.";
  let acct = null;
  const loadAcct = () => (acct ? Promise.resolve(acct) : import(ACCOUNT_JS).then((m) => (acct = m)).catch(() => null));

  // ---- words ----
  let en = null;
  const pick = (o, k) => k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), o);
  function tr(key, vars) {
    if (window.flyI18n) return window.flyI18n.t(NS + key, vars);
    const v = pick(en, key);
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  }
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const fmt = (x, d) => new Intl.NumberFormat(lang(), { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }).format(x);
  const pct = (x) => (x == null || !isFinite(x) ? "–" : new Intl.NumberFormat(lang(), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(x * 100) + "%");
  const usd = (x) => (x == null || !isFinite(x) ? "–" : "$" + new Intl.NumberFormat(lang(), { notation: x >= 1e6 ? "compact" : "standard", maximumFractionDigits: x >= 1e6 ? 1 : 0 }).format(x));
  const usdgText = (raw, d) => fmt(Number(decimalOf(raw, USDG_DECIMALS, 6)), d == null ? 2 : d);

  // ---- storage (per browser; every access can throw in a private window) ----
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(LS + k) || "null"); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* this page only */ } };

  // ---- reads ----
  async function rpc(method, params) {
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.result;
  }
  async function rpcBatch(reqs) {                         // one HTTP request, many calls
    if (!reqs.length) return [];
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqs.map(([method, params], i) => ({ jsonrpc: "2.0", id: i, method, params }))) });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error((d && d.error && d.error.message) || "batch failed");
    const out = new Array(reqs.length);
    for (const x of d) out[x.id] = x;
    return out;
  }
  /** [{target, data}] -> [{ok, data}] via one Multicall3 eth_call; a JSON-RPC batch if that fails. */
  async function readMany(calls) {
    try {
      return decodeAggregate3(await rpc("eth_call", [{ to: MULTICALL, data: encodeAggregate3(calls) }, "latest"]));
    } catch (e) {
      const res = await rpcBatch(calls.map((c) => ["eth_call", [{ to: c.target, data: c.data }, "latest"]]));
      return res.map((x) => ({ ok: !!(x && x.result && x.result !== "0x"), data: (x && x.result) || "0x" }));
    }
  }
  const big = (r) => (r && r.ok && r.data && r.data.length >= 66 ? BigInt(r.data.slice(0, 66)) : null);
  const addrOf = (r) => (r && r.ok && r.data && r.data.length >= 66 ? "0x" + r.data.slice(26, 66) : null);

  async function morpho(address) {
    const now = Math.floor(Date.now() / 1000);
    const q = `{ vaultV2ByAddress(address:"${address}", chainId:${CHAIN}){ apy netApy netApyExcludingRewards totalAssetsUsd liquidity liquidityUsd sharePrice
      historicalState{ totalAssetsUsd(options:{startTimestamp:${now - 25 * 3600}, interval:HOUR}){ x y } sharePrice(options:{startTimestamp:${now - 31 * 86400}, interval:DAY}){ x y } } } }`;
    const r = await fetch(MORPHO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const d = await r.json();
    const v = d && d.data && d.data.vaultV2ByAddress;
    if (!v) throw new Error("morpho api");
    return v;
  }
  async function llama(pool) {
    const r = await fetch(LLAMA + pool);
    const d = await r.json();
    return (d && d.data) || [];
  }

  let config = null;                                      // earn-venues.json, filtered to the allow-list
  let venues = [];                                        // [{ cfg, meta, state }]
  let venuesAt = 0;

  /** Everything a venue card shows, and whether deposits are open. */
  async function readVenues() {
    const calls = [];
    for (const v of venues) {
      const a = v.cfg.address;
      v.idx = calls.length;
      calls.push({ target: a, data: SEL.asset }, { target: a, data: SEL.totalAssets },
        { target: a, data: enc.convertToAssets(10n ** BigInt(v.meta.shareDecimals)) });
      if (v.meta.kind === "spark") calls.push({ target: a, data: SEL.vsr }, { target: USDG, data: enc.balanceOf(a) });
    }
    const [chain, ...apis] = await Promise.allSettled([readMany(calls), ...venues.map((v) =>
      v.meta.kind === "morpho-v2" ? morpho(v.cfg.address).catch(() => llama(v.cfg.llamaPool).then((h) => ({ llama: h }))) : llama(v.cfg.llamaPool))]);
    const res = chain.status === "fulfilled" ? chain.value : null;
    const nowS = Date.now() / 1000;
    venues.forEach((v, i) => {
      const s = { readOk: false, manual: !!v.cfg.paused };
      const api = apis[i].status === "fulfilled" ? apis[i].value : null;
      if (res) {
        const r = res.slice(v.idx, v.idx + 5);
        const asset = addrOf(r[0]), ta = big(r[1]), px = big(r[2]);
        s.assetOk = same(asset, USDG);
        s.readOk = s.assetOk && ta != null && px != null && px > 0n;
        if (ta != null) s.tvlNow = Number(decimalOf(ta, USDG_DECIMALS, 2));
        if (px != null) s.priceNow = Number(px) / 1e6;
        if (v.meta.kind === "spark") {
          const vsr = big(r[3]), held = big(r[4]);
          if (vsr != null && vsr >= 10n ** 27n) s.rate = apyFromVsr(vsr);
          if (held != null) { s.liquidityRaw = held; s.liquidityUsd = Number(decimalOf(held, USDG_DECIMALS, 2)); }
        }
      }
      // price/TVL history: the API's, plus what this browser saw (kept 7 days)
      const hist = (lsGet("hist." + v.cfg.id) || []).filter((p) => nowS - p.t < 7 * 86400);
      let priceRef = 0, tvlMax24h = 0;
      for (const p of hist) { if (p.p > priceRef) priceRef = p.p; if (nowS - p.t < 86400 && p.v > tvlMax24h) tvlMax24h = p.v; }
      if (api && !api.llama && v.meta.kind === "morpho-v2") {
        s.rate = api.netApyExcludingRewards != null ? api.netApyExcludingRewards : api.apy;
        if (api.liquidity != null) { s.liquidityRaw = BigInt(Math.floor(Number(api.liquidity))); s.liquidityUsd = Number(api.liquidity) / 1e6; }
        const hs = api.historicalState || {};
        const sp = (hs.sharePrice || []).filter((p) => p.y > 0).sort((a, b) => a.x - b.x);
        for (const p of sp) if (nowS - p.x < 3 * 86400 && p.y > priceRef) priceRef = p.y;
        if (sp.length >= 2) s.avg30 = apyFromPrices(sp[0].y, s.priceNow || sp[sp.length - 1].y, nowS - sp[0].x);
        for (const p of hs.totalAssetsUsd || []) if (p.y > 0 && nowS - p.x <= 86400 && p.y > tvlMax24h) tvlMax24h = p.y;
      } else if (api) {
        const h = (api.llama || api).filter((p) => p && p.timestamp);
        const last30 = h.slice(-30).map((p) => p.apyBase != null ? p.apyBase : p.apy).filter((x) => x != null);
        if (last30.length) s.avg30 = last30.reduce((a, b) => a + b, 0) / last30.length / 100;
        if (s.rate == null && h.length) { const p = h[h.length - 1]; s.rate = (p.apyBase != null ? p.apyBase : p.apy) / 100; }
        for (const p of h.slice(-3)) { const t = Date.parse(p.timestamp) / 1000; if (nowS - t <= 26 * 3600 && p.tvlUsd > tvlMax24h) tvlMax24h = p.tvlUsd; }
      }
      if (s.avg30 == null) s.avg30 = s.rate;
      s.priceRef = priceRef;
      s.tvlMax24h = tvlMax24h;
      s.why = pauseReasons(s, config.rules);
      if (s.readOk) {                                      // remember this reading for the next visit's checks
        hist.push({ t: Math.round(nowS), p: s.priceNow, v: s.tvlNow });
        lsSet("hist." + v.cfg.id, hist.slice(-60));
      }
      v.state = s;
    });
    venuesAt = Date.now();
  }

  // ---- wallet ----
  let wallet = null, watchOnly = false, busy = false;
  let usdgBal = null;
  let positions = {};                                     // venue id -> { shares, value, maxWithdraw, net }
  let posAt = 0, posFor = "";

  async function readWallet(w) {
    const calls = [{ target: USDG, data: enc.balanceOf(w) }];
    for (const v of venues) {
      v.widx = calls.length;
      calls.push({ target: v.cfg.address, data: enc.balanceOf(w) });
      if (v.meta.kind === "spark") calls.push({ target: v.cfg.address, data: enc.maxWithdraw(w) }, { target: v.cfg.address, data: enc.maxDeposit(w) });
    }
    const r = await readMany(calls);
    const bal = big(r[0]);
    const pos = {};
    const second = [];
    for (const v of venues) {
      const shares = big(r[v.widx]) || 0n;
      const p = { shares, value: 0n };
      if (v.meta.kind === "spark") { p.maxWithdraw = big(r[v.widx + 1]); p.maxDeposit = big(r[v.widx + 2]); }
      if (shares > 0n) { p.i = second.length; second.push({ target: v.cfg.address, data: enc.convertToAssets(shares) }); }
      pos[v.cfg.id] = p;
    }
    if (second.length) {
      const r2 = await readMany(second);
      for (const v of venues) { const p = pos[v.cfg.id]; if (p.i != null) p.value = big(r2[p.i]) || 0n; }
    }
    await netDeposits(w, pos).catch(() => {});
    return { bal, pos };
  }

  /** Net deposited per venue from the wallet's own Deposit/Withdraw logs (cached per browser, scanned incrementally). */
  async function netDeposits(w, pos) {
    const head = parseInt(await rpc("eth_blockNumber", []), 16);
    const userTopic = "0x" + addrWord(w);
    const reqs = [], spans = [];
    for (const v of venues) {
      const key = "logs." + v.cfg.id + "." + w.toLowerCase();
      const c = lsGet(key) || { to: Number(v.cfg.fromBlock || 0) - 1, dep: "0", wd: "0" };
      for (let from = c.to + 1; from <= head; from += 10000000) {
        const to = Math.min(head, from + 9999999);
        // one value per topic position (the public RPC allows 10M blocks a query that way, 100k with OR-ed topics):
        // Deposit with topic2 = owner, Withdraw with topic3 = owner
        const range = { address: v.cfg.address, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) };
        spans.push(v.cfg.id, v.cfg.id);
        reqs.push(["eth_getLogs", [{ ...range, topics: [TOPIC_DEPOSIT, null, userTopic] }]],
          ["eth_getLogs", [{ ...range, topics: [TOPIC_WITHDRAW, null, null, userTopic] }]]);
      }
      v._logs = { key, c, logs: [], ok: true };
    }
    const res = await rpcBatch(reqs);
    res.forEach((x, i) => {
      const v = venues.find((y) => y.cfg.id === spans[i]);
      if (!x || x.error || !Array.isArray(x.result)) v._logs.ok = false; else v._logs.logs.push(...x.result);
    });
    for (const v of venues) {
      const L = v._logs, p = pos[v.cfg.id];
      if (!L.ok) { delete v._logs; continue; }
      const n = netFromLogs(L.logs, w);
      const dep = BigInt(L.c.dep) + n.dep, wd = BigInt(L.c.wd) + n.wd;
      lsSet(L.key, { to: head, dep: dep.toString(), wd: wd.toString() });
      p.net = dep - wd;
      delete v._logs;
    }
  }

  // ---- render ----
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") e.textContent = v; else if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else e.setAttribute(k, v);
    }
    e.append(...kids.filter((x) => x != null));
    return e;
  }
  const row = (k, v) => el("div", { class: "row" }, el("span", { class: "k", text: k }), el("span", { class: "v" }, v));

  let selected = null;                                    // venue id in the box
  const venueById = (id) => venues.find((v) => v.cfg.id === id);
  const isPaused = (v) => !v.state || v.state.why.length > 0;

  function renderVenues() {
    const host = $("earn-venues");
    host.textContent = "";
    for (const v of venues) {
      const s = v.state;
      const paused = isPaused(v);
      const card = el("div", { class: "card pad earn-venue" + (v.cfg.id === selected ? " on" : ""), "data-venue": v.cfg.id });
      const status = !s ? el("span", { class: "earn-pill", text: tr("venue.loading") })
        : paused ? el("span", { class: "earn-pill warn", text: tr("status.paused") })
        : el("span", { class: "earn-pill ok", text: tr("status.live") });
      card.append(el("div", { class: "earn-vhead" }, el("div", null, el("h3", { text: v.cfg.name }),
        el("p", { class: "earn-by", text: tr("venue.by", { protocol: v.cfg.protocol, curator: v.cfg.curator }) })), status));
      card.append(el("div", { class: "earn-rate" }, el("strong", { text: s ? pct(s.rate) : "–" }), el("span", { text: tr("venue.rateNow") })));
      // the rewards line only once a working Claim exists (EARN-PAGE-PLAN.md §4b); config "rewards" stays null until then
      if (v.cfg.rewards && v.cfg.rewards.claim && v.cfg.rewards.pct) card.append(el("p", { class: "earn-rewards", text: tr("venue.rewards", { pct: fmt(v.cfg.rewards.pct, 1) }) }));
      const spec = el("div", { class: "specimen earn-spec" },
        row(tr("venue.avg30"), s ? pct(s.avg30) : "–"),
        row(tr("venue.tvl"), s ? usd(s.tvlNow) : "–"),
        row(tr("venue.redeemable"), s ? usd(s.liquidityUsd) : "–"),
        row(tr("venue.vault"), el("a", { href: EXPLORER + "/address/" + v.cfg.address, target: "_blank", rel: "noopener", text: v.cfg.address.slice(0, 6) + "…" + v.cfg.address.slice(-4) + " ↗" })));
      card.append(spec);
      if (s && paused) {
        const why = s.why.map((k) => tr("status.why." + k)).join(" · ");
        card.append(el("p", { class: "earn-paused" }, el("b", { text: tr("status.pausedNote") }), " " + why + (v.cfg.pauseNote ? " · " + v.cfg.pauseNote : "")));
      }
      card.append(el("button", { class: "btn sm" + (paused ? "" : " red"), type: "button", text: tr("venue.lend"),
        on: { click: () => { selectVenue(v.cfg.id); $("earn-box").scrollIntoView({ behavior: "smooth", block: "start" }); } } }));
      host.append(card);
    }
    renderBox();
  }

  function selectVenue(id) {
    selected = id;
    $("earn-venue").value = id;
    for (const c of document.querySelectorAll(".earn-venue")) c.classList.toggle("on", c.dataset.venue === id);
    renderBox();
  }

  function boxMsg(text, kind, hash) {
    const m = $("earn-msg");
    m.textContent = text || "";
    m.dataset.kind = kind || "";
    if (hash) m.append(el("a", { href: EXPLORER + "/tx/" + hash, target: "_blank", rel: "noopener", text: " " + tr("msg.viewTx") }));
  }

  function renderBox() {
    const v = venueById(selected);
    const amount = units($("earn-amount").value, USDG_DECIMALS);
    if (amount && amount > 0n) {
      const fee = feeOf(amount);
      $("earn-breakdown").textContent = tr("box.breakdown", { net: usdgText(amount - fee), fee: usdgText(fee) });
    } else $("earn-breakdown").textContent = "";
    const rate = v && v.state && v.state.rate;
    $("earn-feenote").textContent = tr("box.feeNote", { months: feeMonths(rate) || 3 });
    $("earn-balrow").hidden = usdgBal == null;
    if (usdgBal != null) $("earn-bal").textContent = tr("box.balance", { amt: usdgText(usdgBal) + " USDG" });
    const go = $("earn-go");
    if (!wallet || watchOnly) { go.textContent = acct || window.ethereum ? tr("box.connect") : tr("box.noWallet"); go.disabled = busy; }
    else if (v && isPaused(v)) { go.textContent = tr("box.paused"); go.disabled = true; }
    else { go.textContent = tr("box.lend"); go.disabled = busy || !v || !v.state; }
  }

  function renderPositions() {
    const host = $("earn-pos");
    host.textContent = "";
    if (!wallet) { host.append(el("p", { class: "earn-muted", text: tr("pos.signIn") })); renderUnpaid(); return; }
    if (posFor !== wallet.toLowerCase()) { host.append(el("p", { class: "earn-muted", text: tr("pos.loading") })); return; }
    let any = false;
    for (const v of venues) {
      const p = positions[v.cfg.id];
      if (!p || p.shares <= 0n) continue;
      any = true;
      const avail = available(v, p);
      const earned = p.net != null ? p.value - p.net : null;
      const card = el("div", { class: "card pad earn-posc" });
      card.append(el("div", { class: "earn-vhead" }, el("h3", { text: v.cfg.name }), el("strong", { class: "earn-val", text: usdgText(p.value) + " USDG" })));
      card.append(el("div", { class: "specimen earn-spec" },
        row(tr("pos.value"), usdgText(p.value, 6) + " USDG"),
        row(tr("pos.shares"), fmt(Number(decimalOf(p.shares, v.meta.shareDecimals, 8)), 6)),
        row(tr("pos.earned"), earned == null ? "–" : (earned >= 0n ? "+" : "") + usdgText(earned, 6) + " USDG")));
      if (earned != null) card.append(el("p", { class: "earn-muted small", text: tr("pos.earnedNote") }));
      if (avail != null && avail < p.value) card.append(el("p", { class: "earn-paused", text: tr("msg.onlyX", { amt: usdgText(avail) }) }));
      const input = el("input", { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0.00", "aria-label": tr("pos.withdraw") });
      const off = watchOnly || busy;
      const b1 = el("button", { class: "btn sm", type: "button", text: tr("pos.withdraw"), on: { click: () => withdraw(v, input.value, false) } });
      const b2 = el("button", { class: "btn sm red", type: "button", text: tr("pos.withdrawAll"), on: { click: () => withdraw(v, null, true) } });
      if (off) { b1.disabled = true; b2.disabled = true; }
      card.append(el("div", { class: "earn-wd" }, el("span", { class: "buy-field" }, input, el("span", { class: "buy-sym", text: "USDG" })), b1, b2));
      card.append(el("p", { class: "earn-muted small", text: tr("pos.free") }));
      host.append(card);
    }
    if (!any) host.append(el("p", { class: "earn-muted", text: tr("pos.none") }));
    renderUnpaid();
  }

  /** What can leave the vault right now for this position (Spark: maxWithdraw; Steakhouse: the vault's liquidity). */
  function available(v, p) {
    if (v.meta.kind === "spark") return p.maxWithdraw != null ? p.maxWithdraw : null;
    const liq = v.state && v.state.liquidityRaw;
    return liq != null ? (liq < p.value ? liq : p.value) : null;
  }

  // ---- unpaid fees (a skipped third prompt): re-offered, never enforced ----
  const unpaidKey = () => "unpaid." + (wallet || "").toLowerCase();
  function renderUnpaid() {
    const host = $("earn-unpaid");
    host.textContent = "";
    const list = wallet && !watchOnly ? lsGet(unpaidKey()) || [] : [];
    host.hidden = !list.length;
    list.forEach((u, i) => {
      const v = venueById(u.venue);
      host.append(el("div", { class: "earn-unpaid-row" },
        el("span", { text: tr("unpaid.text", { fee: usdgText(BigInt(u.fee)), venue: v ? v.cfg.name : u.venue }) }),
        el("button", { class: "btn sm red", type: "button", text: tr("unpaid.pay"), on: { click: () => payFee(i) } }),
        el("button", { class: "btn sm", type: "button", text: tr("unpaid.dismiss"), on: { click: () => { const l = lsGet(unpaidKey()) || []; l.splice(i, 1); lsSet(unpaidKey(), l); renderUnpaid(); } } })));
    });
  }

  // ---- loading, cached 5 minutes, only while visible ----
  async function refreshVenues(force) {
    if (!force && Date.now() - venuesAt < TTL) return;
    try {
      await readVenues();
      lsSet("venues", { at: venuesAt, states: venues.map((v) => ({ id: v.cfg.id, ...v.state, liquidityRaw: v.state.liquidityRaw != null ? v.state.liquidityRaw.toString() : null })) });
    } catch (e) { for (const v of venues) v.state = v.state || { why: ["data"] }; }
    renderVenues();
  }
  /** A reading under 5 minutes old from this browser (a reload doesn't re-read); the JSON pause flag still applies. */
  function cachedVenues() {
    const c = lsGet("venues");
    if (!c || !(Date.now() - c.at < TTL) || !Array.isArray(c.states)) return false;
    for (const v of venues) {
      const s = c.states.find((x) => x.id === v.cfg.id);
      if (!s) return false;
      s.liquidityRaw = s.liquidityRaw != null ? BigInt(s.liquidityRaw) : null;
      s.manual = !!v.cfg.paused;
      s.why = pauseReasons(s, config.rules);
      v.state = s;
    }
    venuesAt = c.at;
    return true;
  }
  async function refreshWallet(force) {
    if (!wallet) { usdgBal = null; positions = {}; posFor = ""; renderBox(); renderPositions(); return; }
    const w = wallet;
    if (!force && posFor === w.toLowerCase() && Date.now() - posAt < TTL) return;
    try {
      const r = await readWallet(w);
      if (wallet !== w) return;
      usdgBal = r.bal; positions = r.pos; posFor = w.toLowerCase(); posAt = Date.now();
    } catch (e) {
      if (wallet === w) { posFor = w.toLowerCase(); positions = {}; }
    }
    renderBox();
    renderPositions();
  }
  function tick() {
    if (document.visibilityState !== "visible") return;
    refreshVenues(false);
    refreshWallet(false);
  }

  // ---- wallet calls ----
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const cancelledErr = (e, why) => (e && (e.code === 4001 || (e.cause && e.cause.code === 4001))) || /rejected|denied|cancel/i.test(why || "");
  const errText = (e) => (acct ? acct.errorText(e) : (e && (e.shortMessage || e.message)) || String(e));

  async function connect() {
    const a = await loadAcct();
    if (a) {
      const w = await a.requireWallet();
      if (!w) return false;
      setWallet(w, false);
      return true;
    }
    if (!window.ethereum) { boxMsg(tr("box.noWallet"), "err"); return false; }
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) || [];
    if (!accs.length) return false;
    setWallet(accs[0], false);
    return true;
  }
  function setWallet(w, watch) {
    const changed = (w || "").toLowerCase() !== (wallet || "").toLowerCase();
    wallet = w; watchOnly = !!watch;
    if (changed) { usdgBal = null; positions = {}; posFor = ""; }
    renderBox();
    renderPositions();
    refreshWallet(changed);
  }

  async function ensureChain(eth) {
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() === CHAIN_HEX) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if (e && e.code !== 4902) throw e;
      await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "Robinhood Chain",
        rpcUrls: [RPC], blockExplorerUrls: [EXPLORER], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
    }
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() !== CHAIN_HEX) throw new Error("not on Robinhood Chain");
  }

  /** The injected wallet, if it is the signed-in one and can batch atomically on Robinhood Chain (EIP-5792). */
  async function batchWallet() {
    const eth = window.ethereum;
    if (!eth || !wallet) return null;
    try {
      const accs = (await eth.request({ method: "eth_accounts" })) || [];
      if (!accs.some((a) => same(a, wallet))) return null;
      const caps = await eth.request({ method: "wallet_getCapabilities", params: [wallet, [CHAIN_HEX]] });
      const c = caps && (caps[CHAIN_HEX] || caps[String(CHAIN)] || caps["0x0"]);
      if (!c) return null;
      const ok = (c.atomic && (c.atomic.status === "supported" || c.atomic.status === "ready")) || (c.atomicBatch && c.atomicBatch.supported === true);
      return ok ? eth : null;
    } catch (e) {
      return null;
    }
  }

  /** wallet_sendCalls (EIP-5792), waits for the bundle; resolves with { hash } (the last receipt's). null = unsupported, nothing sent. */
  async function sendBatch(eth, calls) {
    await ensureChain(eth);
    let id;
    const body = (version) => ({ version, from: wallet, chainId: CHAIN_HEX, atomicRequired: true, calls: calls.map((c) => ({ to: c.to, data: c.data, value: "0x0" })) });
    try {
      id = await eth.request({ method: "wallet_sendCalls", params: [body("2.0.0")] });
    } catch (e) {
      if (cancelledErr(e, e && e.message)) throw e;
      const unsupported = [5700, 5710, -32601, 4200].includes(e && e.code);
      if (unsupported) return null;                         // nothing was sent: fall back to one prompt per call
      if (e && e.code === -32602) {                          // an older wallet: EIP-5792 v1 params
        const b = body("1.0"); delete b.atomicRequired;
        id = await eth.request({ method: "wallet_sendCalls", params: [b] });
      } else throw e;
    }
    if (id && typeof id === "object") id = id.id;
    for (let i = 0; i < 150; i++) {
      await sleep(2000);
      let st;
      try { st = await eth.request({ method: "wallet_getCallsStatus", params: [id] }); } catch (e) { continue; }
      const code = st && st.status;
      if (code === 200 || code === "CONFIRMED") {
        const rc = st.receipts || [];
        if (!rc.length || rc.some((r) => !(r.status === "0x1" || r.status === 1 || r.status === "success"))) throw new Error("the batch reverted");
        return { hash: rc[rc.length - 1].transactionHash || null };
      }
      if (code === 400 || code === 500 || code === 600 || code === "FAILED") throw new Error("the batch failed");
    }
    throw new Error("no confirmation yet; check your wallet's activity");
  }

  // the same nonce retry as buy.js (2026-10-05: a wallet sent step 2 before its node saw step 1)
  async function sendOne(tx) {
    for (let attempt = 0; ; attempt++) {
      try {
        if (acct) return await acct.transact(tx.to, tx.data, () => {}, CHAIN);
        await ensureChain(window.ethereum);
        return await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: wallet, to: tx.to, data: tx.data, value: "0x0", chainId: CHAIN_HEX }] });
      } catch (e) {
        const why = String((e && (e.shortMessage || e.details || e.message)) || e);
        if (attempt >= 4 || !/nonce/i.test(why)) throw e;
        boxMsg(tr("msg.waiting"));
        await sleep(3000 * (attempt + 1));
      }
    }
  }
  async function minedOk(hash) {
    if (acct) return acct.mined(hash, CHAIN);              // throws if it reverted
    for (let i = 0; i < 120; i++) {
      const r = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
      if (r) { if (r.status !== "0x1") throw new Error("the transaction failed"); return; }
      await sleep(2000);
    }
    throw new Error("no receipt yet");
  }

  // ---- lend ----
  async function lend() {
    if (busy) return;
    if (!wallet || watchOnly) { await connect(); return; }
    const v = venueById(selected);
    if (!v || isPaused(v)) return;
    const amount = units($("earn-amount").value, USDG_DECIMALS);
    if (!amount || amount <= 0n) { boxMsg(tr("msg.enterAmount"), "err"); return; }
    if (amount < MIN_DEPOSIT) { boxMsg(tr("msg.min", { min: decimalOf(MIN_DEPOSIT, USDG_DECIMALS) }), "err"); return; }
    busy = true; renderBox();
    const user = wallet;
    try {
      // fresh on-chain checks right before signing
      boxMsg(tr("msg.checking"));
      const reads = [{ target: v.cfg.address, data: SEL.asset }, { target: USDG, data: enc.balanceOf(user) }];
      if (v.meta.checkMaxDeposit) reads.push({ target: v.cfg.address, data: enc.maxDeposit(user) });
      const r = await readMany(reads);
      if (!same(addrOf(r[0]), USDG)) { boxMsg(tr("msg.wrongAsset"), "err"); return; }
      const bal = big(r[1]);
      if (bal == null) { boxMsg(tr("msg.readFailed"), "err"); return; }
      if (bal < amount) { boxMsg(tr("msg.tooMuch"), "err"); return; }
      const { fee, net, calls } = buildDeposit({ vault: v.cfg.address, amount, user });
      if (v.meta.checkMaxDeposit) {                        // Spark only (never Steakhouse: VaultV2 says 0)
        const max = big(r[2]);
        if (max == null) { boxMsg(tr("msg.readFailed"), "err"); return; }
        if (net > max) { boxMsg(tr("msg.overCap", { max: usdgText(max) }), "err"); return; }
      }
      try { checkDeposit(calls, { vault: v.cfg.address, amount, user, chainId: CHAIN }); }
      catch (e) { boxMsg(tr("msg.checkFailed", { why: e.message }), "err"); return; }

      let last = null, feePaid = false;
      const eth = await batchWallet();
      if (eth) {
        boxMsg(tr("msg.confirmBatch"));
        const sent = await sendBatch(eth, calls);
        if (sent) { feePaid = true; last = sent.hash; }      // atomic: all three landed (never re-sent one by one)
      }
      if (!feePaid) {
        for (let i = 0; i < calls.length; i++) {
          if (i > 0) await sleep(2500);                    // let the wallet's node see the previous step
          boxMsg(tr("msg.confirm", { n: i + 1, of: calls.length }));
          try {
            last = await sendOne(calls[i]);
            boxMsg(tr("msg.waiting"));
            await minedOk(last);
          } catch (e) {
            if (i === 2) {                                 // the deposit landed; only the fee didn't: re-offer it
              const l = lsGet(unpaidKey()) || [];
              l.push({ venue: v.cfg.id, fee: fee.toString(), at: Date.now() });
              lsSet(unpaidKey(), l);
              break;
            }
            throw e;
          }
          if (i === 2) feePaid = true;
        }
      }
      boxMsg(feePaid ? tr("msg.done") : tr("msg.doneNoFee"), "ok", last);
      await refreshWallet(true);
    } catch (e) {
      const why = errText(e);
      boxMsg(cancelledErr(e, why) ? tr("msg.cancelled") : tr("msg.failed", { why }), "err");
    } finally {
      busy = false; renderBox(); renderPositions();
    }
  }

  async function payFee(i) {
    if (busy || !wallet || watchOnly) return;
    const list = lsGet(unpaidKey()) || [];
    const u = list[i];
    if (!u) return;
    const tx = { to: USDG, data: enc.transfer(FEE_TO, BigInt(u.fee)), value: "0x0" };
    try { checkFeeOnly(tx, u.fee); } catch (e) { return; }
    busy = true;
    try {
      boxMsg(tr("msg.confirm", { n: 1, of: 1 }));
      const h = await sendOne(tx);
      boxMsg(tr("msg.waiting"));
      await minedOk(h);
      const l = lsGet(unpaidKey()) || [];
      l.splice(i, 1);
      lsSet(unpaidKey(), l);
      boxMsg(tr("msg.done"), "ok", h);
    } catch (e) {
      const why = errText(e);
      boxMsg(cancelledErr(e, why) ? tr("msg.cancelled") : tr("msg.failed", { why }), "err");
    } finally {
      busy = false; renderUnpaid(); refreshWallet(true);
    }
  }

  // ---- withdraw (no fee; never blocked by a pause) ----
  async function withdraw(v, amountStr, all) {
    if (busy || !wallet || watchOnly) return;
    const user = wallet;
    const pm = $("earn-posmsg");
    const say = (text, kind, hash) => {
      pm.textContent = text || ""; pm.dataset.kind = kind || "";
      if (hash) pm.append(el("a", { href: EXPLORER + "/tx/" + hash, target: "_blank", rel: "noopener", text: " " + tr("msg.viewTx") }));
    };
    busy = true; renderPositions();
    try {
      say(tr("msg.checking"));
      const reads = [{ target: v.cfg.address, data: enc.balanceOf(user) }];
      if (v.meta.kind === "spark") reads.push({ target: v.cfg.address, data: enc.maxWithdraw(user) });
      const r = await readMany(reads);
      const shares = big(r[0]);
      if (shares == null) { say(tr("msg.readFailed"), "err"); return; }
      if (shares === 0n) { say(tr("pos.none"), "err"); return; }
      const value = big((await readMany([{ target: v.cfg.address, data: enc.convertToAssets(shares) }]))[0]) || 0n;
      const p = { shares, value, maxWithdraw: v.meta.kind === "spark" ? big(r[1]) : null };
      const avail = available(v, p);
      let tx;
      if (all) {
        if (avail != null && avail < value) { say(tr("msg.onlyX", { amt: usdgText(avail) }), "err"); return; }
        tx = buildWithdraw({ vault: v.cfg.address, user, shares });
      } else {
        const assets = units(amountStr, USDG_DECIMALS);
        if (!assets || assets <= 0n) { say(tr("msg.enterAmount"), "err"); return; }
        if (assets > value) { say(tr("msg.notEnough", { amt: usdgText(value, 6) }), "err"); return; }
        if (avail != null && assets > avail) { say(tr("msg.onlyX", { amt: usdgText(avail) }), "err"); return; }
        tx = buildWithdraw({ vault: v.cfg.address, user, assets });
      }
      try { checkWithdraw(tx, { vault: v.cfg.address, user }); }
      catch (e) { say(tr("msg.checkFailed", { why: e.message }), "err"); return; }
      // a dry run from the wallet: a vault short of cash says so here instead of in a failed transaction
      try { await rpc("eth_call", [{ from: user, to: tx.to, data: tx.data }, "latest"]); }
      catch (e) { say(tr("msg.onlyX", { amt: avail != null ? usdgText(avail) : "–" }), "err"); return; }
      say(tr("msg.confirm", { n: 1, of: 1 }));
      const h = await sendOne(tx);
      say(tr("msg.waiting"));
      await minedOk(h);
      say(tr("msg.withdrawn"), "ok", h);
      busy = false;
      await refreshWallet(true);
    } catch (e) {
      const why = errText(e);
      say(cancelledErr(e, why) ? tr("msg.cancelled") : tr("msg.failed", { why }), "err");
    } finally {
      busy = false; renderPositions();
    }
  }

  // ---- start ----
  async function start() {
    try {
      const r = await fetch("assets/earn-venues.json", { cache: "no-cache" });
      config = await r.json();
    } catch (e) {
      config = { rules: {}, venues: [] };
    }
    venues = (config.venues || []).filter((c) => vaultOf(c.address)).map((cfg) => ({ cfg, meta: vaultOf(cfg.address), state: null }));
    const sel = $("earn-venue");
    for (const v of venues) sel.append(el("option", { value: v.cfg.id, text: v.cfg.name }));
    selected = venues.length ? venues[0].cfg.id : null;
    sel.addEventListener("change", () => selectVenue(sel.value));
    $("earn-amount").addEventListener("input", renderBox);
    for (const b of document.querySelectorAll("#earn-box [data-pct]")) b.addEventListener("click", () => {
      if (usdgBal == null) return;
      $("earn-amount").value = decimalOf(usdgBal * BigInt(b.dataset.pct) / 100n, USDG_DECIMALS, 6);
      renderBox();
    });
    $("earn-go").addEventListener("click", lend);
    $("earn-fund").addEventListener("click", () => {
      const box = $("buy"), open = box.hidden;
      box.hidden = !open;
      $("earn-fund").textContent = open ? tr("box.fundHide") : tr("box.fund");
      $("earn-fund").setAttribute("aria-expanded", String(open));
    });
    // buy.js (into-USDG mode) says when a swap landed: fill in what arrived
    window.addEventListener("buy:done", (e) => {
      const got = e.detail && e.detail.out;
      if (got && got.symbol === "USDG" && got.amount) $("earn-amount").value = decimalOf(BigInt(got.amount), USDG_DECIMALS, 6);
      refreshWallet(true);
    });
    renderVenues();
    renderPositions();
    // read-only preview of any address (for checking the page): ?watch=0x...
    const watch = new URLSearchParams(location.search).get("watch");
    if (isAddr(watch)) setWallet(watch, true);
    else {
      const s = window.flyNav && window.flyNav.session && window.flyNav.session();
      if (s && s.wallet) setWallet(s.wallet, false);
      loadAcct().then((a) => { if (a) a.onAccount((w) => setWallet(w, false)); renderBox(); });
    }
    if (cachedVenues()) renderVenues();
    refreshVenues(false);
    setInterval(tick, 60 * 1000);                          // checks every minute, reads only when the 5-minute cache is stale
    document.addEventListener("visibilitychange", tick);
  }

  if (window.flyI18n) start();
  else {
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    window.addEventListener("i18n:ready", go);
    fetch("assets/i18n/en/earn.json").then((r) => r.json()).then((d) => { en = d; setTimeout(go, 1500); }).catch(() => {});
  }
})();
