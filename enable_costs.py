"""Ghosts "realcost" and "cheap" (2026-09-25, after best_pool.py measured real round trips of 2-8.5% on memes while the
brains' reward charged a 0.3%-pool fee model):

  realcost  the brains' dopamine reward charges the round trip measured on chain (config real_costs) - the flies
            learn what a trade really cost them; nothing else changes
  cheap     no brain buys of a token whose measured round trip is over 3% (entry.max_round_trip_pct)

Everything else as the main flies. Needs the engine with executor.cost / engine.cost_model deployed first.

    python enable_costs.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
new = [{"name": "realcost", "settings": {"real_costs": True}},
       {"name": "cheap", "settings": {"entry": {"on": True, "max_round_trip_pct": 3.0}}}]
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in {n["name"] for n in new}] + new
print("ghosts:", [g["name"] for g in doc["ghosts"]])
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
