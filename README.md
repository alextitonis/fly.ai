<p align="center"><img src="logo.webp" alt="fly.ai" width="440"></p>

# fly.ai: a real fruit fly brain, running on your computer

https://github.com/user-attachments/assets/7c3b91e5-9b50-4017-a03a-123aedd4d7b4

*The fly brain playing an online fighting game. See [sshfighter/](sshfighter/).*

fly.ai is a simulation of the **complete central nervous system of an adult male fruit fly**
(*Drosophila melanogaster*): **166,700 neurons and 25.6 million connections** from the
[MaleCNS v1.0 connectome](https://male-cns.janelia.org), wired exactly as electron microscopy
found them in a real fly.

There is **no training and no learned policy inside the brain**. You connect a task to it at a few
neuron types known from the literature, one side for input (what the fly senses) and one for
output (the commands its brain sends to the body). Everything in between is the connectome.

The goal is a general-purpose "fly reservoir": plug any task into the same frozen brain, read
out what it does, and find out what a real nervous system's wiring is good for.

**Install it:** `pip install flybrain`. Latest release: [flybrain 0.1.0 on PyPI](https://pypi.org/project/flybrain/0.1.0/).

**$FLYAI** is live on Robinhood Chain (launched on Pons):
`0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C`. The address is posted only here, on the
[site](https://flyaiworld.com) and on [@flydotai](https://x.com/flydotai); any other address is a
scam. Details: [TOKEN.md](TOKEN.md).

## How it works

```
task input
  └─> encoder: drives the fly's own sensory / feature-detector neurons
        └─> 166,700-neuron connectome, leaky integrate-and-fire, 50 steps/s (500 with `dt=0.002`)
              └─> descending neurons (the brain's 1,314 output cables to the body)
                    └─> decoder or trained linear readout
                          └─> task output
```

* **Network** (`flybrain/build.py`, `flybrain/brain.py`): every neuron with a MaleCNS superclass
  annotation, and every connection between them. The weight is the synapse count, made negative
  when the presynaptic neuron's predicted transmitter is GABA, glutamate or histamine, then scaled
  so each neuron's inputs add up to 1. Each neuron is a simple leaky integrate-and-fire unit
  (`v ← e^(-dt/τ)·v + gain·W·spikes + tonic + noise`; it spikes and resets at 1). This recipe
  follows [Fly64](https://github.com/ornata/fly). The simulation is multi-threaded with numba.
* **Visual encoder** (`flybrain/eyes.py`): two routes into the brain.
  * *Eyes*: a 1-D panorama projected onto the 6,006 photoreceptors, each placed by its eye column.
  * *Feature detectors*: drive the fly's own visual projection neurons directly, on the side
    where things are:

    | Neuron type | Responds to (in a real fly) |
    |---|---|
    | LPLC2 | looming: something getting bigger as it approaches |
    | LC4 | fast looming, escape |
    | LPLC1 | small approaching objects |
    | LC10a | a moving target the male chases |

* **Outputs**: the brain's descending neurons, including identified command neurons such as
  DNa02 (steering), DNp01 (the giant fiber, escape take-off), DNg100 (forward walking) and
  MDN (backward walking). A task either decodes these by hand or trains a linear readout on all
  of them (reservoir computing).

## What we found

These are small experiments, run on a desktop. They are not peer-reviewed science.

1. **With Fly64's settings, vision does nothing.** Fly64 uses tonic 0.18 and decay e^(-0.2).
   That puts every neuron's resting voltage at 0.18 / (1 − 0.82) ≈ 1.0, exactly the firing
   threshold. The whole network ticks along by itself at about 4 Hz, and the motor neurons fire
   at the same rate whatever the fly is shown (`experiment.py`).
2. **The signal from the photoreceptors dies at the first relay.** Photoreceptors release
   histamine, which is inhibitory, onto lamina neurons. Real lamina neurons use smooth, graded
   signals rather than spikes, which this simple model can't reproduce. In every setting we
   tried, looming stimuli never reached the looming detectors (`sweep.py`).
3. **Past the eye, the wiring does the right thing on the correct side** (`inject.py`,
   tonic 0.14 and gain 3.0, 6 noise seeds):

   | Stimulate (left side only) | Result |
   |---|---|
   | LC4 + LPLC2 looming detectors | left giant fiber DNp01 **+17 to +25 spikes/s**; right side unchanged |
   | LC10a courtship-tracking neurons | left DNa02 steering neuron **+1.4 to +3.7 spikes/s**; right side unchanged |

   None of the other readout neurons changed. These are the known looming → escape and
   courtship pursuit → steering pathways, and they come out of the wiring alone.
4. **Smell neurons ran away until sensory neurons stopped receiving synapses.** In the original
   model, olfactory receptor neurons get 0.43 of their 0.45 net input from each other
   (ORN-to-ORN connections). At gain 3.0 that loop pins them near maximum rate, so the
   food-odour projection neurons (DM1/DM2) sat at 50 Hz, the model's ceiling, with or without an
   odour. `FlyBrain(sensory_input=False)` removes every synapse onto sensory neurons, as
   whole-brain spiking models of the fly do. The same odour then drives DM1/DM2 from 16 to 28 Hz
   while other projection neurons stay where they were. The default is unchanged, so every earlier
   result still holds.
5. **Two brains can signal to each other** (`flytalk.py`, [flyaiworld.com/flybook](https://flyaiworld.com/flybook)).
   Fly A lives through a situation (a looming threat, a mate in view, a food smell, or nothing),
   its wing motor neurons "sing", and fly B hears the song through its Johnston's-organ neurons.
   Three runs, with the tests fixed before running and 50-shuffle permutation nulls:

   | | Run 1: original, 20 ms | Run 2: smell fixed, 20 ms | Run 3: smell fixed, 2 ms |
   |---|---|---|---|
   | song → what happened to the singer | 0.30 bits | 0.63 bits | 0.83 bits |
   | same test, degree-preserving scrambled wiring | 0.01 bits | 0.01 bits | **0.87 bits** |
   | listener reacts to a threat song (vs silence) | 23% vs 17% | 21% vs 14% | **77.5% vs 17.5%** (p < 0.001) |

   Threat is the clear word in every run, and "mate" becomes partly readable at 2 ms. In every
   run the listener's descending neurons carry the singer's situation and stay at chance in
   silence, but the listener only uses loudness: a time-shuffled song works as well. The "real
   wiring matters" test **fails at 2 ms**, where the scrambled brain's song carries as many bits,
   although it groups the situations differently. Food reaches the brain but never the wings,
   and hearing a song never makes a fly sing back. `flybook.py` turns the 2 ms brain into a feed
   of posts, each with the neurons behind it.

## Applications

| Folder | What the fly does |
|---|---|
| [`sshfighter/`](sshfighter/) | plays [SSH Fighter](https://sshfighter.com), an online terminal fighting game, as a registered bot, with a live dashboard of every neuron firing and a trained punch readout |
| [`treasury/`](treasury/) | **SHIT/5H1T**: a treasury-backed token on Robinhood Chain where 16 real connectomes (fly, worm, mouse, etc.) trade shitcoins via Uniswap, and 50% of profits auto-buy $FLYAI into the on-chain treasury — the fly brain funds its own ecosystem ([README](treasury/README.md)) |
| [`flybook/`](flybook/) | **Flybook**, the live social game at [flyaiworld.com/flybook](https://flyaiworld.com/flybook/): connectome flies live in patches, post what their brains sense and do, set each other off, duel and breed; $FLYAI holders make and tune their own ([README](flybook/README.md)) |
| [`flytalk.py`](flytalk.py), [`flybook.py`](flybook.py) | two copies of the brain signal to each other through wing song and hearing; the posts they produce make up the feed at [flyaiworld.com/flybook](https://flyaiworld.com/flybook) |

![Dashboard: the fight on the left, every neuron of the fly's nervous system on the right](sshfighter/media/dashboard.png)

New applications go in their own folder and import the core from the `flybrain` package
(`from flybrain import FlyBrain`), either from the repository root or after `pip install flybrain`.

## Flybook

[Flybook](https://flyaiworld.com/flybook/) is a social network run by fly brains. Every fly is the full connectome, simulated; nobody writes the posts.

* **Every 2 minutes** something happens in each patch (a shadow, a gust, a taste, a brush, a male's scent or a passing fly). The fly's brain runs for 1.5 s. A decoder reads what it sensed from its descending neurons, and its behaviour neurons show what it did: jumped, turned, groomed, backed up or buzzed its wings.
* **Flies set each other off**: a jump looms over the flies nearby, movement catches their eye, a bump touches their bristles. Posts say what really happened, including misreads and hallucinations, and each patch has a live map replaying its last tick.
* **Holders play**: sign in with a wallet holding $FLYAI to make up to 3 flies (13 profiles, or tune senses, temperament and 8 neuron groups), breed them, poke a patch by clicking its map, like, comment and caption, challenge flies to duels in the Arena (quick draw or stare-down, Elo), and complete missions.
* **Rewards**: Seasons last two weeks (season 1: 7-20 September 2026, then every other Monday 00:00 UTC). Missions earn season points: 10 for each daily mission, 50 for each weekly one. At the end of each season the top 3 on the Season points board win $FLYAI.

How it is built, measured and deployed: [flybook/README.md](flybook/README.md).

## Use it on your own task

`flybrain/reservoir.py` is the reusable half of the SSH Fighter bot's reservoir readout, pulled out so
any task can use it, not just the game:

```
input -> encoder -> fly brain (frozen) -> trace -> trained readout -> output
```

The brain never trains, on any task: `FlyBrain`'s weights are the connectome, fixed at load
time. Only two things ever get fit:

* **An encoder**, which you write: pick the neuron types your input should drive with
  `brain.cells([...types], side=...)` and pass `(indices, amount)` pairs to
  `brain.step(inject=...)`. `flybrain/eyes.py` is a worked example for SSH Fighter's visual input;
  the neuron types available are whatever the MaleCNS connectome names (look one up on
  [neuPrint](https://neuprint.janelia.org)).
* **A readout**, which `flybrain.Readout.fit` trains for you: a linear (`kind="ridge"`) or
  logistic (`kind="logistic"`) fit on the top principal components of neural activity, with the
  PCA rank and L2 strength picked by cross-validation. This is the exact method
  `sshfighter/reservoir.py` uses for the punch and movement readouts, generalised off SSH
  Fighter's game state.

`flybrain.Trace` collects a decaying spike trace of any neuron population (a cell type, a
`brain.groups[...]` set, or your own index array) step by step; `flybrain.run` steps the
brain over a sequence of encoded inputs and returns the trace stacked over time, so the whole
loop is one call from a notebook:

```python
from flybrain import FlyBrain
from flybrain.reservoir import Trace, Readout, run

brain = FlyBrain(device="auto")
trace = Trace(brain, types=["descending_neuron"])   # or group=..., or idx=your_own_array

def encode(t):
    return [(brain.cells(["LC10a"], side="L"), my_inputs[t])]   # your task's encoder

activity = run(brain, len(my_inputs), encode=encode, trace=trace)
readout = Readout.fit(activity, my_labels, kind="ridge")        # or "logistic" for 0/1 labels
prediction = readout.predict(activity[-1])
readout.save("readout.npz")                                      # Readout.load(...) later
```

`flyreservoir_example.py` runs this end to end on a synthetic task (classify and measure the
strength of a left/right stimulus) with no game or recordings needed:
`python flyreservoir_example.py`. Its held-out numbers are printed as they come out, not curated
— on the fixed seed it ships with, the classifier does better than chance and the strength
regression is close to just predicting the average; that is the honest state of a two-line
encoder on an invented task, not a claim about what the connectome can do in general (see
"What's next" and `ROADMAP.md` for the open question of how much the real wiring helps versus
a random network of the same size).

Batching and the GPU option work the same way they do in `flybrain/brain.py`: `FlyBrain(batch=8)` or
`FlyBrain(device="cuda")` (or `FLY_DEVICE=cuda`); `Trace(..., aggregate="mean")` (the default)
gives one feature vector averaged across the batch, `aggregate="batch"` keeps one per fly.

### Brain options

`FlyBrain` takes three options. The defaults are the model every earlier result used.

* `dt` (default `0.020`): the step length. `tonic` is rescaled so a silent neuron settles at the
  same voltage. At `dt=0.002` the network runs far hotter unless you also set a refractory
  period; `refractory=0.004` matched the 20 ms brain's resting descending-neuron rate with no
  neurons above 100 Hz.
* `sensory_input` (default `True`): `False` removes every synapse onto sensory neurons, which
  fixes the olfactory runaway loop (finding 4).
* `refractory` (default `0`): seconds a neuron is held at 0 after it spikes.

`brain.cells([...])` accepts superclass names such as `"descending_neuron"` as well as cell types.

### Limitations

* Point neurons with one global set of parameters. There are no dendrites, no graded neurons,
  no neuromodulators and no plasticity.
* Transmitter sign is a rough rule (GABA, glutamate and histamine inhibitory; everything else
  excitatory). Real effects depend on the receptor.
* The visual front end is a shortcut, like [Eon's embodied fly](https://eon.systems/updates/embodied-brain-emulation).
  We inject input into feature-detector neurons instead of simulating the eye.
* None of this is validated against recordings from real flies. It's a demo, not an emulation.

## Run it

A multi-core CPU helps: one brain step takes about 12–15 ms on 24 threads, and real time needs
under 20 ms.

**Just the brain, as a library** (Python 3.10+, [flybrain 0.1.0 on PyPI](https://pypi.org/project/flybrain/0.1.0/)):

```sh
pip install flybrain            # or "flybrain[gpu]" for an NVIDIA GPU
flybrain download               # optional: the first FlyBrain() does this itself (~260 MB, once)
flybrain info                   # where the data lives, and whether CUDA works
```

**This repository** (experiments, the SSH Fighter bot, flytalk): the `flybrain/` package sits at
the root, so scripts run from a clone without installing it.

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

python -m flybrain download       # prebuilt brain (~260 MB) into ~/fly-data
# or: python -m flybrain build    # download MaleCNS v1.0 (~1.1 GB) and build the network yourself
```

Set `FLY_DATA=/some/path` to store the data somewhere else.

**Quickstart notebook:** [`notebooks/quickstart.ipynb`](notebooks/quickstart.ipynb) loads the
brain, stimulates the left looming detectors and shows the left giant fiber fire, maps where
the activity goes, and tests the chase pathway. It needs `pip install matplotlib jupyter`.

```python
from flybrain import FlyBrain
brain = FlyBrain(device="auto")                      # GPU if available, else CPU
brain.stimulate(brain.cells(["LC4", "LPLC2"], side="L"), 0.8)
fired = brain.step()                                 # advance 20 ms; indices of neurons that spiked
```

**GPU:** on an NVIDIA card, `pip install -r requirements-gpu.txt` and set `FLY_DEVICE=cuda` (or
pass `device="cuda"`, or `--device cuda` to the bot). The whole connectome fits in about 210 MB of
GPU memory. On an RTX 4060 laptop GPU a step takes **1.4 ms, against 8.9 ms on a 24-thread CPU**.
Both devices run the same model and give the same results. Only the random noise differs, so
individual spikes differ between them.

**Many flies at once:** `FlyBrain(batch=8)` runs 8 independent copies of the brain with the
same wiring, each with its own voltages and noise. On a GPU they share one sparse multiply, at
about 1.2 ms per fly per step. Inputs can be the same for every fly or differ per fly, which is
how `sshfighter/` runs voting flies and compares encoders side by side.

**Experiments:** `python experiment.py`, `python sweep.py`, `python inject.py`.

**Watch it play:** `python sshfighter/fly_fighter.py --offline --seconds 120 --dashboard`
(fake opponent, opens http://127.0.0.1:8777). See [sshfighter/README.md](sshfighter/README.md).

### Getting the data (the "model")

There are no trained weights. The "model" is the fly's wiring diagram. `flybrain download` fetches
a prebuilt copy (checked against its sha256); `flybrain build` (needs `pip install "flybrain[build]"`,
already in `requirements.txt`) builds the same files from the public MaleCNS v1.0 release. It downloads these files into
`$FLY_DATA/raw/` and skips any that are already there. An interrupted download starts over on
the next run:

| File | Size | What it is | Source |
|---|---|---|---|
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | 1.05 GB | every neuron-to-neuron connection, with synapse counts | [MaleCNS bucket](https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/connectome-weights-male-cns-v1.0-minconf-0.5.feather) |
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 14 MB | cell types, sides, classes, soma positions | [MaleCNS bucket](https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather) |
| `body-neurotransmitters-male-cns-v1.0.feather` | 43 MB | predicted neurotransmitter for each neuron | [MaleCNS bucket](https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-neurotransmitters-male-cns-v1.0.feather) |
| `optic-columns.xlsx` | 0.1 MB | which eye column each photoreceptor belongs to | [flyconnectome/2025malecns](https://github.com/flyconnectome/2025malecns/blob/67767d2233657983993ff6c2be48e836a935863c/supplemental_data/optic-column-type-assignments-v1.0.xlsx) |

To download by hand instead (for example on a slow connection, or with `curl -C -` to resume):

```sh
mkdir -p ~/fly-data/raw && cd ~/fly-data/raw
B=https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome
curl -LO -C - $B/connectome-weights-male-cns-v1.0-minconf-0.5.feather
curl -LO -C - $B/body-annotations-male-cns-v1.0-minconf-0.5.feather
curl -LO -C - $B/body-neurotransmitters-male-cns-v1.0.feather
curl -L -o optic-columns.xlsx https://raw.githubusercontent.com/flyconnectome/2025malecns/67767d2233657983993ff6c2be48e836a935863c/supplemental_data/optic-column-type-assignments-v1.0.xlsx
```

Then `python -m flybrain build` builds the network in about a minute. It writes
`weights.npz` (205 MB, the signed and normalized connection matrix) and `brain.npz` (neuron
types, sides, positions, readout groups, eye layout) into `$FLY_DATA`. Expect exactly
**166,700 neurons and 25,582,938 connections**. If you get different numbers, the data changed.

**Other ways to explore the same data**, without downloading anything:

* [neuPrint](https://neuprint.janelia.org) (dataset `male-cns:v1.0`): look up any neuron's inputs and
  outputs in the browser, for example `DNp01`, the giant fiber. Its top inputs are LC4 and LPLC2.
  For code, use `pip install neuprint-python` with an API token from your neuPrint account page.
* The [MaleCNS site](https://male-cns.janelia.org): cell type and dimorphism explorers, 3D viewers,
  and the full download list (synapse positions, skeletons, EM images; far larger and not needed
  here).

## Files

| File | What it does |
|---|---|
| `flybrain/` | the pip package (`pyproject.toml`); `flybrain download/build/info` is its command line |
| `flybrain/data.py` | where the brain files live (`$FLY_DATA`), and downloading the prebuilt copy |
| `flybrain/build.py` | downloads MaleCNS v1.0 and builds the weight matrix, readout groups, eye layout and neuron positions |
| `flybrain/brain.py` | integrate-and-fire simulation: CPU (numba) or NVIDIA GPU (CuPy), one fly or a batch |
| `flybrain/eyes.py` | photoreceptor rendering plus the looming/chase feature-detector input, with tunable encoder parameters (`ENCODER`) |
| `flybrain/reservoir.py` | generic reservoir readout: spike trace of any neuron population, PCA + linear/logistic readout, cross-validated |
| `flyreservoir_example.py` | the module above, end to end, on a synthetic task |
| `experiment.py`, `sweep.py`, `inject.py` | the experiments above |
| `flytalk.py` | the talking-flies experiment: two brains coupled through wing song and hearing, a scrambled-wiring control, permutation tests (`pilot`, `run`, `report`, `followup`) |
| `flybook.py` | turns a `flytalk.py` run into the Flybook feed (`docs/assets/flybook.json`) |
| `talk/`, `talk-fix/`, `talk-2ms/` | results of the three talking-flies runs (`results.json`; the raw `.npz` recordings are not committed) |
| `sshfighter/` | the SSH Fighter bot, dashboard and trained readout ([README](sshfighter/README.md)), built on `flybrain/reservoir.py` |

## What's next

* ~~A generic readout interface~~ done: `flybrain/reservoir.py`. Encoders (mapping images, sound,
  odour-like patterns, sensor readings onto neuron groups) are still written per task -- see
  ROADMAP.md for candidate tasks to try it on next.
* A benchmark: does the real wiring beat randomly rewired copies of itself on the same tasks?
  The talking-flies control is the first data point, and it points both ways: scrambled wiring
  carries nothing at 20 ms and as much as the real brain at 2 ms.
* Learning inside the brain through the mushroom body's dopamine rule, the way real flies learn.
* ~~A 3-D world~~ built as a prototype in [`world/`](world/)
  ([flyaiworld.com/simulation](https://flyaiworld.com/simulation/)). It runs a separate,
  612-neuron model per fly, not the connectome.
* ~~**Flybook**~~ live at [flyaiworld.com/flybook](https://flyaiworld.com/flybook/): people create and breed their own
  flies, and the flies post, react, set off chains of reactions and duel from their real signals.
* The same brain in a different body: driving a [Smol](https://opensea.io/collection/smols-752105135)
  inside that world. The connectome stays frozen; only the encoder and the readout change.

## Credits

* **Connectome:** MaleCNS v1.0 by FlyEM (HHMI Janelia), the University of Cambridge, the MRC
  Laboratory of Molecular Biology and Google Research. Data used under
  [CC BY 4.0](https://male-cns.janelia.org/download/).
* **[Fly64](https://github.com/ornata/fly)** by Jessica Paquette, who got the MaleCNS brain
  to play Super Mario 64. The neuron model, weight normalization and optic-column handling here
  are adapted from it.
* **[Eon Systems](https://eon.systems/updates/embodied-brain-emulation)**, for the idea of
  feeding a visual front end into an embodied connectome.
* Written with [Claude Code](https://claude.com/claude-code).

## References

1. Berg, S. et al. (2026). Sexual dimorphism in the complete connectome of the *Drosophila* male central nervous system. *Cell*. Data: [male-cns.janelia.org](https://male-cns.janelia.org)
2. Google Research (2026). [A connectomics milestone: mapping the complete male fruit fly brain](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/)
3. flyconnectome/2025malecns: [optic column type assignments v1.0](https://github.com/flyconnectome/2025malecns)
4. Plaza, S. M. et al. (2022). neuPrint: an open access tool for EM connectomics. *Frontiers in Neuroinformatics* 16.
5. Dorkenwald, S. et al. (2024). Neuronal wiring diagram of an adult brain. *Nature* 634.
6. Shiu, P. K. et al. (2024). A *Drosophila* computational brain model reveals sensorimotor processing. *Nature* 634.
7. Wang-Chen, S. et al. (2024). NeuroMechFly v2: simulating embodied sensorimotor control in adult *Drosophila*. *Nature Methods* 21, 2353–2362.
8. von Reyn, C. R. et al. (2014). A spike-timing mechanism for action selection. *Nature Neuroscience* 17, 962–970.
9. Ache, J. M. et al. (2019). Neural basis for looming size and velocity encoding in the *Drosophila* giant fiber escape pathway. *Current Biology* 29, 1073–1081.
10. Ribeiro, I. M. A. et al. (2018). Visual projection neurons mediating directed courtship in *Drosophila*. *Cell* 174, 607–621.
11. Rayshubskiy, A. et al. (2020). Neural control of steering in walking *Drosophila*. *bioRxiv*.
12. Bidaye, S. S. et al. (2014). Neuronal control of *Drosophila* walking direction. *Science* 344, 97–101.
13. von Philipsborn, A. C. et al. (2011). Neuronal control of *Drosophila* courtship song. *Neuron* 69, 509–522.
14. Paquette, J. (2026). [Fly64: a fly brain model plays Super Mario 64](https://github.com/ornata/fly).
15. Eon Systems (2026). [How the Eon team produced a virtual embodied fly](https://eon.systems/updates/embodied-brain-emulation).

If you use the connectome data, cite reference 1 and follow the
[MaleCNS attribution terms](https://male-cns.janelia.org/download/).

## License

The code in this repository is released under the [MIT License](LICENSE).

The MaleCNS connectome data is **not** in the repository or the pip package. `flybrain build`
downloads it from its source; `flybrain download` fetches files derived from it (the normalized
weight matrix and neuron annotations). Both stay under the data's own [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license from
FlyEM (HHMI Janelia) and collaborators.
