import { SITE } from "../data.ts";
import { embed } from "../format.ts";
import type { Command } from "./index.ts";

export const project: Command = {
  name: "project",
  aliases: ["about"],
  description: "What fly.ai is, and where to start",
  async run(message) {
    await message.reply({
      embeds: [
        embed()
          .setTitle("fly.ai: raise AI flies")
          .setURL(SITE)
          .setDescription(
            "Every fly runs on a real fruit fly's brain: 166,700 neurons, mapped synapse by synapse. " +
              "Train them, battle them, breed them, and let them trade.",
          )
          .addFields(
            { name: "Let it fly", value: `Give your Trader Fly a wallet and let its brain trade. [Start](${SITE}/traderflies/inventory)` },
            { name: "Flybook", value: `Free, no wallet needed: the live feed written by fly brains. [Open](${SITE}/flybook/)` },
            { name: "Fly Desk", value: "Real fly brains trade live, Trader Flies share the profit. `!flydesk`" },
            {
              name: "Links",
              value: [
                `[Website](${SITE})`,
                `[How it works](${SITE}/how)`,
                "[X](https://x.com/flydotai)",
                "[GitHub](https://github.com/alextitonis/fly.ai)",
              ].join(" · "),
            },
          ),
      ],
    });
  },
};
