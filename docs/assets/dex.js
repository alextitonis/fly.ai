/** docs/dex.html (2026-10-30, flytrade/LAUNCHPAD-PLAN.md "Fly DEX"): every launchpad token, listed by itself from the
 *  mine's /api/launchpad/markets, with a token page (/dex?t=<address>) and a swap box from the visitor's own wallet.
 *  Quotes come straight from the chain (the quoter or the launchpad), and the calldata from assets/dexswap.js.
 *  A token's name, symbol and logo are whatever its creator typed: text only, through el(). */
import { t, locale } from "./i18n/i18n.js";
import { FLYAI, USDG, routeOf, isEth, ethQuoteCall, quoteCall, spenderOf, swapTxs, units, floorOf, word } from "./dexswap.js?v=20261030b";

const NAV = window.flyNav;
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API = (LOCAL && new URLSearchParams(location.search).get("api")) || NAV?.MINE_READ || "https://flyai-mine.fly.dev";
const ACCOUNT_JS = "/compute/mine/web/account.js";
const CHAIN = 4663;
const RPC = (LOCAL && new URLSearchParams(location.search).get("rpc")) || "https://rpc.mainnet.chain.robinhood.com";
const REFRESH_MS = 30_000;
const HIGH_COST_PCT = 10;                             // the box warns from here (fees and price impact together)
const GAS_KEEP = 3n * 10n ** 14n;                     // Max on ETH leaves 0.0003 ETH for this swap's gas
if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 3000); });

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
async function get(path) {
  const r = await fetch(API + path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}
const ethCall = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---- numbers ---------------------------------------------------------------------------------------------------
const num = (x, d = 2) => Number(x).toLocaleString(locale(), { maximumFractionDigits: d });
const usd = (x) => (x == null ? "–" : `$${Number(x).toLocaleString(locale(), { notation: Math.abs(x) >= 100_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 2 })}`);
/** A tiny price stays readable: $0.0₅164 is five zeros, then 164. */
function price(x) {
  if (x == null || !(x > 0)) return "–";
  if (x >= 0.01) return `$${num(x, x >= 1 ? 2 : 4)}`;
  const zeros = Math.ceil(-Math.log10(x)) - 1;
  const digits = Math.round(x * 10 ** (zeros + 3)).toString();
  const sub = String(zeros).replace(/\d/g, (c) => "₀₁₂₃₄₅₆₇₈₉"[Number(c)]);
  return zeros >= 3 ? `$0.0${sub}${digits}` : `$${x.toFixed(zeros + 3)}`;
}
const change = (x) => (x == null ? "–" : `${x > 0 ? "+" : ""}${num(x, Math.abs(x) >= 100 ? 0 : 1)}%`);
const changeClass = (x) => (x == null || x === 0 ? "" : x > 0 ? "up" : "down");
const short = (w) => `${w.slice(0, 6)}…${w.slice(-4)}`;
function ago(v) {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return t("dex.time.s", { n: Math.floor(s) });
  if (s < 3600) return t("dex.time.m", { n: Math.floor(s / 60) });
  if (s < 86400) return t("dex.time.h", { n: Math.floor(s / 3600) });
  return t("dex.time.d", { n: Math.floor(s / 86400) });
}
const decimal = (raw, decimals, keep = 6) => {
  const one = 10n ** BigInt(decimals);
  const frac = (raw % one).toString().padStart(decimals, "0").slice(0, keep).replace(/0+$/, "");
  return (raw / one).toString() + (frac ? `.${frac}` : "");
};

// ---- the logo: an image from ipfs:// or https://, else the first letter on a colour of its own -------------------
function logo(m) {
  const hue = parseInt(m.token.slice(-4), 16) % 360;
  const box = el("span", { class: "dex-logo", style: `background:hsl(${hue} 70% 68%)`, "aria-hidden": "true" }, (m.symbol || "?").slice(0, 1).toUpperCase());
  const uri = String(m.uri || "");
  const src = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri.startsWith("https://") ? uri : "";
  if (src) {
    const img = el("img", { src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => { box.replaceChildren(img); });
  }
  return box;
}
const stateTag = (m) => (m.state === "graduated" ? el("span", { class: "dex-tag grad" }, t("dex.state.tagGraduated"))
  : m.state === "sold_out" ? el("span", { class: "dex-tag" }, t("dex.state.tagSoldOut")) : null);

// ---- the listing -------------------------------------------------------------------------------------------------
const list = { sort: "trending", state: "all", q: "", at: 0 };
function row(m) {
  const curve = m.state !== "graduated";
  return el("tr", { "data-href": `/dex?t=${m.token}`, on: { click: () => { location.href = `dex?t=${m.token}${LOCAL && location.search.includes("api=") ? `&api=${encodeURIComponent(API)}` : ""}`; } } },
    el("td", {}, el("div", { class: "dex-who" }, logo(m), el("div", {},
      el("b", {}, m.name, stateTag(m)),
      el("small", {}, `${m.symbol} · ${short(m.token)}`),
      curve ? el("span", { class: "dex-mini", title: `${num(m.progress_pct, 0)}%` }, el("i", { style: `width:${Math.min(100, m.progress_pct)}%` })) : null))),
    el("td", { class: "dex-num" }, price(m.price_usd)),
    el("td", { class: `dex-num ${changeClass(m.change_24h)}` }, change(m.change_24h)),
    el("td", { class: "dex-num" }, usd(m.volume_24h)),
    el("td", { class: "dex-num opt" }, num(m.traders_24h, 0)),
    el("td", { class: "dex-num opt" }, usd(m.liquidity_usd)),
    el("td", { class: "dex-num" }, usd(m.mcap_usd)),
    el("td", { class: "dex-num opt" }, num(m.holders, 0)));
}
/** $FLYAI stays on top of the unfiltered list: every graduated pool is paired with it. */
function flyaiRow(d) {
  return el("tr", { "data-href": "/token", on: { click: () => { location.href = "token.html"; } } },
    el("td", {}, el("div", { class: "dex-who" }, el("img", { class: "dex-logo", src: "assets/flyai-icon.svg", alt: "" }), el("div", {},
      el("b", {}, "$FLYAI", el("span", { class: "dex-tag own" }, t("dex.state.tagOwn"))), el("small", {}, `FLYAI · ${short(FLYAI)}`)))),
    el("td", { class: "dex-num" }, price(d.flyai_usd)),
    el("td", { class: "dex-num" }, "–"), el("td", { class: "dex-num" }, "–"), el("td", { class: "dex-num opt" }, "–"), el("td", { class: "dex-num opt" }, "–"),
    el("td", { class: "dex-num" }, d.flyai_usd ? usd(d.flyai_usd * 950_000_000) : "–"), el("td", { class: "dex-num opt" }, "–"));
}
async function loadList() {
  const stamp = ++list.at;
  const q = new URLSearchParams({ sort: list.sort, state: list.state, limit: "100", ...(list.q ? { q: list.q } : {}) });
  let d;
  try { d = await get(`/api/launchpad/markets?${q}`); } catch (err) {
    if (err.status === 404) { $("dex-closed").hidden = false; $("dex-list").hidden = true; }
    return;
  }
  if (stamp !== list.at) return;                      // a newer filter is on its way
  $("dex-closed").hidden = true;
  $("dex-list").hidden = false;
  $("dex-totals").replaceChildren(
    el("span", {}, t("dex.totals.launches"), el("b", {}, num(d.totals.launches, 0))),
    el("span", {}, t("dex.totals.graduated"), el("b", {}, num(d.totals.graduated, 0))),
    el("span", {}, t("dex.totals.volume"), el("b", {}, usd(d.totals.volume_usd))));
  const rows = d.markets.map(row);
  if (list.state === "all" && !list.q) rows.unshift(flyaiRow(d));
  if (!d.markets.length) rows.push(el("tr", {}, el("td", { class: "dex-empty", colspan: "8" }, t(list.q ? "dex.list.noMatch" : "dex.list.empty"))));
  $("dex-rows").replaceChildren(...rows);
}
function startList() {
  $("dex-list").hidden = false;
  for (const [box, key] of [["dex-sort", "sort"], ["dex-state", "state"]]) {
    for (const b of $(box).querySelectorAll("button")) {
      b.addEventListener("click", () => {
        list[key] = b.dataset[key];
        for (const o of $(box).querySelectorAll("button")) o.classList.toggle("on", o === b);
        loadList();
      });
    }
  }
  let typing = null;
  $("dex-q").addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => { list.q = $("dex-q").value.trim(); loadList(); }, 300);
  });
  loadList();
  setInterval(() => { if (!document.hidden) loadList(); }, REFRESH_MS);
}

// ---- the token page ----------------------------------------------------------------------------------------------
let tok = null;
function chart(points, graduatedAt) {
  const box = $("dex-chart");
  if (points.length < 2) { box.replaceChildren(el("p", { class: "dex-muted" }, t("dex.token.noChart"))); return; }
  const W = 800, H = 280, PAD = 10;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1, lo = Math.min(...ys), hi = Math.max(...ys);
  const X = (v) => (x1 === x0 ? W / 2 : ((v - x0) / (x1 - x0)) * W);
  const Y = (v) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2));
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("");
  const up = ys[ys.length - 1] >= ys[0];
  const colour = up ? "var(--mint)" : "var(--red-hi)";
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("dex.token.chartAria"));
  const path = (d, attrs) => { const e = document.createElementNS(NS, "path"); e.setAttribute("d", d); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.append(e); };
  path(`${line}L${W} ${H}L0 ${H}Z`, { fill: colour, "fill-opacity": ".08" });
  path(line, { fill: "none", stroke: colour, "stroke-width": "2", "vector-effect": "non-scaling-stroke" });
  if (graduatedAt) {
    const g = new Date(graduatedAt).getTime();
    if (g > x0 && g < x1) path(`M${X(g).toFixed(1)} 0V${H}`, { stroke: "var(--muted)", "stroke-dasharray": "4 4", "vector-effect": "non-scaling-stroke" });
  }
  const tip = el("div", { class: "tip" }, `${price(ys[ys.length - 1])} · ${t("dex.token.points", { n: num(points.length, 0) })}`);
  svg.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const at = x0 + ((e.clientX - r.left) / r.width) * (x1 - x0);
    const p = points.reduce((a, b) => (Math.abs(b[0] - at) < Math.abs(a[0] - at) ? b : a));
    tip.textContent = `${price(p[1])} · ${new Date(p[0]).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  });
  box.replaceChildren(svg, tip);
}
function drawToken(m) {
  document.title = `${m.symbol}: ${m.name} · Fly DEX`;
  const explorer = m.explorer;
  $("dex-tokenhead").replaceChildren(logo(m), el("div", {},
    el("h1", {}, m.name, stateTag(m)),
    el("p", { class: "dex-addr" }, `${m.symbol} · `, el("a", { href: `${explorer}/token/${m.token}`, target: "_blank", rel: "noopener" }, m.token))),
    el("div", { class: "dex-headprice" }, price(m.price_usd)));
  const fact = (k, v) => el("div", {}, el("span", {}, t(k)), el("b", {}, v));
  $("dex-facts").replaceChildren(
    fact("dex.col.mcap", usd(m.mcap_usd)), fact("dex.col.liquidity", usd(m.liquidity_usd)), fact("dex.token.volume", usd(m.volume_usd)),
    fact("dex.col.holders", num(m.holders ?? 0, 0)), fact("dex.token.tradeCount", num(m.trade_count, 0)),
    fact("dex.token.creatorTax", m.state === "graduated" ? t("dex.token.taxNone") : `${num((m.creator_tax_bps ?? 0) / 100, 2)}%`));
  const warn = $("dex-warn");
  warn.hidden = !m.bundles?.length;
  if (m.bundles?.length) warn.textContent = t("dex.token.bundled");
  const prog = $("dex-progress");
  prog.hidden = m.state !== "curve";
  if (m.state === "curve") prog.replaceChildren(t("dex.token.progress", { raised: usd(m.raised_usd), target: usd(m.target_usd) }),
    el("div", { class: "bar" }, el("i", { style: `width:${Math.min(100, m.progress_pct)}%` })));
  chart(m.chart, m.graduated_at);
  const trades = m.trades.map((x) => el("tr", {},
    el("td", {}, ago(x.at)), el("td", { class: x.buy ? "dex-up" : "dex-down" }, t(x.buy ? "dex.swap.buy" : "dex.swap.sell")),
    el("td", { class: "dex-num" }, usd(x.usd)), el("td", { class: "dex-num" }, price(x.price_usd)),
    el("td", { class: "opt" }, t(x.venue === "pool" ? "dex.trades.pool" : "dex.trades.curve")),
    el("td", {}, el("a", { href: `${explorer}/address/${x.trader}`, target: "_blank", rel: "noopener" }, short(x.trader)))));
  $("dex-trades").replaceChildren(...(trades.length ? trades : [el("tr", {}, el("td", { class: "dex-empty", colspan: "6" }, t("dex.token.noTrades")))]));
  $("dex-holders").replaceChildren(...m.holders_top.slice(0, 15).map((h) => el("li", {},
    el("a", { href: `${explorer}/address/${h.wallet}`, target: "_blank", rel: "noopener" }, short(h.wallet)), el("span", {}, `${num(h.pct, 2)}%`))));
}
async function loadToken(addr) {
  try {
    const m = await get(`/api/launchpad/token/${addr}`);
    const moved = tok && tok.state !== m.state;
    tok = m;
    $("dex-closed").hidden = true;
    $("dex-token").hidden = false;
    drawToken(m);
    if (moved || !box.ready) box.setup();
  } catch (err) {
    if (!tok) { $("dex-closed").hidden = false; $("dex-token").hidden = true; }
  }
}

// ---- the swap box ------------------------------------------------------------------------------------------------
let acct = null;
const loadAcct = () => (acct ? Promise.resolve(acct) : import(ACCOUNT_JS).then((m) => (acct = m)).catch(() => null));
const box = {
  ready: false, side: "buy", wallet: null, quote: null, bal: null, timer: null, busy: false,
  graduated: () => tok.state === "graduated",
  // the one choice: a curve buy pays USDG or ETH. Otherwise the pair decides: graduated is FLYAI, a curve sale pays USDG
  pay: () => $("swap-pay").value || "USDG",
  route: () => routeOf({ state: tok.state, token: tok.token, side: box.side, pay: box.pay() }),
  decimalsOf: (a) => (a.toLowerCase() === USDG.toLowerCase() ? 6 : 18),
  symbolOf(a) {
    const l = a.toLowerCase();
    return l === tok.token ? tok.symbol : l === FLYAI.toLowerCase() ? "FLYAI" : l === USDG.toLowerCase() ? "USDG" : "ETH";
  },
  usdOf(a, raw) {                                     // for the cost line (ETH goes by the USDG it quotes to)
    const x = Number(decimal(raw, box.decimalsOf(a), 8));
    const l = a.toLowerCase();
    return l === USDG.toLowerCase() ? x : l === FLYAI.toLowerCase() ? x * (tok.flyai_usd || 0) : x * tok.price_usd;
  },
  msg(text, kind = "") { $("swap-msg").textContent = text || ""; $("swap-msg").className = `dex-msg${kind ? ` ${kind}` : ""}`; },
  setup() {
    box.ready = true;
    const grad = box.graduated();
    $("swap-pay").replaceChildren(...["USDG", "ETH"].map((s) => el("option", { value: s }, s)));
    $("swap-fees").textContent = grad ? t("dex.swap.feesPool") : t("dex.swap.feesCurve", { tax: num((tok.creator_tax_bps ?? 0) / 100, 2) });
    if (!grad && tok.paused) box.msg(t("dex.swap.paused"), "err");
    box.defaultAmount();
    box.draw();
    box.refresh();
    box.loadBalance();
  },
  defaultAmount() { $("swap-amount").value = box.side === "buy" ? (box.graduated() ? "100000" : "25") : ""; },
  draw() {
    for (const b of $("swap-side").querySelectorAll("button")) b.classList.toggle("on", b.dataset.side === box.side);
    const selling = box.side === "sell";
    const choice = !selling && !box.graduated();
    $("swap-pay").hidden = !choice;
    $("swap-paysym").hidden = choice;
    $("swap-paysym").textContent = selling ? tok.symbol : "FLYAI";
    $("swap-paylabel").textContent = t(selling ? "dex.swap.youSell" : "dex.swap.pay");
    $("swap-go").textContent = !box.wallet ? t("dex.swap.connect") : t(selling ? "dex.swap.sell" : "dex.swap.buy");
    $("swap-go").disabled = !box.graduated() && !!tok.paused;
  },
  amount() { return units($("swap-amount").value, box.decimalsOf(box.route().tin)); },
  refresh() {
    clearTimeout(box.timer);
    box.quote = null;
    $("swap-out").textContent = "–";
    $("swap-detail").textContent = "";
    $("swap-detail").className = "dex-detail";
    if (!box.busy) box.msg(box.graduated() || !tok.paused ? "" : t("dex.swap.paused"), box.graduated() || !tok.paused ? "" : "err");
    box.timer = setTimeout(async () => {
      const route = box.route(), amount = box.amount();
      if (!amount || amount <= 0n) return;
      const key = `${box.side}:${box.pay()}:${amount}`;
      box.for = key;
      try {
        const usdg = isEth(route) ? BigInt((await ethCall(...ethQuoteCall(amount))).slice(0, 66)) : null;
        const [to, data] = quoteCall(route, usdg ?? amount, tok.launchpad);
        const ret = await ethCall(to, data);
        if (box.for !== key) return;
        const out = BigInt(ret.slice(0, 66));
        if (out <= 0n) throw new Error("no quote");
        box.quote = { route, amount, out, usdg };
        const got = Number(decimal(out, box.decimalsOf(route.tout), 6));
        $("swap-out").textContent = `${num(got, got >= 1000 ? 0 : 4)} ${box.symbolOf(route.tout)}`;
        const inUsd = usdg != null ? Number(decimal(usdg, 6, 6)) : box.usdOf(route.tin, amount), outUsd = box.usdOf(route.tout, out);
        if (inUsd > 0 && outUsd > 0) {
          const cost = (1 - outUsd / inUsd) * 100;
          $("swap-detail").textContent = t("dex.swap.cost", { pct: num(Math.max(0, cost), 2) });
          if (cost >= HIGH_COST_PCT) {
            $("swap-detail").textContent = t("dex.swap.costHigh", { pct: num(cost, 1) });
            $("swap-detail").className = "dex-detail bad";
          }
        }
        if (!box.busy) box.msg("");
      } catch (e) {
        if (box.for === key && !box.busy) box.msg(t("dex.swap.noQuote"), "err");
      }
    }, 350);
  },
  async loadBalance() {
    const tin = box.route().tin, who = box.wallet;
    if (!who) { box.bal = null; $("swap-balrow").hidden = true; return; }
    try {
      const raw = BigInt(isEth(box.route()) ? await rpc("eth_getBalance", [who, "latest"]) : await ethCall(tin, "0x70a08231" + word(who)));
      if (who !== box.wallet || tin !== box.route().tin) return;
      box.bal = raw;
      $("swap-balrow").hidden = false;
      $("swap-bal").textContent = t("dex.swap.balance", { amt: `${num(decimal(raw, box.decimalsOf(tin), 6), 4)} ${box.symbolOf(tin)}` });
    } catch { $("swap-balrow").hidden = true; }
  },
  async connect() {
    const a = await loadAcct();
    if (!a) { box.msg(t("dex.swap.noWallet"), "err"); return false; }
    const w = await a.requireWallet();
    if (w) { box.wallet = w; box.draw(); box.loadBalance(); }
    return !!w;
  },
  // the wallet's node may lag right after an approve: the same step again a little later, as the $FLYAI box does
  async send(tx) {
    for (let attempt = 0; ; attempt++) {
      try { return await acct.transact(tx.to, tx.data, () => {}, CHAIN, tx.value); } catch (e) {
        const why = String((e && (e.shortMessage || e.details || e.message)) || e);
        if (attempt >= 4 || !/nonce/i.test(why)) throw e;
        await sleep(3000 * (attempt + 1));
      }
    }
  },
  async go() {
    if (box.busy) return;
    if (!box.wallet && !(await box.connect())) return;
    const q = box.quote;
    if (!q) { box.msg(t("dex.swap.noQuote"), "err"); return; }
    if (box.bal != null && q.amount > box.bal) { box.msg(t("dex.swap.notEnough"), "err"); return; }
    box.busy = true;
    $("swap-go").disabled = true;
    try {
      const spender = spenderOf(q.route, tok.launchpad);
      const allowance = spender ? BigInt(await ethCall(q.route.tin, "0xdd62ed3e" + word(box.wallet) + word(spender))) : 0n;
      const slip = $("swap-slip").value;
      const txs = swapTxs({ route: q.route, user: box.wallet, amount: q.amount, minOut: floorOf(q.out, slip),
        minUsdg: q.usdg != null ? floorOf(q.usdg, slip) : 0n,
        allowance, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), launchpad: tok.launchpad });
      let last = null;
      for (let i = 0; i < txs.length; i++) {
        if (i) await sleep(2500);
        box.msg(t("dex.swap.confirm", { n: i + 1, of: txs.length }));
        last = await box.send(txs[i]);
        box.msg(t("dex.swap.waiting"));
        await acct.mined(last, CHAIN);
      }
      box.msg(t("dex.swap.done"), "ok");
      $("swap-msg").append(" ", el("a", { href: `${tok.explorer}/tx/${last}`, target: "_blank", rel: "noopener" }, t("dex.swap.viewTx")));
      box.loadBalance();
      box.refresh();
    } catch (e) {
      const why = acct ? acct.errorText(e) : String((e && e.message) || e);
      const cancelled = (e && (e.code === 4001 || e.cause?.code === 4001)) || /rejected|denied|cancel/i.test(why);
      box.msg(cancelled ? t("dex.swap.cancelled") : t("dex.swap.failed", { why }), "err");
    } finally {
      box.busy = false;
      box.draw();
    }
  },
  start() {
    for (const b of $("swap-side").querySelectorAll("button")) {
      b.addEventListener("click", () => {
        box.side = b.dataset.side;
        box.defaultAmount();
        box.draw(); box.refresh(); box.loadBalance();
      });
    }
    $("swap-amount").addEventListener("input", () => box.refresh());
    $("swap-pay").addEventListener("change", () => {
      $("swap-amount").value = box.pay() === "ETH" ? "0.01" : "25";
      box.refresh(); box.loadBalance();
    });
    $("swap-go").addEventListener("click", () => box.go());
    for (const b of $("dex-swap").querySelectorAll("[data-pct]")) {
      b.addEventListener("click", () => {
        if (box.bal == null) return;
        let amt = box.bal * BigInt(b.dataset.pct) / 100n;
        if (isEth(box.route()) && b.dataset.pct === "100") amt = amt > GAS_KEEP ? amt - GAS_KEEP : 0n;
        $("swap-amount").value = decimal(amt, box.decimalsOf(box.route().tin), 6);
        box.refresh();
      });
    }
    const s = NAV?.session?.();
    if (s?.wallet) box.wallet = s.wallet;
    loadAcct().then((a) => a?.onAccount((w) => { box.wallet = w; if (box.ready) { box.draw(); box.loadBalance(); } }));
  },
};

// ---- which page ----------------------------------------------------------------------------------------------------
const addr = new URLSearchParams(location.search).get("t");
if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
  const a = addr.toLowerCase();
  $("dex-head").hidden = true;
  if (LOCAL && location.search.includes("api=")) $("dex-backlink").href = `dex?api=${encodeURIComponent(API)}`;
  box.start();
  await loadToken(a);
  setInterval(() => { if (!document.hidden) loadToken(a); }, REFRESH_MS);
} else {
  startList();
}
