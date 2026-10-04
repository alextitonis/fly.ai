import { locale } from "./i18n.ts";

/** The element with this id (2026-10-04: one helper for every compute page instead of a copy in each). */
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** A number in the site's language (1,234.5 / 1.234,5 ...), at most `digits` decimals. */
export const num = (n: number, digits = 2): string => n.toLocaleString(locale(), { maximumFractionDigits: digits });

/**
 * Token amounts for people to read: exact below 10,000 ("2,000", "12.5"), compact above it ("13.7K", "2.5M",
 * "1.2B"), with at most three significant digits. Display only: anything sent or signed uses the exact value.
 */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs < 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: abs < 1 ? 4 : 2 });
  for (const [size, unit] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (abs >= size) {
      const x = n / size;
      const digits = Math.abs(x) < 10 ? 2 : Math.abs(x) < 100 ? 1 : 0;
      return `${x.toLocaleString("en-US", { maximumFractionDigits: digits })}${unit}`;
    }
  }
  return String(n);
}
