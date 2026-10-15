import { FLYAI, SITE, flyaiPair, supply } from "../data.ts";
import { embed, pct, usd } from "../format.ts";
import type { Command } from "./index.ts";

export const stats: Command = {
  name: "stats",
  aliases: ["fdv", "mcap", "chart"],
  description: "$FLYAI price card: change, market cap, FDV, volume, liquidity",
  async run(message) {
    const [p, s] = await Promise.all([flyaiPair(), supply().catch(() => null)]);
    if (!p?.priceUsd) {
      await message.reply(`No price right now, try again in a minute: https://dexscreener.com/robinhood/${FLYAI}`);
      return;
    }
    const at = Number(p.priceUsd);
    const ch = p.priceChange ?? {};
    // market cap and FDV from the on-chain supply (burns included); DexScreener's own figure if the supply read fails
    const mcap = s ? at * Number(s.circulating) : (p.marketCap ?? 0);
    const fdv = s ? at * Number(s.total) : (p.marketCap ?? 0);
    await message.reply({
      embeds: [
        embed()
          .setTitle(`$FLYAI $${p.priceUsd}`)
          .setURL(p.url)
          .setDescription(`[Buy $FLYAI](${SITE}/token)`)
          .addFields(
            { name: "1h", value: pct(ch.h1 ?? 0), inline: true },
            { name: "6h", value: pct(ch.h6 ?? 0), inline: true },
            { name: "24h", value: pct(ch.h24 ?? 0), inline: true },
            { name: "Market cap", value: usd(mcap), inline: true },
            { name: "FDV", value: usd(fdv), inline: true },
            { name: "Volume 24h", value: usd(p.volume?.h24 ?? 0), inline: true },
            { name: "Liquidity", value: usd(p.liquidity?.usd ?? 0), inline: true },
          )
          .setFooter({ text: `${p.dexId} · DexScreener` }),
      ],
    });
  },
};
