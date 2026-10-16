/**
 * Fly Maker (docs/maker.html; plan: flytrade/MAKER-PLAN.md, 2026-10-16). Market making for token teams on Robinhood
 * Chain: a vault owned by the visitor's wallet on ONE GIGA DEX pool, run by fly.ai's bot inside on-chain guardrails.
 *
 * Three views, by URL:
 *   maker.html                  pick a token (FLYAI prefilled), your vaults
 *   maker.html?token=0x..       market snapshot, the token's GIGA pools, the plan builder, the plan card, fund & deploy
 *   maker.html?vault=0x..       a vault's dashboard (public); its owner also gets pause / withdraw / top up / new plan
 *
 * The plan is canonical JSON, byte for byte what flytrade/maker/twap.py / band.py produce (sorted keys, no spaces,
 * Python float repr), and the vault itself stores keccak256 of the text it was given and emits the text (PlanSet).
 * The page recomputes that hash here, in the browser, before anyone signs and whenever a vault is shown.
 *
 * A token with NO GIGA pool yet (2026-10-16, the user: "setting up for other tokens should be setting up the initial
 * pool if it doesn't exist ... in gigadex"): the token view offers to create and initialize the GIGA CL pool at a
 * starting price the issuer types, through GIGA's position manager (createAndInitializePoolIfNecessary, anyone may
 * call it). The range bot then seeds the empty pool single-sided from the vault (flytrade/maker/band.py).
 *
 * Every transaction is checked before the wallet is asked (checkTx): Robinhood Chain, no coin sent except an ETH
 * deposit into the vault's own WETH quote, `to` is the factory / this vault / one of its two tokens / GIGA's position
 * manager (pool creation only, for exactly this token and quote), and the call is one this page builds (create,
 * approve exactly the deposit to this vault, deposit, setPlan, pause, withdraw, create the pool).
 *
 * Reads: the public Robinhood RPC (JSON-RPC batches), only while the page is visible, refreshed every 2 minutes at
 * most (flytrade RPC cost rules). The pure functions at the top are exported for node tests (module.exports).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure core (no DOM, no network) ----------------
  const CHAIN = 4663;
  const CHAIN_HEX = "0x1237";
  const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
  const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
  const GIGA_CL_FACTORY = "0xEce6eCd61177336ea6Fb9b17937AC439D85EE20B";
  const GIGA_POSITIONS = "0xA79F5775b0B49E51202c48DDF03F380FaA96f641";
  const FEE_TIERS = [50, 100, 200, 500, 1000, 2000, 3000, 10000, 20000];   // GIGA CL factory (GIGADEX-NOTES.md)
  const QUOTES = [USDG, WETH];
  // Set at deploy (contracts/script/DeployFlyMaker.s.sol). Empty = not live: the page reads and plans, never creates.
  const FACTORY = "";
  const FACTORY_BLOCK = 0;
  const LOG_SPAN = 10000000;                              // the public RPC's eth_getLogs limit (checked 2026-10-16)
  const MAX_PLAN_BYTES = 4096;

  const SEL = {
    create: "0x11ad204e", vaultsOf: "0x6cc811f8", positionsOf: "0xf867d46b", quotes: "0x5311312f", feeBps: "0x24a9d853",
    stopped: "0x75f12b21", isVault: "0x652b9b41", owner: "0x8da5cb5b", pool: "0x16f0115b", quote: "0x999b93af",
    token0: "0x0dfe1681", token1: "0xd21220a7", planHash: "0x14afb633", paused: "0x5c975abb", guardrails: "0xcb371bc8",
    tradeAllowance: "0xa74eb49b", lpAllowance: "0xc4f03a65", positionIds: "0xe8850eeb", ticks: "0x2cfffaf6",
    vaultPositions: "0xba5b7982", factory: "0xc45a0155", deposit: "0x47e7ef24", setPlan: "0x4a07fb45",
    setPlanAndGuardrails: "0xa8cf6caa", setGuardrails: "0x02db02f7", setPaused: "0x16c38b3c", withdrawAll: "0x1c1c6fe5",
    withdraw: "0xf3fef3a3", getPool: "0x1698ee82", slot0: "0x3850c7bd", liquidity: "0x1a686502", fee: "0xddca3f43",
    tickSpacing: "0xd0c93a7c", balanceOf: "0x70a08231", decimals: "0x313ce567", symbol: "0x95d89b41",
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", pmPositions: "0x99fbab88",
    createPool: "0x13ead562",
    feeBpsFor: "0x2fc1c400", holderTiers: "0xc010d798", flyai: "0xc7676967",                             // createAndInitializePoolIfNecessary(address,address,uint24,uint160)
  };
  const MIN_SQRT = 4295128739n;
  const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;
  const TOPIC = {
    VaultCreated: "0x65f3b3eb308975062edaa844d30896caad06d8482fdb020b3e1557f17f5a76c7",
    PlanSet: "0x6ed970fec8d617fc33f5014c504f5593bbc6ac861f7704ca26b7d46315481a76",
    Swapped: "0x7165bbefb4ff884e638b08a41f1efbd52bfd892abe08472f7753e0f7c5a59976",
    Minted: "0xfdfa5cac91a3ae11e8eb81b16b48f43c7a69cc98f14089690b27718863103733",
    Decreased: "0x4dd2fa6db7c9371d3b113f088dc07aef99fb77cfee830e8601c1ac4946e05dbb",
    Collected: "0x6059b72f21911d96e92ebeb103aa1162802c8b875d60921f9db35ec8967fc7f6",
    Deposited: "0x73a19dd210f1a7f902193214c0ee91dd35ee5b4d920cba8d519eca65a7b488ca",
    Withdrawn: "0xd1c19fbcd4551a5edfb66d43d2e337c04837afda3482b42bdf569a8fccdae5fb",
    PausedSet: "0x40db37ff5c0bdc2c427fbb2078c8f24afea940abac0e3c23bb4ea3bf2da2b212",
    GuardrailsSet: "0x26ec7270a5e7c457b4bebf882399b106002466397c2a5dbf0b2d76dd30d3797f",
    Burned: "0xd83c63197e8e676d80ab0122beba9a9d20f3828839e9a1d6fe81d242e9cd7e6e",
    Released: "0xe56224d0fa2b47f4e7ee07630bc1e1ae0ef4625c590d9da289bf4f67b7df0d48",
  };
  const MAX_U256 = (1n << 256n) - 1n;

  /** "{name}" placeholders filled from vars. */
  const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  // the core's user-facing messages: English here (node tests), translated by the page (it points tr at its L)
  let tr = (key, en, vars) => fill(en, vars);

  // ---- keccak256 (Keccak-f[1600], 64-bit lanes as BigInt; inputs here are a few KB at most) ----
  const RC = [0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n,
    0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n,
    0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
  const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  const M64 = (1n << 64n) - 1n;
  const rotl = (v, n) => (n ? ((v << BigInt(n)) | (v >> BigInt(64 - n))) & M64 : v);
  function keccakF(s) {
    const c = new Array(5), b = new Array(25);
    for (let r = 0; r < 24; r++) {
      for (let x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
      for (let x = 0; x < 5; x++) {
        const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
        for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
      for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & M64 & b[((x + 2) % 5) + y]);
      s[0] ^= RC[r];
    }
  }
  /** keccak256 of bytes -> "0x" + 64 hex. */
  function keccak256(bytes) {
    const rate = 136, s = new Array(25).fill(0n);
    const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
    padded.set(bytes);
    padded[bytes.length] ^= 0x01;
    padded[padded.length - 1] ^= 0x80;
    for (let off = 0; off < padded.length; off += rate) {
      for (let i = 0; i < rate / 8; i++) {
        let lane = 0n;
        for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k]);
        s[i] ^= lane;
      }
      keccakF(s);
    }
    let out = "0x";
    for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) out += Number((s[i] >> BigInt(8 * k)) & 0xffn).toString(16).padStart(2, "0");
    return out;
  }
  const utf8 = (str) => new TextEncoder().encode(str);
  const keccakText = (str) => keccak256(utf8(str));

  // ---- plans: the canonical text (exactly flytrade/maker twap.canonical) ----
  /** Python's repr(float): shortest round-trip digits, "1.0" for whole numbers, scientific below 1e-4 / from 1e16. */
  function pyFloat(x) {
    if (!Number.isFinite(x)) throw new Error("not a finite number");
    if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
    const [mant, expS] = x.toExponential().split("e");
    const e = Number(expS);
    if (e < -4 || e >= 16) return mant + "e" + (e < 0 ? "-" : "+") + String(Math.abs(e)).padStart(2, "0");
    const s = String(x);                                  // fixed notation in this range
    return /[.e]/.test(s) ? s : s + ".0";
  }
  const TWAP_FIELDS = { duration_s: "int", every_s: "int", jitter: "float", limit_price: "float?", min_slice: "int",
    side: "str", start: "int", strategy: "str", total: "int?", version: "int" };
  const RANGE_FIELDS = { collect_every_s: "int", deployed: "float", inventory_target: "float", min_recenter_s: "int",
    min_swap: "int", recenter_at: "float", strategy: "str", tolerance: "float", version: "int", width_bps: "int" };
  const fieldsOf = (plan) => (plan.strategy === "range" ? RANGE_FIELDS : TWAP_FIELDS);

  function canonical(plan) {
    const f = fieldsOf(plan);
    const parts = Object.keys(f).sort().map((k) => {
      const t = f[k], v = plan[k];
      let out;
      if (v == null) {
        if (!t.endsWith("?")) throw new Error(k + " is required");
        out = "null";
      } else if (t.startsWith("int")) {
        out = BigInt(v).toString();
      } else if (t.startsWith("float")) {
        out = pyFloat(Number(v));
      } else {
        out = JSON.stringify(String(v));
      }
      return JSON.stringify(k) + ":" + out;
    });
    return "{" + parts.join(",") + "}";
  }
  const planHashOf = (plan) => keccakText(canonical(plan));

  /** The plan's own rules (twap.Plan / band.Plan __post_init__). [] = valid. */
  function planErrors(plan) {
    const e = [], p = {};
    for (const [k, t] of Object.entries(fieldsOf(plan))) {   // ints may come as strings or BigInt; compare as numbers
      const v = plan[k];
      p[k] = v == null ? null : t.startsWith("int") || t.startsWith("float") ? Number(v) : v;
    }
    p.strategy = plan.strategy;
    if (p.strategy === "range") {
      if (!(p.width_bps >= 100 && p.width_bps <= 5000)) e.push(tr("err.width", "width must be 1% to 50%"));
      if (!(p.recenter_at >= 0.5 && p.recenter_at <= 1)) e.push(tr("err.recenter", "re-center point must be 50% to 100%"));
      if (!(p.min_recenter_s >= 300)) e.push(tr("err.minRecenter", "re-centers at least 5 minutes apart"));
      if (!(p.inventory_target >= 0.2 && p.inventory_target <= 0.8)) e.push(tr("err.inventory", "inventory target must be 20% to 80% token"));
      if (!(p.deployed >= 0.1 && p.deployed <= 1)) e.push(tr("err.deployed", "deployed must be 10% to 100%"));
      if (!(p.min_swap > 0) || !(p.collect_every_s >= 600) || !(p.tolerance >= 0.02 && p.tolerance <= 0.3)) e.push(tr("err.rangeOther", "bad min swap, collect interval or tolerance"));
      return e;
    }
    if (p.strategy !== "twap") return [tr("err.strategy", "unknown strategy")];
    if (p.side !== "buy" && p.side !== "sell") e.push(tr("err.side", "side must be buy or sell"));
    if (p.side === "buy" && p.total == null) e.push(tr("err.buyTotal", "a buy needs a total"));
    if (p.total != null && !(p.total > 0)) e.push(tr("err.total", "total must be positive"));
    if (!(p.duration_s >= 600 && p.duration_s <= 90 * 86400)) e.push(tr("err.duration", "duration must be 10 minutes to 90 days"));
    if (!(p.every_s >= 60 && p.every_s <= p.duration_s)) e.push(tr("err.every", "slices every 60 s at least, and within the duration"));
    if (!(p.jitter >= 0 && p.jitter < 0.5)) e.push(tr("err.jitter", "jitter must be in [0, 0.5)"));
    if (!(p.min_slice > 0)) e.push(tr("err.minSlice", "min slice must be positive"));
    return e;
  }

  /** Plan text from a vault's PlanSet -> { plan, canonical: bool }. Big integers survive (quoted before JSON.parse). */
  function parsePlan(text) {
    const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
    const raw = JSON.parse(safe);
    const f = fieldsOf(raw), plan = {};
    for (const k of Object.keys(raw)) {
      const t = f[k];
      if (!t) return { plan: raw, canonical: false };
      const v = raw[k];
      plan[k] = v == null ? null : t.startsWith("int") ? BigInt(v) : t.startsWith("float") ? Number(v) : v;
    }
    let same = false;
    try { same = canonical(plan) === text; } catch (e) { same = false; }
    return { plan, canonical: same };
  }

  /** twap.fit_problems: can the guardrails carry this plan on schedule? (price: raw quote per raw base, for a sell) */
  function fitProblems(p, maxTradeQ, dailyCapQ, price) {
    if (p.strategy !== "twap" || p.total == null || (p.side === "sell" && !price)) return [];
    const total = BigInt(p.total);
    const needQ = p.side === "buy" ? total : BigInt(Math.floor(Number(total) * price));
    const cap = BigInt(dailyCapQ);
    const canQ = cap / 4n + (cap * 3n * BigInt(p.duration_s)) / (4n * 86400n);
    const out = [];
    if (needQ > canQ) out.push(tr("err.fitDaily", "the daily cap lets the vault trade about {can} quote units over the period, the plan needs {need}", { can: canQ, need: needQ }));
    const slices = BigInt(Math.max(1, Math.floor(p.duration_s / p.every_s)));
    if (needQ / slices > BigInt(maxTradeQ)) out.push(tr("err.fitSlice", "each slice needs about {per} quote units, more than the max trade {max}", { per: needQ / slices, max: maxTradeQ }));
    return out;
  }

  // ---- ABI ----
  const isAddr = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
  const same = (a, b) => isAddr(a) && isAddr(b) && a.toLowerCase() === b.toLowerCase();
  function addrWord(a) {
    if (!isAddr(a)) throw new Error("bad address " + a);
    return a.slice(2).toLowerCase().padStart(64, "0");
  }
  function uintWord(n) {
    n = BigInt(n);
    if (n < 0n || n > MAX_U256) throw new Error("bad uint " + n);
    return n.toString(16).padStart(64, "0");
  }
  const boolWord = (b) => uintWord(b ? 1 : 0);
  function strTail(text) {                               // length word + the bytes, right-padded to 32
    const b = utf8(text);
    let hex = "";
    for (const x of b) hex += x.toString(16).padStart(2, "0");
    return uintWord(b.length) + hex.padEnd(Math.ceil(b.length / 32) * 64, "0");
  }
  const G_KEYS = ["maxTrade", "dailyCap", "maxImpactBps", "maxDevBps", "twapWindow", "maxPositions", "lpPerDay"];
  const G_BITS = [128, 128, 16, 16, 32, 8, 8];
  function gWords(g) {
    return G_KEYS.map((k, i) => {
      const v = BigInt(g[k]);
      if (v < 0n || v >= 1n << BigInt(G_BITS[i])) throw new Error(k + " out of range");
      return uintWord(v);
    }).join("");
  }
  /** FlyMakerFactory.checkGuardrails. [] = valid. */
  function guardrailErrors(g) {
    const e = [], n = (k) => BigInt(g[k]);
    if (n("maxTrade") <= 0n) e.push(tr("err.maxTrade", "max trade must be positive"));
    if (n("dailyCap") < n("maxTrade") * 4n) e.push(tr("err.dailyCap", "the daily cap must be at least 4x the max trade"));
    if (n("maxImpactBps") <= 0n || n("maxImpactBps") > 1000n) e.push(tr("err.impact", "max price impact must be 0.01% to 10%"));
    if (n("maxDevBps") <= 0n || n("maxDevBps") > 2000n) e.push(tr("err.dev", "price check must be 0.01% to 20%"));
    if (n("twapWindow") < 60n || n("twapWindow") > 86400n) e.push(tr("err.window", "reference window must be 1 minute to 1 day"));
    if (n("maxPositions") <= 0n || n("maxPositions") > 20n) e.push(tr("err.positions", "max positions must be 1 to 20"));
    if (n("lpPerDay") < 4n || n("lpPerDay") > 255n) e.push(tr("err.lpPerDay", "liquidity actions per day must be 4 to 255"));
    return e;
  }
  function isqrt(n) {
    if (n < 0n) throw new Error("negative");
    if (n < 2n) return n;
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));     // a close start, then Newton to the exact floor
    if (x === 0n) x = 1n;
    for (;;) {
      const y = (x + n / x) >> 1n;
      if (y >= x && x * x <= n && (x + 1n) * (x + 1n) > n) return x;
      x = y;
    }
  }
  /** A pool's starting sqrtPriceX96 from a human price ("0.0001" quote per token), exact in integers. */
  function sqrtPriceX96(price, decToken, decQuote, tokenIs0) {
    const num = units(price, 18), den = 10n ** 18n;
    if (num == null || num <= 0n) throw new Error(tr("err.startPrice", "the starting price must be a positive number"));
    const [n, d] = tokenIs0 ? [num * 10n ** BigInt(decQuote), den * 10n ** BigInt(decToken)]
      : [den * 10n ** BigInt(decToken), num * 10n ** BigInt(decQuote)];
    const s = isqrt((n << 192n) / d);
    if (s < MIN_SQRT || s >= MAX_SQRT) throw new Error(tr("err.startRange", "starting price out of the pool's range"));
    return s;
  }
  const sortTokens = (a, b) => (BigInt(a) < BigInt(b) ? [a, b] : [b, a]);

  const enc = {
    createPool: (a, b, fee, sqrtP) => { const [t0, t1] = sortTokens(a, b); return SEL.createPool + addrWord(t0) + addrWord(t1) + uintWord(fee) + uintWord(sqrtP); },
    create: (pool, quote, text, g) => SEL.create + addrWord(pool) + addrWord(quote) + uintWord(10 * 32) + gWords(g) + strTail(text),
    setPlan: (text) => SEL.setPlan + uintWord(32) + strTail(text),
    setPlanAndGuardrails: (text, g) => SEL.setPlanAndGuardrails + uintWord(8 * 32) + gWords(g) + strTail(text),
    setGuardrails: (g) => SEL.setGuardrails + gWords(g),
    setPaused: (b) => SEL.setPaused + boolWord(b),
    withdrawAll: (unwind) => SEL.withdrawAll + boolWord(unwind),
    withdraw: (token, amt) => SEL.withdraw + addrWord(token) + uintWord(amt),
    deposit: (token, amt) => SEL.deposit + addrWord(token) + uintWord(amt),
    approve: (spender, amt) => SEL.approve + addrWord(spender) + uintWord(amt),
    balanceOf: (who) => SEL.balanceOf + addrWord(who),
    allowance: (o, s) => SEL.allowance + addrWord(o) + addrWord(s),
    getPool: (a, b, fee) => SEL.getPool + addrWord(a) + addrWord(b) + uintWord(fee),
    vaultsOf: (who) => SEL.vaultsOf + addrWord(who),
    pmPositions: (id) => SEL.pmPositions + uintWord(id),
    feeBpsFor: (who) => SEL.feeBpsFor + addrWord(who),
  };
  /** holderTiers() return -> [{ minHold, feeBps }] (an array of static (uint128,uint16) tuples). */
  function decodeTiers(hex) {
    const w = words(hex);
    if (w.length < 2) return [];
    const n = Number(w[Number(w[0]) / 32]), at = Number(w[0]) / 32 + 1, out = [];
    for (let i = 0; i < n; i++) out.push({ minHold: w[at + 2 * i], feeBps: Number(w[at + 2 * i + 1]) });
    return out;
  }
  function words(hex) {
    const h = (hex || "0x").slice(2), out = [];
    for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
    return out;
  }
  const signed = (w, bits) => (w >= 1n << BigInt(bits - 1) && w < 1n << BigInt(bits) ? w - (1n << BigInt(bits)) : w >= 1n << 255n ? w - (1n << 256n) : w);
  const wordAddr = (w) => "0x" + w.toString(16).padStart(40, "0");
  function decodeString(hex, offsetWord) {               // a dynamic string at a head offset (event data / return)
    const h = hex.slice(2), off = Number(offsetWord) * 2;
    const len = Number(BigInt("0x" + h.slice(off, off + 64)));
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = parseInt(h.slice(off + 64 + i * 2, off + 66 + i * 2), 16);
    return new TextDecoder().decode(bytes);
  }
  function decodeAddrArray(hex) {                        // address[] / uint256[] return
    const w = words(hex);
    if (!w.length) return [];
    const n = Number(w[Number(w[0]) / 32]), start = Number(w[0]) / 32 + 1;
    return w.slice(start, start + n);
  }

  /** Throws unless tx is one of the calls this page builds, to the expected contract. */
  function checkTx(tx, ctx) {
    if (ctx.chainId != null && Number(ctx.chainId) !== CHAIN) throw new Error(tr("err.chain", "not Robinhood Chain"));
    const sel = (tx.data || "").slice(0, 10).toLowerCase();
    const value = BigInt(tx.value || 0);
    const to = tx.to;
    if (sel === SEL.createPool) {
      if (!same(to, GIGA_POSITIONS)) throw new Error(tr("err.txPoolTo", "pool creation only goes to GIGA's position manager"));
      const w = words("0x" + tx.data.slice(10));
      const pair = [wordAddr(w[0]), wordAddr(w[1])];
      if (!pair.some((a) => same(a, ctx.token)) || !pair.some((a) => same(a, ctx.quote))) throw new Error(tr("err.txPoolTokens", "a pool for other tokens"));
      if (!FEE_TIERS.includes(Number(w[2]))) throw new Error(tr("err.txFeeTier", "not a GIGA fee tier"));
    } else if (sel === SEL.create) {
      if (!ctx.factory || !same(to, ctx.factory)) throw new Error(tr("err.txCreate", "create is only sent to the Fly Maker factory"));
    } else if (sel === SEL.approve) {
      const w = words("0x" + tx.data.slice(10));
      if (!(same(to, ctx.quote) || same(to, ctx.token))) throw new Error(tr("err.txApproveToken", "approve on a token that isn't this vault's"));
      if (!same(wordAddr(w[0]), ctx.vault)) throw new Error(tr("err.txApproveTo", "approve to something other than your vault"));
      if (ctx.amount != null && w[1] !== BigInt(ctx.amount)) throw new Error(tr("err.txApproveAmount", "approve for a different amount than the deposit"));
      if (w[1] === MAX_U256) throw new Error(tr("err.txUnlimited", "unlimited approvals are never asked for"));
    } else if ([SEL.deposit, SEL.setPlan, SEL.setPlanAndGuardrails, SEL.setGuardrails, SEL.setPaused, SEL.withdrawAll, SEL.withdraw].includes(sel)) {
      if (!same(to, ctx.vault)) throw new Error(tr("err.txVaultTo", "a vault call to something other than your vault"));
      if (sel === SEL.deposit) {
        const w = words("0x" + tx.data.slice(10));
        const tok = wordAddr(w[0]);
        const ok = same(tok, ctx.quote) || same(tok, ctx.token) || (/^0x0{40}$/.test(tok) && same(ctx.quote, WETH));
        if (!ok) throw new Error(tr("err.txDepositToken", "deposit of a token this vault doesn't hold"));
        if (value !== 0n && !/^0x0{40}$/.test(tok)) throw new Error(tr("err.txCoin", "coin sent with a token deposit"));
        if (/^0x0{40}$/.test(tok) && ctx.amount != null && value !== BigInt(ctx.amount)) throw new Error(tr("err.txEthAmount", "ETH deposit amount mismatch"));
        return;
      }
    } else {
      throw new Error(tr("err.txUnknown", "a call this page doesn't make"));
    }
    if (value !== 0n) throw new Error(tr("err.txValue", "a call sends coin"));
  }

  // ---- numbers ----
  function units(amount, decimals) {                     // "12.5" -> 12500000n (exact); null if not a plain decimal
    const s = String(amount == null ? "" : amount).trim().replace(/,/g, "");
    const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[1] === "" && !m[2])) return null;
    const f = m[2] || "";
    if (f.length > decimals && /[1-9]/.test(f.slice(decimals))) return null;
    return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  }
  function decimalOf(raw, decimals, maxFrac) {
    raw = BigInt(raw);
    const neg = raw < 0n, v = neg ? -raw : raw, one = 10n ** BigInt(decimals);
    const frac = (v % one).toString().padStart(decimals, "0").slice(0, maxFrac == null ? decimals : maxFrac).replace(/0+$/, "");
    return (neg ? "-" : "") + (v / one).toString() + (frac ? "." + frac : "");
  }
  /** Raw token1 per raw token0 from sqrtPriceX96. */
  const rawPrice1per0 = (sqrtP) => { const s = Number(sqrtP) / 2 ** 96; return s * s; };
  /** Human quote per token. */
  function humanPrice(sqrtP, quoteIs1, decToken, decQuote) {
    const p = rawPrice1per0(sqrtP);
    const raw = quoteIs1 ? p : (p ? 1 / p : 0);
    return raw * 10 ** (decToken - decQuote);
  }
  /** A position's token0/token1 now (floats, raw units) from its liquidity and ticks (v3 math). */
  function positionAmounts(liq, lower, upper, sqrtP) {
    const L = Number(liq), s = Number(sqrtP) / 2 ** 96;
    const sa = Math.pow(1.0001, lower / 2), sb = Math.pow(1.0001, upper / 2);
    if (s <= sa) return { a0: L * (1 / sa - 1 / sb), a1: 0, inRange: false };
    if (s >= sb) return { a0: 0, a1: L * (sb - sa), inRange: false };
    return { a0: L * (1 / s - 1 / sb), a1: L * (s - sa), inRange: true };
  }
  /** How far one swap of `amountRaw` of the quote moves the price, within the active liquidity (fraction). */
  function impactOf(amountRaw, quoteIs1, liq, sqrtP) {
    const L = Number(liq), s = Number(sqrtP) / 2 ** 96, a = Number(amountRaw);
    if (!L || !s) return Infinity;
    if (quoteIs1) { const s2 = s + a / L; return (s2 / s) ** 2 - 1; }   // quote in: price of token0 rises
    const inv2 = 1 / s + a / L;                                          // token0 is the quote: 1/sqrt grows
    return (s / (1 / inv2)) ** 2 - 1;
  }

  const CORE = { decodeTiers, setTr: (fn) => { tr = fn; }, fill, isqrt, sqrtPriceX96, sortTokens, FEE_TIERS, keccak256, keccakText, pyFloat, canonical, planHashOf, planErrors, parsePlan, fitProblems, guardrailErrors,
    enc, words, signed, decodeString, decodeAddrArray, checkTx, units, decimalOf, humanPrice, positionAmounts, impactOf, SEL, TOPIC };
  if (typeof module !== "undefined" && module.exports) { module.exports = CORE; return; }

  // ---------------------------------------------------------------- the page ------------------------------------------
  const params = new URLSearchParams(location.search);
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // localhost only: a fork RPC and a fork factory, for testing against anvil; never on the live site
  const RPC = (LOCAL && params.get("rpc")) || "https://rpc.mainnet.chain.robinhood.com";
  const FACTORY_ADDR = (LOCAL && isAddr(params.get("factory")) && params.get("factory")) || FACTORY;
  const FACTORY_FROM = LOCAL && params.get("factory") ? Number(params.get("from") || 0) : FACTORY_BLOCK;
  const EXPLORER = "https://robinhoodchain.blockscout.com";
  const REFRESH_MS = 2 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const link = (a, label) => `<a class="mono" href="${EXPLORER}/address/${esc(a)}" target="_blank" rel="noopener">${esc(label || short(a))}</a>`;
  const txLink = (h) => `<a class="mono" href="${EXPLORER}/tx/${esc(h)}" target="_blank" rel="noopener">${esc(h.slice(0, 10))}…</a>`;
  const fmt = (x, d) => (x == null || !Number.isFinite(x) ? "–" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : x.toLocaleString("en-US", { maximumSignificantDigits: d || 4 }));
  const pct = (x, d) => (x == null || !Number.isFinite(x) ? "–" : (x * 100).toFixed(d == null ? 2 : d) + "%");
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

  // ---- words: maker.<key> from assets/i18n/<lang>/maker.json (page.js loads it); the English here is the fallback.
  // en/maker.json's ui / err sections are generated from these calls, so the two never drift.
  /** Text for textContent / table cells (vars as given). */
  function L(key, en, vars) {
    const t = window.flyI18n && window.flyI18n.t;
    if (t) {
      const full = "maker." + key, r = t(full, vars);
      if (r !== full) return r;
    }
    return fill(en, vars);
  }
  /** Text for innerHTML: the translation may carry <b>; every var (token symbols come from the chain) is escaped. */
  const h = (key, en, vars) => L(key, en, vars && Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)])));
  CORE.setTr(L);
  /** page.js (a module) loads the strings after this script: wait for it, at most 3 s. */
  const i18nReady = () => (window.flyI18n ? Promise.resolve() : new Promise((ok) => {
    window.addEventListener("i18n:ready", ok, { once: true });
    setTimeout(ok, 3000);
  }));

  let wallet = null;

  // ---- reads ----
  async function rpc(method, p) {
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: p }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.result;
  }
  /** [[to, data]] -> [hex | null] in one HTTP request (null = reverted). */
  async function calls(list) {
    if (!list.length) return [];
    const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list.map(([to, data], i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to, data }, "latest"] }))) });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error((d && d.error && d.error.message) || L("ui.err.read", "read failed"));
    const out = new Array(list.length).fill(null);
    for (const x of d) out[x.id] = x.result && x.result !== "0x" ? x.result : null;
    return out;
  }
  const w0 = (hex) => (hex ? words(hex)[0] : null);
  async function getLogs(address, topics, from) {
    const latest = Number(BigInt(await rpc("eth_blockNumber", [])));
    const out = [];
    for (let start = Math.max(0, from), n = 0; start <= latest && n < 12; start += LOG_SPAN, n++) {
      const end = Math.min(latest, start + LOG_SPAN - 1);
      out.push(...(await rpc("eth_getLogs", [{ address, topics, fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16) }])));
    }
    return out;
  }

  const tokenCache = {};
  async function tokenInfo(addr) {
    const k = addr.toLowerCase();
    if (tokenCache[k]) return tokenCache[k];
    const [sym, dec] = await calls([[addr, SEL.symbol], [addr, SEL.decimals]]);
    let symbol = short(addr);
    if (sym) { try { symbol = decodeString(sym, words(sym)[0]); } catch (e) { /* bytes32 symbols stay short */ } }
    if (dec == null) throw new Error(L("ui.err.notToken", "not an ERC-20 token: {addr}", { addr }));
    return (tokenCache[k] = { address: addr, symbol, decimals: Number(w0(dec)) });
  }

  /** ETH in USD from GIGA's WETH/USDG 0.005% pool (to show WETH-quoted pools in dollars). */
  async function ethUsd() {
    const [p] = await calls([[GIGA_CL_FACTORY, enc.getPool(WETH, USDG, 50)]]);
    const pool = p && wordAddr(w0(p));
    if (!pool || /^0x0{40}$/.test(pool)) return null;
    const [s, t0] = await calls([[pool, SEL.slot0], [pool, SEL.token0]]);
    const quoteIs1 = !same(wordAddr(w0(t0)), USDG);
    return humanPrice(w0(s), quoteIs1, 18, 6);
  }

  /** Every GIGA CL pool of `token` against USDG or WETH, with price, liquidity and depth. */
  async function findPools(token) {
    const pairs = [];
    for (const q of QUOTES) if (!same(q, token)) for (const f of FEE_TIERS) pairs.push([q, f]);
    const res = await calls(pairs.map(([q, f]) => [GIGA_CL_FACTORY, enc.getPool(token, q, f)]));
    const found = [];
    res.forEach((r, i) => { const a = r && wordAddr(w0(r)); if (a && !/^0x0{40}$/.test(a)) found.push({ address: a, quote: pairs[i][0], fee: pairs[i][1] }); });
    if (!found.length) return [];
    const eth = found.some((p) => same(p.quote, WETH)) ? await ethUsd() : null;
    const t = await tokenInfo(token);
    const reads = await calls(found.flatMap((p) => [[p.address, SEL.slot0], [p.address, SEL.liquidity], [p.address, SEL.token0],
      [p.address, SEL.tickSpacing], [token, enc.balanceOf(p.address)], [p.quote, enc.balanceOf(p.address)]]));
    return Promise.all(found.map(async (p, i) => {
      const r = reads.slice(i * 6, i * 6 + 6);
      const q = await tokenInfo(p.quote);
      const quoteIs1 = same(wordAddr(w0(r[2])), token);
      const sqrtP = w0(r[0]);
      const price = humanPrice(sqrtP, quoteIs1, t.decimals, q.decimals);
      const usdPerQuote = same(p.quote, USDG) ? 1 : eth;
      const tokenBal = Number(w0(r[4])) / 10 ** t.decimals, quoteBal = Number(w0(r[5])) / 10 ** q.decimals;
      const tvlUsd = usdPerQuote == null ? null : (quoteBal + tokenBal * price) * usdPerQuote;
      return { ...p, quoteInfo: q, token: t, quoteIs1, sqrtP, tick: Number(signed(words(r[0])[1], 24)), liquidity: w0(r[1]),
        spacing: Number(signed(w0(r[3]), 24)), price, priceUsd: usdPerQuote == null ? null : price * usdPerQuote, tvlUsd, usdPerQuote };
    }));
  }

  // ---- wallet ----
  async function ensureChain(eth) {
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() === CHAIN_HEX) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if (e && e.code !== 4902) throw e;
      await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "Robinhood Chain",
        rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: [EXPLORER], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
    }
    if ((await eth.request({ method: "eth_chainId" })).toLowerCase() !== CHAIN_HEX) throw new Error(L("err.chain", "not Robinhood Chain"));
  }
  async function connect() {
    if (!window.ethereum) throw new Error(L("ui.err.noWallet", "No browser wallet found. Install one (MetaMask, Rabby) and try again."));
    const accs = (await window.ethereum.request({ method: "eth_requestAccounts" })) || [];
    if (!accs.length) return null;
    wallet = accs[0];
    renderWalletBtn();
    return wallet;
  }
  /** Check, send, wait for the receipt. */
  async function send(tx, ctx, onStatus) {
    const eth = window.ethereum;
    await ensureChain(eth);
    checkTx(tx, { ...ctx, chainId: Number(await eth.request({ method: "eth_chainId" })) });
    try { await rpc("eth_call", [{ from: wallet, to: tx.to, data: tx.data, value: tx.value || "0x0" }, "latest"]); }
    catch (e) { throw new Error(L("ui.err.wouldFail", "this would fail on chain: {why}", { why: e.message || e })); }
    onStatus && onStatus(L("ui.tx.confirm", "confirm in your wallet…"));
    const hash = await eth.request({ method: "eth_sendTransaction", params: [{ from: wallet, to: tx.to, data: tx.data, value: tx.value || "0x0", chainId: CHAIN_HEX }] });
    onStatus && onStatus(L("ui.tx.waiting", "waiting for {tx}…", { tx: hash.slice(0, 10) }));
    for (let i = 0; i < 120; i++) {
      const rec = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
      if (rec) {
        if (rec.status !== "0x1") throw new Error(L("ui.err.reverted", "transaction {tx} reverted", { tx: hash }));
        return rec;
      }
      await sleep(1500);
    }
    throw new Error(L("ui.err.noReceipt", "no receipt yet for {tx}: check it on the explorer before trying again", { tx: hash }));
  }
  const errText = (e) => (e && (e.code === 4001 || /rejected|denied/i.test(e.message || "")) ? L("ui.err.cancelled", "Cancelled in the wallet.") : (e && (e.shortMessage || e.message)) || String(e));

  function renderWalletBtn() {
    const b = $("mk-wallet");
    if (!b) return;
    b.textContent = wallet ? short(wallet) : L("ui.connect", "Connect wallet");
  }

  // ---- views ----
  function setView(html) { $("mk-view").innerHTML = html; }
  function msg(id, text, kind) { const el = $(id); if (el) { el.textContent = text || ""; el.className = "mk-msg" + (kind ? " " + kind : ""); } }
  const feeTier = (f) => (f / 10000).toFixed(f < 100 ? 3 : 2) + "%";

  async function viewHome() {
    setView(`
      <div class="card pad mk-pick">
        <h3>${h("ui.home.title", "Pick a token")}</h3>
        <p class="mk-muted">${h("ui.home.lede", "Paste any token's contract address on Robinhood Chain. Fly Maker works on GIGA DEX pools against USDG or WETH, and can create the pool if there isn't one yet.")}</p>
        <form id="mk-tokform" class="mk-row">
          <input id="mk-tok" class="mk-input mono" placeholder="${esc(L("ui.home.placeholder", "0x… token contract address"))}" spellcheck="false" autocomplete="off" aria-label="${esc(L("ui.home.aria", "Token address"))}">
          <button class="btn red" type="submit">${h("ui.home.open", "Open dashboard")}</button>
        </form>
        <p class="mk-small mk-muted">${h("ui.home.example", "For example: {link}. No GIGA DEX pool yet? The dashboard offers to create one.").replace("{link}", `<a href="?token=${FLYAI}">$FLYAI</a>`)}</p>
        <p class="mk-msg" id="mk-tokmsg"></p>
      </div>
      <div id="mk-mine"></div>`);
    $("mk-tokform").addEventListener("submit", (e) => {
      e.preventDefault();
      const a = $("mk-tok").value.trim();
      if (!isAddr(a)) return msg("mk-tokmsg", L("ui.home.bad", "That isn't a contract address (0x + 40 hex characters)."), "err");
      location.search = "?token=" + a;
    });
    renderMine();
  }

  async function renderMine() {
    const box = $("mk-mine");
    if (!box || !wallet || !FACTORY_ADDR) return;
    const [r] = await calls([[FACTORY_ADDR, enc.vaultsOf(wallet)]]);
    const list = r ? decodeAddrArray(r).map(wordAddr) : [];
    box.innerHTML = `<h3 class="mk-h">${h("ui.home.mine", "My vaults")}</h3>` + (list.length
      ? `<div class="mk-list">${list.map((v) => `<a class="card pad mk-item" href="?vault=${v}"><span class="mono">${esc(v)}</span><span class="mk-muted">${h("ui.home.openVault", "open →")}</span></a>`).join("")}</div>`
      : `<p class="mk-muted">${h("ui.home.none", "No vaults from {wallet} yet.", { wallet: short(wallet) })}</p>`);
  }

  // ---- token view: snapshot, pools, builder, plan card, fund ----
  let T = null;                                          // { token, pools, pool, vaults, feeBps }

  async function viewToken(addr) {
    setView(`<p class="mk-muted">${h("ui.token.loading", "Reading the pools…")}</p>`);
    const token = await tokenInfo(addr);
    const pools = (await findPools(addr)).sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0));
    const head = `<div class="mk-tokhead"><div><p class="eyebrow">${h("ui.token.eyebrow", "Market")}</p><h2 class="mk-sym">${esc(token.symbol)}</h2><p class="mk-muted">${link(addr, addr)}</p></div></div>`;
    if (!pools.length) {
      setView(`${head}<div class="card pad mk-newpool" id="mk-newpool"></div><p><a href="maker.html">${h("ui.back", "← another token")}</a></p>`);
      renderNewPool(token, true);
      return;
    }
    let feeBps = null, vaults = [], tiers = [], myFee = null, myFlyai = null;
    if (FACTORY_ADDR) {
      const [f, tr0] = await calls([[FACTORY_ADDR, SEL.feeBps], [FACTORY_ADDR, SEL.holderTiers]]);
      feeBps = f ? Number(w0(f)) : null;
      tiers = tr0 ? decodeTiers(tr0) : [];
      if (wallet) {
        const [mf, mb] = await calls([[FACTORY_ADDR, enc.feeBpsFor(wallet)], [FLYAI, enc.balanceOf(wallet)]]);
        myFee = mf ? Number(w0(mf)) : null;
        myFlyai = mb ? w0(mb) : null;
      }
      const logs = await getLogs(FACTORY_ADDR, [TOPIC.VaultCreated], FACTORY_FROM).catch(() => []);
      vaults = logs.filter((l) => pools.some((p) => same("0x" + l.topics[2].slice(26), p.address)))
        .map((l) => ({ vault: wordAddr(words(l.data)[0]), owner: "0x" + l.topics[1].slice(26), pool: "0x" + l.topics[2].slice(26) }));
    }
    T = { token, pools, pool: pools[0], vaults, feeBps, tiers, myFee, myFlyai, strategy: "range" };
    const deep = pools[0], sym = { token: token.symbol };
    setView(`
      ${head}
      <div class="mk-stats">
        <div class="card pad"><span class="k">${h("ui.token.price", "Price")}</span><span class="v">${deep.priceUsd != null ? "$" + fmt(deep.priceUsd, 5) : fmt(deep.price, 5) + " " + esc(deep.quoteInfo.symbol)}</span></div>
        <div class="card pad"><span class="k">${h("ui.token.tvl", "Money in GIGA pools")}</span><span class="v">$${fmt(pools.reduce((s, p) => s + (p.tvlUsd || 0), 0))}</span></div>
        <div class="card pad"><span class="k">${h("ui.token.pools", "Pools")}</span><span class="v">${pools.length}</span></div>
        <div class="card pad"><span class="k">${h("ui.token.vaults", "Fly Maker vaults")}</span><span class="v">${FACTORY_ADDR ? vaults.length : "–"}</span></div>
      </div>
      <h3 class="mk-h">${h("ui.token.pools", "Pools")}</h3>
      <div class="mk-pools" id="mk-pools"></div>
      <details class="mk-adv"><summary>${h("ui.token.anotherPool", "Create another GIGA pool for {token}", sym)}</summary><div id="mk-newpool"></div></details>
      ${vaults.length ? `<h3 class="mk-h">${h("ui.token.working", "Vaults working on {token}", sym)}</h3><div class="mk-list">${vaults.map((v) => `<a class="card pad mk-item" href="?vault=${v.vault}"><span class="mono">${esc(short(v.vault))}</span><span class="mk-muted">${h("ui.token.owner", "owner {owner}", { owner: short(v.owner) })}</span><span class="mk-badge">${h("ui.token.vaultBadge", "Fly Maker vault")}</span></a>`).join("")}</div>` : ""}
      <h3 class="mk-h">${h("ui.token.build", "Build a plan")}</h3>
      <div class="mk-builder">
        <div class="card pad" id="mk-form"></div>
        <div id="mk-side"></div>
      </div>`);
    renderPools();
    renderForm();
    renderNewPool(token, false);
  }

  /** Create + initialize a GIGA CL pool for `token` (none yet, or another quote / fee tier). */
  function renderNewPool(token, none) {
    const box = $("mk-newpool"), sym = { token: token.symbol };
    box.innerHTML = `
      ${none ? `<p class="eyebrow">${h("ui.pool.eyebrow", "No pool yet")}</p><h3>${h("ui.pool.title", "Create the {token} pool on GIGA DEX", sym)}</h3>
      <p class="mk-muted">${h("ui.pool.lede", "There's no GIGA DEX pool of {token} against USDG or WETH. Create one here: you set the starting price, the pool is made and initialized in one transaction, and anyone can trade it once it has liquidity. Then build a <b>Steady band</b> plan and deposit {token}: the bot seeds the empty pool with a band just beside the starting price, so the first buyers buy from your vault.", sym)}</p>` : ""}
      <div class="mk-fields">
        <label class="mk-field"><span>${h("ui.pool.pair", "Pair with")}</span><select id="np-quote" class="mk-input"><option value="${USDG}">USDG</option><option value="${WETH}">WETH</option></select></label>
        <label class="mk-field"><span>${h("ui.pool.fee", "Fee tier")}</span><select id="np-fee" class="mk-input">${FEE_TIERS.map((f) => `<option value="${f}"${f === 10000 ? " selected" : ""}>${feeTier(f)}</option>`).join("")}</select><small>${h("ui.pool.feeHint", "1% suits a new, volatile token")}</small></label>
        ${field("np-price", L("ui.pool.price", "Starting price (quote per {token})", sym), "", L("ui.pool.priceHint", "The price the pool opens at. Pick it carefully: it can't be changed once there is liquidity."))}
      </div>
      <p class="mk-small" id="np-note"></p>
      <button class="btn${none ? " red" : ""}" id="np-go" type="button">${h("ui.pool.create", "Create pool")}</button>
      <p class="mk-msg" id="np-msg" aria-live="polite"></p>
      <p class="mk-small mk-muted">${h("ui.pool.exists", "If someone already made this exact pool (same pair and fee tier), nothing happens and the page just opens it.")}</p>`;
    const note = async () => {
      const q = await tokenInfo($("np-quote").value), pr = $("np-price").value.trim();
      if (!pr) { $("np-note").textContent = ""; return; }
      try {
        const tokenIs0 = sortTokens(token.address, q.address)[0] === token.address;
        const sp = sqrtPriceX96(pr, token.decimals, q.decimals, tokenIs0);
        const back = humanPrice(sp, tokenIs0, token.decimals, q.decimals);
        $("np-note").textContent = L("ui.pool.opensAt", "Opens at {price} {quote} per {token}.", { price: fmt(back, 6), quote: q.symbol, token: token.symbol });
        $("np-note").className = "mk-small mk-ok";
      } catch (e) { $("np-note").textContent = e.message; $("np-note").className = "mk-small mk-msg err"; }
    };
    ["np-quote", "np-price"].forEach((id) => $(id).addEventListener("input", note));
    $("np-quote").addEventListener("change", note);
    $("np-go").addEventListener("click", async () => {
      const btn = $("np-go");
      btn.disabled = true;
      try {
        if (!wallet && !(await connect())) throw new Error(L("ui.err.connectFirst", "connect a wallet first"));
        const q = await tokenInfo($("np-quote").value), fee = Number($("np-fee").value);
        const [existing] = await calls([[GIGA_CL_FACTORY, enc.getPool(token.address, q.address, fee)]]);
        if (existing && !/^0x0{40}$/.test(wordAddr(w0(existing)))) { location.search = "?token=" + token.address; return; }
        const tokenIs0 = sortTokens(token.address, q.address)[0] === token.address;
        const sp = sqrtPriceX96($("np-price").value.trim(), token.decimals, q.decimals, tokenIs0);
        await send({ to: GIGA_POSITIONS, data: enc.createPool(token.address, q.address, fee, sp) }, { token: token.address, quote: q.address }, (t) => msg("np-msg", t));
        msg("np-msg", L("ui.pool.done", "Pool created. Opening it…"), "ok");
        location.search = "?token=" + token.address;
      } catch (e) {
        msg("np-msg", errText(e), "err");
        btn.disabled = false;
      }
    });
  }

  function renderPools() {
    $("mk-pools").innerHTML = T.pools.map((p, i) => `
      <label class="card mk-pool${p === T.pool ? " on" : ""}">
        <input type="radio" name="mk-pool" value="${i}"${p === T.pool ? " checked" : ""}>
        <span class="mk-pair">${esc(T.token.symbol)} / ${esc(p.quoteInfo.symbol)}</span>
        <span class="mk-chip">${feeTier(p.fee)}</span>
        <span class="mk-muted">${h("ui.token.inPool", "{usd} in pool", { usd: "$" + fmt(p.tvlUsd) })}</span>
        <span class="mk-muted mono">${link(p.address)}</span>
      </label>`).join("");
    document.querySelectorAll('input[name="mk-pool"]').forEach((el) => el.addEventListener("change", () => {
      T.pool = T.pools[Number(el.value)];
      renderPools();
      renderForm();
    }));
  }

  const strat = (k) => ({
    range: { name: L("ui.strat.range", "Steady band"), line: L("ui.strat.rangeLine", "Keeps liquidity on both sides of the price, re-centers it as the price moves, collects its fees.") },
    buy: { name: L("ui.strat.buy", "Slow buyback"), line: L("ui.strat.buyLine", "Buys a set amount bit by bit over hours or weeks (TWAP).") },
    sell: { name: L("ui.strat.sell", "Slow sell"), line: L("ui.strat.sellLine", "Sells treasury tokens bit by bit without a big price drop (TWAP).") },
  })[k];
  const STRAT_KEYS = ["range", "buy", "sell"];

  function field(id, label, value, hint, attrs) {
    return `<label class="mk-field"><span>${esc(label)}</span><input id="${id}" class="mk-input" value="${esc(value)}" inputmode="decimal" autocomplete="off" ${attrs || ""}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
  }

  function renderForm() {
    const p = T.pool, q = p.quoteInfo.symbol, s = T.strategy, ts = T.token.symbol;
    const tabs = STRAT_KEYS.map((k) => `<button type="button" class="mk-tab${k === s ? " on" : ""}" data-s="${k}">${esc(strat(k).name)}</button>`).join("");
    let body = "";
    if (s === "range") {
      body = field("f-width", L("ui.f.width", "Range width (±%)"), "10", L("ui.f.widthHint", "How far above and below the price the band reaches")) +
        field("f-recenter", L("ui.f.recenter", "Re-center at (% of the way to the edge)"), "80", "") +
        field("f-minre", L("ui.f.minRecenter", "Min time between re-centers (minutes)"), "60", "") +
        field("f-inv", L("ui.f.inventory", "Inventory target (% in {token})", { token: ts }), "50", L("ui.f.inventoryHint", "20 to 80")) +
        field("f-dep", L("ui.f.deployed", "Deployed (% of the vault in the band)"), "90", L("ui.f.deployedHint", "The rest waits as a reserve")) +
        field("f-collect", L("ui.f.collect", "Collect fees every (hours)"), "6", "");
    } else {
      body = field("f-total", s === "buy" ? L("ui.f.totalBuy", "Total to buy with ({quote})", { quote: q }) : L("ui.f.totalSell", "Total to sell ({token})", { token: ts }),
        s === "buy" ? "100" : "100000", s === "sell" ? L("ui.f.totalSellHint", "Leave empty to sell everything in the vault") : "") +
        field("f-dur", L("ui.f.duration", "Over (hours)"), "168", L("ui.f.durationHint", "10 minutes to 90 days")) +
        field("f-every", L("ui.f.every", "A slice every (minutes)"), "15", L("ui.f.everyHint", "Size and timing vary ±20% at random")) +
        field("f-limit", L("ui.f.limit", "Limit price ({quote} per {token}, optional)", { quote: q, token: ts }), "",
          s === "buy" ? L("ui.f.limitBuy", "Pause buying above it") : L("ui.f.limitSell", "Pause selling below it"));
    }
    const dep = field("f-deposit", L("ui.f.deposit", "Deposit ({quote})", { quote: same(p.quote, WETH) ? "ETH" : q }), s === "sell" ? "0" : "100", "") +
      (s !== "buy" ? field("f-deptok", L("ui.f.depositToken", "Also deposit {token}", { token: ts }), s === "sell" ? "100000" : "0", L("ui.f.depositTokenHint", "Token deposits pay no fee")) : "");
    $("mk-form").innerHTML = `
      <div class="mk-tabs" role="tablist">${tabs}</div>
      <p class="mk-muted">${esc(strat(s).line)}</p>
      <div class="mk-fields">${body}</div>
      <h4>${h("ui.f.money", "Money")}</h4>
      <div class="mk-fields">${dep}</div>
      <details class="mk-adv"><summary>${h("ui.g.title", "Guardrails (checked by the vault itself)")}</summary>
        <div class="mk-fields">
          ${field("g-maxtrade", L("ui.g.maxTrade", "Max trade ({quote})", { quote: q }), "", L("ui.g.auto", "Auto from the plan if empty"))}
          ${field("g-daily", L("ui.g.daily", "Daily cap ({quote})", { quote: q }), "", L("ui.g.dailyHint", "At least 4x the max trade; any 24 hours trade at most this"))}
          ${field("g-impact", L("ui.g.impact", "Max price impact per trade (%)"), "3", "")}
          ${field("g-dev", L("ui.g.dev", "Price check band vs the 5-minute average (%)"), "3", "")}
          ${field("g-window", L("ui.g.window", "Reference window (minutes)"), "5", "")}
          ${field("g-pos", L("ui.g.positions", "Max open positions"), "3", "")}
          ${field("g-lp", L("ui.g.lp", "Liquidity actions per day"), "12", "")}
        </div>
      </details>`;
    document.querySelectorAll(".mk-tab").forEach((b) => b.addEventListener("click", () => { T.strategy = b.dataset.s; renderForm(); }));
    $("mk-form").querySelectorAll("input").forEach((el) => el.addEventListener("input", renderSide));
    renderSide();
  }

  const num = (id) => { const el = $(id); const v = el ? el.value.trim() : ""; return v === "" ? null : Number(v); };

  /** The plan, guardrails and deposit from the form; { errors } when something doesn't add up. */
  function readForm() {
    const p = T.pool, q = p.quoteInfo, t = T.token, s = T.strategy, errors = [];
    const deposit = units($("f-deposit").value || "0", q.decimals);
    const depTok = $("f-deptok") ? units($("f-deptok").value || "0", t.decimals) : 0n;
    if (deposit == null || depTok == null) errors.push(L("ui.err.depositNumber", "deposit amounts must be plain numbers"));
    let plan;
    if (s === "range") {
      plan = { strategy: "range", version: 1, width_bps: Math.round((num("f-width") || 0) * 100), recenter_at: (num("f-recenter") || 0) / 100,
        min_recenter_s: Math.round((num("f-minre") || 0) * 60), inventory_target: (num("f-inv") || 0) / 100, deployed: (num("f-dep") || 0) / 100,
        min_swap: (10n ** BigInt(q.decimals)) / 2n, collect_every_s: Math.round((num("f-collect") || 0) * 3600), tolerance: 0.1 };
      if (same(q.address, WETH)) plan.min_swap = 10n ** 14n;   // 0.0001 ETH
    } else {
      const totalTxt = ($("f-total").value || "").trim();
      const total = totalTxt === "" ? null : units(totalTxt, s === "buy" ? q.decimals : t.decimals);
      if (totalTxt !== "" && total == null) errors.push(L("ui.err.totalNumber", "total must be a plain number"));
      const dur = Math.round((num("f-dur") || 0) * 3600), every = Math.round((num("f-every") || 0) * 60);
      const slices = Math.max(1, Math.floor(dur / Math.max(every, 1)));
      const minSlice = total ? (total / BigInt(slices) / 5n > 0n ? total / BigInt(slices) / 5n : 1n) : 10n ** BigInt(t.decimals);
      const lim = num("f-limit");
      plan = { strategy: "twap", version: 1, side: s, total, start: Math.floor(Date.now() / 60000) * 60, duration_s: dur, every_s: every,
        min_slice: minSlice, limit_price: lim == null || lim <= 0 ? null : lim, jitter: 0.2 };
    }
    errors.push(...planErrors(plan));
    // guardrails: what the form says, or sized from the plan
    const qd = 10n ** BigInt(q.decimals);
    let maxTrade = num("g-maxtrade") != null ? units($("g-maxtrade").value, q.decimals) : null;
    let daily = num("g-daily") != null ? units($("g-daily").value, q.decimals) : null;
    if (maxTrade == null) {
      if (s === "range") maxTrade = deposit && deposit > 0n ? deposit / 10n : qd * 5n;
      else if (plan.total) {
        const slices = BigInt(Math.max(1, Math.floor(plan.duration_s / plan.every_s)));
        const perSliceQ = s === "buy" ? plan.total / slices : BigInt(Math.ceil(Number(plan.total / slices) * rawPrice(p)));
        maxTrade = (perSliceQ * 3n) / 2n + 1n;
      } else maxTrade = qd * 5n;
    }
    if (daily == null) {
      daily = maxTrade * 4n;
      if (s !== "range" && plan.total) {                  // enough to finish on schedule, with 20% to spare
        const needQ = s === "buy" ? plan.total : BigInt(Math.ceil(Number(plan.total) * rawPrice(p)));
        const perDay = (needQ * 86400n) / BigInt(Math.max(plan.duration_s, 1));
        const want = (perDay * 4n * 12n) / (3n * 10n);
        if (want > daily) daily = want;
      }
    }
    const g = { maxTrade, dailyCap: daily, maxImpactBps: Math.round((num("g-impact") || 0) * 100), maxDevBps: Math.round((num("g-dev") || 0) * 100),
      twapWindow: Math.round((num("g-window") || 0) * 60), maxPositions: Math.round(num("g-pos") || 0), lpPerDay: Math.round(num("g-lp") || 0) };
    try { errors.push(...guardrailErrors(g)); } catch (e) { errors.push(e.message); }
    const fit = plan.strategy === "twap" ? fitProblems(plan, g.maxTrade, g.dailyCap, rawPrice(p)) : [];
    return { plan, g, deposit: deposit || 0n, depTok: depTok || 0n, errors, fit };
  }
  /** Raw quote per raw token in the chosen pool. */
  function rawPrice(p) {
    const r = rawPrice1per0(p.sqrtP);
    return p.quoteIs1 ? r : r ? 1 / r : 0;
  }

  function planRows(raw, q, t) {
    // ints from the chain are BigInt (parsePlan); show them as numbers, keep the total exact
    const plan = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "bigint" && k !== "total" ? Number(v) : v]));
    if (plan.strategy === "range") return [
      [L("ui.p.width", "Range width"), "±" + (plan.width_bps / 100) + "%"],
      [L("ui.p.recenter", "Re-center at"), L("ui.p.recenterV", "{pct} of the way to the edge", { pct: pct(plan.recenter_at, 0) })],
      [L("ui.p.minRecenter", "Min re-center interval"), L("ui.p.minutes", "{n} min", { n: Math.round(plan.min_recenter_s / 60) })],
      [L("ui.p.inventory", "Inventory target"), pct(plan.inventory_target, 0) + " " + t.symbol],
      [L("ui.p.deployed", "Deployed"), L("ui.p.deployedV", "{pct} of the vault", { pct: pct(plan.deployed, 0) })],
      [L("ui.p.collect", "Collect fees every"), L("ui.p.hours", "{n} h", { n: plan.collect_every_s / 3600 })]];
    const tot = plan.total == null ? L("ui.p.everything", "everything in the vault")
      : decimalOf(plan.total, plan.side === "buy" ? q.decimals : t.decimals, 6) + " " + (plan.side === "buy" ? q.symbol : t.symbol);
    return [[L("ui.p.side", "Side"), plan.side === "buy" ? L("ui.p.buy", "Buy (accumulate)") : L("ui.p.sell", "Sell (distribute)")], [L("ui.p.total", "Total"), tot],
      [L("ui.p.duration", "Duration"), L("ui.p.hours", "{n} h", { n: (plan.duration_s / 3600).toFixed(plan.duration_s % 3600 ? 2 : 0) })],
      [L("ui.p.every", "A slice every"), L("ui.p.everyV", "{n} min ±20%", { n: Math.round(plan.every_s / 60) })],
      [L("ui.p.limit", "Limit price"), plan.limit_price == null ? L("ui.p.none", "none") : pyFloat(plan.limit_price) + " " + q.symbol],
      [L("ui.p.starts", "Starts"), new Date(Number(plan.start) * 1000).toLocaleString()]];
  }
  function guardRows(g, q) {
    return [[L("ui.g.rowMaxTrade", "Max trade"), decimalOf(g.maxTrade, q.decimals, 4) + " " + q.symbol],
      [L("ui.g.rowDaily", "Daily cap"), L("ui.g.rowDailyV", "{amount} per 24 h", { amount: decimalOf(g.dailyCap, q.decimals, 4) + " " + q.symbol })],
      [L("ui.g.rowImpact", "Max price impact"), (Number(g.maxImpactBps) / 100) + "%"],
      [L("ui.g.rowCheck", "Price check"), L("ui.g.rowCheckV", "±{pct}% vs the {n}-min average", { pct: Number(g.maxDevBps) / 100, n: Math.round(Number(g.twapWindow) / 60) })],
      [L("ui.g.rowPositions", "Max open positions"), String(g.maxPositions)],
      [L("ui.g.rowLp", "Liquidity actions"), L("ui.g.rowLpV", "{n} per day", { n: g.lpPerDay })]];
  }
  const table = (rows) => `<div class="mk-table">${rows.map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("")}</div>`;

  function whyPlan(plan, p) {
    const lines = [];
    const imp = impactOf(Number(readFormSafe().g.maxTrade || 0n), p.quoteIs1, p.liquidity, p.sqrtP);
    if (!p.liquidity) lines.push(L("ui.why.fresh", "A brand-new pool: the vault provides its first liquidity."));
    else if (p.tvlUsd != null && p.tvlUsd < 50000) lines.push(L("ui.why.small", "This pool is small ({usd}): trades stay small, and one max-size trade moves the price about {pct} within its active liquidity.", { usd: "$" + fmt(p.tvlUsd), pct: pct(imp, 1) }));
    if (plan.strategy === "range") lines.push(L("ui.why.range", "A band keeps liquidity on both sides so buyers and sellers always find a price. As the price falls the band holds more token, as it rises more {quote} (impermanent loss); you can end up with less than holding.", { quote: p.quoteInfo.symbol }));
    else if (plan.side === "buy") lines.push(L("ui.why.buy", "Spreading the buy over time keeps each trade small, so the price isn't pushed up against you. The market can still move over the period."));
    else lines.push(L("ui.why.sell", "Spreading the sale over time keeps each trade small, so the price isn't dumped. The market can still move over the period."));
    return lines;
  }
  function readFormSafe() { try { return readForm(); } catch (e) { return { g: {}, errors: [e.message], fit: [] }; } }

  function renderSide() {
    const f = readFormSafe(), p = T.pool, q = p.quoteInfo, t = T.token;
    if (f.errors.length && !f.plan) { $("mk-side").innerHTML = `<div class="card pad"><p class="mk-msg err">${esc(f.errors[0])}</p></div>`; return; }
    let text = "", hash = "", ok = !f.errors.length;
    try { text = canonical(f.plan); hash = keccakText(text); } catch (e) { ok = false; f.errors.push(e.message); }
    const tooLong = utf8(text).length > MAX_PLAN_BYTES;
    if (tooLong) { ok = false; f.errors.push(L("ui.err.planLong", "plan text too long")); }
    const feeRate = T.myFee != null ? T.myFee : T.feeBps;              // the connected wallet's own rate (chain)
    const fee = feeRate == null ? null : (f.deposit * BigInt(feeRate)) / 10000n;
    const imp = impactOf(Number(f.g.maxTrade || 0n), p.quoteIs1, p.liquidity, p.sqrtP);
    const fresh = !p.liquidity || p.liquidity === 0n;
    const freshNote = fresh ? `<p class="mk-warn">${h("ui.warn.fresh", "This pool has no liquidity yet.")} ${T.strategy === "range"
      ? h("ui.warn.freshRange", "Deposit {token}: the bot seeds a band just beside the starting price (it can't rebalance by swapping in an empty pool).", { token: t.symbol })
      : h("ui.warn.freshTwap", "A slow buy or sell needs liquidity to trade against: seed the pool with a Steady band first.")}</p>` : "";
    const impWarn = !fresh && Number.isFinite(imp) && imp * 10000 > Number(f.g.maxImpactBps || 0)
      ? `<p class="mk-warn">${h("ui.warn.impact", "A max-size trade would move this pool about {pct}, more than the {limit}% impact guardrail: such trades fill only partly. Consider a smaller max trade.", { pct: pct(imp, 1), limit: Number(f.g.maxImpactBps) / 100 })}</p>` : "";
    const S = strat(T.strategy), quoteName = same(q.address, WETH) ? "ETH" : q.symbol;
    $("mk-side").innerHTML = `
      <div class="card pad mk-plan">
        <p class="eyebrow">${h("ui.plan.eyebrow", "Proposed plan")}</p>
        <h3>${esc(S.name)} · ${esc(t.symbol)}/${esc(q.symbol)} ${feeTier(p.fee)}</h3>
        <p class="mk-muted">${esc(S.line)}</p>
        <h4>${h("ui.plan.why", "Why this plan")}</h4>${whyPlan(f.plan, p).map((l) => `<p class="mk-small">${esc(l)}</p>`).join("")}
        <h4>${h("ui.plan.params", "Parameters")}</h4>${table(planRows(f.plan, q, t))}
        <h4>${h("ui.plan.guardrails", "On-chain guardrails")}</h4>${table(guardRows(f.g, q))}${impWarn}${freshNote}
        ${f.fit.length ? `<p class="mk-warn">${h("ui.warn.fit", "These guardrails can't carry the plan on schedule: {why}.", { why: f.fit.join("; ") })}</p>` : ""}
        ${f.errors.length ? `<p class="mk-msg err">${esc(f.errors.join("; "))}</p>` : ""}
        <h4>${h("ui.plan.hash", "Plan hash")}</h4>
        <p class="mono mk-hash">${esc(hash || "–")}</p>
        ${hash ? `<p class="mk-ok">${h("ui.plan.hashOk", "✓ recomputed in your browser. The vault stores the hash of exactly this text and publishes the text on chain.")}</p>` : ""}
        <details><summary>${h("ui.plan.text", "Plan text (what you sign)")}</summary><pre class="mk-pre">${esc(text)}</pre></details>
      </div>
      <div class="card pad mk-fund">
        <p class="eyebrow">${h("ui.fund.eyebrow", "Fund & deploy")}</p>
        ${table([[L("ui.fund.deposit", "Deposit"), decimalOf(f.deposit, q.decimals, 6) + " " + quoteName],
          [feeRate == null ? L("ui.fund.fee", "Protocol fee") : L("ui.fund.feePct", "Protocol fee ({pct}%)", { pct: feeRate / 100 }), fee == null ? "–" : decimalOf(fee, q.decimals, 6) + " " + q.symbol],
          [L("ui.fund.net", "Net to the vault"), fee == null ? "–" : decimalOf(f.deposit - fee, q.decimals, 6) + " " + q.symbol],
          ...(f.depTok > 0n ? [[L("ui.fund.tokenDeposit", "{token} deposit (no fee)", { token: t.symbol }), decimalOf(f.depTok, t.decimals, 4)]] : [])])}
        ${holderNote()}
        <label class="mk-check"><input type="checkbox" id="mk-agree"> ${h("ui.fund.agree", "I've read the plan, its guardrails and the fee. Fees are not refundable; any strategy can lose money.")}</label>
        <button class="btn red" id="mk-deploy" type="button"${!FACTORY_ADDR || !ok ? " disabled" : ""}>${FACTORY_ADDR ? h("ui.fund.go", "Create & fund vault") : h("ui.fund.notLive", "Fly Maker isn't live yet")}</button>
        <p class="mk-msg" id="mk-fundmsg" aria-live="polite"></p>
        <p class="mk-small mk-muted">${h("ui.fund.how", "Create, then approve the exact deposit, then deposit: one wallet prompt each. Your wallet owns the vault; money can only go back to you, into this one pool, or to the fee.")}</p>
      </div>`;
    const btn = $("mk-deploy");
    if (btn && FACTORY_ADDR && ok) btn.addEventListener("click", () => deployFlow(f, text));
  }

  /** The $FLYAI holder discount: the tiers, what this wallet holds, a way to buy. */
  function holderNote() {
    if (!T.tiers || !T.tiers.length) return "";
    const list = T.tiers.map((t) => L("ui.fund.tier", "{n} $FLYAI → {pct}%", { n: Number(t.minHold / 10n ** 18n).toLocaleString("en-US"), pct: t.feeBps / 100 })).join(" · ");
    const mine = T.myFlyai == null ? "" : " " + h("ui.fund.youHold", "You hold {n} $FLYAI.", { n: fmt(Number(T.myFlyai) / 1e18) });
    const onTier = T.myFee != null && T.feeBps != null && T.myFee < T.feeBps;
    return `<div class="mk-holder${onTier ? " on" : ""}">
      ${onTier ? `<p class="mk-ok">${h("ui.fund.holder", "✓ $FLYAI holder rate: {pct}%", { pct: T.myFee / 100 })}</p>` : ""}
      <p class="mk-small">${h("ui.fund.tiers", "Hold $FLYAI in your wallet for a lower fee: {tiers}.", { tiers: list })}${mine}</p>
      <a class="btn sm" href="/token#buy">${h("ui.fund.buy", "Buy $FLYAI")}</a>
    </div>`;
  }

  async function deployFlow(f, text) {
    if (!$("mk-agree").checked) return msg("mk-fundmsg", L("ui.fund.tick", "Tick the box first: you're approving exactly this plan."), "err");
    const p = T.pool, q = p.quoteInfo, t = T.token, btn = $("mk-deploy");
    btn.disabled = true;
    const st = (s) => msg("mk-fundmsg", s);
    try {
      if (!wallet && !(await connect())) throw new Error(L("ui.err.connectFirst", "connect a wallet first"));
      if (keccakText(text) !== keccakText(canonical(f.plan))) throw new Error(L("ui.err.planChanged", "plan text changed"));
      const ctx = { factory: FACTORY_ADDR, quote: q.address, token: t.address };
      st(L("ui.fund.s1", "1/3 creating your vault…"));
      const rec = await send({ to: FACTORY_ADDR, data: enc.create(p.address, q.address, text, f.g) }, ctx, st);
      const log = rec.logs.find((l) => same(l.address, FACTORY_ADDR) && l.topics[0] === TOPIC.VaultCreated);
      const vault = wordAddr(words(log.data)[0]);
      const vctx = { ...ctx, vault };
      const eth = same(q.address, WETH);
      if (f.deposit > 0n) {
        if (eth) {
          st(L("ui.fund.s2eth", "2/3 depositing ETH…"));
          await send({ to: vault, data: enc.deposit("0x0000000000000000000000000000000000000000", 0n), value: "0x" + f.deposit.toString(16) }, { ...vctx, amount: f.deposit }, st);
        } else {
          st(L("ui.fund.s2", "2/3 approving exactly {amount}…", { amount: decimalOf(f.deposit, q.decimals, 6) + " " + q.symbol }));
          await send({ to: q.address, data: enc.approve(vault, f.deposit) }, { ...vctx, amount: f.deposit }, st);
          st(L("ui.fund.s3", "3/3 depositing…"));
          await send({ to: vault, data: enc.deposit(q.address, f.deposit) }, vctx, st);
        }
      }
      if (f.depTok > 0n) {
        st(L("ui.fund.tokApprove", "approving exactly {amount}…", { amount: decimalOf(f.depTok, t.decimals, 4) + " " + t.symbol }));
        await send({ to: t.address, data: enc.approve(vault, f.depTok) }, { ...vctx, quote: q.address, amount: f.depTok }, st);
        st(L("ui.fund.tokDeposit", "depositing {token}…", { token: t.symbol }));
        await send({ to: vault, data: enc.deposit(t.address, f.depTok) }, vctx, st);
      }
      msg("mk-fundmsg", L("ui.fund.done", "Vault deployed. Opening it…"), "ok");
      location.search = "?vault=" + vault;
    } catch (e) {
      msg("mk-fundmsg", errText(e), "err");
      btn.disabled = false;
    }
  }

  // ---- vault dashboard ----
  async function readVault(addr) {
    const r = await calls([[addr, SEL.owner], [addr, SEL.pool], [addr, SEL.quote], [addr, SEL.token0], [addr, SEL.token1], [addr, SEL.planHash],
      [addr, SEL.paused], [addr, SEL.guardrails], [addr, SEL.tradeAllowance], [addr, SEL.lpAllowance], [addr, SEL.positionIds], [addr, SEL.ticks], [addr, SEL.factory]]);
    if (!r[0] || !r[1]) throw new Error(L("ui.err.notVault", "not a Fly Maker vault: {addr}", { addr }));
    const v = { address: addr, owner: wordAddr(w0(r[0])), pool: wordAddr(w0(r[1])), quote: wordAddr(w0(r[2])), token0: wordAddr(w0(r[3])),
      token1: wordAddr(w0(r[4])), planHash: "0x" + w0(r[5]).toString(16).padStart(64, "0"), paused: w0(r[6]) === 1n,
      tradeLeft: w0(r[8]), lpLeft: w0(r[9]), ids: r[10] ? decodeAddrArray(r[10]) : [], factory: wordAddr(w0(r[12])) };
    const gw = words(r[7]);
    v.g = Object.fromEntries(G_KEYS.map((k, i) => [k, gw[i]]));
    v.twapTick = r[11] ? Number(signed(words(r[11])[1], 24)) : null;
    v.token = same(v.quote, v.token0) ? v.token1 : v.token0;
    const [q, t] = await Promise.all([tokenInfo(v.quote), tokenInfo(v.token)]);
    v.q = q; v.t = t;
    const pr = await calls([[v.pool, SEL.slot0], [v.pool, SEL.fee], [v.factory, SEL.stopped], [v.factory, SEL.feeBps], [v.quote, enc.balanceOf(addr)],
      [v.token, enc.balanceOf(addr)], [v.factory, SEL.isVault + addrWord(addr)], ...v.ids.map((id) => [GIGA_POSITIONS, enc.pmPositions(id)])]);
    const [ownerFee] = await calls([[v.factory, enc.feeBpsFor(v.owner)]]);
    v.ownerFeeBps = ownerFee ? Number(w0(ownerFee)) : null;
    const sw = words(pr[0]);
    v.sqrtP = sw[0]; v.tick = Number(signed(sw[1], 24)); v.fee = Number(w0(pr[1]));
    v.stopped = w0(pr[2]) === 1n; v.feeBps = pr[3] ? Number(w0(pr[3])) : null;
    v.balQ = w0(pr[4]); v.balT = w0(pr[5]); v.verified = pr[6] ? w0(pr[6]) === 1n : false;
    v.quoteIs1 = same(v.quote, v.token1);
    v.price = humanPrice(v.sqrtP, v.quoteIs1, t.decimals, q.decimals);
    v.positions = v.ids.map((id, i) => {
      const w = words(pr[7 + i]);
      const lower = Number(signed(w[5], 24)), upper = Number(signed(w[6], 24)), liq = w[7];
      const a = positionAmounts(liq, lower, upper, v.sqrtP);
      const [aT, aQ] = v.quoteIs1 ? [a.a0, a.a1] : [a.a1, a.a0];
      return { id, lower, upper, liq, inRange: a.inRange, tok: aT / 10 ** t.decimals, quo: aQ / 10 ** q.decimals,
        owedT: Number(v.quoteIs1 ? w[10] : w[11]) / 10 ** t.decimals, owedQ: Number(v.quoteIs1 ? w[11] : w[10]) / 10 ** q.decimals };
    });
    return v;
  }

  function vaultValue(v) {
    const idleT = Number(v.balT) / 10 ** v.t.decimals, idleQ = Number(v.balQ) / 10 ** v.q.decimals;
    const posT = v.positions.reduce((s, p) => s + p.tok + p.owedT, 0), posQ = v.positions.reduce((s, p) => s + p.quo + p.owedQ, 0);
    return { tok: idleT + posT, quo: idleQ + posQ, value: idleQ + posQ + (idleT + posT) * v.price };
  }

  function decodeLog(l, v) {
    const d = words(l.data), at = Number(BigInt(l.blockNumber));
    const qd = v.q.decimals, td = v.t.decimals, qs = v.q.symbol, ts = v.t.symbol;
    const amt = (raw, isQuote) => decimalOf(raw, isQuote ? qd : td, 4) + " " + (isQuote ? qs : ts);
    const id = () => String(BigInt(l.topics[1]));
    switch (l.topics[0]) {
      case TOPIC.Swapped: {
        const z = d[0] === 1n;                            // token0 in
        const inIsQuote = z ? !v.quoteIs1 : v.quoteIs1;
        const vars = { paid: amt(d[1], inIsQuote), got: amt(d[2], !inIsQuote) };
        return { at, kind: inIsQuote ? "buy" : "sell", text: inIsQuote ? L("ui.log.bought", "Bought: {paid} → {got}", vars) : L("ui.log.sold", "Sold: {paid} → {got}", vars) };
      }
      case TOPIC.Minted: return { at, kind: "lp", text: L("ui.log.minted", "Opened position #{id} (ticks {lower}..{upper})", { id: id(), lower: signed(d[0], 24), upper: signed(d[1], 24) }) };
      case TOPIC.Decreased: return { at, kind: "lp", text: L("ui.log.decreased", "Took liquidity out of #{id}", { id: id() }) };
      case TOPIC.Collected: {
        const [x, y] = v.quoteIs1 ? [d[0], d[1]] : [d[1], d[0]];
        return { at, kind: "fees", text: L("ui.log.collected", "Collected from #{id}: {token} + {quote}", { id: id(), token: amt(x, false), quote: amt(y, true) }) };
      }
      case TOPIC.Burned: return { at, kind: "lp", text: L("ui.log.burned", "Closed position #{id}", { id: id() }) };
      case TOPIC.Deposited: {
        const tok = "0x" + l.topics[1].slice(26), isQ = same(tok, v.quote);
        const text = d[1] ? L("ui.log.depositFee", "Deposit {amount} (fee {fee})", { amount: amt(d[0], isQ), fee: amt(d[1], isQ) })
          : L("ui.log.deposit", "Deposit {amount}", { amount: amt(d[0], isQ) });
        return { at, kind: "dep", text, tok, amount: d[0], fee: d[1] };
      }
      case TOPIC.Withdrawn: {
        const tok = "0x" + l.topics[2].slice(26), isQ = same(tok, v.quote);
        const amount = same(tok, v.quote) || same(tok, v.token) ? amt(d[0], isQ) : L("ui.log.other", "{n} of {token}", { n: decimalOf(d[0], 18, 4), token: short(tok) });
        return { at, kind: "wd", text: L("ui.log.withdrawn", "Withdrawn {amount}", { amount }), tok, amount: d[0] };
      }
      case TOPIC.PausedSet: return { at, kind: "ctl", text: d[0] === 1n ? L("ui.log.paused", "Paused") : L("ui.log.resumed", "Resumed") };
      case TOPIC.PlanSet: return { at, kind: "plan", text: L("ui.log.plan", "Plan set {hash}…", { hash: l.topics[1].slice(0, 10) }), hash: l.topics[1], planText: decodeString(l.data, d[0]) };
      case TOPIC.GuardrailsSet: return { at, kind: "ctl", text: L("ui.log.guardrails", "Guardrails changed") };
      case TOPIC.Released: return { at, kind: "lp", text: d[2] === 1n ? L("ui.log.stuck", "Position #{id} stuck, retry later", { id: id() }) : L("ui.log.released", "Position #{id} released to the owner", { id: id() }) };
      default: return null;
    }
  }

  async function viewVault(addr) {
    setView(`<p class="mk-muted">${h("ui.v.loading", "Reading the vault…")}</p>`);
    const v = await readVault(addr);
    const logs = await getLogs(addr, [], FACTORY_FROM).catch(() => []);
    const evs = logs.map((l) => ({ ...decodeLog(l, v), tx: l.transactionHash })).filter((e) => e && e.text);
    const planEv = evs.filter((e) => e.kind === "plan").pop();
    let plan = null, planOk = false, planCanon = false;
    if (planEv) {
      planOk = keccakText(planEv.planText) === v.planHash && planEv.hash === v.planHash;
      try { const pp = parsePlan(planEv.planText); plan = pp.plan; planCanon = pp.canonical; } catch (e) { plan = null; }
    }
    const val = vaultValue(v);
    let netQ = 0n, netT = 0n, fees = 0n;
    for (const e of evs) {
      if (e.kind === "dep") { if (same(e.tok, v.quote)) { netQ += e.amount - e.fee; fees += e.fee; } else netT += e.amount; }
      if (e.kind === "wd") { if (same(e.tok, v.quote)) netQ -= e.amount; else if (same(e.tok, v.token)) netT -= e.amount; }
    }
    const holdValue = Number(netQ) / 10 ** v.q.decimals + (Number(netT) / 10 ** v.t.decimals) * v.price;
    const lastTrade = evs.filter((e) => ["buy", "sell", "lp", "fees"].includes(e.kind)).pop();
    const key = v.stopped ? "stopped" : v.paused ? "paused" : !planOk ? "unknown" : v.twapTick == null ? "warmup"
      : Math.abs(v.tick - v.twapTick) > Number(v.g.maxDevBps) ? "waiting" : "active";
    const STATUS = {
      stopped: [L("ui.st.stopped", "stopped"), L("ui.st.stoppedLine", "Stopped by fly.ai (emergency stop): nothing trades, you can still withdraw.")],
      paused: [L("ui.st.paused", "paused"), L("ui.st.pausedLine", "Paused: nothing trades until the owner resumes.")],
      unknown: [L("ui.st.unknown", "unknown plan"), L("ui.st.unknownLine", "Unknown plan: the plan text on chain doesn't match the stored hash.")],
      warmup: [L("ui.st.warmup", "warming up"), L("ui.st.warmupLine", "Warming up: the pool needs a few minutes of price history before the vault may trade.")],
      waiting: [L("ui.st.waiting", "waiting"), L("ui.st.waitingLine", "Waiting: the price is off its 5-minute average, the vault sits still until it catches up.")],
      active: [L("ui.st.active", "active"), L("ui.st.activeLine", "Active: the bot runs this plan inside the guardrails.")],
    }[key];
    const isOwner = wallet && same(wallet, v.owner);
    const qs = esc(v.q.symbol), tsy = esc(v.t.symbol);
    const diff = val.value - holdValue;
    const planName = plan ? strat(plan.strategy === "range" ? "range" : plan.side === "buy" ? "buy" : "sell").name : "";
    setView(`
      <div class="mk-tokhead">
        <div>
          <p class="eyebrow">${h("ui.v.eyebrow", "Fly Maker vault")}</p>
          <h2 class="mk-sym">${tsy} / ${qs}${v.verified ? ` <span class="mk-badge">${h("ui.v.verified", "Fly Maker verified")}</span>` : ` <span class="mk-badge bad">${h("ui.v.unverified", "not from the Fly Maker factory")}</span>`}</h2>
          <p class="mk-muted">${link(addr, addr)} · ${h("ui.v.owner", "owner")} ${link(v.owner)} · ${h("ui.v.pool", "pool")} ${link(v.pool)}</p>
        </div>
        <span class="mk-status ${key}">${esc(STATUS[0])}</span>
      </div>
      <p class="mk-muted">${esc(STATUS[1])}${lastTrade ? " " + h("ui.v.last", "Last action: block {block}.", { block: lastTrade.at }) : ""}</p>
      <div class="mk-stats">
        <div class="card pad"><span class="k">${h("ui.v.value", "Value")}</span><span class="v">${fmt(val.value)} ${qs}</span><small>${fmt(val.tok)} ${tsy} + ${fmt(val.quo)} ${qs}</small></div>
        <div class="card pad"><span class="k">${h("ui.v.vsHold", "vs holding what you put in")}</span><span class="v ${diff < 0 ? "neg" : ""}">${holdValue ? (diff >= 0 ? "+" : "") + fmt(diff) + " " + qs : "–"}</span><small>${h("ui.v.vsHoldHint", "deposits valued at today's price")}</small></div>
        <div class="card pad"><span class="k">${h("ui.v.fees", "Fees paid")}</span><span class="v">${decimalOf(fees, v.q.decimals, 4)} ${qs}</span></div>
        <div class="card pad"><span class="k">${h("ui.v.allowance", "Trade allowance left")}</span><span class="v">${decimalOf(v.tradeLeft, v.q.decimals, 4)} ${qs}</span><small>${h("ui.v.lpLeft", "{n} liquidity actions", { n: v.lpLeft })}</small></div>
      </div>
      ${isOwner ? `<div class="card pad mk-owner" id="mk-owner"></div>` : ""}
      <div class="mk-builder">
        <div>
          <h3 class="mk-h">${h("ui.v.positions", "Positions")}</h3>
          ${v.positions.length ? v.positions.map((p) => `<div class="card pad mk-posn"><span>#${p.id}</span><span class="mk-chip ${p.inRange ? "in" : "out"}">${p.inRange ? h("ui.v.in", "in range") : h("ui.v.out", "out of range")}</span><span>${fmt(p.tok)} ${tsy} + ${fmt(p.quo)} ${qs}</span><span class="mk-muted mono">${h("ui.v.ticks", "ticks {lower}..{upper} (now {now})", { lower: p.lower, upper: p.upper, now: v.tick })}</span></div>`).join("") : `<p class="mk-muted">${h("ui.v.noPositions", "No open positions.")}</p>`}
          <h3 class="mk-h">${h("ui.v.check", "Price check")}</h3>
          <div class="card pad">${table([[L("ui.v.tickNow", "Pool tick now"), String(v.tick)],
            [L("ui.v.avg", "5-minute average"), v.twapTick == null ? L("ui.v.noHistory", "not enough history yet") : String(v.twapTick)],
            [L("ui.v.gap", "Allowed gap"), L("ui.v.gapV", "±{pct}% (~{ticks} ticks)", { pct: Number(v.g.maxDevBps) / 100, ticks: v.g.maxDevBps })],
            [L("ui.v.price", "Price"), L("ui.v.priceV", "{price} {quote} per {token}", { price: fmt(v.price, 5), quote: v.q.symbol, token: v.t.symbol })]])}</div>
          <h3 class="mk-h">${h("ui.v.activity", "Activity")}</h3>
          <div class="card pad mk-log">${evs.length ? evs.slice(-50).reverse().map((e) => `<div class="row"><span class="k">${e.at}</span><span class="v">${esc(e.text)} ${txLink(e.tx)}</span></div>`).join("") : `<p class="mk-muted">${h("ui.v.nothing", "Nothing yet.")}</p>`}</div>
        </div>
        <div>
          <div class="card pad mk-plan">
            <p class="eyebrow">${h("ui.v.activePlan", "Active plan")}</p>
            ${plan ? `<h3>${esc(planName)}</h3>${table(planRows(plan, v.q, v.t))}` : `<p class="mk-muted">${h("ui.v.noPlan", "No plan text found in the vault's events.")}</p>`}
            <h4>${h("ui.plan.guardrails", "On-chain guardrails")}</h4>${table(guardRows(v.g, v.q))}
            <h4>${h("ui.plan.hash", "Plan hash")}</h4><p class="mono mk-hash">${esc(v.planHash)}</p>
            ${planOk ? `<p class="mk-ok">${h("ui.v.hashOk", "✓ recomputed in your browser from the plan text the vault published.")}</p>` : `<p class="mk-msg err">${h("ui.v.hashBad", "✕ mismatch: the published plan text doesn't hash to the stored plan. Don't rely on this vault until its owner sets the plan again.")}</p>`}
            ${planEv && !planCanon ? `<p class="mk-warn">${h("ui.v.notCanonical", "The plan text isn't in the bot's canonical form; the bot won't run it.")}</p>` : ""}
            ${planEv ? `<details><summary>${h("ui.v.planText", "Plan text")}</summary><pre class="mk-pre">${esc(planEv.planText)}</pre></details>` : ""}
          </div>
        </div>
      </div>`);
    if (isOwner) renderOwner(v, plan, planEv);
  }

  function renderOwner(v, plan, planEv) {
    const box = $("mk-owner"), q = v.q, eth = same(q.address, WETH);
    box.innerHTML = `
      <p class="eyebrow">${h("ui.o.eyebrow", "Owner controls")}</p>
      <div class="mk-ctl">
        <button class="btn" id="o-pause">${v.paused ? h("ui.o.resume", "Resume") : h("ui.o.pause", "Pause")}</button>
        <span class="mk-row">${field("o-top", L("ui.o.topUp", "Top up ({quote})", { quote: eth ? "ETH" : q.symbol }), "", v.ownerFeeBps == null ? "" : L("ui.o.topUpHint", "Fee {pct}% (lower while you hold $FLYAI)", { pct: v.ownerFeeBps / 100 }))}<button class="btn" id="o-topbtn">${h("ui.o.topUpBtn", "Top up")}</button></span>
      </div>
      <details class="mk-adv"><summary>${h("ui.o.change", "Change the plan")}</summary>
        <p class="mk-small mk-muted">${h("ui.o.changeLede", "Paste a new plan text (canonical JSON, like the one below). The vault stores its hash and publishes it; nothing changes until you sign.")}</p>
        <textarea id="o-plan" class="mk-input mono" rows="4">${esc(planEv ? planEv.planText : "")}</textarea>
        <p class="mk-small" id="o-planhash"></p>
        <button class="btn" id="o-planbtn">${h("ui.o.commit", "Commit plan on-chain")}</button>
      </details>
      <details class="mk-adv"><summary>${h("ui.o.withdraw", "Withdraw")}</summary>
        <p class="mk-small">${h("ui.o.withdrawLede", "Closes at the current pool price, with no minimum price protection; pauses the vault and sends everything to {owner}. Works even if every fly.ai server is down. The fee already paid is not returned.", { owner: short(v.owner) })}</p>
        <label class="mk-check"><input type="radio" name="o-unwind" value="1" checked> ${h("ui.o.unwind", "Unwind positions (receive {token} and {quote})", { token: v.t.symbol, quote: q.symbol })}</label>
        <label class="mk-check"><input type="radio" name="o-unwind" value="0"> ${h("ui.o.nfts", "Receive the position NFTs untouched")}</label>
        <button class="btn red" id="o-wd">${h("ui.o.withdrawAll", "Withdraw everything")}</button>
      </details>
      <p class="mk-msg" id="o-msg" aria-live="polite"></p>`;
    const ctx = { vault: v.address, quote: v.quote, token: v.token };
    const run = async (fn) => {
      try { await fn(); msg("o-msg", L("ui.o.done", "Done."), "ok"); setTimeout(() => route(), 800); }
      catch (e) { msg("o-msg", errText(e), "err"); }
    };
    const st = (s) => msg("o-msg", s);
    $("o-pause").addEventListener("click", () => run(() => send({ to: v.address, data: enc.setPaused(!v.paused) }, ctx, st)));
    $("o-topbtn").addEventListener("click", () => run(async () => {
      const amt = units($("o-top").value, q.decimals);
      if (!amt) throw new Error(L("ui.o.amount", "enter an amount"));
      if (eth) return send({ to: v.address, data: enc.deposit("0x0000000000000000000000000000000000000000", 0n), value: "0x" + amt.toString(16) }, { ...ctx, amount: amt }, st);
      await send({ to: q.address, data: enc.approve(v.address, amt) }, { ...ctx, amount: amt }, st);
      return send({ to: v.address, data: enc.deposit(q.address, amt) }, ctx, st);
    }));
    const planInput = $("o-plan"), planHashEl = $("o-planhash");
    const showHash = () => {
      const t = planInput.value.trim();
      let note = "", good = false;
      try {
        const pp = parsePlan(t), errs = planErrors(pp.plan);
        if (!pp.canonical) note = L("ui.o.notCanonical", "✕ not canonical (sorted keys, no spaces): the bot won't run it");
        else if (errs.length) note = "✕ " + errs.join("; ");
        else { note = "✓ " + keccakText(t); good = true; }
      } catch (e) { note = L("ui.o.notJson", "✕ not valid JSON"); }
      planHashEl.textContent = note;
      planHashEl.className = "mk-small mono " + (good ? "mk-ok" : "mk-msg err");
    };
    planInput.addEventListener("input", showHash);
    showHash();
    $("o-planbtn").addEventListener("click", () => run(async () => {
      const t = planInput.value.trim(), pp = parsePlan(t);
      if (!pp.canonical || planErrors(pp.plan).length) throw new Error(L("ui.o.fixPlan", "fix the plan text first"));
      return send({ to: v.address, data: enc.setPlan(t) }, ctx, st);
    }));
    $("o-wd").addEventListener("click", () => run(() => {
      const unwind = document.querySelector('input[name="o-unwind"]:checked').value === "1";
      if (!confirm(L("ui.o.confirm", "Withdraw everything from this vault to {owner}?", { owner: v.owner }))) throw new Error(L("ui.err.cancelled", "Cancelled in the wallet."));
      return send({ to: v.address, data: enc.withdrawAll(unwind) }, ctx, st);
    }));
  }

  // ---- routing + refresh ----
  async function route() {
    try {
      const v = params.get("vault"), t = params.get("token");
      if (v && isAddr(v)) await viewVault(v);
      else if (t && isAddr(t)) await viewToken(t);
      else await viewHome();
    } catch (e) {
      console.error(e);
      setView(`<div class="card pad"><p class="mk-msg err">${esc(e.message || e)}</p><p><a href="maker.html">${h("ui.startOver", "← start over")}</a></p></div>`);
    }
  }

  async function init() {
    await i18nReady();                                    // the visitor's language first, then render once
    renderWalletBtn();
    const b = $("mk-wallet");
    if (b) b.addEventListener("click", async () => {
      try { await connect(); route(); } catch (e) { alert(errText(e)); }
    });
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((a) => { if (a && a[0]) { wallet = a[0]; renderWalletBtn(); if (!params.get("token")) route(); } }).catch(() => {});
      window.ethereum.on && window.ethereum.on("accountsChanged", (a) => { wallet = (a && a[0]) || null; renderWalletBtn(); if (!params.get("token")) route(); });
    }
    if (!FACTORY_ADDR) { const n = $("mk-notlive"); if (n) n.hidden = false; }
    route();
    // dashboards refresh every 2 minutes while visible; the builder never re-reads under the visitor's typing
    setInterval(() => { if (document.visibilityState === "visible" && params.get("vault")) route(); }, REFRESH_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
