"""The 2026-09-28 desk changes (the user: "fix them and add the extras", "enable the plastic flag for a ghost book").

Into the main flies, from the ghosts that beat them over the day since the 09-27 reset (one day: a lead, not proof):
    - flags + "revert"            rev6 (+1.1% vs main -5.2%): the brains feel which drops tend to bounce
    - fast.roi + trail            exits (-1.0%): +25% at once, +8% after 1 h, +3.5% after 4 h; a 6% trailing stop
    - rules.reversal.fly_spread   "v2": the 12 reversal sleeves get their own look-back/hold (7 were one book)
New ghosts:
    - pre0928   main as it was before this script (the control for all three)
    - guard8    guard with an 8-bar look-back: does the sleeves' shorter look-back explain their lead over guard?
    - plastic   main + the mushroom body's plasticity (learns now that the desk keeps its memory between bars)
Paper fills everywhere now pay the measured round trip (config paper_costs "measured", a code default).

Settings only; the code half ships with flytrade/desk/deploy.sh FIRST (fly_spread v2 means nothing to old code).
    python enable_0928.py          # show the change
    python enable_0928.py --yes    # write it
"""
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
ghosts = {g["name"]: g for g in doc.get("ghosts", [])}
if "pre0928" in ghosts:
    sys.exit("already applied (a pre0928 ghost exists)")
old = copy.deepcopy({k: doc.get(k) for k in ("flags", "fast", "rules")})

doc["flags"] = sorted(set(doc["flags"]) | {"revert"})
exits = ghosts["exits"]["settings"]["fast"]
doc["fast"] = {**doc["fast"], **{k: exits[k] for k in ("roi", "trail_pct", "trail_arm_pct")}}
doc["rules"]["reversal"]["fly_spread"] = "v2"

guard8 = copy.deepcopy(ghosts["guard"]["settings"])
guard8["solo"]["lookback_bars"] = 8
new = [
    {"name": "pre0928", "settings": {"flags": old["flags"],
                                     "fast": {**doc["fast"], "roi": {}, "trail_pct": 0.0,
                                              "trail_arm_pct": old["fast"].get("trail_arm_pct", 4.0)},
                                     "rules": old["rules"]}},
    {"name": "guard8", "settings": guard8},
    {"name": "plastic", "settings": {"flags": sorted(set(doc["flags"]) | {"plastic"})}},
]
doc["ghosts"] = doc.get("ghosts", []) + new

print("flags:", old["flags"], "->", doc["flags"])
print("fast:", json.dumps(old["fast"]), "->", json.dumps(doc["fast"]))
print("rules.reversal.fly_spread: v2")
for g in new:
    print("ghost", g["name"], json.dumps(g["settings"])[:300])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
