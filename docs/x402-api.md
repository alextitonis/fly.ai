# fly.ai pay-per-request API

Single answers, each paid on its own over x402. No account and no key: a request without payment answers HTTP 402
with the terms, and the same request with a signed payment returns the answer.

Base URL: `https://flyai-x402.fly.dev` (`GET /` lists the products and their current prices)

| Product | Endpoint | Price |
|---|---|---|
| Polymarket read | `GET /market?url={polymarket.com link}`, `GET /market/{id or slug}`, `GET /picks?limit=10` | $0.05 |
| Forecast | `GET /forecast/{symbol or address}?horizon=8`, `POST /forecast` | $0.03 |
| Trade cost | `GET /cost/{symbol or address}?usd=100` | $0.02 |
| Token check | `GET /token/{address}` | $0.03 |
| Fly brain | `GET /brain?sense=threat`, `GET /brain?message=...` | $0.05 |
| Fly meme | `GET /meme?idea=...&style=classic&top=...&bottom=...` | $0.20 |

Free: `GET /`, `/record` (Polymarket model), `/forecast/record`, `/brain/senses`, `/meme/styles`.

A request is charged only when there is an answer. The payment is verified first, the work is done, and the payment
is settled last. A bad input (400), an unknown market or token (404), an event with several markets (409) and an
outage (503) are answered before anything is taken.

## Paying (x402)

Scheme `exact`, through the Ultravioleta DAO facilitator (`https://facilitator.ultravioletadao.xyz`). The buyer signs
an EIP-3009 `TransferWithAuthorization`; the facilitator submits it and pays the gas.

| Network | Token | Contract | EIP-712 domain |
|---|---|---|---|
| Robinhood Chain, `eip155:4663` | USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | name `Global Dollar`, version `1` |
| Base, `eip155:8453` | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | name `USD Coin`, version `2` |

1. Call a paid endpoint with no payment. The answer is `402` with the terms in the body and, base64-encoded, in the
   `PAYMENT-REQUIRED` header:
   ```json
   {"x402Version": 2, "resource": {"url": "https://flyai-x402.fly.dev/cost/NVDA", "...": "..."}, "accepts": [
     {"scheme": "exact", "network": "eip155:4663", "asset": "0x5fc5...d168", "amount": "20000",
      "payTo": "0x6258...89ea", "maxTimeoutSeconds": 60, "extra": {"name": "Global Dollar", "version": "1"}},
     {"scheme": "exact", "network": "eip155:8453", "asset": "0x8335...2913", "amount": "20000", "...": "..."}]}
   ```
2. Pick one `accepts` entry and sign `TransferWithAuthorization(from, to = payTo, value = amount, validAfter,
   validBefore, nonce)` with the domain from `extra`, `chainId` from `network` and `verifyingContract = asset`.
3. Send the request again with the header `PAYMENT-SIGNATURE` (or `X-PAYMENT`) set to base64 of:
   ```json
   {"x402Version": 2, "accepted": { "...the accepts entry you chose, unchanged..." },
    "payload": {"signature": "0x...", "authorization": {"from": "0x...", "to": "0x...", "value": "20000",
                "validAfter": "...", "validBefore": "...", "nonce": "0x..."}}}
   ```

Any x402 client library does steps 2 and 3. A small Python reference, which is also a Claude skill, is in the repo:
[`skills/flyai-x402`](https://github.com/alextitonis/fly.ai/tree/main/skills/flyai-x402).

Every paid answer ends with `"paid": {"usd", "payer", "network", "transaction"}`.

## Polymarket read

The [Fly Desk](https://www.flyaiworld.com/desk) runs a model over Polymarket markets for its own paper bets. This
returns that model's read of one market, or its picks.

- `GET /market?url=` takes a polymarket.com link; `/market/{ref}` takes a market id or slug. A link to an event with
  several markets answers 409 with `markets` (id, slug, question) to choose from.
- `GET /picks` lists open markets where the model and the price disagree most. It leaves out markets priced under
  0.10 or over 0.90, answers more than six hours old, and markets whose price has moved more than 0.10 since.

| Field | Meaning |
|---|---|
| `market_price` | Polymarket's price for `outcome` now, 0 to 1 |
| `model_probability` | The model's probability for `outcome`, asked with the market's price in front of it |
| `model_probability_blind` | The same, asked on the question alone |
| `gap`, `leans` | Model minus market, and the side the model favours; `leans` is null under a 0.05 gap |
| `source` | `desk`: the desk's own latest answer. `asked now`: asked for this request |
| `record.brier` | Error on resolved markets for the market's price, the blind ask and the informed ask; lower is better |

So far the model has not beaten the market's own price. The record is in every answer so a caller can weigh it.

## Forecast

TimesFM 2.5 forecasts with a prediction band.

- `GET /forecast/{ref}?horizon=8&confidence=0.8`: a token the desk tracks, by its ticker (`NVDA`, `FLYAI`,
  `base:ETH`) or Robinhood Chain address, on 15-minute bars. `horizon` is 1 to 64 bars.
- `POST /forecast` with `{"series": [numbers, oldest first], "step_seconds": 3600, "horizon": 8, "confidence": 0.8}`:
  any series of 24 to 2,048 numbers.

The answer has `forecast`: a list of `{at, value, lower, upper}`. For a token it also has `move_pct_at_horizon` and
`band_pct_at_horizon`. `GET /forecast/record` shows how the desk's forecasts have scored: the band's width ranks
which tokens will move most better than a plain moving average of past moves does; the direction has shown no edge.

## Trade cost

`GET /cost/{ref}?usd=100` quotes, on chain and now, buying `usd` of a Robinhood Chain token and selling it straight
back, through up to four of its Uniswap pools. `ref` is a ticker the desk lists or any token address with a pool of
$10,000 or more against USDG or WETH. `usd` is 1 to 10,000.

| Field | Meaning |
|---|---|
| `best` | The cheapest route |
| `routes[].round_trip_cost_pct` | What the round trip loses: pool fees, price impact and any token tax. Gas is not included |
| `routes[].tokens_for_usd`, `buy_price_usd` | What the buy returns and the price it implies |
| `pool_liquidity_usd` | Depth of the token's main pool |

A quote, not a fill: the price can move before a trade lands.

## Token check

`GET /token/{address}` returns facts about a Robinhood Chain token from DexScreener and GoPlus: its pools and their
depth, the age of its first pool, its listed websites and whether the first one answers, X and Telegram links, paid
boosts, how many other tokens use the same ticker, and the contract and holder facts GoPlus reports (open source,
buy and sell tax, holder count, share held by the ten biggest wallets and by the creator, reported problems).

`flags` lists what stands out. An empty list is not a clean bill of health, and there is no verdict: no model is
involved.

## Fly brain

`GET /brain?sense=threat` stimulates one sense in the MaleCNS v1.0 connectome (166,700 neurons, the
[`flybrain`](https://pypi.org/project/flybrain/) package) for one simulated second and compares it with the same
brain at rest. Senses: `threat`, `taste`, `mate`, `wind`, `touch`, `smell`, `nothing` (`GET /brain/senses`).
`?message=` maps free text to a sense with a keyword table. `seed` changes the noise.

The answer has `did` (what the fly's neurons made it do: jumped, buzzed its wings, groomed, turned, walked, backed
up), `extra_spikes` per motor group, and the descending neurons that fired most. One run at a time; the first run
after the service wakes loads the brain and takes longer.

## Fly meme

`GET /meme?idea=monday+meetings&style=classic&top=WHEN+THE+STANDUP&bottom=RUNS+LONG` returns
`image_webp_base64` (1024 x 1024). Styles are at `GET /meme/styles`. Ideas and text are up to 60 letters, numbers
and simple punctuation and follow all-ages rules; an idea that isn't allowed is refused before anything is drawn or
charged. Every image carries an "AI image" tag.
