#!/usr/bin/env node
// fly.ai Agent Desk helper (FlyAgentDesk on BNB Chain). No packages: Node 18+ only.
//   node desk.mjs build <kind> "<query>" <wallet> [--paid]   print the `baw contract-call preview` command
//   node desk.mjs free <wallet>                              free asks left today
//   node desk.mjs prices                                     BNB price per kind
//   node desk.mjs wait <askTxHash>                           wait for fly.ai's answer to that ask
//   node desk.mjs read <id>                                  one ask and its answer
//   node desk.mjs latest <kind> "<query>"                    the newest answer for this exact question (free read)
// DESK_ADDRESS / DESK_RPC override the contract and the RPC (tests).
const CONTRACT = process.env.DESK_ADDRESS || "0x074577f3dDBDAC57611321EFDF167Fb336b75266";   // FlyAgentDesk proxy on BNB Chain
const RPCS = process.env.DESK_RPC ? [process.env.DESK_RPC] : ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"];
const SEL = { ask: "0xfaacef2d", getAsk: "0x6b42fbaf", prices: "0xd3419bf3", freeLeft: "0xeb28217e", latest: "0x85ab060c" };
const TOPIC = {
  asked: "0xdae283cc8a1b1d5b0ef3d3b0b4b3ec54cd6be032d7fae3fc9ffdb51a039d555e",
  answered: "0xe6db961f4488cdeee96e205662d2f574e8aec430ed0ef5b0e5af2dfdc25f4d37",
  failed: "0x3b3fa62795055c7f68b7bd97eca670302ad5ca1db4c8d69f1039bfac50030752",
};
const KINDS = ["research", "rug", "forecast", "brain"];
const GRADES = { 1: "clear", 2: "careful", 3: "red", 4: "answer" };
const STATUS = ["none", "waiting", "answered", "no answer", "refunded"];

const pad = (s) => s.padStart(64, "0");
const word = (h, i) => h.slice(2 + i * 64, 2 + (i + 1) * 64);
const num = (h, i) => BigInt("0x" + word(h, i));
const hex = (n) => "0x" + BigInt(n).toString(16);
const out = (o) => console.log(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
function die(msg) { console.error(msg); process.exit(1); }
if (!CONTRACT) die("The FlyAgentDesk address isn't set in this script yet. See https://flyaiworld.com/agent-id");

async function rpc(method, params) {
  let last;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
const call = (data) => rpc("eth_call", [{ to: CONTRACT, data }, "latest"]);

function encodeString(s) {
  const b = new TextEncoder().encode(s);
  const data = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return pad(b.length.toString(16)) + data.padEnd(Math.ceil(data.length / 64) * 64, "0");
}
const kindQuery = (kind, query) => pad(Number(kind).toString(16)) + pad("40") + encodeString(query);
function strAt(data, wi) {
  const off = Number(num(data, wi)) / 32, len = Number(num(data, off));
  const b = data.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
  return new TextDecoder().decode(Uint8Array.from(b.match(/../g) || [], (x) => parseInt(x, 16)));
}
function normalize(kind, query) {
  let q = String(query ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) q = q.toLowerCase();
  if (!(Number(kind) >= 0 && Number(kind) < 4)) die("kind is 0 research, 1 rug, 2 forecast or 3 brain");
  if (!q || new TextEncoder().encode(q).length > 200) die("the query must be 1 to 200 bytes");
  if (Number(kind) === 1 && !/^0x[0-9a-f]{40}$/.test(q)) die("kind 1 (rug) needs a 0x token address");
  return q;
}

async function getAsk(id) {
  const h = await call(SEL.getAsk + pad(BigInt(id).toString(16)));
  return { id: String(id), agent: "0x" + word(h, 0).slice(24), kind: KINDS[Number(num(h, 1))], status: STATUS[Number(num(h, 2))],
           gradeCode: Number(num(h, 3)), free: num(h, 4) === 1n, askedAt: Number(num(h, 5)), answeredBlock: num(h, 6),
           paidWei: num(h, 7), askedBlock: num(h, 8) };
}

async function answerOf(a) {
  const idTopic = "0x" + pad(BigInt(a.id).toString(16));
  if (a.status === "answered") {
    const [l] = await rpc("eth_getLogs", [{ address: CONTRACT, fromBlock: hex(a.answeredBlock), toBlock: hex(a.answeredBlock), topics: [TOPIC.answered, idTopic] }]);
    let report = null;
    try { report = l ? JSON.parse(strAt(l.data, 1)) : null; } catch { report = l ? strAt(l.data, 1) : null; }
    return { grade: GRADES[a.gradeCode] || a.gradeCode, report, tx: l?.transactionHash, link: l ? `https://bscscan.com/tx/${l.transactionHash}` : null };
  }
  if (a.status === "no answer") {
    const head = BigInt(await rpc("eth_blockNumber", []));
    const to = a.askedBlock + 5000n < head ? a.askedBlock + 5000n : head;
    const [l] = await rpc("eth_getLogs", [{ address: CONTRACT, fromBlock: hex(a.askedBlock), toBlock: hex(to), topics: [TOPIC.failed, idTopic] }]);
    return { grade: "no answer", reason: l ? strAt(l.data, 0) : null, refundedWei: l ? num(l.data, 1) : 0n, tx: l?.transactionHash };
  }
  return { grade: a.status };
}

async function read(id) {
  const a = await getAsk(id);
  const [l] = await rpc("eth_getLogs", [{ address: CONTRACT, fromBlock: hex(a.askedBlock), toBlock: hex(a.askedBlock), topics: [TOPIC.asked, "0x" + pad(BigInt(id).toString(16))] }]);
  return { ...a, query: l ? strAt(l.data, 0) : null, ...(await answerOf(a)), note: "Public facts and fixed rules, not a buy or sell call." };
}

async function prices() {
  const h = await call(SEL.prices);
  return Object.fromEntries(KINDS.map((k, i) => [k, { wei: num(h, i).toString(), bnb: Number(num(h, i)) / 1e18 }]));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "build") {
  const [kind, query, wallet] = args;
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet || "")) die("usage: build <kind> \"<query>\" <agentic wallet 0x...> [--paid]");
  const q = normalize(kind, query);
  const value = args.includes("--paid") ? (await prices())[KINDS[Number(kind)]].wei : "0";
  console.log(`baw contract-call preview --binanceChainId 56 --from ${wallet} --to ${CONTRACT} --value ${value} --inputData ${SEL.ask}${kindQuery(kind, q)} --json`);
} else if (cmd === "free") {
  if (!/^0x[0-9a-fA-F]{40}$/.test(args[0] || "")) die("usage: free <wallet>");
  console.log(Number(BigInt(await call(SEL.freeLeft + pad(args[0].slice(2).toLowerCase())))));
} else if (cmd === "prices") {
  out(await prices());
} else if (cmd === "read") {
  out(await read(args[0]));
} else if (cmd === "latest") {
  const q = normalize(args[0], args[1]);
  const h = await call(SEL.latest + kindQuery(args[0], q));
  if (num(h, 0) === 0n) out({ found: false });
  else out({ found: true, ...(await read(num(h, 1))) });
} else if (cmd === "wait") {
  const tx = args[0];
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx || "")) die("usage: wait <ask transaction hash>");
  let rc = null;
  for (let i = 0; i < 60 && !rc; i++) { rc = await rpc("eth_getTransactionReceipt", [tx]).catch(() => null); if (!rc) await new Promise((r) => setTimeout(r, 3000)); }
  if (!rc) die("that transaction isn't on chain yet");
  const log = rc.logs.find((l) => l.address.toLowerCase() === CONTRACT.toLowerCase() && l.topics[0] === TOPIC.asked);
  if (!log) die(rc.status === "0x1" ? "no ask in that transaction" : "that transaction failed (reverted)");
  const id = BigInt(log.topics[1]);
  for (let i = 0; i < 60; i++) {
    const a = await getAsk(id);
    if (a.status !== "waiting") { out(await read(id)); process.exit(0); }
    await new Promise((r) => setTimeout(r, 3000));
  }
  out({ id: String(id), status: "waiting", note: "Not answered yet: run `read` again in a minute. After an hour the asker can refund it." });
} else {
  die("commands: build, free, prices, wait, read, latest (see the top of this file)");
}
