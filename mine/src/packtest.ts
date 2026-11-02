/**
 * Finished house orders folded and packed, on a real server: probe outputs become one pack and a results table, their
 * separate files go and the store shrinks, old links still answer with the same bytes, an output shared by two orders
 * survives both, unfinished orders are left alone, and pull-house gets it all from the pack. Then at production's scale
 * (677k order_inputs rows, 2026-11-02: the first version stalled the mining thread 200 s on them): a big order packs with
 * the API answering, and a first-version pack (one gzip, no offsets) is rewritten.
 *
 *   npm run test:pack
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { fixedFrom } from "./fixed.ts";
import { loadModel } from "./load.ts";
import { decodePack, PackWriter, readMember } from "./pack.ts";
import { startPg } from "./pgtest.ts";
import { recordSets, runProbe, type ProbeParams } from "./probe.ts";

const PORT = 8789;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-packtest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-packtest-blobs-${process.pid}`);
const OUT = join(tmpdir(), `mine-packtest-out-${process.pid}`);
const BIG_JOBS = 3000;
const BIG_INPUTS = 700_000;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const api = async (path: string, body?: unknown, auth?: string) => {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) as any };
};
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const fetchBytes = async (url: string) => {
  const res = await fetch(BASE + url);
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
};

// the format, no server
mkdirSync(OUT, { recursive: true });
const a = Buffer.from("first"), b = Buffer.alloc(300_000, 7), c = Buffer.alloc(9000, 3);
const file = join(OUT, "format.pack");
const writer = new PackWriter(file);
writer.add(sha(a), a);
writer.add(sha(b), b); // past the member size: a second member starts after this
writer.add(sha(c), c);
const written = writer.close();
const whole = readFileSync(file);
const back = decodePack(whole, true);
check("a pack gunzipped whole has every record, and its own hash", back.get(sha(a))!.equals(a) && back.get(sha(b))!.equals(b) && back.get(sha(c))!.equals(c) && sha(whole) === written.hash);
const atC = writer.placed.find((p) => p.hash === sha(c))!;
check("one output reads from its member alone", writer.members === 2 && readMember(file, atC.offset, atC.length, true).get(sha(c))!.equals(c) && atC.offset > 0 && !readMember(file, atC.offset, atC.length).has(sha(a)), JSON.stringify(writer.placed.map((p) => p.offset)));
let caught = false;
try { decodePack(gzipSync(Buffer.concat([Buffer.from(sha(a), "hex"), Buffer.from([9000 & 255, 9000 >> 8, 0, 0]), c])), true); } catch { caught = true; }
check("a record that doesn't match its hash is refused", caught);

let server: ReturnType<typeof spawn> | null = null;
let packStartAfter = 0;
const LOG = join(OUT, "server.log");
const logFd = openSync(LOG, "a");
const PG = await startPg(5541);
const start = async () => {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "20", ADMIN_TOKEN: ADMIN, MIN_CHECKED: "1",
      PACK_ORDERS: "1", PACK_AFTER_HOURS: "0", PACK_START_AFTER_S: String(packStartAfter) },
    stdio: ["ignore", logFd, logFd],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
};
const stop = async () => {
  const dead = new Promise((r) => server!.once("exit", r));
  server!.kill();
  await dead;
};

try {
  await start();
  const conditions = [{ name: "nothing", stimuli: [] }, { name: "threat", stimuli: [{ sense: "threat", amount: 0.8, from: 10, to: 40 }] }];
  const spec = { kind: "probe", seeds: 2, seed_base: 7, steps: 40, bin_steps: 10, record: ["descending", "wing"], conditions };
  const first = (await api("/api/admin/house", { label: "encoding/one", spec, max_parallel: 8 }, ADMIN)).json;
  // the same jobs again: its outputs are the same files, and it can only be packed with the first's already gone
  const twin = (await api("/api/admin/house", { label: "encoding/two", spec, max_parallel: 8 }, ADMIN)).json;
  const held = (await api("/api/admin/house", { label: "encoding/held", spec: { ...spec, seed_base: 900 }, max_parallel: 1 }, ADMIN)).json;
  check("three probe orders start", first?.jobs === 4 && twin?.jobs === 4 && held?.jobs === 4, JSON.stringify([first?.error, twin?.error, held?.error]));
  const atlasOrder = (await api("/api/admin/house", { label: "atlas/sensory-dn-1/p00", max_parallel: 8, spec: { kind: "probe", seeds: 1, seed_base: 11, steps: 30, bin_steps: 10, record: ["descending", "wing"],
    conditions: [{ name: "nothing", stimuli: [] }, { name: "i0-L-0_8", stimuli: [{ types: ["LC4"], side: "L", amount: 0.8, from: 10, to: 30 }] }] } }, ADMIN)).json;
  check("and an atlas order", atlasOrder?.jobs === 2, JSON.stringify(atlasOrder?.error));

  const register = async () => (await api("/api/register", {})).json.token as string;
  const [ta, tb] = [await register(), await register()];
  const model = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
  const fx = fixedFrom(model.w.lut, model.meta.params);
  const answer = (j: any) => {
    const { kind: _k, index: _i, timeout_s: _t, max_output: _m, condition: _c, ...p } = j.params;
    return { output: Buffer.from(runProbe(model, fx, p as ProbeParams)).toString("base64") };
  };
  const settleSome = async () => {
    for (const t of [ta, tb]) {
      const jobs = ((await api("/api/claim", { count: 8, kinds: ["probe"], open_max: 8 }, t)).json?.jobs ?? []) as any[];
      for (const j of jobs.filter((x) => x.params.seed < 900)) await api("/api/submit", { job: j.job, result: answer(j) }, t);
      await api("/api/release", { jobs: jobs.filter((x) => x.params.seed >= 900).map((x) => x.job) }, t);
    }
  };
  for (let i = 0; i < 8; i++) {
    await settleSome();
    const [o, w, x] = await Promise.all([first.id, twin.id, atlasOrder.id].map(async (id) => (await api(`/api/orders/${id}`)).json));
    if (o.status === "done" && w.status === "done" && x.status === "done") break;
  }
  const before = (await api(`/api/orders/${first.id}/results`)).json;
  const beforeTwin = (await api(`/api/orders/${twin.id}/results`)).json;
  check("the two orders settle", before.status === "done" && beforeTwin.status === "done" && before.rows.length === 4, before.status);
  const originals = new Map<string, Buffer>();
  for (const r of before.rows) originals.set(r.output.hash, (await fetchBytes(r.output.url)).bytes);

  const packOf = async (id: string) => ((await api("/api/house")).json.orders as any[]).find((o) => o.id === id);
  let one: any = null, two: any = null;
  for (let i = 0; i < 40 && !(one?.pack && two?.pack); i++) {
    await sleep(3000);
    [one, two] = [await packOf(first.id), await packOf(twin.id)];
  }
  check("finished orders get a pack and a table on their own", !!one?.pack && !!two?.pack && !!one?.table, JSON.stringify(one?.pack));
  check("the pack lists every output", one?.pack.files === 4 && one?.pack.missing === 0, JSON.stringify(one?.pack));
  check("the unfinished order is left alone", !(await packOf(held.id)).pack);
  await sleep(1000);

  const left = readdirSync(BLOBS).filter((f) => originals.has(f));
  check("the separate files are gone", left.length === 0, `${left.length} left`);
  const db = new DatabaseSync(DB, { readOnly: true });
  const rows = (db.prepare("select count(*) as n from blobs where hash in (select hash from blob_packed)").get() as { n: number }).n;
  const pending = (db.prepare("select count(*) as n from order_packs where cleared = 0 and pack is not null").get() as { n: number }).n;
  db.close();
  check("and their rows, so the store counts less", rows === 0 && pending === 0, JSON.stringify({ rows, pending }));

  let same = true;
  for (const [hash, bytes] of originals) {
    const got = await fetchBytes(`/api/blobs/${hash}`);
    if (got.status !== 200 || !got.bytes.equals(bytes)) same = false;
  }
  check("old links still answer with the same bytes", same);
  const after = (await api(`/api/orders/${first.id}/results`)).json;
  check("result rows don't change", JSON.stringify(after.rows) === JSON.stringify(before.rows));
  check("an output two orders share is in both packs", decodePack((await fetchBytes(two.pack.url)).bytes, true).size === originals.size, `${two.pack.files} files`);

  const csv = gunzipSync((await fetchBytes(one.table.url)).bytes).toString().trim().split("\n");
  const head = csv[0].split(",");
  check("the table has a mean and sd per bin", head.includes("hz_bin0") && head.includes("hz_bin3") && head.includes("sd_bin3") && head.includes("readout_type"), csv[0]);
  check("and counts what it read", one.table.conditions === 2 && one.table.jobs === 4 && one.table.seeds_min === 2 && one.table.seeds_max === 2 && one.table.rows === csv.length - 1, JSON.stringify(one.table));

  // the first group of the "threat" condition, worked out by hand from the same outputs
  const [dn] = recordSets(model, ["descending"]);
  const threat = before.rows.filter((r: any) => r.index % 2 === 1);
  const firstType = model.meta.typeIdx[dn[0]], firstSide = model.meta.side[dn[0]];
  const columns = Array.from(dn.keys()).filter((i) => model.meta.typeIdx[dn[i]] === firstType && model.meta.side[dn[i]] === firstSide);
  const width = originals.get(threat[0].output.hash)!.length / 2 / 4;
  const rate = threat.map((r: any) => {
    const raw = originals.get(r.output.hash)!;
    const u = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
    return columns.reduce((s, col) => s + u[2 * width + col], 0) / (10 * 0.02 * columns.length);
  });
  const want = Math.round((rate[0] + rate[1]) / 2 * 1000) / 1000;
  const row = csv.slice(1).find((l) => l.startsWith("threat,"))!;
  const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, ""));
  check("a table row is the mean rate of its seeds", Number(cells[head.indexOf("hz_bin2")]) === want, `${cells[head.indexOf("hz_bin2")]} vs ${want}`);

  let atlasRow: any = null;
  for (let i = 0; i < 40 && !atlasRow?.table; i++) {
    await sleep(3000);
    atlasRow = await packOf(atlasOrder.id);
  }
  const atlasCsv = atlasRow?.table ? gunzipSync((await fetchBytes(atlasRow.table.url)).bytes).toString().trim().split("\n") : [];
  const lc4 = atlasCsv.find((l) => l.includes(",LC4,L,"));
  check("an atlas order's table has the atlas's columns, input class and all", atlasCsv[0]?.startsWith("input_class,input_type,input_side,input_cells,amount,") && atlasCsv[0].endsWith("delta_sd_hz") && !!lc4 && !lc4.startsWith(",") && atlasCsv.some((l) => l.startsWith("none,none,")), lc4);

  execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("../scripts/pull-house.ts", import.meta.url)), "--server", BASE, "--out", OUT, "--label", "encoding/one"], { stdio: "ignore" });
  const dir = join(OUT, "encoding/one", first.id);
  const files = readdirSync(join(dir, "outputs")).filter((f) => f.endsWith(".u16"));
  const intact = before.rows.every((r: any) => sha(readFileSync(join(dir, "outputs", `${r.seq}.u16`))) === r.output.hash);
  check("pull-house writes every output from the pack, and the table", files.length === 4 && intact && existsSync(join(dir, "table.csv.gz")) && readFileSync(join(dir, "results.jsonl"), "utf8").trim().split("\n").length === 4);

  // ---- production's scale, and a pack from the first version --------------------------------------------------------
  await stop();
  const rw = new DatabaseSync(DB);
  rw.exec("begin");
  // the first order's pack as v167 wrote it: one gzip, no offsets
  // (reversed: in the same order it would be this order's real pack, byte for byte)
  const legacyFile = gzipSync(Buffer.concat([...originals].reverse().flatMap(([hash, bytes]) => {
    const h = Buffer.alloc(36);
    h.write(hash, 0, 32, "hex");
    h.writeUInt32LE(bytes.length, 32);
    return [h, bytes];
  })));
  const legacy = sha(legacyFile);
  writeFileSync(join(BLOBS, legacy), legacyFile);
  const now = Date.now();
  rw.prepare("insert into blobs (hash, size, created_at, used_at, keep) values (?, ?, ?, ?, 1)").run(legacy, legacyFile.length, now, now);
  rw.prepare("update order_packs set pack = ?, members = 0, cleared = 1 where order_id in (?, ?)").run(legacy, first.id, twin.id);
  for (const hash of originals.keys()) rw.prepare("update blob_packed set pack = ?, offset = null, length = null where hash = ?").run(legacy, hash);

  // a big finished order, cloned from a real job, with outputs of the real size
  const sample = originals.values().next().value as Buffer;
  const orderCols = (rw.prepare("pragma table_info(orders)").all() as { name: string }[]).map((x) => x.name);
  const big = "00000000-0000-4000-8000-00000000b16b";
  const setOrder: Record<string, string> = { id: "?", label: "?", status: "'done'", closed_at: "0", jobs: String(BIG_JOBS) };
  rw.prepare(`insert into orders (${orderCols.join(",")}) select ${orderCols.map((x) => setOrder[x] ?? x).join(",")} from orders where id = ?`).run(big, "encoding/big", first.id);
  const taskCols = (rw.prepare("pragma table_info(tasks)").all() as { name: string }[]).map((x) => x.name).filter((x) => x !== "id");
  const task = rw.prepare(`select t.* from tasks t join order_tasks ot on ot.task = t.id where ot.order_id = ? limit 1`).get(first.id) as any;
  const addTask = rw.prepare(`insert into tasks (${taskCols.join(",")}) values (${taskCols.map(() => "?").join(",")}) returning id`);
  const addOt = rw.prepare("insert into order_tasks (order_id, task, state, seq) values (?, ?, 2, ?)");
  const addBlob = rw.prepare("insert into blobs (hash, size, created_at, used_at, keep) values (?, ?, ?, ?, 1)");
  const seqBase = (rw.prepare("select max(seq) as s from order_tasks").get() as { s: number }).s + 1;
  const bigHashes: string[] = [];
  const params = JSON.parse(task.params);
  for (let i = 0; i < BIG_JOBS; i++) {
    const bytes = Buffer.from(sample);
    bytes.writeUInt32LE(i, bytes.length - 4);
    const hash = sha(bytes);
    bigHashes.push(hash);
    writeFileSync(join(BLOBS, hash), bytes);
    addBlob.run(hash, bytes.length, now, now);
    const values = taskCols.map((col) => (col === "params" ? JSON.stringify({ ...params, seed: 2_000_000 + i, index: i })
      : col === "truth" ? JSON.stringify({ output: hash, size: bytes.length }) : task[col]));
    const { id } = addTask.get(...values) as { id: number };
    addOt.run(big, id, seqBase + i);
  }
  const addInput = rw.prepare("insert into order_inputs (order_id, idx, input) values (?, ?, ?)");
  for (let i = 0; i < BIG_INPUTS; i++) addInput.run(big, i, sha(Buffer.from(String(i))));
  rw.exec("commit");
  rw.close();

  // packing holds off while a start catches up, as in production, so what's measured below is the packing alone
  packStartAfter = 60;
  await start();
  // a first-version pack still reads, until it's rewritten
  const [oneHash, oneBytes] = originals.entries().next().value as [string, Buffer];
  const oldRead = await fetchBytes(`/api/blobs/${oneHash}`);
  await sleep(55_000);
  const untouched = await packOf(big);
  check("packing waits out a start's catch-up", !untouched?.pack);
  let worst = 0, packedBig: any = null;
  const t0 = Date.now();
  const slowCalls: string[] = [];
  while (Date.now() - t0 < 240_000) {
    const t = performance.now();
    const res = await api("/api/stats");
    const took = performance.now() - t;
    worst = Math.max(worst, took);
    if (took > 500) slowCalls.push(`${new Date().toISOString().slice(11, 19)} ${Math.round(took)} ms`);
    if (res.status !== 200) worst = Infinity;
    packedBig = await packOf(big);
    const peek = new DatabaseSync(DB, { readOnly: true });
    const open = (peek.prepare("select count(*) as n from order_packs where pack is not null and (cleared = 0 or members = 0)").get() as { n: number }).n;
    peek.close();
    if (packedBig?.pack && !open) break;
    await sleep(100);
  }
  check("a big order packs at production's scale", packedBig?.pack?.files === BIG_JOBS && packedBig?.pack?.missing === 0, JSON.stringify(packedBig?.pack));
  check("with the API answering throughout", worst < 1500, `worst ${Math.round(worst)} ms over ${Math.round((Date.now() - t0) / 1000)} s`);
  if (worst >= 1500) {
    console.log(`  started ${new Date(t0).toISOString().slice(11, 19)}; slow calls: ${slowCalls.join(", ")}`);
    console.log(readFileSync(LOG, "utf8").split("\n").filter((l) => /stalled|packed order|index|pack:|^  \d+\.\d%/.test(l)).slice(-40).join("\n"));
  }
  const gone = bigHashes.filter((h) => existsSync(join(BLOBS, h))).length;
  check("its separate files are gone", gone === 0, `${gone} left`);
  const probe = bigHashes[1234];
  const got = await fetchBytes(`/api/blobs/${probe}`);
  check("a big order's output reads from its pack", got.status === 200 && sha(got.bytes) === probe);

  const peek = new DatabaseSync(DB, { readOnly: true });
  const oldLeft = (peek.prepare("select count(*) as n from blob_packed where offset is null").get() as { n: number }).n;
  const members = (peek.prepare("select members from order_packs where order_id = ?").get(first.id) as { members: number }).members;
  peek.close();
  const newRead = await fetchBytes(`/api/blobs/${oneHash}`);
  check("a first-version pack reads, then is rewritten and removed", oldRead.bytes.equals(oneBytes) && newRead.bytes.equals(oneBytes) && oldLeft === 0 && members > 0 && !existsSync(join(BLOBS, legacy)), JSON.stringify({ oldLeft, members, stillThere: existsSync(join(BLOBS, legacy)) }));
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  await sleep(500);
  closeSync(logFd);
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* busy */ }
  rmSync(BLOBS, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "pack checks passed");
process.exit(failed ? 1 : 0);
