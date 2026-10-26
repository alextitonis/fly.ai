// Every ! command the bot knows. Add a file next to these and list it here; !help lists them on its own.
import type { Message } from "discord.js";
import { flydesk } from "./flydesk.ts";
import { help } from "./help.ts";
import { leaderboard } from "./leaderboard.ts";
import { marketplace } from "./marketplace.ts";
import { price } from "./price.ts";
import { project } from "./project.ts";
import { scan } from "./scan.ts";
import { stats } from "./stats.ts";
import { token } from "./token.ts";

export type Command = {
  name: string;
  aliases?: string[];
  usage?: string;   // shown after the name in !help, e.g. "[24h|7d|all]"
  description: string;
  // args: the words after the command name, e.g. "!leaderboard 24h" -> ["24h"]
  run: (message: Message<true>, args: string[]) => Promise<void>;
};

export const PREFIX = "!";
export const commands: Command[] = [project, token, price, stats, flydesk, leaderboard, marketplace, scan, help];
