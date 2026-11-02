import type { Message } from "discord.js";
import { embed } from "../format.ts";
import { record, type Tally } from "../track.ts";
import type { Command } from "./index.ts";

// !track: how the research's verdicts held up. Median price change and how many pools are gone, per verdict, at 7 and 30 days.
const WORDS: Record<string, string> = { red: "🔴 Red flags", careful: "🟡 Be careful", clear: "🟢 Nothing obvious wrong", unknown: "⚪ Couldn't tell" };
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const rows = (t: Tally[]) => t.sort((a, b) => a.level.localeCompare(b.level))
  .map((x) => `${WORDS[x.level] ?? x.level}: ${x.n} token${x.n === 1 ? "" : "s"}, median ${x.medianChange == null ? "?" : pct(x.medianChange)}, ${x.dead} dead`).join("\n");

export const track: Command = {
  name: "track",
  aliases: ["hitrate"],
  description: "How the research's verdicts held up afterwards",
  async run(message: Message<true>) {
    const r = await record();
    const e = embed().setTitle("🎯 Research track record");
    if (!r.week.length) e.setDescription(`${r.total} verdict${r.total === 1 ? "" : "s"} logged. Tokens are compared once they're 7 days old, so there's nothing to show yet.`);
    else {
      e.addFields({ name: "After 7 days or more", value: rows(r.week) });
      if (r.month.length) e.addFields({ name: "After 30 days or more", value: rows(r.month) });
      e.setFooter({ text: `${r.total} verdicts logged. "Dead" means under $1k left in its pools. Small samples say little.` });
    }
    await message.reply({ embeds: [e], allowedMentions: { repliedUser: false } });
  },
};
