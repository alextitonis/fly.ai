'use strict';
/* desk: open the browser desk, on a token if you name one */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { isAddr } = require('../token');

module.exports = async function desk(ctx) {
  const { ui, log, args } = ctx;
  const file = path.resolve(__dirname, '..', '..', 'index.html');
  if (!fs.existsSync(file)) { log.error('index.html is not next to this package. clone the repository, or open https://shmidtqq65.github.io/loxley/'); return 1; }
  const token = args._[0];
  const url = 'file://' + file + (token && isAddr(token) ? '?token=' + token.toLowerCase() : '');
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]] : ['xdg-open', [url]];
  try { const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }); p.on('error', () => log.raw(ui.C.dim('could not launch a browser here. open this yourself:')) || log.raw(url)); p.unref(); log.ok('opening the desk' + (token ? ' on ' + ui.short(token) : '')); log.raw(ui.C.dim('  ' + url)); }
  catch (e) { log.raw(url); }
  return 0;
};
