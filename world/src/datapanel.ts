/**
 * The Data card: what the world has recorded, as small charts, plus CSV downloads and the printable report.
 * Everything here reads world.log / world.social; nothing writes back into a fly. Watching the shared world (live.ts),
 * the downloads and the report come from the server, which holds the whole record, and learning is the server's to set.
 */
import { toCsv, type Row } from "./datalog.ts";
import { openReport, regression, TRAITS } from "./report.ts";
import type { World } from "./sim.ts";
import { keyOf, t, tx } from "./i18n.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const W = 470, H = 110;

const STYLE = `
.datacard canvas{width:100%;height:auto;display:block;background:#060707;border-radius:10px;margin:4px 0 2px}
.datacard .learn{display:flex;flex-wrap:wrap;gap:6px 14px;margin:2px 0 8px;font-size:12px}
.datacard .learn label{display:flex;align-items:center;gap:5px;cursor:pointer}
.datacard .fates div{display:grid;grid-template-columns:120px 1fr 34px;gap:6px;align-items:center;font-size:11px;margin:2px 0}
.datacard .fates i{display:block;height:8px;border-radius:3px}
.datacard .pairs div{display:flex;justify-content:space-between;gap:8px;font-size:11px;padding:2px 0;border-bottom:1px dashed #1a1d1c}
.datacard select{background:#060707;color:inherit;border:1px solid #1a1d1c;border-radius:999px;font-size:11px;padding:2px 8px}
.datacard .kv{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:#9ba5a1}
.datacard .kv b{color:#f4f7f6}
`;

function canvas(id: string): CanvasRenderingContext2D {
  const c = $<HTMLCanvasElement>(id);
  c.width = W;
  c.height = H;
  return c.getContext("2d")!;
}

interface Series { values: number[]; color: string; label: string }

function lines(g: CanvasRenderingContext2D, series: Series[], min: number, max: number, ref?: { at: number; label: string }): void {
  g.fillStyle = "#060707";
  g.fillRect(0, 0, W, H);
  g.font = "9px ui-monospace, monospace";
  const n = Math.max(...series.map((s) => s.values.length));
  const y = (v: number) => H - 14 - (H - 24) * ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1));
  if (ref) {
    g.strokeStyle = "#39424f";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(0, y(ref.at) + 0.5); g.lineTo(W, y(ref.at) + 0.5); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#6b7684";
    g.fillText(ref.label, W - g.measureText(ref.label).width - 4, y(ref.at) - 3);
  }
  if (n < 2) {
    g.fillStyle = "#4a5666";
    g.fillText(t("sim.data.collecting"), 8, H / 2);
    return;
  }
  const x = (i: number) => (W * i) / (n - 1);
  series.forEach((s, k) => {
    g.strokeStyle = s.color;
    g.lineWidth = 1.5;
    g.beginPath();
    let started = false;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      if (started) g.lineTo(x(i), y(v)); else { g.moveTo(x(i), y(v)); started = true; }
    });
    g.stroke();
    g.fillStyle = s.color;
    g.fillText(s.label, 6 + k * 150, 10);
  });
  g.fillStyle = "#4a5666";
  g.fillText(`${min}`, 2, H - 16);
  g.fillText(`${max}`, 2, 20);
}

function download(name: string, rows: Row[]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export class DataPanel {
  private groups = canvas("chartGroups");
  private drift = canvas("chartDrift");
  private herit = canvas("chartHerit");
  private trait = TRAITS[0].key;

  /** the live world's server, when the page is watching it instead of running its own */
  remote: string | null = null;

  constructor(private world: World) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const reward = $<HTMLInputElement>("learnReward"), hebb = $<HTMLInputElement>("learnHebb");
    const mb = $<HTMLInputElement>("learnMemory");
    reward.checked = world.learning.reward;
    hebb.checked = world.learning.hebbian;
    mb.checked = world.learning.mb;
    reward.addEventListener("change", () => { if (!this.remote) world.learning.reward = reward.checked; });
    hebb.addEventListener("change", () => { if (!this.remote) world.learning.hebbian = hebb.checked; });
    mb.addEventListener("change", () => { if (!this.remote) world.learning.mb = mb.checked; });

    const pick = $<HTMLSelectElement>("traitPick");
    for (const tr of TRAITS) pick.add(new Option(tx(`sim.data.trait.${tr.key}`, tr.label), tr.key));
    pick.addEventListener("change", () => { this.trait = pick.value; this.update(); });

    const stamp = () => `t${Math.round(world.time)}s`;
    // button -> [the server's export, the local download]
    const csv: Record<string, [string, () => void]> = {
      csvWorld: ["world.csv", () => download(`fly-world-${stamp()}.csv`, world.log.world.rows)],
      csvFlies: ["flies.csv", () => download(`fly-flies-${stamp()}.csv`, world.log.flies.rows)],
      csvLineage: ["lineage.csv", () => download(`fly-lineage-${stamp()}.csv`, [...world.log.lineage.values()])],
      csvBrood: ["eggs.csv", () => download(`fly-eggs-${stamp()}.csv`, [...world.log.brood.values()])],
      csvPairs: ["relationships.csv", () => download(`fly-relationships-${stamp()}.csv`, world.relationshipRows())],
      csvBlocks: ["blocks.csv", () => download(`fly-brain-blocks-${stamp()}.csv`, world.driftByBlock())],
      csvEvents: ["events.csv", () => download(`fly-events-${stamp()}.csv`, world.log.events.rows)],
    };
    for (const [id, [file, fn]] of Object.entries(csv)) {
      $(id).addEventListener("click", () => (this.remote ? location.assign(`${this.remote}/export/${file}`) : fn()));
    }
    $("report").addEventListener("click", () => (this.remote ? window.open(`${this.remote}/report`, "_blank") : openReport(world)));
  }

  update(): void {
    const w = this.world;
    if (this.remote) {
      // the server's switches, shown read-only
      for (const [id, on] of [["learnReward", w.learning.reward], ["learnHebb", w.learning.hebbian], ["learnMemory", w.learning.mb]] as const) {
        const box = $<HTMLInputElement>(id);
        box.checked = on;
        box.disabled = true;
      }
    }
    const rows = w.log.world.rows.slice(-600);
    const col = (k: string) => rows.map((r) => Number(r[k]));

    lines(this.groups, [
      { values: col("share_in_groups"), color: "#6cf08a", label: t("sim.data.shareInGroups") },
      { values: col("aggregation"), color: "#3ed8ff", label: t("sim.data.nnRatio") },
    ], 0, 1.6, { at: 1, label: t("sim.data.random") });

    lines(this.drift, [
      { values: col("mean_drift").map((v) => v * 100), color: "#ffb23e", label: t("sim.data.meanDrift") },
      { values: col("max_drift").map((v) => v * 100), color: "#ff7a7a", label: t("sim.data.maxDrift") },
    ], 0, Math.max(5, Math.ceil(Math.max(0, ...col("max_drift")) * 100)));

    const last = rows.at(-1);
    $("datanow").textContent = last ? t("sim.data.now", { clock: String(last.clock), learning: String(last.learning) }) : "—";
    $("groupNote").innerHTML = last
      ? t("sim.data.groupNote", {
        groups: String(last.groups), largest: String(last.largest_group),
        inGroup: Math.round(Number(last.share_in_groups) * 100), atFood: Math.round(Number(last.grouped_at_food) * 100),
        ratio: Number(last.aggregation).toFixed(2),
      })
      : "";

    this.renderFates();
    this.renderHeritability();
    this.renderSocial();
  }

  private renderFates(): void {
    // label -> [count, colour]: green became an adult, amber still growing, red died
    const counts = new Map<string, [number, string]>();
    const stage = (v: unknown) => tx(`sim.data.stage.${v}`, String(v));
    for (const b of this.world.log.brood.values()) {
      const [key, color] = b.fate === "died"
        ? [t("sim.data.died", { cause: tx(`sim.data.cause.${keyOf(String(b.cause))}`, String(b.cause)), stage: stage(b.stage) }), "#ff7a7a"]
        : b.fate === "emerged" ? [t("sim.data.emerged"), "#6cf08a"] : [t("sim.data.still", { fate: stage(b.fate) }), "#ffb23e"];
      counts.set(key, [(counts.get(key)?.[0] ?? 0) + 1, color]);
    }
    const total = [...counts.values()].reduce((a, [n]) => a + n, 0);
    const sorted = [...counts.entries()].sort((a, b) => b[1][0] - a[1][0]);
    $("broodBars").innerHTML = total
      ? sorted.map(([k, [v, color]]) => `<div><span>${k}</span><i style="width:${(100 * v) / total}%;background:${color}"></i><b>${v}</b></div>`).join("")
      : `<div class="note">${t("sim.data.noEggs")}</div>`;
  }

  private renderHeritability(): void {
    const g = this.herit;
    const trait = TRAITS.find((x) => x.key === this.trait)!;
    const pts = regression(this.world, trait.key);
    g.fillStyle = "#060707";
    g.fillRect(0, 0, W, H);
    g.font = "9px ui-monospace, monospace";
    if (pts.n < 3) {
      g.fillStyle = "#4a5666";
      g.fillText(t("sim.data.waitFamilies", { n: pts.n }), 8, H / 2);
      $("heritNote").textContent = "";
      return;
    }
    const xs = pts.points.map((p) => p[0]), ys = pts.points.map((p) => p[1]);
    const lo = Math.min(...xs, ...ys), hi = Math.max(...xs, ...ys);
    const pad = (hi - lo) * 0.08 || 0.01;
    const sx = (v: number) => 20 + (W - 30) * ((v - lo + pad) / (hi - lo + 2 * pad));
    const sy = (v: number) => H - 14 - (H - 24) * ((v - lo + pad) / (hi - lo + 2 * pad));
    g.strokeStyle = "#39424f";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(sx(lo), sy(lo)); g.lineTo(sx(hi), sy(hi)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#3ed8ff";
    for (const [x, y] of pts.points) g.fillRect(sx(x) - 1.5, sy(y) - 1.5, 3, 3);
    g.strokeStyle = "#6cf08a";
    g.beginPath();
    g.moveTo(sx(lo), sy(pts.intercept + pts.slope * lo));
    g.lineTo(sx(hi), sy(pts.intercept + pts.slope * hi));
    g.stroke();
    g.fillStyle = "#6b7684";
    const xAxis = t("sim.data.parentsAxis");
    g.fillText(xAxis, W - g.measureText(xAxis).width - 4, H - 3);
    g.fillText(t("sim.data.childAxis"), 2, 10);
    $("heritNote").innerHTML = t("sim.data.heritNote", { n: pts.n, slope: pts.slope.toFixed(2), r: pts.r.toFixed(2) });
  }

  private renderSocial(): void {
    const w = this.world;
    const counts = w.relationshipCounts();
    const alive = new Set(w.flies.map((f) => f.id));
    const rows = w.relationshipRows().filter((r) => r.both_alive && (r.label === "friends" || r.label === "enemies" || r.label === "mates"));
    rows.sort((a, b) => (b.label === "enemies" ? Number(b.tension) : Number(b.near_s)) - (a.label === "enemies" ? Number(a.tension) : Number(a.near_s)));
    const icon: Record<string, string> = { friends: "🤝", enemies: "⚔️", mates: "♥" };
    $("socialNow").innerHTML =
      `<div class="kv">${Object.entries(counts).map(([k, v]) => `<span>${tx(`sim.data.rel.${k}`, k)} <b>${v}</b></span>`).join("")}</div>` +
      `<div class="pairs">${rows.slice(0, 6).map((r) =>
        `<div><span>${icon[String(r.label)]} ${r.a_name} &amp; ${r.b_name}</span><span>${r.label === "enemies" ? t("sim.data.clashes", { n: String(r.tension) }) : t("sim.data.together", { n: Math.round(Number(r.near_s)) })}</span></div>`).join("")}</div>` +
      (alive.size && !rows.length ? `<div class="note">${t("sim.data.noFriends")}</div>` : "");
  }
}
