'use strict';
/* a mock Robinhood Chain for the tests and for a first dry run of the sniper: one http server that answers as
   the rpc, the explorer and dexscreener. it keeps real pons v2 curves in integer maths, mints tokens on buys,
   burns them on sells, accepts signed transactions (eth_sendRawTransaction) and mines them on the spot.
   run it on its own (node test/mock-chain.js) and point the cli at it with RPC_URL, EXPLORER_URL and DEX_URL. */
const http = require('http');
const { parseTransaction, recoverTransactionAddress, decodeFunctionData, encodeFunctionResult, encodeFunctionData, decodeAbiParameters, encodeAbiParameters, keccak256, parseAbi, getAddress } = require('../cli/deps');
const PONS = require('../cli/pons');
const DEX = require('./dex-fixture');   /* the recorded Robinhood Chain market this mock serves */
const ETHUSD = DEX.ethUsd();            /* one ether price for the whole mock, taken from that recording */

const FACTORY = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
const ESCROW = '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e', LAUNCH_ROUTER = '0xe33e9e479df8802cb0866d5d05258bec4cf62948', MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const ROUTER = '0x8876789976decbfcbbbe364623c63652db8c0904', QUOTER = '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3', HOOK = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
const T = {
  LAUNCH: '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607',
  GRAD: '0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259',
  SWEPT: '0xcdb72f157fd3666758a6ce201387ffb52038c7562e4fff352828da1096c4b6b4',
  BUY: '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455',
  SELL: '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df',
  TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  APPROVAL: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
  CREDITED: PONS.T.CREDITED, CLAIMED: PONS.T.CLAIMED
};
const TOKEN = '0x1111111111111111111111111111111111111111', CURVE = '0xc111111111111111111111111111111111111111', PAIR = '0x2222222222222222222222222222222222222222';
const DEP1 = '0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1', DEP2 = '0xd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2';
const ZERO = '0x0000000000000000000000000000000000000000';
const word = n => BigInt(n).toString(16).padStart(64, '0');
const pad = a => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hex = n => '0x' + BigInt(n).toString(16);
const abiStr = s => '0x' + word(32) + word(s.length) + Buffer.from(s).toString('hex').padEnd(64, '0');
const ETH = 1000000000000000000n, BPS = 10000n;
const wei = x => BigInt(Math.round(x * 1e6)) * (ETH / 1000000n);
const low = a => String(a || '').toLowerCase();

const ABI = parseAbi([
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256)',
  'function getReserves() view returns (uint256, uint256)',
  'function realQuoteReserve() view returns (uint256)', 'function tokenReserve() view returns (uint256)', 'function sellableTokens() view returns (uint256)', 'function reservedTokens() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)', 'function readyToGraduate() view returns (bool)', 'function graduated() view returns (bool)', 'function feeBps() view returns (uint256)', 'function creatorTaxBps() view returns (uint256)',
  'function isNativeQuote() view returns (bool)', 'function pairToken() view returns (address)', 'function launchedAt() view returns (uint256)', 'function currentSnipeTaxBps(address) view returns (uint256)', 'function snipeTaxExempt(address) view returns (bool)', 'function phase() view returns (uint8)',
  'function getLaunchedToken(address) view returns ((address,address,address,address,address,uint256,uint24,int24,uint16,bool,uint8,uint256,uint256,uint256,bool))',
  'function pairTokenEconomics(address) view returns (uint256, uint256, uint8)', 'function snipeTaxStartBps() view returns (uint256)', 'function snipeTaxSeconds() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)', 'function allowance(address, address) view returns (uint256)', 'function approve(address, uint256) returns (bool)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function name() view returns (string)', 'function totalSupply() view returns (uint256)',
  'function allowance(address, address, address) view returns (uint160, uint48, uint48)', 'function approve(address, address, uint160, uint48)',
  'function quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes)) returns (uint256, uint256)',
  'function getSlot0(bytes32) view returns (uint160, int24, uint24, uint24)',
  'function execute(bytes, bytes[], uint256) payable',
  'function getTokenInfo() view returns (address, string, string, (string,string,string,string,string))',
  'function claim() returns (uint256)',
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)'
]);
const enc = (fn, result) => encodeFunctionResult({ abi: ABI, functionName: fn, result });
/* the one pool the mock knows: ETH / TOKEN behind the pons hook, fee 0, tick spacing 200 */
const poolIdOf = tok => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [ZERO, tok, 0, 200, HOOK])).toLowerCase();
const POOL_ID = poolIdOf(TOKEN);
const amountOut = (i, rIn, rOut) => (i * rOut) / (rIn + i);
function revert(msg) { const e = new Error('execution reverted: ' + msg); e.code = 3; e.data = '0x08c379a0' + abiStr(msg).slice(2); throw e; }

function start(opts) {
  opts = opts || {};
  const state = { head: 53400000, t0: Date.now(), launches: [], curves: {}, tokens: {}, grads: {}, swept: {}, calls: { rpc: 0, explorer: 0, dex: 0 }, blockTime: 250, accounts: {}, permit2: {}, txs: {}, receipts: {}, pools: { [TOKEN]: { eth: wei(14.2857), tok: 84000000n * ETH, feeBps: 30n } }   /* the pool MOCK graduated into, a few hours of trade later. graduation handed it 4.2 ETH and the 285.71M tokens the curve still held, so k = 1.2e9; 10.09 ETH of net buying since then leaves 14.2857 ETH against 84.0M tokens, the same k. that is 1.70068e-7 ETH a token, and at the recording's ether price it is the price, depth and cap the dex side reports */, gasPrice: 100000000n, gasUsed: 150000n, phantom: wei(1.68), routerLayout: opts.routerLayout || 'current', sent: [], escrow: {}, escrowLogs: [], mined: [], alerts: [] };
  const blockTs = n => Math.floor((state.t0 - (state.head - n) * state.blockTime) / 1000);
  const acct = a => { a = low(a); if (!state.accounts[a]) state.accounts[a] = { balance: opts.balance == null ? ETH : BigInt(opts.balance), nonce: 0 }; return state.accounts[a]; };
  const tokBal = (t, a) => (state.tokens[low(t)] && state.tokens[low(t)].balances[low(a)]) || 0n;
  const setTokBal = (t, a, v) => { state.tokens[low(t)].balances[low(a)] = v; };
  const allowance = (t, o, s) => ((state.tokens[low(t)] || {}).allowances || {})[low(o) + ':' + low(s)] || 0n;

  function addLaunch(tok, curve, dep, bnAgo, o) {
    o = o || {};
    const bn = state.head - bnAgo;
    const e = { token: tok, curve, deployer: dep, pair: o.pair || ZERO, bn, idx: state.launches.length % 7, tx: '0x' + (state.launches.length + 1).toString(16).padStart(64, '0'), thrWei: 4200000000000000000n };
    state.launches.push(e);
    /* the token reserve is not a free number: the curve is a constant product seeded with the 1.68 ETH phantom
       against the whole 1 B supply, so once `real` quote has gone in, supply · 1.68 / (1.68 + real) is what is
       left on it. at the 4.2 ETH threshold that is 1.68/5.88 = 28.571% of supply, the share pons hands the pool. */
    const realN = o.real == null ? 1.5 : o.real, real = wei(realN);
    const tr = BigInt(Math.round(1e9 * 1.68 / (1.68 + realN))) * ETH;
    /* and neither is the dev's quote: the ETH that buys `devTokens` on a fresh curve, with the 1 % curve fee and the
       creator tax added back on. 3.00% of supply at a 1 % tax is 0.0530 ETH, which with the 0.0005 launch fee is the
       0.0535 a 3 % dev buy costs on mainnet. */
    const devTok = o.devTokens == null ? 3.0e7 : o.devTokens, taxBps = o.tax == null ? 100 : o.tax;
    const devShare = devTok / 1e9 * 100;
    const devNet = devShare > 0 ? devShare * 1.68 / (100 - devShare) : 0;
    const devQuote = o.dev != null ? o.dev : devNet / (0.99 * (1 - taxBps / 1e4));
    /* the curve trades that carried it from the dev's buy to `real`: `n` buys walked along the same constant
       product, so the quote in the logs plus the dev's buy is the real reserve, and the tokens in the logs plus the
       dev's are exactly what has left the token reserve. the first two pay a 5 % opening tax, as early buys do. */
    /* about one buy per 0.033 ETH of quote, which is the ticket size the chain actually sees, so a curve that is
       nearly full has hundreds of trades behind it and no single early buy looks like a bundle */
    const n = o.buys == null ? Math.max(6, Math.round(realN * 30)) : o.buys, trades = [];
    let q = 1.68 + devNet, t = 1e9 - devTok;
    const perNet = n > 0 ? Math.max(0, realN - devNet) / n : 0;
    for (let i = 0; i < n; i++) {
      const openFrac = i < 2 ? 0.05 : 0, out = perNet * t / (q + perNet);
      const gross = perNet / (0.99 * (1 - taxBps / 1e4) * (1 - openFrac));
      trades.push({ gross, tokens: out, tax: gross * 0.99 * (1 - taxBps / 1e4) * openFrac });
      q += perNet; t -= out;
    }
    /* what may still be bought on the curve: everything above the 28.571 % of supply the pool is owed */
    const reserved = BigInt(Math.round(1e9 * 1.68 / 5.88)) * ETH;
    state.curves[curve] = { realWei: real, quoteWei: state.phantom + real, tokenReserveWei: tr, sellableWei: tr > reserved ? tr - reserved : 0n, reservedWei: reserved, feeBps: 100n, creatorTaxBps: BigInt(taxBps), graduated: !!o.grad, ready: !!o.grad, phase: o.grad ? 2 : 0, dev: devQuote, devTokens: devTok, buys: n, trades, launch: e, openTax: BigInt(o.openTax == null ? 0 : o.openTax), thrWei: e.thrWei };
    state.tokens[tok] = { symbol: o.symbol || ('MK' + state.launches.length), name: o.name || ('Mock ' + state.launches.length), supply: 1000000000n * ETH, curve, balances: {}, allowances: {}, description: o.description || ('a mock launch on the mock chain, number ' + state.launches.length), socials: o.socials || { twitter: 'https://x.com/mock' + state.launches.length, telegram: '', discord: '', website: state.launches.length % 3 ? 'https://mock' + state.launches.length + '.xyz' : '', farcaster: '' }, exempt: o.exempt || [], feeRecipient: o.feeRecipient || dep };
    state.tokens[tok].balances[dep] = BigInt(Math.round((o.devTokens == null ? 3.0e7 : o.devTokens))) * ETH;
    if (o.grad) state.grads[tok] = bn + 300;
    return e;
  }
  /* the fixtures: one graduated token with a pool, one serial deployer, a few fresh ones */
  /* the graduated one is 5 hours old: 72 000 blocks at 250 ms, and it graduated 300 blocks after it launched, which
     is the `pairCreatedAt` the dex fixture reports for its pool. a token cannot have a pool older than itself. */
  addLaunch(TOKEN, CURVE, DEP1, 72000, { symbol: 'MOCK', name: 'Mock Token', grad: true, real: 4.2, devTokens: 3.0e7 });
  for (let i = 0; i < 6; i++) addLaunch('0x' + (i + 3).toString(16).repeat(40).slice(0, 40), '0xc' + (i + 3).toString(16).repeat(39).slice(0, 39), i % 2 ? DEP2 : DEP1, 900 - i * 120, { real: 0.3 + i * 0.4, tax: i === 4 ? 700 : 100, devTokens: i === 3 ? 1.5e8 : 2.5e7, openTax: i === 5 ? 9900 : 0, exempt: i === 3 ? ['0x' + 'e1'.repeat(20), '0x' + 'e2'.repeat(20), '0x' + 'e3'.repeat(20)] : [], socials: i === 2 ? { twitter: '', telegram: '', discord: '', website: '', farcaster: '' } : undefined });
  /* the recorded market's tokens exist on this chain too, so `scan` on any row of `market` reads a real ERC-20 and a
     real explorer record instead of shrugging: symbol, name, the supply its fdv and price imply, a holder count and
     a verified source. They have no launch event, because they were not launched inside this mock; that is exactly
     the case a token bridged or launched before the window presents, and `scan` prints the POOL half only. */
  DEX.ROWS.forEach((r, i) => {
    const [sym, name, addr, price, , , , , , fdv] = r;
    state.tokens[low(addr)] = { symbol: sym, name: name, supply: BigInt(Math.round(fdv / price)) * ETH, curve: null, balances: {}, allowances: {},
      description: '', socials: { twitter: 'https://x.com/' + sym.toLowerCase(), telegram: '', discord: '', website: '', farcaster: '' },
      exempt: [], feeRecipient: ZERO, holders: String(400 + i * 173), listed: true };
  });

  /* the fee escrow: the graduated token's deployer was credited from the curve and from the pool, and claimed once */
  state.escrow[DEP1] = wei(0.1102);
  state.escrowLogs.push({ address: ESCROW, blockNumber: hex(state.head - 1900), logIndex: '0x3', transactionHash: '0x' + 'a1'.repeat(32), topics: [T.CREDITED, pad(DEP1), pad(CURVE)], data: '0x' + word(wei(0.2753)), removed: false });
  state.escrowLogs.push({ address: ESCROW, blockNumber: hex(state.head - 1500), logIndex: '0x2', transactionHash: '0x' + 'a2'.repeat(32), topics: [T.CREDITED, pad(DEP1), pad(HOOK)], data: '0x' + word(wei(0.1595)), removed: false });
  /* the claim took everything credited up to that block (0.2753 + 0.1595); the credit after it is what is left */
  state.escrowLogs.push({ address: ESCROW, blockNumber: hex(state.head - 1200), logIndex: '0x0', transactionHash: '0x' + 'a3'.repeat(32), topics: [T.CLAIMED, pad(DEP1)], data: '0x' + word(wei(0.4348)), removed: false });
  state.escrowLogs.push({ address: ESCROW, blockNumber: hex(state.head - 600), logIndex: '0x1', transactionHash: '0x' + 'a4'.repeat(32), topics: [T.CREDITED, pad(DEP1), pad(HOOK)], data: '0x' + word(wei(0.1102)), removed: false });

  const launchLog = e => ({ address: FACTORY, blockNumber: hex(e.bn), logIndex: hex(e.idx), transactionHash: e.tx, topics: [T.LAUNCH, pad(e.token), pad(e.curve), pad(e.deployer)], data: '0x' + pad(e.pair).slice(2) + word(0) + word(e.thrWei), removed: false });
  const gradLog = (tok, bn) => ({ address: FACTORY, blockNumber: hex(bn), logIndex: '0x0', transactionHash: '0x' + 'cd'.repeat(32), topics: [T.GRAD, pad(tok)], data: '0x' + word(7) + word(3000000n * ETH) + word(wei(4.2)), removed: false });
  const sweptLog = (tok, bn) => ({ address: FACTORY, blockNumber: hex(bn), logIndex: '0x0', transactionHash: '0x' + 'ce'.repeat(32), topics: [T.SWEPT, pad(tok)], data: '0x' + word(wei(4.2)) + word(3000000n * ETH), removed: false });
  const buyLog = (c, who, bn, quote, tokens, tax) => ({ address: c, blockNumber: hex(bn), logIndex: '0x1', transactionHash: '0x' + 'ee'.repeat(32), topics: [T.BUY, pad(who), pad(who)], data: '0x' + word(wei(quote)) + word(BigInt(Math.round(tokens)) * ETH) + word(wei(quote * 0.01)) + word(wei(tax)), removed: false });
  function factoryLogs(from, to, topics) {
    /* every position of the topic filter counts, like a real node: topic3 is how `dev` and `xray` find one deployer's launches */
    const out = [];
    state.launches.forEach(e => { if (e.bn >= from && e.bn <= to) out.push(launchLog(e)); });
    Object.keys(state.grads).forEach(tok => { const bn = state.grads[tok]; if (bn >= from && bn <= to) out.push(gradLog(tok, bn)); });
    Object.keys(state.swept).forEach(tok => { const bn = state.swept[tok]; if (bn >= from && bn <= to) out.push(sweptLog(tok, bn)); });
    return out.filter(l => topicMatch(l, topics));
  }
  function curveLogs(c, from, to) {
    const cv = state.curves[c]; if (!cv) return [];
    const out = []; cv.trades.forEach((tr, i) => { const bn = cv.launch.bn + 1 + i * 2; if (bn >= from && bn <= to) out.push(buyLog(c, '0x' + (i + 1).toString(16).padStart(40, 'b'), bn, tr.gross, tr.tokens, tr.tax)); });
    (state.mined || []).forEach(l => { if (low(l.address) === c && parseInt(l.blockNumber, 16) >= from && parseInt(l.blockNumber, 16) <= to) out.push(l); });
    return out;
  }
  const inRange = (l, from, to) => parseInt(l.blockNumber, 16) >= from && parseInt(l.blockNumber, 16) <= to;
  /* the node's topic filter: each position null, one topic, or a list of alternatives */
  function topicMatch(l, topics) {
    if (!topics) return true;
    return topics.every((t, i) => t == null || (Array.isArray(t) ? t.map(low) : [low(t)]).includes(low(l.topics[i] || '')));
  }
  function anyLogs(address, from, to, topics) {
    let list;
    if (!address) list = factoryLogs(from, to, null).concat(state.escrowLogs, (state.mined || [])); else {
      const a = low(address);
      if (a === FACTORY) return factoryLogs(from, to, topics);
      else if (a === ESCROW) list = state.escrowLogs;
      else if (state.curves[a]) list = curveLogs(a, from, to);
      else list = (state.mined || []).filter(l => low(l.address) === a);
    }
    return list.filter(l => inRange(l, from, to) && topicMatch(l, topics));
  }

  /* ---------- contracts ---------- */
  function decode(data) { try { return decodeFunctionData({ abi: ABI, data }); } catch (e) { return null; } }
  const poolOf = tok => state.pools[low(tok)];
  const poolQuote = (tok, sellingToken, amt) => { const p = poolOf(tok); const net = amt - amt * p.feeBps / BPS; return sellingToken ? amountOut(net, p.tok, p.eth) : amountOut(net, p.eth, p.tok); };
  const curveOf = tok => state.curves[state.tokens[low(tok)].curve];

  /* a call or a transaction against one of the contracts; dry runs only compute, mined runs also apply */
  function exec(from, to, data, value, dry, ctx) {
    to = low(to); from = low(from); value = value || 0n;
    const d = decode(data); const fn = d && d.functionName, a = d ? d.args : [];
    const cv = state.curves[to], tk = state.tokens[to];
    const logs = [];
    const log = (address, topics, dat) => logs.push({ address, topics, data: dat });
    if (cv) {
      const e = cv.launch;
      switch (fn) {
        case 'getReserves': return { result: enc(fn, [cv.quoteWei, cv.tokenReserveWei]) };
        case 'realQuoteReserve': return { result: enc(fn, cv.realWei) };
        case 'tokenReserve': return { result: enc(fn, cv.tokenReserveWei) };
        case 'sellableTokens': return { result: enc(fn, cv.sellableWei) };
        case 'reservedTokens': return { result: enc(fn, cv.reservedWei) };
        case 'graduationThreshold': return { result: enc(fn, cv.thrWei) };
        case 'readyToGraduate': return { result: enc(fn, cv.ready) };
        case 'graduated': return { result: enc(fn, cv.graduated) };
        case 'feeBps': return { result: enc(fn, cv.feeBps) };
        case 'creatorTaxBps': return { result: enc(fn, cv.creatorTaxBps) };
        case 'isNativeQuote': return { result: enc(fn, e.pair === ZERO) };
        case 'pairToken': return { result: enc(fn, getAddress(e.pair)) };
        case 'launchedAt': return { result: enc(fn, BigInt(blockTs(e.bn))) };
        case 'currentSnipeTaxBps': return { result: enc(fn, cv.openTax) };
        case 'snipeTaxExempt': return { result: enc(fn, false) };
        case 'phase': return { result: enc(fn, cv.phase) };
        case 'buy': {
          const [quoteIn, minOut, recipient] = a;
          if (cv.graduated || cv.ready || cv.phase !== 0) revert('curve closed');
          if (value !== quoteIn) revert('value mismatch');
          if (acct(from).balance < value) revert('insufficient funds');
          /* the three cuts come off one after another, not all off the gross: the curve fee first, the creator's tax
             on what is left, and the opening tax on what is left of that. Taking all three off the gross would put
             a 99% opening tax plus two 1% cuts over 100% and leave a negative amount going into the reserve. */
          const fee = quoteIn * cv.feeBps / BPS;
          const tax = (quoteIn - fee) * cv.creatorTaxBps / BPS;
          const opening = (quoteIn - fee - tax) * cv.openTax / BPS;
          const net = quoteIn - fee - tax - opening;
          let tokensOut = amountOut(net, cv.quoteWei, cv.tokenReserveWei);
          if (tokensOut > cv.sellableWei) tokensOut = cv.sellableWei;
          if (tokensOut < minOut) revert('slippage: tokensOut below minimum');
          if (!dry) {
            acct(from).balance -= value; cv.realWei += net; cv.quoteWei += net; cv.tokenReserveWei -= tokensOut; cv.sellableWei -= tokensOut;
            setTokBal(e.token, recipient, tokBal(e.token, recipient) + tokensOut);
            if (cv.realWei >= cv.thrWei) cv.ready = true;
            log(to, [T.BUY, pad(from), pad(recipient)], '0x' + word(quoteIn) + word(tokensOut) + word(fee) + word(tax));
            log(e.token, [T.TRANSFER, pad(to), pad(recipient)], '0x' + word(tokensOut));
          }
          return { result: enc(fn, tokensOut), logs };
        }
        case 'sell': {
          const [tokensIn, minOut, recipient] = a;
          if (cv.graduated || cv.ready || cv.phase !== 0) revert('curve closed');
          if (tokBal(e.token, from) < tokensIn) revert('ERC20: transfer amount exceeds balance');
          if (allowance(e.token, from, to) < tokensIn) revert('ERC20: insufficient allowance');
          const gross = amountOut(tokensIn, cv.tokenReserveWei, cv.quoteWei);
          const fee = gross * cv.feeBps / BPS, tax = (gross - fee) * cv.creatorTaxBps / BPS, quoteOut = gross - fee - tax;
          if (quoteOut < minOut) revert('slippage: quoteOut below minimum');
          if (!dry) {
            setTokBal(e.token, from, tokBal(e.token, from) - tokensIn); cv.tokenReserveWei += tokensIn; cv.sellableWei += tokensIn; cv.quoteWei -= gross; cv.realWei -= gross;
            acct(recipient).balance += quoteOut;
            log(to, [T.SELL, pad(from), pad(recipient)], '0x' + word(tokensIn) + word(quoteOut) + word(fee) + word(tax));
            log(e.token, [T.TRANSFER, pad(from), pad(to)], '0x' + word(tokensIn));
          }
          return { result: enc(fn, quoteOut), logs };
        }
        default: return { result: '0x' };
      }
    }
    if (tk) {
      switch (fn) {
        case 'symbol': return { result: abiStr(tk.symbol) };
        case 'name': return { result: abiStr(tk.name) };
        case 'decimals': return { result: '0x' + word(18) };
        case 'totalSupply': return { result: '0x' + word(tk.supply) };
        case 'balanceOf': return { result: '0x' + word(tokBal(to, a[0])) };
        case 'getTokenInfo': { const sc = tk.socials; return { result: enc(fn, [getAddress(state.curves[tk.curve].launch.deployer), 'https://mock/logo.png', tk.description, [sc.twitter || '', sc.telegram || '', sc.discord || '', sc.website || '', sc.farcaster || '']]) }; }
        case 'allowance': return { result: '0x' + word(allowance(to, a[0], a[1])) };
        case 'approve': { if (!dry) { tk.allowances[from + ':' + low(a[0])] = a[1]; log(to, [T.APPROVAL, pad(from), pad(a[0])], '0x' + word(a[1])); } return { result: '0x' + word(1), logs }; }
        default: return { result: '0x' };
      }
    }
    if (to === FACTORY) {
      switch (fn) {
        case 'getLaunchedToken': {
          const t = low(a[0]); const tkn = state.tokens[t]; if (!tkn) return { result: enc(fn, [ZERO, ZERO, ZERO, ZERO, ZERO, 0n, 0, 0, 0, false, 0, 0n, 0n, 0n, false]) };
          const c = state.curves[tkn.curve], e = c.launch;
          return { result: enc(fn, [getAddress(e.token), getAddress(e.curve), getAddress(e.deployer), getAddress((state.tokens[low(e.token)] || {}).feeRecipient || e.deployer), getAddress(e.pair), c.thrWei, 0, 200, Number(c.creatorTaxBps), false, c.phase, c.phase ? wei(4.2) : 0n, c.phase ? 3000000n * ETH : 0n, c.phase ? BigInt(blockTs(e.bn + 300)) : 0n, true]) };
        }
        case 'pairTokenEconomics': return { result: enc(fn, [state.phantom, 4200000000000000000n, 18]) };
        case 'snipeTaxStartBps': return { result: enc(fn, 9900n) };
        case 'snipeTaxSeconds': return { result: enc(fn, 30n) };
        default: return { result: '0x' };
      }
    }
    if (to === MULTICALL3 && fn === 'aggregate3') {
      const results = a[0].map(cl => { try { const r = exec(from, cl.target, cl.callData, 0n, true); return { success: true, returnData: r.result || '0x' }; } catch (e) { if (!cl.allowFailure) throw e; return { success: false, returnData: '0x' }; } });
      return { result: enc(fn, results) };
    }
    if (to === ESCROW) {
      if (fn === 'balanceOf') return { result: '0x' + word(state.escrow[low(a[0])] || 0n) };
      if (fn === 'claim') { const amt = state.escrow[from] || 0n; if (amt <= 0n) revert('nothing to claim'); if (!dry) { state.escrow[from] = 0n; acct(from).balance += amt; log(to, [T.CLAIMED, pad(from)], '0x' + word(amt)); } return { result: enc(fn, amt), logs }; }
      return { result: '0x' };
    }
    if (to === PERMIT2) {
      if (fn === 'allowance') { const k = low(a[0]) + ':' + low(a[1]) + ':' + low(a[2]); const p = state.permit2[k] || { amount: 0n, exp: 0 }; return { result: '0x' + word(p.amount) + word(p.exp) + word(0) }; }
      if (fn === 'approve') { if (!dry) state.permit2[from + ':' + low(a[0]) + ':' + low(a[1])] = { amount: a[2], exp: Number(a[3]) }; return { result: '0x', logs }; }
      return { result: '0x' };
    }
    if (to === QUOTER && fn === 'quoteExactInputSingle') {
      const p = a[0]; const key = p.poolKey || p[0]; const c0 = low(key.currency0 != null ? key.currency0 : key[0]), c1 = low(key.currency1 != null ? key.currency1 : key[1]);
      const zeroForOne = p.zeroForOne != null ? p.zeroForOne : p[1], amt = p.exactAmount != null ? p.exactAmount : p[2];
      const cIn = zeroForOne ? c0 : c1; const sellingToken = cIn !== ZERO;
      if (c0 !== ZERO || !poolOf(c1)) revert('pool not initialised');
      return { result: enc(fn, [poolQuote(c1, sellingToken, amt), 21000n]) };
    }
    if (to === STATE_VIEW && fn === 'getSlot0') { const known = Object.keys(state.pools).some(t => poolIdOf(t) === low(a[0])); return { result: enc(fn, [known ? 79228162514264337593543950336n : 0n, 0, 0, 3000]) }; }
    if (to === ROUTER && fn === 'execute') {
      const [commands, inputs] = a;
      if (commands !== '0x10') revert('unknown command');
      const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], inputs[0]);
      if (actions !== '0x060c0f') revert('unexpected actions');
      const KEY = { type: 'tuple', components: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }] };
      const layouts = { current: [{ type: 'tuple', components: [KEY, { type: 'bool' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint256' }, { type: 'bytes' }] }], legacy: [{ type: 'tuple', components: [KEY, { type: 'bool' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }] }] };
      let sw = null;
      try { sw = decodeAbiParameters(layouts[state.routerLayout], params[0])[0]; if (encodeAbiParameters(layouts[state.routerLayout], [sw]).toLowerCase() !== params[0].toLowerCase()) throw new Error('bad'); if (state.routerLayout === 'current' && sw[4] !== 0n) throw new Error('bad'); } catch (e) { revert('bad swap params'); }
      const key = sw[0], zeroForOne = sw[1], amountIn = sw[2], minOut = sw[3];
      const c0 = low(key[0]), c1 = low(key[1]), tk1 = c1, pool = poolOf(tk1);
      if (c0 !== ZERO || !pool || low(key[4]) !== HOOK) revert('pool not initialised');
      const cIn = zeroForOne ? c0 : c1;
      if (cIn === ZERO) { /* buy the token with ETH */
        if (value !== amountIn) revert('value mismatch'); if (acct(from).balance < value) revert('insufficient funds');
        const out = poolQuote(tk1, false, amountIn); if (out < minOut) revert('too little received');
        if (!dry) { acct(from).balance -= value; pool.eth += amountIn; pool.tok -= out; setTokBal(tk1, from, tokBal(tk1, from) + out); log(tk1, [T.TRANSFER, pad(PAIR), pad(from)], '0x' + word(out)); }
        return { result: '0x', logs };
      }
      /* sell the token for ETH, paid through permit2 */
      if (tokBal(tk1, from) < amountIn) revert('ERC20: transfer amount exceeds balance');
      if (allowance(tk1, from, PERMIT2) < amountIn) revert('TRANSFER_FROM_FAILED');
      const p2 = state.permit2[from + ':' + tk1 + ':' + ROUTER]; if (!p2 || p2.amount < amountIn || p2.exp < Math.floor(Date.now() / 1000)) revert('AllowanceExpired');
      const out = poolQuote(tk1, true, amountIn); if (out < minOut) revert('too little received');
      if (!dry) { setTokBal(tk1, from, tokBal(tk1, from) - amountIn); pool.tok += amountIn; pool.eth -= out; acct(from).balance += out; log(tk1, [T.TRANSFER, pad(from), pad(PAIR)], '0x' + word(amountIn)); }
      return { result: '0x', logs };
    }
    return { result: '0x' };
  }
  function ethCall(p) { const r = exec(p.from || ZERO, p.to, p.data || '0x', p.value ? BigInt(p.value) : 0n, true); return r.result; }
  function mine(raw) {
    const tx = parseTransaction(raw);
    return recoverTransactionAddress({ serializedTransaction: raw }).then(from => {
      from = low(from);
      const ac = acct(from);
      if (tx.chainId !== 4663) revert('wrong chain id ' + tx.chainId);
      if (Number(tx.nonce) !== ac.nonce) revert('nonce too ' + (Number(tx.nonce) < ac.nonce ? 'low' : 'high'));
      const hash = keccak256(raw);
      const r = exec(from, tx.to, tx.data || '0x', tx.value || 0n, false);
      ac.nonce++; state.head++;
      const gasWei = state.gasUsed * state.gasPrice; ac.balance -= gasWei;
      const bn = state.head, bh = '0x' + word(bn);
      const logs = (r.logs || []).map((l, i) => Object.assign({ blockNumber: hex(bn), transactionHash: hash, transactionIndex: '0x0', blockHash: bh, logIndex: hex(i), removed: false }, l));
      state.mined = (state.mined || []).concat(logs);
      state.receipts[hash] = { transactionHash: hash, transactionIndex: '0x0', blockHash: bh, blockNumber: hex(bn), from, to: low(tx.to), cumulativeGasUsed: hex(state.gasUsed), gasUsed: hex(state.gasUsed), effectiveGasPrice: hex(state.gasPrice), contractAddress: null, logs, logsBloom: '0x' + '0'.repeat(512), status: '0x1', type: '0x2' };
      state.txs[hash] = { hash, from, to: low(tx.to), value: hex(tx.value || 0n), input: tx.data || '0x', nonce: hex(tx.nonce), blockNumber: hex(bn), blockHash: bh, transactionIndex: '0x0', gas: hex(state.gasUsed), maxFeePerGas: hex(tx.maxFeePerGas || state.gasPrice), maxPriorityFeePerGas: hex(tx.maxPriorityFeePerGas || 0n), type: '0x2', chainId: '0x1237', v: '0x0', r: '0x0', s: '0x0' };
      state.sent.push({ hash, from, to: low(tx.to), fn: (decode(tx.data || '0x') || {}).functionName, value: tx.value || 0n });
      return hash;
    });
  }
  function block(n) { return { number: hex(n), hash: '0x' + word(n), parentHash: '0x' + word(n - 1), timestamp: hex(blockTs(n)), transactions: [], baseFeePerGas: hex(state.gasPrice), gasLimit: '0x1c9c380', gasUsed: '0x5208', miner: ZERO, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', nonce: '0x0000000000000000', size: '0x200', logsBloom: '0x' + '0'.repeat(512), sha3Uncles: '0x' + word(0), stateRoot: '0x' + word(1), receiptsRoot: '0x' + word(2), transactionsRoot: '0x' + word(3), mixHash: '0x' + word(0), uncles: [] }; }

  async function rpc(body) {
    const m = body.method, p = body.params || [];
    switch (m) {
      case 'eth_chainId': return '0x1237';
      case 'eth_blockNumber': return hex(state.head);
      case 'eth_getCode': { const a = low(p[0]); return a === FACTORY || state.curves[a] || state.tokens[a] || [ROUTER, QUOTER, STATE_VIEW, PERMIT2, ESCROW, MULTICALL3].includes(a) ? '0x6080604052' : '0x'; }
      case 'eth_getBlockByNumber': { const n = p[0] === 'latest' || p[0] === 'pending' ? state.head : parseInt(p[0], 16); return block(n); }
      case 'eth_getLogs': { const f = p[0] || {}; const from = f.fromBlock === undefined || f.fromBlock === 'earliest' ? 0 : parseInt(f.fromBlock, 16), to = f.toBlock === 'latest' || f.toBlock === undefined ? state.head : parseInt(f.toBlock, 16); if (opts.rangeLimit && to - from > opts.rangeLimit) { const e = new Error('query returned more than 10000 results, try a smaller range'); e.code = -32005; throw e; } return anyLogs(f.address, from, to, f.topics); }
      case 'eth_call': return ethCall(p[0]);
      case 'eth_estimateGas': { exec(p[0].from || ZERO, p[0].to, p[0].data || '0x', p[0].value ? BigInt(p[0].value) : 0n, true); return hex(state.gasUsed); }
      case 'eth_getBalance': return hex(acct(p[0]).balance);
      case 'eth_getTransactionCount': return hex(acct(p[0]).nonce);
      case 'eth_gasPrice': return hex(state.gasPrice);
      case 'eth_maxPriorityFeePerGas': return hex(state.gasPrice / 10n);
      case 'eth_feeHistory': return { oldestBlock: hex(state.head - 4), baseFeePerGas: [hex(state.gasPrice), hex(state.gasPrice), hex(state.gasPrice), hex(state.gasPrice), hex(state.gasPrice)], gasUsedRatio: [0.1, 0.1, 0.1, 0.1], reward: [[hex(state.gasPrice / 10n)], [hex(state.gasPrice / 10n)], [hex(state.gasPrice / 10n)], [hex(state.gasPrice / 10n)]] };
      case 'eth_sendRawTransaction': return mine(p[0]);
      case 'eth_getTransactionReceipt': { if (state.receipts[p[0]]) return state.receipts[p[0]]; const e = state.launches.find(x => x.tx === p[0]); if (!e) return null; const cv = state.curves[e.curve]; return { transactionHash: e.tx, blockNumber: hex(e.bn), status: '0x1', logs: [launchLog(e)].concat(cv.dev ? [buyLog(e.curve, e.deployer, e.bn, cv.dev, cv.devTokens, 0)] : []) }; }
      case 'eth_getTransactionByHash': { if (state.txs[p[0]]) return state.txs[p[0]]; const e = state.launches.find(x => x.tx === p[0]); if (!e) return null; const tk = state.tokens[e.token], sc = tk.socials; const input = encodeFunctionData({ abi: PONS.ABI.router, functionName: 'launchAndBuy', args: [{ name: tk.name, symbol: tk.symbol, logo: 'https://mock/logo.png', description: tk.description, socials: { twitter: sc.twitter || '', telegram: sc.telegram || '', discord: sc.discord || '', website: sc.website || '', farcaster: sc.farcaster || '' }, creatorFeeRecipient: getAddress(tk.feeRecipient), creatorTaxBps: Number(state.curves[e.curve].creatorTaxBps), buybackEnabled: false, expectedEconomics: '0x' + word(1), salt: '0x' + word(7) }, 0n, getAddress(e.pair), wei(state.curves[e.curve].dev), 0n, getAddress(e.deployer), tk.exempt.map(a => getAddress(a))] }); return { hash: e.tx, from: e.deployer, to: LAUNCH_ROUTER, blockNumber: hex(e.bn), input, value: hex(wei(state.curves[e.curve].dev)) }; }
      default: { const e = new Error('method not found: ' + m); e.code = -32601; throw e; }
    }
  }
  /* the dex's view of that same pool: price and depth read off the reserves above, not typed in beside them */
  const PRICE0 = 1.70068e-7 * ETHUSD;   /* 14.2857 ETH / 84.0M tokens = 1.70068e-7 ETH, at the mock's one ether price */
  const LIQ0 = 2 * 14.2857 * ETHUSD;    /* both sides of that pool in dollars, the way an aggregator reports it */
  const pairObj = () => ({ chainId: 'robinhood', dexId: 'uniswap', pairAddress: PAIR, url: 'https://dexscreener.com/robinhood/' + PAIR, baseToken: { address: TOKEN, name: 'Mock Token', symbol: 'MOCK' }, quoteToken: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', symbol: 'WETH' }, priceUsd: String(state.price || PRICE0), priceNative: String((state.price || PRICE0) / ETHUSD), liquidity: { usd: state.liq || LIQ0, quote: (state.liq || LIQ0) / (2 * ETHUSD), base: 8.4e7 }, marketCap: (state.price || PRICE0) * 1e9, fdv: (state.price || PRICE0) * 1e9, volume: { h24: 400000, m5: 1800, h1: 25000, h6: 150000 },
    /* the pool opened five hours ago at 4.2 ETH against 285.71M tokens, which is 1.47e-8 ETH a token; it is at
       1.70068e-7 now, so its whole life is +1057%. the pair is younger than a day, so the 6 h and 24 h windows are
       the same window. $400K of volume against $42K of net buying is churn, which is what the turnover line says. */
    priceChange: { m5: state.chg5 == null ? 0.3 : state.chg5, h1: 12, h6: 1056.9, h24: 1056.9 }, txns: { m5: { buys: state.buys5 == null ? 10 : state.buys5, sells: state.sells5 == null ? 8 : state.sells5 }, h1: { buys: 200, sells: 180 }, h6: { buys: 1200, sells: 1100 }, h24: { buys: 2500, sells: 2300 } }, pairCreatedAt: Date.now() - 5 * 3600000, info: { socials: [{ type: 'twitter', url: 'https://x.com/x' }] } });
  const iso = s => new Date(Date.now() - s * 1000).toISOString().replace('Z', '.000000Z');
  function explorer(path) {
    const p = path.replace(/^\/api\/v2\//, '').split('?')[0].toLowerCase();
    if (p === 'stats') return { total_blocks: String(state.head), gas_prices: { average: 0.01 }, transactions_today: '1200000' };
    if (p === 'blocks') { const items = []; for (let i = 0; i < 50; i++) items.push({ height: state.head - i, timestamp: iso(i * 0.25) }); return { items }; }
    if (/^blocks\/\d+$/.test(p)) { const n = parseInt(p.split('/')[1], 10); return { height: n, timestamp: new Date(blockTs(n) * 1000).toISOString() }; }
    if (p === 'addresses/' + FACTORY + '/logs') return { items: factoryLogs(0, state.head, null).slice(0, 50).map(l => ({ address: { hash: FACTORY }, block_number: parseInt(l.blockNumber, 16), index: parseInt(l.logIndex, 16), transaction_hash: l.transactionHash, topics: l.topics, data: l.data })), next_page_params: null };
    let m;
    if ((m = p.match(/^tokens\/(0x[0-9a-f]{40})$/))) { const tk = state.tokens[m[1]]; if (!tk) return { status: 404, body: { message: 'Not found' } }; return { symbol: tk.symbol, name: tk.name, decimals: '18', total_supply: String(tk.supply), holders: tk.holders || (m[1] === TOKEN ? '1234' : '17'), icon_url: null }; }
    if ((m = p.match(/^tokens\/(0x[0-9a-f]{40})\/holders$/))) return { items: [{ address: { hash: PAIR }, value: '28000000000000000000000000' }, { address: { hash: '0xaaa1' }, value: '30000000000000000000000000' }, { address: { hash: '0xaaa2' }, value: '21000000000000000000000000' }, { address: { hash: '0xaaa3' }, value: '9000000000000000000000000' }] };
    if ((m = p.match(/^tokens\/(0x[0-9a-f]{40})\/transfers$/))) return { items: [{ total: { value: '500000000000000000000000', decimals: '18' }, from: { hash: PAIR }, to: { hash: '0xbuyer' }, timestamp: iso(20), transaction_hash: '0x' + 'ef'.repeat(32) }] };
    if (/^smart-contracts\//.test(p)) return { is_verified: true };
    if ((m = p.match(/^addresses\/(0x[0-9a-f]{40})$/))) { const a = m[1]; if (state.tokens[a]) { const le = state.launches.find(x => x.token === a); return { hash: a, is_contract: true, creator_address_hash: '0x3711cea4feade896c913c68f01eda97cb06d1a42', creation_transaction_hash: le ? le.tx : null }; } if (a === DEP1) return { hash: a, coin_balance: '830000000000000000', is_contract: false }; if (a === DEP2) return { hash: a, coin_balance: '2100000000000000', is_contract: false }; return { hash: a, coin_balance: String(acct(a).balance), is_contract: false }; }
    if ((m = p.match(/^addresses\/(0x[0-9a-f]{40})\/counters$/))) return { transactions_count: m[1] === DEP1 ? '412' : '38', token_transfers_count: '1930', gas_usage_count: '1', validations_count: '0' };
    if ((m = p.match(/^addresses\/(0x[0-9a-f]{40})\/transactions$/))) { const items = []; const n = m[1] === DEP1 ? 50 : 12; for (let i = 0; i < n; i++) items.push({ to: { hash: (m[1] === DEP1 ? i % 7 === 0 : i === 3) ? FACTORY : '0x9999999999999999999999999999999999999999' }, method: (m[1] === DEP1 ? i % 7 === 0 : i === 3) ? 'launch' : 'transfer', timestamp: iso(60 * i + 30) }); return { items, next_page_params: m[1] === DEP1 ? { block_number: 1 } : null }; }
    if ((m = p.match(/^transactions\/(0x[0-9a-f]{64})$/))) { const e = state.launches.find(x => x.tx === m[1]); return e ? { hash: e.tx, from: { hash: e.deployer }, to: { hash: FACTORY }, timestamp: new Date(blockTs(e.bn) * 1000).toISOString(), method: 'launch' } : { status: 404, body: { message: 'Not found' } }; }
    return { status: 404, body: { message: 'mock: no route for ' + p } };
  }
  const server = http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v))); };
    /* the mock's own levers, for rehearsals from another process: curl -X POST :4663/__mock/launch */
    if (req.method === 'POST' && (req.url || '').startsWith('/__mock/')) { let b = ''; req.on('data', c => b += c); req.on('end', () => { let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) { } const op = req.url.split('/')[2].split('?')[0]; try { const api = server.api; if (!api[op]) return send(404, { error: 'no lever ' + op }); const r = api[op](body); send(200, { ok: true, result: JSON.parse(JSON.stringify(r == null ? null : r, (k, v) => (typeof v === 'bigint' ? v.toString() : v))) }); } catch (e) { send(400, { error: e.message }); } }); return; }
    if (req.method === 'POST' && /^\/bot[^/]+\/sendMessage/.test(req.url || '')) { let b = ''; req.on('data', c => b += c); req.on('end', () => { let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) { } state.alerts.push({ chat: body.chat_id, text: body.text }); send(200, { ok: true, result: { message_id: state.alerts.length } }); }); return; }
    if (req.method === 'POST' && (req.url || '').startsWith('/webhook')) { let b = ''; req.on('data', c => b += c); req.on('end', () => { let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) { } state.alerts.push({ discord: true, text: body.content }); send(204, {}); }); return; }
    if (req.method === 'POST') {
      let b = ''; req.on('data', c => b += c); req.on('end', async () => {
        state.calls.rpc++; let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) { }
        const one = async q => { try { return { jsonrpc: '2.0', id: q.id || 1, result: await rpc(q) }; } catch (e) { return { jsonrpc: '2.0', id: q.id || 1, error: { code: e.code || -32000, message: e.message, data: e.data } }; } };
        if (Array.isArray(body)) { const out = []; for (const q of body) out.push(await one(q)); return send(200, out); }
        send(200, await one(body));
      });
      return;
    }
    const u = req.url || '/';
    if (u.startsWith('/latest/dex/tokens/')) { state.calls.dex++; const a = u.split('/tokens/')[1].toLowerCase(); const hit = DEX.pairs().filter(p => a.includes(p.baseToken.address.toLowerCase())); return send(200, { pairs: a.includes(TOKEN) ? [pairObj()].concat(hit) : hit }); }
    /* the two lists a caller walks to find what is trading: the recorded market, the mock's own graduated token and
       its thin pool, and one solana row, because the real endpoints answer for every chain and the caller filters */
    if (u.startsWith('/token-boosts')) { state.calls.dex++; return send(200, [{ chainId: 'robinhood', tokenAddress: TOKEN }, { chainId: 'solana', tokenAddress: 'So11111111111111111111111111111111111111112' }, { chainId: 'robinhood', tokenAddress: '0x9999999999999999999999999999999999999999' }].concat(DEX.addresses().slice(0, 6).map(a => ({ chainId: 'robinhood', tokenAddress: a })))); }
    if (u.startsWith('/token-profiles')) { state.calls.dex++; return send(200, [{ chainId: 'robinhood', tokenAddress: '0x9999999999999999999999999999999999999999' }, { chainId: 'robinhood', tokenAddress: '0x8888888888888888888888888888888888888888' }].concat(DEX.addresses().slice(6).map(a => ({ chainId: 'robinhood', tokenAddress: a })))); }
    /* the batch pairs endpoint: the fixture token's pool, a thin second pool for a second token, nothing for the rest */
    if (u.startsWith('/tokens/v1/robinhood/')) { state.calls.dex++; const list = u.split('/robinhood/')[1].toLowerCase().split(','); const out = []; if (list.includes(TOKEN)) out.push(pairObj()); if (list.includes('0x9999999999999999999999999999999999999999')) out.push(Object.assign(pairObj(), { pairAddress: '0x9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f', baseToken: { address: '0x9999999999999999999999999999999999999999', name: 'Thin Pool', symbol: 'THIN' }, priceUsd: '0.000012', priceNative: String(0.000012 / ETHUSD), liquidity: { usd: 3800, quote: 3800 / (2 * ETHUSD), base: 1.5e8 }, marketCap: 12000, fdv: 12000, volume: { h24: 210000, m5: 400, h1: 9000, h6: 60000 }, priceChange: { m5: -4.2, h1: -18, h6: -47, h24: -71 }, txns: { m5: { buys: 3, sells: 9 }, h1: { buys: 40, sells: 90 }, h6: { buys: 200, sells: 400 }, h24: { buys: 900, sells: 1500 } }, pairCreatedAt: Date.now() - 40 * 60000 })); DEX.pairs().forEach(p => { if (list.includes(p.baseToken.address.toLowerCase())) out.push(p); }); return send(200, out); }
    if (u.startsWith('/api/v2/')) { state.calls.explorer++; const r = explorer(u); if (r && r.status) return send(r.status, r.body); return send(200, r); }
    send(404, { message: 'mock: ' + u });
  });
  return new Promise(resolve => server.listen(opts.port || 0, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + server.address().port;
    const handle = { url, state, server, TOKEN, CURVE, DEP1, DEP2, FACTORY, env: { RPC_URL: url, EXPLORER_URL: url, DEX_URL: url }, close: () => new Promise(r => server.close(r)),
      balanceOf: a => acct(a).balance, tokenBalance: (t, a) => tokBal(t, a), curve: c => state.curves[low(c)],
      launchNow(sym, o) { o = o || {}; const i = state.launches.length; state.head += 4; const tok = '0x' + (0x5000 + i).toString(16).padStart(40, '0'), curve = '0xc' + (0x5000 + i).toString(16).padStart(39, '0'); const e = addLaunch(tok, curve, o.deployer || (i % 2 ? DEP1 : '0x' + 'f'.repeat(38) + (i % 100).toString().padStart(2, '0')), 0, Object.assign({ symbol: sym || ('NEW' + i), name: 'Fresh ' + i, real: 3 * 1.68 / 97, buys: 0, openTax: 9900 }, o)); setTimeout(() => { state.curves[curve].openTax = 0n; }, o.decayMs == null ? 800 : o.decayMs); return e; },
      /* another wallet buys on a curve: a CurveBuy lands in the mined logs, for follow to see */
      walletBuy(wallet, tok, ethAmount) { tok = low(tok); const cv = curveOf(tok); const data = encodeFunctionData({ abi: ABI, functionName: 'buy', args: [wei(ethAmount), 0n, getAddress(wallet)] }); const r = exec(wallet, state.tokens[tok].curve, data, wei(ethAmount), false); state.head++; const bn = state.head, hash = '0x' + word(BigInt(bn) * 7919n + 13n); const logs = (r.logs || []).map((l, i) => Object.assign({ blockNumber: hex(bn), transactionHash: hash, transactionIndex: '0x0', blockHash: '0x' + word(bn), logIndex: hex(i), removed: false }, l)); state.mined = state.mined.concat(logs); return { hash, bn }; },
      /* the deployer moves tokens out: a Transfer from its wallet (and a curve sell while the curve is open) */
      devSell(tok, pct) { tok = low(tok); const cv = curveOf(tok), e = cv.launch, tk = state.tokens[tok]; const amt = tk.supply * BigInt(Math.round((pct || 3) * 100)) / 10000n; state.head++; const bn = state.head, hash = '0x' + word(BigInt(bn) * 104729n + 5n); const mk = (address, topics, data, i) => ({ address, topics, data, blockNumber: hex(bn), transactionHash: hash, transactionIndex: '0x0', blockHash: '0x' + word(bn), logIndex: hex(i), removed: false }); /* on the curve a sell is a Transfer to the curve plus a CurveSell, like the real contract; after graduation the tokens go to the pool */ state.mined.push(mk(tok, [T.TRANSFER, pad(e.deployer), pad(cv.phase === 0 ? e.curve : '0x' + 'f0'.repeat(20))], '0x' + word(amt), 0)); if (cv.phase === 0) state.mined.push(mk(e.curve, [T.SELL, pad(e.deployer), pad(e.deployer)], '0x' + word(amt) + word(wei(0.02)) + word(wei(0.0002)) + word(wei(0.0002)), 1)); return { hash, bn, amount: amt }; },
      /* a curve graduates when it fills, so filling it is part of graduating: the reserve goes to the threshold and
         the token side to supply · 1.68 / 5.88 = 28.571%, and the pool opens with exactly that */
      graduate(tok) {
        tok = low(tok); const c = curveOf(tok);
        c.realWei = c.thrWei; c.quoteWei = state.phantom + c.thrWei;
        c.tokenReserveWei = BigInt(Math.round(1e9 * 1.68 / 5.88)) * ETH; c.sellableWei = 0n;
        c.graduated = true; c.ready = true; c.phase = 2; state.grads[tok] = state.head + 1; state.head += 2;
        state.pools[tok] = { eth: c.realWei, tok: c.tokenReserveWei, feeBps: 30n };
      },
      sweep(tok) { tok = low(tok); const c = curveOf(tok); c.ready = true; c.phase = 1; state.swept[tok] = state.head + 1; state.head += 2; },
      tick() { state.head += 2; } };
    /* the levers over http: launch {sym, decayMs}, walletBuy {wallet, token, eth}, devSell {token, pct}, graduate {token}, sweep {token}, crash {pct}, state */
    server.api = {
      launch: b => handle.launchNow(b.sym, b),
      walletBuy: b => handle.walletBuy(b.wallet, b.token, parseFloat(b.eth || '0.02')),
      devSell: b => handle.devSell(b.token, parseFloat(b.pct || '3')),
      graduate: b => { handle.graduate(b.token); return { token: b.token, phase: 2 }; },
      sweep: b => { handle.sweep(b.token); return { token: b.token, phase: 1 }; },
      crash: b => { state.liq = (state.liq || LIQ0) * (1 - parseFloat(b.pct || '30') / 100); state.chg5 = -parseFloat(b.pct || '30'); state.sells5 = 40; state.buys5 = 5; return { liq: state.liq }; },
      credit: b => { const r = low(b.recipient); state.escrow[r] = (state.escrow[r] || 0n) + wei(parseFloat(b.eth || '0.1')); state.head++; state.escrowLogs.push({ address: ESCROW, blockNumber: hex(state.head), logIndex: '0x0', transactionHash: '0x' + word(BigInt(state.head) * 31n), topics: [T.CREDITED, pad(r), pad(b.depositor || CURVE)], data: '0x' + word(wei(parseFloat(b.eth || '0.1'))), removed: false }); return { recipient: r, balance: state.escrow[r] }; },
      alerts: () => state.alerts,
      state: () => ({ head: state.head, launches: state.launches.length, sent: state.sent.length, alerts: state.alerts.length })
    };
    resolve(handle);
  }));
}
if (require.main === module) {
  start({ port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4663 }).then(m => {
    console.log('mock chain on ' + m.url + '\n  every wallet starts with 1 ETH here. point loxley at it:\n  RPC_URL=' + m.url + ' EXPLORER_URL=' + m.url + ' DEX_URL=' + m.url + ' node bin/loxley.js scan ' + m.TOKEN + '\n  a fresh launch lands every few seconds, its opening tax drops after a moment.');
    setInterval(() => { m.tick(); if (Math.random() < 0.15) { const e = m.launchNow(); console.log('launch ' + e.token); } }, 2000);
  });
}
module.exports = { start, TOKEN, CURVE, DEP1, DEP2, FACTORY, ROUTER, QUOTER, STATE_VIEW, PERMIT2, ESCROW, HOOK, T };
