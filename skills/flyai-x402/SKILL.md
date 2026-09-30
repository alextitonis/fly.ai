---
name: flyai-x402
description: Buy single answers from fly.ai's pay-per-request API, a few cents each over x402 (USDG on Robinhood Chain or USDC on Base) - the fly desk model's read of a Polymarket market, a TimesFM forecast for a token or the user's own series, the real cost of a trade on Robinhood Chain, a token check, a run of the real fly connectome, or a generated fly meme. Use when the user pastes a polymarket.com link and asks what to pick, asks "what does it cost to trade X on Robinhood Chain", "is this token safe", "forecast this", "how would a real fly react", "make me a fly meme", says "/flyai-x402", or wants any of those records.
---

# fly.ai pay-per-request 🪰

fly.ai sells single answers, each paid on its own. Everything goes through `scripts/flyai_x402.py`, which sits next
to this file (`pip install requests eth-account`). Its notes for the person go to stderr and one JSON document for
you goes to stdout.

| Command | Price | What comes back |
|---|---|---|
| `market <link, id or slug>` | $0.05 | The desk model's probability for a Polymarket market, the market's price, the side it leans to, its record |
| `picks [--limit 10]` | $0.05 | Open markets where the model and the price disagree most |
| `forecast <symbol or address> [--horizon 8]` | $0.03 | TimesFM forecast with a band for a token the desk tracks (15-minute bars) |
| `forecast-series <file.json> [--step 3600] [--horizon 8]` | $0.03 | The same for the user's own list of numbers |
| `cost <symbol or address> [--usd 100]` | $0.02 | Real round-trip cost on Robinhood Chain at that size, through the best pool |
| `token <address>` | $0.03 | Pools, age, links, copycats, contract and holder facts for a Robinhood Chain token |
| `brain --sense <sense>` or `brain "<message>"` | $0.05 | A run of the real fly connectome: what the fly did |
| `meme "<idea>" [--style] [--top] [--bottom] [--out]` | $0.20 | A generated fly meme, saved as a .webp file |
| `products`, `record`, `forecast-record`, `senses`, `styles` | free | The catalogue, the two records, the senses and meme styles |

## Rules

- **Money moves only with the user's OK.** A paid command without `--yes` pays nothing: it prints the cost. Show the
  user that cost and wait for a clear yes before running it again with `--yes`. One yes covers one request unless the
  user says otherwise.
- **Never ask for, read, print or type a private key.** Paying needs a wallet key in the environment variable
  `FLYAI_X402_KEY`, which the user sets themselves, outside the chat. If it is missing, tell them to set it (a fresh
  wallet holding a dollar or two is plenty) and stop. Do not suggest pasting the key into the conversation and do not
  echo the variable.
- **Always pass on the record.** A Polymarket or forecast answer has a `record` block. Say in plain words how the
  model has done (for example "on 50 resolved markets it has been worse than the market's own price", or "the
  forecasts rank which tokens will move most, but their direction has shown no edge"). Never present a lean or a
  forecast as a tip that will win, and never size a bet or a trade for the user. These are a model's opinions, not
  advice.
- **Facts stay facts.** `cost` and `token` are measurements and lookups, not opinions. Report the numbers and the
  `flags`; do not call a token "safe". An empty `flags` list is not a clean bill of health.
- **A failed request costs nothing.** An unknown market or token (404), an event with several markets (409), a bad
  input (400) or an outage (503) is answered before any payment is taken. Say so rather than retrying blindly.

## Steps

1. **Pick the command** from the table for what the user asked. If they ask what is on offer, run `products`.
2. **Show the cost.** Run the command without `--yes`; it prints `needs_payment` with the cost and the network.
3. **After a clear yes**, run the same command with `--yes`.
4. **Read the answer back** in plain words, then the record when there is one.

```bash
python scripts/flyai_x402.py market "https://polymarket.com/event/<event>/<market>"         # the cost
python scripts/flyai_x402.py market "https://polymarket.com/event/<event>/<market>" --yes   # after a yes
python scripts/flyai_x402.py cost NVDA --usd 200 --yes
python scripts/flyai_x402.py token 0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C --yes
python scripts/flyai_x402.py forecast NVDA --horizon 8 --yes
python scripts/flyai_x402.py brain "someone brought pizza" --yes
python scripts/flyai_x402.py meme "monday meetings" --top "WHEN THE STANDUP" --bottom "RUNS LONG" --yes
```

Notes on each:

- **market**: a polymarket.com link is best. A link to an event that holds several markets comes back as a list
  (`markets`, free): show the questions, let the user choose, and ask again with that market's `id`.
- **forecast**: symbols are the desk's tickers (`NVDA`, `FLYAI`, `base:ETH`) or a Robinhood Chain token address. The
  answer is a path of values with a lower and upper band. For the user's own data use `forecast-series` with a JSON
  file holding a list of at least 24 numbers, oldest first, and `--step` for the seconds between them.
- **cost**: `round_trip_cost_pct` is buying then selling at once, fees, price impact and token tax included, gas not.
  `best` is the cheapest of the pools tried.
- **token**: `flags` lists what stands out (honeypot or tax reports, a thin pool, copycat tickers, a dead website, a
  young pool, concentrated holders).
- **brain**: senses are threat, taste, mate, wind, touch, smell, nothing. With a message, a keyword table picks the
  sense; say which sense was used. `did` is what the fly's neurons made it do.
- **meme**: ideas follow all-ages rules and are refused, free, if not allowed. The image is saved to `--out`
  (default `fly-meme.webp`); tell the user where it is.

## Options

- `--network base` pays in USDC on Base instead of USDG on Robinhood Chain (the default).
- `--max-price 0.5` refuses to pay more than this for one request. Leave it unless the user asks.
- `FLYAI_X402_URL` points the script at another address (default `https://flyai-x402.fly.dev`).

Any x402 client can use the service without this script: a request without payment returns HTTP 402 with the
standard `accepts` list. The full guide is https://www.flyaiworld.com/x402-api.md.
