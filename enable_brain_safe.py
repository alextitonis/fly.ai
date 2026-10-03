"""Safer, calmer brains, measured first (the user 2026-10-03: "we need to follow good tokens ... we need to be careful").

The desk's numbers on the same flies and bars: hold-the-basket +23.7%, random picks -9.8%, the flies' brains -14.3%,
the reversal rule -26..-50%; ~80% of the loss is tokens that rugged in young pools; fees from churning eat the rest.

Three ghost books against the main brains (paired: same flies, bars, seed):
    brainsafe      buys only pools 72 h+ old, $50k+ deep, round trip under 3% (entry gate on the brains)
    brainslow      the same token two bars running before a buy (patience) and no selling within 4 bars of a buy
                   while the move is inside 1.5x the round trip (churn band)
    brainsafeslow  both
and the reversal rule off in the main books (-$922 of the -$1,093 loss).

Settings only (the code is live).
    python enable_brain_safe.py          # show the change
    python enable_brain_safe.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

SAFE = {"entry": {"on": True, "min_pool_usd": 50000.0, "min_pool_age_hours": 72.0, "max_round_trip_pct": 3.0,
                  "bonding": False, "home_only": True}}
SLOW = {"patience": {"on": True, "threshold": 1.5, "decay": 0.7, "step": 0.5},
        "churn": {"on": True, "bars": 4, "mult": 1.5}}
NEW = [{"name": "brainsafe", "settings": SAFE}, {"name": "brainslow", "settings": SLOW},
       {"name": "brainsafeslow", "settings": {**SAFE, **SLOW}}]

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
names = [g["name"] for g in doc.get("ghosts", [])]
if "brainsafe" in names:
    sys.exit("already applied (a brainsafe ghost exists)")
doc["ghosts"] = doc.get("ghosts", []) + NEW
rev = doc.setdefault("rules", {}).setdefault("reversal", {})
print("reversal on main:", rev.get("on", True), "-> False")
rev["on"] = False
print(f"ghosts: {len(names)} -> {len(doc['ghosts'])}:", ", ".join(g["name"] for g in NEW))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
