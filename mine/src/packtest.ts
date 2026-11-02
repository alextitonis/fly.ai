/**
 * Finished house orders folded and packed, on a real server: probe outputs become one pack and a results table, their
 * separate files go and the store shrinks, old links still answer with the same bytes, an output shared by two orders
 * survives both, unfinished orders are left alone, and pull-house gets it all from the pack.
 *
 *   npm run test:pack
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { fixedFrom } from "./fixed.ts";
import { loadModel } from "./load.ts";
import { decodePack, encodePack } from "./pack.ts";
import { startPg } from "./pgtest.ts";
import { recordSets, runProbe, type ProbeParams } from "./probe.ts";

const PORT = 8789;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-packtest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-packtest-blobs-${process.pid}`);
const OUT = join(tmpdir(), `mine-packtest-out-${process.pid}`);
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
const a = Buffer.from("first"), b = Buffer.alloc(9000, 7);
const packed = encodePack([{ hash: sha(a), bytes: a }, { hash: sha(b), bytes: b }]);
const back = decodePack(packed, true);
check("a pack reads back whole, smaller", back.get(sha(a))!.equals(a) && back.get(sha(b))!.equals(b) && packed.length < b.length);
const wrong = encodePack([{ hash: sha(a), bytes: b }]);
let caught = false;
try { decodePack(wrong, true); } catch { caught = true; }
check("a record that doesn't match its hash is refused", caught);

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5536);
try {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "20", ADMIN_TOKEN: ADMIN, MIN_CHECKED: "1",
      PACK_ORDERS: "1", PACK_AFTER_HOURS: "0" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }

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
  for (let i = 0; i < 6; i++) {
    await settleSome();
    const o = (await api(`/api/orders/${first.id}`)).json;
    const w = (await api(`/api/orders/${twin.id}`)).json;
    if (o.status === "done" && w.status === "done") break;
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
  const pending = (db.prepare("select count(*) as n from order_packs where cleared = 0").get() as { n: number }).n;
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
    const b = originals.get(r.output.hash)!;
    const u = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    return columns.reduce((s, c) => s + u[2 * width + c], 0) / (10 * 0.02 * columns.length);
  });
  const want = Math.round((rate[0] + rate[1]) / 2 * 1000) / 1000;
  const row = csv.slice(1).find((l) => l.startsWith("threat,"))!;
  const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, ""));
  check("a table row is the mean rate of its seeds", Number(cells[head.indexOf("hz_bin2")]) === want, `${cells[head.indexOf("hz_bin2")]} vs ${want}`);

  let atlasRow: any = null;
  for (let i = 0; i < 40 && !atlasRow?.table; i++) {
    await settleSome();
    await sleep(3000);
    atlasRow = await packOf(atlasOrder.id);
  }
  const atlasCsv = atlasRow?.table ? gunzipSync((await fetchBytes(atlasRow.table.url)).bytes).toString().trim().split("\n") : [];
  const lc4 = atlasCsv.find((l) => l.startsWith("ol_sensory,LC4,") || l.includes(",LC4,L,"));
  check("an atlas order's table has the atlas's columns, input class and all", atlasCsv[0]?.startsWith("input_class,input_type,input_side,input_cells,amount,") && atlasCsv[0].endsWith("delta_sd_hz") && !!lc4 && !lc4.startsWith(",") && atlasCsv.some((l) => l.startsWith("none,none,")), lc4);

  execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("../scripts/pull-house.ts", import.meta.url)), "--server", BASE, "--out", OUT, "--label", "encoding/one"], { stdio: "ignore" });
  const dir = join(OUT, "encoding/one", first.id);
  const files = readdirSync(join(dir, "outputs")).filter((f) => f.endsWith(".u16"));
  const intact = before.rows.every((r: any) => sha(readFileSync(join(dir, "outputs", `${r.seq}.u16`))) === r.output.hash);
  check("pull-house writes every output from the pack, and the table", files.length === 4 && intact && existsSync(join(dir, "table.csv.gz")) && readFileSync(join(dir, "results.jsonl"), "utf8").trim().split("\n").length === 4);
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  await sleep(300);
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* busy */ }
  rmSync(BLOBS, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "pack checks passed");
process.exit(failed ? 1 : 0);
