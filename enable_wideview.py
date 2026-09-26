"""Three ghosts for a wider field of view (2026-09-26, user: "make them sample more than 6 of 300 tokens per bar").

flytrade/research/view_width.py replayed the desk's last 96 bars through the flies' senses (no brain):
  - with today's target (the strongest RISER in view) a wider view picks WORSE: the top of 24 gave back -141 bp the
    next bar against the basket, the top of 6 -71 bp (24 vs 6: -70 bp/bar, CI clear of zero). Riser chasing loses.
  - with the revert flag's target (the token furthest BELOW the view's median) a wider view picks BETTER: 6 +2 bp,
    24 +54, 100 +160 (100 vs 6: +159 bp/bar, CI clear) - but only one day, it halves with moves clipped to 10%, and
    the two halves of the day disagree at 24/100. Suggestive, not settled: hence ghosts, not the main flies.
  - a raw wide view fires the target 3-10x more often (the best of many always looks big): view_calibrate 6 keeps the
    rate of 6 tokens and changes only WHICH token is seen.

  rev6        the main flies + revert, view 6         (what revert alone does: the baseline for the two below)
  revwide24   the main flies + revert, view 24, view_calibrate 6
  revwide100  the main flies + revert, view 100, view_calibrate 6   (a third of the universe; flies herd more: ~1 in 3
              on the same token, capped per book by sizing.max_token_share)

Read them against rev6 and main after a few days of bars (publish.ghost_summary). Each ghost runs every fly's brain
once more a bar: bars already take 69-137 s of 900 with the current ghosts, so drop a ghost that isn't needed.
Needs the engine with view_calibrate (market.VIEW_CALIBRATE, engine.Flags) deployed first.

    python enable_wideview.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
flags = sorted(set(doc.get("flags") or []) | {"revert"})        # a ghost's flags replace the main list: keep them
new = [{"name": "rev6", "settings": {"flags": flags}},
       {"name": "revwide24", "settings": {"flags": flags, "view": 24, "view_calibrate": 6}},
       {"name": "revwide100", "settings": {"flags": flags, "view": 100, "view_calibrate": 6}}]
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in {n["name"] for n in new}] + new
print("ghosts:", [g["name"] for g in doc["ghosts"]])
for g in new:
    print(" ", g)
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
