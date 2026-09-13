'use strict';
/* token: everything the desk can find out about one address, in one call each */
const { pad32 } = require('./chain');
const isAddr = s => /^0x[0-9a-fA-F]{40}$/.test(String(s || ''));

/* the launch event for a token: the factory log with the token as its first indexed topic.
   one wide read first; if the node refuses the range, walk back in 50k-block steps. */
async function findLaunch(chain, token, head) {
  const topics = [chain.T.LAUNCH, '0x' + pad32(token)];
  try {
    const logs = await chain.call('eth_getLogs', [{ address: chain.factory, topics, fromBlock: '0x0', toBlock: 'latest' }]);
    if (Array.isArray(logs) && logs.length) return chain.parseFactoryLog(logs[0]);
    if (Array.isArray(logs)) return null;
  } catch (e) { /* range refused, walk back */ }
  head = head || await chain.blockNumber();
  for (let to = head, n = 0; to > 0 && n < 8; n++) {
    const from = Math.max(0, to - 50000);
    try { const logs = await chain.call('eth_getLogs', [{ address: chain.factory, topics, fromBlock: chain.dec.hex(from), toBlock: chain.dec.hex(to) }]); if (Array.isArray(logs) && logs.length) return chain.parseFactoryLog(logs[0]); }
    catch (e) { const logs = await chain.getLogs(chain.factory, topics, from, to, { wide: true }).catch(() => []); if (logs.length) return chain.parseFactoryLog(logs[0]); }
    to = from - 1;
  }
  return null;
}
async function graduationOf(chain, token, launch, head) {
  const topics = [chain.GRADS, '0x' + pad32(token)];
  try { const logs = await chain.call('eth_getLogs', [{ address: chain.factory, topics, fromBlock: chain.dec.hex(launch ? launch.bn : 0), toBlock: 'latest' }]); if (Array.isArray(logs) && logs.length) return chain.parseFactoryLog(logs[0]); }
  catch (e) { if (launch) { const logs = await chain.getLogs(chain.factory, topics, launch.bn, head || await chain.blockNumber(), { wide: true }).catch(() => []); if (logs.length) return chain.parseFactoryLog(logs[0]); } }
  return null;
}

async function readToken(ctx, token, opts) {
  opts = opts || {};
  const { chain, sources, env } = ctx;
  token = token.toLowerCase();
  const out = { token, at: Date.now() };
  const head = await chain.blockNumber().catch(() => null);
  out.head = head;
  const [pairs, view, tk, launch] = await Promise.all([
    sources.dex.pairs(token),
    sources.chainView(token),
    chain.tokenRead(token),
    opts.noLaunch ? null : findLaunch(chain, token, head).catch(() => null)
  ]);
  out.pairs = pairs || []; out.pair = out.pairs[0] || null; out.view = view; out.tk = tk; out.launch = launch;
  out.symbol = (out.pair && out.pair.baseToken && out.pair.baseToken.symbol) || tk.symbol || (view && view.symbol) || null;
  out.name = (out.pair && out.pair.baseToken && out.pair.baseToken.name) || tk.name || (view && view.name) || null;
  out.supply = tk.supply || (view && view.supply) || null;
  if (launch) {
    const bt = head ? await chain.measureBlockTime(head).catch(() => null) : null;
    out.blockTime = bt ? bt.blockTime : 0.25; out.headAt = bt ? bt.headAt : Date.now();
    out.launchAt = out.headAt - (head - launch.bn) * out.blockTime * 1000;
    const [curve, grad, dev] = await Promise.all([chain.curveRead(launch.curve, { full: true, tax: true }), graduationOf(chain, token, launch, head), chain.devBuy(launch, out.supply)]);
    out.curve = curve; out.grad = grad; out.devBuy = dev;
    /* the curve stops taking trades the moment it graduates, so read to the graduation block and not to the head:
       on a token that graduated hours ago that is the difference between three hundred blocks and a hundred
       thousand, and every log past it would be a log that cannot exist. */
    if (opts.buyers !== false) out.buyers = await chain.curveBuyers(launch, grad && grad.bn ? grad.bn : head, out.supply).catch(() => null);
    out.pairIsEth = launch.pair === chain.ZERO;
    out.pairSym = out.pairIsEth ? 'ETH' : ((await chain.tokenRead(launch.pair).catch(() => null)) || {}).symbol || launch.pair.slice(0, 8);
    out.blockNow = head;
  }
  if (opts.xray !== false) out.xray = await sources.xray(token, launch ? { deployer: launch.deployer, born: out.launchAt } : null).catch(() => null);
  return out;
}
module.exports = { isAddr, findLaunch, graduationOf, readToken };
