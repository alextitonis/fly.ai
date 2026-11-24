# Expedition proposal: Flower Pot (issue #55)

One new place plus five items that drop there, including a 3-piece
**Pollen set** and one legendary. All ids, slots and rarities use the
existing enums (`ExpItem` / `ExpPlace` in `flypet/src/store.ts`); the
art is 32x32 PNGs in `flypet/public/items/`, named by item id, drawn
on a 16x16 grid and scaled 2x, in the style of the existing sprites
(dark `#1b1b1b` outline, flat fills, transparent background, no
semi-transparent pixels).

The team wires this in on the server (`mine/src/expeditionsdata.ts`);
nothing here changes any code or behaviour — this PR only adds the
proposal file and the five new art files. A ready-to-paste wire-in
block is at the end of this file.

## New place: Flower Pot

| field | value |
|---|---|
| id | `flower-pot` |
| level | 14 (the next step after Compost Heap at level 10) |
| trip lengths | `[480, 720]` minutes (8 h / 12 h) |
| risk | 0.18 — the chance of being swatted, before Guard (fruit 0, bin 0.08, picnic 0.12, compost 0.15; the gardener waters the plant, and a spider lives in the pot) |
| drop weights | `{ common: 35, uncommon: 35, rare: 22, legendary: 8 }` (sums to 100; a step richer than Compost Heap's `{40, 35, 20, 5}`) |

On the lengths: `baseRolls` caps at 6 rolls above 240 min, so a 12 h
trip gives the same 6 rolls as an 8 h one — the longer trip is for
the trip XP (`tripXp` scales with minutes), not for more drops.

Names (`[en, zh-Hans, zh-Hant, ko, tr, es]`):

| lang | name |
|---|---|
| English | Flower Pot |
| 简体中文 | 花盆 |
| 繁體中文 | 花盆 |
| 한국어 | 화분 |
| Türkçe | Saksı |
| Español | Maceta |

Why it fits a fly's world: flowers are where a fly eats — nectar and
pollen — and a pot on a windowsill is a classic fly hangout. It keeps
the "household places" theme of the four existing places, and the soil
ties back to Compost Heap: the fly graduates from the heap to the pot
above it.

## New items

All five drop at the Flower Pot only.

### hat_pollen — Pollen hat (uncommon, hat)

A soft yellow cap of pollen dust, with a tiny white flower on top.
Glyph: 🌼

| lang | name |
|---|---|
| English | Pollen hat |
| 简体中文 | 花粉帽 |
| 繁體中文 | 花粉帽 |
| 한국어 | 꽃가루 모자 |
| Türkçe | Polenli şapka |
| Español | Sombrero de polen |

### trail_pollen — Pollen trail (rare, trail)

Golden pollen motes drifting behind the fly as it walks.
Glyph: ✨

| lang | name |
|---|---|
| English | Pollen trail |
| 简体中文 | 花粉轨迹 |
| 繁體中文 | 花粉軌跡 |
| 한국어 | 꽃가루 자국 |
| Türkçe | Polen izi |
| Español | Rastro de polen |

### bubble_pollen — Pollen bubble (rare, bubble)

A clear bubble with golden pollen specks floating inside it.
Glyph: 🫧

`colors: { bg: "#f6dd7d", ink: "#4a3200" }` — every bubble skin
needs them (`expeditionstest.ts` checks it); pale gold fill, dark
brown ink, like the peach bubble's `#ffb38a` / `#2a1306`.

| lang | name |
|---|---|
| English | Pollen bubble |
| 简体中文 | 花粉泡泡 |
| 繁體中文 | 花粉泡泡 |
| 한국어 | 꽃가루 비눗방울 |
| Türkçe | Polen balonu |
| Español | Burbuja de polen |

### acc_sprout — Sprout (common, acc)

A tiny green sprout tucked behind the wing. Pairs with the existing
Seed (`acc_seed`): seed first, sprout next.
Glyph: 🪴 (a potted plant — not 🌱, which `acc_seed` already uses)

| lang | name |
|---|---|
| English | Sprout |
| 简体中文 | 幼苗 |
| 繁體中文 | 幼苗 |
| 한국어 | 새싹 |
| Türkçe | Fide |
| Español | Brote |

### wings_pollen — Pollen wings (legendary, wings)

Golden wings dusted with pollen — the chase item for the highest
place so far. Every place except the Fruit Bowl has a legendary
(bin has the Bin King crown, picnic the Golden wings, compost the
Firefly trail); the Flower Pot's legendary weight (8) needs one.
Glyph: 🌻

| lang | name |
|---|---|
| English | Pollen wings |
| 简体中文 | 花粉翅膀 |
| 繁體中文 | 花粉翅膀 |
| 한국어 | 꽃가루 날개 |
| Türkçe | Polen kanatları |
| Español | Alas de polen |

## Set: Pollen set

| field | value |
|---|---|
| id | `pollen` |
| pieces | `hat_pollen` + `trail_pollen` + `bubble_pollen` (3 pieces) |

| lang | name |
|---|---|
| English | Pollen set |
| 简体中文 | 花粉套装 |
| 繁體中文 | 花粉套裝 |
| 한국어 | 꽃가루 세트 |
| Türkçe | Polen seti |
| Español | Conjunto polen |

Set bonus idea, as a request for the team rather than a claim: wearing
all three could play a golden shimmer idle animation — pollen motes
sparkle around the fly. That needs new code (sets today only toggle
one shared `set` class), so it is a suggestion, not part of this
proposal.

## Art

| file | what it shows |
|---|---|
| `flypet/public/items/hat_pollen.png` | yellow pollen cap, white flower on top |
| `flypet/public/items/trail_pollen.png` | golden pollen motes with white sparkles |
| `flypet/public/items/bubble_pollen.png` | clear bubble, gold specks inside, white highlight |
| `flypet/public/items/acc_sprout.png` | green sprout, two leaves, soil mound at the base |
| `flypet/public/items/wings_pollen.png` | golden pollen-dusted wings |

All five are 32x32 RGBA, drawn on a 16x16 grid and scaled 2x, dark
`#1b1b1b` outline, no semi-transparent pixels — the same grid as the
existing items.

## Wire-in data (for `mine/src/expeditionsdata.ts`)

Copy-paste, in the same shape as the existing places and items:

```ts
// PLACES — add after compost:
{ id: "flower-pot", level: 14, lengths: [480, 720], risk: 0.18, weights: { common: 35, uncommon: 35, rare: 22, legendary: 8 },
  names: ["Flower Pot", "花盆", "花盆", "화분", "Saksı", "Maceta"] },

// ITEMS — add after the Compost Heap items:
{ id: "hat_pollen", slot: "hat", rarity: "uncommon", places: ["flower-pot"], set: "pollen", glyph: "🌼",
  names: ["Pollen hat", "花粉帽", "花粉帽", "꽃가루 모자", "Polenli şapka", "Sombrero de polen"] },
{ id: "trail_pollen", slot: "trail", rarity: "rare", places: ["flower-pot"], set: "pollen", glyph: "✨",
  names: ["Pollen trail", "花粉轨迹", "花粉軌跡", "꽃가루 자국", "Polen izi", "Rastro de polen"] },
{ id: "bubble_pollen", slot: "bubble", rarity: "rare", places: ["flower-pot"], set: "pollen", glyph: "🫧",
  colors: { bg: "#f6dd7d", ink: "#4a3200" },
  names: ["Pollen bubble", "花粉泡泡", "花粉泡泡", "꽃가루 비눗방울", "Polen balonu", "Burbuja de polen"] },
{ id: "acc_sprout", slot: "acc", rarity: "common", places: ["flower-pot"], glyph: "🪴",
  names: ["Sprout", "幼苗", "幼苗", "새싹", "Fide", "Brote"] },
{ id: "wings_pollen", slot: "wings", rarity: "legendary", places: ["flower-pot"], glyph: "🌻",
  names: ["Pollen wings", "花粉翅膀", "花粉翅膀", "꽃가루 날개", "Polen kanatları", "Alas de polen"] },

// SETS — add after compost:
{ id: "pollen", names: ["Pollen set", "花粉套装", "花粉套裝", "꽃가루 세트", "Polen seti", "Conjunto polen"] },
```

## Translations

The English names are final and use sentence case like the existing
items ("Leaf hat", "Cherry hat", "Pollen hat" — not "Pollen Hat").
The other five languages are best effort and **need a native review**
before wiring in — flagged here rather than claimed as
native-quality. Turkish follows the possessive-suffix rule from
`proposals/names-tr.md` (`Polen balonu`, `Polenli şapka`,
`Polen kanatları`).

## Checklist (issue #55)

- [x] One new place, with names in 6 languages, trip lengths in minutes, risk as a swat chance, drop weights per rarity, and why it fits
- [x] A themed set of 5 items for it (3-piece set + 1 extra + 1 legendary), each with id, slot, rarity, drop place, and names in 6 languages
- [x] `bubble_pollen` carries `colors {bg, ink}` like every other bubble skin
- [x] Art: a 32x32 PNG per item in `flypet/public/items/`, named by id, drawn on a 16x16 grid and scaled 2x, dark `#1b1b1b` outline, no semi-transparent pixels
- [x] Wire-in data block with the exact `Place` / `Item` / set entries for `expeditionsdata.ts`
- [x] Fly-themed, nothing branded, nothing copied from another game
- [x] New files only — no code touched, no existing file changed
