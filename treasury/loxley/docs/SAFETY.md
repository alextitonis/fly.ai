# Safety

The browser desk reads. It does not trade, sign, connect, or hold anything. The terminal reads the same way, and trades
only when you arm it: what that means is in [SECURITY.md](../SECURITY.md) and in [CLI.md](./CLI.md#trading). This page
is about the desk, what leaves your machine, and what neither face can know.

## What is in the file

- One HTML file. Markup, styles, and a single script in an anonymous function. No build step, no bundler, no minified
  blob: what you read is what runs.
- No key field, no seed field, no wallet connection, no `eth_sendTransaction`, no `eth_sign`, no `personal_sign`,
  no `window.ethereum`. Search the file for any of those; they are not there.
- Two external resources: the Google Fonts stylesheet for DM Sans and JetBrains Mono. Without them the desk falls back
  to system fonts and works the same.
- Storage: none. No cookies, no localStorage, no IndexedDB. Close the tab and the session is gone, unless you
  exported the black box, which is a file you chose to download.

## What leaves your browser

JSON requests to five hosts, all of them reads:

| Host | What is sent |
|---|---|
| `api.dexscreener.com` | the token address |
| `api.geckoterminal.com` | the token address, the pool address |
| `robinhoodchain.blockscout.com` | the token address, the deployer address, the factory address, block numbers |
| `rpc.mainnet.chain.robinhood.com` | `eth_call` with a token or curve address and a selector; `eth_getLogs` with the factory address; `eth_blockNumber` |
| `fonts.googleapis.com` · `fonts.gstatic.com` | the font request |

Plus image loads for token logos from wherever the token's metadata points (DexScreener's CDN, GeckoTerminal, IPFS
gateways). Those are `<img>` loads; they carry the address of the image, nothing about you beyond what any image load
carries.

The desk counts its requests in the status bar. Nothing is sent that is not visible in your browser's network tab.

The terminal talks to the same hosts, minus the fonts, plus the following when a wallet is armed: `eth_estimateGas`,
`eth_call` simulations and `eth_sendRawTransaction` to the RPC, carrying a transaction signed on your machine. The
keystore never leaves the disk; the key never leaves the process.

## What the desk cannot know

- **Intent.** A deployer with five launches is a production line; whether the sixth is honest is not in any read.
- **Locks and unlocks.** The desk sees a pool's depth, not who owns the LP position or when it can be pulled.
- **Hidden taxes and blacklists.** `verified` means the source is public on the explorer, not that it was read. A sell
  tax written into the contract shows up on the desk only as an impact that is larger than the reserve explains.
- **The next block.** Polls are eight seconds apart. A rug that empties the pool in one transaction is over before
  the next poll; the siren fires after, not before. The drain clock, the pool trend and the distribution trigger exist
  to catch the slow ones, which are most of them.
- **Anything DexScreener does not index.** A token still on its bonding curve has no pair and no numbers; the desk
  says so and points at the radar's ring instead.
- **Its own sources being wrong.** The explorer can lag, GeckoTerminal can rate-limit, the public RPC can refuse a
  burst. Every read has a fallback or a retry, and every fallback is labelled on the desk (`n/a`, `sim`, `estimated`).

## The simulator and the drill

Two things on the desk are made up, on purpose, and say so everywhere they appear: the simulator (`?demo=1`, `demo`,
or the fallback when DexScreener cannot be reached) and the exit drill (`replay rug`). The badge, the verdict header,
the chart header and the stream all carry the word. A replay of a real recording says REPLAY. Only a live poll says
LIVE.

## Reporting

If you find a request the desk makes that is not in the table above, or a place where a simulated number is shown
without its label, open an issue with the file line. That is a bug, and the most important kind.
