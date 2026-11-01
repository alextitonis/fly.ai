# Fly Pet

A free desktop fly for Windows, macOS and Linux: one small transparent window with just the character. It walks along the
bottom of the screen, staying near where you put it, can be grabbed and tossed, sleeps at night, and reacts when flies gain or lose money.

- **No wallet:** it reacts to the $FLYAI price and to the leaderboard's top fly.
- **Connected wallet:** a bubble and a system notification for each buy and sell of your flies, and an animation when they
  gain or lose money.

Right-click the fly for its menu (feed, hide, quiet, settings, close); the tray icon has the same one. Opening the app again
brings the fly back and opens settings.

Connect wallet opens the site, where the holder signs in as usual. The app only receives the public address: no key, no
session, no way to move money.

## Share card

Settings draws a card with the fly and how its day went (`src/card.ts`). Post on X copies it and opens a post to paste it into,
because X can't take a picture through a link. It never shows a wallet address.

## Mining

Off until the owner turns it on. `src/miner.ts` runs the same `Miner` as the site and the extension, in a hidden window that
`electron/main.ts` opens only while allowed: never on battery, and unless "also while I'm using it" is on, only after 2 minutes
with no mouse or keyboard. Closing that window is how it stops. It runs brain jobs and our own world runs only: no buyers'
programs, since some of those mine coins, and no code from a CDN. Payouts need the miner linked to a wallet, which is a separate
step from Connect wallet because it proves the wallet to the mining server.

## Run

Needs Node 22.

```bash
npm install
npm test
npm start
```

`electron/main.ts` is the native side (window, tray, cursor) and `electron/preload.ts` is all the pages may call.
`VITE_FLYPET_API=http://localhost:4100` points a build at a local mine server. `npm run dev` runs the page alone in a browser;
`flypet.react("rugged", "text")` in the console acts out any mood.

## Avatars

`public/avatars/default/avatar.json` names one GIF per mood, with a transparent background. A mood with no GIF plays `idle`.

| Mood | Plays when |
|---|---|
| `idle`, `walk`, `sleep`, `wave` | everyday life; `wave` greets on start and in the morning |
| `held`, `fall` | grabbed, and tossed |
| `happy`, `moon` | a gain or a winning sell, and a big one (a click plays `happy` too) |
| `sad`, `rugged` | a loss or a losing sell, and a big one |
| `buy`, `sell` | a buy, and a sell with no result |
| `eat` | fed from the tray |

The window is 300x300 and draws the GIF at 160x160; the fly should stand on the bottom edge. The current GIFs are
placeholders made from `flytrade/nft/poses`: replace the files and keep the names.

Words are in `src/i18n.ts`, in the site's 6 languages (the computer's language, or the one picked in settings).

## What makes it react

All in `src/mood.ts`: a profit move counts from $0.25 and 1% of the money in the flies, big from 5%. A sell's result is big
from +20% or -15%. $FLYAI reacts to 3% in an hour, big from 10%. More than 3 new trades in one look say one line.

## Release

```bash
git tag flypet-v0.1.0
```

Pushing the tag runs `.github/workflows/flypet.yml`, which builds on all three systems and leaves a draft release.
`npm run dist` builds this system's installer into `release/`.

Signing needs accounts: see [SIGNING.md](SIGNING.md). On Linux under Wayland, windows can't place themselves, so walking and
tossing need X11.
