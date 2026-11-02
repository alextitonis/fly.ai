/**
 * Fold and pack one finished house order, off the main thread: its settled outputs become one pack file, and a probe
 * order's also become a results table (src/fold.ts). Writes both into the blob folder under their own hashes, checks every
 * member of the pack reads back whole, and reports. It deletes nothing: the server does that once it has booked the pack.
 * Holds about one member in memory, plus a probe order's outputs while folding them.
 *
 * in:  workerData {db, blobsDir, connectome, order}
 * out: {skip} or {pack, table, placed, members, rawBytes, missing, totals}
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { setPriority } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { gunzipSync, gzipSync } from "node:zlib";
import { parseMeta } from "../../world/src/connectome.ts";
import { ATLAS_HEADER, ATLAS_PREFIX, atlasInputs, atlasLines, probeTable, readouts, runTotals, type OrderSpec, type Runs } from "./fold.ts";
import { decodePack, PackWriter, readMember } from "./pack.ts";
import { recordSets, type RecordSet } from "./probe.ts";

const { blobsDir, connectome, order } = workerData as { db: string; blobsDir: string; connectome: string; order: string };

// the machine has one CPU (2026-10-28): the mining thread goes first. On Linux, pid 0 is this thread alone
if (process.platform === "linux") setPriority(0, 19);

const db = new DatabaseSync(workerData.db, { readOnly: true });
const o = db.prepare("select spec, label from orders where id = ?").get(order) as { spec: string; label: string | null };
const rows = db.prepare(`select t.params, t.truth from order_tasks ot join tasks t on t.id = ot.task
  where ot.order_id = ? and ot.state = 2 and t.truth is not null order by ot.seq`).all(order) as { params: string; truth: string }[];
const packedAt = db.prepare("select pack, offset, length from blob_packed where hash = ?");

const spec = JSON.parse(o.spec) as OrderSpec & { kind: string };
const results = rows.map((r) => ({ index: JSON.parse(r.params).index as number, truth: JSON.parse(r.truth) as { output?: string; disputed?: { output?: string }[] } }));
const hashes = new Set<string>();
for (const { truth } of results) {
  if (truth.output) hashes.add(truth.output);
  for (const a of truth.disputed ?? []) if (a.output) hashes.add(a.output);
}

// an output may already be in a pack: this order's old one, or another finished order's
let oldPack: { pack: string; records: Map<string, Buffer> } | null = null;
function read(hash: string): Buffer | null {
  const path = join(blobsDir, hash);
  if (existsSync(path)) return readFileSync(path);
  const at = packedAt.get(hash) as { pack: string; offset: number | null; length: number | null } | undefined;
  if (!at || !existsSync(join(blobsDir, at.pack))) return null;
  if (at.offset !== null) return readMember(join(blobsDir, at.pack), at.offset, at.length!).get(hash) ?? null;
  if (oldPack?.pack !== at.pack) oldPack = { pack: at.pack, records: decodePack(readFileSync(join(blobsDir, at.pack))) };
  return oldPack.records.get(hash) ?? null;
}

const needTable = spec.kind === "probe";
const tmp = join(blobsDir, `${order}.pack.tmp`);
const writer = new PackWriter(tmp);
const probeBytes = new Map<string, Uint16Array>();
let missing = 0;
for (const hash of hashes) {
  const bytes = read(hash);
  if (!bytes) { missing++; continue; }
  writer.add(hash, bytes);
  if (needTable) probeBytes.set(hash, new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
}
db.close();
const pack = writer.close();

if (!writer.placed.length) {
  rmSync(tmp, { force: true });
  parentPort!.postMessage({ skip: "no outputs" });
} else {
  // every member reads back, every record matches its hash
  const seen = new Set<string>();
  let at = -1;
  for (const p of writer.placed) {
    if (p.offset === at) continue;
    at = p.offset;
    for (const hash of readMember(tmp, p.offset, p.length, true).keys()) seen.add(hash);
  }
  if (seen.size !== writer.placed.length) throw new Error(`pack read back ${seen.size} of ${writer.placed.length} records`);
  renameSync(tmp, join(blobsDir, pack.hash));

  let table: { hash: string; size: number } | null = null;
  let totals: Record<string, number> | null = null;
  if (needTable && missing === 0) {
    const raw = readFileSync(join(connectome, "meta.bin"));
    const buf = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
    const meta = parseMeta(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const side = ["", "L", "R"];
    const record = (spec.params as unknown as { record: RecordSet[] }).record;
    const sets = recordSets({ meta } as never, record).map((set, i) => ({
      name: record[i], neurons: Array.from(set, (n) => ({ type: meta.types[meta.typeIdx[n]], side: side[meta.side[n]] })),
    }));
    const groups = readouts({ sets });
    const runs: Runs = new Map();
    for (const { index, truth } of results) {
      const u = truth.output ? probeBytes.get(truth.output) : null;
      if (!u) continue; // a job that answered with an error, or was disputed: no one number to average
      const c = index % spec.per_seed;
      runs.set(c, [...(runs.get(c) ?? []), u]);
    }
    const atlas = o.label?.startsWith(`${ATLAS_PREFIX}/`);
    const { header, lines } = atlas
      ? { header: ATLAS_HEADER, lines: atlasLines(spec, groups, runs, atlasInputs(meta)) }
      : probeTable(spec, groups, runs);
    const file = gzipSync(`${[header, ...lines].join("\n")}\n`);
    const hash = createHash("sha256").update(file).digest("hex");
    writeFileSync(join(blobsDir, `${hash}.pack.tmp`), file);
    renameSync(join(blobsDir, `${hash}.pack.tmp`), join(blobsDir, hash));
    table = { hash, size: file.length };
    totals = { ...runTotals(runs), rows: lines.length };
  }
  parentPort!.postMessage({ pack, table, totals, placed: writer.placed, members: writer.members, rawBytes: writer.rawBytes, missing });
}
