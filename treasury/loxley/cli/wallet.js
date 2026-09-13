'use strict';
/* wallet: the one place in loxley that touches a key.
   three ways in, in this order: PRIVATE_KEY in the environment or .env, MNEMONIC (+ MNEMONIC_INDEX) in the same
   places, or the encrypted keystore at ~/.loxley/wallet.json (scrypt + aes-256-gcm, unlocked with a passphrase
   that is asked for on the terminal or read from LOXLEY_PASSPHRASE for unattended runs).
   the key never goes into a command line argument: shells keep history. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const deps = require('./deps');
const { privateKeyToAccount, mnemonicToAccount, generateMnemonic, generatePrivateKey, english } = deps.accounts;
const bip39 = deps.bip39, wordlist = deps.bip39.wordlist;

const KDF = { N: 1 << 17, r: 8, p: 1, dkLen: 32, maxmem: 512 * 1024 * 1024 };

function home(env) {
  const h = (env && env.LOXLEY_HOME) || process.env.LOXLEY_HOME;
  return h ? path.resolve(h.replace(/^~(?=$|[\/\\])/, os.homedir())) : path.join(os.homedir(), '.loxley');
}
const keystorePath = env => path.join(home(env), 'wallet.json');

/* ---------- secrets ---------- */
const isPk = s => /^0x[0-9a-fA-F]{64}$/.test(String(s || '').trim());
function normaliseMnemonic(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function isMnemonic(s) {
  const m = normaliseMnemonic(s); const n = m ? m.split(' ').length : 0;
  if (![12, 15, 18, 21, 24].includes(n)) return false;
  if (bip39 && wordlist) return bip39.validateMnemonic(m, wordlist);
  try { mnemonicToAccount(m); return true; } catch (e) { return false; }
}
function accountFromSecret(secret, index) {
  if (isPk(secret)) return { account: privateKeyToAccount(String(secret).trim()), kind: 'pk' };
  if (isMnemonic(secret)) return { account: mnemonicToAccount(normaliseMnemonic(secret), { addressIndex: index || 0 }), kind: 'mnemonic' };
  throw new Error('that is neither a private key (0x + 64 hex characters) nor a valid seed phrase (12 to 24 words)');
}

/* ---------- the keystore ---------- */
function encrypt(secretObj, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(Buffer.from(String(passphrase), 'utf8'), salt, KDF.dkLen, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: KDF.maxmem });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(secretObj), 'utf8')), cipher.final()]);
  return { kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p, dkLen: KDF.dkLen, salt: salt.toString('hex') }, cipher: { name: 'aes-256-gcm', iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ct: ct.toString('hex') } };
}
function decrypt(ks, passphrase) {
  const k = ks.kdf, c = ks.cipher;
  if (!k || !c || k.name !== 'scrypt' || c.name !== 'aes-256-gcm') throw new Error('unknown keystore format');
  const key = crypto.scryptSync(Buffer.from(String(passphrase), 'utf8'), Buffer.from(k.salt, 'hex'), k.dkLen || 32, { N: k.N, r: k.r, p: k.p, maxmem: KDF.maxmem });
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(c.iv, 'hex'));
  d.setAuthTag(Buffer.from(c.tag, 'hex'));
  let pt;
  try { pt = Buffer.concat([d.update(Buffer.from(c.ct, 'hex')), d.final()]); } catch (e) { const err = new Error('wrong passphrase'); err.code = 'PASSPHRASE'; throw err; }
  return JSON.parse(pt.toString('utf8'));
}
function readKeystore(env) {
  const file = keystorePath(env);
  try { const ks = JSON.parse(fs.readFileSync(file, 'utf8')); if (ks && ks.loxley && ks.kind === 'keystore') return Object.assign(ks, { file }); } catch (e) { /* none */ }
  return null;
}
function writeKeystore(env, secret, index, passphrase) {
  const { account, kind } = accountFromSecret(secret, index);
  const dir = home(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = keystorePath(env);
  const body = Object.assign({ loxley: 1, kind: 'keystore', version: 1, address: account.address, secret: kind, index: kind === 'mnemonic' ? (index || 0) : undefined, createdAt: new Date().toISOString() },
    encrypt({ kind, value: kind === 'pk' ? String(secret).trim() : normaliseMnemonic(secret), index: index || 0 }, passphrase));
  fs.writeFileSync(file, JSON.stringify(body, null, 1), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch (e) { /* windows */ }
  return { file, address: account.address, kind };
}
function forgetKeystore(env) {
  const file = keystorePath(env);
  if (!fs.existsSync(file)) return false;
  /* overwrite before unlinking: the ciphertext is useless without the passphrase, but leave nothing anyway */
  try { const n = fs.statSync(file).size; fs.writeFileSync(file, crypto.randomBytes(Math.max(64, n))); } catch (e) { /* best effort */ }
  fs.unlinkSync(file);
  return true;
}
function unlockKeystore(env, ks, passphrase) {
  const s = decrypt(ks, passphrase);
  const { account, kind } = accountFromSecret(s.value, s.index);
  return { account, kind, index: s.index || 0 };
}

/* ---------- prompts: hidden input, never echoed ---------- */
function prompt(question, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const input = process.stdin, output = process.stderr;
    if (!input.isTTY) { /* piped: read one line, no echo to worry about */
      const rl = readline.createInterface({ input, terminal: false });
      output.write(question);
      rl.once('line', l => { rl.close(); resolve(l); });
      rl.once('close', () => resolve(''));
      return;
    }
    const rl = readline.createInterface({ input, output, terminal: true });
    if (opts.hidden) {
      rl._writeToOutput = function (s) { if (s.includes(question)) output.write(question); else if (/\r?\n/.test(s)) output.write('\n'); };
    }
    rl.question(question, answer => { rl.close(); if (opts.hidden) output.write('\n'); resolve(answer); });
    rl.on('SIGINT', () => { rl.close(); output.write('\n'); reject(new Error('cancelled')); });
  });
}
const confirmWord = async (question, word) => (String(await prompt(question)).trim().toLowerCase() === String(word).toLowerCase());

/* ---------- resolve: what wallet does this run have ---------- */
async function resolveWallet(env, opts) {
  opts = opts || {};
  const pk = env.PRIVATE_KEY || process.env.PRIVATE_KEY, mn = env.MNEMONIC || process.env.MNEMONIC;
  const index = parseInt(env.MNEMONIC_INDEX || process.env.MNEMONIC_INDEX || '0', 10) || 0;
  if (pk) { if (!isPk(pk)) throw new Error('PRIVATE_KEY is set but is not 0x + 64 hex characters'); return { account: privateKeyToAccount(pk.trim()), address: privateKeyToAccount(pk.trim()).address, source: 'PRIVATE_KEY in the environment', kind: 'pk' }; }
  if (mn) { if (!isMnemonic(mn)) throw new Error('MNEMONIC is set but is not a valid seed phrase'); const a = mnemonicToAccount(normaliseMnemonic(mn), { addressIndex: index }); return { account: a, address: a.address, source: 'MNEMONIC in the environment' + (index ? ' (index ' + index + ')' : ''), kind: 'mnemonic', index }; }
  const ks = readKeystore(env);
  if (!ks) return null;
  if (opts.locked) return { address: ks.address, source: 'keystore ' + ks.file, kind: ks.secret, locked: true, file: ks.file };
  let pass = opts.passphrase || env.LOXLEY_PASSPHRASE || process.env.LOXLEY_PASSPHRASE;
  if (!pass) {
    if (opts.noPrompt || !process.stdin.isTTY) return { address: ks.address, source: 'keystore ' + ks.file, kind: ks.secret, locked: true, file: ks.file };
    pass = await prompt('passphrase for ' + ks.address.slice(0, 6) + '…' + ks.address.slice(-4) + ': ', { hidden: true });
  }
  const u = unlockKeystore(env, ks, pass);
  return { account: u.account, address: u.account.address, source: 'keystore ' + ks.file, kind: u.kind, index: u.index, file: ks.file };
}

module.exports = { home, keystorePath, isPk, isMnemonic, normaliseMnemonic, accountFromSecret, encrypt, decrypt, readKeystore, writeKeystore, forgetKeystore, unlockKeystore, prompt, confirmWord, resolveWallet, generateMnemonic: () => generateMnemonic(english), generatePrivateKey };
