/**
 * Bounties (2026-10-03, the user: "a bounty system with an easy way to add bounties for us and people to apply"): the
 * team posts bounties from the admin view of /bounties, signed-in wallets enter, the team reviews and pays by hand from
 * the team wallet, then records the tx so the public page shows it.
 *
 * Two kinds:
 *   contest  anyone enters before the deadline (one entry per wallet, editable while pending); the team approves winners
 *   apply    people apply (a pitch + past work); the team picks one (status "picked", the bounty's assignee); only that
 *            wallet can then hand in the final work, which the team approves and pays
 *
 *   GET  /api/bounties                     -> { bounties: [...non-draft, with counts and paid/approved winners], explorer }
 *   GET  /api/bounties/mine                -> the signed-in wallet's entries + whether it is a bounty admin
 *   POST /api/bounties/enter { bounty, x_handle, link, note }     (signed in; the stage follows from the bounty)
 *   GET  /api/admin/bounties               -> every bounty and entry, with wallets, and the block list
 *   POST /api/admin/bounties { id?, title, kind, category, summary, details, reward, winners, deadline_ms, status }
 *   POST /api/admin/bounties/entry { id, status?, reward?, tx_hash?, review_note? }
 *   POST /api/admin/bounties/block { value, reason?, unblock? }
 *
 * Admins: wallets in BOUNTY_ADMINS (comma list), signed in as usual, or the ADMIN_TOKEN bearer for scripts.
 * Against farming (campaign-sybil checks): one X handle per wallet across all bounties, blocked wallets and handles
 * can't enter, 10 entries a day per wallet. The on-chain sybil check of winners stays a step before paying.
 * Tables in flybook/supabase/migrations/20261003140000_mine_bounties.sql.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export type BountiesDeps = {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  /** true when the request carries the ADMIN_TOKEN bearer (no throw) */
  isAdminToken: (req: IncomingMessage) => boolean;
  /** lowercase wallets allowed to run bounties */
  admins: string[];
  explorer: string;
};

const KINDS = ["contest", "apply"];
const CATEGORIES = ["content", "dev", "research", "art", "security", "community"];
const STATUSES = ["draft", "open", "closed", "done"];
const ENTRY_STATUSES = ["pending", "picked", "approved", "rejected", "paid"];
const HANDLE = /^@?([A-Za-z0-9_]{1,15})$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;
const PER_DAY = 10;

type Bounty = {
  id: number; title: string; kind: string; category: string; summary: string; details: string; reward: string;
  winners: number; deadline_ms: string | null; status: string; assignee: string | null; created_at_ms: string; updated_at_ms: string;
};
type Entry = {
  id: number; bounty_id: number; wallet: string; x_handle: string; stage: string; link: string; note: string; status: string;
  reward: string | null; tx_hash: string | null; review_note: string | null; created_at_ms: string; updated_at_ms: string;
};

export function createBounties(d: BountiesDeps) {
  const { pg, HttpError } = d;
  const admins = new Set(d.admins.map((w) => w.trim().toLowerCase()).filter((w) => ADDRESS.test(w)));

  const text = (raw: unknown, name: string, max: number, required = true) => {
    const s = String(raw ?? "").trim();
    if (required && !s) throw new HttpError(400, `${name} is required`);
    if (s.length > max) throw new HttpError(400, `${name}: at most ${max} characters`);
    return s;
  };
  const link = (raw: unknown) => {
    const s = text(raw, "link", 400);
    let u: URL;
    try { u = new URL(s); } catch { throw new HttpError(400, "link: a full https:// address"); }
    if (u.protocol !== "https:") throw new HttpError(400, "link: a full https:// address");
    return u.toString();
  };
  const num = (v: string | number | null) => (v === null ? null : Number(v));
  const bountyOut = (b: Bounty) => ({ ...b, deadline_ms: num(b.deadline_ms), created_at_ms: num(b.created_at_ms), updated_at_ms: num(b.updated_at_ms) });
  const entryOut = (e: Entry) => ({ ...e, created_at_ms: num(e.created_at_ms), updated_at_ms: num(e.updated_at_ms) });

  /** Whether the request may run bounties: the admin token, or a signed-in admin wallet. */
  async function isAdmin(req: IncomingMessage): Promise<boolean> {
    if (d.isAdminToken(req)) return true;
    if (!admins.size || !req.headers["x-flyai-session"]) return false;
    try { return admins.has((await d.sessionWallet(req)).toLowerCase()); } catch { return false; }
  }
  async function adminOnly(req: IncomingMessage) {
    if (!(await isAdmin(req))) throw new HttpError(403, "bounty admins only");
  }

  /** The public board: every bounty but drafts, newest first, with entry counts and the entries that won. */
  async function list() {
    const bounties = await pg.all<Bounty>(`select * from mine.bounties where status <> 'draft'
      order by case status when 'open' then 0 when 'closed' then 1 else 2 end, created_at_ms desc`);
    const counts = await pg.all<{ bounty_id: number; stage: string; n: number }>(
      `select bounty_id, stage, count(*)::int as n from mine.bounty_entries where status <> 'rejected' group by bounty_id, stage`);
    // winners are public (handle, link, reward, tx); wallets shortened; pending work stays private so nobody copies it
    const won = await pg.all<Entry>(`select * from mine.bounty_entries where status in ('approved', 'paid', 'picked') order by updated_at_ms`);
    return {
      explorer: d.explorer,
      bounties: bounties.map((b) => ({
        ...bountyOut(b),
        assignee: b.assignee ? short(b.assignee) : null,
        entries: counts.filter((c) => c.bounty_id === b.id && c.stage !== "final").reduce((x, c) => x + c.n, 0),
        winners_list: won.filter((e) => e.bounty_id === b.id).map((e) => ({
          x_handle: e.x_handle, wallet: short(e.wallet), stage: e.stage, status: e.status,
          link: e.status === "picked" ? null : e.link, reward: e.reward, tx_hash: e.tx_hash,
        })),
      })),
    };
  }

  async function mine(req: IncomingMessage) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const rows = await pg.all<Entry>("select * from mine.bounty_entries where wallet = ? order by created_at_ms desc", me);
    return { wallet: me, admin: await isAdmin(req), entries: rows.map(entryOut) };
  }

  async function enter(req: IncomingMessage, body: any) {
    const me = (await d.sessionWallet(req)).toLowerCase();
    const id = Number(body?.bounty);
    const handle = HANDLE.exec(String(body?.x_handle ?? "").trim())?.[1]?.toLowerCase();
    if (!handle) throw new HttpError(400, "your X handle, like @flydotai");
    const url = link(body?.link);
    const note = text(body?.note, "note", 2000, false);
    const blocked = await pg.one("select value from mine.bounty_blocked where value in (?, ?)", me, handle);
    if (blocked) throw new HttpError(403, "this wallet or X account can't enter bounties");
    return pg.tx(async (q) => {
      const b = await q.one<Bounty>("select * from mine.bounties where id = ? for update", id);
      if (!b || b.status === "draft") throw new HttpError(404, "no such bounty");
      // the picked applicant hands in the final work; everyone else enters or applies while it is open
      const final = b.kind === "apply" && b.assignee === me;
      const stage = final ? "final" : b.kind === "apply" ? "apply" : "entry";
      if (!final) {
        if (b.status !== "open") throw new HttpError(409, "this bounty is closed");
        if (b.deadline_ms !== null && Date.now() > Number(b.deadline_ms)) throw new HttpError(409, "the deadline has passed");
        if (b.kind === "apply" && b.assignee) throw new HttpError(409, "someone has already been picked for this one");
      } else if (b.status === "done") throw new HttpError(409, "this bounty is done");
      // one X account per wallet, on every bounty
      const other = await q.one<{ wallet: string }>("select wallet from mine.bounty_entries where x_handle = ? and wallet <> ? limit 1", handle, me);
      if (other) throw new HttpError(409, "that X account is already used by another wallet");
      const mineHandle = await q.one<{ x_handle: string }>("select x_handle from mine.bounty_entries where wallet = ? and x_handle <> ? limit 1", me, handle);
      if (mineHandle) throw new HttpError(409, `this wallet entered as @${mineHandle.x_handle}: one X account per wallet`);
      const had = await q.one<Entry>("select * from mine.bounty_entries where bounty_id = ? and wallet = ? and stage = ?", id, me, stage);
      if (had && had.status !== "pending") throw new HttpError(409, "your entry has been reviewed already");
      const now = Date.now();
      if (!had) {
        const today = await q.one<{ n: number }>("select count(*)::int as n from mine.bounty_entries where wallet = ? and created_at_ms > ?", me, now - 86_400_000);
        if ((today?.n ?? 0) >= PER_DAY) throw new HttpError(429, `at most ${PER_DAY} entries a day`);
      }
      const row = await q.one<Entry>(`insert into mine.bounty_entries (bounty_id, wallet, x_handle, stage, link, note, created_at_ms, updated_at_ms)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (bounty_id, wallet, stage) do update set x_handle = excluded.x_handle, link = excluded.link, note = excluded.note,
          updated_at_ms = excluded.updated_at_ms
        returning *`, id, me, handle, stage, url, note, now, now);
      return entryOut(row!);
    }, `bounty:${id}`);
  }

  // ---- admin ---------------------------------------------------------------------------------------------------------
  async function adminList() {
    const [bounties, entries, blocked] = await Promise.all([
      pg.all<Bounty>("select * from mine.bounties order by created_at_ms desc"),
      pg.all<Entry>("select * from mine.bounty_entries order by created_at_ms"),
      pg.all<{ value: string; reason: string }>("select value, reason from mine.bounty_blocked order by created_at_ms desc"),
    ]);
    // a hint for the sybil check: wallets that entered many bounties at once are listed with their count
    const per = new Map<string, number>();
    for (const e of entries) per.set(e.wallet, (per.get(e.wallet) ?? 0) + 1);
    return {
      explorer: d.explorer, blocked,
      bounties: bounties.map(bountyOut),
      entries: entries.map((e) => ({ ...entryOut(e), wallet_entries: per.get(e.wallet) ?? 0 })),
    };
  }

  async function save(body: any) {
    const kind = String(body?.kind ?? "");
    const category = String(body?.category ?? "");
    const status = String(body?.status ?? "draft");
    if (!KINDS.includes(kind)) throw new HttpError(400, `kind: ${KINDS.join(" or ")}`);
    if (!CATEGORIES.includes(category)) throw new HttpError(400, `category: one of ${CATEGORIES.join(", ")}`);
    if (!STATUSES.includes(status)) throw new HttpError(400, `status: one of ${STATUSES.join(", ")}`);
    const winners = Math.trunc(Number(body?.winners ?? 1));
    if (!(winners >= 1 && winners <= 100)) throw new HttpError(400, "winners: 1-100");
    const deadline = body?.deadline_ms === null || body?.deadline_ms === undefined || body?.deadline_ms === "" ? null : Math.trunc(Number(body.deadline_ms));
    if (deadline !== null && !(deadline > 0)) throw new HttpError(400, "deadline_ms: a time in ms, or null");
    const f = [text(body?.title, "title", 120), kind, category, text(body?.summary, "summary", 300),
      text(body?.details, "details", 8000, false), text(body?.reward, "reward", 80), winners, deadline, status] as const;
    const now = Date.now();
    if (body?.id) {
      const row = await pg.one<Bounty>(`update mine.bounties set title = ?, kind = ?, category = ?, summary = ?, details = ?, reward = ?,
        winners = ?, deadline_ms = ?, status = ?, updated_at_ms = ? where id = ? returning *`, ...f, now, Number(body.id));
      if (!row) throw new HttpError(404, "no such bounty");
      return bountyOut(row);
    }
    const row = await pg.one<Bounty>(`insert into mine.bounties (title, kind, category, summary, details, reward, winners, deadline_ms, status,
      created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning *`, ...f, now, now);
    return bountyOut(row!);
  }

  /** Review an entry: approve/reject/pick, set what it won, record the payout tx (which marks it paid). */
  async function review(body: any) {
    const id = Number(body?.id);
    return pg.tx(async (q) => {
      const e = await q.one<Entry>("select * from mine.bounty_entries where id = ? for update", id);
      if (!e) throw new HttpError(404, "no such entry");
      const b = (await q.one<Bounty>("select * from mine.bounties where id = ? for update", e.bounty_id))!;
      let status = body?.status === undefined ? e.status : String(body.status);
      if (!ENTRY_STATUSES.includes(status)) throw new HttpError(400, `status: one of ${ENTRY_STATUSES.join(", ")}`);
      if (status === "picked") {
        if (e.stage !== "apply") throw new HttpError(400, "only an application can be picked");
        if (b.assignee && b.assignee !== e.wallet) throw new HttpError(409, "another applicant is picked: un-pick them first");
      }
      const tx = body?.tx_hash === undefined ? e.tx_hash : (String(body.tx_hash ?? "").trim() || null);
      if (tx !== null && !TX.test(tx)) throw new HttpError(400, "tx_hash: 0x + 64 hex characters");
      if (tx && body?.status === undefined) status = "paid";
      if (status === "paid" && !tx) throw new HttpError(400, "paid needs the payout tx_hash");
      const reward = body?.reward === undefined ? e.reward : (text(body.reward, "reward", 80, false) || null);
      const note = body?.review_note === undefined ? e.review_note : (text(body.review_note, "review_note", 1000, false) || null);
      const row = await q.one<Entry>(`update mine.bounty_entries set status = ?, reward = ?, tx_hash = ?, review_note = ?, updated_at_ms = ?
        where id = ? returning *`, status, reward, tx, note, Date.now(), id);
      // picking sets the bounty's assignee; moving the pick away clears it
      if (status === "picked" && b.assignee !== e.wallet) await q.run("update mine.bounties set assignee = ?, updated_at_ms = ? where id = ?", e.wallet, Date.now(), b.id);
      if (e.status === "picked" && status !== "picked" && e.stage === "apply" && b.assignee === e.wallet) {
        await q.run("update mine.bounties set assignee = null, updated_at_ms = ? where id = ?", Date.now(), b.id);
      }
      return entryOut(row!);
    }, `bounty-entry:${id}`);
  }

  async function block(body: any) {
    const raw = String(body?.value ?? "").trim().toLowerCase();
    const value = ADDRESS.test(raw) ? raw : HANDLE.exec(raw)?.[1]?.toLowerCase();
    if (!value) throw new HttpError(400, "value: a wallet address or an X handle");
    if (body?.unblock) await pg.run("delete from mine.bounty_blocked where value = ?", value);
    else await pg.run(`insert into mine.bounty_blocked (value, reason, created_at_ms) values (?, ?, ?)
      on conflict (value) do update set reason = excluded.reason`, value, text(body?.reason, "reason", 200, false), Date.now());
    return { value, blocked: !body?.unblock };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/bounties") return d.send(res, 200, await list()), true;
    if (req.method === "GET" && p === "/api/bounties/mine") return d.send(res, 200, await mine(req)), true;
    if (req.method === "POST" && p === "/api/bounties/enter") return d.send(res, 200, await enter(req, await d.readJson(req))), true;
    if (!p.startsWith("/api/admin/bounties")) return false;
    await adminOnly(req);
    if (req.method === "GET" && p === "/api/admin/bounties") return d.send(res, 200, await adminList()), true;
    if (req.method === "POST" && p === "/api/admin/bounties") return d.send(res, 200, await save(await d.readJson(req))), true;
    if (req.method === "POST" && p === "/api/admin/bounties/entry") return d.send(res, 200, await review(await d.readJson(req))), true;
    if (req.method === "POST" && p === "/api/admin/bounties/block") return d.send(res, 200, await block(await d.readJson(req))), true;
    return false;
  }

  return { route };
}

function short(w: string) { return `${w.slice(0, 6)}…${w.slice(-4)}`; }
