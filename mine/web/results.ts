/**
 * /compute/results: what our own research orders found (GET /api/experiments, worked out on the server by
 * src/experiments.ts), grouped by kind of experiment, with each order's progress and its full results as CSV.
 */
import { locale, t } from "./i18n.ts";
import { API } from "./config.ts";
import { mountAccount } from "./account.ts";
import { $, num } from "./format.ts";
import { api } from "./mine-core.ts";

interface Summary {
  label: string; family: string; question: string; headline: string; figures: { k: string; v: string }[];
  table?: string[][]; runs_read: number; status?: string; jobs?: number; settled?: number; order?: string;
}

const FAMILIES: { key: string; title: string; about: string }[] = ["tuning", "encoding", "colosseum", "world", "demo"].map((key) => ({
  key, title: t(`compute.results.family.${key}.title`), about: t(`compute.results.family.${key}.about`),
}));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function card(s: Summary): HTMLElement {
  const c = el("div", "card pad");
  c.append(el("span", "num", s.label.toUpperCase()));
  c.append(el("h3", undefined, s.question));
  c.append(el("p", "lede", s.headline));
  const rows: [string, string][] = s.figures.map((f) => [f.k, f.v]);
  if (s.jobs) rows.push([t("compute.results.progress"), t("compute.results.progressLine", { settled: num(s.settled ?? 0), jobs: num(s.jobs) })
    + (s.status === "ended" ? t("compute.results.paused") : s.status === "done" ? t("compute.results.finishedSuffix") : "")]);
  if (s.jobs && s.runs_read < (s.settled ?? 0)) rows.push([t("compute.results.summarizedFrom"), t("compute.results.sample", { count: num(s.runs_read) })]);
  for (const [k, v] of rows) {
    const r = el("div", "row");
    r.append(el("span", "k", k), el("span", "v", v));
    c.append(r);
  }
  if (s.table && s.table.length > 1) {
    const wrap = el("div", "scroller");
    const table = el("table", "data");
    const head = el("thead");
    const hr = el("tr");
    for (const h of s.table[0]) hr.append(el("th", undefined, h));
    head.append(hr);
    const body = el("tbody");
    for (const row of s.table.slice(1)) {
      const tr = el("tr");
      for (const cell of row) tr.append(el("td", undefined, cell));
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    wrap.style.marginTop = "14px";
    c.append(wrap);
  }
  if (s.order) {
    const cta = el("div", "cta");
    cta.style.marginTop = "14px";
    const a = el("a", "btn sm", t("compute.results.allCsv"));
    a.href = `${API}/api/orders/${s.order}/results?format=csv`;
    cta.append(a);
    c.append(cta);
  }
  return c;
}

async function load(): Promise<void> {
  const data = await api(API, "/api/experiments", null);
  const list = data.experiments as Summary[];
  $("empty").hidden = list.length > 0;
  $("n-exp").textContent = String(list.length);
  $("n-runs").textContent = num(list.reduce((sum, s) => sum + (s.settled ?? 0), 0));
  $("n-done").textContent = String(list.filter((s) => s.status === "done").length);
  $("updated").textContent = data.updated_at ? new Date(data.updated_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : "—";
  const host = $("families");
  host.replaceChildren();
  for (const f of FAMILIES) {
    const mine = list.filter((s) => s.family === f.key);
    if (!mine.length) continue;
    const section = el("div", "stack");
    const head = el("div");
    head.append(el("h2", undefined, f.title), el("p", "caption", f.about));
    section.append(head, ...mine.map(card));
    host.append(section);
  }
}

mountAccount();
void load().catch((err) => {
  $("empty").hidden = false;
  $("empty").textContent = t("compute.results.couldntLoad", { error: err instanceof Error ? err.message : String(err) });
});
