# Fly Pet: expeditions (idle loop) — plan

2026-11-18. Status: **PHASE 1 server LIVE (mine v257, 11-18 ~13:00 TRT); pet NOT released.**

Built 11-18: migration `flybook/supabase/migrations/20261118130000_mine_pet_expeditions.sql`; `mine/src/expeditions.ts`
(+ `expeditionsdata.ts`, `expeditionstest.ts`, `npm run test:expeditions`), wired in `mine/src/server.ts` (pet token allowed
on `/api/pet/exp*`), XP source `expedition` (quiet in the bell); pet: `flypet/src/expeditions.ts` (the card), `talk.ts`
(🧭 chip), `pet.ts` (worn items on the fly, away pill, 🎁 + one notification when back, trail while walking),
right-click menu "Expeditions", 47 strings x6. Placeholder art = emoji glyphs at `avatar.json` anchors.
Checked: mine tests (expeditions, xp, quests, pet), both type-checks; the card + a full trip in the browser pane with a
mocked server. NOT checked: the real Electron window, against the live server.

Deploy order: migration (Supabase) -> mine deploy -> pet release (bump version, exe + Store appx + mac/linux CI).
- 11-18 ~12:40 TRT: migration APPLIED (pooler). mine deploy HELD (user: "Wait"): the working tree also has another
  session's unfinished RUYUI alias rewrite (ruyui.ts/partners.ts/server.ts, edited after the 11:45 v254 deploy);
  deploy mine once that session is done.
- 11-18 ~13:00 TRT: mine DEPLOYED v257 after the RUYUI work shipped (v256). Checked live: /api/pet/exp 401 without sign-in,
  bad token 401, a real pet token (dev wallet) reads level 1 / 3 trips / Fruit Bowl open. Left: pet release. The genre (idle, always on, loot) comes from desktop idle games like TBH;
the setting, art and names are ours: a fly foraging around a house.

## Why

The pet is open all day but only does something when the fly trades or you chat. Most people don't use their 5 chats.
An idle loop gives a reason to keep it open and come back: something grows while you work, and there's a small
decision each time you look at it.

## Rules we keep

- **Server clock, not the PC.** Expeditions run as timestamps in mine. The pet only shows a countdown and a little
  "away" animation: no extra CPU, no AI calls (same "don't lag the PC" rule as the coach).
- **No real money in v1.** Loot is cosmetic + XP, not tradeable, not on-chain. TBH's market items brought gold farmers
  and bots at launch; we avoid that until we've seen how people play.
- **No gambling feel.** Drops are random but nothing is bought with money for a roll. The one $FLYAI touch (speed-up
  burn, below) buys time, not odds.
- **Pure fun first.** It must work for someone who never trades.

## The loop

1. Click the fly → **Expeditions** card in the talk panel (a 🧭 chip next to the others).
2. Pick a place and a length. The fly flies off-screen (or shrinks to a little "away" sprite with a timer).
3. When it's back: a bubble "I'm back! found 3 things" → click → loot reveal → items go to the **Bag**.
4. Equip a hat / wings / trail / bubble skin → the pet wears it, the share card shows it.
5. Repeat. Stamina caps how much you can do a day, so it's a check-in rhythm, not a grind.

### Places (v1: 5)

| Place | Unlock | Lengths | Feel |
|---|---|---|---|
| Fruit Bowl | start | 15 m / 1 h | safe, common stuff |
| Kitchen Bin | level 3 | 1 h / 4 h | more loot, a little risk |
| Picnic Blanket | level 6 | 4 h / 8 h | rare hats |
| Compost Heap | level 10 | 8 h | rare + "smelly" set |
| The Window | weekly event | 2 h | rotating theme (holiday, partner collab later) |

Longer trips give more and better rolls per hour slightly *less* than short ones, so active players are rewarded but
an overnight 8 h trip is still worth it.

### Risk

Risky places can come back with "got swatted, came back with nothing but a bandage" (a funny cosmetic, never a real
loss). Stats lower the odds.

### Stamina

- 3 trips a day (UTC day, like quests), +1 per 7-day expedition streak, max 5.
- Optional: **Speed-up** with a $FLYAI burn (same Pons `burn()` flow as breed speed-up and quest rerolls), capped at
  2 a day. Buys time only.

### Stats

- **Trader Fly:** from its on-chain traits via `world/src/arena/stats.ts` `statsOf()` (pow, grd, vit, fury — the same
  numbers as the arena), read through arena's `traitsOf` cache. Mapped:
  - pow → loot count, grd → swat odds, vit → max trip length bonus, fury → rare-roll chance.
  - Rarity and generation (bred flies) give a small edge. Owning, breeding and burning then matter here too.
- **Partner NFT:** flat starter stats (no fly and no partner NFT = no expeditions). Leveling up the pet (below) closes most of the gap, so it's fair.

### Pet level

Its own small track (not the airdrop XP): each trip gives pet-XP, levels unlock places and bag slots. Separately,
trips book a little **season XP** (e.g. 2 per finished trip, max 6/day), like check-ins, so it feeds the existing
leaderboard without being farmable.

### Loot (v1 ~40 items)

- **Slots:** hat, wings, trail (particles behind it), bubble skin, accessory.
- **Rarity:** common / uncommon / rare / legendary, shown with the same colors as badges.
- **Sets:** 3-piece sets (Picnic set, Compost set…) — wearing all 3 plays a special idle animation.
- **Junk:** crumbs, bottle caps. "Recycle" junk into pet-XP so nothing is useless.
- **Green-day bonus** (decided): a fly that closed a green day gets +1 roll on its next trip.
  Ties the toy to the product without paying out money.

### Art

Overlays drawn **on top of** the existing mood GIFs: a hat PNG pinned to a head point per avatar
(`avatar.json` gets `anchors: { head:[x,y], back:[x,y] }`), trails drawn on a canvas behind the sprite. This avoids
re-drawing every GIF per item. Placeholder art first (simple pixel PNGs), real art later.

## Social (phase 2)

- **Weekly swarm:** every trip that week adds to a shared bar ("the swarm cleared 4,200 crumbs"). Hitting tiers
  unlocks a cosmetic for everyone who took part. Uses the league's week + Sunday rhythm.
- **Expedition board** on /xp: longest streak, most rares this week.
- **Share card:** "found a Legendary Picnic Hat" card (reuse card.ts + Connect X share).
- Later, only if v1 sticks: badges for full sets (FlyBadges), tradeable items behind sybil checks.

## Build

### mine (`mine/src/expeditions.ts` + test)

Tables (one migration):
- `mine.pet_trips` (id, wallet, fly_key, place, started_at, ends_at, seed, claimed_at, result json)
- `mine.pet_items` (wallet, item, count, first_at)
- `mine.pet_state` (wallet, pet_xp, level, equipped json, stamina_day, used, streak, last_day)
- `mine.pet_burns` (tx, wallet, trip_id) — each burn counts once

Routes (pet token via `x-flyai-pet`, also session for the site later):
- `GET /api/pet/exp` — state, places, stamina, the trip in flight
- `POST /api/pet/exp/start { place, length }`
- `POST /api/pet/exp/claim` — rolls happen here, server-side, from the stored seed (no client trust)
- `POST /api/pet/exp/equip { slot, item | null }`
- `POST /api/pet/exp/recycle { item, n }`
- `POST /api/pet/exp/speedup { trip, tx }`
- `GET /api/pet/exp/swarm` (phase 2)

`sessionOrPet` gets `/api/pet/exp/*` added to its allowed paths. Loot tables live in one JSON
(`mine/src/data/expeditions.json`) so items can be added without code. Off with `EXPEDITIONS_ON=0`.

### pet (`flypet/src/expeditions.ts`)

- 🧭 chip + Expeditions card in talk.ts (places, timer, bag grid, equip).
- "Away" state in pet.ts: fly walks off the screen edge, small timer bubble in its place; comes back flying in.
- Overlay renderer for equipped items (head/back anchors, trail canvas).
- Native notification "back from the Picnic" (respects the existing notification switch).
- ~40 new strings x6 in i18n.ts.

### site (phase 2)

Bag + equipped look on the fly popup / profile; board on /xp.

## Phases

1. **Core:** places 1–4, stamina, loot + bag + equip, overlays, notifications, pet-XP, season XP hook. Placeholder art.
2. **Speed-up burn + share card + weekly swarm + board.**
3. Real art pass; The Window events; maybe badges for sets.

Deploy order (when built): migration → mine deploy → pet release (exe + Store appx + mac/linux via CI).

## Decided (2026-11-18, the user)

1. Green-day bonus roll: **yes** — a fly that closed a green day gets +1 roll on its next trip (phase 1).
2. $FLYAI speed-up burn: **yes**, phase 2 as planned.
3. No fly and no partner NFT: **can't play** — same as the pet today (pick a fly or partner NFT first).
4. Season XP from trips (2 a trip, max 6/day): **yes**.

## Phase 2 + art + toys + perching (2026-11-18, BUILT, not deployed / not released)

The user: "3. can we generate maybe the art?, add the 4 too, 5 too" + "Also window perching"; art "Draw pixel art in code".

- **Art**: 35 sprites, 16x16 drawn as character maps, saved 32x32 in `flypet/public/items/<id>.png` (the generator
  script lives outside the repo; the PNGs are the source now). The pet shows the PNG, falling back to the glyph.
- **Speed-up**: `POST /api/pet/exp/speedup { tx }`: a $FLYAI `burn()` brings the trip in flight home. $0.25 per hour left
  (rounded up), priced at $FLYAI's price, a burn of 90%+ counts, 2 a UTC day. The pet shows the price and opens
  `/flypet-boost` (docs/flypet-boost.html + assets/flypet-boost.js + i18n flypetboost.json x6), where the site session burns.
- **Weekly swarm**: claimed trips of the UTC week (from Monday); tiers 300 / 1,000 / 3,000 give Swarm medal / Swarm wings /
  Swarm crown to every wallet that claimed a trip that week (given on its next read or claim).
- **Share card**: "Save a card" on a reveal with a rare or legendary find (or a swarm reward): 1200x630 PNG.
- **Board**: public `GET /api/pet/exp/board`; /xp has a "Fly Pet" tab (#flypet) with streaks, rare finds, levels.
- **Toys**: Feed (5 pet XP once a UTC day; also from the tray's Feed), Swat game (20 s, best kept on the PC),
  Focus 25 min (the fly sits still, a pill counts down, a cheer + notification at the end, count per day kept on the PC).
- **Window perching** (Windows): setting "Sit on my windows" (on by default). A PowerShell loop in the main process reads
  the front window's box every 0.7 s while it's on; the fly sometimes flies onto its top edge, falls off when it moves,
  hops down after 45-120 s. Never reads window contents or sends input.
- Migration `20261118140000_mine_pet_expeditions2.sql` (pet_speedups, pet_swarm_rewards, pet_state.feed_day).

Checked: mine test:expeditions (phase 2 included), xp, quests, pet; both type-checks; pet card/art/feed/trip/speed-up
button/reveal/swat/focus in the browser pane with a mocked server; /xp tab and /flypet-boost (signed out) on the docs
server. NOT checked: window perching in the real app (no Electron run), the signed-in burn on /flypet-boost against
the live server, the share card's file save.

Deploy order: migration 2 -> mine deploy -> docs push (xp tab + /flypet-boost) -> pet 0.7.0 release.

