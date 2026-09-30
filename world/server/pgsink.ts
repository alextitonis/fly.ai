/**
 * The world's records straight into Postgres through Supabase's pooler, no PostgREST in between (2026-09-30: the REST
 * layer answered PGRST002 / 503 for hours while the database itself only crawled; direct SQL kept working).
 * Same interface as SupabaseSink (sink.ts); used when SUPABASE_DB_URL is set. `postgres` (porsager) is the one
 * runtime dependency (server/package.json, installed by the Dockerfile).
 */
import type { Checkpoint, DbRow, Sink, TableName } from "./sink.ts";

const JSON_COLUMNS = new Set(["row", "config"]);       // the jsonb columns of the world_* tables

type Sql = any; // postgres.js is loaded lazily: a files-sink run needs no dependency installed

export class PgSink implements Sink {
  readonly kind = "postgres";
  private sql: Sql;

  private constructor(sql: Sql) { this.sql = sql; }

  static async connect(url: string): Promise<PgSink> {
    const { default: postgres } = await import("postgres");
    // prepare:false - the pooler (transaction mode) does not keep prepared statements; two connections are plenty
    return new PgSink(postgres(url, { max: 2, prepare: false, ssl: "require", connect_timeout: 30, idle_timeout: 60,
      connection: { statement_timeout: 120_000 } }));
  }

  private cells(rows: DbRow[], cols: string[]): DbRow[] {
    return rows.map((r) => Object.fromEntries(cols.map((c) =>
      [c, JSON_COLUMNS.has(c) && r[c] !== undefined && r[c] !== null ? this.sql.json(r[c] as never) : r[c] ?? null])));
  }

  async latestCheckpoint(): Promise<Checkpoint | null> {
    const rows = await this.sql`select run_id, t, data from world_checkpoints order by created_at desc limit 1`;
    return rows.length ? { runId: rows[0].run_id, t: Number(rows[0].t), data: rows[0].data } : null;
  }

  async createRun(seed: number, gitSha: string, config: DbRow): Promise<string> {
    const rows = await this.sql`insert into world_runs (seed, git_sha, config) values (${seed}, ${gitSha}, ${this.sql.json(config as never)}) returning id`;
    return rows[0].id;
  }

  async insert(table: TableName, rows: DbRow[]): Promise<void> {
    if (!rows.length) return;
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    for (let i = 0; i < rows.length; i += 500) {
      await this.sql`insert into ${this.sql(table)} ${this.sql(this.cells(rows.slice(i, i + 500), cols), ...cols)}`;
    }
  }

  async upsert(table: TableName, rows: DbRow[], onConflict: string): Promise<void> {
    if (!rows.length) return;
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const keys = onConflict.split(",");
    const set = cols.filter((c) => !keys.includes(c)).map((c) => `"${c}" = excluded."${c}"`).join(", ");
    for (let i = 0; i < rows.length; i += 500) {
      const batch = this.cells(rows.slice(i, i + 500), cols);
      if (set) {
        await this.sql`insert into ${this.sql(table)} ${this.sql(batch, ...cols)} on conflict (${this.sql(keys)}) do update set ${this.sql.unsafe(set)}`;
      } else {
        await this.sql`insert into ${this.sql(table)} ${this.sql(batch, ...cols)} on conflict (${this.sql(keys)}) do nothing`;
      }
    }
  }

  async saveCheckpoint(runId: string, t: number, data: string, keep: number): Promise<void> {
    await this.sql`insert into world_checkpoints (run_id, t, bytes, data) values (${runId}, ${t}, ${data.length}, ${data})`;
    await this.sql`delete from world_checkpoints where id in (
      select id from world_checkpoints where run_id = ${runId} order by created_at desc offset ${keep})`;
  }
}
