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

export function connectPg(url: string, o: { max?: number; queryTimeoutMs?: number; txTimeoutMs?: number } = {}): Pg {
  const open = () => postgres(url, {
    // Supabase's transaction pooler (port 6543) shares its server connections with Flybook: a few each process is plenty
    max: o.max ?? 5,
    // the Supabase pooler hands a connection to whoever asks next: no named prepared statements
    prepare: false,
    idle_timeout: 60,
    connect_timeout: 10,
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
