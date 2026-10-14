/**
 * Stake / unstake $FLYAI on the Fly Desk page (desk.html #stake, 2026-10-14, the user: "add staking entry in the
 * flydesk page as well (and unstake obviously)"). The same FlyStaking contract as /compute's stake page and the Claim
 * page's "Claim & stake": a stake held all week raises the wallet's share of the desk's weekly payout (x(1 + lowest
 * stake of the week / 2M), at most 2x) and counts toward the 200k $FLYAI that keeps its flies activated.
 * Unstaking is two steps: request (stops counting now), withdraw after the contract's cooldown (7 days).
 * Reads: the public Robinhood RPC. Writes: the site's one wallet module (/compute/mine/web/account.js, as /earn).
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("stake")) return;

  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const CHAIN = 4663;
  const CHAIN_HEX = "0x1237";
  const STAKING = "0x5279dafA0858d4A5B2DCeb05E5b41f954CD692Cc";
  const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
  const ACCOUNT_JS = "/compute/mine/web/account.js";
  const SEL = { stake: "0xa694fc3a", requestUnstake: "0x23095721", cancelUnstake: "0x4ab17969", withdraw: "0x3ccfd60b",
    stakedOf: "0xaf500ba3", unstaking: "0xcb8d751a", cooldown: "0x787a08a6", totalStaked: "0x817b1cd2",
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231" };
  // the payout boost (flytrade/web/src/flyinfo.ts STAKE_UNIT_FLYAI / STAKE_CAP; the desk's settle.stake_mult)
  const STAKE_UNIT = 2_000_000;
  const STAKE_CAP = 2;
  const WEI = 10n ** 18n;
  const REFRESH_MS = 60_000;

  let en = null;
  const pick = (o, k) => k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), o);
  function t(key, vars) {
    if (window.flyI18n) return window.flyI18n.t("desk.stake." + key, vars);
    const v = pick(en, "stake." + key);
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  }
  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let acct = null;
  const loadAcct = () => (acct ? Promise.resolve(acct) : import(ACCOUNT_JS).then((m) => (acct = m)).catch(() => null));
  let wallet = null;
  let mode = "stake";     // or "unstake"
  let busy = false;
  let s = null;           // { staked, pending, unlocksAt, balance, cooldown } (wei / seconds)
  let total = null;

  // ---- words on the chain ----
  const word = (v) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
  const data = (sel, ...args) => sel + args.map(word).join("");
  async function rpc(method, params) {
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const b = await r.json();
    if (b.error) throw new Error(b.error.message || "RPC error");
    return b.result;
  }
  const read = (to, input) => rpc("eth_call", [{ to, data: input }, "latest"]);
  const words = (hex) => (String(hex).slice(2).match(/.{64}/g) || []).map((w) => BigInt("0x" + w));

  function toWei(text) {
    const m = /^(\d*)(?:\.(\d{0,18}))?$/.exec(String(text).trim().replace(/[,\s_]/g, ""));
    if (!m || (!m[1] && !m[2])) return null;
    return BigInt(m[1] || "0") * WEI + BigInt((m[2] || "").padEnd(18, "0"));
  }
  const whole = (wei) => Number(wei / WEI) + Number(wei % WEI) / 1e18;
  const flyai = (wei) => new Intl.NumberFormat(lang(), { maximumFractionDigits: whole(wei) >= 1000 ? 0 : 2 }).format(whole(wei));
  const compact = (wei) => new Intl.NumberFormat(lang(), { notation: "compact", maximumFractionDigits: 1 }).format(whole(wei));
  const boostOf = (wei) => Math.min(STAKE_CAP, 1 + whole(wei) / STAKE_UNIT);
  const when = (sec) => new Date(sec * 1000).toLocaleString(lang(), { dateStyle: "medium", timeStyle: "short" });

  function msg(text, kind) {
    const el = $("stk-msg");
    el.textContent = text || "";
    el.dataset.kind = kind || "";
  }

  // ---- the session: one sign-in for the whole site (nav.js window.flyNav), as the vote ----
  function navWallet() {
    const x = window.flyNav && window.flyNav.session && window.flyNav.session();
    return x && x.wallet ? x.wallet.toLowerCase() : null;
  }
  function signIn() {
    const b = document.querySelector("nav li.acct[data-signin] button");
    if (b) { window.scrollTo({ top: 0, behavior: "smooth" }); b.click(); }
  }

  async function load() {
    try {
      total = words(await read(STAKING, SEL.totalStaked))[0];
    } catch { /* the total is a nicety */ }
    const w = navWallet();
    if (w !== wallet) { wallet = w; s = null; }
    if (wallet) {
      try {
        const [staked, unstaking, balance, cooldown] = await Promise.all([
          read(STAKING, data(SEL.stakedOf, wallet)), read(STAKING, data(SEL.unstaking, wallet)),
          read(FLYAI, data(SEL.balanceOf, wallet)), read(STAKING, SEL.cooldown)]);
        const [pending, unlocksAt] = words(unstaking);
        s = { staked: words(staked)[0], pending, unlocksAt: Number(unlocksAt), balance: words(balance)[0], cooldown: Number(words(cooldown)[0]) };
      } catch (e) {
        if (!s) msg(t("down"), "err");
      }
    }
    render();
  }

  function render() {
    $("stk-total").textContent = total != null ? t("total", { amount: compact(total) }) : "";
    $("stk-connect").hidden = !!wallet;
    $("stk-form").hidden = !wallet;
    const tiles = $("stk-tiles");
    if (!wallet || !s) {
      tiles.innerHTML = "";
      $("stk-pending").hidden = true;
      return;
    }
    const boost = boostOf(s.staked);
    const full = STAKE_UNIT * (STAKE_CAP - 1);          // staked for the full boost
    tiles.innerHTML = [
      [t("staked"), flyai(s.staked) + " $FLYAI"],
      [t("boost"), "×" + boost.toFixed(2) + (boost < STAKE_CAP ? ` <small>${esc(t("boostMax", { amount: new Intl.NumberFormat(lang()).format(full), cap: STAKE_CAP }))}</small>` : "")],
      [t("inWallet"), flyai(s.balance) + " $FLYAI"],
    ].map(([k, v]) => `<div class="stk-tile"><span class="vs-k">${esc(k)}</span><b class="mono">${v}</b></div>`).join("");
    // waiting to unstake: withdraw once unlocked, or put it back
    const pend = $("stk-pending");
    pend.hidden = s.pending === 0n;
    if (s.pending > 0n) {
      const ready = Date.now() / 1000 >= s.unlocksAt;
      $("stk-pending-text").textContent = ready ? t("readyNow", { amount: flyai(s.pending) }) : t("cooling", { amount: flyai(s.pending), date: when(s.unlocksAt) });
      $("stk-withdraw").disabled = busy || !ready;
      $("stk-cancel").disabled = busy;
    }
    for (const b of document.querySelectorAll("#stk-tabs [data-mode]")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-selected", b.dataset.mode === mode ? "true" : "false");
    }
    $("stk-go").textContent = busy ? t("busy") : t(mode === "stake" ? "buttonStake" : "buttonUnstake");
    $("stk-go").disabled = busy;
    $("stk-max").disabled = busy;
    $("stk-hint").textContent = mode === "stake" ? t("hintStake") : t("hintUnstake", { days: Math.round((s.cooldown || 604800) / 86400) });
  }

  // ---- sending ----
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const errText = (e) => (acct ? acct.errorText(e) : (e && (e.shortMessage || e.message)) || String(e));

  async function send(to, input) {
    const a = await loadAcct();
    if (a) {
      const hash = await a.transact(to, input, () => msg(t("confirm")), CHAIN);
      msg(t("waiting"));
      await a.mined(hash, CHAIN);
      return;
    }
    const eth = window.ethereum;
    if (!eth) throw new Error(t("noWallet"));
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() !== CHAIN_HEX) {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    }
    msg(t("confirm"));
    const hash = await eth.request({ method: "eth_sendTransaction", params: [{ from: wallet, to, data: input, value: "0x0" }] });
    msg(t("waiting"));
    for (let i = 0; i < 120; i++) {
      const r = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
      if (r) { if (r.status !== "0x1") throw new Error(t("reverted")); return; }
      await sleep(2000);
    }
    throw new Error(t("noReceipt"));
  }

  async function run(fn, done) {
    if (busy) return;
    if (!wallet) { signIn(); return; }
    busy = true; render();
    try {
      await fn();
      msg(done, "ok");
      $("stk-amt").value = "";
    } catch (e) {
      const why = errText(e);
      msg(/rejected|denied|cancel/i.test(why) ? t("cancelled") : why, "err");
    } finally {
      busy = false;
      await load();
    }
  }

  function amount() {
    const v = toWei($("stk-amt").value);
    if (v == null || v <= 0n) { msg(t("enterAmount"), "err"); return null; }
    const max = mode === "stake" ? s.balance : s.staked;
    if (v > max) { msg(t(mode === "stake" ? "tooMuchWallet" : "tooMuchStaked"), "err"); return null; }
    return v;
  }

  function go() {
    if (!s) return;
    const v = amount();
    if (v == null) return;
    if (mode === "stake") {
      run(async () => {
        const allowance = words(await read(FLYAI, data(SEL.allowance, wallet, STAKING)))[0];
        if (allowance < v) {
          msg(t("approving"));
          await send(FLYAI, data(SEL.approve, STAKING, v));
        }
        await send(STAKING, data(SEL.stake, v));
      }, t("doneStake", { amount: flyai(v) }));
    } else {
      // a second request restarts the cooldown for everything already waiting: say so before sending
      if (s.pending > 0n && !confirm(t("restartWarn", { amount: flyai(s.pending) }))) return;
      run(() => send(STAKING, data(SEL.requestUnstake, v)), t("doneUnstake", { amount: flyai(v), days: Math.round((s.cooldown || 604800) / 86400) }));
    }
  }

  document.addEventListener("click", (e) => {
    const tab = e.target.closest("#stk-tabs [data-mode]");
    if (tab) { mode = tab.dataset.mode; msg(""); render(); return; }
    if (e.target.closest("#stk-go")) go();
    if (e.target.closest("#stk-max") && s) {
      const max = mode === "stake" ? s.balance : s.staked;
      $("stk-amt").value = (max / WEI).toString() + (max % WEI ? "." + (max % WEI).toString().padStart(18, "0").replace(/0+$/, "") : "");
    }
    if (e.target.closest("#stk-withdraw") && s) run(() => send(STAKING, SEL.withdraw), t("doneWithdraw", { amount: flyai(s.pending) }));
    if (e.target.closest("#stk-cancel") && s) run(() => send(STAKING, SEL.cancelUnstake), t("doneCancel", { amount: flyai(s.pending) }));
    if (e.target.closest("#stk-connect") && !navWallet()) signIn();
  });
  $("stk-amt").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

  async function start() {
    if (!window.flyI18n) {
      try { en = await (await fetch("assets/i18n/en/desk.json")).json(); } catch { en = {}; }
    }
    await load();
    // the nav's session can arrive after this page loaded: follow it, and refresh while the page is open
    setInterval(() => { if (document.visibilityState === "visible" && !busy) load(); }, REFRESH_MS);
    setInterval(() => { if (navWallet() !== wallet && !busy) load(); }, 2000);
  }
  if (window.flyI18n) start();
  else {
    let started = false;
    const go_ = () => { if (!started) { started = true; start(); } };
    window.addEventListener("i18n:ready", go_, { once: true });
    setTimeout(go_, 2500);
  }
})();
