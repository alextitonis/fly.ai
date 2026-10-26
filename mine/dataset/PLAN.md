# Plan: publish the connectome screen as an open dataset

Status 2026-10-26: plan only, nothing built. The export script, dataset card (README.md) and owner steps (PUBLISH.md)
already exist from 10-01. That first export never shipped, because `screen.csv` was missing.

## Where things stand

- **The blocker:** `GET /api/results` has answered `computing: true` since at least 10-01 and still does today.
  - `src/results.worker.ts` folds `screen_sums` (369 condition keys, cheap) together with every live
    finished screen job of the last ~24 h.
  - Today that is ~9M jobs a day, each with a correlated sub-query into `assignments`. The worker never
    finishes inside its 10-minute slot, and no `results worker failed` line shows in the logs.
- **The screen is saturated:** 497M jobs over the same 369 conditions is ~1.3M seeds per condition. More
  seeds change the means by less than the 0.01 Hz the API rounds to. The miners are doing nothing new.
- **What exists:**
  - `tuning_runs.csv`: 112,800 rows, per-seed, with spread.
  - `experiments.*`
  - `meta.json`, with the connectome hashes and engine constants.
  - The card, with license (CC BY 4.0 + MaleCNS attribution) and citation.

## Steps

### 1. Make `/api/results` finish (mine server, small)

**Built and DEPLOYED 2026-10-26 (~22:08 TRT).** The results worker reads `screen_sums` plus the checked jobs (via
`tasks_canary_brain`). Schema 22 adds `screen_sums.spread`, and every prune folds sums and sums of squares into it.
`/api/results` rows gain `spread_seeds`, `base_sd_hz` and `stim_sd_hz`. `screen.csv` gains `n_sd_seeds`,
`rest_sd_hz` and `driven_sd_hz`, and the card is updated. Tests pass: `test:prune` (new mean/checked/spread checks),
`test:orders`, `test:release`, and typecheck.
- After the deploy, spread exists only for jobs pruned from then on. Prunes run hourly on jobs older than 24 h, so
  wait a day or two before exporting v1, or the sd columns will be thin.

Read only `screen_sums` and drop the live-rows pass. The dataset then lags the live screen by ≤ 24 h, which
doesn't matter at 1.3M seeds.
- `checked_seeds` comes from tasks with `truth` (canaries/re-runs). Count them in the same fold, or drop the
  column from the card (`n_checked_seeds`).
- Optional, in the same schema bump: add `sumsq` to `screen_sums`, so the screen gets a per-condition spread
  (sd / 95% CI) from now on. Past seeds have no spread, so the card says spread covers seeds after the bump.
- Needs a mine deploy. Deploys go dark for 2–8 min (see mining-server memory).

### 2. Export v1 and publish (owner steps, PUBLISH.md)

- `npm run export:dataset`, then check that `meta.json` errors are empty.
- Card TODO: the Berg et al. 2026 DOI/volume/pages and the MaleCNS attribution text.
- Hugging Face: create the `flyai` org (or use your user name). A write token is your step.
  `huggingface-cli upload` + a monthly tag.
- Optional: Zenodo mirror for a DOI (free, citable), with a GitHub release of the same files.

### 3. Then make the miners useful: a sensory → descending-neuron atlas (screen v2)

This replaces the saturated 5-channel screen with the whole map. Drive each sensory cell type and record every
descending neuron.
- **Inputs:** every sensory type in the connectome:
  - cb_sensory 152, vnc_sensory 172, sensory_ascending 31, ol_sensory 5;
  - visual_projection 323.
  - About 680 types. Each is driven per side at 3 amounts.
- **Readout:** all descending neurons (463 types), from the existing `probe` kind (`record: ["descending"]`),
  plus wing MNs.
- **No new miner code:** `probe` is a live house kind that every miner page and the extension already run. Only
  a new seed spec goes in `scripts/seed-house.ts` (`atlas/sensory-dn-1`).
- **Output size:** use `bin_steps` = 250, which gives 3 bins (rest / early drive / late drive) per job, about
  8 KB.
- **Size:** ~680 × 2 sides × 3 amounts × 10 seeds ≈ 41k jobs + controls ≈ 330 MB of blobs (store cap 2,000 MB).
  That is about a day of the fleet's CPU lanes.
- **Pull it within 14 days** (blob TTL). `pull-house` is sequential, ~1 h for 41k jobs. Then add `atlas.csv`
  (type × side × amount × DN type: rest/driven Hz, mean ± sd over seeds) to the export and the card as a new
  config.
- **Why it's useful:** no public whole-CNS sensory → DN map exists for the male CNS. It's what the Flybook
  translator, the Wiz avatar and the drone read anyway. It's also a real thing to post and to cite.
- **Then shrink the free screen:**
  - stop adding rounds (`OPEN_TARGET` → small, or only a few seeds per condition per day);
  - miners pick up atlas jobs first (house priority is already above the screen);
  - this also stops ~0.5 GB/day of DB growth.

### 4. Ongoing

- Monthly re-export on the 1st, after the snapshot (PUBLISH.md).
- Atlas v2 ideas, each as its own house order: pairs of senses; with reward (PAM) on; more seeds for the
  strongest 100 links.

## Decisions for you

1. Hugging Face under a `flyai` org or your user name? Zenodo DOI too?
2. Step 1: just `screen_sums`, or also add `sumsq` (spread)?
3. Go for the atlas (step 3) after v1 ships, or in parallel?
4. When to slow the free screen. It is what miners earn points on today, so the atlas's probe units must be
   checked against the screen's rate per second first (as was done for mining jobs on 09-18), or the switch
   quietly lowers miners' pay.
