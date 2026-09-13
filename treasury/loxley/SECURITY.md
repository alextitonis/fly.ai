# Security

Loxley reads by default and signs only when you arm it. Everything that can move money is in three files,
`cli/wallet.js` (the key), `cli/trade.js` (the trades) and `cli/commands/claim.js` (the fee claim), and every command
that uses them says so in its name: `buy`, `sell`, `claim`, `snipe --live`, `follow --live`, `watch --guard`. The
browser desk has no key field, no wallet connection and no signing code at all; it is the reading face.

## The key

- Comes from `PRIVATE_KEY` or `MNEMONIC` in `.env` or the environment, or from an encrypted keystore at
  `~/.loxley/wallet.json` written by `loxley wallet import` or `loxley wallet new`. Never from a command line
  argument: shells keep history.
- The keystore is scrypt (N = 2^17, r = 8, p = 1) + AES-256-GCM, mode 600. The passphrase is typed on the terminal
  without echo, or read from `LOXLEY_PASSPHRASE` for unattended runs. `loxley wallet forget --yes` overwrites the file
  with random bytes and unlinks it.
- The key is held in memory for the length of one command and is never written anywhere else, never logged, never
  sent to any host but the RPC in the form of a signed transaction.
- Use a burner. Fund it with what one session may lose. The main stack stays in a wallet loxley never sees.

## What a transaction can be

- A curve buy: `buy(quoteIn, minTokensOut, recipient)` on the token's own pons v2 curve, `value = quoteIn`.
- A curve sell: `approve(curve, tokens)` then `sell(tokensIn, minQuoteOut, recipient)`.
- A pool buy: `execute(...)` on the Uniswap v4 universal router with a single `SWAP_EXACT_IN_SINGLE` behind the pons
  hook, `value = amountIn`.
- A pool sell: `approve(permit2, max)`, `permit2.approve(token, router, max, max)`, then the same `execute`.
- A fee claim: `claim()` on the pons fee escrow (`PONS_ESCROW`), which pays the caller's own credited balance and
  nothing else.

Every one of them is simulated with `eth_call` first and refused on a revert; every trade carries a minimum output
derived from the quote and `SLIPPAGE_BPS`, so a worse fill reverts on chain rather than settling. Nothing else is ever
signed: no `eth_sign`, no `personal_sign`, no typed data, no approvals to any address but the curve, permit2 and the
router listed in `.env.example`.

## What leaves your machine besides the RPC

With `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` or `DISCORD_WEBHOOK` set, the sniper, `follow` and the guard post one
line per FIRE, CLOSED, SIREN and WAIT to that bot or webhook: the symbol, the size, the result, the reason, and for
a live fill or sell the explorer link to the transaction, which shows the wallet that signed it. Never the key, never
the passphrase. A chat that sees your fills knows your burner: keep it private. Unset, nothing is posted.

## The bundled library

`vendor/viem.js` is viem and its dependencies (all MIT, notices in `vendor/LICENSES.md`) bundled by esbuild from
`vendor/entry.js`. To check it is what it says: `npm install && npm run vendor` with the pinned versions in
`package.json` rebuilds the file; `git diff vendor/viem.js` should then be empty. `cli/deps.js`
is the only importer.

## What leaves your machine

The reading commands talk to DexScreener, the Robinhood Chain explorer and the chain's RPC, and to nothing else. The
trading commands add signed transactions to the same RPC. The full table is in [docs/SAFETY.md](./docs/SAFETY.md).
A request to any other host is a bug: report it with the file and line.

## Numbers shown without their label

Anything simulated, estimated or fallen back must say so where it is shown. A simulated value labelled live, or a paper
fill labelled as a real one, is a bug of the most important kind.

## The mock chain

`test/mock-chain.js` binds 127.0.0.1 only, serves fixtures, and mines the transactions it is sent into its own state.
It is not a proxy to anything, and a key used against it signs nothing that reaches a real chain.

## Reporting

Open an issue with the `read` or `siren` template, or, if you would rather not post it, write to the maintainer on X
([@shmidtqq](https://x.com/shmidtqq)). There is no bounty; there is a line in the changelog with your name if you
want it.
