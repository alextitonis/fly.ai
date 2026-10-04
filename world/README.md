# fly.ai world — flies with spiking brains

A low-poly field of fruit flies living on fruit, carrion, dung and compost. Each
fly runs its own spiking neural network: leaky integrate-and-fire neurons named
after real *Drosophila* cell types, wired in the same shape as the pathways the
rest of this repository measures in the MaleCNS connectome. Click a fly and watch
its brain fire; every label above a fly is a readout of its population rates.

```
what a fly sees, smells, hears and feels
  └─> R1-6 · LPLC2 LC4 LPLC1 LC10a VS · ORN_DM1 VM5d VL2a IR92a DA1 VA1d · Or56a Gr21a
      · JO · SNta LgLG LB3
        └─> antennal lobe (AL-LN, lPN, DA2 PN) · lateral horn · mushroom body (KC, MBON, DAN) · central brain
              └─> descending neurons DNa02, DNp01, DNg100, MDN
                    └─> VNC premotor (VNC-IN, IN19A)
                          └─> motor neurons DLM, b1, b2, Ti flexor/extensor, …
                                └─> wings and legs
```

Nothing between the senses and the muscles is scripted. There is no
`if (nearFruit) goToFruit` and no `if (geosmin) avoid`. Flight is read from the
**motor neurons**, not from the descending neurons.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks, then writes dist/
npm run preview
```

## Deploy to Vercel

Static Vite site. Import the repository, set the root directory to
`world/`, and `vercel.json` does the rest. Or `cd world && vercel deploy --prod`.

The page shows the **shared world** from the always-on server (below): every visitor watches the same flies, and
nothing is simulated in the browser. `?local` runs a private field in the tab instead, with the sliders, SWAT and
gust; the page also falls back to that if it cannot reach the server within 10 s. `VITE_WORLD_SERVER` points a build
at another server (default `https://fly-world-sim.fly.dev`).

## The brain

`src/brain.ts` runs the same update as `flybrain/brain.py`:

```
v <- exp(-dt/tau) * v + gain * (W @ spikes) + tonic + noise + sensory input
v >= 1  ->  spike, reset to 0
```

`dt` 20 ms, `tau` 100 ms (600 ms for Kenyon cells, 300 ms for MBONs), threshold 1. **748 neurons per fly (374 per side),
5,716 synapses**, generated once from seed 64 and never trained, with
`flybrain/build.py`'s weight recipe: synapse counts, negative when the presynaptic
neuron is inhibitory, then each neuron's incoming weights normalised to sum to 1.
All flies share the matrix and keep their own voltages and noise, exactly as
`FlyBrain(batch=N)` does.

Population sizes follow the proportions of the real MaleCNS sensory classes
(ol_sensory 6,098 / cb_sensory 4,868 / vnc_sensory 6,370 / vnc_motor 708), about
25× smaller.

## The senses

**Vision** (`src/eyes.ts`) — the two routes from `flybrain/eyes.py`: a luminance
panorama onto R1-6, and the feature detectors driven by angular size and its
growth, on the side the object is on. Plus **VS**, the lobula plate cells that
report ventral optic flow (ground speed over height) — this is what regulates
altitude now; there is no height controller in the physics.

**Olfaction** (`src/senses.ts`) — a **turbulent puff field**. Every source
releases discrete packets at a stochastic rate; packets are advected by the wind,
wander sideways, and spread as they age. A fly downwind therefore gets
**intermittent hits with real gaps**, not a smooth cone (about 900–1,000 live
puffs at any moment, sampled through a uniform grid). Seven channels, with the
real receptor→ligand pairings:

| Receptor | Ligand | Comes from | Sign |
|---|---|---|---|
| ORN_DM1 | ethyl acetate | ripe fruit | attract |
| ORN_VM5d | ethyl butyrate | fermenting fruit, compost | attract |
| ORN_VL2a | acetic acid | vinegar, fruit | attract |
| IR92a | ammonia / amines | carrion, dung, droppings | attract |
| ORN_DA1, ORN_VA1d | cVA | **other flies** | attract |
| **Or56a → DA2** | **geosmin** | **mouldy fruit** | **aversive** |
| **Gr21a/Gr63a → V** | **CO2** | **compost, frightened flies** | **aversive** |

Receptor dynamics differ by job, which is the fidelity fix that made plume
tracking work: the food and cVA receptors are **phasic** (they adapt with
τ = 0.5 s, so what reaches the brain is the *onset* of a puff), while Or56a and
Gr21a are **tonic** labelled lines that keep reporting a sustained danger.

Attractive receptors → lPN → PFL3/LAL (steering) and PVLP (thrust). Aversive
receptors → **DA2 PN → LH**, and the lateral horn drives the *opposite* LAL,
vetoes the ipsilateral one through LPi, and pushes MDN. Turn-toward and
turn-away use the same machinery with opposite sign.

**Johnston's organ** — airflow (wind minus own velocity), own wingbeat,
neighbours' wingbeat. JO → WED → LAL and DNg100.

**Legs** — SNta on contact (**phasic**), LgLG on knocks, LB3 on food
(**tonic**). They drive the GABAergic IN19A, which shuts the wing motor neurons
down: that is what makes a fly land and stay rather than a state flag.

## The world

Fermenting fruit, **mouldy fruit** (geosmin), carrion, dung, a compost heap
(food odour *and* CO2), plants, rocks — and **droppings**: a fly that has fed
long enough leaves one, it persists for 150 s and emits amines, so the world
slowly accumulates its own attractants. Everything except rocks can be landed on
and walked over, because landing is just leg contact.

The **swatter** comes down on a key press and looms exactly like anything else,
so the scattering is the real LC4/LPLC2 → DNp01 pathway. Mid-air collisions
tumble both flies. Names, live state tags (FEEDING, SURGING, CASTING, PANIC,
LANDED), a leaderboard, a live population graph (adults and brood over the last
five minutes, with the mating, egg and death counts beside it), fly cam and
drama cam are all readouts, never drivers.

## What the measurements say

### Cast-and-surge does emerge (`tools/surge.ts`)

16 flies, wind 1.6 m/s, 180 s, binned by time since the last phasic odour hit:

| time since a puff hit | speed | upwind heading | steering | DLM |
|---|---|---|---|---|
| < 0.25 s (a hit) | **2.71 m/s** | **0.771** | **2.31** | **8.7 Hz** |
| 0.25–0.75 s | 2.76 | 0.653 | 2.62 | 8.5 |
| 0.75–1.5 s | 2.55 | 0.616 | 2.72 | 8.1 |
| 1.5–3 s | 2.37 | 0.633 | 2.72 | 7.8 |
| > 3 s (plume lost) | **2.11** | **0.595** | **2.93** | **7.4** |

Monotonic in all four columns: on contact a fly speeds up, straightens, heads
further upwind and drives its wings harder; as the plume is lost it slows, turns
more and drifts off the wind axis. That is surge-and-cast, and nothing in the
code says so — it falls out of phasic receptors feeding the same steering and
thrust populations the wind pathway feeds.

### The ablation table (`tools/ablate.ts`)

24 flies, 60 s warm-up then 100 s measured, wind 1.2 m/s. "Occupancy" is the
share of fly-samples within 2 m of good fruit versus mouldy fruit;
"toward-neighbour" is the speed-independent attraction measure (+1 = heading
straight at the nearest fly, 0 = no preference).

| wiring | fruit dist | good/mould | land | feed | toward-neighbour | DLM | v | alt |
|---|---|---|---|---|---|---|---|---|
| **intact** | 11.37 m | 0.60 | 42 | 673 | −0.049 | 7.4 | 1.89 | 3.51 |
| no food ORN → lPN | 11.21 | 0.71 | 58 | 558 | −0.000 | 7.9 | 2.13 | 5.87 |
| no cVA ORN → lPN | 11.20 | 1.00 | 269 | 1184 | −0.068 | 6.7 | 0.95 | 1.28 |
| no geosmin (Or56a → DA2) | 12.74 | 0.79 | 55 | 799 | −0.091 | 6.8 | 1.69 | 2.92 |
| no CO2 (Gr21a → V) | 10.11 | 1.30 | 147 | 781 | −0.036 | 7.2 | 1.61 | 2.69 |
| no aversive line at all | 9.01 | 1.24 | 215 | 1178 | −0.115 | 6.7 | 0.80 | 1.33 |
| no LH output | 12.72 | 0.50 | 24 | 438 | −0.047 | 7.5 | 1.68 | 4.11 |
| no JO → WED | 9.44 | 2.00 | 42 | 999 | −0.122 | 6.7 | 0.95 | 1.75 |
| no leg SN → IN19A | 10.75 | 1.10 | **14** | **321** | −0.053 | 7.3 | 1.78 | 3.67 |
| **no DN → VNC premotor** | 13.76 | — | 9 | 341 | −0.108 | **2.5** | **0.07** | **0.42** |
| no LC10a → steering | 11.25 | 0.76 | 51 | 1165 | −0.108 | 5.0 | 0.20 | 0.61 |
| no VS (ventral optic flow) | 10.81 | 1.09 | 219 | 1638 | −0.032 | 6.5 | 0.62 | **0.89** |

And with strong plumes (wind 2.0): intact upwind heading **0.80**, no JO → WED
**0.35**.

Honest reading, item by item against the previous round's findings:

1. **The motor stage is real, again.** Cutting descending → VNC premotor:
   DLM 7.4 → 2.5 Hz, tibia extensor 3.7 → 0.9 Hz, speed 1.89 → 0.07 m/s,
   altitude 3.51 → 0.42 m. The flies sit on the ground twitching.
2. **Legs still make feeding happen.** Landings 42 → 14, feeding 673 → 321.
3. **Johnston's organ produces strong anemotaxis** — upwind heading 0.80 versus
   0.35 at wind 2.0 — and it *still* costs them food (cutting it raises feeding
   from 673 to 999). Flying upwind is time not spent on fruit. **Diagnosis for
   the "why":** JO → WED → LAL and lPN → PFL3/LAL converge on the *same* LAL →
   DNa02 output, so upwind drive and odour-gradient drive are literally summed at
   one steering neuron. When the wind direction and the plume's cross-wind
   gradient disagree, whichever is larger wins and the other is lost. That is a
   real prediction of this wiring, not a bug, and it is what you would expect of
   a single shared steering channel.
4. **VS closes the altitude loop.** Height is no longer clamped: mean altitude is
   3.5 m intact and collapses to 0.89 m with VS cut, with feeding rising (flies
   that cannot hold height end up on the ground, where the food is). Altitude is
   now neural; the only remaining clamp is a 12 m safety ceiling that is rarely
   touched.
5. **Finding 6 still holds: olfaction does not win foraging in a crowd.** With
   puffs and phasic receptors, cutting the food channel changes nothing
   measurable in the open world (11.37 → 11.21 m). It *does* now show at wind 2.0
   in the earlier round's assay sense — surge is real and measurable — but the
   distance metric in a 32 m field with 12 fruit, 9 mould patches, carrion, dung
   and compost is dominated by where flies happen to settle, not by search.
6. **cVA, with the confound removed, does not attract.** The speed-independent
   measure is −0.049 intact and −0.000 with cVA cut: flies are, if anything,
   very slightly *avoiding* their nearest neighbour, and removing cVA moves that
   to indifference. The old clustering result was arousal, exactly as suspected.
   No aggregation pheromone effect survives a speed-matched measure.
7. **The geosmin pathway fires but does not steer them off the mould.** Or56a
   runs at 1.6 Hz and LH at 6.5–9 Hz next to a mouldy fruit, so the channel is
   alive — but the occupancy ratio is 0.60 intact and 0.79 with geosmin cut, i.e.
   flies spend slightly *more* time near mould with the pathway intact. In a
   controlled two-choice arena (`tools/choice.ts`, fruit and mould 10 m apart in
   a 13 m arena, both orientations): intact 0.64 and 1.14, geosmin-cut 0.61 and
   1.28, LH-output-cut 0.70. **The side-swap variance is bigger than any
   ablation effect.** There is no geosmin avoidance in this model. The aversive
   drive reaches steering at a few Hz against a much larger visual and olfactory
   arousal background, and it loses.
8. **A methodological warning that applies to every row above.** Because each
   neuron's inputs are normalised to sum to 1, cutting one input *raises the
   weight of the rest*. Cutting Or56a → DA2 PN raised LH's firing from ~7 Hz to
   ~12 Hz (CO2 now owns the whole input budget). These ablations are therefore
   not clean knockouts, and small differences between rows should not be trusted.

## Measured performance

Headless Chrome, software WebGL (SwiftShader), 1400×900, 612 neurons per fly,
~900–1,000 live odour puffs:

| flies | frames/s | brain step, all flies |
|---|---|---|
| 36 | 76 | 3.1 ms |
| 60 | 77 | 5.2 ms |

The simulation is a fixed 20 ms accumulator decoupled from rendering, so even at
60 flies it uses about a quarter of each step's budget. The puff field is sampled
through a uniform grid; without it the frame rate was 48 fps at 60 flies.

## The life cycle (newest round, not yet measured)

Flies have a sex, an age, and a death. **640 neurons / 4,923 synapses** now.

* **Courtship uses the real circuit.** Males have **Gr68a/ppk23** foreleg contact
  chemoreceptors, which answer a female at close range, and **LC10a** (already
  there, already the fly's visual target-tracker) — both drive **P1**, the male
  command population, which drives **pIP10**, which drives the b1/b2 wing motor
  neurons: song is a wing motor pattern, not a sound effect. Rejection is not a
  coin flip: a mated female carries the male's **cVA**, cVA reaches the GABAergic
  AL-LN, and AL-LN inhibits P1 — so a mated female stops being courted because of
  a real labelled line.
* **Eggs.** A mated female on a food substrate lays at a rate read off the brain:
  `LB3 (taste) − LH (aversion)`. On mouldy fruit the lateral horn wins and no
  eggs are laid. Eggs hatch into larvae (25 s), larvae eat the substrate and
  pupate into adults (45 s).
* **Ageing** is a decline in the populations, not a health bar: `senseGain` and
  the motor tonic fall with age, so an old fly injects less sensory voltage and
  rests further below threshold — visibly a worse flier, and visible in its brain
  panel.
* **Death** from old age, starvation (240 s without feeding), the swatter (now
  lethal) or a spider. **Spiders** rear up when a fly comes near — their radius
  grows, which is real looming the eyes see — then strike, and anything still on
  the ground dies. That is the giant fibre's job.
* **Corpses become carrion**, which the amine channel already makes attractive,
  so the world feeds on its own dead.
* **Day and night.** The clock runs a 300 s day. Daylight is a sun-elevation
  curve, and it is *not* decoration: it scales the background luminance of the
  panorama the photoreceptors see, so a fly at night is genuinely working with a
  darker world. There is no "it is night" flag anywhere in the brain.
* **Every action shows on the map.** Mating, egg-laying, a hatch, the start of a
  meal, a dropping, a spider strike and a death each drop a marker where they
  happened, which
  fades over 6 s, and the same events fill the "Happening now" feed in the
  panel. A meal marks once rather than once per bounce, and a spider that misses
  marks at most once every 8 s.

A 600 s headless run with 30 flies (two in-world days, seed 7): 17 matings,
26 eggs, 26 hatched, deaths 6 old age / 24 starved / 6 eaten, ending at 18
adults. Starvation dominates mortality. Every one of the six actions fires on its
own — mating, egg-laying, hatching, feeding, spider attacks and death — which is
what this round was for.

### Predation and the giant fibre (`tools/lifeab.ts`)

24 flies, 30 s settle then 250 s measured, four independent world seeds. Deaths
are per 1,000 fly-seconds, so a run that loses flies early is not scored as safer
than one that does not.

| wiring | eaten / 1000 fly-s | other deaths | DNp01 | near the ground |
|---|---|---|---|---|
| **intact** | **0.30 ± 0.16** | 1.46 ± 0.26 | 0.91 Hz | 41.2 ± 6.1% |
| no loom → DNp01 | 1.94 ± 0.96 | 0.46 ± 0.29 | 0.00 Hz | 78.1 ± 7.4% |
| **no DNp01 → jump muscles** | **0.71 ± 0.29** | 2.23 ± 0.45 | 1.06 Hz | 36.8 ± 9.4% |

**The escape pathway keeps them alive, and the second row is why you need the
third.** Cutting the looming input to DNp01 raises spider deaths 6.5×, but it
also parks the flies near the ground (41% → 78%), so most of that is posture, not
a failed escape — LPLC2/LC4 feed steering and thrust as well as the giant fibre.
Cutting DNp01's *output* to the jump muscles is the clean test: the neuron still
fires at 1.06 Hz, time near the ground is unchanged, and deaths by spider still
more than double, 0.30 → 0.71. That is the giant fibre doing its job, measured
with the confound removed.

### Courtship: the circuit fires, but it does not control mating

24 flies, 50 s settle then 250 s measured, four seeds. P1 is the male command
population; pIP10 drives the wing motor neurons that make the song.

| wiring | matings | eggs | P1 (males) | pIP10 |
|---|---|---|---|---|
| **intact** | 6.0 ± 1.6 | 17.0 ± 4.2 | 5.07 Hz | 6.03 Hz |
| no LC10a → P1 (vision) | 7.5 ± 1.7 | 11.5 ± 5.7 | **1.78** | **1.64** |
| no Gr68a → P1 (contact) | 4.3 ± 1.9 | 11.0 ± 5.8 | **11.30** | 12.00 |
| no AL-LN ⊣ P1 (cVA veto) | 6.0 ± 0.7 | 15.8 ± 3.4 | 10.98 | 12.90 |

**A clean negative, and it indicts our own code rather than the wiring.** P1 spans
1.8 to 11.3 Hz across these rows — a six-fold range — and the number of matings
does not move: every row overlaps 6.0 ± 1.6. Mating here is proximity plus a
threshold that noise crosses in either direction, exactly as the "fudged" note
below admits. The courtship circuit is real and it responds to its inputs; it
simply is not what decides whether a mating happens.

Two further warnings sit in this table. Cutting the *contact* input **raises** P1
from 5.07 to 11.30 Hz, because normalised weights hand the dead input's share to
the survivors — large enough here to invert the expected direction. And the cVA
veto cannot be tested this way at all: removing an inhibitory input raises P1 for
two reasons at once, and the mating rule ignores both.

### Egg-laying substrate: the assay does not work

20 flies, one fruit and one mould patch 8 m apart in a 13 m arena, 300 s, four
seeds, sides swapped between seeds. Counts are eggs and larvae still sitting on
each patch at the end.

| wiring | on fruit | on mould | LB3 (taste) | LH (aversion) |
|---|---|---|---|---|
| intact | 0.3 ± 0.4 | 0.0 ± 0.0 | 0.21 Hz | 6.66 Hz |
| no geosmin → DA2 | 0.3 ± 0.4 | 0.8 ± 0.8 | 0.20 | **8.42** |
| no LH output | 0.5 ± 0.9 | 0.3 ± 0.4 | 0.20 | **9.61** |

**Nothing can be concluded from these numbers, and the reason is worth more than
the numbers would have been.** Egg-laying drive is `LB3 − LH`, but LB3 idles
around 0.2 Hz while LH sits near 7 Hz, so the drive is negative almost everywhere
and fewer than one egg per run is laid in the arena. The rate constants are simply
mismatched: two populations subtracted from each other with no common scale.

Worse, the obvious fix — cut the aversive input and see whether eggs return — is
**unavailable in this model**. Cutting Or56a → DA2 PN *raises* LH to 8.42 Hz, and
cutting LH's output raises it to 9.61 Hz, because in both cases the remaining
inputs absorb the normalised budget. There is no way to lower LH by removing
something that feeds it. Any future test of this pathway has to compare LH against
its own baseline, or gate on the geosmin channel directly, rather than subtract
one raw population rate from another.

**Fudged, and worth knowing.** Mating is a world rule that reads P1 (above 6 Hz
and within 0.8 m) rather than a courtship sequence; female receptivity is a
minimum age; egg, larval and adult timings are seconds rather than days; larvae
have no brain at all.

## Why the flies starved, and the fix (2026-09-16)

The first hours of the always-on world lost 25 of 31 flies to starvation. Food was never short (fruit stayed 99%
uneaten): the flies flew too high to land. Over fruit they were a median 6.8 m up, and only 1% of the time low enough
to touch down. Three of this round's changes did it, and none of them was the mushroom body's learning:

| cause | what it did |
|---|---|
| lPN spontaneous rate (1.9×) and uniglomerular lPN, added so the mushroom body could hear food odours | both also feed PVLP/WED → DNg100 thrust |
| toward-MBON → DNg100 forward flight (round 2) | more lift in every plume |
| **the new blocks were inserted in the middle of EDGES** | buildWiring draws every block's connectivity from one seeded stream in order, so every later block (steering, descending, VNC, motor) was re-rolled into a different random nervous system |

The fix keeps the memory and puts flight back exactly as it was:
* `lPN` is the original again (pooled, 14 per side, resting at 1×). The mushroom body gets its own **uPN**:
  uniglomerular, resting at 1.9×, read only by Kenyon cells. Real antennal lobes have both kinds.
* The toward-MBON drives PFL3 steering only, not DNg100.
* Every added population and block is **appended at the end** of `POPULATIONS` and `EDGES`. All 4,923 original
  synapses are now identical to the pre-round build; the 793 extra ones are all mushroom body.

The rule was fixed before the runs: over 8 seeds, fed flies within 90% of the pre-round build and median altitude
within 0.5 m (24 flies, 230 s, food within landing reach).

| build | fed of 24 | median altitude |
|---|---|---|
| before this round (fixed genes / varied) | 17.6 / 17.2 | 2.69 / 2.38 m |
| broken (varied genes) | 12.9 | 3.68 m (7.06 m on the live seed) |
| **fixed** (fixed genes / varied) | **17.2 / 16.4** | **2.50 / 1.56 m** |

600 s, 24 flies, seeds 1234 / 7 / 42: starved 19 / 10 / 16 before this round, and **11 / 14 / 12** now. Adults left
10 / 12 / 1 before, **17 / 7 / 12** now. The Kenyon-cell code still passes (sparse 32%; fruit vs carrion 0.48, fruit
vs mould 0.55, carrion vs mould 0.70, against a 0.997 ceiling). Starvation is still the main cause of death, about
half the founders in 10 minutes, as it was before this round.

**Caveat for the memory rounds above:** rounds 1–4 and the transfer diagnostic ran on the re-rolled wiring. Their
mechanisms still hold, but their numbers belong to that wiring and should be re-run before they are quoted.

## The always-on world (`server/`, 2026-09-16)

One field of flies that never stops, recorded as it goes. `server/run.ts` steps the same `World` the page runs, in
real time. On fly.io the app is `fly-world-sim`, and the records go to Flybook's Supabase in
`world_*` tables (`flybook/supabase/migrations/20260916120000_world_sim.sql`).

| what | how |
|---|---|
| clock | 50 steps per simulated second, real time; if the CPU falls behind, simulated time slows instead of skipping steps (`realtime_ratio` in `/health`) |
| recorded | every 10 s a batch: a world row every 10 simulated s, each fly every 60 s, every event, changed lineage and egg rows; relationships every 5 min |
| restarts | a gzipped checkpoint every 10 min and on SIGTERM (flies, genes, learned synapses, eggs, lineage, relationships, counters); a deploy or crash resumes the same run. If the wiring changed, genes carry over by name and learned synapses reset |
| never empty | below `WORLD_MIN_FLIES` (8) a newcomer flies in every 20 s: an `arrive` event, `immigrant` in the lineage |
| bounded | records of flies dead more than an hour are dropped from memory once saved; the in-memory tables keep the last hour |
| shared page | `/live?fly=<id>` streams the world to the page as Server-Sent Events, gzipped (about 7 KB/s a viewer): a full frame on connect, then 10 frames a second of fly positions and states, changed props, new events and the watched fly's brain (rates, sense drives, every step's spikes as a bitset). The page interpolates between frames (`src/live.ts`, `server/live.ts`). `/data` feeds the Data card. `LIVE_MAX_CLIENTS` (300) caps viewers, and `fly.toml` raises fly's connection limit to match |
| HTTP | `/live`, `/data`, `/health` (includes `viewers`), `/state` (counters, every fly, recent events), `/report` (the printable report; Save as PDF), `/export/{world,flies,events,lineage,eggs,relationships,blocks}.csv` (recent, from memory; the full history is in the database) |

Run it locally without the database: `WORLD_SINK=files WORLD_DATA_DIR=world-data node --experimental-strip-types server/run.ts`
(add `WORLD_SPEED=10 WORLD_STOP_AFTER_S=600` for a quick test). Every setting is listed at the top of `server/run.ts`.

Tested locally (files sink, 10× speed): 600 s, then a restart to 900 s. The run resumed at t=600 with the same run id,
counters and flies; world rows are continuous 0 → 890 s with no gaps or duplicates; checkpoints were 0.15–0.67 MB.
In that run 25 of 31 deaths were starvation and the population fell from 24 to 5 before newcomers held it at 8, so
expect the long-run world to lean on newcomers until feeding is better.

**Size.** At these intervals, roughly 20–30 MB of rows a day with 30 flies (about 1 GB a month), plus the last 3
checkpoints. **CPU.** A desktop core runs 24 flies at 17× real time and 80 at 2.7×. Shared fly.io CPUs measured about
13× slower for Flybook, so `fly.toml` caps the population at 30 on a shared CPU; a performance-1x machine can take 80.

## Data, genes, eggs and rewiring (2026-09-15)

Four questions — do flies gather, do they make friends and enemies, can their brains rewire, do children take after
their parents — needed things the world did not have. Before this round every fly shared one wiring that never
changed, a hatched fly had no parents, and every egg hatched.

**Recorded, visualised, exported.** The **Data & findings** card shows it live. Charts cover groups and the
aggregation ratio, brain change, and parent-vs-child for any gene or outcome. Panels cover relationships and what
became of every egg. CSV buttons download seven tables (`src/datalog.ts`):

| table | one row per |
|---|---|
| `world.csv` | second: adults, eggs, larvae, groups, share in groups, aggregation ratio, share of grouped flies at food, brain change, mean memory depth, relationship counts, generations, running totals |
| `flies.csv` | fly every 5 s: position, state, meals, time since fed, brain change, memory depth, DNp01 / P1 / DLM / LH / LB3 / KC / MBON rates, flies within 2 m, group |
| `lineage.csv` | fly ever: sex, generation, mother and father, every gene, and on death the cause, age, meals, distance, brain change, offspring |
| `eggs.csv` | egg: parents, generation, substrate, fate (hatched, became an adult, or died and why, at which stage) |
| `relationships.csv` | pair of flies: seconds near, bumps, startles, courtship, matings, family, label |
| `brain blocks.csv` | connection block: mean change of that block across living flies |
| `events.csv` | mating, egg, hatch, meal, spider strike, death, dropping: time, place, who |

**report (PDF)** opens the run's findings as a printable page (`src/report.ts`); the browser's Save as PDF writes the file.

**Genes and inheritance** (`src/genome.ts`). Each fly carries:
* one strength multiplier per connection block (applied before normalisation)
* a resting-drive multiplier per population
* a receptor gain per sense
* two learning-rate genes
* body genes for lifespan, flight power and clutch size

Founders draw their genes around the old fixed values. A mated female carries the male's genome. Each egg takes every
gene from its mother or father at random, then mutates it a little. Nothing selects: who lives and breeds is whatever
happens in the field. Because inputs are normalised per neuron, an edge gene only changes a neuron that also has inputs
from other blocks.

**Eggs and larvae can die** (`BROOD` in `src/sim.ts`, world rules like the timings). The causes are:
* a background rate
* a mouldy substrate
* a substrate eaten down to nothing
* crowding (more than 6 others within 1.2 m)
* an adult landing on them
* a spider strike within 1.3 m
* no room left for another adult

**Rewiring during life** (`src/brain.ts`, off by default, two switches in the Data card):
* **Hebbian:** a synapse grows when its input fired on the step before its output.
* **Reward-gated:** those pairings leave a 1 s trace, and a meal (+1), a knock (−0.3) or a spider strike nearby (−1)
  turns the trace into change.

Synapses keep their sign, stay within 0.2–3× their birth size and drift back over 400 s. Every neuron's total input is
rescaled to its birth total once a second. Only synapses onto central-brain and descending neurons change; sensory
inputs, the premotor pool and motor neurons stay hardwired. Three versions were run on 36 flies, 900 s:

| version | mean brain change | outcome |
|---|---|---|
| every synapse, no rescaling | 70% (forward-flight inputs pinned at the cap) | 40 of 46 flies starved |
| every synapse, rescaled | 12–25% | population died out |
| central + descending only, rescaled (kept) | 10–17% | still died out; 3.8 meals per starved fly |
| frozen brains, same world | 0% | 10 adults and 3 generations at the end |

**Groups and relationships** (`src/social.ts`, measurement only). A group is 3 or more flies within 2 m of each
other. The aggregation ratio is the mean nearest-neighbour distance divided by the same number of flies placed at
random in the arena (Monte Carlo); below 1 means gathered. Relationship labels, first match wins, with thresholds fixed
before any run:

| label | rule |
|---|---|
| mates | mated |
| family | parent and child, or same mother |
| enemies | at least 6 clashes (bumps + 2 × startles) and at least one per 20 s together |
| friends | at least 90 s together and at most one clash per 60 s |
| acquaintances | at least 20 s together |

A startle is a giant-fibre escape while another fly is the nearest one closing in (not during a spider or swatter
scare). A bump counts once per collision. Read "enemies" carefully: enemy pairs average about 4 startles and half a
bump after only ~1.5 s near each other, so the label mostly means two flies that keep flying straight at each other
and setting off each other's escape — a real looming response in the model, not aggression.

Measured with pre-set criteria in `tools/lifedata.ts` (learning, inheritance, groups); results below.

### Does rewiring help? (`tools/lifedata.ts learning`)

24 flies, 60 s settle then 300 s measured, 4 seeds, the same founders in every cohort. The criteria were set before the
run. Feeding is seconds spent feeding per fly-second. HELPS or HURTS needs a change of at least ±10% against frozen
brains, in the same direction on 3 of 4 seeds.

| brains | synapse change | feeding | vs frozen | deaths / 1000 fly-s | verdict |
|---|---|---|---|---|---|
| frozen | 0.00% | 0.0102 ± 0.0024 | — | 1.61 ± 0.24 | — |
| hebbian | 12.6 ± 0.3% | 0.0008 ± 0.0007 | −89% (0/4 seeds higher) | 5.23 ± 0.27 | **HURTS** |
| reward | 10.7 ± 1.5% | 0.0061 ± 0.0003 | −35% (0/4 seeds higher) | 1.77 ± 0.09 | **HURTS** |
| both | 13.8 ± 1.7% | 0.0016 ± 0.0010 | −84% (0/4 seeds higher) | 4.12 ± 1.06 | **HURTS** |

**The brains do rewire, and it makes the flies worse at finding food.** Hebbian learning is the most damaging: every
causal pairing strengthens a synapse, and in a network this small the most active loops take over. The reward rule
does less harm, because it only acts around meals, knocks and spider strikes, but it still costs a third of feeding.
Neither rule learns anything useful here: a meal comes long after the steering that led to it, so a 1 s trace rewards
whatever the fly happened to be doing while it ate. That is why learning is off by default in the page.

### Do children take after their parents? (`tools/lifedata.ts inheritance`)

36 flies, 1500 s, 3 seeds, pooled; each child against the mean of its two parents, bootstrap 95% CI. The criteria were
set before the run with **learning on**, the page default at the time, and that shaped the result: all three
populations died out (seed 11: 5 children, seed 23: 20, seed 37: none), leaving 25 families, just over the minimum of 20.

| trait | children | slope [95% CI] | verdict |
|---|---|---|---|
| gene: lifespan | 25 | 1.16 [0.62, 1.69] | passes on |
| gene: flight power | 25 | 0.86 [0.09, 1.83] | passes on |
| gene: clutch size | 25 | 0.80 [0.12, 1.34] | passes on |
| gene: looming → escape | 25 | 1.06 [−0.00, 2.21] | passes on |
| gene: smell gain | 25 | 0.94 [0.24, 1.58] | passes on |
| gene: odour → steering | 25 | 0.42 [−0.28, 1.23] | **sanity check failed** (slope outside 0.7–1.3) |
| lived: meals per minute | 25 | −0.02 [−0.43, 0.33] | no resemblance shown |
| lived: age at death | 25 | 0.37 [−0.14, 1.16] | no resemblance shown |
| lived: brain change at death | 25 | 0.16 [−0.20, 0.52] | no resemblance shown |

**Genes pass on; what a fly does with them does not show up yet.** Five of six genes land near a slope of 1, as they
must by construction. The odour → steering gene misses the sanity band. Its interval still contains 1, so with 25
families this is most likely sampling noise, but it is reported as a fail because that is the rule. No lived outcome
resembles the parents: meals, age at death and brain change look like luck and location. With learning on and every
population dying out, 25 families cannot rule out a small inherited effect. A run with frozen brains, which keep the
population alive, is the obvious next measurement. It would be new, not a replacement for this one.

Egg and larva fates in these runs (38 eggs): 25 became adults; died as eggs: 6 background; died as larvae: 4 background,
2 eaten-away substrate, 1 mould. Relationship labels over all pairs ever: 387 enemies, 61 mates, 30 family,
13 acquaintances, 1 friends pair, 539 none.

### Do flies gather, and is it the pheromone? (`tools/lifedata.ts groups`)

24 flies, 60 s settle then 300 s measured, 4 seeds, frozen brains, cVA at 0.75 (normal) against 0 (off).

| cVA | nearest-neighbour ratio (1 = random) | share in groups | grouped flies at food |
|---|---|---|---|
| on | 0.838 ± 0.022 | 7 ± 9% | 5 ± 21% |
| off | 0.810 ± 0.020 | — | — |

**They gather, and the pheromone is not why.** With cVA on, flies sit about 16% closer to their nearest neighbour than
random placement would put them, on every seed (GATHER). Turning cVA off does not spread them out: the ratio is
slightly lower without it (difference +0.03 ± 0.04; cVA EFFECT NOT SHOWN). Real groups of 3+ flies within 2 m are
rare (7% of flies), and few of those are at food. The loose clustering most likely comes from shared flight paths and
the arena's layout, not from flies seeking each other.

## Odour memory: the mushroom body (2026-09-16)

Before this round nothing in a fly could learn what a smell *means*: no Kenyon cells, no output neurons, no
dopamine, and the only thing another fly could pass on was its wingbeat and its CO2. Now every fly has a mushroom
body (`src/wiring.ts`, the rule in `src/brain.ts`, `learning.mb`, **on** by default, "odour memory" in the Data card).

| population | per side | job |
|---|---|---|
| uPN | 12 | the mushroom body's own projection neurons: two per glomerulus, spontaneous rate 1.9×, read only by KCs |
| KC | 30 | Kenyon cells: each samples a few uPNs (and DA2 PN), so which KCs fire is the odour's signature. τ 600 ms |
| APL | 2 | GABA feedback over all KCs: keeps the code sparse |
| MBON-g2a1 | 3 | cholinergic output that keeps a fly **approaching** the odour (drives PFL3 steering; it drove DNg100 forward flight until the starvation fix). τ 300 ms, near silent at rest |
| MBON-g5b2a | 3 | output that makes it **back off** (drives MDN and the LPi steering veto). τ 300 ms, near silent at rest |
| PPL1-g2a1 | 2 | punishment teacher, fed by LC4 (a looming threat), LgLG (a knock) and DA2 PN (geosmin, **CO2**) |
| PAM-g5 | 2 | reward teacher, fed by LB3 (juice on the labellum) |

**The rule.** A KC spike leaves a 5 s trace. When a teacher fires, the traced KCs' synapses onto that teacher's
MBON are depressed (punishment → the toward-MBON, reward → the away-MBON), down to 15% of their birth size, and
what is left fades over 900 s. A teacher writes only inside a burst (its running rate above 5 Hz, round 3). Only KC → MBON synapses change, and they are kept out of the synaptic rescaling.
Nothing injects the teachers. They are neurons on the same senses as everything else, so **learning from another
fly has no channel of its own**: a frightened fly gives off CO2, the CO2 reaches a neighbour's Gr21a → DA2 PN →
PPL1, and whatever that neighbour was smelling at the time is punished. The compartment names are real; which
MBON pushes which way is this model's simplification.

**Two changes outside the mushroom body were needed, and they touch old results.** The first probe showed food
odours never reached a Kenyon cell. `lPN` fired 0.1 Hz next to a fruit, because food ORNs sit below threshold, and
every lPN listened to every food glomerulus, so fruit and carrion gave the same KC code (cosine 0.95):
* `lPN` rests at 1.9× tonic. Real projection neurons have a spontaneous rate; with it, fruit drives lPN to 1.3 Hz against 0.1 Hz in clean air.
* PNs are **uniglomerular**: 12 per side, two per glomerulus (a labelled-line `slice` on the ORN → lPN block), where there used to be 14 pooled ones.

*Superseded by the starvation fix below:* both changes lifted flies off their food. `lPN` is the original again, and
the spontaneous rate and the labelled lines now belong to a separate `uPN` population that only Kenyon cells read.

Before and after, on the old tools (HEAD vs this round, same seeds):

| tool | before | after |
|---|---|---|
| `surge.ts` upwind heading, hit → plume lost | 0.679 → 0.442 | 0.542 → 0.368 (the surge-and-cast gradient survives, weaker and less upwind) |
| `assay.ts` reached fruit: intact / wind 0 / no JO → WED | 0% / 67% / 0% | 0% / 71% / 58% |
| `choice.ts` fruit vs mould ratio, sides swapped | 0.52 / 1.65 | 0.72 / 1.34 (side-dominated both times) |
| `life.ts` adults at 480 s of 30 | 15 (17 starved, 7 eaten) | 21 (19 starved, 4 eaten) |

The table above is the round-2 wiring. Round 1 used MBON-g1pedc/PPL1-g1pedc, with a GABAergic "toward" output
onto the turn-away line, which gave punishment nothing active to change (see round 2 below).

### Measured, round 1 (`tools/memory.ts`, seeds 11, 23, 37, 51)

Criteria were written into the tool before the first run. Twelve flies, fruit at (−5, 0) and carrion at (+5, 0), the
punished side swapped between seeds, 4 seeds. The score is the change in preference for the punished source (dPI,
−1…+1) from a 120 s free test before training to one after. During training flies are held in place. The swatter is
removed before it reaches anyone, and flies neither starve nor age during an assay. **The first full run is void**:
every held fly died of old age mid-trial, which made the conditions identical and dropped carrion into the arena.

| test | result | verdict |
|---|---|---|
| **code**: active KCs per 0.2 s | 27% | **SPARSE** |
| same odour, split half / fruit vs carrion / fruit vs mould / carrion vs mould | 0.995 / 0.60 / 0.56 / 0.53 | **SEPARATES ODOURS** |
| **conditioning**: paired − unpaired dPI, rule on | −0.04 ± 0.23 (3/4 seeds down), memory depth 46% | **NO CLEAR EFFECT** (needs ≤ −0.15) |
| same, rule off (control) | −0.08 ± 0.11 (3/4 seeds down), depth 0% | no clear effect |
| **social**: observers' dPI, demonstrators − none | −0.22 ± 0.49 (2/4 seeds down) | **NOT SHOWN** (needs ≤ −0.15 on 3/4) |
| same, CO2 → PPL1 cut / rule off | +0.01 ± 0.16 / −0.19 ± 0.33 | route not shown |

**The memory forms, and the flies do not act on it yet.** The odour code works: sparse, reliable, and different for
fruit, carrion and geosmin. Pairing an odour with a looming swatter depresses 46% of KC → MBON strength. But
the preference change is inside the noise, and it is no bigger than with the rule off, whose −0.08 is the noise
floor of a 6-fly, 120 s test. Six MBONs are a small voice in LAL, which hears from a dozen other blocks.

**The social test has a confound that sinks it before the MBONs even matter.** Held observers got the same CO2
(0.79) and their teacher fired (2.1 Hz) even when **no demonstrator was ever scared**. A held fly is a frightened
fly: its own giant fibre fires, it gives off CO2 and punishes itself and its neighbours. Observers came out with the
same 43% memory depth with or without demonstrators, so this test cannot tell "learned from a neighbour's fright"
from "was frightened". Cutting DA2 PN → PPL1 does bring observer PPL1 down from 2.9 to 0.9 Hz, so the CO2 route is
what carries the teaching signal. It just carries it in every condition.

Obvious next measurements, each needing new criteria written first: a stronger MBON → steering block, larger groups
or longer tests to lower the noise floor, and a social layout where observers are not held (or are held without
fright), so the demonstrators' CO2 is the only alarm in the air.

### Round 2: the cage and the outputs fixed, fresh seeds (61, 73, 89, 97)

What round 1 got wrong, found with held-fly diagnostics that are not the test scores:
* **Held flies 0.8 m apart frighten each other.** Neighbours loom (LPLC2 4.1 Hz), the giant fibre fires, they give off CO2 and teach themselves. At 1.6 m, DNp01 drops to 0.01 Hz and CO2 to zero. Observers held 9 m downwind were also spooked by the rock ring, so they now sit at 6 m.
* **The "toward" output could not act.** It was GABAergic onto the turn-away line, and for fruit nothing drives that line, so taking away its brake did nothing. Even driven at 50 Hz, the outputs turned a fly −0.02 (LAL driven directly: −0.28). Left-right steering was the wrong target anyway: in plume the Kenyon cells fire almost equally on both sides (0.5 / 0.7 Hz). The outputs now act on approach, as the real ones do: toward → forward flight and odour steering, away → backing off and the veto. They rest near silent, so what they carry is the odour.
* After that, held in a fruit plume, punishment takes the toward output from 1.16 to 0.06 Hz; odour exposure alone leaves it at 1.21. Forward-flight drive (DNg100) falls about 20–25%, but **wing power (DLM) does not change** (5.69 → 5.68 Hz). Raising MBON gain only added resting noise. Gains were not pushed further, because that would have meant tuning until the test passes.

Thresholds unchanged:

| test | result | verdict |
|---|---|---|
| **conditioning**: paired − unpaired dPI, rule on | **−0.11 ± 0.06, 4/4 seeds down**, learned aversion 0.78 | **NO CLEAR EFFECT** (needs ≤ −0.15) |
| same, rule off | −0.04 ± 0.01, 4/4 seeds down | no clear effect |
| **social**: observers' dPI, demonstrators − none | +0.07 ± 0.08 (0/4 seeds down) | **NOT SHOWN** |
| observers' learned aversion: demonstrators / none / CO2 route cut / rule off | 0.82 / 0.80 / 0.58 / 0 | |

**Conditioning is now in the right direction on every seed, three times the rule-off baseline, and still short of
the line.** That fits the diagnostics: the memory is written and read out by the MBONs, but a 1 Hz swing in three
neurons barely moves the wings.

**The social test is still not a test.** Observers came out with the same learned aversion whether or not a
demonstrator was ever scared (0.82 vs 0.80). Twelve flies in one plume still carry some CO2 (0.29 with no swatter),
the punishment teacher fires 0.7 Hz, and 180 s of that saturates the rule at its floor. That points at the rule, not
the cage: **there is no teaching threshold**, so a trickle of dopamine writes as surely as a burst, just slower.
Cutting DA2 PN → PPL1 is the only thing that lowers it (0.58), so the CO2 route is the teacher.

Next, each with criteria first: a burst threshold on the teachers (dopamine must exceed a rate before it writes),
and a stronger MB vote at the motor level. That second one is a real question about this network (every
central-brain vote is weak against the tonic flight drive, the innate lateral horn included), not a dial.

### Round 3: teachers write only in a burst (seeds 103, 107, 109, 113)

The threshold came from a rate diagnostic, not these scores. With no punishment anywhere, a held fly's punishment
teacher never went above 2.5 Hz (0.5 s windows; a crowd's stray CO2 keeps it at 0.7 Hz on average), while a swatter
drives bursts to 12–13 Hz. The rule fixed beforehand was twice the highest no-punishment rate, so `MEMORY.burstHz` = 5 Hz.
One criterion was added: SELECTIVE, meaning observers' learned aversion is ≤ 0.2 without demonstrators and at least
twice that with them.

| test | result | verdict |
|---|---|---|
| observers' learned aversion: demonstrator frightened / none | 0.53 / −0.003 | **SELECTIVE** |
| same, DA2 PN → PPL1 cut | 0.48 | |
| **social**: observers' dPI, demonstrators − none | −0.005 ± 0.03 (2/4 seeds down) | **NOT SHOWN** |
| **conditioning**: paired − unpaired dPI | −0.02 ± 0.03 (3/4 down; rule off −0.003) | **NO CLEAR EFFECT** |

**The threshold does what it was for:** a crowd no longer teaches itself (0.80 → 0.00). **But this is still not learning
from another fly.** Cutting the alarm-CO2 route leaves observers almost as aversive (0.48). They are mostly taught by
seeing the swatter come down about 5 m away. The "no demonstrators" control had no swatter at all; the control this
question needs is the swatter coming down on an empty spot. Behaviour does not move in either test, and direct
conditioning is weaker than in round 2, which is what the diagnostics predicted: the memory is written and read out,
and it does not reach the wings.

### Round 4: the right control (seeds 127, 131, 137, 139)

The control is now the swatter coming down on the demonstrators' spot while the demonstrators are held in clean air
9 m upwind. Model as in round 3; thresholds unchanged.

| condition | observers' learned aversion | observer teacher | observer CO2 | observers' dPI |
|---|---|---|---|---|
| demonstrators frightened | 0.54 | 2.06 Hz | 0.42 | −0.03 ± 0.08 |
| swatter on an empty spot | **0.57** | 2.15 Hz | 0.44 | −0.07 ± 0.06 |
| alarm CO2 route cut | 0.56 | 0.93 Hz | 0.40 | +0.03 ± 0.13 |
| memory rule off | 0 | 2.07 Hz | 0.42 | −0.01 ± 0.05 |

Verdicts: **SOCIAL LEARNING NOT SHOWN** (shift +0.04, 1/4 seeds down), **ROUTE NOT SHOWN**, **NOT SELECTIVE**.

**A clean no: in this model a fly does not learn a smell from another fly's fright.** Observers learn exactly as much
when nobody is under the swatter (0.57 vs 0.54). They are taught by seeing it come down about 5 m away, and they
frighten each other: their CO2 is the same with or without demonstrators. Cutting the CO2 → teacher route halves the
teacher's rate and leaves the memory untouched (0.56), because a burst from the looming swatter is enough on its own.
Demonstrators add nothing measurable. Behaviour does not move in any condition, as the transfer diagnostic predicted.

Testing the social route itself would need observers who cannot see the threat (further away, or with the LC4 →
PPL1 route cut), so a demonstrator's CO2 is the only possible teacher.

### Why no central-brain vote reaches the wings (transfer diagnostic, 2026-09-16)

One population is driven in quiet air, and every stage downstream is read:

| driven | reaches | result |
|---|---|---|
| DNa02 L at 6 Hz | wings | turn −0.08. **Descending → motor works.** |
| DNg100 both at 6 Hz | wings | thrust 0.048 → 0.128 |
| LAL L at 6 Hz | DNa02 | 1 Hz, turn −0.013 (needs ~13 Hz) |
| lateral horn L at 6 Hz | MDN | 1 Hz; only 50 Hz turns the fly |
| toward-MBON at 7.5 Hz | DNg100 | **0.1 Hz** |
| away-MBON at 7.5 Hz | MDN | 0.1 / 1.9 Hz |

**The block is central brain → descending neurons, for innate and learned votes alike.** A descending neuron hears
from many areas, and every neuron's inputs are normalised to sum to 1, so at 1–10 Hz no single area gets it to
threshold. It is the same limit as the tonic fudge below.

**The obvious fix breaks feeding.** Descending neurons integrating over 2× τ (chosen by a rule: the largest τ keeping
resting DN firing ≤ 0.5 Hz and resting thrust within +30%) let 3.5–5× more through: LAL at 6 Hz turned the fly
−0.068, toward-MBON drove DNg100 to 2.2 Hz, and the plume assay went from 0% to 71% reaching fruit with the surge
gradient intact. But resting forward drive rose (DNg100 4.2 → 6.0 Hz), flies stopped landing (4 landings in 120 s
among 24 flies → 0), and in `life.ts` all 30 starved by 240 s. **Reverted.** The world was already on a knife edge
(4 landings in 2 minutes). Letting central votes through needs forward drive and landing rebalanced together, and
that is a change to the whole flight model, not to memory.

## What isn't real

* **This is not the connectome.** 748 neurons and 5,716 synapses from a seeded
  PRNG and a block diagram, against 166,700 neurons and 25.6 M connections of
  electron microscopy. Nothing downloaded, nothing trained.
* **Names real, numbers invented.** Every population is a real cell type and
  every receptor→ligand pairing is the real one (Or56a/geosmin, Gr21a/CO2,
  IR92a/ammonia, DA1/cVA, VL2a/acetic acid). Counts, connection probabilities and
  synapse weights are made up. `VNC-IN` is not a cell type — it is a generic
  premotor pool standing in for the VNC's interneuron hemilineages.
* **The plume is a toy.** Discrete Gaussian packets with a random walk: it has
  intermittency and gaps, but no real turbulence, no filaments, no meander.
* **The tonic fudge survived.** Premotor and flight motor neurons still rest
  above the global tonic. The cause is structural and worth stating plainly: with
  inputs normalised to sum to 1 and gain 1.5, a neuron needs roughly 40% of its
  input mass to spike within one 20 ms step, which means presynaptic rates near
  20 Hz. This network runs at 5–10 Hz, so any chain more than a couple of stages
  deep dies unless tonic drive carries it — which is exactly why the Python model
  uses tonic 0.14 globally and Fly64 parks every neuron at threshold. We use a
  lower global tonic and restore it selectively for the motor stage. Stronger
  weights do not fix it, because normalisation cancels them.
* **Aversion does not work.** See finding 7. The wiring is there; the behaviour
  is not.
* **The decoder is hand-written.** Motor-neuron rates → speed, yaw, lift, jump
  (`MOTOR` in `src/sim.ts`). Everything upstream is the network.
* **Flight is not aerodynamics**: no wing forces, no body rotation but yaw, and
  the fly is carried by the wind at 90%.
* **The photoreceptor route contributes little**, as `sweep.py` finds in the real
  model.

## Wiz: the real connectome in the browser

**Wiz is a meme with real strings: a fly brain trying to work a monkey.** Only his wish to wander (a
random spot to head for, or a pause) is coded. His body is simulated in `src/wiz.ts`: an under-damped
balance wobble, feet that stay planted until his hips leave them behind and then step toward where he is
tipping, a fall when the lean passes the point of no return (then a pendulum topple and a spring back
up), and springs for everything else; `src/wizview.ts` puts each foot and hand in place with two-bone IK.
The strings are neurons: his eyes feed the fly's looming, threat and target cells and each real footfall
its leg-touch cells (both soles while he lies on the ground); the descending neurons that fire for those
senses raise his arms (DNp02/03/04/11, DNg40), kick a foot into a misstep (DNge104/122, DNg20, DNge102),
turn his head (DNa05/07, DNg111, DNae002), steer him (DNa02) and hop him (DNp01). So his own footsteps
make him misstep and wobble, and every few steps that tips him over. A giant cartoon fly hovers over him
working a wooden control bar (`src/puppeteer.ts`); it is decoration, but its strings run to his hands,
knees and head and light up green as their neurons fire. The sections below are why the wish to walk
cannot come from the brain.

**Summon Wiz** drops a 9 m wizard into the field whose brain is the **full MaleCNS connectome**
(166,700 neurons, 25.1 M synapses after dropping synapses onto sensory neurons), the same model as
`flybrain`'s `FlyBrain(sensory_input=False)`, running in a Web Worker. The flies keep their small brains.

* **Files.** `flybrain export --web public/connectome` (see `flybrain/web.py`): CSC columns with
  varint-coded target gaps and one byte per weight on a log scale (mean error 2.3%, max 4.7%), gzipped:
  57.6 MB of weights split into `weights.0.bin` (40 MB) and `weights.1.bin` (listed in `brain.json`, so no
  file passes GitHub's 50 MB warning), 0.34 MB of labels in `meta.bin`, 126 MB in memory. The files are
  named `.bin`, not `.gz`, because dev servers send `.gz` with `Content-Encoding: gzip`; the loaders check
  the gzip magic bytes instead. They are committed and served at `/simulation/connectome/`. The model is `public/models/wiz.glb`, 0.85 MB
  (FBX2glTF, then meshopt geometry and WebP textures with gltf-transform).
* **Checked against Python** (`tools/connectome.ts` vs `wiz/probe.py`): 7,712 vs 7,731 neurons fired per
  step at rest; looming on the left raises DNp01 L by 19.0 vs 18.6 Hz; a target on the left raises
  DNa02 L by 3.4 vs 3.0 Hz. 13.4 ms per 20 ms step on one core in Node (13.1-13.8 ms in headless Chrome).
* **In:** his eyes run the flies' own `Vision` geometry from his head into LPLC2, LC4, LPLC1 and LC10a;
  each footfall touches SNta. **Out:** `WIZ` in `src/wiz.ts` reads **descending neurons**: DNg100 walk,
  MDN back, DNa02 left minus right steers, DNp01 crouches, jumps and throws the arms up. The leg cycle is
  a fixed rhythm whose speed those DNs set. The flies see him as a large looming shape.
* **What he does, honestly.** He turns toward and away from what he sees (DNa02 differences of a few Hz)
  and jumps when the swatter comes down in front of him (DNp01 24-28 Hz). **He does not walk:** no stimulus
  we have tried (looming, targets, odours, wind, taste, touch) drives DNg100 or MDN (`wiz/probe.json`).

### Why he is read off descending neurons, not motor neurons

`wiz/probe.py` drove every stimulus above and DNg100, DNa02, DNp01 and MDN directly at ~25 Hz, and
recorded the 708 VNC motor neurons by side and leg segment. **No descending command moved any motor
group by more than 0.6 Hz**; motor neurons idle at 0.3-1.4 Hz. Only tarsal touch, which enters the VNC
directly, raised leg extensors (+2-3 Hz). It is the depth problem described above: with inputs
normalised to sum to 1, a DN -> premotor -> motor neuron chain fades out.

`wiz/vnc.py` tried to fix it on the VNC alone, with pass criteria written before the first run (motor
groups rest <= 5 Hz; each command raises some motor group >= 3 Hz, t >= 4; the forward, escape and
backward responses differ; left and right steering give opposite motor asymmetries). It swept extra tonic
(0-0.035) and synaptic gain onto VNC neurons (x1-x8): **0 of 20 settings passed.** Every setting failed
COMMAND; any gain that let commands through (x4, x8) pushed resting motor neurons to 29-36 Hz. A uniform
VNC knob does not make this model relay commands; `wiz/vnc.json` has every row.

`wiz/vnc2.py` amplified only the relay itself: synapses from descending neurons onto the VNC (x1-x64)
and from VNC interneurons onto motor neurons (x1-x16), same criteria. **0 of 12 passed.** Commands do get
through once amplified (DNg100 raises a motor group by up to 16 Hz at x16-x64), but resting motor
neurons pass 5 Hz first (up to 38 Hz), and DNp01, MDN and steering stay weak or unlateralised.
`wiz/vnc2.json` has every row.

### Why he does not walk

`wiz/dnscreen.py` drove each of Wiz's inputs (looming, threat, small moving objects and targets on each
side, tarsal touch) at 0.5 V and recorded all 1,316 descending neurons. Criterion fixed beforehand: a
forward (DNg100, DNp09; oDN1 is not in the data) or backward (MDN) walking type up >= 3 Hz, t >= 4.
**No walking command responded.** What does respond: looming -> DNp04, DNg40, DNp01, DNp71; threat ->
DNp02, DNp04, DNp01, DNp11; small objects -> DNp03, DNae004, DNa05, DNa07; targets -> DNg111, DNae002
(3-5 Hz); touch -> DNge104, DNge122 (~24 Hz). A second run added senses Wiz does not have: food odour,
vinegar, geosmin and CO2 drive no descending neuron at all, cVA two weakly (DNp62, DNpe002), wind 28
groups (DNp73, DNge111, DNg05/08), taste 44 (DNg67 ~23 Hz) and head bristles 87 (DNg83 24 Hz). **Still no
walking command**, so giving him a nose or wind sense would not make him walk either.
`wiz/dnscreen.json` has the full lists.

`wiz/vnc3.py` changed the model instead of a gain: smaller time steps, dt 5 ms and 2 ms with a 4 ms
refractory period (20 ms as control), same criteria, DNs driven to 25-36 Hz. **All three failed
COMMAND:** no motor group rose by more than 1 Hz at any step size. The relay is not a time-step artefact.
`wiz/vnc3.json` has the rows.

## Files

| File | What it does |
|---|---|
| `src/connectome.ts` | the real connectome: parse the `flybrain export --web` files, the LIF step |
| `src/connectome.worker.ts` | runs Wiz's brain in real time off the main thread |
| `src/wiz.ts` | Wiz: eyes and soles in, descending-neuron decoder (`WIZ`) out, body and leg cycle |
| `src/wizview.ts` | loads `wiz.glb` and poses his bones |
| `src/puppeteer.ts` | the fly overhead with the control bar; strings glow with their neurons |
| `src/wiring.ts` | populations, connection blocks, `flybrain/build.py` normalisation |
| `src/brain.ts` | the LIF step, per-fly synapse strengths, the Hebbian and reward-gated learning rules, brain change |
| `src/genome.ts` | genes: connection blocks, resting drive, receptor gains, learning rates, lifespan, flight, clutch; founders and children |
| `src/social.ts` | who is near whom, bumps, startles, relationship labels, groups, the aggregation ratio |
| `src/datalog.ts` | the recorded tables and CSV |
| `src/datapanel.ts` | the Data & findings card: charts, learning switches, CSV buttons |
| `src/report.ts` | the printable report, and the parent–child regression |
| `src/eyes.ts` | panorama, feature detectors, the `flybrain/eyes.py` encoder |
| `src/senses.ts` | the puff field, receptor tuning and adaptation, JO, legs |
| `src/sim.ts` | world, ecology, fixed-timestep loop, motor decoder, physics, genomes and lineage, egg and larva deaths, rewards, sampling |
| `src/scene.ts` | low-poly Three.js: instanced flies, props, swatter, wind motes |
| `src/brainview.ts` | live neuron view and spike raster, grouped by modality |
| `src/main.ts` | overlay, labels, leaderboard, cameras, loop |
| `server/` | `run.ts` (the always-on world), `sink.ts` (Supabase or local files), `Dockerfile`, `fly.toml`, `deploy.sh` |
| `tools/` | `memory.ts` (the odour code, conditioning, learning from another fly's fright), `lifedata.ts` (does rewiring help, do children take after parents, do flies gather), `ablate.ts` (the table), `lifeab.ts` (predation, courtship, egg substrate), `surge.ts` (cast-and-surge), `choice.ts` (geosmin two-choice), `assay.ts`, `flight.ts`, `probe.ts`, `tune.ts`, `sweep.ts`, `smell.ts`, `range.ts`, `motor.ts` — run with `node --experimental-strip-types tools/<file>.ts` |

MIT, like the rest of the repository.
