"""A ghost book for the Polymarket underdog rule (rules.polyedge; the user 2026-09-30: "sure do it").

The lead (flytrade/research/poly_replay.py, 1,365 markets that resolved 09-02..09-30, each asked a day before it
closed, 96% sports): Jev forecasts no better than the market's price, but 92% of its disagreements back the underdog
and those paid +20.6% a bet after fees, while the underdogs it passed on lost 5.8% and the favourites it backed lost
8.3%. Without the longshots (side price 0.20 and up): +11.2% a bet [95% +0.6, +22.4]; with every fill 2 cents worse,
+5.1% [-4.9, +15.7]. One sample, at prices a thin book may not fill: a lead, not proof - hence a ghost, on the desk's
paper fills (the live spread and Polymarket's fee).

    polydog   Polymarket shares priced 0.20 to under 0.50 that Jev puts 5 points or more above the price, in markets
              closing within 36 hours; $25 a bet, one bet a market, held to the result; $2,500, up to 60 open

Settings only; the code ships with flytrade/desk/deploy.sh FIRST (old code has no "polyedge" strategy and would raise).
    python enable_polydog.py          # show the change
    python enable_polydog.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

NEW = [{"name": "polydog", "settings": {"chain": "poly", "solo": {
    "strategy": "polyedge", "allocation_usd": 2500.0, "gap": 0.05, "min_price": 0.20, "max_price": 0.50,
    "stake_usd": 25.0, "max_positions": 60, "max_hours": 36}}}]

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
names = [g["name"] for g in doc.get("ghosts", [])]
if "polydog" in names:
    sys.exit("already applied (a polydog ghost exists)")
doc["ghosts"] = doc.get("ghosts", []) + NEW
print(f"ghosts: {len(names)} -> {len(doc['ghosts'])}:", ", ".join(g["name"] for g in doc["ghosts"]))
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
