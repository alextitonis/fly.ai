/**
 * The printable report: the run's findings as tables and SVG charts in a new tab, ready for the browser's
 * Save as PDF. Built from world.log only.
 */
import type { Row } from "./datalog.ts";
import { BROOD, REWARD, type World } from "./sim.ts";
import { MEMORY, PLASTICITY } from "./brain.ts";
import { esc as escHtml } from "./util.ts";

/** Traits for the parent-child comparison: genes (inherited by construction) and lived outcomes (not). */
export const TRAITS: { key: string; label: string }[] = [
  { key: "lifespan", label: "gene: lifespan" },
  { key: "flight", label: "gene: flight power" },
  { key: "clutch", label: "gene: clutch size" },
  { key: "gene_loom_escape", label: "gene: looming → escape" },
  { key: "gene_odour_steer", label: "gene: odour → steering" },
  { key: "gene_contact_courtship", label: "gene: contact → courtship" },
  { key: "olfaction_gain", label: "gene: smell gain" },
  { key: "reward_rate", label: "gene: reward learning rate" },
  { key: "memory_rate", label: "gene: odour memory rate" },
  { key: "meals_per_min", label: "lived: meals per minute" },
  { key: "age_at_death", label: "lived: age at death" },
  { key: "final_drift", label: "lived: brain change at death" },
];

function value(row: Row | undefined, key: string): number {
  if (!row) return NaN;
  if (key === "meals_per_min") {
    const age = Number(row.age_at_death);
    return row.died_t === null || !age ? NaN : (Number(row.meals) / age) * 60;
  }
  const v = row[key];
  return v === null || v === undefined ? NaN : Number(v);
}

/** Child's value against the mean of its two parents' values, least squares. */
export function regression(world: World, key: string): { n: number; slope: number; intercept: number; r: number; points: [number, number][] } {
  const lin = world.log.lineage;
  const points: [number, number][] = [];
  for (const row of lin.values()) {
    if (row.mother === null || row.father === null) continue;
    const c = value(row, key);
    const m = value(lin.get(Number(row.mother)), key), f = value(lin.get(Number(row.father)), key);
    if ([c, m, f].every(Number.isFinite)) points.push([(m + f) / 2, c]);
  }
  const n = points.length;
  if (n < 3) return { n, slope: NaN, intercept: NaN, r: NaN, points };
  const mx = points.reduce((a, p) => a + p[0], 0) / n, my = points.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of points) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxx ? sxy / sxx : NaN;
  return { n, slope, intercept: my - slope * mx, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN, points };
}

const esc = (s: unknown) => escHtml(String(s ?? ""));
const fmt = (v: number, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : "—");
const mean = (xs: number[]) => { const f = xs.filter(Number.isFinite); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN; };

function table(head: string[], rows: (string | number)[][]): string {
  if (!rows.length) return `<p class="muted">${esc(head[0])}: none yet.</p>`;
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
}

function svgLines(rows: Row[], series: { key: string; label: string; color: string; scale?: number }[], min: number, max: number, ref?: number): string {
  const Wd = 720, Hd = 190, TOP = 30, n = rows.length;             // the legend gets its own row above the plot
  if (n < 2) return `<p class="muted">Not enough samples yet.</p>`;
  const x = (i: number) => 40 + ((Wd - 50) * i) / (n - 1);
  const y = (v: number) => Hd - 22 - (Hd - 22 - TOP) * ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1));
  const paths = series.map((s) => {
    let d = "";
    rows.forEach((r, i) => {
      const v = Number(r[s.key]) * (s.scale ?? 1);
      if (Number.isFinite(v)) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.6"/>`;
  }).join("");
  const legend = series.map((s, k) => `<text x="${44 + k * 220}" y="12" fill="${s.color}" font-size="11">${esc(s.label)}</text>`).join("");
  const refLine = ref === undefined ? "" : `<line x1="40" x2="${Wd - 10}" y1="${y(ref)}" y2="${y(ref)}" stroke="#999" stroke-dasharray="4 4"/>`;
  const t0 = Number(rows[0].t), t1 = Number(rows[n - 1].t);
  return `<svg viewBox="0 0 ${Wd} ${Hd}" width="100%" role="img">${refLine}${paths}${legend}` +
    `<text x="4" y="${y(max) + 4}" font-size="10" fill="#666">${max}</text><text x="4" y="${y(min)}" font-size="10" fill="#666">${min}</text>` +
    `<text x="40" y="${Hd - 4}" font-size="10" fill="#666">${Math.round(t0)} s</text><text x="${Wd - 60}" y="${Hd - 4}" font-size="10" fill="#666">${Math.round(t1)} s</text></svg>`;
}

export function buildReport(world: World): string {
  const log = world.log;
  const rows = log.world.rows;
  const step = Math.max(1, Math.ceil(rows.length / 400));
  const thin = rows.filter((_, i) => i % step === 0);
  const col = (k: string) => rows.map((r) => Number(r[k]));
  const lineage = [...log.lineage.values()];
  const brood = [...log.brood.values()];
  const born = lineage.filter((r) => r.mother !== null);
  const dead = lineage.filter((r) => r.died_t !== null);
  const last = rows.at(-1);

  const fateCounts = new Map<string, number>();
  for (const b of brood) {
    const k = b.fate === "died" ? `died (${b.stage}): ${b.cause}` : b.fate === "emerged" ? "became an adult" : `still ${b.fate}`;
    fateCounts.set(k, (fateCounts.get(k) ?? 0) + 1);
  }
  const causeCounts = new Map<string, number>();
  for (const r of dead) causeCounts.set(String(r.cause), (causeCounts.get(String(r.cause)) ?? 0) + 1);

  const pairs = world.relationshipRows();
  const labelCount = (l: string) => pairs.filter((p) => p.label === l).length;
  const topFriends = pairs.filter((p) => p.label === "friends").sort((a, b) => Number(b.near_s) - Number(a.near_s)).slice(0, 8);
  const topEnemies = pairs.filter((p) => p.label === "enemies").sort((a, b) => Number(b.tension) - Number(a.tension)).slice(0, 8);
  const blocks = world.driftByBlock().sort((a, b) => Math.abs(Number(b.mean_change)) - Math.abs(Number(a.mean_change))).slice(0, 10);
  const heritRows = TRAITS.map((t) => { const r = regression(world, t.key); return [t.label, r.n, fmt(r.slope), fmt(r.r)]; });
  const drifts = world.flies.map((f) => f.brain.drift());

  const css = `body{font:13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:860px;margin:24px auto;padding:0 20px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:26px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:12px}th,td{border-bottom:1px solid #e5e5e5;padding:4px 6px;text-align:left}
th{background:#f5f5f5}.muted{color:#666}.kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 16px}
.kv div b{display:block;font-size:16px}.print{position:fixed;top:12px;right:12px;padding:8px 14px;font-size:14px}
@media print{.print{display:none}h2{break-after:avoid}table,svg{break-inside:avoid}}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>fly.ai world report · ${Math.round(world.time)} s</title><style>${css}</style></head><body>
<button class="print" onclick="print()">Save as PDF</button>
<h1>fly.ai world · run report</h1>
<p class="muted">World seed ${world.seed} · ${Math.round(world.time)} s simulated (${(world.time / world.dayLength).toFixed(1)} in-world days) ·
learning: ${esc(last?.learning ?? "off")} · generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</p>
<div class="kv">
<div>adults now<b>${world.flies.length}</b></div><div>flies ever<b>${lineage.length}</b></div>
<div>born in this run<b>${born.length}</b></div><div>deepest generation<b>${Math.max(0, ...lineage.map((r) => Number(r.generation)))}</b></div>
<div>matings<b>${world.matings}</b></div><div>eggs laid<b>${world.eggsLaid}</b></div>
<div>hatched / became adults<b>${world.hatched} / ${world.emerged}</b></div><div>eggs + larvae died<b>${brood.filter((b) => b.fate === "died").length}</b></div>
</div>

<h2>Population</h2>
${svgLines(thin, [{ key: "adults", label: "adults", color: "#1a9e4b" }, { key: "eggs", label: "eggs", color: "#d08a00" }, { key: "larvae", label: "larvae", color: "#8a5cd0" }], 0, Math.max(10, ...col("adults"), ...col("eggs"), ...col("larvae")))}
${table(["adult deaths by cause", "count"], [...causeCounts.entries()].sort((a, b) => b[1] - a[1]))}

<h2>Do they gather?</h2>
<p>A group is 3 or more flies each within 2 m of another. The nearest-neighbour ratio compares how close flies are to
their nearest neighbour with the same number of flies placed at random in the arena: below 1 means they gather.</p>
${svgLines(thin, [{ key: "share_in_groups", label: "share of flies in groups", color: "#1a9e4b" }, { key: "aggregation", label: "nearest-neighbour ratio", color: "#1f7fd0" }], 0, 1.6, 1)}
<div class="kv"><div>mean share in groups<b>${fmt(mean(col("share_in_groups")) * 100, 0)}%</b></div>
<div>mean ratio (1 = random)<b>${fmt(mean(col("aggregation")))}</b></div>
<div>grouped flies at food<b>${fmt(mean(col("grouped_at_food")) * 100, 0)}%</b></div>
<div>largest group seen<b>${Math.max(0, ...col("largest_group"))}</b></div></div>
<p class="muted">If most grouped flies are at food, the groups may be shared meals rather than flies seeking each other.</p>

<h2>Friends and enemies</h2>
<p>Labels come from what happened between two flies: time within 1.5 m, mid-air bumps, and giant-fibre startles near each
other (not during a spider or swatter scare). Mates: mated. Family: parent and child, or same mother. Enemies: 6+ clashes
(bumps + 2 × startles) and one per 20 s together. Friends: 90+ s together and at most one clash per 60 s.</p>
${table(["label", "pairs ever"], ["mates", "family", "enemies", "friends", "acquaintances", "none"].map((l) => [l, labelCount(l)]))}
${topFriends.length ? table(["closest friends", "seconds together", "clashes"], topFriends.map((p) => [`${p.a_name} & ${p.b_name}`, p.near_s as number, p.tension as number])) : `<p class="muted">No friendships yet.</p>`}
${topEnemies.length ? table(["worst enemies", "clashes", "seconds together"], topEnemies.map((p) => [`${p.a_name} & ${p.b_name}`, p.tension as number, p.near_s as number])) : `<p class="muted">No enemies yet.</p>`}

<h2>Do brains change during life?</h2>
<p>Synapse change is the mean relative difference between each synapse now and what the fly was born with.
Hebbian: a synapse grows ${PLASTICITY.hebbRate * 100}% of its size when its input fired just before its output.
Reward: those pairings leave a trace (${PLASTICITY.eligibilityTau} s) that a meal (+${REWARD.meal}), a knock (${REWARD.knock}) or a spider
strike nearby (${REWARD.spiderNear}) turns into change of ${PLASTICITY.rewardRate * 100}% per unit. Synapses stay within
${PLASTICITY.minScale}-${PLASTICITY.maxScale}× their size and drift back over ${PLASTICITY.recoverTau} s.</p>
${svgLines(thin, [{ key: "mean_drift", label: "mean synapse change %", color: "#d08a00", scale: 100 }, { key: "max_drift", label: "most-changed fly %", color: "#c03030", scale: 100 }], 0, Math.max(5, Math.ceil(Math.max(0, ...col("max_drift")) * 100)))}
<div class="kv"><div>living flies, mean change<b>${fmt(mean(drifts) * 100)}%</b></div><div>most-changed living fly<b>${fmt(Math.max(0, ...drifts) * 100)}%</b></div>
<div>dead flies, mean change at death<b>${fmt(mean(dead.map((r) => Number(r.final_drift))) * 100)}%</b></div></div>
${table(["connection block (living flies)", "mean change"], blocks.map((b) => [`${b.from} → ${b.to} (${b.mode})`, `${(Number(b.mean_change) * 100).toFixed(2)}%`]))}
<p class="muted">Whether this change helps a fly is a separate, measured question (world/tools/lifedata.ts compares learners with frozen flies).</p>

<h2>What do flies remember about smells?</h2>
<p>The mushroom body: Kenyon cells give each odour a sparse signature; when a dopamine teacher fires while that
signature is active, the Kenyon cells' synapses onto one output are depressed by up to ${Math.round((1 - MEMORY.floor) * 100)}%, and
what is left fades over ${MEMORY.forgetTau} s. The punishment teacher listens to a looming threat, a knock and the aversive
glomeruli, which carry the alarm CO<sub>2</sub> a frightened neighbour gives off; the reward teacher listens to juice
on the labellum. Memory depth is the mean depression of those synapses (0 = nothing learned).</p>
${svgLines(thin, [{ key: "mean_memory", label: "mean memory depth %", color: "#8a5cd0", scale: 100 }], 0, Math.max(5, Math.ceil(Math.max(0, ...col("mean_memory")) * 100)))}
<div class="kv"><div>living flies, mean memory depth<b>${fmt(mean(world.flies.map((f) => f.brain.memoryDepth())) * 100)}%</b></div>
<div>deepest memory, living fly<b>${fmt(Math.max(0, ...world.flies.map((f) => f.brain.memoryDepth())) * 100)}%</b></div></div>
<p class="muted">Whether a punished odour really becomes repellent, and whether a fly can learn it from another fly's fright, is measured in world/tools/memory.ts.</p>

<h2>Do babies take after their parents?</h2>
<p>Each child against the average of its two parents. Genes are passed on by design (each gene from one parent at random,
plus a small mutation), so their slope should sit near 1. Lived outcomes (meals, age at death, brain change) also depend
on luck and where a fly lives; their slope is the real question.</p>
${table(["trait", "children with both parents", "slope", "r"], heritRows)}

<h2>Eggs and larvae</h2>
<p>An egg hatches after ${BROOD.eggS} s and a larva becomes an adult after ${BROOD.larvaS} s, unless it dies first: background
(${BROOD.background.egg}/s eggs, ${BROOD.background.larva}/s larvae), mould substrate (+${BROOD.mould}/s), eaten-away substrate
(+${BROOD.bare}/s), crowding (+${BROOD.crowd}/s per neighbour beyond ${BROOD.crowdFree} within ${BROOD.crowdM} m), a landing fly
(${BROOD.trample * 100}% within ${BROOD.trampleM} m) or a spider strike within ${BROOD.spiderM} m.</p>
${table(["fate", "count"], [...fateCounts.entries()].sort((a, b) => b[1] - a[1]))}

<h2>The data behind this</h2>
<p class="muted">world: ${rows.length} rows (one per second${log.world.dropped ? `, ${log.world.dropped} oldest dropped` : ""}) ·
flies: ${log.flies.rows.length} rows · lineage: ${lineage.length} · eggs: ${brood.length} · relationships: ${pairs.length} ·
events: ${log.events.rows.length}. Download them as CSV from the Data card.</p>
</body></html>`;
}

export function openReport(world: World): void {
  const html = buildReport(world);
  const win = window.open("", "_blank");
  if (!win) {
    const blob = new Blob([html], { type: "text/html" });
    location.assign(URL.createObjectURL(blob));
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
