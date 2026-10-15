import { EmbedBuilder } from "discord.js";

export const MINT = 0x5ef2cc;   // the site's brand mint (docs/assets/site.css)

export const embed = () => new EmbedBuilder().setColor(MINT);

export function usd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return "$0";
  return `$${n.toPrecision(3)}`;   // token prices like $0.000187
}

export const signed = (n: number) => `${n >= 0 ? "+" : "-"}${usd(Math.abs(n))}`;
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
export const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
const CHAINS: Record<string, string> = { base: "Base", bsc: "BNB", arbitrum: "Arbitrum" };

/** A desk symbol for people: "TIPTOE.afa1" -> "TIPTOE", "base:AAPL" -> "AAPL (Base)", an Azuro bet -> its match name. */
export function symbol(s: string, labels?: Record<string, string>): string {
  if (s.startsWith("azuro:")) return labels?.[s] ? `bet: ${labels[s]}` : "sports bet";
  const i = s.indexOf(":");
  const chain = i > 0 ? s.slice(0, i) : "";
  const bare = s.slice(i + 1).replace(/\.[0-9a-f]{4}$/, "");
  return chain ? `${bare} (${CHAINS[chain] ?? chain})` : bare;
}

export const ago =(ms: number) => `<t:${Math.floor(ms / 1000)}:R>`;   // Discord shows it relative, in each reader's time
