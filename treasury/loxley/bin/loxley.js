#!/usr/bin/env node
'use strict';
/* loxley · the exit desk for Robinhood Chain, in a terminal */
process.stdout.on('error', e => { if (e && e.code === 'EPIPE') process.exit(0); });
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 18) { process.stderr.write('loxley needs node 18 or newer (for fetch). you have ' + process.versions.node + '\n'); process.exit(1); }
/* node 18 and 20 print "ExperimentalWarning: The Fetch API is an experimental feature" the first time anything is
   read from the chain. fetch has been stable since node 21 and the warning says nothing a person here can act on,
   so it is swallowed. Nothing else is: every other warning node has to give still reaches the screen. */
if (major < 21) {
  const emit = process.emit;
  process.emit = function (name, data) {
    if (name === 'warning' && data && data.name === 'ExperimentalWarning' && /Fetch API|buffer\.File/.test(String(data.message))) return false;
    return emit.apply(process, arguments);
  };
}
require('../cli/main').main(process.argv.slice(2)).then(code => {
  process.exitCode = code || 0;
  /* a stray timer must not hold the process; give the pipes a moment to drain, then leave */
  setTimeout(() => process.exit(code || 0), 1500).unref();
}, e => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exitCode = 1; setTimeout(() => process.exit(1), 1500).unref(); });
