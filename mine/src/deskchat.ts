/**
 * The Fly Desk's live chat (2026-10-26, flytrade/DESK-CHAT-PLAN.md; the user: "holders can chat and the backend can
 * take into consideration what they are saying", "if a holder is big and for long time it'll have more weight", "at
 * least hold 10k to chat, but all can read", "something cheap").
 *
 * This server writes the holders' messages; the desk (flytrade/desk/chat.py) reads the tokens they name, runs its rug
 * screen on them and posts the result as a reply; the page (docs/assets/deskchat.js) reads the table with the anon key
 * and gets new rows through Supabase Realtime. Table public.desk_chat, flybook/supabase/migrations/20261026120000_desk_chat.sql.
 *
 *   GET  /api/desk-chat?before=<id>   -> { messages: [...newest first, 60 at most, with the replies to them] }
 *   GET  /api/desk-chat/me            -> the signed-in wallet's held, days, weight and whether it can post
 *   POST /api/desk-chat { text }      (signed in) -> the new row
 *
 * Weight (what the desk listens to): min(1, held / 1M) x min(1, days held / 30), held = $FLYAI in the wallet + staked
 * in FlyStaking, days = since the wallet's held amount last went from under 10k to 10k+ (its transfer history on
 * Blockscout, read once a day a wallet). Under 10k can't post; the team's wallets and blocked ones post with weight 0.
 * No links (scam bait), 200 characters, one message every 10 s a wallet, 120 a day.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export const MIN_HOLD = 10_000n * 10n ** 18n;
export const FULL_HOLD = 1_000_000;
export const FULL_DAYS = 30;
const MAX_LEN = 200;
const GAP_MS = 10_000;
const PER_DAY = 120;
const PAGE = 60;
const KEEP_DAYS = 7;
const HOLDERS_KEEP_MS = 86_400_000;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const E18 = 10n ** 18n;
/** our own wallets (team-wallets): dev, POOL, the user's personal one; they may talk but never steer the desk */
export const TEAM = [
  "0x625862521777e19ad54ce6c7abed9ca54d6589ea",
  "0xcca1ad591f6fe7e40e382639ad2551044fae6d36",
  "0xae92d64584e7f8e54995c362eaa8d7949fac8b1b",
];

/** One $FLYAI transfer of the wallet, as Blockscout lists it (newest first). */
export type Transfer = { from: string; to: string; value: bigint; at: number /* ms */ };
export type ChatChain = {
  /** each wallet's $FLYAI held + staked, wei */
  holdings(wallets: string[]): Promise<bigint[]>;
  /** the wallet's $FLYAI transfers, newest first, one page at a time (cursor null = the first page) */
  transfers(wallet: string, cursor: string | null): Promise<{ items: Transfer[]; next: string | null }>;
};

/** The weight a wallet's messages carry: held (whole $FLYAI) and days held, each capped at "full". */
export function weightOf(held: number, days: number): number {
  return Math.round(Math.min(1, Math.max(0, held) / FULL_HOLD) * Math.min(1, Math.max(0, days) / FULL_DAYS) * 1000) / 1000;
}

/** The tokens a message names: $SYMBOL (2-12 letters/digits, upper case) and 0x addresses (lower case), 3 at most. */
export function mentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/0x[0-9a-fA-F]{40}\b|\$([A-Za-z][A-Za-z0-9]{1,11})\b/g)) {
    const t = m[1] ? m[1].toUpperCase() : m[0].toLowerCase();
    if (t !== "FLYAI" && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 3);
}

/** Why a message can't go out as written (links, invite codes, empty), or null. */
export function refused(text: string): string | null {
  if (!text) return "say something";
  if (text.length > MAX_LEN) return `at most ${MAX_LEN} characters`;
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|io|xyz|app|gg|me|net|org|finance|fun|link|site|top|co)\b|t\.me\/|discord\.gg/i.test(text)) {
    return "no links in the chat";
  }
  return null;
}

/**
 * When the wallet's held amount last went from under MIN_HOLD to MIN_HOLD or more (ms), walking its transfers back from
 * what it holds now. Transfers to and from the staking contract (and FlyLock) move nothing (held counts staked and
 * locked). null: under it now.
 * A history longer than maxPages is cut: the oldest transfer read is the answer (a long holder, counted from there).
 */
export async function heldSince(chain: ChatChain, wallet: string, heldNow: bigint, staking: string | null | (string | null)[],
                                now: number, maxPages = 10): Promise<number | null> {
  if (heldNow < MIN_HOLD) return null;
  const st = new Set((Array.isArray(staking) ? staking : [staking]).filter(Boolean).map((a) => a!.toLowerCase()));
  let held = heldNow, cursor: string | null = null, oldest = now;
  for (let page = 0; page < maxPages; page++) {
    const { items, next } = await chain.transfers(wallet, cursor);
    for (const t of items) {
      const from = t.from.toLowerCase(), to = t.to.toLowerCase();
      if ((from === wallet && st.has(to)) || (to === wallet && st.has(from)) || from === to) continue;
      const before = to === wallet ? held - t.value : from === wallet ? held + t.value : held;
      if (before < MIN_HOLD) return t.at;       // this transfer took it to 10k+ for the last time
      held = before;
      oldest = t.at;
    }
    if (!next) return oldest;                   // the whole history: held 10k+ since its first transfer
    cursor = next;
  }
  return oldest;
}

/** Blockscout's transfer list for one token, Robinhood Chain. */
export function blockscoutTransfers(base: string, token: string): ChatChain["transfers"] {
  return async (wallet, cursor) => {
    const q = new URLSearchParams({ type: "ERC-20", token, ...(cursor ? JSON.parse(cursor) : {}) });
    const r = await fetch(`${base}/api/v2/addresses/${wallet}/token-transfers?${q}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`blockscout ${r.status}`);
    const j: any = await r.json();
    const items: Transfer[] = (j.items ?? [])
      .filter((x: any) => String(x.token?.address_hash ?? x.token?.address ?? token).toLowerCase() === token.toLowerCase())
      .map((x: any) => ({ from: String(x.from?.hash ?? ""), to: String(x.to?.hash ?? ""), value: BigInt(x.total?.value ?? 0),
                          at: Date.parse(x.timestamp) }));
    return { items, next: j.next_page_params ? JSON.stringify(j.next_page_params) : null };
  };
}

type Row = {
  id: string; at: Date; kind: string; wallet: string | null; text: string; weight: number; held: string | null;
  days: number | null; tokens: string[]; reply_to: string | null; verdict: string | null; meta: any; checked_at: Date | null;
};
const out = (r: Row) => ({
  id: Number(r.id), at: new Date(r.at).getTime(), kind: r.kind, wallet: r.wallet, text: r.text, weight: r.weight,
  held: r.held === null ? null : Number(r.held), days: r.days, tokens: r.tokens, reply_to: r.reply_to === null ? null : Number(r.reply_to),
  verdict: r.verdict, meta: r.meta, checked: r.checked_at !== null,
});

export function createDeskChat(d: {
  pg: Pg; chain: ChatChain; staking: string | null | (string | null)[];
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  /** extra wallets with weight 0 (CHAT_TEAM) */
  team?: string[];
  now?: () => number;
}) {
  const { pg, chain, HttpError } = d;
  const now = d.now ?? Date.now;
  const team = new Set([...TEAM, ...(d.team ?? [])].map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)));

  /** held (whole $FLYAI), days held and the weight for a wallet; the holding time is cached a day. */
  async function standing(wallet: string) {
    const [wei] = await chain.holdings([wallet]);
    const held = Number(wei / E18);
    let row = await pg.one<{ held_since: Date | null; checked_at: Date }>(
      "select held_since, checked_at from mine.chat_holders where wallet = ?", wallet);
    // read again once a day, and as soon as the cached answer can't be right (held now, but cached as not holding)
    if (!row || now() - new Date(row.checked_at).getTime() > HOLDERS_KEEP_MS || (row.held_since === null && wei >= MIN_HOLD)) {
      let since: number | null = null;
      try {
        since = await heldSince(chain, wallet, wei, d.staking, now());
      } catch (e) {
        console.error("desk chat: holding history", wallet, e instanceof Error ? e.message : e);
        since = wei >= MIN_HOLD ? now() : null;    // Blockscout down: counted from now, read again tomorrow
      }
      await pg.run(`insert into mine.chat_holders (wallet, held_since, checked_at) values (?, ?, ?)
        on conflict (wallet) do update set held_since = excluded.held_since, checked_at = excluded.checked_at`,
        wallet, since === null ? null : new Date(since).toISOString(), new Date(now()).toISOString());
      row = { held_since: since === null ? null : new Date(since), checked_at: new Date(now()) };
    }
    const days = wei >= MIN_HOLD && row.held_since ? Math.max(0, (now() - new Date(row.held_since).getTime()) / 86_400_000) : 0;
    const blocked = !!(await pg.one("select 1 from mine.bounty_blocked where value = ?", wallet));
    const muted = team.has(wallet) || blocked;
    return {
      wallet, held, days: Math.round(days * 10) / 10, can_post: wei >= MIN_HOLD && !blocked,
      weight: muted ? 0 : weightOf(held, days), team: team.has(wallet), min_hold: Number(MIN_HOLD / E18),
    };
  }

  async function list(before: number | null) {
    const msgs = await pg.all<Row>(`select * from public.desk_chat where kind = 'msg' ${before ? "and id < ?" : ""}
      order by id desc limit ${PAGE}`, ...(before ? [before] : []));
    const ids = msgs.map((m) => m.id);
    const checks = ids.length ? await pg.all<Row>(
      `select * from public.desk_chat where kind = 'check' and reply_to in (${ids.map(() => "?").join(", ")}) order by id`, ...ids) : [];
    return { messages: [...msgs, ...checks].map(out).sort((a, b) => b.id - a.id), min_hold: Number(MIN_HOLD / E18) };
  }

  async function post(req: IncomingMessage, body: any) {
    const wallet = (await d.sessionWallet(req)).toLowerCase();
    const text = String(body?.text ?? "").replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, " ").replace(/\s+/g, " ").trim();
    const why = refused(text);
    if (why) throw new HttpError(400, why);
    const me = await standing(wallet);
    if (!me.can_post) throw new HttpError(403, me.held < me.min_hold ? `hold at least ${me.min_hold.toLocaleString("en")} $FLYAI to chat` : "this wallet can't post here");
    return pg.tx(async (q) => {
      const last = await q.one<{ at: Date }>("select at from public.desk_chat where wallet = ? and kind = 'msg' order by id desc limit 1", wallet);
      if (last && now() - new Date(last.at).getTime() < GAP_MS) throw new HttpError(429, "one message every 10 seconds");
      const today = await q.one<{ n: number }>("select count(*)::int as n from public.desk_chat where wallet = ? and kind = 'msg' and at > ?",
        wallet, new Date(now() - 86_400_000).toISOString());
      if ((today?.n ?? 0) >= PER_DAY) throw new HttpError(429, `at most ${PER_DAY} messages a day`);
      const tokens = mentions(text);
      const row = await q.one<Row>(`insert into public.desk_chat (at, kind, wallet, text, weight, held, days, tokens, checked_at)
        values (?, 'msg', ?, ?, ?, ?, ?, ?::text[], ?) returning *`, new Date(now()).toISOString(), wallet, text, me.weight, me.held, me.days,
        `{${tokens.join(",")}}`, tokens.length ? null : new Date(now()).toISOString());   // nothing to check: done
      return out(row!);
    }, `chat:${wallet}`);
  }

  /** Rows older than KEEP_DAYS go (hourly on the user process). */
  async function prune() {
    await pg.run("delete from public.desk_chat where at < ?", new Date(now() - KEEP_DAYS * 86_400_000).toISOString());
  }
  let timer: NodeJS.Timeout | null = null;
  function start() {
    if (timer) return;
    const tick = () => void prune().catch((e) => console.error("desk chat prune:", e));
    tick();
    timer = setInterval(tick, 3_600_000);
    timer.unref();
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/desk-chat") {
      const before = Number(url.searchParams.get("before")) || null;
      return d.send(res, 200, await list(before)), true;
    }
    if (req.method === "GET" && p === "/api/desk-chat/me") return d.send(res, 200, await standing((await d.sessionWallet(req)).toLowerCase())), true;
    if (req.method === "POST" && p === "/api/desk-chat") return d.send(res, 200, await post(req, await d.readJson(req))), true;
    return false;
  }

  return { route, start, standing, prune };
}
