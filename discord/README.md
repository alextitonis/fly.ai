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

**Tagging the bot** with a question (`src/intent.ts`, keyword checks, no model) answers like the command: "@fly.ai how's
the price" = `!price`, also the leaderboard, stats, the contract, the desk, the market, what the project is, how to buy (`!buy`), partner collections (`!partners`), `scan 0x…`, "can you check this project Foo" / a contract / `@x` / a site
(`!research`, `src/research.ts`: DexScreener, FxTwitter and the scam filter, fixed rules; `src/sources.ts`: pools, price history, who's trading, the creator's other launches, paid promotion, site age, code, CoinGecko, what our desk and wallets did; sites through Fly Scan; `src/chatter.ts`: their posts now and months ago, replies, what others say, a search for trouble, the web and news, read by Haiku: needs the secrets APIFY_TOKEN and
OPENROUTER_API_KEY, RESEARCH_X_PER_DAY reads a day, default 5, shared with the desk's Apify plan). `!track` shows how its verdicts held up (`src/track.ts`, the volume at DATA_DIR keeps the log), and
"any alpha?" / "suggest some tokens" = `!alpha` (up to 3 current tokens as cards, through the scam filter, once a minute per channel).
Anything else gets a fly line back.

**Alpha feed** (`src/alpha.ts`, on while `ALPHA_CHANNEL_ID` or `ALPHA_PARTNERS` is set in fly.toml): token calls as
cards, like an alpha group chat. `ALPHA_PARTNERS` = `channel:role,...` sends the same feed to partners' channels and
pings the role on new calls, bets and launches (not on sell replies); `DISCORD_GUILD_ID` is a comma list of the servers
whose `!` commands are answered. In a partner server the bot needs View Channel, Send Messages, Embed Links and Read
Message History, and the role must allow being mentioned. Calls: tokens the top 5 Fly Wallets of the week or the Fly Desk buy (or wanted to buy but couldn't for
the wallet's reasons: gas, cross-chain size or quote, no room, buys paused), tokens FOMO's top traders pile into
(2+ wallets or $5k+ in an hour), new pools the desk finds once they trade, and Azuro bets (pick, stake, odds; the
result replies under the bet). Each token call shows mc, liquidity, volume, age, holders, top-10 share, the CA and a
chart link; a later sell replies under its call with the P&L. A token is called once per 12 h, at most 8 messages
an hour; passes on the token's merits (thin pool, round trip, stale price) and index buys aren't posted. A restart
never reposts history.

**Research → Fly Desk** (`src/deskfeed.ts`, `src/scout.ts`, on while the secret `DESK_RESEARCH_TOKEN` is set, the same value on
flytrade-desk): every `!research` token verdict goes to the desk (`flytrade/desk/verdicts.py`, POST /research), which follows it at
+24 h / +72 h / +7 d and answers with what its own screen knows (meme gate, Fly Scan), shown on the card as "🛡️ Fly Desk's screen".
The scout runs the same facts and rules (no X reads, no model) on the desk's new pools and FOMO tokens, 4 every `SCOUT_POLL_MS`
(20 min; 0 = off), and sends those verdicts too. Nothing is posted or bought: `python flytrade/desk/verdictreport.py` says whether 🟢 beats 🔴.

Every call passes the scam filter first (`src/screen.ts`): at least $10k of real money (the paired side) in the pool
and $1k traded in 24 h; on Robinhood Chain the token's Transfer logs (public RPC) give every balance, and the ten
biggest wallets (contracts left out) may hold at most 50%, wallets that look like one group at most 25% (3+ top
wallets that got their first tokens in the same block, or that one wallet sent tokens to). Skipped tokens are logged
(`fly logs`: "alpha: skipped $X ...").
The bot needs View Channel + Send Messages in that channel (add it to the private channel).

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
