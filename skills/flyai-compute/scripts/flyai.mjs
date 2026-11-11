#!/usr/bin/env node
/**
 * fly.ai compute from the command line: price a job, order it, hand over a pay link, then collect the results.
 * Plain Node 18+ (built-in fetch), no dependencies. Every command prints JSON on the last line for scripts.
 *
 *   node flyai.mjs config                                          prices, limits, token, pay_to
 *   node flyai.mjs quote  (--spec spec.json | --program f.wasm|f.wgsl [program options] | --embed texts.txt [--model M]) [--bid N]
 *   node flyai.mjs create --wallet 0x... (--spec spec.json | --program ...) [--bid N] [--budget N] [--hours H] [--webhook URL]
 *       creates the order (unpaid), saves its key to order-<id8>.json and prints the pay link
 *   node flyai.mjs pay    --order ID --tx 0x... [--chain base]    only if the buyer paid by a transfer themselves
 *   node flyai.mjs status --order ID
 *   node flyai.mjs watch  --order ID [--out dir] [--once]          downloads every settled output as it arrives
 *   node flyai.mjs add    --order ID (--count N | --inputs dir)    more jobs for a keep-open order (key from order-*.json)
 *   node flyai.mjs stop   --order ID                               what isn't spent goes back to the wallet's balance
 *   node flyai.mjs run    --run ID                                 a training run: status, step, the last point
 *   node flyai.mjs curve  --run ID [--out curve.csv]               every generation's / round's numbers
 *   node flyai.mjs theta  --run ID [--best] [--out file]           the parameters (float64 for evolve, float32 for train)
 *
 * Program options: --count N (job i gets i as a u32) or --inputs dir (one job per file), --timeout S (60),
 *   --redundancy R (2), --keep-open; WGSL also --dispatch x,y,z --output-bytes N [--tolerance 0.0001].
 * Embeddings: --embed file (.txt one text per line, .json array, .jsonl strings or {"text"}), --model minilm-l6|bge-small-en,
 *   --batch 128 (texts per job, up to 256), --redundancy R (2). Each job's output is float32 vectors, 384 per text.
 * Text completion: --complete prompts.txt (one prompt per line, or a .json / .jsonl array of strings or {"system","prompt"}),
 *   --model qwen2.5-0.5b|qwen2.5-1.5b|llama3.2-1b, --batch 16 (prompts per job, up to 32), --max-tokens 256.
 * Training runs (mine/TRAIN-PLAN.md): --spec run.json with {"kind": "evolve" | "train", ...}, or the shortcuts
 *   --fitness f.wasm --dim N [--generations 100 --pairs 64 --sigma 0.1 --lr 0.05 --episodes 1]   evolve your fitness
 *   --train-csv data.csv [--hidden 64 --rounds 40 --lr 0.003]   an MLP classifier: numbers, the last column the class
 * FLYAI_SERVER overrides the API (default https://flyai-mine.fly.dev).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [command, ...rest] = process.argv.slice(2);
// a failed call is a message for the person, not a stack trace
process.on("uncaughtException", (err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const has = (name) => rest.includes(`--${name}`);
const SERVER = flag("server") ?? process.env.FLYAI_SERVER ?? "https://flyai-mine.fly.dev";
const SITE = "https://www.flyaiworld.com";
const say = (text) => console.error(text); // human notes on stderr, JSON on stdout
const out = (json) => console.log(JSON.stringify(json));

async function call(path, body, key) {
  const res = await fetch(SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${json.error ?? `HTTP ${res.status}`}`);
  return json;
}

async function upload(bytes) {
  const res = await fetch(`${SERVER}/api/blobs`, { method: "POST", body: bytes });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`upload: ${json.error ?? `HTTP ${res.status}`}`);
  return json.hash;
}

async function inputsFrom(dir) {
  const files = readdirSync(dir).filter((f) => !f.startsWith(".")).sort();
  const hashes = [];
  for (const [i, f] of files.entries()) {
    process.stderr.write(`\ruploading inputs ${i + 1}/${files.length}`);
    hashes.push(await upload(readFileSync(join(dir, f))));
  }
  process.stderr.write("\n");
  return hashes;
}

/** Texts from a file: a JSON array, JSON lines (strings or {"text": ...}), or one text per line. */
function readTexts(path) {
  const body = readFileSync(path, "utf8");
  const pick = (x) => (typeof x === "string" ? x : typeof x?.text === "string" ? x.text : "").trim();
  const texts = path.endsWith(".json") ? JSON.parse(body).map(pick)
    : path.endsWith(".jsonl") ? body.split(/\r?\n/).filter((l) => l.trim()).map((l) => pick(JSON.parse(l)))
    : body.split(/\r?\n/).map((l) => l.trim());
  return texts.filter(Boolean);
}

/** A train run's data shard (mine/src/train.ts): FLYDATA1, rows, x_dim, y_kind 0, classes, f32 x, u32 labels. */
function shard(rows, classes) {
  const xd = rows[0].length - 1;
  const b = Buffer.alloc(24 + rows.length * xd * 4 + rows.length * 4);
  b.write("FLYDATA1", 0, "ascii");
  b.writeUInt32LE(rows.length, 8);
  b.writeUInt32LE(xd, 12);
  b.writeUInt32LE(0, 16);
  b.writeUInt32LE(classes, 20);
  let at = 24;
  for (const r of rows) for (let i = 0; i < xd; i++, at += 4) b.writeFloatLE(r[i], at);
  for (const r of rows) { b.writeUInt32LE(r[xd], at); at += 4; }
  return b;
}

/** An MLP train run from a CSV of numbers (last column the class): a tenth held out, the rest in shards of ~2,000 rows. */
async function trainCsvSpec(path) {
  const rows = readFileSync(path, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,;\t]/).map(Number)).filter((r) => r.every(Number.isFinite));
  if (rows.length < 20) throw new Error("the CSV needs at least 20 rows of numbers");
  const cols = rows[0].length;
  if (cols < 2 || rows.some((r) => r.length !== cols)) throw new Error("every row needs the same number of columns, at least two");
  if (rows.some((r) => !Number.isInteger(r[cols - 1]) || r[cols - 1] < 0)) throw new Error("the last column must be a whole-number class: 0, 1, 2...");
  const classes = Math.max(...rows.map((r) => r[cols - 1])) + 1;
  let seed = 12345;
  for (let i = rows.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const j = seed % (i + 1);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const held = Math.min(5000, Math.max(10, Math.floor(rows.length / 10)));
  const train = rows.slice(held);
  const per = Math.max(64, Math.min(2000, Math.ceil(train.length / 64)));
  const shards = [];
  for (let i = 0; i < train.length; i += per) {
    process.stderr.write(`\ruploading shard ${shards.length + 1}/${Math.ceil(train.length / per)}`);
    shards.push(await upload(shard(train.slice(i, i + per), classes)));
  }
  process.stderr.write("\n");
  const hidden = Number(flag("hidden") ?? 64);
  say(`${rows.length} rows, ${cols - 1} features, ${classes} classes: ${shards.length} shards, ${held} rows held out`);
  return {
    kind: "train", model: { mlp: { layers: [cols - 1, hidden, hidden, classes] } }, shards, eval_shard: await upload(shard(rows.slice(0, held), classes)),
    rounds: Number(flag("rounds") ?? 40), shards_per_round: Math.min(16, shards.length), local_steps: Number(flag("local-steps") ?? 50),
    batch: Number(flag("batch") ?? 32), lr: Number(flag("lr") ?? 0.003), redundancy: Number(flag("redundancy") ?? 2),
  };
}

/** The order's spec: a JSON file (any kind, e.g. connectome-sweep), texts to embed, or a program uploaded here. */
async function specFromFlags() {
  if (flag("spec")) return JSON.parse(readFileSync(flag("spec"), "utf8"));
  if (flag("train-csv")) return trainCsvSpec(flag("train-csv"));
  if (flag("fitness")) {
    if (!flag("dim")) throw new Error("--dim N: how many parameters the fitness takes");
    return {
      kind: "evolve", dim: Number(flag("dim")), fitness: { wasm: await upload(readFileSync(flag("fitness"))) },
      generations: Number(flag("generations") ?? 100), pairs: Number(flag("pairs") ?? 64), pairs_per_job: Number(flag("pairs-per-job") ?? 8),
      sigma: Number(flag("sigma") ?? 0.1), lr: Number(flag("lr") ?? 0.05), episodes: Number(flag("episodes") ?? 1),
      timeout_s: Number(flag("timeout") ?? 60), redundancy: Number(flag("redundancy") ?? 2),
    };
  }
  if (flag("complete")) {
    const path = flag("complete");
    const body = readFileSync(path, "utf8");
    const prompts = path.endsWith(".json") ? JSON.parse(body)
      : path.endsWith(".jsonl") ? body.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l))
      : body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!prompts.length) throw new Error(`no prompts in ${path}`);
    const size = Number(flag("batch") ?? 16);
    if (!(size >= 1 && size <= 32)) throw new Error("--batch is 1 to 32 prompts per job");
    const inputs = [];
    for (let i = 0; i < prompts.length; i += size) {
      process.stderr.write(`\ruploading batch ${i / size + 1}/${Math.ceil(prompts.length / size)}`);
      inputs.push(await upload(Buffer.from(JSON.stringify(prompts.slice(i, i + size)))));
    }
    process.stderr.write("\n");
    say(`${prompts.length} prompts in ${inputs.length} jobs of up to ${size}`);
    return { kind: "complete", model: flag("model") ?? "qwen2.5-0.5b", inputs, max_tokens: Number(flag("max-tokens") ?? 256), redundancy: Number(flag("redundancy") ?? 2), keep_open: has("keep-open") };
  }
  if (flag("embed")) {
    const texts = readTexts(flag("embed"));
    if (!texts.length) throw new Error(`no texts in ${flag("embed")}`);
    const size = Number(flag("batch") ?? 128);
    if (!(size >= 1 && size <= 256)) throw new Error("--batch is 1 to 256 texts per job");
    const inputs = [];
    for (let i = 0; i < texts.length; i += size) {
      process.stderr.write(`\ruploading batch ${i / size + 1}/${Math.ceil(texts.length / size)}`);
      inputs.push(await upload(Buffer.from(JSON.stringify(texts.slice(i, i + size).map((t) => t.slice(0, 8000))))));
    }
    process.stderr.write("\n");
    say(`${texts.length} texts in ${inputs.length} batches of up to ${size}`);
    return { kind: "embed", model: flag("model") ?? "minilm-l6", inputs, redundancy: Number(flag("redundancy") ?? 2), keep_open: has("keep-open") };
  }
  const path = flag("program");
  if (!path) throw new Error("give --spec spec.json or --program file.wasm|file.wgsl");
  const kind = path.endsWith(".wgsl") ? "wgsl" : "wasm";
  const program = await upload(readFileSync(path));
  const jobs = flag("inputs") ? { inputs: await inputsFrom(flag("inputs")) } : { count: Number(flag("count") ?? 1) };
  const spec = {
    kind, program, ...jobs, timeout_s: Number(flag("timeout") ?? 60), redundancy: Number(flag("redundancy") ?? 2), keep_open: has("keep-open"),
  };
  if (kind === "wgsl") {
    if (!flag("output-bytes")) throw new Error("a WGSL job needs --output-bytes (and usually --dispatch x,y,z)");
    spec.dispatch = (flag("dispatch") ?? "1,1,1").split(",").map(Number);
    spec.output_bytes = Number(flag("output-bytes"));
    if (flag("tolerance")) spec.compare = { f32_tolerance: Number(flag("tolerance")) };
  }
  return spec;
}

const keyFile = (id) => `order-${id.slice(0, 8)}.json`;
function orderKey(id) {
  if (flag("key")) return flag("key");
  const file = keyFile(id);
  if (!existsSync(file)) throw new Error(`no --key and no ${file} here: the order key was saved there when the order was made`);
  return JSON.parse(readFileSync(file, "utf8")).order_key;
}

if (command === "config") {
  out(await call("/api/orders/config"));
} else if (command === "quote") {
  const spec = await specFromFlags();
  const quote = await call("/api/orders/quote", { spec, bid: flag("bid") });
  say(quote.run
    ? `${quote.run.kind === "evolve" ? "an" : "a"} ${quote.run.kind} run: ${quote.run.steps} steps x ${quote.run.jobs_per_step} jobs = ${quote.jobs} jobs at ${quote.bid} $FLYAI each: at most ${quote.full_cost} $FLYAI`
    : `${quote.jobs} jobs (${quote.cached} already done, cheaper) at ${quote.bid} $FLYAI each: the whole order costs at most ${quote.full_cost} $FLYAI`);
  out({ ...quote, spec });
} else if (command === "create") {
  const wallet = flag("wallet");
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet ?? "")) throw new Error("--wallet 0x... is required: the wallet that pays and owns the order");
  const spec = await specFromFlags();
  const quote = await call("/api/orders/quote", { spec, bid: flag("bid") });
  const order = await call("/api/orders", {
    wallet, spec, bid: flag("bid") ?? quote.bid, budget: flag("budget") ?? quote.full_cost,
    hours: flag("hours") ? Number(flag("hours")) : undefined, webhook: flag("webhook"),
  });
  writeFileSync(keyFile(order.id), JSON.stringify({ id: order.id, order_key: order.order_key, webhook_secret: order.webhook_secret, server: SERVER }, null, 2));
  const payLink = `${SITE}/compute/jobs?pay=${order.id}`;
  say(`order ${order.id} created, unpaid (its key is in ${keyFile(order.id)}; it isn't shown again)`);
  say(`pay ${order.budget} $FLYAI from ${order.wallet}: ${payLink}`);
  if (order.run) say(`it's a training run: ${order.run.id}; watch it at ${SITE}/compute/runs?id=${order.run.id} or with \`run --run ${order.run.id}\``);
  out({ id: order.id, status: order.status, budget: order.budget, budget_wei: order.budget_wei, wallet: order.wallet, pay_to: order.pay_to, token: order.token, pay_link: payLink, key_file: keyFile(order.id),
    ...(order.run ? { run: order.run.id, run_link: `${SITE}/compute/runs?id=${order.run.id}` } : {}) });
} else if (command === "pay") {
  // for a buyer who sent the transfer themselves: tell the server which transaction it was
  for (let i = 0; ; i++) {
    try {
      const o = await call(`/api/orders/${flag("order")}/pay`, { tx: flag("tx"), chain: flag("chain") });
      say(`order ${o.id}: ${o.status}, ${o.out} jobs out to miners`);
      out(o);
      break;
    } catch (err) {
      if (!/isn't mined yet|couldn't read the chain/.test(String(err)) || i > 40) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
} else if (command === "status") {
  const o = await call(`/api/orders/${flag("order")}`);
  say(`order ${o.id}: ${o.status}${o.end_reason ? ` (${o.end_reason})` : ""} · ${o.settled}/${o.jobs} settled · spent ${o.spent ?? "0"} of ${o.budget} $FLYAI`);
  out(o);
} else if (command === "watch") {
  const id = flag("order");
  const dir = flag("out") ?? `results-${id.slice(0, 8)}`;
  mkdirSync(dir, { recursive: true });
  const cursorFile = join(dir, "cursor.json");
  let after = existsSync(cursorFile) ? JSON.parse(readFileSync(cursorFile, "utf8")).next : 0;
  let page;
  for (;;) {
    page = await call(`/api/orders/${id}/results?after=${after}&limit=1000`);
    for (const row of page.rows) {
      const name = String(row.index ?? row.seq).padStart(6, "0"); // program jobs have an index, sweep rows a seq
      if (row.output?.url) writeFileSync(join(dir, `${name}.out`), Buffer.from(await (await fetch(SERVER + row.output.url)).arrayBuffer()));
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(row));
    }
    after = page.next;
    writeFileSync(cursorFile, JSON.stringify({ next: after }));
    process.stderr.write(`\r${page.status}: ${page.settled}/${page.jobs} settled`);
    const finished = (page.status === "done" || page.status === "ended") && !page.more;
    if (finished || (has("once") && !page.more)) break;
    if (!page.more) await new Promise((r) => setTimeout(r, 10_000));
  }
  say(`\noutputs in ${dir}/ (N.out = the output, N.json = the row: checked_by, error, disputed answers)`);
  out({ id, status: page.status, jobs: page.jobs, settled: page.settled, dir });
} else if (command === "add") {
  const id = flag("order");
  const jobs = flag("inputs") ? { inputs: await inputsFrom(flag("inputs")) } : { count: Number(flag("count")) };
  const o = await call(`/api/orders/${id}/jobs`, jobs, orderKey(id));
  say(`order ${o.id}: now ${o.jobs} jobs`);
  out(o);
} else if (command === "stop") {
  const id = flag("order");
  const o = await call(`/api/orders/${id}/stop`, {}, orderKey(id));
  say(`order ${o.id}: ${o.status}; ${o.returned} $FLYAI back to the wallet's balance`);
  out(o);
} else if (command === "run") {
  const r = await call(`/api/runs/${flag("run")}?points=1`);
  const last = r.points[r.points.length - 1];
  say(`run ${r.id} (${r.kind}): ${r.status}${r.end_reason ? ` (${r.end_reason})` : ""} · step ${r.step}/${r.steps} · order ${r.order.status}, spent ${r.order.spent} of ${r.order.budget}`);
  if (last) say(`last point: ${JSON.stringify(last)}`);
  if (r.error) say(`error: ${r.error}`);
  out({ ...r, points: undefined, last });
} else if (command === "curve") {
  const points = [];
  for (let after = -1; ;) {
    const page = (await call(`/api/runs/${flag("run")}/points?after=${after}`)).points;
    points.push(...page);
    if (page.length < 5000) break;
    after = page[page.length - 1].step;
  }
  if (flag("out")) {
    const keys = [...new Set(points.flatMap((p) => Object.keys(p)))].filter((k) => k !== "theta");
    writeFileSync(flag("out"), [keys.join(","), ...points.map((p) => keys.map((k) => p[k] ?? "").join(","))].join("\n") + "\n");
    say(`${points.length} points written to ${flag("out")}`);
  }
  out({ run: flag("run"), points: points.length, last: points[points.length - 1] ?? null });
} else if (command === "theta") {
  const r = await call(`/api/runs/${flag("run")}?points=0`);
  const url = has("best") && r.best?.url ? r.best.url : r.theta.url;
  const bytes = Buffer.from(await (await fetch(SERVER + url)).arrayBuffer());
  const file = flag("out") ?? `theta-${r.id.slice(0, 8)}${has("best") ? "-best" : ""}.${r.kind === "evolve" ? "f64" : "f32"}`;
  writeFileSync(file, bytes);
  say(`${r.params} parameters (${r.format}) written to ${file}; in Python: numpy.fromfile("${file}", "${r.kind === "evolve" ? "<f8" : "<f4"}")`);
  out({ run: r.id, file, params: r.params, format: r.format, step: r.step });
} else {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n/, ""));
}
