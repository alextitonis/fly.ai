/**
 * Small helpers the world pages share (2026-10-04: one copy instead of one per game). No browser-only globals at load
 * time: report.ts, which the world server also runs, imports this.
 */

/** text for innerHTML / an attribute */
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);

/** a token amount for people: "12,345.67" in the browser's number format */
export const fmt = (s: string | number) => Number(s).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** `bytes` random bytes as hex (a client seed) */
export const randomHex = (bytes = 16) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
