import { alphaNow } from "../alpha.ts";
import type { Command } from "./index.ts";

// !alpha, or tagging the bot with "any alpha?" (src/intent.ts): a few current tokens as call cards, through the feed's scam
// filter. Its checks read the chain, so once a minute per channel. Nobody is pinged.
const COOLDOWN_MS = 60_000;
const lastAsk = new Map<string, number>();

export const alpha: Command = {
  name: "alpha",
  aliases: ["calls", "gems"],
  description: "A few tokens the flies and top traders are on right now",
  async run(message) {
    const now = Date.now();
    if (now - (lastAsk.get(message.channelId) ?? 0) < COOLDOWN_MS) {
      await message.reply({ content: "Just looked: ask again in a minute.", allowedMentions: { repliedUser: false } });
      return;
    }
    lastAsk.set(message.channelId, now);
    const none = { parse: [] as never[], repliedUser: false };
    // the scam checks can take most of a minute: say so at once, then the first card takes its place
    const note = await message.reply({ content: "🪰 Thinking… checking what the flies are on (up to a minute)", allowedMentions: none });
    const posts = await alphaNow().catch(() => null);
    if (!posts?.length) {
      await note.edit(posts ? "Nothing passed the checks right now. Ask again later." : "Couldn't check right now, try again in a minute.");
      return;
    }
    for (const [i, p] of posts.entries()) {
      const body = { embeds: p.embeds, components: p.components ?? [], allowedMentions: none };
      if (i === 0) await note.edit({ content: "", ...body });
      else if (message.channel.isSendable()) await message.channel.send(body);
    }
  },
};
