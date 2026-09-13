'use strict';
/* loxley · the exit desk for Robinhood Chain, in a terminal.
   reads by default. the wallet, and everything that can move money, lives in cli/wallet.js and cli/trade.js. */
const path = require('path');
const { load } = require('./env');
const ui = require('./ui');
const { makeChain } = require('./chain');
const { makeSources } = require('./sources');
const VERSION = require('../package.json').version;

const COMMANDS = {
  tour: { file: 'tour', h: 'the whole desk in one command, against the mock chain in the tree: no wallet, no money, no install', a: '[--fast] [--step]' },
  doctor: { file: 'doctor', h: 'is the chain there, does the explorer answer, is the factory where we think', a: '[--probe]' },
  market: { file: 'market', h: 'what is trading on Robinhood Chain right now: every token DexScreener lists on the chain, its deepest pool, the desk\'s stamp', a: '[--top N] [--by liq|vol|age|change|score] [--token 0x…] [--json]' },
  hunt: { file: 'hunt', h: 'every pons v2 launch as it lands, read and scored, with +15 s and +60 s follow-ups', a: '[--window N] [--for S] [--fire-only] [--no-follow] [--json] [--sim]' },
  radar: { file: 'radar', h: 'the launch radar, drawn in the terminal', a: '[--window N] [--for S] [--sim]' },
  scan: { file: 'scan', h: 'everything about one token: curve or pool, council, x-ray, the door', a: '<token>' },
  watch: { file: 'watch', h: 'the exit watch: one line per poll, the siren when the pool turns, a black box if you ask', a: '<token> [--every S] [--for S] [--rec FILE] [--sim]' },
  xray: { file: 'xray', h: 'the deployer behind a token, or a wallet directly', a: '<token|wallet>' },
  exit: { file: 'exit', h: 'what leaving costs right now', a: '<token> [eth]' },
  snipe: { file: 'snipe', h: 'the sniper: fires on paper by default, with --live from the wallet; --grad fires on graduation instead', a: '[--live] [--grad] [--eth X] [--budget X] [--min-score N] [--max-open N] [--keyword RE] [--for S] [--exit-on-stop] [--sim]' },
  wallet: { file: 'wallet', h: 'the wallet: show it, import a key or a seed phrase into an encrypted keystore, make a burner, forget it', a: '[show|import|new|forget|balance]' },
  buy: { file: 'buy', h: 'buy a token with ETH, on the curve or in the pool by phase. plan, simulate, ask, send', a: '<token> <eth> [--slippage BPS] [--max-tax BPS] [--dry] [--yes]' },
  sell: { file: 'sell', h: 'sell what the wallet holds of a token, all or a part, wherever the launch trades now', a: '<token> [all|half|25%|1.5m] [--slippage BPS] [--dry] [--yes]' },
  positions: { file: 'positions', h: 'the book: every fill loxley made, marked live, with what leaving fetches right now', a: '[--all] [--json] [--clear --yes]' },
  profile: { file: 'profile', h: 'the desk\'s record: fires, wins, what came back, the exits by reason, a month of p&l, the launches refused and why', a: '[--days N] [--json]' },
  follow: { file: 'follow', h: 'copy the entries of wallets you trust: every CurveBuy they make is read, ruled and mirrored with your size', a: '<wallet…> [--live] [--eth X] [--any] [--for S]' },
  fees: { file: 'fees', h: 'who is paid on a token: recipient, credited from the curve and the pool, every claim', a: '<token>' },
  dev: { file: 'dev', h: 'one deployer: every launch by it in the window, with its phase', a: '<wallet> [--window N]' },
  claim: { file: 'claim', h: 'take your creator fees out of the escrow', a: '[--dry] [--yes]' },
  replay: { file: 'replay', h: 'play a black box (from the desk or from watch --rec) back in the terminal', a: '<file.json> [--speed N]' },
  desk: { file: 'desk', h: 'open the browser desk on a token', a: '[token]' },
  help: { file: null, h: 'this list', a: '' }
};

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k.startsWith('no-')) { out.flags[k.slice(3)] = false; continue; }
      const nx = argv[i + 1];
      if (nx !== undefined && !nx.startsWith('--')) { out.flags[k] = nx; i++; } else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

function makeLog(flags) {
  const quiet = !!flags.json;
  /* a stamped line wraps under its own stamp, so a long sentence stays a paragraph instead of running off */
  const line = (c, s) => (quiet ? process.stderr : process.stdout).write(ui.wrap(ui.stamp() + ' ' + c(s), ui.cols() - 1, 9) + '\n');
  return { info: s => line(ui.C.none, s), ok: s => line(ui.C.green, s), warn: s => line(ui.C.amber, s), error: s => line(ui.C.red, s), dim: s => line(ui.C.dim, s), raw: s => process.stdout.write(s + '\n') };
}

const GROUPS = [['start here', ['tour']], ['read', ['doctor', 'market', 'hunt', 'radar', 'scan', 'watch', 'xray', 'dev', 'fees', 'exit', 'replay', 'desk']], ['trade', ['wallet', 'buy', 'sell', 'positions', 'profile', 'snipe', 'follow', 'claim']]];
function help() {
  const w = Math.max(...Object.keys(COMMANDS).map(k => k.length));
  const out = [ui.logo('the exit desk for Robinhood Chain · v' + VERSION + ' · reads by default, signs only when you say so'), ''];
  out.push(ui.C.dim('  usage: loxley <command> [args] [--flags]'));
  GROUPS.forEach(g => {
    out.push('', ui.C.dim('  ' + g[0]));
    /* the description hangs under itself when the window is narrow, so the command column stays a column */
    g[1].forEach(k => { const c = COMMANDS[k]; out.push(ui.wrap('  ' + ui.C.lime(ui.padEnd(k, w)) + '  ' + c.h, ui.cols() - 1, w + 4)); if (c.a) out.push(ui.wrap('  ' + ' '.repeat(w) + '  ' + ui.C.dim(c.a), ui.cols() - 1, w + 4)); });
  });
  out.push('', ui.note(ui.C.dim('--sim on hunt, radar, watch and snipe runs the simulator when you have no chain in reach.')), ui.note(ui.C.dim('.env next to the package or in the working directory sets the rpc, the rules and the wallet; see .env.example.')), ui.note(ui.C.dim('money moves only in buy, sell, claim, snipe --live, follow --live and watch --guard, and each one asks first unless you pass --yes.')), ui.note(ui.C.dim('the entry is a guess. the exit is arithmetic.')));
  return out.join('\n');
}

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._.shift() || 'help';
  if (args.flags.version || cmd === 'version' || cmd === '--version') { process.stdout.write('loxley ' + VERSION + '\n'); return 0; }
  if (cmd === 'help' || args.flags.help || !COMMANDS[cmd]) {
    if (!COMMANDS[cmd] && cmd !== 'help') process.stdout.write(ui.C.red('unknown command: ' + cmd) + '\n\n');
    process.stdout.write(help() + '\n'); return COMMANDS[cmd] || cmd === 'help' ? 0 : 1;
  }
  const env = load();
  if (args.flags.rpc) env.RPC_URL = args.flags.rpc;
  if (args.flags.explorer) env.EXPLORER_URL = args.flags.explorer;
  if (args.flags.phantom) env.PHANTOM_ETH = String(args.flags.phantom);
  if (args.flags.color === false || args.flags.colour === false) ui.setColour(false);
  if (args.flags.links === false) ui.setLinks(false);
  const log = makeLog(args.flags);
  const ctx = { env, ui, log, args, flags: args.flags, VERSION, chain: makeChain(env, log), sources: makeSources(env) };
  if (args.flags.logo !== false && !args.flags.json && cmd !== 'radar') process.stdout.write(ui.logo(COMMANDS[cmd].h.split(':')[0].split(',')[0].split('.')[0]) + '\n\n');
  const run = require(path.join(__dirname, 'commands', COMMANDS[cmd].file + '.js'));
  try {
    const code = await run(ctx);
    return code || 0;
  } catch (e) {
    log.error((e && e.message) || String(e));
    if (args.flags.debug) console.error(e);
    return 1;
  }
}
module.exports = { main, parseArgs, COMMANDS, VERSION };
