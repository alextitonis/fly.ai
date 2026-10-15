import { FLYAI, SITE, supply } from "../data.ts";
import { embed } from "../format.ts";
import type { Command } from "./index.ts";

const whole = (s: string) => Math.floor(Number(s)).toLocaleString("en-US");

export const token: Command = {
  name: "token",
  aliases: ["ca", "supply"],
  description: "$FLYAI: contract, chain, live supply and burns",
  async run(message) {
    const s = await supply().catch(() => null);
    const e = embed()
      .setTitle("$FLYAI on Robinhood Chain")
      .setURL(`${SITE}/token`)
      .setDescription("The coin that funds fly.ai. This is the only contract: treat any other address as a scam.")
      .addFields(
        { name: "Contract", value: `\`${FLYAI}\`` },
        { name: "Chain", value: "Robinhood Chain", inline: true },
        { name: "Launchpad", value: "Pons", inline: true },
      );
    if (s) {
      const pctBurned = (Number(s.burned) / Number(s.minted)) * 100;
      e.addFields(
        { name: "Total supply", value: whole(s.total), inline: true },
        { name: "Circulating", value: whole(s.circulating), inline: true },
        { name: "Burned 🔥", value: `${whole(s.burned)} (${pctBurned.toFixed(1)}%)`, inline: true },
        { name: "Locked for good", value: s.excluded.map((x) => `${x.label}: ${whole(x.balance)}`).join("\n") },
      );
    }
    e.addFields(
      { name: "Liquidity", value: "Uniswap V4, locked permanently by Pons" },
      {
        name: "Links",
        value: [
          `[Buy on the site](${SITE}/token)`,
          `[DexScreener](https://dexscreener.com/robinhood/${FLYAI})`,
          `[Explorer](https://robinhoodchain.blockscout.com/token/${FLYAI})`,
        ].join(" · "),
      },
    );
    await message.reply({ embeds: [e] });
  },
};
