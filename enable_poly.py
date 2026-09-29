"""Polymarket for the flies, PAPER (2026-09-29, the user: "let's build extra polymarket on it, so flies etc can trade
there"; "the backend will run on a server not here").

Adds the ghost "poly": the main flies, forked, trading Polymarket outcome shares with their own paper money
(settings.chain = "poly": flytrade/desk/polymarket.py). Their brains feel Jev's probability against each share's price
through the forecast channel TimesFM uses (the tsfm flag, already on in main). Jev is asked "does this outcome win?"
twice per market - without and with the market's price - and every market it was asked about is followed to its
resolution: `python flytrade/desk/poly_score.py` scores Jev against the market itself.

Nothing places an order: no wallet, no key, public Gamma API reads only. Settings only; the code ships with
flytrade/desk/deploy.sh first (the "poly" chain means nothing to old code).
    python enable_poly.py          # show the change
    python enable_poly.py --yes    # write it
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
if any(g["name"] == "poly" for g in doc.get("ghosts", [])):
    sys.exit("already applied (a poly ghost exists)")
ghost = {"name": "poly", "settings": {"chain": "poly"}}
doc["ghosts"] = doc.get("ghosts", []) + [ghost]
print("ghost", json.dumps(ghost), "| main flags:", doc.get("flags"), "(tsfm carries Jev's smell)")
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
