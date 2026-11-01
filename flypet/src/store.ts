// What the pet remembers, in the app's own localStorage (both windows see it, and a change in one fires "storage" in the
// other), and the server's few reads. No wallet key or sign-in is ever kept here: a linked wallet is only its public address,
// and the miner's token can only submit research jobs.
import type { Fly, PriceSample, Seen } from "./mood.ts";
import { NO_SEEN } from "./mood.ts";
import { detectLang, setLang, type Lang } from "./i18n.ts";

export interface Prefs {
  name: string;
  born: number;
  wallet: string | null;
  flies: number[] | null;      // the flies to follow; null = all of the wallet's
  bubbles: boolean;
  notifications: boolean;
  minUsd: number;
  quiet: boolean;              // from the tray: no bubbles, no walking around
  homeX: number | null;        // where it was put down; it paces a little around that spot
  lang: Lang | null;           // null = the computer's language
  mineOn: boolean;             // off until the owner turns it on
  mineAnyTime: boolean;        // also while the computer is in use
  minerToken: string | null;
}
const DEFAULTS = (): Prefs => ({ name: "Fly", born: Date.now(), wallet: null, flies: null, bubbles: true, notifications: true, minUsd: 0, quiet: false, homeX: null, lang: null, mineOn: false, mineAnyTime: false, minerToken: null });

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : { ...fallback, ...JSON.parse(raw) };
  } catch { return fallback; }
}
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ } };

export function prefs(): Prefs {
  const had = localStorage.getItem("prefs") != null, p = load("prefs", DEFAULTS());
  if (!had) save("prefs", p);    // born once
  return p;
}
export function setPrefs(change: Partial<Prefs>): Prefs {
  const p = { ...prefs(), ...change };
  save("prefs", p);
  return p;
}

/** the chosen language, or the computer's; the native menu follows */
export function applyLang(): Lang {
  const lang = prefs().lang ?? detectLang(navigator.language);
  setLang(lang);
  window.flyNative?.setLang(lang);
  return lang;
}

export const seenOf = (who: string): Seen => load(`seen:${who}`, NO_SEEN);
export const setSeen = (who: string, seen: Seen) => save(`seen:${who}`, seen);
export const priceSamples = (): PriceSample[] => load("price", { samples: [] as PriceSample[] }).samples;
export const setPriceSamples = (samples: PriceSample[]) => save("price", { samples });

const API: string = (import.meta.env?.VITE_FLYPET_API as string | undefined) || "https://www.flyaiworld.com/mapi";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `the server said ${res.status}`);
  return json as T;
}

export const MINER_SERVER: string = (import.meta.env?.VITE_FLYPET_MINER as string | undefined) || "https://flyai-mine.fly.dev";

async function minerCall<T>(path: string, body?: unknown): Promise<T> {
  const token = prefs().minerToken;
  const res = await fetch(MINER_SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `the server said ${res.status}`);
  return json as T;
}
/** the wallet a miner pays, if it has a token yet */
export const minerWallet = async () => (prefs().minerToken ? (await minerCall<{ wallet: string | null }>("/api/me")).wallet : null);
/** the site's page that links the miner to a wallet; a miner that hasn't run yet registers first */
export async function minerLinkUrl(): Promise<string> {
  if (!prefs().minerToken) setPrefs({ minerToken: (await minerCall<{ token: string }>("/api/register", { label: "Fly Pet" })).token });
  return (await minerCall<{ url: string }>("/api/link", {})).url;
}

export const publicFeed = () => call<{ flyai_usd: number; top: Fly | null }>("/api/pet/public");
export const walletFeed = (wallet: string) => call<{ wallet: string; flies: Fly[] }>(`/api/pet/wallet/${wallet}`);
export const newLink = () => call<{ code: string; secret: string; url: string; expires_at: number }>("/api/pet/link", {});
export const claimLink = (code: string, secret: string) => call<{ status: string; wallet?: string }>("/api/pet/link/claim", { code, secret });
