// What the pet remembers, in the app's own localStorage (both windows see it, and a change in one fires "storage" in the
// other), and the server's few reads. No wallet key is ever kept here: a linked wallet is its public address plus the PET
// TOKEN (2026-11-13), which the server takes only for the fly chat and a fly's settings - never to move money - and the
// miner's token can only submit research jobs.
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
  petToken: string | null;     // the pet's sign-in (mine src/pet.ts): chat + a fly's settings only, 30 days
  petTokenUntil: number;
  fly: number | null;          // the fly (or partner NFT, by its chat id) that lives on the desktop
  coachSource: CoachSource | null;   // the game window the coach looks at (picked in the pet's window)
  coachNote: string;           // what the player told the coach about their run (optional)
}
export interface CoachSource { id: string; name: string; process: string | null }
const DEFAULTS = (): Prefs => ({ name: "Fly", born: Date.now(), wallet: null, flies: null, bubbles: true, notifications: true, minUsd: 0, quiet: false, homeX: null, lang: null, mineOn: false, mineAnyTime: false, minerToken: null, petToken: null, petTokenUntil: 0, fly: null, coachSource: null, coachNote: "" });

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
export const claimLink = (code: string, secret: string) =>
  call<{ status: string; wallet?: string; token?: string; token_expires_at?: number }>("/api/pet/link/claim", { code, secret });

// ---- signed in (2026-11-13): the pet's token, straight to the mine server (the site's proxy may drop the header) ----------
/** signed in with a token that still has a day left */
export const signedIn = (p = prefs()) => !!p.wallet && !!p.petToken && p.petTokenUntil > Date.now() + 86_400_000;
export class SignedOut extends Error {}
async function authed<T>(path: string, body?: unknown): Promise<T> {
  const token = prefs().petToken;
  if (!token) throw new SignedOut("signed out");
  const res = await fetch(MINER_SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), "x-flyai-pet": token },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(body === undefined ? 40_000 : 60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { setPrefs({ petToken: null, petTokenUntil: 0 }); throw new SignedOut(json.error ?? "signed out"); }
  if (!res.ok) throw new Error(json.error ?? `the server said ${res.status}`);
  return json as T;
}
export interface Who { partner: string; name: string; token: number; n: number; chat: number; image: string | null; page: string }
export interface InboxRow { fly: number; funded: boolean; who?: Who; last: { at: number; role: string; text: string } | null }
export interface LogRow { at: number; type: string; side?: string; symbol?: string; usd?: number | null; status?: string; why?: string | null; kind?: string; pnl_pct?: number | null }
export interface FlyFeed { fly: Fly | null; who: Who | null; wallet: string | null; settings: any; log: LogRow[] }
export type Card = { kind: "settings"; summary: string; before: any; after: any } | { kind: "withdraw"; pct: number; chain: string }
  | { kind: "move"; usd: number; chain: string; to_chain: string } | { kind: "watch"; token: string };
export interface ChatMsg { id: number; at: number; role: "user" | "fly"; text: string; card: Card | null; status: string | null;
  desk: { pending?: boolean; verdict?: string; text?: string } | null; local?: boolean }
export interface ChatMe { can_chat: boolean; why: string | null; wait_s: number; left_today: number; free_left?: number; credits?: number; resting: boolean; max_len: number;
  pack?: { flyai: number; messages: number } }
export interface AlphaCall { at: number; kind: string; symbol: string; chain: string; ca: string; head: string; why?: string | null;
  mcap?: number | null; liq?: number | null; vol24?: number | null; image?: string | null }

// what the fly told you (2026-11-13, the user: "notifications should be in the chat window too"): its money and price
// alerts, kept for the chat on the fly (trades show there from its log, with the reasons)
export interface Note { at: number; text: string; mood: string; fly: number | null }
const NOTES_MAX = 40;
export const notes = (): Note[] => load("notes", { list: [] as Note[] }).list;
export function addNote(n: Note) { save("notes", { list: [...notes(), n].slice(-NOTES_MAX) }); }
export const inbox = () => authed<{ flies: InboxRow[] }>("/api/flychat/inbox");
export const flyFeed = (id: number) => call<FlyFeed>(`/api/pet/fly/${id}`);
export const alphaCalls = () => call<{ calls: AlphaCall[] }>("/api/pet/alpha");
export const chatRead = (id: number) => authed<{ messages: ChatMsg[]; me: ChatMe }>(`/api/flychat/${id}`);
export const chatSend = (id: number, text: string, lang: string) => authed<{ messages: ChatMsg[] }>(`/api/flychat/${id}`, { text, lang });
export const chatAnswer = (id: number, msg: number, status: string) => authed(`/api/flychat/${id}/card/${msg}`, { status });
export const chatWatch = (id: number, token: string, card?: number) => authed(`/api/flychat/${id}/watch`, { token, ...(card ? { card } : {}) });
/** a fly wallet's settings: the Trader Fly's, or the partner NFT's under its partner (who) */
export const saveSettings = (wallet: string, settings: unknown, who: Who | null) =>
  authed(who ? `/api/partners/${who.partner}/wallet/${wallet}/settings` : `/api/vaults/${wallet}/settings`, who ? { settings } : { settings, chain: "robinhood" });

// ---- the game coach (flytrade/COACH-PLAN.md): its own server; frames go there and nowhere else, and aren't kept -------
export const COACH_SERVER: string = (import.meta.env?.VITE_FLYPET_COACH as string | undefined) || "https://flyai-x402.fly.dev/coach";
export interface CoachMe { wallet: string; pass: boolean; open: boolean; free_left: number | null; watch_ok: boolean }
export interface CoachAnswer { say: string | null; options?: { text: string; why: string; p: number | null }[]; by?: string | null;
  game?: string | null; profile?: string; screen?: string | null; free_left?: number | null; skipped?: string }
export class CoachRefused extends Error { constructor(msg: string, public status: number) { super(msg); } }
async function coachCall<T>(path: string, body?: unknown): Promise<T> {
  const token = prefs().petToken;
  if (!token) throw new SignedOut("signed out");
  const res = await fetch(COACH_SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), "x-flyai-pet": token },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { setPrefs({ petToken: null, petTokenUntil: 0 }); throw new SignedOut(json.detail ?? "signed out"); }
  if (!res.ok) throw new CoachRefused(json.detail ?? `the coach said ${res.status}`, res.status);
  return json as T;
}
export const coachMe = () => coachCall<CoachMe>("/me");
export const coachHint = (body: { image: string; mode: "hint" | "watch"; process?: string | null; title?: string; question?: string;
  note?: string; lang?: string; session?: string; session_s?: number }) => coachCall<CoachAnswer>("/hint", body);
