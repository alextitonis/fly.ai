/** docs/otc.html (2026-11-08): private FLYAI sales on FlyOTC (flytrade/contracts/src/FlyOTC.sol).
 *  /otc?id=N  = that sale: amount, price, the one wallet it is for, status; the buyer pays (approve + buy) or claims a
 *               lock, the seller (or the owner) takes the FLYAI back while it is still open.
 *  /otc       = a team seller's "New sale" form + the latest sales; anyone else sees the sales made for their wallet.
 *  Reads: the public Robinhood RPC. Writes: the site's wallet module (as flylock.js). Not in the nav or sitemap. */

// FlyOTC proxy, deployed 2026-11-08 (impl 0xa28f…3f1a, ProxyAdmin 0x5800…eE06 owned by dev; verified on Etherscan +
// Sourcify). Locally ?otc=0x…&rpc=… override both.
const LIVE_OTC = "0xc3cf6b50fB23B17E4Aedd1135B3d4CF88A76Cddd";
const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const q = new URLSearchParams(location.search);
const OTC = (local && q.get("otc")) || LIVE_OTC;
const RPC = (local && q.get("rpc")) || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN = 4663;
const ACCOUNT_JS = "/compute/mine/web/account.js";
const EXPLORER = "https://robin.etherscan.io";
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const PAY = [
  { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
  { address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", symbol: "NVDA", decimals: 18 },
];
const SEL = {
  sale: "0x96032702", saleCount: "0xa1e89aec", salesOf: "0xdd880609", isSeller: "0xee95feaf", owner: "0x8da5cb5b",
  createSale: "0x356437d2", buy: "0xd96a094a", claim: "0x379607f5", cancel: "0x40e58ee5",
  approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231",
};
const STATUS = ["none", "Open", "Bought, locked", "Cancelled", "Done"];

const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
};
const lc = (a) => String(a || "").toLowerCase();
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const word = (v) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0"));
const addr = (w) => "0x" + w.toString(16).padStart(64, "0").slice(24);
const payInfo = (a) => PAY.find((p) => lc(p.address) === lc(a)) || { address: a, symbol: short(a), decimals: 18 };

function units(v, dec) {                       // bigint -> "1,234.56"
  const base = 10n ** BigInt(dec);
  const whole = v / base;
  let frac = (v % base).toString().padStart(dec, "0").replace(/0+$/, "").slice(0, 6);
  return whole.toLocaleString("en-US") + (frac ? "." + frac : "");
}
function parseUnits(s, dec) {                  // "1,234.5" -> bigint, or null
  s = String(s || "").replace(/[,_\s]/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  if (f.length > dec) return null;
  return BigInt(w || "0") * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
}
const when = (sec) => new Date(Number(sec) * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function call(to, data) {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
  const b = await r.json();
  if (b.error) throw new Error(b.error.message || "RPC error");
  return (String(b.result).slice(2).match(/.{64}/g) || []).map((w) => BigInt("0x" + w));
}
async function readSale(id) {
  const w = await call(OTC, SEL.sale + word(id));
  return { id: Number(id), seller: addr(w[0]), buyer: addr(w[1]), payToken: addr(w[2]), payTo: addr(w[3]), flyai: w[4],
    price: w[5], expires: Number(w[6]), lockSecs: Number(w[7]), lockUntil: Number(w[8]), status: Number(w[9]) };
}
const count = async () => Number((await call(OTC, SEL.saleCount))[0]);
const balance = async (token, who) => (await call(token, SEL.balanceOf + word(who)))[0];
const allowance = async (token, who) => (await call(token, SEL.allowance + word(who) + word(OTC)))[0];

let market = null;                             // FLYAI in USD, for the "vs market" line
fetch(`https://api.dexscreener.com/latest/dex/tokens/${FLYAI}`).then((r) => r.json())
  .then((d) => { const p = (d.pairs || [])[0]; market = p ? Number(p.priceUsd) : null; draw(); }).catch(() => {});

let acct = null;
let wallet = null;
let seller = false;
let owner = null;
const saleId = q.get("id") ?? (location.hash.match(/^#(\d+)$/) || [])[1] ?? null;

function msgEl() { return el("p", { class: "otc-msg", id: "otc-msg" }); }
function say(text, kind = "") { const m = $("otc-msg"); if (m) { m.textContent = text || ""; m.className = `otc-msg${kind ? " " + kind : ""}`; } }
const errText = (err) => (acct ? acct.errorText(err) : String((err && (err.shortMessage || err.message)) || err));

/** one or more wallet transactions in a row, with the message line kept up to date */
async function run(btn, steps) {
  btn.disabled = true;
  try {
    for (const [label, to, data] of steps) {
      say(label + ": confirm in your wallet…");
      const hash = await acct.transact(to, data, () => {}, CHAIN);
      say(label + ": waiting for the chain…");
      await acct.mined(hash, CHAIN);
    }
    return true;
  } catch (err) {
    say(errText(err), "err");
    btn.disabled = false;
    return false;
  }
}

function signInRow() {
  return el("div", { class: "otc-row" },
    el("button", { class: "btn red", type: "button", "data-nav-signin": true, on: { click: () => acct && acct.signIn().catch((e) => say(errText(e), "err")) } }, "Sign in with your wallet"));
}

// ---- one sale ----

async function showSale(id) {
  const main = $("otc-main");
  let s;
  try { s = await readSale(id); } catch { main.replaceChildren(el("p", { class: "otc-muted" }, `There is no sale #${id}.`)); return; }
  const pay = payInfo(s.payToken);
  $("otc-title").textContent = `Private sale #${s.id}`;
  document.title = `Private sale #${s.id} | fly.ai`;
  const now = Date.now() / 1000;
  const expired = s.status === 1 && s.expires && now >= s.expires;
  const label = expired ? "Expired" : STATUS[s.status];
  const kind = s.status === 1 && !expired ? "open" : s.status === 3 || expired ? "off" : "done";
  const flyN = Number(s.flyai) / 1e18;
  const priceN = Number(s.price) / 10 ** pay.decimals;
  const per = flyN ? priceN / flyN : 0;
  const rows = [
    ["Sale ID", `#${s.id}`],
    ["For wallet", s.buyer],
    ["You get", `${units(s.flyai, 18)} FLYAI`],
    ["You pay", `${units(s.price, pay.decimals)} ${pay.symbol}`],
    ["Per FLYAI", `${per.toPrecision(3)} ${pay.symbol}`],
  ];
  if (market && pay.symbol === "USDG") rows.push(["Market now", `$${market.toPrecision(3)} (${((per / market - 1) * 100).toFixed(1)}%)`]);
  rows.push(["Lock", s.lockSecs ? `${Math.round(s.lockSecs / 86400)} days after paying` : "none, FLYAI arrives when you pay"]);
  if (s.expires) rows.push(["Offer ends", when(s.expires)]);
  if (s.status === 2) rows.push(["Unlocks", when(s.lockUntil)]);
  rows.push(["Paid to", s.payTo]);

  const me = lc(wallet);
  const isBuyer = me && me === lc(s.buyer);
  const canCancel = me && (me === lc(s.seller) || me === lc(owner));
  const actions = el("div", { class: "otc-row" });
  const extra = [];
  if (!wallet) {
    if (s.status === 1 && !expired) actions.append(...signInRow().childNodes);
  } else if (isBuyer && s.status === 1 && !expired) {
    const have = await balance(s.payToken, wallet).catch(() => 0n);
    const b = el("button", { class: "btn red", type: "button" }, `Pay ${units(s.price, pay.decimals)} ${pay.symbol}`);
    if (have < s.price) {
      b.disabled = true;
      extra.push(el("p", { class: "otc-hint" }, `Your wallet has ${units(have, pay.decimals)} ${pay.symbol}. Add ${pay.symbol} on Robinhood Chain to pay.`));
    }
    b.addEventListener("click", async () => {
      const steps = [];
      if ((await allowance(s.payToken, wallet)) < s.price) steps.push([`Allow ${pay.symbol}`, s.payToken, SEL.approve + word(OTC) + word(s.price)]);
      steps.push(["Pay", OTC, SEL.buy + word(s.id)]);
      if (await run(b, steps)) { await showSale(id); say(s.lockSecs ? "Paid. Your FLYAI is locked in the contract until the date above." : "Paid. The FLYAI is in your wallet.", "ok"); }
    });
    actions.append(b);
  } else if (isBuyer && s.status === 2) {
    const b = el("button", { class: "btn red", type: "button" }, "Withdraw FLYAI");
    if (now < s.lockUntil) { b.disabled = true; b.textContent = `Unlocks ${when(s.lockUntil)}`; }
    b.addEventListener("click", async () => { if (await run(b, [["Withdraw", OTC, SEL.claim + word(s.id)]])) { await showSale(id); say("Withdrawn to your wallet.", "ok"); } });
    actions.append(b);
  } else if (s.status === 1 && !isBuyer && !canCancel) {
    extra.push(el("p", { class: "otc-hint" }, `This sale is for ${s.buyer}. Sign in with that wallet to buy it.`));
  }
  if (canCancel && s.status === 1) {
    const c = el("button", { class: "btn ghost", type: "button" }, "Cancel and take the FLYAI back");
    c.addEventListener("click", async () => {
      if (!confirm(`Cancel sale #${s.id}? ${units(s.flyai, 18)} FLYAI goes back to ${short(s.seller)}.`)) return;
      if (await run(c, [["Cancel", OTC, SEL.cancel + word(s.id)]])) { await showSale(id); say("Cancelled. The FLYAI is back with the seller.", "ok"); }
    });
    actions.append(c);
  }
  if (canCancel) extra.push(el("p", { class: "otc-hint" }, "Link for the buyer: "), el("div", { class: "otc-link" }, `${location.origin}/otc?id=${s.id}`));

  main.replaceChildren(
    el("div", { class: "otc-top" }, el("h3", {}, `Sale #${s.id}`), el("span", { class: `otc-pill ${kind}` }, label)),
    el("p", { class: "otc-big" }, `${units(s.flyai, 18)} FLYAI for ${units(s.price, pay.decimals)} ${pay.symbol}`),
    el("p", { class: "otc-for" }, `Only ${short(s.buyer)} can buy this.`),
    el("dl", { class: "otc-grid" }, rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
    actions, ...extra, msgEl());
}

// ---- no id: new sale (team sellers) or "your sales" ----

async function listSales(ids, title) {
  const side = $("otc-side");
  if (!ids.length) { side.hidden = true; return; }
  const sales = await Promise.all(ids.map((i) => readSale(i)));
  side.replaceChildren(el("h3", {}, title), el("ul", { class: "otc-list" }, sales.map((s) => {
    const pay = payInfo(s.payToken);
    return el("li", {}, el("a", { href: `/otc?id=${s.id}` }, `#${s.id}`),
      el("span", {}, `${units(s.flyai, 18)} FLYAI · ${units(s.price, pay.decimals)} ${pay.symbol}`),
      el("span", { class: "otc-muted", style: "margin:0" }, `${short(s.buyer)} · ${STATUS[s.status]}`));
  })));
  side.hidden = false;
}

function createForm() {
  const f = el("form", { class: "otc-form" });
  const input = (name, ph, extra = {}) => el("input", { name, placeholder: ph, autocomplete: "off", ...extra });
  f.append(
    el("label", {}, "Buyer wallet (only this wallet can buy)", input("buyer", "0x…", { required: true, spellcheck: "false" })),
    el("div", { class: "otc-two" },
      el("label", {}, "FLYAI to sell", input("flyai", "1000000", { inputmode: "decimal", required: true })),
      el("label", {}, "Paid in", el("select", { name: "pay" }, PAY.map((p) => el("option", { value: p.address }, p.symbol))))),
    el("div", { class: "otc-two" },
      el("label", {}, "Price (total)", input("price", "190", { inputmode: "decimal", required: true })),
      el("label", {}, "Lock after paying (days, 0 = none)", input("lock", "0", { inputmode: "numeric", value: "0" }))),
    el("div", { class: "otc-two" },
      el("label", {}, "Offer ends in (days, 0 = never)", input("expires", "0", { inputmode: "numeric", value: "0" })),
      el("label", {}, "Payment goes to (empty = your wallet)", input("payTo", "0x…", { spellcheck: "false" }))),
    el("p", { class: "otc-hint", id: "otc-preview" }, ""),
    el("div", { class: "otc-row" }, el("button", { class: "btn red", type: "submit" }, "Create sale")),
    msgEl());
  const preview = () => {
    const d = new FormData(f);
    const pay = payInfo(d.get("pay"));
    const a = Number(String(d.get("flyai")).replace(/,/g, "")), p = Number(String(d.get("price")).replace(/,/g, ""));
    let text = a > 0 && p > 0 ? `${(p / a).toPrecision(3)} ${pay.symbol} per FLYAI` : "";
    if (text && market && pay.symbol === "USDG") text += ` · market $${market.toPrecision(3)} (${((p / a / market - 1) * 100).toFixed(1)}%)`;
    $("otc-preview").textContent = text;
  };
  f.addEventListener("input", preview);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    const pay = payInfo(d.get("pay"));
    const buyer = String(d.get("buyer")).trim();
    const payTo = String(d.get("payTo") || "").trim();
    const fly = parseUnits(d.get("flyai"), 18);
    const price = parseUnits(d.get("price"), pay.decimals);
    const lockDays = Number(d.get("lock") || 0), expDays = Number(d.get("expires") || 0);
    const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
    if (!isAddr(buyer)) return say("The buyer wallet isn't a valid address.", "err");
    if (payTo && !isAddr(payTo)) return say("'Payment goes to' isn't a valid address.", "err");
    if (!fly || !price) return say("Enter the FLYAI amount and the price.", "err");
    if (!(lockDays >= 0 && lockDays <= 730) || !(expDays >= 0)) return say("Lock is 0–730 days; the end is 0 or more days.", "err");
    const have = await balance(FLYAI, wallet);
    if (have < fly) return say(`Your wallet has ${units(have, 18)} FLYAI.`, "err");
    const lockSecs = BigInt(Math.round(lockDays * 86400));
    const expires = expDays ? BigInt(Math.floor(Date.now() / 1000 + expDays * 86400)) : 0n;
    const steps = [];
    if ((await allowance(FLYAI, wallet)) < fly) steps.push(["Allow FLYAI", FLYAI, SEL.approve + word(OTC) + word(fly)]);
    steps.push(["Create sale", OTC, SEL.createSale + word(buyer) + word(fly) + word(pay.address) + word(price)
      + word(payTo || "0x0") + word(expires) + word(lockSecs)]);
    const btn = f.querySelector("button[type=submit]");
    if (!(await run(btn, steps))) return;
    const id = (await count()) - 1;
    location.href = `/otc?id=${id}`;
  });
  return f;
}

async function showHome() {
  const main = $("otc-main");
  if (!wallet) {
    main.replaceChildren(el("p", { class: "otc-muted" }, "Open the sale link you were sent, or sign in to see the sales made for your wallet."), signInRow(), msgEl());
    $("otc-side").hidden = true;
    return;
  }
  if (seller) {
    main.replaceChildren(el("h3", {}, "New sale"), el("p", { class: "otc-muted" },
      "The FLYAI moves from your wallet into the contract and waits for the buyer. You can cancel and take it back until they pay."), createForm());
    const n = await count();
    const ids = []; for (let i = n - 1; i >= 0 && ids.length < 30; i--) ids.push(i);
    await listSales(ids, "Latest sales");
  } else {
    const ids = (await call(OTC, SEL.salesOf + word(wallet))).slice(2).map(Number).reverse();
    main.replaceChildren(el("p", { class: "otc-muted" }, ids.length ? "Sales made for your wallet:" : "There are no sales for this wallet. Open the link you were sent."));
    await listSales(ids, "Your sales");
  }
}

let drawing = null;
let again = false;
async function draw() {
  if (!OTC) { $("otc-main").replaceChildren(el("p", { class: "otc-muted" }, "Private sales open soon.")); return; }
  if (drawing) { again = true; return drawing; }
  drawing = (async () => {
    try {
      if (wallet) {
        seller = (await call(OTC, SEL.isSeller + word(wallet)))[0] === 1n;
        owner = owner || addr((await call(OTC, SEL.owner))[0]);
      } else seller = false;
      if (saleId !== null && /^\d+$/.test(saleId)) await showSale(saleId); else await showHome();
    } catch (err) {
      console.warn("otc:", err);
      $("otc-main").replaceChildren(el("p", { class: "otc-msg err" }, "Couldn't read the sale from the chain. Try again in a moment."));
    } finally {
      drawing = null;
      if (again) { again = false; draw(); }       // the wallet changed (or prices came in) while drawing
    }
  })();
  return drawing;
}

$("otc-contract").href = OTC ? `${EXPLORER}/address/${OTC}` : "#";
try {
  acct = await import(ACCOUNT_JS);
  acct.onAccount((w) => { wallet = w; draw(); });
  wallet = acct.signedIn();
} catch (err) {
  console.warn("otc: wallet module", err);
  wallet = window.flyNav?.session?.()?.wallet || null;
}
draw();
