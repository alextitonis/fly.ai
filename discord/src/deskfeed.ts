// Every token verdict goes to the Fly Desk (2026-11-03, the user: "combine and the desk to be checking these tokens"): the desk
// follows each one at +24 h / +72 h / +7 d to learn whether a 🟢 beats a 🔴 (flytrade/desk/verdicts.py, POST /research), and
// answers with what its own screen knows of the token, shown on the card. Recorded only: nothing here buys.
// DESK_RESEARCH_TOKEN (the same secret on flytrade-desk) turns it on; without it nothing is sent.
import type { Facts, Grade } from "./research.ts";

const DESK = process.env.DESK_API ?? "https://flytrade-desk.fly.dev";

/** The desk's screen on a token: its meme gate (creator, early buyers, socials, the sell path) and its contract scan, if it has them. */
export type DeskView = {
  meme: { ok: boolean | null; why: string } | null;
  scan: { verdict: string | null; why: string | null; high: string[] } | null;
};

export const deskFeedOn = () => !!process.env.DESK_RESEARCH_TOKEN;

/** Send a token verdict; the desk's view back, or null (not set up, not a token, the desk didn't answer in `waitMs`). */
export async function toDesk(source: "ask" | "scout", f: Facts, g: Grade, waitMs = 6_000): Promise<DeskView | null> {
  const token = process.env.DESK_RESEARCH_TOKEN, t = f.token;
  if (!token || !t) return null;
  const body = { source, level: g.level, chain: t.chain, ca: t.ca, symbol: t.symbol, price: t.price ? Number(t.price) : null,
    liq: f.verdict?.liq ?? null, bad: g.bad, careful: g.careful };
  const res = await fetch(`${DESK}/research`, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(waitMs),
    headers: { "content-type": "application/json", "x-research-token": token } }).catch(() => null);
  if (!res?.ok) return null;
  const j = await res.json().catch(() => null) as { desk?: DeskView } | null;
  return j?.desk ?? null;
}

/** The card's line for it: only what the desk has actually checked. */
export function deskLine(d: DeskView | null): string | null {
  if (!d) return null;
  const out: string[] = [];
  if (d.meme) out.push(d.meme.ok === false ? `Its meme gate would refuse it: ${d.meme.why.replace(/^meme gate: /, "")}`
    : d.meme.ok ? "Passes its meme gate (creator, early buyers, socials, the sell path)" : "Its meme gate is still checking it");
  if (d.scan?.verdict) out.push(d.scan.verdict === "danger" ? `Fly Scan: DANGER, ${d.scan.why ?? "see the scan"}`
    : d.scan.high.length ? `Fly Scan: ${d.scan.high[0]}` : `Fly Scan: ${d.scan.verdict}`);
  return out.length ? out.map((x) => `• ${x}`).join("\n").slice(0, 1024) : null;
}
