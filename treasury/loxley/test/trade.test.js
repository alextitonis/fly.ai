'use strict';
/* the signing side, end to end against the mock chain: the keystore, the curve maths, buy and sell on the
   curve and in the pool, the book, the live sniper, the guard, the arm, and the halted phase. node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const mock = require('./mock-chain');
const trade = require('../cli/trade');
const W = require('../cli/wallet');

const BIN = path.resolve(__dirname, '..', 'bin', 'loxley.js');
const PK = '0x' + '11'.repeat(32), ADDR = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';
const FRESH = '0x3333333333333333333333333333333333333333';
let M, HOME;
test.before(async () => { M = await mock.start(); HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-trade-')); });
test.after(async () => { if (M) await M.close(); });

function run(args, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, M.env, { NO_COLOR: '1', HTTP_TIMEOUT_MS: '4000', RPC_SPACING_MS: '5', RPC_LOGS_SPACING_MS: '5', POLL_MS: '300', LOXLEY_HOME: HOME, LOXLEY_PASSPHRASE: 'correct horse battery staple', MARK_EVERY_S: '2' }, opts.env || {});
    delete env.PRIVATE_KEY; delete env.MNEMONIC;
    if (opts.env && opts.env.PRIVATE_KEY) env.PRIVATE_KEY = opts.env.PRIVATE_KEY;
    const p = spawn(process.execPath, [BIN].concat(args, ['--no-logo']), { env, cwd: path.resolve(__dirname, '..') });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    const t = setTimeout(() => p.kill('SIGINT'), opts.timeout || 30000);
    p.on('exit', code => { clearTimeout(t); resolve({ code, out, err, all: out + err }); });
  });
}

test('curve maths: quoteBuy and quoteSell are integer and round trip below the fees', () => {
  const s = { quoteReserve: 1700000000000000000n, tokenReserve: 820000000000000000000000000n, sellableTokens: 656000000000000000000000000n, feeBps: 100n, creatorTaxBps: 100n };
  const q = trade.quoteBuy(s, 10000000000000000n, 0);
  assert.equal(typeof q.tokensOut, 'bigint');
  assert.ok(q.tokensOut > 4600000000000000000000000n && q.tokensOut < 4750000000000000000000000n, String(q.tokensOut));
  assert.equal(q.fee, 100000000000000n); assert.equal(q.tax, 100000000000000n); assert.equal(q.refund, 0n);
  const taxed = trade.quoteBuy(s, 10000000000000000n, 9900);
  assert.ok(taxed.tokensOut < q.tokensOut / 50n, 'a 99% opening tax leaves almost nothing');
  const after = { quoteReserve: s.quoteReserve + q.net, tokenReserve: s.tokenReserve - q.tokensOut, feeBps: 100n, creatorTaxBps: 100n };
  const back = trade.quoteSell(after, q.tokensOut);
  assert.ok(back.quoteOut < 10000000000000000n && back.quoteOut > 9500000000000000n, String(back.quoteOut));
  assert.equal(trade.minOutFromRate(10000n, 300), 9700n);
  const capped = trade.quoteBuy(Object.assign({}, s, { sellableTokens: 1000000000000000000000n }), 10000000000000000n, 0);
  assert.ok(capped.capped && capped.refund > 0n && capped.tokensOut === 1000000000000000000000n);
});

test('v4 encoding: the pool key sorts currencies, the id is stable, both layouts decode', () => {
  const { decodeAbiParameters } = require('../cli/deps');
  const k = trade.poolKeyFor('0x1111111111111111111111111111111111111111', trade.ZERO, 200, '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044', 0);
  assert.equal(k.currency0, trade.ZERO); assert.equal(k.currency1, '0x1111111111111111111111111111111111111111');
  assert.equal(trade.poolIdOf(k), trade.poolIdOf(Object.assign({}, k)));
  const enc = trade.encodeV4Swap(k, true, 1000n, 900n, 'current');
  assert.equal(enc.commands, '0x10'); assert.equal(enc.value, 1000n); assert.equal(enc.cIn, trade.ZERO);
  const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], enc.inputs[0]);
  assert.equal(actions, '0x060c0f'); assert.equal(params.length, 3);
  const legacy = trade.encodeV4Swap(k, false, 5n, 1n, 'legacy');
  assert.equal(legacy.value, 0n); assert.equal(legacy.cIn, k.currency1);
});

test('keystore: import from the environment, show, wrong passphrase, forget', async () => {
  const r = await run(['wallet', 'import', '--from-env'], { env: { PRIVATE_KEY: PK } });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes(ADDR) && r.out.includes('keystore written'));
  const ks = JSON.parse(fs.readFileSync(path.join(HOME, 'wallet.json'), 'utf8'));
  assert.equal(ks.kind, 'keystore'); assert.equal(ks.cipher.name, 'aes-256-gcm'); assert.ok(!JSON.stringify(ks).includes(PK.slice(2)));
  assert.throws(() => W.unlockKeystore({ LOXLEY_HOME: HOME }, ks, 'nope'), /wrong passphrase/);
  const show = await run(['wallet']);
  assert.equal(show.code, 0, show.all);
  assert.ok(show.out.includes('keystore') && show.out.includes('1.00000 ETH'));
  const again = await run(['wallet', 'import', '--from-env'], { env: { PRIVATE_KEY: PK } });
  assert.equal(again.code, 1); assert.ok(again.all.includes('already exists'));
  const locked = await run(['buy', FRESH, '0.001', '--yes'], { env: { LOXLEY_PASSPHRASE: '' } });
  assert.equal(locked.code, 1); assert.ok(locked.all.includes('locked'));
});

test('buy on the curve: dry run signs nothing, the real one fills, the book opens a position', async () => {
  const sentBefore = M.state.sent.length;
  const dry = await run(['buy', FRESH, '0.01', '--dry']);
  assert.equal(dry.code, 0, dry.all);
  assert.ok(dry.out.includes('DRY') && dry.out.includes('you get') && dry.out.includes('exact, getReserves()'));
  assert.equal(M.state.sent.length, sentBefore);
  const noYes = await run(['buy', FRESH, '0.01']);
  assert.equal(noYes.code, 3); assert.ok(noYes.all.includes('--yes')); assert.equal(M.state.sent.length, sentBefore);
  const r = await run(['buy', FRESH, '0.01', '--yes']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('FILLED') && r.out.includes('/tx/0x') && r.out.includes('position  p1'));
  assert.equal(M.state.sent.length, sentBefore + 1); assert.equal(M.state.sent[sentBefore].fn, 'buy');
  assert.ok(M.tokenBalance(FRESH, ADDR) > 0n);
  const book = JSON.parse(fs.readFileSync(path.join(HOME, 'positions.json'), 'utf8'));
  assert.equal(book.positions.length, 1); assert.equal(book.positions[0].status, 'open'); assert.equal(book.positions[0].entry.venue, 'curve');
});

test('positions marks the open fill, sell half is partial, sell all closes it', async () => {
  const pos = await run(['positions', '--json']);
  assert.equal(pos.code, 0, pos.all);
  const j = JSON.parse(pos.out.trim().split('\n').pop());
  assert.equal(j.open.length, 1); assert.equal(j.open[0].venue, 'curve'); assert.ok(j.open[0].pnlPct < 0 && j.open[0].pnlPct > -10);
  const half = await run(['sell', FRESH, 'half', '--yes']);
  assert.equal(half.code, 0, half.all);
  assert.ok(half.out.includes('SOLD') && half.out.includes('partial') && half.out.includes('approval'));
  const all = await run(['sell', FRESH, 'all', '--yes']);
  assert.equal(all.code, 0, all.all);
  assert.ok(all.out.includes('CLOSED'));
  assert.equal(M.tokenBalance(FRESH, ADDR), 0n);
  const book = JSON.parse(fs.readFileSync(path.join(HOME, 'positions.json'), 'utf8'));
  assert.equal(book.positions[0].status, 'closed'); assert.equal(book.positions[0].exits.length, 2);
  const empty = await run(['sell', FRESH, 'all', '--yes']);
  assert.equal(empty.code, 1); assert.ok(empty.all.includes('holds no'));
});

test('pool leg: buy and sell a graduated token through the router, permit2 approvals happen once', async () => {
  const b = await run(['buy', M.TOKEN, '0.02', '--yes']);
  assert.equal(b.code, 0, b.all);
  assert.ok(b.out.includes('FILLED') && b.out.includes('on the pool'));
  const s1 = await run(['sell', M.TOKEN, '50%', '--yes']);
  assert.equal(s1.code, 0, s1.all);
  assert.ok(s1.out.includes('on the pool') && s1.out.includes('2 approvals'));
  const s2 = await run(['sell', M.TOKEN, 'all', '--yes']);
  assert.equal(s2.code, 0, s2.all);
  assert.ok(s2.out.includes('CLOSED') && !s2.out.includes('approval'));
  const st = JSON.parse(fs.readFileSync(path.join(HOME, 'state.json'), 'utf8'));
  assert.equal(st.routerLayout, 'current'); assert.ok(st.poolKeys[M.TOKEN]);
});

test('router layout: a legacy router is detected on the first simulate and remembered', async () => {
  const L = await mock.start({ routerLayout: 'legacy' });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-legacy-'));
  try {
    const env = Object.assign({}, L.env, { LOXLEY_HOME: home, PRIVATE_KEY: PK });
    const b = await run(['buy', L.TOKEN, '0.01', '--yes'], { env });
    assert.equal(b.code, 0, b.all);
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'state.json'), 'utf8')).routerLayout, 'legacy');
  } finally { await L.close(); }
});

test('snipe --live: fires a signed curve buy on a fresh launch, marks it, sells it when the session ends', async () => {
  const sentBefore = M.state.sent.length;
  const t = setTimeout(() => M.launchNow('LIVE1', { decayMs: 600, deployer: '0x' + 'a1'.repeat(20) }), 2500);
  const r = await run(['snipe', '--live', '--yes', '--eth', '0.002', '--min-score', '0', '--for', '12', '--exit-on-stop'], { timeout: 40000 });
  clearTimeout(t);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('LIVE') && r.out.includes('FIRE') && r.out.includes('$LIVE1'), r.out);
  assert.ok(r.out.includes('CLOSED') && r.out.includes('session end'));
  const fns = M.state.sent.slice(sentBefore).map(x => x.fn);
  assert.deepEqual(fns, ['buy', 'approve', 'sell']);
  assert.ok(/signed\s+1 buys, 1 sells/.test(r.out));
});

test('halted: after the sweep nothing sells, the sniper waits, the pool opens and it leaves', async () => {
  const e = M.launchNow('SWEEP1', { decayMs: 0 });
  const b = await run(['buy', e.token, '0.003', '--yes']);
  assert.equal(b.code, 0, b.all);
  M.sweep(e.token);
  const s = await run(['sell', e.token, 'all', '--yes']);
  assert.equal(s.code, 2); assert.ok(s.all.includes('halted') || s.all.includes('cannot sell now'));
  const pos = await run(['positions']);
  assert.ok(pos.out.includes('halted'));
  M.graduate(e.token);   /* the mock opens a v4 pool for the token: the halted position can leave through it */
  const after = await run(['sell', e.token, 'all', '--yes']);
  assert.equal(after.code, 0, after.all);
  assert.ok(after.all.includes('in the pool') || after.all.includes('pool'), after.all);
  assert.equal(M.tokenBalance(e.token, ADDR), 0n);
  const fns = M.state.sent.slice(-2).map(x => x.fn);
  assert.deepEqual(fns.slice(-1), ['execute']);
});

test('watch --guard: sells the whole holding when its rule trips', async () => {
  const b = await run(['buy', M.TOKEN, '0.01', '--yes']);
  assert.equal(b.code, 0, b.all);
  const r = await run(['watch', M.TOKEN, '--guard', '--tp', '-5', '--yes', '--every', '2', '--for', '12'], { timeout: 30000 });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('GUARD') && r.out.includes('SOLD') && r.out.includes('pulled the trigger'), r.out);
  assert.equal(M.tokenBalance(M.TOKEN, ADDR), 0n);
});

test('forget removes the keystore and the trading commands refuse without a wallet', async () => {
  const no = await run(['wallet', 'forget']);
  assert.equal(no.code, 1); assert.ok(no.all.includes('--yes'));
  const r = await run(['wallet', 'forget', '--yes']);
  assert.equal(r.code, 0, r.all);
  assert.ok(!fs.existsSync(path.join(HOME, 'wallet.json')));
  const b = await run(['buy', FRESH, '0.001', '--yes']);
  assert.equal(b.code, 1); assert.ok(b.all.includes('no wallet'));
  const show = await run(['wallet']);
  assert.equal(show.code, 0); assert.ok(show.out.includes('none'));
});
