/** docs/launch.html (2026-10-30, flytrade/LAUNCHPAD-PLAN.md phase 3): the create form. The launch's rules and fee come
 *  from the mine (read on chain there), the calldata from assets/dexswap.js (the fork run sends the same bytes), and the
 *  visitor's own wallet sends it. Once the indexer has it, the visitor goes on to the token's page on the Fly DEX. */
import { t, locale } from "./i18n/i18n.js";
import { USDG, LAUNCHED_TOPIC, createTxs, devQuote, maxDevBuy, launchProblem, units, word } from "./dexswap.js?v=20261030b";

const NAV = window.flyNav;
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const PARAMS = new URLSearchParams(location.search);
const API = (LOCAL && PARAMS.get("api")) || NAV?.MINE_READ || "https://flyai-mine.fly.dev";
const RPC = (LOCAL && PARAMS.get("rpc")) || "https://rpc.mainnet.chain.robinhood.com";
const ACCOUNT_JS = "/compute/mine/web/account.js";
const CHAIN = 4663;
if (!window.flyI18n) await new Promise((r) => { addEventListener("i18n:ready", r, { once: true }); setTimeout(r, 3000); });

const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
};
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const num = (x, d = 2) => Number(x).toLocaleString(locale(), { maximumFractionDigits: d });
const msg = (text, kind = "") => { $("lc-msg").textContent = text || ""; $("lc-msg").className = `dex-msg${kind ? ` ${kind}` : ""}`; };
const carry = LOCAL && PARAMS.get("api") ? `&api=${encodeURIComponent(PARAMS.get("api"))}${PARAMS.get("rpc") ? `&rpc=${encodeURIComponent(PARAMS.get("rpc"))}` : ""}` : "";
const tokenLink = (token) => `dex?t=${token}${carry}`;

let settings = null, wallet = null, busy = false, acct = null;
const loadAcct = () => (acct ? Promise.resolve(acct) : import(ACCOUNT_JS).then((m) => (acct = m)).catch(() => null));
const taxBps = () => Number($("lc-tax").value);
const devUsdg = () => { const v = $("lc-dev").value.trim(); return v ? units(v, 6) : 0n; };
const fields = () => ({ name: $("lc-name").value, symbol: $("lc-symbol").value, uri: $("lc-logo").value.trim(), taxBps: taxBps() });

/** What stops this launch right now, as text; empty when nothing does. */
function problem() {
  const f = fields();
  if (!f.name && !f.symbol) return "";               // nothing typed yet: no scolding
  const p = launchProblem(f);
  if (p) return t(`launch.problem.${p}`);
  const dev = devUsdg();
  if (dev === null) return t("launch.problem.dev");
  if (dev > maxDevBuy(settings.defaults, f.taxBps)) return t("launch.problem.devMax");
  return "";
}

function draw() {
  const f = fields();
  const letter = (f.symbol || f.name || "?").slice(0, 1).toUpperCase();
  const box = el("span", { class: "dex-logo", style: "background:hsl(165 70% 68%)", "aria-hidden": "true" }, letter);
  const src = f.uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${f.uri.slice(7)}` : f.uri.startsWith("https://") ? f.uri : "";
  if (src) {
    const img = el("img", { src, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => box.replaceChildren(img));
  }
  $("lc-preview").replaceChildren(box, el("div", {}, el("b", {}, f.name || t("launch.preview.name")), el("small", {}, f.symbol || t("launch.preview.symbol"))));

  const dev = devUsdg(), rules = settings.defaults, max = maxDevBuy(rules, f.taxBps);
  $("lc-devhelp").textContent = dev && dev > 0n && dev <= max
    ? t("launch.form.devGets", { tokens: num(Number(devQuote(rules, dev, f.taxBps)) / 1e18, 0), pct: num((Number(devQuote(rules, dev, f.taxBps)) / 1e18 / 1e9) * 100, 2) })
    : t("launch.form.devHelp", { max: num(Number(max) / 1e6, 2), pct: num(Number(rules.maxDevBps) / 100, 0) });
  $("lc-problem").textContent = problem();
  $("lc-problem").className = "dex-msg err";
  const paused = !!settings.paused;
  $("lc-go").textContent = paused ? t("launch.form.paused") : wallet ? t("launch.form.go", { fee: num(Number(settings.create_fee_wei) / 1e18, 5) }) : t("launch.form.connect");
  $("lc-go").disabled = paused || busy;
}

function rulesList() {
  const r = settings.defaults;
  const target = (() => {                             // x0 * y0 / (y0 - 800M) - x0: the same as the mine's targetOf
    const x0 = BigInt(r.x0), y0 = BigInt(r.y0), left = y0 - 800_000_000n * 10n ** 18n;
    return Number((x0 * y0) / left - x0) / 1e6;
  })();
  const items = [
    t("launch.rules.fee", { fee: num(Number(settings.create_fee_wei) / 1e18, 5) }),
    t("launch.rules.supply"),
    t("launch.rules.open", { secs: num(r.countdown, 0), snipe: num(r.snipeBps / 100, 0), mins: num(r.snipeSecs / 60, 0) }),
    t("launch.rules.limit", { pct: num(r.maxWalletBps / 100, 0), mins: num(r.limitSecs / 60, 0) }),
    t("launch.rules.trade", { fee: num(r.feeBps / 100, 0) }),
    t("launch.rules.grad", { target: `$${num(target, 0)}` }),
    t("launch.rules.dev"),
  ];
  $("lc-rules").replaceChildren(...items.map((x) => el("li", {}, x)));
}

// the wallet's node may lag right after an approve: the same step again a little later, as the swap boxes do
async function send(tx) {
  for (let attempt = 0; ; attempt++) {
    try { return await acct.transact(tx.to, tx.data, () => {}, CHAIN, tx.value); } catch (e) {
      const why = String((e && (e.shortMessage || e.details || e.message)) || e);
      if (attempt >= 4 || !/nonce/i.test(why)) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
}

/** The new token's address, from the transaction's Launched log. */
async function launchedToken(hash) {
  for (let i = 0; i < 20; i++) {
    const r = await rpc("eth_getTransactionReceipt", [hash]);
    const l = r?.logs?.find((x) => x.topics?.[0] === LAUNCHED_TOPIC);
    if (l) return `0x${l.topics[1].slice(26)}`;
    await sleep(1500);
  }
  return null;
}

/** On to the token's page as soon as the indexer has it (a tick is 20 s); the link is there meanwhile. */
async function goTo(token) {
  msg(t("launch.msg.done"), "ok");
  $("lc-msg").append(" ", el("a", { href: tokenLink(token) }, t("launch.msg.view")));
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${API}/api/launchpad/token/${token}`).catch(() => null);
    if (r?.ok) { location.href = tokenLink(token); return; }
    await sleep(3000);
  }
}

async function submit() {
  if (busy) return;
  const a = await loadAcct();
  if (!a) return msg(t("launch.msg.noWallet"), "err");
  if (!wallet) {
    wallet = await a.requireWallet();
    draw();
    if (!wallet) return;
  }
  const f = fields();
  if (!f.name && !f.symbol) return msg(t("launch.problem.name"), "err");
  const stop = problem();
  if (stop) return msg(stop, "err");
  const dev = devUsdg();
  busy = true;
  draw();
  try {
    const [eth, usdg, allowance] = await Promise.all([
      rpc("eth_getBalance", [wallet, "latest"]),
      rpc("eth_call", [{ to: USDG, data: "0x70a08231" + word(wallet) }, "latest"]),
      rpc("eth_call", [{ to: USDG, data: "0xdd62ed3e" + word(wallet) + word(settings.address) }, "latest"]),
    ]);
    if (BigInt(eth) < BigInt(settings.create_fee_wei)) throw Object.assign(new Error(t("launch.problem.eth")), { plain: true });
    if (dev > BigInt(usdg)) throw Object.assign(new Error(t("launch.problem.usdg")), { plain: true });
    const txs = createTxs({ ...f, launchpad: settings.address, fee: settings.create_fee_wei, allowance: BigInt(allowance),
      devBuy: dev, minDev: dev > 0n ? devQuote(settings.defaults, dev, f.taxBps) : 0n });
    let last = null;
    for (let i = 0; i < txs.length; i++) {
      if (i) await sleep(2500);
      msg(t("launch.msg.confirm", { n: i + 1, of: txs.length }));
      last = await send(txs[i]);
      msg(t("launch.msg.waiting"));
      await acct.mined(last, CHAIN);
    }
    const token = await launchedToken(last);
    if (!token) throw Object.assign(new Error(t("launch.msg.noToken")), { plain: true });
    await goTo(token);
  } catch (e) {
    const why = e?.plain ? e.message : acct.errorText(e);
    const cancelled = (e && (e.code === 4001 || e.cause?.code === 4001)) || /rejected|denied|cancel/i.test(why);
    msg(cancelled ? t("launch.msg.cancelled") : e?.plain ? why : t("launch.msg.failed", { why }), "err");
  } finally {
    busy = false;
    draw();
  }
}

// ---- start ---------------------------------------------------------------------------------------------------------
let d = null;
try {
  const r = await fetch(`${API}/api/launchpad/markets?limit=1`);
  if (r.ok) d = await r.json();
} catch { /* shown as not open */ }
if (!d?.settings?.defaults) {
  $("lc-closed").hidden = false;
} else {
  settings = { ...d.settings, address: d.address };
  $("lc-open").hidden = false;
  rulesList();
  $("lc-symbol").addEventListener("input", () => { $("lc-symbol").value = $("lc-symbol").value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  for (const id of ["lc-name", "lc-symbol", "lc-logo", "lc-dev", "lc-tax"]) $(id).addEventListener("input", () => { msg(""); draw(); });
  $("lc-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  const s = NAV?.session?.();
  if (s?.wallet) wallet = s.wallet;
  loadAcct().then((a) => a?.onAccount((w) => { wallet = w; draw(); }));
  draw();
}
