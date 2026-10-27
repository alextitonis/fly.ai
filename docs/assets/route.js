/**
 * The direct route into $FLYAI (2026-10-27, the buy-flow plan step 1: "a direct route next to Relay"): USDG, ETH or NVDA
 * -> NVDA -> $FLYAI, the last hop through Pons' FLYAI/NVDA v4 pool (the one the liquidity bands sit in), all in ONE
 * Universal Router transaction - the same router, pools and command layout the Fly Desk trades with
 * (flytrade/desk/onchain.py router_call / permit_router_call). Relay can't route NVDA at all, so NVDA buys only go here.
 *
 *   USDG  -> NVDA       Uniswap v3, 0.05% (or USDG -> WETH 0.01% -> NVDA 0.05%, whichever quotes more)
 *   ETH   -> NVDA       wrapped by the router, then WETH -> NVDA v3 0.05%
 *   NVDA  -> FLYAI      Pons v4 pool (FLYAI, NVDA, fee 0, spacing 200, Pons hook)
 *
 * Our 0.25% interface fee (as through Relay) is taken from the $FLYAI by the router's PAY_PORTION to the dev wallet,
 * then SWEEP sends the rest to the buyer with the minimum out (slippage) checked on chain. A token paid is approved to
 * Permit2 only (exactly the amount), and Permit2 lets only the Universal Router pull it, for that amount, for 30 minutes.
 * ETH goes as the call's value, exactly the amount. Quotes: Uniswap's v3 QuoterV2 and the v4 Quoter, read by eth_call.
 *
 * window.flyRoute = { quote(sym, amount), txs(user, plan, slipBps), FEE_BPS }; under node, module.exports (the fork
 * test in flytrade/research/test_buyroute.py drives it).
 */
(function (root) {
  "use strict";
  const UR = "0x8876789976DeCbFcBBBe364623C63652Db8C0904";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const V3_QUOTER = "0x33E885ed0EC9bF04ECFB19341582AADcb4C8a9E7";
  const V4_QUOTER = "0x8dC178eFB8111bb0973dd9D722eBEfF267c98F94";
  const FEE_TO = "0x625862521777E19Ad54Ce6C7ABeD9Ca54D6589ea";
  const FEE_BPS = 25n;
  const T = {
    USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    NVDA: "0xd0601ce157dB5bDc3162BBAc2A2c8Af5320d9eEC",
    FLYAI: "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C",
    ETH: "0x0000000000000000000000000000000000000000",
  };
  // Pons' FLYAI/NVDA pool: FLYAI is currency0 (the lower address), so NVDA -> FLYAI is zeroForOne = false
  const KEY = [T.FLYAI, T.NVDA, 0n, 200n, "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044"];
  // the v3 legs into NVDA for each way of paying: [tokens..., fees between them]
  const LEGS = {
    USDG: [{ path: [T.USDG, T.NVDA], fees: [500] }, { path: [T.USDG, T.WETH, T.NVDA], fees: [100, 500] }],
    ETH: [{ path: [T.WETH, T.NVDA], fees: [500] }],
    NVDA: [{ path: [T.NVDA], fees: [] }],
  };
  const ADDRESS_THIS = "0x0000000000000000000000000000000000000002", MSG_SENDER = "0x0000000000000000000000000000000000000001";
  const CONTRACT_BALANCE = 1n << 255n;
  const CMD = { V3_IN: 0x00, PERMIT2_PULL: 0x02, SWEEP: 0x04, PAY_PORTION: 0x06, WRAP_ETH: 0x0b, V4: 0x10 };
  const ACT = { SWAP_IN_SINGLE: 0x06, SETTLE: 0x0b, TAKE: 0x0e };

  // ---- ABI encoding: enough of it for these calls (address, uint/int, bool, bytes, bytes[], tuples) ----
  const hex = (b) => b.replace(/^0x/, "").toLowerCase();
  const word = (v) => {
    if (typeof v === "boolean") v = v ? 1n : 0n;
    if (typeof v === "string") return hex(v).padStart(64, "0");
    return BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
  };
  const isDyn = (t) => t === "bytes" || t === "bytes[]" || (Array.isArray(t) && t.some(isDyn));
  function enc1(t, v) {
    if (t === "bytes") {
      const h = hex(v), n = h.length / 2;
      return word(BigInt(n)) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
    }
    if (t === "bytes[]") return word(BigInt(v.length)) + seq(v.map(() => "bytes"), v);
    if (Array.isArray(t)) return seq(t, v);
    return word(v);
  }
  function seq(types, vals) {
    const heads = [], tails = [];
    // static tuples sit inline; everything dynamic goes to the tail behind an offset
    let size = 0;
    const parts = types.map((t, i) => ({ dyn: isDyn(t), data: enc1(t, vals[i]) }));
    for (const p of parts) size += p.dyn ? 32 : p.data.length / 2;
    let off = size;
    for (const p of parts) {
      if (p.dyn) { heads.push(word(BigInt(off))); tails.push(p.data); off += p.data.length / 2; } else heads.push(p.data);
    }
    return heads.join("") + tails.join("");
  }
  const encode = (types, vals) => "0x" + seq(types, vals);
  const POOL_KEY = ["address", "address", "uint24", "int24", "address"];

  // ---- quotes ----
  let ethCall = null;                                    // (to, data) -> hex result; set by the page or the test
  async function v3Quote(tin, tout, fee, amount) {
    const ret = await ethCall(V3_QUOTER, "0xc6a5026a" + seq([["address", "address", "uint256", "uint24", "uint160"]], [[tin, tout, amount, BigInt(fee), 0n]]));
    return BigInt("0x" + hex(ret).slice(0, 64));
  }
  async function v4Quote(amount) {
    const ret = await ethCall(V4_QUOTER, "0xaa9d21cb" + seq([[POOL_KEY, "bool", "uint128", "bytes"]], [[KEY, false, amount, "0x"]]));
    return BigInt("0x" + hex(ret).slice(0, 64));
  }
  async function legOut(leg, amount) {
    let a = amount;
    for (let i = 0; i < leg.fees.length; i++) {
      if (a === 0n) return 0n;
      a = await v3Quote(leg.path[i], leg.path[i + 1], leg.fees[i], a);
    }
    return a;
  }
  async function through(leg, amount) { const nvda = await legOut(leg, amount); return nvda > 0n ? v4Quote(nvda) : 0n; }

  /** The best direct quote for paying `amount` (base units) of sym: FLYAI out before and after our fee, the price impact
   *  (against a quote 1/1000 the size) and the leg it takes; null when nothing quotes. */
  async function quote(sym, amount) {
    const legs = LEGS[sym];
    if (!legs || !(amount > 0n)) return null;
    const outs = await Promise.all(legs.map((l) => through(l, amount).catch(() => 0n)));
    let best = 0;
    outs.forEach((o, i) => { if (o > outs[best]) best = i; });
    const gross = outs[best];
    if (!(gross > 0n)) return null;
    const small = amount / 1000n > 0n ? amount / 1000n : 1n;
    const ref = await through(legs[best], small).catch(() => 0n);
    // impact: how much less each unit buys at this size than at a tiny size (the pools' own fees included)
    const impact = ref > 0n ? Math.max(0, 1 - (Number(gross) / Number(amount)) / (Number(ref) / Number(small))) * 100 : null;
    return { via: "direct", sym, amount, leg: legs[best], gross, out: gross * (10000n - FEE_BPS) / 10000n, impact };
  }

  /** The router call for a quote: pull or wrap what's paid, the v3 leg, the v4 hop, our fee, the rest to the caller. */
  function execute(plan, minOut, deadline) {
    const cmds = [], inputs = [];
    const push = (c, types, vals) => { cmds.push(c); inputs.push(encode(types, vals)); };
    if (plan.sym === "ETH") push(CMD.WRAP_ETH, ["address", "uint256"], [ADDRESS_THIS, CONTRACT_BALANCE]);
    else push(CMD.PERMIT2_PULL, ["address", "address", "uint160"], [T[plan.sym], ADDRESS_THIS, plan.amount]);
    const leg = plan.leg;
    if (leg.fees.length) {
      let path = hex(leg.path[0]);
      leg.fees.forEach((f, i) => { path += f.toString(16).padStart(6, "0") + hex(leg.path[i + 1]); });
      push(CMD.V3_IN, ["address", "uint256", "uint256", "bytes", "bool"], [ADDRESS_THIS, CONTRACT_BALANCE, 0n, "0x" + path, false]);
    }
    const actions = "0x" + [ACT.SETTLE, ACT.SWAP_IN_SINGLE, ACT.TAKE].map((a) => a.toString(16).padStart(2, "0")).join("");
    const params = [
      encode(["address", "uint256", "bool"], [T.NVDA, CONTRACT_BALANCE, false]),
      encode([[POOL_KEY, "bool", "uint128", "uint128", "uint256", "bytes"]], [[KEY, false, 0n, 0n, 0n, "0x"]]),
      encode(["address", "address", "uint256"], [T.FLYAI, ADDRESS_THIS, 0n]),
    ];
    push(CMD.V4, ["bytes", "bytes[]"], [actions, params]);
    push(CMD.PAY_PORTION, ["address", "address", "uint256"], [T.FLYAI, FEE_TO, FEE_BPS]);
    push(CMD.SWEEP, ["address", "address", "uint256"], [T.FLYAI, MSG_SENDER, minOut]);
    const commands = "0x" + cmds.map((c) => c.toString(16).padStart(2, "0")).join("");
    return "0x3593564c" + seq(["bytes", "bytes[]", "uint256"], [commands, inputs, deadline]);
  }

  /** The transactions for a quote from `user`: Permit2 set up only as far as needed, then the swap. slipBps on the
   *  FLYAI after our fee (default 3%). */
  async function txs(user, plan, slipBps) {
    const slip = BigInt(slipBps == null ? 300 : slipBps);
    const minOut = plan.out * (10000n - slip) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const out = [];
    if (plan.sym !== "ETH") {
      const token = T[plan.sym];
      const toPermit2 = BigInt("0x" + (hex(await ethCall(token, "0xdd62ed3e" + word(user) + word(PERMIT2))) || "0"));
      if (toPermit2 < plan.amount) out.push({ kind: "approve", to: token, data: "0x095ea7b3" + word(PERMIT2) + word(plan.amount), value: "0x0" });
      const p = hex(await ethCall(PERMIT2, "0x927da105" + word(user) + word(token) + word(UR)));
      const allowed = BigInt("0x" + (p.slice(0, 64) || "0")), until = Number(BigInt("0x" + (p.slice(64, 128) || "0")));
      if (allowed < plan.amount || until < Date.now() / 1000 + 300) {
        const exp = BigInt(Math.floor(Date.now() / 1000) + 1800);
        out.push({ kind: "permit2", to: PERMIT2, data: "0x87517c45" + word(token) + word(UR) + word(plan.amount) + word(exp), value: "0x0" });
      }
    }
    out.push({ kind: "swap", to: UR, data: execute(plan, minOut, deadline),
               value: plan.sym === "ETH" ? "0x" + plan.amount.toString(16) : "0x0", minOut });
    return out;
  }

  /** What the page checks before the wallet signs (the same idea as relayCheck): only these contracts, an approve only
   *  of the token paid to Permit2 for the amount, no coin beyond the amount. */
  function check(list, plan) {
    for (const t of list) {
      const to = t.to.toLowerCase(), sel = t.data.slice(0, 10).toLowerCase(), val = BigInt(t.value || 0);
      if (val > (plan.sym === "ETH" ? plan.amount : 0n)) throw new Error("it would send more coin than you pay");
      if (sel === "0x095ea7b3") {
        if (to !== T[plan.sym].toLowerCase() || "0x" + t.data.slice(34, 74) !== PERMIT2.toLowerCase() ||
            BigInt("0x" + t.data.slice(74, 138)) > plan.amount) throw new Error("an unexpected approve");
      } else if (sel === "0x87517c45") {
        if (to !== PERMIT2.toLowerCase() || "0x" + t.data.slice(98, 138) !== UR.toLowerCase()) throw new Error("an unexpected Permit2 approval");
      } else if (!(to === UR.toLowerCase() && sel === "0x3593564c")) {
        throw new Error("a call to " + to + ", not the Universal Router");
      }
    }
    return list;
  }

  /** How much ETH / NVDA `usd` dollars buys right now (base units), from the same v3 pools (/start's $20-$250 buttons);
   *  USDG and USDC are dollars already. null when it can't tell. */
  async function usdTo(sym, usd) {
    const units = BigInt(Math.round(usd * 1e6));
    if (sym === "USDG" || sym === "USDC") return units;
    if (sym === "ETH") return v3Quote(T.USDG, T.WETH, 100, units).catch(() => null);
    if (sym === "NVDA") return v3Quote(T.USDG, T.NVDA, 500, units).catch(() => null);
    return null;
  }

  const api = { quote, txs, check, execute, encode, usdTo, FEE_BPS, tokens: T, PERMIT2, UR,
                setCall: (fn) => { ethCall = fn; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    const RPC = "https://rpc.mainnet.chain.robinhood.com";
    ethCall = async (to, data) => {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return d.result;
    };
    root.flyRoute = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
