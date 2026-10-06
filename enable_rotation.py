"""The Fly Desk's rotation (2026-10-06, the user: "it should always be trading ... no need to have cash, if it gets a
stock and it's like a bit up and finds a better option it can swap to that directly"; FLYAI "when it goes higher it
can swap and do trades, buy less then buy others").

Switches rules.rotate on in the live desk settings: every dollar not in FLYAI's base or core's stock slice is kept
invested in the best-scored stocks / tokens (8 slots), swapping a holding straight into a clearly better one
(rules.rotate, flytrade/desk/config.py "rotate"). It takes the brain's cash every bar and all parked cash; FLYAI's
sleeve sells the part over its base when FLYAI is 3%+ over its 24 h average and that cash rotates too.

Settings only; the code ships with flytrade/desk/deploy.sh FIRST (old code has no "rotate" strategy).
    python enable_rotation.py          # show the change
    python enable_rotation.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
rules = doc.setdefault("rules", {})
before = dict(rules.get("rotate") or {})
rules["rotate"] = {**before, "on": True}
print("rules.rotate:", before or "(defaults)", "->", rules["rotate"])
print("other sleeves:", {k: {"on": v.get("on"), "allocation_usd": v.get("allocation_usd")} for k, v in rules.items()
                         if k != "rotate" and isinstance(v, dict) and v.get("on")})
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
