'use strict';
/* sample: run the cli against the mock chain and print exactly what it prints, so the examples in the docs are
   transcripts and not sketches. `node scripts/sample.js scan 0x…` runs one command, no arguments runs the set the
   README and docs/CLI.md quote. Reads only; it never touches the real chain. */
const path = require('path');
const { spawn } = require('child_process');
const mock = require('../test/mock-chain');

const BIN = path.resolve(__dirname, '..', 'bin', 'loxley.js');

function run(M, args, ms) {
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, M.env, { NO_COLOR: '1', HTTP_TIMEOUT_MS: '4000', RPC_SPACING_MS: '5', RPC_LOGS_SPACING_MS: '5', POLL_MS: '300', COLUMNS: '120' });
    const p = spawn(process.execPath, [BIN].concat(args, ['--no-logo']), { env, cwd: path.resolve(__dirname, '..') });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => p.kill('SIGINT'), ms || 20000);
    p.on('exit', () => { clearTimeout(t); resolve(out); });
  });
}

(async () => {
  const M = await mock.start();
  const fresh = M.state.launches[1].token;
  const sets = process.argv.length > 2
    ? [process.argv.slice(2)]
    : [['scan', M.TOKEN], ['scan', fresh], ['hunt', '--for', '6'], ['fees', M.TOKEN], ['dev', M.state.launches[0].deployer], ['market'], ['exit', M.TOKEN], ['xray', M.TOKEN], ['doctor', '--probe']];
  for (const s of sets) {
    console.log('\n\n$ loxley ' + s.join(' ') + '\n' + '-'.repeat(70));
    /* hunt only follows launches that land while it is watching, so mint one two seconds in */
    if (s[0] === 'hunt') setTimeout(() => { try { M.server.api.launch({ sym: 'HOODCAT', name: 'Hood Cat', deployer: '0x' + 'ab'.repeat(20), description: 'a cat in a hood, nothing more' }); } catch (e) {} }, 2500);
    console.log(await run(M, s, s[0] === 'hunt' ? 22000 : 20000));
  }
  await M.close();
  process.exit(0);
})();
