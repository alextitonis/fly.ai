'use strict';
/* the hunt log: turns one run of `loxley hunt --json` into a page and a badge the readme can show.
   usage: node scripts/status.js hunt.jsonl doctor.txt out/
   out/README.md   the last run, as a table         out/badge.json  a shields.io endpoint
   out/latest.json the raw lines, for anyone else   out/doctor.txt  what doctor said */
const fs = require('fs');
const path = require('path');
const [huntFile, doctorFile, outDir] = process.argv.slice(2);
if (!huntFile || !outDir) { console.error('usage: node scripts/status.js hunt.jsonl doctor.txt out/'); process.exit(1); }
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const lines = read(huntFile).split('\n').filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const doctor = read(doctorFile);
const launches = lines.filter(l => l.kind === 'launch');
const live = launches.filter(l => !l.backlog), grads = lines.filter(l => l.kind === 'grad');
const ok = !/FAIL/.test(doctor) && doctor.length > 0;
const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const short = a => (a ? a.slice(0, 6) + '…' + a.slice(-4) : 'n/a');
const pct = v => (v == null ? 'n/a' : v.toFixed(2) + '%');
fs.mkdirSync(outDir, { recursive: true });
/* the badge */
const badge = ok
  ? { schemaVersion: 1, label: 'hunt log', message: (live.length + ' launch' + (live.length === 1 ? '' : 'es') + ' in 2 min · ' + launches.filter(l => l.verdict === 'FIRE').length + ' fire'), color: 'CCFF00', labelColor: '0B0E08' }
  : { schemaVersion: 1, label: 'hunt log', message: 'chain out of reach at ' + stamp.slice(11, 16) + ' UTC', color: 'FF5000', labelColor: '0B0E08' };
fs.writeFileSync(path.join(outDir, 'badge.json'), JSON.stringify(badge));
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({ at: now.toISOString(), ok, launches, grads }, null, 1));
fs.writeFileSync(path.join(outDir, 'doctor.txt'), doctor);
/* the page */
const rows = launches.slice(0, 40).map(l => `| ${l.t ? l.t.slice(11, 19) : ''} | $${l.symbol || '…'}${l.backlog ? ' <sub>on record</sub>' : ''} | **${l.verdict} ${l.score}** | ${pct(l.devShare)} | ${l.creatorTaxBps == null ? 'n/a' : (l.creatorTaxBps / 100).toFixed(1) + '%'} | ${l.fill == null ? 'n/a' : Math.round(l.fill * 100) + '%'} | ${l.pair || '?'} | [${short(l.deployer)}](https://robinhoodchain.blockscout.com/address/${l.deployer})${l.record ? ' · ' + l.record.launches + ' / ' + l.record.grads : ''} | [${short(l.token)}](https://robinhoodchain.blockscout.com/token/${l.token}) |`);
const md = `# hunt log

The repository runs \`loxley hunt\` for two minutes every six hours, from a GitHub Actions runner, against the public
Robinhood Chain RPC. This is what it saw last. Nothing here is a recommendation; it is a read.

**${stamp}** · ${ok ? '✅ chain in reach' : '⛔ chain out of reach'} · ${live.length} launch${live.length === 1 ? '' : 'es'} landed during the run · ${launches.length - live.length} on record before it · ${grads.length} graduation${grads.length === 1 ? '' : 's'}

| time | symbol | verdict | dev buy | creator tax | curve | pair | deployer · launches / graduated | token |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n') || '| | no launches read | | | | | | | |'}

<details><summary>what <code>loxley doctor</code> said</summary>

\`\`\`
${doctor.replace(/\x1b\[[0-9;]*m/g, '').trim() || 'no output'}
\`\`\`

</details>

*the launch score: FIRE at 75, WATCH at 45, SKIP below. what it is made of: [docs/CLI.md](../main/docs/CLI.md#the-launch-score).*
`;
fs.writeFileSync(path.join(outDir, 'README.md'), md);
console.log('status: ' + badge.message + ' · ' + launches.length + ' launches written to ' + outDir);
