import { SITE, desk } from "../data.ts";
import { ago, embed, pct, signed, symbol, usd } from "../format.ts";
import type { Command } from "./index.ts";

export const flydesk: Command = {
  name: "flydesk",
  aliases: ["desk"],
  description: "The Fly Desk: pot, holdings, latest trades",
  async run(message) {
    const d = await desk();
    const profit = d.pot_usd - d.capital_usd;
    const top = Object.values(d.positions)
      .flatMap((p) => p.rows)
      .sort((a, b) => b.value_usd - a.value_usd)
      .slice(0, 5);
    const trades = d.recent_trades.slice(0, 5);
    const e = embed()
      .setTitle("Fly Desk: real fly brains trading live")
      .setURL(`${SITE}/desk`)
      .addFields(
        { name: "Pot", value: usd(d.pot_usd), inline: true },
        { name: "Profit", value: `${signed(profit)} (${pct((profit / d.capital_usd) * 100)})`, inline: true },
        { name: "Trades", value: (d.fills?.trades ?? 0).toLocaleString("en-US"), inline: true },
      );
    if (d.ath) e.addFields({ name: "All-time high", value: `${usd(d.ath.pot_usd)} ${ago(Date.parse(d.ath.at))}`, inline: true });
    if (d.universe) e.addFields({ name: "Watching", value: `${d.universe.tokens} tokens`, inline: true });
    if (d.payout) {
      e.addFields({ name: "This week's payout", value: `${usd(d.payout.holders_usd)} to Trader Flies, ${ago(d.payout.settles_at * 1000)}`, inline: true });
    }
    if (top.length) {
      e.addFields({ name: "Biggest holdings", value: top.map((r) => `${symbol(r.symbol, d.labels)} ${usd(r.value_usd)} (${pct(r.pnl_pct)})`).join("\n") });
    }
    if (trades.length) {
      e.addFields({
        name: "Latest trades",
        value: trades.map((t) => `${t.side === "buy" ? "🟢 bought" : "🔴 sold"} ${symbol(t.symbol, d.labels)} ${usd(t.usd)} ${ago(Date.parse(t.at))}`).join("\n"),
      });
    }
    e.setFooter({ text: "Updated" }).setTimestamp(new Date(d.updated));
    await message.reply({ embeds: [e] });
  },
};
