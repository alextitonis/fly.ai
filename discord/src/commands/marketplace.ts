import { SITE } from "../data.ts";
import { embed } from "../format.ts";
import type { Command } from "./index.ts";

export const marketplace: Command = {
  name: "marketplace",
  aliases: ["market"],
  description: "Buy and sell Trader Flies",
  async run(message) {
    await message.reply({
      embeds: [
        embed()
          .setTitle("Fly Market: buy and sell Trader Flies")
          .setURL(`${SITE}/traderflies/market`)
          .setDescription(
            "List your fly at a price in $FLYAI or dollars, or make an offer on any fly. " +
              "The seller is paid the moment it sells, less a 1% fee, and a listed fly keeps trading in its holder's wallet until then.",
          )
          .addFields(
            { name: "Fly Market", value: `[Open](${SITE}/traderflies/market)`, inline: true },
            { name: "Breed", value: `[Merge two flies](${SITE}/traderflies/breed)`, inline: true },
            { name: "OpenSea", value: "[Trader Flies](https://opensea.io/collection/trader-fly-294099831)", inline: true },
          ),
      ],
    });
  },
};
