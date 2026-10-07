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

export interface ReplayToken { s: string; category: string; liquidity: number }
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
}

export interface ReplayResult { name: string; trades: number; turnover: number; equity: [number, number][] }

const MAGIC = "FLYRPLY1";

/** Decode a replay data blob: gzip of MAGIC, u32 header length, header JSON, padding to 8, then the arrays. */
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
  if (off > raw.byteLength) throw new Error("replay data is cut short");
  return { start: header.start, bar: header.bar, n, tokens, px, real, mu, rt50 };
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
interface Holding { qty: number; cost_eth: number }
interface Book { eth: number; holdings: Map<string, Holding>; trades: number }
interface Fill { usd: number; qty: number; gas: number }
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
  let universe = [...prices.keys()].filter((s) => cats.has(ctx.cat.get(s) ?? "") && then.get(s) && !skip.has(s)
    && (!floor || ctx.cat.get(s) === "major" || (ctx.liq.get(s) ?? 0) >= floor));
  const held = new Set([...book.holdings].filter(([, h]) => h.qty > 0).map(([s]) => s));
  const noBuy = shunned(universe, prices, bars, spec);
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
    const cut = new Map<string, number>();
    for (const [s, h] of book.holdings) {
      if (h.qty > 0 && h.cost_eth > 0 && prices.get(s) && h.qty * prices.get(s)! >= h.cost_eth * (1 + trim)) cut.set(s, h.cost_eth);
    }
    if (cut.size) {
      const want = new Map<string, number>();
      for (const [s, h] of book.holdings) if (h.qty > 0 && prices.get(s)) want.set(s, h.qty * prices.get(s)!);
      for (const [s, v] of cut) want.set(s, v);
      return rebalance(book, want, 1.0, prices, { ...spec, band: 0, partial: 1, min_trade_usd: 1.0 }, ctx.execute);
    }
  }
  if (book.holdings.size && barNo - (state.last_rebalance ?? -(10 ** 9)) < Number(spec.hold_bars)) return [];
  const cats = new Set<string>(spec.categories ?? []), floor = num(spec.min_pool_usd, 0) || 0;
  const universe = [...prices.keys()].filter((s) => prices.get(s) && ctx.liq.get(s) && (!cats.size || cats.has(ctx.cat.get(s) ?? ""))
    && ctx.liq.get(s)! >= floor);
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

/** Walk one setting over every bar of the data (research/rule_replay.py run). */
export function runReplay(d: ReplayData, setting: ReplaySetting): ReplayResult {
  const strategy = STRATEGIES[setting.rule.strategy];
  if (!strategy) throw new Error(`no strategy ${setting.rule.strategy}`);
  if (setting.rule.strategy === "model" && !d.mu) throw new Error("this data has no model scores");
  const cat = new Map(d.tokens.map((t) => [t.s, t.category]));
  const liq = new Map(d.tokens.map((t) => [t.s, t.liquidity]));
  const fee = setting.fee;
  const execute: Exec = (symbol, side, amount, price) => {
    const reserve = Math.max(1000, liq.get(symbol)! / 2);
    return side === "buy"
      ? { usd: amount, gas: 0.05, qty: amount * (1 - fee) / price / (1 + amount / reserve) }
      : { qty: amount, gas: 0.05, usd: amount * price * (1 - fee) / (1 + amount * price / reserve) };
  };
  const spec = { ...setting.rule, _ticks_per_bar: 1 };
  const book: Book = { eth: setting.usd, holdings: new Map(), trades: 0 };
  const state: Record<string, any> = {};
  const prices: Prices = new Map();
  let bars: Prices[] = [];
  let traded = 0, trades = 0;
  const equity: [number, number][] = [];
  const every = Math.max(1, Math.trunc(setting.every || 16));
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
    for (const m of strategy(book, spec, bars, prices, n, state, { cat, liq, real, scores, execute })) {
      traded += m.usd;
      trades += 1;
    }
    if (n % every === 0 || n === d.n - 1) equity.push([n, Math.round(value(book, prices) * 1e6) / 1e6]);
  }
  return { name: setting.name, trades, turnover: Math.round(traded / setting.usd * 1e6) / 1e6, equity };
}

/** A replay job: decode (cached by blob hash), run, answer JSON bytes. */
const dataCache = new Map<string, Promise<ReplayData>>();
export async function runReplayJob(params: { data: string; data_url: string; setting: ReplaySetting },
  fetchBytes: (url: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  let d = dataCache.get(params.data);
  if (!d) {
    d = fetchBytes(params.data_url).then(decodeReplayData);
    dataCache.set(params.data, d);
    d.catch(() => dataCache.delete(params.data));
    for (const k of dataCache.keys()) if (k !== params.data) dataCache.delete(k); // one data set at a time: they are big
  }
  return new TextEncoder().encode(JSON.stringify(runReplay(await d, params.setting)));
}
