/** The sniper loop: watch new pools -> gate with simulated round trips -> buy small -> sell on the exit rules. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, getAddress, parseAbi, parseEther, type Address } from "viem";
import { KNOWN, type Config } from "./config.js";
import { parseLog, TOPICS, V2_FEES, type Found } from "./discover.js";
import { Chain, HELPER_ABI, type Route } from "./helper.js";
import { entryGate, exitRule, PROBE_DIV, type Position } from "./strategy.js";

const SUPPLY_ABI = parseAbi(["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);

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
  checkFails = new Map<string, number>();
  retryAt = new Map<string, number>();
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
        // an empty new wallet: wait for HYPE instead of failing (on a server it would restart over and over)
        const me = this.chain.account.address;
        let waited = false;
        while (toNum(await this.chain.pub.getBalance({ address: me })) < this.cfg.gasReserveHype) {
          if (!waited) log(`waiting for HYPE: send HYPE on Elysium to ${me} (checking every 30 s)`);
          waited = true;
          await new Promise((r) => setTimeout(r, 30_000));
        }
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
    const fresh: Found[] = [];
    for (const l of logs) {
      const found = parseLog({ ...l, blockNumber: BigInt(l.blockNumber) }, this.whype);
      if (!found || this.seen.has(found.id)) continue;
      this.seen.add(found.id);
      if (this.cfg.allowFactories.length && !this.cfg.allowFactories.includes(getAddress(found.factory))) continue;
      fresh.push(found);
    }
    // Elysium launches several pools a second: read block times and symbols in parallel, not one by one
    const times = new Map<bigint, number>();
    const blocks = [...new Set(fresh.map((f) => f.block))];
    for (let i = 0; i < blocks.length; i += 25)
      await Promise.all(blocks.slice(i, i + 25).map(async (b) => {
        const blk = await this.chain.pub.getBlock({ blockNumber: b });
        times.set(b, Number(blk.timestamp) * 1000);
      }));
    // a pool's age counts from its block, so pools found in the start-up lookback are not "new"
    const young = fresh.filter((f) => this.keepOld || Date.now() - (times.get(f.block) ?? 0) <= this.cfg.maxPoolAgeSec * 1000);
    for (let i = 0; i < young.length; i += 25)
      await Promise.all(young.slice(i, i + 25).map(async (found) => {
        const symbol = await this.chain.symbol(found.route.token);
        const bornAt = times.get(found.block) ?? Date.now();
        this.cands.set(found.id, { found, symbol, seenAt: bornAt, checks: 0, lastWhy: "new" });
        log(`new pool  ${symbol.padEnd(10)} v${found.route.kind} ${found.id.slice(0, 20)}… token ${found.route.token}`);
      }));
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

  /** % of the token's supply NOT held by the pool (PoolManager / pair / v3 pool), its hook, or a burn address. */
  async supplyOutside(r: Route): Promise<number> {
    const read = (fn: "totalSupply" | "balanceOf", args: unknown[] = []) =>
      this.chain.pub.readContract({ address: r.token, abi: SUPPLY_ABI, functionName: fn, args } as any) as Promise<bigint>;
    const holders = [r.pool, r.key.hooks, "0x000000000000000000000000000000000000dEaD", "0x0000000000000000000000000000000000000000"]
      .filter((a, i, all) => a && all.indexOf(a) === i) as Address[];
    const [total, ...bals] = await Promise.all([read("totalSupply"), ...holders.map((h) => read("balanceOf", [h]))]);
    if (total === 0n) return 100;
    const inside = bals.reduce((a, b) => a + b, 0n);
    return Number(((total - inside) * 10_000n) / total) / 100;
  }

  async checkCandidates() {
    const buy = parseEther(String(this.cfg.buyHype));
    for (const [id, c] of this.cands) {
      if (Date.now() - c.seenAt > this.cfg.maxPoolAgeSec * 1000) {
        this.cands.delete(id);
        log(`skip      ${c.symbol.padEnd(10)} never passed: ${c.lastWhy}`);
      }
    }
    if (!this.budgetLeft().ok) return;
    // newest first (being first is the point), simulated in parallel batches; buys stay one at a time
    const queue = [...this.cands.values()].sort((a, b) => b.seenAt - a.seenAt);
    for (let i = 0; i < queue.length; i += 10) {
      if (!this.budgetLeft().ok) return;
      const results = await Promise.all(queue.slice(i, i + 10).map(async (c) => {
        c.checks++;
        try {
          await this.fixV2Fee(c, buy);
          const r = c.found.route;
          const [trip, probe] = await Promise.all([this.chain.roundTrip(r, buy), this.chain.roundTrip(r, buy / PROBE_DIV)]);
          const g = entryGate(this.cfg, buy, trip, probe);
          c.lastWhy = g.why;
          if (!g.ok) return null;
          // sniper bait (ORPHEUS 11-09): supply kept outside the pool gets dumped into our buy seconds later
          const outside = await this.supplyOutside(r);
          if (outside > this.cfg.maxOutsidePct) {
            c.lastWhy = `${outside.toFixed(0)}% of supply outside the pool`;
            return null;
          }
          return { c, trip, g };
        } catch (e: any) {
          c.lastWhy = String(e?.shortMessage ?? e?.message ?? e).slice(0, 80);
          return null;
        }
      }));
      for (const x of results) {
        if (!x || !this.budgetLeft().ok) continue;
        this.cands.delete(x.c.found.id);
        try {
          await this.enter(x.c, buy, x.trip.got, x.g.taxRatio ?? 1, x.g.why);
        } catch (e: any) {
          log(`BUY FAIL  ${x.c.symbol}: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 100)}`);
        }
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
      // a bag that keeps refusing to sell (hook blocks it) is retried every 5 min, not every loop
      if ((this.retryAt.get(h.id) ?? 0) > now) continue;
      try {
        const tokens = BigInt(h.tokens);
        if (tokens === 0n) { this.close(h, "empty"); continue; }
        // live: our buy is on chain, a plain quote is right. paper: put our net HYPE in first (see quoteAfterBuy)
        const net = h.spentHype - h.receivedHype;
        const q = this.live || net <= 0
          ? await this.chain.quoteSell(h.route, tokens, this.helper)
          : await this.chain.quoteAfterBuy(h.route, tokens, parseEther(net.toFixed(18)));
        let ok = q !== null;
        // every RECHECK_SEC: a fresh small round trip catches a sell switched off after we bought
        if (ok && now - (this.lastRecheck.get(h.id) ?? 0) > this.cfg.recheckSec * 1000) {
          this.lastRecheck.set(h.id, now);
          const t = await this.chain.roundTrip(h.route, parseEther(String(Math.min(this.cfg.buyHype, 0.01))));
          if (!t.ok) ok = false;
        }
        // one failed check can be a busy RPC: only 3 in a row count as "can no longer sell"
        const fails = ok ? 0 : (this.checkFails.get(h.id) ?? 0) + 1;
        this.checkFails.set(h.id, fails);
        if (!ok && fails < 3) continue;
        const sellable = ok;
        const value = q === null ? h.lastValue : toNum(q) * h.taxRatio;
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
        if (h.sellFails >= 5) this.retryAt.set(h.id, Date.now() + 5 * 60_000);
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
    const stop = () => { this.stopping = true; log("stopping after this loop (positions stay open; run again to keep managing)"); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
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
