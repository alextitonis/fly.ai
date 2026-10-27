/**
 * Fly Hunt (2026-10-27, flytrade/HUNT-PLAN.md, the user: "can buy 5 nfts for the winners, we can start 1 hunt and see if
 * it works"): clues across the site, one at a time. A signed-in wallet answers each clue to get the next; the first
 * `winners` wallets to answer the last one win a Trader Fly (sent by the team after the ring screen).
 *
 * The site's code is public (docs/ on GitHub), so nothing about the hunt is in it: the clues come from here one at a
 * time to the wallet that reached them, and the answers are kept only as salted hashes (mine.hunt_state "hunt"). Two
 * kinds of step take answers from live data, learned while the hunt runs (mine.hunt_state "live:<step>"):
 *   leader  the fly at the top of the Fly Wallets leaderboard (any tab) at any time since the start
 *   scan    a token scanned on /scan since a day before the start (its symbol or its name)
 * so a step that asks "right now" still counts an answer that was right a while ago.
 *
 * Guessing: one try every TRY_GAP_MS a wallet, WRONG_PER_HOUR wrong tries a step an hour.
 *
 *   GET  /api/hunt                 the hunt: window, steps, how many finished (and who, shortened), clue 1 once it starts
 *   GET  /api/hunt/me              the signed-in wallet: steps solved, its current clue, rank when done, tries left
 *   POST /api/hunt/answer { answer }
 *   GET  /api/admin/hunt           the setup (no hashes), finishers with every step's time, tries, live answers
 *   POST /api/admin/hunt { id, start, end, winners, steps: [{ clue: { en, es, ... }, answers: [...], live? }] }
 *
 * Tables in flybook/supabase/migrations/20261027160000_mine_hunt.sql.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import type { Pg } from "./pg.ts";

export const LANGS = ["en", "es", "ko", "tr", "zh-Hans", "zh-Hant"] as const;
export const TRY_GAP_MS = 10_000;
export const WRONG_PER_HOUR = 5;
const LIVE_KINDS = ["leader", "scan"] as const;
const TICK_MS = 600_000;
const LIVE_REFRESH_MS = 60_000;

type Clue = Partial<Record<(typeof LANGS)[number], string>>;
export type HuntStep = { clue: Clue; hashes: string[]; live?: (typeof LIVE_KINDS)[number] };
export type Hunt = { id: string; start: number; end: number; winners: number; salt: string; steps: HuntStep[] };

/** "#12", "$ABC", "x7 q2" -> "12", "abc", "x7q2": case, spaces, punctuation and a leading # / $ don't matter */
export const norm = (s: unknown) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[\s#$,._'"`·-]/g, "").slice(0, 80);
export const hashOf = (salt: string, answer: unknown) => createHash("sha256").update(`${salt}:${norm(answer)}`).digest("hex");
const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

/** a scan's title "RSTR (Robinhood Hat Strategy)" -> ["RSTR", "Robinhood Hat Strategy", the whole title] */
export function scanNames(title: string | null): string[] {
  if (!title) return [];
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(title);
  return [...new Set([title, ...(m ? [m[1], m[2]] : [])].map((x) => x.trim()).filter(Boolean))];
}

export function createHunt(d: {
  pg: Pg;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly: (req: IncomingMessage) => void;
  now?: () => number;
}) {
  const { pg, HttpError } = d;
  const now = d.now ?? Date.now;
  const getState = async <T>(key: string) => (await pg.one<{ value: T }>("select value from mine.hunt_state where key = ?", key))?.value;
  const setState = (key: string, value: unknown) => pg.run(`insert into mine.hunt_state (key, value, updated_at) values (?, ?::text::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`, key, JSON.stringify(value));

  let cached: { at: number; hunt: Hunt | null } | null = null;
  async function hunt(): Promise<Hunt | null> {
    if (cached && now() - cached.at < 30_000) return cached.hunt;
    const h = (await getState<Hunt>("hunt")) ?? null;
    cached = { at: now(), hunt: h };
    return h;
  }

  // ---- live answers ----
  async function liveAnswers(h: Hunt, kind: HuntStep["live"]): Promise<string[]> {
    if (kind === "leader") {
      const b = (await pg.one<{ value: any }>("select value from mine.vault_public where key = 'leaderboard'"))?.value ?? {};
      return ["all", "d7", "h24"].flatMap((tab) => (b[tab]?.[0]?.flies ?? []).map(String));
    }
    if (kind === "scan") {
      const rows = await pg.all<{ title: string | null }>(`select title from mine.scan_jobs where status = 'done' and kind = 'contract'
        and done_at > ?`, new Date(h.start - 86_400_000).toISOString());
      return rows.flatMap((r) => scanNames(r.title));
    }
    return [];
  }
  const liveAt = new Map<number, number>();
  async function learn(h: Hunt, step: number, force = false) {
    const s = h.steps[step - 1];
    if (!s?.live || (!force && now() - (liveAt.get(step) ?? 0) < LIVE_REFRESH_MS)) return;
    liveAt.set(step, now());
    const key = `live:${h.id}:${step}`;
    const have = new Set((await getState<string[]>(key)) ?? []);
    const before = have.size;
    for (const a of await liveAnswers(h, s.live)) if (norm(a)) have.add(hashOf(h.salt, a));
    if (have.size !== before) await setState(key, [...have]);
  }
  async function accepts(h: Hunt, step: number, answer: string): Promise<boolean> {
    const s = h.steps[step - 1];
    const x = hashOf(h.salt, answer);
    if (s.hashes.includes(x)) return true;
    if (!s.live) return false;
    const live = async () => ((await getState<string[]>(`live:${h.id}:${step}`)) ?? []).includes(x);
    if (await live()) return true;
    await learn(h, step);                                 // the leader may have changed since the last tick
    return live();
  }

  // ---- what a wallet sees ----
  async function finishers(h: Hunt) {
    return pg.all<{ wallet: string; at: string }>(`select wallet, at from mine.hunt_progress where hunt = ? and step = ?
      order by at, wallet`, h.id, h.steps.length);
  }
  async function publicView() {
    const h = await hunt();
    if (!h) return { on: false };
    const done = await finishers(h);
    return {
      on: true, id: h.id, start: h.start, end: h.end, winners: h.winners, steps: h.steps.length,
      started: now() >= h.start, ended: now() >= h.end,
      found: done.length,
      finishers: done.slice(0, h.winners).map((r, i) => ({ rank: i + 1, wallet: short(r.wallet), at: new Date(r.at).getTime() })),
      clue: now() >= h.start ? h.steps[0].clue : null,
    };
  }
  async function tries(h: Hunt, wallet: string, step: number) {
    const [last, wrong] = await Promise.all([
      pg.one<{ at: string }>("select at from mine.hunt_tries where hunt = ? and wallet = ? order by at desc limit 1", h.id, wallet),
      pg.one<{ n: number }>(`select count(*)::int as n from mine.hunt_tries where hunt = ? and wallet = ? and step = ? and not ok
        and at > ?`, h.id, wallet, step, new Date(now() - 3_600_000).toISOString()),
    ]);
    const waitGap = last ? Math.max(0, new Date(last.at).getTime() + TRY_GAP_MS - now()) : 0;
    let waitHour = 0;
    if ((wrong?.n ?? 0) >= WRONG_PER_HOUR) {
      const oldest = await pg.one<{ at: string }>(`select at from mine.hunt_tries where hunt = ? and wallet = ? and step = ? and not ok
        and at > ? order by at limit 1`, h.id, wallet, step, new Date(now() - 3_600_000).toISOString());
      waitHour = oldest ? Math.max(0, new Date(oldest.at).getTime() + 3_600_000 - now()) : 0;
    }
    return { left: Math.max(0, WRONG_PER_HOUR - (wrong?.n ?? 0)), wait_s: Math.ceil(Math.max(waitGap, waitHour) / 1000) };
  }
  async function solved(h: Hunt, wallet: string) {
    const rows = await pg.all<{ step: number; at: string }>("select step, at from mine.hunt_progress where hunt = ? and wallet = ? order by step",
      h.id, wallet);
    let n = 0;
    for (const r of rows) if (r.step === n + 1) n++;
    return { n, doneAt: rows.find((r) => r.step === h.steps.length)?.at ?? null };
  }
  async function rankOf(h: Hunt, wallet: string) {
    const done = await finishers(h);
    const i = done.findIndex((r) => r.wallet === wallet);
    return i < 0 ? null : i + 1;
  }
  async function me(wallet: string) {
    const h = await hunt();
    if (!h) return { on: false };
    const { n } = await solved(h, wallet);
    const done = n >= h.steps.length;
    return {
      on: true, id: h.id, started: now() >= h.start, ended: now() >= h.end, steps: h.steps.length, solved: n, done,
      clue: !done && now() >= h.start ? h.steps[n].clue : null,
      rank: done ? await rankOf(h, wallet) : null, winners: h.winners,
      tries: done ? null : await tries(h, wallet, n + 1),
    };
  }
  async function answer(wallet: string, body: any) {
    const h = await hunt();
    if (!h) throw new HttpError(404, "no hunt");
    if (now() < h.start) throw new HttpError(409, "the hunt hasn't started");
    if (now() >= h.end) throw new HttpError(409, "the hunt is over");
    const text = String(body?.answer ?? "").slice(0, 200);
    if (!norm(text)) throw new HttpError(400, "an answer, please");
    const { n } = await solved(h, wallet);
    if (n >= h.steps.length) return me(wallet);
    const step = n + 1;
    const t = await tries(h, wallet, step);
    if (t.wait_s > 0) return { ok: false, wait_s: t.wait_s, tries: t };
    const ok = await accepts(h, step, text);
    const at = new Date(now()).toISOString();
    await pg.run("insert into mine.hunt_tries (hunt, wallet, step, ok, answer, at) values (?, ?, ?, ?, ?, ?)", h.id, wallet, step, ok,
      text.slice(0, 80), at);
    if (!ok) return { ok: false, tries: await tries(h, wallet, step) };
    await pg.run("insert into mine.hunt_progress (hunt, wallet, step, at) values (?, ?, ?, ?) on conflict do nothing", h.id, wallet, step, at);
    if (step === h.steps.length) {
      const rank = await rankOf(h, wallet);
      if (rank !== null && rank <= h.winners) {
        await pg.run("insert into mine.notices (wallet, text, href) values (?, ?, ?)", wallet,
          `You finished the Fly Hunt #${rank}! The team checks the finishers, then sends your Trader Fly.`, "/hunt");
      }
    }
    return { ok: true, ...(await me(wallet)) };
  }

  // ---- the team's side ----
  async function setup(body: any) {
    const id = String(body?.id ?? "");
    if (!/^[a-z0-9-]{1,32}$/.test(id)) throw new HttpError(400, "id: a-z, 0-9, -");
    const start = Date.parse(body?.start), end = Date.parse(body?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new HttpError(400, "start / end: ISO times, end after start");
    const winners = Number(body?.winners);
    if (!Number.isInteger(winners) || winners < 1 || winners > 100) throw new HttpError(400, "winners: 1-100");
    const steps = body?.steps;
    if (!Array.isArray(steps) || !steps.length || steps.length > 20) throw new HttpError(400, "steps: 1-20");
    const old = await getState<Hunt>("hunt");
    const salt = old?.id === id ? old.salt : randomBytes(16).toString("hex");   // same hunt: the live answers stay valid
    const out: HuntStep[] = steps.map((s: any, i: number) => {
      const clue: Clue = {};
      for (const l of LANGS) if (typeof s?.clue?.[l] === "string" && s.clue[l].trim()) clue[l] = s.clue[l].trim().slice(0, 600);
      if (!clue.en) throw new HttpError(400, `step ${i + 1}: clue.en`);
      const live = s?.live === undefined || s?.live === null ? undefined : String(s.live);
      if (live !== undefined && !(LIVE_KINDS as readonly string[]).includes(live)) throw new HttpError(400, `step ${i + 1}: live is leader | scan`);
      const answers: string[] = (Array.isArray(s?.answers) ? s.answers : []).map(String).filter((a: string) => norm(a));
      if (!answers.length && !live) throw new HttpError(400, `step ${i + 1}: answers`);
      return { clue, hashes: [...new Set(answers.map((a) => hashOf(salt, a)))], ...(live ? { live: live as HuntStep["live"] } : {}) };
    });
    const h: Hunt = { id, start, end, winners, salt, steps: out };
    await setState("hunt", h);
    cached = null;
    for (let i = 1; i <= out.length; i++) if (out[i - 1].live) await learn(h, i, true);
    return adminView();
  }
  async function adminView() {
    const h = await hunt();
    if (!h) return { on: false };
    const [rows, tried, live] = await Promise.all([
      pg.all<{ wallet: string; step: number; at: string }>("select wallet, step, at from mine.hunt_progress where hunt = ? order by at", h.id),
      pg.all<{ wallet: string; n: number; wrong: number }>(`select wallet, count(*)::int as n, count(*) filter (where not ok)::int as wrong
        from mine.hunt_tries where hunt = ? group by wallet`, h.id),
      Promise.all(h.steps.map((s, i) => (s.live ? getState<string[]>(`live:${h.id}:${i + 1}`) : Promise.resolve(null)))),
    ]);
    const by = new Map<string, Record<number, string>>();
    for (const r of rows) (by.get(r.wallet) ?? by.set(r.wallet, {}).get(r.wallet)!)[r.step] = r.at;
    const tries = new Map(tried.map((t) => [t.wallet, t]));
    const players = [...by.entries()].map(([wallet, steps]) => ({ wallet, steps, solved: Object.keys(steps).length,
      done_at: steps[h.steps.length] ?? null, tries: tries.get(wallet)?.n ?? 0, wrong: tries.get(wallet)?.wrong ?? 0 }))
      .sort((a, b) => b.solved - a.solved || String(a.done_at ?? a.steps[a.solved]).localeCompare(String(b.done_at ?? b.steps[b.solved])));
    return {
      on: true, id: h.id, start: new Date(h.start).toISOString(), end: new Date(h.end).toISOString(), winners: h.winners,
      steps: h.steps.map((s, i) => ({ clue: s.clue, answers: s.hashes.length, live: s.live ?? null, live_answers: live[i]?.length ?? null })),
      players,
    };
  }

  let timer: NodeJS.Timeout | null = null;
  async function tick() {
    try {
      const h = await hunt();
      if (!h || now() < h.start - 3_600_000 || now() > h.end) return;
      for (let i = 1; i <= h.steps.length; i++) if (h.steps[i - 1].live) await learn(h, i, true);
    } catch (e) {
      console.error("hunt:", e instanceof Error ? e.message : e);
    }
  }
  function start(everyMs = Number(process.env.HUNT_TICK_MS ?? TICK_MS)) {
    if (timer) return;
    void tick();
    timer = setInterval(() => void tick(), everyMs);
    timer.unref();
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (req.method === "GET" && p === "/api/hunt") return d.send(res, 200, await publicView()), true;
    if (req.method === "GET" && p === "/api/hunt/me") return d.send(res, 200, await me((await d.sessionWallet(req)).toLowerCase())), true;
    if (req.method === "POST" && p === "/api/hunt/answer") {
      const w = (await d.sessionWallet(req)).toLowerCase();
      return d.send(res, 200, await answer(w, await d.readJson(req))), true;
    }
    if (p === "/api/admin/hunt") {
      d.adminOnly(req);
      if (req.method === "GET") return d.send(res, 200, await adminView()), true;
      if (req.method === "POST") return d.send(res, 200, await setup(await d.readJson(req))), true;
    }
    return false;
  }

  return { route, start, tick, publicView, me, answer, setup, adminView };
}
