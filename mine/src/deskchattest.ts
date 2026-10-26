/**
 * The Fly Desk chat (src/deskchat.ts) against a real Postgres and a fake chain: the weight, the tokens a message names,
 * the holding time walked back from Blockscout's transfers, who can post, the limits and the history read.
 *   npm run test:deskchat
 */
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { createDeskChat, heldSince, mentions, refused, weightOf, MIN_HOLD, TEAM, type ChatChain, type Transfer } from "./deskchat.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-26T12:00:00Z");
const STAKING = addr(0x57);

// --- pure parts ---
check("weight: 1M held 30 days = 1", weightOf(1_000_000, 30) === 1);
check("weight: 500k for 15 days = 0.25", weightOf(500_000, 15) === 0.25);
check("weight: capped at 1", weightOf(9_000_000, 400) === 1);
check("weight: new wallet = 0", weightOf(2_000_000, 0) === 0);
check("mentions: $symbols upper case, addresses lower case, FLYAI left out",
  JSON.stringify(mentions(`buy $nvda and $Pepe2 and 0x${"Ab".repeat(20)} not $FLYAI`)) === JSON.stringify(["NVDA", "PEPE2", `0x${"ab".repeat(20)}`]));
check("mentions: 3 at most, no repeats", mentions("$AA $BB $AA $CC $DD").length === 3);
check("mentions: $5 is a price, not a token", mentions("sold at $5 for $20").length === 0);
check("no links", refused("claim at https://x.co/abc") !== null && refused("go to t.me/scam") !== null && refused("fly-airdrop.xyz now") !== null);
check("plain text passes", refused("desk looks strong today, $NVDA gap again?") === null);
check("200 characters at most", refused("x".repeat(201)) !== null);

// --- the holding time ---
const W = addr(0xa1);
const pages = (items: Transfer[], per = 2) => {
  const ch: ChatChain = {
    holdings: async () => [0n],
    transfers: async (_w, cursor) => {
      const i = cursor ? Number(cursor) : 0;
      return { items: items.slice(i, i + per), next: i + per < items.length ? String(i + per) : null };
    },
  };
  return ch;
};
{
  // newest first: staked 50k (moves nothing), bought 20k 2 days ago, bought 40k 10 days ago (took it from 5k to 45k), got 5k 40 days ago
  const t: Transfer[] = [
    { from: W, to: STAKING, value: 50_000n * E18, at: NOW - 1 * DAY },
    { from: addr(1), to: W, value: 20_000n * E18, at: NOW - 2 * DAY },
    { from: addr(1), to: W, value: 40_000n * E18, at: NOW - 10 * DAY },
    { from: addr(1), to: W, value: 5_000n * E18, at: NOW - 40 * DAY },
  ];
  const since = await heldSince(pages(t), W, 65_000n * E18, STAKING, NOW);
  check("held since the buy that took it over 10k (10 days), staking ignored", since === NOW - 10 * DAY, String(since && (NOW - since) / DAY));
  // sold down to 3k 5 days ago and bought back: counted from the buy back
  const t2: Transfer[] = [
    { from: addr(1), to: W, value: 30_000n * E18, at: NOW - 1 * DAY },
    { from: W, to: addr(2), value: 97_000n * E18, at: NOW - 5 * DAY },
    { from: addr(1), to: W, value: 100_000n * E18, at: NOW - 60 * DAY },
  ];
  check("a sell under 10k starts it over", (await heldSince(pages(t2), W, 33_000n * E18, STAKING, NOW)) === NOW - DAY);
  check("whole history over 10k: since its first transfer",
    (await heldSince(pages([{ from: addr(1), to: W, value: 50_000n * E18, at: NOW - 90 * DAY }]), W, 80_000n * E18, STAKING, NOW)) === NOW - 90 * DAY);
  check("under 10k now: not holding", (await heldSince(pages(t), W, 9_000n * E18, STAKING, NOW)) === null);
  check("a long history is cut at maxPages: the oldest read",
    (await heldSince(pages(Array.from({ length: 30 }, (_, i) => ({ from: addr(1), to: W, value: E18, at: NOW - i * DAY })), 2), W, 80_000n * E18, STAKING, NOW, 3)) === NOW - 5 * DAY);
}

// --- the server part ---
const PG = await startPg(5551);
try {
  const { pg } = PG;
  // the chat's migration (its Realtime block needs Supabase's publication: left out here)
  const sql = readFileSync(new URL("../../flybook/supabase/migrations/20261026120000_desk_chat.sql", import.meta.url), "utf8")
    .replace(/do \$\$[\s\S]*?end \$\$;/, "");
  for (const s of sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((x) => x.trim()).filter(Boolean)) await pg.run(s);

  const held = new Map<string, bigint>([
    [addr(0xb1), 2_000_000n * E18],     // whale, 60 days
    [addr(0xb2), 9_999n * E18],         // just under
    [addr(0xb3), 200_000n * E18],       // 6 days
    [TEAM[0], 50_000_000n * E18],
    [addr(0xb4), 500_000n * E18],       // blocked
  ]);
  const hist = new Map<string, Transfer[]>([
    [addr(0xb1), [{ from: addr(1), to: addr(0xb1), value: 2_000_000n * E18, at: NOW - 60 * DAY }]],
    [addr(0xb3), [{ from: addr(1), to: addr(0xb3), value: 200_000n * E18, at: NOW - 6 * DAY }]],
  ]);
  let reads = 0;
  const chain: ChatChain = {
    holdings: async (ws) => ws.map((w) => held.get(w) ?? 0n),
    transfers: async (w) => { reads++; return { items: hist.get(w) ?? [], next: null }; },
  };
  await pg.run("insert into mine.bounty_blocked (value, reason, created_at_ms) values (?, 'farm ring', 0)", addr(0xb4));
  const sent: { status: number; body: any }[] = [];
  const send = (_r: ServerResponse, status: number, body: unknown) => { sent.push({ status, body }); };
  let session = addr(0xb1), body: any = null, now = NOW;
  const chat = createDeskChat({ pg, chain, staking: STAKING, HttpError, send, readJson: async () => body,
    sessionWallet: async () => session, now: () => now });
  const call = async (method: string, path: string, b?: unknown) => {
    body = b ?? null;
    try {
      await chat.route({ method, headers: {} } as any, {} as ServerResponse, new URL(`http://x${path}`));
    } catch (e) {
      sent.push({ status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } });
    }
    return sent[sent.length - 1];
  };

  let r = await call("GET", "/api/desk-chat/me");
  check("me: the whale has full weight", r.status === 200 && r.body.weight === 1 && r.body.days === 60 && r.body.can_post, JSON.stringify(r.body));
  r = await call("POST", "/api/desk-chat", { text: "  watching $nvda   and $DOGE  " });
  check("a post goes in with its weight and tokens, waiting for the desk", r.status === 200 && r.body.weight === 1 &&
    r.body.text === "watching $nvda and $DOGE" && JSON.stringify(r.body.tokens) === '["NVDA","DOGE"]' && !r.body.checked, JSON.stringify(r.body));
  r = await call("POST", "/api/desk-chat", { text: "again" });
  check("one message every 10 s", r.status === 429);
  now += 11_000;
  r = await call("POST", "/api/desk-chat", { text: "gm" });
  check("a message naming nothing is checked at once", r.status === 200 && r.body.checked && r.body.tokens.length === 0);
  check("the holding time is cached (one Blockscout read)", reads === 1, String(reads));
  r = await call("POST", "/api/desk-chat", { text: "see https://scam.xyz" });
  check("links are refused", r.status === 400);

  session = addr(0xb2);
  r = await call("POST", "/api/desk-chat", { text: "hi" });
  check("under 10k can't post", r.status === 403 && /10,000/.test(r.body.error), JSON.stringify(r.body));
  session = addr(0xb3);
  r = await call("POST", "/api/desk-chat", { text: "$PEPE pumping" });
  check("200k for 6 days = 0.2 x 0.2 = 0.04", r.status === 200 && r.body.weight === 0.04, String(r.body.weight));
  session = TEAM[0];
  r = await call("POST", "/api/desk-chat", { text: "team here, $NVDA" });
  check("the team posts with weight 0", r.status === 200 && r.body.weight === 0);
  session = addr(0xb4);
  r = await call("POST", "/api/desk-chat", { text: "hello" });
  check("a blocked wallet can't post", r.status === 403);

  // the desk's reply, as flytrade/desk/chat.py writes it
  const first = await pg.one<{ id: string }>("select id from public.desk_chat where wallet = ? order by id limit 1", addr(0xb1));
  await pg.run(`insert into public.desk_chat (kind, text, reply_to, tokens, verdict, meta) values ('check', 'NVDA: a stock token', ?, '{NVDA}', 'info', '{}')`, first!.id);
  r = await call("GET", "/api/desk-chat");
  const list = r.body.messages;
  check("history: newest first, the replies with them", r.status === 200 && list.length === 5 && list[0].id > list[1].id &&
    list.some((m: any) => m.kind === "check" && m.reply_to === Number(first!.id)), JSON.stringify(list.map((m: any) => [m.id, m.kind])));
  r = await call("GET", `/api/desk-chat?before=${list[1].id}`);
  check("older pages with ?before", r.body.messages.every((m: any) => m.kind === "check" || m.id < list[1].id));

  now += 8 * DAY;
  await chat.prune();
  check("rows older than 7 days are deleted", ((await pg.one<{ n: number }>("select count(*)::int as n from public.desk_chat"))?.n ?? -1) === 0);
  check("MIN_HOLD is 10k", MIN_HOLD === 10_000n * E18);
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
