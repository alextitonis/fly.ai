import { SITE, board, nicknames, partnerBoard, partners, type Board, type Wallet } from "../data.ts";
import { embed, short, signed } from "../format.ts";
import type { Command } from "./index.ts";

// !leaderboard [24h|7d|all]: the best Fly Wallets by profit over that window, the same table as the site's /traderflies/leaderboard:
// all time unless asked (the site opens there; 2026-11-03, the user: "discord bot and website leaderboard don't show synced results"),
// with the partner collections' NFT wallets (Bullas) ranked in, as the site has since 10-28.
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
    const w = WINDOWS[args[0]?.toLowerCase() ?? "all"] ?? WINDOWS.all!;
    // a partner whose board can't be read is left out this time, as on the site
    const [b, parts] = await Promise.all([board(), partners().catch(() => [])]);
    const others = (await Promise.all(parts.filter((p) => p.wallets.on).map((p) => partnerBoard(p.id).then((pb: Board) => ({ name: p.name, pb })).catch(() => null))))
      .filter((x) => x !== null);
    const label = new Map<Wallet, string>();
    for (const o of others) for (const r of o.pb.all) label.set(r, o.name);
    const merged = [...b[w.key], ...others.flatMap((o) => o.pb[w.key].map((r) => (label.set(r, o.name), r)))];
    const rows = merged.filter((r) => w.profit(r) > 0).sort((x, y) => w.profit(y) - w.profit(x)).slice(0, 10);
    const names = await nicknames(rows.map((r) => r.holder));
    const lines = rows.map((r, i) => {
      const flies = r.flies.map((f) => `#${f}`).join(" ");
      const who = names[r.holder.toLowerCase()] ?? short(r.holder);
      return `${MEDALS[i] ?? `**${i + 1}.**`} ${label.get(r) ?? "Fly"} ${flies} · **${signed(w.profit(r))}** · ${who}`;
    });
    await message.reply({
      embeds: [
        embed()
          .setTitle(`Fly Wallets leaderboard, ${w.title}`)
          .setURL(`${SITE}/traderflies/leaderboard`)
          .setDescription(lines.join("\n") || "No fly in profit over this window yet.")
          .setFooter({ text: `${b.all.length + others.reduce((n, o) => n + o.pb.all.length, 0)} Fly Wallets (Trader Flies ${b.all.length}${others.map((o) => ` · ${o.name} ${o.pb.all.length}`).join("")}) · !leaderboard all | 7d | 24h` }),
      ],
    });
  },
};
