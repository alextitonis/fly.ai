'use strict';
/* live: the glue between a command and the wallet. resolves the key once, builds the trader, asks before money moves. */
const { resolveWallet, confirmWord } = require('./wallet');
const { makeTrader, fmtEth, fmtTok, toWei, short } = require('./trade');
const { formatEther } = require('./deps');

/* the wallet for this run: null when there is none, ctx.trader is built either way so reads still work */
async function attachWallet(ctx, opts) {
  opts = opts || {};
  const { env, log } = ctx;
  let w = null;
  try { w = await resolveWallet(env, { noPrompt: !!opts.noPrompt }); }
  catch (e) { if (opts.need) throw e; log.warn('wallet: ' + e.message); }
  if (w && w.locked) { if (opts.need) throw new Error('the keystore is locked: run in a terminal to type the passphrase, or set LOXLEY_PASSPHRASE'); ctx.walletAddress = w.address; ctx.walletLocked = true; ctx.walletSource = w.source; w = null; }
  if (!w && opts.need) { const e = new Error('no wallet. loxley wallet import (a private key or a seed phrase, encrypted on disk), or PRIVATE_KEY= / MNEMONIC= in .env'); e.code = 'NOWALLET'; throw e; }
  if (w) { ctx.walletAddress = w.address; ctx.walletLocked = false; ctx.walletSource = w.source; }
  ctx.wallet = w; ctx.trader = makeTrader(ctx, w);
  return w;
}

/* the arm: --yes skips it, a pipe without --yes refuses, a terminal asks for the word */
async function arm(ctx, lines, word) {
  const { ui, log, flags } = ctx, C = ui.C;
  (lines || []).forEach(l => log.raw(l));
  if (flags.yes) { log.raw(C.dim('  --yes given, no prompt')); return true; }
  if (!process.stdin.isTTY) { log.error('this is not a terminal, and money would move: add --yes to confirm without a prompt'); return false; }
  const ok = await confirmWord(C.amber('  type ' + word + ' to continue, anything else aborts: '), word);
  if (!ok) log.dim('aborted, nothing sent');
  return ok;
}

function parseEth(s) {
  const v = parseFloat(String(s));
  if (!(v > 0)) throw new Error('amount must be a positive number of ETH, got ' + JSON.stringify(s));
  return toWei(String(v));
}
/* "all", "half", "25%", "1000000" tokens, "1.5m", "2k": a token amount against a balance */
function parseTokens(s, balance, decimals) {
  const t = String(s == null ? 'all' : s).trim().toLowerCase();
  if (t === 'all' || t === 'max') return balance;
  if (t === 'half') return balance / 2n;
  if (/^\d+(\.\d+)?%$/.test(t)) { const pct = parseFloat(t); if (!(pct > 0 && pct <= 100)) throw new Error('percent must be within 0 and 100'); return balance * BigInt(Math.round(pct * 100)) / 10000n; }
  const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?$/); if (!m) throw new Error('amount: all, half, 25%, 1000000, 1.5m or 2k');
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : m[2] === 'b' ? 1e9 : 1;
  const dec = decimals == null ? 18 : decimals;
  const v = BigInt(Math.round(parseFloat(m[1]) * mult * 1e6)) * (10n ** BigInt(dec)) / 1000000n;
  if (v > balance) throw new Error('that is more than the wallet holds (' + fmtTok(balance, dec) + ')');
  return v;
}

const explorerTx = (env, h) => env.EXPLORER_URL + '/tx/' + h;
const ethNum = wei => Number(formatEther(BigInt(wei)));
const big = v => (v == null ? 0n : BigInt(v));

/* ---------- the book: one position per fill, exits taken against it ---------- */
function openPosition(ctx, r, meta) {
  const ethIn = r.venue === 'curve' ? r.quoteIn : (meta.ethWei || 0n), tokens = r.venue === 'curve' ? r.tokensOut : r.amountOut;
  return ctx.trader.book.open({ token: meta.token.toLowerCase(), symbol: meta.symbol || null, curve: meta.curve || null, decimals: meta.decimals == null ? 18 : meta.decimals, source: meta.source || 'buy', entry: { ethWei: ethIn.toString(), tokensWei: tokens.toString(), tx: r.hash, at: new Date().toISOString(), taxBps: meta.taxBps == null ? null : meta.taxBps, venue: r.venue, gasWei: (r.gasWei || 0n).toString(), block: r.block || null, price: tokens > 0n ? Number(ethIn) / Number(tokens) : null }, remainingWei: tokens.toString(), exits: [], realisedWei: '0', peakPnl: 0 });
}
/* an exit is spread over the open positions of that token, oldest first */
function applyExit(ctx, token, tokensWei, ethWei, hash, why, venue) {
  const book = ctx.trader.book, list = book.byToken(token).sort((a, b) => a.openedAt < b.openedAt ? -1 : 1);
  let left = big(tokensWei); const touched = [];
  for (const p of list) {
    if (left <= 0n) break;
    const rem = big(p.remainingWei), take = rem < left ? rem : left;
    const share = big(tokensWei) > 0n ? big(ethWei) * take / big(tokensWei) : 0n;
    const exits = (p.exits || []).concat([{ at: new Date().toISOString(), tokensWei: take.toString(), ethWei: share.toString(), tx: hash, why: why || 'sell', venue }]);
    const remaining = rem - take, realised = big(p.realisedWei) + share;
    const patch = { exits, remainingWei: remaining.toString(), realisedWei: realised.toString() };
    if (remaining <= 0n) { patch.status = 'closed'; patch.closedAt = new Date().toISOString(); patch.why = why || 'sell'; patch.pnlPct = big(p.entry.ethWei) > 0n ? (Number(realised) / Number(big(p.entry.ethWei)) - 1) * 100 : null; }
    book.update(p.id, patch); touched.push(Object.assign({}, p, patch)); left -= take;
  }
  return touched;
}
/* live marks: what the remaining tokens fetch now, by phase */
async function markPosition(ctx, p) {
  const rem = big(p.remainingWei); if (rem <= 0n) return { venue: 'closed', ethOut: 0n };
  const q = await ctx.trader.exitQuote(p.token, rem, ctx.trader.address);
  if (!q) return { venue: 'unknown', ethOut: null };
  const ethIn = big(p.entry.ethWei), realised = big(p.realisedWei);
  const total = q.ethOut == null ? null : realised + q.ethOut;
  return Object.assign(q, { pnlPct: total == null || ethIn <= 0n ? null : (Number(total) / Number(ethIn) - 1) * 100, markEth: q.ethOut, totalEth: total });
}

module.exports = { attachWallet, arm, parseEth, parseTokens, explorerTx, ethNum, big, openPosition, applyExit, markPosition, fmtEth, fmtTok, toWei, short };
