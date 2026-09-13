'use strict';
/* the desk's own tally, ~/.loxley/stats.json: how many launches the sniper refused and by which rule. positions
   live in the book (trade.js); this is the part the book cannot know, the shots that were never taken. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const home = env => (env.LOXLEY_HOME && String(env.LOXLEY_HOME).trim()) || path.join(os.homedir(), '.loxley');
const file = env => path.join(home(env), 'stats.json');
function read(env) { try { const j = JSON.parse(fs.readFileSync(file(env), 'utf8')); if (j && j.refused) return j; } catch (e) { /* none yet */ } return { loxley: 1, kind: 'stats', refused: {}, since: new Date().toISOString() }; }
function write(env, j) { try { fs.mkdirSync(home(env), { recursive: true, mode: 0o700 }); fs.writeFileSync(file(env), JSON.stringify(j, null, 1)); } catch (e) { /* best effort */ } }
/* the rule behind a refusal line, in the words the profile prints */
function ruleOf(why) {
  const w = String(why || '').toLowerCase();
  if (/exempt|declared bundle/.test(w)) return 'declared bundles';
  if (/block-0/.test(w)) return 'block-0 bundles';
  if (/farm/.test(w)) return 'launch farms';
  if (/dev share/.test(w)) return 'heavy dev buys';
  if (/no socials/.test(w)) return 'no socials';
  if (/twins/.test(w)) return 'twins';
  if (/creator tax/.test(w)) return 'creator tax';
  if (/pair is/.test(w)) return 'non-ETH pairs';
  if (/keyword|deployer not/.test(w)) return 'your filters';
  if (/open|budget/.test(w)) return 'the caps';
  if (/score/.test(w)) return 'score';
  return 'other';
}
function countRefusal(env, why) { const j = read(env); const k = ruleOf(why); j.refused[k] = (j.refused[k] || 0) + 1; write(env, j); }
module.exports = { read, write, countRefusal, ruleOf, file };
