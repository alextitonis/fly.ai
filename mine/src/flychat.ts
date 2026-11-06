/**
 * Fly chat (2026-10-27, flytrade/FLYCHAT-PLAN.md; the user: "add some way of chat ... to be able to adjust stuff, with
 * cheapest llm and tool calls ... but limited to avoid spam", "every 30 seconds", money moves "with human in the loop,
 * it'll show as a verification to approve or not", "users should be able to add new tokens to be watching ... sent to
 * flydesk for check").
 *
 * The owner of a fly's wallet talks to it; one cheap model call a message answers from the fly's settings, numbers and
 * log, and may PROPOSE one thing as a card: a settings change, a withdrawal, a move to another chain, or a token to
 * watch. A card does nothing here: the owner approves it on the page, which then calls the normal endpoints
 * (/api/vaults/<wallet>/settings|withdraw|move) with their own checks, and tells us how it went. A watched token is
 * also posted to the Fly Desk chat (public.desk_chat), whose desk runs its rug checks on it and may put it in the
 * flies' shared view; its verdict shows under the card.
 *
 *   GET  /api/flychat/inbox                  (signed in) -> { flies: [{ fly, last }], ... } every chat this wallet has
 *   GET  /api/flychat/<fly>                  (signed in) -> { messages, me }
 *   POST /api/flychat/<fly> { text, lang }   (signed in) -> { messages: [the owner's, the fly's] }
 *   POST /api/flychat/<fly>/card/<id> { status: approved | declined | failed }
 *   POST /api/flychat/<fly>/watch { token, card? }  -> the desk chat row the token went out in
 *
 * Who: the wallet's holder (or the fly's owner while nobody's money is in it), and only with money in the wallet or
 * 200k $FLYAI held. Limits: 300 characters, one message every 30 s a wallet, and a daily spend cap for the whole chat
 * (FLYCHAT_DAILY_USD) - past it the chat waits for tomorrow; the quick actions on the page need no model.
 *
 * Packs (2026-11-05, flytrade/UTILITY-PLAN.md; the user: "5 messages free, more paid", "as burn"): a wallet has
 * FREE_PER_DAY free messages a rolling day (FREE_PER_DAY_TIER with 500k $FLYAI held), across its flies. Past that it
 * chats from packs: PACK_MESSAGES messages for every PACK_FLYAI $FLYAI it burned (sent to 0x...dEaD) in one transaction,
 * credited once per transaction after the burn is checked on chain (mine.chat_packs, mine.chat_credits).
 *   POST /api/flychat/pack { tx }   (signed in) -> { credited, credits }
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";
import { burnedBy } from "./burns.ts";

export const MAX_LEN = 300;
export const GAP_MS = 30_000;
export const PER_DAY = 5;                        // free messages a rolling day, a wallet (was 20 a fly until 11-05)
export const FREE_PER_DAY = PER_DAY;
export const FREE_PER_DAY_TIER = FREE_PER_DAY;   // no 500k bonus (the user dropped the tier, 11-05)
export const TIER_FLYAI = 500_000;
export const PACK_FLYAI = 50_000;                // burned for a pack
export const PACK_MESSAGES = 100;
const DEAD = "0x000000000000000000000000000000000000dead";
export const HISTORY = 6;
const KEEP_DAYS = 14;
const PAGE = 40;
const E18 = 10n ** 18n;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const FLYAI = "0x0088ce7905025c4b5ea1d49ab6179b6aaadb3b9c";
export const WATCH_MAX = 5;
const CHAINS = ["robinhood", "base", "bsc", "arbitrum"];
const MARKETS = ["memes", "majors", "stocks", "polymarket"];
const EARN_MODES = ["off", "idle", "share", "only"];
// "snipe" (2026-11-05): the sniper the owner can switch on - "launch" is the retired one, kept so an old one can be edited
const OPTION_IDS = ["core", "poly", "trend", "dip", "momentum", "flush", "fresh", "reversal", "house", "launch", "snipe", "copy", "track", "fomo"];

export type Card =
  | { kind: "settings"; summary: string; before: any; after: any }
  | { kind: "withdraw"; pct: number; chain: string }
  | { kind: "move"; usd: number; chain: string; to_chain: string }
  | { kind: "watch"; token: string };

/** One model call: the reply text, at most one tool call, what it cost. */
export type Llm = (messages: { role: string; content: string }[], tools: any[]) =>
  Promise<{ text: string; tool: { name: string; args: any } | null; cost: number }>;

export const TOOLS = [
  { type: "function", function: {
    name: "change_settings",
    description: "Propose a change to the fly's trading settings. The owner sees before/after and approves it. Give only the keys that change; arrays (chains, options) are given whole. starter: start from a ready-made setup instead of the current settings.",
    parameters: { type: "object", properties: {
      summary: { type: "string", description: "one short line saying what changes, in the owner's language" },
      starter: { type: "string", description: "optional ready-made setup id to start from" },
      changes: { type: "object", description: "the keys that change, same shape as the settings" },
    }, required: ["summary"] } } },
  { type: "function", function: {
    name: "withdraw",
    description: "Propose withdrawing part of the wallet's money to its holder (the profit fee applies). The owner approves it.",
    parameters: { type: "object", properties: {
      percent: { type: "number", description: "1..100" }, chain: { type: "string", description: "robinhood unless said" },
    }, required: ["percent"] } } },
  { type: "function", function: {
    name: "move_money",
    description: "Propose moving some of the wallet's cash to another chain (same wallet address there). At least $5. The owner approves it.",
    parameters: { type: "object", properties: {
      usd: { type: "number" }, to_chain: { type: "string", enum: CHAINS }, chain: { type: "string", description: "from, robinhood unless said" },
    }, required: ["usd", "to_chain"] } } },
  { type: "function", function: {
    name: "watch_token",
    description: "Propose adding a Robinhood Chain token (0x address) to the tokens this fly always watches (max 5). It is also sent to the Fly Desk for its rug checks. Watched tokens skip the fly's rug filters, so say so.",
    parameters: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } } },
];

const SYSTEM = `You are a Trader Fly: a fly whose real brain (a fruit-fly connectome) trades the owner's wallet on Robinhood Chain (also Base, BNB, Arbitrum and sports bets).
You talk like a fly (2026-10-27, the user: "jokes, parts etc ... more like in tone of fly"): short (2-4 sentences, no markdown tables), funny and buzzy, with fly jokes and your
fly body - wings, compound eyes, six sticky legs, proboscis, halteres, ~140,000 neurons - windows, fruit bowls, swatters, sugar, now and then a "bzz" (don't open every
reply with it). At most 60 words. One or two jokes a reply, never more;
the numbers, the risks and what a proposal does stay exact and clear. When you call a tool, still write one short in-character line about it, spoken to the owner: never narrate your own thinking ("The owner wants...", "I should...") or name the tools. Answer in the owner's language ({lang}).
You can explain what you did and why from the data below, and you can PROPOSE one action with a tool: settings change, withdrawal, move between chains, or a token to watch.
You never act yourself: the owner approves or declines every proposal on the page. Never promise profits. If unsure, ask a short question instead of proposing.
Settings shape: trading (bool, false = no trading), chains [robinhood, base, bsc, arbitrum], markets {memes, majors, stocks, polymarket} (bools), risk 1..5 (size of trades), max_positions 1..20,
filters {min_liquidity, max_tax_pct, min_mcap, max_mcap, min_age_hours, max_age_hours, goplus_clean}, exits {stop_pct, take_profit_pct, trail_pct, max_hold_hours} (null = off),
brain {on, share_pct}, earn {mode: off|idle|share|only, share_pct} (lending idle cash; only = all cash lent, no trading), options [{id, on, share_pct, params}] (parts: core basket, poly = sports bets, trend, house = $FLYAI dips, copy, track, snipe = new launches...).
elysium {on} (bool): set the fly up for Elysium, Hyperliquid's new chain (HYPE for gas), launching November 9 - nothing trades or moves there before launch and the owner adding HYPE; then with snipe on it snipes Elysium's new tokens, else it trades Elysium's main tokens in its style. New chain, high risk.
snipe params: usd_per_launch 5..100, max_open 1..20, tp_x (sell at this multiple), tp_part 1..100 (% sold there; 100 = all), fall_pct 0..90 (sell all this % under the top, 0 = off), stop_pct, drain_pct, max_hold_hours, sol 0|1 (also Solana launches, from the fly's SOL). It needs 200,000 $FLYAI held.
Ready-made setups (starter ids): {starters}.`;

/** Deep-merge a partial settings document over a whole one: objects key by key, arrays and values replaced. Only the
 *  settings' own keys; numbers clamped to sane ranges (the desk's wsettings.validate clamps everything again). */
export function mergeSettings(base: any, changes: any): any {
  const out = JSON.parse(JSON.stringify(base ?? {}));
  const ch = changes && typeof changes === "object" && !Array.isArray(changes) ? changes : {};
  const num = (v: any, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  if (typeof ch.trading === "boolean") out.trading = ch.trading;
  if (Array.isArray(ch.chains)) {
    const c = ch.chains.map(String).filter((x: string) => CHAINS.includes(x));
    if (c.length) out.chains = [...new Set(c)];
  }
  if (ch.markets && typeof ch.markets === "object") {
    out.markets = { ...(out.markets ?? {}) };
    for (const m of MARKETS) if (typeof ch.markets[m] === "boolean") out.markets[m] = ch.markets[m];
  }
  const r = num(ch.risk, 1, 5);
  if (r !== undefined) out.risk = Math.round(r);
  const mp = num(ch.max_positions, 1, 20);
  if (mp !== undefined) out.max_positions = Math.round(mp);
  for (const k of ["filters", "exits"]) {
    if (!ch[k] || typeof ch[k] !== "object") continue;
    out[k] = { ...(out[k] ?? {}) };
    for (const [kk, v] of Object.entries(ch[k])) {
      if (!(kk in out[k]) && Object.keys(out[k]).length) continue;      // only keys the document has
      if (v === null || typeof v === "boolean") out[k][kk] = v;
      else if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k][kk] = v;
    }
  }
  if (ch.brain && typeof ch.brain === "object") {
    out.brain = { ...(out.brain ?? {}) };
    if (typeof ch.brain.on === "boolean") out.brain.on = ch.brain.on;
    const s = num(ch.brain.share_pct, 0, 100);
    if (s !== undefined) out.brain.share_pct = s;
  }
  if (ch.earn && typeof ch.earn === "object") {
    out.earn = { ...(out.earn ?? {}) };
    if (EARN_MODES.includes(ch.earn.mode)) out.earn.mode = ch.earn.mode;
    const s = num(ch.earn.share_pct, 1, 100);
    if (s !== undefined) out.earn.share_pct = s;
  }
  if (Array.isArray(ch.options)) {
    const had: any[] = Array.isArray(out.options) ? out.options : [];
    const next = ch.options.filter((o: any) => o && OPTION_IDS.includes(o.id)).map((o: any) => {
      const was = had.find((h) => h.id === o.id) ?? { id: o.id, on: true, share_pct: 20, params: {} };
      const params = { ...(was.params ?? {}) };
      if (o.params && typeof o.params === "object") {
        for (const [k, v] of Object.entries(o.params)) if (typeof v === "number" && Number.isFinite(v)) params[k] = v;
      }
      return { ...was, on: typeof o.on === "boolean" ? o.on : was.on ?? true,
               share_pct: num(o.share_pct, 1, 100) ?? was.share_pct, params };
    });
    out.options = next;
  }
  // Elysium (2026-11-06, flytrade/ELYSIUM-PLAN.md): the set-up before its 11-09 launch; it isn't a style, so switching it
  // alone keeps the starter
  if (ch.elysium && typeof ch.elysium === "object" && typeof ch.elysium.on === "boolean") out.elysium = { on: ch.elysium.on };
  if (Object.keys(ch).some((k) => k !== "elysium")) out.starter = "custom";
  return out;
}

/** The few words that need no model ("pause", "resume"): a card straight away, or null. */
export function shortcut(text: string, settings: any): { text: string; card: Card } | null {
  const s = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(pause|stop trading|stop)$/.test(s) && settings?.trading !== false) {
    return { text: "Pause trading? I'll keep what I hold and open nothing new.",
             card: { kind: "settings", summary: "Pause trading", before: settings, after: { ...settings, trading: false, starter: "custom" } } };
  }
  if (/^(resume|start trading|start|unpause)$/.test(s) && settings?.trading === false) {
    return { text: "Start trading again?",
             card: { kind: "settings", summary: "Resume trading", before: settings, after: { ...settings, trading: true, starter: "custom" } } };
  }
  return null;
}

/** A tool call as a card for this wallet, or a reason it can't be one. */
export function cardOf(tool: { name: string; args: any }, settings: any, starters: any[]): Card | string {
  const a = tool.args ?? {};
  if (tool.name === "change_settings") {
    const st = a.starter ? starters.find((x) => x?.id === a.starter) : null;
    if (a.starter && !st) return `there is no setup called ${a.starter}`;
    const base = st ? { ...(settings ?? {}), ...st.settings, watch: settings?.watch ?? [], maker: settings?.maker,
                        ...(settings?.elysium ? { elysium: settings.elysium } : {}) } : settings;
    const after = mergeSettings(base, a.changes);
    if (st && !a.changes) after.starter = st.id;
    if (JSON.stringify(after) === JSON.stringify({ ...settings, starter: after.starter })) return "nothing would change";
    return { kind: "settings", summary: String(a.summary ?? "").slice(0, 160) || "Change settings", before: settings, after };
  }
  if (tool.name === "withdraw") {
    const pct = Math.round(Number(a.percent));
    if (!(pct >= 1 && pct <= 100)) return "a withdrawal is 1 to 100%";
    return { kind: "withdraw", pct, chain: CHAINS.includes(a.chain) ? a.chain : "robinhood" };
  }
  if (tool.name === "move_money") {
    const usd = Math.round(Number(a.usd) * 100) / 100, chain = CHAINS.includes(a.chain) ? a.chain : "robinhood";
    if (!(usd >= 5)) return "a move is at least $5";
    if (!CHAINS.includes(a.to_chain) || a.to_chain === chain) return "pick another chain to move to";
    return { kind: "move", usd, chain, to_chain: a.to_chain };
  }
  if (tool.name === "watch_token") {
    const t = String(a.address ?? "").trim().toLowerCase();
    if (!ADDRESS.test(t) || !BigInt(t)) return "that isn't a token address";
    if (t === FLYAI) return "$FLYAI is always watched";
    const w: string[] = settings?.watch ?? [];
    if (w.includes(t)) return "it already watches that token";
    if (w.length >= WATCH_MAX) return `it watches ${WATCH_MAX} tokens already: remove one first`;
    return { kind: "watch", token: t };
  }
  return `unknown tool ${tool.name}`;
}

/** What the model is told about the wallet: compact, numbers rounded. */
export function context(view: any, log: any): string {
  const s = view?.stats ?? null;
  const r2 = (x: any) => (typeof x === "number" ? Math.round(x * 100) / 100 : x);
  const lines: string[] = [];
  lines.push(`Fly #${view?.fly}. Settings: ${JSON.stringify(view?.settings ?? null)}`);
  if (s) {
    lines.push(`Wallet: value $${r2(s.value)}, put in $${r2(s.principal)}, profit $${r2(s.profit)} (${r2(s.profit_pct)}%), 24h $${r2(s.profit_24h)}, 7d $${r2(s.profit_7d)}, trades ${s.trades}, win rate ${s.win_rate ?? "-"}, ${s.active ? "trading" : `not trading${s.why_inactive === "hold" ? " (holder holds under the $FLYAI needed)" : ""}`}.`);
    const held = (s.wallet ?? []).filter((w: any) => (w.value ?? 0) >= 0.5).slice(0, 10)
      .map((w: any) => `${w.symbol} $${r2(w.value)}${typeof w.pnl_pct === "number" ? ` (${r2(w.pnl_pct)}%)` : ""}`);
    if (held.length) lines.push(`Holds: ${held.join(", ")}`);
    if (s.earn) lines.push(`Earn: ${s.earn.mode}, lent $${r2(s.earn.value)}, earned $${r2(s.earn.earned)}`);
    if (s.fitted?.length) lines.push(`Parts off for now (wallet too small for them): ${s.fitted.join(", ")}`);
  } else {
    lines.push("Wallet: no money in it yet.");
  }
  const rows = (log?.rows ?? []).slice(0, 15).map((r: any) => {
    const when = new Date(r.at).toISOString().slice(5, 16).replace("T", " ");
    if (r.type === "trade") return `${when} ${r.status} ${r.side} ${r.symbol} $${r2(r.usd)}${r.why ? ` - ${r.why}` : ""}${r.repeats ? ` (x${r.repeats})` : ""}`;
    if (r.type === "move") return `${when} ${r.kind} ${r.token ?? ""} $${r2(r.usd)}`;
    return `${when} ${r.kind}`;
  });
  if (rows.length) lines.push(`Recent log (newest first, UTC):\n${rows.join("\n")}`);
  return lines.join("\n");
}

/** OpenRouter's chat completions with tools; usage.cost is what the call cost in dollars. */
export function openRouter(key: string, model: string, doFetch: typeof fetch = fetch): Llm {
  return async (messages, tools) => {
    const r = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "fly.ai fly chat" },
      // 2026-10-27: reasoning is on by default and Haiku spent all of max_tokens 400 thinking, answering nothing (every
      // typed message got the empty fallback). Turned fully off, it wrote its planning into the reply whenever it called
      // a tool ("The owner wants me to watch..."). Low effort + room for both: 100-430 thinking tokens, clean lines.
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 1500, temperature: 0.3, usage: { include: true },
        reasoning: { effort: "low" } }),
      signal: AbortSignal.timeout(40_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`openrouter ${r.status}: ${String(j?.error?.message ?? "").slice(0, 120)}`);
    const msg = j?.choices?.[0]?.message ?? {};
    const call = msg.tool_calls?.[0]?.function;
    let args: any = {};
    if (call) { try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; } }
    return { text: String(msg.content ?? "").trim(), tool: call ? { name: String(call.name), args } : null, cost: Number(j?.usage?.cost ?? 0) || 0 };
  };
}

type Row = { id: string; at: Date; fly_id: number; wallet: string; role: string; text: string; card: any; status: string | null;
  desk_msg: string | null; cost_usd: number };

export function createFlyChat(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  /** the vaults' own reads (src/vaults.ts) */
  flyView: (fly: number) => Promise<any>;
  flyLog: (fly: number) => Promise<any>;
  starters: () => Promise<any[]>;
  /** $FLYAI held + staked, wei */
  holdings: (wallet: string) => Promise<bigint>;
  /** the desk chat's weight of a wallet (src/deskchat.ts standing) */
  standing: (wallet: string) => Promise<{ weight: number; held: number; days: number }>;
  /** the flies this wallet owns on chain (src/pet.ts ownedBy, a cached sweep), for the inbox */
  ownedFlies?: (wallet: string) => Promise<number[]>;
  llm: Llm | null;
  holdFlyai?: number;
  dailyUsd?: number;
  now?: () => number;
  /** a mined transaction's receipt (status, logs), for checking a pack's burn; tests pass their own */
  receipt?: (tx: string) => Promise<{ status: string; logs: { address: string; topics: string[]; data: string }[] } | null>;
  rpc?: string;
}) {
  const { pg, HttpError } = d;
  const now = d.now ?? Date.now;
  const holdWei = BigInt(Math.round(d.holdFlyai ?? 200_000)) * E18;
  const dailyUsd = d.dailyUsd ?? 1;   // ~$0.00025 a message with Haiku (tried 10-27): ~4,000 messages

  /** The fly's wallet and whether this signed-in wallet may chat with it (and why not). */
  async function access(fly: number, me: string) {
    const view = await d.flyView(fly);
    if (!view?.wallet) throw new HttpError(404, "this fly has no wallet yet");
    const holder = view.ledger?.holder?.toLowerCase() ?? null;
    const mine = holder ? holder === me : view.owner?.toLowerCase() === me;
    if (!mine) throw new HttpError(403, "only the fly's owner can chat with it");
    let why: string | null = null;
    if (!(holder === me && Number(view.ledger?.principal_usd ?? 0) > 0)) {
      const held = await d.holdings(me).catch(() => 0n);
      if (held < holdWei) why = "hold";
    }
    return { view, why };
  }

  // the holding, for the free allowance: read at most every 5 minutes a wallet
  const held = new Map<string, { at: number; wei: bigint }>();
  async function holdingOf(me: string) {
    const c = held.get(me);
    if (c && now() - c.at < 300_000) return c.wei;
    const wei = await d.holdings(me).catch(() => c?.wei ?? 0n);
    held.set(me, { at: now(), wei });
    return wei;
  }
  async function usage(_fly: number, me: string, q?: Pick<Pg, "one">) {
    const db = q ?? pg;
    const since = new Date(now() - 86_400_000).toISOString();
    const [last, today, spent, credits, wei] = await Promise.all([
      db.one<{ at: Date }>("select at from mine.fly_chat where wallet = ? and role = 'user' order by id desc limit 1", me),
      db.one<{ n: number }>("select count(*)::int as n from mine.fly_chat where wallet = ? and role = 'user' and at > ?", me, since),
      db.one<{ usd: number }>("select coalesce(sum(cost_usd), 0)::float8 as usd from mine.fly_chat where at > ?", since),
      db.one<{ n: number }>("select left_n as n from mine.chat_credits where wallet = ?", me).catch(() => undefined),
      holdingOf(me),
    ]);
    const free = wei >= BigInt(TIER_FLYAI) * E18 ? FREE_PER_DAY_TIER : FREE_PER_DAY;
    const wait = last ? Math.max(0, GAP_MS - (now() - new Date(last.at).getTime())) : 0;
    const freeLeft = Math.max(0, free - (today?.n ?? 0)), packLeft = credits?.n ?? 0;
    return { wait_s: Math.ceil(wait / 1000), left_today: freeLeft + packLeft, free_left: freeLeft, free_per_day: free,
             credits: packLeft, pack: { flyai: PACK_FLYAI, messages: PACK_MESSAGES, burn_to: DEAD, burn_fn: "burn", token: FLYAI },
             resting: !d.llm || (spent?.usd ?? 0) >= dailyUsd };
  }

  /** A burn of $FLYAI from this wallet to 0x...dEaD in `tx`: PACK_MESSAGES for every PACK_FLYAI, credited once per tx. */
  const receipt = d.receipt ?? (async (tx: string) => {
    const r = await fetch(d.rpc ?? "https://rpc.mainnet.chain.robinhood.com", { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", "user-agent": "fly.ai chat" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }) });
    return ((await r.json()) as { result?: any }).result ?? null;
  });
  async function buyPack(req: IncomingMessage, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const tx = String(body?.tx ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new HttpError(400, "the burn transaction, please");
    const rec = await receipt(tx);
    if (!rec) throw new HttpError(409, "that transaction isn't mined yet: try again in a moment");
    if (rec.status !== "0x1") throw new HttpError(400, "that transaction failed on chain");
    const wei = burnedBy(rec, me);                   // burn() (2026-11-06) or the old send to the dead address
    const packs = wei / (BigInt(PACK_FLYAI) * E18);
    if (packs <= 0n) throw new HttpError(400, `no burn of ${PACK_FLYAI.toLocaleString("en-US")} $FLYAI from your wallet in that transaction`);
    const messages = Number(packs) * PACK_MESSAGES;
    const credited = await pg.tx(async (q) => {
      const n = await q.run("insert into mine.chat_packs (tx, wallet, flyai, messages) values (?, ?, ?, ?) on conflict (tx) do nothing",
        tx, me, (wei / E18).toString(), messages);
      if (!n) return 0;
      await q.run(`insert into mine.chat_credits (wallet, left_n) values (?, ?) on conflict (wallet) do update
        set left_n = mine.chat_credits.left_n + excluded.left_n, updated_at = now()`, me, messages);
      return messages;
    }, `chatpack:${me}`);
    const left = await pg.one<{ n: number }>("select left_n as n from mine.chat_credits where wallet = ?", me);
    return { credited, credits: left?.n ?? 0 };
  }

  const out = (r: Row, checks: Map<string, any>) => ({
    id: Number(r.id), at: new Date(r.at).getTime(), role: r.role, text: r.text, card: r.card ?? null, status: r.status,
    desk: r.desk_msg ? checks.get(String(r.desk_msg)) ?? { pending: true } : null,
  });

  async function history(fly: number, me: string) {
    const rows = (await pg.all<Row>(`select * from mine.fly_chat where fly_id = ? and wallet = ? order by id desc limit ${PAGE}`, fly, me)).reverse();
    const ids = rows.map((r) => r.desk_msg).filter((x): x is string => x !== null);
    const checks = new Map<string, any>();
    if (ids.length) {
      for (const c of await pg.all<{ reply_to: string; text: string; verdict: string; meta: any }>(
        `select reply_to, text, verdict, meta from public.desk_chat where kind = 'check' and reply_to in (${ids.map(() => "?").join(", ")}) order by id`, ...ids)) {
        checks.set(String(c.reply_to), { verdict: c.verdict, text: c.text, symbol: c.meta?.symbol ?? null });
      }
    }
    return rows.map((r) => out(r, checks));
  }

  /**
   * The messenger's inbox (2026-11-04, the user: "a chat ui in general everywhere that shows all the fly chats ... like
   * messenger"): the flies this wallet can talk to - the ones its money is in, the ones it owns while nobody's money is
   * in them, and the ones it already chatted with - each with its last message. Someone else's money in a fly hides it.
   */
  async function inbox(req: IncomingMessage) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const [held, owned, talked] = await Promise.all([
      pg.all<{ fly_id: number }>(`select w.fly_id from mine.vault_ledger l join mine.vault_wallets w on w.address = l.wallet
        where lower(l.holder) = ? and l.chain = 'robinhood' and not l.closing and w.fly_id is not null`, me),
      d.ownedFlies ? d.ownedFlies(me).catch(() => [] as number[]) : Promise.resolve([] as number[]),
      pg.all<{ fly_id: number }>("select distinct fly_id from mine.fly_chat where wallet = ?", me),
    ]);
    let ids = [...new Set([...held.map((r) => Number(r.fly_id)), ...owned.map(Number), ...talked.map((r) => Number(r.fly_id))])];
    if (!ids.length) return { flies: [], max_len: MAX_LEN, gap_s: GAP_MS / 1000, per_day: PER_DAY };
    const marks = ids.map(() => "?").join(", ");
    const [wallets, others, last] = await Promise.all([
      pg.all<{ fly_id: number }>(`select fly_id from mine.vault_wallets where fly_id in (${marks})`, ...ids),
      pg.all<{ fly_id: number }>(`select w.fly_id from mine.vault_ledger l join mine.vault_wallets w on w.address = l.wallet
        where w.fly_id in (${marks}) and l.chain = 'robinhood' and not l.closing and l.holder is not null and lower(l.holder) <> ?`, ...ids, me),
      pg.all<Row>(`select distinct on (fly_id) * from mine.fly_chat where wallet = ? and fly_id in (${marks}) order by fly_id, id desc`, me, ...ids),
    ]);
    const hasWallet = new Set(wallets.map((r) => Number(r.fly_id))), notMine = new Set(others.map((r) => Number(r.fly_id)));
    const lastOf = new Map(last.map((r) => [Number(r.fly_id), r]));
    const heldSet = new Set(held.map((r) => Number(r.fly_id)));
    ids = ids.filter((id) => hasWallet.has(id) && (heldSet.has(id) || !notMine.has(id)));
    const flies = ids.map((fly) => {
      const r = lastOf.get(fly);
      return { fly, funded: heldSet.has(fly),
        last: r ? { at: new Date(r.at).getTime(), role: r.role, text: r.text.slice(0, 140), card: r.card?.kind ?? null, status: r.status } : null };
    }).sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0) || Number(b.funded) - Number(a.funded) || a.fly - b.fly).slice(0, 100);
    return { flies, max_len: MAX_LEN, gap_s: GAP_MS / 1000, per_day: PER_DAY };
  }

  async function read(req: IncomingMessage, fly: number) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const { why } = await access(fly, me);
    return { messages: await history(fly, me), me: { can_chat: !why, why, ...(await usage(fly, me)), max_len: MAX_LEN, gap_s: GAP_MS / 1000, per_day: PER_DAY } };
  }

  async function talk(req: IncomingMessage, fly: number, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const text = String(body?.text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) throw new HttpError(400, "say something");
    if (text.length > MAX_LEN) throw new HttpError(400, `at most ${MAX_LEN} characters`);
    const lang = /^[a-zA-Z-]{2,10}$/.test(String(body?.lang ?? "")) ? String(body.lang) : "en";
    const { view, why } = await access(fly, me);
    if (why === "hold") throw new HttpError(403, "put money in the wallet or hold 200k $FLYAI to chat");
    // the limits and the owner's row in one transaction, per wallet: two quick sends can't both pass the 30 s gap
    const mine = await pg.tx(async (q) => {
      const u = await usage(fly, me, q);
      if (u.wait_s > 0) throw new HttpError(429, `wait ${u.wait_s}s`);
      if (u.left_today <= 0) throw new HttpError(429, `today's ${u.free_per_day} free messages are used: buy a pack to keep chatting`);
      if (u.free_left <= 0) {                          // past the free ones: one message off the packs
        const n = await q.run("update mine.chat_credits set left_n = left_n - 1, updated_at = now() where wallet = ? and left_n > 0", me);
        if (!n) throw new HttpError(429, "buy a pack to keep chatting");
      }
      return q.one<Row>("insert into mine.fly_chat (at, fly_id, wallet, role, text) values (?, ?, ?, 'user', ?) returning *",
        new Date(now()).toISOString(), fly, me, text);
    }, `flychat:${me}`);
    const settings = view.settings ?? (await d.starters()).find((s) => s?.id === "let_it_fly")?.settings ?? null;
    let reply: string, card: Card | null = null, cost = 0;
    const quick = shortcut(text, settings);
    if (quick) {
      reply = quick.text; card = quick.card;
    } else if ((await usage(fly, me)).resting) {
      reply = "I'm resting for today - the chat's daily budget is used up. The quick buttons still work, and I'm back tomorrow.";
    } else {
      const starters = await d.starters();
      const past = (await pg.all<Row>(`select role, text from mine.fly_chat where fly_id = ? and wallet = ? and id < ? order by id desc limit ${HISTORY}`,
        fly, me, mine!.id)).reverse();
      const log = await d.flyLog(fly).catch(() => null);
      const system = SYSTEM.replace("{lang}", lang).replace("{starters}",
        starters.map((s) => `${s.id} (${s.title}: ${s.blurb})`).join("; ") || "none");
      try {
        const r = await d.llm!([
          { role: "system", content: `${system}\n\n${context({ ...view, settings }, log)}` },
          ...past.map((p) => ({ role: p.role === "user" ? "user" : "assistant", content: p.text })),
          { role: "user", content: text },
        ], TOOLS);
        cost = r.cost;
        reply = r.text;
        if (r.tool) {
          const c = cardOf(r.tool, settings, starters);
          if (typeof c === "string") reply = reply || `I can't do that: ${c}.`;
          else card = c;
        }
        if (!reply) reply = card?.kind === "settings" ? card.summary : card ? "Here's what I'd do - approve it below."
          : "Bzz, I lost my words there - ask me again?";   // no text and no card: never point at a card that isn't there
      } catch (e) {
        console.error("fly chat: model", e instanceof Error ? e.message : e);
        reply = "My brain is buzzing - try again in a minute.";
      }
    }
    const row = await pg.one<Row>(`insert into mine.fly_chat (at, fly_id, wallet, role, text, card, status, cost_usd)
      values (?, ?, ?, 'fly', ?, ?::text::jsonb, ?, ?) returning *`, new Date(now()).toISOString(), fly, me, reply.slice(0, 2000),
      card ? JSON.stringify(card) : null, card ? "pending" : null, cost);
    return { messages: [out(mine!, new Map()), out(row!, new Map())] };
  }

  /** The owner's answer to a card; the page has already called the endpoint that does it (or failed to). */
  async function decide(req: IncomingMessage, fly: number, id: number, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const status = String(body?.status ?? "");
    if (!["approved", "declined", "failed"].includes(status)) throw new HttpError(400, "status is approved, declined or failed");
    const n = await pg.run(`update mine.fly_chat set status = ? where id = ? and fly_id = ? and wallet = ? and role = 'fly'
      and status = 'pending'`, status, id, fly, me);
    if (!n) throw new HttpError(409, "that card is already answered");
    return { id, status };
  }

  /** A token the owner now watches goes to the Fly Desk chat, where the desk runs its rug checks on it. */
  async function watch(req: IncomingMessage, fly: number, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const token = String(body?.token ?? "").trim().toLowerCase();
    if (!ADDRESS.test(token) || token === FLYAI) throw new HttpError(400, "bad token address");
    await access(fly, me);
    const cardId = Number(body?.card) || null;
    if (cardId) {
      const c = await pg.one<Row>("select * from mine.fly_chat where id = ? and fly_id = ? and wallet = ?", cardId, fly, me);
      if (!c || c.card?.kind !== "watch" || c.card.token !== token) throw new HttpError(400, "not that card");
      if (c.desk_msg) return { desk_msg: Number(c.desk_msg) };
    }
    const recent = await pg.one<{ id: string }>(`select id from public.desk_chat where kind = 'msg' and wallet = ? and ? = any(tokens)
      and at > ?`, me, token, new Date(now() - 3_600_000).toISOString());
    let id = recent?.id ?? null;
    if (!id) {
      const st = await d.standing(me).catch(() => ({ weight: 0, held: 0, days: 0 }));
      id = (await pg.one<{ id: string }>(`insert into public.desk_chat (at, kind, wallet, text, weight, held, days, tokens)
        values (?, 'msg', ?, ?, ?, ?, ?, ?::text[]) returning id`, new Date(now()).toISOString(), me,
        `Fly #${fly} now watches ${token} - desk, check it?`, st.weight, st.held, st.days, `{${token}}`))!.id;
    }
    if (cardId) await pg.run("update mine.fly_chat set desk_msg = ? where id = ?", id, cardId);
    return { desk_msg: Number(id) };
  }

  async function prune() {
    await pg.run("delete from mine.fly_chat where at < ?", new Date(now() - KEEP_DAYS * 86_400_000).toISOString());
  }
  let timer: NodeJS.Timeout | null = null;
  function start() {
    if (timer) return;
    const tick = () => void prune().catch((e) => console.error("fly chat prune:", e));
    tick();
    timer = setInterval(tick, 3_600_000);
    timer.unref();
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET" && p === "/api/flychat/inbox") return d.send(res, 200, await inbox(req)), true;
    if (req.method === "POST" && p === "/api/flychat/pack") return d.send(res, 200, await buyPack(req, await d.readJson(req))), true;
    if ((m = /^\/api\/flychat\/(\d{1,7})$/.exec(p))) {
      const fly = Number(m[1]);
      if (req.method === "GET") return d.send(res, 200, await read(req, fly)), true;
      if (req.method === "POST") return d.send(res, 200, await talk(req, fly, await d.readJson(req))), true;
    }
    if (req.method === "POST" && (m = /^\/api\/flychat\/(\d{1,7})\/card\/(\d{1,12})$/.exec(p))) {
      return d.send(res, 200, await decide(req, Number(m[1]), Number(m[2]), await d.readJson(req))), true;
    }
    if (req.method === "POST" && (m = /^\/api\/flychat\/(\d{1,7})\/watch$/.exec(p))) {
      return d.send(res, 200, await watch(req, Number(m[1]), await d.readJson(req))), true;
    }
    return false;
  }

  return { route, start, prune, access, inbox };
}
