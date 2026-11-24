# Expedition proposal: Flower Pot (issue #55)

One new place plus four items that drop there, including a 3-piece
**Pollen set**. All ids, slots and rarities use the existing enums
(`ExpItem` / `ExpPlace` in `flypet/src/store.ts`); the art is 32x32 PNGs
in `flypet/public/items/`, named by item id, in the style of the
existing sprites (dark outline, flat fills, transparent background).

The team wires this in on the server (`mine/src/expeditionsdata.ts`);
nothing here changes any code or behaviour — this PR only adds the
proposal file and the four new art files.

## New place: Flower Pot

| field | value |
|---|---|
| id | `flower-pot` |
| level | 14 (the next step after Compost Heap at level 10) |
| trip lengths | 8 h / 12 h |
| risk | medium — the gardener waters the plant, and a spider lives in the pot. Suggested risk 2 on the existing scale; team to confirm against Compost Heap. |

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

All four drop at the Flower Pot only.

### hat_pollen — Pollen Hat (uncommon, hat)

A soft yellow cap of pollen dust, with a tiny white flower on top.
Glyph: 🌼

| lang | name |
|---|---|
| English | Pollen Hat |
| 简体中文 | 花粉帽 |
| 繁體中文 | 花粉帽 |
| 한국어 | 꽃가루 모자 |
| Türkçe | Polenli şapka |
| Español | Sombrero de polen |

### trail_pollen — Pollen Trail (rare, trail)

Golden pollen motes drifting behind the fly as it walks.
Glyph: ✨

| lang | name |
|---|---|
| English | Pollen Trail |
| 简体中文 | 花粉轨迹 |
| 繁體中文 | 花粉軌跡 |
| 한국어 | 꽃가루 자국 |
| Türkçe | Polen izi |
| Español | Rastro de polen |

### bubble_pollen — Pollen Bubble (rare, bubble)

A clear bubble with golden pollen specks floating inside it.
Glyph: 🫧

| lang | name |
|---|---|
| English | Pollen Bubble |
| 简体中文 | 花粉泡泡 |
| 繁體中文 | 花粉泡泡 |
| 한국어 | 꽃가루 비눗방울 |
| Türkçe | Polen balonu |
| Español | Burbuja de polen |

### acc_sprout — Sprout (common, acc)

A tiny green sprout tucked behind the wing. Pairs with the existing
Seed (`acc_seed`): seed first, sprout next.
Glyph: 🌱

| lang | name |
|---|---|
| English | Sprout |
| 简体中文 | 幼苗 |
| 繁體中文 | 幼苗 |
| 한국어 | 새싹 |
| Türkçe | Fide |
| Español | Brote |

## Set: Pollen set

| field | value |
|---|---|
| id | `pollen` |
| pieces | `hat_pollen` + `trail_pollen` + `bubble_pollen` (3 pieces) |

| lang | name |
|---|---|
| English | Pollen Set |
| 简体中文 | 花粉套装 |
| 繁體中文 | 花粉套裝 |
| 한국어 | 꽃가루 세트 |
| Türkçe | Polen Seti |
| Español | Set de polen |

Set bonus idea, following the existing sets: wearing all three plays a
golden shimmer idle animation — pollen motes sparkle around the fly.

## Art

| file | what it shows |
|---|---|
| `flypet/public/items/hat_pollen.png` | yellow pollen cap, white flower on top |
| `flypet/public/items/trail_pollen.png` | golden pollen motes with two sparkles |
| `flypet/public/items/bubble_pollen.png` | clear bubble, gold specks inside, white highlight |
| `flypet/public/items/acc_sprout.png` | green sprout, two leaves, soil mound at the base |

All four are 32x32 RGBA, drawn to match the existing sprites.

## Translations

The English names are final. The other five languages are best effort
and **need a native review** before wiring in — flagged here rather
than claimed as native-quality. Turkish follows the possessive-suffix
rule from `proposals/names-tr.md` (`Polen balonu`, `Polenli şapka`).

## Checklist (issue #55)

- [x] One new place, with names in 6 languages, trip lengths, risk, and why it fits
- [x] A themed set of 4 items for it (3-piece set + 1 extra), each with id, slot, rarity, drop place, and names in 6 languages
- [x] Art: a 32x32 PNG per item in `flypet/public/items/`, named by id
- [x] Fly-themed, nothing branded, nothing copied from another game
- [x] New files only — no code touched, no existing file changed
