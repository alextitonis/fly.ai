/**
 * Paying for $FLYAI from Solana in the swap box (2026-10-30, flytrade/SOLANA-PLAN.md part A). Loaded by buy.js only when
 * someone picks Solana, so normal page loads stay light. No library: a Relay order is a short list of instructions plus
 * one lookup table, and everything here is checked by a simulation before the wallet is asked to sign.
 *
 * Relay's answer can't be read like an EVM transaction (relayCheck in buy.js), so a Solana order gets its own checks:
 *  - the quote says what was asked: this payer, this recipient, $FLYAI on Robinhood Chain, this amount
 *  - only Relay's depository (matched against GET /chains) and harmless helper programs run, and only the payer signs
 *  - a simulation on a public RPC: it succeeds, and the wallet loses no more than the amount paid (plus fees in SOL)
 *
 * Wallets are found through the Wallet Standard (Phantom, Solflare, Backpack, ...), which takes the transaction as bytes.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const NATIVE_MINT = "11111111111111111111111111111111";            // how Relay names SOL
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const FEE_ROOM = 10_000_000n;                                      // 0.01 SOL: network fee + account rent, at the most
const MAX_TX = 1232;
const STD_CHAIN = "solana:mainnet";
export const MIN_GAS = 2_000_000n;                                 // 0.002 SOL: under this a payment can't pay its fee
// public endpoints that answer browsers, checked 10-30 (the RPC cost rules: no paid key for a page view). Solana's own
// api.mainnet-beta refuses browsers (403), publicnode has no getTokenAccountsByOwner (so tokenAccounts derives the address)
const RPCS = ["https://solana-rpc.publicnode.com", "https://public.rpc.solanavibestation.com"];
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const ED_P = 2n ** 255n - 19n, ED_D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

export function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("not base58");
    n = n * 58n + BigInt(i);
  }
  const out = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; out.unshift(0); }
  return Uint8Array.from(out);
}

export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

const hexBytes = (h) => Uint8Array.from((String(h).replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function rpc(method, params) {
  let last = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message || "RPC error");
      return d.result;
    } catch (e) { last = e; }
  }
  throw last || new Error("no Solana RPC");
}

/** A wallet's SOL (mint null) or token balance, in base units. */
export async function balance(owner, mint) {
  if (!mint || mint === NATIVE_MINT) return BigInt((await rpc("getBalance", [owner, { commitment: "confirmed" }])).value);
  return (await tokenAccounts(owner, mint)).reduce((sum, a) => sum + a.amount, 0n);
}

function powMod(b, e, m) {
  let r = 1n;
  for (b %= m; e > 0n; e >>= 1n, b = b * b % m) if (e & 1n) r = r * b % m;
  return r;
}

/** Is this 32-byte value a point on the ed25519 curve? (A derived address must not be: no key can exist for it.) */
function onCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  if (y >= ED_P) return false;
  const y2 = y * y % ED_P, u = (y2 - 1n + ED_P) % ED_P, v = (ED_D * y2 + 1n) % ED_P;
  const x2 = u * powMod(v, ED_P - 2n, ED_P) % ED_P;
  return x2 === 0n || powMod(x2, (ED_P - 1n) / 2n, ED_P) === 1n;
}

/** The wallet's associated token account for a mint (the address every wallet and Relay use). */
export async function tokenAddress(owner, mint) {
  const seeds = [owner, TOKEN_PROGRAM, mint].flatMap((a) => [...b58decode(a)]);
  const tail = [...b58decode(ATA_PROGRAM), ...new TextEncoder().encode("ProgramDerivedAddress")];
  for (let bump = 255; bump >= 0; bump--) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from([...seeds, bump, ...tail])));
    if (!onCurve(h)) return b58encode(h);
  }
  throw new Error("no token address");
}

async function tokenAccounts(owner, mint) {
  const address = await tokenAddress(owner, mint);
  const r = await rpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  return [{ address, amount: r.value ? amountOf(fromB64(r.value.data[0])) : 0n }];
}

const amountOf = (raw) => new DataView(raw.buffer, raw.byteOffset).getBigUint64(64, true);   // a token account's balance

// ---- the wallets in this browser (Wallet Standard) ----
export function wallets() {
  const found = [];
  const api = { register: (...w) => { found.push(...w); return () => {}; } };
  const hear = (e) => e.detail(api);
  window.addEventListener("wallet-standard:register-wallet", hear);
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
  window.removeEventListener("wallet-standard:register-wallet", hear);
  const seen = new Set();
  return found.filter((w) => {
    if (seen.has(w.name)) return false;
    seen.add(w.name);
    return (w.chains || []).includes(STD_CHAIN) && w.features["standard:connect"] && w.features["solana:signAndSendTransaction"];
  });
}

/** Connect a wallet (silent: only if this site is already allowed). Returns its account, or null. */
export async function connect(wallet, silent) {
  const r = await wallet.features["standard:connect"].connect(silent ? { silent: true } : undefined);
  return ((r && r.accounts) || wallet.accounts || []).find((a) => (a.chains || [STD_CHAIN]).includes(STD_CHAIN)) || null;
}

/** The wallet signs and sends; returns the signature (base58). */
export async function send(wallet, account, tx) {
  const [r] = await wallet.features["solana:signAndSendTransaction"].signAndSendTransaction({ account, transaction: tx, chain: STD_CHAIN });
  return b58encode(r.signature);
}

/** Waits for the transaction: throws if it failed on chain, false if it is still unseen after a minute. */
export async function landed(signature) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc("getSignatureStatuses", [[signature]]).catch(() => null);
    const s = r && r.value && r.value[0];
    if (s && s.err) throw new Error("the transaction failed");
    if (s && s.confirmationStatus && s.confirmationStatus !== "processed") return true;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return false;
}

// ---- the checks ----
let depository = null;
async function relayDepository() {
  if (depository) return depository;
  const r = await fetch("https://api.relay.link/chains");
  const c = ((await r.json()).chains || []).find((x) => x.vmType === "svm" && Number(x.id) === 792703809);
  depository = c && c.protocol && c.protocol.v2 && c.protocol.v2.depository;
  if (!depository) throw new Error("Relay does not list its Solana program");
  return depository;
}

/** The quote's one Solana transaction ({instructions, addressLookupTableAddresses}), checked; or an error. */
export async function checkOrder(q, want) {
  const d = q.details || {}, inn = d.currencyIn || {}, out = d.currencyOut || {};
  if (d.sender !== want.user) throw new Error("the order pays from another wallet");
  if (String(d.recipient || "").toLowerCase() !== want.recipient.toLowerCase()) throw new Error("the order delivers to another address");
  if (String((out.currency || {}).address || "").toLowerCase() !== want.tokenOut.toLowerCase() || Number((out.currency || {}).chainId) !== want.chainOut) {
    throw new Error("the order delivers another token");
  }
  if (BigInt(inn.amount || 0) > want.amount) throw new Error("the order takes more than you pay");
  const items = (q.steps || []).flatMap((s) => {
    if (s.kind !== "transaction") throw new Error("unexpected step: " + s.kind);
    return s.items || [];
  });
  if (items.length !== 1) throw new Error("expected one Solana transaction");
  const data = items[0].data || {}, ok = new Set([await relayDepository(), COMPUTE_BUDGET, MEMO]);
  if (!(data.instructions || []).length) throw new Error("no instructions");
  for (const ix of data.instructions) {
    if (!ok.has(ix.programId)) throw new Error("a call to " + ix.programId + ", not Relay's program");
    for (const k of ix.keys || []) if (k.isSigner && k.pubkey !== want.user) throw new Error("another signer: " + k.pubkey);
  }
  return data;
}

async function lookupTable(address) {
  const r = await rpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  if (!r.value) throw new Error("no lookup table " + address);
  const raw = fromB64(r.value.data[0]), keys = [];
  for (let i = 56; i + 32 <= raw.length; i += 32) keys.push(b58encode(raw.slice(i, i + 32)));   // (56: the table's header)
  return { address, keys };
}

function compactU16(n) {
  const out = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if (!n) { out.push(b); return out; }
    out.push(b | 0x80);
  }
}

/** A version 0 transaction with an empty signature slot for the wallet to fill. */
export function compile(payer, blockhash, instructions, tables) {
  const metas = new Map([[payer, { signer: true, writable: true, invoked: false }]]);
  const meta = (a) => metas.get(a) || metas.set(a, { signer: false, writable: false, invoked: false }).get(a);
  for (const ix of instructions) {
    meta(ix.programId).invoked = true;
    for (const k of ix.keys) {
      const m = meta(k.pubkey);
      m.signer = m.signer || !!k.isSigner;
      m.writable = m.writable || !!k.isWritable;
    }
  }
  // what a table holds is named by its place there (signers and the programs called must stay in the message itself)
  const lookups = tables.map((t) => ({ table: t.address, w: [], r: [], wKeys: [], rKeys: [] }));
  for (const [a, m] of metas) {
    if (m.signer || m.invoked) continue;
    tables.some((t, ti) => {
      const i = t.keys.indexOf(a);
      if (i < 0) return false;
      const l = lookups[ti];
      if (m.writable) { l.w.push(i); l.wKeys.push(a); } else { l.r.push(i); l.rKeys.push(a); }
      m.looked = true;
      return true;
    });
  }
  const statics = [...metas].filter(([, m]) => !m.looked);
  const group = (s, w) => statics.filter(([, m]) => m.signer === s && m.writable === w).map(([a]) => a);
  const sw = group(true, true), sr = group(true, false), nw = group(false, true), nr = group(false, false);
  const keys = [...sw, ...sr, ...nw, ...nr];
  const order = [...keys, ...lookups.flatMap((l) => l.wKeys), ...lookups.flatMap((l) => l.rKeys)];
  const index = new Map(order.map((a, i) => [a, i]));
  const used = lookups.filter((l) => l.w.length || l.r.length);
  const msg = [0x80, sw.length + sr.length, sr.length, nr.length, ...compactU16(keys.length)];
  for (const a of keys) msg.push(...b58decode(a));
  msg.push(...b58decode(blockhash), ...compactU16(instructions.length));
  for (const ix of instructions) {
    const data = hexBytes(ix.data);
    msg.push(index.get(ix.programId), ...compactU16(ix.keys.length), ...ix.keys.map((k) => index.get(k.pubkey)),
      ...compactU16(data.length), ...data);
  }
  msg.push(...compactU16(used.length));
  for (const l of used) {
    msg.push(...b58decode(l.table), ...compactU16(l.w.length), ...l.w, ...compactU16(l.r.length), ...l.r);
  }
  const tx = Uint8Array.from([1, ...new Array(64).fill(0), ...msg]);
  if (tx.length > MAX_TX) throw new Error("the transaction is too big");
  return tx;
}

/** Runs the transaction without sending it: it must succeed and take no more than the amount paid (fees aside). */
export async function simulate(tx, want) {
  const paysSol = want.tokenIn === NATIVE_MINT;
  const accounts = paysSol ? [] : await tokenAccounts(want.user, want.tokenIn);
  const addresses = [want.user, ...accounts.map((a) => a.address)];
  const lamports = await balance(want.user);
  const r = await rpc("simulateTransaction", [toB64(tx), { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true,
    commitment: "confirmed", accounts: { encoding: "base64", addresses } }]);
  const v = r.value;
  if (v.err) throw new Error("the simulation failed: " + JSON.stringify(v.err).slice(0, 120));
  const after = v.accounts || [];
  const solLost = lamports - BigInt((after[0] || {}).lamports || 0);
  if (solLost > (paysSol ? want.amount : 0n) + FEE_ROOM) throw new Error("the simulation took too much SOL");
  if (!paysSol) {
    let lost = 0n;
    accounts.forEach((a, i) => {
      const raw = after[i + 1] && after[i + 1].data ? fromB64(after[i + 1].data[0]) : new Uint8Array(72);
      lost += a.amount - amountOf(raw);
    });
    if (lost > want.amount) throw new Error("the simulation took too much");
  }
  return v;
}

/** Everything before the signature: the order checked, built on a fresh blockhash, and simulated. */
export async function prepare(q, want) {
  const data = await checkOrder(q, want);
  const [tables, latest] = await Promise.all([
    Promise.all((data.addressLookupTableAddresses || []).map(lookupTable)),
    rpc("getLatestBlockhash", [{ commitment: "confirmed" }]),
  ]);
  const tx = compile(want.user, latest.value.blockhash, data.instructions, tables);
  await simulate(tx, want);
  return tx;
}
