/** docs/scan.html (2026-10-27, flytrade/SCAN-PLAN.md phase 4): Fly Scan - paste a token contract or a site, pay (or use
 *  the daily free scan / a fresh report), watch the job, read the report. The server is the mine's (mine/src/scan.ts);
 *  the scans run in the scan worker (flytrade/scan). A report's link is /scan?r=<id>. Payments are plain transfers on
 *  Robinhood Chain through the site's one wallet module (as /earn and the desk's stake box). */
import { t, locale } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
const ACCOUNT_JS = "/compute/mine/web/account.js";
const CHAIN = 4663;
const EXPLORER = "https://robinhoodchain.blockscout.com";
const POLL_MS = 3000;
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
const session = NAV?.session || (() => {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.expires_at > Date.now() && s.wallet && s.token ? s : null; } catch { return null; }
});
async function call(path, body) {
  const s = session();
  const r = await fetch(API + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(s ? { "x-flyai-session": s.token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}
let acct = null;
const loadAcct = () => (acct ? Promise.resolve(acct) : import(ACCOUNT_JS).then((m) => (acct = m)).catch(() => null));
const word = (v) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const short = (w) => (w && w.length > 14 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const when = (v) => new Date(v).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const money = (v) => Number(v).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const msg = (text, kind = "") => { $("scan-msg").textContent = text || ""; $("scan-msg").className = `scan-msg${kind ? ` ${kind}` : ""}`; };
const CHAIN_NAMES = { robinhood: "Robinhood Chain", base: "Base", bsc: "BNB Chain", arbitrum: "Arbitrum" };

let kind = "contract";
let cfg = null;
let polling = null;

// ---- the form -------------------------------------------------------------------------------------------
function setKind(k) {
  kind = k;
  for (const b of document.querySelectorAll(".scan-tab")) {
    const on = b.dataset.kind === k;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  }
  $("scan-chain").hidden = k !== "contract";
  $("scan-target").placeholder = t(k === "contract" ? "scan.form.contractHint" : "scan.form.siteHint");
  $("scan-pay").hidden = true;
  msg("");
}
for (const b of document.querySelectorAll(".scan-tab")) b.addEventListener("click", () => setKind(b.dataset.kind));
$("scan-target").addEventListener("input", () => {
  const v = $("scan-target").value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(v) && kind !== "contract") setKind("contract");
  else if (/[a-z0-9-]\.[a-z]{2,}/i.test(v) && !v.startsWith("0x") && kind !== "site") setKind("site");
});

function request() {
  const target = $("scan-target").value.trim();
  return { kind, target, chain: kind === "contract" ? $("scan-chain").value : undefined };
}

$("scan-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const req = request();
  if (!req.target) return;
  $("scan-pay").hidden = true;
  msg(t("scan.msg.looking"));
  try {
    const q = new URLSearchParams({ kind: req.kind, target: req.target, ...(req.chain ? { chain: req.chain } : {}) });
    const got = await call(`/api/scan/lookup?${q}`);
    if (got.scan) { msg(got.scan.status === "done" ? t("scan.msg.cached") : ""); return open(got.scan.id); }
  } catch (err) { return msg(err.message, "err"); }
  if (!session()) {
    msg(t("scan.msg.signIn"), "err");
    document.querySelector("[data-nav-signin]")?.click();
    return;
  }
  await start(req);
});

/** Ask for a scan with no new payment (the free scan or a payment from a failed scan); 402 opens the pay box. */
async function start(req, tx) {
  msg(t(tx ? "scan.msg.checkingPayment" : "scan.msg.starting"));
  for (let i = 0; i < 10; i++) {
    try {
      const j = await call("/api/scan", { ...req, ...(tx ? { tx } : {}) });
      msg(j.paid_by === "free" ? t("scan.msg.free") : j.cached ? t("scan.msg.cached") : "", "ok");
      $("scan-pay").hidden = true;
      loadMine();
      return open(j.id);
    } catch (err) {
      if (err.status === 409 && /confirmed yet/.test(err.message)) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      if (err.status === 402 && !tx && err.message === "payment required") return payBox(req);
      return msg(err.message, "err");
    }
  }
  msg(t("scan.msg.slowTx"), "err");
}

function payBox(req) {
  msg("");
  const box = $("scan-pay");
  const amount = cfg?.flyai_amount;
  const pay = (token, units, label) => el("button", { class: "btn red", type: "button", on: { click: () => send(req, token, units) } }, label);
  box.replaceChildren(
    el("p", { class: "scan-muted" }, t("scan.pay.ask")),
    el("div", { class: "scan-row" },
      pay(cfg.tokens.usdg, BigInt(Math.round(cfg.price_usd * 1e6)), t("scan.pay.usdg", { usd: money(cfg.price_usd) })),
      amount ? pay(cfg.tokens.flyai, BigInt(amount) * 10n ** 18n, t("scan.pay.flyai", { n: amount.toLocaleString(locale()), usd: money(cfg.flyai_usd) })) : null,
      el("a", { class: "btn", href: "/token#buy" }, t("scan.pay.buy"))),
    el("p", { class: "scan-muted" }, t("scan.pay.free", { n: (cfg.free_min || 0).toLocaleString(locale()) })));
  box.hidden = false;
}

async function send(req, token, units) {
  const a = await loadAcct();
  const data = "0xa9059cbb" + word(cfg.pay_to) + word(units);
  try {
    let hash;
    if (a) {
      hash = await a.transact(token, data, () => msg(t("scan.msg.confirm")), CHAIN);
    } else {
      const eth = window.ethereum;
      if (!eth) throw new Error(t("scan.msg.noWallet"));
      if ((await eth.request({ method: "eth_chainId" })).toLowerCase() !== "0x" + CHAIN.toString(16)) {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + CHAIN.toString(16) }] });
      }
      msg(t("scan.msg.confirm"));
      hash = await eth.request({ method: "eth_sendTransaction", params: [{ from: session().wallet, to: token, data, value: "0x0" }] });
    }
    msg(t("scan.msg.waiting"));
    if (a) await a.mined(hash, CHAIN);
    await start(req, hash);
  } catch (err) {
    msg(a ? a.errorText(err) : (err && (err.shortMessage || err.message)) || String(err), "err");
  }
}

// ---- a report ---------------------------------------------------------------------------------------------
async function open(id) {
  clearTimeout(polling);
  const url = new URL(location.href);
  url.searchParams.set("r", id);
  history.replaceState(null, "", url);
  const box = $("scan-report");
  box.hidden = false;
  let j;
  try { j = await call(`/api/scan/job/${encodeURIComponent(id)}`); } catch (err) { box.replaceChildren(el("div", { class: "card pad" }, err.message)); return; }
  if (j.status === "queued" || j.status === "running") {
    box.replaceChildren(el("div", { class: "card pad" },
      el("div", { class: "scan-wait" }, el("span", { class: "eye" }),
        el("span", null, t(j.status === "queued" ? "scan.wait.queued" : "scan.wait.running", { n: j.ahead || 0, count: j.ahead || 0 }))),
      el("p", { class: "scan-target" }, label(j))));
    polling = setTimeout(() => open(id), POLL_MS);
    return;
  }
  if (j.status === "failed") {
    box.replaceChildren(el("div", { class: "card pad" }, el("h3", null, t("scan.wait.failed")), el("p", { class: "scan-muted" }, j.error || "")));
    return;
  }
  render(j);
  loadRecent();
}

const label = (j) => j.kind === "contract" ? `${j.target} · ${CHAIN_NAMES[j.chain] || j.chain}` : j.target;

function verdictTag(v) {
  return el("span", { class: `scan-verdict ${v || ""}` }, t(`scan.verdict.${v || "unknown"}`));
}

function evidence(e) {
  if (e.file) return el("li", null, `${e.file.split("/").pop()}:${e.line} `, el("code", null, e.code || ""));
  if (e.request !== undefined) return el("li", null, t("scan.report.request", { n: e.request }), " ", e.summary || "");
  if (e.script) return el("li", null, t("scan.report.script"), " ", e.script);
  if (e.slot) return el("li", null, `slot ${e.slot}${e.value ? ` = ${e.value}` : ""}`);
  if (e.fact) return el("li", null, e.fact);
  return null;
}

function factsGrid(j) {
  const f = j.report?.facts || {};
  const cells = [];
  const cell = (k, v) => v !== undefined && v !== null && v !== "" && cells.push(el("div", null, el("span", null, t(`scan.facts.${k}`)), el("b", null, String(v))));
  if (j.kind === "contract") {
    const px = f.proxy;
    const who = (o) => o ? `${o.kind}${o.address ? ` ${short(o.address)}` : ""}` : t("scan.facts.none");
    cell("owner", who(f.owner));
    for (const [g, o] of Object.entries(f.roles || {})) cell("role", `${g}(): ${who(o)}`);
    cell("upgradeable", px ? `${px.kind}${px.admin_is ? ` · ${who(px.admin_is)}` : ""}` : t("scan.facts.no"));
    cell("source", f.source?.verified ? t("scan.facts.verified", { via: f.source.via }) : t("scan.facts.unverified"));
    cell("sell", f.sim?.ran ? (f.sim.blocked ? t("scan.facts.sellBlocked") : t("scan.facts.sellOk")) : t("scan.facts.sellNotRun"));
    const pool = (f.pools || [])[0];
    if (pool) cell("pool", `$${Math.round(pool.liquidity_usd || 0).toLocaleString(locale())} · ${pool.dex}`);
  } else {
    cell("domainAge", f.domain_age_days === null || f.domain_age_days === undefined ? t("scan.facts.unknown") : t("scan.facts.days", { n: Math.round(f.domain_age_days) }));
    const lists = Object.entries(f.lists || {}).filter(([k]) => k !== "allowed").map(([k]) => k);
    cell("lists", lists.length ? lists.join(", ") : t("scan.facts.notListed"));
    cell("lookalike", f.lookalike || t("scan.facts.no"));
    cell("asked", (f.requests || []).length ? t("scan.facts.requests", { n: f.requests.length, gives: f.requests.filter((r) => r.gives).length }) : t("scan.facts.nothingAsked"));
    if ((f.sends_wallet_to || []).length) cell("sendsTo", f.sends_wallet_to.join(", "));
  }
  return cells.length ? el("div", { class: "scan-facts" }, ...cells) : null;
}

function render(j) {
  const r = j.report?.report || {};
  const findings = (r.findings || []).filter((x) => !x.unproven);
  const shareUrl = `${location.origin}/scan?r=${j.id}`;
  const copy = el("button", { class: "btn sm", type: "button", on: { click: async () => {
    try { await navigator.clipboard.writeText(shareUrl); copy.textContent = t("scan.report.copied"); } catch { prompt("", shareUrl); }
  } } }, t("scan.report.copy"));
  const xText = encodeURIComponent(t("scan.report.tweet", { what: j.title || j.target, verdict: t(`scan.verdict.${j.verdict}`) }));
  $("scan-report").replaceChildren(el("div", { class: "card pad" },
    el("div", { class: "scan-head" }, el("h2", null, j.title || short(j.target)), verdictTag(j.verdict)),
    el("p", { class: "scan-target" }, label(j), " · ", t("scan.report.when", { at: when(j.done_at) })),
    r.summary ? el("p", { class: "scan-summary" }, r.summary) : null,
    factsGrid(j),
    findings.length ? findings.map((x) => el("div", { class: `scan-finding ${x.severity || "info"}` },
      el("h4", null, x.title, el("small", null, t(`scan.severity.${x.severity || "info"}`))),
      el("p", null, x.explain || ""),
      el("ul", { class: "scan-ev" }, ...(x.evidence || []).map(evidence)))) : el("p", { class: "scan-muted" }, t("scan.report.noFindings")),
    el("p", { class: "scan-muted" }, t("scan.report.disclaimer")),
    el("div", { class: "scan-share" }, copy,
      el("a", { class: "btn sm", href: `https://x.com/intent/post?text=${xText}&url=${encodeURIComponent(shareUrl)}`, target: "_blank", rel: "noopener" }, t("scan.report.share")),
      j.kind === "contract" && j.chain === "robinhood" ? el("a", { class: "btn sm", href: `${EXPLORER}/address/${j.target}`, target: "_blank", rel: "noopener" }, t("scan.report.explorer")) : null)));
  $("scan-report").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- lists ----------------------------------------------------------------------------------------------
const row = (s) => el("li", null,
  el("a", { href: `?r=${s.id}`, on: { click: (e) => { e.preventDefault(); open(s.id); } } }, s.title || short(s.target)),
  el("span", { class: `scan-dot ${s.verdict || ""}` }, s.verdict ? t(`scan.verdict.${s.verdict}`) : t(`scan.status.${s.status}`)));

async function loadRecent() {
  try {
    const j = await call("/api/scan/recent");
    $("scan-recent").replaceChildren(...(j.scans.length ? j.scans.map(row) : [el("li", { class: "scan-muted" }, t("scan.recent.empty"))]));
  } catch { $("scan-recent").replaceChildren(el("li", { class: "scan-muted" }, "—")); }
}

async function loadMine() {
  if (!session()) return;
  try {
    const m = await call("/api/scan/me");
    $("scan-mine").replaceChildren(...[
      el("p", { class: "scan-muted" }, m.free_today ? t("scan.mine.free") : m.free_used ? t("scan.mine.freeUsed") : t("scan.mine.noFree", { n: (cfg?.free_min || 200000).toLocaleString(locale()) })),
      m.credits ? el("p", { class: "scan-muted" }, t("scan.mine.credits", { count: m.credits })) : null,
      el("ul", { class: "scan-list" }, ...(m.scans.length ? m.scans.map(row) : [el("li", { class: "scan-muted" }, t("scan.mine.empty"))]))].filter(Boolean));
  } catch { /* signed out or the server is away: the sign-in prompt stays */ }
}

async function loadConfig() {
  try {
    cfg = await call("/api/scan/config");
    $("scan-price").textContent = t("scan.form.price", { usd: money(cfg.price_usd), n: cfg.flyai_amount ? cfg.flyai_amount.toLocaleString(locale()) : "…", fusd: money(cfg.flyai_usd) });
  } catch { $("scan-price").textContent = ""; }
}

await loadConfig();
loadRecent();
loadMine();                      // (signing in or out reloads the page: nav.js sessionChanged)
const r = new URLSearchParams(location.search).get("r");
if (r) open(r);
const q = new URLSearchParams(location.search).get("q");
if (q && !r) { $("scan-target").value = q; $("scan-target").dispatchEvent(new Event("input")); }
