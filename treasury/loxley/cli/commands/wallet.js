'use strict';
/* wallet: show, import, new, forget. the key is typed on the terminal (hidden) or read from the environment,
   never from a command line argument, and lands on disk only inside an scrypt + aes-256-gcm keystore. */
const W = require('../wallet');
const { attachWallet, fmtEth, fmtTok } = require('../live');

module.exports = async function wallet(ctx) {
  const { ui, log, args, env, flags } = ctx, C = ui.C;
  const sub = (args._[0] || 'show').toLowerCase();
  const file = W.keystorePath(env);

  if (sub === 'show' || sub === 'status') {
    const locked = await W.resolveWallet(env, { locked: true }).catch(e => ({ error: e.message }));
    if (!locked) { log.raw(ui.kv([['wallet', C.amber('none')], ['keystore', C.dim(file) + C.dim('  (not there)')], ['env', env.hasSecret() ? 'set' : C.dim('no PRIVATE_KEY, no MNEMONIC')]])); log.raw(''); log.raw(C.dim('  loxley wallet import   paste a private key or a seed phrase, encrypted with a passphrase') + '\n' + C.dim('  loxley wallet new      make a fresh burner for the sniper') + '\n' + C.dim('  or PRIVATE_KEY= / MNEMONIC= in .env for bots and servers')); return 0; }
    if (locked.error) { log.error(locked.error); return 1; }
    let w = null, bal = null, open = [], fees = null;
    if (flags.unlock || env.LOXLEY_PASSPHRASE || locked.source.indexOf('keystore') < 0) { try { w = await attachWallet(ctx, { need: false }); } catch (e) { log.warn(e.message); } }
    else { ctx.trader = require('../trade').makeTrader(ctx, null); }
    try { bal = await ctx.trader.balance(locked.address); } catch (e) { /* chain out of reach */ }
    try { open = ctx.trader.book.open_(); } catch (e) { /* none */ }
    try { fees = await require('../pons').makeEscrow(ctx.chain, env).balanceOf(locked.address); } catch (e) { fees = null; }
    log.raw(ui.kv([
      ['address', C.white(locked.address) + '  ' + C.blue(env.EXPLORER_URL + '/address/' + locked.address)],
      ['source', locked.source + (locked.kind === 'mnemonic' ? C.dim('  seed phrase, path m/44\'/60\'/0\'/0/' + (locked.index || 0)) : C.dim('  private key'))],
      ['balance', bal == null ? C.dim('chain not in reach') : (bal === 0n ? C.amber : C.white)(fmtEth(bal))],
      ['creator fees', fees == null ? C.dim('escrow n/a') : fees > 0n ? C.green(fmtEth(fees)) + C.dim('  unclaimed · loxley claim') : C.dim('none unclaimed')],
      ['positions', open.length ? open.length + ' open · loxley positions' : C.dim('none open')],
      ['unlock', w ? C.green('unlocked for this run') : (locked.locked ? C.dim('locked; commands that trade ask for the passphrase') : C.green('from the environment'))]
    ]));
    return 0;
  }

  if (sub === 'import') {
    if (W.readKeystore(env) && !flags.force) { log.error('a keystore already exists at ' + file + '. loxley wallet forget --yes first, or --force to overwrite it'); return 1; }
    let secret, index = parseInt(flags.index != null ? flags.index : env.MNEMONIC_INDEX, 10) || 0;
    if (flags['from-env']) { secret = env.PRIVATE_KEY || env.MNEMONIC; if (!secret) { log.error('--from-env: neither PRIVATE_KEY nor MNEMONIC is set'); return 1; } }
    else {
      if (!process.stdin.isTTY && !flags.stdin) { log.error('not a terminal. pipe the secret with --stdin (echo "0x…" | loxley wallet import --stdin), or use --from-env'); return 1; }
      log.raw(ui.note(C.dim('the secret is not echoed. paste a private key (0x + 64 hex) or a seed phrase (12 to 24 words) and press enter.')));
      secret = await W.prompt('  secret: ', { hidden: true });
    }
    let acc;
    try { acc = W.accountFromSecret(secret, index); } catch (e) { log.error(e.message); return 1; }
    log.raw(ui.kv([['address', C.white(acc.account.address)], ['kind', acc.kind === 'pk' ? 'private key' : 'seed phrase' + (index ? ', index ' + index : '')]]));
    let pass = env.LOXLEY_PASSPHRASE;
    if (!pass) {
      if (!process.stdin.isTTY) { log.error('set LOXLEY_PASSPHRASE to encrypt without a prompt'); return 1; }
      pass = await W.prompt('  passphrase (8+ characters, you will type it before every live command): ', { hidden: true });
      const again = await W.prompt('  once more: ', { hidden: true });
      if (pass !== again) { log.error('the two passphrases differ, nothing written'); return 1; }
    }
    if (String(pass).length < 8) { log.error('a passphrase under 8 characters is not one, nothing written'); return 1; }
    const r = W.writeKeystore(env, secret, index, pass);
    log.ok('keystore written: ' + r.file + C.dim('  (scrypt N=2^17, aes-256-gcm, mode 600)'));
    log.raw(ui.note(C.dim('fund ' + r.address + ' with a little ETH on Robinhood Chain, then loxley doctor.')));
    log.raw(ui.note(C.dim('LOXLEY_PASSPHRASE in the environment unlocks it without a prompt, for a server. keep .env out of git.')));
    return 0;
  }

  if (sub === 'new') {
    if (W.readKeystore(env) && !flags.force) { log.error('a keystore already exists at ' + file + '. loxley wallet forget --yes first, or --force'); return 1; }
    const phrase = W.generateMnemonic();
    const acc = W.accountFromSecret(phrase, 0);
    let pass = env.LOXLEY_PASSPHRASE;
    if (!pass) {
      if (!process.stdin.isTTY) { log.error('set LOXLEY_PASSPHRASE to make a wallet without a prompt'); return 1; }
      pass = await W.prompt('  passphrase for the new wallet (8+ characters): ', { hidden: true });
      const again = await W.prompt('  once more: ', { hidden: true });
      if (pass !== again) { log.error('the two passphrases differ, nothing written'); return 1; }
    }
    if (String(pass).length < 8) { log.error('a passphrase under 8 characters is not one, nothing written'); return 1; }
    const r = W.writeKeystore(env, phrase, 0, pass);
    log.ok('a fresh wallet: ' + C.white(acc.account.address));
    log.raw(ui.kv([['keystore', r.file], ['explorer', C.blue(env.EXPLORER_URL + '/address/' + acc.account.address)]]));
    if (flags['show-phrase'] || process.stdin.isTTY) {
      log.raw(''); log.raw(C.amber('  the seed phrase, shown once and never again. write it down, then clear the screen:'));
      log.raw('  ' + C.white(C.bold(phrase)));
    } else log.raw(C.dim('  the seed phrase was not printed (no terminal). --show-phrase prints it once.'));
    log.raw(''); log.raw(ui.note(C.dim('this is a burner for the sniper: send it only what a session may lose. the main stack stays in a wallet loxley never sees.')));
    return 0;
  }

  if (sub === 'forget' || sub === 'remove') {
    const ks = W.readKeystore(env);
    if (!ks) { log.warn('no keystore at ' + file); return 0; }
    if (!flags.yes) { log.error('this deletes ' + file + ' for ' + ks.address + '. if the key is not backed up elsewhere it is gone. add --yes to do it.'); return 1; }
    W.forgetKeystore(env);
    log.ok('keystore removed. positions.json is kept; loxley positions --clear wipes it.');
    return 0;
  }

  if (sub === 'balance') {
    const w = await W.resolveWallet(env, { locked: true }); if (!w) { log.error('no wallet'); return 1; }
    ctx.trader = require('../trade').makeTrader(ctx, null);
    const bal = await ctx.trader.balance(w.address);
    log.raw(ui.kv([['address', w.address], ['balance', fmtEth(bal)]]));
    const toks = args._.slice(1);
    for (const t of toks) { const [b, meta] = await Promise.all([ctx.trader.tokenBalance(t, w.address), ctx.trader.tokenMeta(t)]); log.raw(ui.kv([['$' + (meta.symbol || t.slice(0, 8)), fmtTok(b, meta.decimals)]])); }
    return 0;
  }

  log.error('usage: loxley wallet [show|import|new|forget|balance]');
  return 1;
};
