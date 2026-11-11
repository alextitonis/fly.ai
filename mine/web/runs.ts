/**
 * /compute/runs: training on the fleet (src/train.ts). Our own runs (GET /api/runs), one run's live curve and its
 * parameters (?id=, GET /api/runs/:id), and a form that starts a run from a template: it uploads what the run needs,
 * prices it (POST /api/orders/quote), creates the unpaid order and hands over to /compute/jobs?pay=<order> to pay.
 */
import { locale, t } from "./i18n.ts";
import { API } from "./config.ts";
import { errorText, mountAccount, onAccount, signedIn } from "./account.ts";
import { $, num } from "./format.ts";
import { api } from "./mine-core.ts";
import { encodeShard } from "../src/train.ts";

interface Point { step: number; at: number; center?: number | null; mean?: number | null; max?: number | null; train_loss?: number | null; eval_acc?: number | null; eval_loss?: number | null; theta?: string | null }
interface RunView {
  id: string; kind: "evolve" | "train"; status: string; end_reason: string | null; error: string | null; label: string | null; house: boolean;
  step: number; steps: number; params: number; job_kind: string; theta: { url: string }; best: { url: string | null; score: number; step: number } | null;
  order: { id: string; status: string; spent: string; budget: string; wallet: string | null }; points: Point[];
}

type Template = "cartpole" | "brain" | "wasm" | "csv";
let template: Template = "cartpole";
let quoted: { spec: Record<string, unknown>; full: string; bid: string } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const input = (id: string) => $<HTMLInputElement>(id);
const say = (text: string, ok?: boolean) => {
  const s = $("form-status");
  s.textContent = text;
  if (ok === undefined) delete s.dataset.standing;
  else s.dataset.standing = ok ? "ok" : "zeroed";
};

async function upload(bytes: Uint8Array): Promise<string> {
  const res = await fetch(`${API}/api/blobs`, { method: "POST", body: bytes as BodyInit });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `upload: HTTP ${res.status}`);
  return json.hash as string;
}

// ---- starting a run ----------------------------------------------------------------------------------------------
const TEMPLATES: { key: Template; title: string; about: string; tag: string }[] = (["cartpole", "brain", "wasm", "csv"] as Template[]).map((key) => ({
  key, title: t(`compute.runs.tpl.${key}.title`), about: t(`compute.runs.tpl.${key}.about`), tag: t(`compute.runs.tpl.${key}.tag`),
}));

function pick(key: Template): void {
  template = key;
  quoted = null;
  $("create-btn").hidden = true;
  $("quote").textContent = "";
  say("");
  for (const b of $("templates").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.key === key));
  $("wasm-field").hidden = key !== "wasm";
  $("csv-field").hidden = key !== "csv";
  $("steps-label").textContent = t(key === "csv" ? "compute.runs.rounds" : "compute.runs.generations");
  input("steps").value = key === "csv" ? "40" : key === "brain" ? "30" : "100";
}

/** A CSV of numbers into shards: the last column is the class; a header row is skipped; 10% held out to score. */
async function csvSpec(file: File, hidden: number, rounds: number): Promise<Record<string, unknown>> {
  const rows = (await file.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,;\t]/).map(Number));
  const data = rows.filter((r) => r.every(Number.isFinite));
  if (data.length < 20) throw new Error(t("compute.runs.csvTooSmall"));
  const cols = data[0].length;
  if (cols < 2 || data.some((r) => r.length !== cols)) throw new Error(t("compute.runs.csvRagged"));
  if (data.some((r) => !Number.isInteger(r[cols - 1]) || r[cols - 1] < 0)) throw new Error(t("compute.runs.csvLabels"));
  const classes = Math.max(...data.map((r) => r[cols - 1])) + 1;
  // a fixed shuffle, so the held-out rows are a fair sample
  let s = 12345;
  for (let i = data.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [data[i], data[j]] = [data[j], data[i]];
  }
  const held = Math.min(5000, Math.max(10, Math.floor(data.length / 10)));
  const shard = (part: number[][]) => encodeShard({
    x: Float32Array.from(part.flatMap((r) => r.slice(0, cols - 1))), xDim: cols - 1, labels: Uint32Array.from(part.map((r) => r[cols - 1])), classes,
  });
  const train = data.slice(held);
  const per = Math.max(64, Math.ceil(train.length / 64));
  const shards: string[] = [];
  for (let i = 0; i < train.length; i += per) {
    say(t("compute.runs.uploading", { done: shards.length + 1, total: Math.ceil(train.length / per) }));
    shards.push(await upload(shard(train.slice(i, i + per))));
  }
  return {
    kind: "train", model: { mlp: { layers: [cols - 1, hidden, hidden, classes] } }, shards, eval_shard: await upload(shard(data.slice(0, held))),
    rounds, shards_per_round: Math.min(16, shards.length), local_steps: 50, batch: 32, lr: 0.003,
  };
}

async function buildSpec(): Promise<Record<string, unknown>> {
  const steps = Math.max(1, Math.floor(Number(input("steps").value) || 1));
  if (template === "cartpole") {
    const res = await fetch("/compute/examples/es_cartpole.wasm");
    if (!res.ok) throw new Error(`es_cartpole.wasm: HTTP ${res.status}`);
    const wasm = await upload(new Uint8Array(await res.arrayBuffer()));
    return { kind: "evolve", dim: 5, generations: steps, pairs: 32, pairs_per_job: 8, sigma: 0.5, lr: 0.2, episodes: 2, timeout_s: 30, fitness: { wasm } };
  }
  if (template === "brain") {
    return {
      kind: "evolve", dim: 3, generations: steps, pairs: 8, pairs_per_job: 2, sigma: 0.2, lr: 0.1, timeout_s: 120,
      fitness: { builtin: "brain", steps: 60, inputs: [{ types: ["LC4"] }, { types: ["LPLC2"] }, { types: ["LC10a"] }], targets: [{ types: ["DNp01"], weight: 1 }], cost: 0.5 },
    };
  }
  if (template === "wasm") {
    const file = input("wasm-file").files?.[0];
    if (!file) throw new Error(t("compute.runs.needWasm"));
    const dim = Math.max(1, Math.floor(Number(input("dim").value) || 1));
    return { kind: "evolve", dim, generations: steps, pairs: 64, pairs_per_job: 8, sigma: 0.1, lr: 0.05, timeout_s: 60, fitness: { wasm: await upload(new Uint8Array(await file.arrayBuffer())) } };
  }
  const file = input("csv-file").files?.[0];
  if (!file) throw new Error(t("compute.runs.needCsv"));
  return csvSpec(file, Math.max(1, Math.floor(Number(input("hidden").value) || 64)), steps);
}

async function quote(): Promise<void> {
  try {
    $("quote-btn").setAttribute("disabled", "");
    say(t("compute.runs.pricing"));
    const spec = await buildSpec();
    const bid = input("bid").value.trim();
    const q = await api(API, "/api/orders/quote", null, { spec, ...(bid ? { bid } : {}) });
    quoted = { spec, full: q.full_cost, bid: q.bid };
    input("bid").placeholder = q.min_bid;
    $("quote").textContent = t("compute.runs.quoteLine", { steps: num(q.run.steps), per: num(q.run.jobs_per_step), jobs: num(q.jobs), bid: q.bid, full: num(Number(q.full_cost)) });
    $("create-btn").hidden = false;
    say("");
  } catch (err) {
    say(errorText(err), false);
  } finally {
    $("quote-btn").removeAttribute("disabled");
  }
}

async function create(): Promise<void> {
  if (!quoted) return;
  const wallet = input("wallet").value.trim() || signedIn() || "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return say(t("compute.runs.needWallet"), false);
  try {
    $("create-btn").setAttribute("disabled", "");
    const o = await api(API, "/api/orders", null, { wallet, spec: quoted.spec, bid: quoted.bid, budget: quoted.full });
    const s = $("form-status");
    s.replaceChildren(document.createTextNode(t("compute.runs.created") + " "));
    const pay = el("a", "", t("compute.runs.payNow"));
    pay.href = `/compute/jobs?pay=${o.id}`;
    const watch = el("a", "", t("compute.runs.watchIt"));
    watch.href = `/compute/runs?id=${o.run.id}`;
    s.append(pay, document.createTextNode(" · "), watch);
    s.dataset.standing = "ok";
    location.href = pay.href;
  } catch (err) {
    say(errorText(err), false);
  } finally {
    $("create-btn").removeAttribute("disabled");
  }
}

// ---- one run -----------------------------------------------------------------------------------------------------
/** The run's curve as a small SVG: one or two lines over the steps. */
function chart(series: { name: string; values: (number | null | undefined)[]; dashed?: boolean }[]): SVGSVGElement {
  const W = 640;
  const H = 180;
  const P = 28;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", "100%");
  svg.style.maxWidth = `${W}px`;
  const all = series.flatMap((s) => s.values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
  if (!all.length) return svg;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) { hi += 1; lo -= 1; }
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => P + (n > 1 ? (i / (n - 1)) * (W - 2 * P) : (W - 2 * P) / 2);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const axis = document.createElementNS(ns, "path");
  axis.setAttribute("d", `M${P} ${P}V${H - P}H${W - P}`);
  axis.setAttribute("stroke", "var(--line, #2a2f2d)");
  axis.setAttribute("fill", "none");
  svg.append(axis);
  for (const [label, v] of [[hi, hi], [lo, lo]] as const) {
    const txt = document.createElementNS(ns, "text");
    txt.setAttribute("x", "2");
    txt.setAttribute("y", String(y(v) + 4));
    txt.setAttribute("fill", "var(--dim, #888)");
    txt.setAttribute("font-size", "10");
    txt.textContent = num(label, 3);
    svg.append(txt);
  }
  for (const s of series) {
    const pts = s.values.map((v, i) => (typeof v === "number" && Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean);
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", pts.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", s.dashed ? "var(--muted, #aaa)" : "var(--mint, #7fffd4)");
    line.setAttribute("stroke-width", "2");
    if (s.dashed) line.setAttribute("stroke-dasharray", "4 4");
    svg.append(line);
  }
  return svg;
}

async function showRun(id: string): Promise<void> {
  const r = await api(API, `/api/runs/${id}?points=2000`, null) as RunView;
  $("run-card").hidden = false;
  $("run-label").textContent = (r.label ?? t(`compute.runs.kind.${r.kind}`)).toUpperCase();
  $("run-title").textContent = t(`compute.runs.about.${r.kind}`, { steps: num(r.steps), job: r.job_kind });
  $("run-status").textContent = t(`compute.runs.st.${r.status}`) + (r.end_reason && r.status !== "done" ? ` (${r.end_reason})` : "");
  $("run-step").textContent = `${num(r.step)} / ${num(r.steps)}`;
  $("run-params").textContent = num(r.params);
  $("run-spent").textContent = r.house ? "—" : `${num(Number(r.order.spent))} / ${num(Number(r.order.budget))}`;
  const theta = $<HTMLAnchorElement>("run-theta");
  theta.href = API + r.theta.url;
  theta.download = `${r.id}-step${r.step}.${r.kind === "evolve" ? "f64" : "f32"}`;
  const best = $<HTMLAnchorElement>("run-best");
  best.hidden = !r.best?.url;
  if (r.best?.url) {
    best.href = API + r.best.url;
    best.download = `${r.id}-best-step${r.best.step}.${r.kind === "evolve" ? "f64" : "f32"}`;
  }
  const pay = $<HTMLAnchorElement>("run-pay");
  pay.hidden = !(r.status === "waiting" && r.order.status === "unpaid");
  pay.href = `/compute/jobs?pay=${r.order.id}`;
  const p = r.points;
  const host = $("run-chart");
  if (r.kind === "evolve") {
    host.replaceChildren(chart([{ name: "center", values: p.map((x) => x.center) }, { name: "max", values: p.map((x) => x.max), dashed: true }]));
    $("run-legend").textContent = t("compute.runs.legendEvolve");
  } else {
    const hasEval = p.some((x) => typeof x.eval_acc === "number");
    host.replaceChildren(chart(hasEval ? [{ name: "eval", values: p.map((x) => x.eval_acc) }] : [{ name: "loss", values: p.map((x) => x.train_loss) }]));
    $("run-legend").textContent = t(hasEval ? "compute.runs.legendEval" : "compute.runs.legendLoss");
  }
  $("run-note").textContent = r.error ? t("compute.runs.failedNote", { error: r.error })
    : t("compute.runs.format", { format: r.kind === "evolve" ? "float64" : "float32", n: num(r.params) });
  if (r.status === "waiting" || r.status === "running") setTimeout(() => void showRun(id).catch(() => {}), 10_000);
}

// ---- our runs -----------------------------------------------------------------------------------------------------
async function listRuns(): Promise<void> {
  const { runs } = await api(API, "/api/runs", null) as { runs: (RunView & { last: Point | null; updated_at: number })[] };
  $("runs-empty").hidden = runs.length > 0;
  $("runs").replaceChildren(...runs.map((r) => {
    const item = el("a", "item");
    item.href = `/compute/runs?id=${r.id}`;
    item.style.textDecoration = "none";
    item.append(el("b", undefined, r.label ?? r.id.slice(0, 8)));
    const last = r.last;
    const metric = !last ? "—" : r.kind === "evolve" ? num(last.center ?? 0, 3) : typeof last.eval_acc === "number" ? `${num(last.eval_acc * 100, 1)}%` : num(last.train_loss ?? 0, 4);
    item.append(el("span", "amount", metric));
    const state = el("div", "state");
    state.append(el("span", "meta", `${t(`compute.runs.st.${r.status}`)} · ${num(r.step)} / ${num(r.steps)} · ${new Date(r.updated_at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })}`));
    item.append(state);
    return item;
  }));
}

function boot(): void {
  mountAccount();
  onAccount((wallet) => { if (wallet && !input("wallet").value) input("wallet").value = wallet; });
  $("templates").replaceChildren(...TEMPLATES.map((tp) => {
    const b = el("button", "choice");
    b.type = "button";
    b.dataset.key = tp.key;
    b.append(el("b", undefined, tp.title), el("span", undefined, tp.about), el("small", undefined, tp.tag));
    b.addEventListener("click", () => pick(tp.key));
    return b;
  }));
  pick("cartpole");
  $("quote-btn").addEventListener("click", () => void quote());
  $("create-btn").addEventListener("click", () => void create());
  for (const id of ["steps", "bid", "dim", "hidden", "wasm-file", "csv-file"]) input(id).addEventListener("change", () => { quoted = null; $("create-btn").hidden = true; });
  const id = new URLSearchParams(location.search).get("id");
  if (id && /^[0-9a-f-]{36}$/.test(id)) void showRun(id).catch((err) => { $("run-card").hidden = false; $("run-note").textContent = errorText(err); });
  void listRuns().catch((err) => { $("runs-empty").hidden = false; $("runs-empty").textContent = errorText(err); });
}

boot();
