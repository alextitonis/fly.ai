# fly.ai Discord bot

TypeScript on Node 22 (run directly, no build), [discord.js](https://discord.js.org) v14, one small machine on fly.io.
Commands start with `!` (e.g. `!help`).

## Discord setup (once)

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** → Reset Token → copy it (`DISCORD_TOKEN`).
3. **Bot** → Privileged Gateway Intents → turn on **Message Content Intent** (the bot can't read `!` commands without it).
4. **OAuth2 → URL Generator**: scope `bot`, permissions `View Channels`, `Send Messages`, `Read Message History` → open the URL, add the bot to the server.

## Local

```sh
cd discord
cp .env.example .env      # fill in the token (.env is gitignored)
npm install
npm start
```

Then `!help` in the server. `npm run typecheck` checks types.

## Commands

| Command | Shows | Source |
| --- | --- | --- |
| `!project` (`!about`) | what fly.ai is, where to start | static |
| `!token` (`!ca`, `!supply`) | contract, chain, live supply, circulating, burned, locked, links | mine `/api/supply` |
| `!price` | just the price, e.g. `$FLYAI $0.0001868 (+9.31% 24h)` | DexScreener |
| `!stats` (`!fdv`, `!mcap`, `!chart`) | price card: 1h/6h/24h, market cap (price × circulating), FDV (price × total), volume, liquidity | DexScreener + mine `/api/supply` |
| `!flydesk` (`!desk`) | pot, profit, ATH, payout, holdings, latest trades | flytrade-desk `/public/site.json` |
| `!leaderboard [24h\|7d\|all]` (`!lb`) | top 10 Fly Wallets by profit, with nicknames | mine `/api/vaults/leaderboard` via `/mapi` |
| `!marketplace` (`!market`) | Fly Market, breeding, OpenSea | static |
| `!help` | the list | |

Tag the bot (or reply to it) and it answers like a fly: keywords pick a mood (swatter → panic, moon → hype,
banana → landing on it, gm → turns around, questions → washing its face), the mood picks a line (`src/fly.ts`, no AI).
One reply per person every 5 s.

**Alpha feed** (`src/alpha.ts`, on while `ALPHA_CHANNEL_ID` is set in fly.toml): every 2 min the bot posts what the
top 5 Fly Wallets of the week did (fills with reason, CA, chart + tx links, bets, FOMO finds, failed swaps, buys passed
on, minus refusals that repeat all day) and the Fly Desk's trades and launches. A restart never reposts history.
The bot needs View Channel + Send Messages + Embed Links in that channel (add it to the private channel).

Live answers are cached for 60 s (`src/data.ts`); if a source is down the last answer is shown.

## Adding a command

Copy `src/commands/help.ts`, give it a `name` + `description`, add it to the list in `src/commands/index.ts`.
Words after the command come in as `args` (`!roll 2 6` → `["2", "6"]`). `!help` lists every command on its own.

## Deploy (fly.io)

```sh
cd discord
fly apps create flyai-discord --org personal
fly secrets set DISCORD_TOKEN=... -a flyai-discord
fly deploy --ha=false     # one machine; two would answer every command twice
fly logs -a flyai-discord
```
