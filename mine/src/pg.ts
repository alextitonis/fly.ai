/**
 * The players' and money side in Postgres (Flybook's Supabase, schema `mine`; flybook/supabase/migrations/
 * 20260929180000_mine_money.sql): sessions, the ledger, withdrawals, earnings, snapshots, stake samples, FlightPass
 * and the games. The mining process kept all of it in the one SQLite file and, busy, held its write lock for seconds,
 * so sign-in and pass writes failed with "database is locked" (2026-09-29). Jobs, miners and orders stay in SQLite.
 *
 * The helpers read like the SQLite ones they replace: `?` placeholders, one/all/run, and a transaction that can take
 * per-key locks first. SQLite serialized every writer; here two requests can run at once, so anything that checks a
 * balance and then books against it runs in tx() under that wallet's lock (lockWallet), across both processes.
 */
import postgres from "postgres";

export type Arg = string | number | bigint | boolean | null;

export interface Q {
  one<T>(sql: string, ...args: Arg[]): Promise<T | undefined>;
  all<T>(sql: string, ...args: Arg[]): Promise<T[]>;
  /** rows changed */
  run(sql: string, ...args: Arg[]): Promise<number>;
}

export interface Pg extends Q {
  /** fn in one transaction, after taking an advisory lock per key (held until it ends; sorted, so no deadlocks) */
  tx<T>(fn: (q: Q) => Promise<T>, ...locks: string[]): Promise<T>;
  end(): Promise<void>;
}

/** `?` to `$1, $2, ...`, leaving quoted text and `--` comments alone (an apostrophe in a comment isn't a quote) */
export function numbered(sql: string): string {
  let n = 0, out = "", quote = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) { if (ch === quote) quote = ""; out += ch; continue; }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    // a comment runs to the end of the line: the same as a quote that a newline closes
    if (ch === "-" && sql[i + 1] === "-") { quote = "\n"; out += ch; continue; }
    out += ch === "?" ? `$${++n}` : ch;
  }
  return out;
}

const texts = new Map<string, string>();
const text = (sql: string) => {
  let t = texts.get(sql);
  if (t === undefined) { t = numbered(sql); if (texts.size < 2_000) texts.set(sql, t); }
  return t;
};
const params = (args: Arg[]) => args.map((a) => (typeof a === "bigint" ? a.toString() : a)) as any[];

/** A query (or a whole transaction) that got no answer in time: its connections are thrown away (connectPg). */
export class PgTimeout extends Error {}

function wrap(sql: () => postgres.Sql | postgres.TransactionSql, timed: <T>(p: Promise<T>, what: string) => Promise<T>): Q {
  // a Postgres error names no query of ours: add its first line, so a log says which one failed
  const exec = (q: string, args: Arg[]) => {
    const first = q.trim().split("\n")[0].slice(0, 120);
    return timed(sql().unsafe(text(q), params(args)) as unknown as Promise<postgres.RowList<postgres.Row[]>>, first).catch((err: Error) => {
      if (!(err instanceof PgTimeout)) err.message += ` [${first}]`;
      throw err;
    });
  };
  return {
    async one<T>(q: string, ...args: Arg[]) { return (await exec(q, args))[0] as T | undefined; },
    async all<T>(q: string, ...args: Arg[]) { return [...(await exec(q, args))] as T[]; },
    async run(q: string, ...args: Arg[]) { return (await exec(q, args)).count; },
  };
}

/**
 * Supabase's SESSION pooler instead of its transaction pooler (2026-10-03): through the transaction pooler (port 6543)
 * connections kept ending up "active, waiting on the client" mid-query (the 09-30 hang, and bursts of PgTimeout /
 * CONNECTION_DESTROYED every 10-30 minutes on 10-03 while Postgres itself idled and both ports answered in 0.1 s from
 * outside). The session pooler (5432, the same host and credentials) gives each connection its own server session.
 * Opt-in: PG_SESSION_POOLER=1 (see below).
 */
export function sessionPooler(url: string): string {
  // OFF unless PG_SESSION_POOLER=1: switched on by default 2026-10-03 11:00, the user process stopped answering at all
  // (every /api/vaults, /api/flightpass request timed out) and mine was rolled back at 11:05 - not safe until that's
  // understood (likely the session pooler's per-pool client limit across mine's 3 processes)
  if (process.env.PG_SESSION_POOLER !== "1") return url;
  return url.replace(/(pooler\.supabase\.com):6543\b/, "$1:5432");
}

/**
 * Straight to Postgres, past Supabase's pooler (2026-10-03): through the transaction pooler queries kept getting stuck
 * half-delivered - Postgres "active, waiting on the client" for up to 117 s on 0.1 ms queries - with pipelining off too,
 * and every query queued behind one timed out (PgTimeout / CONNECTION_DESTROYED every few minutes, the 09-30 hang).
 * From the mine machine the direct host answers in 2-3 ms. Same credentials: postgres.<ref>@pooler -> postgres@db.<ref>.
 * PG_DIRECT=0 keeps the pooler URL. Postgres allows 60 connections; mine's three processes take PG_POOL_MAX each.
 */
export function directUrl(url: string): string {
  if (process.env.PG_DIRECT === "0") return url;
  try {
    const u = new URL(url);
    const [user, ref] = decodeURIComponent(u.username).split(".");
    if (!ref || !u.hostname.endsWith("pooler.supabase.com")) return url;
    u.username = user;
    u.hostname = `db.${ref}.supabase.co`;
    u.port = "5432";
    return u.toString();
  } catch {
    return url;
  }
}

export function connectPg(url: string, o: { max?: number; queryTimeoutMs?: number; txTimeoutMs?: number } = {}): Pg {
  url = directUrl(sessionPooler(url));
  const direct = /db\.[a-z0-9]+\.supabase\.co/.test(url);
  const open = () => postgres(url, {
    // Supabase's pooler shares the database with Flybook (60 connections in all): a few each process is plenty
    // direct connections count against Postgres's own 60 (the pooler, Flybook, the desks share them): 4 a process
    max: o.max ?? Number(process.env.PG_POOL_MAX ?? (direct ? 4 : 8)),   // 5 -> 8 (2026-10-03): ~250 miners' polls queued on five
    // the Supabase pooler hands a connection to whoever asks next: no named prepared statements
    prepare: false,
    // one query at a time per connection (2026-10-03): postgres.js pipelines by default, and through Supabase's
    // transaction pooler a pipelined request sometimes lost its end - Postgres sat "active, waiting on the client"
    // (ClientRead) for 74 s on a 0.09 ms query of a one-row table, the connection's other queries timed out behind it
    // and the pool was dropped (the PgTimeout / CONNECTION_DESTROYED bursts; the 09-30 hang)
    ...({ max_pipeline: 1 } as object),   // a runtime option the package's types leave out (src/index.js)
    // connections are recycled before anything between here and Postgres can drop them silently (2026-10-03: bursts
    // of PgTimeout / CONNECTION_DESTROYED every few minutes while a fresh connection from the same machine answered in
    // 5 ms - a long-lived connection had gone dead and the next query waited 15 s on it): an idle one closes after
    // 20 s, every one after 5 minutes at most, and TCP keepalive probes an idle socket every 15 s
    idle_timeout: 20,
    max_lifetime: 5 * 60,
    keep_alive: 15,
    connect_timeout: 10,
    ...(direct ? { ssl: "require" as const } : {}),
    onnotice: () => {},
    // int8 (times in ms, counts) as numbers, as SQLite gave them; numeric (sums) stays text
    types: { bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) } } as any,
  });
  let sql = open();
  // 2026-09-30: the user process's five connections to the pooler all stopped answering (one was still "active,
  // waiting on the client" in Postgres 6.5 h later) and nothing here ever gives up on a query, so every request that
  // read Postgres - the leaderboard, claims, FlightPass, the games - hung for good while the process looked healthy.
  // Now a query unanswered for queryTimeoutMs fails, and the connections are dropped for fresh ones: what waited on
  // the old ones fails at once (callers retry or answer 5xx) instead of queueing behind a dead socket.
  const queryMs = o.queryTimeoutMs ?? Number(process.env.PG_QUERY_TIMEOUT_MS ?? 15_000);
  const txMs = o.txTimeoutMs ?? Number(process.env.PG_TX_TIMEOUT_MS ?? 45_000);
  // when Postgres last answered anything: a query that only waited its turn behind a busy pool is not a dead pool
  let lastAnswer = Date.now();
  const reset = (from: postgres.Sql, what: string, ms: number) => {
    if (from !== sql) return;                           // another timeout already replaced these connections
    // 2026-10-01: dropping every connection on any timeout failed everything queued behind it at once, and the
    // retries queued up again; now they are dropped only when nothing has answered for the whole limit
    if (Date.now() - lastAnswer < ms) return;
    console.warn(`postgres: no answer in time (${what}); reconnecting`);
    sql = open();
    void from.end({ timeout: 0 }).catch(() => {});
  };
  const timedOn = (ms: number) => <T>(p: Promise<T>, what: string): Promise<T> => {
    const from = sql;
    let timer: NodeJS.Timeout;
    return Promise.race([p, new Promise<never>((_, fail) => {
      timer = setTimeout(() => { reset(from, what, ms); fail(new PgTimeout(`the database didn't answer in ${ms / 1000} s [${what}]`)); }, ms);
    })]).then((v) => { lastAnswer = Date.now(); return v; }).finally(() => clearTimeout(timer));
  };
  const timed = timedOn(queryMs);
  const q = wrap(() => sql, timed);
  return {
    ...q,
    async tx<T>(fn: (q: Q) => Promise<T>, ...locks: string[]) {
      // the whole transaction has its own, longer limit (it may wait its turn on a wallet's lock); its queries have none
      // of their own, so a slow lock isn't mistaken for a dead connection
      const inTx = <U>(p: Promise<U>) => p;
      return timedOn(txMs)(sql.begin(async (t) => {
        for (const key of [...new Set(locks)].sort()) await t.unsafe("select pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
        return fn(wrap(() => t, inTx));
      }) as Promise<T>, "transaction");
    },
    end: () => sql.end({ timeout: 5 }),
  };
}

/** The lock every balance change of `wallet` (an address or pass:<id>) takes, in either process. */
export const lockWallet = (wallet: string) => `wallet:${wallet.toLowerCase()}`;
