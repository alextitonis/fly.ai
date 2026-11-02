import { escapeMarkdown, type Message } from "discord.js";
import { embed, usd } from "../format.ts";
import { bundle, exactTarget, gather, grade, type Facts, type Grade, type Target } from "../research.ts";
import { tokenLinks } from "../alpha.ts";
import { canRead, chatter, readsBackAt, readsReady, readsSpent, type Chatter } from "../chatter.ts";
import { before, log, type Row } from "../track.ts";
import { scan, siteRead, type SiteRead } from "./scan.ts";
import type { Command } from "./index.ts";

// !research <name | $TICKER | 0x… | @x | site>, or tagging the bot with "can you check this project X" (src/intent.ts).
// Public facts and fixed rules (src/research.ts), websites through Fly Scan. Once every 30 s per person: each one reads the chain.
const COOLDOWN_MS = 30_000;
const lastAsk = new Map<string, number>();

const COLORS = { red: 0xff5c5c, careful: 0xffc857, clear: 0x3ddc84, unknown: 0x8a8f98 };
const WORDS = { red: "🔴 Red flags", careful: "🟡 Be careful", clear: "🟢 Nothing obvious wrong", unknown: "⚪ Couldn't find it" };
const big = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const list = (xs: string[]) => xs.map((x) => `• ${escapeMarkdown(x)}`).join("\n").slice(0, 1024);

const when = (days: number) => (days < 1 ? "today" : days < 60 ? `${Math.round(days)} days ago` : `${Math.round(days / 30)} months ago`);
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

/** The pools' lines, biggest first, for the card. */
function poolLines(f: Facts): string {
  return [...(f.deep?.pools ?? [])].sort((a, b) => b.liq - a.liq).slice(0, 3).map((p) =>
    `**${escapeMarkdown(p.name)}**: ${big(p.liq)}, ${big(p.vol24)} in 24h, ${p.buys} buys / ${p.sells} sells${p.ageDays != null ? `, ${when(p.ageDays).replace(" ago", " old").replace("today", "new today")}` : ""}`).join("\n");
}

/** Its past, measured: price, creator, promotion, site, code, the last time we looked. */
export function pastLines(f: Facts, last?: Row | null, now = Date.now()): string[] {
  const d = f.deep, out: string[] = [];
  if (d?.history) out.push(`Price ${pct(d.history.fromPeak)} from its ${d.history.days}-day high${d.history.peakDaysAgo >= 1 ? ` (${when(d.history.peakDaysAgo)})` : ""}${d.history.change30d != null ? `, ${pct(d.history.change30d)} in 30 days` : ""}`);
  if (d?.coin?.athChange != null && d.coin.athDate) out.push(`${Math.round(d.coin.athChange)}% from its all-time high ${when((now - Date.parse(d.coin.athDate)) / 86_400_000)} (CoinGecko)`);
  if (d?.info?.dev) out.push(`Developer \`${d.info.dev.slice(0, 10)}…\` holds ${d.info.devPct ?? "?"}%`);
  const l = d?.launches;
  if (l?.count) {
    const names = l.others.slice(0, 3).map((o) => `$${escapeMarkdown(o.symbol)} (${big(o.liq)})`).join(", ");
    out.push(`Its creator launched ${l.count} other token${l.count > 1 ? "s" : ""}, ${l.dead} now under $1k${names ? `: ${names}` : ""}`);
  } else if (l) out.push("No other launches by its creator on Pons");
  if (d?.promo?.profile || d?.promo?.boosts) out.push(`Paid DexScreener promotion: ${[d.promo.profile ? "profile" : "", d.promo.boosts ? `${d.promo.boosts} boosts` : ""].filter(Boolean).join(", ")}`);
  if (d?.domainDays != null) out.push(`Website domain registered ${when(d.domainDays)}`);
  if (d?.code) out.push(`Code: ${d.code.url}, last pushed ${d.code.pushedDays != null ? when(d.code.pushedDays) : "?"}`);
  if (last) out.push(`We checked this ${when((now - last.at) / 86_400_000)}: it was ${WORDS[last.level as keyof typeof WORDS] ?? last.level}${last.price && f.token?.price ? `, price ${pct(Number(f.token.price) / last.price - 1)} since` : ""}`);
  return out;
}

/** What our own desk and wallets did with it. Nothing to say: nothing shown. */
export function oursLine(f: Facts): string | null {
  const o = f.deep?.ours;
  if (!o) return null;
  const bits: string[] = [];
  if (o.deskHolds) bits.push("The Fly Desk holds it");
  if (o.deskBuys || o.deskSells) bits.push(`Desk recently: ${o.deskBuys} buys, ${o.deskSells} sells`);
  if (o.walletBuys || o.walletSells) bits.push(`Top Fly Wallets: ${o.walletBuys} buys, ${o.walletSells} sells${o.walletPnl != null ? `, closed trades average ${o.walletPnl >= 0 ? "+" : ""}${o.walletPnl.toFixed(1)}%` : ""}`);
  if (o.refused) bits.push(`A top wallet passed on it: ${o.refused}`);
  if (o.topTraders) bits.push(`Top traders in 6h: ${o.topTraders.buyers} bought ${big(o.topTraders.buyUsd)}, ${o.topTraders.sellers} sold ${big(o.topTraders.sellUsd)}`);
  if (o.found) bits.push("Our new-pool watcher picked it up");
  return bits.length ? bits.map((b) => `• ${escapeMarkdown(b)}`).join("\n").slice(0, 1024) : null;
}

export function card(f: Facts, g: Grade, last?: Row | null, site?: SiteRead | null) {
  const name = f.nft ? `${f.nft.name} (NFT)` : f.token ? `${f.token.name} ($${f.token.symbol})` : f.x ? `${f.x.name} (@${f.x.handle})` : f.query;
  const e = embed().setColor(COLORS[g.level]).setTitle(`🔎 ${escapeMarkdown(name)}`.slice(0, 256)).setDescription(`**${WORDS[g.level]}**`);
  if (f.token) e.setURL(f.token.url);
  if (f.nft) {
    const n = f.nft, tile = (name: string, value: string) => e.addFields({ name, value, inline: true });
    e.setURL(n.url);
    if (n.image) e.setThumbnail(n.image);
    tile("Chain", n.chain);
    if (n.supply != null) tile("Items", n.supply.toLocaleString("en-US"));
    if (n.owners != null) tile("Owners", n.owners.toLocaleString("en-US"));
    if (n.floor != null) tile("Floor", `${n.floor} ${n.symbol}`);
    if (n.volume != null) tile("Volume (all time)", `${n.volume.toFixed(2)} ${n.symbol}`);
    if (n.sales30 != null) tile("Sales 7d / 30d", `${n.sales7 ?? "?"} / ${n.sales30}`);
    if (n.created) tile("Created", new Date(n.created).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }));
    e.addFields({ name: "Clean or bundled?", value: bundle(f)!.line });
    if (n.contract) e.addFields({ name: "Contract", value: `\`${n.contract}\`` });
    if (n.website) e.addFields({ name: "Website it lists (unverified)", value: n.website });
  }
  if (f.token?.image) e.setThumbnail(f.token.image);
  if (f.token) {
    const v = f.verdict;
    const tile = (n: string, value: string) => e.addFields({ name: n, value, inline: true });
    tile("Chain", f.token.chain);
    if (f.token.price) tile("Price", usd(Number(f.token.price)));
    if (v?.mcap) tile("Market cap", big(v.mcap));
    if (v) { tile("Liquidity", big(v.liq)); tile("Volume 24h", big(v.vol24)); }
    const holders = v?.holders ?? f.deep?.info?.holders;
    if (holders) tile("Holders", holders.toLocaleString("en-US"));
    if (f.deep?.flow) tile("Recent trades", `${f.deep.flow.trades}, ${f.deep.flow.wallets} wallets`);
    if (f.deep?.info?.score != null) tile("GeckoTerminal score", `${Math.round(f.deep.info.score)}/100`);
    e.addFields({ name: "Clean or bundled?", value: bundle(f)!.line }, { name: "Contract", value: `\`${f.token.ca}\`` });
    if (poolLines(f)) e.addFields({ name: "🏊 Pools", value: poolLines(f).slice(0, 1024) });
  }
  const past = pastLines(f, last);
  if (past.length) e.addFields({ name: "🕰️ Past activity", value: past.map((x) => `• ${x}`).join("\n").slice(0, 1024) });
  const ours = oursLine(f);
  if (ours) e.addFields({ name: "🪰 Our flies", value: ours });
  if (site) e.addFields({ name: "🌐 Its website (Fly Scan)", value: `${site.verdict === "danger" ? "🚨 Flagged. " : ""}${escapeMarkdown(site.summary ?? site.title ?? "Read, nothing to note.").slice(0, 400)}\n[Full report](${site.link})`.slice(0, 1024) });
  if (f.x) {
    const joined = f.x.joined ? new Date(f.x.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "unknown";
    const bio = f.x.bio ? `\n${escapeMarkdown(f.x.bio.replace(/\s+/g, " ").slice(0, 160))}` : "";
    e.addFields({ name: `X: @${f.x.handle}`, value: `${f.x.followers.toLocaleString("en-US")} followers · ${f.x.posts.toLocaleString("en-US")} posts · joined ${joined}${bio}` });
  }
  if (g.bad.length) e.addFields({ name: "Red flags", value: list(g.bad) });
  if (g.careful.length) e.addFields({ name: "Worth checking", value: list(g.careful) });
  if (g.good.length) e.addFields({ name: "Looks fine", value: list(g.good) });
  if (f.links?.length) e.addFields({ name: "Links it lists (unverified)", value: f.links.join("\n").slice(0, 1024) });
  if (g.level === "unknown") e.addFields({ name: "Try", value: "The exact ticker, the contract address (0x… or a Solana address), its X (@handle), its OpenSea link or its website." });
  e.setFooter({ text: "Automated checks, not a guarantee. It can't judge a team or its plans. DYOR." });
  // Discord refuses a card over 6000 characters: the least needed go first
  for (const drop of ["Links it lists (unverified)", "Looks fine", "🏊 Pools"]) {
    if (JSON.stringify(e.toJSON()).length < 5400) break;
    e.setFields((e.toJSON().fields ?? []).filter((x) => x.name !== drop));
  }
  return e;
}

const MOOD_COLORS = { positive: 0x3ddc84, mixed: 0xffc857, negative: 0xff5c5c, quiet: 0x8a8f98 };
const MOODS = { positive: "mostly positive", mixed: "mixed", negative: "mostly negative", quiet: "quiet" };

/** The second card: the read, in the order someone wants it. Plain text only: all of it comes from strangers' posts. */
export function talkCard(c: Chatter, profile?: { handle: string; followers: number; posts: number; joined: number | null } | null) {
  const since = profile?.joined ? new Date(profile.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
  const e = embed().setColor(c.red.length ? 0xff5c5c : c.yellow.length ? 0xffc857 : MOOD_COLORS[c.mood]).setTitle("🧠 Our read")
    .setDescription(`**Verdict:** ${escapeMarkdown(c.verdict)}`);
  if (profile) e.addFields({ name: "👤 Account", value: `@${escapeMarkdown(profile.handle)}${since ? `, joined ${since}` : ""}, ${profile.followers.toLocaleString("en-US")} followers, ${profile.posts.toLocaleString("en-US")} posts` });
  if (c.focus) e.addFields({ name: "🎯 Current focus", value: escapeMarkdown(c.focus) });
  if (c.then) e.addFields({ name: "🕰️ Then and now", value: escapeMarkdown(c.then) });
  const counts = c.ownLikes ? ` (typical post ${c.ownLikes.median} likes${c.pastLikes != null ? `, ${c.pastLikes} a couple of months ago` : ""}, best ${c.ownLikes.top}${c.lastPostDays != null ? `, last post ${when(c.lastPostDays)}` : ""})` : "";
  if (c.engagement || counts) e.addFields({ name: "📈 Engagement", value: `${escapeMarkdown(c.engagement)}${counts}`.trim() });
  if (c.bull.length) e.addFields({ name: "🐂 Bull case", value: list(c.bull) });
  if (c.bear.length) e.addFields({ name: "🐻 Bear case", value: list(c.bear) });
  if (c.green.length) e.addFields({ name: "🟢 Green flags", value: list(c.green) });
  if (c.yellow.length) e.addFields({ name: "🟡 Yellow flags", value: list(c.yellow) });
  if (c.red.length) e.addFields({ name: "🔴 Red flags", value: list(c.red) });
  if (c.watch.length) e.addFields({ name: "👀 Worth watching", value: list(c.watch) });
  if (c.web.length) e.addFields({ name: "🌐 Around the web", value: list(c.web) });
  if (c.complaints.length) e.addFields({ name: "💬 What people complain about in replies", value: list(c.complaints) });
  if (c.warnings.length) e.addFields({ name: "⚠️ Warnings people raise (not confirmed)", value: list(c.warnings) });
  if (c.fud.length) e.addFields({ name: "😱 FUD (no detail given)", value: list(c.fud) });
  const shills = [...c.shills];
  if (c.repeats >= 3) shills.unshift(`${c.repeats} of ${c.others} posts by others are near-copies of each other`);
  const talking = c.others + c.replies;
  if (talking >= 6 && c.smallAccounts / talking >= 0.5) shills.push(`${c.smallAccounts} of ${talking} posts by others are from accounts under 100 followers`);
  if (talking >= 6 && c.newAccounts / talking >= 0.4) shills.push(`${c.newAccounts} of ${talking} posts by others are from accounts under 90 days old`);
  if (shills.length) e.addFields({ name: "📣 Shill signs", value: list(shills.slice(0, 4)) });
  if (c.quotes.length) e.addFields({ name: "Said on X", value: c.quotes.map((q) => `> ${escapeMarkdown(q.text)}\n— ${escapeMarkdown(q.author)}`).join("\n").slice(0, 1024) });
  if (c.read) e.addFields({ name: "🧭 Bottom line", value: escapeMarkdown(c.read) });
  const web = c.sources.length ? ` Pages: ${c.sources.join(", ")}.` : "";
  e.setFooter({ text: `A model's opinion from ${c.own + c.past} of their posts, ${c.replies} replies, ${c.others} by others, ${c.pages} web pages${c.siteRead ? ", their site" : ""} and ${c.headlines} headlines (talk is ${MOODS[c.mood]}).${web} Not facts or advice. DYOR.`.slice(0, 2000) });
  // Discord refuses a card over 6000 characters: the least needed go first, never the verdict, flags or bottom line
  for (const drop of ["Said on X", "😱 FUD (no detail given)", "🎯 Current focus", "📈 Engagement", "🟢 Green flags", "📣 Shill signs", "🌐 Around the web", "🕰️ Then and now"]) {
    if (JSON.stringify(e.toJSON()).length < 5400) break;
    e.setFields((e.toJSON().fields ?? []).filter((f) => f.name !== drop));
  }
  return e;
}

const quiet = { parse: [] as never[], repliedUser: false };

/** The measured numbers the read may lean on (posts can say anything, these can't). */
export function numbersOf(f: Facts): string {
  const n = f.nft, t = f.token, v = f.verdict;
  const holders = v?.top10 != null ? ` Top 10 wallets hold ${Math.round(v.top10 * 100)}%, grouped wallets ${Math.round((v.cluster ?? 0) * 100)}%.` : "";
  if (n) return `NFT collection on ${n.chain}, created ${n.created ? new Date(n.created).toISOString().slice(0, 10) : "?"}. Items ${n.supply ?? "?"}, owners ${n.owners ?? "?"}, floor ${n.floor ?? "?"} ${n.symbol}. Volume all time ${n.volume ?? "?"} ${n.symbol}, last 30 days ${n.volume30 ?? "?"}. Sales last 7 days ${n.sales7 ?? "?"}, last 30 days ${n.sales30 ?? "?"}. OpenSea verified: ${n.verified ? "yes" : "no"}. Creator fee ${n.feePct}%.${holders}`;
  if (t) return `Token on ${t.chain}. Market cap ${v?.mcap ?? "?"} USD, liquidity ${v?.liq ?? "?"} USD, volume 24h ${v?.vol24 ?? "?"} USD, oldest pool ${t.ageH != null ? `${Math.round(t.ageH / 24)} days` : "?"}, holders ${v?.holders ?? "?"}.${holders} Contract checks: ${v?.contractClean ? "no owner powers found" : v?.contractChecked ? "see failed" : "couldn't be read"}${v?.why.length ? `; failed: ${v.why.join(", ")}` : ""}.${deepNumbers(f)}`;
  return deepNumbers(f).trim();
}

/** The rest of the measured facts, for the model. */
function deepNumbers(f: Facts): string {
  const d = f.deep, v = f.verdict, out: string[] = [];
  if (!d) return "";
  if (v?.lp) out.push(`LP GoPlus or RugCheck can see as locked or burned: ${Math.round(v.lp.locked * 100)}% (often wrongly low: they don't know every locker, so never treat a low number alone as a risk).`);
  if (v?.creatorHoneypots) out.push(`GoPlus ties ${v.creatorHoneypots} honeypots to its creator.`);
  for (const p of d.pools?.slice(0, 4) ?? []) out.push(`Pool ${p.name}: ${Math.round(p.liq)} USD, ${Math.round(p.vol24)} USD volume 24h, ${p.buys} buys by ${p.buyers} wallets, ${p.sells} sells by ${p.sellers} wallets, price ${p.h24 ?? "?"}% in 24h, ${p.ageDays != null ? Math.round(p.ageDays) : "?"} days old.`);
  if (d.flow) out.push(`Last ${d.flow.trades} trades: ${d.flow.wallets} wallets, top three made ${Math.round(d.flow.top3 * 100)}% of the volume, ${Math.round(d.flow.buyUsd)} USD bought, ${Math.round(d.flow.sellUsd)} USD sold.`);
  if (d.history) out.push(`Price history of its busiest pool, the last ${d.history.days} days only: ${Math.round(d.history.fromPeak * 100)}% from that period's high ${d.history.peakDaysAgo} days ago${d.history.change30d != null ? `, ${Math.round(d.history.change30d * 100)}% in 30 days` : ""}. Average daily volume ${Math.round(d.history.vol7)} USD last week${d.history.volBefore != null ? `, ${Math.round(d.history.volBefore)} USD the month before` : ""}.`);
  if (d.info) out.push(`GeckoTerminal: score ${d.info.score != null ? Math.round(d.info.score) : "?"}/100, developer holds ${d.info.devPct ?? "?"}%, top 10 hold ${d.info.top10 ?? "?"}%, launchpad ${d.info.launchpad ? (d.info.graduated ? "graduated" : "still on the curve") : "no"}.`);
  if (d.launches) out.push(`Its creator's other launches on Pons: ${d.launches.count}, ${d.launches.last7d} in the last week, ${d.launches.dead} now under 1000 USD in pools${d.launches.others.length ? ` (${d.launches.others.map((o) => `${o.symbol}: ${Math.round(o.liq)} USD`).join(", ")})` : ""}.`);
  if (d.promo) out.push(`Paid DexScreener promotion: profile ${d.promo.profile ? "yes" : "no"}, ${d.promo.boosts} boosts.`);
  if (d.domainDays != null) out.push(`Website domain registered ${Math.round(d.domainDays)} days ago.`);
  if (d.code) out.push(`Public code ${d.code.url}: last pushed ${d.code.pushedDays != null ? Math.round(d.code.pushedDays) : "?"} days ago, ${d.code.stars} stars.`);
  if (d.coin) out.push(`CoinGecko: ${d.coin.athChange != null ? `${Math.round(d.coin.athChange)}% from its all-time high` : "listed"}${d.coin.categories.length ? `, categories ${d.coin.categories.join(", ")}` : ""}.`);
  return out.length ? ` ${out.join(" ")}` : "";
}

/** What to search X for: its name, $ticker, @handle, contract. */
function searchOf(f: Facts): { name: string; also: string[] } | null {
  if (f.nft) return { name: f.nft.name, also: f.nft.contract ? [f.nft.contract] : [] };
  if (f.token) return { name: f.token.name, also: [`$${f.token.symbol}`, f.token.ca] };
  if (f.x) return { name: f.x.name, also: [] };
  return null;
}

export const research: Command = {
  name: "research",
  aliases: ["dyor", "lookup"],
  usage: "<name | $TICKER | 0x… | @x | OpenSea link | site>",
  description: "Check a project: its token, its X account, its website",
  async run(message: Message<true>, args) {
    const said = args.join(" ").trim();
    if (!said) { await message.reply("Give me a name, `$TICKER`, contract, `@x` account or website."); return; }
    const now = Date.now();
    if (now - (lastAsk.get(message.author.id) ?? 0) < COOLDOWN_MS) {
      await message.reply({ content: "One check every 30 seconds per person: try again shortly.", allowedMentions: quiet });
      return;
    }
    lastAsk.set(message.author.id, now);
    const target: Target = exactTarget(said) ?? { kind: "token", value: said.replace(/^\$/, "").slice(0, 44) };
    if (target.kind === "site") {
      await scan.run(message, [target.value]);    // Fly Scan fetches it in its own worker, and reports as a scan does
      return;
    }
    // reading a token's whole history can take a minute: say so at once, then the card takes its place
    const note = await message.reply({ content: `🪰 Thinking… checking \`${target.value.replace(/`/g, "")}\` (up to two minutes)`, allowedMentions: quiet });
    try {
      const f = await gather(target);
      const g = grade(f);
      const last = f.token ? await before(f.token.ca) : null;
      let e = card(f, g, last);
      const components = f.token ? tokenLinks(f.token.chain, f.token.ca) : [];
      if (f.token) void log({ symbol: f.token.symbol, chain: f.token.chain, ca: f.token.ca, level: g.level, price: f.token.price ? Number(f.token.price) : null, liq: f.verdict?.liq ?? null });
      await note.edit({ content: canRead() && searchOf(f) ? "🪰 Thinking… reading their posts, replies, the web and their site (up to two minutes)" : "", embeds: [e], components }).catch(() => {});
      const asked = searchOf(f);
      await readsReady();
      // their site is read by Fly Scan's worker, only for a read that will happen (each one is a scan from the bot's daily allowance)
      const url = f.deep?.website;
      const page = url && asked && canRead() && !readsSpent() ? siteRead(url).catch(() => null) : Promise.resolve(null);
      const said = asked ? await chatter(asked.name, asked.also, f.x ?? null, numbersOf(f), f.xListedFailed ?? null, page).catch(() => null) : null;
      const site = await page;
      if (site) {
        // a site Fly Scan calls dangerous counts against the project on the facts card too
        if (site.verdict === "danger") { g.bad.push(`Fly Scan flags its website: ${site.findings[0] ?? "see the report"}`); g.level = "red"; }
        e = card(f, g, last, site);
      }
      await note.edit({ content: "", embeds: [e], components }).catch(() => message.reply({ embeds: [e], components, allowedMentions: quiet }));
      // its own message: the two cards together can be over Discord's limit for one message
      if (said) await message.reply({ embeds: [talkCard(said, f.x)], allowedMentions: quiet });
      else if (asked && canRead()) {
        await message.reply({ allowedMentions: quiet, content: readsSpent()
          ? `🧠 Deep research is finished for today, so this is the facts card only. It's back <t:${readsBackAt()}:R>.`
          : "🧠 Couldn't read what people are saying about this right now, so this is the facts card only. Try again later." });
      }
      // an NFT: its contract goes through Fly Scan too, on the chains it reads (owner powers, what the code can do)
      const n = f.nft;
      if (n?.contract && ["robinhood", "base", "bsc", "arbitrum"].includes(n.chain)) await scan.run(message, [n.contract, n.chain]);
    } catch (err) {
      console.error("research failed", err);
      await note.edit("Couldn't finish that check, try again in a minute.").catch(() => {});
    }
  },
};
