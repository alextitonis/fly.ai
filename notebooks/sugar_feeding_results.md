# Sugar to feeding (Shiu et al. 2024) on MaleCNS: results

Notebook: [`sugar_feeding.ipynb`](sugar_feeding.ipynb) (executed, outputs saved). All numbers:
[`sugar_feeding_numbers.csv`](sugar_feeding_numbers.csv). Issue #41, PR #65 (revised after review).

**Result.**
* With flybrain's default parameters, driving the MaleCNS sugar GRNs (5–50 Hz) does not change MN9. Bitter
  GRNs can't serve as a control there, because they already fire at their 50 Hz ceiling at rest.
* With one documented switch, `sensory_input=False`, sugar raises MN9 in a graded way. This survives a Holm
  correction across all 77 tests from 20 Hz input up. Bitter's slight suppression of MN9 survives BH only at
  some levels and never Holm.
* With `sensory_input=False` and 5 ms steps, at the paper's 100 Hz input, MN9 reaches 0.050 of the maximum
  it can reach in this model (the positive control's 99.70 Hz). Shiu et al. calibrated their model to ~0.8
  at that input.
* The shuffled brain shows no consistent sugar effect. On the default brain, one of its six tested levels
  (40 Hz) is significant under BH, not Holm; with `sensory_input=False`, none is. But MN9 rests 2.6–4.2×
  faster there, so it isn't a like-for-like control.

## What Shiu et al. did

Shiu, P.K. et al. *A Drosophila computational brain model reveals sensorimotor processing.* Nature 634,
210–219 (2024). Read in the PMC version (PMC11446845). Facts below cite figures and Methods sections; page
numbers were not checked. Code: [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) at `91bdd1e`.

| | Shiu et al. 2024 | here (flybrain 0.1.1) |
|---|---|---|
| connectome | FlyWire, female brain, 127,400 neurons (materialization 630) | MaleCNS v1.0, male brain + nerve cord, 166,700 neurons |
| neuron model | LIF in Brian2: V_rest = V_reset −52 mV, V_th −45 mV, τ_m 20 ms (from R·C), refractory 2.2 ms, synaptic delay 1.8 ms, synaptic τ 5 ms (Methods, "Computational model") | LIF, 20 ms steps, τ 100 ms, gain 3, tonic 0.14, noise 1.2 Hz × 0.22 V, weights normalised per neuron (`flybrain/brain.py`) |
| free parameter | W_syn = 0.275 mV, set so that 100 Hz sugar input gives ~80% of MN9's maximum (Methods) | none tuned here |
| sugar input | 21 labellar sugar GRNs, one side, Poisson input at 10–200 Hz (Fig. 1d; Methods, "Computational modelling of water and sugar GRN activity") | 17 GRNs (LB3b + LB3c), left side, forced spikes at 0–50 Hz |
| readout | MN9 contralateral to the GRNs, rate over 30 × 1 s runs (Fig. 1c; Methods) | contralateral MN9, spikes over 1 s after 0.5 s settling, 20 seeds |
| bitter | bitter GRNs (21 in the code) inhibit MN9 when added to sugar, and alone do not activate it (Fig. 3a–b) | 19 GRNs (LB1a–d), left side, same rates |
| shuffle | "only 1 of 100" shuffled connectomes activated MN9 at 100 Hz sugar, vs 100% for the real one (Results after Fig. 1; Supplementary Table 1) | one degree-preserving shuffle built in the notebook |

The paper's text gives neither an onset rate for MN9 nor an MN9 rate at a given input rate. Those are in
Fig. 1d (heatmap) and its supplementary data, which I did not extract. The only stated quantity is the
calibration: ~80% of maximum at 100 Hz.

## Mapping

Chain used: Shiu's FlyWire IDs (from their `figures.ipynb`) → FlyWire cell type and modality from
[flywire_annotations](https://github.com/flyconnectome/flywire_annotations) (`Supplemental_file1`, at
`a83b277`) → MaleCNS v1.0 `type`.

What Shiu's lists contain, by later FlyWire typing (20 of 21 IDs in each list still exist at FlyWire
materialization 783):

* sugar list: LB3c ('sugar') ×9, LB3b ('sugar/low_salt') ×2, LB3d ('high_salt/heavy_metal') ×5, LB4b ('putative_attractive') ×4
* bitter list: LB1a ×8, LB1b ×3, LB1c ×4, LB1d ×5 (all 'bitter')
* MN9: FlyWire `CB0701` ('ingestion_motor_neuron')

| FlyWire name (modality) | MaleCNS type | `brain.cell_type` (what `brain.cells` matches) | neurons L | R |
|---|---|---|---|---|
| LB3b (sugar/low salt) | LB3b | `LB3` | 5 | 6 |
| LB3c (sugar) | LB3c | `LB3` | 12 | 11 |
| LB1a (bitter) | LB1a | `LB1a,LB1d` | 6 | 5 |
| LB1b (bitter) | LB1b | `LB1b` | 3 | 3 |
| LB1c (bitter) | LB1c | `LB1c` | 9 | 7 |
| LB1d (bitter) | LB1d | `LB1a,LB1d` | 1 | 4 |
| LB3d (high salt), in Shiu's sugar list | LB3d | `LB3` | 11 | 15 |
| LB4b (putative attractive), in Shiu's sugar list | LB4b | `LB3` | 4 | 4 |
| MN9 = CB0701 | MN9 | `CB0701` | 1 | 1 |

Main sets: **sugar** = LB3b + LB3c (17 per side), **bitter** = LB1a–d (19 per side), **MN9** =
`brain.cells(["CB0701"], side=...)` (body IDs 10331 L, 16949 R).

Could not match, or only partly:

* **Sugar GRNs through `brain.cells`.** The prebuilt `brain.npz` stores the FlyWire match where there is one,
  and MaleCNS matched LB3a/b/c/d and LB4b only to the coarse FlyWire type `LB3`. So `brain.cells(["LB3"])`
  returns 87 neurons of water, sugar, salt and LB4b types together. The notebook selects sugar GRNs by MaleCNS
  body ID (column `type` of the MaleCNS annotation table) instead. Bitter GRNs and MN9 work through
  `brain.cells` (the notebook checks that both routes give the same neurons).
* **"Gr5a" and "Gr66a" themselves.** No connectome labels receptors. The sugar/bitter modality comes from
  FlyWire's annotation of LB types, and MaleCNS's `receptorType` column has no Gr entries. So LB3b + LB3c is
  the best available stand-in for Gr5a GRNs, not a confirmed one.
* **Exact copies of Shiu's 21 neurons.** Their IDs are FlyWire neurons, not MaleCNS ones. Only the types carry
  over. One ID per list no longer exists at FlyWire 783 (sugar `720575940620900446`, bitter
  `720575940618600651`), and one of their two MN9 IDs (`720575940645521262`) has also changed. Shiu's sugar
  list mixes four types, so it is also run as a variant (LB3b + LB3c + LB3d + LB4b, 32 left neurons).

## Method

* **Input.** At each 20 ms step, each stimulated neuron gets `inject` +5 V with probability rate × dt
  (threshold 1 V, so this forces a spike). Levels: 0, 5, 10, 20, 30, 40, 50 Hz; 50 Hz is the ceiling at 20 ms
  steps. Stimulus random numbers come from `default_rng([41, seed])`, the same draws at every level.
* **Trial.** `brain.reset(seed)`, 0.5 s with no input, then 1 s with input. Readout: MN9 spike count over the
  1 s (= Hz). Seeds 0–19 at every level. The 0 Hz level is the zero-input baseline; it is shared by all inputs
  on one brain.
* **Measures.** Contralateral MN9 rate (mean, SD, range); fraction of runs with any MN9 spike; and the paired
  change: count minus the same seed's 0 Hz count (same noise stream), mean ± SE, with a Wilcoxon signed-rank p.
* **Shuffle.** A configuration-model rewiring built in the notebook from the brain's own arrays (`flybrain/`
  not edited). One random permutation of all connections' presynaptic ends (seed 41). Each connection keeps
  its target and size and takes the new source's sign. In-degree, out-degree and each neuron's sign are kept.
  389 self-loops were dropped and repeated pairs merged (25,582,938 → 25,494,871 connections).
* **Positive control.** MN9 R's five strongest excitatory inputs (DNge062, CB0553, CB0493, CB0893, DNge080;
  all left), driven at the same rates.
* **Statistics.** Every paired Wilcoxon test is one member of a single family of **77**: 76 tests (each
  input group × rate above 0 Hz, on every brain, positive controls included) plus one post hoc test of
  contralateral vs ipsilateral change (added after seeing the first results). Holm (family-wise error) and Benjamini–Hochberg (false discovery rate)
  are applied across all 77. They are written out in the notebook and checked against the worked example in
  Benjamini & Hochberg (1995); statsmodels isn't a dependency. The CSV has `p_holm` and `q_bh`. Of the 77
  tests, 41 are below 0.05 raw, 36 under BH and 22 under Holm; 15 of those 22 are positive-control rows.
* **Verified downloads.** Both annotation files are checked against a fixed sha256. On a mismatch the
  notebook deletes the file and stops, so the next run downloads it again. The MaleCNS feather's Google Cloud
  Storage path has no version in it, so the hash is what pins it:
  `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2`. The FlyWire TSV is at a pinned commit:
  `b214970b55d2fbe0853bba536fdcb9e28730f4eb7ab06f600491df795da683cd`.

## Claims and whether they survive correction

| claim | key test | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|
| default brain: sugar doesn't move MN9 | sugar L, 50 Hz: −0.05 ± 0.20 | 0.80 | 1 | 0.89 | (null) |
| `sensory_input=False`: sugar raises MN9 | sugar L, 50 Hz: +2.00 ± 0.22 | 8e-05 | 0.0052 | 0.00035 | Holm |
| onset level, `sensory_input=False` | 20 Hz: +1.00 ± 0.21 (lowest level surviving Holm) | 0.00059 | 0.033 | 0.0021 | Holm |
| | 10 Hz: +0.40 ± 0.15 (the raw onset) | 0.030 | 1 | 0.060 | neither |
| bitter suppresses MN9 (`sensory_input=False`) | 10, 20, 40 Hz: −0.50, −0.50, −0.60 | 0.015–0.016 | 0.69–0.70 | 0.035 | BH only |
| | 30, 50 Hz: −0.50, −0.45 | 0.035, 0.038 | 1 | 0.067, 0.071 | neither |
| contra > ipsi (`sensory_input=False`, 50 Hz) | +2.00 vs +1.05; difference +0.95 ± 0.28 | 0.0044 | 0.21 | 0.012 | BH only |
| Shiu's GRN mix (default) | 50 Hz: +0.70 ± 0.15 | 0.00092 | 0.051 | 0.0031 | BH only |
| | 40 Hz: +0.55 ± 0.18 | 0.016 | 0.70 | 0.035 | BH only |
| sugar R → MN9 L (default) | 40 Hz: +0.50 ± 0.14 | 0.0057 | 0.28 | 0.015 | BH only |
| | 30, 50 Hz: +0.40, +0.55 | 0.025, 0.031 | 1 | 0.052, 0.060 | neither |
| dt = 5 ms, default brain | sugar 200 Hz: +1.00 ± 0.26 | 0.016 | 0.70 | 0.035 | BH only |
| dt = 5 ms + `sensory_input=False` | sugar 50, 100, 200 Hz: +2.15, +3.55, +5.85 | 7e-05–0.00011 | 0.0051–0.0063 | ≤0.00042 | Holm |
| shuffled brain, default | 40 Hz: +0.50 ± 0.15 | 0.011 | 0.53 | 0.028 | BH only |
| shuffled brain, `sensory_input=False` | none below 0.05 raw (50 Hz: +0.25 ± 0.20) | 0.25 | 1 | 0.38 | (null) |

The dt = 5 ms sweep on the default brain has 10 seeds. Its smallest possible Wilcoxon p is 0.002, so none of
its rows can survive Holm across 77 tests, not even the positive control (p_holm 0.11, q_bh 0.0054). Every
20-seed positive-control row survives Holm.

## Numbers

Contralateral MN9. "Paired change" = extra MN9 spikes in 1 s vs the same seed at 0 Hz, mean ± SE. "survives"
uses the 77-test family: Holm = p_holm < 0.05; BH only = q_bh < 0.05 but not Holm; neither = raw p < 0.05
only; – = not significant raw. The full table, including ipsilateral MN9 and the achieved input rates, is in
the CSV.

At rest, default brain: sugar GRNs 3.0 Hz, **bitter GRNs 50.0 Hz** (the ceiling), MN9 1.8 Hz (L and R).
At rest, `sensory_input=False`: sugar GRNs 0.3 Hz, bitter GRNs 0.2 Hz, MN9 2.2 Hz L / 1.6 Hz R.

**Default parameters**

| input | rate (Hz) | MN9 contra Hz (mean ± SD) | paired change (mean ± SE) | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|---|---|
| sugar L | 0 | 2.10 ± 0.79 | – |  |  |  |  |
| sugar L | 5 | 1.95 ± 1.00 | -0.15 ± 0.15 | 0.36 | 1 | 0.49 | – |
| sugar L | 10 | 1.90 ± 0.91 | -0.20 ± 0.14 | 0.2 | 1 | 0.32 | – |
| sugar L | 20 | 1.95 ± 0.94 | -0.15 ± 0.17 | 0.39 | 1 | 0.52 | – |
| sugar L | 30 | 2.25 ± 1.12 | +0.15 ± 0.18 | 0.5 | 1 | 0.62 | – |
| sugar L | 40 | 2.20 ± 0.89 | +0.10 ± 0.19 | 0.7 | 1 | 0.81 | – |
| sugar L | 50 | 2.05 ± 0.94 | -0.05 ± 0.20 | 0.8 | 1 | 0.89 | – |
| bitter L | 0 | 2.10 ± 0.79 | – |  |  |  |  |
| bitter L | 5 | 2.10 ± 0.79 | +0.00 ± 0.00 | 1 | 1 | 1 | – |
| bitter L | 10 | 2.10 ± 0.79 | +0.00 ± 0.00 | 1 | 1 | 1 | – |
| bitter L | 20 | 2.05 ± 0.76 | -0.05 ± 0.05 | 0.68 | 1 | 0.79 | – |
| bitter L | 30 | 2.05 ± 0.76 | -0.05 ± 0.05 | 0.68 | 1 | 0.79 | – |
| bitter L | 40 | 2.00 ± 0.65 | -0.10 ± 0.07 | 0.42 | 1 | 0.54 | – |
| bitter L | 50 | 2.00 ± 0.65 | -0.10 ± 0.07 | 0.42 | 1 | 0.54 | – |
| LB3b+c+d+LB4b L | 0 | 2.10 ± 0.79 | – |  |  |  |  |
| LB3b+c+d+LB4b L | 5 | 1.95 ± 1.00 | -0.15 ± 0.13 | 0.32 | 1 | 0.45 | – |
| LB3b+c+d+LB4b L | 10 | 2.20 ± 1.11 | +0.10 ± 0.18 | 0.42 | 1 | 0.54 | – |
| LB3b+c+d+LB4b L | 20 | 2.35 ± 1.04 | +0.25 ± 0.14 | 0.12 | 1 | 0.21 | – |
| LB3b+c+d+LB4b L | 30 | 2.35 ± 0.67 | +0.25 ± 0.14 | 0.12 | 1 | 0.21 | – |
| LB3b+c+d+LB4b L | 40 | 2.65 ± 0.99 | +0.55 ± 0.18 | 0.016 | 0.7 | 0.035 | BH only |
| LB3b+c+d+LB4b L | 50 | 2.80 ± 0.83 | +0.70 ± 0.15 | 0.00092 | 0.051 | 0.0031 | BH only |
| sugar R | 0 | 1.45 ± 1.00 | – |  |  |  |  |
| sugar R | 5 | 1.55 ± 1.00 | +0.10 ± 0.12 | 0.49 | 1 | 0.62 | – |
| sugar R | 10 | 1.75 ± 1.02 | +0.30 ± 0.13 | 0.077 | 1 | 0.14 | – |
| sugar R | 20 | 1.65 ± 1.09 | +0.20 ± 0.16 | 0.31 | 1 | 0.44 | – |
| sugar R | 30 | 1.85 ± 0.93 | +0.40 ± 0.15 | 0.025 | 1 | 0.052 | neither |
| sugar R | 40 | 1.95 ± 1.10 | +0.50 ± 0.14 | 0.0057 | 0.28 | 0.015 | BH only |
| sugar R | 50 | 2.00 ± 1.17 | +0.55 ± 0.22 | 0.031 | 1 | 0.06 | neither |

*Positive control (default), MN9 contra Hz:* 0 Hz → 2.10, 5 Hz → 5.35, 10 Hz → 8.25, 20 Hz → 13.55, 30 Hz → 18.45, 40 Hz → 22.90, 50 Hz → 25.00. Largest p_holm 0.0052, largest q_bh 0.00035.

**Default parameters, shuffled brain**

| input | rate (Hz) | MN9 contra Hz (mean ± SD) | paired change (mean ± SE) | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|---|---|
| sugar L, shuffled brain | 0 | 8.75 ± 0.72 | – |  |  |  |  |
| sugar L, shuffled brain | 5 | 8.95 ± 0.76 | +0.20 ± 0.17 | 0.26 | 1 | 0.39 | – |
| sugar L, shuffled brain | 10 | 9.00 ± 0.65 | +0.25 ± 0.16 | 0.15 | 1 | 0.24 | – |
| sugar L, shuffled brain | 20 | 9.00 ± 0.79 | +0.25 ± 0.19 | 0.3 | 1 | 0.44 | – |
| sugar L, shuffled brain | 30 | 9.05 ± 0.83 | +0.30 ± 0.18 | 0.14 | 1 | 0.22 | – |
| sugar L, shuffled brain | 40 | 9.25 ± 0.79 | +0.50 ± 0.15 | 0.011 | 0.53 | 0.028 | BH only |
| sugar L, shuffled brain | 50 | 8.75 ± 0.72 | +0.00 ± 0.16 | 1 | 1 | 1 | – |

**`sensory_input=False`**

| input | rate (Hz) | MN9 contra Hz (mean ± SD) | paired change (mean ± SE) | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|---|---|
| sugar L | 0 | 1.55 ± 0.76 | – |  |  |  |  |
| sugar L | 5 | 1.85 ± 0.75 | +0.30 ± 0.16 | 0.12 | 1 | 0.2 | – |
| sugar L | 10 | 1.95 ± 0.89 | +0.40 ± 0.15 | 0.03 | 1 | 0.06 | neither |
| sugar L | 20 | 2.55 ± 0.94 | +1.00 ± 0.21 | 0.00059 | 0.033 | 0.0021 | Holm |
| sugar L | 30 | 2.90 ± 1.17 | +1.35 ± 0.22 | 0.00016 | 0.0092 | 0.00059 | Holm |
| sugar L | 40 | 3.25 ± 1.07 | +1.70 ± 0.19 | 8.5e-05 | 0.0052 | 0.00035 | Holm |
| sugar L | 50 | 3.55 ± 0.94 | +2.00 ± 0.22 | 8e-05 | 0.0052 | 0.00035 | Holm |
| bitter L | 0 | 1.55 ± 0.76 | – |  |  |  |  |
| bitter L | 5 | 1.50 ± 1.05 | -0.05 ± 0.18 | 0.92 | 1 | 0.99 | – |
| bitter L | 10 | 1.05 ± 0.83 | -0.50 ± 0.17 | 0.016 | 0.7 | 0.035 | BH only |
| bitter L | 20 | 1.05 ± 0.83 | -0.50 ± 0.17 | 0.016 | 0.7 | 0.035 | BH only |
| bitter L | 30 | 1.05 ± 0.94 | -0.50 ± 0.20 | 0.035 | 1 | 0.067 | neither |
| bitter L | 40 | 0.95 ± 0.89 | -0.60 ± 0.20 | 0.015 | 0.69 | 0.035 | BH only |
| bitter L | 50 | 1.10 ± 0.91 | -0.45 ± 0.18 | 0.038 | 1 | 0.071 | neither |
| sugar L: contra extra minus ipsi extra | 50 |  | +0.95 ± 0.28 | 0.0044 | 0.21 | 0.012 | BH only |

*Positive control (sensory_input=False), MN9 contra Hz:* 0 Hz → 1.55, 5 Hz → 4.75, 10 Hz → 8.00, 20 Hz → 13.60, 30 Hz → 18.60, 40 Hz → 23.00, 50 Hz → 24.90. Largest p_holm 0.0052, largest q_bh 0.00035.

**`sensory_input=False`, shuffled brain**

| input | rate (Hz) | MN9 contra Hz (mean ± SD) | paired change (mean ± SE) | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|---|---|
| sugar L, shuffled brain | 0 | 4.05 ± 0.89 | – |  |  |  |  |
| sugar L, shuffled brain | 5 | 4.10 ± 0.72 | +0.05 ± 0.17 | 0.94 | 1 | 0.99 | – |
| sugar L, shuffled brain | 10 | 4.10 ± 0.85 | +0.05 ± 0.17 | 0.94 | 1 | 0.99 | – |
| sugar L, shuffled brain | 20 | 4.15 ± 0.75 | +0.10 ± 0.19 | 0.88 | 1 | 0.97 | – |
| sugar L, shuffled brain | 30 | 4.00 ± 0.56 | -0.05 ± 0.18 | 0.63 | 1 | 0.76 | – |
| sugar L, shuffled brain | 40 | 4.25 ± 0.72 | +0.20 ± 0.16 | 0.23 | 1 | 0.36 | – |
| sugar L, shuffled brain | 50 | 4.30 ± 0.57 | +0.25 ± 0.20 | 0.25 | 1 | 0.38 | – |

**`dt=0.005` (10 seeds)**

| input | rate (Hz) | MN9 contra Hz (mean ± SD) | paired change (mean ± SE) | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|---|---|
| sugar L, dt=5 ms | 0 | 3.90 ± 0.57 | – |  |  |  |  |
| sugar L, dt=5 ms | 25 | 4.00 ± 0.47 | +0.10 ± 0.23 | 1 | 1 | 1 | – |
| sugar L, dt=5 ms | 50 | 4.10 ± 0.74 | +0.20 ± 0.25 | 0.75 | 1 | 0.85 | – |
| sugar L, dt=5 ms | 100 | 4.10 ± 0.32 | +0.20 ± 0.20 | 0.62 | 1 | 0.76 | – |
| sugar L, dt=5 ms | 150 | 4.50 ± 0.53 | +0.60 ± 0.22 | 0.062 | 1 | 0.11 | – |
| sugar L, dt=5 ms | 200 | 4.90 ± 0.57 | +1.00 ± 0.26 | 0.016 | 0.7 | 0.035 | BH only |

*Positive control (dt=0.005), MN9 contra Hz:* 0 Hz → 3.90, 25 Hz → 18.80, 50 Hz → 31.60, 100 Hz → 56.10, 150 Hz → 79.40, 200 Hz → 100.00. Largest p_holm 0.11, largest q_bh 0.0054.

**`sensory_input=False` and `dt=0.005` (20 seeds)**

| input | rate (Hz) | MN9 contra Hz (mean ± SD) | paired change (mean ± SE) | p | p_holm | q_bh | survives |
|---|---|---|---|---|---|---|---|
| sugar L, dt=5 ms | 0 | 1.45 ± 0.89 | – |  |  |  |  |
| sugar L, dt=5 ms | 50 | 3.60 ± 0.94 | +2.15 ± 0.26 | 0.00011 | 0.0063 | 0.00042 | Holm |
| sugar L, dt=5 ms | 100 | 5.00 ± 0.73 | +3.55 ± 0.22 | 7.2e-05 | 0.0051 | 0.00035 | Holm |
| sugar L, dt=5 ms | 200 | 7.30 ± 0.57 | +5.85 ± 0.21 | 7.1e-05 | 0.0051 | 0.00035 | Holm |

*Positive control (sensory_input=False, dt=0.005), MN9 contra Hz:* 0 Hz → 1.45, 50 Hz → 31.40, 100 Hz → 56.55, 200 Hz → 99.70. Largest p_holm 0.0052, largest q_bh 0.00035.

Family: 77 tests. Below 0.05: raw 41, Holm 22, BH 36.

### Shuffled brain: a different regime

MN9 at rest (the 0 Hz level, mean of 20 seeds), contralateral / ipsilateral:

| brain | real | shuffled | ratio |
|---|---|---|---|
| default | 2.10 / 1.45 Hz | 8.75 / 5.00 Hz | 4.2× / 3.4× |
| `sensory_input=False` | 1.55 / 1.90 Hz | 4.05 / 5.85 Hz | 2.6× / 3.1× |

On the default brain the shuffled sweep is flat except at 40 Hz: +0.50 ± 0.15, p 0.011, p_holm 0.53, q_bh
0.028. That level survives BH, not Holm; its neighbours (30 Hz +0.30, p 0.14; 50 Hz +0.00, p 1.0) are not
significant. So the shuffle shows no consistent sugar effect, and it is not a clean null. It also runs MN9 at
a 2.6–4.2× higher resting rate than the real brain. So it shows that random wiring with the same degrees
doesn't carry sugar to MN9 in a consistent way. It doesn't show that the real brain's MN9 would behave the
same at its own baseline.

### Fraction of maximum at the paper's rates (`sensory_input=False`, `dt=0.005`)

Two parameters changed. At 100 Hz sugar, MN9 fires at 5.00 Hz (rest 1.45 Hz). The positive control (MN9's
top-5 excitatory inputs) reaches 99.70 Hz at 200 Hz input, the highest MN9 rate in that sweep. So 100 Hz
sugar gives **0.050** of that maximum (**0.036** measured above rest). Shiu et al. calibrated W_syn to give
~0.8 of MN9's maximum at 100 Hz sugar, about 16× more. Sugar input at the paper's rates does drive MN9 here,
and every level survives Holm, but weakly.

### Where the sugar signal goes

**`sensory_input=False`, 50 Hz sugar (the brain with a sugar → MN9 effect).** 242 neurons respond reliably
(mean ≥ +1 spike, and higher in at least 18 of 20 seeds): 96 at one synapse from the sugar GRNs, 141 at two,
5 at three. **MN9 is among them** (two synapses away). Strongest responders:

| type | side | superclass | hop | extra spikes |
|---|---|---|---|---|
| GNG215 | L | cb_intrinsic | 1 | 24.7 |
| ANXXX462a | L | ascending_neuron | 1 | 24.0 |
| GNG038 | L | cb_intrinsic | 1 | 23.6 |
| GNG229 | L | cb_intrinsic | 1 | 23.0 |
| GNG175 | L | cb_intrinsic | 1 | 22.4 |
| GNG038 | R | cb_intrinsic | 1 | 20.7 |
| GNG452 (2 neurons) | L | cb_intrinsic | 1 | 18.6 |
| GNG228 | L | cb_intrinsic | 1 | 17.2 |
| GNG254 | L | cb_intrinsic | 1 | 15.2 |
| GNG042 | L | cb_intrinsic | 1 | 15.2 |
| DNg67 | L / R | descending_neuron | 1 | 11.2 / 9.2 |

No sensory neuron is among the strongest responders: `sensory_input=False` removes the synapses onto
sensory neurons, so there's no GRN-to-GRN spread.

**Default brain, 50 Hz sugar (no sugar → MN9 effect, for comparison).** 116 neurons respond (76 / 38 / 2 at
one / two / three synapses), and MN9 is not among them. The strongest are GNG215, ANXXX462a, an untyped
sensory neuron, and other labellar GRNs: LB2d (2 neurons) and LB3d (5 neurons), reached through
sensory-to-sensory synapses. After them come GNG228, GNG038 and GNG452.

## Plots

![MN9 vs input rate](sugar_feeding_mn9.png)

![dt = 5 ms, with and without sensory input](sugar_feeding_mn9_dt5ms.png)

## Comparison with the paper

| question | Shiu et al. (FlyWire) | MaleCNS, default | MaleCNS, `sensory_input=False` |
|---|---|---|---|
| does sugar drive MN9? | yes; ~0.8 of max at 100 Hz by calibration | no (5–50 Hz); at dt = 5 ms, +1.0 at 200 Hz (BH only) | yes, survives Holm from 20 Hz; at dt = 5 ms, 0.050 of max at 100 Hz |
| from what input rate? | not stated in the text (Fig. 1d) | – | 20 Hz after Holm (10 Hz raw only) |
| does bitter drive MN9? | no; bitter suppresses sugar-driven MN9 | not testable (bitter GRNs saturated at rest) | no; slight suppression of spontaneous MN9, BH only at 3 of 6 levels |
| shuffled connectome | 1 of 100 shuffles activates MN9 | no consistent effect (40 Hz: BH only); MN9 rests 4.2× faster | no effect; MN9 rests 2.6× faster |
| contralateral MN9 | contralateral > ipsilateral (Fig. 1c) | – | +2.00 vs +1.05 at 50 Hz, BH only |

Where MaleCNS agrees, with `sensory_input=False`: sugar drives MN9 up, with a graded response that survives
Holm, and bitter does not drive it. Where it differs: the size of the effect (0.050 of max vs ~0.8), and
with the default `sensory_input=True` nothing shows. The bitter suppression and the contralateral bias
point the paper's way but survive BH only.

## Limits

* The models differ in more than the connectome. flybrain uses 20 ms steps (5 ms in the dt sweeps), no
  synaptic delay or time constant, inputs normalised per neuron, and tonic drive plus noise; its parameters
  were set on visual escape and steering. Shiu et al. tuned their one free parameter on this sugar → MN9
  readout. A weak response here is a statement about this model on this connectome, not about the fly.
* "Fraction of max" uses the positive control's highest MN9 rate as the maximum. That isn't the same
  maximum Shiu et al. used (their MN9's own maximum firing).
* Sugar GRNs are identified by FlyWire morphological type and modality (LB3b/LB3c), not by receptor
  expression. Shiu's mixed composition (LB3b+c+d+LB4b) does a little better on the default brain (+0.70 at
  50 Hz, BH only) but is still small.
* Input is forced spikes at a set probability per step, not Brian2 Poisson synaptic input. The +5 V kick size
  is a choice; it only needs to exceed threshold.
* One shuffle (degree-preserving, seed 41), not 100, and not the paper's shuffle method. MN9 rests faster on it.
* The correction family is every test in this notebook. A narrower, pre-registered family (say, only the
  `sensory_input=False` sugar sweep) would be less strict. The family is fixed here so that nothing is
  picked after seeing the results.
* The bitter + sugar co-activation of the paper's Fig. 3a was not run.
* Results are bit-identical on reruns on the same machine. numba's parallel sum depends on the thread count,
  so a machine with a different number of threads gives different individual spikes. A Linux rerun of the
  first commit (2 threads) kept every conclusion except the default sugar R row at 50 Hz (p 0.087 there,
  0.031 here), which doesn't survive correction here either.

## Rerun

Hardware: Apple M4 (10 cores, 10 numba threads), 16 GB, macOS 27.2.1, CPU only. Python 3.11.14,
flybrain 0.1.1 (PyPI), numpy 2.4.6, scipy 1.17.1, numba 0.68.1, pandas 3.1.1, pyarrow 26.0.1,
matplotlib 3.11.2. Runtime: about 15–23 minutes for the whole notebook (14.7, 18.5 and 22.6 min wall time on three runs; it varies on this machine), plus about a minute for the first-time downloads.

```bash
python3.11 -m venv venv && source venv/bin/activate
pip install flybrain pandas pyarrow matplotlib nbconvert ipykernel
flybrain download          # ~260 MB into ~/fly-data (or $FLY_DATA)
jupyter nbconvert --to notebook --execute --inplace notebooks/sugar_feeding.ipynb --ExecutePreprocessor.timeout=3600
```

The command works from the repository root or from `notebooks/` (there, use `sugar_feeding.ipynb`). Outputs
always land in `notebooks/`. The notebook also downloads the MaleCNS annotation table (14.5 MB) and the
FlyWire annotations (31.7 MB) into `$FLY_DATA/annotations`, and checks both hashes. Seeds: brain noise
`reset(seed)` with seeds 0–19 (0–9 for the default-brain dt = 5 ms sweep); stimulus `default_rng([41, seed])`;
shuffle `default_rng(41)`. `SUGAR_SEEDS=2` in the environment gives a quick smoke run.

Coding agent: Claude Code (Claude Opus 5.5).
