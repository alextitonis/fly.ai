'use strict';
/* tour: the whole desk in one command, against the mock chain that ships with the tree.
   It starts `test/mock-chain.js` in this process, points a throwaway wallet and a throwaway book at it, and then
   runs the real commands, one after another, on launches it mints while you watch. Every line you see is the same
   code path a live session takes: the same readers, the same scores, the same signer, the same exits. The only
   thing that is not real is the chain underneath, and no key of yours and no ether of yours is anywhere near it.

   `loxley tour` · `npm run tour` · `--fast` to cut the pauses · `--step` to press enter between chapters. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const BIN = path.resolve(__dirname, '..', '..', 'bin', 'loxley.js');
const THROWAWAY_KEY = '0x' + '22'.repeat(32);   /* a published key, funded only on the mock. never use it anywhere else */

module.exports = async function tour(ctx) {
  const { ui, log, flags } = ctx, C = ui.C;
  const fast = !!flags.fast, step = !!flags.step;
  const sleep = ms => new Promise(r => setTimeout(r, fast ? Math.min(ms, 120) : ms));

  let mock;
  try { mock = require(path.resolve(__dirname, '..', '..', 'test', 'mock-chain.js')); }
  catch (e) {
    log.error('the tour needs the mock chain, and test/mock-chain.js is not in this tree.');
    log.dim('it ships in the repository: git clone https://github.com/shmidtqq65/loxley');
    return 1;
  }

  const M = await mock.start();
  const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'loxley-tour-'));
  const env = Object.assign({}, process.env, M.env, {
    LOXLEY_HOME: HOME, PRIVATE_KEY: THROWAWAY_KEY,
    RPC_SPACING_MS: '5', RPC_LOGS_SPACING_MS: '5', POLL_MS: '300', MARK_EVERY_S: fast ? '1' : '2',
    TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '7', TELEGRAM_API: M.url, NO_LINKS: '1'
  });

  const run = (args, opts) => new Promise(res => {
    opts = opts || {};
    const p = spawn(process.execPath, [BIN].concat(args, ['--no-logo']), { env, stdio: 'inherit', cwd: path.resolve(__dirname, '..', '..') });
    if (opts.during) opts.during();
    const t = setTimeout(() => p.kill('SIGINT'), opts.timeout || 40000);
    p.on('exit', () => { clearTimeout(t); res(); });
  });

  let n = 0;
  const width = () => Math.min(112, Math.max(60, ui.cols() - 2));
  const rule = () => C.dim('─'.repeat(width()));
  /* the note under a chapter title is a paragraph, so it is wrapped to the terminal rather than run off the side */
  const wrap = (t, w) => { const out = []; let line = ''; t.split(/\s+/).forEach(word => { if (line && (line + ' ' + word).length > w) { out.push(line); line = word; } else line = line ? line + ' ' + word : word; }); if (line) out.push(line); return out; };
  async function chapter(title, why) {
    n++;
    process.stdout.write('\n' + rule() + '\n');
    process.stdout.write('  ' + C.lime(C.bold(ui.padEnd(String(n), 2) + ' ' + title)) + '\n');
    wrap(why, width() - 4).forEach(l => process.stdout.write('  ' + C.dim(l) + '\n'));
    process.stdout.write(rule() + '\n\n');
    if (step) await new Promise(r => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); r(); }); });
    else await sleep(900);
  }
  /* the levers that mint launches and move tokens while a command watches. a lever that reverts (a curve that
     closed a moment earlier, a wallet that ran dry) must never take the tour down with it, so each one is caught. */
  const at = x => (fast ? Math.round(x * 0.45) : x);   /* --fast shortens the script, it does not reorder it */
  const later = (ms, fn) => setTimeout(() => { try { fn(); } catch (e) { process.stdout.write(C.dim('  (the mock refused a scripted move: ' + e.message + ')') + '\n'); } }, at(ms));

  process.stdout.write('\n' + C.lime(C.bold('  LOXLEY TOUR')) + C.dim('  every command in the tree, on a chain that runs inside this process.') + '\n\n');
  process.stdout.write(ui.kv([
    ['chain', C.white('test/mock-chain.js') + C.dim(' on ' + M.url + '  the rpc, the explorer and DexScreener in one process')],
    ['contracts', C.dim('pons v2 curves in integer maths, a v4 pool behind the hook, the fee escrow, multicall3. real signed transactions, mined on the spot')],
    ['market', C.dim('a recording of what DexScreener listed on Robinhood Chain on 2026-09-06, so ') + C.white('market') + C.dim(' and ') + C.white('scan') + C.dim(' read real pools')],
    ['wallet', C.amber('a published throwaway key') + C.dim('. your keystore is not opened and your .env is not read')],
    ['book', C.dim(HOME + '  a temp folder, deleted with this run')],
    ['money', C.green('none') + C.dim('  nothing here can reach the real chain, and the tour never asks you for anything')]
  ]) + '\n');
  await sleep(2200);

  await chapter('doctor', 'the first thing to run anywhere: is the chain there, does the explorer answer, is the factory where we think it is, and how fast is a curve read');
  await run(['doctor', '--probe']);
  await sleep(1400);

  await chapter('market', 'what is trading on the chain right now. every token DexScreener lists, its deepest pool, and the stamp the desk puts on that pool: how easily you could leave it');
  await run(['market', '--top', '10']);
  await sleep(1800);

  await chapter('scan', 'one pool, read properly: depth against the cap, the day\'s flow, turnover, the eight council votes, the survival index, and what leaving actually costs at three sizes');
  await run(['scan', '0x0E0d2C89a5a019FE1cF762e5e33187631DACC21B']);
  await sleep(1800);

  await chapter('hunt', 'launches as they land. four are minted while this runs: one clean, then three from one operator with the same fingerprint. watch the FARM badge appear on the second and third');
  const farmSoc = { twitter: 'https://x.com/grimreaper', telegram: '', discord: '', website: '', farcaster: '' };
  await run(['hunt', '--for', fast ? '11' : '20'], { timeout: 45000, during: () => {
    later(1200, () => M.launchNow('HOODCAT', { name: 'Hood Cat', deployer: '0x' + 'c1'.repeat(20), socials: { twitter: 'https://x.com/hoodcat', telegram: 'https://t.me/hoodcat', discord: '', website: 'https://hoodcat.xyz', farcaster: '' }, description: 'a cat in a hood. the woods are watched.' }));
    later(3200, () => M.launchNow('GRIM', { name: 'Grim Reaper', decayMs: 0, deployer: '0x' + 'c2'.repeat(20), socials: farmSoc, description: 'grim reaper season' }));
    later(5200, () => M.launchNow('GRIMX', { name: 'Grim Reaper II', decayMs: 0, deployer: '0x' + 'c3'.repeat(20), socials: farmSoc, description: 'grim reaper season 2' }));
    later(7200, () => M.launchNow('GRIMZ', { name: 'Grim Reaper III', decayMs: 0, deployer: '0x' + 'c4'.repeat(20), socials: farmSoc, description: 'grim reaper season 3', exempt: ['0x' + 'e1'.repeat(20), '0x' + 'e2'.repeat(20)], feeRecipient: '0x' + 'f1'.repeat(20) }));
    later(9000, () => { const e = M.state.launches.find(l => M.state.tokens[l.token].symbol === 'HOODCAT'); if (e) for (let i = 0; i < 10; i++) M.walletBuy('0x' + (0xa0 + i).toString(16).repeat(20).slice(0, 40), e.token, 0.03 + i * 0.004); });
  } });
  await sleep(1600);

  await chapter('snipe --live', 'the sniper, signing from the wallet. it refuses what the rules refuse and says which rule; on the one that passes it polls the opening tax every 150 ms, fires under the ceiling, marks the position with a real exit quote, and leaves when the deployer\'s tokens move');
  await run(['snipe', '--live', '--yes', '--eth', '0.005', '--min-score', '60', '--for', fast ? '13' : '24', '--exit-on-stop'], { timeout: 50000, during: () => {
    later(1500, () => M.launchNow('TWIN2', { name: 'Twin Two', deployer: '0x' + 'd2'.repeat(20) }));
    later(3000, () => M.launchNow('LONGBOW', { name: 'Longbow', decayMs: at(2600), deployer: '0x' + 'c5'.repeat(20), socials: { twitter: 'https://x.com/longbow', telegram: '', discord: '', website: 'https://longbow.gg', farcaster: '' }, description: 'draw. hold. release.' }));
    later(10000, () => { const e = M.state.launches.find(l => M.state.tokens[l.token].symbol === 'LONGBOW'); if (e) for (let i = 0; i < 8; i++) M.walletBuy('0x' + (0xb0 + i).toString(16).repeat(20).slice(0, 40), e.token, 0.07); });
    later(15000, () => { const e = M.state.launches.find(l => M.state.tokens[l.token].symbol === 'LONGBOW'); if (e) M.devSell(e.token, 4); });
  } });
  await sleep(1600);

  await chapter('follow', 'copy-trading: every CurveBuy a wallet you trust makes is read, the launch behind it is scored, and the desk mirrors it with your size and leaves on your rules, not theirs');
  await run(['follow', '0x' + 'ab'.repeat(20), '--live', '--yes', '--eth', '0.005', '--min-score', '50', '--for', fast ? '9' : '16'], { timeout: 40000, during: () => {
    let tok;
    later(1500, () => { const e = M.launchNow('QUIVER', { name: 'Quiver', decayMs: 0, deployer: '0x' + 'c6'.repeat(20), socials: { twitter: 'https://x.com/quiver', telegram: '', discord: '', website: 'https://quiver.run', farcaster: '' }, description: 'arrows for the hood' }); tok = e.token; });
    later(3500, () => { if (tok) M.walletBuy('0x' + 'ab'.repeat(20), tok, 0.08); });
    later(8000, () => { if (tok) for (let i = 0; i < 10; i++) M.walletBuy('0x' + (0xd0 + i).toString(16).repeat(20).slice(0, 40), tok, 0.09); });
  } });
  await sleep(1600);

  await chapter('snipe --grad', 'the other trigger. a curve fills, the factory graduates it, and the desk buys in the v4 pool the moment it opens, quoted by the v4 quoter');
  await run(['snipe', '--grad', '--eth', '0.01', '--min-score', '50', '--for', fast ? '9' : '16'], { timeout: 40000, during: () => {
    let tok;
    later(1500, () => { const e = M.launchNow('SHERWOOD', { name: 'Sherwood Forest', decayMs: 0, deployer: '0x' + 'c7'.repeat(20), socials: { twitter: 'https://x.com/sherwood', telegram: '', discord: '', website: '', farcaster: '' }, description: 'the forest graduates' }); tok = e.token; });
    later(3500, () => { if (tok) M.graduate(tok); });
    later(9500, () => { if (tok) M.devSell(tok, 6); });
  } });
  await sleep(1600);

  await chapter('buy, then watch --guard', 'a position bought by hand, then handed to the guard: it polls the pool, and when the deployer moves tokens out it sells the whole holding without asking again');
  await run(['buy', M.TOKEN, '0.01', '--yes']);
  await sleep(700);
  await run(['watch', M.TOKEN, '--guard', '--yes', '--every', '2', '--for', fast ? '9' : '14'], { timeout: 35000, during: () => { later(4000, () => M.devSell(M.TOKEN, 5)); } });
  await sleep(1400);

  await chapter('fees, dev, claim', 'the money side of a launch that is not yours: who is paid on it, what that wallet has ever launched, and what is sitting unclaimed for you in the pons escrow');
  await run(['fees', M.TOKEN]);
  await sleep(900);
  await run(['dev', M.DEP1, '--window', '80000']);
  await sleep(900);
  M.server.api.credit({ recipient: '0x1563915e194D8CfBA1943570603F7606A3115508', eth: '0.1102' });
  await run(['wallet']);
  await sleep(500);
  await run(['claim', '--yes']);
  await sleep(1400);

  await chapter('positions, profile', 'the book. every fill the tour just made, marked with what leaving fetches right now, and the record it adds up to');
  await run(['positions', '--all']);
  await sleep(900);
  await run(['profile']);
  await sleep(1400);

  await chapter('radar', 'the last one is for the look of it: the launch window drawn in characters, blips by age, the sweep, and the list with verdicts and curve fill');
  await run(['radar', '--sim', '--for', fast ? '5' : '8'], { timeout: 20000 });

  await M.close();
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (e) { /* the OS will */ }

  process.stdout.write('\n' + rule() + '\n');
  process.stdout.write('  ' + C.lime(C.bold('that was the whole desk.')) + C.dim(' the mock chain is closed and the temp book is deleted.') + '\n\n');
  process.stdout.write(ui.kv([
    ['read anything', C.lime('loxley market') + C.dim(' · ') + C.lime('loxley scan <token>') + C.dim(' · ') + C.lime('loxley hunt') + C.dim('  against the real chain, no wallet needed')],
    ['rehearse', C.lime('loxley snipe') + C.dim('  paper by default: it fires and marks and exits, it just does not sign')],
    ['run this again', C.lime('loxley tour --fast') + C.dim(' · ') + C.lime('loxley tour --step') + C.dim('  and ') + C.lime('npm run mock') + C.dim(' keeps the same chain up for you to point commands at')],
    ['when you are ready', C.lime('loxley wallet new') + C.dim('  then ') + C.amber('--live') + C.dim(', with what one session may lose. SECURITY.md lists every transaction the terminal can make')]
  ]) + '\n');
  return 0;
};
