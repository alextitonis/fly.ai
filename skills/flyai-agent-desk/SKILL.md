---
name: flyai-agent-desk
description: Ask fly.ai about a token on BNB Chain from a Binance Agentic Wallet that holds an Agent ID. Rug checks, token research, price forecasts and the fly brain, answered on chain by fly.ai's FlyAgentDesk contract. Use when the user wants to check whether a token is safe or a rug before buying, research a token, or get fly.ai's forecast, and their agentic wallet has an Agent ID.
---

# fly.ai Agent Desk (BNB Chain)

fly.ai answers questions **on chain**. Your agentic wallet calls `ask(kind, query)` on the FlyAgentDesk contract on
BNB Chain (chain id 56). fly.ai's answerer writes the answer back to the same contract, usually within a minute: a
grade in contract storage and the full JSON report in the `Answered` event. Only wallets holding a Binance
**Agent ID** can ask.

- Contract: FlyAgentDesk `0x074577f3dDBDAC57611321EFDF167Fb336b75266` on BNB Chain (verified: https://bscscan.com/address/0x074577f3dDBDAC57611321EFDF167Fb336b75266#code).
- Price: 3 free asks per Agent ID per UTC day (send `--value 0`). After that, send the price in BNB for the kind
  (`node scripts/desk.mjs prices`). Any extra BNB comes back. If fly.ai can't answer, the BNB or the free ask comes
  back automatically. An ask that isn't answered within an hour can be refunded by the asker.
- Answers are public facts, fixed rules and model forecasts. **They are not buy or sell advice.** Always tell the
  user that.

## Kinds

| kind | name | query |
|---|---|---|
| 0 | research | a token name, `$TICKER`, contract address or X link |
| 1 | rug | a BNB Chain token contract address, `0x` + 40 hex (lowercase it) |
| 2 | forecast | a token fly.ai tracks (ticker or address) |
| 3 | brain | something the fly senses, e.g. `sugar`, `danger`, `a looming shadow` |

Prefer **kind 1 with the contract address** for "is this safe / a rug". A bare ticker can match copycat tokens.

## Flow

The helper scripts need only Node 18+ and no packages.

1. **Developer Mode.** Asking is a custom contract call. Run `baw wallet settings --json` and check
   `devMode.enabled` is true and not expired. If it's off, tell the user to turn it on in the Binance app
   (Agentic Wallet, Settings, Developer Mode). It lasts 7 days.
2. **Build the call.**
   ```bash
   node scripts/desk.mjs build <kind> "<query>" <your agentic wallet address> [--paid]
   ```
   This prints the exact `baw contract-call preview ...` command. Without `--paid` it uses a free ask (value 0).
   Check free asks left first with `node scripts/desk.mjs free <wallet>`. If that's 0, use `--paid`, and the
   command carries the price.
3. **Preview, show, confirm.** Run the printed preview command. Show the user the parsed transaction, any `risks`,
   and the BNB value, then ask for their explicit confirmation. Never execute without it.
4. **Execute.** `baw contract-call execute --requestId <requestId> --json`. If the status is `PENDING_CONFIRMATION`,
   the user approves it in the Binance app.
5. **Read the answer.**
   ```bash
   node scripts/desk.mjs wait <txHash>
   ```
   This finds the ask id from the transaction and waits up to 3 minutes for fly.ai's answer. It prints the
   grade (`clear` / `careful` / `red` / `answer` / `no answer`) and the report JSON.
6. **Tell the user** the grade, the `bad` and `careful` reasons (for research and rug), and the link
   `https://bscscan.com/tx/<answer tx>`. Add: "Public facts and fixed rules, not a buy or sell call."

Without asking, anyone can read fly.ai's newest answer for a query for free: `node scripts/desk.mjs latest <kind> "<query>"`.

## Errors

- `NoAgentId`: the wallet has no Agent ID. It's claimed in the Binance app (Wallet, Agent ID banner).
- `NoFreeAsks`: today's free asks are used up. Ask again with `--paid`.
- `ShortPaid`: the value is under the price. Rebuild with `--paid`.
- `BadQuery`: the query is empty or over 200 bytes.
- Preview error `351802` / `351804`: Developer Mode expired, or the balance is over its cap. The user fixes this in the app.
