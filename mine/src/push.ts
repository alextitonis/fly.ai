/**
 * Phone notifications for the Fly Pet mobile page (docs/pet-mobile.html, 2026-11-16, the user: the pet "for mobile ...
 * without coach just chat and notifications"; option A: an installable page + Web Push, no app store).
 *
 * Web Push with Node's own crypto (no library: mine keeps its dependencies few): VAPID (RFC 8292, an ES256 JWT) and the
 * message encryption (RFC 8291, aes128gcm). A phone subscribes with the site session; every TICK_MS the sender looks for
 * what is new for each subscribed wallet since that subscription's cursor and sends at most one notification per kind:
 *   trades   a filled trade of a fly wallet this holder holds (mine.vault_trades; upkeep tags left out)
 *   money    money in or out of those wallets (mine.vault_moves: deposit, withdraw, refund, grant, release)
 *   chat     a reply from the holder's fly (mine.fly_chat role 'fly')
 *   alpha    a new alpha call (vault_public 'pet:alpha'), off by default
 * Env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, raw P-256: 65-byte public, 32-byte private), VAPID_SUBJECT
 * (mailto: or https:). Without the keys the routes answer "off" and nothing is sent.
 */
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export const TICK_MS = 60_000;
export const PREFS_DEFAULT = { trades: true, money: true, chat: true, alpha: false };
export type Prefs = typeof PREFS_DEFAULT;
const KINDS = Object.keys(PREFS_DEFAULT) as (keyof Prefs)[];
const MONEY_KINDS = ["deposit", "withdraw", "refund", "grant", "release"];
const UPKEEP_TAGS = ["earn", "gas", "cash"];
const MAX_FAILS = 10;
const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|web\.push\.apple\.com)\//;

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(String(s), "base64url");

// ------------------------------------------------------------------------------------------- the protocol (RFC 8291/8292)

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) => {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
};

/** RFC 8291 aes128gcm: the body for a subscription (its p256dh + auth). serverKeys/salt only for the RFC's test vector. */
export function encrypt(payload: Buffer, p256dh: string, auth: string,
                        test?: { serverPrivate: Buffer; salt: Buffer }): Buffer {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const ecdh = createECDH("prime256v1");
  if (test) ecdh.setPrivateKey(test.serverPrivate); else ecdh.generateKeys();
  const as = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const ikm = hkdf(secret, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua, as]), 32);
  const salt = test?.salt ?? randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([payload, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head.writeUInt8(as.length, 20);
  return Buffer.concat([head, as, body]);
}

/** The VAPID Authorization header for a push service's origin (RFC 8292). */
export function vapidAuth(endpoint: string, keys: { pub: string; priv: string; subject: string }, now: number): string {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const pub = unb64u(keys.pub);
  const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: keys.priv, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.pub}`;
}

/** A new VAPID key pair (base64url raw), for the operator: node -e "import('./src/push.ts').then(m=>console.log(m.newKeys()))" */
export function newKeys() {
  const e = createECDH("prime256v1");
  e.generateKeys();
  return { VAPID_PUBLIC_KEY: b64u(e.getPublicKey()), VAPID_PRIVATE_KEY: b64u(e.getPrivateKey()) };
}

// ------------------------------------------------------------------------------------------- what to tell

export type Note = { kind: keyof Prefs; title: string; body: string; url: string; tag: string };
type Trade = { vault: string; fly: number | null; symbol: string; side: string; usd: number };
type Move = { vault: string; fly: number | null; kind: string; usd: number | null };
type Chat = { fly: number; text: string };
type Alpha = { symbol: string; chain: string; head: string };

const flyName = (fly: number | null) => (fly == null ? "Your fly" : fly >= 1_000_000_000 ? "Your NFT wallet" : `Fly #${fly}`);
const usd = (n: number | null | undefined) => (n == null ? "" : `$${Math.abs(n).toFixed(2)}`);
const sym = (s: string) => String(s).replace(/^[a-z0-9]+:/i, "").split(".")[0];

/** One subscription's notes from what is new for it, at most one per kind (a summary when there are several). */
export function notesFor(prefs: Prefs, ev: { trades: Trade[]; moves: Move[]; chats: Chat[]; alpha: Alpha[] }, page: string): Note[] {
  const out: Note[] = [];
  if (prefs.trades && ev.trades.length) {
    const t = ev.trades[0]!;
    out.push(ev.trades.length === 1
      ? { kind: "trades", title: `${flyName(t.fly)} ${t.side === "buy" ? "bought" : "sold"} ${sym(t.symbol)}`, body: `${usd(t.usd)} ${t.side}`.trim(),
          url: t.fly ? `/traderflies/fly?id=${t.fly}` : page, tag: "trades" }
      : { kind: "trades", title: `${ev.trades.length} new trades`, body: ev.trades.slice(0, 4).map((x) => `${x.side} ${sym(x.symbol)} ${usd(x.usd)}`).join(" · "),
          url: "/traderflies/", tag: "trades" });
  }
  if (prefs.money && ev.moves.length) {
    const word: Record<string, string> = { deposit: "Money in", withdraw: "Withdrawal sent", refund: "Refund in", grant: "Bonus in", release: "Paid out" };
    const m = ev.moves[0]!;
    out.push(ev.moves.length === 1
      ? { kind: "money", title: `${word[m.kind] ?? m.kind}: ${usd(m.usd)}`.replace(/: $/, ""), body: flyName(m.fly), url: m.fly ? `/traderflies/fly?id=${m.fly}` : "/traderflies/", tag: "money" }
      : { kind: "money", title: `${ev.moves.length} money moves`, body: ev.moves.slice(0, 4).map((x) => `${word[x.kind] ?? x.kind} ${usd(x.usd)}`).join(" · "), url: "/traderflies/", tag: "money" });
  }
  if (prefs.chat && ev.chats.length) {
    const c = ev.chats[ev.chats.length - 1]!;
    out.push({ kind: "chat", title: `${flyName(c.fly)} replied`, body: c.text.slice(0, 140), url: `${page}?chat=${c.fly}`, tag: `chat-${c.fly}` });
  }
  if (prefs.alpha && ev.alpha.length) {
    const a = ev.alpha[0]!;
    out.push({ kind: "alpha", title: ev.alpha.length === 1 ? `Alpha: ${a.symbol} (${a.chain})` : `${ev.alpha.length} alpha calls`,
      body: ev.alpha.length === 1 ? a.head : ev.alpha.slice(0, 4).map((x) => x.symbol).join(" · "), url: `${page}#alpha`, tag: "alpha" });
  }
  return out;
}

export function cleanPrefs(p: any): Prefs {
  const out = { ...PREFS_DEFAULT };
  for (const k of KINDS) if (typeof p?.[k] === "boolean") out[k] = p[k];
  return out;
}

// ------------------------------------------------------------------------------------------- routes + sender

export interface PushDeps {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  keys: { pub: string; priv: string; subject: string } | null;
  page?: string;
  now?: () => number;
  /** the HTTP POST to a push service (tests swap it): status code */
  post?: (url: string, headers: Record<string, string>, body: Buffer) => Promise<number>;
}

type Sub = { id: number; wallet: string; endpoint: string; p256dh: string; auth: string; prefs: any; cursor_ms: number; fails: number };

export function createPush(d: PushDeps) {
  const now = d.now ?? Date.now;
  const page = d.page ?? "/pet-mobile";
  const post = d.post ?? (async (url, headers, body) => (await fetch(url, { method: "POST", headers, body: new Uint8Array(body), signal: AbortSignal.timeout(15_000) })).status);

  async function deliver(s: Pick<Sub, "endpoint" | "p256dh" | "auth">, note: Omit<Note, "kind"> & { kind?: string }): Promise<number> {
    if (!d.keys) return 0;
    const body = encrypt(Buffer.from(JSON.stringify(note)), s.p256dh, s.auth);
    return post(s.endpoint, { Authorization: vapidAuth(s.endpoint, d.keys, now()), "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream", TTL: "3600", Urgency: "normal" }, body);
  }

  function subOf(body: any) {
    const s = body?.sub ?? body;
    const endpoint = String(s?.endpoint ?? ""), p256dh = String(s?.keys?.p256dh ?? ""), auth = String(s?.keys?.auth ?? "");
    if (!PUSH_HOSTS.test(endpoint) || endpoint.length > 1000) throw new d.HttpError(400, "not a push service endpoint");
    if (unb64u(p256dh).length !== 65 || unb64u(auth).length !== 16) throw new d.HttpError(400, "bad subscription keys");
    return { endpoint, p256dh, auth };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/push/key") return d.send(res, 200, { key: d.keys?.pub ?? null, prefs: PREFS_DEFAULT }), true;
    if (req.method !== "POST") return false;
    if (p === "/api/push/subscribe") {
      if (!d.keys) throw new d.HttpError(503, "notifications are off");
      const wallet = (await d.sessionWallet(req)).toLowerCase();
      const body = await d.readJson(req);
      const s = subOf(body), prefs = cleanPrefs(body?.prefs);
      await d.pg.run(`insert into mine.push_subs (wallet, endpoint, p256dh, auth, prefs, created_ms, cursor_ms)
        values (?, ?, ?, ?, ?::text::jsonb, ?, ?) on conflict (endpoint) do update set wallet = excluded.wallet,
        p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs, fails = 0`,
        wallet, s.endpoint, s.p256dh, s.auth, JSON.stringify(prefs), now(), now());
      return d.send(res, 200, { ok: true, prefs }), true;
    }
    if (p === "/api/push/prefs" || p === "/api/push/unsubscribe" || p === "/api/push/test") {
      const wallet = (await d.sessionWallet(req)).toLowerCase();
      const body = await d.readJson(req);
      const row = await d.pg.one<Sub>("select * from mine.push_subs where endpoint = ? and wallet = ?", String(body?.endpoint ?? ""), wallet);
      if (p === "/api/push/unsubscribe") {
        if (row) await d.pg.run("delete from mine.push_subs where id = ?", row.id);
        return d.send(res, 200, { ok: true }), true;
      }
      if (!row) throw new d.HttpError(404, "this phone isn't subscribed");
      if (p === "/api/push/prefs") {
        const prefs = cleanPrefs(body?.prefs);
        await d.pg.run("update mine.push_subs set prefs = ?::text::jsonb where id = ?", JSON.stringify(prefs), row.id);
        return d.send(res, 200, { ok: true, prefs }), true;
      }
      const status = await deliver(row, { title: "Fly Pet", body: "Notifications are on 🪰", url: page, tag: "test" });
      return d.send(res, 200, { ok: status >= 200 && status < 300, status }), true;
    }
    if (p === "/api/push/me") {
      const wallet = (await d.sessionWallet(req)).toLowerCase();
      const body = await d.readJson(req);
      const row = await d.pg.one<Sub>("select prefs from mine.push_subs where endpoint = ? and wallet = ?", String(body?.endpoint ?? ""), wallet);
      return d.send(res, 200, { subscribed: !!row, prefs: row ? cleanPrefs(row.prefs) : PREFS_DEFAULT }), true;
    }
    return false;
  }

  /** One pass: every subscription's news since its cursor, then the cursor moves to this pass's start. */
  async function tick(): Promise<{ sent: number; subs: number }> {
    if (!d.keys) return { sent: 0, subs: 0 };
    const subs = await d.pg.all<Sub>("select id, wallet, endpoint, p256dh, auth, prefs, cursor_ms::float8 as cursor_ms, fails from mine.push_subs");
    if (!subs.length) return { sent: 0, subs: 0 };
    const t = now(), since = new Date(Math.min(...subs.map((s) => Number(s.cursor_ms)))).toISOString();
    const wallets = [...new Set(subs.map((s) => s.wallet))];
    const marks = wallets.map(() => "?").join(", ");
    // the fly wallets each holder holds (any chain's book: flies and partner NFTs)
    const held = await d.pg.all<{ holder: string; wallet: string; fly_id: number | null }>(`select lower(l.holder) as holder, l.wallet, w.fly_id
      from mine.vault_ledger l left join mine.vault_wallets w on w.address = l.wallet where lower(l.holder) in (${marks}) and not l.closing`, ...wallets);
    const vaults = [...new Set(held.map((h) => h.wallet))];
    const vmarks = vaults.map(() => "?").join(", ") || "''";
    const [trades, moves, chats, alphaRow] = await Promise.all([
      vaults.length ? d.pg.all<any>(`select vault, (extract(epoch from at) * 1000)::float8 as at, symbol, side, usd from mine.vault_trades
        where vault in (${vmarks}) and status = 'filled' and tag not in (${UPKEEP_TAGS.map(() => "?").join(", ")}) and at > ?::timestamptz order by at desc limit 500`,
        ...vaults, ...UPKEEP_TAGS, since) : [],
      vaults.length ? d.pg.all<any>(`select wallet as vault, (extract(epoch from at) * 1000)::float8 as at, kind, usd from mine.vault_moves
        where wallet in (${vmarks}) and kind in (${MONEY_KINDS.map(() => "?").join(", ")}) and at > ?::timestamptz order by at desc limit 500`,
        ...vaults, ...MONEY_KINDS, since) : [],
      d.pg.all<any>(`select wallet, fly_id, text, (extract(epoch from at) * 1000)::float8 as at from mine.fly_chat
        where role = 'fly' and wallet in (${marks}) and at > ?::timestamptz order by id limit 500`, ...wallets, since),
      d.pg.one<{ value: any }>("select value from mine.vault_public where key = 'pet:alpha'"),
    ]);
    const flyOf = new Map(held.map((h) => [h.wallet, h.fly_id]));
    const mineOf = new Map<string, Set<string>>();
    for (const h of held) mineOf.set(h.holder, (mineOf.get(h.holder) ?? new Set()).add(h.wallet));
    const alpha = ((alphaRow?.value?.calls ?? []) as any[]);
    let sent = 0;
    for (const s of subs) {
      const c = Number(s.cursor_ms), mine = mineOf.get(s.wallet) ?? new Set<string>();
      const ev = {
        trades: trades.filter((x) => x.at > c && mine.has(x.vault)).map((x) => ({ ...x, fly: flyOf.get(x.vault) ?? null })),
        moves: moves.filter((x) => x.at > c && mine.has(x.vault)).map((x) => ({ ...x, fly: flyOf.get(x.vault) ?? null })),
        chats: chats.filter((x) => x.at > c && x.wallet === s.wallet).map((x) => ({ fly: x.fly_id, text: x.text })),
        alpha: alpha.filter((x) => Number(x.at) > c),
      };
      let gone = false, failed = false, mineSent = 0;
      for (const note of notesFor(cleanPrefs(s.prefs), ev, page)) {
        try {
          const status = await deliver(s, note);
          if (status === 404 || status === 410) { gone = true; break; }
          if (status >= 200 && status < 300) { sent++; mineSent++; } else failed = true;
        } catch { failed = true; }
      }
      if (gone || (failed && s.fails + 1 >= MAX_FAILS)) await d.pg.run("delete from mine.push_subs where id = ?", s.id);
      else await d.pg.run("update mine.push_subs set cursor_ms = ?, fails = ?, last_sent_ms = case when ? then ? else last_sent_ms end where id = ?",
        t, failed ? s.fails + 1 : 0, mineSent > 0, t, s.id);
    }
    return { sent, subs: subs.length };
  }

  return { route, tick, deliver };
}
