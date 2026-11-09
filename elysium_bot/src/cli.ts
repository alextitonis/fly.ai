import { formatEther, parseEther } from "viem";
import { Bot, loadHelper, saveHelper } from "./bot.js";
import { loadConfig } from "./config.js";
import { HELPER_ABI } from "./helper.js";
import { entryGate, PROBE_DIV } from "./strategy.js";

const cmd = process.argv[2] ?? "run";
// BOT_MODE=live (set on the server) does the same as --live
const live = process.argv.includes("--live") || process.env.BOT_MODE === "live";
const cfg = loadConfig();

async function main() {
  if (cmd === "run") {
    const bot = new Bot(cfg, live);
    await bot.init();
    if (live) console.log("\n  LIVE MODE: real HYPE will be spent. Ctrl+C to stop.\n");
    await bot.run();
    return;
  }

  if (cmd === "scan") {
    // Dry look at the last LOOKBACK_BLOCKS: every new HYPE pool and whether it would pass the entry gate now.
    const bot = new Bot(cfg, false);
    bot.keepOld = true;
    await bot.init();
    await bot.poll();
    const buy = parseEther(String(cfg.buyHype));
    if (!bot.cands.size) console.log("no new HYPE pools in the lookback window (raise LOOKBACK_BLOCKS)");
    for (const c of bot.cands.values()) {
      const r = c.found.route;
      if (r.kind === 2) await (bot as any).fixV2Fee(c, buy);
      const trip = await bot.chain.roundTrip(r, buy);
      const probe = trip.ok ? await bot.chain.roundTrip(r, buy / PROBE_DIV) : null;
      const g = entryGate(cfg, buy, trip, probe);
      console.log(`${g.ok ? "PASS" : "skip"}  ${c.symbol.padEnd(10)} v${r.kind}  ${g.why}`);
    }
    return;
  }

  if (cmd === "status") {
    const bot = new Bot(cfg, live);
    await bot.init();
    await bot.manage().catch(() => {});
    const s = bot.summary();
    console.log(`\nclosed trades: ${s.trades} (${s.wins} won), P&L ${s.pnl.toFixed(4)} HYPE`);
    console.log(`open: ${s.open}, at risk ${s.openCost.toFixed(4)} HYPE, worth now ${s.openVal.toFixed(4)} HYPE`);
    if (!live) console.log(`paper balance: ${bot.state.paperBalance.toFixed(4)} HYPE`);
    for (const h of bot.state.open)
      console.log(`  ${h.symbol.padEnd(10)} spent ${h.spentHype} got back ${h.receivedHype.toFixed(4)} worth ${h.lastValue.toFixed(4)} (${Math.round((Date.now() - h.openedAt) / 60000)} min)`);
    return;
  }

  if (cmd === "deploy") {
    const bot = new Bot(cfg, false);
    const id = await bot.init();
    if (!bot.chain.account) throw new Error("set PRIVATE_KEY in .env first");
    const have = loadHelper(cfg, id);
    if (have && !process.argv.includes("--force")) {
      console.log(`helper already deployed on chain ${id}: ${have}  (add --force for a new one)`);
      return;
    }
    console.log(`deploying SnipeHelper from ${bot.chain.account.address} on chain ${id}…`);
    const addr = await bot.chain.deployHelper();
    saveHelper(cfg, id, addr);
    console.log(`helper: ${addr} (saved to ${cfg.dataDir}/helpers.json)`);
    return;
  }

  if (cmd === "sell-all") {
    const bot = new Bot(cfg, true);
    await bot.init();
    for (const h of [...bot.state.open]) {
      try {
        const res = await bot.chain.sell(bot.helper!, h.route, -1n, 0n);
        console.log(`sold ${h.symbol} for ${formatEther(res.out)} HYPE  ${res.hash}`);
        h.receivedHype += Number(formatEther(res.out));
        h.tokens = "0";
      } catch (e: any) {
        console.log(`could not sell ${h.symbol}: ${String(e?.shortMessage ?? e?.message).slice(0, 120)}`);
      }
    }
    await bot.manage();
    return;
  }

  if (cmd === "withdraw") {
    // Sends any HYPE left in the helper to the wallet, and any token given with --token 0x… too.
    const bot = new Bot(cfg, true);
    await bot.init();
    const me = bot.chain.account!.address;
    const ti = process.argv.indexOf("--token");
    if (ti > 0) console.log("sweep", await bot.chain.ownerCall(bot.helper!, "sweep", [process.argv[ti + 1], me]));
    console.log("withdraw", await bot.chain.ownerCall(bot.helper!, "withdraw", [me]));
    return;
  }

  console.log("commands: run [--live] | scan | status [--live] | deploy [--force] | sell-all | withdraw [--token 0x…]");
  void HELPER_ABI;
}

main().catch((e) => {
  console.error(String(e?.shortMessage ?? e?.message ?? e));
  process.exit(1);
});
