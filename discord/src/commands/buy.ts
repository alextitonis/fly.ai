import { FLYAI, SITE } from "../data.ts";
import { embed } from "../format.ts";
import type { Command } from "./index.ts";

// !buy, or tagging the bot with "how can i buy": where and how to get $FLYAI, and what holding it does (docs/start.html)
export const buy: Command = {
  name: "buy",
  aliases: ["start", "howtobuy"],
  description: "How to buy $FLYAI",
  async run(message) {
    await message.reply({
      embeds: [
        embed()
          .setTitle("How to buy $FLYAI")
          .setURL(`${SITE}/start`)
          .setDescription(
            `**1.** Open [flyaiworld.com/start](${SITE}/start) and connect your wallet\n` +
            "**2.** Pick an amount\n" +
            "**3.** Confirm. The box checks every route and uses the one that gives you the most $FLYAI",
          )
          .addFields(
            { name: "Pay with", value: "USDG or ETH on Robinhood Chain. ETH or USDC on Base, Arbitrum or Ethereum. BERA or USDC on Berachain. SOL or USDC on Solana." },
            { name: "Contract (Robinhood Chain)", value: `\`${FLYAI}\`\nThis is the only real one. Nobody from the team will DM you first.` },
            { name: "What holding it does", value: `Hold 200k $FLYAI, in your wallet or [staked](${SITE}/stake), to switch on a Trader Fly. Its brain trades its own wallet, and active flies share the Fly Desk's payout every Sunday.` },
            { name: "Want a fly?", value: `[Fly Market](${SITE}/traderflies/market)`, inline: true },
            { name: "Chart", value: `[DexScreener](https://dexscreener.com/robinhood/${FLYAI})`, inline: true },
          ),
      ],
    });
  },
};
