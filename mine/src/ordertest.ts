/**
 * Paid orders end to end on a local chain: anvil + a test token + a real server. Specs, bids and limits; funding
 * with the exact tagged budget (and every way a payment shouldn't count); max_parallel; paid jobs handed out before
 * the screen; two miners agreeing and the charge that follows; a lying miner caught; an order finishing its sweep and
 * returning what's left; funding from the balance with a signature; stopping; time and budget limits; cached resale;
 * results and CSV; results fed by paged pulls, a server-sent event stream and a signed webhook; the buyers' part of
 * the pool; admin totals and withdrawals.
 * Runs 5 real brain jobs on the CPU (~40 s). Needs Foundry (anvil, forge) on PATH.
 *
 *   npm run test:orders
 */
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { fixedFrom } from "./fixed.ts";
import { loadModel } from "./load.ts";
import { startPg } from "./pgtest.ts";
import { runTask, type TaskParams, type TaskResult } from "./runner.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";
import { checkWebhook, internalAddress, verify } from "./webhooks.ts";

const RPC = "http://127.0.0.1:8547";
const PORT = 8783;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-ordertest-${process.pid}.db`);
const CONTRACTS = fileURLToPath(new URL("../contracts/", import.meta.url));
const CONNECTOME = fileURLToPath(new URL("../../world/public/connectome/", import.meta.url));
const WEI = 10n ** 18n;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
/** equal to within the order tags (under 1e-12 of a token each) */
const near = (x: unknown, y: number) => Math.abs(Number(x) - y) < 1e-9;
const FAKE_CDP_PORT = 8798;

const anvil = spawn("anvil", ["--port", "8547"], { stdio: ["ignore", "pipe", "ignore"] });
const anvilKeys: string[] = await new Promise((resolve, reject) => {
  let out = "";
  anvil.stdout!.on("data", (d) => {
    out += d;
    const keys = [...out.matchAll(/\(\d+\) 0x([0-9a-f]{64})/g)].map((m) => m[1]);
    if (keys.length >= 6 && out.includes("Listening on")) resolve(keys);
  });
  anvil.on("exit", () => reject(new Error("anvil exited")));
});
const [owner, alice, bob] = anvilKeys.slice(0, 3).map((k) => {
  const sk = Uint8Array.from(Buffer.from(k, "hex"));
  const sign = (message: string) => {
    const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
  };
  return { key: `0x${k}`, address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
});

const selector = (sig: string) => hex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4));
const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const calldata = (sig: string, ...args: (bigint | string)[]) => `0x${selector(sig)}${args.map(word).join("")}`;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (res.error) throw new Error(res.error.message);
  return res.result;
}
/** Sends and waits; returns the hash. */
async function send(from: string, to: string, data: string): Promise<string> {
  const hash = await rpc("eth_sendTransaction", [{ from, to, data }]);
  for (let i = 0; i < 50; i++) {
    if (await rpc("eth_getTransactionReceipt", [hash])) return hash;
    await sleep(100);
  }
  throw new Error("no receipt");
}

async function api(path: string, token: string | null, body?: unknown): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text };
}

type Job = { job: string; params: TaskParams };
let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5534);
try {
  for (let i = 0; ; i++) {
    try { await rpc("eth_chainId", []); break; } catch { if (i > 50) throw new Error("anvil didn't start"); await sleep(200); }
  }
  const out = execFileSync("forge", ["create", "test/MonthlyClaims.t.sol:TestToken", "--rpc-url", RPC, "--private-key", owner.key, "--broadcast"],
    { cwd: CONTRACTS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const token = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(out)![1];
  for (const w of [alice, bob]) await send(owner.address, token, calldata("mint(address,uint256)", w.address, 100_000n * WEI));
  const transfer = (amount: bigint) => calldata("transfer(address,uint256)", owner.address, amount);
  // a stand-in for USDC on Base, on the same local chain
  // a stand-in for Coinbase Onramp: checkout sessions, and the transactions filed under each partnerUserRef
  const fakeCdp = { sessions: [] as { ref: string; body: any }[], transactions: new Map<string, object[]>() };
  const cdpServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      const json = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(req.headers.authorization ?? "")) return json(401, {});
      if (req.method === "POST" && req.url === "/platform/v2/onramp/sessions") {
        const body = JSON.parse(raw);
        fakeCdp.sessions.push({ ref: body.partnerUserRef, body });
        return json(200, { session: { onrampUrl: `https://pay.coinbase.com/buy?test=${encodeURIComponent(body.partnerUserRef)}` } });
      }
      const m = /^\/onramp\/v1\/buy\/user\/([^/]+)\/transactions/.exec(req.url ?? "");
      if (req.method === "GET" && m) return json(200, { transactions: fakeCdp.transactions.get(decodeURIComponent(m[1])) ?? [] });
      json(404, {});
    });
  });
  await new Promise<void>((resolve) => cdpServer.listen(FAKE_CDP_PORT, "127.0.0.1", resolve));
  const usdcOut = execFileSync("forge", ["create", "test/MockUSDC.sol:MockUSDC", "--rpc-url", RPC, "--private-key", owner.key, "--broadcast"],
    { cwd: CONTRACTS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const usdc = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(usdcOut)![1];
  await send(owner.address, usdc, calldata("mint(address,uint256)", bob.address, 1_000_000_000n));

  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50",
      ADMIN_TOKEN: ADMIN, TOKEN_ADDRESS: token, CLAIM_CHAIN_ID: "31337", CLAIM_CHAIN_NAME: "anvil", CLAIM_RPC: RPC, CLAIM_EXPLORER: "http://localhost",
      USDC_RPC: RPC, USDC_TOKEN: usdc, FLYAI_USD_PRICE: "0.00007", RELAYER_KEY: `0x${anvilKeys[5]}`,
      // card checkouts against a stand-in for Coinbase (below), with a throwaway Ed25519 key
      CDP_API_BASE: `http://127.0.0.1:${FAKE_CDP_PORT}`, CDP_API_KEY_ID: "test-key", CDP_API_KEY_SECRET: Buffer.alloc(64, 7).toString("base64"),
      PAY_TO: owner.address, MIN_BID: "10", CACHED_PRICE: "2", POOL_SHARE: "0.8", ORDER_MAX_JOBS: "100", ORDER_MAX_PARALLEL: "8", WEBHOOK_ALLOW_INTERNAL: "1", SEED_PAID: "0", // miners, not idle verifiers, answer the paid jobs here
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
  const get = async (id: string) => (await api(`/api/orders/${id}`, null)).json;
  const create = async (wallet: string, body: object) => {
    const r = await api("/api/orders", null, { wallet, ...body });
    if (r.status !== 200) throw new Error(`create: ${r.text}`);
    return r.json;
  };
  const payFor = async (o: { id: string; budget_wei: string; wallet: string }) =>
    api(`/api/orders/${o.id}/pay`, null, { tx: await send(o.wallet, token, transfer(BigInt(o.budget_wei))) });
  const signed = async (id: string, action: "fund" | "stop", signer: typeof alice) => {
    const { json } = await api(`/api/orders/${id}/intent`, null, { action });
    return api(`/api/orders/${id}/${action}`, null, { nonce: json.nonce, signature: signer.sign(json.message) });
  };
  /** One sign-in (the website's session) instead of a signature per action. */
  const signIn = async (signer: typeof alice) => {
    const { json } = await api("/api/session/nonce", null, { address: signer.address });
    return (await api("/api/session", null, { nonce: json.nonce, signature: signer.sign(json.message) })).json.session as string;
  };
  const asSession = async (id: string, action: "fund" | "stop", session: string) => {
    const res = await fetch(`${BASE}/api/orders/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-flyai-session": session }, body: "{}" });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  // ---- config, specs, terms
  const cfg = (await api("/api/orders/config", null)).json;
  check("orders are open, with limits and an empty market", cfg.open && cfg.pay_to === owner.address && cfg.min_bid === "10" && cfg.max_parallel === 8 && cfg.market.live_orders === 0);
  const spec = { kind: "connectome-sweep", channels: ["LPLC2", "none"], sides: ["L"], amounts: [0.2], gains: [3], tonics: [0.14], seeds: [900001, 900002], warm: 250 };
  check("unknown kind refused", (await api("/api/orders/quote", null, { spec: { ...spec, kind: "bitcoin" } })).status === 400);
  check("too many jobs refused", (await api("/api/orders/quote", null, { spec: { ...spec, seeds: 51 } })).status === 400);
  check("a bid under the minimum refused", (await api("/api/orders", null, { wallet: alice.address, spec, bid: "9", budget: "100" })).status === 400);
  check("a budget under one job refused", (await api("/api/orders", null, { wallet: alice.address, spec, bid: "10", budget: "1" })).status === 400);
  check("max_parallel over the cap refused", (await api("/api/orders", null, { wallet: alice.address, spec, bid: "10", budget: "40", max_parallel: 9 })).status === 400);
  const q = (await api("/api/orders/quote", null, { spec, bid: "10" })).json;
  check("quote: 4 new jobs, 40 at bid 10", q.jobs === 4 && q.cached === 0 && q.full_cost === "40" && q.full_to_pool === "32", JSON.stringify(q));

  // ---- O1: funded by transfer, two out at a time
  // a webhook receiver that fails its first call, to see the retry
  const hooks: { body: string; sig: string }[] = [];
  let refusals = 1;
  const receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      if (refusals-- > 0) return void res.writeHead(503).end();
      hooks.push({ body, sig: String(req.headers["x-flyai-signature"]) });
      res.writeHead(204).end();
    });
  }).listen(8784);
  check("webhooks: internal and non-https URLs refused in production",
    internalAddress("10.1.2.3") && internalAddress("::ffff:127.0.0.1") && internalAddress("fd00::1") && !internalAddress("8.8.8.8")
    && await checkWebhook("https://127.0.0.1/x").then(() => false, () => true) && await checkWebhook("http://example.com/x").then(() => false, () => true));
  check("a bad webhook URL refused", (await api("/api/orders", null, { wallet: alice.address, spec, bid: "10", budget: "40", webhook: "ftp://x" })).status === 400);
  const o1 = await create(alice.address.toLowerCase(), { spec, bid: "10", budget: "40", max_parallel: 2, webhook: "http://127.0.0.1:8784/hook" });
  check("the webhook secret is shown once, at creation", /^[0-9a-f]{48}$/.test(o1.webhook_secret) && !("webhook_secret" in await get(o1.id)) && o1.webhook?.url === "http://127.0.0.1:8784/hook");
  const budget1 = BigInt(o1.budget_wei);
  check("order waits for its budget plus a tag", o1.status === "unpaid" && budget1 > 40n * WEI && budget1 < 40n * WEI + 1_000_000n && o1.wallet === alice.address);
  check("paying without the tag doesn't count", (await api(`/api/orders/${o1.id}/pay`, null, { tx: await send(alice.address, token, transfer(40n * WEI)) })).status === 402);
  check("the exact amount from another wallet doesn't count", (await api(`/api/orders/${o1.id}/pay`, null, { tx: await send(bob.address, token, transfer(budget1)) })).status === 402);
  check("an unknown transaction isn't mined yet", (await api(`/api/orders/${o1.id}/pay`, null, { tx: `0x${"ab".repeat(32)}` })).status === 409);
  const good = await send(alice.address, token, transfer(budget1));
  const live1 = (await api(`/api/orders/${o1.id}/pay`, null, { tx: good })).json;
  check("the exact payment starts it, max_parallel jobs out", live1?.status === "live" && live1.out === 2 && live1.taken_on === 2 && live1.spent === "0", JSON.stringify(live1));
  check("paying again with the same tx is harmless", (await api(`/api/orders/${o1.id}/pay`, null, { tx: good })).json?.status === "live");
  const spare = await create(alice.address, { spec, bid: "10", budget: "40" });
  check("one transaction can't fund two orders", (await api(`/api/orders/${spare.id}/pay`, null, { tx: good })).status === 409);

  // a stream opened before any result
  const streamAbort = new AbortController();
  let streamText = "";
  void fetch(`${BASE}/api/orders/${o1.id}/stream`, { signal: streamAbort.signal }).then(async (r) => {
    const reader = r.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      streamText += Buffer.from(value).toString("utf8");
    }
  }).catch(() => {});

  // ---- O2: a higher bid, from bob
  const lc4 = { ...spec, channels: ["LC4"], seeds: [900003] };
  const o2 = await create(bob.address, { spec: lc4, bid: "30", budget: "45", max_parallel: 1 });
  check("O2 live", (await payFor(o2)).json?.status === "live");
  check("the market shows live bids", (await api("/api/orders/config", null)).json.market.top_bid === "30");

  // ---- mining: A answers, C agrees
  const model = loadModel(CONNECTOME);
  const fixed = fixedFrom(model.w.lut, model.meta.params);
  const truth = new Map<string, TaskResult>();
  const run = (p: TaskParams) => {
    const key = JSON.stringify(p);
    if (!truth.has(key)) truth.set(key, runTask(model, fixed, p));
    return truth.get(key)!;
  };
  const register = async () => (await api("/api/register", null, {})).json.token as string;
  const [ta, tb, tc] = [await register(), await register(), await register()];
  const claim = async (t: string, n: number) => ((await api("/api/claim", t, { count: n })).json?.jobs ?? []) as Job[];
  const paidOf = (jobs: Job[]) => jobs.filter((j) => j.params.seed >= 900001);
  const submit = async (t: string, jobs: Job[], lie?: (j: Job) => boolean) => {
    for (const j of jobs) {
      const r = run(j.params);
      await api("/api/submit", t, { job: j.job, result: lie?.(j) ? { ...r, hash: "0123456789abcdef" } : r });
    }
  };

  const a1 = paidOf(await claim(ta, 16));
  check("paid jobs first: O1's 2 out + O2's 1, nothing more of O1", a1.length === 3 && a1.filter((j) => j.params.channel === "LC4").length === 1, `${a1.length}`);
  const t0 = performance.now();
  for (const j of a1) run(j.params);
  console.log(`     ran ${a1.length} jobs locally in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  await submit(ta, a1);
  check("one answer settles nothing and charges nothing", (await get(o1.id)).spent === "0" && (await get(o2.id)).settled === 0);
  const c1 = paidOf(await claim(tc, 16));
  check("a second miner gets the same paid jobs", c1.length === 3, `${c1.length}`);
  await submit(tc, c1);
  const after = await get(o1.id);
  check("two agreeing answers charge the bid and take on more", after.settled === 2 && after.spent === "20" && after.out === 2 && after.taken_on === 4, JSON.stringify(after));
  const o2done = await get(o2.id);
  check("O2 finished its sweep, the rest back to bob's balance", o2done.status === "done" && o2done.end_reason === "sweep" && o2done.spent === "30" && near(o2done.returned, 15), JSON.stringify(o2done));

  // ---- a liar on O1's last two jobs: disagreement goes straight to the server's own run
  const a2 = paidOf(await claim(ta, 16));
  await submit(ta, a2);
  const b2 = paidOf(await claim(tb, 16));
  check("both of O1's new jobs reach the liar", a2.length === 2 && b2.length === 2, `${a2.length}, ${b2.length}`);
  await submit(tb, b2, (j) => j.params.channel === "LPLC2");
  let done1 = null;
  for (let i = 0; i < 120 && !done1; i++) {
    await sleep(1_000);
    const o = await get(o1.id);
    if (o.status === "done") done1 = o;
  }
  check("O1 finishes: all 4 charged once, only the tag returned", done1?.spent === "40" && done1.settled === 4 && near(done1.returned, 0), JSON.stringify(done1));
  const meB = (await api("/api/me", tb)).json;
  check("the lying miner is caught", meB.lifetime_rejected === 1 && meB.standing === "zeroed", JSON.stringify({ r: meB.lifetime_rejected, s: meB.standing }));
  let res = (await api(`/api/orders/${o1.id}/results`, null)).json;
  for (let i = 0; i < 60 && res.rows.length < 4; i++) { // the liar's agreeing answer no longer counts until the server re-runs it
    await sleep(1_000);
    res = (await api(`/api/orders/${o1.id}/results`, null)).json;
  }
  const matches = res.rows.length === 4 && res.rows.every((r: any) => {
    const { seq: _s, checked_by: _c, spikes, base, stim, ...params } = r;
    const t = truth.get(JSON.stringify(params));
    return t && t.spikes === spikes && t.base.join() === base.join() && t.stim.join() === stim.join() && !("hash" in r);
  });
  check("results: 4 rows, counts as computed, no hashes", matches, res.rows.map((r: any) => r.checked_by).join(","));
  const page1 = (await api(`/api/orders/${o1.id}/results?after=0&limit=2`, null)).json;
  const page2 = (await api(`/api/orders/${o1.id}/results?after=${page1.next}&limit=2`, null)).json;
  const seqs = [...page1.rows, ...page2.rows].map((r: any) => r.seq);
  check("paged pulls: 2 + 2 rows in settle order, nothing twice", page1.rows.length === 2 && page1.more && page2.rows.length === 2 && !page2.more
    && new Set(seqs).size === 4 && seqs.every((x: number, i: number) => i === 0 || x > seqs[i - 1]), JSON.stringify(seqs));
  await sleep(1_000);
  streamAbort.abort();
  const events = [...streamText.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]) }));
  check("the stream sent each result once as it settled, then done", events.filter((e) => e.event === "result").length === 4
    && events.some((e) => e.event === "status" && e.data.status === "done"), events.map((e) => e.event).join(","));
  for (let i = 0; i < 90 && !hooks.some((h) => JSON.parse(h.body).final); i++) await sleep(1_000);
  const hookRows = hooks.flatMap((h) => JSON.parse(h.body).rows);
  check("the webhook retried, then got all 4 rows and a final call, each signed", hooks.length >= 1 && refusals < 0
    && new Set(hookRows.map((r: any) => r.seq)).size === 4 && hookRows.length === 4 && hooks.some((h) => JSON.parse(h.body).final)
    && hooks.every((h) => verify(o1.webhook_secret, h.body, h.sig)) && !verify("wrong", hooks[0].body, hooks[0].sig), `${hooks.length} calls, ${hookRows.length} rows`);
  const hookState = (await get(o1.id)).webhook;
  check("the order shows the webhook delivered", hookState?.done === true && hookState.failures === 0, JSON.stringify(hookState));
  receiver.close();
  const csv = await api(`/api/orders/${o1.id}/results?format=csv`, null);
  check("CSV export: header + 4 rows", csv.status === 200 && csv.text.trim().split("\n").length === 5 && csv.text.startsWith("channel,side,amount"));

  // ---- O3: resale of settled work, funded from bob's balance with a signature
  const bal = async (w: string) => Number((await api(`/api/balance?wallet=${w}`, null)).json.balance);
  const bobBefore = await bal(bob.address);
  check("bob's balance holds O2's unspent budget", near(bobBefore, 15), String(bobBefore));
  const q3 = (await api("/api/orders/quote", null, { spec, bid: "10" })).json;
  check("the same sweep is now cached: 4 x 2", q3.cached === 4 && q3.full_cost === "8", JSON.stringify(q3));
  const o3 = await create(bob.address, { spec, bid: "10", budget: "8" });
  check("funding from the balance needs the order's wallet", (await signed(o3.id, "fund", alice)).status === 401);
  const f3 = await signed(o3.id, "fund", bob);
  check("funded from the balance, done at once", f3.json?.status === "done" && f3.json.spent === "8", JSON.stringify(f3.json));
  check("the balance paid for it", near(await bal(bob.address), 7));
  check("its results are ready", (await api(`/api/orders/${o3.id}/results`, null)).json.rows.length === 4);
  check("a transfer for an order that's already funded is kept as balance", (await payFor(o3)).status === 200 && near(await bal(bob.address), 15));
  check("funding twice refused", (await signed(o3.id, "fund", bob)).status === 409);

  // ---- USDC on Base: an order paid in USDC, credited in $FLYAI at the price (0.00007 USD here)
  check("the config offers USDC with its chain and token", cfg.usdc?.token === usdc && cfg.usdc.chain_id === 8453 && cfg.usdc.pay_to === owner.address);
  const ou = await create(bob.address, { spec, bid: "10", budget: "8" });
  check("paying in USDC needs a price first", (await api(`/api/orders/${ou.id}/pay`, null, { tx: `0x${"ab".repeat(32)}`, chain: "base" })).status !== 200);
  const quote = (await api(`/api/orders/${ou.id}/usdc`, null, {})).json;
  const exact = (BigInt(ou.budget_wei) * 70_000_000_000_000n + 10n ** 30n - 1n) / 10n ** 30n; // budget x price, in micro-USDC, rounded up
  check("a USDC price: the budget at the $FLYAI price, plus a tag under a tenth of a cent", BigInt(quote.units) > exact && BigInt(quote.units) - exact < 1000n && quote.flyai_usd === 0.00007,
    `${quote.usdc} USDC for ${quote.flyai} FLYAI`);
  const usdcTransfer = (units: bigint) => calldata("transfer(address,uint256)", owner.address, units);
  const wrong = await send(bob.address, usdc, usdcTransfer(BigInt(quote.units) + 1n));
  check("a USDC transfer of the wrong amount is refused", (await api(`/api/orders/${ou.id}/pay`, null, { tx: wrong, chain: "base" })).status === 402);
  const bobBeforeUsdc = await bal(bob.address);
  const paidTx = await send(bob.address, usdc, usdcTransfer(BigInt(quote.units)));
  const paidU = (await api(`/api/orders/${ou.id}/pay`, null, { tx: paidTx, chain: "base" })).json;
  check("the exact USDC amount funds the order in $FLYAI", paidU?.status === "done" && paidU.usdc_payment?.usdc === quote.usdc && paidU.spent === "8", JSON.stringify(paidU?.usdc_payment));
  check("the credit is the USDC at the price, the tag's sliver kept as balance", Math.abs(await bal(bob.address) - bobBeforeUsdc - (Number(quote.units) / 1e6 / 0.00007 - 8)) < 0.01);
  check("the same USDC transaction can't pay twice", (await api(`/api/orders/${o3.id}/pay`, null, { tx: paidTx, chain: "base" })).status === 409
    && (await api(`/api/orders/${ou.id}/pay`, null, { tx: paidTx, chain: "base" })).status === 200);
  const monthView = (await api("/api/month", null)).json;
  check("the month counts the USDC and its orders' part of the buyers' pool", monthView.usdc_received === quote.usdc && Number(monthView.buyer_pool_from_usdc) > 0
    && Number(monthView.buyer_pool_from_usdc) <= Number(monthView.buyer_pool) && Number(monthView.announced_pool) >= Number(monthView.buyer_pool), JSON.stringify({ u: monthView.usdc_received, p: monthView.buyer_pool_from_usdc, b: monthView.buyer_pool }));
  check("a live order can't be priced in USDC again", (await api(`/api/orders/${ou.id}/usdc`, null, {})).status === 409);

  // ---- gasless USDC: bob only signs (EIP-3009); the server's relayer sends the transfer and pays the gas
  const og = await create(bob.address, { spec, bid: "10", budget: "8" });
  const gq = (await api(`/api/orders/${og.id}/usdc`, null, {})).json;
  check("the quote carries the token's EIP-712 domain for signing", gq.gasless?.domain?.name === "USD Coin" && gq.gasless.domain.version === "2" && gq.gasless.domain.chainId === 8453);
  const bobKey = Uint8Array.from(Buffer.from(bob.key.slice(2), "hex"));
  const k256 = (b: Uint8Array | string) => keccak_256(typeof b === "string" ? new TextEncoder().encode(b) : b);
  const enc = (...words: (bigint | string | Uint8Array)[]) => Buffer.from(words.map((w) => (w instanceof Uint8Array ? hex(w) : word(w))).join(""), "hex");
  const authorize = (value: bigint, nonce: string, validBefore: number, signer = bobKey) => {
    // the mock's domain uses the chain it runs on (anvil, 31337); real USDC on Base uses 8453, as the quote says
    const domain = k256(enc(k256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), k256("USD Coin"), k256("2"), 31337n, usdc));
    const struct = k256(enc(k256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
      bob.address, owner.address, value, 0n, BigInt(validBefore), nonce));
    const digest = k256(Buffer.concat([Buffer.from([0x19, 0x01]), Buffer.from(domain), Buffer.from(struct)]));
    const sig = secp256k1.sign(digest, signer, { prehash: false, format: "recovered" });
    return { from: bob.address, value: value.toString(), valid_after: 0, valid_before: validBefore, nonce, signature: `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}` };
  };
  const later = Math.floor(Date.now() / 1000) + 3600;
  const nonceHex = () => `0x${hex(secp256k1.utils.randomSecretKey())}`;
  const relayerBefore = BigInt(await rpc("eth_getBalance", [checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(Uint8Array.from(Buffer.from(anvilKeys[5], "hex")), false).subarray(1))).slice(-40)}`), "latest"]));
  check("an authorization for another amount is refused before sending", (await api(`/api/orders/${og.id}/usdc/authorize`, null, authorize(BigInt(gq.units) + 1n, nonceHex(), later))).status === 400);
  const forged = authorize(BigInt(gq.units), nonceHex(), later, Uint8Array.from(Buffer.from(anvilKeys[1], "hex")));
  const forgedRes = await api(`/api/orders/${og.id}/usdc/authorize`, null, forged);
  check("a signature from another wallet fails the simulation, costing no gas", forgedRes.status === 400 && /wouldn't go through/.test(forgedRes.json?.error ?? ""), forgedRes.json?.error);
  const usdcBefore = BigInt(await rpc("eth_call", [{ to: usdc, data: calldata("balanceOf(address)", owner.address) }, "latest"]));
  const gaslessPaid = (await api(`/api/orders/${og.id}/usdc/authorize`, null, authorize(BigInt(gq.units), nonceHex(), later))).json;
  const usdcAfter = BigInt(await rpc("eth_call", [{ to: usdc, data: calldata("balanceOf(address)", owner.address) }, "latest"]));
  check("a signed authorization: the relayer sends it and the order runs", gaslessPaid?.status === "done" && gaslessPaid.usdc_payment?.usdc === gq.usdc && usdcAfter - usdcBefore === BigInt(gq.units),
    JSON.stringify(gaslessPaid?.usdc_payment ?? gaslessPaid));
  const relayerAfter = BigInt(await rpc("eth_getBalance", [checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(Uint8Array.from(Buffer.from(anvilKeys[5], "hex")), false).subarray(1))).slice(-40)}`), "latest"]));
  check("the relayer paid the gas, bob paid none", relayerAfter < relayerBefore);
  const relayerView = (await api("/api/admin/relayer", ADMIN)).json;
  check("admin sees the relayer and its gas", relayerView.address && BigInt(relayerView.gas_wei) === relayerAfter);

  // ---- guests pay by card: no wallet, no signature; Coinbase pays PAY_TO and the server confirms it
  const guestRes = await api("/api/orders", null, { guest: true, spec, bid: "10", budget: "8" });
  const guestOrder = guestRes.json;
  check("a guest order needs no wallet: PAY_TO holds it, and the buyer gets its key", guestRes.status === 200 && guestOrder.guest === true
    && guestOrder.wallet === owner.address && /^[0-9a-f]{48}$/.test(guestOrder.order_key ?? ""), JSON.stringify(guestRes.json).slice(0, 160));
  const checkout = (await api(`/api/orders/${guestOrder.id}/card`, null, {})).json;
  const session = fakeCdp.sessions.at(-1)!;
  check("the card checkout sells at least CARD_MIN_USD of USDC on Base, paid to PAY_TO, filed under the order", checkout?.url?.startsWith("https://pay.coinbase.com/")
    && checkout.usdc === "2.00" && session.body.destinationAddress === owner.address && session.body.destinationNetwork === "base"
    && session.body.purchaseCurrency === "USDC" && session.ref === `order-${guestOrder.id}`, JSON.stringify(session?.body));
  const waiting = (await fetch(`${BASE}/api/orders/${guestOrder.id}/card`).then((r) => r.json()));
  check("before Coinbase reports the payment, the order waits", waiting.status === "unpaid" && waiting.card?.state === "open");
  // Coinbase's purchase lands: 2 USDC to PAY_TO on Base
  const landed = await send(owner.address, usdc, calldata("mint(address,uint256)", owner.address, 2_000_000n));
  fakeCdp.transactions.set(session.ref, [{ status: "ONRAMP_TRANSACTION_STATUS_SUCCESS", tx_hash: landed, wallet_address: owner.address.toLowerCase(), purchase_currency: "USDC", purchase_network: "base" }]);
  await sleep(4_500); // the server checks a checkout at most every 4 s
  const paidGuest = await fetch(`${BASE}/api/orders/${guestOrder.id}/card`).then((r) => r.json());
  check("once Coinbase reports it and the USDC is on Base, the order runs on everything paid", (paidGuest.status === "done" || paidGuest.status === "live")
    && paidGuest.card?.state === "paid" && paidGuest.usdc_payment?.usdc === "2.000000" && Math.abs(Number(paidGuest.budget) - 2 / 0.00007) < 0.01, JSON.stringify({ s: paidGuest.status, b: paidGuest.budget, u: paidGuest.usdc_payment, c: paidGuest.card }));
  await sleep(4_500);
  const again = await fetch(`${BASE}/api/orders/${guestOrder.id}/card`).then((r) => r.json());
  check("checking again doesn't pay twice", again.budget === paidGuest.budget && (await api("/api/month", null)).json.usdc_received.startsWith("2."));
  check("a guest's order key stops it (or it's already done)", paidGuest.status === "done"
    || (await fetch(`${BASE}/api/orders/${guestOrder.id}/stop`, { method: "POST", headers: { authorization: `Bearer ${guestOrder.order_key}` } })).status === 200);
  const failedOrder = (await api("/api/orders", null, { guest: true, spec, bid: "10", budget: "8" })).json;
  await api(`/api/orders/${failedOrder.id}/card`, null, {});
  fakeCdp.transactions.set(`order-${failedOrder.id}`, [{ status: "ONRAMP_TRANSACTION_STATUS_FAILED", failure_reason: "card declined" }]);
  const declined = await fetch(`${BASE}/api/orders/${failedOrder.id}/card`).then((r) => r.json());
  check("a declined card shows as failed, and the order stays unpaid", declined.status === "unpaid" && declined.card?.state === "failed" && declined.card.reason === "card declined");

  // ---- ends: budget, stop, time
  const o4 = await create(alice.address, { spec, bid: "10", budget: "5" });
  const f4 = (await payFor(o4)).json;
  check("budget runs out on cached jobs: 2 charged, the rest returned", f4?.status === "ended" && f4.end_reason === "budget" && f4.spent === "4" && near(f4.returned, 1), JSON.stringify(f4));
  const far = { ...spec, channels: ["LPLC1"], seeds: [900010, 900011] };
  const o5 = await create(alice.address, { spec: far, bid: "10", budget: "100", max_parallel: 1 });
  check("O5 live, one out", (await payFor(o5)).json?.out === 1);
  const aliceSession = await signIn(alice);
  check("bob's session can't stop alice's order", (await asSession(o5.id, "stop", await signIn(bob))).status === 401);
  check("no session and no signature can't stop it", (await asSession(o5.id, "stop", "00".repeat(32))).status === 410);
  const stopped = await asSession(o5.id, "stop", aliceSession);
  check("stopping it returns the whole budget and drops its job", stopped.json?.status === "ended" && stopped.json.end_reason === "stopped" && stopped.json.dropped === 1 && near(stopped.json.returned, 100), JSON.stringify(stopped.json));
  const dropDb = new DatabaseSync(DB);
  const droppedPriority = (dropDb.prepare("select max(t.priority) as p from order_tasks ot join tasks t on t.id = ot.task where ot.order_id = ?").get(o5.id) as { p: number }).p;
  dropDb.close();
  check("a dropped job is no longer paid work", droppedPriority === 0);
  const o6 = await create(alice.address, { spec: far, bid: "10", budget: "50", hours: 0.25 });
  check("O6 funded from alice's balance by her session", (await asSession(o6.id, "fund", aliceSession)).json?.status === "live");
  const db = new DatabaseSync(DB);
  db.exec("pragma busy_timeout = 5000");
  db.prepare("update orders set ends_at = 1 where id = ?").run(o6.id);
  let timed = null;
  for (let i = 0; i < 40 && !timed; i++) {
    await sleep(1_000);
    const o = await get(o6.id);
    if (o.status === "ended") timed = o;
  }
  check("a time limit ends it", timed?.end_reason === "time" && near(timed.returned, 50), JSON.stringify(timed));

  // ---- expired order, pool, admin
  const o7 = await create(bob.address, { spec, bid: "10", budget: "8" });
  db.prepare("update orders set expires_at = 0 where id = ?").run(o7.id);
  check("an unpaid order past its time shows expired", (await get(o7.id)).status === "expired");
  check("a late payment still runs it", (await payFor(o7)).json?.status === "done");
  const month = new Date().toISOString().slice(0, 7);
  const charged = 40 + 30 + 8 + 8 + 8 + 8 + 4 + 8; // O1, O2, O3, the two USDC orders, the guest card order, O4, O7
  await sleep(1_500); // the last charges reach Postgres (queued in pg_outbox, sent every second)
  const board = (await api(`/api/month?month=${month}`, null)).json;
  check("80% of every charge is in this month's pool", near(board.buyer_pool, charged * 0.8) && near(board.announced_pool, charged * 0.8), `${board.buyer_pool}`);
  await api("/api/admin/announce", ADMIN, { month, pool: "1000" });
  check("an announcement adds to the buyers' part", near((await api(`/api/month?month=${month}`, null)).json.announced_pool, 1000 + charged * 0.8));
  check("admin totals need the token", (await api("/api/admin/orders", "nope")).status === 403);
  const admin = (await api("/api/admin/orders", ADMIN)).json;
  check("admin totals: charged, pool, treasury, balances", near(admin.months[0]?.charged, charged) && near(admin.months[0].treasury, charged * 0.2) && admin.balances.length === 3, // alice, bob, and PAY_TO holding what guest orders left
    JSON.stringify(admin.months));
  const bobNow = (await api(`/api/balance?wallet=${bob.address}`, null)).json.balance;
  check("withdrawing more than the balance refused", (await api("/api/admin/withdraw", ADMIN, { wallet: bob.address, amount: String(Number(bobNow) + 1), tx: `0x${"cd".repeat(32)}` })).status === 409);
  const w = (await api("/api/admin/withdraw", ADMIN, { wallet: bob.address, amount: bobNow, tx: `0x${"cd".repeat(32)}` })).json;
  check("a recorded withdrawal empties the balance", w?.balance === "0", JSON.stringify(w?.balance));
  check("orders listed per wallet with the balance", (await api(`/api/orders?wallet=${alice.address}`, null)).json.orders.length === 5);

  // ---- the snapshot can't shortchange buyers' money
  db.close();
  await PG.pg.run("update mine.ledger set month = '2026-08' where kind = 'charge'");
  const snap = await api("/api/admin/snapshot", ADMIN, { month: "2026-08", pool: "10" });
  check("a snapshot pool below the buyers' part is refused", snap.status === 409 && /can't be less/.test(snap.json.error), snap.json.error);
  check("the page is served", (await fetch(`${BASE}/compute/jobs`)).status === 200 && (await fetch(`${BASE}/compute/mine/web/jobs.js`)).status === 200);
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  anvil.kill();
  await sleep(300);
  await PG.stop();
  try {
    const drift = creditDrift(DB);
    check("day_credit matches the assignments", !drift.length, drift.slice(0, 3).join(", "));
  } catch (err) {
    check("day_credit matches the assignments", false, String(err));
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}
console.log(failed ? `${failed} FAILED` : "paid order checks passed");
process.exit(failed ? 1 : 0);

/** day_credit (kept by triggers) must equal a full count over the assignments. */
function creditDrift(path: string): string[] {
  const db = new DatabaseSync(path);
  const bad = db.prepare(`select coalesce(x.day, d.day) as day, coalesce(x.miner, d.miner) as miner from (
      select a.day, a.miner, coalesce(sum(case when a.status in ('accepted', 'pending') and t.kind = 'connectome' then t.units end), 0) as units,
        coalesce(sum(case when a.status in ('accepted', 'pending') and t.kind != 'connectome' then t.units end), 0) as program_units,
        coalesce(sum(a.status = 'accepted'), 0) as accepted, coalesce(sum(a.status = 'pending'), 0) as pending, coalesce(sum(a.status = 'rejected'), 0) as rejected
      from assignments a join tasks t on t.id = a.task where a.day is not null group by a.day, a.miner) x
    full outer join day_credit d on d.day = x.day and d.miner = x.miner
    where abs(coalesce(x.units, 0) - coalesce(d.units, 0)) > 1e-6 or abs(coalesce(x.program_units, 0) - coalesce(d.program_units, 0)) > 1e-6
      or coalesce(x.accepted, 0) != coalesce(d.accepted, 0) or coalesce(x.pending, 0) != coalesce(d.pending, 0) or coalesce(x.rejected, 0) != coalesce(d.rejected, 0)`)
    .all() as { day: string; miner: string }[];
  const rows = (db.prepare("select count(*) as n from day_credit").get() as { n: number }).n;
  db.close();
  return bad.length ? bad.map((b) => `${b.day} ${b.miner}`) : rows ? [] : ["day_credit is empty"];
}
