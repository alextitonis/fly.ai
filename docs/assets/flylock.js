/**
 * Locked $FLYAI in the account menu (2026-10-27, the user: "the profile should show if they have it, if not don't show
 * it at all ... a popup showing and a button to withdraw"). FLYAI we send through FlyLock
 * (flytrade/contracts/src/FlyLock.sol) is locked 7 days from when it arrives; it counts like a stake meanwhile.
 * nav.js loads this for a signed-in wallet and calls window.flyLock.mount(li, wallet): with nothing locked or waiting
 * the item stays hidden, otherwise "🔒 1.2M FLYAI locked" opens a popup with each lock's unlock time and Withdraw.
 * Reads: the public Robinhood RPC. Writes: the site's one wallet module (/compute/mine/web/account.js, as deskstake.js).
 */
(function () {
  "use strict";
  // FlyLock's proxy (deployed 2026-10-27; also flytrade/web/src/chain.ts FLYLOCK); empty = nothing shows
  const FLYLOCK = "0x87Ded9d9788a1F6653A0261eF84c56658D0bf5e9";
  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const CHAIN = 4663;
  const ACCOUNT_JS = "/compute/mine/web/account.js";
  const SEL = { lockedOf: "0xa5f1e282", locksOf: "0xc3f9ab58", locks: "0xf4dadc61", claimAll: "0xd1058e59" };
  const WEI = 10n ** 18n;
  const EN = {
    button: "🔒 {amount} FLYAI locked", title: "Locked FLYAI",
    intro: "FLYAI sent to you locked. Each amount unlocks 7 days after it arrived, and counts like a stake until then.",
    unlocksAt: "unlocks {t}", ready: "ready", total: "Ready to withdraw: {amount} FLYAI", withdraw: "Withdraw",
    nothingReady: "Nothing ready yet", confirm: "Confirm in your wallet…", waiting: "Waiting for the chain…",
    done: "Withdrawn to your wallet", close: "Close",
  };

  const lang = () => (window.flyI18n && window.flyI18n.lang) || "en";
  function t(key, vars) {
    let v = window.flyI18n ? window.flyI18n.t("common.lock." + key, vars) : null;
    if (!v || v === "common.lock." + key) v = EN[key].replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
    return v;
  }
  const fmt = (wei) => {
    const n = Number(wei / WEI) + Number(wei % WEI) / 1e18;
    return new Intl.NumberFormat(lang(), { notation: n >= 1e6 ? "compact" : "standard", maximumFractionDigits: n >= 1e6 ? 2 : 0 }).format(n);
  };
  const when = (sec) => new Intl.DateTimeFormat(lang(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(sec * 1000));

  const word = (v) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
  async function call(input) {
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: FLYLOCK, data: input }, "latest"] }) });
    const b = await r.json();
    if (b.error) throw new Error(b.error.message || "RPC error");
    return (String(b.result).slice(2).match(/.{64}/g) || []).map((w) => BigInt("0x" + w));
  }

  /** { locked, ready, rows: [{ amount, claimed, end }] } - locked = still waiting, ready = unlocked but not withdrawn */
  async function load(wallet) {
    const ids = await call(SEL.locksOf + word(wallet));      // [offset, length, ...ids]
    const list = ids.slice(2);
    const rows = await Promise.all(list.map(async (id) => {
      const [, , end, amount, claimed] = await call(SEL.locks + word(id));
      return { amount, claimed, end: Number(end) };
    }));
    const now = Date.now() / 1000;
    let locked = 0n, ready = 0n;
    for (const r of rows) {
      const left = r.amount - r.claimed;
      if (r.end <= now) ready += left; else locked += left;
    }
    return { locked, ready, rows: rows.filter((r) => r.amount > r.claimed).sort((a, b) => a.end - b.end) };
  }

  let css = null;
  function style() {
    if (css) return;
    css = document.createElement("style");
    css.textContent = `.flylock-btn { width: 100%; text-align: left; background: none; border: 0; color: var(--mint, #5ef2cc);
        font: 600 14px/1.4 var(--sans, inherit); padding: 6px 0; cursor: pointer; }
      .flylock-back { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.6); display: flex; align-items: center;
        justify-content: center; padding: 16px; }
      .flylock-pop { background: var(--bg, #0b0b0b); color: var(--fg, #fff); border: 1px solid var(--line, #2a2a2a);
        border-radius: 16px; width: min(420px, 100%); max-height: 85vh; overflow: auto; padding: 20px; font: 14px/1.5 var(--sans, inherit); }
      .flylock-pop h3 { margin: 0 0 6px; font-size: 18px; }
      .flylock-pop p { margin: 0 0 12px; opacity: .75; }
      .flylock-pop ul { list-style: none; margin: 0 0 14px; padding: 0; }
      .flylock-pop li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line, #2a2a2a); }
      .flylock-pop li small { opacity: .7; }
      .flylock-pop li.ok small { color: var(--mint, #5ef2cc); opacity: 1; }
      .flylock-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
      .flylock-msg { display: block; min-height: 1.4em; margin-top: 8px; opacity: .8; }`;
    document.head.append(css);
  }

  function popup(wallet, state, refresh) {
    style();
    const back = document.createElement("div");
    back.className = "flylock-back";
    const pop = document.createElement("div");
    pop.className = "flylock-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "true");
    const h = Object.assign(document.createElement("h3"), { textContent: t("title") });
    const intro = Object.assign(document.createElement("p"), { textContent: t("intro") });
    const list = document.createElement("ul");
    const now = Date.now() / 1000;
    for (const r of state.rows) {
      const li = document.createElement("li");
      if (r.end <= now) li.className = "ok";
      li.append(Object.assign(document.createElement("span"), { textContent: fmt(r.amount - r.claimed) + " FLYAI" }),
        Object.assign(document.createElement("small"), { textContent: r.end <= now ? t("ready") : t("unlocksAt", { t: when(r.end) }) }));
      list.append(li);
    }
    const total = Object.assign(document.createElement("p"), { textContent: state.ready > 0n ? t("total", { amount: fmt(state.ready) }) : t("nothingReady") });
    const msg = Object.assign(document.createElement("small"), { className: "flylock-msg" });
    const go = Object.assign(document.createElement("button"), { type: "button", className: "btn sm", textContent: t("withdraw"), disabled: state.ready === 0n });
    const shut = Object.assign(document.createElement("button"), { type: "button", className: "btn sm ghost", textContent: t("close") });
    const row = document.createElement("div");
    row.className = "flylock-row";
    row.append(shut, go);
    pop.append(h, intro, list, total, row, msg);
    back.append(pop);
    const close = () => { back.remove(); document.removeEventListener("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    shut.addEventListener("click", close);
    go.addEventListener("click", async () => {
      go.disabled = true;
      let acct = null;
      try {
        acct = await import(ACCOUNT_JS);
        const hash = await acct.transact(FLYLOCK, SEL.claimAll, () => { msg.textContent = t("confirm"); }, CHAIN);
        msg.textContent = t("waiting");
        await acct.mined(hash, CHAIN);
        msg.textContent = t("done");
        total.textContent = t("nothingReady");
        refresh();
      } catch (err) {
        msg.textContent = acct ? acct.errorText(err) : String((err && (err.shortMessage || err.message)) || err);
        go.disabled = false;
      }
    });
    document.body.append(back);
    go.focus();
  }

  window.flyLock = {
    /** Fills `li` (hidden until there is something) with the button for `wallet`; never throws. */
    mount(li, wallet) {
      if (!FLYLOCK || !li || !wallet) return;
      style();
      const draw = () => load(wallet).then((state) => {
        li.replaceChildren();
        if (state.locked === 0n && state.ready === 0n) { li.hidden = true; return; }
        const b = Object.assign(document.createElement("button"), { type: "button", className: "flylock-btn",
          textContent: t("button", { amount: fmt(state.locked + state.ready) }) });
        b.addEventListener("click", (e) => { e.stopPropagation(); popup(wallet, state, draw); });
        li.append(b);
        li.hidden = false;
      }).catch(() => { li.hidden = true; });
      draw();
    },
  };
})();
