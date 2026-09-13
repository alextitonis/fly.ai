/* loxley · desk tests
   thirteen checks, no network: a mock explorer, a mock DexScreener, a mock GeckoTerminal and a mock RPC answer every
   request the desk makes, so the live code paths run end to end in a headless browser.
   run: npm install && npx playwright install chromium && npm test */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const FACTORY = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
const T_LAUNCH = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const T_GRAD = '0xd85d014567e903c654d1018dbc03f19e3aa57fcb38adb266462ed085b2f37d12';
const TOKEN = '0x1111111111111111111111111111111111111111';
const PAIR = '0x2222222222222222222222222222222222222222';
const DEP1 = '0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';
const DEP2 = '0xd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2';
const HEAD = 53400000;
const pad = a => '0x' + a.replace(/^0x/, '').padStart(64, '0');
const word = n => BigInt(n).toString(16).padStart(64, '0');
const abiStr = s => '0x' + word(32) + word(s.length) + Buffer.from(s).toString('hex').padEnd(64, '0');
const ago = s => new Date(Date.now() - s * 1000).toISOString().replace('Z', '.000000Z');

function launchLog(tok, curve, dep, bn, idx, decoded) {
  const lg = { block_number: bn, index: idx, transaction_hash: '0x' + 'ab'.repeat(32), topics: [T_LAUNCH, pad(tok), pad(curve), pad(dep)], data: '0x' + word(0) + word(0) + word(4200000000000000000n) };
  if (decoded) lg.decoded = { method_call: 'TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)', parameters: [{ name: 'token', value: tok }, { name: 'curve', value: curve }, { name: 'deployer', value: dep }, { name: 'pairToken', value: '0x0000000000000000000000000000000000000000' }, { name: 'launchConfigId', value: '0' }, { name: 'graduationThreshold', value: '4200000000000000000' }] };
  return lg;
}
function gradLog(tok, bn, idx) { return { block_number: bn, index: idx, transaction_hash: '0x' + 'cd'.repeat(32), topics: [T_GRAD, pad(tok)], data: '0x' + word(7), decoded: { method_call: 'PoolGraduated(address indexed token, bytes32 poolId)', parameters: [{ name: 'token', value: tok }] } }; }

const toks = []; for (let i = 0; i < 8; i++) toks.push('0x' + (i + 3).toString(16).repeat(40).slice(0, 40));
const logs = [];
toks.forEach((t, i) => logs.push(launchLog(t, '0xc' + t.slice(3), i % 3 === 0 ? DEP1 : i % 3 === 1 ? DEP2 : ('0x' + 'e'.repeat(38) + i + i), HEAD - 40 * i - 5, i, i % 2 === 0)));
logs.push(gradLog(toks[4], HEAD - 100, 1));
logs.push(launchLog(TOKEN, '0xc111111111111111111111111111111111111111', DEP1, HEAD - 2000, 0, true));

const pairObj = { chainId: 'robinhood', dexId: 'uniswap', pairAddress: PAIR, url: 'https://dexscreener.com/robinhood/' + PAIR, baseToken: { address: TOKEN, name: 'Mock Token', symbol: 'MOCK' }, quoteToken: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', symbol: 'WETH' }, priceUsd: '0.00071429', priceNative: '0.000000170068', liquidity: { usd: 120000, quote: 14.2857, base: 8.4e7 }, marketCap: 714290, fdv: 714290, volume: { h24: 400000, m5: 1800, h1: 25000, h6: 150000 }, priceChange: { m5: 0.3, h1: 12, h6: 1056.9, h24: 1056.9 }, txns: { m5: { buys: 10, sells: 8 }, h1: { buys: 200, sells: 180 }, h6: { buys: 1200, sells: 1100 }, h24: { buys: 2500, sells: 2300 } }, pairCreatedAt: Date.now() - 5 * 3600000, info: { socials: [{ type: 'twitter', url: 'https://x.com/x' }] } };

function reply(route, obj, status) { return route.fulfill({ status: status || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) }); }

async function mock(route) {
  const req = route.request(), url = req.url();
  if (url.startsWith('file://')) return route.continue();
  if (url.includes('fonts.g')) return route.abort();
  if (url.includes('rpc.mainnet.chain.robinhood.com')) {
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) { }
    const m = body.method, p = body.params || []; let result = null;
    if (m === 'eth_blockNumber') result = '0x' + HEAD.toString(16);
    else if (m === 'eth_getLogs') result = [];
    else if (m === 'eth_call') { const sel = ((p[0] && p[0].data) || '').slice(0, 10); result = sel === '0x4f1f58fd' ? '0x' + word(1500000000000000000n) : sel === '0x95d89b41' ? abiStr('RPCSYM') : sel === '0x06fdde03' ? abiStr('Rpc Name') : '0x'; }
    return reply(route, { jsonrpc: '2.0', id: body.id || 1, result });
  }
  if (url.includes('api.dexscreener.com/latest/dex/tokens/')) return reply(route, { pairs: url.toLowerCase().includes(TOKEN) ? [pairObj] : [] });
  if (url.includes('api.dexscreener.com/token-boosts')) return reply(route, []);
  if (url.includes('geckoterminal.com')) { if (url.includes('trending_pools')) return reply(route, { data: [] }); if (url.includes('/ohlcv/')) return reply(route, { data: { attributes: { ohlcv_list: [] } } }); if (url.includes('/pools')) return reply(route, { data: [] }); return reply(route, { data: { attributes: { image_url: null } } }); }
  if (url.includes('robinhoodchain.blockscout.com/api/v2/')) {
    const p = url.split('/api/v2/')[1].split('?')[0].toLowerCase();
    if (p === 'addresses/' + FACTORY + '/logs') return reply(route, { items: logs, next_page_params: null });
    if (p === 'blocks') { const items = []; for (let i = 0; i < 50; i++) items.push({ height: HEAD - i, timestamp: ago(i * 0.25) }); return reply(route, { items }); }
    if (/^blocks\/\d+$/.test(p)) { const n = parseInt(p.split('/')[1], 10); return reply(route, { height: n, timestamp: ago((HEAD - n) * 0.25) }); }
    if (/^tokens\/0x[0-9a-f]{40}$/.test(p)) { const a = p.split('/')[1]; if (a === TOKEN) return reply(route, { symbol: 'MOCK', name: 'Mock Token', decimals: '18', total_supply: '1000000000000000000000000000', holders: '1234', icon_url: null }); const i = toks.indexOf(a); if (i >= 0 && i % 2 === 0) return reply(route, { symbol: 'MK' + i, name: 'Mock ' + i, decimals: '18', holders: String(10 + i) }); return reply(route, { message: 'not found' }, 404); }
    if (/^tokens\/0x[0-9a-f]{40}\/holders$/.test(p)) return reply(route, { items: [{ address: { hash: PAIR }, value: '28000000000000000000000000' }, { address: { hash: '0xaaa1' }, value: '30000000000000000000000000' }, { address: { hash: '0xaaa2' }, value: '21000000000000000000000000' }, { address: { hash: '0xaaa3' }, value: '9000000000000000000000000' }] });
    if (/^tokens\/0x[0-9a-f]{40}\/transfers$/.test(p)) return reply(route, { items: [{ total: { value: '500000000000000000000000', decimals: '18' }, from: { hash: PAIR }, to: { hash: '0xbuyer' }, timestamp: ago(20), transaction_hash: '0x' + 'ef'.repeat(32) }] });
    if (/^smart-contracts\//.test(p)) return reply(route, { is_verified: true });
    if (p === 'stats') return reply(route, { total_blocks: String(HEAD), gas_prices: { average: 0.01 }, transactions_today: '1200000' });
    if (p === 'addresses/' + TOKEN) return reply(route, { hash: TOKEN, is_contract: true, creator_address_hash: '0x3711cea4feade896c913c68f01eda97cb06d1a42', creation_transaction_hash: '0x' + '11'.repeat(32) });
    if (/^transactions\/0x(11)+$/.test(p)) return reply(route, { from: { hash: DEP1 }, to: { hash: FACTORY }, timestamp: ago(3 * 3600), method: 'launch' });
    if (p === 'addresses/' + DEP1) return reply(route, { hash: DEP1, coin_balance: '830000000000000000', is_contract: false });
    if (p === 'addresses/' + DEP1 + '/counters') return reply(route, { transactions_count: '412', token_transfers_count: '1930', gas_usage_count: '1', validations_count: '0' });
    if (p === 'addresses/' + DEP1 + '/transactions') { const items = []; for (let i = 0; i < 50; i++) items.push({ to: { hash: i % 7 === 0 ? FACTORY : '0x9999999999999999999999999999999999999999' }, method: i % 7 === 0 ? 'launch' : 'transfer', timestamp: ago(60 * i + 30) }); return reply(route, { items, next_page_params: { block_number: 1 } }); }
    return reply(route, { message: 'mock: no route for ' + p }, 404);
  }
  return route.abort();
}

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '   ' + (detail || ''))); }

(async () => {
  const exe = process.env.LOXLEY_CHROMIUM;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route('**/*', mock);
  const file = path.resolve(__dirname, '..', 'index.html');
  await page.goto('file://' + file + '?token=' + TOKEN);
  await page.waitForTimeout(14000);
  const t = async id => page.$eval('#' + id, el => el.textContent.trim()).catch(() => '');
  const cmd = async (c, w) => { await page.fill('#conIn', c); await page.keyboard.press('Enter'); await page.waitForTimeout(w || 400); };

  check('token loads from ?token=', (await t('stSym')) === '$MOCK', await t('stSym'));
  const score = parseInt(await t('vN'), 10), stamp = await t('vStamp');
  check('survival index and stamp', score >= 0 && score <= 100 && /^(ENTER|CAREFUL|AVOID)$/.test(stamp), score + ' ' + stamp);
  check('holders read with the pool removed', /%/.test(await t('m3')), await t('m3'));
  const rfL = await t('rfL');
  check('radar decodes launches and graduations from the factory logs', /9 launches · 1 graduated/.test(rfL), rfL);
  const fill = await page.$eval('#rlist .cv i', el => el.style.width).catch(() => '');
  check('curve fill arrives from realQuoteReserve()', fill === '36%', fill);
  const xrows = await t('xrows');
  check('x-ray finds the sender of the launch tx and counts its launches', /SERIAL/.test(xrows) && /8 in last 50 tx\+/.test(xrows), xrows.slice(0, 120));
  check('serial deployer lands in the red flags', /deployer wallet launched 8 tokens/.test(await t('flags')), (await t('flags')).slice(0, 100));

  await page.keyboard.press('`'); await page.waitForTimeout(300);
  await cmd('launches'); const n1 = await page.$$eval('#conLog .tbl', els => els.length ? els[els.length - 1].querySelectorAll('.k').length : 0);
  check('console: launches lists the radar', n1 >= 9, String(n1));
  await cmd('council'); const n2 = await page.$$eval('#conLog .tbl', els => els[els.length - 1].querySelectorAll('.k').length);
  check('console: council prints eight votes', n2 === 8, String(n2));
  await cmd('score'); await cmd('exit 2');
  const log = await t('conLog');
  check('console: score and exit maths answer', /total \d+\/100/.test(log) && /price impact/.test(log) && /you receive/.test(log), '');
  const rec = parseInt(await t('sbRecN'), 10);
  await cmd('replay 40', 2500);
  check('black box records the polls and replays them', rec >= 1 && /replay finished/.test(await t('conLog')), 'frames ' + rec);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), cmd('export', 800)]);
  let frames = 0; if (dl) { const p = await dl.path(); try { frames = JSON.parse(fs.readFileSync(p, 'utf8')).frames.length; } catch (e) { } }
  check('export writes a replayable json', frames >= 1, 'frames ' + frames);
  check('no errors thrown anywhere', errors.length === 0, errors.join(' | ').slice(0, 300));

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
