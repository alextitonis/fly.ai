# Ideas

Ideas we want to keep, not built yet. Newest first.

## Fly Boxes: holders snapshotted, sealed NFT boxes trade a week, then open (2026-11-23)

*Status: picked 11-23, planned in [flytrade/FLYBOXES-PLAN.md](flytrade/FLYBOXES-PLAN.md) (that file is current). Not building yet.*

**Why:** what moved $FLYAI was speculation on an unknown with a date (the launch, the 150K free mint, burns), not perks. The XP season didn't move it, and the fee drop pot is too small to matter ($88 this month, split by 317 wallets). Sealed boxes that can be traded before they open give degens something to bet on and flip, and holding more than 200k gets you more of them. The current 200k rules don't change.

**Timeline (TRT), user's version 11-23: "Fly Boxes"**
- **11-24:** announce. "Snapshot for a free airdrop of Fly Boxes until Saturday. They're tradeable." No hint of what is inside.
- **11-24 to 11-28 23:59:** the snapshot, measured as each wallet's average $FLYAI over those days (mine `feedrop.ts` way; FlyLock and staked count), so buying on the last day helps little. A public list shows tags and ranks.
- **11-29:** Fly Boxes airdropped (ERC-721), tradeable right away. Contents hash published the same moment.
- **11-29 to 12-05:** one week of live trading, unopened.
- **12-06:** boxes become openable: open burns the box and pays its contents.
- Build order: only a plain ERC-721 behind a proxy is needed by 11-29; `open()` is added by a proxy upgrade before 12-06. If it works, a second round for Christmas.
- (Earlier draft was snapshot 11-27..12-17, open 12-25.)

**Who gets boxes (draft)**
- Under a 200k average: no tag, no box. That is the reason to reach 200k.
- 1 box for every 200k average, cap 25 per wallet (5M+). Holding more for longer = more boxes. Box count is computed only from the average, so buying late helps little.
- Rarity is random per box: Common / Rare / Legendary. A wallet with more boxes has more chances at a Legendary.

**What's inside (draft, to size)**
- **$FLYAI:** a pool from the dev wallet (it holds ~20.6M on 11-23; price ~$0.000165, 200k ≈ $33). Suggest 5-10M for the pool, spread unevenly so Commons get a little and Legendaries get a lot.
- **ETH or USDG:** from Pons fees or Flyverse cut, so boxes hold real dollars too.
- **Prizes paid into your fly (user 11-23):** "$FLYAI in your Trader Fly", USDG in your fly to trade with, and so on. The opener picks which of their flies gets it; with no fly, it goes to the wallet (or the prize is a free fly to start one). FLYAI in a fly is only sold above average cost, so these prizes don't get dumped on the chart, and they can lift a fly over the 200k bar.
- **USDG (user 11-23: boxes need USDG too).** On 11-23 there's no USDG to spare: dev ~$0.30, FlyTill $0, POOL $34 (that's the flies' money, not ours); Pons fees already go to the fee drop + GTA raffle. Plan: **the USDG pot fills from box trading.** Box sales on the market pay a higher fee (e.g. 5%) straight into the box contract, so the pot visibly grows with every trade during the week. The hash fixes each box's *share* of the USDG pot (not a dollar amount), so it stays provably fair while the pot grows. Optional small seed from the user so the pot doesn't start at $0.
- **Big hits in a few Legendaries:** Trader Flies from team wallets if we can spare them, a large $FLYAI amount, a cash prize. A few known big hits are what make people price every box high.
- The whole pot sits in the contract before 12-18, visible on-chain (people can see the total but not which box has what). That is what makes the boxes trade above zero.

**How the contract works (user 11-23: rewards as named tiers with %, amounts set later)**
- New ERC-721 behind a proxy (rule: every new contract is upgradeable, OZ + ProxyAdmin).
- **The reward table is on-chain and public from the airdrop:** each tier has a name and its share of boxes in %, e.g. "Legendary: Bullas NFT, 1%", "Fly fuel: $FLYAI in your fly, 20%", "USDG share, 10%". Anyone can read the odds before trading. Amounts per tier (how much $FLYAI, what share of the USDG pot) are set later, before opening, and locked once set.
- **Which box gets which tier** is fixed at the airdrop as a hash (box id -> tier list + salt) and revealed when opening starts, so nobody, including us, can move a good tier after seeing who holds which box.
- `open(id, to)` burns the box and pays its tier to `to`: the opener's fly wallet (chosen in the UI) or their own wallet. Partner NFTs are held by the contract and sent the same way.
- Unopened boxes keep their prize (no expiry, or a long one), so they can keep trading.

**Partners in boxes:** the user talked with Bullas 11-23; they will probably give some of their NFTs for the rare tier. Others can be asked the same way.

**Rules for the wording**
- Never promise an amount, a return, or a dollar value. Only: "holders are tagged, gift boxes open on Christmas."
- Don't call $FLYAI a meme coin.

**Open questions**
- Amounts per tier: set after the airdrop, before opening (user 11-23).
- Do team, POOL, partner and contract wallets get excluded from the tag (like the fee drop's contract check)?
- Where boxes trade on Robinhood Chain (our own page listing vs an existing NFT marketplace).
- Local rules on prize or loot boxes (free airdrop, nothing sold, so likely fine, but check).

## Skill coins: "when AIs use it, the coin goes up" (2026-11-23)

*Status: REJECTED by the user 11-23.*

**The pattern:** pump.fun turned a joke into a coin, Virtuals turned an AI agent into a coin. In 2026 agents themselves are everywhere and free (OpenClaw ~3.2M MAU, 44k+ community skills). The value has moved to the **skills and tools agents use**, and agents now pay for them per call (x402, USDC).

**One line:** every agent skill or tool gets its own coin. Every time any AI pays to use that skill, part of the payment buys the coin on the market.

**Why it's different from Virtuals:** Virtuals coins were mostly hype around a character. A skill coin is bought by real usage: more AIs using the skill means more buying, all on-chain and visible.

**What exists (checked 11-23):** skill marketplaces paid per call in USDC (ClawHub, ClawMarket, Skillz Market, Otto AI skills, CoinMarketCap skills on ClawHub, Quick Intel at $0.03 a scan). None gives a skill its own coin, and none buys back with usage. Nothing found.

**Hard parts:**
- **Real usage:** how much agents actually spend today is unclear; claims in this space run high (RentAHuman showed 83 profiles against 70k claimed). Check x402 volume before building.
- **Fake usage:** a skill owner can pay their own skill to pump the coin. The buyback only comes from the payment, so faking costs the full price, but it still creates a fake chart.
- **It includes launching coins,** so it can read as "another launchpad". The difference is that the coin's buying comes from usage, not from people.

## Narrative ideas for a pump, like Eliza (2026-11-23)

*Status: both REJECTED by the user 11-23 (show format already exists; no robot hardware). Kept for the Eliza notes.*

**What made Eliza pump:** a new AI ability people could watch (agents with their own X accounts and wallets), a character to follow, open source, and a token at the center. The token was declared dead in Aug 2026 (founder ended support after a lawsuit settlement, ~97% under the peak). Narratives burn fast, so the hook has to keep producing new content.

**1. The market writes the show.** A daily AI micro-series (format like Fruit Love Island: 300M views in 9 days, votes on a Google form). Each character's fans vote by spending $FLYAI, which is burned; the AI writes the next episode from the votes; the weakest character is cut each week. The show runs on TikTok/X for mainstream reach, and every vote is a $FLYAI buy and burn.
- Exists? Nothing found. Pippin lets holders vote on story paths (an agent, not a show); Crypto: The Game was a human reality show.

**2. The internet's robot.** One real humanoid robot streaming 24/7; holders spend $FLYAI to bid on what it does next (walk into a shop, try a job, meet someone), and an AI agent carries it out. "The first robot owned and run by the internet." Humanoids are the 2026 AI story (~36k sold in H1, robot fight leagues).
- Exists? Nothing exact. XMAQUINA (DEUS) is a DAO investing in robot companies; a web project lets users steer robot arms for points; robot-games tokens on pump.fun don't control anything.
- Cost: a robot (~$16–20k), safety rules, and a person nearby at all times.

## What moved $FLYAI so far (checked 2026-11-23, GeckoTerminal daily, FLYAI/NVDA main pool)

| Date | Day move | Volume | What happened |
|---|---|---|---|
| 09-12 to 09-14 | launch | $1.17M, $291k, $112k | token launch |
| 09-23 | +38% | $4k | dev burns start (36M over 09-23..29) |
| 09-25 to 09-27 | +138%, +9%, +26% | $11k, $26k, $35k | Trader Flies mint landing + **free fly for wallets holding 150K FLYAI**, mint opens 09-26 |
| 10-03 to 10-04 | +34%, +27% | $17k, $13k | fly wallets live (10-02), real-money desk live (10-04) |
| 10-26 | +16% | $4k | buy week / desk chat |
| mid-Oct to now | mostly ±5% | ~$150–3k a day | ~30 launches (Flyverse, Pool, league, pet, partners, XP...) barely show |

**User note 11-23:** people hold 200k (the gate for fly trading, fee drop, Flyverse building) but there's no reason to hold more. Need incentives above 200k, added on top, without changing how the current system works.

**Lesson:** features didn't move the token. What moved it were **events**: something new and scarce, with a deadline, where **holding $FLYAI got you in** (the 150K free-mint rule was the clearest), plus the first time real money went live.

## Calls with receipts: pay only when the call made money

*Saved 2026-11-23. Status: user said "could be fine". Exists only in small or partial form.*

**One line:** callers post each call sealed on-chain before the move. You see their real record and pay only for calls that made money.

**The want it answers:** "someone I can trust to tell me what to buy." Paid tip rooms are where most crypto scams start (Korean 리딩방 fraud is ₩30–80B a month; fake AI signal groups everywhere).

**What exists (checked 11-23):**
- **Call trackers, free:** calls.team, Phanes, Outlight (3,400+ Telegram KOLs), Join Trojan. They rank callers after the fact from public channels. Nobody pays through them, and no money is held.
- **Sealed calls:** AlgoVault hashes calls to Base, but sells data to AI agents, not to people.
- **Pay per win:** Sealed Calls (0xtowhid.github.io/sealed-calls) holds half of a subscription and pays the creator only on positive days. It's a tiny hobby page.
- **Gap:** nobody combines a sealed record with followers' money held and paid out only on wins, in a simple app for normal people.

**Open questions:**
- **What counts as a win:** price N hours after the call? The best price within a window? It has to include fees and slippage, and use one fixed rule per call type.
- **Cheating:** callers dumping on followers (we can check the caller's wallet), many accounts posting opposite calls (one paid room per verified person, the whole history shown), callers deleting losses (nothing can be deleted once sealed).
- **Money:** follower pays per call or per day into a hold; caller gets paid on wins, follower gets it back on losses; our fee on paid wins.
- **Rules:** paid investment tips are regulated in some countries (Korea treats paid tip rooms as investment advisory); check before launch.

## What people want that doesn't exist or is badly made (research 2026-11-23)

Three agents: forums (V2EX, Zhihu, Şikayetvar, Teamblind, complaint sites; Reddit was blocked for them), "someone should build" lists (YC, Colosseum, Solana, a16z, Coinbase Ventures), and app/Trustpilot reviews. Ranked by how many separate sources repeat it.

1. **Warn me before I sign or send.** Drainers, address poisoning ($50M in one hit on 12-19-2025), phishing. Top complaint in every language. Existing tools are opt-in, use jargon, and miss look-alike addresses. Nobody covers losses for self-custody users.
2. **Cash out to my bank without being frozen or scammed.** UK: ~40% had bank payments blocked; China: 出金冻卡 (bank cards frozen after P2P USDT sales); Argentina and Turkey: fake payment proofs, stuck withdrawals. Off-ramps are slow, have stacked fees, or are risky.
3. **Don't freeze my account and ghost me.** Months-long locks, endless re-KYC, no human support (Coinbase, Binance, Bybit, OKX, MEXC, Polymarket, Kalshi, Paribu). Nobody promises a withdrawal time.
4. **A fair shot at being early.** Snipers, bundlers and insiders take new tokens; only ~3% of pump.fun traders made over $1k; airdrops go to farmers; IPO tokens were 9x+ oversubscribed; MetaDAO raise 79x. Ordinary people can't get in early on anything.
5. **Someone I can trust to tell me what to buy.** Korean paid tip-room (리딩방) fraud is ₩30–80B a month; fake AI signal and copy-trade groups everywhere. The real want is calls with a verified record.
6. **Correct P&L and taxes across wallets and chains.** 1099-DA forms leave cost basis blank; Koinly and CoinTracker break on bridges and DeFi.
7. **Safe yield I understand.** Users want a fixed rate with protected principal, not variable Aave yield.
8. **Hide the crypto.** No seed phrase, plain "send $50 to Sarah", real recovery. Asked every cycle; consumer apps built on it keep shutting down.
9. Also: under-collateralized credit (3 investor lists, still unbuilt), fair liquidations, privacy after kidnapping ("wrench") attacks rose 75%, recovery-scam protection, inheritance.

The pattern: most loud wants are about **not losing money**. The biggest **making-money** want is #4: a fair shot at being early.

## Rejected 2026-11-23 (don't re-pitch)

Rug markets, AI trader duels, Flyverse game coins, coins that build themselves (just a launchpad), fly loans, undo button, paid tips, trader marketplace, wallet IPOs (no trader/wallet ideas: they barely make money now), boss jackpots, paid play data, AI-judged contests (no games), sell-to-AIs (old), loss mining (below), humans-first token window (another launchpad, can't do it), drain refund ("still needs a launchpad"), market-written AI show (the show format already exists), the internet's robot (no hardware), skill coins, dead bags lottery, coins with an end date, rent a bag for airdrops, sell wallet age, group-buy discount, rugger bounty, dip alarm auto-buy ("bad ideas"), revenue coins (app revenue buys the coin; "that's investing, not for degens"), live coins wired to events ("you keep suggesting new tokens and launchpads with different rules"), agent-to-earn ("boring"), country wars, steal farm, internet treasure hunt, one billion together ("no token utility", then "like kids' ideas").

The user's bar (11-23): wave-sized like launchpads/Virtuals (not a feature), exciting/shillable, and not anything that already exists in any form.

## Loss mining for spot: "your losses become income" (REJECTED by user 11-23)

*Saved 2026-11-23 from the research sweep. Status: rejected.*

**One line:** lose money on a coin swap with us and you get shares of the house, which earns from everyone's future trading fees.

**Where it comes from:** Papertrade (HyperEVM perps, launched 10-10) has no outside LPs. Its pool is funded by traders' losses, and losers are minted PAPER (100 per $1 lost, decaying), which earns USDC when staked. It did $68.9M of fees in October and is already fading ($8.8M in Nov 1–22). It only exists for perps.

**What's new:** the same mechanic for spot memecoin and stock-token swaps, where most retail actually loses money. Nobody runs it live; AirdropAlert has written about "lose to earn" as a coming idea, and REKT (2025) is adjacent.

**Why now:** a bear market is full of people who lost money. This is the one product that pays out the most when everything is down. Simple pitch for degens: "lost money? get paid back forever."

**Possible shape:** a Uniswap v4 hook on Robinhood Chain (1,206 of Uniswap's 5,019 registered hooks, and the router sends flow to approved hook pools, so no app is needed for volume). The hook tracks each wallet's cost basis, takes a fee on every swap, and mints house shares on realized losses. Shares earn a part of the fees.

**Hard parts:**
- **Fake losses:** buy high from your own second wallet, then sell low to book a "loss". Needs rules: losses count only against real market prices, with caps, decay and minimum holding times.
- **Decay:** every new mechanism this year spiked and then fell 80–97% in 2–3 months once emissions ran out (Papertrade, Fake World Assets, Standard Reserve, the ORE clones). The shares must earn real fees, not just emissions.
- **Rules:** paying out based on trading losses needs a legal check.

## Research sweep 2026-11-23: what survives the bear market

Five research agents (crypto X/Telegram, Asia, on-chain data, AI, mainstream fintech).

- **No new breakout.** Fear & Greed hit 11 on 11-18. Almost every new mechanism spikes in its launch month and decays 80–97% within 2–3 months.
- **The two lasting growers:** physical-card gacha (~$2.0B of packs year to date, Collector Crypt ~74%, grew through the June crash, but 714 whales are 88% of the volume) and on-chain prop firms (Hypernova fees $51k in May to $1.25M in Nov 1–22). Both have a real-value floor or a revenue model that ignores market direction.
- **Gambling with a floor is the only shape still growing:** gacha with buyback, ORE grid mining ($2.5–4.3M fees a month), jackpot tokens funded by trading fees (Megapot, LOTTO).
- **Asia:** Korean retail put $4.28B into 3x chip ETFs (SOXL) during a crash, and Upbit volume fell 63% in 2026. The Hong Kong IPO lottery (打新) averages +38% on day one; Shenzhen airdrop studios moved into it.
- **IPO demand:** Anthropic drew ~$115–120B of retail demand for under 20% of shares. Crypto allocation tokens mostly failed. A pooled IPO lottery needs a licensed broker.
- **Robinhood Chain hooks:** Robinhood Chain leads Uniswap v4 hooks, and ~74.5% of v4 trades there go through a hook.
- **Taken or crowded:** on-chain gacha, stock gacha (StockRip, StonkDrop, tiny), sweepstakes (states banning it), prize savings (PoolTogether down to ~$7M), AI credit resale, tokenized robots, agent errands (RentAHuman), Telegram account-age airdrops (My Age).

## Research notes 2026-11-23: where retail money is going

Looking for "the next launchpad". No new breakout found; these are the demand signals.

- **IPO access is the biggest unmet demand.** Anthropic IPO'd 11-19 at $83 and opened at $111.50 (+34%). Crypto platforms rushed to offer allocations and mostly failed: Binance returned ~$557M USDC to ~27,700 users and airdropped only ~2,957 tokens. SpaceX tokenization flopped the same way. Pre-IPO perps (Hyperliquid, OKX) and Solana PreStocks give price bets only, not shares.
- **Real assets 24/7.** Hyperliquid HIP-3 (stocks, gold, oil, pre-IPO) went from ~2% to ~30-50% of its perp volume in 2026. NVDA, GOLD and oil lead. Retail flows moving to tokenized stocks and metals.
- **News coin rushes.** GTA VI ticker confusion: $300 -> $200k on the "right" coin. Being first on a news ticker is still the fast cash.
- **Airdrop chasing.** Binance Alpha points: traders rotate into whatever has the next airdrop.
- **Mood.** BTC ~$55k, Fear & Greed 27, retail activity down; launchpads still led app fees in Q3 (Solana + Robinhood Chain).
- **Already crowded:** launchpads, prediction markets, perps on anything (HIP-3), pre-IPO perps, stablecoin payments, agent payments (x402, Visa agent wallet 11-22), copy trading, AI agent tokens, creator/content coins.

## Fly profit futures — sell your fly's future profits for cash today

*Saved 2026-11-23. Status: idea, novelty not checked yet.*

**What it is:** a fly owner sells the next N days (for example 30) of their fly's profits for upfront cash. Buyers pay now and receive whatever profit the fly makes over that window.

**Why it's new:** Pendle splits DeFi yield into tradable pieces, but nobody sells the profits of a *trader*, because nobody else has thousands of AI traders with verifiable on-chain records. Every fly's P&L history is already public, so a buyer can price it.

**Why people want it (fast cash):**
- Owners get paid today for what their fly will earn this month.
- Buyers get a short, fast bet on a real AI trader's performance, priced from its record.
- It makes fly track records worth money, so people have a reason to run a fly well and keep it running.

**Open questions:**
- **Owner gaming:** after selling, the owner could change presets, withdraw money or tank the fly. Possible fixes: lock the settings and the money for the window, sell only a share of the profits, or keep the owner's own money in the same fly.
- **Losses:** does the buyer only get profits (a floor of 0) or share losses too? This decides whether it's closer to an option or a bond.
- **Pricing:** a fixed price from the track record, an auction, or a curve? What history counts (30 d, 90 d, risk-adjusted)?
- **Settlement:** paid out daily or at the end, in USDG or FLYAI? Our fee on each sale?
- **Rules:** does this count as selling a security? Check before launch.

**Related, still to explore:** loans against a fly's track record (borrow now, repaid automatically from future profits).
