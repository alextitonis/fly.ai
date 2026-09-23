"""Two new ghosts beside the main flies (the user 2026-09-23: "2. ok 3. ok, 4. ok"). Run AFTER deploying the desk
code that has rules.core.

core      core-plus-satellite: each fly's brain book ($100, the satellite) plus a core sleeve of $233.33 holding the
          20 deepest pools in equal weight, rebalanced once a day past a half-slot band (rules.core) - so ~70% of the
          ghost's money is the basket, bought with real paper fills. The basket beat every fly setup live and in
          replay; this asks whether flies on top of it beat it too.
wideband  the no-trade band the research found (turnover is what eats the edge), wider than the "band" ghost's:
          no sell within 4 bars of a buy while the move is inside 2x the token's round trip (band: 2 bars, 1x).

Both inherit everything else from the main flies (master executor, 25% stop, z_floor 1.5, 8 positions).

    python enable_core_band.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
flies = len(doc.get("flies") or []) or 12
new = [{"name": "core", "settings": {"rules": {"core": {"on": True, "allocation_usd": round(flies * 100.0 * 7 / 3, 2)}}}},
       {"name": "wideband", "settings": {"churn": {"on": True, "bars": 4, "mult": 2.0}}}]
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
