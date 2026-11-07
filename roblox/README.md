# Fly Lab: Roblox prototype

One room, one fly. The fly runs on **879 real neurons and 37,831 real synapses** cut
from the MaleCNS fruit-fly connectome (the same data as `flybrain`). Plan: [PLAN.md](PLAN.md).

## Open it

Needs [Rojo](https://rojo.space) 7 and Roblox Studio.

```bash
rojo build -o FlyLab.rbxlx
```

Open `FlyLab.rbxlx` in Studio and press Play. To edit live, run `rojo serve` instead
and connect from the Rojo Studio plugin.

## What to try

- **Click the fruit basket.** The fly turns toward the fruit, walks to it and eats it.
- **Run at the fly.** It jumps away.
- **Swing the swatter** (in your backpack) near it. It escapes before the hit lands.
- **Tickle it** (walk up and press the prompt). It grooms its eyes.
- **Follow the lesson card** at the bottom. It walks you through everything below.
- **Open 🧠 Brain.** All 879 neurons light up when they fire, at their real positions.
- **Experiments.** Switch off the giant fibre and swat again: now you hit it.
  Switch off the object eyes: it ignores fruit. Switch off grooming: tickling does nothing.

## The fly farm (genes)

The pen starts with 6 flies and holds up to 8. Open **🧬 Genes** to use it.

- Every fly has **two copies of every gene**, one from each parent. A baby gets one copy from
  each parent, picked at random, with a small chance of a mutation.
- **Breed:** tap **+** on two flies, then **Breed**. An egg hatches 6 s later. When the pen is
  full, the oldest fly flies out the window.
- **Watch:** tap a row to put that fly on the brain panel. The experiment switches follow it.
- **Auto-farm:** fruit drops by itself, birds dive at flies, and every 25 s two parents are
  picked. Flies that ate more lately are more likely to be picked. A fly a bird catches drops
  its food and hides, so it can't breed for the next 2 births.
- **Made-up genes:** implant Glow, Stripes, Sparkle or Gene X into the watched fly. Then set
  what each does: no effect, helps breeding, or hurts breeding.
- **Stats board:** how common each gene variant is in the pen, birth by birth.

| Gene | Variant | What it does |
|---|---|---|
| Eyes | `b` blurry | input to the small-object eye neurons x0.65 per copy. The circuit then steers less toward fruit |
| Jump | `j` slow jumper | input to the looming eye neurons x0.62 per copy. One copy still escapes; two don't |
| Body | `g` gold | gold body, only with two copies (recessive) |
| Eye colour | `w` white | white eyes, only with two copies (like the real fly *white* gene) |
| Glow / Stripes / Sparkle / Gene X (+ Rainbow / Spots with the Gene Kit) | implanted | shows with one copy. Does nothing unless you give it an effect |

The brain genes only change how strongly a sense drives the real circuit. What follows from
that comes from the brain. Nobody wrote "jj can't escape" anywhere: the giant fibre still fires
down to about 0.4x input and then stops.

## Lessons

A lesson card at the bottom of the screen says what to do next. The game spots when it's done,
then shows a "Did you know?" fact. Every lesson ends with a badge. All lessons are free, and
each one unlocks after the one before. **📚 Lessons** lists them and lets you replay any you've
finished. Progress is saved in a DataStore; when that isn't available (Studio without API
access) saving is skipped quietly.

| # | Lesson | Topic | What kids do | Badge |
|---|---|---|---|---|
| 1 | Meet your fly | Biology | drop fruit, watch it eat, tickle it, make it jump | 🪰 Fly Friend |
| 2 | Inside the brain | Connectomes | open the brain panel, watch steering and the giant fibre fire, quiz | 🧠 Brain Explorer |
| 3 | Experiments | Connectomes | switch off the giant fibre and swat, switch off object eyes, quiz | 🔬 Young Scientist |
| 4 | Genes and babies | Genetics | open genes, breed, watch egg → larva → pupa → fly, Mendel quiz | 🧬 Gene Detective |
| 5 | The fly farm | Evolution | implant a made-up gene, give it an effect, auto-farm, 5 births, drift quiz | 🌱 Evolution Boss |
| 6 | Real brain vs AI | AI | wire a tiny AI by hand, scramble it and watch it learn, quiz | 🤖 AI Trainer |

**🤖 AI trainer:** a tiny artificial brain with 2 eye neurons, 2 turn neurons and 4 connections
(each from -2 to +2). Kids set the connections and press Test to see whether the AI fly reaches 3
fruits. Learn uses trial and error: nudge one connection, keep the change if the score isn't
worse. The lesson then compares this with the real fly, whose left eye cells drive the left
steering neuron, and whose wiring came from evolution.

Babies now go through the life cycle (egg → wiggling larva → pupa → fly) over the 6 s hatch time.

## Shop

**🛒 Shop** sells fixed Robux items only. Nothing is random, the lessons are always free, and
there's no crypto anywhere. Purchases go through Roblox's own buy prompt.

| Item | Kind | Suggested price | What it does |
|---|---|---|---|
| 🏆 Lab Pro | Game Pass | R$ 199 | +4 pen space for the whole server while the owner is in it, plus a Pro tag |
| 🧪 Gene Kit | Game Pass | R$ 99 | two more made-up genes to implant: Rainbow and Spots. Anyone's flies can carry and pass them on |
| 🥼 Lab Coat | Game Pass | R$ 49 | a lab coat on your avatar, plus a Scientist tag |
| 🐣 Hatch Now | Developer Product | R$ 15 | every egg in the pen hatches right away |
| 🍯 Golden Fruit | Developer Product | R$ 25 | 3 golden fruits drop in; each counts as 3 fruits for breeding |

**To put items on sale:**
1. Create each Game Pass and Developer Product on the Roblox Creator Hub, and set its price there.
2. Paste its id into `src/shared/ShopItems.luau`.

Until an item has an id, it shows "Soon" in a live game. In Studio it shows **Try free (Studio)**,
so everything can be tested first. The shop shows the real price from Roblox once that loads.
Developer Product receipts are recorded in a DataStore, so a receipt Roblox sends again is never
granted twice.

## What's the brain and what isn't

| The brain decides (connectome) | Body rules (written by hand) |
|---|---|
| Turn toward fruit: LC10a → DNa02, left/right | Walks at a steady pace |
| Escape a looming hand or swatter: LC4/LPLC2 → DNp01 | Turns back at walls |
| Groom when its eyes are touched: BM_InOm → DNg12 | Eats fruit it reaches |
| Back up: MDN | How a take-off flight and being swatted look |

The senses feed real sense neurons: fruit excites the small-object detectors on its side,
anything rushing at it excites the looming detectors, and a tickle excites the eye bristles.
The behaviour is read from the real output neurons.

## Files

- `tools/export_circuit.py`: cuts the circuit from the full brain and writes
  `src/shared/Circuit.json`. `--check` compares the cut against the full brain.
- `src/shared/FlyBrain.luau`: the brain runtime, the same equations as `flybrain/brain.py`.
- `src/shared/Config.luau`: all tuning. Set `FLIES` and `MAX_FLIES` to 30 for the load test.
- `src/shared/Genetics.luau`: genes, crosses, mutations, phenotypes. Pure Luau.
- `src/server/`: room, fly body, senses → brain → movement, swatter, experiments.
- `src/server/Farm.luau`: the pen, eggs, breeding, auto-farm, birds, gene history.
- `src/client/BrainPanel.client.luau`: the brain panel.
- `src/client/GenesPanel.client.luau`: the genes panel and stats board.
- `src/shared/LessonData.luau`: the 6 lessons' text, goals, quizzes and facts.
- `src/server/Lessons.luau` + `Events.luau`: lesson progress, goal checks and saving.
- `src/client/LessonCard.client.luau`: the lesson card and lesson list.
- `src/shared/AiFly.luau` + `src/client/AiTrainer.client.luau`: the AI trainer.
- `src/shared/ShopItems.luau` (item list, ids, prices), `src/server/Shop.luau`, `src/client/ShopPanel.client.luau`: the shop.

## How it was checked (2026-11-07)

The Luau brain was run headless with the official Luau CLI, with no Roblox APIs involved.
It was compared with the full 166,700-neuron brain, counting extra spikes in 1 s of stimulation:

| Sense | Output | Full brain | Luau circuit |
|---|---|---|---|
| Loom left | escape (DNp01) | 46.7 | 48.7 |
| Loom right | escape | 44.0 | 48.3 |
| Object left | steer left (DNa02) | 4.3 | 4.2 |
| Object right | steer right | 3.3 | 2.2 |
| Touch | groom (DNg12) | 229 | 159 |

All other outputs stayed near zero in both, as they should. Behaviour checks, using the game's
own steering rules:
- **Swat:** escape fires 20/20 times, 0.12 s after the swing. The hit lands at 0.28 s.
- **Tickle:** grooming starts 20/20 times, after 0.16 s.
- **Fruit:** the fly reaches fruit 20 studs away 20/20 times, from any start angle, in about 5 s.
- **False alarms:** none in 30 s of walking.

**Server budget:** 30 flies at 50 brain steps per second took 6% of one CPU core with native
code generation (`--!native` is on) and 15% without it.

**Genes (checked 2026-11-07, Luau CLI, real brain):**
- **Mendel:** a cross of two carriers gives babies 25.0% / 49.7% / 25.3% with 0 / 1 / 2 copies.
  Gold (recessive) shows in 25.6%. Mutations come to 0.119 per baby, against 0.120 expected.
- **Bird escapes:** flies with 0, 1 and 2 slow-jumper copies escape 60/60, 60/60 and 2/60 times.
- **Reaching fruit** in the room, with 0, 1 and 2 blurry-eye copies: 17.1 s, 18.7 s, 28.0 s.
- **Farm runs:** 8 flies, 60 births, mean of 24 runs, using the auto-farm rules. Shares of each variant:

| Setting | Blurry eyes | Slow jumper | Glow (implanted) | Gene X (no effect) |
|---|---|---|---|---|
| Nothing set | 25% → 22% | 45% → 34% | 25% → 24% | 25% → 48% |
| Glow "helps" | 25% → 10% | 45% → 27% | 25% → 42% | 25% → 26% |
| Glow "hurts" | 25% → 7% | 45% → 21% | 25% → 2% | 25% → 36% |

Harmful brain genes get bred out, and Glow follows the effect it's given. Genes with no effect
drift up or down by chance, which is real genetic drift in a small pen and a lesson in itself.
In one in three settings blurry eyes only fell a little, because chance is strong with 8 flies.

**Lessons (checked 2026-11-07, Luau CLI with stand-ins for Roblox players, networking and DataStore):**
- A full run through all 6 lessons earns 6 badges and ends on the "all done" screen.
- Events that come out of order are ignored. A client can't send game events (only "panel opened"
  and AI trainer results). Wrong quiz answers are flagged. Locked lessons are refused, and
  finished ones can be replayed.
- A player's own actions (clicking fruit, swatting, breeding) count only for that player. Things
  that happen in the shared room (a fly eats, escapes, hatches) count for everyone.
- Progress is saved when a player leaves and restored when they come back. Bad saved data is cleaned.
- **AI trainer:** wiring by hand (LL = RR = +2) reaches all 3 fruits. Crossed wiring fails.
  Learning from scrambled connections solves it 196 times out of 200 within 300 tries, about
  54 tries on average. If it doesn't, the "press Learn again" message keeps it going.

**Shop (checked 2026-11-07, Luau CLI with stand-ins for Roblox's marketplace, players and DataStore):**
- Owned passes load when a player joins, and Lab Pro grows the pen. When the owner leaves, the pen
  goes back to normal.
- Real prices load from Roblox.
- Buying opens Roblox's pass or product prompt. A cancelled purchase grants nothing.
- An item with no id is "not on sale" in a live game and free only in Studio. An item with a real
  id is never free, even in Studio.
- Receipts: a resent receipt isn't granted twice. A grant that fails isn't recorded, so Roblox
  retries it, and the retry is granted once. Unknown products and players who have left are
  left for Roblox to retry later.

**Not yet checked:** the Roblox side itself (room, parts, swatter, all panels and the lesson card,
remotes, eggs, birds, DataStore, the shop and real Roblox purchases). It passes the Luau syntax and type checks, but hasn't been played in Studio yet.

## Regenerate the circuit

```bash
python roblox/tools/export_circuit.py --check
```

This runs the full brain on CPU in about 2 minutes and needs the flybrain data in `$FLY_DATA`.

Connectome: MaleCNS v1.0 (Janelia FlyEM). Credit it in the game. Check the licence before
publishing (PLAN.md, section 6).
