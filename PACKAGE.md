# flybrain

The complete central nervous system of an adult male fruit fly, *Drosophila melanogaster*, as a
spiking network you can run on your own computer: **166,700 neurons and 25.6 million
connections** from the [MaleCNS v1.0 connectome](https://male-cns.janelia.org), wired as
electron microscopy found them.

Nothing inside the brain is trained. You drive some of the fly's own neurons, step the network
forward, and read out what its descending neurons (the brain's commands to the body) do.

```sh
pip install flybrain              # CPU (numba)
pip install "flybrain[gpu]"       # plus CuPy for an NVIDIA GPU (CUDA 12)
```

```python
from flybrain import FlyBrain

brain = FlyBrain(device="auto")          # first run downloads the brain files (~260 MB) to ~/fly-data
left_loom = brain.cells(["LC4", "LPLC2"], side="L")   # looming detectors, left eye
giant_fiber = brain.cells(["DNp01"], side="L")        # the escape command neuron

for step in range(50):                   # one second at 20 ms per step
    fired = brain.step(inject=[(left_loom, 0.8)])
    if set(giant_fiber) & set(fired):
        print(f"left giant fiber fired at {step * brain.dt:.2f} s")
```

## What's in it

* `FlyBrain`: leaky integrate-and-fire over the whole connectome. `device="cpu" | "cuda" | "auto"`,
  `batch=8` runs 8 independent flies at once, plus `dt`, `sensory_input` and `refractory` options.
  `brain.cells([...])` finds neurons by cell type or superclass (`"descending_neuron"`).
* `Trace`, `run`, `Readout`: reservoir computing. Collect a spike trace of any neuron population
  over your task, then fit a cross-validated linear or logistic PCA readout to your labels.
* `Eyes`, `FeatureDetectors`: a visual encoder that drives the fly's visual projection neurons.
* `Sleeper`, `RidgeHeads` (`flybrain.sleep`): continual learning without forgetting, for any model. `wake()` keeps
  the day's examples; `sleep()` adds new parameters on top of the old ones, rehearses a small memory that keeps every
  context (season, task) in the mix, and refuses a night that would forget. `experts=True` keeps one model per
  context. `sleep_example.py` in the repo: a connectome fly learns which smells mean food as the seasons change.

## Data

The brain files live in `$FLY_DATA` (default `~/fly-data`). The first `FlyBrain()` downloads them;
you can also run it ahead of time:

```sh
flybrain download                 # prebuilt files, sha256-checked
flybrain build                    # or build them from the MaleCNS release (~1.1 GB; pip install "flybrain[build]")
flybrain info                     # data folder and GPU status
```

The first step on CPU is slow while numba compiles (about 1.5 s); later steps take about 10–15 ms
on 24 threads. On an RTX 4060 laptop GPU a step takes about 2 ms.

## Benchmarks

`python scripts/bench_flybrain.py` (in the repository) measures your machine and prints a row for
this table. *Low* load is the brain at rest (noise only, ~11,400 spikes per step); *high* load
injects +1.5 V into a fixed random 10% of neurons every step (~35,400 spikes per step). Batch
columns are ms per step for that many flies at low load. Medians over 50 steps (fewer for big CPU
batches); load time is with the brain files already downloaded and in the OS file cache.

| hardware | device | threads | load (s) | first step (s) | ms/step low | ms/step high | batch 1 | batch 8 | batch 32 | peak memory | versions |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AMD Ryzen AI 9 HX 370, Windows 11 | cpu | 24 | 0.4 | 1.43 | 10.4 | 13.1 | 9.3 | 112 | 344 | 774 MB RAM | numpy 2.2.6, numba 0.66.0 |
| same laptop: RTX 4060 Laptop GPU | cuda | - | 1.0 | 0.21 | 1.97 | 1.91 | 1.70 | 14.4 | 87.0 | 361 MB GPU pool | cupy 14.2.0 |

Batching runs flies side by side but does not make them cheaper here: per fly, a batch of 8 or 32
costs 1.2–1.5× one fly on CPU and 1.1–1.6× one fly on this GPU. Measured with flybrain
0.1.0 on Python 3.13. Rows from other machines are welcome.

### Is the real wiring a better reservoir than random networks?

`python scripts/bench_reservoir.py` runs two tasks — the 8×8 digit classification with the
encoding of `notebooks/reservoir.ipynb`, and blob-position classification through `flybrain.eyes`
— on the connectome and on three controls built from it: the same weights shuffled between
neuron pairs, a degree-preserving rewiring, and an Erdős–Rényi graph. All three controls have
exactly the connectome's 25,088,107 connections and no duplicate pairs. The loaded connectome
has 65 self-loops; weight-shuffle keeps those pairs, so it has the same 65. Rewiring rejects a
self-loop when it redraws a collision (every neuron's in-degree is unchanged), and Erdős–Rényi
never draws one, so those two have none. Erdős–Rényi postsynaptic targets are drawn only among
the rows the loaded connectome itself delivers input to. The script prints nnz and the self-loop
count on every seed. Every control is strength-matched (every neuron's total input strength as
in the connectome). The same input neurons, readout population, trace settings and seeds are
used for every network. Readouts are `flybrain.reservoir`'s.

The eye-position candidates are the three steps already probed for this slot: step 7 (last
step the blob is on), step 10 (two steps after it turns off), and step 11 (last step of the
12-step slot). Seeds 5, 6 and 7, not the reported seeds, pick the one with the largest range
of the four networks' mean accuracies, so the reported step is where those networks disagreed
most on the selection seeds. An exact tie takes the earlier step. This run's separations were
0.1926, 0.4370 and 0.1185, so step 10 was frozen, and seeds 0–4 were scored only there. Each
of those readouts is also scored with its training labels permuted.

| task | connectome | weight-shuffle | rewired | Erdős–Rényi | winner |
|---|---|---|---|---|---|
| digits (600) | 0.497 ± 0.038 | 0.348 ± 0.034 | 0.329 ± 0.023 | 0.548 ± 0.025 | none robust (ER ahead 4/5, p ≈ 0.13) |
| eye position (L/C/R) | 0.347 ± 0.115 (at chance; beats shuffled-label baseline on 1/5 seeds) | 0.453 ± 0.054 | 0.347 ± 0.051 | 0.578 ± 0.057 | Erdős–Rényi |

Mean ± sample sd over seeds 0–4. On digits the connectome beats weight-shuffle on 5/5 seeds
(+0.111, +0.137, +0.183, +0.209, +0.105; paired t=7.31, two-sided p=0.002) and beats rewired
on 5/5 (+0.118, +0.170, +0.176, +0.190, +0.183; paired t=13.03, two-sided p=0.000 at three
decimals). Erdős–Rényi is the only control ahead of the connectome, on 4/5 seeds, by +0.137,
+0.033, -0.013, +0.013, +0.085 (paired t=1.90, two-sided p=0.131). That margin is not robust,
so the winner cell reads none robust (ER ahead 4/5, p ≈ 0.13). The cell's p ≈ 0.13 is that
printed p=0.131. Weight-shuffle keeps the pairs and scrambles the weights, and it falls from
0.497 to 0.348, so on digits the weight arrangement on the real pairs matters.

On eye position there are 45 test samples. Analytic 3-class chance is 0.333, se 0.070. The
connectome and the rewired network both score 0.347, inside that band. The shuffled-label
baseline scored connectome 0.373 ± 0.067, weight-shuffle 0.302 ± 0.095, rewired 0.289 ± 0.016
and Erdős–Rényi 0.373 ± 0.102. The connectome scores at chance on eye position. It beats its
shuffled-label baseline on only 1/5 seeds (seed 2: 0.533 vs 0.333; the other four are lower:
0.244 vs 0.289, 0.289 vs 0.378, 0.378 vs 0.467, 0.289 vs 0.400). Erdős–Rényi beats the
connectome on 5/5 seeds (+0.333, +0.244, +0.111, +0.244, +0.222; paired t=6.50, two-sided
p=0.003).

Measured with flybrain 0.1.1, Python 3.12.4, scikit-learn 1.9.1, numpy 2.5.5, scipy 1.18.1 and
numba 0.68.1 on a 12-thread Apple-Silicon CPU. One run of this revision took 33 min 47 s
(real 2026.62 s).

## Credits and license

Code: MIT. The connectome data is MaleCNS v1.0 by FlyEM (HHMI Janelia), the University of
Cambridge, the MRC Laboratory of Molecular Biology and Google Research, used under
[CC BY 4.0](https://male-cns.janelia.org/download/). If you use it, cite Berg, S. et al. (2026),
*Sexual dimorphism in the complete connectome of the Drosophila male central nervous system*, *Cell*.
The neuron model follows [Fly64](https://github.com/ornata/fly) by Jessica Paquette.

Source, experiments and results: [github.com/alextitonis/fly.ai](https://github.com/alextitonis/fly.ai)
