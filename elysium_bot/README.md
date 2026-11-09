# Elysium Sniper Bot

A bot that buys brand-new tokens on Elysium the moment they launch and sells them quickly.

It runs on your own computer. It starts in **practice mode**, which uses fake money. Nothing real is spent until you
switch it on.

> ⚠️ Only use money you're OK losing. Most new tokens go to zero.

---

## 1. Install (one time)

1. Install **Node.js** from https://nodejs.org (the "LTS" button).
2. Open a terminal in this `elysium_bot` folder and run:

```bash
npm install
```

## 2. Make your wallet

```bash
npm run setup
```

This creates a new wallet just for the bot and shows its **address**:

```
  Your bot wallet address:

    0x1234...abcd
```

The wallet's secret key is saved in a file called `.env`.
- Keep a copy of `.env` somewhere safe.
- **Never send `.env` to anyone.** Whoever has it can take your money.

You can see your address and balance again anytime:

```bash
npm run wallet
```

## 3. Practice first (fake money)

```bash
npm run paper
```

Watch it find tokens, buy and sell. Press **Ctrl + C** to stop. See how it did:

```bash
npm run status
```

## 4. Trade for real

1. Send a small amount of **HYPE on Elysium** to your bot's address from step 2. Use only the official bridge linked in
   Kinetiq's docs: https://elysium.kinetiq.xyz/docs
2. Start it:

```bash
npm run live
```

The first time, it sets itself up with one small transaction. Then it trades on its own. Press **Ctrl + C** to stop.

## Run it on a server (fly.io)

So it keeps trading when your computer is off. One small machine, about $3–4 a month.

You need the `fly` command installed and logged in (`fly auth login`). Then, in this folder (Git Bash):

```bash
fly apps create elysium-bot --org personal
fly volumes create elysium_bot_data -r iad -n 1 -s 1 -a elysium-bot
grep ^PRIVATE_KEY= .env | fly secrets import -a elysium-bot
fly deploy
```

- The third line copies **only your wallet key** to the server as a secret. Nothing else from `.env` leaves your computer.
- If the name `elysium-bot` is taken, pick another and change `app = ...` in `fly.toml` to match.

Watch it trade:

```bash
fly logs -a elysium-bot
```

Stop it: `fly scale count 0 -a elysium-bot`. Start again: `fly scale count 1 -a elysium-bot`.

> Run the bot in **one place only**. Don't run `npm run live` on your computer while the server runs: two bots on one
> wallet would trade over each other.

To change the buy size on the server, add a line like `BUY_HYPE = "0.3"` under `[env]` in `fly.toml`, then run
`fly deploy` again.

## Handy commands

| Command | What it does |
|---|---|
| `npm run wallet` | Show your address and balance |
| `npm run paper` | Practice with fake money |
| `npm run live` | Trade for real |
| `npm run status` | Show open trades and profit |
| `npm run sell-all` | Sell everything now |
| `npm run withdraw` | Move leftover HYPE back to your wallet |

## Change how much it buys

Open `.env` in any text editor and change these lines:

| Setting | Means | Default |
|---|---|---|
| `BUY_HYPE` | HYPE spent per token | 0.5 |
| `MAX_OPEN` | Most tokens held at once | 4 |
| `MAX_SPEND_HYPE` | Most HYPE it will ever spend | 5 |

## Launch day (Nov 9)

Elysium's main network goes live on Nov 9. Until then the bot runs on the test network.

On launch day, open `.env` and set:
- `RPC_URL`: the mainnet address from https://elysium.kinetiq.xyz/docs/connecting-to-elysium
- `WHYPE`: from the "Contract addresses" page of the same docs

Then run `npm run wallet` to check it connects, `npm run paper` for a few minutes, and `npm run live`.

## Stay safe

- Use the bot's own wallet, not your main one.
- Never click bridge links from X or Telegram. Fake bridges steal funds.
- Taking money out of Elysium through the official bridge can take days.

---

For how it works and every setting, see [DETAILS.md](DETAILS.md).
