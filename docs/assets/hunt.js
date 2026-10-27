/** docs/hunt.html (2026-10-27, flytrade/HUNT-PLAN.md): the Fly Hunt - the window and who finished (public), then the
 *  signed-in wallet's current clue and the answer box. Clues and answers live on the mine server (mine/src/hunt.ts). */
import { t, locale } from "./i18n/i18n.js";

const NAV = window.flyNav;
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("api") || NAV?.MINE_API || "https://flyai-mine.fly.dev";
const SESSION_KEY = "flyai.compute.session";
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
const when = (v) => new Date(v).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const clueText = (c) => (c && (c[locale()] || c.en)) || "";
let hunt = null;
let waitTimer = null;

function status(h) {
  hunt = h;
  if (!h.on) { $("hunt-when").textContent = t("hunt.status.none"); return; }
  $("hunt-when").textContent = h.ended ? t("hunt.status.ended") : h.started ? t("hunt.status.live", { end: when(h.end) })
    : t("hunt.status.soon", { start: when(h.start) });
  $("hunt-found").textContent = t("hunt.status.found", { n: Math.min(h.found, h.winners), of: h.winners });
  $("hunt-finishers").replaceChildren(...h.finishers.map((f) => el("li", {}, `${f.wallet} · ${when(f.at)}`)));
}

function dots(steps, solved) {
  $("hunt-dots").replaceChildren(...Array.from({ length: steps }, (_, i) =>
    el("span", { class: i < solved ? "done" : i === solved ? "now" : "" }, String(i + 1))));
}

function msg(text, kind = "") {
  const m = $("hunt-msg");
  if (!m) return;
  m.textContent = text || "";
  m.className = `hunt-msg${kind ? ` ${kind}` : ""}`;
}

function tries(v) {
  clearInterval(waitTimer);
  if (!v?.tries) return;
  let wait = v.tries.wait_s || 0;
  // a short wait (between two tries) counts down on the button; a lock-out (too many wrong) says so
  const show = () => {
    const go = $("hunt-go");
    if (go) { go.disabled = wait > 0; go.textContent = wait > 0 && wait <= 60 ? `${wait}s` : t("hunt.play.go"); }
    if (wait > 60) msg(t("hunt.play.lockedOut", { min: Math.ceil(wait / 60) }), "err");
  };
  show();
  if (wait > 0) waitTimer = setInterval(() => { wait--; show(); if (wait <= 0) clearInterval(waitTimer); }, 1000);
}

function play(v) {
  const body = $("hunt-body");
  if (!v.on) { body.replaceChildren(el("p", { class: "hunt-muted" }, t("hunt.status.none"))); return; }
  dots(v.steps, v.solved);
  if (v.done) {
    const won = v.rank <= v.winners;
    body.replaceChildren(
      el("p", { class: "hunt-won" }, t(won ? "hunt.play.won" : "hunt.play.finished", { n: v.rank })),
      el("p", { class: "hunt-muted" }, t(won ? "hunt.play.wonNext" : "hunt.play.finishedNext")));
    return;
  }
  if (!v.started) { body.replaceChildren(el("p", { class: "hunt-muted" }, t("hunt.status.soon", { start: when(hunt?.start ?? Date.now()) }))); return; }
  if (v.ended) { body.replaceChildren(el("p", { class: "hunt-muted" }, t("hunt.status.ended"))); return; }
  const input = el("input", { id: "hunt-answer", autocomplete: "off", spellcheck: "false", maxlength: "80",
    placeholder: t("hunt.play.placeholder"), "aria-label": t("hunt.play.placeholder") });
  const form = el("form", { class: "hunt-row", on: { submit: (e) => { e.preventDefault(); send(input.value); } } },
    input, el("button", { class: "btn red", type: "submit", id: "hunt-go" }, t("hunt.play.go")));
  body.replaceChildren(
    el("p", { class: "eyebrow" }, t("hunt.play.clue", { n: v.solved + 1, of: v.steps })),
    el("p", { class: "hunt-clue" }, clueText(v.clue)),
    form,
    el("p", { class: "hunt-msg", id: "hunt-msg", role: "status", "aria-live": "polite" }));
  tries(v);
  input.focus({ preventScroll: true });
}

async function send(answer) {
  if (!answer.trim()) return;
  const go = $("hunt-go");
  if (go) go.disabled = true;
  try {
    const v = await call("/api/hunt/answer", { answer });
    if (v.ok === false) {
      if (!v.wait_s) msg(t("hunt.play.wrong", { n: v.tries?.left ?? 0 }), "err");
      if (go) go.disabled = false;
      tries(v.wait_s ? { tries: { ...v.tries, wait_s: v.wait_s } } : v);
      $("hunt-answer")?.select();
      return;
    }
    play(v);
    if (!v.done) msg(t("hunt.play.right"), "ok");
    refresh();
  } catch (e) {
    msg(e.message, "err");
    if (go) go.disabled = false;
  }
}

async function refresh() {
  try { status(await call("/api/hunt")); } catch { $("hunt-when").textContent = t("hunt.status.error"); }
}

await refresh();
if (session()) {
  try { play(await call("/api/hunt/me")); } catch (e) { if (e.status !== 401) $("hunt-body").prepend(el("p", { class: "hunt-muted" }, e.message)); }
} else if (hunt?.on) {
  dots(hunt.steps, 0);
}
setInterval(refresh, 60_000);
