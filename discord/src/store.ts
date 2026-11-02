// What has to outlive a restart: the day's read count, saved reads, the log of research verdicts. Plain files on the Fly volume
// (fly.toml [mounts], DATA_DIR). No DATA_DIR, or a failed write: everything still works, it's just forgotten on restart.
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = process.env.DATA_DIR ?? null;

export async function load<T>(name: string, fallback: T): Promise<T> {
  if (!DIR) return fallback;
  return readFile(join(DIR, name), "utf8").then((s) => JSON.parse(s) as T).catch(() => fallback);
}

export async function save(name: string, value: unknown): Promise<void> {
  if (!DIR) return;
  const path = join(DIR, name), tmp = `${path}.tmp`;   // a crash mid-write leaves the old file whole
  await mkdir(DIR, { recursive: true }).then(() => writeFile(tmp, JSON.stringify(value))).then(() => rename(tmp, path))
    .catch((err) => console.error("save failed", name, (err as Error).message));
}

export async function append(name: string, row: unknown): Promise<void> {
  if (!DIR) return;
  await mkdir(DIR, { recursive: true }).then(() => appendFile(join(DIR, name), `${JSON.stringify(row)}\n`))
    .catch((err) => console.error("append failed", name, (err as Error).message));
}

export async function lines<T>(name: string): Promise<T[]> {
  if (!DIR) return [];
  const text = await readFile(join(DIR, name), "utf8").catch(() => "");
  return text.split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as T]; } catch { return []; } });
}
