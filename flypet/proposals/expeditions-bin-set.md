# Expedition proposal: Kitchen Bin — Bin set (issue #55)

Four new items for the **Kitchen Bin** only, including a 3-piece
**Bin set** — the Bin is the one existing place with no set yet
(Fruit Bowl has the Fruit set, Picnic Blanket the Picnic set,
Compost Heap the Compost set). All ids, slots and rarities use the
existing enums (`ExpItem` / `ExpPlace` in `flypet/src/store.ts`);
the art is 32x32 PNGs in `flypet/public/items/`, named by item id,
in the style of the existing sprites (dark outline, flat fills,
transparent background).

No new place: this proposal is items for an existing place only. It
does not overlap the open Flower Pot proposal (#75) — different
items, no new place, and none of its ids (`hat_pollen`,
`trail_pollen`, `bubble_pollen`, `acc_sprout`).

The team wires this in on the server (`mine/src/expeditionsdata.ts`);
nothing here changes any code or behaviour — this PR only adds the
proposal file and the four new art files.

## Why Kitchen Bin, why these four

Each item fills a gap in the Bin's loot table
(`mine/src/expeditionsdata.ts`):

| gap in the Bin's loot | this item |
|---|---|
| no set at all (the only place without one) | the 3-piece Bin set below |
| no common accessory (only `acc_ring`, rare) | `acc_magnet` (common) |
| no uncommon trail (only `trail_stink`, common) | `trail_suds` (uncommon) |
| no rare bubble (only `bubble_news`, uncommon) | `bubble_soap` (rare) |

The theme is "squeaky clean": a fly rummages the kitchen bin and
comes out soapy — a milk carton hat, soap suds trailing behind it,
a soap bubble, and a fridge magnet that fell off the fridge into
the bin. All four are ordinary household things a fly would meet
in a kitchen, nothing branded, nothing copied from another game.

## New items

All four drop at the Kitchen Bin only.

### hat_carton — Milk Carton Hat (uncommon, hat)

A folded milk carton worn as a hat, with a red stripe round it.
Glyph: 🥛

| lang | name |
|---|---|
| English | Milk Carton Hat |
| 简体中文 | 牛奶盒帽 |
| 繁體中文 | 牛奶盒帽 |
| 한국어 | 우유팩 모자 |
| Türkçe | Süt kutusundan şapka |
| Español | Sombrero de cartón de leche |

### trail_suds — Soap Suds (uncommon, trail)

White soap suds and little bubbles drifting behind the fly as it walks.
Glyph: 🧼

| lang | name |
|---|---|
| English | Soap Suds |
| 简体中文 | 肥皂沫 |
| 繁體中文 | 肥皂沫 |
| 한국어 | 비누 거품 |
| Türkçe | Sabun köpüğü |
| Español | Espuma de jabón |

### bubble_soap — Soap Bubble (rare, bubble)

A clear bubble with a rainbow sheen — a pink, a yellow and a blue
speck catching the light inside it.
Glyph: 🫧

| lang | name |
|---|---|
| English | Soap Bubble |
| 简体中文 | 肥皂泡泡 |
| 繁體中文 | 肥皂泡泡 |
| 한국어 | 비눗방울 |
| Türkçe | Sabun balonu |
| Español | Burbuja de jabón |

### acc_magnet — Fridge Magnet (common, acc)

A little red horseshoe magnet that fell off the fridge into the bin.
Pairs with the Bin's existing ring (`acc_ring`): two small
treasures fished out of the same place.
Glyph: 🧲

| lang | name |
|---|---|
| English | Fridge Magnet |
| 简体中文 | 冰箱磁铁 |
| 繁體中文 | 冰箱磁鐵 |
| 한국어 | 냉장고 자석 |
| Türkçe | Buzdolabı mıknatısı |
| Español | Imán de nevera |

## Set: Bin set

| field | value |
|---|---|
| id | `bin` |
| pieces | `hat_carton` + `trail_suds` + `bubble_soap` (3 pieces) |

| lang | name |
|---|---|
| English | Bin Set |
| 简体中文 | 垃圾桶套装 |
| 繁體中文 | 垃圾桶套裝 |
| 한국어 | 쓰레기통 세트 |
| Türkçe | Çöp kutusu seti |
| Español | Conjunto cubo |

Set bonus idea, following the existing sets: wearing all three plays
a squeaky-clean idle animation — soap bubbles float up around the fly.

## Art

| file | what it shows |
|---|---|
| `flypet/public/items/hat_carton.png` | white milk carton hat, red stripe, folded gable top |
| `flypet/public/items/trail_suds.png` | white soap-sud puffs with pale blue bubbles |
| `flypet/public/items/bubble_soap.png` | clear bubble, rainbow specks inside, white highlight |
| `flypet/public/items/acc_magnet.png` | red horseshoe magnet, silver tips |

All four are 32x32 RGBA, drawn to match the existing sprites.

## Translations

The English names are final. The other five languages are best effort
and **need a native review** before wiring in — flagged here rather
than claimed as native-quality. Turkish follows the possessive-suffix
rule from `proposals/names-tr.md` (`Sabun balonu`, `Buzdolabı
mıknatısı`, and `Süt kutusundan şapka` for "made of a milk carton",
like `Kese kâğıdından şapka` for the paper bag hat).

## Checklist (issue #55)

- [x] A themed set of 4 items for an existing place (3-piece set + 1 extra), each with id, slot, rarity, drop place, and names in 6 languages
- [x] No new place — Kitchen Bin only
- [x] Art: a 32x32 PNG per item in `flypet/public/items/`, named by id
- [x] No overlap with the open Flower Pot proposal (#75): different items, different ids, no new place
- [x] Fly-themed, nothing branded, nothing copied from another game
- [x] New files only — no code touched, no existing file changed
