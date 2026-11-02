// Whether the research is any good: every token verdict is logged with its numbers, and !track compares them with today's. One line a
// token per verdict per week, so a token asked about ten times counts once. (2026-11-02: nothing else can say if 🟢 beats 🔴.)
import { append, lines } from "./store.ts";

const LOG = "research-log.jsonl";
const DAY = 86_400_000;
const DEAD_LIQ_USD = 1_000;
const DEX_BATCH = 30, MAX_ROWS = 300;

export type Row = { at: number; symbol: string; chain: string; ca: string; level: string; price: number | null; liq: number | null };
export type Tally = { level: string; n: number; medianChange: number | null; dead: number };

let rows: Row[] | null = null;
const all = async () => rows ??= await lines<Row>(LOG);

/** The last time this token was checked (over an hour ago): "last time" on the card. */
export async function before(ca: string, now = Date.now()): Promise<Row | null> {
  const key = ca.toLowerCase();
  return (await all()).filter((r) => r.ca === key && now - r.at > 3_600_000).at(-1) ?? null;
}

export async function log(r: Omit<Row, "at" | "ca"> & { ca: string }, now = Date.now()): Promise<void> {
  const list = await all(), ca = r.ca.toLowerCase();
  if (list.some((x) => x.ca === ca && x.level === r.level && now - x.at < 7 * DAY)) return;
  const row = { ...r, ca, at: now };
  list.push(row);
  await append(LOG, row);
}

/** The verdicts at least `days` old against now, per verdict. `now_` = chain:ca -> today's price and pool money. */
export function tally(list: Row[], current: Map<string, { price: number | null; liq: number }>, days: number, now = Date.now()): Tally[] {
  const out = new Map<string, { changes: number[]; n: number; dead: number }>();
  for (const r of list) {
    if (now - r.at < days * DAY) continue;
    const c = current.get(`${r.chain}:${r.ca}`), t = out.get(r.level) ?? { changes: [], n: 0, dead: 0 };
    t.n++;
    if (!c || c.liq < DEAD_LIQ_USD) t.dead++;
    if (c?.price != null && r.price) t.changes.push(c.price / r.price - 1);
    out.set(r.level, t);
  }
  return [...out].map(([level, t]) => {
    const s = t.changes.sort((a, b) => a - b);
    return { level, n: t.n, dead: t.dead, medianChange: s.length ? s[Math.floor(s.length / 2)]! : null };
  });
}

/** Today's numbers for everything logged, DexScreener a batch at a time. */
async function currents(list: Row[]): Promise<Map<string, { price: number | null; liq: number }>> {
  const out = new Map<string, { price: number | null; liq: number }>();
  const byChain = new Map<string, string[]>();
  for (const r of list) byChain.set(r.chain, [...new Set([...(byChain.get(r.chain) ?? []), r.ca])]);
  for (const [chain, cas] of byChain) {
    for (let i = 0; i < cas.length; i += DEX_BATCH) {
      const pairs: any[] = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${cas.slice(i, i + DEX_BATCH).join(",")}`, { signal: AbortSignal.timeout(20_000) })
        .then((r) => (r.ok ? r.json() : [])).catch(() => []) as any[];
      const deepest = new Map<string, number>();
      for (const p of pairs) {
        const ca = String(p.baseToken?.address ?? "").toLowerCase(), key = `${chain}:${ca}`, liq = p.liquidity?.usd ?? 0;
        const had = out.get(key);
        out.set(key, { liq: (had?.liq ?? 0) + liq, price: liq >= (deepest.get(ca) ?? -1) ? Number(p.priceUsd ?? 0) || null : had?.price ?? null });
        deepest.set(ca, Math.max(liq, deepest.get(ca) ?? -1));
      }
    }
  }
  return out;
}

export async function record(): Promise<{ total: number; week: Tally[]; month: Tally[] }> {
  const list = (await all()).slice(-MAX_ROWS);
  const old = list.filter((r) => Date.now() - r.at >= 7 * DAY);
  const current = old.length ? await currents(old) : new Map();
  return { total: list.length, week: tally(old, current, 7), month: tally(old, current, 30) };
}
