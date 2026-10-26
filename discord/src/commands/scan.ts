// !scan (2026-10-27, flytrade/SCAN-PLAN.md phase 5): a Fly Scan from Discord. "!scan 0x… [chain]" checks a token contract,
// "!scan claim-site.xyz" a website. Free here, from the bot's own daily allowance on the mine server (SCAN_BOT_PER_DAY);
// a scan done in the last 24 h answers at once. The full report is on the site: /scan?r=<id>.
import type { Message } from "discord.js";
import { SITE } from "../data.ts";
import { embed } from "../format.ts";
import type { Command } from "./index.ts";

const API = process.env.SCAN_API ?? "https://flyai-mine.fly.dev";
const CHAINS = ["robinhood", "base", "bsc", "arbitrum"];
const COOLDOWN_MS = 60_000;          // per person
const WAIT_MS = 120_000;
const lastAsk = new Map<string, number>();
const COLORS: Record<string, number> = { danger: 0xff5b4f, caution: 0xf2c94c, clear: 0x5ef2cc, unknown: 0x5f6865 };
const WORDS: Record<string, string> = { danger: "🚨 DANGER", caution: "⚠️ Caution", clear: "✅ No red flags found", unknown: "❔ Can't tell" };

type Job = { id: string; status: string; verdict: string | null; title: string | null; target: string; chain: string | null;
  kind: string; error: string | null; report: { report?: { summary?: string; findings?: { severity?: string; title?: string; unproven?: boolean }[] } } | null };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = process.env.SCAN_BOT_TOKEN;
  if (body !== undefined && !token) throw new Error("scans aren't set up on this bot yet");
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { "x-scan-bot-token": token } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

/** "!scan 0xabc base" / "!scan https://x.io" -> the scan request, or why not. */
export function parse(args: string[]): { kind: "contract" | "site"; target: string; chain?: string } | string {
  const [what = "", where = ""] = args;
  if (!what) return "Usage: `!scan 0x… [robinhood|base|bsc|arbitrum]` or `!scan claim-site.xyz`";
  if (/^0x[0-9a-fA-F]{40}$/.test(what)) {
    const chain = (where || "robinhood").toLowerCase();
    if (!CHAINS.includes(chain)) return `Chain must be one of ${CHAINS.join(", ")}.`;
    return { kind: "contract", target: what, chain };
  }
  if (/^0x/i.test(what)) return "That isn't a full contract address (0x and 40 characters).";
  return { kind: "site", target: what.replace(/^<|>$/g, "") };
}

export const scan: Command = {
  name: "scan",
  aliases: ["rug", "check"],
  usage: "<0x… [chain] | site>",
  description: "Fly Scan a token contract (owner powers, honeypot) or a site (drainer check)",
  async run(message: Message<true>, args) {
    const req = parse(args);
    if (typeof req === "string") { await message.reply(req); return; }
    const now = Date.now();
    if (now - (lastAsk.get(message.author.id) ?? 0) < COOLDOWN_MS) {
      await message.reply("One scan a minute per person: try again shortly.");
      return;
    }
    lastAsk.set(message.author.id, now);
    let started: { id: string };
    try { started = await api<{ id: string }>("/api/scan/bot", req); }
    catch (err) { await message.reply(`Couldn't start the scan: ${(err as Error).message}`); return; }
    const link = `${SITE}/scan?r=${started.id}`;
    const note = await message.reply({ content: `🪰 Scanning \`${req.target}\`… (15-60 s) ${link}`, allowedMentions: { repliedUser: false } });
    let job: Job | null = null;
    for (const until = Date.now() + WAIT_MS; Date.now() < until;) {
      job = await api<Job>(`/api/scan/job/${started.id}`).catch(() => null);
      if (job && (job.status === "done" || job.status === "failed")) break;
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (!job || job.status !== "done") {
      await note.edit(job?.status === "failed" ? `The scan couldn't finish: ${job.error ?? "try again later"}` :
        `Still scanning. The report will be here: ${link}`).catch(() => {});
      return;
    }
    const r = job.report?.report ?? {};
    const top = (r.findings ?? []).filter((f) => !f.unproven && (f.severity === "high" || f.severity === "medium")).slice(0, 4);
    const e = embed()
      .setColor(COLORS[job.verdict ?? "unknown"] ?? COLORS.unknown)
      .setTitle(`${WORDS[job.verdict ?? "unknown"]}: ${job.title ?? job.target}`.slice(0, 250))
      .setURL(link)
      .setDescription((r.summary ?? "").slice(0, 1500) || "See the full report on the site.");
    if (top.length) e.addFields({ name: "Top findings", value: top.map((f) => `• **${f.title}** (${f.severity})`).join("\n").slice(0, 1000) });
    e.setFooter({ text: "An automated read, not a guarantee. Never sign what you don't understand." });
    await note.edit({ content: "", embeds: [e] }).catch(() => message.reply({ embeds: [e] }));
  },
};
