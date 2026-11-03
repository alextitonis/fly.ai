/**
 * A replay job: one trading-rule setting walked over weeks of recorded 15-minute prices, as a paper book (2026-10-07).
 *
 * The rules are the trading desk's own (reversal, core, stockgap, and the return model's ghost), ported line for line
 * so the network can try thousands of settings where one PC tries a handful. Each job is one setting; two miners must
 * return the same bytes, so everything here is plain IEEE-754 double arithmetic in a fixed order (every map keeps
 * insertion order, every sort is stable, and Python's round-half-even is used where the desk's code rounds).
 *
 * The data is one upload (a "replay data" blob, gzip): every token's close per bar, the real share price for stock
 * tokens, and optionally the return model's prediction per token per bar (computed once off the network, since the
 * model itself does not travel). Fills follow the desk's paper executor: a pool fee a side, price impact against half
 * the pool's depth, $0.05 gas. A bar with no trade keeps the pool's last price.
 *
 * Output: JSON {trades, turnover, equity: [[bar index, value], ...] every `every` bars and the last one}.
 */

/** hops: the route's pools (a pool fee each); born: when the desk first priced it (0 = before the data), for live replays */
export interface ReplayToken { s: string; category: string; liquidity: number; hops?: number; born?: number }
export interface ReplayData {
  start: number;
  bar: number;
  n: number;
  tokens: ReplayToken[];
  /** close per token per bar, NaN where the pool did not trade */
  px: Float64Array[];
  /** real share prices, by symbol, NaN where none */
  real: Map<string, Float64Array>;
  /** the return model's prediction per token per bar (NaN = no score): mu net of a $50 round trip, and that round trip */
  mu: Float32Array[] | null;
  rt50: Float32Array[] | null;
  /** the routed pool's depth per token per bar, NaN where the token was not in the desk's table (live replays) */
  depth: Float64Array[] | null;
  /** the desk's limits as they changed: [from unix time, min buy usd, max trade usd] */
  limits: [number, number, number][] | null;
  /** perp data (2026-11-03, strategy "perp"): per-token arrays by name (funding, earn_next, earn_last) and market-wide
   * series by name (fng, vix), NaN where unknown */
  perp?: { arrays: Map<string, Float64Array[]>; series: Map<string, Float64Array> } | null;
}

export interface ReplaySetting {
  name: string;
  /** pool fee a side, as a fraction (0.003 = 0.3%) */
  fee: number;
  /** the book's starting money */
  usd: number;
  /** the rule's spec, as the desk writes it (strategy, categories, lookback_bars, hold_bars, ...) */
  rule: Record<string, any>;
  /** record the book's value every this many bars */
  every: number;
  /** trade behind the live desk's gates (needs data with depth): see runReplay */
  live?: boolean;
}

export interface ReplayResult {
  name: string; trades: number; turnover: number; equity: [number, number][];
  /** strategy "perp" only */
  perp?: { long_trips: number; short_trips: number; wins: number; funding: number; stops: number; liqs: number; open: number };
}

const MAGIC = "FLYRPLY1";

/** Decode a replay data blob: gzip of MAGIC, u32 header length, header JSON, padding to 8, then the arrays (closes,
 * real prices, the model's mu and rt50 when header.model, pool depth per bar when header.depth). */
export async function decodeReplayData(gz: Uint8Array): Promise<ReplayData> {
  const raw = new Uint8Array(await new Response(new Blob([gz as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  if (new TextDecoder().decode(raw.subarray(0, 8)) !== MAGIC) throw new Error("not replay data");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const hlen = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(raw.subarray(12, 12 + hlen)));
  let off = Math.ceil((12 + hlen) / 8) * 8;
  const n: number = header.n;
  const f64 = () => {
    const a = new Float64Array(raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + off + n * 8));
    off += n * 8;
    return a;
  };
  const f32 = () => {
    const a = new Float32Array(raw.buffer.slice(raw.byteOffset + off, raw.byteOffset + off + n * 4));
    off += n * 4;
    return a;
  };
  const tokens: ReplayToken[] = header.tokens;
  const px = tokens.map(() => f64());
  const real = new Map<string, Float64Array>();
  for (const s of header.real as string[]) real.set(s, f64());
  let mu: Float32Array[] | null = null;
  let rt50: Float32Array[] | null = null;
  if (header.model) {
    mu = tokens.map(() => f32());
    rt50 = tokens.map(() => f32());
  }
  const depth = header.depth ? tokens.map(() => f64()) : null;
  let perp: ReplayData["perp"] = null;
  if (header.perp) {
    const arrays = new Map<string, Float64Array[]>();
    for (const name of header.perp.arrays as string[]) arrays.set(name, tokens.map(() => f64()));
    const series = new Map<string, Float64Array>();
    for (const name of header.perp.series as string[]) series.set(name, f64());
    perp = { arrays, series };
  }
  if (off > raw.byteLength) throw new Error("replay data is cut short");
  return { start: header.start, bar: header.bar, n, tokens, px, real, mu, rt50, depth, limits: header.limits ?? null, perp };
}

// ---- helpers that keep Python's semantics ----------------------------------------------------------------------

/** Python's round(): half to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
/** Python's int() on a number: toward zero. */
const pyInt = (x: any): number => Math.trunc(Number(x));
const num = (x: any, fallback: number): number => (x === undefined || x === null || x === "" ? fallback : Number(x));
/** Python truthiness of a spec value */
const truthy = (x: any): boolean => !(x === undefined || x === null || x === 0 || x === "" || x === false || Number.isNaN(x)
  || (typeof x === "object" && !Object.keys(x).length)); // an empty list or {} is false, as in Python
/** Python's sum() of floats (3.12+): Neumaier's compensated sum, exactly as CPython does it (bltinmodule.c), since the
 *  desk runs on it and a last-bit difference can flip a threshold and send a book down another path */
export function pySum(xs: number[]): number {
  let f = 0, c = 0;
  for (const x of xs) {
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x;
    else c += (x - t) + f;
    f = t;
  }
  return c && Number.isFinite(c) ? f + c : f;
}
const sum = pySum;

type Prices = Map<string, number>;
interface Holding { qty: number; cost_eth: number; pool_peak?: number }
interface Book { eth: number; holdings: Map<string, Holding>; trades: number }
/** ok false: the executor refused it (live replays), nothing moves */
interface Fill { usd: number; qty: number; gas: number; ok?: boolean }
type Exec = (symbol: string, side: "buy" | "sell", amount: number, price: number) => Fill;
interface Made { symbol: string; side: "buy" | "sell"; usd: number }

/** bookvalue.value with no pool table (the replay has none): cash plus quantity x price. */
function value(book: Book, prices: Prices): number {
  return book.eth + sum([...book.holdings].map(([s, h]) => h.qty * (prices.get(s) ?? 0)));
}

/** rules._rebalance: move the book toward `want` (dollars per token), outside the band, in partial steps, exits in full. */
function rebalance(book: Book, want: Map<string, number>, slot: number, prices: Prices, spec: Record<string, any>, execute: Exec,
  noBuy: Set<string> = new Set()): Made[] {
  const have = new Map<string, number>();
  for (const [s, h] of book.holdings) if (h.qty > 0 && prices.has(s)) have.set(s, h.qty * prices.get(s)!);
  const done: Made[] = [];
  // sells first, so the buys have the cash; ties keep holdings' order, then want's
  const keys = [...have.keys()];
  for (const s of want.keys()) if (!have.has(s)) keys.push(s);
  const gapOf = (s: string) => (want.get(s) ?? 0) - (have.get(s) ?? 0);
  keys.sort((a, b) => gapOf(a) - gapOf(b));
  const band = Number(spec.band), partial = Number(spec.partial), minTrade = num(spec.min_trade_usd, 0) || 0;
  const maxTrade = truthy(spec._max_trade_usd) ? Number(spec._max_trade_usd) : Infinity;
  for (const s of keys) {
    const w = want.get(s) ?? 0;
    const gap = w - (have.get(s) ?? 0);
    if (Math.abs(gap) <= band * slot) continue;
    const step = w > 0 ? gap * partial : gap;
    if (Math.abs(step) < minTrade && w > 0) continue;
    const h = book.holdings.get(s);
    const p = prices.get(s)!;
    if (step < 0) {
      let qty = h ? Math.min(h.qty, -step / p) : 0;
      if (qty <= 0) continue;
      const fill = execute(s, "sell", qty, p);
      if (fill.ok === false) continue;
      qty = fill.qty;
      const frac = qty / h!.qty;
      h!.cost_eth *= 1 - frac;
      h!.qty -= qty;
      if (h!.qty <= 1e-12) book.holdings.delete(s);
      book.eth += fill.usd - fill.gas;
      done.push({ symbol: s, side: "sell", usd: fill.usd });
    } else {
      if (noBuy.has(s)) continue;
      const usd = Math.min(step, book.eth - 0.5, maxTrade);
      if (usd <= 0) continue;
      const fill = execute(s, "buy", usd, p);
      if (fill.ok === false) continue;
      let hh = book.holdings.get(s);
      if (!hh) book.holdings.set(s, (hh = { qty: 0, cost_eth: 0 }));
      hh.qty += fill.qty;
      hh.cost_eth += usd;
      book.eth -= usd + fill.gas;
      done.push({ symbol: s, side: "buy", usd });
    }
    book.trades += 1;
  }
  return done;
}

/** rules._ranked: rank-normalise to -1..+1, ties share their average rank. */
function ranked(values: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (values.size < 2) {
    for (const s of values.keys()) out.set(s, 0);
    return out;
  }
  const order = [...values.keys()].sort((a, b) => values.get(a)! - values.get(b)!);
  const n = order.length - 1;
  let i = 0;
  while (i <= n) {
    let j = i;
    while (j < n && values.get(order[j + 1]) === values.get(order[i])) j++;
    for (let k = i; k <= j; k++) out.set(order[k], (i + j) / n - 1);
    i = j + 1;
  }
  return out;
}

/** rules.trend_fit: slope a bar of the log price times the line's R² (path newest first). */
function trendFit(path: number[]): number {
  const ys: number[] = [];
  for (let i = path.length - 1; i >= 0; i--) if (path[i] > 0) ys.push(Math.log(path[i]));
  const n = ys.length;
  if (n < 3) return 0;
  const xm = (n - 1) / 2, ym = sum(ys) / n;
  const sxx = sum(ys.map((_, i) => (i - xm) ** 2));
  const sxy = sum(ys.map((y, i) => (i - xm) * (y - ym)));
  const syy = sum(ys.map((y) => (y - ym) ** 2));
  if (!sxx || !syy) return 0;
  return (sxy / sxx) * (sxy * sxy / (sxx * syy));
}

const SIGNALS = ["reversal", "trend", "calm", "drawdown", "forecast", "settled", "fit"] as const;

/** rules.combo_scores (no forecasts in a replay: that signal ranks every token the same). bars newest first. */
function comboScores(universe: string[], prices: Prices, bars: Prices[], spec: Record<string, any>): Map<string, number> {
  const w = spec.signals as Record<string, number>;
  const look = pyInt(spec.lookback_bars);
  const long = Math.min(pyInt(num(spec.trend_bars, 16)), bars.length - 1);
  const settle = Math.max(1, pyInt(num(spec.settle_bars, 2)));
  const raw: Record<string, Map<string, number>> = Object.fromEntries(SIGNALS.map((k) => [k, new Map()]));
  for (const s of universe) {
    const p = prices.get(s)!;
    const path: number[] = [];
    for (const b of bars.slice(0, long + 1)) if (b.get(s)) path.push(b.get(s)!);
    raw.reversal.set(s, -Math.log(p / bars[look].get(s)!));
    let far = bars[look].get(s)!;
    for (let i = Math.min(long, bars.length - 1); i >= 0; i--) if (bars[i].get(s)) { far = bars[i].get(s)!; break; }
    raw.trend.set(s, Math.log(p / far));
    const rets: number[] = [];
    for (let i = 0; i + 1 < path.length; i++) if (path[i] > 0 && path[i + 1] > 0) rets.push(Math.log(path[i] / path[i + 1]));
    const mean = rets.length ? sum(rets) / rets.length : 0;
    raw.calm.set(s, rets.length ? -Math.sqrt(sum(rets.map((r) => (r - mean) ** 2)) / rets.length) : 0);
    raw.drawdown.set(s, -Math.log(p / Math.max(...path, p)));
    raw.forecast.set(s, 0 / Math.max(1, 1e-4));
    const typical = -raw.calm.get(s)! || 1e-6;
    const fell = raw.reversal.get(s)!;
    const recent = bars.length > settle && bars[settle].get(s) ? Math.abs(Math.log(p / bars[settle].get(s)!)) : 0;
    raw.settled.set(s, Math.max(0, fell) / (1 + recent / Math.max(typical, 1e-6) / settle));
    raw.fit.set(s, trendFit(path));
  }
  const used = SIGNALS.filter((k) => truthy(w[k]));
  const r = Object.fromEntries(used.map((k) => [k, ranked(raw[k])]));
  const out = new Map<string, number>();
  for (const s of universe) out.set(s, sum(used.map((k) => Number(w[k]) * r[k].get(s)!)));
  return out;
}

/** rules.shunned: the reversal buys to sit out (falling knives, volatility bursts). */
function shunned(universe: string[], prices: Prices, bars: Prices[], spec: Record<string, any>): Set<string> {
  const knife = num(spec.knife_pct, 0) || 0, pause = num(spec.vol_pause, 0) || 0;
  const out = new Set<string>();
  if (!(knife || pause)) return out;
  const long = Math.min(pyInt(num(spec.trend_bars, 16)), bars.length - 1);
  const settle = Math.max(1, pyInt(num(spec.settle_bars, 2)));
  for (const s of universe) {
    const path: number[] = [];
    for (const b of bars.slice(0, long + 1)) if (b.get(s)) path.push(b.get(s)!);
    if (path.length < settle + 2) continue;
    const p = prices.get(s)!;
    if (knife && p / path[path.length - 1] - 1 < -knife / 100 && p / path[settle] - 1 < -knife / 100 * settle / long) out.add(s);
    if (pause) {
      const moves: number[] = [];
      for (let i = 0; i + 1 < path.length; i++) if (path[i] > 0 && path[i + 1] > 0) moves.push(Math.abs(Math.log(path[i] / path[i + 1])));
      const recent = moves.slice(0, settle), usual = moves.slice(settle);
      if (recent.length && usual.length && sum(recent) / recent.length > pause * Math.max(sum(usual) / usual.length, 1e-6)) out.add(s);
    }
  }
  return out;
}

interface Ctx {
  cat: Map<string, string>;
  liq: Map<string, number>;
  real: Map<string, number>;
  /** the model's scores this bar: symbol -> [mu, rt50] */
  scores: Map<string, [number, number]> | null;
  execute: Exec;
  /** the executor would take a buy (live: in the table with a pool over the floor; else always) */
  tradeable: (s: string) => boolean;
  /** spec["_locked"]: no new money (live: pools younger than min_pool_age_hours) */
  locked: Set<string>;
}
type Strategy = (book: Book, spec: Record<string, any>, bars: Prices[], prices: Prices, barNo: number, state: Record<string, any>, ctx: Ctx) => Made[];

const reversal: Strategy = (book, spec, bars, prices, barNo, state, ctx) => {
  const last = state.last_rebalance ?? -(10 ** 9);
  if (barNo - last < Number(spec.hold_bars) || bars.length <= Number(spec.lookback_bars)) return [];
  state.last_rebalance = barNo;
  const then = bars[Number(spec.lookback_bars)];
  const floor = num(spec.min_pool_usd, 0) || 0;
  const skip = new Set<string>(spec.exclude ?? []);
  const cats = new Set<string>(spec.categories);
  let universe = [...prices.keys()].filter((s) => cats.has(ctx.cat.get(s) ?? "") && then.get(s) && ctx.tradeable(s) && !skip.has(s)
    && (!floor || ctx.cat.get(s) === "major" || (ctx.liq.get(s) ?? 0) >= floor));
  const held = new Set([...book.holdings].filter(([, h]) => h.qty > 0).map(([s]) => s));
  const noBuy = new Set([...ctx.locked, ...shunned(universe, prices, bars, spec)]);
  universe = universe.filter((s) => !noBuy.has(s) || held.has(s));
  if (universe.length < 2) return [];
  let k = Math.max(1, pyInt(pyRound(Number(spec.frac) * universe.length)));
  if (truthy(spec.max_positions)) k = Math.min(k, pyInt(spec.max_positions));
  let losers: string[];
  if (truthy(spec.signals)) {
    const score = comboScores(universe, prices, bars, spec);
    losers = [...universe].sort((a, b) => -score.get(a)! - -score.get(b)!).slice(0, k);
  } else {
    const key = (s: string) => Math.log(prices.get(s)! / then.get(s)!);
    losers = [...universe].sort((a, b) => key(a) - key(b)).slice(0, k);
  }
  const slot = value(book, prices) / k;
  return rebalance(book, new Map(losers.map((s) => [s, slot])), slot, prices, spec, ctx.execute, noBuy);
};

const core: Strategy = (book, spec, _bars, prices, barNo, state, ctx) => {
  const trim = (num(spec.trim_pct, 0) || 0) / 100;
  if (trim > 0) {
    // once per rise (rules.core, 2026-10-14): a holding is trimmed again only once its price is trim_pct over the last trim's
    const trimmed: Record<string, number> = (state.trimmed ??= {});
    for (const s of Object.keys(trimmed)) if (!book.holdings.get(s)?.qty) delete trimmed[s];
    const cut = new Map<string, number>();
    for (const [s, h] of book.holdings) {
      if (h.qty > 0 && h.cost_eth > 0 && prices.get(s) && h.qty * prices.get(s)! >= h.cost_eth * (1 + trim)
        && prices.get(s)! >= (trimmed[s] || 0) * (1 + trim)) cut.set(s, h.cost_eth);
    }
    if (cut.size) {
      const want = new Map<string, number>();
      for (const [s, h] of book.holdings) if (h.qty > 0 && prices.get(s)) want.set(s, h.qty * prices.get(s)!);
      for (const [s, v] of cut) want.set(s, v);
      const made = rebalance(book, want, 1.0, prices, { ...spec, band: 0, partial: 1, min_trade_usd: 1.0 }, ctx.execute);
      for (const m of made) if (cut.has(m.symbol)) trimmed[m.symbol] = prices.get(m.symbol)!;
      if (made.length) return made;                     // (nothing sold: on to the rebalance)
    }
  }
  if (book.holdings.size && barNo - (state.last_rebalance ?? -(10 ** 9)) < Number(spec.hold_bars)) return [];
  const cats = new Set<string>(spec.categories ?? []), floor = num(spec.min_pool_usd, 0) || 0;
  const universe = [...prices.keys()].filter((s) => prices.get(s) && ctx.liq.get(s) && ctx.tradeable(s)
    && (!cats.size || cats.has(ctx.cat.get(s) ?? "")) && ctx.liq.get(s)! >= floor && !ctx.locked.has(s));
  if (!universe.length) return [];
  state.last_rebalance = barNo;
  const chosen = [...universe].sort((a, b) => ctx.liq.get(b)! - ctx.liq.get(a)!).slice(0, pyInt(spec.top));
  const slot = value(book, prices) / chosen.length;
  return rebalance(book, new Map(chosen.map((s) => [s, slot])), slot, prices, spec, ctx.execute);
};

const stockgap: Strategy = (book, spec, _bars, prices, barNo, state, ctx) => {
  const floor = num(spec.min_pool_usd, 0) || 0, wrong = num(spec.wrong_pct, 10) / 100;
  const avg: Record<string, number> = (state.avg ??= {}), seen: Record<string, number> = (state.seen ??= {}), since: Record<string, number> = (state.since ??= {});
  const alpha = 2 / (num(spec.avg_bars, 96) + 1);
  const cats = new Set<string>(spec.categories);
  const gap = new Map<string, number>();
  for (const [s, p] of prices) {
    const r = ctx.real.get(s);
    if (!cats.has(ctx.cat.get(s) ?? "") || r === undefined || r <= 0 || p <= 0) continue;
    const g = Math.log(p / r);
    if (Math.abs(g) <= wrong && pyInt(seen[s] ?? 0) >= pyInt(num(spec.min_seen, 8))) gap.set(s, g - avg[s]);
    if (Math.abs(g) <= wrong) {
      avg[s] = s in avg ? avg[s] + alpha * (g - avg[s]) : g;
      seen[s] = pyInt(seen[s] ?? 0) + 1;
    }
  }
  const held = [...book.holdings].filter(([, h]) => h.qty > 0).map(([s]) => s);
  const heldSet = new Set(held);
  const entry = Number(spec.entry_pct) / 100, exit = Number(spec.exit_pct) / 100;
  const keep: string[] = [];
  for (const s of held) {
    const age = barNo - pyInt(since[s] ?? barNo);
    const r = ctx.real.get(s);
    const off = prices.get(s) ? r !== undefined && Math.abs(Math.log(prices.get(s)! / r)) > wrong : false;
    if (age >= pyInt(spec.max_hold_bars) || off || (gap.has(s) && gap.get(s)! >= -exit)) continue;
    keep.push(s);
  }
  const slots = pyInt(spec.max_positions);
  const slot = value(book, prices) / slots;
  const cheap = [...gap.keys()].filter((s) => gap.get(s)! <= -entry && !heldSet.has(s) && (!floor || (ctx.liq.get(s) ?? 0) >= floor))
    .sort((a, b) => gap.get(a)! - gap.get(b)!).slice(0, Math.max(0, slots - keep.length));
  const want = new Map<string, number>();
  for (const s of keep) if (prices.get(s)) want.set(s, book.holdings.get(s)!.qty * prices.get(s)!);
  for (const s of cheap) want.set(s, slot);
  const made = rebalance(book, want, slot, prices, { ...spec, band: 0, partial: 1 }, ctx.execute);
  for (const t of made) {
    if (t.side === "buy") since[t.symbol] ??= barNo;
    else if (!book.holdings.has(t.symbol)) delete since[t.symbol];
  }
  return made;
};

/** modelbook._step on precomputed scores: hold the top max_positions whose predicted move beats this book's round trip. */
const POOL_FEE = 0.003, GAS_USD = 0.05;
const leg = (slot: number, liq: number) => POOL_FEE + slot / Math.max(1000, liq / 2) + GAS_USD / Math.max(slot, 1);
const model: Strategy = (book, spec, _bars, prices, barNo, state, ctx) => {
  if (barNo - (state.last_rebalance ?? -(10 ** 9)) < pyInt(num(spec.hold_bars, 4))) return [];
  const cats = new Set<string>(spec.categories ?? ["meme", "stock"]), floor = num(spec.min_pool_usd, 50_000) || 50_000;
  const sc = new Map<string, [number, number]>();
  for (const s of prices.keys()) {
    const v = ctx.scores?.get(s);
    if (v && cats.has(ctx.cat.get(s) ?? "") && (ctx.liq.get(s) ?? 0) >= floor) sc.set(s, v);
  }
  if (!sc.size) return [];
  state.last_rebalance = barNo;
  const k = Math.max(1, pyInt(num(spec.max_positions, 3)));
  const slot = value(book, prices) / k;
  const held = new Set([...book.holdings].filter(([, h]) => h.qty > 0).map(([s]) => s));
  const margin = num(spec.edge_bps, 0) / 1e4;
  const eff = new Map<string, number>();
  for (const [s, [mu, rt50]] of sc) {
    const c = leg(slot, ctx.liq.get(s) ?? 0);
    const e = mu + rt50 - (held.has(s) ? c : 2 * c) - margin;
    if (e > 0) eff.set(s, e);
  }
  const pick = [...eff.keys()].sort((a, b) => eff.get(b)! - eff.get(a)!).slice(0, k);
  return rebalance(book, new Map(pick.map((s) => [s, slot])), slot, prices,
    { ...spec, band: num(spec.band, 0.5), partial: 1, min_trade_usd: num(spec.min_trade_usd, 3) }, ctx.execute);
};

export const STRATEGIES: Record<string, Strategy> = { reversal, core, stockgap, model };

/** Walk one setting over every bar of the data (research/rule_replay.py run; live: replay_net/livereplay.py run). */
export function runReplay(d: ReplayData, setting: ReplaySetting): ReplayResult {
  if (setting.rule.strategy === "perp") return runPerp(d, setting);
  const strategy = STRATEGIES[setting.rule.strategy];
  if (!strategy) throw new Error(`no strategy ${setting.rule.strategy}`);
  if (setting.rule.strategy === "model" && !d.mu) throw new Error("this data has no model scores");
  const live = setting.live === true;
  if (live && !d.depth) throw new Error("a live replay needs data with pool depth per bar");
  const cat = new Map(d.tokens.map((t) => [t.s, t.category]));
  const liq = new Map(d.tokens.map((t) => [t.s, t.liquidity]));
  const fee = setting.fee;
  const friendly: Exec = (symbol, side, amount, price) => {
    const reserve = Math.max(1000, liq.get(symbol)! / 2);
    return side === "buy"
      ? { usd: amount, gas: 0.05, qty: amount * (1 - fee) / price / (1 + amount / reserve) }
      : { qty: amount, gas: 0.05, usd: amount * price * (1 - fee) / (1 + amount * price / reserve) };
  };
  const hops = new Map(d.tokens.map((t) => [t.s, Math.max(1, Math.trunc(t.hops ?? 1))]));
  const born = new Map(d.tokens.map((t) => [t.s, Number(t.born ?? 0)]));
  const routeFee = (s: string) => { let keep = 1; for (let k = 0; k < hops.get(s)!; k++) keep *= 1 - LIVE.poolFee; return 1 - keep; };
  const ageH = num(setting.rule.min_pool_age_hours, 0) || 0;
  const book: Book = { eth: setting.usd, holdings: new Map(), trades: 0 };
  const state: Record<string, any> = {};
  const prices: Prices = new Map();
  let bars: Prices[] = [];
  let traded = 0, trades = 0;
  const equity: [number, number][] = [];
  const every = Math.max(1, Math.trunc(setting.every || 16));
  const always = () => true, none = new Set<string>();
  for (let n = 0; n < d.n; n++) {
    d.tokens.forEach((t, i) => {
      const p = d.px[i][n];
      if (p === p) prices.set(t.s, p); // NaN: no trade this bar, the last price stands
    });
    bars = [new Map(prices), ...bars].slice(0, 100);
    const real = new Map<string, number>();
    for (const [s, a] of d.real) if (a[n] === a[n]) real.set(s, a[n]);
    let scores: Map<string, [number, number]> | null = null;
    if (d.mu && d.rt50) {
      scores = new Map();
      d.tokens.forEach((t, i) => {
        const m = d.mu![i][n], r = d.rt50![i][n];
        if (m === m && r === r) scores!.set(t.s, [m, r]);
      });
    }
    let ctx: Ctx = { cat, liq, real, scores, execute: friendly, tradeable: always, locked: none };
    let spec: Record<string, any> = { ...setting.rule, _ticks_per_bar: 1 };
    if (live) {
      // the live solo ghost's world this bar (engine.Desk.solo_step + executor.Executor.execute + _paper)
      const t = d.start + n * d.bar;
      const depth = new Map<string, number>();
      d.tokens.forEach((tk, i) => { const v = d.depth![i][n]; if (v === v && !tk.s.includes(":")) depth.set(tk.s, v); });
      const stale = new Set<string>();
      if (bars.length >= LIVE.staleBars) {
        for (const [s, p] of bars[0]) {
          if (cat.get(s) === "stock") continue;
          let same = true;
          for (let k = 1; k < LIVE.staleBars; k++) if (bars[k].get(s) !== p) { same = false; break; }
          if (same) stale.add(s);
        }
      }
      let lo = 0, hi = Infinity;
      for (const [from, a, b] of d.limits ?? [[0, 25, 50]]) if (t >= from) { lo = a; hi = b; }
      const young = new Set<string>();
      if (ageH) for (const s of prices.keys()) if ((born.get(s) ?? 0) > t - ageH * 3600 && cat.get(s) !== "stock" && cat.get(s) !== "major") young.add(s);
      const tradeable = (s: string) => cat.get(s) === "major" || (depth.has(s) && depth.get(s)! >= LIVE.minPoolUsd);
      const fill = (s: string, buy: boolean, amount: number, price: number): Fill => {
        const reserve = Math.max(1000, (depth.get(s) || LIVE.majorDepth) / 2), f = routeFee(s);
        return buy ? { ok: true, usd: amount, gas: LIVE.gasUsd, qty: amount * (1 - f) / price / (1 + amount / reserve) }
          : { ok: true, qty: amount, gas: LIVE.gasUsd, usd: amount * price * (1 - f) / (1 + amount * price / reserve) };
      };
      const no: Fill = { ok: false, usd: 0, qty: 0, gas: 0 };
      const execute: Exec = (s, side, amount, price) => {
        const buy = side === "buy", size = buy ? amount : amount * price;
        if (buy && !tradeable(s)) return no;
        if (buy && stale.has(s)) return no;
        if (size > hi) {
          if (buy) return no;
          const k = Math.trunc(Math.floor(size / hi)) + 1;
          if (k > LIVE.maxSlices) return no;
          const parts = Array.from({ length: k }, () => fill(s, false, amount / k, price));
          return { ok: true, qty: amount, usd: sum(parts.map((f) => f.usd)), gas: sum(parts.map((f) => f.gas)) };
        }
        if (size < (buy ? lo : LIVE.minSellUsd)) return no;
        return fill(s, buy, amount, price);
      };
      // the drain reflex first (engine.Desk.take_profits with only drain_pct): a pool down to half its deepest while
      // held sells the whole holding
      for (const [s, h] of [...book.holdings]) {
        const price = prices.get(s);
        if (!price || h.qty <= 0 || h.cost_eth <= 0) continue;
        const pool = depth.get(s);
        if (pool === undefined || cat.get(s) === "stock") continue;
        const peak = (h.pool_peak = Math.max(h.pool_peak ?? 0, pool));
        if (!(peak > 0 && pool <= peak * (1 - LIVE.drainPct / 100))) continue;
        const f = execute(s, "sell", h.qty, price);
        if (f.ok === false) continue;
        h.cost_eth *= 1 - f.qty / h.qty;
        h.qty -= f.qty;
        if (h.qty <= 1e-12) book.holdings.delete(s);
        book.eth += f.usd - f.gas;
        book.trades += 1;
        traded += f.usd;
        trades += 1;
      }
      ctx = { cat, liq: depth, real, scores, execute, tradeable, locked: young };
      spec = { ...spec, _max_trade_usd: hi, _min_buy_usd: lo };
    }
    for (const m of strategy(book, spec, bars, prices, n, state, ctx)) {
      traded += m.usd;
      trades += 1;
    }
    if (n % every === 0 || n === d.n - 1) equity.push([n, Math.round(value(book, prices) * 1e6) / 1e6]);
  }
  return { name: setting.name, trades, turnover: Math.round(traded / setting.usd * 1e6) / 1e6, equity };
}

/** The live desk's constants a live replay trades by (replay_net/livereplay.py, executor.py, engine.py, config.py). */
const LIVE = { poolFee: 0.003, gasUsd: 0.05, minSellUsd: 1.0, minPoolUsd: 10_000, staleBars: 8, majorDepth: 5_000_000, maxSlices: 50, drainPct: 50 };

// ---- perps (2026-11-03, flytrade/PERPS-PLAN.md) ----------------------------------------------------------------

/** A perp rule's defaults: every key a setting may leave out (src/orders.ts asks for none). Hours = bars on hourly data. */
export const PERP_DEFAULTS: Record<string, any> = {
  categories: ["major", "stock"],
  lev: 1,               // notional per position = equity x lev / max_positions
  fast_h: 480,          // direction: the sign of the move over this many bars (time-series momentum)
  slow_h: 1200,         // and the price on the same side of its average over this many bars (0 = no average)
  sides: "both",        // "both" | "long" | "short"
  every_h: 24,          // decide every this many bars
  max_positions: 4,     // strongest moves first (move / its volatility)
  min_hold_h: 24,       // a position isn't closed by the rule before this (stops still fire)
  stop_pct: 6,          // close when the price moved this much against a crypto position
  stock_stop_pct: 4,    // ... a stock position
  vol_h: 720,           // volatility window for the ranking and vol_target
  vol_target: 0,        // annual %, 0 = equal sizes; else a position is scaled down to this volatility (never up)
  slip_bps: 5,          // each open and each close, on top of the setting's fee
  resize_band: 0.5,     // a held position more than this share off its size now is closed and opened again at it
  mm: 0.05,             // maintenance share of the margin: a loss past margin x (1 - mm) is a liquidation (margin lost)
  mood: false,          // risk-off: no new longs; risk-on: no new shorts (desk/mood.py's rule on these markets)
  off_up_share: 0.35, off_median_pct: -1.5, on_up_share: 0.45, on_median_pct: 0, enter_bars: 2, exit_bars: 4,
  crowd_apr: 0,         // > 0: no new position whose side pays more than this % a year in funding (last 24 bars)
  fng_hi: 0,            // > 0: no new crypto long at Fear & Greed >= this
  fng_lo: 0,            // > 0: no new crypto short at Fear & Greed <= this
  vix_hi: 0,            // > 0: no new stock long at VIX >= this
  earn_skip_h: 0,       // > 0: no new stock position this many bars before its earnings
  pead_pct: 0,          // > 0: a stock that moved this % over its report (within a day after it) is entered that way ...
  pead_hold_h: 240,     // ... and held this long whatever the trend says
};

interface PerpPos { q: number; entry: number; margin: number; since: number; until: number }

/** A perp book over the data: longs and shorts with margin, hourly funding, stops and liquidation. The result adds
 * `perp`: trips by side, how many won, funding paid (negative = received), stops and liquidations. */
function runPerp(d: ReplayData, setting: ReplaySetting): ReplayResult {
  if (!d.perp) throw new Error("this data has no perp arrays");
  const r = { ...PERP_DEFAULTS, ...setting.rule };
  const n = d.n, toks = d.tokens;
  const cats = new Set<string>(r.categories);
  const use = toks.map((t) => cats.has(t.category));
  const fund = d.perp.arrays.get("funding")!, eNext = d.perp.arrays.get("earn_next"), eLast = d.perp.arrays.get("earn_last");
  const fng = d.perp.series.get("fng"), vix = d.perp.series.get("vix");
  // the last price up to each bar, and its running sums for the averages
  const ff = d.px.map((a) => {
    const o = new Float64Array(n);
    let last = NaN;
    for (let t = 0; t < n; t++) { if (a[t] === a[t] && a[t] > 0) last = a[t]; o[t] = last; }
    return o;
  });
  const lr = ff.map((a) => {                              // hourly log moves (0 where no price yet)
    const o = new Float64Array(n);
    for (let t = 1; t < n; t++) o[t] = a[t] === a[t] && a[t - 1] === a[t - 1] ? Math.log(a[t] / a[t - 1]) : 0;
    return o;
  });
  const cum = (xs: Float64Array, sq: boolean) => {
    const o = new Float64Array(n + 1);
    for (let t = 0; t < n; t++) { const x = xs[t] === xs[t] ? xs[t] : 0; o[t + 1] = o[t] + (sq ? x * x : x); }
    return o;
  };
  const pxSum = ff.map((a) => cum(a, false)), lrSum = lr.map((a) => cum(a, false)), lrSq = lr.map((a) => cum(a, true));
  const first = ff.map((a) => { for (let t = 0; t < n; t++) if (a[t] === a[t]) return t; return n; });
  const fast = pyInt(r.fast_h), slow = pyInt(r.slow_h), every = Math.max(1, pyInt(r.every_h)), volH = Math.max(24, pyInt(r.vol_h));
  const warm = Math.max(fast, slow, volH) + 1;
  const k = Math.max(1, pyInt(r.max_positions)), lev = Math.min(Math.max(Number(r.lev), 0.1), 5);
  const cost = setting.fee + Number(r.slip_bps) / 1e4, mm = Number(r.mm);
  const volOf = (i: number, t: number) => {              // annualised, from the last volH hourly moves
    const a = t - volH + 1, m = (lrSum[i][t + 1] - lrSum[i][a]) / volH;
    return Math.sqrt(Math.max((lrSq[i][t + 1] - lrSq[i][a]) / volH - m * m, 0) * 8760);
  };
  let cash = setting.usd;
  const pos = new Map<number, PerpPos>();
  const stats = { long_trips: 0, short_trips: 0, wins: 0, funding: 0, stops: 0, liqs: 0 };
  let traded = 0, trades = 0;
  const equity: [number, number][] = [];
  const recordEvery = Math.max(1, Math.trunc(setting.every || 24));
  let regime = "risk_on", streak = 0, tNow = 0;
  const stopped = new Map<number, { t: number; dir: number }>();   // no way back in the same way for min_hold_h
  const upnl = (p: PerpPos, px: number) => p.q * (px - p.entry);
  const close = (i: number, px: number, why: "rule" | "stop" | "liq" | "resize") => {
    const p = pos.get(i)!;
    const notional = Math.abs(p.q) * px;
    let pnl = upnl(p, px);
    if (why === "liq") pnl = -p.margin;                    // the margin is gone, nothing else
    else cash -= notional * cost;
    cash += pnl;
    traded += why === "liq" ? 0 : notional;
    trades += 1;
    if (why !== "resize") {
      if (p.q > 0) stats.long_trips++; else stats.short_trips++;
      if (pnl - (why === "liq" ? 0 : notional * cost) > 0) stats.wins++;
    }
    if (why === "stop") stats.stops++;
    if (why === "liq") stats.liqs++;
    if (why === "stop" || why === "liq") stopped.set(i, { t: tNow, dir: Math.sign(p.q) });
    pos.delete(i);
  };
  const value = (t: number) => { let v = cash; for (const [i, p] of pos) v += upnl(p, ff[i][t]); return v; };
  for (let t = 0; t < n; t++) {
    tNow = t;
    // 1. funding for the hour, then stops and liquidations at this bar's close
    for (const [i, p] of pos) {
      const f = fund[i][t];
      if (f === f) { const paid = p.q * ff[i][t] * f; cash -= paid; stats.funding += paid; }
    }
    for (const [i, p] of [...pos]) {
      const px = ff[i][t], against = (p.q > 0 ? 1 : -1) * (px / p.entry - 1);
      const stop = Number(toks[i].category === "stock" ? r.stock_stop_pct : r.stop_pct) / 100;
      if (upnl(p, px) <= -p.margin * (1 - mm)) close(i, px, "liq");
      else if (stop > 0 && against <= -stop) close(i, px, "stop");
    }
    // 2. the mood of these markets (breadth and median over 24 bars), with desk/mood.py's hysteresis
    if (t >= 24) {
      const moves: number[] = [];
      for (let i = 0; i < toks.length; i++) if (use[i] && first[i] <= t - 24) moves.push(ff[i][t] / ff[i][t - 24] - 1);
      if (moves.length) {
        moves.sort((a, b) => a - b);
        const h = moves.length >> 1, med = moves.length % 2 ? moves[h] : (moves[h - 1] + moves[h]) / 2;
        let up = 0;
        for (const m of moves) if (m > 0) up++;
        const share = up / moves.length;
        const weak = share < Number(r.off_up_share) && med * 100 < Number(r.off_median_pct);
        const strong = share >= Number(r.on_up_share) || med * 100 >= Number(r.on_median_pct);
        const flip = (regime === "risk_on" && weak) || (regime === "risk_off" && strong);
        streak = flip ? streak + 1 : 0;
        if (flip && streak >= pyInt(regime === "risk_on" ? r.enter_bars : r.exit_bars)) { regime = regime === "risk_on" ? "risk_off" : "risk_on"; streak = 0; }
      }
    }
    // 3. the rule, every every_h bars
    if (value(t) <= 0) { pos.clear(); cash = 0; }               // wiped out: the book stays at zero
    if (t >= warm && t % every === 0 && cash > 0) {
      const want = new Map<number, { dir: number; strength: number; pead: boolean }>();
      for (let i = 0; i < toks.length; i++) {
        if (!use[i] || first[i] > t - warm) continue;
        const px = ff[i][t], stock = toks[i].category === "stock";
        let dir = 0, strength = 0, pead = false;
        const vol = Math.max(volOf(i, t), 1e-6);
        const last = eLast?.[i][t];
        if (stock && Number(r.pead_pct) > 0 && last === last && last! > 0 && last! <= 24) {
          const before = ff[i][Math.max(0, t - Math.ceil(last!) - 1)], move = px / before - 1;
          if (Math.abs(move) * 100 >= Number(r.pead_pct)) { dir = move > 0 ? 1 : -1; strength = 1e9 + Math.abs(move); pead = true; }
        }
        if (!pead) {
          const m = Math.log(px / ff[i][t - fast]);
          const avg = slow > 0 ? (pxSum[i][t + 1] - pxSum[i][t + 1 - slow]) / slow : px;
          if (m > 0 && px >= avg) dir = 1;
          else if (m < 0 && px <= avg) dir = -1;
          strength = Math.abs(m) / vol;
        }
        if ((r.sides === "long" && dir < 0) || (r.sides === "short" && dir > 0)) dir = 0;
        if (dir !== 0) want.set(i, { dir, strength, pead });
      }
      // filters stop NEW positions only: what's already held in that direction stays
      const blocked = (i: number, dir: number) => {
        if (pos.has(i) && Math.sign(pos.get(i)!.q) === dir) return false;
        const stock = toks[i].category === "stock";
        if (r.mood && ((dir > 0 && regime === "risk_off") || (dir < 0 && regime === "risk_on"))) return true;
        if (Number(r.crowd_apr) > 0) {
          let f = 0, c = 0;
          for (let s = Math.max(0, t - 23); s <= t; s++) if (fund[i][s] === fund[i][s]) { f += fund[i][s]; c++; }
          if (c && dir * (f / c) * 8760 * 100 > Number(r.crowd_apr)) return true;
        }
        const g = fng?.[t];
        if (!stock && g === g && g !== undefined) {
          if (Number(r.fng_hi) > 0 && dir > 0 && g >= Number(r.fng_hi)) return true;
          if (Number(r.fng_lo) > 0 && dir < 0 && g <= Number(r.fng_lo)) return true;
        }
        const v = vix?.[t];
        if (stock && Number(r.vix_hi) > 0 && dir > 0 && v === v && v !== undefined && v >= Number(r.vix_hi)) return true;
        const nx = eNext?.[i][t];
        if (stock && Number(r.earn_skip_h) > 0 && nx === nx && nx !== undefined && nx >= 0 && nx <= Number(r.earn_skip_h) && !want.get(i)?.pead) return true;
        return false;
      };
      const ranked = [...want].filter(([i, w]) => !blocked(i, w.dir)).sort((a, b) => b[1].strength - a[1].strength || a[0] - b[0]);
      const pick = new Map(ranked.slice(0, k));
      // closes first: wrong side, or no longer wanted, once held min_hold_h and past a pead hold
      const sizeOf = (i: number) => value(t) * lev / k
        * (Number(r.vol_target) > 0 ? Math.min(1, Number(r.vol_target) / 100 / Math.max(volOf(i, t), 1e-6)) : 1);
      for (const [i, p] of [...pos]) {
        const w = pick.get(i);
        if (w && Math.sign(p.q) === w.dir) {
          const now = Math.abs(p.q) * ff[i][t], want = sizeOf(i);
          if (Number(r.resize_band) > 0 && Math.abs(now - want) > Number(r.resize_band) * want) close(i, ff[i][t], "resize");
          continue;
        }
        if (t - p.since < pyInt(r.min_hold_h) || t < p.until) continue;   // a flip too waits out the hold
        close(i, ff[i][t], "rule");                               // a flip reopens the other way just below
      }
      for (const [i, w] of pick) {
        if (pos.has(i) || pos.size >= k) continue;
        const st = stopped.get(i);
        if (st && st.dir === w.dir && t - st.t < pyInt(r.min_hold_h)) continue;
        const px = ff[i][t], notional = sizeOf(i);
        if (notional < 10) continue;                             // Lighter's smallest order
        cash -= notional * cost;
        traded += notional;
        trades += 1;
        pos.set(i, { q: w.dir * notional / px, entry: px, margin: notional / lev, since: t, until: w.pead ? t + pyInt(r.pead_hold_h) : 0 });
      }
    }
    if (t % recordEvery === 0 || t === n - 1) equity.push([t, Math.round(value(t) * 1e6) / 1e6]);
  }
  const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return { name: setting.name, trades, turnover: round6(traded / setting.usd), equity,
    perp: { ...stats, funding: round6(stats.funding), open: pos.size } };
}

/** mulberry32: a seeded generator every miner runs to the same numbers (the same as orders.ts's). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a = (a + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ReplayBoot { seed: number; block: number }

/**
 * A reshuffled copy of the data, for luck checks (2026-10-17, the user: "do them to actually start helping us"): the bars
 * after the first are rebuilt from blocks of `block` bars in a row, drawn with replacement (a block bootstrap). Every
 * token takes the same blocks, so the market still moves together; inside a block each bar keeps its real move, its
 * real "no trade" gaps and its model score. A token's path is its first price times the drawn bars' moves. Seed 0 is
 * the data itself. A rule that made money only on the one real path loses it on most reshuffled ones.
 */
export function resample(d: ReplayData, boot: ReplayBoot): ReplayData {
  const n = d.n, block = Math.max(1, Math.trunc(boot.block));
  if (!boot.seed || block >= n - 1) return d;
  const rng = mulberry32((boot.seed * 2654435761) >>> 0);
  const src = new Int32Array(n);                       // the real bar each new bar takes its move from
  for (let t = 1; t < n;) {
    const s = 1 + Math.floor(rng() * (n - block));       // 1 .. n - block: the block's bars and the one before exist
    for (let k = 0; k < block && t < n; k++, t++) src[t] = s + k;
  }
  const path = (a: Float64Array): Float64Array => {
    const ff = new Float64Array(n);                    // the last traded price up to each bar (NaN before the first)
    let last = NaN;
    for (let t = 0; t < n; t++) { if (a[t] === a[t]) last = a[t]; ff[t] = last; }
    let level = NaN;
    for (let t = 0; t < n; t++) if (a[t] === a[t]) { level = a[t]; break; }
    const out = new Float64Array(n).fill(NaN);
    if (a[0] === a[0]) out[0] = a[0];
    for (let t = 1; t < n; t++) {
      const s = src[t], r = ff[s] / ff[s - 1];
      if (r === r) level *= r;                         // no price at the source yet: the token doesn't move
      if (a[s] === a[s]) out[t] = level;               // traded at the source bar: traded here
    }
    return out;
  };
  const pick = (a: Float32Array): Float32Array => {
    const out = new Float32Array(n);
    out[0] = a[0];
    for (let t = 1; t < n; t++) out[t] = a[src[t]];
    return out;
  };
  const pick64 = (a: Float64Array): Float64Array => {     // pool depth goes with its bar, as the model score does
    const out = new Float64Array(n);
    out[0] = a[0];
    for (let t = 1; t < n; t++) out[t] = a[src[t]];
    return out;
  };
  const real = new Map<string, Float64Array>();
  for (const [s, a] of d.real) real.set(s, path(a));
  // perp data goes with its bar too: the funding paid, the earnings clock and the index readings of that hour
  const perp = d.perp ? { arrays: new Map([...d.perp.arrays].map(([k, v]) => [k, v.map(pick64)])),
    series: new Map([...d.perp.series].map(([k, v]) => [k, pick64(v)])) } : null;
  return { ...d, px: d.px.map(path), real, mu: d.mu ? d.mu.map(pick) : null, rt50: d.rt50 ? d.rt50.map(pick) : null,
    depth: d.depth ? d.depth.map(pick64) : null, perp };
}

/** Equal-weight hold of the rule's categories over its pool floor, no costs, first bar to last: the bar to beat on the
 * same path. Tokens with no first-bar price are out, and the top and bottom HOLD_TRIM of the tokens' moves are left out
 * of the mean (2026-10-17: on the desk's prices a few memes stuck on broken prices made the plain mean +150%). */
export function holdReturn(d: ReplayData, rule: Record<string, any>): number | null {
  const cats: string[] = Array.isArray(rule.categories) && rule.categories.length ? rule.categories : ["meme", "stock", "major"];
  const floor = num(rule.min_pool_usd, 0);
  const rs: number[] = [];
  d.tokens.forEach((t, i) => {
    if (!cats.includes(t.category) || t.liquidity < floor) return;
    const a = d.px[i];
    if (!(a[0] === a[0])) return;
    let b = NaN;
    for (let k = d.n - 1; k >= 0; k--) if (a[k] === a[k]) { b = a[k]; break; }
    rs.push(b / a[0]);
  });
  if (!rs.length) return null;
  rs.sort((x, y) => x - y);
  const cut = Math.floor(rs.length * HOLD_TRIM), kept = rs.slice(cut, rs.length - cut);
  const xs = kept.length ? kept : rs;
  return Math.round(100 * (sum(xs) / xs.length - 1) * 1e6) / 1e6;
}
const HOLD_TRIM = 0.1;

/** A replay job: decode (cached by blob hash), run, answer JSON bytes. With `boot` (kind "replayb"): on a reshuffled copy
 * of the data, answering the hold of the same path too. */
const dataCache = new Map<string, Promise<ReplayData>>();
export async function runReplayJob(params: { data: string; data_url: string; setting: ReplaySetting; boot?: ReplayBoot },
  fetchBytes: (url: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  let d = dataCache.get(params.data);
  if (!d) {
    d = fetchBytes(params.data_url).then(decodeReplayData);
    dataCache.set(params.data, d);
    d.catch(() => dataCache.delete(params.data));
    for (const k of dataCache.keys()) if (k !== params.data) dataCache.delete(k); // one data set at a time: they are big
  }
  if (!params.boot) return new TextEncoder().encode(JSON.stringify(runReplay(await d, params.setting)));
  const path = resample(await d, params.boot);
  const r = runReplay(path, params.setting);
  return new TextEncoder().encode(JSON.stringify({ ...r, seed: params.boot.seed, hold: holdReturn(path, params.setting.rule) }));
}
