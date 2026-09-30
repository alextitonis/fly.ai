"""Three ghost twins from the rule replay (flytrade/research/rule_replay.py, 4 weeks of 15-minute bars, 2026-09-30).

  revhold16   "revbook" with hold_bars 16 (was 4). At 0.5% a side the replay gave -20% for hold 4 and +70% for hold 16,
  revhold32   and hold 32 +36% (last third +53%): the rule's cost is turnover (5,140 trades against 1,672 and 816).
              Weak evidence (t 0.9-1.2, drawdowns -38..-54%, today's token list): hence ghosts beside "revbook".
  stockgap100 "stockgap" with pools of $100k and up: +271% against +197% at 0.3%, fewer trades, drawdown -1.3%.

Code is already live. Settings only:
    python enable_ideas_0930b.py          # show the change
    python enable_ideas_0930b.py --yes    # write it
"""
import copy
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
ghosts = doc.get("ghosts", [])
by = {g["name"]: g for g in ghosts}
if "revhold16" in by:
    sys.exit("already applied (a revhold16 ghost exists)")
new = []
for name, src, change in [("revhold16", "revbook", {"hold_bars": 16}), ("revhold32", "revbook", {"hold_bars": 32}),
                          ("stockgap100", "stockgap", {"min_pool_usd": 100_000})]:
    s = copy.deepcopy(by[src]["settings"])
    s["solo"].update(change)
    new.append({"name": name, "settings": s})
doc["ghosts"] = ghosts + new
print(f"ghosts: {len(ghosts)} -> {len(doc['ghosts'])}:", ", ".join(g["name"] for g in new))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
