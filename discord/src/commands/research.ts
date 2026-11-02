import { escapeMarkdown, type Message } from "discord.js";
import { embed, usd } from "../format.ts";
import { bundle, exactTarget, gather, grade, type Facts, type Grade, type Target } from "../research.ts";
import { tokenLinks } from "../alpha.ts";
import { canRead, chatter, readsBackAt, readsSpent, type Chatter } from "../chatter.ts";
import { scan } from "./scan.ts";
import type { Command } from "./index.ts";

// !research <name | $TICKER | 0x… | @x | site>, or tagging the bot with "can you check this project X" (src/intent.ts).
// Public facts and fixed rules (src/research.ts), websites through Fly Scan. Once every 30 s per person: each one reads the chain.
const COOLDOWN_MS = 30_000;
const lastAsk = new Map<string, number>();

const COLORS = { red: 0xff5c5c, careful: 0xffc857, clear: 0x3ddc84, unknown: 0x8a8f98 };
const WORDS = { red: "🔴 Red flags", careful: "🟡 Be careful", clear: "🟢 Nothing obvious wrong", unknown: "⚪ Couldn't find it" };
const big = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const list = (xs: string[]) => xs.map((x) => `• ${escapeMarkdown(x)}`).join("\n").slice(0, 1024);

export function card(f: Facts, g: Grade) {
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
    if (v?.holders) tile("Holders", v.holders.toLocaleString("en-US"));
    e.addFields({ name: "Clean or bundled?", value: bundle(f)!.line }, { name: "Contract", value: `\`${f.token.ca}\`` });
  }
  if (f.x) {
    const joined = f.x.joined ? new Date(f.x.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "unknown";
    const bio = f.x.bio ? `\n${escapeMarkdown(f.x.bio.replace(/\s+/g, " ").slice(0, 160))}` : "";
    e.addFields({ name: `X: @${f.x.handle}`, value: `${f.x.followers.toLocaleString("en-US")} followers · ${f.x.posts.toLocaleString("en-US")} posts · joined ${joined}${bio}` });
  }
  if (g.bad.length) e.addFields({ name: "Red flags", value: list(g.bad) });
  if (g.careful.length) e.addFields({ name: "Worth checking", value: list(g.careful) });
  if (g.good.length) e.addFields({ name: "Looks fine", value: list(g.good) });
  if (f.links?.length) e.addFields({ name: "Links it lists (unverified)", value: f.links.join("\n").slice(0, 1024) });
  if (g.level === "unknown") e.addFields({ name: "Try", value: "The exact ticker, the contract address (0x…), its X (@handle), its OpenSea link or its website." });
  return e.setFooter({ text: "Automated checks, not a guarantee. It can't judge a team or its plans. DYOR." });
}

const MOOD_COLORS = { positive: 0x3ddc84, mixed: 0xffc857, negative: 0xff5c5c, quiet: 0x8a8f98 };
const MOODS = { positive: "mostly positive", mixed: "mixed", negative: "mostly negative", quiet: "quiet" };

/** The second card: the read, in the order someone wants it. Plain text only: all of it comes from strangers' posts. */
export function talkCard(c: Chatter, profile?: { handle: string; followers: number; posts: number; joined: number | null } | null) {
  const when = profile?.joined ? new Date(profile.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
  const e = embed().setColor(c.red.length ? 0xff5c5c : c.yellow.length ? 0xffc857 : MOOD_COLORS[c.mood]).setTitle("🧠 Our read")
    .setDescription(`**Verdict:** ${escapeMarkdown(c.verdict)}`);
  if (profile) e.addFields({ name: "👤 Account", value: `@${escapeMarkdown(profile.handle)}${when ? `, joined ${when}` : ""}, ${profile.followers.toLocaleString("en-US")} followers, ${profile.posts.toLocaleString("en-US")} posts` });
  if (c.focus) e.addFields({ name: "🎯 Current focus", value: escapeMarkdown(c.focus) });
  const counts = c.ownLikes ? ` (typical post ${c.ownLikes.median} likes, best ${c.ownLikes.top})` : "";
  if (c.engagement || counts) e.addFields({ name: "📈 Engagement", value: `${escapeMarkdown(c.engagement)}${counts}`.trim() });
  if (c.bull.length) e.addFields({ name: "🐂 Bull case", value: list(c.bull) });
  if (c.bear.length) e.addFields({ name: "🐻 Bear case", value: list(c.bear) });
  if (c.green.length) e.addFields({ name: "🟢 Green flags", value: list(c.green) });
  if (c.yellow.length) e.addFields({ name: "🟡 Yellow flags", value: list(c.yellow) });
  if (c.red.length) e.addFields({ name: "🔴 Red flags", value: list(c.red) });
  if (c.watch.length) e.addFields({ name: "👀 Worth watching", value: list(c.watch) });
  if (c.warnings.length) e.addFields({ name: "⚠️ Warnings people raise (not confirmed)", value: list(c.warnings) });
  if (c.fud.length) e.addFields({ name: "😱 FUD (no detail given)", value: list(c.fud) });
  const shills = [...c.shills];
  if (c.repeats >= 3) shills.unshift(`${c.repeats} of ${c.others} posts by others are near-copies of each other`);
  if (c.others >= 6 && c.smallAccounts / c.others >= 0.5) shills.push(`${c.smallAccounts} of ${c.others} posts by others are from accounts under 100 followers`);
  if (shills.length) e.addFields({ name: "📣 Shill signs", value: list(shills.slice(0, 4)) });
  if (c.quotes.length) e.addFields({ name: "Said on X", value: c.quotes.map((q) => `> ${escapeMarkdown(q.text)}\n— ${escapeMarkdown(q.author)}`).join("\n").slice(0, 1024) });
  if (c.read) e.addFields({ name: "🧭 Bottom line", value: escapeMarkdown(c.read) });
  e.setFooter({ text: `A model's opinion from ${c.own} of their posts, ${c.others} by others and ${c.headlines} headlines (talk is ${MOODS[c.mood]}). Not facts or advice. DYOR.` });
  // Discord refuses a card over 6000 characters: the least needed go first, never the verdict, flags or bottom line
  for (const drop of ["Said on X", "😱 FUD (no detail given)", "🎯 Current focus", "📈 Engagement", "🟢 Green flags", "📣 Shill signs"]) {
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
  if (t) return `Token on ${t.chain}. Market cap ${v?.mcap ?? "?"} USD, liquidity ${v?.liq ?? "?"} USD, volume 24h ${v?.vol24 ?? "?"} USD, oldest pool ${t.ageH != null ? `${Math.round(t.ageH / 24)} days` : "?"}, holders ${v?.holders ?? "?"}.${holders} Contract checks: ${v?.contractChecked ? "no owner powers found" : "not run"}${v?.why.length ? `; failed: ${v.why.join(", ")}` : ""}.`;
  return "";
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
    const target: Target = exactTarget(said) ?? { kind: "token", value: said.replace(/^\$/, "").slice(0, 40) };
    if (target.kind === "site") {
      await scan.run(message, [target.value]);    // Fly Scan fetches it in its own worker, and reports as a scan does
      return;
    }
    // reading a token's whole history can take a minute: say so at once, then the card takes its place
    const note = await message.reply({ content: `🪰 Thinking… checking \`${target.value.replace(/`/g, "")}\` (up to a minute)`, allowedMentions: quiet });
    try {
      const f = await gather(target);
      const e = card(f, grade(f));
      const components = f.token ? tokenLinks(f.token.chain, f.token.ca) : [];
      await note.edit({ content: canRead() && searchOf(f) ? "🪰 Thinking… reading their posts and what people say (up to a minute)" : "", embeds: [e], components }).catch(() => {});
      const asked = searchOf(f);
      const said = asked ? await chatter(asked.name, asked.also, f.x ?? null, numbersOf(f), f.xListedFailed ?? null).catch(() => null) : null;
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
