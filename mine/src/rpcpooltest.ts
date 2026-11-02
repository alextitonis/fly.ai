// node --disable-warning=ExperimentalWarning src/rpcpooltest.ts : which RPC a call tries first (2026-11-02), offline
import assert from "node:assert/strict";

process.env.QUICKNODE_RPC = "https://qn.example/secretkey/";
const { postRpc } = await import("./rpcpool.ts");
const PUBLIC = "https://rpc.mainnet.chain.robinhood.com";
const QN = process.env.QUICKNODE_RPC;

const seen: string[] = [];
let down = new Set<string>();
globalThis.fetch = (async (u: string) => {
  seen.push(u);
  if (down.has(u)) return new Response("", { status: 503 });
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 });
}) as typeof fetch;
const ask = (method: string, url = PUBLIC) => postRpc(url, { jsonrpc: "2.0", id: 1, method, params: [] });

await ask("eth_call");
assert.deepEqual(seen, [PUBLIC], "a routine read goes to the public RPC");

seen.length = 0;
await ask("eth_sendRawTransaction");
assert.deepEqual(seen, [QN], "a transaction goes to QuickNode first");

seen.length = 0;
down = new Set([PUBLIC]);
await ask("eth_call");
assert.deepEqual(seen, [PUBLIC, QN], "QuickNode is the read's backup");

seen.length = 0;
down = new Set([QN]);
await ask("eth_sendRawTransaction");
assert.deepEqual(seen, [QN, PUBLIC], "a send still goes out when QuickNode is down");

seen.length = 0;
down = new Set();
await ask("eth_call", "https://mainnet.base.org");
assert.deepEqual(seen, ["https://mainnet.base.org"], "another chain never touches QuickNode");

seen.length = 0;
down = new Set(["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.drpc.org"]);
await assert.rejects(ask("eth_call", "https://mainnet.base.org"), (e: Error) => !e.message.includes("secretkey"));
assert.ok(!seen.includes(QN));

console.log("rpcpool tests pass");
