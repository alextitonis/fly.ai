// The alpha feed (a private test channel, ALPHA_CHANNEL_ID): token calls from what the flies do and find, written like
// an alpha group chat - short text, the CA, the numbers that matter - not a trade log (2026-10-16, the user: "too
// spammy and doesn't look like an alpha group chat", "need a basic filter to avoid scams").
//   calls     a token the top ALPHA_FLIES Fly Wallets of the week or the Fly Desk buy (or wanted to buy but couldn't for
//             reasons that aren't about the token: gas, cross-chain size, quotes, no room - BLOCKED), FOMO's top traders pile into,
//             or the desk's new-pool watcher finds. Each one must pass the scam filter (src/screen.ts: real money in
//             the pool, trading, no whale or grouped-wallet supply) and is called once per CALL_AGAIN_MS
//   updates   a sell of a called token, as a reply to its call with the P&L
//   bets      Azuro bets the Fly Desk or the top wallets place (pick, stake, odds), the result as a reply
//   launches  the desk's own token launches
// At most MAX_PER_HOUR messages an hour (calls first come first). Passes on the token's merits, index buys (core) and
// tokens that fail the filter are not posted. A restart never posts history: the first read of a source only
// remembers what's there.
import type { Client, Message, SendableChannels } from "discord.js";
import { board, contractOf, desk, flyLog, type FomoToken, type Found, type LogTrade } from "./data.ts";
import { pct, symbol, usd } from "./format.ts";
import { screen, type Verdict } from "./screen.ts";

const CALL_AGAIN_MS = 12 * 3600_000;      // the same token is called again only after this
const MAX_PER_HOUR = 8;
const FOUND_WATCH_MS = 24 * 3600_000;     // a found token that fails at first (no trading yet) is re-checked this long
// a FOMO token is a call when top traders pile in: 2+ of them buying in the last hour, or $5k+ (one trader's $1k, the
// desk's FOMO_VIEW_USD, was too chatty for the channel)
const FOMO_MIN_BUYERS = 2, FOMO_MIN_USD = 5_000;
const hot = (t: FomoToken) => (t.buyers_1h ?? 0) >= FOMO_MIN_BUYERS || (t.buy_usd_1h ?? 0) >= FOMO_MIN_USD;
const SKIP_TAGS = new Set(["core", "earn", "close", "house"]);   // index buys, lending, wind-downs, $FLYAI itself

// a refused buy is still a call when the reason is the wallet's, not the token's (2026-10-16, the user: "sometimes they
// want to buy X but because of gas and cross chain they don't, but it'd still be a good token"). First match labels it.
// Left out on purpose: thin pool / round trip / "edge" (a judgement on the token), stale price, US market closed,
// the $FLYAI cap. Counted on the wallets' 48 h of refusals 2026-10-16.
const BLOCKED: [RegExp, string][] = [
  [/estimateGas|TRANSFER_FROM_FAILED|gas\b|swap failed|relayerror|no routes|reverted/i, "the swap failed"],
  [/quote \d+ bps worse/i, "the cross-chain quote was too far off"],
  [/under \$[\d.]+ for an? \w+ buy|\bdust\b/i, "too small for a cross-chain buy"],
  [/the wallet holds \d+ tokens|already holding \d+ tokens|would be over \d+% of the wallet/i, "no room in the wallet"],
  [/exits only|close only|auto-off|pool-drain exit/i, "its buys are paused"],
];
const blockedWhy = (r: LogTrade) => {
  const why = `${r.why ?? ""}`;
  if (/^FLYAI\b/.test(r.symbol) || /FLYAI would be over/i.test(why)) return null;
  return BLOCKED.find(([re]) => re.test(why))?.[1] ?? null;
};

const DEX: Record<string, string> = { "": "robinhood", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
const CHAIN_NAME: Record<string, string> = { "": "Robinhood", base: "Base", bsc: "BNB", arbitrum: "Arbitrum" };
const chainOf = (sym: string) => (sym.includes(":") ? sym.slice(0, sym.indexOf(":")) : "");
const ticker = (sym: string) => symbol(sym).replace(/ \(.*\)$/, "");
/** A bet for people: "Stella Jurina · Kryvoruchko vs Jurina (Match Winner)" = the pick · the match (market). */
const betName = (sym: string, labels?: Record<string, string>) => symbol(sym, labels).replace(/^bet: /, "");

/** A short dollar figure for a chat line: $1.2M, $48k, $950. */
const k = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const age = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`);

/** The numbers line every call carries: mc, liquidity, volume, age, holders. */
function stats(v: Verdict): string {
  const parts = [v.mcap ? `mc ${k(v.mcap)}` : "", `liq ${k(v.liq)}`, `vol ${k(v.vol24)}`, v.ageH != null ? `age ${age(v.ageH)}` : ""];
  if (v.holders) parts.push(`${v.holders.toLocaleString("en-US")} holders`, `top10 ${Math.round((v.top10 ?? 0) * 100)}%`);
  if (v.contractChecked) parts.push(v.tax ? `contract ✓ · tax ${Math.round(v.tax * 1000) / 10}%` : "contract ✓");
  return parts.filter(Boolean).join(" · ");
}

type Call = { key: string; sym: string; ca: string; chain: string; at: number; head: string; why?: string | null };

function callText(c: Call, v: Verdict): string {
  const lines = [`**$${ticker(c.sym)}** · ${CHAIN_NAME[c.chain] ?? c.chain} · ${c.head}`, stats(v)];
  if (c.why) lines.push(`> ${c.why.replace(/\s+/g, " ").slice(0, 160)}`);
  lines.push(`\`${c.ca}\``, `<https://dexscreener.com/${DEX[c.chain] ?? "robinhood"}/${c.ca}>`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- the loop

export function startAlpha(client: Client, channelId: string, opts: { flies: number; pollMs: number }): void {
  const seen = new Map<string, Set<string>>();             // source ("desk", "fly:849") -> keys already read
  const called = new Map<string, { at: number; msg?: Message }>();   // chain:ca -> its last call (sells reply to it)
  const watching = new Map<string, Found>();                // found tokens waiting to pass the filter
  const sentAt: number[] = [];                              // the last hour's messages (MAX_PER_HOUR)

  /** The keys of `items` not seen before in `source`; the first read of a source only remembers them. */
  function fresh<T>(source: string, items: T[], key: (x: T) => string): T[] {
    const before = seen.get(source);
    seen.set(source, new Set(items.map(key)));
    return before ? items.filter((x) => !before.has(key(x))) : [];
  }

  let channel: SendableChannels | null = null;
  async function send(content: string, replyTo?: Message): Promise<Message | null> {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0]! > 3600_000) sentAt.shift();
    if (sentAt.length >= MAX_PER_HOUR) return null;
    if (!channel) {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch?.isSendable()) {
        console.error(`alpha: can't post in ${channelId} (missing, or the bot has no access to the private channel)`);
        return null;
      }
      channel = ch as SendableChannels;
    }
    sentAt.push(now);
    const payload = { content, allowedMentions: { parse: [] } };
    const msg = replyTo
      ? await replyTo.reply({ ...payload, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null)
      : await channel.send(payload).catch((err) => (console.error("alpha: post failed", (err as Error).message), null));
    return msg;
  }

  /** Post `c` as a call if its token passes the filter and wasn't called in CALL_AGAIN_MS. True when it was decided
   *  (posted, or failed the filter for good); false when the filter couldn't tell yet. */
  async function call(c: Call): Promise<boolean> {
    const last = called.get(c.key);
    if (last && Date.now() - last.at < CALL_AGAIN_MS) return true;
    const v = await screen(c.ca, c.chain);
    if (!v.ok) {
      console.log(`alpha: skipped $${ticker(c.sym)} (${c.head}): ${v.why.join("; ")}`);
      return !v.failed;
    }
    const msg = await send(callText(c, v));
    if (msg) called.set(c.key, { at: Date.now(), msg });
    return true;
  }

  /** An Azuro bet as a call (2026-10-16, the user: "it should suggest alpha azuro bets too"): no scam filter (no token),
   *  the same once-per-CALL_AGAIN_MS and hourly cap; the result replies under it. */
  async function bet(key: string, text: string): Promise<void> {
    const last = called.get(key);
    if (last && Date.now() - last.at < CALL_AGAIN_MS) return;
    const msg = await send(text);
    if (msg) called.set(key, { at: Date.now(), msg });
  }

  /** A sell of a token we called: a reply under the call with the P&L. Tokens never called are left out. */
  async function update(key: string, text: string): Promise<void> {
    const last = called.get(key);
    if (last?.msg) await send(text, last.msg);
  }

  async function deskSource(): Promise<void> {
    const d = await desk();
    const trades = fresh("desk", d.recent_trades.filter((t) => t.book.startsWith("fly:")), (t) => `${t.at}|${t.book}|${t.symbol}|${t.side}|${t.usd}`);
    for (const t of trades.reverse()) {   // oldest first
      if (t.symbol.startsWith("azuro:") || SKIP_TAGS.has(t.book.split("/")[1] ?? "")) continue;
      const ca = await contractOf(t.symbol);
      if (!ca) continue;
      const chain = chainOf(t.symbol), key = `${chain}:${ca.toLowerCase()}`;
      if (t.side === "buy") await call({ key, sym: t.symbol, ca, chain, at: Date.parse(t.at), head: `🏦 Fly Desk bought ${usd(t.usd)}` });
      else {
        const held = d.positions[t.book]?.rows.find((r) => r.symbol === t.symbol);
        await update(key, `🔴 Fly Desk sold $${ticker(t.symbol)} (${usd(t.usd)})${held ? `, still holds ${usd(held.value_usd)} (${pct(held.pnl_pct)})` : ""}`);
      }
    }
    // bets: the desk's open Azuro bets (stake, odds, end) as calls; settled ones reply under their call
    const az = d.chains?.azuro;
    for (const b of fresh("desk:bets", az?.bets ?? [], (b) => b.symbol)) {
      const mult = b.odds ? ` at ${(1 / b.odds).toFixed(2)}x` : "";
      const ends = b.ends ? ` · ends <t:${Math.floor(b.ends)}:R>` : "";
      await bet(`bet:${b.symbol}`, `🎲 **${betName(b.symbol, d.labels)}**\nFly Desk bet ${usd(b.stake)}${mult}, pays ${usd(b.pays)}${ends}`);
    }
    for (const s of fresh("desk:settled", az?.settled ?? [], (s) => s.symbol)) {
      const text = s.refund ? "↩️ refunded" : s.payout > 0 ? `✅ won: ${usd(s.cost_usd)} → ${usd(s.usd)}` : `❌ lost ${usd(s.cost_usd)}`;
      await update(`bet:${s.symbol}`, text);
    }
    for (const l of fresh("desk:launch", d.launches?.items ?? [], (l) => l.token)) {
      await send(`🚀 **The flies launched ${l.name} ($${symbol(l.symbol)})**\n\`${l.token}\`\n<https://dexscreener.com/robinhood/${l.token}>`);
    }
    // FOMO: what's hot at the first read (a restart) counts as called, so a deploy doesn't repeat it
    const first = !seen.has("desk:fomo");
    seen.set("desk:fomo", new Set());
    for (const t of (d.alpha?.fomo?.tokens ?? []).filter(hot)) {
      if (first) { called.set(`:${t.token.toLowerCase()}`, { at: Date.now() }); continue; }
      await call({ key: `:${t.token.toLowerCase()}`, sym: t.symbol ?? "?", ca: t.token, chain: "", at: Date.now(),
        head: `🔥 top traders aping: ${t.buyers_1h ?? 0} wallet${t.buyers_1h === 1 ? "" : "s"}, ${k(t.buy_usd_1h ?? 0)} in 1h` });
    }
    // found tokens: watched until they pass (a pool an hour old rarely trades enough yet) or FOUND_WATCH_MS ends
    for (const f of fresh("desk:found", d.alpha?.found ?? [], (f) => f.token)) watching.set(f.token, f);
    for (const [token, f] of watching) {
      if (Date.now() - f.at * 1000 > FOUND_WATCH_MS) { watching.delete(token); continue; }
      const chain = chainOf(f.symbol), key = `${chain}:${token.toLowerCase()}`;
      if (!(await screen(token, chain)).ok) continue;
      watching.delete(token);
      await call({ key, sym: f.symbol, ca: token, chain, at: Date.now(), head: "🆕 new pool, passed the checks" });
    }
  }

  async function walletSource(): Promise<void> {
    const b = await board();
    const top = b.d7.filter((w) => w.active && w.profit_7d > 0).slice(0, opts.flies).flatMap((w) => w.flies);
    const labels = (await desk().catch(() => null))?.labels;
    for (const fly of top) {
      const log = await flyLog(fly).catch(() => null);
      if (!log) continue;
      const trades = log.rows.filter((r): r is LogTrade => r.type === "trade");
      for (const r of fresh(`fly:${fly}`, trades, (r) => `${r.first_at ?? r.at}|${r.symbol}|${r.side}|${r.status}`).reverse()) {
        if (r.symbol.startsWith("azuro:")) {
          if (r.status === "filled" && r.side === "buy") {
            const mult = r.price ? ` at ${(1 / r.price).toFixed(2)}x` : "";
            await bet(`bet:${r.symbol}`, `🎲 **${betName(r.symbol, labels)}**\nFly #${fly} bet${r.usd ? ` ${usd(r.usd)}` : ""}${mult}${r.why ? `\n> ${r.why.replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
          }
          continue;
        }
        if (r.tag === "poly" || SKIP_TAGS.has(r.tag)) continue;
        const blocked = r.status !== "filled" && r.side === "buy" ? blockedWhy(r) : null;
        if (r.status !== "filled" && !blocked) continue;
        const ca = await contractOf(r.symbol);
        if (!ca) continue;
        const chain = chainOf(r.symbol), key = `${chain}:${ca.toLowerCase()}`;
        if (blocked) {
          await call({ key, sym: r.symbol, ca, chain, at: r.at,
            head: `🪰 Fly #${fly} wanted in${r.usd ? ` (${usd(r.usd)})` : ""}${r.tag === "fomo" ? " (FOMO find)" : ""}, didn't fill: ${blocked}` });
        } else if (r.side === "buy") {
          await call({ key, sym: r.symbol, ca, chain, at: r.at, why: r.why,
            head: `🪰 Fly #${fly} bought${r.usd ? ` ${usd(r.usd)}` : ""}${r.tag === "fomo" ? " (FOMO find)" : ""}` });
        } else if (r.side === "sell" || r.side === "panic_sell") {
          await update(key, `${(r.pnl_pct ?? 0) >= 0 ? "🟢" : "🔴"} Fly #${fly} sold $${ticker(r.symbol)}${r.pnl_pct != null ? ` ${pct(r.pnl_pct)}` : ""}`);
        }
      }
    }
  }

  let busy = false;
  async function tick() {
    if (busy) return;   // a slow filter (RPC) can outlast ALPHA_POLL_MS
    busy = true;
    try {
      for (const [name, source] of [["desk", deskSource], ["wallets", walletSource]] as const) {
        await source().catch((err) => console.error(`alpha: ${name} read failed`, (err as Error).message));
      }
    } finally {
      busy = false;
    }
  }

  console.log(`alpha: posting to ${channelId}, top ${opts.flies} Fly Wallets + the Fly Desk, every ${opts.pollMs / 1000} s`);
  void tick();
  setInterval(() => void tick(), opts.pollMs);
}
