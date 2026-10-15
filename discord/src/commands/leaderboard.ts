import { SITE, board, nicknames, type Wallet } from "../data.ts";
import { embed, short, signed } from "../format.ts";
import type { Command } from "./index.ts";

// !leaderboard [24h|7d|all]: the best Fly Wallets by profit over that window (the site's /traderflies/leaderboard)
const WINDOWS: Record<string, { key: "h24" | "d7" | "all"; title: string; profit: (w: Wallet) => number }> = {
  "24h": { key: "h24", title: "last 24h", profit: (w) => w.profit_24h },
  "7d": { key: "d7", title: "last 7 days", profit: (w) => w.profit_7d },
  all: { key: "all", title: "all time", profit: (w) => w.profit },
};
const MEDALS = ["🥇", "🥈", "🥉"];

export const leaderboard: Command = {
  name: "leaderboard",
  aliases: ["lb", "top"],
  usage: "[24h|7d|all]",
  description: "The best Fly Wallets by profit",
  async run(message, args) {
    const w = WINDOWS[args[0]?.toLowerCase() ?? "7d"] ?? WINDOWS["7d"]!;
    const b = await board();
    const rows = b[w.key].filter((r) => w.profit(r) > 0).slice(0, 10);
    const names = await nicknames(rows.map((r) => r.holder));
    const lines = rows.map((r, i) => {
      const flies = r.flies.map((f) => `#${f}`).join(" ");
      const who = names[r.holder.toLowerCase()] ?? short(r.holder);
      return `${MEDALS[i] ?? `**${i + 1}.**`} Fly ${flies} · **${signed(w.profit(r))}** · ${who}`;
    });
    await message.reply({
      embeds: [
        embed()
          .setTitle(`Fly Wallets leaderboard, ${w.title}`)
          .setURL(`${SITE}/traderflies/leaderboard`)
          .setDescription(lines.join("\n") || "No fly in profit over this window yet.")
          .setFooter({ text: `${b.all.length} Fly Wallets · !leaderboard 24h | 7d | all` }),
      ],
    });
  },
};
