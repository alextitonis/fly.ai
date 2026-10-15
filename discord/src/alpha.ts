// The alpha feed (a private test channel, ALPHA_CHANNEL_ID): what the flies do with real money, as it happens.
//   Let-it-fly wallets  the top ALPHA_FLIES Fly Wallets of the week (mine leaderboard), from each fly's public log:
//                       fills with the reason, CA and tx, bets, tokens found through FOMO's top traders, failed swaps,
//                       and buys the fly passed on (with why) minus the refusals that repeat all day.
//   Fly Desk            the desk's own trades and launches (its public snapshot: symbol, side, size).
// Every ALPHA_POLL_MS the bot reads them and posts what it hasn't seen. The first read of a source only remembers
// what's there, so a restart (or a fly joining the top) never floods the channel with history.
import type { Client, EmbedBuilder, SendableChannels } from "discord.js";
import { SITE, board, contractOf, desk, flyLog, type Desk, type FomoToken, type Found, type Launch, type LogTrade, type Trade } from "./data.ts";
import { embed, pct, symbol, usd } from "./format.ts";

const GREEN = 0x3ddc84, RED = 0xff5c5c, AMBER = 0xffb020, GREY = 0x8a8f98;
const FOOTER = "not financial advice, it's a fly";

// refusals that repeat every bar and say nothing about the market (counted on the top wallets' logs 2026-10-15)
const NOISE = [/polymarket opens/i, /only sold above/i, /market is closed/i, /already holding/i, /\bdust\b/i,
  /^funding\b/i, /\bunder \$?[\d.]+ for an? \w+ buy/i, /the wallet holds/i];

const EXPLORER: Record<string, string> = {
  "": "https://robinhoodchain.blockscout.com/tx/",
  base: "https://basescan.org/tx/",
  bsc: "https://bscscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
};
const DEX: Record<string, string> = { "": "robinhood", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
const chainOf = (sym: string) => (sym.includes(":") ? sym.slice(0, sym.indexOf(":")) : "");

type Post = { at: number; embed: EmbedBuilder };

// ---------------------------------------------------------------- Let-it-fly wallets

/** What a log line is worth posting as, or null to skip it. */
export function kindOf(r: LogTrade): "buy" | "sell" | "bet" | "failed" | "passed" | null {
  const why = r.why ?? "";
  if (r.symbol.startsWith("azuro:") || r.tag === "poly" || r.tag === "azuro") return r.status === "filled" ? "bet" : null;
  if (r.status === "filled") return r.side === "buy" ? "buy" : r.side === "sell" || r.side === "panic_sell" ? "sell" : null;
  if (/swap failed|relayerror|no routes/i.test(why) || r.status === "failed") return "failed";
  // the liquidity floor turns small tokens away all day (68 of 86 passes in 80 h): only worth a post on a FOMO find
  if (/^entry: pool .* is under/i.test(why) && r.tag !== "fomo") return null;
  if (r.status === "refused" && r.side === "buy" && !NOISE.some((n) => n.test(why))) return "passed";
  return null;
}

export async function walletEmbed(fly: number, r: LogTrade, kind: NonNullable<ReturnType<typeof kindOf>>, labels?: Record<string, string>): Promise<EmbedBuilder> {
  const name = symbol(r.symbol, labels);
  const fomo = r.tag === "fomo" ? " 🔥 FOMO find" : "";
  const title = {
    buy: [`🟢 Fly #${fly} bought ${name}${fomo}`, GREEN],
    sell: [`🔴 Fly #${fly} sold ${name}`, RED],
    bet: [`🎲 Fly #${fly} placed a bet: ${name.replace(/^bet: /, "")}`, GREEN],
    failed: [`⚠️ Fly #${fly} tried to ${r.side.replace("_", " ")} ${name}, it failed`, AMBER],
    passed: [`👀 Fly #${fly} looked at ${name}${fomo}, didn't buy`, GREY],
  }[kind] as [string, number];
  const e = embed().setColor(title[1]).setTitle(title[0]).setURL(`${SITE}/traderflies/fly?id=${fly}`);
  if (r.usd) e.addFields({ name: "Size", value: usd(r.usd), inline: true });
  if (r.price) e.addFields({ name: "Price", value: usd(r.price), inline: true });
  if (r.pnl_pct != null && kind === "sell") e.addFields({ name: "P&L", value: pct(r.pnl_pct), inline: true });
  if (r.why) e.addFields({ name: "Why", value: r.why.slice(0, 1000) });
  if (kind !== "bet") {
    const ca = await contractOf(r.symbol);
    const chain = chainOf(r.symbol);
    const links = [
      ca ? `[Chart](https://dexscreener.com/${DEX[chain] ?? "robinhood"}/${ca})` : "",
      r.tx ? `[Tx](${EXPLORER[chain] ?? EXPLORER[""]}${r.tx.split(",").pop()})` : "",
    ].filter(Boolean);
    if (ca) e.addFields({ name: "CA", value: `\`${ca}\`` });
    if (links.length) e.addFields({ name: "Links", value: links.join(" · ") });
  }
  return e.setFooter({ text: `Fly #${fly} · Let it fly · ${FOOTER}` }).setTimestamp(new Date(r.at));
}

// ---------------------------------------------------------------- Fly Desk

function deskTradeEmbed(t: Trade, d: Desk): EmbedBuilder {
  const held = d.positions[t.book]?.rows.find((r) => r.symbol === t.symbol);
  const buy = t.side === "buy";
  const e = embed()
    .setColor(buy ? GREEN : RED)
    .setTitle(`${buy ? "🟢 The Fly Desk bought" : "🔴 The Fly Desk sold"} ${symbol(t.symbol, d.labels)}`)
    .setURL(`${SITE}/desk`)
    .addFields({ name: "Size", value: usd(t.usd), inline: true });
  if (held?.price) e.addFields({ name: "Price", value: usd(held.price), inline: true });
  e.addFields({ name: "Holding now", value: held ? `${usd(held.value_usd)} (${pct(held.pnl_pct)})` : buy ? "-" : "closed", inline: true });
  return e.setFooter({ text: `Fly Desk · ${FOOTER}` }).setTimestamp(new Date(t.at));
}

function launchEmbed(l: Launch): EmbedBuilder {
  return embed()
    .setTitle(`🚀 The flies launched ${l.name} ($${symbol(l.symbol)})`)
    .setURL(`https://dexscreener.com/robinhood/${l.token}`)
    .addFields({ name: "CA", value: `\`${l.token}\`` })
    .setFooter({ text: `Fly Desk · ${FOOTER}` })
    .setTimestamp(new Date(l.at * 1000));
}

// ---------------------------------------------------------------- what the desk finds (its public "alpha" section)

// a FOMO token is posted when top traders pile in: 2+ of them buying in the last hour, or $1k+ (the desk's own
// FOMO_VIEW_USD, which puts a token in the brain's view); the same token again only after FOMO_REPOST_MS
const FOMO_MIN_BUYERS = 2, FOMO_MIN_USD = 1_000, FOMO_REPOST_MS = 6 * 3600_000;
const hot = (t: FomoToken) => (t.buyers_1h ?? 0) >= FOMO_MIN_BUYERS || (t.buy_usd_1h ?? 0) >= FOMO_MIN_USD;

function fomoEmbed(t: FomoToken): EmbedBuilder {
  const name = symbol(t.symbol ?? "?");
  const e = embed()
    .setColor(0xff7a1a)
    .setTitle(`🔥 Top traders are buying ${name}`)
    .setURL(`https://dexscreener.com/robinhood/${t.token}`)
    .setDescription("FOMO's top traders are piling in. The flies put it in view, they don't copy it blindly.")
    .addFields(
      { name: "Last hour", value: `${t.buyers_1h ?? 0} buying (${usd(t.buy_usd_1h ?? 0)}) · ${t.sellers_1h ?? 0} selling (${usd(t.sell_usd_1h ?? 0)})` },
      { name: "Last 6 hours", value: `${t.buyers_6h ?? 0} buying (${usd(t.buy_usd_6h ?? 0)}) · ${t.sellers_6h ?? 0} selling (${usd(t.sell_usd_6h ?? 0)})` },
      { name: "Rug checks", value: t.screened ? "✅ passed (GoPlus, holders, whales, creator share)" : "not screened yet", inline: true },
      { name: "CA", value: `\`${t.token}\`` },
    );
  return e.setFooter({ text: `FOMO via the Fly Desk · ${FOOTER}` }).setTimestamp(new Date());
}

function foundEmbed(f: Found): EmbedBuilder {
  const name = symbol(f.symbol);
  const chain = chainOf(f.symbol);
  const e = embed()
    .setColor(0x5ef2cc)
    .setTitle(`🆕 The flies spotted a new token: ${name}`)
    .setURL(`https://dexscreener.com/${DEX[chain] ?? "robinhood"}/${f.token}`)
    .setDescription("A fresh pool that passed the desk's filters. It's in the flies' view now.");
  if (f.liquidity) e.addFields({ name: "Liquidity", value: usd(f.liquidity), inline: true });
  if (f.source) e.addFields({ name: "Found via", value: f.source, inline: true });
  e.addFields({ name: "CA", value: `\`${f.token}\`` });
  return e.setFooter({ text: `Fly Desk · ${FOOTER}` }).setTimestamp(new Date(f.at * 1000));
}

// ---------------------------------------------------------------- the loop

export function startAlpha(client: Client, channelId: string, opts: { flies: number; pollMs: number }): void {
  const seen = new Map<string, Set<string>>();   // source ("desk", "fly:849") -> keys already posted or skipped
  const fomoPosted = new Map<string, number>();  // FOMO token -> when it was last posted

  /** The keys of `items` not seen before in `source`; the first read of a source only remembers them. */
  function fresh<T>(source: string, items: T[], key: (x: T) => string): T[] {
    const before = seen.get(source);
    seen.set(source, new Set(items.map(key)));
    return before ? items.filter((x) => !before.has(key(x))) : [];
  }

  async function deskPosts(): Promise<Post[]> {
    const d = await desk();
    const trades = fresh("desk", d.recent_trades.filter((t) => t.book.startsWith("fly:")), (t) => `${t.at}|${t.book}|${t.symbol}|${t.side}|${t.usd}`);
    const launches = fresh("desk:launch", d.launches?.items ?? [], (l) => l.token);
    const found = fresh("desk:found", d.alpha?.found ?? [], (f) => f.token);
    // FOMO is live, not history: what's hot right now posts on the first read too, then each token once per 6 h
    const now = Date.now();
    const fomo = (d.alpha?.fomo?.tokens ?? []).filter((t) => hot(t) && now - (fomoPosted.get(t.token) ?? 0) > FOMO_REPOST_MS);
    for (const t of fomo) fomoPosted.set(t.token, now);
    return [
      ...trades.map((t) => ({ at: Date.parse(t.at), embed: deskTradeEmbed(t, d) })),
      ...launches.map((l) => ({ at: l.at * 1000, embed: launchEmbed(l) })),
      ...found.map((f) => ({ at: f.at * 1000, embed: foundEmbed(f) })),
      ...fomo.map((t) => ({ at: now, embed: fomoEmbed(t) })),
    ];
  }

  async function walletPosts(): Promise<Post[]> {
    const b = await board();
    const top = b.d7.filter((w) => w.active && w.profit_7d > 0).slice(0, opts.flies).flatMap((w) => w.flies);
    const labels = (await desk().catch(() => null))?.labels;
    const posts: Post[] = [];
    for (const fly of top) {
      const log = await flyLog(fly).catch(() => null);
      if (!log) continue;
      const trades = log.rows.filter((r): r is LogTrade => r.type === "trade");
      for (const r of fresh(`fly:${fly}`, trades, (r) => `${r.first_at ?? r.at}|${r.symbol}|${r.side}|${r.status}`)) {
        const kind = kindOf(r);
        if (kind) posts.push({ at: r.at, embed: await walletEmbed(fly, r, kind, labels) });
      }
    }
    return posts;
  }

  async function tick() {
    const posts: Post[] = [];
    for (const [name, source] of [["desk", deskPosts], ["wallets", walletPosts]] as const) {
      try {
        posts.push(...(await source()));
      } catch (err) {
        console.error(`alpha: ${name} read failed`, (err as Error).message);
      }
    }
    if (!posts.length) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) {
      console.error(`alpha: can't post in ${channelId} (missing, or the bot has no access to the private channel)`);
      return;
    }
    posts.sort((a, b) => a.at - b.at);
    for (let i = 0; i < posts.length; i += 10) {   // a message carries at most 10 embeds
      await (channel as SendableChannels).send({ embeds: posts.slice(i, i + 10).map((p) => p.embed) }).catch((err) => {
        console.error("alpha: post failed", (err as Error).message);
      });
    }
  }

  console.log(`alpha: posting to ${channelId}, top ${opts.flies} Fly Wallets + the Fly Desk, every ${opts.pollMs / 1000} s`);
  void tick();
  setInterval(() => void tick(), opts.pollMs);
}
