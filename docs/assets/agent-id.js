// /agent-id: Fly Desk for agents (FlyAgentDesk on BNB Chain, 2026-11-19). Reads the contract straight from a public
// BNB Chain RPC (no server of ours in between) and builds the `baw contract-call` command for an agent.
import { t } from "./i18n/i18n.js";

// set after the deploy (flytrade/agentdesk/README.md); empty = the page says "soon"
const DESK = "0x074577f3dDBDAC57611321EFDF167Fb336b75266";   // FlyAgentDesk proxy, deployed 2026-11-19 (block 134473437)
const RPCS = ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"];
const SEL = { asks: "0x3d413b46", getAsk: "0x6b42fbaf", prices: "0xd3419bf3", freePerDay: "0xea030f22" };
const TOPIC = {
  asked: "0xdae283cc8a1b1d5b0ef3d3b0b4b3ec54cd6be032d7fae3fc9ffdb51a039d555e",
  answered: "0xe6db961f4488cdeee96e205662d2f574e8aec430ed0ef5b0e5af2dfdc25f4d37",
  failed: "0x3b3fa62795055c7f68b7bd97eca670302ad5ca1db4c8d69f1039bfac50030752",
};
const KINDS = ["research", "rug", "forecast", "brain"];
const GRADES = { 1: "clear", 2: "careful", 3: "red", 4: "info" };
const FEED = 12;

const tt = (k, vars, fb) => { const s = t(k, vars); return !s || s === k ? fb : s; };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const hex = (n) => "0x" + BigInt(n).toString(16);
const word = (h, i) => h.slice(2 + i * 64, 2 + (i + 1) * 64);
const num = (h, i) => BigInt("0x" + word(h, i));

let rpcAt = 0;
async function rpc(method, params) {
  for (let n = 0; n < RPCS.length; n++) {
    const url = RPCS[(rpcAt + n) % RPCS.length];
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      rpcAt = (rpcAt + n) % RPCS.length;
      return j.result;
    } catch { /* next RPC */ }
  }
  throw new Error("rpc");
}
const call = (data) => rpc("eth_call", [{ to: DESK, data }, "latest"]);

function strAt(data, wordIndex) {    // an ABI string whose offset is in word `wordIndex` of event data
  const off = Number(num(data, wordIndex)) / 32;
  const len = Number(num(data, off));
  const bytes = data.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
  return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], (b) => parseInt(b, 16)));
}

async function logAt(block, topic, id) {
  const logs = await rpc("eth_getLogs", [{ address: DESK, fromBlock: hex(block), toBlock: hex(block),
    topics: [topic, "0x" + BigInt(id).toString(16).padStart(64, "0")] }]);
  return logs[0] || null;
}

async function row(id) {
  const h = await call(SEL.getAsk + BigInt(id).toString(16).padStart(64, "0"));
  // (agent, kind, status, grade, free, askedAt, answeredBlock, paid, askedBlock, key)
  const a = { agent: "0x" + word(h, 0).slice(24), kind: Number(num(h, 1)), status: Number(num(h, 2)), grade: Number(num(h, 3)),
              askedAt: Number(num(h, 5)), answeredBlock: num(h, 6), askedBlock: num(h, 8) };
  const asked = await logAt(a.askedBlock, TOPIC.asked, id).catch(() => null);
  a.query = asked ? strAt(asked.data, 0) : "";
  a.tx = asked?.transactionHash;
  if (a.status === 2) {
    const ans = await logAt(a.answeredBlock, TOPIC.answered, id).catch(() => null);
    try { a.report = ans ? JSON.parse(strAt(ans.data, 1)) : null; } catch { a.report = null; }
    a.answerTx = ans?.transactionHash;
  }
  return a;
}

function why(a) {
  const r = a.report;
  if (!r) return "";
  if (r.bad?.length) return r.bad.slice(0, 2).join(" · ");
  if (r.careful?.length) return r.careful.slice(0, 2).join(" · ");
  if (r.good?.length) return r.good.slice(0, 2).join(" · ");
  if (r.answer) return JSON.stringify(r.answer).slice(0, 140);
  return "";
}

function render(rows) {
  const ul = $("aid-feed");
  if (!rows.length) return;
  ul.innerHTML = rows.map((a) => {
    const g = a.status === 1 ? "waiting" : a.status === 2 ? GRADES[a.grade] || "info" : a.status === 3 ? "failed" : "refunded";
    const label = tt(`agentid.grade.${g}`, null, g);
    const when = new Date(a.askedAt * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    const link = a.answerTx || a.tx;
    return `<li><span class="aid-grade ${g}">${esc(label)}</span>`
      + `<span class="q"><b>${KINDS[a.kind] || a.kind}</b> ${esc(a.query)}</span>`
      + `<span class="meta">${link ? `<a href="https://bscscan.com/tx/${link}" target="_blank" rel="noopener">${esc(when)}</a>` : esc(when)} · ${short(a.agent)}</span>`
      + (why(a) ? `<span class="why">${esc(why(a))}</span>` : "") + "</li>";
  }).join("");
}

async function load() {
  if (!DESK) return;
  $("aid-contract").innerHTML = `${esc(tt("agentid.live.contract", null, "Contract"))}: <a href="https://bscscan.com/address/${DESK}#code" target="_blank" rel="noopener">${short(DESK)}</a>`;
  const [n, free, prices] = await Promise.all([call(SEL.asks), call(SEL.freePerDay), call(SEL.prices)]);
  const total = Number(BigInt(n));
  $("aid-asks").textContent = total.toLocaleString();
  $("aid-free").textContent = String(Number(BigInt(free)));
  const bnb = (w) => (Number(w) / 1e18).toFixed(5).replace(/0+$/, "");
  $("aid-prices").textContent = tt("agentid.kinds.priceLive", { free: Number(BigInt(free)), research: bnb(num(prices, 0)), brain: bnb(num(prices, 3)) },
    `${Number(BigInt(free))} free asks a day per Agent ID, then ${bnb(num(prices, 0))} BNB for research or a rug check, ${bnb(num(prices, 3))} BNB for a forecast or the brain. No answer means everything goes back.`);
  const ids = [];
  for (let i = total - 1; i >= 0 && ids.length < FEED; i--) ids.push(i);
  const rows = [];
  for (const id of ids) rows.push(await row(id).catch(() => null));
  render(rows.filter(Boolean));
  // distinct askers among the newest 500 (cheap: one eth_call each would be too many, so read the Asked logs' topics)
  const recent = [];
  for (let i = total - 1; i >= 0 && recent.length < 500; i--) recent.push(i);
  const seen = new Set(rows.filter(Boolean).map((a) => a.agent.toLowerCase()));
  if (recent.length > FEED) {
    const head = BigInt(await rpc("eth_blockNumber", []));
    const oldest = rows.filter(Boolean).at(-1)?.askedBlock ?? head;
    for (let to = head; to > oldest - 200_000n && to > 0n; to -= 5_000n) {
      const logs = await rpc("eth_getLogs", [{ address: DESK, fromBlock: hex(to - 4_999n > 0n ? to - 4_999n : 0n), toBlock: hex(to), topics: [TOPIC.asked] }]).catch(() => []);
      for (const l of logs) seen.add("0x" + l.topics[2].slice(26));
    }
  }
  $("aid-agents").textContent = seen.size.toLocaleString();
}

// ---------------------------------------------------------------- the command builder
function encodeAsk(kind, query) {
  const bytes = new TextEncoder().encode(query);
  const pad = (s) => s.padStart(64, "0");
  const data = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0xfaacef2d" + pad(Number(kind).toString(16)) + pad("40") + pad(bytes.length.toString(16))
    + data.padEnd(Math.ceil(data.length / 64) * 64, "0");
}

function build() {
  const kind = $("aid-kind").value;
  let q = $("aid-query").value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) q = q.toLowerCase();       // the contract keys answers by the exact text
  const from = $("aid-from").value.trim() || "<your agentic wallet>";
  if (!q) { $("aid-cmd").textContent = tt("agentid.build.hint", null, "Type a question to build the command."); return; }
  if (new TextEncoder().encode(q).length > 200) { $("aid-cmd").textContent = tt("agentid.build.long", null, "Questions are 200 bytes at most."); return; }
  $("aid-cmd").textContent = `baw contract-call preview --binanceChainId 56 --from ${from} --to ${DESK || "<FlyAgentDesk>"} --value 0 --inputData ${encodeAsk(kind, q)} --json`;
}

for (const id of ["aid-kind", "aid-query", "aid-from"]) $(id).addEventListener("input", build);
$("aid-copy").addEventListener("click", () => navigator.clipboard?.writeText($("aid-cmd").textContent).catch(() => {}));
build();
load().catch(() => {});
