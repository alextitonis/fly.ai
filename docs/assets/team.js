/** docs/team.html (2026-11-11): allowlisted wallets post what they did; admins see everyone and keep the list (mine/src/team.ts). */
const NAV = window.flyNav;
// a local mine server can stand in, on a local page only (a session token never goes to another host)
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
const ACCOUNT_JS = "/compute/mine/web/account.js";

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
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.expires_at > Date.now() && s.token ? s : null; } catch { return null; }
});
async function call(path, body) {
  const s = session();
  const r = await fetch(API + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(s ? { "x-flyai-session": s.token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function signIn() {
  try { const acct = await import(ACCOUNT_JS); if (await acct.signIn()) location.reload(); } catch (e) { alert(String(e.message || e)); }
}
const short = (w) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const ago = (ms) => {
  if (!ms) return "never";
  const m = Math.floor((Date.now() - ms) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
};
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

let me = null;

function gate(text, button) {
  $("gate").hidden = false;
  $("app").hidden = true;
  $("gate").replaceChildren(el("p", { class: "msg" }, text), button || "");
}

async function load() {
  const params = new URLSearchParams({ days: $("days").value });
  if (me.admin && $("who").value) params.set("wallet", $("who").value);
  const data = await call(`/api/team/reports?${params}`);
  if (me.admin) renderMembers(data.members || []);
  renderList(data.reports);
}

function renderMembers(ms) {
  const pick = $("who");
  const keep = pick.value;
  pick.replaceChildren(el("option", { value: "" }, "Everyone"), ...ms.map((m) => el("option", { value: m.wallet }, m.name || short(m.wallet))));
  pick.value = keep;
  $("members").replaceChildren(...(ms.length ? ms.map((m) => {
    const quiet = !m.last_at || Date.now() - m.last_at > 7 * 86_400_000;
    return el("tr", { class: "pick", title: "Show only their reports", on: { click: () => { pick.value = m.wallet; load(); } } },
      el("td", { class: "who" }, el("b", null, m.name || "(not on the list)"), el("code", null, m.wallet)),
      el("td", { class: quiet ? "quiet" : "" }, ago(m.last_at)),
      el("td", { class: "tm-n" }, String(m.week)),
      el("td", { class: "tm-n" }, String(m.total)),
      el("td", null, m.on_list ? el("button", { type: "button", title: "Remove from the list (reports stay)", on: { click: async (e) => {
        e.stopPropagation();
        if (!confirm(`Remove ${m.name || m.wallet} from the team list? Their reports stay.`)) return;
        try { await call("/api/team/members/remove", { wallet: m.wallet }); await load(); } catch (err) { alert(err.message); }
      } } }, "remove") : ""));
  }) : [el("tr", null, el("td", { colspan: 5 }, "No one yet: add a wallet below."))]));
}

function renderList(reports) {
  const filtered = me.admin && $("who").value;
  $("listtitle").textContent = !me.admin ? "Your reports" : filtered ? `Reports: ${$("who").selectedOptions[0]?.textContent}` : "All reports";
  if (!reports.length) return $("list").replaceChildren(el("div", { class: "card empty" }, "No reports in this window."));
  const out = [];
  let last = "";
  for (const r of reports) {
    const d = day(r.at);
    if (d !== last) { out.push(el("p", { class: "tm-day" }, d)); last = d; }
    const mine = r.wallet === me.wallet;
    out.push(el("article", { class: "card tm-rep" },
      el("div", { class: "top" },
        el("b", null, r.name || short(r.wallet)), el("span", null, time(r.at)), el("span", { class: "sp" }),
        mine || me.admin ? el("button", { type: "button", on: { click: async () => {
          if (!confirm("Delete this report?")) return;
          try { await call("/api/team/report/delete", { id: r.id }); await load(); } catch (err) { alert(err.message); }
        } } }, "delete") : ""),
      el("p", null, r.what),
      r.links.length ? el("ul", null, ...r.links.map((u) => el("li", null, el("a", { href: u, target: "_blank", rel: "noopener nofollow" }, u)))) : ""));
  }
  $("list").replaceChildren(...out);
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("formmsg");
  msg.className = "msg"; msg.textContent = "Sending…";
  try {
    await call("/api/team/report", { what: $("what").value, links: $("links").value });
    $("what").value = ""; $("links").value = "";
    msg.textContent = "Sent. Thanks!";
    await load();
  } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
});
$("addform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("addmsg");
  msg.className = "msg"; msg.textContent = "";
  try {
    await call("/api/team/members", { wallet: $("addwallet").value.trim(), name: $("addname").value });
    $("addwallet").value = ""; $("addname").value = "";
    msg.textContent = "Saved. They can sign in on this page now.";
    await load();
  } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
});
$("days").addEventListener("change", () => load().catch((e) => alert(e.message)));
$("who").addEventListener("change", () => load().catch((e) => alert(e.message)));

(async () => {
  if (!session()) return gate("Sign in with your team wallet to post and read reports.",
    el("button", { class: "btn red", type: "button", on: { click: signIn } }, "Sign in"));
  try { me = await call("/api/team/me"); } catch (e) {
    return gate(`Couldn't check your wallet: ${e.message}. Try signing in again.`, el("button", { class: "btn red", type: "button", on: { click: signIn } }, "Sign in"));
  }
  if (!me.member && !me.admin) return gate(`This wallet (${short(me.wallet)}) isn't on the team list. Ask the team lead to add it.`);
  $("gate").hidden = true;
  $("app").hidden = false;
  $("admin").hidden = !me.admin;
  $("who").hidden = !me.admin;
  try { await load(); } catch (e) { $("list").replaceChildren(el("div", { class: "card empty" }, e.message)); }
})();
