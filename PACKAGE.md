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

## Credits and license

Code: MIT. The connectome data is MaleCNS v1.0 by FlyEM (HHMI Janelia), the University of
Cambridge, the MRC Laboratory of Molecular Biology and Google Research, used under
[CC BY 4.0](https://male-cns.janelia.org/download/). If you use it, cite Berg, S. et al. (2026),
*Sexual dimorphism in the complete connectome of the Drosophila male central nervous system*, *Cell*.
The neuron model follows [Fly64](https://github.com/ornata/fly) by Jessica Paquette.

Source, experiments and results: [github.com/alextitonis/fly.ai](https://github.com/alextitonis/fly.ai)
