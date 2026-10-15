import { embed } from "../format.ts";
import { commands, PREFIX, type Command } from "./index.ts";

function line(c: Command): string {
  const also = c.aliases?.length ? ` (also ${c.aliases.map((a) => `\`${PREFIX}${a}\``).join(", ")})` : "";
  return `\`${PREFIX}${c.name}${c.usage ? ` ${c.usage}` : ""}\` ${c.description}${also}`;
}

export const help: Command = {
  name: "help",
  description: "List the commands",
  async run(message) {
    await message.reply({ embeds: [embed().setTitle("fly.ai bot").setDescription(commands.map(line).join("\n"))] });
  },
};
