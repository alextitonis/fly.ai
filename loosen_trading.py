"""The flies barely trade after the reset (the user 2026-09-23: "they've only bought 1 token all this time lol").

Two causes:
- The reversal sleeves can't start: $500 across 12 flies is $41.67 a sleeve, over up to 10 positions = $4.17 a slot,
  and a first step is half a slot ($2.08) - under the sleeve's $3 minimum and the $5 buy floor. Before the reset they
  lived on positions from the 4-fly era. max_positions 4 -> $10.42 a slot, a $5.21 first step: it clears both.
- The brains notice almost nothing at z_floor 1.5 (1-2 trades a book in the first bars vs 4 for the `old` control at
  0.5; fills had fallen 18/h -> 1-2/h after the 09-22 promotion). desk/README says: loosen z_floor first. 1.0 is
  halfway; `old` stays as it was, as the control.

    python loosen_trading.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
print("was: z_floor", doc.get("z_floor"), "| reversal", (doc.get("rules") or {}).get("reversal"))
doc["z_floor"] = 1.0
doc["rules"] = {**(doc.get("rules") or {}), "reversal": {**((doc.get("rules") or {}).get("reversal") or {}), "max_positions": 4}}
print("now: z_floor", doc["z_floor"], "| reversal", doc["rules"]["reversal"])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
