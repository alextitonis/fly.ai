# Publishing the dataset to Hugging Face

These are owner steps. Nothing in the repository publishes automatically.

The export is built by `mine/scripts/export-dataset.ts` into `mine/dataset/out/`, which is git-ignored. The
dataset card is `mine/dataset/README.md`. On Hugging Face, the card goes in as `README.md` at the root of the
dataset repo, next to the exported files.

## Before the first upload

1. Settle the open items in the card:
   - Add the DOI, volume and pages for Berg et al. (2026).
   - Paste MaleCNS's own attribution text from https://male-cns.janelia.org/download/ where the
     `TODO(owner)` comment is, then delete the comment.
2. Install the CLI: `pip install -U "huggingface_hub[cli]"`.
3. Log in with a **write** token from https://huggingface.co/settings/tokens: `huggingface-cli login`.
4. Create the dataset repo. This is a one-time step. The `flyai` organization must exist and you must be able to
   write to it; otherwise use your user name.

   ```sh
   huggingface-cli repo create connectome-screen --type dataset --organization flyai
   ```

## Each release

Run these from the repository root (Git Bash):

```sh
# 1. export: about a minute, plus up to 15 min if /api/results is still being worked out on the server
cd mine && npm run export:dataset && cd ..
#    exit code 1 = a part failed; read "errors" in mine/dataset/out/meta.json and don't upload a partial export

# 2. put the card in place
cp mine/dataset/README.md mine/dataset/out/README.md

# 3. upload everything in out/ to the dataset repo's root, with a dated commit message
huggingface-cli upload flyai/connectome-screen mine/dataset/out . --repo-type dataset \
  --commit-message "Export $(date -u +%Y-%m-%d)"

# 4. tag the release so the month's version stays citable
huggingface-cli tag flyai/connectome-screen "$(date -u +%Y-%m)" --repo-type dataset
```

Then open https://huggingface.co/datasets/flyai/connectome-screen and check:
- the card renders;
- the dataset viewer shows the `screen`, `tuning_runs` and `experiments` configs;
- `meta.json` has an empty `errors` list.

## Monthly refresh

The screen keeps growing as the fleet adds seeds, so re-export once a month, for example on the 1st, after the
monthly snapshot:

1. Run the release steps above. The upload replaces the files and keeps the earlier versions in the repo history.
2. If the size passes a bucket, update `size_categories` in the card. The buckets are 1K–10K, 10K–100K, 100K–1M
   and so on, and `meta.json` gives the row counts.
3. If the screen grid, the engine or the connectome files change, update the card's *What was simulated* section.
   You can spot a change from `meta.json`'s `connectome.files_sha256` and `engine.constants`; diff them against
   last month's export.

Useful options:

| option | effect |
|---|---|
| `--wait 1800` | wait longer for `/api/results` |
| `--no-runs` | skip `tuning_runs.csv` |
| `--server URL` | read from another server |
| `--out DIR` | write somewhere else |

To include raw house-order results, pull them first with `npm run pull:house` (see mine/README.md). The export
then copies `mine/data/house` into `out/house/` (orders and result rows only; bulk outputs are listed in
`meta.json`).
