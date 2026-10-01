---
license: cc-by-4.0
pretty_name: fly.ai Connectome Sensory-to-Motor Screen
language:
  - en
task_categories:
  - tabular-regression
tags:
  - neuroscience
  - connectome
  - drosophila
  - computational-neuroscience
  - spiking-neural-network
  - simulation
  - volunteer-computing
size_categories:
  - 100K<n<1M
configs:
  - config_name: screen
    data_files: screen.csv
    default: true
  - config_name: tuning_runs
    data_files: tuning_runs.csv
  - config_name: experiments
    data_files: experiments.csv
---

# fly.ai Connectome Sensory-to-Motor Screen

This dataset holds simulated motor responses of a whole-CNS model of the male fruit fly (*Drosophila melanogaster*)
to stimulation of single sensory channels. Each simulation stimulated one sensory cell type on one side of the
brain at a set strength and recorded spike rates in 20 motor readout groups (descending neurons and motor neurons).

The simulations ran on the fly.ai compute network. Volunteers' browsers ran the jobs, and the server checked a
sample of the answers by re-running them. All the data comes from simulation. None of it is a biological
recording.

## What was simulated

- **Network:** the MaleCNS v1.0 connectome (166,700 neurons, 25,088,107 connections). The network includes every
  neuron that has a MaleCNS superclass annotation, plus every connection between those neurons.
  - The weight of a connection is its synapse count. It is made negative when the presynaptic neuron's predicted
    transmitter is GABA, glutamate or histamine.
  - Weights are scaled so that each neuron's inputs sum to 1.
  - For the browser, weights are quantized to 7-bit log steps of about 9% (mean relative error 0.023).
- **Neuron model:** a leaky integrate-and-fire unit, `v ← e^(-dt/τ)·v + gain·W·spikes + tonic + drive + noise`. A
  neuron spikes at 1 and resets to 0. Fixed parameters: `dt` = 0.02 s, `τ` = 0.1 s, and random noise kicks of
  0.22 at 1.2 Hz per neuron. The model follows Fly64 (J. Paquette), which follows the whole-brain LIF approach of
  Shiu et al. (2024).
- **Integer engine:** the jobs ran in fixed-point integer arithmetic (`mine/src/fixed.ts`), so every CPU and GPU
  gives the same spikes bit for bit.
  - Voltages are Q16 and synapse weights are Q20.
  - Synaptic input is summed with 32-bit wraparound.
  - Noise comes from a hash of (neuron, step).

  This engine was checked against the float engine (`world/src/connectome.ts`) over 6 conditions × 4 seeds:
  - population rates agree to within about 0.004 Hz;
  - sensory effects agree to within a few percent (for example, left LPLC2 → DNp01 L is +11.10 Hz in float vs
    +11.15 Hz in integer);
  - motor-group rates correlate at 1.000 over 240 comparisons.

  The two engines agree statistically, not spike for spike.
- **Stimulus:** a constant voltage `amount` is added each step to every neuron of one sensory channel on one side:

  | channel | cell type | in a real fly, responds to |
  |---|---|---|
  | `LPLC2` | LPLC2 visual projection neurons | looming: something getting bigger as it approaches |
  | `LC4` | LC4 visual projection neurons | fast looming, escape |
  | `LPLC1` | LPLC1 visual projection neurons | small approaching objects |
  | `LC10a` | LC10a visual projection neurons | a moving target the male chases |
  | `SNta` | every cell type whose name starts with `SNta` (sensory neurons) | touch |

- **Screen grid:**
  - Each channel × side (L, R) at `amount` {0.1, 0.2, 0.4, 0.8}, crossed with global synaptic `gain` {2, 3, 4} and
    `tonic` input {0.10, 0.14, 0.18}.
  - Undriven controls (`channel = none`) are run at every gain × tonic.
  - Each job is 750 steps (15 s): 250 steps (5 s) at rest, then 500 steps (10 s) with the drive on.
  - The work is added in rounds. Each round adds 3 new seeds per condition (1,107 jobs per round), so seed
    counts grow over time.
- **Readout:** spikes are counted per motor group, separately in the rest window and the driven window. There are
  10 groups per side:
  - single descending neuron types: DNg100, DNa02, DNp01 (giant fiber) and MDN;
  - pooled groups: `wing power` (DLM/DVM motor neurons), `leg extend`, `leg flex`, `arm pull`, `leg kick` and
    `head tug`.

  The exact cell types are in `mine/src/model.ts` of the source repository. `meta.json` gives each group's size.

## How it was computed and checked

Jobs ran in volunteers' browsers, on CPU (JavaScript) or GPU (WebGPU) with the same integer arithmetic. Every answer
includes an order-independent hash of every spike, so an honest machine must reproduce the server's result exactly.

How the server checks answers:

- **Canaries:** about 15% of the jobs handed out already have known answers.
- **Re-runs:** the server re-runs further answers at random, more often for a miner's early jobs of the day.
- **Wrong answers:** one wrong answer zeroes that miner's day, and their unchecked answers stop counting.

What counts in each file:

- **Screen (`screen.csv`):** a job counts once the server has re-run it, or once a miner with no wrong answers has
  returned it. Each screen job therefore rests on one miner's answer, and only a sample was re-run by the server.
  `n_checked_seeds` gives the number that were re-run.
- **House orders (`tuning_runs.csv`):** a run counts once it is settled, either by two independent miners (wallets)
  agreeing exactly (`checked_by = miners`) or by the server's own run (`checked_by = server`).

Spike hashes are never published.

## Files

### `screen.csv`: the screen, averaged over seeds (long format)

Source: `GET https://flyai-mine.fly.dev/api/results`. There is one row per condition × motor group.

| column | type | meaning |
|---|---|---|
| `channel` | string | driven sensory channel; `none` for undriven controls |
| `side` | `L`/`R`/empty | side of the brain driven (empty for controls) |
| `amount` | float | voltage added per step to each driven neuron (threshold = 1); 0 for controls |
| `gain` | float | global synaptic gain |
| `tonic` | float | constant input to every neuron per step |
| `steps` | int | total steps (750) |
| `warm` | int | rest steps before the drive (250) |
| `motor_group` | string | readout group, e.g. `DNp01`, `leg kick` |
| `motor_side` | `L`/`R` | side of the readout group |
| `n_seeds` | int | number of seeds (jobs) averaged |
| `n_checked_seeds` | int | of those, how many were re-run and confirmed by the server |
| `rest_hz` | float | mean spikes per neuron per second in the rest window (5 s), averaged over seeds |
| `driven_hz` | float | the same in the driven window (10 s) |
| `delta_hz` | float | `driven_hz − rest_hz` |

The API serves only means rounded to 0.01 Hz, so this file has no spread or confidence interval. `delta_hz` is
computed from the rounded means. Per-seed values are available only for the tuning runs below.

### `tuning_runs.csv`: per-run house tuning sweeps (long format)

Source: `GET /api/orders/<id>/results` for each tuning order listed in `experiments.csv`. These are separate,
wider sweeps (other gains, tonics and amounts than the screen). There is one row per run × motor group, with raw
counts, so seed-to-seed spread can be computed from this file.

Columns:
- `label`: the order (e.g. `tuning/threat`), and `seq`: its settle order.
- `channel`, `side`, `amount`, `gain`, `tonic`, `seed`, `steps`, `warm`: as in the screen.
- `checked_by`: `miners` (two agreeing wallets) or `server`.
- `motor_group`, `motor_side`, `group_size` (neurons in the group).
- `rest_spikes`, `driven_spikes`: total spikes in the group in each window.
- `rest_hz`, `driven_hz`: those counts per neuron per second.

### `experiments.json`, `experiments.csv`, `experiment_tables.csv`: house research summaries

Source: `GET /api/experiments`. These are one-line findings per house research order (tuning sweeps, colony world
simulations, encoding probes, compute demos), as shown on the fly.ai results page.
- `experiments.json` is the response as served.
- `experiments.csv` has one row per order: label, family, order id, status, jobs, settled, `runs_read`, question,
  headline and figures.
- `experiment_tables.csv` holds the small tables in long form: label, row, column, value.

For large orders, the server summarizes a sample of the settled runs, and `runs_read` gives the sample size. World
simulations run in floating point, and the encoding probes describe the integer engine. These summaries are
computed descriptions, not peer-reviewed results.

### `meta.json`

`meta.json` describes the export itself:
- the export time and the server it read from;
- any endpoint errors;
- file sizes and row counts;
- the screen grid;
- the network's job counts at export time (`/api/stats`);
- the engine's fixed-point constants (`/api/model`, with a sha256 of the weight table);
- the neuron parameters;
- the sizes of the input channels and motor groups;
- the sha256 of each connectome file the engine loads, and the git commit that last changed them.

### `house/` (only when present)

Raw results of house orders that the owner pulled locally with `scripts/pull-house.ts`: `order.json`,
`results.jsonl` and probe `layout.json`. Bulk program outputs are listed in `meta.json` with counts and sizes, but
are not copied.

## Limitations

- **Simulation, not biology.** This is a point-neuron leaky integrate-and-fire model on a static wiring diagram:
  - no dendrites, conductances, gap junctions, neuromodulation, plasticity, or body and sensory feedback;
  - the transmitter sign comes from *predicted* neurotransmitters;
  - weights are synapse counts normalized per neuron.

  Rates in Hz are model rates, not predictions of measured firing rates.
- **Stimulus is artificial.** A sensory channel is driven by a constant voltage step into every cell of a type,
  not by a visual or mechanical stimulus.
- **Parameters are a grid, not a fit.** `gain`, `tonic` and the noise were chosen to keep the network in a
  working regime. Results change across that grid, which is why the grid is part of every row.
- **Quantization.** The weights are 7-bit log-quantized, and the dynamics use fixed-point integers. The integer
  engine matches the float model statistically, not spike for spike.
- **Readout groups are pooled.** Several groups pool many motor neurons (e.g. `leg flex` has about 70 neurons per
  side), so a group rate is an average.
- **Uneven sampling.** Seed counts differ per condition and grow with each round. Most screen answers come from a
  single unaudited miner (see *How it was computed and checked*).
- **Snapshot.** Each export reads the live network, so numbers change between monthly releases. Check
  `meta.json`'s `exported_at`.

## License

The fly.ai data in this dataset (the simulation outputs and summaries) is released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The data is derived from the MaleCNS v1.0 connectome, by FlyEM (HHMI Janelia), the University of Cambridge, the
MRC Laboratory of Molecular Biology and Google Research. That connectome is used under
[CC BY 4.0](https://male-cns.janelia.org/download/). If you reuse this dataset, you must also attribute the
connectome as below.

The simulation code (github.com/alextitonis/fly.ai) is MIT-licensed.

## Citation

If you use this dataset, cite the fly.ai dataset and the connectome it was simulated on.

The connectome (as cited by the fly.ai repository):

> Berg, S. et al. (2026). Sexual dimorphism in the complete connectome of the *Drosophila* male central nervous
> system. *Cell*. Data: [male-cns.janelia.org](https://male-cns.janelia.org)

Also follow the [MaleCNS attribution terms](https://male-cns.janelia.org/download/).
<!-- TODO(owner): add the paper's volume, pages and DOI, and paste MaleCNS's own requested attribution text from
male-cns.janelia.org/download/ here. The fly.ai repository doesn't record them. -->

This dataset:

```bibtex
@misc{flyai_connectome_screen,
  author       = {{fly.ai}},
  title        = {fly.ai Connectome Sensory-to-Motor Screen},
  year         = {2026},
  howpublished = {\url{https://huggingface.co/datasets/flyai/connectome-screen}},
  note         = {Simulated on the MaleCNS v1.0 connectome; code at https://github.com/alextitonis/fly.ai}
}
```

Related work the model builds on:
- Shiu, P. K. et al. (2024). A *Drosophila* computational brain model reveals sensorimotor processing.
  *Nature* 634.
- Paquette, J. (2026). [Fly64: a fly brain model plays Super Mario 64](https://github.com/ornata/fly). Fly64 is the
  source of the neuron model, weight normalization and optic-column handling.
