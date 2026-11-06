// Pays a closed fee drop (src/feedrop.ts): each holder's share of $FLYAI sent from the dev wallet through FlyLock
// (lockFor: it shows on the Claim page and unlocks 7 days later), then booked paid on the server.
//
// Before: claim the month's Pons fees, convert them (less your 10%) to $FLYAI in the dev wallet, and close the drop:
//   npm run pay:feedrop -- 1 --close 1234567    freezes drop 1's split for 1,234,567 $FLYAI (the drop must have ended)
// Then:
//   npm run pay:feedrop -- 1                    lists drop 1's shares and what would be sent, sends nothing
//   npm run pay:feedrop -- 1 --send             asks for the dev wallet key (hidden), shows the plan, sends after "yes"
//
// The key is read from a hidden prompt (or PAY_TO_KEY in the environment) and never written anywhere. Shares already
// booked paid are skipped, so it can be run again after a stop. Stops at the first send that may have failed.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Relayer } from "../src/relay.ts";
import { selector } from "../src/staking.ts";
import { rpc } from "../src/orders.ts";

const API = "https://flyai-mine.fly.dev";
const RPC = process.env.CLAIM_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const FLYLOCK = "0x87Ded9d9788a1F6653A0261eF84c56658D0bf5e9";
const PAY_FROM = "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea";   // the dev wallet
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

const fromWei = (w: bigint) => {
  const frac = (w % WEI).toString().padStart(18, "0").slice(0, 2).replace(/0+$/, "");
  return `${(w / WEI).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
};
/** whole $FLYAI (a float from the server) to wei, rounded down to 0.0001 */
const toWei = (n: number) => BigInt(Math.floor(n * 10_000)) * (WEI / 10_000n);
const word = (n: bigint) => n.toString(16).padStart(64, "0");

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
const drop = Number(args.find((a) => /^\d+$/.test(a)));
if (!drop) throw new Error("which drop? e.g. npm run pay:feedrop -- 1");
const closeAt = args.indexOf("--close");
if (closeAt >= 0) {
  const flyai = Number(String(args[closeAt + 1] ?? "").replace(/[, _]/g, ""));
  if (!(flyai > 0)) throw new Error("--close needs the whole $FLYAI to share, e.g. --close 1234567");
  const r = await admin("/api/admin/feedrop/close", { drop, flyai });
  console.log(`drop ${drop} closed: ${r.holders} holders share ${flyai.toLocaleString("en-US")} $FLYAI`);
  process.exit(0);
}
const sending = args.includes("--send");

type Share = { address: string; avg_flyai: number; share: number; flyai: number; paid: boolean };
const list = await admin(`/api/admin/feedrop?drop=${drop}`);
if (!list.closed) {
  console.log(`drop ${drop} isn't closed yet: close it first with --close <whole $FLYAI to share>`);
  process.exit(0);
}
const rows: Share[] = list.rows;
const plan = rows.filter((r) => !r.paid).map((r) => ({ ...r, wei: toWei(r.flyai) })).filter((r) => r.wei > 0n);
console.log(`drop ${drop}: ${rows.length} holders, ${rows.length - plan.length} already paid; Pons fees $${Number(list.fees_usd).toFixed(2)}`);
for (const r of plan) {
  console.log(`  ${r.address}  avg ${Math.round(r.avg_flyai).toLocaleString("en-US")}  ${(r.share * 100).toFixed(3)}%  -> ${fromWei(r.wei)} FLYAI`);
}
const total = plan.reduce((s, r) => s + r.wei, 0n);
console.log(`to send: ${plan.length} locked shares, ${fromWei(total)} FLYAI from ${PAY_FROM} through FlyLock`);
if (!plan.length || !sending) {
  if (plan.length) console.log("dry run; add --send to pay them");
  process.exit(0);
}

const key = process.env.PAY_TO_KEY ?? (await ask("dev wallet private key (hidden): ", true));
const payer = new Relayer(key, RPC, "dev wallet key");
if (payer.address.toLowerCase() !== PAY_FROM.toLowerCase()) throw new Error(`that key is ${payer.address}, not the dev wallet ${PAY_FROM}`);
const call = async (to: string, sig: string, ...a: bigint[]) =>
  BigInt(await rpc(RPC, "eth_call", [{ to, data: `0x${selector(sig)}${a.map(word).join("")}` }, "latest"]));
const flyai = await call(FLYAI, "balanceOf(address)", BigInt(PAY_FROM));
const gas = await payer.balance();
console.log(`the dev wallet holds ${fromWei(flyai)} FLYAI and ${fromWei(gas)} ETH`);
if (flyai < total) throw new Error(`not enough FLYAI: needs ${fromWei(total)}`);
if (gas === 0n) throw new Error("no ETH for gas");

if ((await ask(`lock ${fromWei(total)} FLYAI for ${plan.length} holders? type yes: `)).toLowerCase() !== "yes") {
  console.log("nothing sent");
  process.exit(0);
}

// one approval for the whole drop (FlyLock pulls each share from the dev wallet)
const allowance = await call(FLYAI, "allowance(address,address)", BigInt(PAY_FROM), BigInt(FLYLOCK));
if (allowance < total) {
  const tx = await payer.send(FLYAI, `0x${selector("approve(address,uint256)")}${word(BigInt(FLYLOCK))}${word(total)}`);
  console.log(`approved FlyLock for ${fromWei(total)} FLYAI: https://robinhoodchain.blockscout.com/tx/${tx}`);
}

for (const r of plan) {
  let tx: string;
  try {
    tx = await payer.send(FLYLOCK, `0x${selector("lockFor(address,uint256)")}${word(BigInt(r.address))}${word(r.wei)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as { unsent?: boolean }).unsent) console.error(`${r.address} not sent (${msg}); stopping`);
    else console.error(`${r.address} MAY HAVE BEEN SENT, check the dev wallet on the explorer before running again: ${msg}`);
    process.exit(1);
  }
  console.log(`${r.address} locked ${fromWei(r.wei)} FLYAI: https://robinhoodchain.blockscout.com/tx/${tx}`);
  try {
    await admin("/api/admin/feedrop/paid", { drop, wallet: r.address, tx });
  } catch (err) {
    console.error(`${r.address} sent but NOT booked (${err instanceof Error ? err.message : err}); book it by hand with that tx before running again`);
    process.exit(1);
  }
}
console.log("done");
