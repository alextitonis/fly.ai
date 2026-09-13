'use strict';
/* the 1.3 reads and triggers, end to end against the mock chain: socials and the declared bundle on the card,
   the launch-farm fingerprint, follow (mirroring a wallet), snipe --grad, the dev-sold siren in the guard and in the
   sniper, fees, dev, claim, and the alerts. node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const mock = require('./mock-chain');
const E = require('../cli/engine');

const BIN = path.resolve(__dirname, '..', 'bin', 'loxley.js');
const PK = '0x' + '22'.repeat(32), ADDR = '0x1563915e194D8CfBA1943570603F7606A3115508';
let M, HOME;
test.before(async () => { M = await mock.start(); HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-market-')); });
test.after(async () => { if (M) await M.close(); });

function run(args, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, M.env, { NO_COLOR: '1', HTTP_TIMEOUT_MS: '4000', RPC_SPACING_MS: '5', RPC_LOGS_SPACING_MS: '5', POLL_MS: '300', LOXLEY_HOME: HOME, PRIVATE_KEY: PK, MARK_EVERY_S: '2', TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '7', TELEGRAM_API: M.url }, opts.env || {});
    const p = spawn(process.execPath, [BIN].concat(args, ['--no-logo']), { env, cwd: path.resolve(__dirname, '..') });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    const t = setTimeout(() => p.kill('SIGINT'), opts.timeout || 30000);
    p.on('exit', code => { clearTimeout(t); resolve({ code, out, err, all: out + err }); });
  });
}
const later = (ms, fn) => setTimeout(fn, ms);

test('score: socials, the declared bundle, the farm and the block-0 bundle move the number and name the reason', () => {
  const clean = { devShare: 3, creatorTaxBps: 100, pairIsEth: true, socials: { count: 2, socials: { twitter: 'x', website: 'w' } }, exempt: [], record: { launches: 1, grads: 0, twins: 0 } };
  assert.equal(E.launchScore(clean).total, 100);
  const bundled = Object.assign({}, clean, { exempt: ['0xa', '0xb', '0xc'] });
  const b = E.launchScore(bundled); assert.ok(b.total < 80 && b.parts.some(p => p.k === 'bundle' && p.v === -25));
  const farm = Object.assign({}, clean, { farm: 3 }); assert.ok(E.launchScore(farm).parts.some(p => p.k === 'farm' && p.v === -25));
  const nosoc = Object.assign({}, clean, { socials: { count: 0, socials: {} } }); assert.ok(E.launchScore(nosoc).parts.some(p => p.k === 'socials' && p.v === -15));
  const blk = Object.assign({}, clean, { bundlePct: 14.2, bundleWallets: 4 }); assert.ok(E.launchScore(blk, { maxBundlePct: 8 }).parts.some(p => p.k === 'block-0' && p.v === -20));
  const rules = { minScore: 0, ethPairsOnly: true, maxDevShare: 8, maxCreatorTax: 3, maxTwins: 1, maxExempt: 0, maxBundlePct: 8, requireSocials: true, refuseFarms: true, open: 0, maxOpen: 3 };
  const why = E.refusals(Object.assign({ score: { total: 90 } }, bundled, { farm: 2, bundlePct: 12, socials: { count: 0 } }), rules);
  assert.ok(why.some(w => /exempt/.test(w)) && why.some(w => /block-0/.test(w)) && why.some(w => /no socials/.test(w)) && why.some(w => /farm/.test(w)), why.join(' | '));
  /* the fingerprint: same dev buy to the wei, same tax, same links, other wallets, inside 30 minutes */
  const now = Date.now();
  const recent = [{ deployer: '0xa', devQuoteWei: '30000000000000000', creatorTaxBps: 100, socials: { socials: {} }, readAt: now - 60000 }, { deployer: '0xb', devQuoteWei: '30000000000000000', creatorTaxBps: 100, socials: { socials: {} }, readAt: now - 120000 }, { deployer: '0xc', devQuoteWei: '30000000000000000', creatorTaxBps: 100, socials: { socials: {} }, readAt: now - 3600000 * 2 }];
  assert.equal(E.farmOf({ deployer: '0xd', devQuoteWei: '30000000000000000', creatorTaxBps: 100, socials: { socials: {} } }, recent, now), 2);
  assert.equal(E.farmOf({ deployer: '0xd', devQuoteWei: '30000000000000001', creatorTaxBps: 100, socials: { socials: {} } }, recent, now), 0);
});

test('hunt: the card carries socials, the fee recipient, the declared bundle and the read time; --json has the fields', async () => {
  const r = await run(['hunt', '--for', '2', '--no-follow']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('socials x web') && r.out.includes('exempt wallets 3 declared') && r.out.includes('fees → deployer') && /read in \d+ ms/.test(r.out), r.out);
  assert.ok(r.out.includes('no declared bundle wallets') && r.out.includes('creator earns on volume'));
  const j = await run(['hunt', '--for', '2', '--no-follow', '--json']);
  const lines = j.out.trim().split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  assert.ok(lines.length >= 2);
  const withBundle = lines.find(l => l.exempt && l.exempt.length === 3);
  assert.ok(withBundle && withBundle.socials && typeof withBundle.readMs === 'number' && withBundle.feeRecipient, JSON.stringify(lines[0]));
});

test('follow: a tracked wallet buys on a curve, the desk mirrors it on paper and says whose buy it was', async () => {
  const W = '0x' + 'ab'.repeat(20);
  let tok = null;
  later(2500, () => { const e = M.launchNow('MIRR', { decayMs: 0, deployer: '0x' + 'b1'.repeat(20) }); tok = e.token; later(1500, () => M.walletBuy(W, tok, 0.05)); });
  const r = await run(['follow', W, '--eth', '0.003', '--min-score', '0', '--for', '10'], { timeout: 30000 });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('FOLLOW') && r.out.includes('bought 0.0500 ETH of $MIRR') && r.out.includes('FIRE') && r.out.includes('mirror of ' + W.slice(0, 6)), r.out);
  assert.ok(r.out.includes('session end') && r.out.includes('nothing: paper'));
  assert.ok(M.state.alerts.some(a => /FIRE \$MIRR/.test(a.text)), 'the fire was sent to telegram');
});

test('snipe --grad: fires in the pool the moment a launch graduates, then leaves on the dev-sold siren', async () => {
  let tok = null;
  later(2000, () => { const e = M.launchNow('GRADME', { decayMs: 0, deployer: '0x' + 'b2'.repeat(20) }); tok = e.token; later(2000, () => { M.graduate(tok); later(3500, () => M.devSell(tok, 4)); }); });
  const r = await run(['snipe', '--grad', '--eth', '0.003', '--min-score', '0', '--for', '14'], { timeout: 40000 });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('waiting for graduations') && r.out.includes('FIRE') && r.out.includes('in the pool, quoted by the v4 quoter'), r.out);
  assert.ok(r.out.includes('DEV SOLD') && r.out.includes('siren: DEV SOLD'), r.out);
});

test('snipe --grad --live: a signed pool buy on graduation, sold when the session ends', async () => {
  const sentBefore = M.state.sent.length;
  let tok = null;
  later(2000, () => { const e = M.launchNow('LIVEGRAD', { decayMs: 0, deployer: '0x' + 'b3'.repeat(20) }); tok = e.token; later(2000, () => M.graduate(tok)); });
  const r = await run(['snipe', '--grad', '--live', '--yes', '--eth', '0.003', '--min-score', '0', '--for', '10', '--exit-on-stop'], { timeout: 40000 });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('FIRE') && r.out.includes('tokens in the pool') && r.out.includes('CLOSED') && /signed\s+1 buys, 1 sells/.test(r.out), r.out);
  const fns = M.state.sent.slice(sentBefore).map(x => x.fn);
  assert.deepEqual(fns, ['execute', 'approve', 'approve', 'execute']);
});

test('watch --guard: the deployer moving tokens out is a red siren and the guard sells', async () => {
  const b = await run(['buy', M.TOKEN, '0.01', '--yes']);
  assert.equal(b.code, 0, b.all);
  later(4000, () => M.devSell(M.TOKEN, 5));
  const r = await run(['watch', M.TOKEN, '--guard', '--yes', '--every', '2', '--for', '14'], { timeout: 30000 });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('DEV SOLD') && r.out.includes('SOLD') && r.out.includes('pulled the trigger'), r.out);
  assert.equal(M.tokenBalance(M.TOKEN, ADDR), 0n);
  assert.ok(M.state.alerts.some(a => /SIREN DEV SOLD/.test(a.text)) && M.state.alerts.some(a => /SOLD \$MOCK/.test(a.text)), 'the guard told telegram');
});

test('fees and dev read the escrow and the factory; claim takes the fees out', async () => {
  const f = await run(['fees', M.TOKEN]);
  assert.equal(f.code, 0, f.all);
  assert.ok(f.out.includes('the deployer') && f.out.includes('from the curve 0.27530 ETH') && f.out.includes('1 claim') && f.out.includes('CLAIMS'), f.out);
  /* wide enough to reach the graduated launch, which is five hours (72 000 blocks) behind the head */
  const d = await run(['dev', M.DEP1, '--window', '80000']);
  assert.equal(d.code, 0, d.all);
  assert.ok(d.out.includes('$MOCK') && d.out.includes('pool created') && /launches · 1 graduated/.test(d.out), d.out);
  M.server.api.credit({ recipient: ADDR, eth: '0.2' });
  const w = await run(['wallet']);
  assert.ok(w.out.includes('0.20000 ETH') && w.out.includes('loxley claim'), w.out);
  const dry = await run(['claim', '--dry']);
  assert.equal(dry.code, 0); assert.ok(dry.out.includes('DRY'));
  const c = await run(['claim', '--yes']);
  assert.equal(c.code, 0, c.all);
  assert.ok(c.out.includes('claimed 0.20000 ETH'), c.out);
  const w2 = await run(['wallet']);
  assert.ok(w2.out.includes('none unclaimed'), w2.out);
});

test('market lists the tokens DexScreener has on the chain with their deepest pool and the desk\'s stamp', async () => {
  const r = await run(['market']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('MARKET') && r.out.includes('$MOCK') && r.out.includes('$THIN') && r.out.includes('CAREFUL') && r.out.includes('AVOID'), r.out);
  assert.ok(!r.out.includes('So1111'), 'other chains are not listed');
  /* the mock serves a recorded Robinhood Chain market (test/dex-fixture.js) plus its own two pools */
  const j = await run(['market', '--json', '--by', 'liq', '--top', '30']);
  const lines = j.out.trim().split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const DEX = require('./dex-fixture');
  assert.equal(lines.length, DEX.ROWS.length + 2, 'every listed token gets a row');
  const syms = lines.map(l => l.symbol);
  assert.ok(syms.includes('MOCK') && syms.includes('THIN') && syms.includes('CHUMP'), syms.join(','));
  /* sorted by pooled value, and the thinnest pool in the list is the one the rules refuse */
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i - 1].liq >= lines[i].liq, 'sorted by liquidity');
  const thin = lines[lines.length - 1];
  assert.equal(thin.symbol, 'THIN'); assert.ok(thin.hard.length >= 1 && thin.stamp === 'avoid');
  /* one ether price for the table, from the ETH-quoted pairs only: the two stock-quoted pairs must not move it */
  assert.ok(Math.abs(lines[0].exitEthUsd - DEX.ethUsd()) < 1, 'ether price is the median of the ETH pairs');
  const wasted = lines.find(l => l.symbol === 'WASTED');
  assert.ok(wasted && wasted.quote === 'TTWO' && wasted.exitPct > 0, 'a stock-quoted pair is still priced in dollars');
});

test('scan shows the block-0 bundle and whether the dev sold', async () => {
  const r = await run(['scan', '0x3333333333333333333333333333333333333333']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('block-0 bundle') && r.out.includes('taken in the launch block') && r.out.includes('dev sold'), r.out);
});
