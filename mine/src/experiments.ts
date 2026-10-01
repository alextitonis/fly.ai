/**
 * What our own experiments found: one headline per house order, worked out from its settled results, for the
 * /compute/results page (GET /api/experiments). Pure functions over result rows; the server feeds them.
 *
 * Every summary says how many runs it rests on. Where an experiment is large, the server reads a sample of its
 * settled runs (the first ones in settle order), and the summary says so.
 */

export interface Figure { k: string; v: string }
export interface Summary {
  label: string;
  family: "tuning" | "world" | "encoding" | "colosseum" | "demo" | "other";
  question: string;
  /** one line, the finding */
  headline: string;
  figures: Figure[];
  /** an optional small table: header row then rows */
  table?: string[][];
  runs_read: number;
}

const r1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : "–");
const r2 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 100) / 100).toString() : "–");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const signed = (x: number, unit = "") => `${x >= 0 ? "+" : ""}${r1(x)}${unit}`;

const SENSES: Record<string, string> = {
  LPLC2: "a looming shape", LC4: "a fast threat", LPLC1: "a small approaching object", LC10a: "a target up close", SNta: "a leg touch",
};

// ---- tuning: connectome sweeps --------------------------------------------------------------------------------
export interface SweepRow { channel: string; side: string; amount: number; gain: number; tonic: number; steps: number; warm: number; base: number[]; stim: number[] }

/** For each sense, the motor group it drives most at its strongest setting: Hz during the drive minus Hz before it. */
export function tuningSummary(label: string, rows: SweepRow[], outputs: string[], sizes: number[], dt: number): Summary {
  const rate = (n: number, g: number, steps: number) => n / (sizes[g] || 1) / (steps * dt);
  const byChannel = new Map<string, SweepRow[]>();
  for (const r of rows) if (r.channel !== "none") byChannel.set(r.channel, [...(byChannel.get(r.channel) ?? []), r]);
  const table: string[][] = [["Sense", "Drives most", "Change", "Runs"]];
  let best = { channel: "", group: "", delta: -Infinity };
  for (const [channel, rs] of byChannel) {
    const top = Math.max(...rs.map((r) => r.amount));
    const strongest = rs.filter((r) => r.amount === top);
    const delta = outputs.map((_, g) => mean(strongest.map((r) => rate(r.stim[g], g, r.steps - r.warm) - rate(r.base[g], g, r.warm))));
    const g = delta.indexOf(Math.max(...delta));
    table.push([`${channel} (${SENSES[channel] ?? channel})`, outputs[g] ?? "–", `${signed(delta[g])} Hz`, String(strongest.length)]);
    if (delta[g] > best.delta) best = { channel, group: outputs[g], delta: delta[g] };
  }
  const channels = [...byChannel.keys()];
  return {
    label, family: "tuning",
    question: `What do the fly's motor neurons do when it senses ${channels.map((c) => SENSES[c] ?? c).join(", ") || "nothing"}?`,
    headline: best.channel ? `${best.channel} drives ${best.group} hardest: ${signed(best.delta)} Hz per neuron above rest, at the strongest drive.` : "No settled runs yet.",
    figures: [{ k: "Runs", v: rows.length.toLocaleString("en-US") }, { k: "Senses", v: String(channels.length) }],
    table: table.length > 1 ? table : undefined,
    runs_read: rows.length,
  };
}

// ---- world: the small-brain colony simulation -------------------------------------------------------------------
export interface WorldRun { seed: number; flies: number; seconds: number; learning: Record<string, boolean> | null; end: { adults: number; mean_meals: number; mean_age: number }; totals: { eggs: number; emerged: number } }

export function worldSummary(label: string, runs: WorldRun[]): Summary {
  const alive = runs.filter((r) => r.end.adults > 0);
  const f = runs[0];
  return {
    label, family: "world",
    question: f ? `How does a colony of ${f.flies} flies do over ${Math.round(f.seconds / 60)} simulated minutes?` : "How does a colony of flies do?",
    headline: runs.length
      ? `${pct(alive.length / runs.length)} of colonies still had adults at the end, ${r1(mean(runs.map((r) => r.end.adults)))} on average (from ${f.flies}).`
      : "No settled runs yet.",
    figures: [
      { k: "Runs", v: runs.length.toLocaleString("en-US") },
      { k: "Meals per fly", v: r2(mean(runs.map((r) => r.end.mean_meals))) },
      { k: "Eggs per run", v: r1(mean(runs.map((r) => r.totals.eggs))) },
      { k: "Flies born per run", v: r1(mean(runs.map((r) => r.totals.emerged))) },
    ],
    runs_read: runs.length,
  };
}

/** Learning on vs off over the same seeds: the flies' own brains learning while they live, or frozen. */
export function learningSummary(label: string, on: WorldRun[], off: WorldRun[]): Summary {
  const offBySeed = new Map(off.map((r) => [r.seed, r]));
  const pairs = on.filter((r) => offBySeed.has(r.seed)).map((r) => ({ on: r, off: offBySeed.get(r.seed)! }));
  const meals = { on: mean(pairs.map((p) => p.on.end.mean_meals)), off: mean(pairs.map((p) => p.off.end.mean_meals)) };
  const adults = { on: mean(pairs.map((p) => p.on.end.adults)), off: mean(pairs.map((p) => p.off.end.adults)) };
  const better = pairs.filter((p) => p.on.end.mean_meals > p.off.end.mean_meals).length;
  const change = (meals.on - meals.off) / meals.off;
  return {
    label, family: "world",
    question: "Does learning while they live help the flies eat and survive? Same seeds, learning on vs off.",
    headline: pairs.length
      ? `Learning ${change >= 0 ? "helped" : "hurt"}: ${r2(meals.on)} meals per fly with learning vs ${r2(meals.off)} without (${signed(change * 100, "%")}); it did better on ${better} of ${pairs.length} seeds.`
      : "No matched pairs settled yet.",
    figures: [
      { k: "Matched seeds", v: pairs.length.toLocaleString("en-US") },
      { k: "Adults at the end", v: `${r1(adults.on)} learning · ${r1(adults.off)} frozen` },
    ],
    runs_read: pairs.length * 2,
  };
}

// ---- encoding: probes of the descending neurons and wings ---------------------------------------------------------
export interface ProbeRun { condition: string; steps: number; counts: Uint16Array }

/**
 * Per condition, spikes per neuron per second in the descending neurons and the wing motor neurons, next to the
 * "nothing" control. `columns` are the record sets' sizes in output order (descending, wing).
 */
export function encodingSummary(label: string, runs: ProbeRun[], columns: number[], dt: number): Summary {
  const width = columns.reduce((a, b) => a + b, 0);
  const setOf = (c: number) => (c < columns[0] ? 0 : 1);
  const per = new Map<string, { dn: number[]; wing: number[] }>();
  for (const r of runs) {
    const sums = [0, 0];
    for (let i = 0; i < r.counts.length; i++) sums[setOf(i % width)] += r.counts[i];
    const secs = r.steps * dt;
    const e = per.get(r.condition) ?? { dn: [], wing: [] };
    e.dn.push(sums[0] / columns[0] / secs);
    e.wing.push(sums[1] / Math.max(1, columns[1]) / secs);
    per.set(r.condition, e);
  }
  const base = per.get("nothing");
  const rows = [...per.entries()].filter(([c]) => c !== "nothing").map(([c, e]) => ({
    c, dn: mean(e.dn), wing: mean(e.wing), n: e.dn.length,
    dnUp: base ? mean(e.dn) / mean(base.dn) - 1 : NaN, wingUp: base ? mean(e.wing) - mean(base.wing) : NaN,
  })).sort((a, b) => b.dnUp - a.dnUp);
  const top = rows[0];
  const wingTop = [...rows].sort((a, b) => b.wingUp - a.wingUp)[0];
  const table: string[][] = [["Condition", "Descending neurons", "Wing motor neurons", "Runs"]];
  for (const r of rows.slice(0, 12)) table.push([r.c, `${signed(r.dnUp * 100, "%")} vs nothing`, `${signed(r.wingUp)} Hz`, String(r.n)]);
  return {
    label, family: "encoding",
    question: "Which senses reach the fly's descending neurons and wings? This is the data Flybook's translator and the fly market read.",
    headline: top
      ? `"${top.c}" moves the descending neurons most (${signed(top.dnUp * 100, "%")} vs doing nothing); "${wingTop.c}" moves the wings most (${signed(wingTop.wingUp)} Hz).`
      : "No settled runs yet.",
    figures: [{ k: "Runs", v: runs.length.toLocaleString("en-US") }, { k: "Conditions", v: String(per.size) }],
    table: table.length > 1 ? table : undefined,
    runs_read: runs.length,
  };
}

// ---- demos ---------------------------------------------------------------------------------------------------------
/** Monte Carlo pi: each job counts hits among 5,000,000 samples (examples/pi-rust). */
export function piSummary(label: string, hits: bigint[], samplesPerJob = 5_000_000): Summary {
  const total = BigInt(hits.length) * BigInt(samplesPerJob);
  const sum = hits.reduce((a, b) => a + b, 0n);
  const pi = total ? Number((sum * 4n * 10n ** 12n) / total) / 1e12 : NaN;
  return {
    label, family: "demo",
    question: "How close does the network get to π by throwing random points at a square?",
    headline: hits.length ? `π ≈ ${pi.toFixed(7)} from ${(Number(total) / 1e9).toFixed(1)} billion samples (off by ${(Math.abs(pi - Math.PI) / Math.PI * 1e6).toFixed(1)} parts per million).` : "No settled runs yet.",
    figures: [{ k: "Jobs", v: hits.length.toLocaleString("en-US") }],
    runs_read: hits.length,
  };
}

/** Travelling salesman by random restarts: each job's output starts with its tour length (examples/tsp-search). */
export function tspSummary(label: string, lengths: number[]): Summary {
  const sorted = [...lengths].sort((a, b) => a - b);
  return {
    label, family: "demo",
    question: "How short a round trip through 60 cities do random restarts find?",
    headline: sorted.length ? `The shortest tour is ${sorted[0].toLocaleString("en-US")} long; a typical restart finds ${sorted[sorted.length >> 1].toLocaleString("en-US")}.` : "No settled runs yet.",
    figures: [{ k: "Restarts", v: lengths.length.toLocaleString("en-US") }, { k: "Worst", v: sorted.length ? sorted[sorted.length - 1].toLocaleString("en-US") : "–" }],
    runs_read: lengths.length,
  };
}

export function tilesSummary(label: string, done: number, total: number): Summary {
  return {
    label, family: "demo",
    question: "Can the network render the Mandelbrot set, one tile per job?",
    headline: `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} tiles rendered and checked.`,
    figures: [],
    runs_read: done,
  };
}

// ---- colosseum: practice fights and season replays ------------------------------------------------------------

type Stat4 = { pow: number; grd: number; vit: number; fury: number };
const STAT_KEYS = ["pow", "grd", "vit", "fury"] as const;
const STAT_NAMES: Record<(typeof STAT_KEYS)[number], string> = { pow: "Power", grd: "Guard", vit: "Vitality", fury: "Fury" };

/** One settled fight job (src/fightjob.ts FightResult), with what the server's own run gave when it's a replay. */
export interface FightRun {
  a: Stat4; b: Stat4; seeds: [number, number]; winner: 0 | 1; how: string; rounds: number; hp: [number, number];
  expect?: { winner: number; how: string; rounds: number; hp: number[]; seeds: number[] | null } | null;
}

/** Least squares: the coefficients of y on the columns of x (with x already holding a constant column). */
function ols(x: number[][], y: number[]): { beta: number[]; se: number[] } {
  const k = x[0].length, n = x.length;
  const a = Array.from({ length: k }, () => new Array(2 * k).fill(0));
  for (let r = 0; r < n; r++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) a[i][j] += x[r][i] * x[r][j];
  for (let i = 0; i < k; i++) a[i][k + i] = 1;
  for (let c = 0; c < k; c++) {                       // Gauss-Jordan: [X'X | I] -> [I | (X'X)^-1]
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    if (Math.abs(d) < 1e-12) return { beta: new Array(k).fill(NaN), se: new Array(k).fill(NaN) };
    for (let j = 0; j < 2 * k; j++) a[c][j] /= d;
    for (let r = 0; r < k; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[c][j]; }
  }
  const inv = a.map((row) => row.slice(k));
  const xty = new Array(k).fill(0);
  for (let r = 0; r < n; r++) for (let i = 0; i < k; i++) xty[i] += x[r][i] * y[r];
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  let rss = 0;
  for (let r = 0; r < n; r++) { const e = y[r] - x[r].reduce((s, v, j) => s + v * beta[j], 0); rss += e * e; }
  const s2 = rss / Math.max(1, n - k);
  return { beta, se: inv.map((row, i) => Math.sqrt(s2 * row[i])) };
}

/**
 * Practice fights between fighters with random stats: how much one point of each stat moves the chance to win
 * (a linear probability model on the stat differences), and whether going first or the coin decides too much.
 */
export function balanceSummary(label: string, runs: FightRun[]): Summary {
  const x = runs.map((r) => [1, ...STAT_KEYS.map((k) => r.a[k] - r.b[k])]);
  const y = runs.map((r) => (r.winner === 0 ? 1 : 0));
  const fit = runs.length > 20 ? ols(x, y) : null;
  const firstWins = mean(y);
  const ko = runs.filter((r) => r.how === "ko").length, coin = runs.filter((r) => r.how === "coin").length;
  const per = (i: number) => (fit ? `${signed(fit.beta[i + 1] * 100, " pts")} ± ${r2(1.96 * fit.se[i + 1] * 100)}` : "–");
  const ten = (i: number) => (fit ? pct(Math.min(1, Math.max(0, 0.5 + 10 * fit.beta[i + 1]))) : "–");
  const ranked = fit ? [...STAT_KEYS.keys()].sort((i, j) => fit.beta[j + 1] - fit.beta[i + 1]).map((i) => STAT_NAMES[STAT_KEYS[i]]) : [];
  return {
    label, family: "colosseum",
    question: "In the Fly Colosseum, what is one point of each stat really worth? Practice fights between fighters with random stats, played by real fly brains.",
    headline: fit
      ? `Per point, ${ranked.map((n) => `${n} ${signed(fit.beta[STAT_KEYS.findIndex((k) => STAT_NAMES[k] === n) + 1] * 100, " pts")}`).join(", ")} of win chance; the fly on the left wins ${pct(firstWins)} of fights.`
      : "Not enough settled fights yet.",
    figures: [
      { k: "Fights", v: runs.length.toLocaleString("en-US") },
      { k: "Knockouts", v: runs.length ? pct(ko / runs.length) : "–" },
      { k: "Decided by the coin", v: runs.length ? pct(coin / runs.length) : "–" },
      { k: "Rounds per fight", v: r1(mean(runs.map((r) => r.rounds))) },
    ],
    table: [["Stat", "Win chance per point", "10 points ahead wins"], ...STAT_KEYS.map((k, i) => [STAT_NAMES[k], per(i), ten(i)])],
    runs_read: runs.length,
  };
}

/** A finished season played again by the network: does every fight come out exactly as the server's did? */
export function replaySummary(label: string, runs: FightRun[], total: number): Summary {
  const checked = runs.filter((r) => r.expect);
  const same = checked.filter((r) => {
    const e = r.expect!;
    return e.winner === r.winner && e.how === r.how && e.rounds === r.rounds && e.hp.length === 2 && e.hp[0] === r.hp[0] && e.hp[1] === r.hp[1]
      && (!e.seeds || (e.seeds[0] === r.seeds[0] && e.seeds[1] === r.seeds[1]));
  });
  const season = /season-(\d+)/.exec(label)?.[1];
  return {
    label, family: "colosseum",
    question: `Does the network get the same results as the server for every fight of ${season ? `Season ${season}` : "a finished season"}?`,
    headline: checked.length === 0 ? "No fights replayed yet."
      : same.length === checked.length
        ? `All ${checked.length} of ${total} fights replayed by miners came out exactly as the server's: same winner, same rounds, same HP to the last point.`
        : `${checked.length - same.length} of ${checked.length} replayed fights came out differently from the server's.`,
    figures: [{ k: "Fights replayed", v: `${checked.length} of ${total}` }, { k: "Identical", v: `${same.length}` }],
    runs_read: checked.length,
  };
}
