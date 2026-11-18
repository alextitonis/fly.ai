# Turkish (tr) name fixes for expedition places, items and sets

Proposed changes to the Turkish entry (5th) of `names` in `mine/src/expeditionsdata.ts`. Only names that need a change are listed; the rest read fine.

Most fixes are the same grammar point: in Turkish, a noun used to describe another noun takes a possessive suffix on the second one (`kelebek kanatları`, not `kelebek kanatlar`), or the first one becomes an adjective (`kirazlı şapka`). The current names drop that, so they read as word-by-word translations.

| id | English | Now | Proposed | Why |
|---|---|---|---|---|
| hat_leaf | Leaf hat | Yaprak şapka | Yapraklı şapka | noun + noun needs -lı or -ı |
| hat_cherry | Cherry hat | Kiraz şapka | Kirazlı şapka | same |
| bubble_peach | Peach bubble | Şeftali balon | Şeftali balonu | possessive suffix |
| bubble_news | Newsprint bubble | Gazete balon | Gazete balonu | same |
| bubble_moss | Moss bubble | Yosun balon | Yosun balonu | same |
| wings_butterfly | Butterfly wings | Kelebek kanatlar | Kelebek kanatları | same |
| wings_leaf | Autumn wings | Sonbahar kanatlar | Sonbahar kanatları | same |
| wings_petal | Petal wings | Taç yaprağı kanatlar | Çiçek yaprağı kanatları | "taç yaprağı" is botanical jargon; "çiçek yaprağı" is what people say, plus the suffix |
| trail_juice | Juice drips | Meyve suyu damlası | Meyve suyu damlaları | "drips" is plural |
| trail_ants | Ant parade | Karınca geçidi | Karınca alayı | "geçit" reads as a passage; "karınca alayı" is the usual phrase for a line of ants |
| hat_bag | Paper bag hat | Kese kağıdı şapka | Kese kâğıdından şapka | "made of a paper bag"; also the standard spelling kâğıt |
| acc_ring | Ring pull ring | Kapak halkası yüzük | Kutu halkası yüzük | a ring pull is the can's ring (kutu halkası), not a cap's |
| hat_sun | Picnic sun hat | Piknik hasır şapka | Hasır piknik şapkası | natural word order and suffix |

Checked by a native Turkish speaker (the PR author).
