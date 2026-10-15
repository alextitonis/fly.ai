import { FLYAI, flyaiPair } from "../data.ts";
import { pct } from "../format.ts";
import type { Command } from "./index.ts";

// just the number, as DexScreener quotes it (the full card is !stats)
export const price: Command = {
  name: "price",
  description: "$FLYAI price",
  async run(message) {
    const p = await flyaiPair();
    if (!p?.priceUsd) {
      await message.reply(`No price right now, try again in a minute: https://dexscreener.com/robinhood/${FLYAI}`);
      return;
    }
    const day = p.priceChange?.h24;
    await message.reply(`**$FLYAI $${p.priceUsd}**${day === undefined ? "" : ` (${pct(day)} 24h)`}`);
  },
};
