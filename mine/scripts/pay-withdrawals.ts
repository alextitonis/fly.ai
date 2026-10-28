// Pays the open game withdrawals (mine.withdraw_requests) from PAY_TO, then books each one on the server.
//
//   npm run pay:withdrawals              lists what's open and what would be sent, sends nothing
//   npm run pay:withdrawals -- --send    asks for the PAY_TO key (hidden), shows the plan, sends after you type "yes"
//   npm run pay:withdrawals -- --send 8 5    only those request ids
//
// The key is read from a hidden prompt (or PAY_TO_KEY in the environment) and never written anywhere.
// Requests asking for more than the wallet's game balance are skipped. Stops at the first send that may have failed.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Relayer } from "../src/relay.ts";
import { selector } from "../src/staking.ts";
import { rpc } from "../src/orders.ts";

const API = "https://flyai-mine.fly.dev";
const RPC = process.env.CLAIM_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const PAY_TO = "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea";
const WEI = 10n ** 18n;

const envFile = (name: string) => {
  try {
    const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
};
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? envFile("ADMIN_TOKEN");
if (!ADMIN_TOKEN) throw new Error("ADMIN_TOKEN missing (mine/.env.local)");

const toWei = (s: string) => {
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * WEI + BigInt((frac + "0".repeat(18)).slice(0, 18));
};
const fromWei = (w: bigint) => {
  const frac = (w % WEI).toString().padStart(18, "0").replace(/0+$/, "");
  return `${(w / WEI).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
};
const word = (n: bigint) => n.toString(16).padStart(64, "0");
const trt = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");

async function admin(path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return JSON.parse(text);
}

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) (rl as any)._writeToOutput = (s: string) => { if (s.startsWith(question)) process.stdout.write(question); };
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); }));
}

const args = process.argv.slice(2);
const sending = args.includes("--send");
const only = new Set(args.filter((a) => /^\d+$/.test(a)).map(Number));

type Request = { id: number; wallet: string; amount: string; balance: string; created_at: number };
const open: Request[] = (await admin("/api/admin/roulette")).withdraw_requests;
const plan: (Request & { wei: bigint })[] = [];
console.log(`open game withdrawals: ${open.length}`);
for (const r of open) {
  const wei = toWei(r.amount);
  const why = only.size && !only.has(r.id) ? "not picked"
    : wei === 0n ? "asks for 0"
    : toWei(r.balance) < wei ? `balance is only ${r.balance}`
    : null;
  console.log(`  #${r.id}  ${r.wallet}  ${fromWei(wei)} FLYAI  asked ${trt(r.created_at)} TRT  ${why ? `SKIP (${why})` : "pay"}`);
  if (!why) plan.push({ ...r, wei });
}
const total = plan.reduce((s, r) => s + r.wei, 0n);
console.log(`to send: ${plan.length} transfers, ${fromWei(total)} FLYAI from ${PAY_TO}`);
if (!plan.length || !sending) {
  if (plan.length) console.log("dry run; add --send to pay them");
  process.exit(0);
}

const key = process.env.PAY_TO_KEY ?? (await ask("PAY_TO private key (hidden): ", true));
const payer = new Relayer(key, RPC, "PAY_TO key");
if (payer.address.toLowerCase() !== PAY_TO.toLowerCase()) throw new Error(`that key is ${payer.address}, not PAY_TO ${PAY_TO}`);
const flyai = BigInt(await rpc(RPC, "eth_call", [{ to: FLYAI, data: `0x${selector("balanceOf(address)")}${word(BigInt(PAY_TO))}` }, "latest"]));
const gas = await payer.balance();
console.log(`PAY_TO holds ${fromWei(flyai)} FLYAI and ${fromWei(gas)} ETH`);
if (flyai < total) throw new Error(`not enough FLYAI: needs ${fromWei(total)}`);
if (gas === 0n) throw new Error("no ETH for gas");

if ((await ask(`send ${fromWei(total)} FLYAI in ${plan.length} transfers? type yes: `)).toLowerCase() !== "yes") {
  console.log("nothing sent");
  process.exit(0);
}

for (const r of plan) {
  let tx: string;
  try {
    tx = await payer.send(FLYAI, `0x${selector("transfer(address,uint256)")}${word(BigInt(r.wallet))}${word(r.wei)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as { unsent?: boolean }).unsent) {
      console.error(`#${r.id} not sent (${msg}); stopping`);
    } else {
      console.error(`#${r.id} MAY HAVE BEEN SENT, check PAY_TO on the explorer before running again: ${msg}`);
    }
    process.exit(1);
  }
  console.log(`#${r.id} sent ${fromWei(r.wei)} FLYAI to ${r.wallet}: https://robinhoodchain.blockscout.com/tx/${tx}`);
  try {
    await admin("/api/admin/withdraw", { wallet: r.wallet, amount: r.amount, tx });
    console.log(`#${r.id} booked paid`);
  } catch (err) {
    console.error(`#${r.id} sent but NOT booked (${err instanceof Error ? err.message : err}); book it by hand with that tx before running again`);
    process.exit(1);
  }
}
console.log("done");
