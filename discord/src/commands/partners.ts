import { partners as readPartners, SITE } from "../data.ts";
import { embed } from "../format.ts";
import type { Command } from "./index.ts";

// !partners, or tagging the bot with "bullas" / "partners": the NFT collections with Fly Wallets, read live from mine.partners,
// so a new partner shows up here on its own
const money = (n: number) => n.toLocaleString("en-US");

export const partners: Command = {
  name: "partners",
  aliases: ["partner", "bullas", "enjoyoors"],
  description: "NFT collections with their own Fly Wallets",
  async run(message) {
    const list = (await readPartners()).filter((p) => p.wallets.on);
    if (!list.length) {
      await message.reply("No partner collections right now.");
      return;
    }
    
    const embeds = list.slice(0, 5).map((p) => {
      const c = p.collection, page = `${SITE}/traderflies/partner?p=${p.id}`;
      const names = [p.name, ...(c.extra ?? []).map((x) => x.name)];
      const chain = c.chain.charAt(0).toUpperCase() + c.chain.slice(1);
      const buy = [{ name: p.name, url: c.url }, ...(c.extra ?? [])].filter((x) => x.url).map((x) => `[${x.name}](${x.url})`).join(" · ");
      const e = embed().setTitle(`${names.join(" + ")}: a fly brain for your NFT`).setURL(page)
        .setDescription(`Every ${names.join(" or ")} NFT can have its own trading wallet on Robinhood Chain. Its fly brain trades it, and only you can take money out.`)
        .addFields(
          { name: "To start", value: `Hold the NFT and ${money(p.hold_flyai)} $FLYAI, then set up its wallet on the [partner page](${page})` },
          { name: "Fund it", value: "Send ETH or USDG. The wallet pays its own gas, so keep a little ETH in it" },
          { name: "Fee", value: `${p.fee_bps / 100}% on profit only`, inline: true },
          { name: "Collection", value: `${chain}${buy ? `\n${buy}` : ""}`, inline: true },
        );
      if (p.house_token) e.addFields({ name: "Extra", value: `Its house option buys $${p.house_token.symbol} dips`, inline: true });
      if (c.image) e.setThumbnail(c.image);
      return e;
    });
    await message.reply({ embeds });
  },
};
