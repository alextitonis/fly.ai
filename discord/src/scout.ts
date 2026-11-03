// The research scout (2026-11-03, the user: "the research system can be used for finding new tokens"): every SCOUT_POLL_MS the
// bot runs !research's facts and rules (src/research.ts: no X reads, no model, nothing paid) on the tokens the Fly Desk is
// seeing - the new pools its watcher found and the ones FOMO's top traders buy - and sends each verdict to the desk
// (src/deskfeed.ts), which follows how 🟢, 🟡 and 🔴 do. Its verdicts go into !track's log too. Posts nothing to Discord:
// whether its 🟢 picks are worth calling is what the desk's report (flytrade/desk/verdictreport.py) is for.
import { alphaChain } from "./alpha.ts";
import { desk } from "./data.ts";
import { deskFeedOn, toDesk } from "./deskfeed.ts";
import { gather, grade } from "./research.ts";
import { load, save } from "./store.ts";
import { log } from "./track.ts";

const SEEN = "scout-seen.json";
const AGAIN_MS = 7 * 86_400_000;           // a token is looked at again after a week
const PER_RUN = 4;                         // gather reads several public APIs per token: a few a run

type Candidate = { key: string; ca: string };

/** The desk's newest tokens, not looked at this week, newest first. */
export function candidates(d: Awaited<ReturnType<typeof desk>> | null, seen: Record<string, number>, now = Date.now()): Candidate[] {
  const out: Candidate[] = [];
  for (const f of [...(d?.alpha?.found ?? [])].sort((x, y) => y.at - x.at)) out.push({ key: `${alphaChain(f.symbol)}:${f.token.toLowerCase()}`, ca: f.token });
  for (const t of d?.alpha?.fomo?.tokens ?? []) if (t.token) out.push({ key: `robinhood:${t.token.toLowerCase()}`, ca: t.token });
  const keys = new Set<string>();
  return out.filter((c) => !keys.has(c.key) && keys.add(c.key) && now - (seen[c.key] ?? 0) >= AGAIN_MS);
}

async function run(): Promise<void> {
  const seen = await load<Record<string, number>>(SEEN, {});
  const now = Date.now();
  for (const k of Object.keys(seen)) if (now - seen[k]! > AGAIN_MS) delete seen[k];
  const todo = candidates(await desk().catch(() => null), seen, now).slice(0, PER_RUN);
  for (const c of todo) {
    seen[c.key] = now;
    try {
      const f = await gather({ kind: "token", value: c.ca });
      if (!f.token) continue;
      const g = grade(f);
      await log({ symbol: f.token.symbol, chain: f.token.chain, ca: f.token.ca, level: g.level, price: f.token.price ? Number(f.token.price) : null, liq: f.verdict?.liq ?? null, source: "scout" });
      await toDesk("scout", f, g);
    } catch (err) {
      console.error("scout failed", c.key, (err as Error).message);
    }
  }
  await save(SEEN, seen);
}

/** On while the desk feed is (DESK_RESEARCH_TOKEN); SCOUT_POLL_MS=0 turns the scout alone off. */
export function startScout(pollMs = Number(process.env.SCOUT_POLL_MS ?? 20 * 60_000)): void {
  if (!deskFeedOn() || !(pollMs > 0)) return;
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    void run().finally(() => { busy = false; });
  };
  setTimeout(tick, 60_000);              // after the alpha feed's first read
  setInterval(tick, pollMs);
  console.log(`research scout on, every ${Math.round(pollMs / 60_000)} min`);
}
