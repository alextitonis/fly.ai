/** The sniper loop: watch new pools -> gate with simulated round trips -> buy small -> sell on the exit rules. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, getAddress, parseEther, type Address } from "viem";
import { KNOWN, type Config } from "./config.js";
import { parseLog, TOPICS, V2_FEES, type Found } from "./discover.js";
import { Chain, HELPER_ABI, type Route } from "./helper.js";
import { entryGate, exitRule, PROBE_DIV, type Position } from "./strategy.js";

interface Held extends Position {
  route: Route;
}

interface State {
  chainId: number;
  mode: "paper" | "live";
  paperBalance: number;
  spentTotal: number;
  buys: number[]; // timestamps, for the hourly cap
  open: Held[];
  closed: (Held & { closedAt: number; pnl: number; why: string })[];
}

interface Candidate {
  found: Found;
  symbol: string;
  seenAt: number;
  checks: number;
  lastWhy: string;
}

const ts = () => new Date().toLocaleTimeString();
const log = (...a: unknown[]) => console.log(ts(), ...a);
const fx = (n: number, d = 4) => n.toFixed(d);
const toNum = (w: bigint) => Number(formatEther(w));
const reviver = (_k: string, v: any) => v;
const replacer = (_k: string, v: any) => (typeof v === "bigint" ? v.toString() : v);

/** Route fields come back from JSON as strings/numbers; fee and tickSpacing must stay numbers. */
function fixRoute(r: Route): Route {
  return { ...r, key: { ...r.key, fee: Number(r.key.fee), tickSpacing: Number(r.key.tickSpacing) } };
}

export class Bot {
  chain: Chain;
  state!: State;
  whype?: Address;
  helper?: Address;
  cands = new Map<string, Candidate>();
  seen = new Set<string>();
  v2Fee = new Map<string, number>(); // factory -> fee bps
  lastBlock = 0n;
  lastRecheck = new Map<string, number>();
  stopping = false;
  keepOld = false; // scan: look at every pool in the lookback, however old

  constructor(public cfg: Config, public live: boolean) {
    this.chain = new Chain(cfg);
  }

  private path(name: string) {
    return join(this.cfg.dataDir, `${this.chain.chainId}-${this.live ? "live" : "paper"}-${name}`);
  }

  async init() {
    const id = await this.chain.init();
    mkdirSync(this.cfg.dataDir, { recursive: true });
    this.whype = this.cfg.whype ?? KNOWN[id]?.whype;
    const p = this.path("state.json");
    this.state = existsSync(p)
      ? JSON.parse(readFileSync(p, "utf8"), reviver)
      : { chainId: id, mode: this.live ? "live" : "paper", paperBalance: this.cfg.paperBalanceHype, spentTotal: 0, buys: [], open: [], closed: [] };
    this.state.open = this.state.open.map((h) => ({ ...h, route: fixRoute(h.route) }));
    for (const h of this.state.open) this.seen.add(h.id);
    for (const h of this.state.closed) this.seen.add(h.id);
    if (this.live) {
      if (!this.chain.account) throw new Error("live mode needs PRIVATE_KEY in .env");
      this.helper = loadHelper(this.cfg, id);
      if (!this.helper) {
        // first live run on this chain: deploy this wallet's own helper contract (one small transaction)
        log("first live run on this chain: deploying your helper contract…");
        this.helper = await this.chain.deployHelper();
        saveHelper(this.cfg, id, this.helper);
        log(`helper deployed: ${this.helper}`);
      }
      const owner = (await this.chain.pub.readContract({ address: this.helper, abi: HELPER_ABI, functionName: "owner" })) as Address;
      if (getAddress(owner) !== this.chain.account.address)
        throw new Error(`helper ${this.helper} belongs to ${owner}, not this wallet: run  npm run deploy-helper -- --force`);
    }
    const name = KNOWN[id]?.name ?? `chain ${id}`;
    log(`connected: ${name} (chain ${id}), mode ${this.live ? "LIVE" : "paper"}`);
    log(`WHYPE: ${this.whype ?? "not set (v2/v3 pools skipped; v4 native-HYPE pools still traded)"}`);
    if (this.cfg.allowFactories.length) log(`only factories/PoolManagers: ${this.cfg.allowFactories.join(", ")}`);
    if (this.live) {
      const bal = toNum(await this.chain.pub.getBalance({ address: this.chain.account!.address }));
      log(`wallet ${this.chain.account!.address}: ${fx(bal)} HYPE, helper ${this.helper}`);
    }
    return id;
  }

  save() {
    writeFileSync(this.path("state.json"), JSON.stringify(this.state, replacer, 1));
  }

  private trade(row: Record<string, unknown>) {
    const f = this.path("trades.csv");
    const cols = ["time", "side", "symbol", "token", "hype", "tokens", "why", "tx"];
    if (!existsSync(f)) appendFileSync(f, cols.join(",") + "\n");
    appendFileSync(f, cols.map((c) => String(row[c] ?? "").replace(/,/g, ";")).join(",") + "\n");
  }

  // ------------------------------------------------------------- discovery

  async poll() {
    const head = await this.chain.pub.getBlockNumber();
    if (this.lastBlock === 0n) this.lastBlock = head - BigInt(this.cfg.lookbackBlocks);
    let from = this.lastBlock + 1n;
    if (head - from > BigInt(this.cfg.maxLogRange)) from = head - BigInt(this.cfg.maxLogRange);
    if (from > head) return;
    const logs = await this.chain.pub.request({
      method: "eth_getLogs",
      params: [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${head.toString(16)}`, topics: [[TOPICS.v2, TOPICS.v3, TOPICS.v4]] }],
    } as any) as any[];
    this.lastBlock = head;
    for (const l of logs) {
      const found = parseLog({ ...l, blockNumber: BigInt(l.blockNumber) }, this.whype);
      if (!found || this.seen.has(found.id)) continue;
      this.seen.add(found.id);
      if (this.cfg.allowFactories.length && !this.cfg.allowFactories.includes(getAddress(found.factory))) continue;
      // a pool's age counts from its block, so pools found in the start-up lookback are not "new"
      const blk = await this.chain.pub.getBlock({ blockNumber: found.block });
      const bornAt = Number(blk.timestamp) * 1000;
      if (!this.keepOld && Date.now() - bornAt > this.cfg.maxPoolAgeSec * 1000) continue;
      const symbol = await this.chain.symbol(found.route.token);
      this.cands.set(found.id, { found, symbol, seenAt: bornAt, checks: 0, lastWhy: "new" });
      log(`new pool  ${symbol.padEnd(10)} v${found.route.kind} ${found.id.slice(0, 20)}… token ${found.route.token}`);
    }
  }

  /** v2 forks: find the pair's real fee once per factory. */
  private async fixV2Fee(c: Candidate, buy: bigint) {
    const r = c.found.route;
    if (r.kind !== 2) return;
    const known = this.v2Fee.get(c.found.factory);
    if (known !== undefined) return void (r.v2FeeBps = known);
    for (const fee of V2_FEES) {
      const t = await this.chain.roundTrip({ ...r, v2FeeBps: fee }, buy);
      if (t.ok) {
        r.v2FeeBps = fee;
        this.v2Fee.set(c.found.factory, fee);
        return;
      }
    }
  }

  // ------------------------------------------------------------- entries

  private budgetLeft(): { ok: boolean; why: string } {
    const now = Date.now();
    this.state.buys = this.state.buys.filter((t) => now - t < 3_600_000);
    if (this.state.open.length >= this.cfg.maxOpen) return { ok: false, why: "max open" };
    if (this.state.buys.length >= this.cfg.maxBuysPerHour) return { ok: false, why: "hourly buy cap" };
    if (this.state.spentTotal + this.cfg.buyHype > this.cfg.maxSpendHype) return { ok: false, why: "MAX_SPEND_HYPE reached" };
    if (!this.live && this.state.paperBalance < this.cfg.buyHype) return { ok: false, why: "paper balance" };
    return { ok: true, why: "" };
  }

  async checkCandidates() {
    const buy = parseEther(String(this.cfg.buyHype));
    for (const [id, c] of this.cands) {
      if (Date.now() - c.seenAt > this.cfg.maxPoolAgeSec * 1000) {
        this.cands.delete(id);
        log(`skip      ${c.symbol.padEnd(10)} never passed: ${c.lastWhy}`);
        continue;
      }
      const room = this.budgetLeft();
      if (!room.ok) return;
      c.checks++;
      try {
        await this.fixV2Fee(c, buy);
        const r = c.found.route;
        const trip = await this.chain.roundTrip(r, buy);
        const probe = trip.ok ? await this.chain.roundTrip(r, buy / PROBE_DIV) : null;
        const g = entryGate(this.cfg, buy, trip, probe);
        c.lastWhy = g.why;
        if (!g.ok) continue;
        this.cands.delete(id);
        await this.enter(c, buy, trip.got, g.taxRatio ?? 1, g.why);
      } catch (e: any) {
        c.lastWhy = String(e?.shortMessage ?? e?.message ?? e).slice(0, 80);
      }
    }
  }

  private async enter(c: Candidate, buy: bigint, simGot: bigint, taxRatio: number, why: string) {
    const r = c.found.route;
    let got = simGot;
    let tx = "paper";
    if (this.live) {
      const minOut = (simGot * BigInt(Math.round((100 - this.cfg.slippagePct) * 100))) / 10_000n;
      const bal = await this.chain.pub.getBalance({ address: this.chain.account!.address });
      if (toNum(bal) < this.cfg.buyHype + this.cfg.gasReserveHype) return log(`skip      ${c.symbol} wallet too low (${fx(toNum(bal))} HYPE)`);
      const res = await this.chain.buy(this.helper!, r, buy, minOut);
      got = res.got;
      tx = res.hash;
    } else {
      this.state.paperBalance -= this.cfg.buyHype;
    }
    const h: Held = {
      id: c.found.id, symbol: c.symbol, route: r, costHype: this.cfg.buyHype, spentHype: this.cfg.buyHype,
      receivedHype: 0, tokens: got.toString(), taxRatio, peakValue: this.cfg.buyHype, lastValue: this.cfg.buyHype,
      openedAt: Date.now(), tookProfit: false, sellFails: 0,
    };
    this.state.open.push(h);
    this.state.buys.push(Date.now());
    this.state.spentTotal += this.cfg.buyHype;
    this.save();
    this.trade({ time: new Date().toISOString(), side: "buy", symbol: c.symbol, token: r.token, hype: this.cfg.buyHype, tokens: got, why, tx });
    log(`BUY       ${c.symbol.padEnd(10)} ${this.cfg.buyHype} HYPE (${why}) ${tx === "paper" ? "[paper]" : tx}`);
  }

  // ------------------------------------------------------------- exits

  async manage() {
    const now = Date.now();
    for (const h of [...this.state.open]) {
      try {
        const tokens = BigInt(h.tokens);
        if (tokens === 0n) { this.close(h, "empty"); continue; }
        // live: our buy is on chain, a plain quote is right. paper: put our net HYPE in first (see quoteAfterBuy)
        const net = h.spentHype - h.receivedHype;
        const q = this.live || net <= 0
          ? await this.chain.quoteSell(h.route, tokens)
          : await this.chain.quoteAfterBuy(h.route, tokens, parseEther(net.toFixed(18)));
        let sellable = q !== null;
        // every RECHECK_SEC: a fresh small round trip catches a sell switched off after we bought
        if (sellable && now - (this.lastRecheck.get(h.id) ?? 0) > this.cfg.recheckSec * 1000) {
          this.lastRecheck.set(h.id, now);
          const t = await this.chain.roundTrip(h.route, parseEther(String(Math.min(this.cfg.buyHype, 0.01))));
          if (!t.ok) sellable = false;
        }
        const value = q === null ? 0 : toNum(q) * h.taxRatio;
        h.lastValue = value;
        if (value > h.peakValue) h.peakValue = value;
        const ex = exitRule(this.cfg, h, value, now, sellable);
        if (ex) await this.exit(h, ex.part, ex.why, value);
      } catch (e: any) {
        log(`warn      ${h.symbol}: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 100)}`);
      }
    }
    this.save();
  }

  private async exit(h: Held, part: number, why: string, value: number) {
    const tokens = BigInt(h.tokens);
    const amount = part >= 1 ? tokens : (tokens * BigInt(Math.round(part * 10_000))) / 10_000n;
    let out = value * (part >= 1 ? 1 : part);
    let tx = "paper";
    if (this.live) {
      // slippage widens with each failed try; after 3 fails sell at any price
      const slip = h.sellFails >= 3 ? 100 : this.cfg.slippagePct * (1 + h.sellFails);
      const minOut = parseEther(fx(Math.max(0, out * (1 - slip / 100)), 12));
      try {
        const res = await this.chain.sell(this.helper!, h.route, part >= 1 ? -1n : amount, minOut);
        out = toNum(res.out);
        tx = res.hash;
      } catch (e: any) {
        h.sellFails++;
        log(`SELL FAIL ${h.symbol} try ${h.sellFails} (${why}): ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 100)}`);
        return;
      }
    } else {
      this.state.paperBalance += out;
    }
    h.receivedHype += out;
    h.tokens = (tokens - amount).toString();
    this.trade({ time: new Date().toISOString(), side: "sell", symbol: h.symbol, token: h.route.token, hype: fx(out, 6), tokens: amount, why, tx });
    log(`SELL      ${h.symbol.padEnd(10)} ${part >= 1 ? "all" : Math.round(part * 100) + "%"} for ${fx(out)} HYPE (${why}) ${tx === "paper" ? "[paper]" : tx}`);
    if (part >= 1 || tokens - amount === 0n) this.close(h, why);
    else {
      h.tookProfit = true;
      h.costHype = Math.max(0, h.spentHype - h.receivedHype);
      h.peakValue = value * (1 - part);
    }
  }

  private close(h: Held, why: string) {
    this.state.open = this.state.open.filter((x) => x.id !== h.id);
    const pnl = h.receivedHype - h.spentHype;
    this.state.closed.push({ ...h, closedAt: Date.now(), pnl, why });
    log(`CLOSED    ${h.symbol.padEnd(10)} P&L ${pnl >= 0 ? "+" : ""}${fx(pnl)} HYPE (${why})`);
  }

  // ------------------------------------------------------------- run

  summary() {
    const closed = this.state.closed;
    const pnl = closed.reduce((s, c) => s + c.pnl, 0);
    const wins = closed.filter((c) => c.pnl > 0).length;
    const openVal = this.state.open.reduce((s, h) => s + h.lastValue, 0);
    const openCost = this.state.open.reduce((s, h) => s + h.spentHype - h.receivedHype, 0);
    return { trades: closed.length, wins, pnl, open: this.state.open.length, openVal, openCost };
  }

  async run() {
    process.on("SIGINT", () => { this.stopping = true; log("stopping after this loop (positions stay open; run again to keep managing)"); });
    let lastReport = Date.now();
    while (!this.stopping) {
      const t0 = Date.now();
      try {
        await this.poll();
        await this.manage();
        await this.checkCandidates();
      } catch (e: any) {
        log(`loop error: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 140)}`);
      }
      if (Date.now() - lastReport > 60_000) {
        lastReport = Date.now();
        const s = this.summary();
        log(`--- ${s.trades} closed (${s.wins} won) P&L ${fx(s.pnl)} HYPE | ${s.open} open worth ${fx(s.openVal)} | watching ${this.cands.size} pools` +
          (this.live ? "" : ` | paper balance ${fx(this.state.paperBalance)}`));
      }
      const wait = this.cfg.pollMs - (Date.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    this.save();
  }
}

// ------------------------------------------------------------- helper address per chain

export function helperFile(cfg: Config) {
  return join(cfg.dataDir, "helpers.json");
}

export function loadHelper(cfg: Config, chainId: number): Address | undefined {
  if (process.env.HELPER_ADDRESS) return getAddress(process.env.HELPER_ADDRESS);
  const f = helperFile(cfg);
  if (!existsSync(f)) return undefined;
  const m = JSON.parse(readFileSync(f, "utf8"));
  return m[chainId] ? getAddress(m[chainId]) : undefined;
}

export function saveHelper(cfg: Config, chainId: number, addr: Address) {
  mkdirSync(cfg.dataDir, { recursive: true });
  const f = helperFile(cfg);
  const m = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  m[chainId] = addr;
  writeFileSync(f, JSON.stringify(m, null, 1));
}
