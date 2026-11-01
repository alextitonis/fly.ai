# The atlas: running it and adding it to the dataset

The sensory → descending neuron atlas is 62 probe house orders, 39,490 jobs: 676 sensory cell types, each side on its
own, at drive 0.2 / 0.4 / 0.8, over 10 seeds, plus one undriven control. Code: `scripts/atlas.ts`. Nothing starts it
except the commands below, and they are owner steps.

## Before starting

- **Deploy the server first** (`bash mine/deploy.sh`). It keeps atlas orders off the results page and out of the
  summary pass. It ships the whole working tree, so check `git status mine/` first; API dark for 2-8 min.
- **Storage:** 39,490 answers take about 480 MB on disk, and house outputs are kept for good, so that space stays used.
  On 2026-11-01 the store held 1,309 MB of its 2,000 MB cap (`blobs_mb` in `/api/stats`). Hold off above about 1,500:
  at the cap, every miner's program answer fails with a 507, as it did on 09-23.
- **Pay:** a job pays 8 points (`ATLAS_UNITS`), which matches the screen per second on one CPU thread. Only CPU lanes
  with "also run programs" on take probes. GPU lanes stay on the screen, so GPU pay doesn't change.

## Run

```sh
set -a; source mine/.env.local; set +a
cd mine
npm run seed:house -- --only atlas/ --dry-run                  # 62 orders, starts nothing
npm run seed:house -- --only atlas/sensory-dn-1/p00            # pilot: 640 jobs
```

The pilot ran on 2026-11-01: 640 of 640 settled by two agreeing miners in about 10 minutes (80 jobs a minute, with 32
out at a time), API under 0.4 s, 8 MB of outputs. Full size: about 3.8M rows, about 50 MB gzipped. Many live orders at
once haven't been tried, so go up in steps:

```sh
npm run seed:house -- --only atlas/sensory-dn-1/p0             # p00-p09; already started labels are skipped
npm run seed:house -- --only atlas/                            # all of it
```

Each order is safe to re-run: labels that exist are skipped.

## Pull

Outputs don't expire. 39,490 small files don't belong in OneDrive, so pull outside it. A pull is sequential, about 1-2 h,
and resumes if it dies:

```sh
npm run pull:house -- --label atlas/ --out C:/Users/artif/fly-data/house
npm run export:dataset -- --house C:/Users/artif/fly-data/house
```

Check first: LC4 L at 0.8 → DNp01 L should have `delta_hz` near the screen's +24.7 (+24.8 to +25.0 locally on 3 seeds).

## Add to the card, then upload (PUBLISH.md)

In `README.md`'s front matter, set `size_categories` to `1M<n<10M` and add under `configs`:

```yaml
  - config_name: atlas
    data_files: atlas.csv.gz
```

and add this under *Files*:

```markdown
### `atlas.csv.gz`: every sensory cell type → every descending neuron (long format)

Each job drives one sensory cell type on one side for 10 s after 5 s at rest, at gain 3 and tonic 0.14, and records
every descending neuron and wing motor neuron in three 5 s bins. There is one row per input × side × amount × readout
type × readout side. Jobs are settled by two independent miners returning identical bytes. Sensory types are those whose
cells are mostly `cb_sensory`, `vnc_sensory`, `sensory_ascending`, `ol_sensory` or `visual_projection`. Untyped cells
aren't driven, and midline cells of a type (no side) aren't reached.

| column | meaning |
|---|---|
| `input_class`, `input_type`, `input_side`, `input_cells` | what was driven; `none` is the undriven control |
| `amount` | voltage added per step to each driven neuron (threshold = 1) |
| `readout_set`, `readout_type`, `readout_side`, `readout_cells` | `descending` or `wing`, and the group read |
| `n_seeds` | seeds averaged (10 when complete) |
| `rest_hz`, `early_hz`, `late_hz` | spikes per neuron per second in each 5 s bin, mean over seeds |
| `delta_hz`, `delta_sd_hz` | mean of early and late minus rest, per seed: its mean and sample sd |

Each run starts from rest voltage, so the network is still settling in the rest bin: undriven control rows average
`delta_hz` +0.07 across readouts. Compare with the `none` rows of the same readout, not with zero. Ten seeds resolve
about 0.02 Hz per neuron for a single cell over 10 s, so treat small effects with care. Driving a type
with a constant voltage isn't a natural stimulus (see *Limitations*).
```
