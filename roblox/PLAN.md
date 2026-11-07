# Fly Lab — Roblox learning game (plan)

Status: started 2026-11-07. **Steps 1-5 BUILT 11-07**: prototype, genes, life cycle,
auto-farm, all 6 lessons with the AI trainer, and the shop (3 passes, 2 products; ids not
created yet). Not built: "auto-farm while offline" (Lab Pro): it needs a personal farm saved per
player, and the farm is shared per server for now. Still to do: teacher mode, the soft launch,
and playing it in Studio. Earlier note: **Steps 1-2 BUILT 11-07** (prototype + genes/breeding/stats board,
with a basic auto-farm and birds from step 3). Blurry eyes replaced "sharp NOSE": smell isn't in the
circuit, and stronger eyes didn't help (walking speed limits the race). Weaker eyes do hurt.
**Prototype (build order step 1) BUILT 11-07.** The brain
passes against the full connectome, and 30 flies cost 6-15% of one server core, so the budget
is a go. It hasn't been played in Studio yet. Details and numbers: [README.md](README.md).
Prototype circuit: 879 neurons, 37,831 synapses (escape, steering, grooming, back up). Smell
and taste were left out because, in the full brain, taste neurons alone don't move the
output neurons the game reads.

Kids raise, study and breed flies that run on a small piece of the real fly
connectome. They learn three topics by playing: **biology**, **connectomes**
and **AI**. The fly farm and fake genes teach **evolution and genetics**.

## 0. Hard rules

- **No crypto in or near the game.** No $FLYAI, wallets, NFTs, Trader Flies,
  links to fly.ai trading pages, or betting/roulette/slots/race. Roblox rules
  ban this, and the players are kids.
- **Nothing random for Robux.** No paid random eggs. Paid random items need
  exact odds shown and are blocked for under-18s in the UK and Brazil. Every
  paid item is a fixed, known thing.
- **The lessons are free.** Robux buys speed, space and looks, never knowledge.
- **Money:** Robux → DevEx (≈ $0.0038 per earned Robux, minimum 30,000 to cash
  out) → studio USD. Spending USD on buybacks is a treasury decision made
  outside the game. Never say "Roblox / kids' Robux buys $FLYAI" anywhere
  public. At most a general "studio revenue funds buybacks" line.
- **Chat with flies** (if added later) goes through Roblox's text filter.
  We collect no player data ourselves.

## 1. The brain inside Roblox

Our `flybrain` is a leaky integrate-and-fire (LIF) model of the full MaleCNS
connectome (~140k neurons), which is too heavy for Roblox. The game uses a
**cut-down circuit** exported from it:

| Circuit | Real pathway (already used in flybrain) | Behaviour in game |
|---|---|---|
| Escape | LC4 / LPLC2 → DNp01 (giant fibre) | shadow or swatter → jump / fly off |
| Steering | LC10a → DNa02 | turn toward targets |
| Smell / taste | olfactory + gustatory inputs → descending neurons | walk to food, stop and eat |
| Grooming | mechanosensory → grooming DNs | dust → clean |

- **Export step** (Python, in this repo): pick these neuron groups, keep the
  real weights between them, and write `circuit.json` (neurons, types, sparse
  synapses, LIF constants). Target **300–800 neurons, ≤ 20k synapses**.
- **Luau runtime:** the same LIF update as `flybrain/brain.py`
  (`v ← decay·v + gain·W·spikes + tonic + noise`, spike at 1, reset to 0), on
  a sparse list. Brain ticks at ~10 Hz; animation runs at frame rate.
  Server-side, using Parallel Luau actors across flies.
- **Budget guess, to verify in the prototype:** 30 flies × 20k synapses ×
  10 Hz ≈ 6M additions/s per server. Fallback: tick far-away flies slower.
- **Optional "Big Brain" mode later:** HttpService calls to a fly.ai server
  running the full brain, for showcase moments only. Roblox allows ~500
  outside calls per minute per server, so this needs batching and is never
  the default.
- **Open item:** check the MaleCNS / FlyWire data licence (attribution,
  commercial use) before shipping. Credit it in-game either way. That
  credit doubles as a lesson.

## 2. Genes (the fly farm core)

Every fly carries a **genome**: a short list of genes, each with two
**alleles** (one from each parent), dominant or recessive.

**Brain genes (real effect)** scale a part of the circuit:
- `NOSE`: gain on smell inputs → finds food faster
- `JUMP`: escape-pathway gain → survives swatters, but gets spooked by
  everything
- `STEER`: steering strength → tighter turns
- `CALM`: tonic drive → less wandering, also slower to react

These come with trade-offs, so no single "best" fly exists, and the best
one depends on the farm.

**Body genes (look + small effect):** colour, wing size (speed vs energy),
eye colour (cosmetic, and the classic white-eye gene from real fly genetics).

**Fake / marker genes (the experiment):** players can **implant made-up
genes** into a fly: "glow", "stripes", "Gene X". They do nothing at first.
Then kids watch what happens over generations:
- **Neutral gene** → its share drifts randomly (genetic drift).
- **Gene linked to a useful one** → spreads by riding along (hitchhiking).
- **Gene the player gives an effect** (e.g. "glow attracts mates", "glow
  attracts predators") → spreads or dies out (natural vs sexual selection).

**Farm stats board:** a live chart of how common each gene is in your farm,
generation by generation. This is the main "aha" screen: you planted a fake
gene and watched evolution decide its fate.

**Breeding rules:**
- Each parent passes one random allele per gene (Mendel). The randomness is
  free biology, never something you pay for.
- Small mutation chance, shown as a "mutation!" moment.
- Fly life cycle egg → larva → pupa → adult, timed so a generation takes
  minutes, not days.
- **Auto-farm mode:** the farm breeds itself. Flies that eat and survive more
  breed more, so kids can watch selection run across 20+ generations.

## 3. Lessons (levels)

1. **Meet your fly (biology):** body parts, senses → actions, life cycle.
2. **Inside the brain (connectomes):** zoom from fly to brain to neuron to
   synapse. Neurons light up live. Real story of mapping the fly brain.
3. **Experiments:** switch off a neuron group and see what breaks (no smell
   → can't find food). This is how real scientists learn what neurons do.
4. **Genes and breeding (genetics):** dominant/recessive, Punnett squares
   shown on real breeding results.
5. **Fly farm (evolution):** fake genes, drift, selection, the stats board.
6. **Real brain vs AI (AI):** a small artificial neural net next to the fly
   circuit. A train-a-fly minigame where kids change connection strengths
   to change behaviour. Evolution builds brains; training builds AI.

Each level ends with a short challenge (e.g. "breed a fly that finds food in
under 10 s") and a badge. Optional teacher mode: a class code and a shared
farm, with no accounts outside Roblox.

## 4. What's sold (Robux, all fixed items)

- Farm space: more pens and breeding slots
- Speed: faster hatching / generation timer
- Lab kits: extra experiment tools (more neuron groups to switch off,
  gene-implant slots)
- Cosmetics: pen themes, fly skins, lab coats
- Game pass: "Lab Pro" (2× farm size, auto-farm while offline)

## 5. Build order

1. **Prototype (go / no-go):** export one circuit (escape + smell), Luau
   runtime, one fly in one room with food + a swatter + the lit-up brain
   panel. Check: does it feel alive? Does the server budget hold with 30
   flies?
2. **Genes + breeding** on 2 brain genes + 1 fake gene; the stats board.
3. **Farm + auto-farm**, life cycle, mutations.
4. **Lessons 1–3**, then 4–6.
5. **Shop** (fixed items), then soft launch.

## 6. Open questions

- Who builds the Roblox side: us in Luau via Rojo (files live in this repo
  under `roblox/`), or a hired Roblox dev?
- Name (working title "Fly Lab").
- Connectome data licence (section 1).
- Do we publish under a separate Roblox group (recommended, keeps it clear of
  fly.ai's crypto brand) or a fly.ai one?
