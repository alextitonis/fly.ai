// fly.ai Discord bot: logs in over the gateway, answers ! commands and talks back like a fly when tagged. No HTTP server, so no ports on fly.io.
// Reading messages needs the Message Content intent: developer portal -> Bot -> Privileged Gateway Intents.
import { Client, Events, GatewayIntentBits } from "discord.js";
import { commands, PREFIX } from "./commands/index.ts";
import { need } from "./env.ts";
import { flyReply } from "./fly.ts";
import { startAlpha } from "./alpha.ts";

const byName = new Map(commands.flatMap((c) => [c.name, ...(c.aliases ?? [])].map((n) => [n, c] as const)));
const guildId = process.env.DISCORD_GUILD_ID; // only this server, when set
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, (c) => {
  console.log(`logged in as ${c.user.tag} in ${c.guilds.cache.size} server(s)`);
  // the alpha feed (src/alpha.ts): on while ALPHA_CHANNEL_ID is set
  const alpha = process.env.ALPHA_CHANNEL_ID;
  if (alpha) startAlpha(c, alpha, { flies: Number(process.env.ALPHA_FLIES ?? 5), pollMs: Number(process.env.ALPHA_POLL_MS ?? 120_000) });
});

// tagging the bot (or replying to it) gets a fly line back, at most one per person every TAG_COOLDOWN_MS
const TAG_COOLDOWN_MS = 5_000;
const lastTag = new Map<string, number>();

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;
  if (guildId && message.guildId !== guildId) return;
  if (!message.content.startsWith(PREFIX)) {
    if (!message.mentions.users.has(client.user!.id)) return;
    const now = Date.now();
    if (now - (lastTag.get(message.author.id) ?? 0) < TAG_COOLDOWN_MS) return;
    lastTag.set(message.author.id, now);
    const text = message.content.replace(/<@!?\d+>/g, " ");
    await message.reply({ content: flyReply(text, message.channelId), allowedMentions: { repliedUser: false } }).catch(() => {});
    return;
  }
  const [name = "", ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = byName.get(name.toLowerCase());
  if (!command) return;
  try {
    await message.channel.sendTyping().catch(() => {});   // "fly.ai is typing…" while live data loads
    await command.run(message, args);
  } catch (err) {
    console.error(`${PREFIX}${name} failed`, err);
    await message.reply("Couldn't get that right now, try again in a minute.").catch(() => {});
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void client.destroy().finally(() => process.exit(0));
  });
}

await client.login(need("DISCORD_TOKEN"));
