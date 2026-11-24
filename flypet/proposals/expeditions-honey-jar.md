# Expedition proposal: Honey Jar (issue #55)

One new place plus five items that drop there, including a 3-piece
**Honey set** and one legendary. All ids, slots and rarities use the
existing enums (`ExpItem` / `ExpPlace` in `flypet/src/store.ts`); the
art is 32x32 PNGs in `flypet/public/items/`, named by item id, drawn
on a 16x16 grid and scaled 2x, in the style of the existing sprites
(dark `#1b1b1b` outline, flat fills, transparent background, no
semi-transparent pixels).

The team wires this in on the server (`mine/src/expeditionsdata.ts`);
nothing here changes any code or behaviour — this PR only adds the
proposal file and the five new art files. A ready-to-paste wire-in
block is at the end of this file.

It does not overlap the open Flower Pot proposal (#75) or the Bin set
proposal (#76) — different place, different items, different ids.

## New place: Honey Jar

| field | value |
|---|---|
| id | `honey-jar` |
| level | 18 (the next step after Flower Pot at level 14) |
| trip lengths | `[720, 1440]` minutes (12 h / 24 h) |
| risk | 0.22 — the chance of being swatted, before Guard (fruit 0, bin 0.08, picnic 0.12, compost 0.15, flower-pot 0.18; a bee guards the jar, and the honey itself is sticky) |
| drop weights | `{ common: 30, uncommon: 35, rare: 25, legendary: 10 }` (sums to 100; a step richer than Flower Pot's `{35, 35, 22, 8}`) |

On the lengths: `baseRolls` caps at 6 rolls above 240 min, so a 24 h
trip gives the same 6 rolls as a 12 h one — the longer trip is for
the trip XP (`tripXp` scales with minutes), not for more drops.

Names (`[en, zh-Hans, zh-Hant, ko, tr, es]`):

| lang | name |
|---|---|
| English | Honey Jar |
| 简体中文 | 蜂蜜罐 |
| 繁體中文 | 蜂蜜罐 |
| 한국어 | 꿀 단지 |
| Türkçe | Bal kavanozu |
| Español | Tarro de miel |

Why it fits a fly's world: honey is the sweetest thing in a kitchen
— a fly's dream food — and a jar on a shelf is a classic fly
hangout. The danger is the honey itself: it is sticky, and a bee
guards the jar, so the riskiest place so far fits the riskiest
reward. It keeps the "household places" theme of the existing
places, and it follows the Flower Pot: the fly graduates from the
pot on the windowsill to the jar on the shelf above it.

## New items

All five drop at the Honey Jar only.

### hat_honey — Honey hat (uncommon, hat)

A golden honey cap with a drip hanging off the brim.
Glyph: 🍯

| lang | name |
|---|---|
| English | Honey hat |
| 简体中文 | 蜂蜜帽 |
| 繁體中文 | 蜂蜜帽 |
| 한국어 | 꿀 모자 |
| Türkçe | Ballı şapka |
| Español | Sombrero de miel |

### trail_honey — Honey drips (rare, trail)

Sticky golden drips trailing behind the fly as it walks.
Glyph: 💧

| lang | name |
|---|---|
| English | Honey drips |
| 简体中文 | 蜂蜜滴 |
| 繁體中文 | 蜂蜜滴 |
| 한국어 | 꿀 방울 |
| Türkçe | Bal damlaları |
| Español | Gotas de miel |

### bubble_honey — Honey bubble (rare, bubble)

A round golden honey bubble with dark honey specks inside it.
Glyph: 🫧

`colors: { bg: "#f2b705", ink: "#3d2500" }` — every bubble skin
needs them (`expeditionstest.ts` checks it); honey gold fill, dark
brown ink, like the peach bubble's `#ffb38a` / `#2a1306`.

| lang | name |
|---|---|
| English | Honey bubble |
| 简体中文 | 蜂蜜气泡 |
| 繁體中文 | 蜂蜜氣泡 |
| 한국어 | 꿀 말풍선 |
| Türkçe | Bal balonu |
| Español | Burbuja de miel |

### acc_dipper — Honey dipper (common, acc)

A tiny wooden honey dipper the fly carries, grooved bulb head and
all.
Glyph: 🥄

| lang | name |
|---|---|
| English | Honey dipper |
| 简体中文 | 蜂蜜勺 |
| 繁體中文 | 蜂蜜勺 |
| 한국어 | 꿀 스푼 |
| Türkçe | Bal kaşığı |
| Español | Cuchara de miel |

### wings_honey — Honey wings (legendary, wings)

Amber wings dripping with honey — the chase item for the highest
place so far. Every place except the Fruit Bowl has a legendary
(bin has the Bin King crown, picnic the Golden wings, compost the
Firefly trail, flower-pot the Pollen wings); the Honey Jar's
legendary weight (10) needs one.
Glyph: 🐝

| lang | name |
|---|---|
| English | Honey wings |
| 简体中文 | 蜂蜜翅膀 |
| 繁體中文 | 蜂蜜翅膀 |
| 한국어 | 꿀 날개 |
| Türkçe | Bal kanatları |
| Español | Alas de miel |

## Set: Honey set

| field | value |
|---|---|
| id | `honey` |
| pieces | `hat_honey` + `trail_honey` + `bubble_honey` (3 pieces) |

| lang | name |
|---|---|
| English | Honey set |
| 简体中文 | 蜂蜜套装 |
| 繁體中文 | 蜂蜜套裝 |
| 한국어 | 꿀 세트 |
| Türkçe | Bal seti |
| Español | Conjunto miel |

Set bonus idea, as a request for the team rather than a claim: wearing
all three could leave a golden honey-glow idle animation — honey
sparkles around the fly. That needs new code (sets today only toggle
one shared `set` class), so it is a suggestion, not part of this
proposal.

## Art

| file | what it shows |
|---|---|
| `flypet/public/items/hat_honey.png` | golden honey cap, drip hanging off the brim |
| `flypet/public/items/trail_honey.png` | golden honey drips drifting diagonally, white sparkles |
| `flypet/public/items/bubble_honey.png` | round golden honey bubble, dark specks, pale highlight |
| `flypet/public/items/acc_dipper.png` | wooden honey dipper, grooved bulb head, stick handle |
| `flypet/public/items/wings_honey.png` | amber honey wings, two lobes |

All five are 32x32 RGBA, drawn on a 16x16 grid and scaled 2x, dark
`#1b1b1b` outline, no semi-transparent pixels — the same grid as the
existing items.

## Wire-in data (for `mine/src/expeditionsdata.ts`)

Copy-paste, in the same shape as the existing places and items:

```ts
// PLACES — add after flower-pot:
{ id: "honey-jar", level: 18, lengths: [720, 1440], risk: 0.22, weights: { common: 30, uncommon: 35, rare: 25, legendary: 10 },
  names: ["Honey Jar", "蜂蜜罐", "蜂蜜罐", "꿀 단지", "Bal kavanozu", "Tarro de miel"] },

// ITEMS — add after the Flower Pot items:
{ id: "hat_honey", slot: "hat", rarity: "uncommon", places: ["honey-jar"], set: "honey", glyph: "🍯",
  names: ["Honey hat", "蜂蜜帽", "蜂蜜帽", "꿀 모자", "Ballı şapka", "Sombrero de miel"] },
{ id: "trail_honey", slot: "trail", rarity: "rare", places: ["honey-jar"], set: "honey", glyph: "💧",
  names: ["Honey drips", "蜂蜜滴", "蜂蜜滴", "꿀 방울", "Bal damlaları", "Gotas de miel"] },
{ id: "bubble_honey", slot: "bubble", rarity: "rare", places: ["honey-jar"], set: "honey", glyph: "🫧",
  colors: { bg: "#f2b705", ink: "#3d2500" },
  names: ["Honey bubble", "蜂蜜气泡", "蜂蜜氣泡", "꿀 말풍선", "Bal balonu", "Burbuja de miel"] },
{ id: "acc_dipper", slot: "acc", rarity: "common", places: ["honey-jar"], glyph: "🥄",
  names: ["Honey dipper", "蜂蜜勺", "蜂蜜勺", "꿀 스푼", "Bal kaşığı", "Cuchara de miel"] },
{ id: "wings_honey", slot: "wings", rarity: "legendary", places: ["honey-jar"], glyph: "🐝",
  names: ["Honey wings", "蜂蜜翅膀", "蜂蜜翅膀", "꿀 날개", "Bal kanatları", "Alas de miel"] },

// SETS — add after pollen:
{ id: "honey", names: ["Honey set", "蜂蜜套装", "蜂蜜套裝", "꿀 세트", "Bal seti", "Conjunto miel"] },
```

## Translations

The English names are final and use sentence case like the existing
items ("Leaf hat", "Cherry hat", "Honey hat" — not "Honey Hat").
The other five languages are best effort and **need a native review**
before wiring in — flagged here rather than claimed as
native-quality. Turkish follows the possessive-suffix rule from
`proposals/names-tr.md` (`Bal balonu`, `Bal kanatları`,
`Bal damlaları`, `Ballı şapka`).

## Checklist (issue #55)

- [x] One new place, with names in 6 languages, trip lengths in minutes, risk as a swat chance, drop weights per rarity, and why it fits
- [x] A themed set of 5 items for it (3-piece set + 1 extra + 1 legendary), each with id, slot, rarity, drop place, and names in 6 languages
- [x] `bubble_honey` carries `colors {bg, ink}` like every other bubble skin
- [x] Art: a 32x32 PNG per item in `flypet/public/items/`, named by id, drawn on a 16x16 grid and scaled 2x, dark `#1b1b1b` outline, no semi-transparent pixels
- [x] Wire-in data block with the exact `Place` / `Item` / set entries for `expeditionsdata.ts`
- [x] No overlap with the open Flower Pot (#75) or Bin set (#76) proposals: different place, different items, different ids
- [x] Fly-themed, nothing branded, nothing copied from another game
- [x] New files only — no code touched, no existing file changed
