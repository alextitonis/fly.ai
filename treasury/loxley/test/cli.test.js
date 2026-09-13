'use strict';
/* every command, end to end, against the mock chain: node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const mock = require('./mock-chain');

const BIN = path.resolve(__dirname, '..', 'bin', 'loxley.js');
let M;
test.before(async () => { M = await mock.start(); });
test.after(async () => { if (M) await M.close(); });

function run(args, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, M.env, { NO_COLOR: '1', HTTP_TIMEOUT_MS: '4000', RPC_SPACING_MS: '5', RPC_LOGS_SPACING_MS: '5', POLL_MS: '300' }, opts.env || {});
    const p = spawn(process.execPath, [BIN].concat(args, ['--no-logo']), { env, cwd: path.resolve(__dirname, '..') });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    if (opts.during) opts.during(p);
    const t = setTimeout(() => p.kill('SIGINT'), opts.timeout || 30000);
    p.on('exit', code => { clearTimeout(t); resolve({ code, out, err, all: out + err }); });
  });
}

test('help lists every command', async () => {
  const r = await run(['help']);
  assert.equal(r.code, 0);
  ['doctor', 'hunt', 'radar', 'scan', 'watch', 'xray', 'exit', 'snipe', 'replay', 'desk', 'wallet', 'buy', 'sell', 'positions'].forEach(c => assert.ok(r.out.includes(c), c));
  assert.ok(r.out.includes('reads by default'));
});

test('doctor: every check passes against the mock chain', async () => {
  const r = await run(['doctor', '--probe']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('chain id 4663'));
  assert.ok(r.out.includes('launches'));
  assert.ok(r.out.includes('curve probe'));
  assert.ok(!r.out.includes('FAIL'));
});

test('scan: curve, launch, pool, council, exit and x-ray for a graduated token', async () => {
  const r = await run(['scan', M.TOKEN]);
  assert.equal(r.code, 0, r.all);
  ['$MOCK', 'CURVE', 'LAUNCH', 'dev buy', '3.00% of supply', 'POOL', 'COUNCIL', 'SCOUT', 'EXIT', 'X-RAY', 'SERIAL', '8 in its last 50 transactions', 'survival index'].forEach(s => assert.ok(r.out.includes(s), 'missing ' + s));
  assert.ok(/ENTER|CAREFUL|AVOID/.test(r.out));
});

test('scan: a token still on its curve has no council, has a door', async () => {
  const tok = M.state.launches[2].token;
  const r = await run(['scan', tok]);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('on the curve'));
  assert.ok(r.out.includes('the door on the curve'));
  assert.ok(!r.out.includes('COUNCIL'));
});

test('exit: prices the door from the reserve', async () => {
  const r = await run(['exit', M.TOKEN, '1']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('6.54%'), r.out);
  assert.ok(r.out.includes('safe size'));
});

test('xray: a token resolves to the sender of its launch, a wallet reads directly', async () => {
  const r = await run(['xray', M.TOKEN]);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes(M.DEP1) && r.out.includes('SERIAL'));
  const r2 = await run(['xray', M.DEP2]);
  assert.equal(r2.code, 0, r2.all);
  assert.ok(r2.out.includes('wallet 0xd2d2') && r2.out.includes('nearly empty'));
});

test('hunt: reads the backlog, then a launch that lands mid-run, as json', async () => {
  const r = await run(['hunt', '--for', '5', '--json', '--no-follow'], { during: () => { setTimeout(() => { M.launchNow('FRESH'); }, 1500); setTimeout(() => M.tick(), 3000); } });
  assert.equal(r.code, 0, r.all);
  const lines = r.out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  assert.ok(lines.length >= 4, 'json lines: ' + lines.length);
  const fresh = lines.find(l => l.symbol === 'FRESH');
  assert.ok(fresh, 'the mid-run launch was seen');
  assert.equal(fresh.kind, 'launch');
  assert.ok(fresh.openingTaxBps === 9900 || fresh.openingTaxBps === 0);
  assert.ok(['FIRE', 'WATCH', 'SKIP'].includes(fresh.verdict));
  assert.ok(lines.every(l => l.sim === false));
});

test('hunt: a 7% creator tax and a wallet with twins lose points', async () => {
  const r = await run(['hunt', '--for', '2', '--json', '--no-follow']);
  const lines = r.out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const taxed = lines.find(l => l.creatorTaxBps === 700);
  assert.ok(taxed && taxed.reasons.some(p => p.k === 'creator tax' && p.v < 0), 'a 7% creator tax is penalised');
  assert.ok(lines.some(l => l.reasons.some(p => p.k === 'twins' && p.v < 0)), 'twins inside 30 min are penalised');
  assert.ok(lines.every(l => typeof l.devShare === 'number'), 'the dev buy is read from the launch receipt');
});

test('watch: polls the pool, writes a black box the desk can replay', async () => {
  const box = path.join(os.tmpdir(), 'loxley-test-box.json');
  try { fs.unlinkSync(box); } catch (e) { }
  const r = await run(['watch', M.TOKEN, '--every', '2', '--for', '5', '--rec', box, '--paper', '0.5']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('$MOCK') && r.out.includes('ENTER'));
  const j = JSON.parse(fs.readFileSync(box, 'utf8'));
  assert.equal(j.loxley, 1); assert.ok(j.frames.length >= 2); assert.ok(j.frames[0].pair.baseToken.symbol === 'MOCK');
});

test('replay: the shipped drill fires the siren and ends AVOID', async () => {
  const r = await run(['replay', path.resolve(__dirname, '..', 'recordings', 'sample-drill.json'), '--speed', '400']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('DRILL'));
  assert.ok(r.out.includes('LIQUIDITY LEAVING'));
  assert.ok(r.out.includes('AVOID'));
  assert.ok(/sirens\s+[1-9]/.test(r.out));
});

test('snipe: --live without a wallet refuses, paper fires in the simulator, marks and closes', async () => {
  const live = await run(['snipe', '--live', '--yes'], { env: { LOXLEY_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'lx-nowallet-')) } });
  assert.equal(live.code, 1);
  assert.ok(live.all.includes('no wallet'));
  const r = await run(['snipe', '--sim', '--for', '14', '--min-score', '50'], { timeout: 40000 });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('PAPER'));
  assert.ok(r.out.includes('FIRE') || r.out.includes('pass'));
  assert.ok(r.out.includes('signed') && r.out.includes('nothing: paper'));
});

test('radar: draws in the simulator and stops on time', async () => {
  const r = await run(['radar', '--sim', '--for', '3']);
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes('LAUNCH RADAR'));
  assert.ok(r.out.includes('SIMULATED'));
  assert.ok(r.out.includes('radar closed'));
});

test('offline: doctor fails fast and points at --sim', async () => {
  const r = await run(['doctor'], { env: { RPC_URL: 'http://127.0.0.1:9', EXPLORER_URL: 'http://127.0.0.1:9', DEX_URL: 'http://127.0.0.1:9', HTTP_TIMEOUT_MS: '1500' } });
  assert.equal(r.code, 1);
  assert.ok(r.out.includes('FAIL'));
  assert.ok(r.out.includes('--sim'));
});
