'use strict';
/* pons: the reads that need an abi decoder rather than a selector and a word: the token's own metadata
   (getTokenInfo: logo, description, socials), the launch calldata (launchAndBuy: the declared bundle, the fee
   recipient), the fee escrow (Credited / Claimed, balanceOf, claim), and the links every card ends with. */
const { decodeFunctionResult, decodeFunctionData, decodeEventLog, encodeFunctionData, parseAbi, getAddress } = require('./deps');

const ABI = {
  token: parseAbi(['function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, (string twitter, string telegram, string discord, string website, string farcaster) tokenSocials)']),
  router: parseAbi([
    'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
    'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
    'function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)'
  ]),
  escrow: parseAbi([
    'function balanceOf(address recipient) view returns (uint256)',
    'function claim() returns (uint256 amount)',
    'event Credited(address indexed recipient, address indexed depositor, uint256 amount)',
    'event Claimed(address indexed recipient, uint256 amount)'
  ])
};
const T = {
  CREDITED: '0x4e45da441832cf53bdaa69235704fc0575e68210f459ee1562911024b12967d5',
  CLAIMED: '0xd8138f8a3f377c5259ca548e70e4c2de94f129f5a11036a15b69513cba2b426a'
};
const SEL = { getTokenInfo: '0xabb1dc44', launchAndBuy: '0xf85f8e41', claim: '0x4e71d92d' };
const pad32 = a => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const clean = s => { s = String(s || '').trim(); return s.length ? s : null; };

/* ---------- the token's own metadata ---------- */
async function tokenInfo(chain, token) {
  const r = await chain.call('eth_call', [{ to: token, data: SEL.getTokenInfo }, 'latest']).catch(() => null);
  if (!r || r === '0x' || r.length < 10) return null;
  try {
    const d = decodeFunctionResult({ abi: ABI.token, functionName: 'getTokenInfo', data: r });
    const s = d[3] || {};
    const socials = { twitter: clean(s.twitter), telegram: clean(s.telegram), discord: clean(s.discord), website: clean(s.website), farcaster: clean(s.farcaster) };
    const count = Object.values(socials).filter(Boolean).length;
    return { deployer: String(d[0]).toLowerCase(), logo: clean(d[1]), description: clean(d[2]), socials, count, has: count > 0 };
  } catch (e) { return null; }
}
/* ---------- the launch calldata: what the deployer declared ---------- */
function decodeLaunch(input) {
  if (!input || typeof input !== 'string' || input.slice(0, 10).toLowerCase() !== SEL.launchAndBuy) return null;
  try {
    const d = decodeFunctionData({ abi: ABI.router, data: input });
    const [params, launchConfigId, pairToken, quoteIn, minTokensOut, recipient, exemptions] = d.args;
    const socials = params.socials || {};
    return {
      name: params.name, symbol: params.symbol, logo: clean(params.logo), description: clean(params.description),
      socials: { twitter: clean(socials.twitter), telegram: clean(socials.telegram), discord: clean(socials.discord), website: clean(socials.website), farcaster: clean(socials.farcaster) },
      creatorFeeRecipient: String(params.creatorFeeRecipient).toLowerCase(), creatorTaxBps: Number(params.creatorTaxBps), buybackEnabled: !!params.buybackEnabled,
      launchConfigId: Number(launchConfigId), pairToken: String(pairToken).toLowerCase(), quoteIn, minTokensOut, recipient: String(recipient).toLowerCase(),
      exempt: (exemptions || []).map(a => String(a).toLowerCase())
    };
  } catch (e) { return null; }
}
async function launchDeclared(chain, launch) {
  const tx = await chain.tx(launch.tx); if (!tx) return null;
  return Object.assign({ from: (tx.from || '').toLowerCase(), to: (tx.to || '').toLowerCase() }, decodeLaunch(tx.input) || { exempt: null });
}
/* ---------- the fee escrow ---------- */
function makeEscrow(chain, env) {
  const escrow = String(env.PONS_ESCROW || '').toLowerCase();
  const dec = chain.dec;
  async function balanceOf(who) {
    const r = await chain.ethCall(escrow, '0x70a08231' + pad32(who)); return r == null ? null : dec.decBig(r);
  }
  /* every Credited to a recipient in a block range, split by depositor (the curve, then the pool hook after graduation) */
  async function credited(recipient, from, to) {
    const logs = await chain.getLogs(escrow, [T.CREDITED, '0x' + pad32(recipient)], from, to, { wide: true }).catch(() => []);
    return logs.map(lg => { try { const d = decodeEventLog({ abi: ABI.escrow, data: lg.data, topics: lg.topics }); return { bn: dec.decUint(lg.blockNumber), tx: lg.transactionHash, depositor: String(d.args.depositor).toLowerCase(), amount: d.args.amount }; } catch (e) { return null; } }).filter(Boolean);
  }
  async function claimed(recipient, from, to) {
    const logs = await chain.getLogs(escrow, [T.CLAIMED, '0x' + pad32(recipient)], from, to, { wide: true }).catch(() => []);
    return logs.map(lg => { try { const d = decodeEventLog({ abi: ABI.escrow, data: lg.data, topics: lg.topics }); return { bn: dec.decUint(lg.blockNumber), tx: lg.transactionHash, amount: d.args.amount }; } catch (e) { return null; } }).filter(Boolean);
  }
  const claimData = () => encodeFunctionData({ abi: ABI.escrow, functionName: 'claim' });
  return { address: escrow, balanceOf, credited, claimed, claimData, ABI: ABI.escrow };
}

/* ---------- links: the same four every card ends with ---------- */
function makeLinks(env) {
  const axiomRef = env.REF_AXIOM == null ? 'shmidtqq' : String(env.REF_AXIOM).trim();
  const fomoRef = env.REF_FOMO == null ? 'shmidtqq' : String(env.REF_FOMO).trim();
  return {
    pons: token => 'https://www.ponsfamily.com/token/' + token,
    axiom: curve => 'https://axiom.trade/meme/' + String(curve).toLowerCase() + '?chain=robinhood',
    fomo: token => 'https://fomo.family/tokens/robinhood/' + String(token).toLowerCase(),
    explorer: token => env.EXPLORER_URL.replace(/\/$/, '') + '/token/' + token,
    tx: h => env.EXPLORER_URL.replace(/\/$/, '') + '/tx/' + h,
    address: a => env.EXPLORER_URL.replace(/\/$/, '') + '/address/' + a,
    dexscreener: token => 'https://dexscreener.com/' + env.CHAIN_SLUG + '/' + String(token).toLowerCase(),
    signup: { axiom: axiomRef ? 'https://axiom.trade/@' + axiomRef : null, fomo: fomoRef ? 'https://fomo.family/r/' + fomoRef : null }
  };
}

module.exports = { ABI, T, SEL, tokenInfo, decodeLaunch, launchDeclared, makeEscrow, makeLinks, getAddress };
