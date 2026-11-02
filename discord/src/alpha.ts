// The alpha feed (ALPHA_CHANNEL_ID, ALPHA_PARTNERS): token calls from what the flies do and find, written like
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
// 2026-11-02 (the user: "more good looking, not so plain"; "add it in a partner server"): every message is a card, and the
// feed goes to each target channel; a target with a role pings it on new calls, bets and launches, never on sell replies.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Client, type Message, type SendableChannels } from "discord.js";
import { board, contractOf, desk, flyLog, SITE, type FomoToken, type Found, type LogTrade } from "./data.ts";
import { MINT, pct, symbol, usd } from "./format.ts";
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

// ---------------------------------------------------------------- the cards

const LOGO = "https://www.flyaiworld.com/assets/logo.webp";   // (the bare domain answers with a redirect)
const COLOR = { buy: MINT, hot: 0xff8a3d, found: 0x4da3ff, wanted: 0x8a8f98, bet: 0xb48cff, launch: 0xffd166, up: 0x3ddc84, down: 0xff5c5c, back: 0x8a8f98 };
export type Post = { embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[]; ping: boolean };

const card = (color: number) => new EmbedBuilder().setColor(color).setTimestamp(new Date())
  .setFooter({ text: "fly.ai alpha · DYOR", iconURL: LOGO });
const links = (...items: [string, string][]) => [new ActionRowBuilder<ButtonBuilder>().addComponents(
  items.map(([label, url]) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url)))];
// each site's own name for a chain (2026-11-02). Defined: opened in a browser on all of these, $FLYAI on Robinhood included.
// Padre: every link stops at its sign-in page, so only the chains it advertises; a chain left out just has no button.
const DEFINED_CHAIN: Record<string, string> = { robinhood: "robinhood", solana: "sol", base: "base", bsc: "bsc", arbitrum: "arb", ethereum: "eth" };
const PADRE_CHAIN: Record<string, string> = { solana: "solana", base: "base", bsc: "bsc", ethereum: "ethereum" };

/** A token's buttons: its chart on DexScreener, Defined and Padre's terminal, for the chain (DexScreener's name for it) it's on. */
export function tokenLinks(chain: string, ca: string, ...more: [string, string][]) {
  const items: [string, string][] = [["📈 Dexscreener", `https://dexscreener.com/${chain}/${ca}`]];
  if (DEFINED_CHAIN[chain]) items.push(["📊 Defined", `https://www.defined.fi/token/${DEFINED_CHAIN[chain]}/${ca}`]);
  if (PADRE_CHAIN[chain]) items.push(["⚡ Terminal", `https://trade.padre.gg/trade/${PADRE_CHAIN[chain]}/${ca}`]);
  return links(...items, ...more);
}
const quote = (why?: string | null) => (why ? `\n> ${why.replace(/\s+/g, " ").slice(0, 160)}` : "");

type Call = { key: string; sym: string; ca: string; chain: string; at: number; head: string; color: number; why?: string | null };

/** A token call: who did what, the numbers that matter in tiles, the CA to copy, buttons to the chart and to fly.ai. */
export function callPost(c: Call, v: Verdict): Post {
  const chart = `https://dexscreener.com/${DEX[c.chain] ?? "robinhood"}/${c.ca}`;
  const tile = (name: string, value: string) => ({ name, value, inline: true });
  const fields = [tile("💰 Market cap", v.mcap ? k(v.mcap) : "—"), tile("💧 Liquidity", k(v.liq)), tile("📊 Volume 24h", k(v.vol24))];
  if (v.ageH != null) fields.push(tile("⏳ Age", age(v.ageH)));
  if (v.holders) fields.push(tile("👥 Holders", `${v.holders.toLocaleString("en-US")} · top 10 ${Math.round((v.top10 ?? 0) * 100)}%`));
  if (v.contractChecked) fields.push(tile("🛡️ Contract", v.tax ? `checked ✓ · tax ${Math.round(v.tax * 1000) / 10}%` : "checked ✓"));
  fields.push({ name: "Contract address", value: `\`${c.ca}\``, inline: false });
  const e = card(c.color).setTitle(`$${ticker(c.sym)} · ${CHAIN_NAME[c.chain] ?? c.chain}`).setURL(chart)
    .setDescription(`**${c.head}**${quote(c.why)}`).addFields(fields).setThumbnail(v.image ?? LOGO);
  return { embeds: [e], components: tokenLinks(DEX[c.chain] ?? "robinhood", c.ca, ["🪰 fly.ai", `${SITE}/traderflies`]), ping: true };
}

/** An Azuro bet: the pick, who placed it, stake / odds / payout. */
export function betPost(name: string, who: string, f: { stake?: number | null; odds?: number | null; pays?: number | null; ends?: number | null; why?: string | null }): Post {
  const e = card(COLOR.bet).setTitle(`🎲 ${name}`.slice(0, 256)).setDescription(`**${who}**${quote(f.why)}`);
  if (f.stake) e.addFields({ name: "Stake", value: usd(f.stake), inline: true });
  if (f.odds) e.addFields({ name: "Odds", value: `${(1 / f.odds).toFixed(2)}x`, inline: true });
  if (f.pays) e.addFields({ name: "Pays", value: usd(f.pays), inline: true });
  if (f.ends) e.addFields({ name: "Ends", value: `<t:${Math.floor(f.ends)}:R>`, inline: true });
  return { embeds: [e], ping: true };
}

/** A sell or a bet's result, as a small card under its call. No ping. */
export const updatePost = (text: string, color: number): Post => ({ embeds: [new EmbedBuilder().setColor(color).setDescription(text)], ping: false });

/** One of the desk's own launches. */
export function launchPost(name: string, sym: string, token: string): Post {
  const chart = `https://dexscreener.com/robinhood/${token}`;
  const e = card(COLOR.launch).setTitle(`🚀 The flies launched ${name} ($${sym})`.slice(0, 256)).setURL(chart)
    .addFields({ name: "Contract address", value: `\`${token}\`` }).setThumbnail(LOGO);
  return { embeds: [e], components: tokenLinks("robinhood", token), ping: true };
}

/** "channel" or "channel:role", comma separated (ALPHA_CHANNEL_ID, ALPHA_PARTNERS). */
export type Target = { channelId: string; role?: string };
export const parseTargets = (...lists: (string | undefined)[]): Target[] => lists.flatMap((l) => (l ?? "").split(","))
  .map((x) => x.trim()).filter(Boolean).map((x) => { const [channelId, role] = x.split(":"); return role ? { channelId: channelId!, role } : { channelId: channelId! }; });

/** What goes to one channel: the card, plus the role's ping on a new post in a channel that has one. Nothing else can ping. */
export function payloadFor(post: Post, t: Target, reply: boolean) {
  const role = post.ping && !reply ? t.role : undefined;
  return { embeds: post.embeds, components: post.components ?? [], ...(role ? { content: `<@&${role}>` } : {}),
    allowedMentions: { parse: [] as never[], roles: role ? [role] : [], repliedUser: false } };
}

// ---------------------------------------------------------------- asked for (!alpha, or tagging the bot)

const RECENT: Call[] = [];                 // what the feed called, newest first (lost on a restart: the sources below still answer)
const RECENT_KEEP = 20, ASK_WINDOW_MS = 24 * 3600_000, ASK_CHECKS = 10, ASK_BUDGET_MS = 40_000;
const ms = (at: number) => (at < 1e12 ? at * 1000 : at);

/** Up to `max` tokens worth a look right now, as call cards that ping nobody (2026-11-02, the user: "if you ask it for alpha,
 *  suggestions, tokens it can send some"): what the feed called, then top traders' tokens, the desk's and the top wallets' buys of
 *  the last day, then new pools. All of them through the same scam filter as the feed; a source that fails is skipped. */
export async function alphaNow(max = 3, flies = 5): Promise<Post[]> {
  const out: Call[] = [...RECENT];
  const d = await desk().catch(() => null);
  const since = Date.now() - ASK_WINDOW_MS;
  for (const t of (d?.alpha?.fomo?.tokens ?? []).filter((t) => hot(t) || (t.buyers_6h ?? 0) >= FOMO_MIN_BUYERS)) {
    out.push({ key: `:${t.token.toLowerCase()}`, sym: t.symbol ?? "?", ca: t.token, chain: "", at: Date.now(), color: COLOR.hot,
      head: hot(t) ? `🔥 top traders buying: ${t.buyers_1h ?? 0} wallet${t.buyers_1h === 1 ? "" : "s"}, ${k(t.buy_usd_1h ?? 0)} in 1h`
        : `🔥 top traders buying: ${t.buyers_6h ?? 0} wallets, ${k(t.buy_usd_6h ?? 0)} in 6h` });
  }
  const bought: { sym: string; head: string; why?: string | null; at: number }[] = [];
  for (const t of d?.recent_trades ?? []) {
    if (t.side !== "buy" || !t.book.startsWith("fly:") || t.symbol.startsWith("azuro:") || SKIP_TAGS.has(t.book.split("/")[1] ?? "")) continue;
    if (Date.parse(t.at) >= since) bought.push({ sym: t.symbol, head: `🏦 Fly Desk bought ${usd(t.usd)}`, at: Date.parse(t.at) });
  }
  const top = (await board().catch(() => null))?.d7.filter((w) => w.active && w.profit_7d > 0).slice(0, flies).flatMap((w) => w.flies) ?? [];
  for (const fly of top) {
    for (const r of (await flyLog(fly).catch(() => null))?.rows ?? []) {
      if (r.type !== "trade" || r.side !== "buy" || r.status !== "filled" || ms(r.at) < since) continue;
      if (r.symbol.startsWith("azuro:") || r.tag === "poly" || SKIP_TAGS.has(r.tag)) continue;
      bought.push({ sym: r.symbol, head: `🪰 Fly #${fly} bought${r.usd ? ` ${usd(r.usd)}` : ""}`, why: r.why, at: ms(r.at) });
    }
  }
  for (const b of bought.sort((x, y) => y.at - x.at)) {
    const ca = await contractOf(b.sym).catch(() => null);
    const chain = chainOf(b.sym);
    if (ca) out.push({ key: `${chain}:${ca.toLowerCase()}`, sym: b.sym, ca, chain, at: b.at, head: b.head, why: b.why ?? null, color: COLOR.buy });
  }
  for (const f of [...(d?.alpha?.found ?? [])].sort((x, y) => y.at - x.at)) {
    const chain = chainOf(f.symbol);
    out.push({ key: `${chain}:${f.token.toLowerCase()}`, sym: f.symbol, ca: f.token, chain, at: f.at * 1000, head: "🆕 new pool, passed the checks", color: COLOR.found });
  }
  const seen = new Set<string>(), posts: Post[] = [], end = Date.now() + ASK_BUDGET_MS;
  let checks = 0;
  for (const c of out) {
    if (seen.has(c.key) || /^FLYAI\b/.test(ticker(c.sym))) continue;   // ($FLYAI has its own answers)
    seen.add(c.key);
    if (posts.length >= max || checks >= ASK_CHECKS || Date.now() > end) break;
    checks++;
    const v = await screen(c.ca, c.chain).catch(() => null);
    if (v?.ok) posts.push({ ...callPost(c, v), ping: false });
  }
  return posts;
}

// ---------------------------------------------------------------- the loop

type Sent = Map<string, Message>;   // channel id -> the message posted there

export function startAlpha(client: Client, targets: Target[], opts: { flies: number; pollMs: number }): void {
  const seen = new Map<string, Set<string>>();             // source ("desk", "fly:849") -> keys already read
  const called = new Map<string, { at: number; msgs?: Sent }>();   // chain:ca -> its last call in each channel (sells reply to it)
  const watching = new Map<string, Found>();                // found tokens waiting to pass the filter
  const sentAt: number[] = [];                              // the last hour's messages (MAX_PER_HOUR)

  /** The keys of `items` not seen before in `source`; the first read of a source only remembers them. */
  function fresh<T>(source: string, items: T[], key: (x: T) => string): T[] {
    const before = seen.get(source);
    seen.set(source, new Set(items.map(key)));
    return before ? items.filter((x) => !before.has(key(x))) : [];
  }

  const channels = new Map<string, SendableChannels>();
  async function channelOf(id: string): Promise<SendableChannels | null> {
    const have = channels.get(id);
    if (have) return have;
    const ch = await client.channels.fetch(id).catch(() => null);
    if (!ch?.isSendable()) {
      console.error(`alpha: can't post in ${id} (missing, or the bot has no access to the channel)`);
      return null;
    }
    channels.set(id, ch as SendableChannels);
    return ch as SendableChannels;
  }

  /** The post in every target channel, one channel's failure leaving the others alone; the hourly cap counts it once.
   *  `replyTo`: a reply under each channel's call, and nothing in a channel that didn't get the call. */
  async function send(post: Post, replyTo?: Sent): Promise<Sent | null> {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0]! > 3600_000) sentAt.shift();
    if (sentAt.length >= MAX_PER_HOUR) return null;
    sentAt.push(now);
    const sent: Sent = new Map();
    for (const t of targets) {
      const under = replyTo?.get(t.channelId);
      if (replyTo && !under) continue;
      const payload = payloadFor(post, t, !!replyTo);
      try {
        const ch = under ? null : await channelOf(t.channelId);
        const msg: Message | null = under ? await under.reply(payload) : ch ? await ch.send(payload) : null;
        if (msg) sent.set(t.channelId, msg);
      } catch (err) {
        console.error(`alpha: post failed in ${t.channelId}`, (err as Error).message);
      }
    }
    return sent;
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
    const msgs = await send(callPost(c, v));
    if (msgs) {
      called.set(c.key, { at: Date.now(), msgs });
      RECENT.unshift(c);
      RECENT.length = Math.min(RECENT.length, RECENT_KEEP);
    }
    return true;
  }

  /** An Azuro bet as a call (2026-10-16, the user: "it should suggest alpha azuro bets too"): no scam filter (no token),
   *  the same once-per-CALL_AGAIN_MS and hourly cap; the result replies under it. */
  async function bet(key: string, post: Post): Promise<void> {
    const last = called.get(key);
    if (last && Date.now() - last.at < CALL_AGAIN_MS) return;
    const msgs = await send(post);
    if (msgs) called.set(key, { at: Date.now(), msgs });
  }

  /** A sell of a token we called: a reply under the call with the P&L. Tokens never called are left out. */
  async function update(key: string, text: string, color: number): Promise<void> {
    const last = called.get(key);
    if (last?.msgs) await send(updatePost(text, color), last.msgs);
  }

  async function deskSource(): Promise<void> {
    const d = await desk();
    const trades = fresh("desk", d.recent_trades.filter((t) => t.book.startsWith("fly:")), (t) => `${t.at}|${t.book}|${t.symbol}|${t.side}|${t.usd}`);
    for (const t of trades.reverse()) {   // oldest first
      if (t.symbol.startsWith("azuro:") || SKIP_TAGS.has(t.book.split("/")[1] ?? "")) continue;
      const ca = await contractOf(t.symbol);
      if (!ca) continue;
      const chain = chainOf(t.symbol), key = `${chain}:${ca.toLowerCase()}`;
      if (t.side === "buy") await call({ key, sym: t.symbol, ca, chain, at: Date.parse(t.at), head: `🏦 Fly Desk bought ${usd(t.usd)}`, color: COLOR.buy });
      else {
        const held = d.positions[t.book]?.rows.find((r) => r.symbol === t.symbol);
        await update(key, `🔴 Fly Desk sold $${ticker(t.symbol)} (${usd(t.usd)})${held ? `, still holds ${usd(held.value_usd)} (${pct(held.pnl_pct)})` : ""}`, COLOR.down);
      }
    }
    // bets: the desk's open Azuro bets (stake, odds, end) as calls; settled ones reply under their call
    const az = d.chains?.azuro;
    for (const b of fresh("desk:bets", az?.bets ?? [], (b) => b.symbol)) {
      await bet(`bet:${b.symbol}`, betPost(betName(b.symbol, d.labels), "🏦 Fly Desk placed a bet", { stake: b.stake, odds: b.odds, pays: b.pays, ends: b.ends }));
    }
    for (const s of fresh("desk:settled", az?.settled ?? [], (s) => s.symbol)) {
      const text = s.refund ? "↩️ refunded" : s.payout > 0 ? `✅ won: ${usd(s.cost_usd)} → ${usd(s.usd)}` : `❌ lost ${usd(s.cost_usd)}`;
      await update(`bet:${s.symbol}`, text, s.refund ? COLOR.back : s.payout > 0 ? COLOR.up : COLOR.down);
    }
    for (const l of fresh("desk:launch", d.launches?.items ?? [], (l) => l.token)) {
      await send(launchPost(l.name, symbol(l.symbol), l.token));
    }
    // FOMO: what's hot at the first read (a restart) counts as called, so a deploy doesn't repeat it
    const first = !seen.has("desk:fomo");
    seen.set("desk:fomo", new Set());
    for (const t of (d.alpha?.fomo?.tokens ?? []).filter(hot)) {
      if (first) { called.set(`:${t.token.toLowerCase()}`, { at: Date.now() }); continue; }
      await call({ key: `:${t.token.toLowerCase()}`, sym: t.symbol ?? "?", ca: t.token, chain: "", at: Date.now(),
        head: `🔥 top traders aping: ${t.buyers_1h ?? 0} wallet${t.buyers_1h === 1 ? "" : "s"}, ${k(t.buy_usd_1h ?? 0)} in 1h`, color: COLOR.hot });
    }
    // found tokens: watched until they pass (a pool an hour old rarely trades enough yet) or FOUND_WATCH_MS ends
    for (const f of fresh("desk:found", d.alpha?.found ?? [], (f) => f.token)) watching.set(f.token, f);
    for (const [token, f] of watching) {
      if (Date.now() - f.at * 1000 > FOUND_WATCH_MS) { watching.delete(token); continue; }
      const chain = chainOf(f.symbol), key = `${chain}:${token.toLowerCase()}`;
      if (!(await screen(token, chain)).ok) continue;
      watching.delete(token);
      await call({ key, sym: f.symbol, ca: token, chain, at: Date.now(), head: "🆕 new pool, passed the checks", color: COLOR.found });
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
            await bet(`bet:${r.symbol}`, betPost(betName(r.symbol, labels), `🪰 Fly #${fly} placed a bet`, { stake: r.usd ?? undefined, odds: r.price ?? undefined, why: r.why }));
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
            head: `🪰 Fly #${fly} wanted in${r.usd ? ` (${usd(r.usd)})` : ""}${r.tag === "fomo" ? " (FOMO find)" : ""}, didn't fill: ${blocked}`, color: COLOR.wanted });
        } else if (r.side === "buy") {
          await call({ key, sym: r.symbol, ca, chain, at: r.at, why: r.why,
            head: `🪰 Fly #${fly} bought${r.usd ? ` ${usd(r.usd)}` : ""}${r.tag === "fomo" ? " (FOMO find)" : ""}`, color: COLOR.buy });
        } else if (r.side === "sell" || r.side === "panic_sell") {
          await update(key, `${(r.pnl_pct ?? 0) >= 0 ? "🟢" : "🔴"} Fly #${fly} sold $${ticker(r.symbol)}${r.pnl_pct != null ? ` ${pct(r.pnl_pct)}` : ""}`, (r.pnl_pct ?? 0) >= 0 ? COLOR.up : COLOR.down);
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

  console.log(`alpha: posting to ${targets.map((t) => t.channelId + (t.role ? " (pings)" : "")).join(", ")}, top ${opts.flies} Fly Wallets + the Fly Desk, every ${opts.pollMs / 1000} s`);
  void tick();
  setInterval(() => void tick(), opts.pollMs);
}
