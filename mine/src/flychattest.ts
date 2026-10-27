/**
 * The fly chat (src/flychat.ts) against a real Postgres, a fake fly and a fake model: who may chat, the 30 s gap and
 * daily limits, tool calls turned into cards (and refused ones), the shortcuts that need no model, the daily budget,
 * card answers, and a watched token going out to the Fly Desk chat with the desk's verdict coming back.
 *   npm run test:flychat
 */
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { cardOf, context, createFlyChat, mergeSettings, shortcut, GAP_MS, PER_DAY, type Llm } from "./flychat.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const SETTINGS = { starter: "let_it_fly", trading: true, chains: ["robinhood", "base"], markets: { memes: true, majors: true, stocks: true, polymarket: true },
  filters: { min_liquidity: 25000, max_tax_pct: 3 }, brain: { on: true, share_pct: 100 }, risk: 3, max_positions: 8,
  exits: { stop_pct: null, take_profit_pct: null }, options: [{ id: "core", on: true, share_pct: 30, params: { top: 6 } }],
  cash: { eth_to_usdg: true, keep_flyai: true }, watch: [], earn: { mode: "off", share_pct: 50 } };
const STARTERS = [{ id: "let_it_fly", title: "Let it fly", blurb: "-", settings: SETTINGS },
  { id: "just_earn", title: "Just earn", blurb: "lend", settings: { ...SETTINGS, trading: false, earn: { mode: "only", share_pct: 50 } } }];

// --- pure parts ---
let m = mergeSettings(SETTINGS, { risk: 9, markets: { memes: false }, chains: ["bsc", "solana"], exits: { stop_pct: 8 } });
check("merge: risk clamped, one market off, unknown chain dropped, a stop set", m.risk === 5 && m.markets.memes === false &&
  m.markets.stocks === true && JSON.stringify(m.chains) === '["bsc"]' && m.exits.stop_pct === 8 && m.starter === "custom", JSON.stringify(m));
m = mergeSettings(SETTINGS, { options: [{ id: "core", share_pct: 50 }, { id: "nope" }, { id: "trend", on: true }] });
check("merge: options by id, params kept, unknown ids dropped", m.options.length === 2 && m.options[0].share_pct === 50 &&
  m.options[0].params.top === 6 && m.options[1].id === "trend", JSON.stringify(m.options));
check("merge: a key the document lacks isn't added", mergeSettings(SETTINGS, { filters: { evil: 1 } }).filters.evil === undefined);
check("shortcut: pause", shortcut("Pause!", SETTINGS)?.card.kind === "settings" && (shortcut("pause", SETTINGS)!.card as any).after.trading === false);
check("shortcut: resume only when paused", shortcut("resume", SETTINGS) === null && shortcut("resume", { ...SETTINGS, trading: false }) !== null);
check("shortcut: anything else goes to the model", shortcut("why no trades?", SETTINGS) === null);
let c = cardOf({ name: "change_settings", args: { summary: "Only lending", starter: "just_earn" } }, SETTINGS, STARTERS);
check("card: a starter", typeof c !== "string" && c.kind === "settings" && c.after.trading === false && c.after.earn.mode === "only" &&
  c.after.starter === "just_earn", JSON.stringify(c));
check("card: unknown starter refused", typeof cardOf({ name: "change_settings", args: { starter: "moon" } }, SETTINGS, STARTERS) === "string");
check("card: no change refused", typeof cardOf({ name: "change_settings", args: { changes: { risk: 3 } } }, SETTINGS, STARTERS) === "string");
c = cardOf({ name: "withdraw", args: { percent: 25.4 } }, SETTINGS, STARTERS);
check("card: withdraw 25% on Robinhood", typeof c !== "string" && c.kind === "withdraw" && c.pct === 25 && c.chain === "robinhood");
check("card: withdraw 0% refused", typeof cardOf({ name: "withdraw", args: { percent: 0 } }, SETTINGS, STARTERS) === "string");
check("card: move under $5 / to the same chain refused",
  typeof cardOf({ name: "move_money", args: { usd: 3, to_chain: "base" } }, SETTINGS, STARTERS) === "string" &&
  typeof cardOf({ name: "move_money", args: { usd: 30, to_chain: "robinhood" } }, SETTINGS, STARTERS) === "string");
const TOKEN = `0x${"ab".repeat(20)}`;
c = cardOf({ name: "watch_token", args: { address: TOKEN.toUpperCase().replace("0X", "0x") } }, SETTINGS, STARTERS);
check("card: watch a token (lower-cased)", typeof c !== "string" && c.kind === "watch" && c.token === TOKEN);
check("card: FLYAI / a 6th token refused",
  typeof cardOf({ name: "watch_token", args: { address: "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c" } }, SETTINGS, STARTERS) === "string" &&
  typeof cardOf({ name: "watch_token", args: { address: TOKEN } }, { ...SETTINGS, watch: [1, 2, 3, 4, 5].map(addr) }, STARTERS) === "string");
check("context: numbers and log lines", /profit \$1\.5/.test(context({ fly: 7, settings: SETTINGS, stats: { value: 11.5, principal: 10, profit: 1.5,
  profit_pct: 15, trades: 3, active: true, wallet: [] } }, { rows: [{ at: NOW, type: "trade", status: "refused", side: "buy", symbol: "PEPE", usd: 5, why: "rug screen" }] })));

// --- the server part ---
const PG = await startPg(5552);
try {
  const { pg } = PG;
  for (const f of ["20261026120000_desk_chat.sql", "20261027130000_mine_fly_chat.sql"]) {
    const sql = readFileSync(new URL(`../../flybook/supabase/migrations/${f}`, import.meta.url), "utf8").replace(/do \$\$[\s\S]*?end \$\$;/, "");
    for (const s of sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((x) => x.trim()).filter(Boolean)) await pg.run(s);
  }
  const OWNER = addr(0xa1), HOLDER = addr(0xa2), POOR = addr(0xa3), RICH = addr(0xa4);
  // fly 1: OWNER's, empty; fly 2: HOLDER's money in it; fly 3: POOR's, empty, under 200k
  const views: Record<number, any> = {
    1: { fly: 1, wallet: addr(0x1001), owner: OWNER, ledger: null, settings: SETTINGS, stats: null },
    2: { fly: 2, wallet: addr(0x1002), owner: RICH, ledger: { holder: HOLDER, principal_usd: 40 }, settings: SETTINGS, stats: { value: 41, principal: 40, profit: 1, trades: 2, active: true, wallet: [] } },
    3: { fly: 3, wallet: addr(0x1003), owner: POOR, ledger: null, settings: null, stats: null },
  };
  const held = new Map([[OWNER, 300_000n * E18], [HOLDER, 0n], [POOR, 1_000n * E18], [RICH, 900_000n * E18]]);
  let reply: Awaited<ReturnType<Llm>> = { text: "All good.", tool: null, cost: 0.001 };
  let calls = 0, lastPrompt: any[] = [];
  const llm: Llm = async (msgs) => { calls++; lastPrompt = msgs; return reply; };
  const sent: { status: number; body: any }[] = [];
  const send = (_r: ServerResponse, status: number, body: unknown) => { sent.push({ status, body }); };
  let session = OWNER, body: any = null, now = NOW;
  const chat = createFlyChat({ pg, HttpError, send, readJson: async () => body, sessionWallet: async () => session,
    flyView: async (f) => views[f] ?? null, flyLog: async () => ({ rows: [] }), starters: async () => STARTERS,
    holdings: async (w) => held.get(w) ?? 0n, standing: async () => ({ weight: 0.5, held: 300_000, days: 20 }),
    llm, dailyUsd: 0.003, now: () => now });   // three answers at $0.001 use it up
  const call = async (method: string, path: string, b?: unknown) => {
    body = b ?? null;
    try { await chat.route({ method, headers: {} } as any, {} as ServerResponse, new URL(`http://x${path}`)); }
    catch (e) { sent.push({ status: (e as HttpError).status ?? 500, body: { error: (e as Error).message } }); }
    return sent[sent.length - 1];
  };

  let r = await call("GET", "/api/flychat/1");
  check("the owner of an empty wallet holding 200k can chat", r.status === 200 && r.body.me.can_chat && r.body.me.wait_s === 0, JSON.stringify(r.body));
  session = RICH;
  r = await call("GET", "/api/flychat/2");
  check("the fly's owner isn't the wallet's holder: no", r.status === 403);
  session = HOLDER;
  r = await call("GET", "/api/flychat/2");
  check("the holder with money in it can, without $FLYAI", r.status === 200 && r.body.me.can_chat);
  session = POOR;
  r = await call("POST", "/api/flychat/3", { text: "hi" });
  check("no money and under 200k: refused", r.status === 403);

  session = OWNER;
  r = await call("POST", "/api/flychat/1", { text: "  why   no trades?  ", lang: "tr" });
  check("a message: the owner's row and the fly's answer", r.status === 200 && r.body.messages.length === 2 &&
    r.body.messages[0].text === "why no trades?" && r.body.messages[1].text === "All good." && calls === 1, JSON.stringify(r.body));
  check("the model hears the owner's language and the fly's data", /\(tr\)/.test(lastPrompt[0].content) && /Fly #1/.test(lastPrompt[0].content));
  r = await call("POST", "/api/flychat/1", { text: "and now?" });
  check("one message every 30 s", r.status === 429 && /wait/.test(r.body.error));
  now += GAP_MS;
  reply = { text: "", tool: { name: "withdraw", args: { percent: 50 } }, cost: 0.001 };
  r = await call("POST", "/api/flychat/1", { text: "take half out" });
  const card = r.body.messages[1];
  check("a tool call comes back as a pending card", card.card?.kind === "withdraw" && card.card.pct === 50 && card.status === "pending" && card.text.length > 0, JSON.stringify(card));
  r = await call("POST", `/api/flychat/1/card/${card.id}`, { status: "approved" });
  check("the owner approves it", r.status === 200);
  r = await call("POST", `/api/flychat/1/card/${card.id}`, { status: "declined" });
  check("a card is answered once", r.status === 409);
  session = HOLDER;
  r = await call("POST", `/api/flychat/1/card/${card.id}`, { status: "declined" });
  check("someone else's card: no", r.status === 409);

  session = OWNER;
  now += GAP_MS;
  reply = { text: "Sure.", tool: { name: "watch_token", args: { address: TOKEN } }, cost: 0.001 };
  r = await call("POST", "/api/flychat/1", { text: `watch ${TOKEN}` });
  const w = r.body.messages[1];
  check("a token to watch is a card", w.card?.kind === "watch" && w.card.token === TOKEN);
  r = await call("POST", "/api/flychat/1/watch", { token: TOKEN, card: w.id });
  const desk = await pg.one<any>("select * from public.desk_chat where id = ?", r.body.desk_msg);
  check("it goes out to the Fly Desk chat with the owner's weight", r.status === 200 && desk?.wallet === OWNER && desk.weight === 0.5 &&
    JSON.stringify(desk.tokens) === JSON.stringify([TOKEN]) && /Fly #1/.test(desk.text), JSON.stringify(desk));
  r = await call("POST", "/api/flychat/1/watch", { token: TOKEN, card: w.id });
  check("sent once", r.body.desk_msg === Number(desk.id));
  await pg.run(`insert into public.desk_chat (kind, text, reply_to, tokens, verdict, meta) values ('check', 'ABAB: refused, pool too small', ?, ?::text[], 'fail', '{"symbol":"ABAB"}')`,
    desk.id, `{${TOKEN}}`);
  r = await call("GET", "/api/flychat/1");
  const back = r.body.messages.find((x: any) => x.id === w.id);
  check("the desk's verdict shows under the card", back?.desk?.verdict === "fail" && /pool too small/.test(back.desk.text), JSON.stringify(back));

  now += GAP_MS;
  const before = calls;
  r = await call("POST", "/api/flychat/1", { text: "pause" });
  check("'pause' needs no model", calls === before && r.body.messages[1].card?.after?.trading === false);

  now += GAP_MS;
  r = await call("POST", "/api/flychat/1", { text: "how am I doing?" });
  check("past the daily budget the fly rests (no model call)", calls === before && /resting/.test(r.body.messages[1].text), r.body.messages[1].text);
  r = await call("GET", "/api/flychat/1");
  check("me.resting says so", r.body.me.resting === true);

  for (let i = 0; i < PER_DAY; i++) { now += GAP_MS; await call("POST", "/api/flychat/1", { text: "pause" }); }
  now += GAP_MS;
  r = await call("POST", "/api/flychat/1", { text: "pause" });
  check(`at most ${PER_DAY} a day a fly`, r.status === 429 && /a day/.test(r.body.error), JSON.stringify(r.body));
  check("too long refused", (await call("POST", "/api/flychat/1", { text: "x".repeat(301) })).status === 400);

  now += 15 * 86_400_000;
  await chat.prune();
  check("rows older than 14 days are deleted", ((await pg.one<{ n: number }>("select count(*)::int as n from mine.fly_chat"))?.n ?? -1) === 0);
} finally {
  await PG.stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
