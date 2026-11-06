/** npm run setup: makes .env (from .env.example) and a fresh wallet if there is none, then shows its address.
 *  npm run wallet: shows the address and its HYPE balance. The private key is only written to .env, never printed. */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, formatEther, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV = ".env";
const cmd = process.argv[2] ?? "setup";

function readKey(text: string): string {
  const m = text.match(/^PRIVATE_KEY=(.*)$/m);
  return (m?.[1] ?? "").trim();
}

function readRpc(text: string): string {
  const m = text.match(/^RPC_URL=(.*)$/m);
  return (m?.[1] ?? "").trim() || "https://testnet-rpc.elysium.kinetiq.xyz";
}

async function main() {
  if (!existsSync(ENV)) {
    copyFileSync(".env.example", ENV);
    console.log("Created .env (your settings file).");
  }
  let text = readFileSync(ENV, "utf8");
  let key = readKey(text);

  if (!key) {
    if (cmd !== "setup") {
      console.log("No wallet yet. Run:  npm run setup");
      return;
    }
    key = generatePrivateKey();
    text = /^PRIVATE_KEY=.*$/m.test(text) ? text.replace(/^PRIVATE_KEY=.*$/m, `PRIVATE_KEY=${key}`) : `${text}\nPRIVATE_KEY=${key}\n`;
    writeFileSync(ENV, text);
    console.log("Made a new wallet. Its private key is saved in .env. Back that file up and never share it.");
  }

  const account = privateKeyToAccount(key as Hex);
  const rpc = readRpc(text);
  console.log("\n  Your bot wallet address:\n");
  console.log(`    ${account.address}\n`);
  try {
    const client = createPublicClient({ transport: http(rpc, { timeout: 10_000 }) });
    const [bal, chain] = await Promise.all([client.getBalance({ address: account.address }), client.getChainId()]);
    console.log(`  Balance: ${Number(formatEther(bal)).toFixed(4)} HYPE  (chain ${chain}${chain === 99801 ? ", testnet" : ""})`);
  } catch {
    console.log(`  (could not reach ${rpc} to read the balance)`);
  }
  console.log("\n  Send HYPE on Elysium to this address to trade for real. Paper mode needs nothing:  npm run paper\n");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
